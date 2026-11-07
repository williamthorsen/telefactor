import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { BUILT_IN_HARNESSES } from '../built-in-harnesses.ts';
import { buildHarnessConfigSchema, BUILT_IN_SETTINGS, findHarness, harnessConfigSchema } from '../settings-schema.ts';

describe('harnessConfigSchema', () => {
  it('applies the built-in harnesses and defaults to an empty config', () => {
    expect(harnessConfigSchema.parse({})).toStrictEqual(BUILT_IN_SETTINGS);
  });

  it('lets a config without harnesses name a built-in default', () => {
    expect(harnessConfigSchema.parse({ default: 'codex' })).toMatchObject({ default: 'codex' });
  });

  it('replaces the built-ins with the harnesses that a config defines', () => {
    const parsed = harnessConfigSchema.parse({ harnesses: { mine: { command: ['mine'] } } });

    expect(parsed).toStrictEqual({
      default: 'mine',
      timeoutMinutes: 10,
      harnesses: { mine: { command: ['mine'] } },
      app: {},
    });
  });

  it('requires a default when several harnesses are defined', () => {
    const result = harnessConfigSchema.safeParse({ harnesses: { a: { command: ['a'] }, b: { command: ['b'] } } });

    expect(result.error?.issues).toMatchObject([
      { path: ['default'], message: 'Name the default harness, one of: a, b' },
    ]);
  });

  it('accepts an interactive command with MCP arguments', () => {
    const recipe = { command: ['a'], interactive: ['a'], mcpArgs: ['--mcp', '{mcpUrl}'] };

    expect(harnessConfigSchema.parse({ harnesses: { a: recipe } }).harnesses).toStrictEqual({ a: recipe });
  });

  it('reports MCP arguments without an interactive command at `mcpArgs`', () => {
    const result = harnessConfigSchema.safeParse({ harnesses: { a: { command: ['a'], mcpArgs: ['--mcp'] } } });

    expect(result.error?.issues).toMatchObject([
      { path: ['harnesses', 'a', 'mcpArgs'], message: 'Define `interactive` to use `mcpArgs`' },
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
    ['an empty interactive command', { harnesses: { a: { command: ['a'], interactive: [] } } }],
    ['MCP arguments without an interactive command', { harnesses: { a: { command: ['a'], mcpArgs: ['--mcp'] } } }],
  ])('rejects %s', (_case, config) => {
    expect(harnessConfigSchema.safeParse(config).success).toBe(false);
  });
});

describe(buildHarnessConfigSchema, () => {
  const appConfigSchema = z.object({ promptsDirectory: z.string().min(1).default('prompts') });

  it("parses the app's keys into `app`, applying their defaults", () => {
    const schema = buildHarnessConfigSchema(appConfigSchema);

    expect(schema.parse({ promptsDirectory: 'mine' }).app).toStrictEqual({ promptsDirectory: 'mine' });
    expect(schema.parse({}).app).toStrictEqual({ promptsDirectory: 'prompts' });
  });

  it('reports a key that neither the package nor the app defines', () => {
    const result = buildHarnessConfigSchema(appConfigSchema).safeParse({ promptDirectory: 'mine' });

    expect(result.error?.issues).toMatchObject([{ code: 'unrecognized_keys', keys: ['promptDirectory'] }]);
  });

  it('reports an invalid app value at its key', () => {
    const result = buildHarnessConfigSchema(appConfigSchema).safeParse({ promptsDirectory: '' });

    expect(result.error?.issues).toMatchObject([{ path: ['promptsDirectory'] }]);
  });

  it('reports an invalid app value and an invalid default together', () => {
    const result = buildHarnessConfigSchema(appConfigSchema).safeParse({ promptsDirectory: '', default: 'none' });

    expect(result.error?.issues.map((issue) => issue.path)).toStrictEqual([['promptsDirectory'], ['default']]);
  });

  it('throws for an app key that the package defines', () => {
    expect(() => buildHarnessConfigSchema(z.object({ timeoutMinutes: z.number() }))).toThrow(
      "The app config may not define timeoutMinutes, which the package's config defines.",
    );
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
  it('give every recipe a label, a test command, and an interactive command', () => {
    for (const harness of Object.values(BUILT_IN_HARNESSES)) {
      expect(harness.label).toBeDefined();
      expect(harness.test).toBeDefined();
      expect(harness.interactive).toBeDefined();
    }
  });
});
