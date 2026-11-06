<!-- readme-type: application -->

# telefactor playground

A React app that runs headless jobs through the agent harness installed on this machine, using `@williamthorsen/telefactor`. It exercises each of the package's features as it lands, and it is the package's example.

## Run it

```shell
pnpm run dev
```

The script compiles the package, then starts the dev server on `localhost`. The page lists the harnesses, tests the selected one, and runs a prompt through it. The harnesses come from the package's built-in recipes unless this directory contains a `telefactor.config.json`; [Harnesses](../../packages/telefactor/README.md#harnesses) describes the config file.

The page also shows a list of notes that the page and an agent share. To let Claude Code read and change them, connect it to the dev server's MCP endpoint while the server runs:

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
