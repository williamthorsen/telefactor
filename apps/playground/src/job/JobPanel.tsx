import type { Job, TelefactorClient } from '@williamthorsen/telefactor/client';
import { type ReactElement, type SyntheticEvent, useEffect, useState } from 'react';

import { RequestError } from '#src/requests/RequestError.tsx';

/** The interval at which a running job is polled when the props name none. */
export const DEFAULT_POLL_INTERVAL_MS = 1000;

/** The prompt form and the state of the last job, which it polls while the job runs. */
export function JobPanel({ client, harness, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS }: JobPanelProps): ReactElement {
  const [prompt, setPrompt] = useState('');
  const [job, setJob] = useState<Job>();
  const [error, setError] = useState<unknown>();
  const [isStarting, setIsStarting] = useState(false);
  const isRunning = job?.status === 'running' && error === undefined;

  useEffect(() => {
    if (job?.status !== 'running' || error !== undefined) return;
    // A response that arrives after the job has changed, such as after a cancel, is stale.
    let isCurrent = true;
    async function poll(id: string): Promise<void> {
      try {
        const polled = await client.getJob(id);
        if (isCurrent) setJob(polled);
      } catch (pollError: unknown) {
        if (isCurrent) setError(pollError);
      }
    }
    const timer = setTimeout(() => void poll(job.id), pollIntervalMs);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [client, error, job, pollIntervalMs]);

  async function startJob(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    setIsStarting(true);
    setError(undefined);
    try {
      setJob(await client.startJob({ prompt, harness }));
    } catch (startError: unknown) {
      setError(startError);
    } finally {
      setIsStarting(false);
    }
  }

  async function cancelJob(id: string): Promise<void> {
    try {
      setJob(await client.cancelJob(id));
    } catch (cancelError: unknown) {
      setError(cancelError);
    }
  }

  return (
    <form className="stack" onSubmit={(event) => void startJob(event)}>
      <label htmlFor="prompt">Prompt</label>
      <textarea id="prompt" rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
      <div className="row">
        <button type="submit" disabled={harness === undefined || prompt.trim() === '' || isRunning || isStarting}>
          Run
        </button>
        {isRunning && (
          <button type="button" onClick={() => void cancelJob(job.id)}>
            Cancel
          </button>
        )}
      </div>
      <p className="secondary" role="status">
        {describeStatus(job)}
      </p>
      {job?.status === 'done' && <pre>{job.result?.output}</pre>}
      {job?.status === 'failed' && <pre>{job.error}</pre>}
      {error !== undefined && <RequestError error={error} />}
    </form>
  );
}

export interface JobPanelProps {
  client: TelefactorClient;
  /** The harness that runs the job; the form cannot start one while it is `undefined`. */
  harness: string | undefined;
  pollIntervalMs?: number;
}

// region | Helpers
function describeStatus(job: Job | undefined): string {
  if (job === undefined) return 'No job yet.';
  switch (job.status) {
    case 'cancelled':
      return `Cancelled on ${job.harness}.`;
    case 'done':
      return `Done on ${job.harness}.`;
    case 'failed':
      return `Failed on ${job.harness}.`;
    case 'running':
      return `Running on ${job.harness}…`;
  }
}
// endregion | Helpers
