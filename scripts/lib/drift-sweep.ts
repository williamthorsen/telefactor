// Pure helpers for the fleet drift sweep: manifest parsing, rdy report summarization, and table
// formatting. The CLI in scripts/drift-sweep.ts reads the registry or a manifest file and spawns
// the per-repo checks.

import { z } from 'zod';

import { parseJson } from './json.ts';

/** One candidate repo in the fleet manifest. A null path means no local clone is configured. */
export interface FleetRepo {
  name: string;
  path: string | null;
}

/** The fleet manifest: candidate repos plus names to skip. */
export interface FleetManifest {
  ignore: string[];
  repos: FleetRepo[];
}

/** Per-repo sweep outcome. `failingChecks` is populated only for status 'checked'. */
export interface RepoSummary {
  detail?: string;
  errors: number;
  failingChecks: string[];
  name: string;
  status: 'checked' | 'error' | 'ignored' | 'missing' | 'no-path';
  warnings: number;
}

/** One kit's run against a repo: its `rdy run --json` stdout, or why the run produced none. */
export type KitRun = { failure: string; kit: string } | { kit: string; stdout: string };

// The manifest comes from a first-party source, so `repos` is required and a malformed entry is
// fatal. `ignore` is advisory: a non-string entry is dropped and the rest of the list stands.
const fleetManifestSchema = z.object({
  ignore: z
    .array(z.unknown())
    .catch([])
    .transform((values) => values.filter((value) => typeof value === 'string')),
  repos: z.array(z.unknown()),
});
const fleetRepoSchema = z.object({ name: z.string(), path: z.string().nullable().catch(null) });

// `rdy` output is external, so every field defaults and nested collections stay `unknown` for
// per-entry validation.
const rdyReportSchema = z.object({
  counts: z.object({ errors: z.number().catch(0), warnings: z.number().catch(0) }).catch({ errors: 0, warnings: 0 }),
  kits: z.array(z.unknown()).catch([]),
});
const rdyKitSchema = z.object({
  checklists: z.array(z.unknown()).catch([]),
  error: z.object({ message: z.string() }).optional().catch(undefined),
});
const rdyChecklistSchema = z.object({ checks: z.array(z.unknown()).catch([]) });
const rdyCheckSchema = z.object({
  checks: z.array(z.unknown()).catch([]),
  name: z.string().nullable().catch(null),
  status: z.string().nullable().catch(null),
});

/**
 * Combine one repo's kit runs into its row: an error naming the first kit that failed to run or to
 * load, otherwise the summed results.
 */
export function combineKitRuns(runs: KitRun[]): Omit<RepoSummary, 'name'> {
  const failingChecks: string[] = [];
  let errors = 0;
  let warnings = 0;
  for (const run of runs) {
    const failure = 'failure' in run ? run.failure : readKitLoadError(run.stdout);
    if (failure !== undefined) {
      return { detail: `${run.kit}: ${failure}`, errors: 0, failingChecks: [], status: 'error', warnings: 0 };
    }
    if (!('stdout' in run)) continue;
    const summary = summarizeRdyReport(run.stdout);
    errors += summary.errors;
    failingChecks.push(...summary.failingChecks);
    warnings += summary.warnings;
  }
  return { errors, failingChecks, status: 'checked', warnings };
}

/** Parse and validate the fleet manifest. Throws a descriptive error on malformed content. */
export function parseFleetManifest(content: string): FleetManifest {
  let parsed: unknown;
  try {
    parsed = parseJson(content);
  } catch (error) {
    throw new Error(`Fleet manifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
  const manifest = fleetManifestSchema.safeParse(parsed);
  if (!manifest.success) {
    throw new Error('Fleet manifest must be an object with a "repos" array');
  }
  const repos = manifest.data.repos.map((entry: unknown, index: number): FleetRepo => {
    const repo = fleetRepoSchema.safeParse(entry);
    if (!repo.success) {
      throw new Error(`Fleet manifest repos[${String(index)}] must have a string "name"`);
    }
    return { name: repo.data.name, path: repo.data.path };
  });
  return { ignore: manifest.data.ignore, repos };
}

/** Summarize a `rdy run --json` report: failure counts and the names of failed checks, nested checks included. */
export function summarizeRdyReport(reportJson: string): Pick<RepoSummary, 'errors' | 'failingChecks' | 'warnings'> {
  let parsed: unknown;
  try {
    parsed = parseJson(reportJson);
  } catch {
    return { errors: 0, failingChecks: ['(unparseable rdy output)'], warnings: 0 };
  }
  // The run-level tallies sit under `counts`; the report's own `warnings` key holds warnings about the
  // run, such as a kit compiled against an older runner.
  const report = rdyReportSchema.safeParse(parsed);
  if (!report.success) return { errors: 0, failingChecks: ['(unparseable rdy output)'], warnings: 0 };
  return {
    errors: report.data.counts.errors,
    failingChecks: collectFailedCheckNames(report.data.kits),
    warnings: report.data.counts.warnings,
  };
}

/** Render repo summaries as an aligned text table with one row per repo. */
export function formatSweepTable(summaries: RepoSummary[]): string {
  const nameWidth = Math.max(4, ...summaries.map((summary) => summary.name.length));
  const header = `${'Repo'.padEnd(nameWidth)}  Errors  Warnings  Result`;
  const rows = summaries.map((summary) => {
    const name = summary.name.padEnd(nameWidth);
    if (summary.status !== 'checked') {
      return `${name}  ${'-'.padEnd(6)}  ${'-'.padEnd(8)}  ${describeSkip(summary)}`;
    }
    const errors = String(summary.errors).padEnd(6);
    const warnings = String(summary.warnings).padEnd(8);
    const result = summary.failingChecks.length === 0 ? 'aligned' : summary.failingChecks.join(', ');
    return `${name}  ${errors}  ${warnings}  ${result}`;
  });
  return [header, ...rows].join('\n');
}

// region | Helpers

/** Human-readable reason a repo was not checked. */
function describeSkip(summary: RepoSummary): string {
  switch (summary.status) {
    case 'error':
      return `rdy failed: ${summary.detail ?? 'unknown error'}`;
    case 'ignored':
      return 'ignored (fleet manifest)';
    case 'missing':
      return `path not found: ${summary.detail ?? ''}`;
    default:
      return 'no local path configured';
  }
}

/** Walk kits -> checklists -> checks (and nested checks), collecting the names of failed checks. */
function collectFailedCheckNames(kits: unknown[]): string[] {
  const names: string[] = [];
  for (const rawKit of kits) {
    const kit = rdyKitSchema.safeParse(rawKit);
    if (!kit.success) continue;
    for (const rawChecklist of kit.data.checklists) {
      const checklist = rdyChecklistSchema.safeParse(rawChecklist);
      if (!checklist.success) continue;
      collectFromChecks(checklist.data.checks, names);
    }
  }
  return names;
}

/** Append the names of failed checks in `checks` (recursing into nested checks) to `names`. */
function collectFromChecks(checks: unknown[], names: string[]): void {
  for (const rawCheck of checks) {
    const check = rdyCheckSchema.safeParse(rawCheck);
    if (!check.success) continue;
    if (check.data.status === 'failed' && check.data.name !== null) names.push(check.data.name);
    collectFromChecks(check.data.checks, names);
  }
}

/**
 * The message of the first kit that `rdy` could not load, such as a remote kit it failed to fetch. A
 * report holding one still prints, with zero counts, so the counts alone would read as aligned.
 */
function readKitLoadError(reportJson: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = parseJson(reportJson);
  } catch {
    return undefined;
  }
  const report = rdyReportSchema.safeParse(parsed);
  if (!report.success) return undefined;
  for (const rawKit of report.data.kits) {
    const kit = rdyKitSchema.safeParse(rawKit);
    if (kit.success && kit.data.error !== undefined) return kit.data.error.message;
  }
  return undefined;
}

// endregion | Helpers
