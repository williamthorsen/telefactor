# telefactor

## Overview

A library that embeds the user's own agent harness (Claude Code, Rovo Dev, Codex) in a web app: The harness runs in a pseudo-terminal rendered by the page, and an MCP server exposed by the app's dev server lets the agent drive the app through the same actions that the user has. The repo uses `@williamthorsen/nmr` as its workspace script runner, `@williamthorsen/release-kit` for releases, and `readyup` for pre-release checks.

## Project structure

- `apps/`: runnable apps that nothing imports (none yet)
- `packages/_workspace` — scaffold for new libraries (no-op build)
- `.config/release-kit.config.ts` — release-kit configuration
- `.config/readyup.config.ts` — readyup configuration
- `.config/wt.toml` — worktrunk hooks, whose `[pre-start]` pipeline copies gitignored local files into a new worktree before installing dependencies
- `.worktreeinclude` — the allowlist bounding that copy; without it every gitignored file is copied
- `docs/new-package.md` — checklist for starting an app or a library from a template and giving the copy its own identity

## Commands

Invoking nmr belongs to `@williamthorsen/nmr`. Its ambient rulebook carries the `nmr`-not-`pnpm run` rule, the cwd scoping, the `ci`/`prepush` split, and the check-result cache, and bare `nmr` prints every command with its expansion and every flag, so this section restates none of it.

`.github/workflows/code-quality.yaml` runs six parallel legs: `build`, `lint`, `static`, `test`, and `workflows`, which together run the constituents of `nmr ci`, and `shell`, which runs `nmr lint:shell` (`shellcheck` over every tracked `*.sh` file). It is the only workflow that runs an nmr command. The dependency audit runs from `.github/workflows/audit.yaml` on every pull request to `main` or `next` and on a daily schedule, through a reusable workflow rather than through `nmr audit`.

Readyup kits are run by hand, never from CI: `pnpm exec rdy run --from github:williamthorsen/templates.node-monorepo` runs the template's drift kit against this repo, and `pnpm exec rdy run --sources` runs the kits published by the sources that `.config/readyup.config.ts` lists. Run the second after a dependency upgrade.

Scripts not in the `nmr` registry — per-package scripts such as `dev`, `preview`, and `start` — are run with `pnpm run <script>`. Run binaries with `pnpm exec <binary>`.

## Architecture

### nmr workspace script system

`@williamthorsen/nmr` provides a unified CLI (`nmr`) with predefined workspace and root commands. Composite commands (like `check`) expand into sequences of sub-commands.

### Build system

A package that publishes a library compiles via `nmr compile`, which runs the `nmr-compile` bin from `@williamthorsen/nmr`. It uses the TypeScript compiler API to emit a package's `src` to `dist/esm` as `.js` and `.d.ts` in one pass, rewriting relative `.ts` → `.js` specifiers and tsconfig `paths` aliases in both outputs, and skipping work when inputs are unchanged. There is no repo-local build script to maintain; build fixes arrive via an `@williamthorsen/nmr` version bump.

### Testing

Vitest, configured through the factories in `@williamthorsen/nmr/vitest`, which give every config the same four tier projects.

The test-tier convention belongs to `@williamthorsen/nmr`. Its ambient rulebook states where a test file lives, how it is named, and which tier it runs under, and `node_modules/@williamthorsen/nmr/README.md` carries the rest, so this section restates none of it.

This repo declares nmr's conventions check in `__tests__/test-file-conventions.app.unit.test.ts`, so a test file outside `__tests__/`, or one whose tier segment is missing or misspelt, fails the test run.

Two configs exist:

- `vitest.config.ts` uses the package factory, so it sets no root and no workspace exclusions. It backs root `test:watch`, which sweeps the whole repo, and it is the config that `nmr-vitest` passes to a package carrying no config of its own. Do not "correct" it to the root factory.
- `vitest.root.config.ts` uses the root factory, which excludes every workspace that `pnpm-workspace.yaml` declares. Only `nmr root:test*` reaches it, by explicit `--config`.

A package needs its own config when it customizes the shared one **or** when it carries a `vite.config.ts`. Deleting a config that "only calls the factory" is safe only in a package with no Vite config of its own; elsewhere it drops the projects model, and every tier-selecting command then fails with `No projects matched the filter` — a test-count check does not catch it.

### Dependencies

Every package declares every module it imports; nothing is inherited from the root. The root `package.json` carries no `workspaces` field, and its absence is deliberate: `eslint-plugin-n` reads that field to union the root's dependency names into each package's before evaluating `n/no-extraneous-import`, so restoring it would silently return the repo to inheriting. pnpm reads `pnpm-workspace.yaml` instead, as do `readyup` and `nmr`, so nothing else depends on it. A missing declaration is reported by `nmr lint:check`, and the fix is to declare the dependency, never to suppress the rule.

A dependency that two or more manifests declare is versioned once, in `pnpm-workspace.yaml`'s `catalog:` block, and each manifest names it as `"catalog:"`. Anything declared by a single manifest keeps a literal version there. `savePrefix: ''` pins exact versions either way.

### Intra-package imports

A package reaches its own source through the subpath import `#src/*`, which maps to `./src/*`. The package declares it in the `imports` field of its `package.json`, which Node, TypeScript, Vite, and ESLint resolve without further configuration. A compiled library declares it in tsconfig `paths` instead, because `nmr-compile` rewrites those to relative specifiers on emit. A package never declares it in both places: TypeScript consults `paths` before `imports`, and a second declaration can drift from the first without any error.

An import of a file under `src/` never climbs with `..`. It is relative when its target is in the importing file's directory or below, and uses `#src/` otherwise. A test file is the one exception: It reaches the directory beside its `__tests__/` with a single `..`. A file outside `src/`, such as `package.json`, is outside the alias's reach and is imported relatively. An aliased specifier keeps its `.ts` extension, as a relative one does, and `import-x/extensions` reports one that omits it.

Every package declares the alias, `_workspace` included, so that a package copied from a template starts with it.

### Git hooks

Lefthook formats staged files with `nmr fmt` in the pre-commit hook, and re-stages what it rewrites. `nmr fmt` is what the hook runs rather than Prettier directly, so the hook and `nmr fmt:check` select the same files: both honor every `.prettierignore` in the tree, where a Prettier invocation from the repo root reads only the root one.

### TypeScript

Uses `tsgo` (TypeScript native preview) for type checking.

The language level and strictness set come from `@williamthorsen/tsconfig`, which the root `tsconfig.json` extends: `@tsconfig/strictest` plus the Node options it omits, at NodeNext/ES2025. The root adds only `resolveJsonModule` and turns off `rewriteRelativeImportExtensions`, under which the typecheck rejects the `.ts` extension on a `#src/` specifier; no package here emits with `tsc`, and `nmr-compile` turns the flag on for its own emit. A package declares only what is genuinely its own. Do not restate the base's flags here or in a package config — a second copy is what drifts.

`lib` replaces rather than extends, so a package needing DOM types repeats the ES year alongside them.

## Code style

- Never use `any`, type assertions, or non-null assertions.
