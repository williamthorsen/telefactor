import type { TelefactorClient } from '#src/client/create-telefactor-client.ts';
import type { HarnessList } from '#src/http/route-schemas.ts';

/** A harness list with one testable and one untestable harness, `claude-code` being the default. */
export const HARNESS_LIST = {
  source: 'built-in',
  configPath: '/app/telefactor.config.json',
  hasConfigFile: false,
  defaultHarness: 'claude-code',
  timeoutMinutes: 10,
  harnesses: [
    { name: 'claude-code', label: 'Claude Code', command: ['claude', '-p'], testable: true, interactive: true },
    { name: 'codex', label: 'Codex', command: ['codex', 'exec'], testable: false, interactive: false },
  ],
} satisfies HarnessList;

/** Creates a client whose request methods reject unless the overrides replace them; `listHarnesses` returns `HARNESS_LIST`. */
export function createFakeTelefactorClient(overrides: Partial<TelefactorClient> = {}): TelefactorClient {
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
