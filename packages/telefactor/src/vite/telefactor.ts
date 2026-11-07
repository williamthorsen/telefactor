import path from 'node:path';

import { getRequestListener, type Http2Bindings, type HttpBindings } from '@hono/node-server';
import type { Plugin } from 'vite';
import type { z } from 'zod';

import { createStateStore } from '#src/contract/create-state-store.ts';
import type { ContractImplementation } from '#src/contract/implement-contract.ts';
import { HARNESS_COMMAND_VARIABLE, readEnvironmentCommand, readHarnessSettings } from '#src/harness/read-settings.ts';
import { runHarnessTest } from '#src/harness/run-harness-test.ts';
import { buildHarnessConfigSchema } from '#src/harness/settings-schema.ts';
import { createTelefactorApp } from '#src/http/create-app.ts';
import {
  isAllowedUpgradeRequest,
  isLoopbackRequest,
  isSameOriginRequest,
  readRequestHost,
} from '#src/http/request-guards.ts';
import { createHarnessRun } from '#src/jobs/create-harness-run.ts';
import { createJobs } from '#src/jobs/create-jobs.ts';
import type { JobImplementation } from '#src/jobs/implement-job.ts';
import { createInMemoryJobStore } from '#src/jobs/in-memory-job-store.ts';
import { createTerminalSessions } from '#src/terminal/create-terminal-sessions.ts';
import { createTerminalUpgradeHandler } from '#src/terminal/handle-terminal-upgrade.ts';
import { loadNodePty } from '#src/terminal/load-node-pty.ts';

/** The path under which the plugin mounts the routes when the options name none. */
export const DEFAULT_BASE_PATH = '/api/telefactor';

/** The config file that the plugin reads when the options name none, resolved against the Vite root. */
export const DEFAULT_CONFIG_FILE = 'telefactor.config.json';

export interface TelefactorPluginOptions {
  /** The path under which the routes are mounted; defaults to `/api/telefactor`. */
  basePath?: string;
  /**
   * The schema of the app's own keys in the config file, which the file may then hold beside the package's. An app reads
   * their values with `readHarnessSettings` and the same schema. Its keys may not name the package's keys, and an
   * object-level refinement on it is not applied.
   */
  config?: z.ZodObject;
  /** The environment variable whose JSON argv replaces every other harness; defaults to `TELEFACTOR_HARNESS_COMMAND`. */
  commandVariable?: string;
  /** The config file, resolved against the Vite root; defaults to `telefactor.config.json`. */
  configPath?: string;
  /** The contract whose state and actions the page's routes and the MCP endpoint serve, from `implementContract`. */
  contract?: ContractImplementation;
  /** The job that `POST /jobs` runs, from `implementJob`; defaults to the built-in prompt job. */
  job?: JobImplementation;
  /** The directory in which harnesses run, resolved against the Vite root; defaults to the root. */
  workingDirectory?: string;
}

/**
 * Creates the Vite plugin that serves the harness, job, and terminal routes and the terminal socket on the dev server,
 * and with a contract, its state, actions, and MCP endpoint. It stops the server on a malformed
 * harness command variable, re-reads the config file on each request that needs it, logs the MCP endpoint's URL
 * once the server listens, and cancels running jobs and ends terminal sessions when the server closes.
 */
export function telefactor({
  basePath = DEFAULT_BASE_PATH,
  commandVariable = HARNESS_COMMAND_VARIABLE,
  config,
  configPath = DEFAULT_CONFIG_FILE,
  contract,
  job,
  workingDirectory = '.',
}: TelefactorPluginOptions = {}): Plugin {
  // Refuse an app config schema that names a package key while the Vite config loads.
  if (config !== undefined) buildHarnessConfigSchema(config);

  return {
    name: 'telefactor',
    apply: 'serve',
    configureServer(server) {
      const { root } = server.config;
      // A malformed variable cannot change without a restart.
      readEnvironmentCommand(process.env, commandVariable);
      const resolvedConfigPath = path.resolve(root, configPath);
      const resolvedWorkingDirectory = path.resolve(root, workingDirectory);

      const jobs = createJobs({
        run: createHarnessRun({ workingDirectory: resolvedWorkingDirectory, ...(job !== undefined && { job }) }),
        store: createInMemoryJobStore(),
      });
      const sessions = createTerminalSessions({ loadPty: loadNodePty, workingDirectory: resolvedWorkingDirectory });
      const { httpServer } = server;
      const app = createTelefactorApp<{ Bindings: Http2Bindings | HttpBindings }>({
        jobs,
        ...(job !== undefined && { job: job.declaration }),
        ...(contract !== undefined && { store: createStateStore(contract) }),
        terminal: {
          sessions,
          resolveMcpUrl: () => {
            if (httpServer === null) {
              return {
                ok: false,
                error: "The terminal needs Vite's own HTTP server, which middleware mode does not start.",
              };
            }
            if (contract === undefined) return { ok: true, mcpUrl: undefined };
            const local = server.resolvedUrls?.local[0];
            if (local === undefined) return { ok: false, error: 'The dev server is not listening yet.' };
            return { ok: true, mcpUrl: `${new URL(local).origin}${basePath}/mcp` };
          },
        },
        readSettings: () => {
          const options = { env: process.env, configPath: resolvedConfigPath, commandVariable };
          return config === undefined ? readHarnessSettings(options) : readHarnessSettings({ ...options, config });
        },
        runTest: (argv, signal) => runHarnessTest({ argv, workingDirectory: resolvedWorkingDirectory, signal }),
        isAllowed: (context) =>
          isLoopbackRequest({
            host: readRequestHost(context.req.header('host'), context.env.incoming),
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
      if (contract !== undefined) {
        // Vite resolves its URLs in a `listening` listener that runs before this one.
        server.httpServer?.once('listening', () => {
          const local = server.resolvedUrls?.local[0];
          if (local === undefined) return;
          server.config.logger.info(`telefactor MCP endpoint: ${new URL(local).origin}${basePath}/mcp`);
        });
      }
      httpServer?.on(
        'upgrade',
        createTerminalUpgradeHandler({ basePath, sessions, isAllowed: isAllowedUpgradeRequest }),
      );
      httpServer?.once('close', () => {
        void jobs.cancelAll();
        sessions.closeAll();
      });
    },
  };
}
