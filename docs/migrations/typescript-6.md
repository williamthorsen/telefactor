# Migrating to TypeScript 6

The reference repo pins `typescript` 6.0.3+. Upgrading a derived repo is usually a version bump:

```shell
pnpm add --save-dev typescript@latest
```

Then run the repo's checks (`nmr check`) and fix any new compiler findings — TypeScript majors tighten inference and default behavior rather than requiring config rewrites.

## Simplified TS configs

The "simplified TS configs" adopted alongside TypeScript 6 in the reference repo are the projectService migration, which arrives with `@williamthorsen/eslint-config-typescript` v6 rather than with TypeScript itself: no `tsconfig.eslint.json`, no `parserOptions.project`, lint-only includes folded into the real `tsconfig.json`. Follow the [eslint-config migrating-to-v6 guide](https://github.com/williamthorsen/eslint-config/blob/main/docs/migrating-to-v6.md); the `projectservice` checklist that `@williamthorsen/eslint-config-typescript` publishes detects that drift separately.

## Verify

```shell
pnpm exec rdy run --from github:williamthorsen/templates.node-monorepo
pnpm exec rdy run --sources
```

The `typescript` version check should pass in the first run. The second runs the kits published by the sources that `.config/readyup.config.ts` lists, where a repo that also completed the eslint-config migration passes `@williamthorsen/eslint-config-typescript / default / projectservice`.
