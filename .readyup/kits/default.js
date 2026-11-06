/** @noformat -- @generated. Do not edit. Compiled by rdy. */
/* eslint-disable */
export const __readyupVersion = "0.44.0";


// .readyup/kits/default.ts
import { defineRdyKit } from "readyup";
import {
  discoverKitPackages,
  fileExists,
  fileMatchesHash,
  hasDevDependency as hasDevDependency2,
  hasMinDevDependencyVersion as hasMinDevDependencyVersion2,
  hasPackageJsonField,
  readFile as readFile2
} from "readyup/check-utils";

// .readyup/kits/lib/helpers.ts
import { existsSync, readdirSync } from "node:fs";
import { posix } from "node:path";
import { hasDevDependency, hasMinDevDependencyVersion, missingFrom, readFile } from "readyup/check-utils";
var NMR_PACKAGE = "@williamthorsen/nmr";
var READYUP_PACKAGE = "readyup";
var READYUP_SOURCES_MIN_VERSION = "0.40.0";
var CODE_QUALITY_WORKFLOW = ".github/workflows/code-quality.yaml";
var TEST_DIR = "__tests__";
var PNPM_WORKSPACE_FILE = "pnpm-workspace.yaml";
var VERSION_ALIGNMENT_SUBJECT = "version-alignment";
var SUPERSEDED_TEST_SUBJECTS = ["consistency", "nodejs-version", "pnpm-version"];
var NMR_FMT_MIN_VERSION = "0.21.0";
var ANY_VERSION = "0.0.0";
function pinnedWorkflowMajor(content) {
  const major = /uses:\s*williamthorsen\/\.github\/\.github\/workflows\/code-quality-pnpm-workflow\.yaml@v(\d+)/.exec(
    content
  )?.[1];
  return major === void 0 ? void 0 : Number(major);
}
function pinMeetsFloor(pinned, floor) {
  return pinned !== void 0 && pinned >= floor;
}
function describePin(pinned) {
  return pinned === void 0 ? "no recognized workflow version" : `@v${String(pinned)}`;
}
function skipUnlessWorkflowPinnedAtLeast(major) {
  return () => {
    const pinned = pinnedWorkflowMajor(readFile(CODE_QUALITY_WORKFLOW) ?? "");
    if (pinMeetsFloor(pinned, major)) return false;
    return `code-quality.yaml pins ${describePin(pinned)}; this requirement arrives at @v${String(major)}`;
  };
}
function kitCompletenessApplicability(meetsFloor = hasMinDevDependencyVersion) {
  if (!meetsFloor(READYUP_PACKAGE, ANY_VERSION)) {
    return `${READYUP_PACKAGE} is not installed`;
  }
  if (!meetsFloor(READYUP_PACKAGE, READYUP_SOURCES_MIN_VERSION)) {
    return `${READYUP_PACKAGE} is below ${READYUP_SOURCES_MIN_VERSION}, which first reads the sources list`;
  }
  return false;
}
function reportUnconfiguredKitPackages(installed, configSource, excluded) {
  return missingFrom(
    "kit packages",
    installed.filter((name) => !excluded.includes(name)),
    kitPackagesInConfig(configSource)
  );
}
function kitPackagesInConfig(configSource) {
  const code = configSource.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  const block = /\bsources\s*:\s*\[([^\]]*)\]/.exec(code)?.[1];
  if (block === void 0) return [];
  const names = [];
  for (const match of block.matchAll(/['"]npm:([^'"]+)['"]/g)) {
    const name = match[1];
    if (name !== void 0) names.push(name);
  }
  return names;
}
function packageManagerPinsPnpm11(packageJson) {
  const major = /"packageManager"\s*:\s*"pnpm@(\d+)\./.exec(packageJson)?.[1];
  return major !== void 0 && Number(major) >= 11;
}
function nodeVersionsFromToolVersions(toolVersions) {
  return toolVersions.split(/\r?\n/).filter((line) => /^nodejs[ \t]/.test(line)).flatMap(
    (line) => line.trim().split(/[ \t]+/).slice(1)
  );
}
function nodeMajorFromToolVersions(toolVersions) {
  const versions = nodeVersionsFromToolVersions(toolVersions);
  if (versions.length !== 1) return void 0;
  const major = /^(\d+)\./.exec(versions[0] ?? "")?.[1];
  return major === void 0 ? void 0 : Number(major);
}
var TEMPLATE_NODE_MAJOR = 24;
function nodeMeetsTemplateFloor(major) {
  return major === void 0 || major >= TEMPLATE_NODE_MAJOR;
}
function pnpmReadinessFromNode(major) {
  if (major === void 0) return "Node version not declared in .tool-versions; cannot assess pnpm 11 readiness";
  return major >= 22 ? false : `Node ${major} is below 22; upgrade Node to 22+ before pnpm 11`;
}
function workspaceExcludesFirstParty(workspaceYaml) {
  return /minimumReleaseAgeExclude:[\s\S]*?-\s*['"]?@williamthorsen\/\*/.test(workspaceYaml);
}
function saveExactEnforced(npmrc, workspaceYaml) {
  const inNpmrc = npmrc !== void 0 && /save-exact\s*=\s*true/.test(npmrc);
  const inWorkspace = workspaceYaml !== void 0 && (/savePrefix:\s*(?:''|"")/.test(workspaceYaml) || /saveExact:\s*true/.test(workspaceYaml));
  return inNpmrc || inWorkspace;
}
function skipUnlessNodeSupportsPnpm11() {
  const content = readFile(".tool-versions");
  return pnpmReadinessFromNode(content === void 0 ? void 0 : nodeMajorFromToolVersions(content));
}
function nodeMeetsTemplateFloorFromFile() {
  const content = readFile(".tool-versions");
  return nodeMeetsTemplateFloor(content === void 0 ? void 0 : nodeMajorFromToolVersions(content));
}
function packageManagerPinsPnpm11FromFile() {
  const content = readFile("package.json");
  return content !== void 0 && packageManagerPinsPnpm11(content);
}
function workspaceExcludesFirstPartyFromFile() {
  const content = readFile(PNPM_WORKSPACE_FILE);
  return content !== void 0 && workspaceExcludesFirstParty(content);
}
function saveExactEnforcedFromFiles() {
  return saveExactEnforced(readFile(".npmrc"), readFile(PNPM_WORKSPACE_FILE));
}
function noSupersededTestFiles() {
  const found = testFilesNamingSubjects(readTestDirFilenames(), SUPERSEDED_TEST_SUBJECTS);
  if (found.length === 0) return true;
  return {
    ok: false,
    detail: `superseded files found: ${found.map((filename) => posix.join(TEST_DIR, filename)).join(", ")}`
  };
}
function findVersionAlignmentGuard() {
  const [filename] = testFilesNamingSubjects(readTestDirFilenames(), [VERSION_ALIGNMENT_SUBJECT]);
  return filename === void 0 ? void 0 : posix.join(TEST_DIR, filename);
}
function readTestDirFilenames() {
  if (!existsSync(TEST_DIR)) return [];
  return readdirSync(TEST_DIR, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
}
function testFilesNamingSubjects(filenames, subjects) {
  return filenames.filter((filename) => isTestFile(filename) && subjects.includes(readSubject(filename))).toSorted();
}
function isTestFile(filename) {
  return /\.test\.tsx?$/.test(filename);
}
function readSubject(filename) {
  return filename.split(".", 1)[0] ?? "";
}
function preferencesHasRequiredFields() {
  const content = readFile(".agents/preferences.yaml");
  if (content === void 0) return false;
  const hasSlug = /^\s+slug:\s*\S/m.test(content);
  const hasTicketPrefix = /^\s+ticket_ref_prefix:\s*\S/m.test(content);
  return hasSlug && hasTicketPrefix;
}
function toolVersionsDeclaresOneNodeVersion() {
  const content = readFile(".tool-versions");
  if (content === void 0) return { ok: false, detail: ".tool-versions not found" };
  const versions = nodeVersionsFromToolVersions(content);
  if (versions.length === 1) return true;
  const detail = versions.length === 0 ? "no nodejs entry that setup-node can read" : `the nodejs declaration carries ${String(versions.length)} tokens (${versions.join(" ")}); setup-node reads only a line that is a bare version, and stops at the first, so extra tokens on the entry leave nothing to resolve and a second nodejs line is silently ignored`;
  return { ok: false, detail };
}
function lefthookFormatsStagedFiles(lefthookConfig) {
  return /prettier/.test(lefthookConfig) || lefthookUsesNmrFmt(lefthookConfig);
}
function lefthookUsesNmrFmt(lefthookConfig) {
  return /\bnmr\s+fmt\b(?!:)/.test(lefthookConfig);
}
function nmrFmtApplicability(meetsFloor = hasMinDevDependencyVersion) {
  if (!meetsFloor(NMR_PACKAGE, ANY_VERSION)) {
    return `${NMR_PACKAGE} is not installed`;
  }
  if (!meetsFloor(NMR_PACKAGE, NMR_FMT_MIN_VERSION)) {
    return `${NMR_PACKAGE} is below ${NMR_FMT_MIN_VERSION}, which first ships the nmr-fmt bin`;
  }
  return false;
}
function skipUnlessFormatterAvailable() {
  if (hasDevDependency("prettier")) return false;
  if (nmrFmtApplicability() === false) return false;
  return `neither prettier nor ${NMR_PACKAGE} ${NMR_FMT_MIN_VERSION}+ is installed`;
}
function lefthookFormatsStagedFilesFromFile() {
  const content = readFile("lefthook.yml");
  return content !== void 0 && lefthookFormatsStagedFiles(content);
}
function lefthookUsesNmrFmtFromFile() {
  const content = readFile("lefthook.yml");
  return content !== void 0 && lefthookUsesNmrFmt(content);
}
function wtConfigCopiesIgnoredFiles(wtConfig) {
  return /\bcopy-ignored\s+--require-include\b/.test(wtConfig);
}
function wtConfigUsesPreStartHooks(wtConfig) {
  return /\[pre-start\]/.test(wtConfig) && !/post-create/.test(wtConfig);
}

// .readyup/kits/default.ts
var EDITORCONFIG_HASH = "667d47724ad1e0c5b7e8fdbdfd6d910b3bb7562f8356eb516389aae4f429c38c";
var DEPENDABOT_HASH = "48bdfc4b7a743c65b3914ab6316f0f4e876a6a455b48a9911128f940e43f6746";
var WT_CONFIG_FILE = ".config/wt.toml";
var GUARD_SUPERSEDED_MAJOR = 7;
var CODE_QUALITY_V7_MIGRATION_URL = "https://github.com/williamthorsen/.github#migrating-from-v6-to-v7";
var PNPM_11_MIGRATION_URL = "https://github.com/williamthorsen/templates.node-monorepo/blob/main/docs/migrations/pnpm-11.md";
var TYPESCRIPT_6_MIGRATION_URL = "https://github.com/williamthorsen/templates.node-monorepo/blob/main/docs/migrations/typescript-6.md";
var NODE_24_MIGRATION_URL = "https://github.com/williamthorsen/templates.node-monorepo/blob/main/docs/migrations/node-24.md";
var AGENTS_MD_MIGRATION_URL = "https://github.com/williamthorsen/templates.node-monorepo/blob/main/docs/migrations/agents-md.md";
var NMR_FMT_HOOK_MIGRATION_URL = "https://github.com/williamthorsen/templates.node-monorepo/blob/main/docs/migrations/nmr-fmt-hook.md";
var ESLINT_CONFIG_MIGRATION_URL = "https://github.com/williamthorsen/eslint-config/tree/main/packages/typescript#checking-your-configuration";
var ESLINT_CONFIG_PACKAGE = "@williamthorsen/eslint-config-typescript";
var ESLINT_CONFIG_MIN_VERSION = "8.7.0";
var CODEASSEMBLY_PACKAGE = "codeassembly";
var CODEASSEMBLY_MIN_VERSION = "0.7.0";
var NMR_KIT_MIN_VERSION = "0.35.0";
var RELEASE_KIT_PACKAGE = "@williamthorsen/release-kit";
var RELEASE_KIT_MIN_VERSION = "10.5.0";
var CANONICAL_FORMAT_COMMAND = "pnpm exec nmr fmt {staged_files}";
var READYUP_CONFIG_FILE = ".config/readyup.config.ts";
var EXCLUDED_KIT_PACKAGES = [];
var agentTooling = {
  name: "agent-tooling",
  checks: [
    {
      name: "no .agents/PROJECT.md remains",
      check: () => !fileExists(".agents/PROJECT.md"),
      fix: `Move project guidance to the repo-root AGENTS.md and delete .agents/PROJECT.md -- migration: ${AGENTS_MD_MIGRATION_URL}`
    },
    {
      name: ".agents/preferences.yaml has project.slug and project.ticket_ref_prefix",
      check: preferencesHasRequiredFields,
      fix: "Add .agents/preferences.yaml with project.slug and project.ticket_ref_prefix fields"
    }
  ]
};
var codeStyle = {
  name: "code-style",
  checks: [
    {
      name: ".editorconfig exists",
      check: () => fileExists(".editorconfig"),
      fix: "Add .editorconfig to repo root",
      checks: [
        {
          name: ".editorconfig matches template",
          severity: "warn",
          check: () => fileMatchesHash(".editorconfig", EDITORCONFIG_HASH),
          fix: "Copy .editorconfig from the node-monorepo template"
        }
      ]
    },
    {
      name: "exact-version saving is enforced",
      check: saveExactEnforcedFromFiles,
      fix: `Enforce exact-version saves: set save-exact=true in .npmrc (pnpm 10) or savePrefix: '' in pnpm-workspace.yaml (pnpm 11) -- migration: ${PNPM_11_MIGRATION_URL}`
    },
    {
      name: "lefthook.yml exists",
      check: () => fileExists("lefthook.yml"),
      fix: "Add lefthook.yml for git hook management",
      checks: [
        {
          name: "lefthook.yml formats staged files",
          skip: skipUnlessFormatterAvailable,
          check: lefthookFormatsStagedFilesFromFile,
          fix: `Add a pre-commit hook that formats staged files: ${CANONICAL_FORMAT_COMMAND}`,
          checks: [
            {
              name: "the pre-commit formatter is nmr fmt",
              severity: "warn",
              skip: nmrFmtApplicability,
              check: lefthookUsesNmrFmtFromFile,
              fix: `Replace the pre-commit prettier invocation with \`${CANONICAL_FORMAT_COMMAND}\`, which honors every .prettierignore in the tree so the hook and \`nmr fmt:check\` select the same files -- migration: ${NMR_FMT_HOOK_MIGRATION_URL}`
            }
          ]
        }
      ]
    }
  ]
};
var dependencies = {
  name: "dependencies",
  checks: [
    {
      name: ".github/dependabot.yml exists",
      check: () => fileExists(".github/dependabot.yml"),
      fix: "Add .github/dependabot.yml from the node-monorepo template",
      checks: [
        {
          name: ".github/dependabot.yml matches template",
          severity: "warn",
          check: () => fileMatchesHash(".github/dependabot.yml", DEPENDABOT_HASH),
          fix: "Copy .github/dependabot.yml from the node-monorepo template"
        }
      ]
    },
    // A package that is absent, or too old to publish the check, runs no kit that could report the
    // gap: its own devDependency check cannot fire on the version that lacks it. These two anchor
    // the delegations rather than duplicating them.
    {
      name: `@williamthorsen/nmr ${NMR_KIT_MIN_VERSION}+ is installed`,
      check: () => hasMinDevDependencyVersion2(NMR_PACKAGE, NMR_KIT_MIN_VERSION),
      fix: "Upgrade @williamthorsen/nmr, whose kit reports on the Vite/Vitest config pairing and the projects model: pnpm add --save-dev @williamthorsen/nmr@latest"
    },
    {
      name: `@williamthorsen/release-kit ${RELEASE_KIT_MIN_VERSION}+ is installed`,
      check: () => hasMinDevDependencyVersion2(RELEASE_KIT_PACKAGE, RELEASE_KIT_MIN_VERSION),
      fix: "Upgrade @williamthorsen/release-kit, whose kit reports on release wiring and on @changesets/cli: pnpm add --save-dev @williamthorsen/release-kit@latest"
    },
    {
      name: "@williamthorsen/eslint-config-typescript 8.7.0+ is installed",
      check: () => hasMinDevDependencyVersion2(ESLINT_CONFIG_PACKAGE, ESLINT_CONFIG_MIN_VERSION),
      fix: `Upgrade @williamthorsen/eslint-config-typescript, whose kit reports on eslint config wiring: pnpm add --save-dev @williamthorsen/eslint-config-typescript@latest -- migration: ${ESLINT_CONFIG_MIGRATION_URL}`
    },
    {
      name: "codeassembly 0.7.0+ is installed",
      check: () => hasMinDevDependencyVersion2(CODEASSEMBLY_PACKAGE, CODEASSEMBLY_MIN_VERSION),
      fix: `Install codeassembly, whose kit reports on project guidance: pnpm add --save-dev codeassembly@latest -- migration: ${AGENTS_MD_MIGRATION_URL}`
    },
    {
      name: "typescript 6.0.3+ is installed",
      severity: "warn",
      check: () => hasMinDevDependencyVersion2("typescript", "6.0.3"),
      fix: `Upgrade typescript: pnpm add --save-dev typescript@latest -- migration: ${TYPESCRIPT_6_MIGRATION_URL}`
    },
    {
      name: `readyup ${READYUP_SOURCES_MIN_VERSION}+ is installed`,
      skip: () => hasDevDependency2(READYUP_PACKAGE) ? false : "readyup is not installed",
      check: () => hasMinDevDependencyVersion2(READYUP_PACKAGE, READYUP_SOURCES_MIN_VERSION),
      fix: `Upgrade readyup with pnpm add --save-dev readyup@latest, then rename ${READYUP_CONFIG_FILE}'s packages list to sources and prefix each package entry with npm:`
    },
    {
      name: "readyup config names every installed kit-publishing package",
      skip: () => kitCompletenessApplicability(),
      check: () => reportUnconfiguredKitPackages(
        discoverKitPackages(),
        readFile2(READYUP_CONFIG_FILE) ?? "",
        EXCLUDED_KIT_PACKAGES
      ),
      fix: `Name each reported package as an npm: entry in ${READYUP_CONFIG_FILE}'s sources list, creating the file where it is absent, or record one this repo deliberately omits in the kit's EXCLUDED_KIT_PACKAGES`
    }
  ]
};
var repoSetup = {
  name: "repo-setup",
  checks: [
    {
      name: ".envrc exists",
      check: () => fileExists(".envrc"),
      fix: "Add .envrc to repo root"
    },
    {
      name: ".config/wt.toml exists",
      check: () => fileExists(WT_CONFIG_FILE),
      fix: "Add .config/wt.toml for worktree configuration",
      checks: [
        {
          name: ".config/wt.toml copies gitignored files into a new worktree",
          severity: "warn",
          check: () => wtConfigCopiesIgnoredFiles(readFile2(WT_CONFIG_FILE) ?? ""),
          fix: 'Add copy = "wt step copy-ignored --require-include" to .config/wt.toml in its own [[pre-start]] block, ahead of the block that installs dependencies, paired with a .worktreeinclude allowlist. A hook table runs its keys concurrently, so a copy sharing a table with the install races it and skips any allowlisted file the install has already written. --require-include makes a missing allowlist a no-op rather than a copy of the whole ignored tree, and needs worktrunk 0.62.0'
        },
        {
          name: ".config/wt.toml runs its creation steps as blocking pre-start hooks",
          severity: "warn",
          check: () => wtConfigUsesPreStartHooks(readFile2(WT_CONFIG_FILE) ?? ""),
          fix: "Rename the [post-create] hook table in .config/wt.toml to [pre-start]: from worktrunk 0.53.0 post-create is a silent alias for the background post-start, so steps that must finish before the worktree is used run in the background instead"
        }
      ]
    },
    {
      name: ".worktreeinclude allowlists the files copied into a new worktree",
      severity: "warn",
      check: () => fileExists(".worktreeinclude"),
      fix: "Add .worktreeinclude at the repo root listing the gitignored files a new worktree needs, such as .env.local and CLAUDE.local.md: without it, wt step copy-ignored copies node_modules/ and build output"
    },
    {
      name: 'package.json has "type": "module"',
      check: () => hasPackageJsonField("type", "module"),
      fix: 'Add "type": "module" to package.json'
    },
    {
      // A top-level check, not one nested under the field's presence: the predicate reads package.json
      // itself, and the nmr kit is what reports a missing field.
      name: "packageManager pins pnpm 11 or later",
      severity: "warn",
      skip: skipUnlessNodeSupportsPnpm11,
      check: packageManagerPinsPnpm11FromFile,
      fix: `Upgrade to pnpm 11: set packageManager to pnpm@11.x and run the v10\u2192v11 migration -- migration: ${PNPM_11_MIGRATION_URL} (general: https://pnpm.io/migration)`,
      checks: [
        {
          name: "minimumReleaseAgeExclude carves out first-party packages",
          severity: "warn",
          check: workspaceExcludesFirstPartyFromFile,
          fix: `Add '@williamthorsen/*' to minimumReleaseAgeExclude in pnpm-workspace.yaml so first-party packages skip pnpm 11's release-age soak -- migration: ${PNPM_11_MIGRATION_URL}`
        }
      ]
    },
    {
      name: ".tool-versions declares exactly one nodejs version",
      check: toolVersionsDeclaresOneNodeVersion,
      fix: `Declare a single nodejs version in .tool-versions (e.g. 'nodejs 24.18.0'): from @v7 the code-quality workflow reads the Node version from this file and fails without it -- migration: ${CODE_QUALITY_V7_MIGRATION_URL}`
    },
    {
      name: "Node in .tool-versions is 24 or newer",
      severity: "warn",
      check: nodeMeetsTemplateFloorFromFile,
      fix: `Raise nodejs in .tool-versions to 24.x (the template dropped Node 22 support) -- migration: ${NODE_24_MIGRATION_URL}`
    }
  ]
};
var testing = {
  name: "testing",
  checks: [
    {
      name: "version-alignment guard is removed",
      skip: skipUnlessWorkflowPinnedAtLeast(GUARD_SUPERSEDED_MAJOR),
      check: () => findVersionAlignmentGuard() === void 0,
      fix: `Delete the __tests__/version-alignment test: @v7 reads .tool-versions directly, so there is no second copy for the guard to watch -- migration: ${CODE_QUALITY_V7_MIGRATION_URL}`
    },
    {
      name: "no superseded test files exist",
      check: noSupersededTestFiles,
      fix: "Remove superseded test files"
    }
  ]
};
var default_default = defineRdyKit({
  checklists: [codeStyle, repoSetup, agentTooling, testing, dependencies],
  // The check-utils API against which the kit is written: from 0.38.0, a content check accepts a string pattern.
  minReadyupVersion: "0.38.0"
});
export {
  DEPENDABOT_HASH,
  EDITORCONFIG_HASH,
  EXCLUDED_KIT_PACKAGES,
  default_default as default
};
