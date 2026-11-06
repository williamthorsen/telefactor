import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

// The package declares `#src/*` in tsconfig `paths`, which `nmr-compile` rewrites on emit; tests resolve it the same way.
export default defineVitestConfig({ tsconfigPaths: true });
