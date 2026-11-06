import { z } from 'zod';

/** The MCP tool reserved for reading the state, which no action may shadow. */
export const GET_STATE_TOOL_NAME = 'get_state';

// The characters and length that MCP allows in a tool name.
const ACTION_NAME_PATTERN = /^[\w.-]{1,128}$/;

const EMPTY_INPUT_SCHEMA = z.object({});

/** An action that the page and the agent can call: what it does, and the object that it takes. */
export interface ActionDefinition {
  description: string;
  /** The action's input; an action that omits it takes an empty object. */
  input?: z.ZodObject;
}

export type ActionDefinitions = Record<string, ActionDefinition>;

/** The state schema and the actions that a page and an agent share. */
export interface Contract<S extends z.ZodType = z.ZodType, A extends ActionDefinitions = ActionDefinitions> {
  readonly actions: A;
  readonly state: S;
}

/** The state that a contract describes, as its schema parses it. */
export type ContractState<C extends Contract> = z.output<C['state']>;

/** The names of a contract's actions. */
export type ActionName<C extends Contract> = keyof C['actions'] & string;

/** The input schema of one action, the empty object schema when the action omits one. */
export type ActionInputSchema<D extends ActionDefinition> = D['input'] extends z.ZodObject
  ? D['input']
  : typeof EMPTY_INPUT_SCHEMA;

/** The input that a caller sends to an action, before its schema parses it. */
export type ActionInput<C extends Contract, K extends ActionName<C>> = z.input<ActionInputSchema<C['actions'][K]>>;

/** The input that an action's handler receives, after its schema parses it. */
export type ParsedActionInput<C extends Contract, K extends ActionName<C>> = z.output<
  ActionInputSchema<C['actions'][K]>
>;

/**
 * Defines the state and the actions that a page and an agent share. It imports only `zod`, so that the page and the
 * server can both import the contract. Throws for an action name that MCP does not accept as a tool name, and for
 * `get_state`, which names the tool that reads the state.
 */
export function defineContract<S extends z.ZodType, A extends ActionDefinitions>(contract: {
  actions: A;
  state: S;
}): Contract<S, A> {
  for (const name of Object.keys(contract.actions)) {
    if (!ACTION_NAME_PATTERN.test(name)) {
      throw new Error(
        `The action name "${name}" must be 1 to 128 letters, digits, underscores, hyphens, or dots, as MCP requires.`,
      );
    }
    if (name === GET_STATE_TOOL_NAME) {
      throw new Error(`The action name "${GET_STATE_TOOL_NAME}" is reserved for the tool that reads the state.`);
    }
  }
  return contract;
}

/** Returns an action's input schema, the empty object schema when the action omits one. */
export function getInputSchema(action: ActionDefinition): z.ZodObject {
  return action.input ?? EMPTY_INPUT_SCHEMA;
}

/** Reports whether a name is one of the contract's own actions, excluding inherited properties such as `toString`. */
export function isActionName<C extends Contract>(contract: C, name: string): name is ActionName<C> {
  return Object.hasOwn(contract.actions, name);
}
