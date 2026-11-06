<!-- readme-type: monorepo-root -->

# telefactor

A library that embeds the user's own agent harness (Claude Code, Rovo Dev, Codex) in a web app. The harness runs in a pseudo-terminal rendered by the page, and an MCP server exposed by the app's dev server lets the agent drive the app through the same actions that the user has.

## Getting started

Prerequisites: The tool versions pinned in `.tool-versions`, and [pnpm](https://pnpm.io/), installed [standalone](https://pnpm.io/installation); the `packageManager` field pins the version that pnpm then activates.

Install dependencies from anywhere in the repo:

```shell
pnpm install
```

Scripts are run with [`nmr`](https://www.npmjs.com/package/@williamthorsen/nmr), a workspace bin. For the bare `nmr` command to resolve, either:

- Use [direnv](https://direnv.net/): The repo's `.envrc` adds `node_modules/.bin` to the `PATH`, so `nmr` works from any directory.
- Or prefix commands with `pnpm exec` (for example, `pnpm exec nmr check`), which works without setup.

Run `nmr` with no command to list every script and the command to which it resolves. Run from the repo root, a script covers the root and every workspace; run from a package directory, it covers that package alone.

## Workspaces

`packages/` contains the libraries:

- `_workspace`: scaffold for creating new libraries

To start a library from the scaffold, follow [Starting an app or a library from a template](docs/new-package.md).
