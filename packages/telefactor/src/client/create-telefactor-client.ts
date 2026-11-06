import type { z } from 'zod';

import {
  type HarnessList,
  harnessListSchema,
  type HarnessTestResult,
  harnessTestResultSchema,
  type StartJobRequest,
} from '#src/http/route-schemas.ts';
import { type Job, jobSchema } from '#src/jobs/job-schemas.ts';

import { requestJson } from './request-json.ts';

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
  function request<T>(schema: z.ZodType<T>, route: string, init: RequestInit = {}): Promise<T> {
    return requestJson(fetchFunction, schema, `${basePath}${route}`, init);
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
