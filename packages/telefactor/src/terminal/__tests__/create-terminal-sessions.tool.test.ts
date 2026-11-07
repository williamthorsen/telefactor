import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTerminalSessions, TERMINAL_CLOSE_CODES, type TerminalSessions } from '../create-terminal-sessions.ts';
import { loadNodePty } from '../load-node-pty.ts';
import { createFakeSocket, type FakeSocket } from '../test-utils/create-fake-socket.ts';

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'interactive.mjs');

describe('createTerminalSessions on a real pty', () => {
  let sessions: TerminalSessions | undefined;

  afterEach(() => {
    sessions?.closeAll();
  });

  it('carries output, input, and resizes, and replays the screen to a later socket', async () => {
    sessions = createTerminalSessions({
      loadPty: loadNodePty,
      workingDirectory: import.meta.dirname,
      killGraceMs: 200,
    });
    const { id } = await sessions.create([process.execPath, FIXTURE], 'fixture');
    const first = createFakeSocket();
    const attachment = sessions.attach(id, first);

    await vi.waitFor(() => expect(readAll(first)).toContain('cols=80'));
    attachment?.write(new TextEncoder().encode('hello'));
    attachment?.resize({ cols: 100, rows: 30 });
    await vi.waitFor(() => expect(readAll(first)).toMatch(/got:hello[\s\S]*cols=100/));
    attachment?.detach();

    const second = createFakeSocket();
    sessions.attach(id, second);

    await vi.waitFor(() => expect(second.received[0]).toMatch(/ready pid=\d+[\s\S]*got:hello/));
  });

  it('reports the exit code of a process that exits', async () => {
    sessions = createTerminalSessions({ loadPty: loadNodePty, workingDirectory: import.meta.dirname });
    const { id } = await sessions.create([process.execPath, FIXTURE], 'fixture');
    const socket = createFakeSocket();
    const attachment = sessions.attach(id, socket);
    await vi.waitFor(() => expect(readAll(socket)).toContain('ready'));

    attachment?.write(new TextEncoder().encode('exit'));

    await vi.waitFor(() =>
      expect(socket.closes).toStrictEqual([{ code: TERMINAL_CLOSE_CODES.exited, reason: 'exited with code 7' }]),
    );
  });

  it('ends the whole process group on close', async () => {
    sessions = createTerminalSessions({
      loadPty: loadNodePty,
      workingDirectory: import.meta.dirname,
      killGraceMs: 200,
    });
    const { id } = await sessions.create([process.execPath, FIXTURE], 'fixture');
    const socket = createFakeSocket();
    sessions.attach(id, socket);
    await vi.waitFor(() => expect(readAll(socket)).toMatch(/ready pid=\d+/));
    const pidText = /ready pid=(\d+)/.exec(readAll(socket))?.[1];
    if (pidText === undefined) throw new Error('The fixture did not report its grandchild.');
    const grandchildPid = Number(pidText);

    sessions.close(id);

    await vi.waitFor(() => expect(isRunning(grandchildPid)).toBe(false));
  });
});

// region | Helpers
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readAll(socket: FakeSocket): string {
  return socket.received.join('');
}
// endregion | Helpers
