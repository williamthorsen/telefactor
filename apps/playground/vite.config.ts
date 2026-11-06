import createReactPlugin from '@vitejs/plugin-react';
import { telefactor } from '@williamthorsen/telefactor/vite';
import { mergeConfig } from 'vite';

import baseConfig from '../../vite.config.ts';

// https://vitejs.dev/config/
export default mergeConfig(baseConfig, {
  plugins: [createReactPlugin(), telefactor()],
  server: {
    port: 5176,
  },
});
