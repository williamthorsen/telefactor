import { type CallToolResult, McpServer } from '@modelcontextprotocol/server';

import {
  describeRefusal,
  type RunOutcome,
  type StateSnapshot,
  type StateStore,
} from '#src/contract/create-state-store.ts';
import { type Contract, GET_STATE_TOOL_NAME, getInputSchema } from '#src/contract/define-contract.ts';

/**
 * Creates an MCP server with one tool per action of the contract and a `get_state` tool that reads the store. An action
 * tool runs the action through the store with the input that the server has already parsed with the action's schema.
 * Each tool returns the snapshot that results, and a refused action returns an error result with the refusal's message.
 */
export function createMcpServer(contract: Contract, store: StateStore): McpServer {
  // The version of the tool surface that the contract derives; MCP requires one.
  const server = new McpServer({ name: 'telefactor', version: '1' });

  server.registerTool(GET_STATE_TOOL_NAME, { description: 'Reads the current state of the app session.' }, () =>
    toSnapshotResult(store.read()),
  );

  for (const [name, action] of Object.entries(contract.actions)) {
    server.registerTool(name, { description: action.description, inputSchema: getInputSchema(action) }, async (input) =>
      toToolResult(await store.runParsed(name, input)),
    );
  }

  return server;
}

// region | Helpers
function toSnapshotResult(snapshot: StateSnapshot): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(snapshot) }], structuredContent: { ...snapshot } };
}

function toToolResult(outcome: RunOutcome): CallToolResult {
  if (outcome.ok) return toSnapshotResult(outcome.snapshot);
  return { content: [{ type: 'text', text: describeRefusal(outcome) }], isError: true };
}
// endregion | Helpers
