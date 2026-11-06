import { describe, expect, it } from 'vitest';

import { BUILT_IN_HARNESSES } from '../built-in-harnesses.ts';
import { BUILT_IN_SETTINGS, findHarness, harnessConfigSchema } from '../settings-schema.ts';

describe('harnessConfigSchema', () => {
  it('applies the built-in harnesses and defaults to an empty config', () => {
    expect(harnessConfigSchema.parse({})).toStrictEqual(BUILT_IN_SETTINGS);
  });

  it('lets a config without harnesses name a built-in default', () => {
    expect(harnessConfigSchema.parse({ default: 'codex' })).toMatchObject({ default: 'codex' });
  });

  it('replaces the built-ins with the harnesses that a config defines', () => {
    const parsed = harnessConfigSchema.parse({ harnesses: { mine: { command: ['mine'] } } });

    expect(parsed).toStrictEqual({ default: 'mine', timeoutMinutes: 10, harnesses: { mine: { command: ['mine'] } } });
  });

  it('requires a default when several harnesses are defined', () => {
    const result = harnessConfigSchema.safeParse({ harnesses: { a: { command: ['a'] }, b: { command: ['b'] } } });

    expect(result.error?.issues).toMatchObject([
      { path: ['default'], message: 'Name the default harness, one of: a, b' },
    ]);
  });

  it('rejects a default that names no harness, including an inherited property', () => {
    const result = harnessConfigSchema.safeParse({ default: 'toString' });

    expect(result.error?.issues[0]?.message).toMatch(/^"toString" does not name a harness/);
  });

  it.each([
    ['an unknown top-level key', { extra: true }],
    ['an unknown recipe key', { harnesses: { a: { command: ['a'], shell: true } } }],
    ['an empty command', { harnesses: { a: { command: [] } } }],
    ['an empty harness record', { harnesses: {} }],
    ['a timeout above the maximum', { timeoutMinutes: 121 }],
    ['a non-positive timeout', { timeoutMinutes: 0 }],
  ])('rejects %s', (_case, config) => {
    expect(harnessConfigSchema.safeParse(config).success).toBe(false);
  });
});

describe(findHarness, () => {
  it('returns a defined harness', () => {
    expect(findHarness(BUILT_IN_SETTINGS, 'codex')).toBe(BUILT_IN_HARNESSES['codex']);
  });

  it('ignores inherited properties', () => {
    expect(findHarness(BUILT_IN_SETTINGS, '__proto__')).toBeUndefined();
  });
});

describe('built-in harnesses', () => {
  it('give every recipe a label and a test command', () => {
    for (const harness of Object.values(BUILT_IN_HARNESSES)) {
      expect(harness.label).toBeDefined();
      expect(harness.test).toBeDefined();
    }
  });
});
