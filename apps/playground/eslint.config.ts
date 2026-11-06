import { defineConfig } from 'eslint/config';
import reactPlugin from 'eslint-plugin-react';
import reactManifest from 'react/package.json' with { type: 'json' };

import baseConfig from '../../eslint.config.ts';

export default defineConfig(...baseConfig, {
  files: ['**/*.tsx'],
  languageOptions: {
    globals: {
      JSX: 'readonly',
    },
  },
  plugins: {
    react: reactPlugin,
  },
  rules: {
    ...reactPlugin.configs.recommended.rules,
    'no-undef': 'off',
    'react/react-in-jsx-scope': 'off', // disabled because React 17 doesn't need React to be in scope
  },
  settings: {
    react: {
      // `detect` is unusable until eslint-plugin-react drops its eslint 9 API calls.
      version: reactManifest.version,
    },
  },
});
