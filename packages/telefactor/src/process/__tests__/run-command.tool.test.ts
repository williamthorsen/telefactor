import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, onTestFinished } from 'vitest';

import { describeExit, runCommand, takeTail } from '../run-command.ts';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const NODE = process.execPath;
const BASE = { cwd: FIXTURES, stdin: '', maxStdoutBytes: 1024 };

describe(runCommand, () => {
  it('passes stdin to the command and returns its stdout and stderr tail', async () => {
    const run = await runCommand({
      ...BASE,
      argv: [NODE, 'echo-stdin.mjs'],
      stdin: 'hello',
      signal: new AbortController().signal,
    });

    expect(run).toStrictEqual({ code: 0, signal: null, stdout: 'hello', stderrTail: 'stderr line', exceeded: false });
  });

  it('reports a non-zero exit', async () => {
    const run = await runCommand({
      ...BASE,
      argv: [NODE, 'echo-stdin.mjs', '3'],
      signal: new AbortController().signal,
    });

    expect(run.code).toBe(3);
  });

  it('stops a command whose stdout exceeds the cap', async () => {
    const run = await runCommand({ ...BASE, argv: [NODE, 'flood.mjs', '2048'], signal: new AbortController().signal });

    expect(run).toMatchObject({ exceeded: true, stdout: '' });
  });

  it('rejects when the binary cannot start', async () => {
    await expect(
      runCommand({ ...BASE, argv: ['telefactor-missing-binary'], signal: new AbortController().signal }),
    ).rejects.toThrow('telefactor-missing-binary could not start');
  });

  it('kills the whole process group on abort', async () => {
    const pid = await abortGrandchildFixture([]);

    await expect.poll(() => isRunning(pid), { timeout: 2000 }).toBe(false);
  });

  it('escalates to SIGKILL when the group ignores SIGTERM', async () => {
    const pid = await abortGrandchildFixture(['ignore-term']);

    await expect.poll(() => isRunning(pid), { timeout: 2000 }).toBe(false);
  });
});

describe(describeExit, () => {
  it('describes an exit code or a signal', () => {
    expect(describeExit({ code: 1, signal: null })).toBe('code 1');
    expect(describeExit({ code: null, signal: 'SIGTERM' })).toBe('signal SIGTERM');
  });
});

describe(takeTail, () => {
  it('keeps the last 20 lines', () => {
    const lines = Array.from({ length: 25 }, (_, index) => String(index));

    expect(takeTail(lines.join('\n'))).toBe(lines.slice(5).join('\n'));
  });
});

// region | Helpers
/** Starts the grandchild fixture, aborts it once the grandchild exists, and returns the grandchild's pid. */
async function abortGrandchildFixture(extraArgs: string[]): Promise<number> {
  const directory = await mkdtemp(path.join(tmpdir(), 'telefactor-run-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const pidPath = path.join(directory, 'pid');
  const controller = new AbortController();
  const run = runCommand({
    ...BASE,
    argv: [NODE, 'spawn-grandchild.mjs', pidPath, ...extraArgs],
    signal: controller.signal,
    killGraceMs: 200,
  });
  await expect.poll(() => readPid(pidPath), { timeout: 5000 }).toBeTypeOf('number');
  controller.abort();
  await expect(run).rejects.toThrow('stopped');
  return Number(await readFile(pidPath, 'utf8'));
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPid(pidPath: string): Promise<number | undefined> {
  try {
    const text = await readFile(pidPath, 'utf8');
    return text === '' ? undefined : Number(text);
  } catch {
    return undefined;
  }
}
// endregion | Helpers
