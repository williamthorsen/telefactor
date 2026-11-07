import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { type RawData, WebSocketServer } from 'ws';
import { z } from 'zod';

import type { TerminalSessions } from './create-terminal-sessions.ts';

/** The largest message that a client may send; keystrokes and resizes are far smaller. */
const MAX_PAYLOAD_BYTES = 1024 * 1024;

const resizeMessageSchema = z.object({
  type: z.literal('resize'),
  cols: z.number(),
  rows: z.number(),
});

export interface TerminalUpgradeOptions {
  basePath: string;
  sessions: TerminalSessions;
  /** Decides whether an upgrade request may reach a session; a refused one gets `403`. */
  isAllowed: (request: IncomingMessage) => boolean;
}

/**
 * Creates the `upgrade` listener that attaches a WebSocket at `{basePath}/terminal/sessions/:id/socket` to its session.
 * Binary frames carry input, and a JSON text frame resizes the grid. An upgrade for any other path is left to the
 * server's other listeners.
 */
export function createTerminalUpgradeHandler({
  basePath,
  sessions,
  isAllowed,
}: TerminalUpgradeOptions): (request: IncomingMessage, socket: Duplex, head: Buffer) => void {
  const server = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });
  const socketPath = new RegExp(`^${escapeRegExp(basePath)}/terminal/sessions/([^/]+)/socket$`);

  return (request, socket, head) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const id = socketPath.exec(pathname)?.[1];
    if (id === undefined) return;
    if (!isAllowed(request)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    server.handleUpgrade(request, socket, head, (webSocket) => {
      // `ws` closes the socket after an error, such as an oversized frame; a socket without a listener throws instead.
      webSocket.on('error', () => {});
      const attachment = sessions.attach(decodePathSegment(id), webSocket);
      if (attachment === undefined) return;
      webSocket.on('message', (data, isBinary) => {
        if (isBinary) {
          attachment.write(toBytes(data));
          return;
        }
        const message = resizeMessageSchema.safeParse(parseJson(toBytes(data)));
        if (message.success) attachment.resize(message.data);
      });
      webSocket.on('close', () => {
        attachment.detach();
      });
    });
  };
}

// region | Helpers
/** Decodes a path segment, keeping a malformed one as it is, which then names no session. */
function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

/** Parses a text frame as JSON, returning `undefined` for one that is not. */
function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    return undefined;
  }
}

function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return Buffer.concat(data);
  return data instanceof ArrayBuffer ? new Uint8Array(data) : data;
}
// endregion | Helpers
