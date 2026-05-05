/**
 * Tool registrations for Apple Developer Documentation search & content tools.
 *
 * Covers the live-Apple-docs-fetching tools: full-text search, single-page
 * fetch, documentation update feeds, technology overviews, and sample code
 * project browsing.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import {
  searchAppleDocsSchema,
  getAppleDocContentSchema,
  getDocumentationUpdatesSchema,
  getTechnologyOverviewsSchema,
  getSampleCodeSchema,
} from '../../schemas/index.js';

import { handleGetDocumentationUpdates } from '../get-documentation-updates.js';
import { handleGetTechnologyOverviews } from '../get-technology-overviews.js';
import { handleGetSampleCode } from '../get-sample-code.js';

import {
  runGetAppleDocContent,
  runSearchAppleDocs,
  runStringOperation,
} from './_shared.js';

export function registerSearchTools(server: McpServer): void {
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
}
