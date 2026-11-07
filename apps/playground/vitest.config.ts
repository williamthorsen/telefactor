import createReactPlugin from '@vitejs/plugin-react';
import { defineVitestConfig } from '@williamthorsen/nmr/vitest';

// `plugins` is Vite-level and reaches every project through `extends: true`. `environment` and
// `setupFiles` describe what to collect, so they cross the `project` seam, which the root seam
// rejects at compile time — Vitest ignores them at the root once `projects` exists.
export default defineVitestConfig({
  root: { plugins: [createReactPlugin()] },
  project: { environment: 'happy-dom', setupFiles: ['./vitest.setup.ts'] },
});
