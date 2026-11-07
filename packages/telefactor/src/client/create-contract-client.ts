import { z } from 'zod';

import type { StateChange } from '#src/contract/create-state-store.ts';
import type {
  ActionDefinitions,
  ActionInput,
  ActionName,
  Contract,
  ContractState,
} from '#src/contract/define-contract.ts';
import { stateSnapshotSchema } from '#src/http/route-schemas.ts';

import { requestJson } from './request-json.ts';
import { TelefactorRequestError } from './telefactor-request-error.ts';

/** The delay after which a dropped state stream reconnects. */
export const RECONNECT_DELAY_MS = 1000;

/**
 * The session state with the number of commits that produced it, which orders snapshots read from different calls, and
 * the change that made the latest commit, absent at version 0.
 */
export interface ContractSnapshot<C extends Contract> {
  version: number;
  state: ContractState<C>;
  change?: StateChange;
}

/** Reads and changes the session state that the plugin serves for one contract. */
export interface ContractClient<C extends Contract> {
  /** Runs an action and returns the snapshot that it committed; throws `TelefactorRequestError` when it is refused. */
  call<K extends ActionName<C>>(name: K, input: ActionInput<C, K>): Promise<ContractSnapshot<C>>;
  getState(): Promise<ContractSnapshot<C>>;
  /**
   * Calls the listener with the current snapshot, then with each commit, reconnecting after a dropped stream and
   * reporting each drop to `onError`. Returns a function that ends the subscription.
   */
  subscribe(
    listener: (snapshot: ContractSnapshot<C>) => void,
    options?: { onError?: (error: unknown) => void },
  ): () => void;
}

/** Creates a client for a contract's routes under `basePath`, which must match the plugin's; defaults to `/api/telefactor`. */
export function createContractClient<S extends z.ZodType, A extends ActionDefinitions>(
  contract: Contract<S, A>,
  { basePath = '/api/telefactor', fetch: fetchFunction = fetch }: { basePath?: string; fetch?: typeof fetch } = {},
): ContractClient<Contract<S, A>> {
  // Parse the state with the contract's own schema, whose output type follows from the contract.
  const envelopeSchema = stateSnapshotSchema(z.unknown());

  function parseSnapshot(value: unknown): ContractSnapshot<Contract<S, A>> {
    const { version, state, change } = envelopeSchema.parse(value);
    const parsedState = z.parse(contract.state, state);
    return change === undefined ? { version, state: parsedState } : { version, state: parsedState, change };
  }

  return {
    async call(name, input) {
      return parseSnapshot(
        await requestJson(fetchFunction, envelopeSchema, `${basePath}/actions/${encodeURIComponent(name)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        }),
      );
    },
    async getState() {
      return parseSnapshot(await requestJson(fetchFunction, envelopeSchema, `${basePath}/state`));
    },
    subscribe(listener, { onError } = {}) {
      const controller = new AbortController();
      let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

      async function connect(): Promise<void> {
        try {
          await readEvents(fetchFunction, `${basePath}/state/events`, controller.signal, (data) => {
            listener(parseSnapshot(JSON.parse(data)));
          });
          if (controller.signal.aborted) return;
          onError?.(new TelefactorRequestError(0, 'The state stream ended.'));
        } catch (error: unknown) {
          if (controller.signal.aborted) return;
          onError?.(error);
        }
        reconnectTimer = setTimeout(() => void connect(), RECONNECT_DELAY_MS);
      }

      void connect();
      return () => {
        controller.abort();
        clearTimeout(reconnectTimer);
      };
    },
  };
}

// region | Helpers
/** Reads a server-sent event stream until it ends, calling `onData` with the data of each `state` event. */
async function readEvents(
  fetchFunction: typeof fetch,
  url: string,
  signal: AbortSignal,
  onData: (data: string) => void,
): Promise<void> {
  const response = await fetchFunction(url, { signal, headers: { accept: 'text/event-stream' } });
  if (!response.ok || response.body === null) {
    throw new TelefactorRequestError(response.status, `The state stream at ${url} failed with ${response.status}.`);
  }
  const chunks = response.body.pipeThrough(new TextDecoderStream());
  let buffered = '';
  for await (const chunk of chunks) {
    buffered += chunk;
    let boundary = buffered.indexOf('\n\n');
    while (boundary !== -1) {
      const event = parseEvent(buffered.slice(0, boundary));
      buffered = buffered.slice(boundary + 2);
      if (event.name === 'state') onData(event.data);
      boundary = buffered.indexOf('\n\n');
    }
  }
}

/** Parses one event block into its name and its data lines joined by newlines. */
function parseEvent(block: string): { name: string; data: string } {
  let name = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) name = line.slice('event:'.length).trim();
    else if (line.startsWith('data:')) data.push(line.slice('data:'.length).replace(/^ /, ''));
  }
  return { name, data: data.join('\n') };
}
// endregion | Helpers
