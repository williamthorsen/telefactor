import { type CommandRun, describeExit, runCommand } from '#src/process/run-command.ts';

import type { JobRun } from './create-jobs.ts';

/** The most stdout that a job keeps; a run that writes more fails. */
export const MAX_OUTPUT_BYTES = 1024 * 1024;

/** Creates the job run that executes a harness command in the working directory and returns its stdout. */
export function createHarnessRun({
  workingDirectory,
  maxStdoutBytes = MAX_OUTPUT_BYTES,
}: {
  workingDirectory: string;
  maxStdoutBytes?: number;
}): JobRun {
  return async ({ harness, argv, stdin }, signal) => {
    const run = await runCommand({ argv, cwd: workingDirectory, stdin, signal, maxStdoutBytes });
    const failure = describeRunFailure(harness, run, maxStdoutBytes);
    if (failure !== undefined) throw new Error(failure);
    return { output: run.stdout };
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
// endregion | Helpers
