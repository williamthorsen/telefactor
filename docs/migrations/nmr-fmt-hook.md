# Migrating the pre-commit hook to `nmr fmt`

The reference repo's pre-commit hook formats staged files with `nmr fmt` rather than by invoking Prettier directly. A hook that invokes Prettier still formats, so this is a warning rather than an error, but the two commands do not select the same files.

`nmr fmt` selects through git and passes `--ignore-path` for every `.prettierignore` in the tree, discovered from the repository root. Prettier reads only the ignore files in its working directory, which for a pre-commit hook is the repository root. In a monorepo carrying a package-level `.prettierignore`, the hook therefore rewrites files that `nmr fmt:check` — what `nmr check` and CI run — deliberately skips.

Formatting rules are unaffected. A repo whose Prettier config calls `definePrettierConfig()` from `@williamthorsen/nmr/prettier` already loads the same config and the same plugins under either command; only file selection changes.

## Prerequisites

- `@williamthorsen/nmr` 0.21+, the first release shipping the `nmr-fmt` bin that `nmr fmt` resolves to.

## Steps

Replace the `format` command in `lefthook.yml`:

```yaml
pre-commit:
  commands:
    format:
      run: pnpm exec nmr fmt {staged_files}
      stage_fixed: true
```

Drop `--ignore-unknown` and `--log-level warn` along with the Prettier invocation. `nmr fmt` passes the first internally, and lists the files it rewrote in place of the second. Keep `stage_fixed: true`, which re-stages what the hook reformats.

## Verify

```shell
pnpm exec rdy run --from github:williamthorsen/templates.node-monorepo
```

The `code-style` checklist should report no warning on the pre-commit formatter.
