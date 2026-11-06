import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { counterContract } from '#src/test-utils/counter-contract.ts';

import { createContractClient, RECONNECT_DELAY_MS } from '../create-contract-client.ts';
import { TelefactorRequestError } from '../telefactor-request-error.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe(createContractClient, () => {
  it('calls an action with a JSON body under the base path and parses the snapshot', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const client = createContractClient(counterContract, {
      basePath: '/custom',
      fetch: (input, init) => {
        calls.push({ url: input instanceof Request ? input.url : input.toString(), init });
        return Promise.resolve(Response.json({ version: 1, state: { count: 2 } }));
      },
    });

    const snapshot = await client.call('add', { amount: 2 });

    expect(snapshot).toStrictEqual({ version: 1, state: { count: 2 } });
    expectTypeOf(snapshot.state).toEqualTypeOf<{ count: number }>();
    expect(calls).toMatchObject([{ url: '/custom/actions/add', init: { method: 'POST', body: '{"amount":2}' } }]);
  });

  it('reads the state', async () => {
    const client = createContractClient(counterContract, {
      fetch: () => Promise.resolve(Response.json({ version: 0, state: { count: 0 } })),
    });

    expect(await client.getState()).toStrictEqual({ version: 0, state: { count: 0 } });
  });

  it('rejects a state that the contract does not describe', async () => {
    const client = createContractClient(counterContract, {
      fetch: () => Promise.resolve(Response.json({ version: 0, state: { count: 'x' } })),
    });

    await expect(client.getState()).rejects.toThrow();
  });

  it('throws a request error with the problems of a refused action', async () => {
    const problems = [{ path: 'amount', message: 'Expected an integer.' }];
    const client = createContractClient(counterContract, {
      fetch: () => Promise.resolve(Response.json({ problems }, { status: 400 })),
    });

    await expect(client.call('add', { amount: 1 })).rejects.toStrictEqual(
      new TelefactorRequestError(400, 'Expected an integer.', problems),
    );
  });

  it('delivers each state event, across chunk boundaries', async () => {
    const stream = createEventStream();
    const client = createContractClient(counterContract, { fetch: () => Promise.resolve(stream.response) });
    const listener = vi.fn();

    const unsubscribe = client.subscribe(listener);
    stream.push('event: state\ndata: {"version":0,"state":{"count":0}}\n\nevent: st');
    stream.push('ate\ndata: {"version":1,"state":{"count":1}}\n\n');

    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(listener).toHaveBeenLastCalledWith({ version: 1, state: { count: 1 } });
    unsubscribe();
  });

  it('reports a dropped stream and reconnects after the delay', async () => {
    vi.useFakeTimers();
    const streams = [createEventStream(), createEventStream()];
    const fetchFunction = vi.fn(() =>
      Promise.resolve(streams[fetchFunction.mock.calls.length - 1]?.response ?? Response.error()),
    );
    const client = createContractClient(counterContract, { fetch: fetchFunction });
    const onError = vi.fn();

    const unsubscribe = client.subscribe(vi.fn(), { onError });
    streams[0]?.end();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS);

    expect(fetchFunction).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('aborts the stream and cancels a pending reconnect when unsubscribed', async () => {
    vi.useFakeTimers();
    const stream = createEventStream();
    let signal: AbortSignal | undefined;
    const fetchFunction = vi.fn((_: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return Promise.resolve(stream.response);
    });
    const client = createContractClient(counterContract, { fetch: fetchFunction });
    const onError = vi.fn();

    const unsubscribe = client.subscribe(vi.fn(), { onError });
    stream.end();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    unsubscribe();
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS);

    expect(signal?.aborted).toBe(true);
    expect(fetchFunction).toHaveBeenCalledOnce();
  });
});

// region | Helpers
/** Creates a `text/event-stream` response whose chunks the test pushes and whose end the test decides. */
function createEventStream() {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(started) {
      controller = started;
    },
  });
  const encoder = new TextEncoder();
  return {
    response: new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
    push: (text: string) => controller?.enqueue(encoder.encode(text)),
    end: () => controller?.close(),
  };
}
// endregion | Helpers
