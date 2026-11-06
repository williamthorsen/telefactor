<!-- readme-type: library -->

# telefactor

Embeds the user's own agent harness (Claude Code, Codex, Rovo Dev) in a web app, so that the app can hand a prompt to the harness that the user already has installed and signed in to.

<!-- section:release-notes --><!-- /section:release-notes -->

## Install

```shell
pnpm add @williamthorsen/telefactor
```

## Use

```ts
// vite.config.ts
import { telefactor } from '@williamthorsen/telefactor/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [telefactor()] });
```

The dev server then runs headless jobs through the user's harness, and the page drives them with the client:

```ts
import { createTelefactorClient } from '@williamthorsen/telefactor/client';

const client = createTelefactorClient();
const job = await client.startJob({ prompt: 'Summarize README.md' });
```

## Scripts

Workspace scripts (`build`, `check`, `lint`, `test`, `typecheck`) are run with `nmr` — see [Running scripts](../../README.md#running-scripts) in the root README. Run `nmr` from this directory to list this package's scripts.
