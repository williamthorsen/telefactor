import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { type ActionInput, defineContract, getInputSchema, isActionName } from '../define-contract.ts';

const contract = defineContract({
  state: z.object({ count: z.number() }),
  actions: {
    add: { description: 'Adds to the count.', input: z.object({ amount: z.number().default(1) }) },
    reset: { description: 'Resets the count.' },
  },
});

describe(defineContract, () => {
  it('returns the contract that it is given', () => {
    expect(Object.keys(contract.actions)).toStrictEqual(['add', 'reset']);
  });

  it('types each action input from its schema, and an omitted input as an empty object', () => {
    expectTypeOf<ActionInput<typeof contract, 'add'>>().toEqualTypeOf<{ amount?: number | undefined }>();
    expectTypeOf<ActionInput<typeof contract, 'reset'>>().toEqualTypeOf<Record<string, never>>();
  });

  it.each(['', 'has space', 'a'.repeat(129), 'slash/name'])('rejects the action name %j', (name) => {
    expect(() => defineContract({ state: z.object({}), actions: { [name]: { description: 'x' } } })).toThrow(
      `The action name "${name}" must be`,
    );
  });

  it('rejects the reserved name get_state', () => {
    expect(() => defineContract({ state: z.object({}), actions: { get_state: { description: 'x' } } })).toThrow(
      'reserved',
    );
  });
});

describe(getInputSchema, () => {
  it('substitutes an empty object schema for an omitted input', () => {
    expect(getInputSchema(contract.actions.reset).parse({})).toStrictEqual({});
  });
});

describe(isActionName, () => {
  it('accepts an own action and rejects an inherited property', () => {
    expect(isActionName(contract, 'add')).toBe(true);
    expect(isActionName(contract, 'toString')).toBe(false);
  });
});
