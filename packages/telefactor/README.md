<!-- readme-type: library -->

# telefactor

A library that lets a web app work with the agent harness that the user already has installed and signed in to (Claude Code, Codex, or Rovo Dev), from the app's Vite dev server: The page embeds the harness's interactive session in a terminal or hands it prompts, and the agent drives the app through the same actions that the page calls.

<!-- section:release-notes --><!-- /section:release-notes -->

## Install

```shell
pnpm add @williamthorsen/telefactor
```

The embedded terminal runs on [`node-pty`](https://github.com/microsoft/node-pty), a native module with prebuilt binaries for macOS and Linux. pnpm runs its install script only when the workspace allows it, in `pnpm-workspace.yaml`:

```yaml
allowBuilds:
  node-pty: true
```

## Use

```ts
// vite.config.ts
import { telefactor } from '@williamthorsen/telefactor/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [telefactor()] });
```

The dev server then runs headless jobs through the user's harness, and the page drives them with the client:

```ts
import { createTelefactorClient } from '@williamthorsen/telefactor/client';

const client = createTelefactorClient();
const job = await client.startJob({ prompt: 'Summarize README.md' });
const finished = await client.getJob(job.id); // poll until `status` is no longer `running`
```

Each request method takes an optional `{ signal }` as its last argument. Aborting the signal aborts the request, which rejects with the `AbortError` from `fetch` rather than with a `TelefactorRequestError`. Aborting `testHarness` also stops the test on the dev server.

The [playground app](https://github.com/williamthorsen/telefactor/tree/main/apps/playground) is a complete example: [`vite.config.ts`](https://github.com/williamthorsen/telefactor/blob/main/apps/playground/vite.config.ts) mounts the plugin, and its page lists the harnesses, tests one, and runs, polls, and cancels a job.

A finished job is `done` with its harness's stdout as `result.output` (or the result of the app's own [job](#jobs)), `failed` with an `error` that names how the run ended and quotes the end of its stdout and stderr, or `cancelled`. The library spawns the user's installed CLI and never reads or forwards its credentials.

## Contract

A contract names the session state and the actions that change it. The page and the agent share it: The plugin serves each action to the page as a route and to the agent as an MCP tool, and both run the same handler on the server.

```ts
// src/counter-contract.ts, imported by the page and the server
import { defineContract } from '@williamthorsen/telefactor/contract';
import { z } from 'zod';

export const counterContract = defineContract({
  state: z.object({ count: z.number().int() }),
  actions: {
    add: { description: 'Adds an amount to the count.', input: z.object({ amount: z.number().int() }) },
    reset: { description: 'Sets the count to 0.' },
  },
});
```

```ts
// vite.config.ts: the handlers run on the dev server, so they may use Node APIs
import { implementContract } from '@williamthorsen/telefactor/server';
import { telefactor } from '@williamthorsen/telefactor/vite';
import { defineConfig } from 'vite';

import { counterContract } from './src/counter-contract.ts';

const contract = implementContract(counterContract, {
  initialState: { count: 0 },
  handlers: {
    add: (state, { amount }) => ({ count: state.count + amount }),
    reset: () => ({ count: 0 }),
  },
});

export default defineConfig({ plugins: [telefactor({ contract })] });
```

In the page, `useAgentSession` from the `./react` entry subscribes to the state and returns it with a typed `call`. Its `announcement` describes each change that the agent makes, for a status region:

```tsx
import { createContractClient } from '@williamthorsen/telefactor/client';
import { RequestError, useAgentSession } from '@williamthorsen/telefactor/react';

const client = createContractClient(counterContract);

function Counter() {
  const { state, call, error, announcement } = useAgentSession(client);
  return (
    <>
      <button type="button" onClick={() => void call('add', { amount: 2 })}>
        Add 2 to {state?.count}
      </button>
      <p role="status">{announcement && <span key={announcement.version}>{announcement.text}</span>}</p>
      {error !== undefined && <RequestError error={error} />}
    </>
  );
}
```

`call` resolves whether the action committed and never rejects; a refusal sets `error`. Without React, `client.subscribe(listener)` delivers the current snapshot, then each change, and `client.call(name, input)` runs an action.

An action name must be a valid MCP tool name, and `get_state` is reserved. An action without `input` takes an empty object. The dev server holds one session state in memory, shared by every tab and reset on restart, and runs one action at a time. It commits a handler's result only when the state schema accepts it, so an action whose input fails its schema, whose handler throws, or whose result fails the state schema leaves the state unchanged.

### Connecting a harness

A harness started in the [embedded terminal](#terminal) connects to the endpoint without any setup, except Rovo Dev. With a contract, the dev server logs its MCP endpoint when it starts, `http://localhost:<port>/api/telefactor/mcp` by default. It serves one tool per action and a `get_state` tool, each returning the resulting state with its `version` and `change`. To connect Claude Code:

```shell
claude mcp add --transport http my-app http://localhost:5173/api/telefactor/mcp
```

Or, for one session, pass a config file to `claude --mcp-config`:

```json
{ "mcpServers": { "my-app": { "type": "http", "url": "http://localhost:5173/api/telefactor/mcp" } } }
```

Rovo Dev reads its MCP servers only from its own config, so add the endpoint there with `acli rovodev mcp`, as an `http` server at the logged URL.

## Terminal

The `./react` entry exports `HarnessTerminal`, which starts the harness's interactive session on the dev server and shows it in an embedded terminal, with the harness's own UI and permission prompts. It needs React 19, and the page imports the terminal's stylesheet:

```tsx
import { createTelefactorClient } from '@williamthorsen/telefactor/client';
import { HarnessTerminal } from '@williamthorsen/telefactor/react';
import '@williamthorsen/terminal-react/styles.css';

<HarnessTerminal client={createTelefactorClient()} harness="claude-code" />;
```

The session runs the harness's `interactive` command in the working directory, with the recipe's `mcpArgs` appended when the plugin serves a contract, so that the agent can drive the page. A reload reattaches to the running session and restores its screen; the tab keeps the session's id in `sessionStorage`. The session ends when the user ends it, when the harness exits, or when the dev server closes, and the component says which. Its other props are `unavailableReason`, which disables Start session and shows the reason, `theme` (xterm's `ITheme`), and `className`. The custom property `--telefactor-terminal-height` sets the terminal's height, `20rem` by default.

## Harness picker

The `./react` entry also exports `HarnessPicker`, which lists the harnesses, preselects the default one, and tests the selected one. It stops a running test when it unmounts. It reports the selected harness's entry, or `undefined` while none can run, as when the config file has problems:

```tsx
const [harness, setHarness] = useState<HarnessEntry>();

<HarnessPicker client={client} harness={harness?.name} onHarnessChange={setHarness} />;
```

`HarnessEntry` comes from the `./client` entry. `RequestError` shows a failed request with the problems that the routes reported. Both components are unstyled and take a `className` for their root.

## Harnesses

The plugin chooses its harnesses from the first of these sources that defines any:

1. The `TELEFACTOR_HARNESS_COMMAND` environment variable, or the one that the `commandVariable` option names.
2. The config file.
3. The built-in harnesses: the plugin's `builtIn` option when set, else the package's recipes for `claude-code` (the default), `codex`, and `rovo-dev`, defined in [`built-in-harnesses.ts`](https://github.com/williamthorsen/telefactor/blob/main/packages/telefactor/src/harness/built-in-harnesses.ts).

A request names a harness; no route accepts a command. Each built-in recipe runs with its harness's default permission mode, so a tool that needs approval is denied in a headless run. To grant more, define the harness in the config file, or in the `builtIn` option, with the flags that the harness's CLI documents.

### Config file

`telefactor.config.json` in the Vite root. The plugin re-reads it on each request, so that an edit applies at once.

```json
{
  "default": "claude-code",
  "timeoutMinutes": 10,
  "harnesses": {
    "claude-code": {
      "label": "Claude Code",
      "command": ["claude", "-p", "--allowedTools", "Read"],
      "test": ["claude", "-p", "Reply with OK."],
      "interactive": ["claude"],
      "mcpArgs": ["--mcp-config", "{\"mcpServers\":{\"app\":{\"type\":\"http\",\"url\":\"{mcpUrl}\"}}}"]
    }
  }
}
```

- `harnesses`: The recipes, by name. When present, they replace the built-ins rather than add to them. Each recipe has a `command` argv, an optional `test` argv that passes on exit code 0, an optional `interactive` argv that starts the [terminal](#terminal) session, optional `mcpArgs` that the plugin appends to `interactive` when it serves a contract, with `{mcpUrl}` expanded to the MCP endpoint's URL, and an optional `label`.
- `default`: The harness that runs a job whose request names none. It may be omitted when the file defines one harness or does not define `harnesses`.
- `timeoutMinutes`: The time after which a job is stopped and fails. Defaults to 10; at most 120.

The file may also hold the app's own keys, which the plugin's `config` option declares as a zod object. The plugin still reports a key that neither defines, and the app reads its values, with their defaults when the file is absent, from `readHarnessSettings` with the same schema:

```ts
const appConfig = z.object({ promptsDirectory: z.string().default('prompts') });

telefactor({ config: appConfig });
const resolved = await readHarnessSettings({ env: process.env, configPath, config: appConfig });
if (resolved.ok) console.log(resolved.settings.app.promptsDirectory);
```

`readHarnessSettings` also takes the plugin's `builtIn` value, so that the settings that an app reads, or writes out as a config template, are the ones that the plugin runs.

### Environment variable

`TELEFACTOR_HARNESS_COMMAND`, or the variable that the `commandVariable` option names, is a JSON array of strings, such as `["my-agent", "--headless"]`. When set, it replaces every other harness with one named `environment`, which has no interactive command, and the config file's `timeoutMinutes` still applies. The plugin reads it when the dev server starts and stops the server on a malformed value.

### Prompt delivery

In the built-in job, the prompt goes to the command's stdin, which is then closed. `{prompt}` in a `command` argument expands to the prompt text, for a harness that does not read stdin, as Rovo Dev does not. A prompt that starts with `-` can then be read as a flag. Put secrets in the environment rather than in an argv, because `GET /harnesses` returns each recipe's command to the page.

## Jobs

A job states how the harness's command runs and what the job returns. The built-in job delivers the prompt as [above](#prompt-delivery) and returns stdout. An app declares its own with `defineJob`, which the page and the server both import, and implements it on the server with `implementJob`:

```ts
// src/note-job.ts, imported by the page and the server
import { defineJob } from '@williamthorsen/telefactor/contract';
import { z } from 'zod';

export const noteJob = defineJob({ input: z.object({ name: z.string() }), result: z.object({ text: z.string() }) });
```

```ts
// vite.config.ts
import { implementJob } from '@williamthorsen/telefactor/server';

const job = implementJob(noteJob, {
  async prepare({ id, prompt, input }) {
    const promptPath = await writePromptFile(id, input.name, prompt);
    const outputPath = outputPathFor(id, input.name);
    return {
      placeholders: { prompt: promptPath, output: outputPath },
      stdin: '',
      read: async () => ({ text: await readFile(outputPath, 'utf8') }),
      release: (outcome) => removeJobFiles(id, outcome),
    };
  },
});

export default defineConfig({ plugins: [telefactor({ job })] });
```

`prepare` runs before each run. In the harness's `command`, each `{name}` that `placeholders` defines expands to its value, once. `read` returns the result once the command exits with code 0, and the server checks it against the declared schema. `release` learns whether the job was `done`, `failed`, `timed-out`, or `cancelled` once the command has ended. A job keeps the built-in job's timeout, cancel, and failure reporting. The page passes the declaration to the client, which then sends the job's fields and parses its result:

```ts
const client = createTelefactorClient({ job: noteJob });
const started = await client.startJob({ prompt: 'Draft a note', name: 'today' });
```

## Plugin options

| Option             | Default                      | Effect                                                                    |
| ------------------ | ---------------------------- | ------------------------------------------------------------------------- |
| `basePath`         | `/api/telefactor`            | The path under which the routes are mounted.                              |
| `builtIn`          | the package's recipes        | The [built-in harnesses](#harnesses), as `{ harnesses, default }`.        |
| `commandVariable`  | `TELEFACTOR_HARNESS_COMMAND` | The [environment variable](#environment-variable) that defines a harness. |
| `config`           | none                         | The zod object of the app's own keys in the [config file](#config-file).  |
| `configPath`       | `telefactor.config.json`     | The config file, resolved against the Vite root.                          |
| `contract`         | none                         | The result of `implementContract`, which the routes serve.                |
| `job`              | the built-in job             | The result of `implementJob`, which `POST /jobs` runs.                    |
| `workingDirectory` | the Vite root                | The directory in which harnesses run, resolved likewise.                  |

The client takes the same `basePath`, and the declaration of the same `job`.

## Routes

The plugin mounts these routes on the dev server only (`vite build` and `vite preview` do not have them):

- `GET /harnesses` lists the harnesses, or the problems of a config file that cannot be used.
- `POST /harnesses/:name/test` runs a harness's `test` command, for at most 60 seconds.
- `POST /jobs` starts a job from a JSON body `{ "prompt": "…", "harness": "…" }` and the job's own fields; `harness` is optional, and a field that the job does not take is refused with `400`.
- `GET /jobs/:id` reads a job, and `DELETE /jobs/:id` cancels it.
- `POST /terminal/sessions` starts an interactive session from a JSON body `{ "harness": "…" }`, in which `harness` is optional, and returns `{ "id": …, "harness": … }`. The `id` is the session's credential. It refuses a harness without an `interactive` command with `409`, and answers `503` before the server listens and in Vite's middleware mode.
- `DELETE /terminal/sessions/:id` ends a session.
- `/terminal/sessions/:id/socket` is the session's WebSocket, which speaks [`terminal-react`'s wire protocol](https://github.com/williamthorsen/showroom/tree/main/packages/terminal-react#wire-protocol). One socket is attached at a time. The server closes it with `4000` when the harness exits (the reason states the exit), `4001` when another socket attaches, `4003` when the session is ended, and `4004` for an unknown session; `TERMINAL_CLOSE_CODES` exports them.

With a contract, it also mounts:

- `GET /state` reads the session state as `{ "version": …, "state": …, "change": … }`, in which `version` counts the changes committed and `change` names the action that made the latest one and its `origin`: `agent` for an MCP tool call, `page` for a route call. The state at version 0 does not have a `change`.
- `GET /state/events` streams the state as server-sent `state` events: the current state on connect, then each change.
- `POST /actions/:name` runs an action with a JSON body as its input and returns the new state. It refuses an unknown action with `404`, input that fails its schema with `400`, an action whose handler throws with `422`, and a handler result that fails the state schema with `500`.
- `/mcp`, the MCP endpoint over Streamable HTTP.

Every route and the socket refuse, with `403`, a request that does not come from a loopback address, that names a host other than `localhost`, `127.0.0.1`, or `[::1]`, or that a browser marks as coming from another origin. `POST /jobs`, `POST /actions/:name`, and `POST /terminal/sessions` refuse a body that is not `application/json`. A job's stdout is capped at 1 MiB, and a run that writes more fails. Running jobs are cancelled and terminal sessions ended when the dev server closes.

Cancelling or timing out a job stops every process that the harness started: The harness runs in its own process group, which gets SIGTERM, then SIGKILL five seconds later. Ending a terminal session sends the group SIGHUP, then SIGKILL five seconds later. Process groups make the library POSIX-only; it does not support Windows.

## Scripts

Workspace scripts (`build`, `check`, `lint`, `test`, `typecheck`) are run with `nmr` — see [Running scripts](../../README.md#running-scripts) in the root README. Run `nmr` from this directory to list this package's scripts.
