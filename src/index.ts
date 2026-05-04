#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerAllTools } from './tools/register-tools.js';
import { preloadPopularFrameworks } from './utils/preloader.js';
import { warmUpCaches, schedulePeriodicCacheRefresh } from './utils/cache-warmer.js';
import { logger } from './utils/logger.js';

export default class AppleDeveloperDocsMCPServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: 'apple-docs-mcp',
      version: '1.0.0',
    });

    registerAllTools(this.server);
    this.setupErrorHandling();
  }

  private setupErrorHandling() {
    process.on('SIGINT', () => {
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      process.exit(0);
    });

    // Log and continue rather than exiting: this is a stateless docs proxy where
    // killing the server denies service to all in-flight tool calls (DoS amplifier).
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection, reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
    });
  }

  /**
   * Expose the underlying `McpServer` so tests can attach an
   * `InMemoryTransport` and exercise tools through the public client API.
   */
  public getMcpServer(): McpServer {
    return this.server;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info('Apple Developer Docs MCP server running on stdio');
    logger.info('WWDC Data: Using bundled data from npm package');
    logger.info('Cache system initialized with TTL: API(30m), Index(1h), Technologies(2h)');
    logger.info('Note: Search results are not cached to ensure real-time accuracy');

    // Start framework preloading and cache warming in background
    Promise.all([
      preloadPopularFrameworks(),
      warmUpCaches(),
    ]).catch(error => {
      logger.error('Background initialization failed:', error);
    });

    // Schedule periodic cache refresh (every 30 minutes)
    schedulePeriodicCacheRefresh();
  }
}

// Run server (only in non-test environment)
if (process.env.NODE_ENV !== 'test') {
  const server = new AppleDeveloperDocsMCPServer();
  void server.run().catch((error) => {
    logger.error('Fatal error in main():', error);
    process.exit(1);
  });
}
