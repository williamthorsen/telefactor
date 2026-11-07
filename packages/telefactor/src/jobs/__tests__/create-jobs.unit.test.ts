import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createJobs, expandArgv, type JobRun, type JobRunInput } from '../create-jobs.ts';
import { createInMemoryJobStore } from '../in-memory-job-store.ts';

const HARNESS = { name: 'fake', command: ['fake', '{prompt}'], timeoutMs: 60_000 };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe(createJobs, () => {
  it('starts a running job and records its output when the run settles', async () => {
    const pending = createPendingRun();
    const jobs = createJobs({ run: pending.run, store: createInMemoryJobStore() });

    const job = await jobs.start({ prompt: 'hi' }, HARNESS);
    expect(job).toMatchObject({ harness: 'fake', status: 'running' });

    pending.resolve({ output: 'done text' });
    await vi.waitFor(async () => {
      expect(await jobs.get(job.id)).toMatchObject({ status: 'done', result: { output: 'done text' } });
    });
  });

  it('passes the expanded argv and the prompt as stdin', async () => {
    const pending = createPendingRun();
    const jobs = createJobs({ run: pending.run, store: createInMemoryJobStore() });

    await jobs.start({ prompt: 'hi' }, HARNESS);

    expect(pending.inputs).toStrictEqual([{ harness: 'fake', argv: ['fake', 'hi'], stdin: 'hi' }]);
  });

  it('records a failed run with its error', async () => {
    const pending = createPendingRun();
    const jobs = createJobs({ run: pending.run, store: createInMemoryJobStore() });

    const job = await jobs.start({ prompt: 'hi' }, HARNESS);
    pending.reject(new Error('exited with code 1'));

    await vi.waitFor(async () => {
      expect(await jobs.get(job.id)).toMatchObject({ status: 'failed', error: 'exited with code 1' });
    });
  });

  it('fails a job that exceeds its timeout and aborts the run', async () => {
    const pending = createPendingRun();
    const jobs = createJobs({ run: pending.run, store: createInMemoryJobStore() });

    const job = await jobs.start({ prompt: 'hi' }, { ...HARNESS, timeoutMs: 120_000 });
    await vi.advanceTimersByTimeAsync(120_000);

    expect(await jobs.get(job.id)).toMatchObject({
      status: 'failed',
      error: 'The harness fake did not finish within 2 minutes and was stopped.',
    });
    expect(pending.signals[0]?.aborted).toBe(true);
  });

  it('cancels a running job at once, aborts the run, and ignores the later outcome', async () => {
    const pending = createPendingRun();
    const jobs = createJobs({ run: pending.run, store: createInMemoryJobStore() });

    const job = await jobs.start({ prompt: 'hi' }, HARNESS);
    const outcome = await jobs.cancel(job.id);
    pending.reject(new Error('stopped'));
    await vi.runAllTimersAsync();

    expect(outcome).toMatchObject({ ok: true, job: { status: 'cancelled' } });
    expect(pending.signals[0]?.aborted).toBe(true);
    expect(await jobs.get(job.id)).toMatchObject({ status: 'cancelled' });
  });

  it('refuses to cancel a finished job', async () => {
    const pending = createPendingRun();
    const jobs = createJobs({ run: pending.run, store: createInMemoryJobStore() });

    const job = await jobs.start({ prompt: 'hi' }, HARNESS);
    pending.resolve({ output: '' });
    await vi.waitFor(async () => {
      expect((await jobs.get(job.id))?.status).toBe('done');
    });

    expect(await jobs.cancel(job.id)).toStrictEqual({ ok: false, reason: 'finished' });
  });

  it('reports an unknown job', async () => {
    const jobs = createJobs({ run: createPendingRun().run, store: createInMemoryJobStore() });

    expect(await jobs.get('missing')).toBeUndefined();
    expect(await jobs.cancel('missing')).toStrictEqual({ ok: false, reason: 'not-found' });
  });

  it('cancels every running job', async () => {
    const pending = createPendingRun();
    const jobs = createJobs({ run: pending.run, store: createInMemoryJobStore() });

    const first = await jobs.start({ prompt: 'a' }, HARNESS);
    const second = await jobs.start({ prompt: 'b' }, HARNESS);
    await jobs.cancelAll();

    expect((await jobs.get(first.id))?.status).toBe('cancelled');
    expect((await jobs.get(second.id))?.status).toBe('cancelled');
  });
});

describe(expandArgv, () => {
  it('replaces every occurrence and keeps `$` sequences literal', () => {
    expect(expandArgv(['run', 'say {prompt} twice: {prompt}'], { prompt: "$& $' $1" })).toStrictEqual([
      'run',
      "say $& $' $1 twice: $& $' $1",
    ]);
  });

  it('does not expand a placeholder inside a value', () => {
    expect(expandArgv(['{prompt}', '{output}'], { prompt: 'write {output}', output: '/out.json' })).toStrictEqual([
      'write {output}',
      '/out.json',
    ]);
  });

  it('keeps a placeholder that names no value, including an inherited property', () => {
    expect(expandArgv(['{mcpUrl} {toString} {}'], { prompt: 'p' })).toStrictEqual(['{mcpUrl} {toString} {}']);
  });
});

// region | Helpers
/** Creates a job run that records its inputs and signals and settles only when the test settles it. */
function createPendingRun(): {
  run: JobRun;
  inputs: JobRunInput[];
  signals: AbortSignal[];
  resolve: (value: { output: string }) => void;
  reject: (error: Error) => void;
} {
  const inputs: JobRunInput[] = [];
  const signals: AbortSignal[] = [];
  const settlers: { resolve: (value: { output: string }) => void; reject: (error: Error) => void }[] = [];
  return {
    inputs,
    signals,
    run: (input, signal) => {
      inputs.push(input);
      signals.push(signal);
      return new Promise((resolve, reject) => {
        settlers.push({ resolve, reject });
      });
    },
    resolve: (value) => {
      for (const settler of settlers) settler.resolve(value);
    },
    reject: (error) => {
      for (const settler of settlers) settler.reject(error);
    },
  };
}
// endregion | Helpers
