import { createMcpHandler } from '@modelcontextprotocol/server';
import { type Context, type Env, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import {
  describeRefusal,
  type RunOutcome,
  type StateSnapshot,
  type StateStore,
} from '#src/contract/create-state-store.ts';
import type { HarnessSettingsResult } from '#src/harness/read-settings.ts';
import { findHarness } from '#src/harness/settings-schema.ts';
import type { Jobs } from '#src/jobs/create-jobs.ts';
import { createMcpServer } from '#src/mcp/create-mcp-server.ts';
import { formatIssuePath } from '#src/schemas/problem.ts';

import { type HarnessList, type HarnessTestResult, startJobRequestSchema } from './route-schemas.ts';

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
}

/**
 * Creates the HTTP app that lists and tests harnesses under `/harnesses` and starts, reads, and cancels `/jobs`. With a
 * store, it also serves the session state at `/state`, pushes each change from `/state/events`, runs actions at
 * `/actions/:name`, and serves them to an agent as MCP tools at `/mcp`.
 */
export function createTelefactorApp<E extends Env>({
  jobs,
  readSettings,
  runTest,
  isAllowed,
  store,
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
    // Refuse a body that a cross-site form or a `text/plain` fetch can send without a CORS preflight.
    if (!isJsonMediaType(context.req.header('content-type'))) {
      return context.json({ error: 'The body must be sent as application/json.' }, 415);
    }
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ problems: [{ path: '', message: 'The body is not valid JSON.' }] }, 400);
    }
    const parsed = startJobRequestSchema.safeParse(body);
    if (!parsed.success) {
      const problems = parsed.error.issues.map((issue) => ({
        path: formatIssuePath(issue.path),
        message: `${issue.message}.`,
      }));
      return context.json({ problems }, 400);
    }
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
      if (!isJsonMediaType(context.req.header('content-type'))) {
        return context.json({ error: 'The body must be sent as application/json.' }, 415);
      }
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json({ problems: [{ path: '', message: 'The body is not valid JSON.' }] }, 400);
      }
      return respondToOutcome(context, await store.run(context.req.param('name'), body));
    });

    const mcpHandler = createMcpHandler(() => createMcpServer(store.contract, store));
    app.all('/mcp', (context) => mcpHandler.fetch(context.req.raw));
  }

  app.notFound((context) => context.json({ error: 'The route does not exist.' }, 404));

  return app;
}

// region | Helpers
/** Reports whether a `Content-Type` header names `application/json`, with or without parameters. */
function isJsonMediaType(contentType: string | undefined): boolean {
  return contentType?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
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
