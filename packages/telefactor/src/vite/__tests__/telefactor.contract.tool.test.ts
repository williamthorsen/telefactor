import { mkdtemp, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createLogger, createServer, type ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { implementCounter } from '#src/test-utils/counter-contract.ts';

import { telefactor } from '../telefactor.ts';

const state: { root: string; server: ViteDevServer | undefined; origin: string; logged: string[] } = {
  root: '',
  server: undefined,
  origin: '',
  logged: [],
};

beforeEach(async () => {
  state.root = await mkdtemp(path.join(tmpdir(), 'telefactor-contract-'));
  state.logged = [];
  const logger = createLogger('info');
  logger.info = (message) => {
    state.logged.push(message);
  };
  const server = await createServer({
    root: state.root,
    configFile: false,
    customLogger: logger,
    // Allow every host in Vite, so that the `Host` check reaches the plugin's own guard.
    server: { host: '127.0.0.1', port: 0, strictPort: true, allowedHosts: true },
    plugins: [telefactor({ contract: implementCounter() })],
  });
  await server.listen();
  state.server = server;
  const address = server.httpServer?.address();
  if (typeof address !== 'object' || address === null) throw new Error('Expected a TCP address.');
  state.origin = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await state.server?.close();
  await rm(state.root, { recursive: true, force: true });
});

describe('telefactor with a contract', () => {
  it('lets an MCP client change the state that the page reads and receives', async () => {
    const events = await openEventStream();
    const client = new Client({ name: 'test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${state.origin}/api/telefactor/mcp`)));

    const { tools } = await client.listTools();
    await client.callTool({ name: 'add', arguments: { amount: 5 } });
    const page = await (await fetch(`${state.origin}/api/telefactor/state`)).json();
    await client.close();

    expect(tools.map((tool) => tool.name)).toContain('add');
    expect(page).toStrictEqual({ version: 1, state: { count: 5 }, change: { action: 'add', origin: 'agent' } });
    await expect.poll(() => events.text, { timeout: 5000 }).toContain('"change":{"action":"add","origin":"agent"}');
    events.abort();
  });

  it('lets the page change the state that the agent reads next', async () => {
    const client = new Client({ name: 'test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${state.origin}/api/telefactor/mcp`)));

    await fetch(`${state.origin}/api/telefactor/actions/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 2 }),
    });
    const read = await client.callTool({ name: 'get_state' });
    await client.close();

    expect(read.structuredContent).toStrictEqual({
      version: 1,
      state: { count: 2 },
      change: { action: 'add', origin: 'page' },
    });
  });

  it.each(['/api/telefactor/mcp', '/api/telefactor/actions/add', '/api/telefactor/state'])(
    'refuses a cross-origin request to %s',
    async (route) => {
      const headers = { origin: 'http://attacker.example', 'content-type': 'application/json' };
      const init: RequestInit = route.endsWith('/state') ? { headers } : { method: 'POST', headers, body: '{}' };

      const response = await fetch(`${state.origin}${route}`, init);

      expect(response.status).toBe(403);
    },
  );

  it.each(['/api/telefactor/mcp', '/api/telefactor/state'])(
    'refuses a request to %s that names a non-loopback host',
    async (route) => {
      expect(await requestWithHost(route, 'attacker.example')).toBe(403);
    },
  );

  it('logs the MCP endpoint at the origin that Vite resolves once the server listens', () => {
    expect(
      state.logged.some((message) =>
        /^telefactor MCP endpoint: http:\/\/127\.0\.0\.1:\d+\/api\/telefactor\/mcp$/.test(message),
      ),
    ).toBe(true);
  });

  it('closes while a page is subscribed to the state', async () => {
    await openEventStream();

    await state.server?.close();
    state.server = undefined;
  });
});

// region | Helpers
/** Opens `/state/events` and collects its text as it arrives. */
async function openEventStream(): Promise<{ text: string; abort: () => void }> {
  const controller = new AbortController();
  const response = await fetch(`${state.origin}/api/telefactor/state/events`, { signal: controller.signal });
  const collected = { text: '', abort: () => controller.abort() };
  const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
  if (reader === undefined) throw new Error('Expected a response body.');
  void (async () => {
    try {
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) collected.text += chunk.value;
    } catch {
      // The stream ends when the test aborts it or the server closes.
    }
  })();
  return collected;
}

/** Sends a GET with a custom `Host` through `node:http`, which, unlike `fetch`, sends one, and returns the status. */
function requestWithHost(route: string, host: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const outgoing = request(`${state.origin}${route}`, { headers: { host } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    outgoing.once('error', reject);
    outgoing.end();
  });
}
// endregion | Helpers
