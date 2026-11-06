<!-- readme-type: cli -->

# Repository scripts

On-demand developer tooling for this repository. Each script is self-contained; run the one you need directly.

- **Branch-protection CLI** (`protect.ts`) — configure the required CI checks and the up-to-date policy on `main`.
- **Repo-settings report** (`repo-settings.ts`) — show the visibility, dependency-graph, Dependabot, and secret-scanning settings of every repo in the machine's registry, or of named repos.

## Branch-protection CLI (`protect.ts`)

`protect.ts` configures branch protection on `main` so that pull requests must be up to date and pass the required CI checks before merging — closing the gap where two independently-green PRs can merge and leave `main` broken.

Run it directly with `node`:

```shell
node scripts/protect.ts <command >[options]
```

### When to run it

Run `protect` once per repository after CI is set up, and re-run it whenever the set of required checks should change. It is safe to re-run: it never overwrites unrelated protection settings.

### Commands

- `list` — show the checks discovered for a reference commit and whether each is currently required.
- `check` — report the current protection on `main` and what `protect` would do. Read-only.
- `protect` — require the selected checks with the up-to-date policy and admin enforcement.

#### Options

| Option            | Commands          | Description                                                                                                                                                                                                                       |
| ----------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--checks <a,b>`  | `protect`         | Checks to require, as shorthands resolved against the repo's real check names (a unique match is required). Default: the code-quality legs, `code-quality / build`, `/ lint`, `/ shell`, `/ static`, `/ test`, and `/ workflows`. |
| `--ref <ref>`     | `list`, `protect` | Reference commit for check discovery — a sha or a `#PR` (e.g. `--ref '#123'`). Default: `main`.                                                                                                                                   |
| `--dry-run`       | `protect`         | Print the intended API calls and payloads without applying them.                                                                                                                                                                  |
| `--allow-unknown` | `protect`         | Require checks without validating them against observed names (for a check that has not been observed yet).                                                                                                                       |
| `-h`, `--help`    | all               | Show help.                                                                                                                                                                                                                        |

### What `protect` sets

- **`required_status_checks.strict: true`** — the PR branch must be up to date with `main` before merging, so a PR re-runs its checks against post-merge `main`. This is what stops two independently-green PRs from merging into a broken state.
- **the selected checks** — the listed contexts must pass before merging. `--checks` is the _complete_ required set: it replaces the existing set rather than adding to it.
- **`enforce_admins: true`** — the gate binds admins too. Tradeoff: without it, an admin (often the only maintainer of a template-derived repo) can "merge without waiting," which defeats the up-to-date guarantee; with it, the maintainer must also keep branches up to date.

When `main` has no protection yet, `protect` bootstraps the whole object with a single `PUT`. When protection already exists, it patches only the required-checks slice and re-asserts `enforce_admins`, leaving reviews, restrictions, and other settings untouched — so it never clobbers and is safe to re-run.

Two caveats on the already-protected path:

- Because `--checks` is a complete-set replace, re-running with fewer checks than are currently required narrows the required set. `protect` prints the before→after required set and warns when a check would be dropped, but does not stop you — removing a check is a valid operation, so the fix is visibility, not prevention.
- The surgical patch updates an _existing_ required-status-checks rule; it does not create one. A branch protected externally with only reviews or admin enforcement (no status-check rule) is not handled: `protect` fails loudly rather than adding the rule. Re-create or remove that protection and re-run, or bootstrap with this tool from the start. (Falling back to a full `PUT` is deliberately avoided — it would clobber the externally-set reviews and restrictions.)

### Discovering checks

A required status check is matched by its **context**, e.g. `code-quality / build`. The grammar is `{caller job} / {reusable-workflow job}` — not the workflow file or its display name — so a context cannot be derived from a filename.

GitHub accepts any string as a required context and does not verify that it exists; requiring a context that never reports leaves PRs permanently unmergeable ("waiting for status"). The `--checks` resolver guards against that by validating selections against the checks actually observed on the reference commit, and erroring on a no-match or ambiguous match.

Discovery reads check-runs with `filter=all`. The API's default (`filter=latest`) returns only the newest check suites, so on a long-stable `main` a daily scheduled job can bury the push-triggered checks you want to require. A `pull_request`-only check that never ran on the reference won't be discovered — point `--ref` at a PR or commit where it ran, or use `--allow-unknown`.

### Alternatives at scale

- **Merge queue** — the scalable form of the up-to-date gate. Instead of forcing each PR to rebase, GitHub speculatively tests each PR against the queue tip and merges in order, avoiding the rebase race at higher PR volume.
- **Rulesets** — the modern, additive branch-protection API with finer bypass-actor control. Multiple named rulesets coexist without overwriting one another. This script uses classic branch protection for simplicity; rulesets are the forward path if you outgrow it.

## Repo-settings report (`repo-settings.ts`)

`repo-settings.ts` shows, for every repo in the machine's registry (`~/.config/repos.yaml`) or for the repos named on the command line, its visibility and whether the dependency graph, Dependabot alerts, Dependabot security updates, secret scanning, and push protection are on. It changes nothing.

```shell
node scripts/repo-settings.ts
```

`--repo <owner/name>` reports a repo in place of the registry, including one that the registry does not list; repeat it to report several:

```shell
node scripts/repo-settings.ts --repo williamthorsen/toolbelt --repo williamthorsen/workshop
```

It prints one row per repo:

```text
Repository                    Visibility  Dependency graph  Dependabot alerts  Security updates  Secret scanning  Push protection
williamthorsen/configs.macos  private     off               off                off               n/a              n/a
williamthorsen/eslint-config  public      on                on                 off               off              off
```

To change a setting, use the account's **Settings → Code security** page: each feature has "Enable all" and "Disable all" buttons and a checkbox that applies it to new repositories. For one repo, use that repo's **Settings → Advanced Security** page.

- **Secret scanning** and **push protection** read `n/a` when the GitHub API does not report them, as for a private repo on a personal account. Neither column covers the account-level push protection for the user's own pushes, which the repo data does not include.
- **Dependabot alerts** can read `on` while the dependency graph reads `off`. GitHub stores the two settings separately.
- A repo that cannot be read, or a registry entry without a `repo` field, prints an error row; the others are still reported, and the script exits non-zero.
- The `repo` token scope of `gh` suffices. The script reads the registry through `thor-repo list`, from the repo's own `@williamthorsen/repo-tools` dependency.
