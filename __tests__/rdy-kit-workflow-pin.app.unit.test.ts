import { describe, expect, it } from 'vitest';

import { pinMeetsFloor, pinnedWorkflowMajor } from '../.readyup/kits/lib/helpers.ts';

/**
 * Fixtures representing the code-quality workflow caller pinned at each major the drift kit reads,
 * at a patch-level tag, and pinned to something the kit cannot read as a major.
 */
const V5_CALLER = `name: Code quality checks

on:
  push:
    branches: [main]

jobs:
  code-quality:
    uses: williamthorsen/.github/.github/workflows/code-quality-pnpm-workflow.yaml@v5
    with:
      check-command: pnpm exec nmr check
`;

const V6_CALLER = `name: Code quality checks

on:
  push:
    branches: [main]

jobs:
  code-quality:
    uses: williamthorsen/.github/.github/workflows/code-quality-pnpm-workflow.yaml@v6
    with:
      check-command: pnpm exec nmr check
      node-version: '24.18.0'
`;

const V7_CALLER = `name: Code quality checks

on:
  push:
    branches: [main]

concurrency:
  group: code-quality-checks
  cancel-in-progress: true

jobs:
  code-quality:
    uses: williamthorsen/.github/.github/workflows/code-quality-pnpm-workflow.yaml@v7
    with:
      check-command: pnpm exec nmr check
`;

const V7_PATCH_PINNED_CALLER = V7_CALLER.replace('@v7', '@v7.1.0');

const SHA_PINNED_CALLER = V7_CALLER.replace('@v7', '@d6cd1f2a0b7c4e8f9a3b5c7d1e2f4a6b8c0d2e4f');

const CALLER_WITHOUT_USES = `name: Code quality checks

on:
  push:
    branches: [main]

jobs:
  code-quality:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm exec nmr check
`;

describe('pinnedWorkflowMajor', () => {
  it('reads the pinned major, so a version-gated check knows whether its major has arrived', () => {
    expect(pinnedWorkflowMajor(V5_CALLER)).toBe(5);
    expect(pinnedWorkflowMajor(V6_CALLER)).toBe(6);
    expect(pinnedWorkflowMajor(V7_CALLER)).toBe(7);
  });

  it('reads the major from a patch-level tag, which pins the same workflow', () => {
    expect(pinnedWorkflowMajor(V7_PATCH_PINNED_CALLER)).toBe(7);
  });

  it('is undefined for a SHA pin, so an unreadable pin never asserts a migration is complete', () => {
    expect(pinnedWorkflowMajor(SHA_PINNED_CALLER)).toBeUndefined();
  });

  it('is undefined when the caller does not use the reusable workflow at all', () => {
    expect(pinnedWorkflowMajor(CALLER_WITHOUT_USES)).toBeUndefined();
  });
});

describe('pinMeetsFloor', () => {
  it('is true only at or above the floor, so a v6 repo keeps the v6 requirements and not the v7 ones', () => {
    expect(pinMeetsFloor(6, 6)).toBe(true);
    expect(pinMeetsFloor(6, 7)).toBe(false);
    expect(pinMeetsFloor(7, 6)).toBe(true);
    expect(pinMeetsFloor(5, 6)).toBe(false);
  });

  it('is false for an unrecognized pin, so a SHA-pinned caller is never read as migrated', () => {
    expect(pinMeetsFloor(undefined, 6)).toBe(false);
    expect(pinMeetsFloor(undefined, 7)).toBe(false);
  });
});
