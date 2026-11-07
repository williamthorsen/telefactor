import type { z } from 'zod';

import {
  type HarnessList,
  harnessListSchema,
  type HarnessTestResult,
  harnessTestResultSchema,
  type StartJobRequest,
  type StartTerminalSessionRequest,
  type TerminalSessionInfo,
  terminalSessionSchema,
} from '#src/http/route-schemas.ts';
import { type Job, jobSchema } from '#src/jobs/job-schemas.ts';

import { requestJson } from './request-json.ts';

/** Calls the routes that the Vite plugin mounts. */
export interface TelefactorClient {
  /** The path under which the routes are mounted. */
  readonly basePath: string;
  cancelJob(id: string): Promise<Job>;
  closeTerminalSession(id: string): Promise<TerminalSessionInfo>;
  createTerminalSession(request: StartTerminalSessionRequest): Promise<TerminalSessionInfo>;
  getJob(id: string): Promise<Job>;
  listHarnesses(): Promise<HarnessList>;
  startJob(request: StartJobRequest): Promise<Job>;
  /** Returns the WebSocket URL of a session's socket, on the page's host, with `wss:` on an `https:` page. */
  terminalSocketUrl(id: string): string;
  testHarness(name: string): Promise<HarnessTestResult>;
}

/** The parts of the page's location from which a socket URL is built. */
export interface PageLocation {
  protocol: string;
  host: string;
}

/**
 * Creates a client for the routes under `basePath`, which must match the plugin's; defaults to `/api/telefactor`.
 * `location` defaults to the page's own.
 */
export function createTelefactorClient({
  basePath = '/api/telefactor',
  fetch: fetchFunction = fetch,
  location,
}: {
  basePath?: string;
  fetch?: typeof fetch;
  location?: PageLocation;
} = {}): TelefactorClient {
  function request<T>(schema: z.ZodType<T>, route: string, init: RequestInit = {}): Promise<T> {
    return requestJson(fetchFunction, schema, `${basePath}${route}`, init);
  }

  return {
    basePath,
    cancelJob: (id) => request(jobSchema, `/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    closeTerminalSession: (id) =>
      request(terminalSessionSchema, `/terminal/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    createTerminalSession: (body) =>
      request(terminalSessionSchema, '/terminal/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    getJob: (id) => request(jobSchema, `/jobs/${encodeURIComponent(id)}`),
    listHarnesses: () => request(harnessListSchema, '/harnesses'),
    startJob: (body) =>
      request(jobSchema, '/jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    terminalSocketUrl(id) {
      const { protocol, host } = location ?? readPageLocation();
      const scheme = protocol === 'https:' ? 'wss:' : 'ws:';
      return `${scheme}//${host}${basePath}/terminal/sessions/${encodeURIComponent(id)}/socket`;
    },
    testHarness: (name) =>
      request(harnessTestResultSchema, `/harnesses/${encodeURIComponent(name)}/test`, { method: 'POST' }),
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
