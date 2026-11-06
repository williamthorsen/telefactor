// Branch-protection CLI for `main`. Shells out to the authenticated `gh` CLI (see lib/gh.ts) and
// drives the pure helpers in lib/. Run with: node scripts/protect.ts <command> [options]
//
// Commands:
//   list      Show checks discovered for a reference commit and whether each is required.
//   check     Report the current protection on `main` and what `protect` would do. Mutates nothing.
//   protect   Require the selected checks (default: the code-quality legs) with strict + enforce_admins on `main`.
//
// See scripts/README.md for when to run this and for the merge-queue / rulesets alternatives.

import { parseArgs } from 'node:util';

import {
  DEFAULT_CHECKS,
  joinRequiredState,
  parseRequestedChecks,
  resolveChecks,
  type ResolveChecksResult,
} from './lib/checks.ts';
import {
  applyBootstrap,
  applyEnforceAdmins,
  applyRequiredChecksPatch,
  discoverChecks,
  type DiscoveredChecks,
  getCurrentProtection,
  getRepoSlug,
} from './lib/gh.ts';
import { buildBootstrapPayload, buildRequiredChecksPatch, decideApply } from './lib/protection.ts';

const BRANCH = 'main';

/** Dispatches the chosen subcommand, prints help for none/`help`/`-h`, and turns a thrown error into a failing exit. */
function main(): void {
  const [command, ...rest] = process.argv.slice(2);
  try {
    switch (command) {
      case 'list':
        runList(rest);
        break;
      case 'check':
        runCheck(rest);
        break;
      case 'protect':
        runProtect(rest);
        break;
      case undefined:
      case 'help':
      case '--help':
      case '-h':
        process.stdout.write(usage());
        break;
      default:
        process.stderr.write(`protect: unknown command "${command}"\n\n`);
        process.stderr.write(usage());
        process.exitCode = 2;
    }
  } catch (error) {
    fail(error);
  }
}

// region | Subcommands

/** Reports the current protection on `main` and what `protect` would do next, without mutating anything. */
function runCheck(args: string[]): void {
  const { values } = parseArgs({ args, options: { help: { type: 'boolean', short: 'h' } } });
  if (values.help === true) {
    process.stdout.write(usage());
    return;
  }
  const repo = getRepoSlug();
  const current = getCurrentProtection(repo, BRANCH);

  process.stdout.write(`Repository: ${repo}\n`);
  process.stdout.write(`Branch:     ${BRANCH}\n`);
  if (!current.exists) {
    process.stdout.write('Protection: none\n');
    process.stdout.write('`protect` would: bootstrap full protection (PUT).\n');
    return;
  }
  process.stdout.write('Protection: present\n');
  process.stdout.write(`  Up to date required (strict): ${yesNo(current.strict)}\n`);
  process.stdout.write(`  Enforced for admins:          ${yesNo(current.enforceAdmins)}\n`);
  process.stdout.write(`  Required checks:               ${list(current.requiredChecks)}\n`);
  process.stdout.write('`protect` would: update the required-checks slice only (PATCH), preserving other settings.\n');
}

/** Prints every check discovered for the reference commit alongside whether it is currently required. */
function runList(args: string[]): void {
  const { values } = parseArgs({ args, options: { ref: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help === true) {
    process.stdout.write(usage());
    return;
  }
  const repo = getRepoSlug();
  const ref = typeof values.ref === 'string' ? values.ref : BRANCH;
  const discovered = discoverChecks(repo, ref);
  const current = getCurrentProtection(repo, BRANCH);
  const rows = joinRequiredState(discovered.names, current.requiredChecks);

  const reference = discovered.sha ? `${discovered.ref} (${discovered.sha.slice(0, 7)})` : discovered.ref;
  process.stdout.write(`Repository: ${repo}\n`);
  process.stdout.write(`Reference:  ${reference} — checks observed here, not necessarily exhaustive\n`);
  process.stdout.write(`Protected:  ${current.exists ? 'yes' : 'no'}\n\n`);
  if (rows.length === 0) {
    process.stdout.write('No checks discovered.\n');
    return;
  }
  for (const row of rows) {
    process.stdout.write(`  ${(row.required ? 'required' : '-').padEnd(9)}${row.name}\n`);
  }
}

/** Applies the protection gate (or previews it with `--dry-run`): resolves the requested checks, then bootstraps or surgically patches protection with strict + admin enforcement. */
function runProtect(args: string[]): void {
  const { values } = parseArgs({
    args,
    options: {
      checks: { type: 'string' },
      ref: { type: 'string' },
      'dry-run': { type: 'boolean' },
      'allow-unknown': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help === true) {
    process.stdout.write(usage());
    return;
  }

  const dryRun = values['dry-run'] === true;
  const repo = getRepoSlug();
  const ref = typeof values.ref === 'string' ? values.ref : BRANCH;
  const requested = parseRequestedChecks(values.checks, DEFAULT_CHECKS);
  const selected = values['allow-unknown'] === true ? requested : resolveSelection(repo, ref, requested);

  const current = getCurrentProtection(repo, BRANCH);
  const strategy = decideApply(current);
  if (strategy === 'bootstrap') {
    const payload = buildBootstrapPayload(selected);
    if (dryRun) {
      printDryRun('PUT', `repos/${repo}/branches/${BRANCH}/protection`, payload);
      return;
    }
    applyBootstrap(repo, BRANCH, payload);
  } else {
    printRequiredChange(current.requiredChecks, selected);
    const patch = buildRequiredChecksPatch(selected);
    if (dryRun) {
      printDryRun('PATCH', `repos/${repo}/branches/${BRANCH}/protection/required_status_checks`, patch);
      printDryRun('POST', `repos/${repo}/branches/${BRANCH}/protection/enforce_admins`);
      return;
    }
    applyRequiredChecksPatch(repo, BRANCH, patch);
    applyEnforceAdmins(repo, BRANCH);
  }

  process.stdout.write(
    `Protected ${repo}@${BRANCH}: required ${list(selected)} with strict + enforce_admins (${strategy}).\n`,
  );
}

// endregion | Subcommands

// region | Helpers

/** Builds the user-facing error for an unresolved `--checks` token, listing the candidate or available contexts. */
function describeResolveFailure(
  resolution: Extract<ResolveChecksResult, { ok: false }>,
  discovered: DiscoveredChecks,
): string {
  if (resolution.reason === 'ambiguous') {
    return `check "${resolution.token}" is ambiguous (matches: ${list(resolution.candidates)}). Use a more specific value or the full context.`;
  }
  return `check "${resolution.token}" was not found among checks on ${discovered.ref} (available: ${list(resolution.candidates)}). Use --ref to point at a commit where it ran, or --allow-unknown to require it anyway.`;
}

/** Writes an error to stderr with the `protect:` prefix and sets a failing exit code. */
function fail(error: unknown): void {
  const message = error instanceof Error ? error.message : 'unknown error';
  process.stderr.write(`protect: ${message}\n`);
  process.exitCode = 1;
}

/** Joins values with commas, or returns `(none)` when the list is empty. */
function list(values: string[]): string {
  return values.length > 0 ? values.join(', ') : '(none)';
}

/** Prints an intended API call (and its JSON body, if any) without performing it. */
function printDryRun(method: string, endpoint: string, body?: unknown): void {
  process.stdout.write(`[dry run] ${method} ${endpoint}\n`);
  if (body !== undefined) {
    process.stdout.write(`${JSON.stringify(body, null, 2)}\n`);
  }
}

/** Prints the surgical path's before→after required set and warns when a re-run would drop a previously-required check. */
function printRequiredChange(before: string[], after: string[]): void {
  process.stdout.write(`Required checks: ${list(before)} -> ${list(after)}\n`);
  const dropped = before.filter((check) => !after.includes(check));
  if (dropped.length > 0) {
    process.stderr.write(
      `protect: warning — re-running drops ${list(dropped)} from the required set; --checks defines the complete set.\n`,
    );
  }
}

/** Resolves the requested check shorthands against the checks discovered on `ref`, throwing when one cannot be matched. */
function resolveSelection(repo: string, ref: string, requested: string[]): string[] {
  const discovered = discoverChecks(repo, ref);
  const resolution = resolveChecks(requested, discovered.names);
  if (!resolution.ok) {
    throw new Error(describeResolveFailure(resolution, discovered));
  }
  return resolution.matched;
}

/** Returns the CLI help text covering the commands, options, and usage notes. */
function usage(): string {
  return `Branch-protection CLI for "${BRANCH}".

Usage:
  node scripts/protect.ts <command> [options]

Commands:
  list      Show checks discovered for a reference commit and whether each is required.
  check     Report the current protection on "${BRANCH}" and what "protect" would do. Mutates nothing.
  protect   Require the selected checks with strict + enforce_admins on "${BRANCH}".

Options:
  --checks <a,b>     Checks to require (protect). Shorthands resolve against the repo's real
                     check names. Default, the code-quality legs:
${DEFAULT_CHECKS.map((check) => `                       ${check}`).join('\n')}
  --ref <sha|#PR>    Reference for check discovery (list, protect). Default: "${BRANCH}".
  --dry-run          Print the intended API calls and payloads without applying them (protect).
  --allow-unknown    Require checks without validating them against observed names (protect).
  -h, --help         Show this help.

Notes:
  - "protect" bootstraps full protection when none exists, otherwise patches only the
    required-checks slice and re-asserts enforce_admins, leaving other settings untouched.
  - --checks defines the COMPLETE required set (it replaces rather than adds); re-running with
    the default requires only the code-quality legs and drops any others.
  - Discovery reads check-runs with filter=all; a pull_request-only check absent from <ref>
    needs --ref. See scripts/README.md for merge-queue and rulesets alternatives.
`;
}

/** Returns `yes` or `no` for a boolean. */
function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
}

// endregion | Helpers

main();
