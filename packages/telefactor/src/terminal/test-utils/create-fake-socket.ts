import type { TerminalSocket } from '../create-terminal-sessions.ts';

/** A socket that records what it is sent and how it is closed, with a backlog and send callbacks that the test controls. */
export interface FakeSocket extends TerminalSocket {
  bufferedAmount: number;
  readonly received: string[];
  readonly closes: { code: number; reason: string }[];
  /** Runs the callbacks of every send so far, as `ws` does once the data is written. */
  flushSends(): void;
}

/** Creates a fake socket. */
export function createFakeSocket(): FakeSocket {
  const received: string[] = [];
  const closes: { code: number; reason: string }[] = [];
  let callbacks: (() => void)[] = [];
  return {
    bufferedAmount: 0,
    received,
    closes,
    send(data, callback) {
      received.push(Buffer.from(data).toString('utf8'));
      callbacks.push(() => callback());
    },
    close(code, reason) {
      closes.push({ code, reason });
    },
    flushSends() {
      const pending = callbacks;
      callbacks = [];
      for (const callback of pending) callback();
    },
  };
}
