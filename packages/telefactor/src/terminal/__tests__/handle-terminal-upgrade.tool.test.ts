import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';

import { isAllowedUpgradeRequest } from '#src/http/request-guards.ts';
import { readMessageText } from '#src/test-utils/read-message-text.ts';

import { createTerminalSessions, type TerminalSessions } from '../create-terminal-sessions.ts';
import { createTerminalUpgradeHandler } from '../handle-terminal-upgrade.ts';
import { TERMINAL_CLOSE_CODES } from '../terminal-close-codes.ts';
import { createFakeSpawnPty, type FakePty } from '../test-utils/create-fake-pty.ts';

const BASE_PATH = '/api/telefactor';

const state: { server: Server | undefined; port: number; sessions: TerminalSessions | undefined; ptys: FakePty[] } = {
  server: undefined,
  port: 0,
  sessions: undefined,
  ptys: [],
};

beforeEach(async () => {
  vi.spyOn(process, 'kill').mockImplementation(() => true);
  const fake = createFakeSpawnPty();
  const sessions = createTerminalSessions({ loadPty: () => Promise.resolve(fake.spawnPty), workingDirectory: '/' });
  const server = createServer();
  server.on(
    'upgrade',
    createTerminalUpgradeHandler({ basePath: BASE_PATH, sessions, isAllowed: isAllowedUpgradeRequest }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected a TCP address.');
  Object.assign(state, { server, port: (address satisfies AddressInfo).port, sessions, ptys: fake.ptys });
});

afterEach(async () => {
  state.sessions?.closeAll();
  state.server?.closeAllConnections();
  await new Promise((resolve) => state.server?.close(resolve));
  vi.restoreAllMocks();
});

describe(createTerminalUpgradeHandler, () => {
  it('attaches a same-origin socket, carrying output, input, and resizes', async () => {
    const { id } = await createSession();
    state.ptys[0]?.emitData('prompt> ');
    const socket = openSocket(id);
    const received: string[] = [];
    socket.on('message', (data) => {
      received.push(readMessageText(data));
    });
    await waitForOpen(socket);

    await vi.waitFor(() => expect(received.join('')).toContain('prompt> '));
    socket.send(Buffer.from('ls\r'), { binary: true });
    socket.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
    socket.send('not json');

    await vi.waitFor(() => {
      expect(state.ptys[0]?.written).toStrictEqual(['ls\r']);
      expect(state.ptys[0]?.sizes).toStrictEqual([{ cols: 120, rows: 40 }]);
    });
    socket.close();
  });

  it('closes a socket that names an unknown session', async () => {
    const socket = openSocket('missing');

    const { code } = await waitForClose(socket);

    expect(code).toBe(TERMINAL_CLOSE_CODES.unknown);
  });

  it.each([
    ['a cross-origin upgrade', { origin: 'http://attacker.example' }],
    ['an upgrade that names a non-loopback host', { host: 'attacker.example' }],
  ])('refuses %s with 403', async (_case, headers) => {
    const { id } = await createSession();
    const socket = openSocket(id, headers);

    const status = await new Promise<number | undefined>((resolve) => {
      socket.on('unexpected-response', (_request, response) => {
        resolve(response.statusCode);
      });
      socket.on('error', () => resolve(undefined));
    });

    expect(status).toBe(403);
  });

  it('leaves an upgrade for another path to the other listeners', async () => {
    const other = new WebSocketServer({ noServer: true });
    state.server?.on('upgrade', (request, socket, head) => {
      if (request.url === '/elsewhere')
        other.handleUpgrade(request, socket, head, (webSocket) => webSocket.close(1000));
    });
    const socket = new WebSocket(`ws://127.0.0.1:${state.port}/elsewhere`);

    expect((await waitForClose(socket)).code).toBe(1000);
    other.close();
  });
});

// region | Helpers
function createSession(): Promise<{ id: string }> {
  if (state.sessions === undefined) throw new Error('The sessions are not set up.');
  return state.sessions.create(['harness'], 'harness');
}

function openSocket(id: string, headers: { origin?: string; host?: string } = {}): WebSocket {
  const origin = `http://127.0.0.1:${state.port}`;
  return new WebSocket(`ws://127.0.0.1:${state.port}${BASE_PATH}/terminal/sessions/${id}/socket`, {
    headers: { origin, ...headers },
  });
}

function waitForClose(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    socket.on('close', (code, reason) => resolve({ code, reason: reason.toString('utf8') }));
  });
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
}
// endregion | Helpers
