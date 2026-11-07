import { spawn } from 'node:child_process';

import { KILL_GRACE_MS, killProcessGroup } from './kill-process-group.ts';

/** The number of trailing lines of a command's output that a report quotes. */
const TAIL_LINES = 20;

/** The amount of stderr kept, enough for the lines that a report quotes. */
const STDERR_KEPT_CHARACTERS = 65_536;

/** How a command ended. `exceeded` reports that stdout passed the cap, so that the command was stopped. */
export interface CommandRun {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderrTail: string;
  exceeded: boolean;
}

export interface RunCommandOptions {
  argv: readonly string[];
  cwd: string;
  /** Written to the command's stdin, which is then closed. */
  stdin: string;
  signal: AbortSignal;
  maxStdoutBytes: number;
  killGraceMs?: number;
}

/**
 * Runs the command without a shell in a process group of its own, and resolves when it ends. On abort, the group gets
 * SIGTERM, then SIGKILL after a grace period, and the promise rejects once the command ends. A command whose stdout
 * exceeds the cap is stopped the same way, and the promise resolves with `exceeded` set.
 */
export function runCommand({
  argv,
  cwd,
  stdin,
  signal,
  maxStdoutBytes,
  killGraceMs = KILL_GRACE_MS,
}: RunCommandOptions): Promise<CommandRun> {
  const [file, ...args] = argv;
  if (file === undefined) return Promise.reject(new Error('The harness command is empty.'));
  if (signal.aborted) return Promise.reject(new Error('The harness command was stopped before it started.'));

  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let exceeded = false;
    let stderr = '';

    function stop(): void {
      killProcessGroup(child.pid, 'SIGTERM');
      setTimeout(() => killProcessGroup(child.pid, 'SIGKILL'), killGraceMs).unref();
    }

    child.stdout.on('data', (chunk: Buffer) => {
      if (exceeded) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxStdoutBytes) {
        exceeded = true;
        stop();
        return;
      }
      stdoutChunks.push(chunk);
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-STDERR_KEPT_CHARACTERS);
    });
    // A command that exits without reading its stdin closes the pipe under the write.
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);

    signal.addEventListener('abort', stop, { once: true });

    child.once('error', (error) => {
      signal.removeEventListener('abort', stop);
      reject(new Error(`The harness command ${file} could not start: ${error.message}`));
    });
    child.once('close', (code, exitSignal) => {
      signal.removeEventListener('abort', stop);
      if (signal.aborted) {
        reject(new Error('The harness command was stopped.'));
        return;
      }
      resolve({
        code,
        signal: exitSignal,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderrTail: takeTail(stderr),
        exceeded,
      });
    });
  });
}

/** Describes how a command ended: `code 1` or `signal SIGTERM`. */
export function describeExit({ code, signal }: Pick<CommandRun, 'code' | 'signal'>): string {
  return code === null ? `signal ${signal ?? 'unknown'}` : `code ${code}`;
}

/** Returns the last lines of the output, trimmed. */
export function takeTail(output: string): string {
  return output.trim().split('\n').slice(-TAIL_LINES).join('\n');
}
