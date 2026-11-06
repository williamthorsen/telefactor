<!-- readme-type: monorepo-root -->

# pnpm Node.js monorepo

A [pnpm](https://pnpm.io/) monorepo of technology-specific starter templates: runnable apps under `apps/` and a library scaffold under `packages/`. Workspace scripts are run with [`nmr`](https://www.npmjs.com/package/@williamthorsen/nmr).

## Initializing a derived repo

A repo created from this template still carries the template's identity, starter packages, and a changelog. **Before doing anything else in a fresh clone, have your coding agent follow the skill at `.agents/skills/initialize-node-monorepo/SKILL.md`.** It interactively scrubs the template residue — `package.json` identity, the starter `apps/*` and the `packages/_workspace` scaffold, the readyup drift-detection kit, `scope:*` labels, the changelog, the template-specific docs, and the shared-config entries keyed to any of them — and rewrites the README and project guide to describe the new repo. Two branches adapt it to where the repo landed: a non-GitHub host sheds the `.github/` directory and the `gh`-dependent tooling that can never run there, and an owner other than the template's gets the identity fields rewritten and the inherited reusable-workflow calls reported. The skill is idempotent, makes no commits, and ends by noting that the skill directory can be deleted once you confirm the result.

## Aligning derived repos

This repo is the reference that derived repos are kept aligned with. The drift kit (`.readyup/kits/default.ts`) detects drift; migration guides instruct how to fix it — each upgrade-class check's fix message ends with a `— migration: <URL>` link (guides live in `docs/migrations/` here, or in the repo that owns the migration, such as [eslint-config](https://github.com/williamthorsen/eslint-config)).

Check one derived repo from inside it. The three kits cover different conventions and are all needed: the template kit checks what no package's kit owns, the `.github` kit checks the caller of the reusable code-quality workflow, and `--sources` runs the kits published by the sources that the repo's `.config/readyup.config.ts` lists, each package resolved at the version that repo actually has. The two template-kit sources are equivalent.

```shell
pnpm exec rdy run --from github:williamthorsen/templates.node-monorepo # template kit, remote
pnpm exec rdy run --from ../path/to/templates.node-monorepo            # template kit, local clone
pnpm exec rdy run --from github:williamthorsen/.github                 # code-quality workflow kit
pnpm exec rdy run --sources                                            # the configured sources' own kits
```

Check the whole fleet from this repo:

```shell
nmr drift:sweep # one row per repo in the fleet; --json for machine-readable output
```

The sweep runs the template kit and the `.github` kit against each repo; it does not run `--sources`.

The fleet is every repo whose stack in the machine's registry (`~/.config/repos.yaml`) contains `nmr`. `thor-repo scan` detects that stack from each clone's tracked files, so a repo joins or leaves the fleet by what it is built on. The sweep reads the registry through `thor-repo list`, from the repo's own `@williamthorsen/repo-tools` dependency; `--manifest <path>` sweeps from a JSON file instead, listing `{ name, path }` entries under `repos` and, optionally, an `ignore` array of repo names to skip.

## Getting started

Prerequisites: The tool versions pinned in `.tool-versions`, and [pnpm](https://pnpm.io/), installed [standalone](https://pnpm.io/installation); the `packageManager` field pins the version that pnpm then activates.

Install dependencies — this has the same effect regardless of where in the project it is run:

```shell
pnpm install
```

Scripts are run with `nmr`, a workspace bin. For the bare `nmr` command to resolve, either:

- Use [direnv](https://direnv.net/) — the repo's `.envrc` adds `node_modules/.bin` to your `PATH`, so `nmr` works from any directory.
- Or prefix commands with `pnpm exec` (for example, `pnpm exec nmr check`), which works without setup.

## Workspaces

`apps/` contains runnable apps that nothing imports. Each directory under it is a self-contained starter for a different stack:

- `api` — Node.js API run from its `.ts` sources under Node's type stripping
- `cdk` — AWS CDK infrastructure
- `chrome` — Chrome extension (Vite, ESM + IIFE builds)
- `nextjs` — Next.js app with Tailwind CSS
- `react` — React app (Vite)

`packages/` contains libraries that other workspaces or the public import:

- `_workspace` — scaffold for creating new libraries

To start an app or a library from one of them, follow [Starting an app or a library from a template](docs/new-package.md).

## Running scripts

[`nmr`](https://www.npmjs.com/package/@williamthorsen/nmr) is the script runner. It is **context-aware**: Run from the repo root it uses the root script registry; run from a package directory it uses that package's registry.

Run `nmr` with no command to list every available script — that output is authoritative, so the full set is not duplicated here.

Common commands:

```shell
nmr check      # typecheck, format check, lint check, and tests
nmr typecheck  # type-check only
nmr lint       # lint and apply automatic fixes
nmr lint:check # lint without fixing
nmr test       # run tests
nmr build      # build packages
```

Useful flags:

- `-R`, `--recursive` — run the command in every package
- `-F <pattern>`, `--filter <pattern>` — run the command in matching packages
- `-w`, `--workspace-root` — force the root registry from inside a package directory

Per-package scripts such as `dev`, `preview`, and `start` are not `nmr` commands — they are `package.json` scripts. Run them with `pnpm run <script>` from the package directory.
