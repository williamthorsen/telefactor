// Repo-settings report: for every repo in the machine's registry (~/.config/repos.yaml), or for the
// repos named with --repo, print its visibility and whether the dependency graph, Dependabot alerts,
// Dependabot security updates, secret scanning, and push protection are on. Mutates nothing. Run
// with: node scripts/repo-settings.ts [--repo <owner/name>]...

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { getRepoSettings } from './lib/gh.ts';
import { formatReport, parseRegistryEntries, type RegistryEntry, type RepoReport } from './lib/repo-settings.ts';

const THOR_REPO_BIN = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'node_modules', '.bin', 'thor-repo');

/** Reads each target repo's settings, prints the table, and fails when the registry or any repo could not be read. */
function main(): void {
  try {
    const { values } = parseArgs({
      options: { help: { type: 'boolean', short: 'h' }, repo: { type: 'string', multiple: true } },
    });
    if (values.help === true) {
      process.stdout.write(usage());
      return;
    }
    const entries = values.repo === undefined ? readRegistry() : values.repo.map((repo) => ({ name: repo, repo }));
    const reports = entries.map((entry) => readRepo(entry));
    process.stdout.write(`${formatReport(reports)}\n`);
    if (reports.some((report) => !('settings' in report))) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`repo-settings: ${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}

// region | Helpers

/** Returns an `Error`'s message, or a generic fallback for non-`Error` values. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

/** Reads the registry's entries through `thor-repo list`. */
function readRegistry(): RegistryEntry[] {
  const result = spawnSync(THOR_REPO_BIN, ['list', '--json', '--clone', 'all'], { encoding: 'utf8' });
  if (result.error !== undefined || result.status !== 0) {
    const detail = result.error?.message ?? (result.stderr.trim() || 'no output');
    throw new Error(`could not read ~/.config/repos.yaml through thor-repo list (${detail})`);
  }
  return parseRegistryEntries(result.stdout);
}

/** Reads one repo's settings, turning a failure into an error report so that the run continues. */
function readRepo(entry: RegistryEntry): RepoReport {
  if (entry.repo === undefined) {
    return { repo: entry.name, error: 'the registry entry does not declare a "repo"' };
  }
  try {
    return { repo: entry.repo, settings: getRepoSettings(entry.repo) };
  } catch (error) {
    return { repo: entry.repo, error: errorMessage(error) };
  }
}

/** Returns the CLI help text. */
function usage(): string {
  return `Repo-settings report.

Usage:
  node scripts/repo-settings.ts [--repo <owner/name>]...

For every repo in ~/.config/repos.yaml, or for each repo named with --repo, prints its
visibility and whether the dependency graph, Dependabot alerts, Dependabot security updates,
secret scanning, and push protection are on. Mutates nothing.

Options:
  --repo <owner/name>   Report this repo in place of the registry. Repeat to report several.
  -h, --help            Show this help.

Notes:
  - Secret scanning and push protection read "n/a" when the API does not report them, as
    for a private repo on a personal account.
  - Exits non-zero when the registry or any repo cannot be read; the other repos are
    still reported.
`;
}

// endregion | Helpers

main();
