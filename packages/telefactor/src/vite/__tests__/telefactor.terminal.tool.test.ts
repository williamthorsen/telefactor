import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createServer, type ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { terminalSessionSchema } from '#src/http/route-schemas.ts';
import { TERMINAL_CLOSE_CODES } from '#src/terminal/terminal-close-codes.ts';
import { implementCounter } from '#src/test-utils/counter-contract.ts';
import { readMessageText } from '#src/test-utils/read-message-text.ts';

import { telefactor } from '../telefactor.ts';

const FIXTURE = path.join(import.meta.dirname, '..', '..', 'terminal', '__tests__', 'fixtures', 'interactive.mjs');

const state: { root: string; server: ViteDevServer | undefined; origin: string } = {
  root: '',
  server: undefined,
  origin: '',
};

beforeEach(async () => {
  state.root = await mkdtemp(path.join(tmpdir(), 'telefactor-terminal-'));
  const config = {
    harnesses: {
      fixture: { command: ['unused'], interactive: [process.execPath, FIXTURE], mcpArgs: ['--mcp={mcpUrl}'] },
    },
  };
  await writeFile(path.join(state.root, 'telefactor.config.json'), JSON.stringify(config));
  const server = await createServer({
    root: state.root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: true },
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

describe('telefactor terminal', () => {
  it('runs the interactive command with the MCP endpoint and carries it over the socket', async () => {
    const { id } = await startSession();
    const socket = openSocket(id);
    const received: string[] = [];
    socket.on('message', (data) => {
      received.push(readMessageText(data));
    });

    await vi.waitFor(() =>
      expect(received.join('')).toContain(
        `args=--mcp=http://127.0.0.1:${new URL(state.origin).port}/api/telefactor/mcp`,
      ),
    );
    socket.close();
  });

  it('ends the session through the route and closes its socket', async () => {
    const { id } = await startSession();
    const socket = openSocket(id);
    const closed = new Promise<number>((resolve) => socket.on('close', resolve));
    await new Promise((resolve) => socket.once('open', resolve));

    const response = await fetch(`${state.origin}/api/telefactor/terminal/sessions/${id}`, { method: 'DELETE' });

    expect(response.status).toBe(200);
    expect(await closed).toBe(TERMINAL_CLOSE_CODES.ended);
  });

  it("leaves Vite's HMR socket working beside the terminal socket", async () => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Vite offers no other way to open its HMR socket.
    const token = state.server?.config.webSocketToken ?? '';
    const hmr = new WebSocket(`${state.origin.replace('http', 'ws')}/?token=${token}`, 'vite-hmr');

    const first = await new Promise<string>((resolve) => hmr.once('message', (data) => resolve(readMessageText(data))));

    expect(JSON.parse(first)).toMatchObject({ type: 'connected' });
    hmr.close();
  });
});

// region | Helpers
function openSocket(id: string): WebSocket {
  return new WebSocket(`${state.origin.replace('http', 'ws')}/api/telefactor/terminal/sessions/${id}/socket`, {
    headers: { origin: state.origin },
  });
}

async function startSession(): Promise<{ id: string }> {
  const response = await fetch(`${state.origin}/api/telefactor/terminal/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  expect(response.status).toBe(201);
  return terminalSessionSchema.parse(await response.json());
}
// endregion | Helpers
