import { describe, expect, it } from 'vitest';

import type { HarnessSettingsResult } from '#src/harness/read-settings.ts';
import type { Harness } from '#src/harness/settings-schema.ts';
import type { Jobs } from '#src/jobs/create-jobs.ts';
import type { TerminalSessions } from '#src/terminal/create-terminal-sessions.ts';

import { createTelefactorApp, type TerminalRoutesOptions } from '../create-app.ts';

const MCP_URL = 'http://localhost:5176/api/telefactor/mcp';

const HARNESSES: Record<string, Harness> = {
  interactive: { command: ['i', '-p'], interactive: ['i'], mcpArgs: ['--mcp', '{mcpUrl}'] },
  headless: { command: ['h', '-p'] },
};

describe('createTelefactorApp terminal routes', () => {
  it('starts a session of the default harness with the MCP arguments', async () => {
    const { app, creates } = createFixture();

    const response = await postSession(app, {});

    expect(response.status).toBe(201);
    expect(await response.json()).toStrictEqual({ id: 'session-1', harness: 'interactive' });
    expect(creates).toStrictEqual([{ argv: ['i', '--mcp', MCP_URL], harness: 'interactive' }]);
  });

  it('starts a session without the MCP arguments when no endpoint is served', async () => {
    const { app, creates } = createFixture({ resolveMcpUrl: () => ({ ok: true, mcpUrl: undefined }) });

    await postSession(app, { harness: 'interactive' });

    expect(creates).toStrictEqual([{ argv: ['i'], harness: 'interactive' }]);
  });

  it('refuses a body that is not sent as JSON', async () => {
    const { app } = createFixture();

    const response = await app.request('/terminal/sessions', { method: 'POST', body: '{}' });

    expect(response.status).toBe(415);
  });

  it('lists the problems of an invalid body', async () => {
    const { app } = createFixture();

    const response = await postSession(app, { harness: 3 });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ problems: [{ path: 'harness' }] });
  });

  it.each([
    ['an unknown harness', { harness: 'missing' }, 404, '"missing" does not name a harness.'],
    [
      'a harness without an interactive command',
      { harness: 'headless' },
      409,
      'The harness headless has no interactive command.',
    ],
  ])('refuses %s', async (_case, body, status, error) => {
    const { app } = createFixture();

    const response = await postSession(app, body);

    expect(response.status).toBe(status);
    expect(await response.json()).toStrictEqual({ error });
  });

  it('refuses a session while the endpoint cannot be resolved', async () => {
    const { app } = createFixture({
      resolveMcpUrl: () => ({ ok: false, error: 'The dev server is not listening yet.' }),
    });

    const response = await postSession(app, {});

    expect(response.status).toBe(503);
    expect(await response.json()).toStrictEqual({ error: 'The dev server is not listening yet.' });
  });

  it('reports a session that could not start', async () => {
    const { app } = createFixture({ createError: new Error('Cannot find module node-pty') });

    const response = await postSession(app, {});

    expect(response.status).toBe(500);
    expect(await response.json()).toStrictEqual({
      error: 'The session could not start: Cannot find module node-pty',
    });
  });

  it('ends a session', async () => {
    const { app } = createFixture();

    const response = await app.request('/terminal/sessions/session-1', { method: 'DELETE' });

    expect(await response.json()).toStrictEqual({ id: 'session-1', harness: 'interactive' });
  });

  it('answers 404 for ending an unknown session', async () => {
    const { app } = createFixture();

    const response = await app.request('/terminal/sessions/missing', { method: 'DELETE' });

    expect(response.status).toBe(404);
    expect(await response.json()).toStrictEqual({ error: 'The session does not exist.' });
  });

  it('serves no terminal routes without terminal sessions', async () => {
    const { app } = createFixture({ withTerminal: false });

    expect((await postSession(app, {})).status).toBe(404);
  });
});

// region | Helpers
/** Creates the app over fake terminal sessions, and returns the sessions that it asked them to create. */
function createFixture({
  resolveMcpUrl = () => ({ ok: true, mcpUrl: MCP_URL }),
  createError,
  withTerminal = true,
}: {
  resolveMcpUrl?: TerminalRoutesOptions['resolveMcpUrl'];
  createError?: Error;
  withTerminal?: boolean;
} = {}) {
  const creates: { argv: readonly string[]; harness: string }[] = [];
  const settings: HarnessSettingsResult = {
    ok: true,
    source: 'file',
    configPath: '/app/telefactor.config.json',
    hasConfigFile: true,
    settings: { default: 'interactive', timeoutMinutes: 10, harnesses: HARNESSES, app: {} },
  };
  const sessions: TerminalSessions = {
    create: (argv, harness) => {
      if (createError !== undefined) return Promise.reject(createError);
      creates.push({ argv, harness });
      return Promise.resolve({ id: 'session-1', harness });
    },
    attach: () => undefined,
    close: (id) => (id === 'session-1' ? { id, harness: 'interactive' } : undefined),
    closeAll: () => {},
  };
  const jobs: Jobs = {
    cancel: () => Promise.resolve({ ok: false, reason: 'not-found' }),
    cancelAll: () => Promise.resolve(),
    get: () => Promise.resolve(undefined),
    start: () => Promise.reject(new Error('Jobs are not used here.')),
  };
  const app = createTelefactorApp({
    jobs,
    readSettings: () => Promise.resolve(settings),
    runTest: () => Promise.reject(new Error('Tests are not used here.')),
    isAllowed: () => true,
    ...(withTerminal && { terminal: { sessions, resolveMcpUrl } }),
  });
  return { app, creates };
}

function postSession(app: ReturnType<typeof createFixture>['app'], body: unknown): Promise<Response> {
  return Promise.resolve(
    app.request('/terminal/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}
// endregion | Helpers
