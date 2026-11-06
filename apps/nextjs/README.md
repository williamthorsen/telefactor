<!-- readme-type: application -->

# Next.js

A [Next.js](https://nextjs.org/) app styled with Tailwind CSS.

To start a new app from this one, follow [Starting an app or a library from a template](../../docs/new-package.md).

<!-- section:release-notes --><!-- /section:release-notes -->

## Scripts

Workspace scripts (`build`, `check`, `lint`, `test`, `typecheck`) are run with `nmr` — see [Running scripts](../../README.md#running-scripts) in the root README. Run `nmr` from this directory to list this package's scripts.

The `build` script reads stdin from `/dev/null`. A recursive `nmr build` runs through pnpm 12, which starts each package as a background job. When stdin is a terminal, the spinner in `next build` tries to take over keyboard input, and the system pauses any background job that does that, so the build would hang indefinitely.

A `typecheck:pre` hook runs `next typegen` before `typecheck`, generating the route types and `next-env.d.ts` that the type check reads. Without it, a clean checkout would be type-checked without them.

Package-specific commands:

- `pnpm run dev` — start the Next.js dev server
- `pnpm run start` — serve the production build
