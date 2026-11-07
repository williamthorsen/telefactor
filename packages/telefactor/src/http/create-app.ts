import { createMcpHandler } from '@modelcontextprotocol/server';
import { type Context, type Env, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import {
  describeRefusal,
  type RunOutcome,
  type StateSnapshot,
  type StateStore,
} from '#src/contract/create-state-store.ts';
import { buildInteractiveArgv } from '#src/harness/build-interactive-argv.ts';
import type { HarnessSettingsResult } from '#src/harness/read-settings.ts';
import { findHarness } from '#src/harness/settings-schema.ts';
import type { Jobs } from '#src/jobs/create-jobs.ts';
import { createMcpServer } from '#src/mcp/create-mcp-server.ts';
import { describeError } from '#src/portable/describe-error.ts';
import { formatIssuePath, type Problem } from '#src/schemas/problem.ts';
import type { TerminalSessions } from '#src/terminal/create-terminal-sessions.ts';

import {
  type HarnessList,
  type HarnessTestResult,
  startJobRequestSchema,
  startTerminalSessionRequestSchema,
} from './route-schemas.ts';

const JOB_NOT_FOUND = 'The job does not exist.';

export interface TelefactorAppOptions<E extends Env> {
  jobs: Jobs;
  /** Resolves the harness settings; called on each request that needs them, so that an edit applies at once. */
  readSettings: () => Promise<HarnessSettingsResult>;
  /** Runs a harness's test command; stops it once `signal` is aborted. */
  runTest: (argv: readonly string[], signal: AbortSignal) => Promise<HarnessTestResult>;
  /** Decides whether a request may reach the routes; a rejected request gets `403`. */
  isAllowed: (context: Context<E>) => boolean;
  /** The session state that `/state` and `/actions` serve; without one, those paths do not exist. */
  store?: StateStore;
  /** The interactive sessions that `/terminal/sessions` starts and ends; without them, those paths do not exist. */
  terminal?: TerminalRoutesOptions;
}

export interface TerminalRoutesOptions {
  sessions: TerminalSessions;
  /** Returns the MCP endpoint's URL for a new session, `undefined` when none is served, or why no session can start. */
  resolveMcpUrl: () => { ok: true; mcpUrl: string | undefined } | { ok: false; error: string };
}

/**
 * Creates the HTTP app that lists and tests harnesses under `/harnesses` and starts, reads, and cancels `/jobs`. With a
 * store, it also serves the session state at `/state`, pushes each change from `/state/events`, runs actions at
 * `/actions/:name`, and serves them to an agent as MCP tools at `/mcp`. With terminal sessions, it starts and ends them
 * at `/terminal/sessions`.
 */
export function createTelefactorApp<E extends Env>({
  jobs,
  readSettings,
  runTest,
  isAllowed,
  store,
  terminal,
}: TelefactorAppOptions<E>): Hono<E> {
  const app = new Hono<E>();

  app.use(async (context, next) => {
    if (isAllowed(context)) {
      await next();
    } else {
      context.res = context.json({ error: 'Telefactor accepts only local, same-origin requests.' }, 403);
    }
  });

  app.get('/harnesses', async (context) => {
    const resolved = await readSettings();
    if (!resolved.ok) {
      return context.json({ source: resolved.source, configPath: resolved.configPath, problems: resolved.problems });
    }
    const { source, configPath, hasConfigFile, settings } = resolved;
    const list: HarnessList = {
      source,
      configPath,
      hasConfigFile,
      defaultHarness: settings.default,
      timeoutMinutes: settings.timeoutMinutes,
      harnesses: Object.entries(settings.harnesses).map(([name, { label = name, command, test, interactive }]) => ({
        name,
        label,
        command,
        testable: test !== undefined,
        interactive: interactive !== undefined,
      })),
    };
    return context.json(list);
  });

  app.post('/harnesses/:name/test', async (context) => {
    const resolved = await readSettings();
    if (!resolved.ok) return context.json({ problems: resolved.problems }, 400);
    const name = context.req.param('name');
    const harness = findHarness(resolved.settings, name);
    if (harness === undefined) return context.json({ error: `"${name}" does not name a harness.` }, 404);
    if (harness.test === undefined) return context.json({ error: `The harness ${name} has no test command.` }, 409);
    return context.json(await runTest(harness.test, context.req.raw.signal));
  });

  app.post('/jobs', async (context) => {
    const body = await readJsonBody(context);
    if (!body.ok) return body.response;
    const parsed = startJobRequestSchema.safeParse(body.value);
    if (!parsed.success) return context.json({ problems: describeIssues(parsed.error.issues) }, 400);
    const resolved = await readSettings();
    if (!resolved.ok) return context.json({ problems: resolved.problems }, 400);
    const { prompt, harness: harnessName = resolved.settings.default } = parsed.data;
    const harness = findHarness(resolved.settings, harnessName);
    if (harness === undefined) {
      return context.json(
        { problems: [{ path: 'harness', message: `"${harnessName}" does not name a harness.` }] },
        400,
      );
    }
    const timeoutMs = resolved.settings.timeoutMinutes * 60_000;
    return context.json(await jobs.start({ prompt }, { name: harnessName, command: harness.command, timeoutMs }), 201);
  });

  app.get('/jobs/:id', async (context) => {
    const job = await jobs.get(context.req.param('id'));
    return job === undefined ? context.json({ error: JOB_NOT_FOUND }, 404) : context.json(job);
  });

  app.delete('/jobs/:id', async (context) => {
    const outcome = await jobs.cancel(context.req.param('id'));
    if (outcome.ok) return context.json(outcome.job);
    return outcome.reason === 'not-found'
      ? context.json({ error: JOB_NOT_FOUND }, 404)
      : context.json({ error: 'The job has already finished.' }, 409);
  });

  if (store !== undefined) {
    app.get('/state', (context) => context.json(store.read()));

    app.get('/state/events', (context) =>
      streamSSE(context, async (stream) => {
        // Read and subscribe in the same turn, so that no commit falls between the first snapshot and the next.
        const initial = store.read();
        const unsubscribe = store.subscribe((snapshot) => void writeSnapshot(snapshot));
        async function writeSnapshot(snapshot: StateSnapshot): Promise<void> {
          await stream.writeSSE({ event: 'state', data: JSON.stringify(snapshot) });
        }
        await writeSnapshot(initial);
        await new Promise<void>((resolve) => {
          stream.onAbort(resolve);
        });
        unsubscribe();
      }),
    );

    app.post('/actions/:name', async (context) => {
      const body = await readJsonBody(context);
      if (!body.ok) return body.response;
      return respondToOutcome(context, await store.run(context.req.param('name'), body.value, 'page'));
    });

    const mcpHandler = createMcpHandler(() => createMcpServer(store.contract, store));
    app.all('/mcp', (context) => mcpHandler.fetch(context.req.raw));
  }

  if (terminal !== undefined) {
    app.post('/terminal/sessions', async (context) => {
      const body = await readJsonBody(context);
      if (!body.ok) return body.response;
      const parsed = startTerminalSessionRequestSchema.safeParse(body.value);
      if (!parsed.success) return context.json({ problems: describeIssues(parsed.error.issues) }, 400);
      const resolved = await readSettings();
      if (!resolved.ok) return context.json({ problems: resolved.problems }, 400);
      const { harness: harnessName = resolved.settings.default } = parsed.data;
      const harness = findHarness(resolved.settings, harnessName);
      if (harness === undefined) return context.json({ error: `"${harnessName}" does not name a harness.` }, 404);
      const endpoint = terminal.resolveMcpUrl();
      if (!endpoint.ok) return context.json({ error: endpoint.error }, 503);
      const argv = buildInteractiveArgv(harness, endpoint.mcpUrl);
      if (argv === undefined) {
        return context.json({ error: `The harness ${harnessName} has no interactive command.` }, 409);
      }
      try {
        return context.json(await terminal.sessions.create(argv, harnessName), 201);
      } catch (error) {
        return context.json({ error: `The session could not start: ${describeError(error)}` }, 500);
      }
    });

    app.delete('/terminal/sessions/:id', (context) => {
      const session = terminal.sessions.close(context.req.param('id'));
      return session === undefined
        ? context.json({ error: 'The session does not exist.' }, 404)
        : context.json(session);
    });
  }

  app.notFound((context) => context.json({ error: 'The route does not exist.' }, 404));

  return app;
}

// region | Helpers
function describeIssues(issues: readonly { path: PropertyKey[]; message: string }[]): Problem[] {
  return issues.map((issue) => ({ path: formatIssuePath(issue.path), message: `${issue.message}.` }));
}

/** Reports whether a `Content-Type` header names `application/json`, with or without parameters. */
function isJsonMediaType(contentType: string | undefined): boolean {
  return contentType?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}

/** Reads a JSON body, or returns the response that refuses it. */
async function readJsonBody<E extends Env>(
  context: Context<E>,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  // Refuse a body that a cross-site form or a `text/plain` fetch can send without a CORS preflight.
  if (!isJsonMediaType(context.req.header('content-type'))) {
    return { ok: false, response: context.json({ error: 'The body must be sent as application/json.' }, 415) };
  }
  try {
    return { ok: true, value: await context.req.json() };
  } catch {
    return {
      ok: false,
      response: context.json({ problems: [{ path: '', message: 'The body is not valid JSON.' }] }, 400),
    };
  }
}

/** Maps an action's outcome to its response: the snapshot, or the refusal with the status that names its cause. */
function respondToOutcome<E extends Env>(context: Context<E>, outcome: RunOutcome): Response {
  if (outcome.ok) return context.json(outcome.snapshot);
  switch (outcome.reason) {
    case 'unknown-action':
      return context.json({ error: outcome.message }, 404);
    case 'invalid-input':
      return context.json({ problems: outcome.problems }, 400);
    case 'handler-failed':
      return context.json({ error: describeRefusal(outcome) }, 422);
    case 'invalid-state':
      return context.json({ problems: outcome.problems }, 500);
  }
}
// endregion | Helpers
