# Migrating to pnpm 11

The first-party specifics of moving a repo derived from this template from pnpm 10 to pnpm 11. For the general migration (lockfile format, removed flags), follow [pnpm's official guide](https://pnpm.io/migration); this guide covers only what the drift kit checks beyond it.

## Prerequisites

- Node 22 or later (pnpm 11's floor). Raise `nodejs` in `.tool-versions` first if needed.

## Steps

1. **Bump `packageManager`** in the root `package.json` to `pnpm@11.x` (match the reference repo's pin). pnpm activates the new version on the next invocation.

2. **Remove `pnpm` from `.tool-versions`** if it is listed — the `packageManager` field owns the pnpm version; a `.tool-versions` entry shadows it with a stale binary.

3. **Move exact-version saving to `pnpm-workspace.yaml`.** pnpm 11 reads workspace settings from `pnpm-workspace.yaml`; replace `save-exact=true` in `.npmrc` with:

   ```yaml
   savePrefix: ''
   ```

4. **Keep the release-age soak, but carve out first-party packages.** pnpm 11's `minimumReleaseAge` soak (supply-chain protection) would also delay your own freshly published packages; exclude them:

   ```yaml
   minimumReleaseAge: 1440
   minimumReleaseAgeExclude:
     - '@williamthorsen/*'
   ```

   Add other first-party unscoped packages (for example `readyup`) as your repo consumes them.

5. **Reinstall** and commit the lockfile:

   ```shell
   pnpm install
   ```

## Verify

```shell
pnpm exec rdy run --from github:williamthorsen/templates.node-monorepo --checklists repo-setup,code-style
```

The `packageManager pins pnpm 11 or later`, `minimumReleaseAgeExclude carves out first-party packages`, `exact-version saving is enforced`, and `.tool-versions does not contain pnpm` checks should all pass.
