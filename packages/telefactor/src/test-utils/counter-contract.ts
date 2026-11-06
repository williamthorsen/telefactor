import { z } from 'zod';

import { defineContract } from '#src/contract/define-contract.ts';
import { type ContractImplementation, implementContract } from '#src/contract/implement-contract.ts';

/** A contract over a count, with one action that changes it and two that each fail in their own way. */
export const counterContract = defineContract({
  state: z.object({ count: z.number().int() }),
  actions: {
    add: { description: 'Adds an amount to the count.', input: z.object({ amount: z.number().int() }) },
    corrupt: { description: 'Returns a state that the schema rejects.' },
    fail: { description: 'Throws.' },
  },
});

/** Implements the counter contract from a count of 0; `fail` throws `boom`. */
export function implementCounter(): ContractImplementation<typeof counterContract> {
  return implementContract(counterContract, {
    initialState: { count: 0 },
    handlers: {
      add: (state, { amount }) => ({ count: state.count + amount }),
      corrupt: (state) => ({ count: state.count + 0.5 }),
      fail: () => {
        throw new Error('boom');
      },
    },
  });
}
