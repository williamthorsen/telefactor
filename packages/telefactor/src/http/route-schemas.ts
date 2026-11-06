import { z } from 'zod';

import { problemSchema } from '#src/schemas/problem.ts';

/** The body of `POST /jobs`; `harness` names the harness that runs the job, the default harness when omitted. */
export const startJobRequestSchema = z.object({
  prompt: z.string().refine((value) => value.trim() !== '', 'Enter a prompt'),
  harness: z.string().optional(),
});

export type StartJobRequest = z.infer<typeof startJobRequestSchema>;

/** The body of a `400` response. */
export const problemsBodySchema = z.object({ problems: z.array(problemSchema) });

/** The body of a `403`, `404`, `409`, or `415` response. */
export const errorBodySchema = z.object({ error: z.string() });

/**
 * The body of `GET /harnesses`: the harnesses that the settings define, or the problems of a config file that cannot
 * be used. `configPath` is where the config file is expected, and `hasConfigFile` reports whether it exists.
 */
export const harnessListSchema = z.union([
  z.object({
    source: z.enum(['built-in', 'environment', 'file']),
    configPath: z.string(),
    hasConfigFile: z.boolean(),
    defaultHarness: z.string(),
    timeoutMinutes: z.number(),
    harnesses: z.array(
      z.object({ name: z.string(), label: z.string(), command: z.array(z.string()), testable: z.boolean() }),
    ),
  }),
  z.object({ source: z.literal('file'), configPath: z.string(), problems: z.array(problemSchema) }),
]);

export type HarnessList = z.infer<typeof harnessListSchema>;

/**
 * The body of a `200` from `POST /harnesses/:name/test`. `exit` describes how the test ended, such as `exit code 1` or
 * `timed out after 60 s`, and `output` holds the last lines of its stdout and stderr.
 */
export const harnessTestResultSchema = z.object({
  ok: z.boolean(),
  durationMs: z.number(),
  exit: z.string(),
  output: z.string(),
});

export type HarnessTestResult = z.infer<typeof harnessTestResultSchema>;

/** The body of `GET /state`, of each `/state/events` event, and of a `200` from `POST /actions/:name`. */
export function stateSnapshotSchema<S extends z.ZodType>(
  stateSchema: S,
): z.ZodObject<{ version: z.ZodNumber; state: S }> {
  return z.object({ version: z.number().int().nonnegative(), state: stateSchema });
}
