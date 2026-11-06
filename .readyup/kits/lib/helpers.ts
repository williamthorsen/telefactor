/**
 * Predicates and constants of the drift kit in `../default.ts`, kept out of the compile sweep by
 * `.config/readyup.config.ts`.
 */
import { existsSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';

import type { CheckOutcome } from 'readyup';
import { hasDevDependency, hasMinDevDependencyVersion, missingFrom, readFile } from 'readyup/check-utils';

export const NMR_PACKAGE = '@williamthorsen/nmr';

// The readyup version that first reads the config's `sources` list. Below it the config declares a
// `packages` list, which the completeness check does not read.
export const READYUP_PACKAGE = 'readyup';
export const READYUP_SOURCES_MIN_VERSION = '0.40.0';

// Path to the code-quality workflow caller, whose pin gates the version-alignment guard check.
const CODE_QUALITY_WORKFLOW = '.github/workflows/code-quality.yaml';

// The directory holding a repo's root-level tests.
const TEST_DIR = '__tests__';

const PNPM_WORKSPACE_FILE = 'pnpm-workspace.yaml';

// The subject of the Node version-alignment guard, which @v7 supersedes by reading .tool-versions
// directly. A test file is identified by its subject rather than its full name because the isolation-tier
// tail a repo gives it varies.
const VERSION_ALIGNMENT_SUBJECT = 'version-alignment';

// Subjects of root tests the template no longer ships.
const SUPERSEDED_TEST_SUBJECTS = ['consistency', 'nodejs-version', 'pnpm-version'];

// The nmr version that first ships the `nmr-fmt` bin, which `nmr fmt` resolves to. Its own constant
// rather than the kit's NMR_KIT_MIN_VERSION: the two facts are independent, and moving one must not
// silently move the other.
const NMR_FMT_MIN_VERSION = '0.21.0';

// Any declared version clears this floor, so `hasMinDevDependencyVersion` reads as a presence test
// through the same parser the real floor checks use.
const ANY_VERSION = '0.0.0';

/**
 * The reusable code-quality workflow major the caller pins, or undefined when it pins nothing
 * recognizable: an absent `uses:` line, or a commit SHA. Undefined reads as "not yet at any major",
 * so an unrecognized pin skips every version-gated check rather than asserting a migration is
 * complete on evidence the kit does not have.
 */
export function pinnedWorkflowMajor(content: string): number | undefined {
  const major = /uses:\s*williamthorsen\/\.github\/\.github\/workflows\/code-quality-pnpm-workflow\.yaml@v(\d+)/.exec(
    content,
  )?.[1];
  return major === undefined ? undefined : Number(major);
}

/**
 * True if a pinned major meets a required floor. Undefined (an unrecognized pin) never meets one,
 * so every version-gated check reads a SHA-pinned caller as "not yet there" rather than as migrated.
 */
export function pinMeetsFloor(pinned: number | undefined, floor: number): boolean {
  return pinned !== undefined && pinned >= floor;
}

/** Describe the caller's pin for a skip reason, naming the major or the absence of a recognizable one. */
function describePin(pinned: number | undefined): string {
  return pinned === undefined ? 'no recognized workflow version' : `@v${String(pinned)}`;
}

/** Skip a check that a workflow major introduced until the caller pins that major or later. */
export function skipUnlessWorkflowPinnedAtLeast(major: number): () => false | string {
  return () => {
    const pinned = pinnedWorkflowMajor(readFile(CODE_QUALITY_WORKFLOW) ?? '');
    if (pinMeetsFloor(pinned, major)) return false;
    return `code-quality.yaml pins ${describePin(pinned)}; this requirement arrives at @v${String(major)}`;
  };
}

// -- dependency version floors --

/** Tests a devDependency version floor against a source of declared versions. */
export type FloorTest = (name: string, minVersion: string) => boolean;

// -- readyup config completeness --

/**
 * Whether the completeness check binds this repo: false to run it, or a skip reason. Below the readyup
 * version that reads `sources`, the floor check reports the gap instead.
 */
export function kitCompletenessApplicability(meetsFloor: FloorTest = hasMinDevDependencyVersion): false | string {
  if (!meetsFloor(READYUP_PACKAGE, ANY_VERSION)) {
    return `${READYUP_PACKAGE} is not installed`;
  }
  if (!meetsFloor(READYUP_PACKAGE, READYUP_SOURCES_MIN_VERSION)) {
    return `${READYUP_PACKAGE} is below ${READYUP_SOURCES_MIN_VERSION}, which first reads the sources list`;
  }
  return false;
}

/**
 * Reports the installed kit-publishing packages the readyup config neither declares nor excludes.
 * `installed` is root-anchored, as `rdy run --sources` is: a package that only a workspace manifest
 * declares is not run even when configured, so reporting it would name a gap that does not exist.
 */
export function reportUnconfiguredKitPackages(
  installed: string[],
  configSource: string,
  excluded: string[],
): CheckOutcome {
  return missingFrom(
    'kit packages',
    installed.filter((name) => !excluded.includes(name)),
    kitPackagesInConfig(configSource),
  );
}

/**
 * The package names that the readyup config's `sources` list declares as `npm:` entries. Comments
 * come out of the whole source first, so a name commented out is a name not declared and a `]` inside
 * a comment truncates no list. That also strips a `//` inside a string literal; no source form that
 * readyup accepts contains one.
 */
function kitPackagesInConfig(configSource: string): string[] {
  const code = configSource.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  const block = /\bsources\s*:\s*\[([^\]]*)\]/.exec(code)?.[1];
  if (block === undefined) return [];
  const names: string[] = [];
  for (const match of block.matchAll(/['"]npm:([^'"]+)['"]/g)) {
    const name = match[1];
    if (name !== undefined) names.push(name);
  }
  return names;
}

// -- pnpm 11 migration signal --

/** True if a package.json's packageManager field pins pnpm 11 or later. */
export function packageManagerPinsPnpm11(packageJson: string): boolean {
  const major = /"packageManager"\s*:\s*"pnpm@(\d+)\./.exec(packageJson)?.[1];
  return major !== undefined && Number(major) >= 11;
}

/**
 * Every token following `nodejs` across the `nodejs` lines of a .tool-versions file. A file
 * `actions/setup-node` can read yields exactly one.
 *
 * setup-node matches the entry with `/^(?:node(js)?\s+)?v?(?<version>[^\s]+)$/m`, so it resolves only
 * a line carrying a bare version and nothing else. A second version on the entry, a trailing `#`
 * comment, and leading indentation each leave zero matching lines and fail the run; asdf tolerates
 * all three, but asdf is not what reads this file in CI. The match is not global, so a second `nodejs`
 * line is a different shape: setup-node resolves the first and silently ignores the rest, leaving a
 * declaration that means one thing in CI and another to asdf. Counting tokens catches every one of
 * those shapes, so one parse serves the precondition check and the version floor alike.
 */
export function nodeVersionsFromToolVersions(toolVersions: string): string[] {
  return toolVersions
    .split(/\r?\n/)
    .filter((line) => /^nodejs[ \t]/.test(line))
    .flatMap((line) =>
      line
        .trim()
        .split(/[ \t]+/)
        .slice(1),
    );
}

/** Node's major version declared in a .tool-versions file, or undefined unless the file declares exactly one version. */
export function nodeMajorFromToolVersions(toolVersions: string): number | undefined {
  const versions = nodeVersionsFromToolVersions(toolVersions);
  if (versions.length !== 1) return undefined;
  const major = /^(\d+)\./.exec(versions[0] ?? '')?.[1];
  return major === undefined ? undefined : Number(major);
}

// The template's Node floor: the reference repo dropped Node 22 and pins Node 24 in .tool-versions.
const TEMPLATE_NODE_MAJOR = 24;

/** Whether a Node major from .tool-versions meets the template's floor (24). Undefined (not declared, or declared more than once) passes: the floor can't be assessed, and the `.tool-versions declares exactly one nodejs version` check reports that shape. */
export function nodeMeetsTemplateFloor(major: number | undefined): boolean {
  return major === undefined || major >= TEMPLATE_NODE_MAJOR;
}

/** Whether a Node major version meets pnpm 11's floor of 22: false to run the signal, or a skip reason. */
export function pnpmReadinessFromNode(major: number | undefined): false | string {
  if (major === undefined) return 'Node version not declared in .tool-versions; cannot assess pnpm 11 readiness';
  return major >= 22 ? false : `Node ${major} is below 22; upgrade Node to 22+ before pnpm 11`;
}

/** True if a pnpm-workspace.yaml excludes the first-party scope from the release-age soak. */
export function workspaceExcludesFirstParty(workspaceYaml: string): boolean {
  return /minimumReleaseAgeExclude:[\s\S]*?-\s*['"]?@williamthorsen\/\*/.test(workspaceYaml);
}

/** True if exact-version saving is enforced in .npmrc (pnpm 10) or pnpm-workspace.yaml (pnpm 11). */
export function saveExactEnforced(npmrc: string | undefined, workspaceYaml: string | undefined): boolean {
  const inNpmrc = npmrc !== undefined && /save-exact\s*=\s*true/.test(npmrc);
  const inWorkspace =
    workspaceYaml !== undefined &&
    (/savePrefix:\s*(?:''|"")/.test(workspaceYaml) || /saveExact:\s*true/.test(workspaceYaml));
  return inNpmrc || inWorkspace;
}

/** Signal the pnpm 11 upgrade only once Node meets pnpm 11's floor; skip with a reason otherwise. */
export function skipUnlessNodeSupportsPnpm11(): false | string {
  const content = readFile('.tool-versions');
  return pnpmReadinessFromNode(content === undefined ? undefined : nodeMajorFromToolVersions(content));
}

/** Read .tool-versions and report whether its Node major meets the template floor (24). */
export function nodeMeetsTemplateFloorFromFile(): boolean {
  const content = readFile('.tool-versions');
  return nodeMeetsTemplateFloor(content === undefined ? undefined : nodeMajorFromToolVersions(content));
}

/** Read package.json and report whether its packageManager pins pnpm 11 or later. */
export function packageManagerPinsPnpm11FromFile(): boolean {
  const content = readFile('package.json');
  return content !== undefined && packageManagerPinsPnpm11(content);
}

/** Read pnpm-workspace.yaml and report whether it carves the first-party scope out of the soak. */
export function workspaceExcludesFirstPartyFromFile(): boolean {
  const content = readFile(PNPM_WORKSPACE_FILE);
  return content !== undefined && workspaceExcludesFirstParty(content);
}

/** Read both config files and report whether exact-version saving is enforced in either. */
export function saveExactEnforcedFromFiles(): boolean {
  return saveExactEnforced(readFile('.npmrc'), readFile(PNPM_WORKSPACE_FILE));
}

/** Check that no superseded test files remain. Return detail naming offenders. */
export function noSupersededTestFiles(): boolean | CheckOutcome {
  const found = testFilesNamingSubjects(readTestDirFilenames(), SUPERSEDED_TEST_SUBJECTS);

  if (found.length === 0) return true;
  return {
    ok: false,
    detail: `superseded files found: ${found.map((filename) => posix.join(TEST_DIR, filename)).join(', ')}`,
  };
}

/** Return the path of the repo's version-alignment guard test, or undefined when it carries none. */
export function findVersionAlignmentGuard(): string | undefined {
  const [filename] = testFilesNamingSubjects(readTestDirFilenames(), [VERSION_ALIGNMENT_SUBJECT]);
  return filename === undefined ? undefined : posix.join(TEST_DIR, filename);
}

/** List the filenames directly under the root test directory, or none when it is absent. */
function readTestDirFilenames(): string[] {
  if (!existsSync(TEST_DIR)) return [];
  return readdirSync(TEST_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

/**
 * Select the test filenames whose subject -- the segment before the first dot -- is one of those given.
 *
 * The isolation-tier tail is not matched, so a repo that has renamed a test onto the tier ladder is
 * recognized alongside one that has not.
 *
 * @internal - Exported only to enable testing
 */
export function testFilesNamingSubjects(filenames: readonly string[], subjects: readonly string[]): string[] {
  return filenames.filter((filename) => isTestFile(filename) && subjects.includes(readSubject(filename))).toSorted();
}

/** Report whether a filename is one Vitest collects. */
function isTestFile(filename: string): boolean {
  return /\.test\.tsx?$/.test(filename);
}

/** Read the segment of a filename before its first dot. */
function readSubject(filename: string): string {
  return filename.split('.', 1)[0] ?? '';
}

/** Verify that .agents/preferences.yaml contains project.slug and project.ticket_ref_prefix. */
export function preferencesHasRequiredFields(): boolean {
  const content = readFile('.agents/preferences.yaml');
  if (content === undefined) return false;
  const hasSlug = /^\s+slug:\s*\S/m.test(content);
  const hasTicketPrefix = /^\s+ticket_ref_prefix:\s*\S/m.test(content);
  return hasSlug && hasTicketPrefix;
}

/** Check that .tool-versions declares exactly one nodejs version, naming what it found instead. */
export function toolVersionsDeclaresOneNodeVersion(): boolean | CheckOutcome {
  const content = readFile('.tool-versions');
  if (content === undefined) return { ok: false, detail: '.tool-versions not found' };
  const versions = nodeVersionsFromToolVersions(content);
  if (versions.length === 1) return true;
  const detail =
    versions.length === 0
      ? 'no nodejs entry that setup-node can read'
      : `the nodejs declaration carries ${String(versions.length)} tokens (${versions.join(' ')}); setup-node reads only a line that is a bare version, and stops at the first, so extra tokens on the entry leave nothing to resolve and a second nodejs line is silently ignored`;
  return { ok: false, detail };
}

// -- pre-commit formatter signals --

/**
 * Reports whether a lefthook config formats staged files at all, by either accepted route: a direct
 * prettier invocation, or `nmr fmt`, which wraps prettier and names it nowhere.
 */
export function lefthookFormatsStagedFiles(lefthookConfig: string): boolean {
  return /prettier/.test(lefthookConfig) || lefthookUsesNmrFmt(lefthookConfig);
}

/**
 * Reports whether a lefthook config formats through `nmr fmt`. `nmr fmt:check` does not count: it
 * fails a commit rather than formatting it.
 */
export function lefthookUsesNmrFmt(lefthookConfig: string): boolean {
  return /\bnmr\s+fmt\b(?!:)/.test(lefthookConfig);
}

/**
 * Whether the canonical-formatter signal binds this repo: false to run it, or a skip reason. A repo
 * whose nmr predates the `nmr-fmt` bin has no canonical form to adopt, so the signal does not yet apply.
 */
export function nmrFmtApplicability(meetsFloor: FloorTest = hasMinDevDependencyVersion): false | string {
  if (!meetsFloor(NMR_PACKAGE, ANY_VERSION)) {
    return `${NMR_PACKAGE} is not installed`;
  }
  if (!meetsFloor(NMR_PACKAGE, NMR_FMT_MIN_VERSION)) {
    return `${NMR_PACKAGE} is below ${NMR_FMT_MIN_VERSION}, which first ships the nmr-fmt bin`;
  }
  return false;
}

/**
 * Reports whether either accepted formatter is available to the repo, which is what the hook check
 * needs before it can require one. Prettier declared directly satisfies it, as does an nmr new
 * enough to ship the bin `nmr fmt` resolves to: that route formats through a prettier the repo need
 * not declare itself.
 */
export function skipUnlessFormatterAvailable(): false | string {
  if (hasDevDependency('prettier')) return false;
  if (nmrFmtApplicability() === false) return false;
  return `neither prettier nor ${NMR_PACKAGE} ${NMR_FMT_MIN_VERSION}+ is installed`;
}

/** Reads lefthook.yml and reports whether it formats staged files. */
export function lefthookFormatsStagedFilesFromFile(): boolean {
  const content = readFile('lefthook.yml');
  return content !== undefined && lefthookFormatsStagedFiles(content);
}

/** Reads lefthook.yml and reports whether it formats through `nmr fmt`. */
export function lefthookUsesNmrFmtFromFile(): boolean {
  const content = readFile('lefthook.yml');
  return content !== undefined && lefthookUsesNmrFmt(content);
}

// -- worktree config signals --

/** Reports whether a worktrunk config copies gitignored files, bounded by a `.worktreeinclude` allowlist. */
export function wtConfigCopiesIgnoredFiles(wtConfig: string): boolean {
  return /\bcopy-ignored\s+--require-include\b/.test(wtConfig);
}

/**
 * Reports whether a worktrunk config runs its creation steps as blocking `pre-start` hooks and has no
 * `post-create` table, which worktrunk runs in the background.
 */
export function wtConfigUsesPreStartHooks(wtConfig: string): boolean {
  return /\[pre-start\]/.test(wtConfig) && !/post-create/.test(wtConfig);
}
