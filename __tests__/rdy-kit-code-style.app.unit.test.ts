import { compareVersions } from 'readyup/check-utils';
import { describe, expect, it } from 'vitest';

import {
  type FloorTest,
  lefthookFormatsStagedFiles,
  lefthookUsesNmrFmt,
  nmrFmtApplicability,
} from '../.readyup/kits/lib/helpers.ts';

const DECLARES_NMR_WITH_FMT = floorTestFor({ '@williamthorsen/nmr': '0.28.0' });
const DECLARES_NMR_BEFORE_FMT = floorTestFor({ '@williamthorsen/nmr': '0.20.0' });
const DECLARES_NO_NMR = floorTestFor({ prettier: '3.9.5' });

// lefthook's staged-files placeholder, interpolated so the literal braces are not read as a
// malformed template interpolation.
const STAGED_FILES = '{staged_files}';

const LEFTHOOK_NMR_FMT = `pre-commit:
  commands:
    format:
      run: pnpm exec nmr fmt ${STAGED_FILES}
      stage_fixed: true
`;
const LEFTHOOK_PRETTIER = `pre-commit:
  commands:
    format:
      run: pnpm exec prettier --write --log-level warn --ignore-unknown ${STAGED_FILES}
      stage_fixed: true
`;
const LEFTHOOK_NMR_FMT_CHECK = `pre-commit:
  commands:
    format:
      run: pnpm exec nmr fmt:check ${STAGED_FILES}
`;
const LEFTHOOK_WITHOUT_FORMATTER = `pre-commit:
  commands:
    typecheck:
      run: pnpm exec nmr typecheck
`;

describe('lefthookFormatsStagedFiles', () => {
  it('accepts a hook formatting through nmr fmt, which names prettier nowhere', () => {
    expect(lefthookFormatsStagedFiles(LEFTHOOK_NMR_FMT)).toBe(true);
  });

  it('accepts a hook invoking prettier directly', () => {
    expect(lefthookFormatsStagedFiles(LEFTHOOK_PRETTIER)).toBe(true);
  });

  it('rejects a hook formatting by neither route', () => {
    expect(lefthookFormatsStagedFiles(LEFTHOOK_WITHOUT_FORMATTER)).toBe(false);
  });

  it('rejects a hook running nmr fmt:check alone, which names the formatter without applying it', () => {
    expect(lefthookFormatsStagedFiles(LEFTHOOK_NMR_FMT_CHECK)).toBe(false);
  });
});

describe('lefthookUsesNmrFmt', () => {
  it('is true for the canonical hook', () => {
    expect(lefthookUsesNmrFmt(LEFTHOOK_NMR_FMT)).toBe(true);
  });

  it('is false for a direct prettier invocation, which the canonical form replaces', () => {
    expect(lefthookUsesNmrFmt(LEFTHOOK_PRETTIER)).toBe(false);
  });

  it('is false for nmr fmt:check, which checks formatting rather than applying it', () => {
    expect(lefthookUsesNmrFmt(LEFTHOOK_NMR_FMT_CHECK)).toBe(false);
  });
});

describe('nmrFmtApplicability', () => {
  it('returns false to run the signal when nmr ships the nmr-fmt bin', () => {
    expect(nmrFmtApplicability(DECLARES_NMR_WITH_FMT)).toBe(false);
  });

  it('returns a skip reason below the version that first ships the bin', () => {
    expect(nmrFmtApplicability(DECLARES_NMR_BEFORE_FMT)).toContain('below 0.21.0');
  });

  it('returns a skip reason when nmr is absent, so there is no canonical form to adopt', () => {
    expect(nmrFmtApplicability(DECLARES_NO_NMR)).toContain('not installed');
  });
});

// region | Helpers

/** Builds a floor test over a fixed set of declared versions, standing in for a repo's manifests. */
function floorTestFor(declared: Record<string, string>): FloorTest {
  return (name, minVersion) => {
    const version = declared[name];
    return version !== undefined && compareVersions(version, minVersion) >= 0;
  };
}

// endregion | Helpers
