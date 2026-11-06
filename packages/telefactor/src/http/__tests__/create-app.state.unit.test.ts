import { describe, expect, it } from 'vitest';

import { createStateStore } from '#src/contract/create-state-store.ts';
import type { Jobs } from '#src/jobs/create-jobs.ts';
import { counterContract, implementCounter } from '#src/test-utils/counter-contract.ts';

import { createTelefactorApp } from '../create-app.ts';
import { stateSnapshotSchema } from '../route-schemas.ts';

const snapshotSchema = stateSnapshotSchema(counterContract.state);

describe('createTelefactorApp with a store', () => {
  it('serves the current snapshot', async () => {
    const { app } = createFixture();

    expect(await (await app.request('/state')).json()).toStrictEqual({ version: 0, state: { count: 0 } });
  });

  it('runs an action and returns the new snapshot', async () => {
    const { app, store } = createFixture();

    const response = await postAction(app, 'add', { amount: 2 });

    expect(response.status).toBe(200);
    expect(snapshotSchema.parse(await response.json())).toStrictEqual({ version: 1, state: { count: 2 } });
    expect(store.read().version).toBe(1);
  });

  it.each([
    ['an unknown action', 'missing', { amount: 1 }, 404, { error: '"missing" does not name an action.' }],
    ['invalid input', 'add', { amount: 'x' }, 400, { problems: [{ path: 'amount', message: expect.any(String) }] }],
    ['a handler that throws', 'fail', {}, 422, { error: 'boom' }],
    ['an invalid result', 'corrupt', {}, 500, { problems: [{ path: 'count', message: expect.any(String) }] }],
  ])('refuses %s', async (_, name, body, status, expected) => {
    const { app, store } = createFixture();

    const response = await postAction(app, name, body);

    expect(response.status).toBe(status);
    expect(await response.json()).toStrictEqual(expected);
    expect(store.read().version).toBe(0);
  });

  it('refuses a body that is not sent as JSON', async () => {
    const { app } = createFixture();

    const response = await app.request('/actions/add', { method: 'POST', body: '{"amount":1}' });

    expect(response.status).toBe(415);
  });

  it('refuses a body that is not valid JSON', async () => {
    const { app } = createFixture();

    const response = await app.request('/actions/add', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    expect(response.status).toBe(400);
  });

  it('pushes the current snapshot on connect, then each commit', async () => {
    const { app } = createFixture();
    const controller = new AbortController();
    const response = await app.request('/state/events', { signal: controller.signal });
    const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
    if (reader === undefined) throw new Error('Expected a response body.');

    const first = await readUntil(reader, '\n\n');
    await postAction(app, 'add', { amount: 3 });
    const second = await readUntil(reader, '\n\n');
    controller.abort();

    expect(first).toBe('event: state\ndata: {"version":0,"state":{"count":0}}\n\n');
    expect(second).toBe('event: state\ndata: {"version":1,"state":{"count":3}}\n\n');
  });

  it('refuses a state request that the guard rejects', async () => {
    const { app } = createFixture({ isAllowed: false });

    expect((await app.request('/state')).status).toBe(403);
  });
});

describe('createTelefactorApp without a store', () => {
  it('does not serve the state routes', async () => {
    const app = createTelefactorApp({ ...createBaseOptions(), isAllowed: () => true });

    expect((await app.request('/state')).status).toBe(404);
  });
});

// region | Helpers
function createBaseOptions() {
  const jobs: Jobs = {
    cancel: () => Promise.reject(new Error('unused')),
    cancelAll: () => Promise.resolve(),
    get: () => Promise.resolve(undefined),
    start: () => Promise.reject(new Error('unused')),
  };
  return {
    jobs,
    readSettings: () => Promise.reject(new Error('unused')),
    runTest: () => Promise.reject(new Error('unused')),
  };
}

function createFixture({ isAllowed = true }: { isAllowed?: boolean } = {}) {
  const store = createStateStore(implementCounter());
  const app = createTelefactorApp({ ...createBaseOptions(), isAllowed: () => isAllowed, store });
  return { app, store };
}

function postAction(app: ReturnType<typeof createFixture>['app'], name: string, body: unknown): Promise<Response> {
  return Promise.resolve(
    app.request(`/actions/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

/** Reads chunks until the text read so far ends with the delimiter, and returns that text. */
async function readUntil(reader: ReadableStreamDefaultReader<string>, delimiter: string): Promise<string> {
  let text = '';
  while (!text.endsWith(delimiter)) {
    const { done, value } = await reader.read();
    if (done) throw new Error(`The stream ended before ${JSON.stringify(delimiter)}: ${JSON.stringify(text)}`);
    text += value;
  }
  return text;
}
// endregion | Helpers
