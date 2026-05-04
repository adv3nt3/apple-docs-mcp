/**
 * Tool registrations for diagnostic / observability tools.
 *
 * Covers `get_performance_report` and `get_cache_stats`. The actual report
 * generators are kept as private helpers in this file because they are only
 * called from the diagnostic registrations.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { httpClient } from '../../utils/http-client.js';

const empty = z.object({});

/**
 * Build the performance report markdown blob exposed by the
 * `get_performance_report` diagnostic tool.
 */
async function runGetPerformanceReport(): Promise<CallToolResult> {
  const { getCacheWarmUpStatus } = await import('../../utils/cache-warmer.js');
  const { getPreloadStats } = await import('../../utils/preloader.js');
  const { globalRateLimiter } = await import('../../utils/rate-limiter.js');

  let report = '# Performance Report\n\n';
  report += httpClient.getPerformanceReport();
  report += '\n\n';

  const warmUpStatus = getCacheWarmUpStatus();
  report += '## Cache Warm-up Status\n\n';
  report += `- **Total Cache Entries:** ${warmUpStatus.totalCacheEntries}\n`;
  report += `- **API Cache:** ${warmUpStatus.apiCacheSize} entries\n`;
  report += `- **Technologies Cache:** ${warmUpStatus.technologiesCacheSize} entries\n`;
  report += `- **Updates Cache:** ${warmUpStatus.updatesCacheSize} entries\n`;
  report += `- **Overviews Cache:** ${warmUpStatus.overviewsCacheSize} entries\n\n`;

  const preloadStats = getPreloadStats();
  report += '## Framework Preload Status\n\n';
  report += `- **Preloaded Frameworks:** ${preloadStats.preloadedFrameworks.join(', ')}\n`;
  report += `- **Index Cache Hit Rate:** ${preloadStats.cacheHitRate}\n\n`;

  const rateLimiterStats = globalRateLimiter.getStats();
  report += '## Rate Limiter Status\n\n';
  report += `- **Current Requests:** ${rateLimiterStats.currentRequests}/${rateLimiterStats.maxRequests}\n`;
  report += `- **Utilization:** ${rateLimiterStats.utilizationRate}\n`;
  report += `- **Window:** ${rateLimiterStats.windowMs / 1000}s\n`;

  return { content: [{ type: 'text', text: report }] };
}

/**
 * Build the cache statistics markdown blob exposed by the `get_cache_stats`
 * diagnostic tool.
 */
async function runGetCacheStats(): Promise<CallToolResult> {
  const {
    apiCache,
    searchCache,
    indexCache,
    technologiesCache,
    updatesCache,
    sampleCodeCache,
    technologyOverviewsCache,
  } = await import('../../utils/cache.js');

  const stats = {
    apiCache: apiCache.getStats(),
    searchCache: searchCache.getStats(),
    indexCache: indexCache.getStats(),
    technologiesCache: technologiesCache.getStats(),
    updatesCache: updatesCache.getStats(),
    sampleCodeCache: sampleCodeCache.getStats(),
    technologyOverviewsCache: technologyOverviewsCache.getStats(),
  };

  let report = '# Cache Statistics Report\n\n';
  Object.entries(stats).forEach(([name, stat]) => {
    report += `## ${name}\n`;
    report += `- Size: ${stat.size}/${stat.maxSize}\n`;
    report += `- Hit Rate: ${stat.hitRate}\n`;
    report += `- Hits: ${stat.hits}\n`;
    report += `- Misses: ${stat.misses}\n\n`;
  });

  return { content: [{ type: 'text', text: report }] };
}

export function registerDiagnosticTools(server: McpServer): void {
  server.registerTool(
    'get_performance_report',
    {
      title: 'Get Performance Report',
      description:
        'Diagnostic: HTTP client performance, cache warm-up status, framework preload status, and rate limiter status as a single Markdown report.',
      inputSchema: empty,
      annotations: { readOnlyHint: true },
    },
    async (): Promise<CallToolResult> => runGetPerformanceReport(),
  );

  server.registerTool(
    'get_cache_stats',
    {
      title: 'Get Cache Stats',
      description:
        'Diagnostic: per-cache statistics (size, hit rate, hits, misses) for every cache the server maintains.',
      inputSchema: empty,
      annotations: { readOnlyHint: true },
    },
    async (): Promise<CallToolResult> => runGetCacheStats(),
  );
}
