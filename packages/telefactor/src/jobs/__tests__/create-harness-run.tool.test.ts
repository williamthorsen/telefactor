import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, onTestFinished } from 'vitest';
import { z } from 'zod';

import { defineJob } from '#src/contract/define-job.ts';

import { createHarnessRun } from '../create-harness-run.ts';
import type { JobRunInput } from '../create-jobs.ts';
import { implementJob, type JobOutcome } from '../implement-job.ts';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'write-output.mjs');
const FILE_JOB = defineJob({
  input: z.object({ name: z.string() }),
  result: z.object({ text: z.string().startsWith('NOTE:') }),
});

describe(createHarnessRun, () => {
  it('runs the built-in job: the prompt as an argument and stdin, the result from stdout', async () => {
    const run = createHarnessRun({ workingDirectory: tmpdir() });
    const command = [process.execPath, '--eval', 'process.stdin.pipe(process.stdout)', '{prompt}'];

    expect(await run(buildInput({ command, input: {} }), new AbortController().signal)).toStrictEqual({
      output: 'hello',
    });
  });

  it("expands the job's placeholders, returns what it reads, and releases it as done", async () => {
    const fixture = await createFileJob();

    const result = await fixture.run(buildInput(), new AbortController().signal);

    expect(result).toStrictEqual({ text: 'NOTE:HELLO' });
    expect(fixture.contexts).toStrictEqual([
      { id: 'job-1', harness: 'fake', prompt: 'hello', input: { name: 'note' } },
    ]);
    expect(fixture.releases).toStrictEqual(['done']);
  });

  it('parses a transforming input once and returns a transforming result in its input form', async () => {
    const declaration = defineJob({
      input: z.object({ count: z.string().transform((value) => value.length) }),
      result: z.object({ at: z.iso.datetime().transform((value) => new Date(value)) }),
    });
    const counts: number[] = [];
    const job = implementJob(declaration, {
      prepare: ({ input }) => {
        counts.push(input.count);
        return Promise.resolve({
          placeholders: {},
          stdin: '',
          read: () => Promise.resolve({ at: '2026-11-07T12:00:00Z' }),
        });
      },
    });
    const run = createHarnessRun({ workingDirectory: tmpdir(), job });

    const result = await run(
      buildInput({ command: [process.execPath, '--eval', ''], input: { count: 'abc' } }),
      new AbortController().signal,
    );

    expect(counts).toStrictEqual([3]);
    expect(result).toStrictEqual({ at: '2026-11-07T12:00:00Z' });
  });

  it('reports a non-zero exit with the stderr tail and releases the run as failed', async () => {
    const fixture = await createFileJob();

    await expect(fixture.run(buildInput({ command: commandFor(0, 2) }), new AbortController().signal)).rejects.toThrow(
      'The harness fake exited with code 2.\nwrote output',
    );
    expect(fixture.releases).toStrictEqual(['failed']);
  });

  it("fails a result that does not match the job's schema", async () => {
    const fixture = await createFileJob({ read: () => Promise.resolve({ text: 'other' }) });

    await expect(fixture.run(buildInput(), new AbortController().signal)).rejects.toThrow(
      "The job's result does not match its schema: text: ",
    );
    expect(fixture.releases).toStrictEqual(['failed']);
  });

  it.each([
    ['TimeoutError', 'timed-out'],
    ['AbortError', 'cancelled'],
  ] satisfies [string, JobOutcome][])('releases a run aborted with %s as %s', async (reason, outcome) => {
    const fixture = await createFileJob();
    const controller = new AbortController();

    const running = fixture.run(buildInput({ command: commandFor(10_000) }), controller.signal);
    await expect.poll(() => fixture.contexts.length).toBe(1);
    controller.abort(new DOMException('stopped', reason));

    await expect(running).rejects.toThrow();
    expect(fixture.releases).toStrictEqual([outcome]);
  });

  it('skips a job whose signal is aborted before it prepares', async () => {
    const fixture = await createFileJob();
    const controller = new AbortController();
    controller.abort(new DOMException('stopped', 'AbortError'));

    await expect(fixture.run(buildInput(), controller.signal)).rejects.toThrow('stopped');
    expect(fixture.contexts).toHaveLength(0);
    expect(fixture.releases).toHaveLength(0);
  });

  it('does not release a job whose prepare rejects', async () => {
    const fixture = await createFileJob({ prepareError: new Error('no room') });

    await expect(fixture.run(buildInput(), new AbortController().signal)).rejects.toThrow('no room');
    expect(fixture.releases).toHaveLength(0);
  });

  it('fails a done job whose release rejects, and keeps the error of a failed one', async () => {
    const fixture = await createFileJob({ releaseError: new Error('could not clean up') });

    await expect(fixture.run(buildInput(), new AbortController().signal)).rejects.toThrow('could not clean up');
    await expect(fixture.run(buildInput({ command: commandFor(0, 1) }), new AbortController().signal)).rejects.toThrow(
      'exited with code 1',
    );
  });
});

// region | Helpers
/** Returns the fixture command that copies `{prompt}` to `{output}` after a delay, exiting with a code. */
function commandFor(delayMs: number, code = 0): string[] {
  return [process.execPath, FIXTURE, '{prompt}', '{output}', String(delayMs), String(code)];
}

function buildInput(overrides: Partial<JobRunInput> = {}): JobRunInput {
  return {
    id: 'job-1',
    harness: 'fake',
    command: commandFor(0),
    prompt: 'hello',
    input: { name: 'note' },
    ...overrides,
  };
}

/**
 * Creates a run of a job that writes the prompt to a file named for its input and reads the output file back, and
 * records each context that it prepares and each outcome that it releases.
 */
async function createFileJob({
  read,
  prepareError,
  releaseError,
}: { read?: () => Promise<{ text: string }>; prepareError?: Error; releaseError?: Error } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'telefactor-run-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const contexts: unknown[] = [];
  const releases: JobOutcome[] = [];
  const job = implementJob(FILE_JOB, {
    async prepare(context) {
      contexts.push(context);
      if (prepareError !== undefined) throw prepareError;
      const promptPath = path.join(directory, `${context.input.name}.md`);
      const outputPath = path.join(directory, `${context.input.name}.out`);
      await writeFile(promptPath, `${context.input.name}:${context.prompt}`);
      return {
        placeholders: { prompt: promptPath, output: outputPath },
        stdin: '',
        read: async () => (read === undefined ? { text: await readFile(outputPath, 'utf8') } : read()),
        release(outcome) {
          releases.push(outcome);
          return releaseError === undefined ? Promise.resolve() : Promise.reject(releaseError);
        },
      };
    },
  });
  return { run: createHarnessRun({ workingDirectory: directory, job }), contexts, releases };
}
// endregion | Helpers
