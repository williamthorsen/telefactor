import path from 'node:path';

import { createConfig, patterns } from '@williamthorsen/eslint-config-typescript';
import { defineConfig } from 'eslint/config';
import reactManifest from 'react/package.json' with { type: 'json' };

import baseConfig from '../../eslint.config.ts';

export default defineConfig(
  ...baseConfig,
  {
    files: patterns.codeFiles.map((pattern) => path.join('src', pattern)),
    extends: [
      await createConfig.next(), //
      await createConfig.react(),
    ],
    settings: {
      // A relative path resolves against the working directory, silently disabling no-html-link-for-pages.
      next: { rootDir: import.meta.dirname },
      // `detect` is unusable until eslint-plugin-react drops its eslint 9 API calls.
      react: { version: reactManifest.version },
      vitest: { typecheck: true },
    },
  },
  {
    files: patterns.codeFiles.map((pattern) => path.join('src', '**/__tests__', pattern)),
    extends: [await createConfig.reactTestingLibrary(), await createConfig.vitest()],
    rules: {
      'react/display-name': 'off', // Not needed in tests

      'testing-library/render-result-naming-convention': 'error',
      'testing-library/no-manual-cleanup': 'off', // Vitest does not clean up automatically after each test.

      'vitest/max-expects': 'off',
      'vitest/no-hooks': 'off',
      'vitest/padding-around-all': 'off',
      'vitest/padding-around-expect-groups': 'off',
      'vitest/prefer-expect-assertions': 'off',
    },
    settings: {
      'testing-library/custom-renders': 'off',
      vitest: { typecheck: true },
    },
  },
  {
    files: ['**/next-env.d.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off', // Next generates a file that uses triple slashes
    },
  },
);
