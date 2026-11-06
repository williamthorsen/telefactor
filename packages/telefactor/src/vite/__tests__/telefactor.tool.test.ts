import { mkdtemp, rm } from 'node:fs/promises';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { HARNESS_COMMAND_VARIABLE } from '#src/harness/read-settings.ts';
import { jobSchema } from '#src/jobs/job-schemas.ts';

import { telefactor } from '../telefactor.ts';

// The environment harness echoes its stdin, so a job's output is its prompt.
const ECHO_COMMAND = [process.execPath, '--eval', 'process.stdin.pipe(process.stdout)'];

const state: { root: string; server: ViteDevServer | undefined; origin: string } = {
  root: '',
  server: undefined,
  origin: '',
};

beforeAll(async () => {
  vi.stubEnv(HARNESS_COMMAND_VARIABLE, JSON.stringify(ECHO_COMMAND));
  state.root = await mkdtemp(path.join(tmpdir(), 'telefactor-vite-'));
  const server = await createServer({
    root: state.root,
    configFile: false,
    logLevel: 'silent',
    // Allow every host in Vite, so that the `Host` check reaches the plugin's own guard.
    server: { host: '127.0.0.1', port: 0, strictPort: true, allowedHosts: true },
    plugins: [telefactor()],
  });
  await server.listen();
  state.server = server;
  const address = server.httpServer?.address();
  if (address === null || address === undefined || typeof address === 'string')
    throw new Error('Expected a TCP address.');
  state.origin = `http://127.0.0.1:${(address satisfies AddressInfo).port}`;
});

afterAll(async () => {
  await state.server?.close();
  vi.unstubAllEnvs();
  await rm(state.root, { recursive: true, force: true });
});

describe(telefactor, () => {
  it('runs a job through the environment harness to done', async () => {
    const started = await fetch(`${state.origin}/api/telefactor/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'hello from the page' }),
    });
    expect(started.status).toBe(201);
    const job = jobSchema.parse(await started.json());

    await expect
      .poll(async () => jobSchema.parse(await (await fetch(`${state.origin}/api/telefactor/jobs/${job.id}`)).json()), {
        timeout: 5000,
      })
      .toMatchObject({ status: 'done', result: { output: 'hello from the page' } });
  });

  it('lists the environment harness', async () => {
    const response = await fetch(`${state.origin}/api/telefactor/harnesses`);

    expect(await response.json()).toMatchObject({ source: 'environment', defaultHarness: 'environment' });
  });

  it('refuses a cross-origin request', async () => {
    const response = await fetch(`${state.origin}/api/telefactor/harnesses`, {
      headers: { origin: 'http://attacker.example' },
    });

    expect(response.status).toBe(403);
  });

  it('refuses a request that names a non-loopback host when Vite allows every host', async () => {
    expect(await requestWithHeaders('/api/telefactor/harnesses', { host: 'attacker.example' })).toStrictEqual({
      status: 403,
      body: '{"error":"Telefactor accepts only local, same-origin requests."}',
    });
  });
});

// region | Helpers
/** Sends a GET with the given headers through `node:http`, which, unlike `fetch`, sends a custom `Host`. */
function requestWithHeaders(
  route: string,
  headers: Record<string, string>,
): Promise<{ status: number | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = request(`${state.origin}${route}`, { headers }, (response) => {
      let body = '';
      response.setEncoding('utf8').on('data', (chunk: string) => {
        body += chunk;
      });
      response.once('end', () => resolve({ status: response.statusCode, body }));
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
}
// endregion | Helpers
