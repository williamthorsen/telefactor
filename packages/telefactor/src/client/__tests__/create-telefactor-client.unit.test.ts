import { describe, expect, it } from 'vitest';

import { createTelefactorClient } from '../create-telefactor-client.ts';
import { TelefactorRequestError } from '../telefactor-request-error.ts';

const JOB = { id: 'a/b', harness: 'codex', status: 'running' };
const SESSION = { id: 'a/b', harness: 'codex' };

describe(createTelefactorClient, () => {
  it('starts a job with a JSON body under the base path', async () => {
    const { client, calls } = createFixture(201, JOB, '/custom');

    expect(await client.startJob({ prompt: 'hi', harness: 'codex' })).toStrictEqual(JOB);
    expect(calls).toStrictEqual([
      {
        url: '/custom/jobs',
        method: 'POST',
        contentType: 'application/json',
        body: '{"prompt":"hi","harness":"codex"}',
      },
    ]);
  });

  it.each([
    [
      'getJob',
      (client: ReturnType<typeof createFixture>['client']) => client.getJob('a/b'),
      '/api/telefactor/jobs/a%2Fb',
      'GET',
    ],
    [
      'cancelJob',
      (client: ReturnType<typeof createFixture>['client']) => client.cancelJob('a/b'),
      '/api/telefactor/jobs/a%2Fb',
      'DELETE',
    ],
  ])('%s calls the job route', async (_name, call, url, method) => {
    const { client, calls } = createFixture(200, JOB);

    await call(client);

    expect(calls[0]).toMatchObject({ url, method });
  });

  it('lists and tests harnesses', async () => {
    const list = createFixture(200, { source: 'file', configPath: '/c', problems: [] });
    const test = createFixture(200, { ok: true, durationMs: 5, exit: 'exit code 0', output: 'OK' });

    expect(await list.client.listHarnesses()).toMatchObject({ source: 'file' });
    expect(await test.client.testHarness('rovo-dev')).toMatchObject({ ok: true });
    expect(test.calls[0]).toMatchObject({ url: '/api/telefactor/harnesses/rovo-dev/test', method: 'POST' });
  });

  it('throws the problems of a 400', async () => {
    const problems = [{ path: 'prompt', message: 'Enter a prompt.' }];
    const { client } = createFixture(400, { problems });

    const error = await captureError(() => client.startJob({ prompt: '' }));

    expect(error).toBeInstanceOf(TelefactorRequestError);
    expect(error).toMatchObject({ status: 400, message: 'Enter a prompt.', problems });
  });

  it('throws the message of another error status', async () => {
    const { client } = createFixture(409, { error: 'The job has already finished.' });

    await expect(client.cancelJob('x')).rejects.toMatchObject({
      status: 409,
      message: 'The job has already finished.',
    });
  });

  it('throws a request error for a response that is not JSON', async () => {
    const client = createTelefactorClient({
      fetch: () => Promise.resolve(new Response('<!doctype html>', { status: 200 })),
    });

    await expect(client.getJob('x')).rejects.toMatchObject({
      name: 'TelefactorRequestError',
      status: 200,
      message: 'The response from /api/telefactor/jobs/x is not JSON.',
    });
  });

  it('rejects a response that does not match the schema', async () => {
    const { client } = createFixture(200, { id: 1 });

    await expect(client.getJob('x')).rejects.toThrow();
  });
  it('starts a terminal session with a JSON body', async () => {
    const { client, calls } = createFixture(201, SESSION);

    expect(await client.createTerminalSession({ harness: 'codex' })).toStrictEqual(SESSION);
    expect(calls).toStrictEqual([
      {
        url: '/api/telefactor/terminal/sessions',
        method: 'POST',
        contentType: 'application/json',
        body: '{"harness":"codex"}',
      },
    ]);
  });

  it('ends a terminal session', async () => {
    const { client, calls } = createFixture(200, SESSION);

    expect(await client.closeTerminalSession('a/b')).toStrictEqual(SESSION);
    expect(calls).toMatchObject([{ url: '/api/telefactor/terminal/sessions/a%2Fb', method: 'DELETE' }]);
  });

  it.each([
    ['http:', 'ws://localhost:5176/custom/terminal/sessions/a%2Fb/socket'],
    ['https:', 'wss://localhost:5176/custom/terminal/sessions/a%2Fb/socket'],
  ])('builds the socket URL of a session on an %s page', (protocol, url) => {
    const client = createTelefactorClient({ basePath: '/custom', location: { protocol, host: 'localhost:5176' } });

    expect(client.terminalSocketUrl('a/b')).toBe(url);
  });

  it('refuses to build a socket URL outside a page', () => {
    expect(() => createTelefactorClient().terminalSocketUrl('a')).toThrow(/needs the page location/);
  });

  it('exposes its base path', () => {
    expect(createTelefactorClient({ basePath: '/custom' }).basePath).toBe('/custom');
  });
});

// region | Helpers
/** Creates a client over a fake `fetch` that answers every call with the given status and body. */
function createFixture(status: number, body: unknown, basePath?: string) {
  const calls: { url: string; method: string; contentType: string | undefined; body: unknown }[] = [];
  const client = createTelefactorClient({
    ...(basePath !== undefined && { basePath }),
    fetch: (input, init = {}) => {
      const headers = new Headers(init.headers);
      calls.push({
        url: describeInput(input),
        method: init.method ?? 'GET',
        contentType: headers.get('content-type') ?? undefined,
        body: init.body,
      });
      return Promise.resolve(Response.json(body, { status }));
    },
  });
  return { client, calls };
}
function describeInput(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

async function captureError(call: () => Promise<unknown>): Promise<unknown> {
  try {
    await call();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to reject.');
}
// endregion | Helpers
