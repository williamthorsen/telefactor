import path from 'node:path';

import { getRequestListener, type Http2Bindings, type HttpBindings } from '@hono/node-server';
import type { Plugin } from 'vite';

import { readEnvironmentCommand, readHarnessSettings } from '#src/harness/read-settings.ts';
import { runHarnessTest } from '#src/harness/run-harness-test.ts';
import { createTelefactorApp } from '#src/http/create-app.ts';
import { isLoopbackRequest, isSameOriginRequest } from '#src/http/request-guards.ts';
import { createHarnessRun } from '#src/jobs/create-harness-run.ts';
import { createJobs } from '#src/jobs/create-jobs.ts';
import { createInMemoryJobStore } from '#src/jobs/in-memory-job-store.ts';

/** The path under which the plugin mounts the routes when the options name none. */
export const DEFAULT_BASE_PATH = '/api/telefactor';

/** The config file that the plugin reads when the options name none, resolved against the Vite root. */
export const DEFAULT_CONFIG_FILE = 'telefactor.config.json';

export interface TelefactorPluginOptions {
  /** The path under which the routes are mounted; defaults to `/api/telefactor`. */
  basePath?: string;
  /** The config file, resolved against the Vite root; defaults to `telefactor.config.json`. */
  configPath?: string;
  /** The directory in which harnesses run, resolved against the Vite root; defaults to the root. */
  workingDirectory?: string;
}

/**
 * Creates the Vite plugin that serves the harness and job routes on the dev server. It stops the server on a malformed
 * `TELEFACTOR_HARNESS_COMMAND`, re-reads the config file on each request that needs it, and cancels running jobs when
 * the server closes.
 */
export function telefactor({
  basePath = DEFAULT_BASE_PATH,
  configPath = DEFAULT_CONFIG_FILE,
  workingDirectory = '.',
}: TelefactorPluginOptions = {}): Plugin {
  return {
    name: 'telefactor',
    apply: 'serve',
    configureServer(server) {
      const { root } = server.config;
      // A malformed variable cannot change without a restart.
      readEnvironmentCommand(process.env);
      const resolvedConfigPath = path.resolve(root, configPath);
      const resolvedWorkingDirectory = path.resolve(root, workingDirectory);

      const jobs = createJobs({
        run: createHarnessRun({ workingDirectory: resolvedWorkingDirectory }),
        store: createInMemoryJobStore(),
      });
      const app = createTelefactorApp<{ Bindings: Http2Bindings | HttpBindings }>({
        jobs,
        readSettings: () => readHarnessSettings({ env: process.env, configPath: resolvedConfigPath }),
        runTest: (argv, signal) => runHarnessTest({ argv, workingDirectory: resolvedWorkingDirectory, signal }),
        isAllowed: (context) =>
          isLoopbackRequest({
            host: context.req.header('host'),
            remoteAddress: context.env.incoming.socket.remoteAddress,
          }) &&
          isSameOriginRequest({
            origin: context.req.header('origin'),
            secFetchSite: context.req.header('sec-fetch-site'),
            url: context.req.url,
          }),
      });
      // Keep Node's own global `Request` and `Response`, which the adapter otherwise replaces for the whole dev server.
      const listener = getRequestListener((request, env) => app.fetch(request, env), { overrideGlobalObjects: false });
      server.middlewares.use(basePath, (request, response) => {
        void listener(request, response);
      });
      server.httpServer?.once('close', () => {
        void jobs.cancelAll();
      });
    },
  };
}
