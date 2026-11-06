/**
 * Template drift detection collection for repos created from templates.node-monorepo.
 *
 * Each checklist detects drift from the template's conventions.
 * A failing check means the repo should be synced with the template.
 *
 * Heuristics ladder (checks detect, guides instruct):
 * - Version floor (severity 'warn') when the reference has upgraded a tool.
 * - Structural signal (regex or shape probe on a config file) for wiring that must change,
 *   skip-gated on the version that introduced it so it applies from that version onward.
 * - Exact hash (`fileMatchesHash`) only for byte-stable files.
 * - Skip-gates mean "not applicable" (wrong Node, package absent, requirement not yet in force),
 *   never "behind"; being behind is what a warn-level check reports.
 *
 * Nest only a genuine precondition: the file must exist before its contents can be checked. A
 * failed parent skips every descendant, so a check nested under a version check dies when the repo
 * falls behind that version, which is wrong for a requirement that outlives the bump. Version
 * applicability is a skip-gate, not a nesting level.
 *
 * Keep each check to one predicate with a one-sentence fix. A check name must carry its meaning
 * alone: the fleet sweep table prints names, never detail. Detail belongs in a migration guide;
 * end every upgrade-class fix with `-- migration: <URL>`.
 */
import { defineRdyKit, type RdyChecklist } from 'readyup';
import {
  discoverKitPackages,
  fileExists,
  fileMatchesHash,
  hasDevDependency,
  hasMinDevDependencyVersion,
  hasPackageJsonField,
  readFile,
} from 'readyup/check-utils';

import {
  findVersionAlignmentGuard,
  kitCompletenessApplicability,
  lefthookFormatsStagedFilesFromFile,
  lefthookUsesNmrFmtFromFile,
  NMR_PACKAGE,
  nmrFmtApplicability,
  nodeMeetsTemplateFloorFromFile,
  noSupersededTestFiles,
  packageManagerPinsPnpm11FromFile,
  preferencesHasRequiredFields,
  READYUP_PACKAGE,
  READYUP_SOURCES_MIN_VERSION,
  reportUnconfiguredKitPackages,
  saveExactEnforcedFromFiles,
  skipUnlessFormatterAvailable,
  skipUnlessNodeSupportsPnpm11,
  skipUnlessWorkflowPinnedAtLeast,
  toolVersionsDeclaresOneNodeVersion,
  workspaceExcludesFirstPartyFromFile,
  wtConfigCopiesIgnoredFiles,
  wtConfigUsesPreStartHooks,
} from './lib/helpers.ts';

// SHA-256 hashes of template config files. Keep in sync (verified by __tests__/rdy-kit-hashes.app.unit.test.ts).
export const EDITORCONFIG_HASH = '667d47724ad1e0c5b7e8fdbdfd6d910b3bb7562f8356eb516389aae4f429c38c';
export const DEPENDABOT_HASH = '48bdfc4b7a743c65b3914ab6316f0f4e876a6a455b48a9911128f940e43f6746';

const WT_CONFIG_FILE = '.config/wt.toml';

// The major that retired the guard. Fixed history: later majors do not move the point from which a
// repo is told to delete a guard it still carries.
const GUARD_SUPERSEDED_MAJOR = 7;

// Migration guides linked from upgrade-class fix messages.
const CODE_QUALITY_V7_MIGRATION_URL = 'https://github.com/williamthorsen/.github#migrating-from-v6-to-v7';
const PNPM_11_MIGRATION_URL =
  'https://github.com/williamthorsen/templates.node-monorepo/blob/main/docs/migrations/pnpm-11.md';
const TYPESCRIPT_6_MIGRATION_URL =
  'https://github.com/williamthorsen/templates.node-monorepo/blob/main/docs/migrations/typescript-6.md';
const NODE_24_MIGRATION_URL =
  'https://github.com/williamthorsen/templates.node-monorepo/blob/main/docs/migrations/node-24.md';
const AGENTS_MD_MIGRATION_URL =
  'https://github.com/williamthorsen/templates.node-monorepo/blob/main/docs/migrations/agents-md.md';
const NMR_FMT_HOOK_MIGRATION_URL =
  'https://github.com/williamthorsen/templates.node-monorepo/blob/main/docs/migrations/nmr-fmt-hook.md';
const ESLINT_CONFIG_MIGRATION_URL =
  'https://github.com/williamthorsen/eslint-config/tree/main/packages/typescript#checking-your-configuration';

// The eslint-config-typescript version that first publishes its ReadyUp kit. Below it the package
// resolves but reports nothing, so the checks this kit delegates to it would silently go unrun.
const ESLINT_CONFIG_PACKAGE = '@williamthorsen/eslint-config-typescript';
const ESLINT_CONFIG_MIN_VERSION = '8.7.0';

// The codeassembly version that first publishes the guidance kit. Below it the package resolves but
// reports nothing, so the checks this kit delegates to it would silently go unrun.
const CODEASSEMBLY_PACKAGE = 'codeassembly';
const CODEASSEMBLY_MIN_VERSION = '0.7.0';

// The nmr and release-kit versions that first publish the checks this kit delegates to them. Each
// answers "new enough to report the delegated check" and is fixed at that version, never raised to
// track the package's current release.
const NMR_KIT_MIN_VERSION = '0.35.0';
const RELEASE_KIT_PACKAGE = '@williamthorsen/release-kit';
const RELEASE_KIT_MIN_VERSION = '10.5.0';

// The canonical pre-commit formatter, named by both lefthook fix messages.
const CANONICAL_FORMAT_COMMAND = 'pnpm exec nmr fmt {staged_files}';

// The readyup config. readyup resolves this path and no other, so a repo holding its config
// elsewhere has none for the completeness check to read.
const READYUP_CONFIG_FILE = '.config/readyup.config.ts';

// Kit-publishing packages left out of the readyup config's `sources` list on purpose. Empty here:
// a repo that cannot wire one records it so the completeness check reports a real gap rather than a
// standing failure.
export const EXCLUDED_KIT_PACKAGES: string[] = [];

// -- Checklists --

// codeassembly's kit reports on the guidance wiring itself, run from the repo that carries it. What no
// package kit reports is the superseded layout still being present, which is what identifies a repo
// whose migration has not started.
const agentTooling: RdyChecklist = {
  name: 'agent-tooling',
  checks: [
    {
      name: 'no .agents/PROJECT.md remains',
      check: () => !fileExists('.agents/PROJECT.md'),
      fix: `Move project guidance to the repo-root AGENTS.md and delete .agents/PROJECT.md -- migration: ${AGENTS_MD_MIGRATION_URL}`,
    },
    {
      name: '.agents/preferences.yaml has project.slug and project.ticket_ref_prefix',
      check: preferencesHasRequiredFields,
      fix: 'Add .agents/preferences.yaml with project.slug and project.ticket_ref_prefix fields',
    },
  ],
};

const codeStyle: RdyChecklist = {
  name: 'code-style',
  checks: [
    {
      name: '.editorconfig exists',
      check: () => fileExists('.editorconfig'),
      fix: 'Add .editorconfig to repo root',
      checks: [
        {
          name: '.editorconfig matches template',
          severity: 'warn',
          check: () => fileMatchesHash('.editorconfig', EDITORCONFIG_HASH),
          fix: 'Copy .editorconfig from the node-monorepo template',
        },
      ],
    },
    {
      name: 'exact-version saving is enforced',
      check: saveExactEnforcedFromFiles,
      fix: `Enforce exact-version saves: set save-exact=true in .npmrc (pnpm 10) or savePrefix: '' in pnpm-workspace.yaml (pnpm 11) -- migration: ${PNPM_11_MIGRATION_URL}`,
    },
    {
      name: 'lefthook.yml exists',
      check: () => fileExists('lefthook.yml'),
      fix: 'Add lefthook.yml for git hook management',
      checks: [
        {
          name: 'lefthook.yml formats staged files',
          skip: skipUnlessFormatterAvailable,
          check: lefthookFormatsStagedFilesFromFile,
          fix: `Add a pre-commit hook that formats staged files: ${CANONICAL_FORMAT_COMMAND}`,
          checks: [
            {
              name: 'the pre-commit formatter is nmr fmt',
              severity: 'warn',
              skip: nmrFmtApplicability,
              check: lefthookUsesNmrFmtFromFile,
              fix: `Replace the pre-commit prettier invocation with \`${CANONICAL_FORMAT_COMMAND}\`, which honors every .prettierignore in the tree so the hook and \`nmr fmt:check\` select the same files -- migration: ${NMR_FMT_HOOK_MIGRATION_URL}`,
            },
          ],
        },
      ],
    },
  ],
};

const dependencies: RdyChecklist = {
  name: 'dependencies',
  checks: [
    {
      name: '.github/dependabot.yml exists',
      check: () => fileExists('.github/dependabot.yml'),
      fix: 'Add .github/dependabot.yml from the node-monorepo template',
      checks: [
        {
          name: '.github/dependabot.yml matches template',
          severity: 'warn',
          check: () => fileMatchesHash('.github/dependabot.yml', DEPENDABOT_HASH),
          fix: 'Copy .github/dependabot.yml from the node-monorepo template',
        },
      ],
    },
    // A package that is absent, or too old to publish the check, runs no kit that could report the
    // gap: its own devDependency check cannot fire on the version that lacks it. These two anchor
    // the delegations rather than duplicating them.
    {
      name: `@williamthorsen/nmr ${NMR_KIT_MIN_VERSION}+ is installed`,
      check: () => hasMinDevDependencyVersion(NMR_PACKAGE, NMR_KIT_MIN_VERSION),
      fix: 'Upgrade @williamthorsen/nmr, whose kit reports on the Vite/Vitest config pairing and the projects model: pnpm add --save-dev @williamthorsen/nmr@latest',
    },
    {
      name: `@williamthorsen/release-kit ${RELEASE_KIT_MIN_VERSION}+ is installed`,
      check: () => hasMinDevDependencyVersion(RELEASE_KIT_PACKAGE, RELEASE_KIT_MIN_VERSION),
      fix: 'Upgrade @williamthorsen/release-kit, whose kit reports on release wiring and on @changesets/cli: pnpm add --save-dev @williamthorsen/release-kit@latest',
    },
    {
      name: '@williamthorsen/eslint-config-typescript 8.7.0+ is installed',
      check: () => hasMinDevDependencyVersion(ESLINT_CONFIG_PACKAGE, ESLINT_CONFIG_MIN_VERSION),
      fix: `Upgrade @williamthorsen/eslint-config-typescript, whose kit reports on eslint config wiring: pnpm add --save-dev @williamthorsen/eslint-config-typescript@latest -- migration: ${ESLINT_CONFIG_MIGRATION_URL}`,
    },
    {
      name: 'codeassembly 0.7.0+ is installed',
      check: () => hasMinDevDependencyVersion(CODEASSEMBLY_PACKAGE, CODEASSEMBLY_MIN_VERSION),
      fix: `Install codeassembly, whose kit reports on project guidance: pnpm add --save-dev codeassembly@latest -- migration: ${AGENTS_MD_MIGRATION_URL}`,
    },
    {
      name: 'typescript 6.0.3+ is installed',
      severity: 'warn',
      check: () => hasMinDevDependencyVersion('typescript', '6.0.3'),
      fix: `Upgrade typescript: pnpm add --save-dev typescript@latest -- migration: ${TYPESCRIPT_6_MIGRATION_URL}`,
    },
    {
      name: `readyup ${READYUP_SOURCES_MIN_VERSION}+ is installed`,
      skip: () => (hasDevDependency(READYUP_PACKAGE) ? false : 'readyup is not installed'),
      check: () => hasMinDevDependencyVersion(READYUP_PACKAGE, READYUP_SOURCES_MIN_VERSION),
      fix: `Upgrade readyup with pnpm add --save-dev readyup@latest, then rename ${READYUP_CONFIG_FILE}'s packages list to sources and prefix each package entry with npm:`,
    },
    {
      name: 'readyup config names every installed kit-publishing package',
      skip: () => kitCompletenessApplicability(),
      check: () =>
        reportUnconfiguredKitPackages(
          discoverKitPackages(),
          readFile(READYUP_CONFIG_FILE) ?? '',
          EXCLUDED_KIT_PACKAGES,
        ),
      fix: `Name each reported package as an npm: entry in ${READYUP_CONFIG_FILE}'s sources list, creating the file where it is absent, or record one this repo deliberately omits in the kit's EXCLUDED_KIT_PACKAGES`,
    },
  ],
};

const repoSetup: RdyChecklist = {
  name: 'repo-setup',
  checks: [
    {
      name: '.envrc exists',
      check: () => fileExists('.envrc'),
      fix: 'Add .envrc to repo root',
    },
    {
      name: '.config/wt.toml exists',
      check: () => fileExists(WT_CONFIG_FILE),
      fix: 'Add .config/wt.toml for worktree configuration',
      checks: [
        {
          name: '.config/wt.toml copies gitignored files into a new worktree',
          severity: 'warn',
          check: () => wtConfigCopiesIgnoredFiles(readFile(WT_CONFIG_FILE) ?? ''),
          fix: 'Add copy = "wt step copy-ignored --require-include" to .config/wt.toml in its own [[pre-start]] block, ahead of the block that installs dependencies, paired with a .worktreeinclude allowlist. A hook table runs its keys concurrently, so a copy sharing a table with the install races it and skips any allowlisted file the install has already written. --require-include makes a missing allowlist a no-op rather than a copy of the whole ignored tree, and needs worktrunk 0.62.0',
        },
        {
          name: '.config/wt.toml runs its creation steps as blocking pre-start hooks',
          severity: 'warn',
          check: () => wtConfigUsesPreStartHooks(readFile(WT_CONFIG_FILE) ?? ''),
          fix: 'Rename the [post-create] hook table in .config/wt.toml to [pre-start]: from worktrunk 0.53.0 post-create is a silent alias for the background post-start, so steps that must finish before the worktree is used run in the background instead',
        },
      ],
    },
    {
      name: '.worktreeinclude allowlists the files copied into a new worktree',
      severity: 'warn',
      check: () => fileExists('.worktreeinclude'),
      fix: 'Add .worktreeinclude at the repo root listing the gitignored files a new worktree needs, such as .env.local and CLAUDE.local.md: without it, wt step copy-ignored copies node_modules/ and build output',
    },
    {
      name: 'package.json has "type": "module"',
      check: () => hasPackageJsonField('type', 'module'),
      fix: 'Add "type": "module" to package.json',
    },
    {
      // A top-level check, not one nested under the field's presence: the predicate reads package.json
      // itself, and the nmr kit is what reports a missing field.
      name: 'packageManager pins pnpm 11 or later',
      severity: 'warn',
      skip: skipUnlessNodeSupportsPnpm11,
      check: packageManagerPinsPnpm11FromFile,
      fix: `Upgrade to pnpm 11: set packageManager to pnpm@11.x and run the v10→v11 migration -- migration: ${PNPM_11_MIGRATION_URL} (general: https://pnpm.io/migration)`,
      checks: [
        {
          name: 'minimumReleaseAgeExclude carves out first-party packages',
          severity: 'warn',
          check: workspaceExcludesFirstPartyFromFile,
          fix: `Add '@williamthorsen/*' to minimumReleaseAgeExclude in pnpm-workspace.yaml so first-party packages skip pnpm 11's release-age soak -- migration: ${PNPM_11_MIGRATION_URL}`,
        },
      ],
    },
    {
      name: '.tool-versions declares exactly one nodejs version',
      check: toolVersionsDeclaresOneNodeVersion,
      fix: `Declare a single nodejs version in .tool-versions (e.g. 'nodejs 24.18.0'): from @v7 the code-quality workflow reads the Node version from this file and fails without it -- migration: ${CODE_QUALITY_V7_MIGRATION_URL}`,
    },
    {
      name: 'Node in .tool-versions is 24 or newer',
      severity: 'warn',
      check: nodeMeetsTemplateFloorFromFile,
      fix: `Raise nodejs in .tool-versions to 24.x (the template dropped Node 22 support) -- migration: ${NODE_24_MIGRATION_URL}`,
    },
  ],
};

const testing: RdyChecklist = {
  name: 'testing',
  checks: [
    {
      name: 'version-alignment guard is removed',
      skip: skipUnlessWorkflowPinnedAtLeast(GUARD_SUPERSEDED_MAJOR),
      check: () => findVersionAlignmentGuard() === undefined,
      fix: `Delete the __tests__/version-alignment test: @v7 reads .tool-versions directly, so there is no second copy for the guard to watch -- migration: ${CODE_QUALITY_V7_MIGRATION_URL}`,
    },
    {
      name: 'no superseded test files exist',
      check: noSupersededTestFiles,
      fix: 'Remove superseded test files',
    },
  ],
};

export default defineRdyKit({
  checklists: [codeStyle, repoSetup, agentTooling, testing, dependencies],
  // The check-utils API against which the kit is written: from 0.38.0, a content check accepts a string pattern.
  minReadyupVersion: '0.38.0',
});
