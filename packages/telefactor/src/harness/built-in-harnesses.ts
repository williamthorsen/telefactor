import type { Harness } from './settings-schema.ts';

/** The harness that runs a job when neither the request nor the settings name another. */
export const BUILT_IN_DEFAULT_HARNESS = 'claude-code';

/**
 * The recipes that apply when neither the environment variable nor the config file defines a harness. Each runs with
 * its harness's default permission mode, so a tool that needs approval is denied in a headless run.
 */
export const BUILT_IN_HARNESSES: Readonly<Record<string, Harness>> = {
  'claude-code': {
    label: 'Claude Code',
    command: ['claude', '-p'],
    test: ['claude', '-p', 'Reply with OK.'],
  },
  codex: {
    label: 'Codex',
    command: ['codex', 'exec', '-'],
    test: ['codex', 'login', 'status'],
  },
  'rovo-dev': {
    label: 'Rovo Dev',
    // Rovo Dev does not read its instruction from stdin.
    command: ['acli', 'rovodev', 'run', '{prompt}'],
    test: ['acli', 'rovodev', 'auth', 'status'],
  },
};
