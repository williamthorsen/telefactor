import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';
import { z } from 'zod';

import { HARNESS_COMMAND_VARIABLE, readEnvironmentCommand, readHarnessSettings } from '../read-settings.ts';
import { BUILT_IN_SETTINGS } from '../settings-schema.ts';

const APP_BUILT_IN = {
  default: 'convert',
  harnesses: { convert: { command: ['claude', '-p'] }, review: { command: ['codex'] } },
};

describe(readHarnessSettings, () => {
  it('returns the built-in settings when there is no file and no variable', async () => {
    const { configPath } = await createConfigPath();
    expect(await readHarnessSettings({ env: {}, configPath })).toStrictEqual({
      ok: true,
      source: 'built-in',
      configPath,
      hasConfigFile: false,
      settings: BUILT_IN_SETTINGS,
    });
  });

  it("returns the app's built-in harnesses when there is no file and no variable", async () => {
    const { configPath } = await createConfigPath();

    expect(await readHarnessSettings({ env: {}, configPath, builtIn: APP_BUILT_IN })).toStrictEqual({
      ok: true,
      source: 'built-in',
      configPath,
      hasConfigFile: false,
      settings: { ...APP_BUILT_IN, timeoutMinutes: 10, app: {} },
    });
  });

  it("replaces the app's built-in harnesses with the file's", async () => {
    const { configPath } = await createConfigPath();
    await writeFile(configPath, JSON.stringify({ harnesses: { mine: { command: ['mine'] } } }));

    expect(await readHarnessSettings({ env: {}, configPath, builtIn: APP_BUILT_IN })).toMatchObject({
      source: 'file',
      settings: { default: 'mine', harnesses: { mine: { command: ['mine'] } } },
    });
  });

  it("replaces the app's built-in harnesses with the variable", async () => {
    const { configPath } = await createConfigPath();
    const env = { [HARNESS_COMMAND_VARIABLE]: '["my-agent"]' };

    expect(await readHarnessSettings({ env, configPath, builtIn: APP_BUILT_IN })).toMatchObject({
      source: 'environment',
      settings: { default: 'environment', harnesses: { environment: { command: ['my-agent'] } } },
    });
  });

  it("returns the app's values beside the app's built-in harnesses", async () => {
    const { configPath } = await createConfigPath();
    const config = z.object({ promptsDirectory: z.string().default('prompts') });

    expect(await readHarnessSettings({ env: {}, configPath, builtIn: APP_BUILT_IN, config })).toMatchObject({
      source: 'built-in',
      settings: { default: 'convert', app: { promptsDirectory: 'prompts' } },
    });
  });

  it('throws for invalid built-in harnesses', async () => {
    const { configPath } = await createConfigPath();

    expect(() => readHarnessSettings({ env: {}, configPath, builtIn: { harnesses: {} } })).toThrow(
      'The built-in harnesses are invalid',
    );
  });

  it('reads harnesses from the file', async () => {
    const { configPath } = await createConfigPath();
    await writeFile(configPath, JSON.stringify({ harnesses: { mine: { command: ['mine'] } } }));

    expect(await readHarnessSettings({ env: {}, configPath })).toMatchObject({
      ok: true,
      source: 'file',
      hasConfigFile: true,
      settings: { default: 'mine' },
    });
  });

  it('reports a file without harnesses as built-in', async () => {
    const { configPath } = await createConfigPath();
    await writeFile(configPath, JSON.stringify({ timeoutMinutes: 3 }));

    expect(await readHarnessSettings({ env: {}, configPath })).toMatchObject({
      source: 'built-in',
      hasConfigFile: true,
      settings: { timeoutMinutes: 3 },
    });
  });

  it('replaces the harnesses with the variable and keeps the file timeout', async () => {
    const { configPath } = await createConfigPath();
    await writeFile(configPath, JSON.stringify({ timeoutMinutes: 3 }));
    const env = { [HARNESS_COMMAND_VARIABLE]: '["my-agent", "{prompt}"]' };

    expect(await readHarnessSettings({ env, configPath })).toMatchObject({
      source: 'environment',
      settings: {
        default: 'environment',
        timeoutMinutes: 3,
        harnesses: { environment: { command: ['my-agent', '{prompt}'] } },
      },
    });
  });

  it('reads the harness from the variable that the options name', async () => {
    const { configPath } = await createConfigPath();
    const env = { [HARNESS_COMMAND_VARIABLE]: '["ignored"]', MY_APP_COMMAND: '["my-agent"]' };

    expect(await readHarnessSettings({ env, configPath, commandVariable: 'MY_APP_COMMAND' })).toMatchObject({
      source: 'environment',
      settings: { harnesses: { environment: { command: ['my-agent'] } } },
    });
  });

  it("returns the app's values from the file", async () => {
    const { configPath } = await createConfigPath();
    await writeFile(configPath, JSON.stringify({ promptsDirectory: 'mine' }));

    const result = await readHarnessSettings({ env: {}, configPath, config: APP_CONFIG_SCHEMA });

    expect(result).toMatchObject({ ok: true, source: 'built-in', settings: { app: { promptsDirectory: 'mine' } } });
  });

  it("applies the app's defaults when there is no file", async () => {
    const { configPath } = await createConfigPath();
    const result = await readHarnessSettings({ env: {}, configPath, config: APP_CONFIG_SCHEMA });

    expect(result).toMatchObject({
      ok: true,
      hasConfigFile: false,
      settings: { app: { promptsDirectory: 'prompts' } },
    });
  });

  it('reports a required app key when there is no file', async () => {
    const { configPath } = await createConfigPath();
    const result = await readHarnessSettings({ env: {}, configPath, config: z.object({ name: z.string() }) });

    expect(result).toMatchObject({ ok: false, problems: [{ path: 'name' }] });
    expect(result.ok ? '' : result.problems[0]?.message).toContain('which does not exist');
  });

  it('reports invalid JSON', async () => {
    const { configPath } = await createConfigPath();
    await writeFile(configPath, '{');

    const result = await readHarnessSettings({ env: {}, configPath });

    expect(result).toMatchObject({ ok: false, source: 'file', problems: [{ path: '' }] });
    expect(result.ok ? '' : result.problems[0]?.message).toContain('is not valid JSON');
  });

  it('reports schema issues with their path and the file', async () => {
    const { configPath } = await createConfigPath();
    await writeFile(configPath, JSON.stringify({ harnesses: { a: { command: [] } } }));

    const result = await readHarnessSettings({ env: {}, configPath });

    expect(result).toMatchObject({ ok: false, problems: [{ path: 'harnesses.a.command' }] });
    expect(result.ok ? '' : result.problems[0]?.message).toContain(configPath);
  });

  it('reports a file that cannot be read', async () => {
    const { directory } = await createConfigPath();
    const result = await readHarnessSettings({ env: {}, configPath: directory });

    expect(result.ok ? '' : result.problems[0]?.message).toContain('could not be read');
  });
});

describe(readEnvironmentCommand, () => {
  it.each([[undefined], [''], ['  ']])('treats %j as unset', (value) => {
    expect(readEnvironmentCommand({ [HARNESS_COMMAND_VARIABLE]: value })).toBeUndefined();
  });

  it.each([['not json'], ['[]'], ['"claude"'], ['[1]']])('throws on %s', (value) => {
    expect(() => readEnvironmentCommand({ [HARNESS_COMMAND_VARIABLE]: value })).toThrow(HARNESS_COMMAND_VARIABLE);
  });

  it('reads and names the variable that it is given', () => {
    expect(readEnvironmentCommand({ MY_APP_COMMAND: '["my-agent"]' }, 'MY_APP_COMMAND')).toStrictEqual(['my-agent']);
    expect(() => readEnvironmentCommand({ MY_APP_COMMAND: '[]' }, 'MY_APP_COMMAND')).toThrow(/^MY_APP_COMMAND must/);
  });
});

// region | Helpers
const APP_CONFIG_SCHEMA = z.object({ promptsDirectory: z.string().default('prompts') });

/** Creates a temporary directory, removed after the test, and returns it with a config path inside it. */
async function createConfigPath(): Promise<{ directory: string; configPath: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), 'telefactor-settings-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  return { directory, configPath: path.join(directory, 'telefactor.config.json') };
}
// endregion | Helpers
