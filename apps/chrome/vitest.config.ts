import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

// Vitest resolves the sibling `vite.config.ts` ahead of any ancestor Vitest config, so this file
// exists to win that resolution. Deleting it drops the projects model silently.
export default defineVitestConfig();
