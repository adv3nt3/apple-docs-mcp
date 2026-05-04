/**
 * Tool registrations for Apple framework / API exploration tools.
 *
 * Covers framework discovery (`list_technologies`), symbol browsing
 * (`search_framework_symbols`), API relationship analysis (`get_related_apis`,
 * `find_similar_apis`), reference resolution (`resolve_references_batch`), and
 * platform compatibility (`get_platform_compatibility`).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import {
  listTechnologiesSchema,
  searchFrameworkSymbolsSchema,
  getRelatedApisSchema,
  resolveReferencesBatchSchema,
  getPlatformCompatibilitySchema,
  findSimilarApisSchema,
} from '../../schemas/index.js';

import { handleListTechnologies } from '../list-technologies.js';
import { searchFrameworkSymbols } from '../search-framework-symbols.js';
import { handleGetRelatedApis } from '../get-related-apis.js';
import { handleResolveReferencesBatch } from '../resolve-references-batch.js';
import { handleGetPlatformCompatibility } from '../get-platform-compatibility.js';
import { handleFindSimilarApis } from '../find-similar-apis.js';

import { runStringOperation } from './_shared.js';

export function registerFrameworkTools(server: McpServer): void {
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
}
