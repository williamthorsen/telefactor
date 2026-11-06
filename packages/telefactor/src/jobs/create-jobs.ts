import { describeError } from '#src/portable/describe-error.ts';

import type { Job } from './job-schemas.ts';

/** The harness that runs a job, and the time after which the job is stopped and reported as failed. */
export interface JobHarness {
  name: string;
  command: readonly string[];
  timeoutMs: number;
}

/** One run of a harness command. */
export interface JobRunInput {
  harness: string;
  argv: readonly string[];
  stdin: string;
}

/** Runs a harness command and returns its output; rejects on failure, and stops and rejects once `signal` aborts. */
export type JobRun = (input: JobRunInput, signal: AbortSignal) => Promise<{ output: string }>;

/** Holds job state. */
export interface JobStore {
  get(id: string): Promise<Job | undefined>;
  put(job: Job): Promise<void>;
}

export type CancelOutcome = { ok: true; job: Job } | { ok: false; reason: 'finished' | 'not-found' };

/** Starts, reads, and cancels headless jobs. */
export interface Jobs {
  cancel(id: string): Promise<CancelOutcome>;
  /** Cancels every running job. */
  cancelAll(): Promise<void>;
  get(id: string): Promise<Job | undefined>;
  start(request: { prompt: string }, harness: JobHarness): Promise<Job>;
}

/**
 * Creates the job service. A job runs until its run settles, it is cancelled, or its timeout elapses; whichever comes
 * first decides the job's final state, and a later outcome is ignored. Cancel and timeout record the final state at
 * once and abort the run, without waiting for its processes to end.
 */
export function createJobs({ run, store }: { run: JobRun; store: JobStore }): Jobs {
  type Outcome = Pick<Job, 'error' | 'result' | 'status'>;
  const runs = new Map<string, { controller: AbortController; timer: ReturnType<typeof setTimeout> }>();

  /** Records a running job's final state unless another outcome already did; returns the recorded job. */
  async function finish(id: string, outcome: Outcome, abortReason?: DOMException): Promise<Job | undefined> {
    const active = runs.get(id);
    if (active === undefined) return undefined;
    runs.delete(id);
    clearTimeout(active.timer);
    if (abortReason !== undefined) active.controller.abort(abortReason);

    const job = await store.get(id);
    if (job === undefined) return undefined;
    const finished = { ...job, ...outcome };
    await store.put(finished);
    return finished;
  }

  async function execute(id: string, input: JobRunInput, signal: AbortSignal): Promise<void> {
    let outcome: Outcome;
    try {
      outcome = { status: 'done', result: await run(input, signal) };
    } catch (error) {
      outcome = { status: 'failed', error: describeError(error) };
    }
    await finish(id, outcome);
  }

  async function cancel(id: string): Promise<CancelOutcome> {
    const job = await store.get(id);
    if (job === undefined) return { ok: false, reason: 'not-found' };
    const cancelled = await finish(
      id,
      { status: 'cancelled' },
      new DOMException('The job was cancelled.', 'AbortError'),
    );
    return cancelled === undefined ? { ok: false, reason: 'finished' } : { ok: true, job: cancelled };
  }

  return {
    cancel,

    async cancelAll() {
      await Promise.all(runs.keys().map((id) => cancel(id)));
    },

    get(id) {
      return store.get(id);
    },

    async start({ prompt }, { name, command, timeoutMs }) {
      const job: Job = { id: crypto.randomUUID(), harness: name, status: 'running' };
      await store.put(job);

      const controller = new AbortController();
      const timer = setTimeout(() => {
        const message = `The harness ${name} did not finish within ${describeDuration(timeoutMs)} and was stopped.`;
        void finish(job.id, { status: 'failed', error: message }, new DOMException(message, 'TimeoutError'));
      }, timeoutMs);
      runs.set(job.id, { controller, timer });

      void execute(job.id, { harness: name, argv: expandArgv(command, prompt), stdin: prompt }, controller.signal);
      return job;
    },
  };
}

/** Replaces every `{prompt}` in each argument with the prompt text. */
export function expandArgv(command: readonly string[], prompt: string): string[] {
  // A replacer function keeps `$` sequences in the prompt literal.
  return command.map((argument) => argument.replaceAll('{prompt}', () => prompt));
}

// region | Helpers
/** Describes a duration in whole minutes when it is one, else in seconds. */
function describeDuration(milliseconds: number): string {
  if (milliseconds % 60_000 === 0) {
    const minutes = milliseconds / 60_000;
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  const seconds = Math.round(milliseconds / 1000);
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
}
// endregion | Helpers
