import type { ContractClient, ContractSnapshot } from '#src/client/create-contract-client.ts';
import type { counterContract } from '#src/test-utils/counter-contract.ts';

type CounterSnapshot = ContractSnapshot<typeof counterContract>;

interface Subscriber {
  listener: (snapshot: CounterSnapshot) => void;
  onError?: (error: unknown) => void;
}

/**
 * Creates a counter client whose `call` resolves with the current snapshot unless the overrides replace it. `push`
 * delivers a snapshot to every subscriber, and `fail` reports an error to each, as the stream does on a drop.
 */
export function createFakeCounterClient(
  overrides: Partial<ContractClient<typeof counterContract>> = {},
): FakeCounterClient {
  const subscribers = new Set<Subscriber>();
  let current: CounterSnapshot = { version: 0, state: { count: 0 } };
  const client: ContractClient<typeof counterContract> = {
    call: () => Promise.resolve(current),
    getState: () => Promise.resolve(current),
    subscribe(listener, { onError } = {}) {
      const subscriber = onError === undefined ? { listener } : { listener, onError };
      subscribers.add(subscriber);
      listener(current);
      return () => {
        subscribers.delete(subscriber);
      };
    },
    ...overrides,
  };
  return {
    client,
    push(snapshot) {
      current = snapshot;
      for (const { listener } of subscribers) listener(snapshot);
    },
    fail(error) {
      for (const { onError } of subscribers) onError?.(error);
    },
    countSubscribers: () => subscribers.size,
  };
}

export interface FakeCounterClient {
  client: ContractClient<typeof counterContract>;
  push: (snapshot: CounterSnapshot) => void;
  fail: (error: unknown) => void;
  countSubscribers: () => number;
}
