import { useCallback, useEffect, useRef, useState } from 'react';

import type { ContractClient, ContractSnapshot } from '#src/client/create-contract-client.ts';
import type { StateChange } from '#src/contract/create-state-store.ts';
import type { ActionInput, ActionName, Contract, ContractState } from '#src/contract/define-contract.ts';

/** The text that describes an agent's commit, with the commit's version, which tells two identical texts apart. */
export interface Announcement {
  version: number;
  text: string;
}

export interface AgentSessionOptions<C extends Contract> {
  /** Words a change that the agent made, given the state that it committed; the default names the action. */
  describeChange?: ((change: StateChange, state: ContractState<C>) => string) | undefined;
}

/** The session state that a page shares with the agent, the call that changes it, and what the agent last changed. */
export interface AgentSession<C extends Contract> {
  /** The latest state, `undefined` until the first snapshot arrives. */
  state: ContractState<C> | undefined;
  version: number | undefined;
  /** Runs an action and resolves whether it committed; a refusal sets `error` rather than rejecting. */
  call: <K extends ActionName<C>>(name: K, input: ActionInput<C, K>) => Promise<boolean>;
  /** The latest refused call or dropped stream; the next committed call clears a refusal, and the next snapshot a drop. */
  error: unknown;
  /**
   * The latest commit made by the agent since the hook subscribed. Render its text in a child keyed by its `version`,
   * inside a `role="status"` region that is always rendered, so that each commit replaces the announced node.
   */
  announcement: Announcement | undefined;
}

/**
 * Subscribes to the session state that `client` serves and returns it with a typed `call`. A snapshot no newer than
 * the last one received is ignored, and only a commit received after the first snapshot is announced.
 */
export function useAgentSession<C extends Contract>(
  client: ContractClient<C>,
  { describeChange }: AgentSessionOptions<C> = {},
): AgentSession<C> {
  const [snapshot, setSnapshot] = useState<ContractSnapshot<C>>();
  const [failure, setFailure] = useState<{ source: 'call' | 'stream'; error: unknown }>();
  const [announcement, setAnnouncement] = useState<Announcement>();
  const describeChangeRef = useRef(describeChange);

  // Read the latest function at each commit, so that an inline `describeChange` does not resubscribe.
  useEffect(() => {
    describeChangeRef.current = describeChange;
  });

  useEffect(() => {
    let lastVersion: number | undefined;
    return client.subscribe(
      (next) => {
        // A snapshot shows that the stream recovered, not that a refused call succeeded.
        setFailure((current) => (current?.source === 'stream' ? undefined : current));
        if (lastVersion !== undefined && next.version <= lastVersion) return;
        const isBaseline = lastVersion === undefined;
        lastVersion = next.version;
        setSnapshot(next);
        if (isBaseline || next.change?.origin !== 'agent') return;
        const describe = describeChangeRef.current ?? describeDefaultChange;
        setAnnouncement({ version: next.version, text: describe(next.change, next.state) });
      },
      { onError: (error) => setFailure({ source: 'stream', error }) },
    );
  }, [client]);

  const call = useCallback(
    async function callAction<K extends ActionName<C>>(name: K, input: ActionInput<C, K>): Promise<boolean> {
      try {
        // The stream delivers the committed snapshot in order with the agent's commits.
        await client.call(name, input);
        setFailure((current) => (current?.source === 'call' ? undefined : current));
        return true;
      } catch (error: unknown) {
        setFailure({ source: 'call', error });
        return false;
      }
    },
    [client],
  );

  return { state: snapshot?.state, version: snapshot?.version, call, error: failure?.error, announcement };
}

// region | Helpers
function describeDefaultChange(change: StateChange): string {
  return `The agent ran ${change.action}.`;
}
// endregion | Helpers
