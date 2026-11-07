import type { RawData } from 'ws';

/** Decodes a `ws` message as UTF-8 text. */
export function readMessageText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data).toString('utf8');
}
