import { z } from 'zod';

import { promptJob } from '#src/contract/define-job.ts';

export const jobStatusSchema = z.enum(['running', 'done', 'failed', 'cancelled']);

export type JobStatus = z.infer<typeof jobStatusSchema>;

/** A headless job. `result` is present when the job is `done`, and `error` when it is `failed`. */
export interface Job<R = z.output<typeof promptJob.result>> {
  id: string;
  /** The name of the harness that runs the job. */
  harness: string;
  status: JobStatus;
  result?: R | undefined;
  error?: string | undefined;
}

/** Builds the schema of a job whose result the given schema parses. */
export function buildJobSchema<R extends z.ZodType>(result: R): z.ZodType<Job<z.output<R>>> {
  return z.object({
    id: z.string(),
    harness: z.string(),
    status: jobStatusSchema,
    result: result.optional(),
    error: z.string().optional(),
  });
}

/** The schema of a built-in job. */
export const jobSchema = buildJobSchema(promptJob.result);
