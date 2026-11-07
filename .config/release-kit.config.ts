import { defineConfig } from '@williamthorsen/release-kit/config';

const config = defineConfig({
  // Include root-only commits, which the default union of package paths excludes.
  project: { paths: ['**'] },

  releaseNotes: {
    shouldInjectIntoReadme: true,
  },

  repoLabels: {
    extends: ['common'],
    labels: {
      'scope:root': { color: '00ff96' },
      'scope:_workspace': { color: '00ff96' },
      'scope:playground': { color: '00ff96' },
      'scope:telefactor': { color: '00ff96' },
    },
  },

  // Uncomment to exclude workspaces from release processing:
  // workspaces: [
  //   { dir: 'my-package', shouldExclude: true },
  // ],

  // Formatting: prettier is auto-detected. Set formatCommand to override.

  // Uncomment to override the default version patterns:
  // versionPatterns: { major: ['!'], minor: ['feat', 'feature'] },

  // Uncomment to add custom work types (merged with defaults):
  // workTypes: { perf: { header: 'Performance' } },
});

export default config;
