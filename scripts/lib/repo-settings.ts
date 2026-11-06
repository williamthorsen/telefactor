// Pure helpers for the repo-settings report: registry parsing, repo-response parsing, and table
// formatting. `gh.ts` fetches the settings; scripts/repo-settings.ts reads the registry and prints.

import { z } from 'zod';

import { parseJson } from './json.ts';

/** The security-related settings of one repo, as GitHub reports them. */
export interface RepoSettings {
  visibility: string;
  dependencyGraph: boolean;
  dependabotAlerts: boolean;
  securityUpdates: boolean;
  // These two are `undefined` when the API does not report them, as for a private repo on a personal account.
  secretScanning: boolean | undefined;
  pushProtection: boolean | undefined;
}

export interface RegistryEntry {
  name: string;
  repo?: string | undefined;
}

/** A repo's settings as read, or the reason they could not be read. */
export type RepoReport = { repo: string; settings: RepoSettings } | { repo: string; error: string };

const registrySchema = z.object({ repos: z.array(z.object({ name: z.string(), repo: z.string().optional() })) });
const statusSchema = z.object({ status: z.string() });
const repoResponseSchema = z.object({
  visibility: z.string(),
  security_and_analysis: z
    .object({
      secret_scanning: statusSchema.optional(),
      secret_scanning_push_protection: statusSchema.optional(),
    })
    .nullable()
    .optional(),
});

/** Formats one aligned row per repo, or the error for a repo that could not be read. */
export function formatReport(reports: RepoReport[]): string {
  const header = [
    'Repository',
    'Visibility',
    'Dependency graph',
    'Dependabot alerts',
    'Security updates',
    'Secret scanning',
    'Push protection',
  ];
  const rows = reports.map((report) =>
    'settings' in report ? describeSettings(report.repo, report.settings) : [report.repo, `error: ${report.error}`],
  );
  // An error row spans the setting columns, so it widens only the repository column.
  const fullRows = [header, ...rows.filter((row) => row.length === header.length)];
  const widths = header.map((_, column) =>
    Math.max(...(column === 0 ? [header, ...rows] : fullRows).map((row) => (row[column] ?? '').length)),
  );
  return [header, ...rows]
    .map((row) =>
      row
        .map((cell, column) => cell.padEnd(widths[column] ?? 0))
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}

/** Returns the registry's entries, each with its name and, when declared, its GitHub slug. */
export function parseRegistryEntries(content: string): RegistryEntry[] {
  const registry = registrySchema.safeParse(parseJson(content));
  if (!registry.success) {
    throw new Error('The registry must be an object with a "repos" array of entries that each have a "name"');
  }
  return registry.data.repos;
}

/** Extracts the visibility and secret-scanning statuses from a `repos/{owner}/{repo}` response. */
export function parseRepoResponse(
  payload: unknown,
): Pick<RepoSettings, 'pushProtection' | 'secretScanning' | 'visibility'> {
  const response = repoResponseSchema.safeParse(payload);
  if (!response.success) {
    throw new Error('Unexpected repository response: it does not contain a "visibility"');
  }
  const securityAndAnalysis = response.data.security_and_analysis;
  return {
    visibility: response.data.visibility,
    secretScanning: isEnabled(securityAndAnalysis?.secret_scanning?.status),
    pushProtection: isEnabled(securityAndAnalysis?.secret_scanning_push_protection?.status),
  };
}

// region | Helpers

/** Returns a repo's table cells: its slug, visibility, and each setting as `on`, `off`, or `n/a`. */
function describeSettings(repo: string, settings: RepoSettings): string[] {
  return [
    repo,
    settings.visibility,
    onOff(settings.dependencyGraph),
    onOff(settings.dependabotAlerts),
    onOff(settings.securityUpdates),
    settings.secretScanning === undefined ? 'n/a' : onOff(settings.secretScanning),
    settings.pushProtection === undefined ? 'n/a' : onOff(settings.pushProtection),
  ];
}

/** Returns whether a reported status is `enabled`, or `undefined` when the status is not reported. */
function isEnabled(status: string | undefined): boolean | undefined {
  return status === undefined ? undefined : status === 'enabled';
}

/** Returns `on` or `off` for a boolean. */
function onOff(value: boolean): string {
  return value ? 'on' : 'off';
}

// endregion | Helpers
