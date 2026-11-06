// Fleet drift sweep: run this repo's drift kit and williamthorsen/.github's code-quality kit against
// every repo whose stack in the machine's repo registry contains `nmr` and print a per-repo drift
// table. Mutates nothing; drift never fails the run: the sweep is a report, not a gate. Only an
// unreadable or invalid manifest exits nonzero. Run with:
// node scripts/drift-sweep.ts [--json] [--manifest <path>]
//
// Each repo is checked by spawning this repo's own rdy binary once per kit with the target repo as
// the working directory, so target repos need nothing installed. The .github kit is fetched from
// GitHub on every run. Repos with no configured path, a missing path, or an entry in the
// manifest's ignore list are reported and skipped.

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  combineKitRuns,
  type FleetManifest,
  type FleetRepo,
  formatSweepTable,
  type KitRun,
  parseFleetManifest,
  type RepoSummary,
} from './lib/drift-sweep.ts';

const TEMPLATE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RDY_BIN = join(TEMPLATE_ROOT, 'node_modules', '.bin', 'rdy');
const THOR_REPO_BIN = join(TEMPLATE_ROOT, 'node_modules', '.bin', 'thor-repo');
// The registry stack name that marks a repo built on this template's tooling, and so a member of the fleet.
const FLEET_STACK = 'nmr';
const REGISTRY_PATH = '~/.config/repos.yaml';
// The kits run against each repo, each labelled for the error detail that names a kit that failed to run.
const KIT_SOURCES = [
  { kit: 'template', source: TEMPLATE_ROOT },
  { kit: 'williamthorsen/.github', source: 'github:williamthorsen/.github' },
];

/** Read the manifest, sweep every candidate repo, and print the aggregate report. */
function main(): void {
  const { values } = parseArgs({
    options: {
      json: { type: 'boolean', default: false },
      manifest: { type: 'string' },
    },
  });

  let manifest: FleetManifest;
  try {
    manifest =
      values.manifest === undefined
        ? readRegistryManifest()
        : parseFleetManifest(readFileSync(values.manifest, 'utf8'));
  } catch (error) {
    process.stderr.write(`drift-sweep: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
    return;
  }
  const summaries = manifest.repos.map((repo) => sweepRepo(repo, manifest.ignore));

  if (values.json) {
    console.log(JSON.stringify(summaries, null, 2));
  } else {
    console.log(formatSweepTable(summaries));
    const unchecked = summaries.filter((summary) => summary.status !== 'checked').length;
    if (unchecked > 0) {
      console.log(
        `\n${String(unchecked)} of ${String(summaries.length)} repos not checked; configure paths in ${values.manifest ?? REGISTRY_PATH}`,
      );
    }
  }
}

/** Read the machine's repo registry, through `thor-repo list`, as a fleet manifest. */
function readRegistryManifest(): FleetManifest {
  const result = spawnSync(THOR_REPO_BIN, ['list', '--stack', FLEET_STACK, '--json'], { encoding: 'utf8' });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `could not read ${REGISTRY_PATH} through thor-repo list (${describeSpawnFailure(result)}); pass --manifest <path> to sweep from a file instead`,
    );
  }
  return parseFleetManifest(result.stdout);
}

/** Run every kit against one repo, or report why it was skipped. */
function sweepRepo(repo: FleetRepo, ignore: string[]): RepoSummary {
  const base = { errors: 0, failingChecks: [], name: repo.name, warnings: 0 };
  if (ignore.includes(repo.name)) return { ...base, status: 'ignored' };
  if (repo.path === null) return { ...base, status: 'no-path' };

  const repoPath = expandHome(repo.path);
  if (!existsSync(repoPath)) return { ...base, detail: repoPath, status: 'missing' };

  return { ...base, ...combineKitRuns(KIT_SOURCES.map(({ kit, source }) => runKit(kit, source, repoPath))) };
}

/** Describe why a spawned command failed: its spawn error, or the last line it wrote to stderr. */
function describeSpawnFailure(result: SpawnSyncReturns<string>): string {
  if (result.error !== undefined) return result.error.message;
  const lastLine = result.stderr.trim().split('\n').at(-1);
  return lastLine === undefined || lastLine === '' ? 'no output' : lastLine;
}

/** Expand a leading `~` to the user's home directory. */
function expandHome(path: string): string {
  return path === '~' || path.startsWith('~/') ? join(homedir(), path.slice(1)) : path;
}

/** Run one kit against a repo, capturing its JSON report or why it produced none. */
function runKit(kit: string, source: string, repoPath: string): KitRun {
  const result = spawnSync(RDY_BIN, ['run', '--from', source, '--json'], { cwd: repoPath, encoding: 'utf8' });
  if (result.error !== undefined || result.stdout === '') return { failure: describeSpawnFailure(result), kit };
  return { kit, stdout: result.stdout };
}

main();
