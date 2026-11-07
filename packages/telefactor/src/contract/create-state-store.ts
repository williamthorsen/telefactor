import { describeError } from '#src/portable/describe-error.ts';
import { formatIssuePath, type Problem } from '#src/schemas/problem.ts';

import { type Contract, getInputSchema, isActionName } from './define-contract.ts';
import type { ContractImplementation } from './implement-contract.ts';

/** Where a commit came from: `agent` for an MCP tool call, `page` for a route call. */
export type ChangeOrigin = 'agent' | 'page';

/** The action that produced a commit, and where its call came from. */
export interface StateChange {
  action: string;
  origin: ChangeOrigin;
}

/**
 * The session state with the number of commits that produced it, so that a reader can discard an older snapshot, and
 * the change that made the latest commit, absent at version 0.
 */
export interface StateSnapshot {
  version: number;
  state: unknown;
  change?: StateChange;
}

/**
 * How a call to an action ended. Every outcome but `ok` leaves the state unchanged: `invalid-input` and
 * `invalid-state` include the problems that the action's input schema or the state schema found, and `handler-failed`
 * the message of what the handler threw.
 */
export type RunOutcome =
  | { ok: true; snapshot: StateSnapshot }
  | { ok: false; reason: 'unknown-action'; message: string }
  | { ok: false; reason: 'invalid-input'; problems: Problem[] }
  | { ok: false; reason: 'handler-failed'; message: string }
  | { ok: false; reason: 'invalid-state'; problems: Problem[] };

/** The session state of one dev server, which the page's routes and the agent's tools both change. */
export interface StateStore {
  readonly contract: Contract;
  read(): StateSnapshot;
  /** Runs an action after every call already queued, and commits its result only when the state schema accepts it. */
  run(name: string, rawInput: unknown, origin: ChangeOrigin): Promise<RunOutcome>;
  /** Runs an action as `run` does, with input that the action's own schema has already parsed, as an MCP server does. */
  runParsed(name: string, parsedInput: unknown, origin: ChangeOrigin): Promise<RunOutcome>;
  /** Calls the listener with each committed snapshot; returns a function that stops the calls. */
  subscribe(listener: (snapshot: StateSnapshot) => void): () => void;
}

/** Creates the store that holds an implementation's session state, starting from its initial state at version 0. */
export function createStateStore({ contract, initialState, handlers }: ContractImplementation): StateStore {
  let snapshot: StateSnapshot = { version: 0, state: initialState };
  const listeners = new Set<(snapshot: StateSnapshot) => void>();
  let queue: Promise<void> = Promise.resolve();

  async function execute(name: string, input: unknown, isParsed: boolean, origin: ChangeOrigin): Promise<RunOutcome> {
    const action = isActionName(contract, name) ? contract.actions[name] : undefined;
    if (action === undefined) {
      return { ok: false, reason: 'unknown-action', message: `"${name}" does not name an action.` };
    }
    // A schema's output need not satisfy the schema again, as with a transform, so parse each input once.
    let parsedInput = input;
    if (!isParsed) {
      const parsed = getInputSchema(action).safeParse(input);
      if (!parsed.success) return { ok: false, reason: 'invalid-input', problems: toProblems(parsed.error.issues) };
      parsedInput = parsed.data;
    }
    const handler = handlers[name];
    if (handler === undefined) {
      return { ok: false, reason: 'unknown-action', message: `"${name}" does not have a handler.` };
    }
    let next: unknown;
    try {
      next = await handler(snapshot.state, parsedInput);
    } catch (error: unknown) {
      return { ok: false, reason: 'handler-failed', message: describeError(error) };
    }
    const state = contract.state.safeParse(next);
    if (!state.success) return { ok: false, reason: 'invalid-state', problems: toProblems(state.error.issues) };
    snapshot = { version: snapshot.version + 1, state: state.data, change: { action: name, origin } };
    for (const listener of listeners) listener(snapshot);
    return { ok: true, snapshot };
  }

  /** Runs a task after every task already queued. */
  function enqueue(task: () => Promise<RunOutcome>): Promise<RunOutcome> {
    const outcome = runAfter(queue, task);
    queue = settle(outcome);
    return outcome;
  }

  return {
    contract,
    read: () => snapshot,
    run: (name, rawInput, origin) => enqueue(() => execute(name, rawInput, false, origin)),
    runParsed: (name, parsedInput, origin) => enqueue(() => execute(name, parsedInput, true, origin)),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Returns the message that a refused outcome reports: its problems' messages joined by a space, else its message. */
export function describeRefusal(outcome: Exclude<RunOutcome, { ok: true }>): string {
  return 'problems' in outcome ? outcome.problems.map((problem) => problem.message).join(' ') : outcome.message;
}

// region | Helpers
/** Runs a task once the previous one has settled. */
async function runAfter<T>(previous: Promise<void>, task: () => Promise<T>): Promise<T> {
  await previous;
  return task();
}

/** Resolves once a task settles, so that a rejection, such as from a listener that throws, does not stop the queue. */
async function settle(task: Promise<unknown>): Promise<void> {
  try {
    await task;
  } catch {
    // The caller of `run` receives the rejection.
  }
}

function toProblems(issues: ReadonlyArray<{ path: readonly PropertyKey[]; message: string }>): Problem[] {
  return issues.map((issue) => ({ path: formatIssuePath(issue.path), message: `${issue.message}.` }));
}
// endregion | Helpers
