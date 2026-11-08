import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTelefactorClient } from '#src/client/create-telefactor-client.ts';
import { HARNESS_COMMAND_VARIABLE } from '#src/harness/read-settings.ts';
import { KILL_GRACE_MS } from '#src/process/kill-process-group.ts';

import { DEFAULT_CONFIG_FILE, telefactor } from '../telefactor.ts';

const state: { root: string; pidFile: string; server: ViteDevServer | undefined; origin: string } = {
  root: '',
  pidFile: '',
  server: undefined,
  origin: '',
};

beforeAll(async () => {
  // A harness command in the environment would replace the config file's harnesses.
  vi.stubEnv(HARNESS_COMMAND_VARIABLE, undefined);
  state.root = await mkdtemp(path.join(tmpdir(), 'telefactor-harness-test-'));
  state.pidFile = path.join(state.root, 'test.pid');
  // The test command records its pid, then idles until it is stopped.
  const idle = `require('node:fs').writeFileSync(${JSON.stringify(state.pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`;
  const config = {
    harnesses: { idle: { command: [process.execPath], test: [process.execPath, '--eval', idle] } },
  };
  await writeFile(path.join(state.root, DEFAULT_CONFIG_FILE), JSON.stringify(config));
  const server = await createServer({
    root: state.root,
    configFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: true },
    plugins: [telefactor()],
  });
  await server.listen();
  state.server = server;
  const address = server.httpServer?.address();
  if (address === null || address === undefined || typeof address === 'string')
    throw new Error('Expected a TCP address.');
  state.origin = `http://127.0.0.1:${(address satisfies AddressInfo).port}`;
});

afterAll(async () => {
  // A failed run leaves the test command running in its own process group, outside the server's reach.
  try {
    const pid = await readPid(state.pidFile);
    if (isRunning(pid)) process.kill(-pid, 'SIGKILL');
  } catch {
    // The command never started.
  }
  await state.server?.close();
  vi.unstubAllEnvs();
  await rm(state.root, { recursive: true, force: true });
});

describe('telefactor harness test', () => {
  it(
    'stops the test command when the client aborts the request',
    async () => {
      const client = createTelefactorClient({ basePath: `${state.origin}/api/telefactor` });
      const controller = new AbortController();

      const rejection = expect(client.testHarness('idle', { signal: controller.signal })).rejects.toMatchObject({
        name: 'AbortError',
      });
      const pid = await vi.waitFor(() => readPid(state.pidFile), { timeout: 5000 });
      controller.abort();

      await rejection;
      await expect.poll(() => isRunning(pid), { timeout: KILL_GRACE_MS + 2000 }).toBe(false);
    },
    KILL_GRACE_MS + 10_000,
  );
});

// region | Helpers
/** Reports whether a process with the pid exists. */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Reads the pid that the test command recorded; rejects until it has. */
async function readPid(file: string): Promise<number> {
  const pid = Number.parseInt(await readFile(file, 'utf8'), 10);
  if (Number.isNaN(pid)) throw new TypeError(`${file} does not contain a pid yet.`);
  return pid;
}
// endregion | Helpers
