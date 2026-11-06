// Pure helpers for discovering CI checks and reconciling them with branch-protection state.
// These have no I/O so they can be unit-tested directly; the `gh` calls live in `gh.ts`.

import { z } from 'zod';

/** Contexts reported by the `code-quality` workflow's legs; a test pins them to `.github/workflows/code-quality.yaml`. */
export const DEFAULT_CHECKS = [
  'code-quality / build',
  'code-quality / lint',
  'code-quality / shell',
  'code-quality / static',
  'code-quality / test',
  'code-quality / workflows',
];

export interface DiscoveredRun {
  name: string;
}

export interface RequiredCheckState {
  name: string;
  required: boolean;
}

export type ResolveChecksResult =
  { ok: true; matched: string[] } | { ok: false; reason: 'unknown' | 'ambiguous'; token: string; candidates: string[] };

// Elements stay `unknown` so each entry is validated on its own: a malformed run is skipped and its
// siblings survive.
const checkRunsSchema = z.object({ check_runs: z.array(z.unknown()) });
const namedRunSchema = z.object({ name: z.string() });
const headShaRunSchema = z.object({ head_sha: z.string() });

/** Collapses raw check-runs (which `filter=all` returns with repeats) to one sorted entry per name. */
export function discoverCheckNames(runs: DiscoveredRun[]): string[] {
  return sortedUnique(runs.map((run) => run.name));
}

/** Extracts deduped, sorted check names from a `commits/{ref}/check-runs` response, skipping malformed entries. */
export function extractCheckNames(payload: unknown): string[] {
  const response = checkRunsSchema.safeParse(payload);
  if (!response.success) {
    return [];
  }
  const runs = response.data.check_runs.flatMap((run) => {
    const named = namedRunSchema.safeParse(run);
    return named.success ? { name: named.data.name } : [];
  });
  return discoverCheckNames(runs);
}

/** Returns the head commit sha the check-runs ran against, or null when the response carries none. */
export function extractHeadSha(payload: unknown): string | null {
  const response = checkRunsSchema.safeParse(payload);
  if (!response.success) {
    return null;
  }
  for (const run of response.data.check_runs) {
    const withHeadSha = headShaRunSchema.safeParse(run);
    if (withHeadSha.success) {
      return withHeadSha.data.head_sha;
    }
  }
  return null;
}

/** Pairs every check (discovered or already required) with whether it is currently required, sorted by name. */
export function joinRequiredState(discovered: string[], required: string[]): RequiredCheckState[] {
  const requiredSet = new Set(required);
  const names = sortedUnique([...discovered, ...required]);
  return names.map((name) => ({ name, required: requiredSet.has(name) }));
}

/** Splits the `--checks` value into trimmed, non-empty tokens, or returns the default checks when no value is given. */
export function parseRequestedChecks(value: string | undefined, defaultChecks: string[]): string[] {
  if (typeof value !== 'string') {
    return [...defaultChecks];
  }
  return value
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

/**
 * Resolves each requested shorthand to exactly one of the available check contexts, so a typo can't
 * silently require a context that never reports (which would permanently block merges). An exact,
 * case-insensitive match wins over substring matches; otherwise a unique substring match is used.
 * Returns the first unresolvable token rather than a partial set.
 */
export function resolveChecks(requested: string[], available: string[]): ResolveChecksResult {
  const matched: string[] = [];

  for (const token of requested) {
    const lowerToken = token.toLowerCase();
    const exact = available.filter((name) => name.toLowerCase() === lowerToken);
    const pool = exact.length > 0 ? exact : available.filter((name) => name.toLowerCase().includes(lowerToken));

    if (pool.length === 0) {
      return { ok: false, reason: 'unknown', token, candidates: available };
    }
    if (pool.length > 1) {
      return { ok: false, reason: 'ambiguous', token, candidates: pool };
    }
    for (const name of pool) {
      matched.push(name);
    }
  }

  return { ok: true, matched: [...new Set(matched)] };
}

// region | Helpers

/** Dedupes and returns a new array sorted in lexicographic order. */
function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].toSorted((a, b) => a.localeCompare(b));
}

// endregion | Helpers
