import type { HarnessList, Job, TelefactorClient } from '@williamthorsen/telefactor/client';

/** A harness list with one testable and one untestable harness, `claude-code` being the default. */
export const HARNESS_LIST: HarnessList = {
  source: 'built-in',
  configPath: '/app/telefactor.config.json',
  hasConfigFile: false,
  defaultHarness: 'claude-code',
  timeoutMinutes: 10,
  harnesses: [
    { name: 'claude-code', label: 'Claude Code', command: ['claude', '-p'], testable: true, interactive: true },
    { name: 'codex', label: 'Codex', command: ['codex', 'exec'], testable: false, interactive: false },
  ],
};

/** Builds a job in the given state, running on `claude-code` unless the overrides name another harness. */
export function buildJob(overrides: Partial<Job> = {}): Job {
  return { id: 'job-1', harness: 'claude-code', status: 'running', ...overrides };
}

/**
 * Creates a client whose request methods reject unless the overrides replace them; `listHarnesses` returns
 * `HARNESS_LIST`.
 */
export function createFakeClient(overrides: Partial<TelefactorClient> = {}): TelefactorClient {
  return {
    basePath: '/api/telefactor',
    cancelJob: () => rejectUnstubbed('cancelJob'),
    closeTerminalSession: () => rejectUnstubbed('closeTerminalSession'),
    createTerminalSession: () => rejectUnstubbed('createTerminalSession'),
    getJob: () => rejectUnstubbed('getJob'),
    listHarnesses: () => Promise.resolve(HARNESS_LIST),
    startJob: () => rejectUnstubbed('startJob'),
    terminalSocketUrl: (id) => `ws://localhost/api/telefactor/terminal/sessions/${id}/socket`,
    testHarness: () => rejectUnstubbed('testHarness'),
    ...overrides,
  };
}

// region | Helpers
function rejectUnstubbed(method: string): Promise<never> {
  return Promise.reject(new Error(`${method} is not stubbed.`));
}
// endregion | Helpers
