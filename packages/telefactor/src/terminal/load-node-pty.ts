import type { SpawnPty } from './create-terminal-sessions.ts';

/** Imports `node-pty`, whose native module loads only when the first session starts, and returns its `spawn`. */
export async function loadNodePty(): Promise<SpawnPty> {
  const nodePty = await import('node-pty');
  return (file, args, options) => nodePty.spawn(file, [...args], options);
}
