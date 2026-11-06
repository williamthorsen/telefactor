import type { ActionName, Contract, ContractState, ParsedActionInput } from './define-contract.ts';

/** Computes the next state from the current state and an action's parsed input; may use Node APIs. */
export type ActionHandler<C extends Contract, K extends ActionName<C>> = (
  state: ContractState<C>,
  input: ParsedActionInput<C, K>,
) => ContractState<C> | Promise<ContractState<C>>;

/** One handler for each of a contract's actions. */
export type ActionHandlers<C extends Contract> = { [K in ActionName<C>]: ActionHandler<C, K> };

// A method's parameters are checked bivariantly, so every typed handler is assignable to this type. The store calls a
// handler only with input parsed by that action's own schema and with a state parsed by the contract's state schema.
type ErasedHandler = { call(state: unknown, input: unknown): unknown }['call'];

/** A contract paired with its initial state and its handlers, as the plugin's `contract` option takes it. */
export interface ContractImplementation<C extends Contract = Contract> {
  readonly contract: C;
  readonly initialState: ContractState<C>;
  readonly handlers: Readonly<Record<string, ErasedHandler>>;
}

/**
 * Pairs a contract with the state that a session starts from and one handler per action. Throws when the initial state
 * does not match the contract's state schema, so that the dev server stops at start rather than serving it.
 */
export function implementContract<C extends Contract>(
  contract: C,
  { initialState, handlers }: { initialState: ContractState<C>; handlers: ActionHandlers<C> },
): ContractImplementation<C> {
  const parsed = contract.state.safeParse(initialState);
  if (!parsed.success) {
    throw new Error(`The initial state does not match the contract's state schema: ${parsed.error.message}`);
  }
  const erasedHandlers: Record<string, ErasedHandler> = handlers;
  return { contract, initialState, handlers: erasedHandlers };
}
