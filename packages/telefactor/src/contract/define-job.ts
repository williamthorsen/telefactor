import { z } from 'zod';

/** The request fields that every job takes, which a job's own input may not name. */
const RESERVED_INPUT_KEYS = new Set(['harness', 'prompt']);

const EMPTY_JOB_INPUT_SCHEMA = z.object({});

/**
 * A job that the page starts and the server runs: the request fields that it takes beyond `prompt` and `harness`, and
 * the result that a finished job returns.
 */
export interface JobDeclaration<I extends z.ZodObject = z.ZodObject, R extends z.ZodType = z.ZodType> {
  readonly input: I;
  readonly result: R;
}

/** The fields that a caller sends to a job beyond `prompt` and `harness`, before its schema parses them. */
export type JobInput<J extends JobDeclaration> = z.input<J['input']>;

/** The fields that a job's run receives, after its schema parses them. */
export type ParsedJobInput<J extends JobDeclaration> = z.output<J['input']>;

/** The result of a finished job, as its schema parses it. */
export type JobResult<J extends JobDeclaration> = z.output<J['result']>;

/**
 * Declares a job. It imports only `zod`, so that the page and the server can both import the declaration. A job that
 * omits `input` takes no fields beyond `prompt` and `harness`. Throws for an input that names `prompt` or `harness`.
 */
export function defineJob<R extends z.ZodType>(job: { result: R }): JobDeclaration<typeof EMPTY_JOB_INPUT_SCHEMA, R>;
export function defineJob<I extends z.ZodObject, R extends z.ZodType>(job: {
  input: I;
  result: R;
}): JobDeclaration<I, R>;
export function defineJob({
  input = EMPTY_JOB_INPUT_SCHEMA,
  result,
}: {
  input?: z.ZodObject;
  result: z.ZodType;
}): JobDeclaration {
  const reserved = Object.keys(input.shape).filter((key) => RESERVED_INPUT_KEYS.has(key));
  if (reserved.length > 0) {
    throw new Error(`A job's input may not define ${reserved.join(', ')}, which every job request defines.`);
  }
  return { input, result };
}

/** The built-in job: The harness reads the prompt, and the job returns what the harness writes to stdout. */
export const promptJob = defineJob({ result: z.object({ output: z.string() }) });
