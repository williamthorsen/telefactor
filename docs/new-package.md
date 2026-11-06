# Starting an app or a library from a template

The repo keeps two kinds of workspace in two directories. `apps/` contains runnable apps that nothing imports. `packages/` contains libraries that other workspaces or the public import, and `packages/_workspace` is the scaffold for a new one.

A copy keeps its template's identity until every item below is changed, and nothing checks most of them. The exception is a template that has a `src/__tests__/template.unit.test.ts`: In a copy of it, that test fails until the workspace's `name` and README title both change.

In the steps below, `<template>` is the template's path and `<target>` is the new workspace's path:

- **App:** `<template>` is an existing app, `apps/<app>`, and `<target>` is `apps/<dir>`.
- **Library:** `<template>` is `packages/_workspace`, and `<target>` is `packages/<dir>`.

`<dir>` is the new workspace's directory name.

## Copy the directory

From the repo root, copy the template's committed files into the target:

```shell
mkdir -p <target>
git archive --format=tar HEAD:<template> | tar --extract --directory <target> --exclude CHANGELOG.md
```

`git archive` copies only what the template commits, so gitignored output such as `node_modules/`, `coverage/`, and `dist/` stays behind. `tar` writes into `<target>` whether or not it already exists, so the copy never nests a second directory inside it. The template's `CHANGELOG.md` contains the template's history and stays behind too; release-kit writes a new one on the first release.

The directory name is the workspace's scope, whichever directory contains it: Commit titles name it (`<dir>|feat: …`), and so do its `scope:<dir>` label and its entry in `.meta/label-map.json`.

## In the workspace

- **`package.json`:**
  - `name`: release-kit derives the workspace's release tags from it, as `<name>-v<version>`.
  - `description` and `keywords`.
  - `version`: Set it to `0.0.0`. release-kit bumps from this value on the workspace's first release.
- **`README.md`:** Replace the title and the opening sentence.

Then run `pnpm install`, which adds the workspace to `pnpm-lock.yaml`. `pnpm-workspace.yaml` already declares `apps/*` and `packages/*`.

## In the repo

### Labels

Each workspace has a `scope:<dir>` label, which pull requests and issues take. Two files that reach GitHub are generated, so add the label to the one authored file and regenerate the others:

1. **Authored:** In `.config/release-kit.config.ts`, add `'scope:<dir>': { color: '00ff96', description: '<dir> package' }` to `repoLabels.labels`.
2. **Generated:** `pnpm exec release-kit sync-labels generate` rewrites `.github/labels.yaml` from that config. `pnpm exec release-kit sync-labels generate --check` fails while the file is stale.
3. **Generated:** `pnpm exec codeassembly generate label-map --force` rewrites `.meta/label-map.json`, taking a scope from each workspace that the `pnpm-workspace.yaml` globs match, named by its directory, plus `root`. Without `--force`, it refuses to replace the existing file.

The labels reach GitHub when the change merges to `main`: `.github/workflows/sync-labels.yaml` applies `.github/labels.yaml`. On the pull request, the workflow's check job logs the label changes that the merge will make. `pnpm exec release-kit sync-labels sync` runs the same workflow by hand.

### Workspace lists

Add the workspace to the list in the root `README.md` ("Workspaces") and in `AGENTS.md` ("Project structure").

## Check for leftovers

Search the new directory for the template's package name, which appears wherever the copy still identifies as its template:

```shell
git grep --untracked --line-number '<template package name>' -- '<target>'
```

A match in `src/__tests__/template.unit.test.ts` is expected, because that test compares the workspace's `name` against the template's.
