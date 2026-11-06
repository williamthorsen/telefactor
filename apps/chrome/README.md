<!-- readme-type: application -->

# Chrome extension

A Chrome extension built with Vite, producing both ESM and IIFE bundles.

To start a new app from this one, follow [Starting an app or a library from a template](../../docs/new-package.md).

<!-- section:release-notes --><!-- /section:release-notes -->

## Scripts

Workspace scripts (`build`, `check`, `lint`, `test`, `typecheck`) are run with `nmr` — see [Running scripts](../../README.md#running-scripts) in the root README. Run `nmr` from this directory to list this package's scripts.

Package-specific commands:

- `pnpm run dev` — start the Vite dev server
- `pnpm run preview` — preview the production build locally

## Loading the extension in Chrome

1. Build the extension with `nmr build`.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the `dist` directory.

To pick up a new build, click the reload icon on the extension's card.
