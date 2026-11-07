import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { defineJob } from '#src/contract/define-job.ts';
import { readHarnessSettings } from '#src/harness/read-settings.ts';
import { implementJob } from '#src/jobs/implement-job.ts';
import { buildJobSchema } from '#src/jobs/job-schemas.ts';

import { telefactor } from '../telefactor.ts';

const COMMAND_VARIABLE = 'APP_HARNESS_COMMAND';
const APP_CONFIG_SCHEMA = z.object({ promptsDirectory: z.string().default('prompts') });
const NOTE_JOB = defineJob({ input: z.object({ name: z.string() }), result: z.object({ text: z.string() }) });

// The environment harness copies the prompt file to the output file.
const COPY_COMMAND = [
  process.execPath,
  '--eval',
  "const fs = require('node:fs'); fs.writeFileSync(process.argv[2], fs.readFileSync(process.argv[1], 'utf8'))",
  '{prompt}',
  '{output}',
];

const state: { root: string; server: ViteDevServer | undefined; origin: string } = {
  root: '',
  server: undefined,
  origin: '',
};

beforeAll(async () => {
  vi.stubEnv(COMMAND_VARIABLE, JSON.stringify(COPY_COMMAND));
  state.root = await mkdtemp(path.join(tmpdir(), 'telefactor-job-'));
  const job = implementJob(NOTE_JOB, {
    async prepare({ id, prompt, input }) {
      const promptPath = path.join(state.root, `${id}-${input.name}.md`);
      const outputPath = path.join(state.root, `${id}-${input.name}.out`);
      await writeFile(promptPath, prompt);
      return {
        placeholders: { prompt: promptPath, output: outputPath },
        stdin: '',
        read: async () => ({ text: await readFile(outputPath, 'utf8') }),
      };
    },
  });
  const server = await createServer({
    root: state.root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: true },
    plugins: [telefactor({ commandVariable: COMMAND_VARIABLE, config: APP_CONFIG_SCHEMA, job })],
  });
  await server.listen();
  state.server = server;
  const address = server.httpServer?.address();
  if (address === null || address === undefined || typeof address === 'string')
    throw new Error('Expected a TCP address.');
  state.origin = `http://127.0.0.1:${(address satisfies AddressInfo).port}`;
});

afterAll(async () => {
  await state.server?.close();
  vi.unstubAllEnvs();
  await rm(state.root, { recursive: true, force: true });
});

describe('telefactor with an app job', () => {
  it("runs the app's job through the harness that the app's variable names", async () => {
    const jobSchema = buildJobSchema(NOTE_JOB.result);
    const started = await fetch(`${state.origin}/api/telefactor/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello from the page', name: 'note' }),
    });
    expect(started.status).toBe(201);
    const job = jobSchema.parse(await started.json());

    await expect
      .poll(async () => jobSchema.parse(await (await fetch(`${state.origin}/api/telefactor/jobs/${job.id}`)).json()), {
        timeout: 5000,
      })
      .toMatchObject({ status: 'done', result: { text: 'hello from the page' } });
  });

  it("accepts the app's config key and reports a misspelt one", async () => {
    const configPath = path.join(state.root, 'telefactor.config.json');
    await writeFile(configPath, JSON.stringify({ promptsDirectory: 'mine' }));
    const accepted = await fetch(`${state.origin}/api/telefactor/harnesses`);
    const settings = await readHarnessSettings({ env: {}, configPath, config: APP_CONFIG_SCHEMA });
    await writeFile(configPath, JSON.stringify({ promptDirectory: 'mine' }));
    const refused = await fetch(`${state.origin}/api/telefactor/harnesses`);
    await rm(configPath);

    expect(await accepted.json()).toMatchObject({ source: 'environment' });
    expect(settings).toMatchObject({ ok: true, settings: { app: { promptsDirectory: 'mine' } } });
    expect(await refused.json()).toMatchObject({ problems: [{ message: expect.stringContaining('promptDirectory') }] });
  });
});

describe(telefactor, () => {
  it('throws when created with an app config key that the package defines', () => {
    expect(() => telefactor({ config: z.object({ harnesses: z.string() }) })).toThrow('may not define harnesses');
  });
});
