import createReactPlugin from '@vitejs/plugin-react';
import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

// The package declares `#src/*` in tsconfig `paths`, which `nmr-compile` rewrites on emit; tests resolve it the same way.
// The React plugin is Vite-level, so it reaches every project; a component test selects happy-dom in its own docblock, so
// that every other test keeps the Node environment.
export default defineVitestConfig({ tsconfigPaths: true, root: { plugins: [createReactPlugin()] } });
