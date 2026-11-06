import { defineConfig } from '@williamthorsen/strict-lint/config';

/** Strict-lint settings for the repo. */
export default defineConfig({
  maxSeverity: {
    // The shared config sets `max-lines` as advisory; keep it a warning rather than a gate failure.
    'max-lines': 'warn',
  },
});
