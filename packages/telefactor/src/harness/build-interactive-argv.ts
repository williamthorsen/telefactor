import type { Harness } from './settings-schema.ts';

/**
 * Returns the argv that starts the harness's interactive session, with its `mcpArgs` appended and each `{mcpUrl}`
 * expanded when an MCP endpoint is served, or `undefined` when the harness has no interactive recipe.
 */
export function buildInteractiveArgv(harness: Harness, mcpUrl: string | undefined): string[] | undefined {
  if (harness.interactive === undefined) return undefined;
  if (mcpUrl === undefined || harness.mcpArgs === undefined) return [...harness.interactive];
  // A replacer function keeps `$` sequences in the URL literal.
  return [...harness.interactive, ...harness.mcpArgs.map((argument) => argument.replaceAll('{mcpUrl}', () => mcpUrl))];
}
