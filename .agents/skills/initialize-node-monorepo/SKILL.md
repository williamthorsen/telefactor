---
name: initialize-node-monorepo
description: Use once in a repo freshly cloned from templates.node-monorepo to scrub template residue — identity, starter packages, the drift-detection kit, scope labels, the changelog, template docs, and the shared-config entries keyed to any of them — and reorient the repo to its own identity, host, and owner. Idempotent and safe to re-run.
---

# Initialize node-monorepo

Reorient a repo created from the `templates.node-monorepo` template so it describes itself instead of the template.

**Announce at start:** "Using initialize-node-monorepo to scrub template residue and reorient this repo."

## What this does

A fresh clone of the template carries residue that belongs to the template, not to the new repo: the template's `package.json` identity, its starter packages, its readyup drift-detection kit and the migration guides backing it, its `scope:*` labels, its changelog, a README and project guide that describe the template, and the shared-config entries keyed to any of them. This skill removes that residue and rewrites the identity-bearing files for the new repo.

It also adapts the repo to where it landed. A derived repo is not necessarily GitHub-hosted, and not necessarily owned by the template's owner; the surface that assumes either is removed or rewritten rather than inherited.

## How it works

- **Agent-driven.** Work through the phases below in order. There is no script.
- **Idempotent and resumable.** Every step checks current state before acting and skips work already done. A re-run against an already-initialized repo is a no-op; an interrupted run can be safely restarted.
- **No commits, no self-deletion.** The skill edits the working tree only. It does not commit or delete itself; the final phase tells the user to commit, and notes that the skill directory can then be deleted.

## Phase 1: Preflight and safety

1. **Check for residue.** The repo still needs initialization if _any_ of these hold:
   - `package.json` `name` is `templates.node-monorepo`
   - `.readyup/kits/default.ts` exists
   - `.agents/preferences.yaml` has `project.slug: node-monorepo`
   - `CHANGELOG.md` contains a `## 1.3.0` section

   If none hold, report that the repo is already initialized and stop.

2. **Guard against scrubbing the template itself.** Read `git remote get-url origin`. If it resolves to `templates.node-monorepo` (the template's own repository), this is either the template repo or a clone whose remote has not been re-pointed — running the cleanup here would destroy the template. Warn the user and require explicit confirmation before continuing. If there is no `origin` remote, note it — Phase 2 gathers the repository URL directly, and the label step in Phase 3 targets that repository explicitly.

   Because this step permits `origin` to still point at the template, nothing downstream may read `origin` for the derived repo's identity. Phase 2's host and owner are derived from the **confirmed** repository URL for exactly that reason.

## Phase 2: Gather inputs

Collect everything below before editing any file. Infer what you can; confirm inferences with the user.

- **Repository URL** — infer from `git remote get-url origin` and confirm. If `origin` is absent or still points at the template, ask for the new repo's URL. From it, derive `homepage` (`{url}#readme`), `bugs.url` (`{url}/issues`), and `repository.url` (`git+{url}.git`).
- **Host** — derive from the confirmed repository URL: `github` for a `github.com` URL, `other` for anything else. A repo with no remote at all is `other`, since none of the GitHub surface can function without one. Confirm the derivation. Step 3 removes that surface when the host is `other`.
- **Owner changed** — derive from the confirmed repository URL: whether its owner differs from the template's own owner, `williamthorsen`. Confirm the derivation. Steps 1, 2, 3, and 9 each act on this.
- **Package name** — the npm `name` for the root `package.json`.
- **Short description** — one line, for `package.json` `description`.
- **Project description** — a few sentences, for the README and `AGENTS.md`.
- **Project slug** — propose one derived from the repo name; confirm. Used for `project.slug` in `.agents/preferences.yaml`.
- **Packages to keep** — list all `apps/*` and `packages/*` directories present in one list. The default is to remove all of them. Note that `packages/_workspace` is the scaffold for creating new libraries, so the user may want to keep it. For each package the user keeps, ask for its new `name` and `description`.
- **Scope labels** — the `scope:*` label set for the kept/new packages. `scope:root` is always kept.

## Phase 3: Cleanup steps

Run these in order. Each step is guarded — if its work is already done, skip it.

### 1. Identity

In the root `package.json`, set `name`, `description`, `homepage`, `bugs.url`, and `repository.url` to the gathered values, and reset `version` to `0.0.0`. When the owner changed, set `author` to the new owner as well: it carries the template author's name, email, and profile URL, so leaving it ships their contact details in the derived repo. Leave `license`, `type`, `packageManager`, and `scripts` untouched.

Do **not** add a `workspaces` field. Its absence is deliberate: `eslint-plugin-n` reads it to union the root's dependency names into each package's before evaluating `n/no-extraneous-import`, so adding it would silently return the repo to inheriting dependencies it never declares. pnpm reads `pnpm-workspace.yaml` instead.

### 2. Packages

- Delete each `apps/<pkg>` or `packages/<pkg>` directory the user did not keep. Leave both globs in `pnpm-workspace.yaml`, even when a directory is left empty, so that the derived repo can add an app or a library without editing the manifest.
- For each kept package: Set its `package.json` `name` and `description` to the new values and reset its `version` to `0.0.0`; reset its `CHANGELOG.md` to a bare `# {package name}` heading. When the owner changed, set `author` here too — every package manifest carries the same value the root does, and step 1 reaches only the root.
- Run `pnpm install` to refresh `pnpm-lock.yaml` against the new package set.

### 3. Host and owner

Two branches, each guarded by an input gathered in Phase 2. Both are no-ops for a GitHub repo whose owner matches the template's, so the default path reaches the end of this step having changed nothing.

**When the host is `other`**, remove the GitHub-only surface. None of these files contains the template string, so the step 9 audit cannot surface them:

- `.github/` in its entirety — `CODEOWNERS`, `dependabot.yml`, the generated `labels.yaml`, and every workflow (`audit.yaml`, `code-quality.yaml`, `create-github-release.yaml`, `release.yaml`, `sync-labels.yaml`). None of them can run off GitHub.
- `scripts/protect.ts`, its lib modules `scripts/lib/checks.ts`, `scripts/lib/gh.ts`, and `scripts/lib/protection.ts`, and their companion tests `scripts/lib/__tests__/checks.unit.test.ts` and `scripts/lib/__tests__/protection.unit.test.ts` — together a branch-protection CLI that shells out to `gh`.
- The branch-protection sections of `scripts/README.md`, including its entry in the opening list.
- `.meta/label-map.json` — read by the reusable label workflows being removed, and by nothing local. Remove the file, not `.meta/`, which release-kit repopulates with `changelog.json`.
- The `repoLabels` block in `.config/release-kit.config.ts`, whose only output is the `.github/labels.yaml` that `sync-labels.yaml` applied. Keep the rest of the config — release-kit's versioning and changelog work is host-independent.

Then skip step 6 entirely: it has nothing left to act on.

**When the host is `github` and the owner changed**, rewrite `.github/CODEOWNERS` to the new owner. It carries the template author's handle, which would otherwise grant review ownership over the derived repo to someone outside it.

### 4. readyup kits and fleet sweep

Remove the template's drift-detection kit and its companion tests. Every `__tests__/rdy-kit-*.test.ts` is a companion to the kit — the tests import from or verify `.readyup/kits/default.ts`, so they must go with it — while generic root tests that do not match the `rdy-kit-` prefix are kept.

- `.readyup/kits/default.ts`
- `.readyup/kits/default.js`
- Every `__tests__/rdy-kit-*.test.ts` companion test — delete by that glob rather than by an enumerated list, since the set grows as the template evolves. The glob matches on the prefix rather than the tier tail, so a test renamed onto another tier is still caught
- `docs/migrations/` — every guide in it exists to back an upgrade-class check's `— migration: <URL>` fix message in the kit, so the directory is orphaned once the kit is gone. The guides mention the template by name and would otherwise surface in the step 9 audit as unexplained hits

Remove the fleet-sweep tooling, which runs that kit across the template's own derived-repo fleet. None of these files contains the template string, so the step 9 template-string grep cannot surface them, and its removed-path sweep only reports them — any future template-only file with the same property must be added to this list explicitly:

- `scripts/drift-sweep.ts`
- `scripts/lib/drift-sweep.ts`
- `scripts/lib/__tests__/drift-sweep.unit.test.ts`
- The `drift:sweep` entry in `.config/nmr.config.ts` — delete the file if no entries remain

Keep `scripts/lib/json.ts` while an importer survives. Its only importers are `scripts/lib/gh.ts` and `scripts/lib/drift-sweep.ts`: this step removes the second, and step 3 removes the first when the host is `other`. When neither survives, remove `json.ts` and the now-empty `scripts/lib/` with it.

The `cdk` environment kit (`.readyup/kits/cdk.ts`, `.readyup/kits/cdk.js`) verifies host tooling for the cdk package. Keep it if the cdk package was kept in Phase 2; delete both files if the cdk package was removed. Its check auto-skips when `apps/cdk` is absent, so leaving it in place is harmless either way.

Then rewrite the kept files that refer to what this step removes. None of these references contains the template string, so the step 9 template-string grep cannot surface them, and its removed-path sweep only reports them; any future reference of this kind must be added to this list explicitly. Skip each rewrite whose target text is already gone:

- `.readyup/kits/cdk.ts`, when it is kept. In its header comment, delete "Unlike the template-drift kit (default.ts), " and start the remaining sentence with "This kit verifies host tooling", then reflow the comment.

**When a kit survives**, regenerate the manifest so it lists only the kits that remain: run `rdy compile`, which recompiles them and rewrites `.readyup/manifest.json`. Do **not** hand-edit or delete that file.

**When every kit was removed**, delete `.readyup/` outright rather than keeping an empty directory. `rdy compile` treats a missing source directory as an empty sweep: it reports `Source directory not found: .readyup/kits` as an informational line, rewrites an existing manifest to an empty kit list, and exits 0. Nothing is left stale, so an empty tracked directory and an empty manifest would be permanent artifacts guarding against a failure that does not occur. Nothing in Phase 4 reads them either — `nmr check:strict` runs typecheck, `fmt:check`, `lint:strict`, and `test`, and readyup kits are run by hand.

Do **not** remove the `readyup` dependency, `.config/readyup.config.ts`, or the `.readyup/**` path entries in `tsconfig.json` and the root ESLint config — readyup stays so the derived repo can author its own kits, and `.config/readyup.config.ts` is what `rdy run --sources` reads.

### 5. Package-keyed config cleanup

Entries in shared config files are keyed to package names rather than the template string, so they outlive the packages they served and the residue audit in step 9 cannot catch them. This step runs after every file-removing step, so the tree it prunes against is final. Work through the substeps below in order — each depends on the lockfile refreshed at the end of step 2. If no packages were removed (or on a re-run), every substep is a no-op.

- **`pnpm-workspace.yaml`** — For each key in `allowBuilds` and `peerDependencyRules.allowedVersions`, search the refreshed `pnpm-lock.yaml` for the package the key names — for a `>`-scoped `allowedVersions` key (`pkg>peer`), that is the segment before `>`, since the entry is live only while that package remains in the tree (the literal `pkg>peer` form never appears in the lockfile). Remove each entry whose package has zero occurrences. Re-run `pnpm install` to confirm the lockfile is stable. Judge by lockfile occurrence, not by a fixed list of entries — the entries change as the template evolves.
- **v11y allowlist** — Regenerate the allowlists in `.config/v11y-check.config.json` by running `pnpm exec v11y sync` (the entries are auto-managed; do not hand-edit them while sync works). Review the resulting diff: dropped suppressions for advisories that left the tree with the removed packages are the goal. Any **added** suppression signals a live advisory — surface it to the user; never accept it silently. If `sync` misbehaves, fall back to pruning entries whose `path` begins with `apps__<removed pkg>` or `packages__<removed pkg>`.
- **Root `devDependencies` (report and confirm)** — For each root `devDependencies` entry, search the surviving tree (excluding the root `package.json` and `pnpm-lock.yaml`) for references to it. Report the zero-reference entries to the user as removal _candidates_ — a dependency can be consumed without any textual reference, so this is a report-and-confirm step, not a mechanical prune. Remove only what the user confirms, then run `pnpm install`. Phase 4's `nmr check:strict` is the empirical backstop for over-removal.
- **`pnpm-workspace.yaml` `catalog:`** — The catalog versions a dependency that two or more manifests declare; anything a single manifest declares keeps a literal version there. Count the surviving manifests that declare each catalogued dependency. Drop the entry at zero declarers. At exactly one, write the version `pnpm-lock.yaml` resolves for it to that manifest as a literal in place of `"catalog:"`. Take the resolved version rather than the catalog's own specifier: where the catalog holds a range, its floor can sit behind what the tree actually runs, and writing the floor downgrades the dependency on the next install. `savePrefix: ''` pins exact either way. Remove the `catalog:` block itself once nothing is left in it. Judge by declarer count, not by a fixed list — and expect the whole block to go on the default path, since removing every starter package leaves no dependency with two declarers. Re-run `pnpm install` to confirm the lockfile is stable.
- **`tsconfig.json` `include` and `eslint.config.ts` `globalIgnores`** — Both accumulate entries keyed to packages and their build output. Judge `globalIgnores` by what an entry is keyed to, never by what it currently matches: remove an entry only when the package it names was removed. A build-output ignore matches nothing until a build runs and binds on every run after, and the base ESLint config reads no `.gitignore`, so this list is the only exclusion there is: drop `**/dist/**` from a tree that has not been built yet and the first compiled output becomes a lint error. A universal entry like that one is keyed to no package and always stays; one keyed to a package stays exactly as long as the package does. From `include`, remove each path whose directory holds no `.ts` file once the earlier steps have run. Keep the `.readyup/**` entries in both, even when step 4 deleted `.readyup/` — they are forward-looking, for the kits the derived repo will author, and step 4 says so explicitly.

### 6. Labels

- In `.config/release-kit.config.ts`, under `repoLabels.labels`, remove `scope:*` entries for removed packages and add entries for the new scope labels. Always keep `scope:root`. Leave `repoLabels.extends` unchanged.
- Regenerate `.meta/label-map.json` with `pnpm exec codeassembly generate label-map --force`, which takes a scope from each surviving workspace that the `pnpm-workspace.yaml` globs match, named by its directory, plus `root`. Do not hand-edit it.
- Regenerate `.github/labels.yaml` — it is generated and marked "do not edit," so do not hand-edit it. Run `pnpm exec release-kit sync-labels generate`.
- Delete each removed `scope:<pkg>` label on GitHub, targeting the repository gathered in Phase 2 **explicitly**: `gh label delete scope:<pkg> --repo <owner/repo> --yes`. Always pass `--repo` — never let `gh` infer the target from `origin`, which Phase 1 permits to still point at the template. Confirm with the user before deleting. A "label not found" or "repository not found" result is expected for a freshly created repo whose `sync-labels` workflow has not yet run — treat it as success and continue. New labels are created when the `sync-labels` workflow runs on the next push.

### 7. Changelog

Reset the root `CHANGELOG.md` to a bare `# {project name}` heading with no version sections.

### 8. Docs

- **README.md** — rewrite it to describe the derived repo. Open with the project title and description. Keep the genuinely reusable sections (getting started with pnpm/corepack/direnv, running scripts with `nmr`, dependency commands) — they apply to any repo built on this template. Replace the "Workspaces" section with the kept packages, or remove it if none were kept. Remove the "Initializing a derived repo" section if present — it belongs only in the template.
- **AGENTS.md** — regenerate it by invoking the `update-project-guidance` skill, so it reflects the repo's post-cleanup state.
- **.agents/preferences.yaml** — set `project.slug` to the new slug. Leave `project.ticket_ref_prefix` unchanged.

### 9. Residue audit

Search for surviving references to the template:

```shell
git grep --line-number 'node-monorepo' -- ':!.agents/skills/initialize-node-monorepo' ':!pnpm-lock.yaml' ':!.github/labels.yaml'
```

Ignore any line containing `node-monorepo-tools` — that is a separate shared-tooling repo (referenced by GitHub workflows and JSON-schema URLs), not residue. Surface every remaining hit to the user for manual review.

Then sweep for references to what step 4 removed. They do not contain the template string, and step 4's rewrite list covers only the references that are already known:

```shell
git grep --line-number --ignore-case --extended-regexp 'docs/migrations|kits/default|drift[-: ]?(kit|sweep)' -- ':!.agents/skills/initialize-node-monorepo' ':!pnpm-lock.yaml' ':!.github/labels.yaml'
```

Surface every hit to the user for manual review.

Then, when the owner changed, report the workflows that still call the template owner's reusable workflows. That ignore is what hides most of them, and the calls run under the template owner's account rather than the derived repo's:

```shell
git grep --line-number --extended-regexp 'uses:[[:space:]]*<template owner>/' -- .github/workflows
```

The owner to match is the template's own, recorded in Phase 2; take it from there rather than writing it again here, so a rename of the template updates one place. Report the hits; do not rewrite them. A derived repo may legitimately keep calling a public reusable workflow, and whether to vendor it is the owner's decision. Do not widen this to a bare owner-name grep over the tree: the owner is also the npm scope of the first-party dependencies this template is built on, so such a grep returns hundreds of hits and buries the few that matter.

Then sweep for package-keyed residue, which never contains the template string. For each package removed in step 2, search for the path shapes that package-scoped entries use — `apps/<pkg>`, `apps__<pkg>`, `packages/<pkg>`, and `packages__<pkg>`:

```shell
git grep --line-number --extended-regexp '(apps|packages)[/_]+<pkg>' -- ':!.agents/skills/initialize-node-monorepo' ':!pnpm-lock.yaml' ':!.github/labels.yaml'
```

Step 5 should already have cleaned the known package-keyed config entries, so hits here mean residue in files the earlier steps do not cover — surface them to the user for manual review. Do not sweep bare directory names (`react`, `api`): they are too noisy to search, and references by npm package name contain `node-monorepo`, so the template-string grep already catches them.

## Phase 4: Verify

First run `nmr fmt`. Phase 3 hand-edits `package.json`, `pnpm-workspace.yaml`, `.config/release-kit.config.ts`, `tsconfig.json`, `eslint.config.ts`, and the docs, and removing an entry or a block from any of them readily leaves a blank-line run Prettier rejects. Nothing else formats them: the pre-commit hook would, but this skill makes no commits, so it never fires during a run.

Then run `nmr check:strict`. If it passes, report success. If it fails, show the user the failure and stop — do not paper over it.

## Phase 5: Wrap up

Print a summary of every change made. Then tell the user:

1. Review the working tree.
2. Commit the changes.
3. Initialization is complete and `.agents/skills/initialize-node-monorepo/` can be deleted.

Do not commit the changes or delete the skill directory yourself.
