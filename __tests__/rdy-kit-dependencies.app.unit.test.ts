import { describe, expect, it } from 'vitest';

import { kitCompletenessApplicability, reportUnconfiguredKitPackages } from '../.readyup/kits/lib/helpers.ts';

const READYUP_CONFIG = [
  "import { defineRdyConfig } from 'readyup';",
  '',
  'export default defineRdyConfig({',
  '  internal: {',
  "    infix: 'internal',",
  '  },',
  '  // The checks in these sources will be run by `rdy run --sources`.',
  '  sources: [',
  "    'github:williamthorsen/.github',",
  "    'npm:@williamthorsen/nmr',",
  "    'npm:readyup',",
  '  ],',
  '});',
].join('\n');

describe('reportUnconfiguredKitPackages', () => {
  it('passes when the config names every installed kit package', () => {
    expect(reportUnconfiguredKitPackages(['@williamthorsen/nmr', 'readyup'], READYUP_CONFIG, []).ok).toBe(true);
  });

  it('fails and names an installed kit package the config omits', () => {
    const outcome = reportUnconfiguredKitPackages(
      ['@williamthorsen/nmr', 'codeassembly', 'readyup'],
      READYUP_CONFIG,
      [],
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toBe('Of the kit packages, codeassembly is missing');
  });

  it('passes when the omitted package is recorded as excluded', () => {
    const outcome = reportUnconfiguredKitPackages(['@williamthorsen/nmr', 'codeassembly', 'readyup'], READYUP_CONFIG, [
      'codeassembly',
    ]);

    expect(outcome.ok).toBe(true);
  });

  it('does not read a name from outside the sources list', () => {
    const outcome = reportUnconfiguredKitPackages(['internal'], READYUP_CONFIG, []);

    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toBe('Of the kit packages, internal is missing');
  });

  it('does not count a name that the sources list contains only in a comment', () => {
    const commented = READYUP_CONFIG.replace("    'npm:readyup',", "    // 'npm:readyup',");

    const outcome = reportUnconfiguredKitPackages(['readyup'], commented, []);

    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toBe('Of the kit packages, readyup is missing');
  });

  it('is not truncated by a bracket inside a comment in the sources list', () => {
    const withBracket = READYUP_CONFIG.replace(
      "    'npm:@williamthorsen/nmr',",
      "    'npm:@williamthorsen/nmr', // pending: see issue [#42]",
    );

    expect(reportUnconfiguredKitPackages(['@williamthorsen/nmr', 'readyup'], withBracket, []).ok).toBe(true);
  });

  it('reads the declared sources list rather than a commented-out one above it', () => {
    const decoy = `// sources: ['npm:@williamthorsen/tsconfig']\n${READYUP_CONFIG}`;

    expect(reportUnconfiguredKitPackages(['@williamthorsen/nmr', 'readyup'], decoy, []).ok).toBe(true);
  });

  it('does not count a source that is not an npm: entry', () => {
    const outcome = reportUnconfiguredKitPackages(['williamthorsen/.github'], READYUP_CONFIG, []);

    expect(outcome.ok).toBe(false);
  });

  it('does not count a bare name in the sources list', () => {
    const bare = READYUP_CONFIG.replace("    'npm:readyup',", "    'readyup',");

    expect(reportUnconfiguredKitPackages(['readyup'], bare, []).ok).toBe(false);
  });

  it('reports every installed kit package when the config declares no sources list', () => {
    const outcome = reportUnconfiguredKitPackages(['readyup'], 'export default defineRdyConfig({});', []);

    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toBe('Of the kit packages, readyup is missing');
  });
});

describe('kitCompletenessApplicability', () => {
  it('returns false to run the check when readyup reads the sources list', () => {
    expect(kitCompletenessApplicability(() => true)).toBe(false);
  });

  it('returns a skip reason below the version that first reads the sources list', () => {
    const installedBelowFloor = (_name: string, minVersion: string) => minVersion === '0.0.0';

    expect(kitCompletenessApplicability(installedBelowFloor)).toContain('below 0.40.0');
  });

  it('returns a skip reason when readyup is absent', () => {
    expect(kitCompletenessApplicability(() => false)).toContain('not installed');
  });
});
