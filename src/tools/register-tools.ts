/**
 * Tool registration for Apple Developer Documentation MCP Server.
 *
 * Registers every tool against an `McpServer` instance via `registerTool`,
 * which is the SDK 1.x replacement for the lower-level `setRequestHandler` +
 * dispatch-table pattern. JSON Schema is generated automatically by the SDK
 * from each Zod schema, so a single Zod definition powers both validation and
 * the schema published to LLM clients via `tools/list`.
 *
 * Per Context7 / SDK docs, `inputSchema` should be a `z.object(...)` (a Zod
 * schema instance), not a raw shape — the SDK 1.29 implementation accepts
 * either, but the full schema form is forward-compatible with v2.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import {
  searchAppleDocsSchema,
  getAppleDocContentSchema,
  listTechnologiesSchema,
  searchFrameworkSymbolsSchema,
  getRelatedApisSchema,
  resolveReferencesBatchSchema,
  getPlatformCompatibilitySchema,
  findSimilarApisSchema,
  getDocumentationUpdatesSchema,
  getTechnologyOverviewsSchema,
  getSampleCodeSchema,
} from '../schemas/index.js';
import {
  listWWDCVideosSchema,
  searchWWDCContentSchema,
  getWWDCVideoSchema,
  getWWDCCodeExamplesSchema,
  browseWWDCTopicsSchema,
  findRelatedWWDCVideosSchema,
  listWWDCYearsSchema,
} from '../schemas/wwdc.schemas.js';
import { z } from 'zod';

import { parseSearchResults } from './search-parser.js';
import { fetchAppleDocJson } from './doc-fetcher.js';
import { handleListTechnologies } from './list-technologies.js';
import { searchFrameworkSymbols } from './search-framework-symbols.js';
import { handleGetRelatedApis } from './get-related-apis.js';
import { handleResolveReferencesBatch } from './resolve-references-batch.js';
import { handleGetPlatformCompatibility } from './get-platform-compatibility.js';
import { handleFindSimilarApis } from './find-similar-apis.js';
import { handleGetDocumentationUpdates } from './get-documentation-updates.js';
import { handleGetTechnologyOverviews } from './get-technology-overviews.js';
import { handleGetSampleCode } from './get-sample-code.js';
import {
  handleListWWDCVideos,
  handleSearchWWDCContent,
  handleGetWWDCVideo,
  handleGetWWDCCodeExamples,
  handleBrowseWWDCTopics,
  handleFindRelatedWWDCVideos,
  handleListWWDCYears,
} from './wwdc/wwdc-handlers.js';

import { APPLE_URLS, RECURSION_LIMITS } from '../utils/constants.js';
import { httpClient } from '../utils/http-client.js';
import { isValidAppleDeveloperUrl } from '../utils/url-converter.js';
import {
  appError,
  createStandardErrorResponse,
  createToolErrorResponse,
  ErrorType,
  validateInput,
  type AppError,
} from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

const empty = z.object({});

/**
 * Wrap a string-returning operation in the standard MCP CallToolResult shape,
 * routing AppError-shaped failures through `createToolErrorResponse` so each
 * tool keeps its tool-specific suggestion text.
 *
 * The error-handler helpers return the local `ErrorResponse` interface, which
 * is structurally compatible with `CallToolResult` but lacks the index
 * signature `CallToolResult` carries — cast through `unknown` to bridge the
 * two without weakening either type elsewhere.
 */
async function runStringOperation(
  operation: () => Promise<string>,
  toolName: string,
): Promise<CallToolResult> {
  try {
    const result = await operation();
    return {
      content: [{ type: 'text' as const, text: result }],
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'type' in error) {
      return createToolErrorResponse(error as AppError, toolName) as unknown as CallToolResult;
    }
    return createStandardErrorResponse(error, toolName) as unknown as CallToolResult;
  }
}

/**
 * Search Apple Developer Documentation. Preserves the input validation +
 * upstream-fetch + parser flow that previously lived as a wrapper method on
 * `AppleDeveloperDocsMCPServer.searchAppleDocs`.
 *
 * Exported so regression tests can drive it directly without spinning up a
 * full `McpServer` + transport.
 */
export async function runSearchAppleDocs(
  query: string,
  type: string = 'all',
): Promise<CallToolResult> {
  try {
    const queryValidation = validateInput(query, 'Search query');
    if (queryValidation) {
      return createToolErrorResponse(queryValidation, 'search_apple_docs') as unknown as CallToolResult;
    }

    const searchUrl = `${APPLE_URLS.SEARCH}?q=${encodeURIComponent(query)}`;
    logger.info(`Searching Apple docs for: ${query}`);

    const html = await httpClient.getText(searchUrl);
    return parseSearchResults(html, query, searchUrl, type) as unknown as CallToolResult;
  } catch (error) {
    if (error && typeof error === 'object' && 'type' in error) {
      return createToolErrorResponse(error as AppError, 'search_apple_docs') as unknown as CallToolResult;
    }
    return createStandardErrorResponse(error, 'search_apple_docs') as unknown as CallToolResult;
  }
}

/**
 * Fetch and format a single Apple Developer Documentation page. Preserves the
 * URL validation + recursion-depth guarantees that previously lived as a
 * wrapper method on `AppleDeveloperDocsMCPServer.getAppleDocContent`.
 *
 * Exported so the regression test for nested-response output can call it
 * directly (it asserts that `fetchAppleDocJson`'s already-MCP-shaped return
 * value is not double-wrapped).
 */
export async function runGetAppleDocContent(
  url: string,
  includeRelatedApis: boolean = false,
  includeReferences: boolean = false,
  includeSimilarApis: boolean = false,
  includePlatformAnalysis: boolean = false,
): Promise<CallToolResult> {
  try {
    const urlValidation = validateInput(url, 'URL');
    if (urlValidation) {
      return createToolErrorResponse(urlValidation, 'get_apple_doc_content') as unknown as CallToolResult;
    }

    if (!isValidAppleDeveloperUrl(url)) {
      return createToolErrorResponse(
        appError(ErrorType.INVALID_INPUT, 'URL must be from developer.apple.com'),
        'get_apple_doc_content',
      ) as unknown as CallToolResult;
    }

    // fetchAppleDocJson already returns the MCP CallToolResult shape, so
    // return it unwrapped (re-wrapping would nest the `content` field — see
    // tests/regression/get-apple-doc-content-nesting.test.ts).
    return await fetchAppleDocJson(
      url,
      {
        includeRelatedApis,
        includeReferences,
        includeSimilarApis,
        includePlatformAnalysis,
      },
      RECURSION_LIMITS.MAX_DOC_FETCH_DEPTH,
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'type' in error) {
      return createToolErrorResponse(error as AppError, 'get_apple_doc_content') as unknown as CallToolResult;
    }
    return createStandardErrorResponse(error, 'get_apple_doc_content') as unknown as CallToolResult;
  }
}

/**
 * Build the performance report markdown blob exposed by the
 * `get_performance_report` diagnostic tool.
 */
async function runGetPerformanceReport(): Promise<CallToolResult> {
  const { getCacheWarmUpStatus } = await import('../utils/cache-warmer.js');
  const { getPreloadStats } = await import('../utils/preloader.js');
  const { globalRateLimiter } = await import('../utils/rate-limiter.js');

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
  } = await import('../utils/cache.js');

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

/**
 * Register every tool the apple-docs-mcp server exposes. Call this once during
 * startup, after constructing the `McpServer`.
 */
export function registerAllTools(server: McpServer): void {
  // ---- Apple Developer Documentation tools -------------------------------

  server.registerTool(
    'search_apple_docs',
    {
      title: 'Search Apple Docs',
      description:
        'Search Apple Developer Documentation for APIs, frameworks, guides, and samples. Best for finding specific APIs, classes, or methods. For browsing sample code projects, use get_sample_code. For WWDC videos, use the dedicated WWDC tools (list_wwdc_videos, search_wwdc_content).',
      inputSchema: searchAppleDocsSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ query, type }): Promise<CallToolResult> =>
      runSearchAppleDocs(query, type),
  );

  server.registerTool(
    'get_apple_doc_content',
    {
      title: 'Get Apple Doc Content',
      description:
        'Get detailed content from a specific Apple Developer Documentation page. Use this after search_apple_docs to get full documentation. Supports enhanced analysis options for comprehensive API understanding. Best for: reading API details, understanding usage, checking availability.',
      inputSchema: getAppleDocContentSchema,
      annotations: { readOnlyHint: true },
    },
    async ({
      url,
      includeRelatedApis,
      includeReferences,
      includeSimilarApis,
      includePlatformAnalysis,
    }): Promise<CallToolResult> =>
      runGetAppleDocContent(
        url,
        includeRelatedApis,
        includeReferences,
        includeSimilarApis,
        includePlatformAnalysis,
      ),
  );

  server.registerTool(
    'list_technologies',
    {
      title: 'List Technologies',
      description:
        'Browse all Apple technologies and frameworks by category. Essential for discovering available frameworks and understanding Apple\'s technology ecosystem. Use this when: exploring what\'s available, finding framework identifiers for search_framework_symbols, checking beta status.',
      inputSchema: listTechnologiesSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ category, language, includeBeta, limit }): Promise<CallToolResult> =>
      runStringOperation(
        () => handleListTechnologies(category, language, includeBeta, limit),
        'listTechnologies',
      ),
  );

  server.registerTool(
    'search_framework_symbols',
    {
      title: 'Search Framework Symbols',
      description:
        'Browse and search symbols within a specific Apple framework. Perfect for exploring framework APIs, finding all views/controllers/delegates in a framework, or discovering available types. Use after list_technologies to get framework identifiers.',
      inputSchema: searchFrameworkSymbolsSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ framework, symbolType, namePattern, language, limit }): Promise<CallToolResult> =>
      runStringOperation(
        () => searchFrameworkSymbols(framework, symbolType, namePattern, language, limit),
        'searchFrameworkSymbols',
      ),
  );

  server.registerTool(
    'get_related_apis',
    {
      title: 'Get Related APIs',
      description:
        'Analyze API relationships and discover related functionality. Shows inheritance, protocol conformances, and Apple\'s recommended alternatives. Essential for understanding how APIs work together. Use when: learning API hierarchy, finding protocol requirements, discovering related functionality.',
      inputSchema: getRelatedApisSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ apiUrl, includeInherited, includeConformance, includeSeeAlso }): Promise<CallToolResult> =>
      runStringOperation(
        () => handleGetRelatedApis(apiUrl, includeInherited, includeConformance, includeSeeAlso),
        'getRelatedApis',
      ),
  );

  server.registerTool(
    'resolve_references_batch',
    {
      title: 'Resolve References Batch',
      description:
        'Deep dive into all types and APIs referenced in a documentation page. Resolves all mentioned types, methods, and properties to understand dependencies. Use when: analyzing complex APIs, understanding type requirements, exploring API ecosystems.',
      inputSchema: resolveReferencesBatchSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ sourceUrl, maxReferences, filterByType }): Promise<CallToolResult> =>
      runStringOperation(
        () => handleResolveReferencesBatch(sourceUrl, maxReferences, filterByType),
        'resolveReferencesBatch',
      ),
  );

  server.registerTool(
    'get_platform_compatibility',
    {
      title: 'Get Platform Compatibility',
      description:
        'Check API availability across Apple platforms and OS versions. Shows minimum deployment targets, deprecations, and platform-specific features. Critical for cross-platform development. Use when: planning app requirements, checking API availability, finding platform alternatives.',
      inputSchema: getPlatformCompatibilitySchema,
      annotations: { readOnlyHint: true },
    },
    async ({ apiUrl, compareMode, includeRelated }): Promise<CallToolResult> =>
      runStringOperation(
        () => handleGetPlatformCompatibility(apiUrl, compareMode, includeRelated),
        'getPlatformCompatibility',
      ),
  );

  server.registerTool(
    'find_similar_apis',
    {
      title: 'Find Similar APIs',
      description:
        'Discover alternative and related APIs. Finds APIs with similar functionality, modern replacements for deprecated APIs, and platform-specific alternatives. Perfect when looking for better ways to implement functionality.',
      inputSchema: findSimilarApisSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ apiUrl, searchDepth, filterByCategory, includeAlternatives }): Promise<CallToolResult> =>
      runStringOperation(
        () => handleFindSimilarApis(apiUrl, searchDepth, filterByCategory, includeAlternatives),
        'findSimilarApis',
      ),
  );

  server.registerTool(
    'get_documentation_updates',
    {
      title: 'Get Documentation Updates',
      description:
        'Track latest Apple platform updates, new APIs, and changes. Shows WWDC announcements, framework updates, and release notes. Essential for staying current with Apple development. For detailed WWDC videos, use WWDC-specific tools.',
      inputSchema: getDocumentationUpdatesSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ category, technology, year, searchQuery, includeBeta, limit }): Promise<CallToolResult> =>
      runStringOperation(
        () => handleGetDocumentationUpdates(category, technology, year, searchQuery, includeBeta, limit),
        'getDocumentationUpdates',
      ),
  );

  server.registerTool(
    'get_technology_overviews',
    {
      title: 'Get Technology Overviews',
      description:
        'Access comprehensive guides and tutorials for Apple technologies. Includes getting started guides, architectural overviews, best practices, and implementation patterns. Perfect for learning new frameworks or understanding Apple\'s recommended approaches.',
      inputSchema: getTechnologyOverviewsSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ category, platform, searchQuery, includeSubcategories, limit }): Promise<CallToolResult> =>
      runStringOperation(
        () => handleGetTechnologyOverviews(category, platform, searchQuery, includeSubcategories, limit),
        'getTechnologyOverviews',
      ),
  );

  server.registerTool(
    'get_sample_code',
    {
      title: 'Get Sample Code',
      description:
        'Browse complete sample projects from Apple. Full working examples demonstrating best practices and implementation patterns. Different from search_apple_docs which returns code snippets. Use for learning by example.',
      inputSchema: getSampleCodeSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ framework, beta, searchQuery, limit }): Promise<CallToolResult> =>
      runStringOperation(
        () => handleGetSampleCode(framework, beta, searchQuery, limit),
        'getSampleCode',
      ),
  );

  // ---- WWDC tools --------------------------------------------------------

  server.registerTool(
    'list_wwdc_videos',
    {
      title: 'List WWDC Videos',
      description:
        'Browse WWDC session videos with full offline access to transcripts and code. Shows all available sessions with filtering options. Use this to discover WWDC content, find sessions by topic, or identify videos with code examples.',
      inputSchema: listWWDCVideosSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ year, topic, hasCode, limit }): Promise<CallToolResult> => {
      const result = await handleListWWDCVideos(year, topic, hasCode, limit);
      return { content: [{ type: 'text', text: result }] };
    },
  );

  server.registerTool(
    'search_wwdc_content',
    {
      title: 'Search WWDC Content',
      description:
        'Full-text search across all WWDC video transcripts and code examples. Find specific discussions, API mentions, or implementation examples. More powerful than list_wwdc_videos for finding specific content.',
      inputSchema: searchWWDCContentSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ query, searchIn, year, language, limit }): Promise<CallToolResult> => {
      const result = await handleSearchWWDCContent(query, searchIn, year, language, limit);
      return { content: [{ type: 'text', text: result }] };
    },
  );

  server.registerTool(
    'get_wwdc_video',
    {
      title: 'Get WWDC Video',
      description:
        'Access complete WWDC session content including full transcript, code examples, and resources. Use after finding videos with list_wwdc_videos or search_wwdc_content. Provides offline access to entire session content.',
      inputSchema: getWWDCVideoSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ year, videoId, includeTranscript, includeCode }): Promise<CallToolResult> => {
      const result = await handleGetWWDCVideo(year, videoId, includeTranscript, includeCode);
      return { content: [{ type: 'text', text: result }] };
    },
  );

  server.registerTool(
    'get_wwdc_code_examples',
    {
      title: 'Get WWDC Code Examples',
      description:
        'Browse all code examples from WWDC sessions. Perfect for finding implementation patterns, seeing new API usage, or learning by example. Each result includes the code and its session context.',
      inputSchema: getWWDCCodeExamplesSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ framework, topic, year, language, limit }): Promise<CallToolResult> => {
      const result = await handleGetWWDCCodeExamples(framework, topic, year, language, limit);
      return { content: [{ type: 'text', text: result }] };
    },
  );

  server.registerTool(
    'browse_wwdc_topics',
    {
      title: 'Browse WWDC Topics',
      description:
        'List all WWDC topic categories with their IDs. Essential first step before using list_wwdc_videos with topic filtering. Returns topic IDs like "swiftui-ui-frameworks" that can be used in other tools.',
      inputSchema: browseWWDCTopicsSchema,
      annotations: { readOnlyHint: true },
    },
    async ({ topicId, includeVideos, year, limit }): Promise<CallToolResult> => {
      const result = await handleBrowseWWDCTopics(topicId, includeVideos, year, limit);
      return { content: [{ type: 'text', text: result }] };
    },
  );

  server.registerTool(
    'find_related_wwdc_videos',
    {
      title: 'Find Related WWDC Videos',
      description:
        'Discover WWDC sessions related to a specific video. Finds prerequisite sessions, follow-up content, and thematically similar talks. Essential for creating learning paths.',
      inputSchema: findRelatedWWDCVideosSchema,
      annotations: { readOnlyHint: true },
    },
    async ({
      videoId,
      year,
      includeExplicitRelated,
      includeTopicRelated,
      includeYearRelated,
      limit,
    }): Promise<CallToolResult> => {
      const result = await handleFindRelatedWWDCVideos(
        videoId,
        year,
        includeExplicitRelated,
        includeTopicRelated,
        includeYearRelated,
        limit,
      );
      return { content: [{ type: 'text', text: result }] };
    },
  );

  server.registerTool(
    'list_wwdc_years',
    {
      title: 'List WWDC Years',
      description:
        'List all available WWDC years with video counts and statistics. Shows which years have content available and how many videos each year contains.',
      inputSchema: listWWDCYearsSchema,
      annotations: { readOnlyHint: true },
    },
    async (): Promise<CallToolResult> => {
      const result = await handleListWWDCYears();
      return { content: [{ type: 'text', text: result }] };
    },
  );

  // ---- Diagnostic tools (previously inline in handlers.ts) ----------------

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
