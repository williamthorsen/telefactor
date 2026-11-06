import { defineRdyConfig } from 'readyup';

/** Repo-level readyup settings. */
export default defineRdyConfig({
  compile: {
    // `lib/` holds modules that the kits share, which are not kits.
    exclude: 'lib/**',
  },
  internal: {
    infix: 'internal',
  },
  // The checks in these sources will be run by `rdy run --sources`.
  sources: [
    'github:williamthorsen/.github',
    'npm:@williamthorsen/eslint-config-typescript',
    'npm:@williamthorsen/nmr',
    'npm:@williamthorsen/release-kit',
    'npm:@williamthorsen/toolbelt.objects',
    'npm:@williamthorsen/tsconfig',
    'npm:codeassembly',
    'npm:readyup',
    'npm:v11y-check',
  ],
});
