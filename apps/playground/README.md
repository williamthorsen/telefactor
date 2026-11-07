<!-- readme-type: application -->

# telefactor playground

A React app that runs the agent harness installed on this machine in an embedded terminal and as headless jobs, using `@williamthorsen/telefactor`. It exercises each of the package's features as it lands, and it is the package's example.

## Run it

```shell
pnpm run dev
```

The script compiles the package, then starts the dev server on `localhost`. The page lists the harnesses, tests the selected one, runs it interactively in a terminal, and runs a prompt through it. The harnesses come from the package's built-in recipes unless this directory contains a `telefactor.config.json`; [Harnesses](../../packages/telefactor/README.md#harnesses) describes the config file.

The page also shows a list of notes that the page and an agent share. A harness started in the terminal can already read and change them through the dev server's MCP endpoint; `/add-sample-note`, a skill in this directory, adds one. To connect a harness that runs outside the page, such as Claude Code in another terminal:

```shell
claude mcp add --transport http playground http://localhost:5176/api/telefactor/mcp
```

To run a job without signing in to a harness, start the server with a command that echoes its stdin:

```shell
TELEFACTOR_HARNESS_COMMAND='["cat"]' pnpm run dev
```

To start a new app from this one, follow [Starting an app or a library from a template](../../docs/new-package.md).

<!-- section:release-notes --><!-- /section:release-notes -->

## Scripts

Workspace scripts (`build`, `check`, `lint`, `test`, `typecheck`) are run with `nmr` — see [Running scripts](../../README.md#running-scripts) in the root README. Run `nmr` from this directory to list this package's scripts.

Package-specific commands:

- `pnpm run dev` — compile the package, then start the Vite dev server
- `pnpm run preview` — preview the production build locally
