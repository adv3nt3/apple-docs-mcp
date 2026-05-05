import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// Avoid kicking off background work (preloader, cache warmer) during tests.
jest.mock('../src/utils/preloader.js', () => ({
  preloadPopularFrameworks: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/utils/cache-warmer.js', () => ({
  warmUpCaches: jest.fn().mockResolvedValue(undefined),
  schedulePeriodicCacheRefresh: jest.fn(),
}));
jest.mock('../src/utils/wwdc-data-source.js');

// Import after mocks
import AppleDeveloperDocsMCPServer from '../src/index.js';

describe('AppleDeveloperDocsMCPServer', () => {
  let server: AppleDeveloperDocsMCPServer;

  beforeEach(() => {
    jest.clearAllMocks();
    server = new AppleDeveloperDocsMCPServer();
  });

  describe('construction', () => {
    it('creates an McpServer and exposes it via getMcpServer()', () => {
      expect(server.getMcpServer()).toBeDefined();
    });

    it('registers the run() entry point', () => {
      expect(typeof server.run).toBe('function');
    });
  });

  describe('tool surface (via in-memory transport)', () => {
    let client: Client;

    beforeEach(async () => {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      client = new Client({ name: 'index-test-client', version: '0.0.0' });

      await Promise.all([
        server.getMcpServer().connect(serverTransport),
        client.connect(clientTransport),
      ]);
    });

    afterEach(async () => {
      await client.close();
    });

    it('publishes every tool through tools/list', async () => {
      const { tools } = await client.listTools();
      const names = tools.map(t => t.name);

      // Spot-check a handful from each category — full enumeration is in
      // tests/tools/handlers.test.ts. Diagnostic tools (`get_performance_report`,
      // `get_cache_stats`) are gated behind MCP_DIAGNOSTICS=true and are NOT
      // expected in the default surface.
      expect(names).toEqual(expect.arrayContaining([
        'search_apple_docs',
        'get_apple_doc_content',
        'list_technologies',
        'search_framework_symbols',
        'list_wwdc_videos',
        'list_wwdc_years',
      ]));
      expect(names).not.toEqual(expect.arrayContaining([
        'get_performance_report',
        'get_cache_stats',
      ]));
    });

    it('returns a JSON-Schema input schema generated from Zod for each tool', async () => {
      const { tools } = await client.listTools();
      const search = tools.find(t => t.name === 'search_apple_docs');
      expect(search).toBeDefined();
      const inputSchema = search?.inputSchema as { type: string; properties: Record<string, unknown> };
      expect(inputSchema.type).toBe('object');
      expect(inputSchema.properties).toHaveProperty('query');
    });
  });
});
