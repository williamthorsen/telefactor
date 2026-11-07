import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineJob, type JobDeclaration } from '#src/contract/define-job.ts';
import type { HarnessSettingsResult } from '#src/harness/read-settings.ts';
import { BUILT_IN_SETTINGS } from '#src/harness/settings-schema.ts';
import type { CancelOutcome, JobHarness, Jobs } from '#src/jobs/create-jobs.ts';
import type { Job } from '#src/jobs/job-schemas.ts';

import { createTelefactorApp } from '../create-app.ts';
import { harnessListSchema } from '../route-schemas.ts';

const RUNNING: Job = { id: 'job-1', harness: 'claude-code', status: 'running' };
const SETTINGS: HarnessSettingsResult = {
  ok: true,
  source: 'built-in',
  configPath: '/app/telefactor.config.json',
  hasConfigFile: false,
  settings: BUILT_IN_SETTINGS,
};

describe(createTelefactorApp, () => {
  it('refuses a request that the guard rejects', async () => {
    const { app } = createFixture({ isAllowed: false });

    const response = await app.request('/harnesses');

    expect(response.status).toBe(403);
    expect(await response.json()).toStrictEqual({ error: 'Telefactor accepts only local, same-origin requests.' });
  });

  it('lists the harnesses', async () => {
    const { app } = createFixture();

    const body = harnessListSchema.parse(await (await app.request('/harnesses')).json());

    expect(body).toMatchObject({ source: 'built-in', defaultHarness: 'claude-code', timeoutMinutes: 10 });
    expect('harnesses' in body ? body.harnesses : []).toContainEqual({
      name: 'codex',
      label: 'Codex',
      command: ['codex', 'exec', '-'],
      testable: true,
      interactive: true,
    });
  });

  it('lists the problems of an unusable config file', async () => {
    const problems = [{ path: '', message: 'bad' }];
    const { app } = createFixture({ settings: { ok: false, source: 'file', configPath: '/c', problems } });

    expect(await (await app.request('/harnesses')).json()).toStrictEqual({
      source: 'file',
      configPath: '/c',
      problems,
    });
  });

  it('runs a harness test command', async () => {
    const { app, testRuns } = createFixture();

    const response = await app.request('/harnesses/codex/test', { method: 'POST' });

    expect(await response.json()).toMatchObject({ ok: true });
    expect(testRuns).toStrictEqual([['codex', 'login', 'status']]);
  });

  it('refuses to test an unknown harness or one without a test command', async () => {
    const { app } = createFixture({
      settings: { ...SETTINGS, settings: { ...BUILT_IN_SETTINGS, harnesses: { bare: { command: ['bare'] } } } },
    });

    expect((await app.request('/harnesses/missing/test', { method: 'POST' })).status).toBe(404);
    expect((await app.request('/harnesses/bare/test', { method: 'POST' })).status).toBe(409);
  });

  it('starts a job on the default harness with the configured timeout', async () => {
    const { app, starts } = createFixture();

    const response = await postJob(app, { prompt: 'hi' });

    expect(response.status).toBe(201);
    expect(starts).toStrictEqual([
      { prompt: 'hi', input: {}, harness: { name: 'claude-code', command: ['claude', '-p'], timeoutMs: 600_000 } },
    ]);
  });

  it('starts a job on the named harness', async () => {
    const { app, starts } = createFixture();

    await postJob(app, { prompt: 'hi', harness: 'codex' });

    expect(starts[0]?.harness.name).toBe('codex');
  });

  it.each([
    ['a blank prompt', { prompt: '  ' }, 'prompt'],
    ['an unknown harness', { prompt: 'hi', harness: 'toString' }, 'harness'],
    ['a command in the body', { prompt: 'hi', harness: 1 }, 'harness'],
    ['a field that the job does not take', { prompt: 'hi', command: ['sh'] }, ''],
  ])('refuses %s', async (_case, body, path) => {
    const { app, starts } = createFixture();

    const response = await postJob(app, body);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ problems: [{ path }] });
    expect(starts).toHaveLength(0);
  });

  it("passes the job's own fields as its input, and refuses an invalid one", async () => {
    const job = defineJob({ input: z.object({ name: z.string().max(3) }), result: z.unknown() });
    const { app, starts } = createFixture({ job });

    expect((await postJob(app, { prompt: 'hi', name: 'abc' })).status).toBe(201);
    const refused = await postJob(app, { prompt: 'hi', name: 'abcd' });

    expect(starts.map((start) => start.input)).toStrictEqual([{ name: 'abc' }]);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ problems: [{ path: 'name' }] });
  });

  it("passes a transforming field in its input form, and refuses one that the job's refinement rejects", async () => {
    const input = z
      .object({ count: z.string().transform((value) => value.length) })
      .refine(({ count }) => count < 4, { path: ['count'], message: 'Too long' });
    const { app, starts } = createFixture({ job: defineJob({ input, result: z.unknown() }) });

    expect((await postJob(app, { prompt: 'hi', count: 'abc' })).status).toBe(201);
    const refused = await postJob(app, { prompt: 'hi', count: 'abcd' });

    expect(starts.map((start) => start.input)).toStrictEqual([{ count: 'abc' }]);
    expect(await refused.json()).toMatchObject({ problems: [{ path: 'count', message: 'Too long.' }] });
  });

  it('refuses a body that is not JSON', async () => {
    const { app } = createFixture();

    const textResponse = await app.request('/jobs', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    });
    const invalidResponse = await app.request('/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    expect(textResponse.status).toBe(415);
    expect(invalidResponse.status).toBe(400);
  });

  it('reads a job, or reports it missing', async () => {
    const { app } = createFixture();

    expect(await (await app.request('/jobs/job-1')).json()).toStrictEqual(RUNNING);
    expect((await app.request('/jobs/missing')).status).toBe(404);
  });

  it.each([
    ['cancels a running job', { ok: true, job: { ...RUNNING, status: 'cancelled' } }, 200],
    ['reports a finished job', { ok: false, reason: 'finished' }, 409],
    ['reports a missing job', { ok: false, reason: 'not-found' }, 404],
  ] satisfies [string, CancelOutcome, number][])('%s', async (_case, outcome, status) => {
    const { app } = createFixture({ cancelOutcome: outcome });

    expect((await app.request('/jobs/job-1', { method: 'DELETE' })).status).toBe(status);
  });

  it('answers an unknown route with 404', async () => {
    const { app } = createFixture();

    expect(await (await app.request('/unknown')).json()).toStrictEqual({ error: 'The route does not exist.' });
  });
});

// region | Helpers
/** Creates the app over fake jobs, settings, and test runner, and returns the calls that they record. */
function createFixture({
  isAllowed = true,
  settings = SETTINGS,
  cancelOutcome = { ok: true, job: { ...RUNNING, status: 'cancelled' } },
  job,
}: {
  isAllowed?: boolean;
  settings?: HarnessSettingsResult;
  cancelOutcome?: CancelOutcome;
  job?: JobDeclaration;
} = {}) {
  const starts: { prompt: string; input: unknown; harness: JobHarness }[] = [];
  const testRuns: (readonly string[])[] = [];
  const jobs: Jobs = {
    cancel: () => Promise.resolve(cancelOutcome),
    cancelAll: () => Promise.resolve(),
    get: (id) => Promise.resolve(id === RUNNING.id ? RUNNING : undefined),
    start: ({ prompt, input }, harness) => {
      starts.push({ prompt, input, harness });
      return Promise.resolve(RUNNING);
    },
  };
  const app = createTelefactorApp({
    jobs,
    ...(job !== undefined && { job }),
    readSettings: () => Promise.resolve(settings),
    runTest: (argv) => {
      testRuns.push(argv);
      return Promise.resolve({ ok: true, durationMs: 1, exit: 'exit code 0', output: 'OK' });
    },
    isAllowed: () => isAllowed,
  });
  return { app, starts, testRuns };
}

function postJob(app: ReturnType<typeof createFixture>['app'], body: unknown): Promise<Response> {
  return Promise.resolve(
    app.request('/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}
// endregion | Helpers
