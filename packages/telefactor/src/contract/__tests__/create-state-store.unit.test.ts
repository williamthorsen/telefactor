import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createStateStore, describeRefusal } from '../create-state-store.ts';
import { defineContract } from '../define-contract.ts';
import { implementContract } from '../implement-contract.ts';

const contract = defineContract({
  state: z.object({ log: z.array(z.string()) }),
  actions: {
    append: { description: 'Appends an entry.', input: z.object({ entry: z.string().min(1) }) },
    corrupt: { description: 'Returns a state that the schema rejects.' },
    fail: { description: 'Throws.' },
  },
});

describe(createStateStore, () => {
  it('starts at version 0 with the initial state', () => {
    expect(createFixture().store.read()).toStrictEqual({ version: 0, state: { log: [] } });
  });

  it('commits concurrent async calls in call order and notifies subscribers', async () => {
    const { store, hold } = createFixture();
    const listener = vi.fn();
    store.subscribe(listener);
    const release = hold('slow');

    const pending = Promise.all([
      store.run('append', { entry: 'slow' }, 'page'),
      store.run('append', { entry: 'fast' }, 'page'),
    ]);
    await flushPromises();

    expect(store.read().version).toBe(0);
    expect(listener).not.toHaveBeenCalled();

    release();
    const [slow, fast] = await pending;

    const change = { action: 'append', origin: 'page' };
    expect(slow).toStrictEqual({ ok: true, snapshot: { version: 1, state: { log: ['slow'] }, change } });
    expect(fast).toStrictEqual({ ok: true, snapshot: { version: 2, state: { log: ['slow', 'fast'] }, change } });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops notifying a listener after it unsubscribes', async () => {
    const { store } = createFixture();
    const listener = vi.fn();
    store.subscribe(listener)();

    await store.run('append', { entry: 'a' }, 'page');

    expect(listener).not.toHaveBeenCalled();
  });

  it('records the origin that the caller names', async () => {
    const { store } = createFixture();

    await store.runParsed('append', { entry: 'a' }, 'agent');

    expect(store.read().change).toStrictEqual({ action: 'append', origin: 'agent' });
  });

  it.each([
    ['an unknown action', 'missing', {}, { ok: false, reason: 'unknown-action' }],
    ['an inherited property', 'toString', {}, { ok: false, reason: 'unknown-action' }],
    [
      'invalid input',
      'append',
      { entry: '' },
      { ok: false, reason: 'invalid-input', problems: [{ path: 'entry', message: expect.any(String) }] },
    ],
    ['a handler that throws', 'fail', {}, { ok: false, reason: 'handler-failed', message: 'boom' }],
    [
      'a handler that returns an invalid state',
      'corrupt',
      {},
      { ok: false, reason: 'invalid-state', problems: [{ path: 'log', message: expect.any(String) }] },
    ],
  ])('refuses %s and leaves the state unchanged', async (_, name, input, expected) => {
    const { store } = createFixture();
    const listener = vi.fn();
    store.subscribe(listener);

    expect(await store.run(name, input, 'page')).toMatchObject(expected);
    expect(store.read()).toStrictEqual({ version: 0, state: { log: [] } });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createStateStore with a transforming input schema', () => {
  const transforming = defineContract({
    state: z.object({ count: z.number() }),
    actions: { set: { description: 'Sets the count.', input: z.object({ count: z.string().transform(Number) }) } },
  });
  const implementation = implementContract(transforming, {
    initialState: { count: 0 },
    handlers: { set: (_, { count }) => ({ count }) },
  });

  it('parses raw input with the schema', async () => {
    expect(await createStateStore(implementation).run('set', { count: '3' }, 'page')).toMatchObject({
      ok: true,
      snapshot: { state: { count: 3 } },
    });
  });

  it('passes input that is already parsed to the handler unparsed', async () => {
    expect(await createStateStore(implementation).runParsed('set', { count: 3 }, 'agent')).toMatchObject({
      ok: true,
      snapshot: { state: { count: 3 } },
    });
  });
});

describe(implementContract, () => {
  it('throws for an initial state that the schema rejects', () => {
    expect(() =>
      implementContract(contract, {
        // @ts-expect-error -- The test passes a state that the schema rejects.
        initialState: { log: 'not an array' },
        handlers: createHandlers(),
      }),
    ).toThrow("The initial state does not match the contract's state schema");
  });
});

describe(describeRefusal, () => {
  it('joins problem messages with a space', () => {
    const problems = [
      { path: 'a', message: 'First.' },
      { path: 'b', message: 'Second.' },
    ];

    expect(describeRefusal({ ok: false, reason: 'invalid-input', problems })).toBe('First. Second.');
  });

  it('returns the message of an outcome without problems', () => {
    expect(describeRefusal({ ok: false, reason: 'handler-failed', message: 'boom' })).toBe('boom');
  });
});

// region | Helpers
/** Creates a store whose `append` handler waits for each entry that `hold` names until its release is called. */
function createFixture() {
  const gates = new Map<string, Promise<undefined>>();
  return {
    hold: (entry: string) => {
      const { promise, resolve } = Promise.withResolvers<undefined>();
      gates.set(entry, promise);
      return () => {
        resolve(undefined);
      };
    },
    store: createStateStore(
      implementContract(contract, { initialState: { log: [] }, handlers: createHandlers(gates) }),
    ),
  };
}

/** Creates the contract's handlers; `append` first awaits the gate registered for its entry, if any. */
function createHandlers(gates: ReadonlyMap<string, Promise<undefined>> = new Map()) {
  return {
    append: async (state: { log: string[] }, { entry }: { entry: string }) => {
      await gates.get(entry);
      return { log: [...state.log, entry] };
    },
    // @ts-expect-error -- The handler returns a state that the schema rejects.
    corrupt: (): { log: string[] } => ({ log: 'not an array' }),
    fail: () => {
      throw new Error('boom');
    },
  };
}

/** Resolves after every pending microtask has run. */
async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
}
// endregion | Helpers
