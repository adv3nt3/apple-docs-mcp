/**
 * Test helper for driving registerAllTools() through an in-memory MCP
 * transport. Lets the suite of tests previously written against the dispatch
 * table (handleToolCall(name, args, server)) keep their structure, while
 * exercising the same code path a real MCP host would (tools/call dispatch
 * via Client + InMemoryTransport).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerAllTools } from '../../src/tools/register-tools.js';

export interface McpToolCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Build a fresh McpServer with all production tools registered, attach it to
 * a freshly-paired in-memory transport, and return a Client speaking to it.
 */
export async function createTestMcpClient(): Promise<{
  client: Client;
  cleanup: () => Promise<void>;
}> {
  const server = new McpServer({ name: 'apple-docs-mcp-test', version: '0.0.0' });
  registerAllTools(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'apple-docs-mcp-test-client', version: '0.0.0' });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

/**
 * One-shot helper preserving the original `handleToolCall(name, args)` shape
 * used by the tests. Spins up a server+client pair, dispatches the call, and
 * tears down. Convenient but not the cheapest option — for tests that fire
 * many calls in one suite, prefer `createTestMcpClient` and reuse the client.
 */
export async function callToolViaTransport(
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpToolCallResult> {
  const { client, cleanup } = await createTestMcpClient();
  try {
    const result = await client.callTool({ name: toolName, arguments: args });
    return result as McpToolCallResult;
  } finally {
    await cleanup();
  }
}
