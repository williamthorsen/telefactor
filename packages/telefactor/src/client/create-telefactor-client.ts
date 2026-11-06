import type { z } from 'zod';

import {
  errorBodySchema,
  type HarnessList,
  harnessListSchema,
  type HarnessTestResult,
  harnessTestResultSchema,
  problemsBodySchema,
  type StartJobRequest,
} from '#src/http/route-schemas.ts';
import { type Job, jobSchema } from '#src/jobs/job-schemas.ts';
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

/** Calls the routes that the Vite plugin mounts. */
export interface TelefactorClient {
  cancelJob(id: string): Promise<Job>;
  getJob(id: string): Promise<Job>;
  listHarnesses(): Promise<HarnessList>;
  startJob(request: StartJobRequest): Promise<Job>;
  testHarness(name: string): Promise<HarnessTestResult>;
}

/** Creates a client for the routes under `basePath`, which must match the plugin's; defaults to `/api/telefactor`. */
export function createTelefactorClient({
  basePath = '/api/telefactor',
  fetch: fetchFunction = fetch,
}: {
  basePath?: string;
  fetch?: typeof fetch;
} = {}): TelefactorClient {
  async function request<T>(schema: z.ZodType<T>, route: string, init: RequestInit = {}): Promise<T> {
    const url = `${basePath}${route}`;
    const response = await fetchFunction(url, init);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      // A `basePath` that the plugin does not serve reaches Vite's HTML fallback.
      throw new TelefactorRequestError(response.status, `The response from ${url} is not JSON.`);
    }
    if (!response.ok) throw buildRequestError(response.status, body);
    return schema.parse(body);
  }

  return {
    cancelJob: (id) => request(jobSchema, `/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    getJob: (id) => request(jobSchema, `/jobs/${encodeURIComponent(id)}`),
    listHarnesses: () => request(harnessListSchema, '/harnesses'),
    startJob: (body) =>
      request(jobSchema, '/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    testHarness: (name) =>
      request(harnessTestResultSchema, `/harnesses/${encodeURIComponent(name)}/test`, { method: 'POST' }),
  };
}

// region | Helpers
function buildRequestError(status: number, body: unknown): TelefactorRequestError {
  const problems = problemsBodySchema.safeParse(body);
  if (problems.success) {
    const message = problems.data.problems.map((problem) => problem.message).join(' ');
    return new TelefactorRequestError(status, message, problems.data.problems);
  }
  const error = errorBodySchema.safeParse(body);
  return new TelefactorRequestError(status, error.success ? error.data.error : `The request failed with ${status}.`);
}
// endregion | Helpers
