import { type CommandRun, describeExit, runCommand } from '#src/process/run-command.ts';
import { formatIssuePath } from '#src/schemas/problem.ts';

import { expandArgv, type JobRun } from './create-jobs.ts';
import type { JobImplementation, JobOutcome, PreparedRun } from './implement-job.ts';
import { promptJobImplementation } from './prompt-job-implementation.ts';

/** The most stdout that a job keeps; a run that writes more fails. */
export const MAX_OUTPUT_BYTES = 1024 * 1024;

/**
 * Creates the job run that prepares a job, executes the harness command in the working directory with the job's
 * placeholders expanded, and returns the result that the job reads, once its schema accepts it. The job's `release` runs once
 * the command has ended. `job` defaults to the built-in prompt job.
 */
export function createHarnessRun({
  workingDirectory,
  job = promptJobImplementation,
  maxStdoutBytes = MAX_OUTPUT_BYTES,
}: {
  workingDirectory: string;
  job?: JobImplementation;
  maxStdoutBytes?: number;
}): JobRun {
  return async ({ id, harness, command, prompt, input }, signal) => {
    signal.throwIfAborted();
    const prepared = await job.prepare({ id, harness, prompt, input: job.declaration.input.parse(input) }, signal);

    let result: unknown;
    try {
      const run = await runCommand({
        argv: expandArgv(command, prepared.placeholders),
        cwd: workingDirectory,
        stdin: prepared.stdin,
        signal,
        maxStdoutBytes,
      });
      const failure = describeRunFailure(harness, run, maxStdoutBytes);
      if (failure !== undefined) throw new Error(failure);
      result = checkResult(job, await prepared.read({ stdout: run.stdout, stderrTail: run.stderrTail }));
    } catch (error) {
      await releaseQuietly(prepared, readOutcome(signal, 'failed'));
      throw error;
    }

    const outcome = readOutcome(signal, 'done');
    if (outcome === 'done') {
      await prepared.release?.('done');
    } else {
      await releaseQuietly(prepared, outcome);
    }
    return result;
  };
}

/** Describes why a finished run failed, with the tail of its stderr; returns `undefined` for a run that succeeded. */
export function describeRunFailure(harness: string, run: CommandRun, maxStdoutBytes: number): string | undefined {
  const tail = run.stderrTail === '' ? '' : `\n${run.stderrTail}`;
  if (run.exceeded) {
    return `The harness ${harness} wrote more than ${formatBytes(maxStdoutBytes)} of output and was stopped.${tail}`;
  }
  if (run.code !== 0) return `The harness ${harness} exited with ${describeExit(run)}.${tail}`;
  return undefined;
}

// region | Helpers
function formatBytes(bytes: number): string {
  return bytes % (1024 * 1024) === 0 ? `${bytes / (1024 * 1024)} MiB` : `${bytes} bytes`;
}

/** Checks a job's result against its declaration's schema and returns it unparsed; throws with the schema's issues. */
function checkResult(job: JobImplementation, value: unknown): unknown {
  const parsed = job.declaration.result.safeParse(value);
  if (parsed.success) return value;
  const issues = parsed.error.issues.map((issue) => {
    const path = formatIssuePath(issue.path);
    return path === '' ? issue.message : `${path}: ${issue.message}`;
  });
  throw new Error(`The job's result does not match its schema: ${issues.join('; ')}`);
}

/** Returns the outcome that an aborted signal records, else the fallback; `createJobs` names a timeout's reason. */
function readOutcome(signal: AbortSignal, fallback: JobOutcome): JobOutcome {
  if (!signal.aborted) return fallback;
  const reason: unknown = signal.reason;
  const isTimeout = typeof reason === 'object' && reason !== null && 'name' in reason && reason.name === 'TimeoutError';
  return isTimeout ? 'timed-out' : 'cancelled';
}

/** Releases a run whose outcome is already decided, so that a rejection cannot change it. */
async function releaseQuietly(prepared: PreparedRun<unknown>, outcome: JobOutcome): Promise<void> {
  try {
    await prepared.release?.(outcome);
  } catch {
    // The job's state is already recorded, and the error that decided it is the one to report.
  }
}
// endregion | Helpers
