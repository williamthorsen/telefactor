import { randomBytes } from 'node:crypto';
import { constants } from 'node:os';

import { SerializeAddon } from '@xterm/addon-serialize';
import xtermHeadless from '@xterm/headless';

import { KILL_GRACE_MS, killProcessGroup } from '#src/process/kill-process-group.ts';

/** The WebSocket close codes with which a session's socket ends, each with a reason that the page can show. */
export const TERMINAL_CLOSE_CODES = {
  /** The process exited; the reason describes the exit. */
  exited: 4000,
  /** Another socket attached to the session. */
  replaced: 4001,
  /** The session was ended by request or because the server closed. */
  ended: 4003,
  /** The session does not exist. */
  unknown: 4004,
} as const;

/** The size of a new session's grid, which the client's first resize replaces. */
const INITIAL_SIZE = { cols: 80, rows: 24 };

/** The largest grid dimension that a resize may set. */
const MAX_DIMENSION = 1000;

/** The lines of scrollback that a reattaching client receives. */
const SCROLLBACK_LINES = 1000;

/** The bytes buffered on a socket above which the pty stops reading until the socket drains. */
const HIGH_WATER_BYTES = 1024 * 1024;

const { Terminal: HeadlessTerminal } = xtermHeadless;

/** The part of a `node-pty` process that a session uses. */
export interface PtyProcess {
  readonly pid: number;
  onData(listener: (data: string) => void): unknown;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): unknown;
  write(data: Buffer): void;
  resize(cols: number, rows: number): void;
  pause(): void;
  resume(): void;
}

export type SpawnPty = (
  file: string,
  args: readonly string[],
  options: { cwd: string; env: Record<string, string>; cols: number; rows: number; name: string },
) => PtyProcess;

/** The part of a `ws` socket that a session uses. */
export interface TerminalSocket {
  readonly bufferedAmount: number;
  send(data: Uint8Array, callback: (error?: Error) => void): void;
  close(code: number, reason: string): void;
}

/** The handle through which an attached socket's messages reach its session. */
export interface TerminalAttachment {
  write(bytes: Uint8Array): void;
  resize(size: { cols: number; rows: number }): void;
  detach(): void;
}

export interface TerminalSession {
  id: string;
  harness: string;
}

export interface TerminalSessions {
  /** Starts the command in a new session; rejects when `node-pty` cannot load or the command cannot start. */
  create(argv: readonly string[], harness: string): Promise<TerminalSession>;
  /** Attaches a socket, replacing any attached one, or closes it with `unknown` when the session does not exist. */
  attach(id: string, socket: TerminalSocket): TerminalAttachment | undefined;
  /** Ends the session's process group; returns false when the session does not exist. */
  close(id: string): boolean;
  closeAll(): void;
}

export interface TerminalSessionsOptions {
  /** Returns the pty factory; called once, on the first session. */
  loadPty: () => Promise<SpawnPty>;
  workingDirectory: string;
  env?: Readonly<Record<string, string | undefined>>;
  killGraceMs?: number;
}

/**
 * Creates the store of interactive sessions. Each session runs its command in a pty and mirrors the output in a headless
 * terminal, from which an attaching socket receives the current screen before the live output.
 */
export function createTerminalSessions({
  loadPty,
  workingDirectory,
  env = process.env,
  killGraceMs = KILL_GRACE_MS,
}: TerminalSessionsOptions): TerminalSessions {
  const sessions = new Map<string, Session>();
  let spawnPtyPromise: Promise<SpawnPty> | undefined;

  function close(id: string): boolean {
    const session = sessions.get(id);
    if (session === undefined) return false;
    sessions.delete(id);
    session.client?.socket.close(TERMINAL_CLOSE_CODES.ended, 'The session was ended.');
    session.client = undefined;
    killProcessGroup(session.pty.pid, 'SIGHUP');
    setTimeout(() => killProcessGroup(session.pty.pid, 'SIGKILL'), killGraceMs).unref();
    return true;
  }

  return {
    async create(argv, harness) {
      const [file, ...args] = argv;
      if (file === undefined) throw new Error('The interactive command is empty.');
      spawnPtyPromise ??= loadPty();
      const spawnPty = await spawnPtyPromise;
      const pty = spawnPty(file, args, {
        cwd: workingDirectory,
        env: { ...definedEntries(env), TERM: 'xterm-256color', COLORTERM: 'truecolor' },
        name: 'xterm-256color',
        ...INITIAL_SIZE,
      });
      const headless = new HeadlessTerminal({ ...INITIAL_SIZE, scrollback: SCROLLBACK_LINES, allowProposedApi: true });
      const serializer = new SerializeAddon();
      headless.loadAddon(serializer);
      const session: Session = {
        id: randomBytes(32).toString('base64url'),
        harness,
        pty,
        headless,
        serializer,
        client: undefined,
      };
      sessions.set(session.id, session);

      pty.onData((data) => {
        headless.write(data);
        const { client } = session;
        if (client === undefined) return;
        const bytes = Buffer.from(data, 'utf8');
        if (client.queue === undefined) sendToClient(session, client, bytes);
        else client.queue.push(bytes);
      });
      pty.onExit(({ exitCode, signal }) => {
        if (sessions.get(session.id) === session) sessions.delete(session.id);
        session.client?.socket.close(TERMINAL_CLOSE_CODES.exited, describeExit(exitCode, signal));
        session.client = undefined;
        headless.dispose();
      });
      return { id: session.id, harness };
    },

    attach(id, socket) {
      const session = sessions.get(id);
      if (session === undefined) {
        socket.close(TERMINAL_CLOSE_CODES.unknown, 'The session does not exist.');
        return;
      }
      if (session.client !== undefined) {
        session.client.socket.close(TERMINAL_CLOSE_CODES.replaced, 'The session was opened elsewhere.');
        releaseClient(session);
      }
      const client: Client = { socket, queue: [], isPausing: false };
      session.client = client;
      // Writes parse asynchronously, so the snapshot waits until every chunk received so far is on the screen.
      session.headless.write('', () => {
        if (session.client !== client || client.queue === undefined) return;
        const queued = client.queue;
        client.queue = undefined;
        sendToClient(session, client, Buffer.from(session.serializer.serialize(), 'utf8'));
        for (const bytes of queued) sendToClient(session, client, bytes);
      });

      return {
        write(bytes) {
          if (session.client === client) session.pty.write(Buffer.from(bytes));
        },
        resize({ cols, rows }) {
          if (session.client !== client || !isDimension(cols) || !isDimension(rows)) return;
          session.pty.resize(cols, rows);
          session.headless.resize(cols, rows);
        },
        detach() {
          if (session.client === client) releaseClient(session);
        },
      };
    },

    close,

    closeAll() {
      for (const id of sessions.keys()) close(id);
    },
  };
}

// region | Helpers
interface Session extends TerminalSession {
  pty: PtyProcess;
  headless: InstanceType<typeof HeadlessTerminal>;
  serializer: SerializeAddon;
  client: Client | undefined;
}

interface Client {
  socket: TerminalSocket;
  /** The output held back while the snapshot is prepared; `undefined` once it is sent. */
  queue: Uint8Array[] | undefined;
  isPausing: boolean;
}

/** Returns the entries whose value is defined, which is the shape that a spawned process's environment takes. */
function definedEntries(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) entries[key] = value;
  }
  return entries;
}

/** Describes how the process ended: `exited with code 0` or `exited on signal SIGHUP`. */
function describeExit(exitCode: number, signal: number | undefined): string {
  if (signal === undefined || signal === 0) return `exited with code ${exitCode}`;
  const name = Object.entries(constants.signals).find(([, value]) => value === signal)?.[0];
  return `exited on signal ${name ?? signal}`;
}

function isDimension(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 1 && value <= MAX_DIMENSION;
}

/** Detaches the session's client, resuming the pty if the client's backlog paused it. */
function releaseClient(session: Session): void {
  if (session.client?.isPausing === true) session.pty.resume();
  session.client = undefined;
}

/** Sends output to the client, pausing the pty while the socket's backlog is above the high-water mark. */
function sendToClient(session: Session, client: Client, bytes: Uint8Array): void {
  client.socket.send(bytes, () => {
    if (!(client.isPausing && session.client === client && client.socket.bufferedAmount < HIGH_WATER_BYTES)) {
      return;
    }

    client.isPausing = false;
    session.pty.resume();
  });
  if (!(!client.isPausing && client.socket.bufferedAmount >= HIGH_WATER_BYTES)) {
    return;
  }

  client.isPausing = true;
  session.pty.pause();
}
// endregion | Helpers
