import { errorBodySchema, problemsBodySchema } from '#src/http/route-schemas.ts';
import type { Problem } from '#src/schemas/problem.ts';

/** An error response from the routes, with its status and either its message or its problems. */
export class TelefactorRequestError extends Error {
  readonly status: number;
  readonly problems: Problem[];

  constructor(status: number, message: string, problems: Problem[] = []) {
    super(message);
    this.name = 'TelefactorRequestError';
    this.status = status;
    this.problems = problems;
  }
}

/** Builds the error for a refused response from its body: its problems' messages joined by a space, else its error. */
export function buildRequestError(status: number, body: unknown): TelefactorRequestError {
  const problems = problemsBodySchema.safeParse(body);
  if (problems.success) {
    const message = problems.data.problems.map((problem) => problem.message).join(' ');
    return new TelefactorRequestError(status, message, problems.data.problems);
  }
  const error = errorBodySchema.safeParse(body);
  return new TelefactorRequestError(status, error.success ? error.data.error : `The request failed with ${status}.`);
}
