import { describe, expect, it } from 'vitest';

import { buildInteractiveArgv } from '../build-interactive-argv.ts';
import { BUILT_IN_HARNESSES } from '../built-in-harnesses.ts';

const MCP_URL = 'http://localhost:5176/api/telefactor/mcp';

describe(buildInteractiveArgv, () => {
  it('returns undefined for a harness without an interactive command', () => {
    expect(buildInteractiveArgv({ command: ['a'] }, MCP_URL)).toBeUndefined();
  });

  it('appends the MCP arguments with the URL expanded', () => {
    const argv = buildInteractiveArgv(
      { command: ['a'], interactive: ['a', '-i'], mcpArgs: ['--mcp={mcpUrl}'] },
      MCP_URL,
    );

    expect(argv).toStrictEqual(['a', '-i', `--mcp=${MCP_URL}`]);
  });

  it('omits the MCP arguments when no endpoint is served', () => {
    expect(
      buildInteractiveArgv({ command: ['a'], interactive: ['a'], mcpArgs: ['{mcpUrl}'] }, undefined),
    ).toStrictEqual(['a']);
  });

  it('keeps `$` sequences in the URL literal', () => {
    expect(buildInteractiveArgv({ command: ['a'], interactive: ['a'], mcpArgs: ['{mcpUrl}'] }, 'x$&y')).toStrictEqual([
      'a',
      'x$&y',
    ]);
  });

  it('gives Claude Code an inline MCP config that names the endpoint', () => {
    const claudeCode = BUILT_IN_HARNESSES['claude-code'];
    if (claudeCode === undefined) throw new Error('The built-in Claude Code recipe is missing.');

    const [, flag, config] = buildInteractiveArgv(claudeCode, MCP_URL) ?? [];

    expect(flag).toBe('--mcp-config');
    expect(JSON.parse(config ?? '')).toStrictEqual({ mcpServers: { telefactor: { type: 'http', url: MCP_URL } } });
  });

  it('gives Codex the endpoint as a TOML string', () => {
    const codex = BUILT_IN_HARNESSES['codex'];
    if (codex === undefined) throw new Error('The built-in Codex recipe is missing.');

    expect(buildInteractiveArgv(codex, MCP_URL)).toStrictEqual([
      'codex',
      '-c',
      `mcp_servers.telefactor.url="${MCP_URL}"`,
    ]);
  });
});
