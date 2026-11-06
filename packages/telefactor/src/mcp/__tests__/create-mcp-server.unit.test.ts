import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createStateStore, type StateStore } from '#src/contract/create-state-store.ts';
import { defineContract } from '#src/contract/define-contract.ts';
import { implementContract } from '#src/contract/implement-contract.ts';
import { createTelefactorApp } from '#src/http/create-app.ts';
import type { Jobs } from '#src/jobs/create-jobs.ts';
import { implementCounter } from '#src/test-utils/counter-contract.ts';

import { createMcpServer } from '../create-mcp-server.ts';

const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

describe(createMcpServer, () => {
  it('lists each action and get_state as tools', async () => {
    const { client } = await connect();

    const { tools } = await client.listTools();

    expect(tools.map(({ name, description }) => ({ name, description }))).toStrictEqual([
      { name: 'get_state', description: 'Reads the current state of the app session.' },
      { name: 'add', description: 'Adds an amount to the count.' },
      { name: 'corrupt', description: 'Returns a state that the schema rejects.' },
      { name: 'fail', description: 'Throws.' },
    ]);
    expect(tools.find((tool) => tool.name === 'add')?.inputSchema).toMatchObject({
      type: 'object',
      properties: { amount: { type: 'integer' } },
      required: ['amount'],
    });
  });

  it('changes the state through an action and reads it through get_state', async () => {
    const { client, store } = await connect();

    const result = await client.callTool({ name: 'add', arguments: { amount: 4 } });
    const read = await client.callTool({ name: 'get_state' });

    expect(result.structuredContent).toStrictEqual({ version: 1, state: { count: 4 } });
    expect(read.structuredContent).toStrictEqual({ version: 1, state: { count: 4 } });
    expect(store.read().state).toStrictEqual({ count: 4 });
  });

  it('runs an action whose input schema transforms its input', async () => {
    const contract = defineContract({
      state: z.object({ count: z.number() }),
      actions: { set: { description: 'Sets the count.', input: z.object({ count: z.string().transform(Number) }) } },
    });
    const store = createStateStore(
      implementContract(contract, { initialState: { count: 0 }, handlers: { set: (_, { count }) => ({ count }) } }),
    );
    const { client } = await connect(store);

    const result = await client.callTool({ name: 'set', arguments: { count: '7' } });

    expect(result.structuredContent).toStrictEqual({ version: 1, state: { count: 7 } });
  });

  it('returns an error result for a refused action and leaves the state unchanged', async () => {
    const { client, store } = await connect();

    const result = await client.callTool({ name: 'fail' });

    expect(result).toMatchObject({ isError: true, content: [{ type: 'text', text: 'boom' }] });
    expect(store.read().version).toBe(0);
  });
});

// region | Helpers
/** Connects a client to the app's `/mcp` route through the app's own `fetch`, without a network. */
async function connect(store: StateStore = createStateStore(implementCounter())) {
  const jobs: Jobs = {
    cancel: () => Promise.reject(new Error('unused')),
    cancelAll: () => Promise.resolve(),
    get: () => Promise.resolve(undefined),
    start: () => Promise.reject(new Error('unused')),
  };
  const app = createTelefactorApp({
    jobs,
    readSettings: () => Promise.reject(new Error('unused')),
    runTest: () => Promise.reject(new Error('unused')),
    isAllowed: () => true,
    store,
  });
  const client = new Client({ name: 'test', version: '1' });
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
      fetch: (input, init) => Promise.resolve(app.fetch(new Request(input, init))),
    }),
  );
  return { client, store };
}
// endregion | Helpers
