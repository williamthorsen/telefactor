import type { Job, TelefactorClient } from '@williamthorsen/telefactor/client';
import { type ReactElement, type SyntheticEvent, useEffect, useRef, useState } from 'react';

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
  const cancelButton = useRef<HTMLButtonElement>(null);
  const runButton = useRef<HTMLButtonElement>(null);
  const promptField = useRef<HTMLTextAreaElement>(null);
  const shouldRestoreFocus = useRef(false);
  // A settled cancel stops the poll at once; the effect's cleanup would run only after React commits.
  const stopPolling = useRef<() => void>(undefined);
  // Counts the jobs started; a cancel that settles after a later start belongs to a job no longer shown.
  const startCount = useRef(0);

  // Cancel unmounts when the job stops running; keep keyboard focus in the form.
  useEffect(() => {
    if (isRunning || !shouldRestoreFocus.current) return;
    shouldRestoreFocus.current = false;
    const target = runButton.current?.disabled === false ? runButton.current : promptField.current;
    target?.focus();
  }, [isRunning]);

  useEffect(() => {
    if (job?.status !== 'running' || error !== undefined) return;
    // A response that arrives after the job has changed, such as after a cancel, is stale.
    let isCurrent = true;
    async function poll(id: string): Promise<void> {
      try {
        const polled = await client.getJob(id);
        if (!isCurrent) return;
        if (polled.status !== 'running') noteCancelFocus();
        setJob(polled);
      } catch (pollError: unknown) {
        if (!isCurrent) return;
        noteCancelFocus();
        setError(pollError);
      }
    }
    const timer = setTimeout(() => void poll(job.id), pollIntervalMs);
    function stop(): void {
      isCurrent = false;
      clearTimeout(timer);
    }
    stopPolling.current = stop;
    return stop;
  }, [client, error, job, pollIntervalMs]);

  /** Records whether Cancel has focus, ahead of a state change that unmounts it. */
  function noteCancelFocus(): void {
    shouldRestoreFocus.current = document.activeElement === cancelButton.current;
  }

  async function startJob(event: SyntheticEvent): Promise<void> {
    event.preventDefault();
    if (isRunning || isStarting) return;
    startCount.current += 1;
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
    const startCountAtCancel = startCount.current;
    try {
      const cancelled = await client.cancelJob(id);
      if (startCount.current !== startCountAtCancel) return;
      stopPolling.current?.();
      noteCancelFocus();
      setJob(cancelled);
    } catch (cancelError: unknown) {
      if (startCount.current !== startCountAtCancel) return;
      stopPolling.current?.();
      noteCancelFocus();
      setError(cancelError);
    }
  }

  return (
    <form className="stack" onSubmit={(event) => void startJob(event)}>
      <label htmlFor="prompt">Prompt</label>
      <textarea
        id="prompt"
        ref={promptField}
        rows={4}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />
      <div className="row">
        <button
          type="submit"
          ref={runButton}
          disabled={harness === undefined || prompt.trim() === ''}
          aria-disabled={isRunning || isStarting}
        >
          Run
        </button>
        {isRunning && (
          <button type="button" ref={cancelButton} onClick={() => void cancelJob(job.id)}>
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
