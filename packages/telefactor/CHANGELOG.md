# Changelog

All notable changes to this project will be documented in this file.

## 0.3.0 — 2026-11-08

### 🎉 Features

- Adds a `builtIn` option, shaped like the config file's `{ harnesses, default }` keys, to the `telefactor` plugin and to `readHarnessSettings`, so that an app's own harnesses replace the package's recipes when neither the environment variable nor the config file defines any. (#23)
- Includes `CHANGELOG.md` and `.meta/changelog.json`, the machine-readable changelog, in the published `@williamthorsen/telefactor` package. (#27)

### 🧪 Tests

- Fixes the issue that `create-terminal-sessions.tool.test.ts` failed intermittently: It asserted that the input echo came before the resize report, and the pty does not order the two, so the test now waits for `got:hello` before it resizes and then waits for `cols=100` separately. (#30)

### 📦 Dependencies

- Upgrade eslint-config-typescript to 20.3.0 (#25)

  Upgrades `@williamthorsen/eslint-config-typescript` from 20.2.0 to 20.3.0 and rewrites the state-store call-order test to wait on a promise that the test releases rather than on a real timer, which the release's new `sky-pilot/no-real-time-sleep` rule reports in test files.

- Replaces `jsdom` 30.1.3 with `happy-dom` 21.0.4 as the DOM test environment in `packages/telefactor` and `apps/playground`, and removes jsdom's dependency tree from `pnpm-lock.yaml`. (#28)

## 0.2.0 — 2026-11-07

### 🎉 Features

- Adds a `job` option to the Vite plugin, which runs an app-defined job declared with `defineJob` and implemented with `implementJob`: `POST /jobs` accepts the job's own request fields and refuses one that the job does not take, the job's `prepare` step supplies the harness command's placeholder values and reads the result, and `createTelefactorClient({ job })` types the request and the result by the declaration. (#21)
- Adds a `config` option to the Vite plugin, a zod object that declares the app's own keys in `telefactor.config.json`, which `readHarnessSettings` returns as `settings.app` with their defaults when the file is absent; the plugin still reports any other unknown key and refuses a schema that names one of the package's keys. (#21)
- Adds a `commandVariable` option to the Vite plugin, which names the environment variable that is read in place of `TELEFACTOR_HARNESS_COMMAND` and is named in the error for a malformed value. (#21)

## 0.1.0 — 2026-11-07

### 🎉 Features

- Adds the `@williamthorsen/telefactor` package, whose `telefactor` Vite plugin mounts routes under `/api/telefactor` for listing and testing harnesses and for starting, reading, and cancelling headless jobs, and whose `@williamthorsen/telefactor/client` entry point provides a typed fetch client for those routes. (#9)
- Adds harness selection, in which the plugin reads the harnesses from the `TELEFACTOR_HARNESS_COMMAND` environment variable, else from `telefactor.config.json` in the Vite root, else from built-in recipes for `claude-code`, `codex`, and `rovo-dev`, and in which a request names a harness rather than a command. (#9)
- Adds limits on each job, under which the plugin fails a job that exceeds its timeout (10 minutes by default, 120 at most) or writes more than 1 MiB of stdout and stops every process in the harness's process group when a job is cancelled or times out, and adds request guards that refuse with `403` a request that is not from a loopback address, names a host other than a loopback one, or comes from another origin. (#9)
- Adds the `apps/playground` React app, whose page lists the configured harnesses, tests the selected one, and starts, polls, and cancels a headless job, and links it from the package README as a complete example of mounting the plugin and driving the client. (#10)
- Adds `defineContract` from the new `@williamthorsen/telefactor/contract` entry and `implementContract` from `./server`, which together declare a session state schema and the handlers of the actions that change it. (#12)
- Adds a `contract` option to the `telefactor` Vite plugin, with which the dev server serves the state at `/state` and `/state/events`, runs actions at `/actions/:name`, and serves each action and a `get_state` tool to an agent harness at the MCP endpoint `/mcp`, whose URL it logs at startup. (#12)
- Adds `createContractClient` to `@williamthorsen/telefactor/client`, which calls a contract's actions from the page, reads the state, and subscribes to state changes, reconnecting after a dropped connection. (#12)
- Adds `HarnessTerminal`, a React 19 component exported from `@williamthorsen/telefactor/react`, which starts the harness's interactive session on the dev server, shows it in an embedded terminal, and reattaches to it after a reload, with Claude Code and Codex connected to the app's MCP endpoint without any setup. (#18)
- Adds the `interactive` and `mcpArgs` keys to a harness recipe, which set the command that starts a terminal session and the arguments that connect it to the MCP endpoint, with `{mcpUrl}` expanded to the endpoint's URL. (#18)
- Adds `createTerminalSession`, `closeTerminalSession`, and `terminalSocketUrl` to the client returned by `createTelefactorClient`, for a page that connects its own terminal to a session without React. (#18)
- Adds a `change` field to the state snapshot returned by `GET /state`, `/state/events`, `POST /actions/:name`, and the MCP tools, which names the action that made the latest commit and its `origin`: `agent` for an MCP tool call, `page` for a route call. (#19)
- Adds the `useAgentSession` hook to `@williamthorsen/telefactor/react`, which returns the typed session state, a `call` that resolves whether the action committed rather than rejecting, the latest error, and an `announcement` of each commit made by the agent, worded by an optional `describeChange`. (#19)
- Adds the `HarnessPicker` component, which lists the harnesses and tests the selected one, and the `RequestError` component, which shows a failed request with the problems that the routes reported, to `@williamthorsen/telefactor/react`. (#19)

### ⚙️ Tooling

- Adds a `prepublishOnly` script that runs `nmr build` to `packages/telefactor/package.json`, so that a pack from a clean checkout contains the `dist/esm` files named by the package's `exports` and passes the tarball check of `release-kit prepare`. (#15)

### 📦 Dependencies

- Adds `node-pty` 1.2.0-beta.18 as a dependency, whose install script pnpm runs only when `allowBuilds` in the consumer's `pnpm-workspace.yaml` lists `node-pty`. (#18)

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
