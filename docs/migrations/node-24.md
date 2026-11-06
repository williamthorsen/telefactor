# Migrating to Node 24

The reference repo drops Node 22: `engines.node` is `>=24`, `@types/node` tracks the 24 line, and `.tool-versions` pins Node 24. Upgrading a derived repo is a version bump plus a floor change.

## Prerequisites

- Node 24 installed and available to your version manager.

## Steps

1. **Raise `nodejs` in `.tool-versions`** to a 24.x release (match the reference repo's pin), then reactivate it (`asdf install`, or your version manager's equivalent).

2. **Set `engines.node` to `>=24`** in every `package.json`, dropping any `^22` alternative from the range.

3. **Bump `@types/node` to the 24 line:**

   ```shell
   pnpm add --save-dev @types/node@24
   ```

   Then run `nmr check` and fix any new compiler findings — Node 24's types tighten a few APIs but need no config changes.

4. **Reinstall** and commit the lockfile:

   ```shell
   pnpm install
   ```

## Verify

```shell
pnpm exec rdy run --from github:williamthorsen/templates.node-monorepo --checklists repo-setup
```

The `Node in .tool-versions is 24 or newer` check should pass.
