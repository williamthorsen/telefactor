import { type Context, type Env, Hono } from 'hono';

import type { HarnessSettingsResult } from '#src/harness/read-settings.ts';
import { findHarness } from '#src/harness/settings-schema.ts';
import type { Jobs } from '#src/jobs/create-jobs.ts';
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
}

/** Creates the HTTP app that lists and tests harnesses under `/harnesses` and starts, reads, and cancels `/jobs`. */
export function createTelefactorApp<E extends Env>({
  jobs,
  readSettings,
  runTest,
  isAllowed,
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
      harnesses: Object.entries(settings.harnesses).map(([name, { label = name, command, test }]) => ({
        name,
        label,
        command,
        testable: test !== undefined,
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

  app.notFound((context) => context.json({ error: 'The route does not exist.' }, 404));

  return app;
}

// region | Helpers
/** Reports whether a `Content-Type` header names `application/json`, with or without parameters. */
function isJsonMediaType(contentType: string | undefined): boolean {
  return contentType?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';
}
// endregion | Helpers
