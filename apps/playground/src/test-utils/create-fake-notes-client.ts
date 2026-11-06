import type { ContractClient, ContractSnapshot } from '@williamthorsen/telefactor/client';

import type { notesContract } from '#src/notes/notes-contract.ts';

/**
 * Creates a notes client whose `call` resolves with the current snapshot unless the overrides replace it, and whose
 * `push` delivers a snapshot to every subscriber, as the server's stream does.
 */
export function createFakeNotesClient(overrides: Partial<ContractClient<typeof notesContract>> = {}): FakeNotesClient {
  const listeners = new Set<(snapshot: ContractSnapshot<typeof notesContract>) => void>();
  let current: ContractSnapshot<typeof notesContract> = { version: 0, state: { notes: [] } };
  const client: ContractClient<typeof notesContract> = {
    call: () => Promise.resolve(current),
    getState: () => Promise.resolve(current),
    subscribe(listener) {
      listeners.add(listener);
      listener(current);
      return () => {
        listeners.delete(listener);
      };
    },
    ...overrides,
  };
  function push(snapshot: ContractSnapshot<typeof notesContract>): void {
    current = snapshot;
    for (const listener of listeners) listener(snapshot);
  }
  return { client, push };
}

export interface FakeNotesClient {
  client: ContractClient<typeof notesContract>;
  push: (snapshot: ContractSnapshot<typeof notesContract>) => void;
}
