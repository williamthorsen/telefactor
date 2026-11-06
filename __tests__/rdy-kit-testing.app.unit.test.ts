import { isFlatChecklist, type RdyCheck, type RdyKit } from 'readyup';
import { describe, expect, it } from 'vitest';

import driftKit from '../.readyup/kits/default.ts';
import { testFilesNamingSubjects } from '../.readyup/kits/lib/helpers.ts';

// One subject rendered with each tail a fleet repo carries: the pre-migration `.app.` infix, the tail a
// migration onto the isolation ladder produces, and no tail at all.
const LEGACY_TAIL = 'version-alignment.app.test.ts';
const LADDER_TAIL = 'version-alignment.app.unit.test.ts';
const NO_TAIL = 'version-alignment.test.ts';

describe('testFilesNamingSubjects', () => {
  it('selects a file whatever isolation-tier tail it carries', () => {
    expect(testFilesNamingSubjects([LEGACY_TAIL], ['version-alignment'])).toEqual([LEGACY_TAIL]);
    expect(testFilesNamingSubjects([LADDER_TAIL], ['version-alignment'])).toEqual([LADDER_TAIL]);
    expect(testFilesNamingSubjects([NO_TAIL], ['version-alignment'])).toEqual([NO_TAIL]);
  });

  it('selects a .tsx file, which Vitest collects alongside .ts', () => {
    expect(testFilesNamingSubjects(['consistency.unit.test.tsx'], ['consistency'])).toEqual([
      'consistency.unit.test.tsx',
    ]);
  });

  it('selects every named subject and nothing else, in sorted order', () => {
    const filenames = ['pnpm-version.app.test.ts', 'rdy-kit-hashes.app.unit.test.ts', 'consistency.unit.test.ts'];

    expect(testFilesNamingSubjects(filenames, ['consistency', 'pnpm-version'])).toEqual([
      'consistency.unit.test.ts',
      'pnpm-version.app.test.ts',
    ]);
  });

  it('ignores a file whose subject only begins with a named subject', () => {
    expect(testFilesNamingSubjects(['version-alignment-extras.unit.test.ts'], ['version-alignment'])).toEqual([]);
  });

  it('ignores a non-test file naming the subject, which the check must not report as a test', () => {
    expect(testFilesNamingSubjects(['version-alignment.ts'], ['version-alignment'])).toEqual([]);
  });
});

describe('the drift kit', () => {
  it('recommends adding no version-alignment guard test, which @v7 retired and this template no longer ships', () => {
    // A check's fix message is optional, so a restored check could state the requirement in its name alone.
    const guardChecks = collectChecks(driftKit.checklists).filter((check) =>
      `${check.name} ${check.fix ?? ''}`.includes('version-alignment'),
    );

    expect(guardChecks.map((check) => check.name)).toEqual(['version-alignment guard is removed']);
    expect(guardChecks[0]?.fix).toMatch(/^Delete /);
  });
});

// region | Helpers

/** Flattens every check the kit declares, descending through nested checks and each checklist's preconditions. */
function collectChecks(checklists: RdyKit['checklists']): RdyCheck[] {
  return checklists.flatMap((checklist) => {
    const checks = isFlatChecklist(checklist) ? checklist.checks : checklist.groups.flat();
    return [...(checklist.preconditions ?? []), ...checks].flatMap(flattenCheck);
  });
}

/** Flattens one check and its nested checks into a single list. */
function flattenCheck(check: RdyCheck): RdyCheck[] {
  // A builder's checks exist only once readyup runs it against a repo.
  const nested = typeof check.checks === 'function' ? [] : (check.checks ?? []);
  return [check, ...nested.flatMap(flattenCheck)];
}

// endregion | Helpers
