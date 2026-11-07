import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { createTerminalSessions } from '../create-terminal-sessions.ts';
import { TERMINAL_CLOSE_CODES } from '../terminal-close-codes.ts';
import { createFakeSpawnPty } from '../test-utils/create-fake-pty.ts';
import { createFakeSocket } from '../test-utils/create-fake-socket.ts';

describe(createTerminalSessions, () => {
  let killSpy: MockInstance<typeof process.kill>;

  beforeEach(() => {
    // The fake ptys' pids name no real process group, and a signal must never reach one by accident.
    killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('spawns the command in the working directory with a color terminal', async () => {
    const { sessions, ptys } = createFixture({ env: { HOME: '/home/u', UNSET: undefined } });

    const session = await sessions.create(['claude', '--flag'], 'claude-code');

    expect(session).toStrictEqual({ id: expect.stringMatching(/^[\w-]{43}$/), harness: 'claude-code' });
    expect(ptys[0]).toMatchObject({
      file: 'claude',
      args: ['--flag'],
      options: {
        cwd: '/repo',
        cols: 80,
        rows: 24,
        env: { HOME: '/home/u', TERM: 'xterm-256color', COLORTERM: 'truecolor' },
      },
    });
    expect(ptys[0]?.options.env).not.toHaveProperty('UNSET');
  });

  it('rejects an empty command', async () => {
    const { sessions } = createFixture();

    await expect(sessions.create([], 'x')).rejects.toThrow('The interactive command is empty.');
  });

  it('loads the pty factory once', async () => {
    const { spawnPty } = createFakeSpawnPty();
    const loadPty = vi.fn(() => Promise.resolve(spawnPty));
    const sessions = createTerminalSessions({ loadPty, workingDirectory: '/repo' });

    await sessions.create(['a'], 'a');
    await sessions.create(['b'], 'b');

    expect(loadPty).toHaveBeenCalledTimes(1);
  });

  it('sends the current screen on attach, then live output', async () => {
    const { sessions, ptys } = createFixture();
    const { id } = await sessions.create(['a'], 'a');
    ptys[0]?.emitData('before\r\n');
    const socket = createFakeSocket();

    sessions.attach(id, socket);
    ptys[0]?.emitData('during');
    await vi.waitFor(() => expect(socket.received).toHaveLength(2));
    ptys[0]?.emitData('after');

    expect(socket.received[0]).toContain('before');
    expect(socket.received.slice(1)).toStrictEqual(['during', 'after']);
  });

  it('restores the screen for a socket that attaches later', async () => {
    const { sessions, ptys } = createFixture();
    const { id } = await sessions.create(['a'], 'a');
    const first = createFakeSocket();
    sessions.attach(id, first)?.detach();
    ptys[0]?.emitData('kept while detached');
    const second = createFakeSocket();

    sessions.attach(id, second);

    await vi.waitFor(() => expect(second.received[0]).toContain('kept while detached'));
  });

  it('closes the attached socket when another one attaches', async () => {
    const { sessions, ptys } = createFixture();
    const { id } = await sessions.create(['a'], 'a');
    const first = createFakeSocket();
    const firstAttachment = sessions.attach(id, first);

    sessions.attach(id, createFakeSocket());
    firstAttachment?.write(new TextEncoder().encode('ignored'));

    expect(first.closes).toStrictEqual([
      { code: TERMINAL_CLOSE_CODES.replaced, reason: 'The session was opened elsewhere.' },
    ]);
    expect(ptys[0]?.written).toStrictEqual([]);
  });

  it('closes a socket that names an unknown session', () => {
    const { sessions } = createFixture();
    const socket = createFakeSocket();

    expect(sessions.attach('missing', socket)).toBeUndefined();
    expect(socket.closes).toStrictEqual([
      { code: TERMINAL_CLOSE_CODES.unknown, reason: 'The session does not exist.' },
    ]);
  });

  it('passes input to the pty', async () => {
    const { sessions, ptys } = createFixture();
    const { id } = await sessions.create(['a'], 'a');

    sessions.attach(id, createFakeSocket())?.write(new TextEncoder().encode('ls\r'));

    expect(ptys[0]?.written).toStrictEqual(['ls\r']);
  });

  it('applies a valid resize and ignores an invalid one', async () => {
    const { sessions, ptys } = createFixture();
    const { id } = await sessions.create(['a'], 'a');
    const attachment = sessions.attach(id, createFakeSocket());

    attachment?.resize({ cols: 120, rows: 40 });
    attachment?.resize({ cols: 0, rows: 40 });
    attachment?.resize({ cols: 1.5, rows: 40 });
    attachment?.resize({ cols: 120, rows: 1001 });

    expect(ptys[0]?.sizes).toStrictEqual([{ cols: 120, rows: 40 }]);
  });

  it('pauses the pty while the socket backlog is high and resumes once it drains', async () => {
    const { sessions, ptys } = createFixture();
    const { id } = await sessions.create(['a'], 'a');
    const socket = createFakeSocket();
    sessions.attach(id, socket);
    await vi.waitFor(() => expect(socket.received).toHaveLength(1));

    socket.bufferedAmount = 2 * 1024 * 1024;
    ptys[0]?.emitData('flood');
    const isPausedWhileFull = ptys[0]?.isPaused;
    socket.bufferedAmount = 0;
    socket.flushSends();

    expect(isPausedWhileFull).toBe(true);
    expect(ptys[0]?.isPaused).toBe(false);
  });

  it('reports the exit to the attached socket and forgets the session', async () => {
    const { sessions, ptys } = createFixture();
    const { id } = await sessions.create(['a'], 'a');
    const socket = createFakeSocket();
    sessions.attach(id, socket);

    ptys[0]?.emitExit({ exitCode: 3 });

    expect(socket.closes).toStrictEqual([{ code: TERMINAL_CLOSE_CODES.exited, reason: 'exited with code 3' }]);
    expect(sessions.close(id)).toBeUndefined();
  });

  it('names the signal that ended the process', async () => {
    const { sessions, ptys } = createFixture();
    const { id } = await sessions.create(['a'], 'a');
    const socket = createFakeSocket();
    sessions.attach(id, socket);

    ptys[0]?.emitExit({ exitCode: 0, signal: 1 });

    expect(socket.closes[0]?.reason).toBe('exited on signal SIGHUP');
  });

  it('ends the process group on close, then kills it after the grace period', async () => {
    vi.useFakeTimers();
    const { sessions, ptys } = createFixture({ killGraceMs: 100 });
    const { id } = await sessions.create(['a'], 'a');
    const socket = createFakeSocket();
    sessions.attach(id, socket);
    const pid = ptys[0]?.pid ?? 0;

    expect(sessions.close(id)).toStrictEqual({ id, harness: 'a' });
    expect(killSpy.mock.calls).toStrictEqual([[-pid, 'SIGHUP']]);
    vi.advanceTimersByTime(100);

    expect(killSpy.mock.calls).toStrictEqual([
      [-pid, 'SIGHUP'],
      [-pid, 'SIGKILL'],
    ]);
    expect(socket.closes).toStrictEqual([{ code: TERMINAL_CLOSE_CODES.ended, reason: 'The session was ended.' }]);
  });

  it('ends every session on closeAll', async () => {
    const { sessions } = createFixture();
    const first = await sessions.create(['a'], 'a');
    const second = await sessions.create(['b'], 'b');

    sessions.closeAll();

    expect(sessions.close(first.id)).toBeUndefined();
    expect(sessions.close(second.id)).toBeUndefined();
  });
});

// region | Helpers
function createFixture({
  env = {},
  killGraceMs,
}: { env?: Record<string, string | undefined>; killGraceMs?: number } = {}): ReturnType<typeof createFakeSpawnPty> & {
  sessions: ReturnType<typeof createTerminalSessions>;
} {
  const fake = createFakeSpawnPty();
  const sessions = createTerminalSessions({
    loadPty: () => Promise.resolve(fake.spawnPty),
    workingDirectory: '/repo',
    env,
    ...(killGraceMs !== undefined && { killGraceMs }),
  });
  return { ...fake, sessions };
}
// endregion | Helpers
