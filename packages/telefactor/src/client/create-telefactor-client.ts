import type { z } from 'zod';

import { type JobDeclaration, type JobRequest, type JobResult, promptJob } from '#src/contract/define-job.ts';
import {
  type HarnessList,
  harnessListSchema,
  type HarnessTestResult,
  harnessTestResultSchema,
  type StartTerminalSessionRequest,
  type TerminalSessionInfo,
  terminalSessionSchema,
} from '#src/http/route-schemas.ts';
import { buildJobSchema, type Job } from '#src/jobs/job-schemas.ts';

import { requestJson } from './request-json.ts';

/** Calls the routes that the Vite plugin mounts, starting and reading the job that `J` declares. */
export interface TelefactorClient<J extends JobDeclaration = typeof promptJob> {
  /** The path under which the routes are mounted. */
  readonly basePath: string;
  cancelJob(id: string, options?: RequestOptions): Promise<Job<JobResult<J>>>;
  closeTerminalSession(id: string, options?: RequestOptions): Promise<TerminalSessionInfo>;
  createTerminalSession(request: StartTerminalSessionRequest, options?: RequestOptions): Promise<TerminalSessionInfo>;
  getJob(id: string, options?: RequestOptions): Promise<Job<JobResult<J>>>;
  listHarnesses(options?: RequestOptions): Promise<HarnessList>;
  startJob(request: JobRequest<J>, options?: RequestOptions): Promise<Job<JobResult<J>>>;
  /** Returns the WebSocket URL of a session's socket, on the page's host, with `wss:` on an `https:` page. */
  terminalSocketUrl(id: string): string;
  /** Runs the harness's test command; aborting the request stops the test on the server. */
  testHarness(name: string, options?: RequestOptions): Promise<HarnessTestResult>;
}

/**
 * Per-request options. Aborting `signal` aborts the request, which then rejects with the `AbortError` that `fetch`
 * raises rather than with a `TelefactorRequestError`.
 */
export interface RequestOptions {
  signal?: AbortSignal;
}

/** The parts of the page's location from which a socket URL is built. */
export interface PageLocation {
  protocol: string;
  host: string;
}

export interface TelefactorClientOptions {
  basePath?: string;
  fetch?: typeof fetch;
  location?: PageLocation;
}

/**
 * Creates a client for the routes under `basePath`, which must match the plugin's; defaults to `/api/telefactor`.
 * `location` defaults to the page's own. `job` is the declaration of the plugin's job, the built-in prompt job when
 * omitted; the client sends its fields and parses its result.
 */
export function createTelefactorClient(options?: TelefactorClientOptions): TelefactorClient;
export function createTelefactorClient<J extends JobDeclaration>(
  options: TelefactorClientOptions & { job: J },
): TelefactorClient<J>;
export function createTelefactorClient({
  basePath = '/api/telefactor',
  fetch: fetchFunction = fetch,
  location,
  job = promptJob,
}: TelefactorClientOptions & { job?: JobDeclaration } = {}): TelefactorClient<JobDeclaration> {
  const jobSchema = buildJobSchema(job.result);

  function request<T>(
    schema: z.ZodType<T>,
    route: string,
    { signal }: RequestOptions = {},
    init: RequestInit = {},
  ): Promise<T> {
    return requestJson(fetchFunction, schema, `${basePath}${route}`, signal === undefined ? init : { ...init, signal });
  }

  return {
    basePath,
    cancelJob: (id, options) => request(jobSchema, `/jobs/${encodeURIComponent(id)}`, options, { method: 'DELETE' }),
    closeTerminalSession: (id, options) =>
      request(terminalSessionSchema, `/terminal/sessions/${encodeURIComponent(id)}`, options, { method: 'DELETE' }),
    createTerminalSession: (body, options) =>
      request(terminalSessionSchema, '/terminal/sessions', options, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    getJob: (id, options) => request(jobSchema, `/jobs/${encodeURIComponent(id)}`, options),
    listHarnesses: (options) => request(harnessListSchema, '/harnesses', options),
    startJob: (body, options) =>
      request(jobSchema, '/jobs', options, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    terminalSocketUrl(id) {
      const { protocol, host } = location ?? readPageLocation();
      const scheme = protocol === 'https:' ? 'wss:' : 'ws:';
      return `${scheme}//${host}${basePath}/terminal/sessions/${encodeURIComponent(id)}/socket`;
    },
    testHarness: (name, options) =>
      request(harnessTestResultSchema, `/harnesses/${encodeURIComponent(name)}/test`, options, { method: 'POST' }),
  };
}

// region | Helpers
function isPageLocation(value: unknown): value is PageLocation {
  return (
    typeof value === 'object' &&
    value !== null &&
    'protocol' in value &&
    typeof value.protocol === 'string' &&
    'host' in value &&
    typeof value.host === 'string'
  );
}

/** Returns the page's location; throws outside a page, where the client needs `location` passed in. */
function readPageLocation(): PageLocation {
  const value: unknown = Reflect.get(globalThis, 'location');
  if (!isPageLocation(value)) {
    throw new Error('A socket URL needs the page location; pass `location` to createTelefactorClient.');
  }
  return value;
}
// endregion | Helpers
