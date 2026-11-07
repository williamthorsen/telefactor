# Changelog

All notable changes to this project will be documented in this file.

## 0.2.0 — 2026-11-07

### 🎉 Features

- Adds a `job` option to the Vite plugin, which runs an app-defined job declared with `defineJob` and implemented with `implementJob`: `POST /jobs` accepts the job's own request fields and refuses one that the job does not take, the job's `prepare` step supplies the harness command's placeholder values and reads the result, and `createTelefactorClient({ job })` types the request and the result by the declaration. (#21)
- Adds a `config` option to the Vite plugin, a zod object that declares the app's own keys in `telefactor.config.json`, which `readHarnessSettings` returns as `settings.app` with their defaults when the file is absent; the plugin still reports any other unknown key and refuses a schema that names one of the package's keys. (#21)
- Adds a `commandVariable` option to the Vite plugin, which names the environment variable that is read in place of `TELEFACTOR_HARNESS_COMMAND` and is named in the error for a malformed value. (#21)

## 0.1.0 — 2026-11-07

### 🎉 Features

- Licenses the repo and the `_workspace` scaffold under ISC by adding a `LICENSE` file and replacing `UNLICENSED` in both manifests, so that a library created from the scaffold can be published. (#8)
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
- Adds a terminal panel to the playground, which runs the selected harness's interactive session through `HarnessTerminal`. (#18)
- Adds a `change` field to the state snapshot returned by `GET /state`, `/state/events`, `POST /actions/:name`, and the MCP tools, which names the action that made the latest commit and its `origin`: `agent` for an MCP tool call, `page` for a route call. (#19)
- Adds the `useAgentSession` hook to `@williamthorsen/telefactor/react`, which returns the typed session state, a `call` that resolves whether the action committed rather than rejecting, the latest error, and an `announcement` of each commit made by the agent, worded by an optional `describeChange`. (#19)
- Adds the `HarnessPicker` component, which lists the harnesses and tests the selected one, and the `RequestError` component, which shows a failed request with the problems that the routes reported, to `@williamthorsen/telefactor/react`. (#19)
- Adds a status line to the playground's notes panel that announces each change made by the agent, and replaces the playground's own session code, `HarnessPanel`, `ProblemList`, and `RequestError` with the package's hook and components. (#19)

### 🐛 Bug fixes

- Fixes the issue that a `JobPanel` poll settling after a cancel, but before React committed the cancelled job, replaced that job with a running one or showed the poll's error. (#16)
- Fixes the issue that a `JobPanel` cancel settling after a later job had started replaced the job then shown with the cancelled one or showed the cancel's error. (#16)

### 🏗️ Internal features

- Adds a notes contract and a notes panel to the playground, through which both the page and a connected agent add, select, and remove notes. (#12)

### 🧪 Tests

- Runs the `JobPanel` tests on fake timers advanced inside `act`, so that they no longer depend on real waits or on when React flushes effects. (#16)

### ⚙️ Tooling

- Renames the root package to `telefactor` and the `_workspace` scaffold to `telefactor-workspace-template`, resets both to version 0.0.0 with empty changelogs, and points their homepage, bugs, and repository URLs at `williamthorsen/telefactor`. (#8)
- Removes the `api`, `cdk`, `chrome`, `nextjs`, and `react` starter apps, together with the catalog entries, root devDependencies, and `scope:*` labels that only those apps used. (#8)
- Removes the template's readyup drift kit, the migration guides under `docs/migrations/` to which its fix messages linked, and the fleet drift sweep that `nmr drift:sweep` ran. (#8)
- Adds a `prepublishOnly` script that runs `nmr build` to `packages/telefactor/package.json`, so that a pack from a clean checkout contains the `dist/esm` files named by the package's `exports` and passes the tarball check of `release-kit prepare`. (#15)

### 📦 Dependencies

- Adds `node-pty` 1.2.0-beta.18 as a dependency, whose install script pnpm runs only when `allowBuilds` in the consumer's `pnpm-workspace.yaml` lists `node-pty`. (#18)

### 🤖 Agentic support

- Deletes the `initialize-node-monorepo` skill, which initializes a repo cloned from the template and does not apply to this repo now that it is initialized. (#8)
- States in `AGENTS.md` that a compiled library, which declares `#src` in tsconfig `paths`, also needs a `vitest.config.ts` that passes `tsconfigPaths: true`, because Vitest does not read `paths` on its own. (#9)
- Lists the action contract and its MCP endpoint in the `packages/telefactor` entry of `AGENTS.md`. (#12)
- Adds the playground's `add-sample-note` skill, which directs the agent to add a note through the `addNote` tool of the `telefactor` MCP server and to report the number of notes. (#18)

### 📚 Documentation

- Rewrites the README, `AGENTS.md`, and `docs/new-package.md` to describe telefactor rather than the template and its starter apps. (#8)

<!-- Generated by release-kit. Do not edit this file. Use .meta/changelog-overrides.json to override entries. -->
