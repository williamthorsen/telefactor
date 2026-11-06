import { z } from 'zod';

export const jobStatusSchema = z.enum(['running', 'done', 'failed', 'cancelled']);

export type JobStatus = z.infer<typeof jobStatusSchema>;

/** A headless job. `result` is present when the job is `done`, and `error` when it is `failed`. */
export const jobSchema = z.object({
  id: z.string(),
  /** The name of the harness that runs the job. */
  harness: z.string(),
  status: jobStatusSchema,
  result: z.object({ output: z.string() }).optional(),
  error: z.string().optional(),
});

export type Job = z.infer<typeof jobSchema>;
