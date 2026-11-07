import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { defineJob, type JobInput, type JobRequest, type JobResult, promptJob } from '../define-job.ts';

describe(defineJob, () => {
  it('types the input and the result from their schemas', () => {
    const job = defineJob({ input: z.object({ name: z.string().default('x') }), result: z.number() });

    expectTypeOf<JobInput<typeof job>>().toEqualTypeOf<{ name?: string | undefined }>();
    expectTypeOf<JobRequest<typeof job>>().toExtend<{ prompt: string; name?: string | undefined }>();
    expectTypeOf<JobResult<typeof job>>().toEqualTypeOf<number>();
    expect(job.input.parse({})).toStrictEqual({ name: 'x' });
  });

  it('gives a job without input an empty input, whose request has only the prompt and the harness', () => {
    const job = defineJob({ result: z.string() });

    expectTypeOf<JobRequest<typeof job>>().toEqualTypeOf<{ prompt: string; harness?: string | undefined }>();
    expect(job.input.parse({})).toStrictEqual({});
  });

  it.each(['prompt', 'harness'])('throws for an input that names `%s`', (key) => {
    expect(() => defineJob({ input: z.object({ [key]: z.string() }), result: z.string() })).toThrow(
      `A job's input may not define ${key}, which every job request defines.`,
    );
  });
});

describe('promptJob', () => {
  it('returns the output as its result', () => {
    expect(promptJob.result.parse({ output: 'ok' })).toStrictEqual({ output: 'ok' });
  });
});
