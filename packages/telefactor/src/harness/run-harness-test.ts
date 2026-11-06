import type { HarnessTestResult } from '#src/http/route-schemas.ts';
import { MAX_OUTPUT_BYTES } from '#src/jobs/create-harness-run.ts';
import { describeError } from '#src/portable/describe-error.ts';
import { describeExit, runCommand, takeTail } from '#src/process/run-command.ts';

/** The time after which a harness test is stopped and reported as failed. */
export const HARNESS_TEST_TIMEOUT_MS = 60_000;

interface HarnessTestOptions {
  argv: readonly string[];
  workingDirectory: string;
  /** Stops the test, such as when the client disconnects. */
  signal: AbortSignal;
  timeoutMs?: number;
}

/** Runs a harness's test command, which passes on exit code 0, and reports how it ended and the end of its output. */
export async function runHarnessTest({
  argv,
  workingDirectory,
  signal,
  timeoutMs = HARNESS_TEST_TIMEOUT_MS,
}: HarnessTestOptions): Promise<HarnessTestResult> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const startedAt = performance.now();
  let outcome: Pick<HarnessTestResult, 'exit' | 'ok' | 'output'>;
  try {
    const run = await runCommand({
      argv,
      cwd: workingDirectory,
      stdin: '',
      signal: AbortSignal.any([signal, timeout]),
      maxStdoutBytes: MAX_OUTPUT_BYTES,
    });
    const output = takeTail([run.stdout.trim(), run.stderrTail].filter((part) => part !== '').join('\n'));
    outcome = run.exceeded
      ? { ok: false, exit: 'output exceeded 1 MiB', output }
      : { ok: run.code === 0, exit: `exit ${describeExit(run)}`, output };
  } catch (error) {
    outcome = { ok: false, ...describeFailure(error, { signal, timeout, timeoutMs }) };
  }
  return { ...outcome, durationMs: Math.round(performance.now() - startedAt) };
}

// region | Helpers
/** Describes a test that did not run to its end: stopped by the caller, timed out, or not started. */
function describeFailure(
  error: unknown,
  { signal, timeout, timeoutMs }: { signal: AbortSignal; timeout: AbortSignal; timeoutMs: number },
): Pick<HarnessTestResult, 'exit' | 'output'> {
  if (signal.aborted) return { exit: 'stopped', output: '' };
  if (timeout.aborted) {
    const duration = timeoutMs < 1000 ? `${timeoutMs} ms` : `${Math.round(timeoutMs / 1000)} s`;
    return { exit: `timed out after ${duration}`, output: '' };
  }
  return { exit: 'not started', output: describeError(error) };
}
// endregion | Helpers
