import { describeError } from '#src/portable/describe-error.ts';

import type { Job } from './job-schemas.ts';

/** The harness that runs a job, and the time after which the job is stopped and reported as failed. */
export interface JobHarness {
  name: string;
  command: readonly string[];
  timeoutMs: number;
}

/** One run of a job: the harness's command before expansion, the prompt, and the request's other fields. */
export interface JobRunInput {
  id: string;
  harness: string;
  command: readonly string[];
  prompt: string;
  input: Readonly<Record<string, unknown>>;
}

/** Runs a job and returns its result; rejects on failure, and stops and rejects once `signal` aborts. */
export type JobRun = (input: JobRunInput, signal: AbortSignal) => Promise<unknown>;

/** Holds job state. */
export interface JobStore {
  get(id: string): Promise<Job<unknown> | undefined>;
  put(job: Job<unknown>): Promise<void>;
}

export type CancelOutcome = { ok: true; job: Job<unknown> } | { ok: false; reason: 'finished' | 'not-found' };

/** Starts, reads, and cancels headless jobs. */
export interface Jobs {
  cancel(id: string): Promise<CancelOutcome>;
  /** Cancels every running job. */
  cancelAll(): Promise<void>;
  get(id: string): Promise<Job<unknown> | undefined>;
  /** Starts a job; `input` holds the request's fields beyond `prompt` and `harness`, and defaults to none. */
  start(
    request: { prompt: string; input?: Readonly<Record<string, unknown>> },
    harness: JobHarness,
  ): Promise<Job<unknown>>;
}

/**
 * Creates the job service. A job runs until its run settles, it is cancelled, or its timeout elapses; whichever comes
 * first decides the job's final state, and a later outcome is ignored. Cancel and timeout record the final state at
 * once and abort the run, without waiting for its processes to end.
 */
export function createJobs({ run, store }: { run: JobRun; store: JobStore }): Jobs {
  type Outcome = Pick<Job<unknown>, 'error' | 'result' | 'status'>;
  const runs = new Map<string, { controller: AbortController; timer: ReturnType<typeof setTimeout> }>();

  /** Records a running job's final state unless another outcome already did; returns the recorded job. */
  async function finish(id: string, outcome: Outcome, abortReason?: DOMException): Promise<Job<unknown> | undefined> {
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

    async start({ prompt, input = {} }, { name, command, timeoutMs }) {
      const job: Job<unknown> = { id: crypto.randomUUID(), harness: name, status: 'running' };
      await store.put(job);

      const controller = new AbortController();
      const timer = setTimeout(() => {
        const message = `The harness ${name} did not finish within ${describeDuration(timeoutMs)} and was stopped.`;
        void finish(job.id, { status: 'failed', error: message }, new DOMException(message, 'TimeoutError'));
      }, timeoutMs);
      runs.set(job.id, { controller, timer });

      void execute(job.id, { id: job.id, harness: name, command, prompt, input }, controller.signal);
      return job;
    },
  };
}

/**
 * Replaces each `{name}` in each argument whose `name` is a key of `values` with its value, in one pass, so that a value
 * is never expanded again. Any other `{…}` stays literal.
 */
export function expandArgv(command: readonly string[], values: Readonly<Record<string, string>>): string[] {
  return command.map((argument) =>
    argument.replaceAll(PLACEHOLDER_PATTERN, (placeholder, name: string) =>
      Object.hasOwn(values, name) ? (values[name] ?? placeholder) : placeholder,
    ),
  );
}

// region | Helpers
const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

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
