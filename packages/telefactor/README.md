<!-- readme-type: library -->

# telefactor

A library that lets a web app hand a prompt to the agent harness that the user already has installed and signed in to (Claude Code, Codex, or Rovo Dev), from the app's Vite dev server.

<!-- section:release-notes --><!-- /section:release-notes -->

## Install

```shell
pnpm add @williamthorsen/telefactor
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

A finished job is `done` with its harness's stdout as `result.output`, `failed` with an `error` that names how the run ended and quotes the end of its stderr, or `cancelled`. The library spawns the user's installed CLI and never reads or forwards its credentials.

## Harnesses

The plugin chooses its harnesses from the first of these sources that defines any:

1. The `TELEFACTOR_HARNESS_COMMAND` environment variable.
2. The config file.
3. The built-in recipes for `claude-code` (the default), `codex`, and `rovo-dev`, defined in [`built-in-harnesses.ts`](https://github.com/williamthorsen/telefactor/blob/main/packages/telefactor/src/harness/built-in-harnesses.ts).

A request names a harness; no route accepts a command. Each built-in recipe runs with its harness's default permission mode, so a tool that needs approval is denied in a headless run. To grant more, define the harness in the config file with the flags that the harness's CLI documents.

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
      "test": ["claude", "-p", "Reply with OK."]
    }
  }
}
```

- `harnesses`: The recipes, by name. When present, they replace the built-ins rather than add to them. Each recipe has a `command` argv, an optional `test` argv that passes on exit code 0, and an optional `label`.
- `default`: The harness that runs a job whose request names none. It may be omitted when the file defines one harness or does not define `harnesses`.
- `timeoutMinutes`: The time after which a job is stopped and fails. Defaults to 10; at most 120.

### Environment variable

`TELEFACTOR_HARNESS_COMMAND` is a JSON array of strings, such as `["my-agent", "--headless"]`. When set, it replaces every other harness with one named `environment`, and the config file's `timeoutMinutes` still applies. The plugin reads it when the dev server starts and stops the server on a malformed value.

### Prompt delivery

The prompt goes to the command's stdin, which is then closed. `{prompt}` in a `command` argument expands to the prompt text, for a harness that does not read stdin, as Rovo Dev does not. A prompt that starts with `-` can then be read as a flag. Put secrets in the environment rather than in an argv, because `GET /harnesses` returns each recipe's command to the page.

## Plugin options

| Option             | Default                  | Effect                                                   |
| ------------------ | ------------------------ | -------------------------------------------------------- |
| `basePath`         | `/api/telefactor`        | The path under which the routes are mounted.             |
| `configPath`       | `telefactor.config.json` | The config file, resolved against the Vite root.         |
| `workingDirectory` | the Vite root            | The directory in which harnesses run, resolved likewise. |

The client takes the same `basePath`.

## Routes

The plugin mounts these routes on the dev server only (`vite build` and `vite preview` do not have them):

- `GET /harnesses` lists the harnesses, or the problems of a config file that cannot be used.
- `POST /harnesses/:name/test` runs a harness's `test` command, for at most 60 seconds.
- `POST /jobs` starts a job from a JSON body `{ "prompt": "…", "harness": "…" }`; `harness` is optional.
- `GET /jobs/:id` reads a job, and `DELETE /jobs/:id` cancels it.

The routes refuse, with `403`, a request that does not come from a loopback address, that names a host other than `localhost`, `127.0.0.1`, or `[::1]`, or that a browser marks as coming from another origin. `POST /jobs` refuses a body that is not `application/json`. A job's stdout is capped at 1 MiB, and a run that writes more fails. Running jobs are cancelled when the dev server closes.

Cancelling or timing out a job stops every process that the harness started: The harness runs in its own process group, which gets SIGTERM, then SIGKILL five seconds later. Process groups make the library POSIX-only; it does not support Windows.

## Scripts

Workspace scripts (`build`, `check`, `lint`, `test`, `typecheck`) are run with `nmr` — see [Running scripts](../../README.md#running-scripts) in the root README. Run `nmr` from this directory to list this package's scripts.
