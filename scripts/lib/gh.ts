// Thin adapter over the authenticated `gh` CLI. This is the impure I/O boundary: it shells out,
// passes responses through the pure parsers in `checks.ts`/`protection.ts`, and sends payloads
// built by `protection.ts`; repo responses go through `repo-settings.ts`. It holds no logic worth
// unit-testing — correctness is covered by the pure helpers' tests, typecheck/lint, and the
// `--dry-run` path.

import { execFileSync } from 'node:child_process';

import { z } from 'zod';

import { extractCheckNames, extractHeadSha } from './checks.ts';
import { parseJson } from './json.ts';
import { type BootstrapPayload, type CurrentProtection, parseExistingProtection } from './protection.ts';
import { parseRepoResponse, type RepoSettings } from './repo-settings.ts';

/** Raised for any `gh` failure (missing CLI, unauthenticated, unexpected HTTP error) with an actionable message. */
export class GhError extends Error {}

const repoViewSchema = z.object({ nameWithOwner: z.string() });
const securityFixesSchema = z.object({ enabled: z.boolean() });
const manifestCountSchema = z.number();
const prViewSchema = z.object({ headRefOid: z.string() });
const childProcessErrorSchema = z.object({
  code: z.string().nullable().catch(null),
  stderr: z.string().nullable().catch(null),
});

/** Creates full protection on a branch that has none (whole-object `PUT`; nothing exists to clobber). */
export function applyBootstrap(repo: string, branch: string, payload: BootstrapPayload): void {
  runGh(
    ['api', '--method', 'PUT', `repos/${repo}/branches/${branch}/protection`, '--input', '-'],
    JSON.stringify(payload),
  );
}

/** Ensures admin enforcement is on for existing protection (idempotent). */
export function applyEnforceAdmins(repo: string, branch: string): void {
  runGh(['api', '--method', 'POST', `repos/${repo}/branches/${branch}/protection/enforce_admins`]);
}

/** Updates only the required-checks slice of existing protection, leaving every other setting untouched. */
export function applyRequiredChecksPatch(repo: string, branch: string, body: unknown): void {
  runGh(
    ['api', '--method', 'PATCH', `repos/${repo}/branches/${branch}/protection/required_status_checks`, '--input', '-'],
    JSON.stringify(body),
  );
}

/** The checks observed for a reference, the human ref label given, and the head commit they ran against. */
export interface DiscoveredChecks {
  ref: string;
  sha: string | null;
  names: string[];
}

/** Discovers the checks observed on `ref` (a sha, branch, or `#PR`), deduped by name, plus the head commit they ran against. */
export function discoverChecks(repo: string, ref: string): DiscoveredChecks {
  const resolved = resolveRef(repo, ref);
  // `filter=all` is mandatory: the default `filter=latest` returns only the newest check suites, so on a
  // long-stable branch a daily scheduled job buries the push-triggered checks we actually want to require.
  const payload = parseJson(runGh(['api', `repos/${repo}/commits/${resolved}/check-runs?filter=all&per_page=100`]));
  return { ref, sha: extractHeadSha(payload), names: extractCheckNames(payload) };
}

/** Runs `gh` synchronously and returns its stdout, throwing on a non-zero exit. */
function execGh(args: string[], input?: string): string {
  // Capture stderr (stdio 'pipe') instead of letting it inherit to our terminal: handled cases like a
  // 404 "branch not protected" must stay silent, and real failures are re-surfaced via `GhError`.
  return execFileSync('gh', args, {
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

/** Resolves the target repo (`owner/name`) from the current checkout's git remote. */
export function getRepoSlug(): string {
  const view = repoViewSchema.safeParse(parseJson(runGh(['repo', 'view', '--json', 'nameWithOwner'])));
  if (!view.success) {
    throw new GhError('Could not determine the repository from the git remote (`gh repo view`).');
  }
  return view.data.nameWithOwner;
}

/** Reads the branch's current protection; a `404` (no protection) is returned as `exists: false`, not an error. */
export function getCurrentProtection(repo: string, branch: string): CurrentProtection {
  const raw = getProtectionRaw(repo, branch);
  if (raw === null) {
    return { exists: false, requiredChecks: [], strict: false, enforceAdmins: false };
  }
  return parseExistingProtection(parseJson(raw));
}

/** Reads a repo's visibility, dependency-graph, Dependabot, and secret-scanning settings. */
export function getRepoSettings(repo: string): RepoSettings {
  const { visibility, secretScanning, pushProtection } = parseRepoResponse(parseJson(runGh(['api', `repos/${repo}`])));
  const alerts = runGhOrNull(['api', `repos/${repo}/vulnerability-alerts`], 'Vulnerability alerts are disabled');
  const securityFixes = runGhOrNull(['api', `repos/${repo}/automated-security-fixes`], 'HTTP 404');
  return {
    visibility,
    dependencyGraph: isDependencyGraphEnabled(repo),
    dependabotAlerts: alerts !== null,
    securityUpdates: securityFixes !== null && parseSecurityFixesEnabled(repo, securityFixes),
    secretScanning,
    pushProtection,
  };
}

// region | Internal helpers

/** Fetches the raw protection JSON for a branch, returning `null` when it is unprotected and re-throwing other failures. */
function getProtectionRaw(repo: string, branch: string): string | null {
  const args = ['api', `repos/${repo}/branches/${branch}/protection`];
  try {
    return execGh(args);
  } catch (error) {
    // Match the specific "Branch not protected" 404, not any 404 — a missing branch/repo also 404s and
    // must not be misread as "no protection" (it would let `protect` try to bootstrap a nonexistent branch).
    if (ghStderr(error).includes('Branch not protected')) {
      return null;
    }
    throw asGhError(error, args);
  }
}

/** Returns whether the dependency graph is on, from its manifest count or, when that is zero, from the SBOM. */
function isDependencyGraphEnabled(repo: string): boolean {
  const [owner = '', name = ''] = repo.split('/', 2);
  const query =
    'query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { dependencyGraphManifests(first: 1) { totalCount } } }';
  const count = manifestCountSchema.safeParse(
    parseJson(
      runGh([
        'api',
        'graphql',
        '-f',
        `query=${query}`,
        '-F',
        `owner=${owner}`,
        '-F',
        `name=${name}`,
        '--jq',
        '.data.repository.dependencyGraphManifests.totalCount',
      ]),
    ),
  );
  if (count.success && count.data > 0) {
    return true;
  }
  // A graph that is on but finds no manifest also counts zero; the SBOM tells the two apart. Its 404 has a
  // generic message, and `getRepoSettings` has already read the repo, so the 404 means the graph is off. Generating
  // an SBOM can time out for a repo with many dependencies, which a nonzero count avoids.
  return runGhOrNull(['api', `repos/${repo}/dependency-graph/sbom`, '--jq', '.sbom.SPDXID'], 'HTTP 404') !== null;
}

/** Reads `enabled` from an `automated-security-fixes` response, throwing on an unexpected shape. */
function parseSecurityFixesEnabled(repo: string, raw: string): boolean {
  const securityFixes = securityFixesSchema.safeParse(parseJson(raw));
  if (!securityFixes.success) {
    throw new GhError(`Unexpected response from \`repos/${repo}/automated-security-fixes\`.`);
  }
  return securityFixes.data.enabled;
}

/** Resolves a `#PR` reference to its head commit; passes shas and branch names through unchanged. */
function resolveRef(repo: string, ref: string): string {
  const match = /^#(\d+)$/.exec(ref);
  const prNumber = match ? match[1] : undefined;
  if (prNumber === undefined) {
    return ref;
  }
  const view = prViewSchema.safeParse(
    parseJson(runGh(['pr', 'view', prNumber, '--repo', repo, '--json', 'headRefOid'])),
  );
  if (!view.success) {
    throw new GhError(`Could not resolve PR #${prNumber} to a commit.`);
  }
  return view.data.headRefOid;
}

/** Runs `gh` and returns its stdout, converting any failure into an actionable `GhError`. */
function runGh(args: string[], input?: string): string {
  try {
    return execGh(args, input);
  } catch (error) {
    throw asGhError(error, args);
  }
}

/** Runs `gh` and returns its stdout, or `null` when its stderr contains `notFoundMarker`; other failures throw. */
function runGhOrNull(args: string[], notFoundMarker: string): string | null {
  try {
    return execGh(args);
  } catch (error) {
    if (ghStderr(error).includes(notFoundMarker)) {
      return null;
    }
    throw asGhError(error, args);
  }
}

// endregion | Internal helpers

// region | Error-message helpers

/** Converts a child-process failure into a `GhError`, preferring `gh`'s stderr and special-casing a missing CLI. */
function asGhError(error: unknown, args: string[]): GhError {
  const failure = childProcessErrorSchema.safeParse(error);
  if (failure.success && failure.data.code === 'ENOENT') {
    return new GhError('GitHub CLI (`gh`) not found. Install it from https://cli.github.com and run `gh auth login`.');
  }
  const stderr = ghStderr(error).trim();
  const detail = stderr.length > 0 ? stderr : errorMessage(error);
  return new GhError(`\`gh ${args.join(' ')}\` failed: ${detail}`);
}

/** Returns an `Error`'s message, or a generic fallback for non-`Error` values. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

/** Returns the captured stderr string from a child-process error, or an empty string when absent. */
function ghStderr(error: unknown): string {
  const failure = childProcessErrorSchema.safeParse(error);
  return failure.success ? (failure.data.stderr ?? '') : '';
}

// endregion | Error-message helpers
