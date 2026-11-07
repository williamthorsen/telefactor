import type { JobDeclaration, JobResult, ParsedJobInput } from '#src/contract/define-job.ts';

/** How a job ended, as its run learns it once the command has ended. A timed-out job's status is `failed`. */
export type JobOutcome = 'cancelled' | 'done' | 'failed' | 'timed-out';

/** What a run knows about its job when it prepares. */
export interface JobRunContext<I> {
  id: string;
  /** The name of the harness that runs the job. */
  harness: string;
  prompt: string;
  input: I;
}

/** One prepared run: the values of the argv placeholders, the stdin, and how the result is read and the run undone. */
export interface PreparedRun<R> {
  placeholders: Readonly<Record<string, string>>;
  stdin: string;
  /** Reads the result once the command has exited with code 0; a rejection fails the job with its message. */
  read(run: { stdout: string; stderrTail: string }): Promise<R>;
  /**
   * Releases what `prepare` set up. Called once, after the command has ended or after an abort that lands before the
   * command starts. A rejection fails a job that would otherwise be `done`, and is ignored after any other outcome.
   */
  release?(outcome: JobOutcome): Promise<void>;
}

/** A job's server side: how each run is prepared. */
export interface JobImplementation<J extends JobDeclaration = JobDeclaration> {
  readonly declaration: J;
  /**
   * Prepares one run, before the command starts. A rejection fails the job, and `prepare` undoes its own partial work
   * before rejecting, because `release` is not called.
   */
  prepare(context: JobRunContext<ParsedJobInput<J>>, signal: AbortSignal): Promise<PreparedRun<JobResult<J>>>;
}

/** Implements a declared job on the server, for the plugin's `job` option. */
export function implementJob<J extends JobDeclaration>(
  declaration: J,
  { prepare }: Pick<JobImplementation<J>, 'prepare'>,
): JobImplementation<J> {
  return { declaration, prepare };
}
