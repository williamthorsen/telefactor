// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TelefactorRequestError } from '#src/client/telefactor-request-error.ts';
import type { StateChange } from '#src/contract/create-state-store.ts';

import { createFakeCounterClient } from '../test-utils/create-fake-counter-client.ts';
import { useAgentSession } from '../useAgentSession.ts';

const AGENT_ADD: StateChange = { action: 'add', origin: 'agent' };

afterEach(cleanup);

describe(useAgentSession, () => {
  it('returns the first snapshot without announcing it', () => {
    const { client } = createFakeCounterClient();

    const { result } = renderHook(() => useAgentSession(client));

    expect(result.current.state).toStrictEqual({ count: 0 });
    expect(result.current.version).toBe(0);
    expect(result.current.announcement).toBeUndefined();
  });

  it('does not announce an agent commit that is already current when it mounts', () => {
    const fake = createFakeCounterClient();
    fake.push({ version: 3, state: { count: 3 }, change: AGENT_ADD });

    const { result } = renderHook(() => useAgentSession(fake.client));

    expect(result.current.version).toBe(3);
    expect(result.current.announcement).toBeUndefined();
  });

  it('announces a later agent commit by its action', () => {
    const fake = createFakeCounterClient();
    const { result } = renderHook(() => useAgentSession(fake.client));

    act(() => fake.push({ version: 1, state: { count: 2 }, change: AGENT_ADD }));

    expect(result.current.state).toStrictEqual({ count: 2 });
    expect(result.current.announcement).toStrictEqual({ version: 1, text: 'The agent ran add.' });
  });

  it('words an agent commit with describeChange and the committed state', () => {
    const fake = createFakeCounterClient();
    const { result } = renderHook(() =>
      useAgentSession(fake.client, { describeChange: (change, state) => `${change.action} to ${state.count}` }),
    );

    act(() => fake.push({ version: 1, state: { count: 2 }, change: AGENT_ADD }));

    expect(result.current.announcement).toStrictEqual({ version: 1, text: 'add to 2' });
  });

  it('applies a page commit without announcing it', () => {
    const fake = createFakeCounterClient();
    const { result } = renderHook(() => useAgentSession(fake.client));

    act(() => fake.push({ version: 1, state: { count: 1 }, change: { action: 'add', origin: 'page' } }));

    expect(result.current.state).toStrictEqual({ count: 1 });
    expect(result.current.announcement).toBeUndefined();
  });

  it('announces two identical agent commits under distinct versions', () => {
    const fake = createFakeCounterClient();
    const { result } = renderHook(() => useAgentSession(fake.client));

    act(() => fake.push({ version: 1, state: { count: 1 }, change: AGENT_ADD }));
    const first = result.current.announcement;
    act(() => fake.push({ version: 2, state: { count: 2 }, change: AGENT_ADD }));

    expect(first).toStrictEqual({ version: 1, text: 'The agent ran add.' });
    expect(result.current.announcement).toStrictEqual({ version: 2, text: 'The agent ran add.' });
  });

  it('ignores a snapshot no newer than the last one received', () => {
    const fake = createFakeCounterClient();
    const { result } = renderHook(() => useAgentSession(fake.client));
    act(() => fake.push({ version: 2, state: { count: 2 }, change: AGENT_ADD }));

    act(() => fake.push({ version: 2, state: { count: 2 }, change: AGENT_ADD }));
    act(() => fake.push({ version: 1, state: { count: 1 }, change: AGENT_ADD }));

    expect(result.current.state).toStrictEqual({ count: 2 });
    expect(result.current.announcement).toStrictEqual({ version: 2, text: 'The agent ran add.' });
  });

  it('resolves true for a committed call and false for a refused one, which sets the error', async () => {
    const refusal = new TelefactorRequestError(422, 'boom');
    let shouldRefuse = true;
    const fake = createFakeCounterClient({
      call: () => (shouldRefuse ? Promise.reject(refusal) : Promise.resolve({ version: 1, state: { count: 1 } })),
    });
    const { result } = renderHook(() => useAgentSession(fake.client));

    let committed: boolean | undefined;
    await act(async () => {
      committed = await result.current.call('add', { amount: 1 });
    });
    expect(committed).toBe(false);
    expect(result.current.error).toBe(refusal);

    shouldRefuse = false;
    await act(async () => {
      committed = await result.current.call('add', { amount: 1 });
    });
    expect(committed).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it('keeps a stream error after a committed call and clears it with the next snapshot, even a repeated one', async () => {
    const fake = createFakeCounterClient();
    const { result } = renderHook(() => useAgentSession(fake.client));
    const drop = new Error('The state stream ended.');

    act(() => fake.fail(drop));
    await act(async () => {
      await result.current.call('add', { amount: 1 });
    });
    expect(result.current.error).toBe(drop);

    act(() => fake.push({ version: 0, state: { count: 0 } }));
    expect(result.current.error).toBeUndefined();
  });

  it('keeps the identity of call across renders', () => {
    const fake = createFakeCounterClient();
    const { result, rerender } = renderHook(() => useAgentSession(fake.client));
    const { call } = result.current;

    rerender();

    expect(result.current.call).toBe(call);
  });

  it('unsubscribes when it unmounts', () => {
    const fake = createFakeCounterClient();
    const { unmount } = renderHook(() => useAgentSession(fake.client));

    unmount();

    expect(fake.countSubscribers()).toBe(0);
  });
});
