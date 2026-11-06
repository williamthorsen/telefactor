import { describe, expect, it } from 'vitest';

import {
  nodeMajorFromToolVersions,
  nodeMeetsTemplateFloor,
  nodeVersionsFromToolVersions,
  packageManagerPinsPnpm11,
  pnpmReadinessFromNode,
  saveExactEnforced,
  workspaceExcludesFirstParty,
} from '../.readyup/kits/lib/helpers.ts';

const PACKAGE_JSON_PNPM_11 = '{\n  "packageManager": "pnpm@11.14.0"\n}';
const PACKAGE_JSON_PNPM_10 = '{\n  "packageManager": "pnpm@10.34.5"\n}';
const PACKAGE_JSON_PNPM_12 = '{\n  "packageManager": "pnpm@12.0.0"\n}';
const PACKAGE_JSON_NO_PACKAGE_MANAGER = '{\n  "name": "example"\n}';

const TOOL_VERSIONS_NODE_24 = 'awscli 2.28.1\nnodejs 24.18.0\npython 3.13.3\n';
const TOOL_VERSIONS_NODE_20 = 'nodejs 20.19.0\n';
const TOOL_VERSIONS_NO_NODE = 'awscli 2.28.1\npython 3.13.3\n';
const TOOL_VERSIONS_TWO_VERSIONS_ONE_LINE = 'nodejs 24.18.0 22.13.0\n';
const TOOL_VERSIONS_TWO_NODE_LINES = 'nodejs 24.18.0\npython 3.13.3\nnodejs 22.13.0\n';
const TOOL_VERSIONS_TRAILING_COMMENT = 'nodejs 24.18.0 # pinned until the CDK runtime catches up\n';
const TOOL_VERSIONS_INDENTED = '  nodejs 24.18.0\n';

const WORKSPACE_WITH_CARVE_OUT = `packages:
  - apps/*
  - packages/*

minimumReleaseAge: 1440
minimumReleaseAgeExclude:
  - '@williamthorsen/*'
  - readyup
  - v11y-check
`;
const WORKSPACE_WITHOUT_CARVE_OUT = `packages:
  - apps/*
  - packages/*

minimumReleaseAge: 1440
`;

const NPMRC_SAVE_EXACT = 'save-exact=true\n';
const WORKSPACE_SAVE_PREFIX_EMPTY = "packages:\n  - apps/*\n  - packages/*\n\nsavePrefix: ''\n";
const WORKSPACE_SAVE_EXACT_TRUE = 'packages:\n  - apps/*\n  - packages/*\n\nsaveExact: true\n';
const WORKSPACE_NO_SAVE_PREFIX = 'packages:\n  - apps/*\n  - packages/*\n';

describe('packageManagerPinsPnpm11', () => {
  it('is false when packageManager pins pnpm 10, so a v10 consumer is flagged to upgrade', () => {
    expect(packageManagerPinsPnpm11(PACKAGE_JSON_PNPM_10)).toBe(false);
  });

  it('is true when packageManager pins pnpm 11 or a later major', () => {
    expect(packageManagerPinsPnpm11(PACKAGE_JSON_PNPM_11)).toBe(true);
    expect(packageManagerPinsPnpm11(PACKAGE_JSON_PNPM_12)).toBe(true);
  });

  it('is false when there is no packageManager field', () => {
    expect(packageManagerPinsPnpm11(PACKAGE_JSON_NO_PACKAGE_MANAGER)).toBe(false);
  });
});

describe('nodeVersionsFromToolVersions', () => {
  it('yields the single declared version alongside entries for other tools', () => {
    expect(nodeVersionsFromToolVersions(TOOL_VERSIONS_NODE_24)).toEqual(['24.18.0']);
  });

  it('yields nothing when no nodejs entry is declared, the shape @v7 fails on', () => {
    expect(nodeVersionsFromToolVersions(TOOL_VERSIONS_NO_NODE)).toEqual([]);
  });

  it('yields every version when one line declares several, which @v7 fails on identically', () => {
    expect(nodeVersionsFromToolVersions(TOOL_VERSIONS_TWO_VERSIONS_ONE_LINE)).toEqual(['24.18.0', '22.13.0']);
  });

  it('yields every version when the file carries more than one nodejs line', () => {
    expect(nodeVersionsFromToolVersions(TOOL_VERSIONS_TWO_NODE_LINES)).toEqual(['24.18.0', '22.13.0']);
  });

  it('yields more than one token for a commented entry, so it is flagged — setup-node does not strip # and resolves no version from such a line', () => {
    expect(nodeVersionsFromToolVersions(TOOL_VERSIONS_TRAILING_COMMENT).length).toBeGreaterThan(1);
  });

  it('yields nothing for an indented entry, which setup-node also fails to resolve', () => {
    expect(nodeVersionsFromToolVersions(TOOL_VERSIONS_INDENTED)).toEqual([]);
  });
});

describe('nodeMajorFromToolVersions', () => {
  it('reads the declared Node major version', () => {
    expect(nodeMajorFromToolVersions(TOOL_VERSIONS_NODE_24)).toBe(24);
    expect(nodeMajorFromToolVersions(TOOL_VERSIONS_NODE_20)).toBe(20);
  });

  it('is undefined when Node is not declared, so the pnpm 11 signal skips rather than misfires', () => {
    expect(nodeMajorFromToolVersions(TOOL_VERSIONS_NO_NODE)).toBeUndefined();
  });

  it('is undefined when the file declares more than one version, so the floor is never read off an ambiguous file', () => {
    expect(nodeMajorFromToolVersions(TOOL_VERSIONS_TWO_VERSIONS_ONE_LINE)).toBeUndefined();
    expect(nodeMajorFromToolVersions(TOOL_VERSIONS_TWO_NODE_LINES)).toBeUndefined();
  });
});

describe('pnpmReadinessFromNode', () => {
  it('returns false to run the signal when Node is 22 or newer', () => {
    expect(pnpmReadinessFromNode(22)).toBe(false);
    expect(pnpmReadinessFromNode(24)).toBe(false);
  });

  it('returns a skip reason naming the shortfall when Node is below 22', () => {
    expect(pnpmReadinessFromNode(20)).toContain('below 22');
  });

  it('returns a skip reason when the Node version is undetermined', () => {
    expect(pnpmReadinessFromNode(undefined)).toContain('cannot assess');
  });
});

describe('nodeMeetsTemplateFloor', () => {
  it('is true when Node meets the template floor of 24', () => {
    expect(nodeMeetsTemplateFloor(24)).toBe(true);
    expect(nodeMeetsTemplateFloor(26)).toBe(true);
  });

  it('is false when Node is below 24, so a repo still on 22 is flagged to migrate', () => {
    expect(nodeMeetsTemplateFloor(22)).toBe(false);
    expect(nodeMeetsTemplateFloor(20)).toBe(false);
  });

  it('passes when Node is undeclared, leaving the missing declaration to the .tool-versions check', () => {
    expect(nodeMeetsTemplateFloor(undefined)).toBe(true);
  });
});

describe('workspaceExcludesFirstParty', () => {
  it('is true when the first-party scope is in minimumReleaseAgeExclude', () => {
    expect(workspaceExcludesFirstParty(WORKSPACE_WITH_CARVE_OUT)).toBe(true);
  });

  it('is false when a pnpm 11 repo has no carve-out, so the missing exclusion is flagged', () => {
    expect(workspaceExcludesFirstParty(WORKSPACE_WITHOUT_CARVE_OUT)).toBe(false);
  });
});

describe('saveExactEnforced', () => {
  it('is true when .npmrc carries save-exact (pnpm 10 layout)', () => {
    expect(saveExactEnforced(NPMRC_SAVE_EXACT, WORKSPACE_NO_SAVE_PREFIX)).toBe(true);
  });

  it('is true when pnpm-workspace.yaml sets an empty savePrefix (pnpm 11 layout)', () => {
    expect(saveExactEnforced(undefined, WORKSPACE_SAVE_PREFIX_EMPTY)).toBe(true);
  });

  it('is true when pnpm-workspace.yaml sets saveExact: true, the equivalent pnpm 11 spelling', () => {
    expect(saveExactEnforced(undefined, WORKSPACE_SAVE_EXACT_TRUE)).toBe(true);
  });

  it('is false when neither location enforces exact saving', () => {
    expect(saveExactEnforced(undefined, WORKSPACE_NO_SAVE_PREFIX)).toBe(false);
  });
});
