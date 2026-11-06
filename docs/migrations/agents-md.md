# Migrating to the repo-root AGENTS.md

Project guidance at `.agents/PROJECT.md` is loaded natively by neither harness. Rovo Dev reads the repository-root `AGENTS.md` unaided, and Claude Code reaches it through one include in `.claude/CLAUDE.md`. Until a repo moves, the guidance it declares reaches nothing; neither does any ambient rulebook it names, because `codeassembly sync` delivers those into machine-local host files that this migration is what wires up.

`williamthorsen/operations#10` is the worked example: one repository migrated end to end.

## Prerequisites

- **The machine's installed skills come from `codeassembly` 0.5.0 or later.** `update-project-guidance` is installed into each harness's skills directory by `codeassembly install`, and is never resolved from a repository's `node_modules`. Earlier versions author the superseded `.agents/PROJECT.md` layout. Run `codeassembly install` if you are unsure which version is deployed.
- **`codeassembly` 0.7.0 or later in the repository.** 0.6.0 is the floor for `sync` itself (the `harnesses` declaration and machine-level targeting, without which `sync` writes nothing into a repository containing no harness directory), but step 7 and the verification step need the `guidance` readyup kit, which 0.7.0 publishes.

## Steps

Steps 2 through 6 must land in one change. Repointing the include and deleting the guidance file while the repo's own checks still assert the old layout leaves the repo failing its own gate.

1. **Upgrade `codeassembly`:**

   ```shell
   pnpm add --save-dev codeassembly@latest
   ```

2. **Run `update-project-guidance`.** It writes the repository-root `AGENTS.md` and points `.claude/CLAUDE.md` at it with an include that climbs out of `.claude/`. The skill is interactive and gates on approval: review its draft against the existing `.agents/PROJECT.md` before accepting, because it drafts from exploration rather than transcribing, and dense sections are the ones it summarizes away. Both harnesses read the result, so it must carry no harness-dependent link: a `~/.claude/...` path is wrong for half its readership.

   Where the existing `.agents/PROJECT.md` is worth keeping as written, split the work into two commits inside the one change: `git mv` it to `AGENTS.md` and edit only what the move invalidates, then bring the content current in a second commit. Git reports the first as a rename, so a reviewer sees that nothing was lost in the move and reads the content changes as a diff of their own.

   Whatever you write there, keep codeassembly's own region markers out of it. `sync` treats the repo-root `AGENTS.md` as a legacy ambient host and strips any `<!-- rulebook:… -->` region it finds; hand-authored guidance carrying no such marker is untouched.

3. **Delete `.agents/PROJECT.md`.**

4. **Delete `.agents/nmr/` and any `@nmr/AGENTS.md` include** (nmr consumers only). Both are output of nmr's removed `sync-agent-files` command, and the ambient `nmr` rulebook supersedes them.

5. **Purge references to what you deleted.** A README, a repo-local skill, or a pointer carried into the new `AGENTS.md` outlives the file it names. `git grep 'PROJECT\.md'` and `git grep 'nmr/AGENTS\.md'` should both come back empty.

6. **Retire the repository's own checks of the old layout,** along with their companion tests. A readyup kit check, a lint rule, or a test asserting `.agents/PROJECT.md` starts failing the moment the migration lands; where the repo is swept by a shared drift kit, that kit has to stop asserting the old layout before any repo it sweeps can migrate.

7. **Add `npm:codeassembly` to `.config/readyup.config.ts`'s `sources` list** (repos running readyup). Its `guidance` checklist then reports on the wiring the steps above put in place, replacing the checks step 6 removed.

8. **Decide which harnesses `sync` targets.** With no `harnesses:` block anywhere in the scope chain, targeting is inferred from the harness homes present in your home directory (`~/.claude`, `~/.rovodev`), so a harness you have installed but do not want output for is targeted anyway. Three mechanics decide where the declaration belongs:

   - Which harnesses a developer runs is a fact about the developer, so `harnesses:` is the one key that resolves across the user-global and project tiers together. Declaring it once in `~/.agents/codeassembly.yaml` retires the detection default for every repository on the machine.
   - A project-tier declaration **adds** to the global tier rather than replacing it: `use: [rovo]` in a Rovo project alongside a global `use: [claude]` targets both.
   - Narrowing takes an explicit `drop:`. `root: true` will not do it; for `harnesses:` alone it clears only its own domain's contributions, deliberately, so a committed project file cannot discard what the developer declared globally.

   Declare it in the repository's own `.agents/codeassembly.yaml` only where the harness set is a property of the project rather than of the developer: a committed declaration targets that harness for every contributor, including one who has never installed it. For a personal choice, use the gitignored `.agents/codeassembly.local.yaml`.

9. **Add `codeassembly sync --warn-only` to `postinstall`,** so an install refreshes the ambient region when a dependency upgrade changes what it holds. `--warn-only` keeps a sync failure from breaking the install. `pnpm install` skips lifecycle scripts when the tree is already up to date, so exercise the new script with `pnpm run postinstall`.

10. **Run `codeassembly sync`** and confirm the ambient region reaches the host file of every harness step 8 targets: `CLAUDE.local.md` for Claude Code, `AGENTS.local.md` for Rovo Dev. A single-harness developer correctly gets one file, so the check is that the output matches the intent rather than that both files exist: the run states what it targeted and what decided it (`Targeting claude (declared).`). The hosts are rendered per harness (skills-tree link targets and invocation sigils differ between them), so they are not interchangeable and neither can include the other.

    Dropping a harness after a sync leaves its host file behind. `sync` retires ambient regions from the legacy hosts (`.agents/PROJECT.md`, the repo-root `AGENTS.md`) but never from a `.local.md` whose harness has stopped being targeted, so settle step 8 before the first sync or delete the orphan by hand.

11. **Confirm `.gitignore` covers everything `sync` generates.** `*.local.*` covers both `.local.md` files. `sync` also reconciles `.rovodev/prompts.yml`, which that pattern does not match; check `git status` after the run and add an entry if a file appears.

## Verify

```shell
pnpm exec rdy run --sources
```

The `guidance` checklist should report green with recommendations included: `AGENTS.md` non-empty, reached from `.claude/CLAUDE.md`, within the 200-line ambient budget, and not stale against recent commits.

Nothing runs this from CI. Run it by hand after a dependency upgrade: that is what makes a convention delegated to a package's kit a relocation rather than a deletion.

Where a shared drift kit sweeps the repository, its `agent-tooling` checklist asserts two things rather than one: that no `.agents/PROJECT.md` remains, and that `.agents/preferences.yaml` carries `project.slug` and `project.ticket_ref_prefix`. A migration that clears the first and leaves the second short still reports red.

Scope that sweep to the one checklist rather than reading the whole report: `pnpm exec rdy run --from ~/repos/templates/node-monorepo --checklists agent-tooling`. Unscoped, it reports every checklist the kit carries, and a repository that has not been swept in a while commonly fails a dozen checks that have nothing to do with this migration.
