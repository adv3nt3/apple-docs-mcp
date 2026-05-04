/**
 * Tool registration / dispatch tests — exercises the production tool surface
 * via Client → InMemoryTransport → McpServer (registerAllTools).
 *
 * The original suite tested a `handleToolCall(name, args, server)` dispatch
 * table that no longer exists; this version verifies the same behaviour at
 * the transport boundary instead, which is the path real MCP hosts take.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { createTestMcpClient, type McpToolCallResult } from '../helpers/mcp-test-server';

// Mock the underlying handlers so we can assert they were called with the
// right (defaults-applied) arguments.
jest.mock('../../src/tools/search-parser.js');
jest.mock('../../src/tools/doc-fetcher.js');
jest.mock('../../src/tools/list-technologies.js');
jest.mock('../../src/tools/search-framework-symbols.js');
jest.mock('../../src/tools/get-related-apis.js');
jest.mock('../../src/tools/resolve-references-batch.js');
jest.mock('../../src/tools/get-platform-compatibility.js');
jest.mock('../../src/tools/find-similar-apis.js');
jest.mock('../../src/tools/get-documentation-updates.js');
jest.mock('../../src/tools/get-technology-overviews.js');
jest.mock('../../src/tools/get-sample-code.js');

// Mock wwdc-data-source to avoid import.meta.url issues
jest.mock('../../src/utils/wwdc-data-source.js');

// Mock WWDC handlers
jest.mock('../../src/tools/wwdc/wwdc-handlers.js', () => ({
  handleListWWDCVideos: jest.fn().mockResolvedValue('WWDC Videos'),
  handleSearchWWDCContent: jest.fn().mockResolvedValue('WWDC Search Results'),
  handleGetWWDCVideo: jest.fn().mockResolvedValue('WWDC Video Details'),
  handleGetWWDCCodeExamples: jest.fn().mockResolvedValue('WWDC Code Examples'),
  handleBrowseWWDCTopics: jest.fn().mockResolvedValue('WWDC Topics'),
  handleFindRelatedWWDCVideos: jest.fn().mockResolvedValue('Related WWDC Videos'),
  handleListWWDCYears: jest.fn().mockResolvedValue('WWDC Years'),
}));

import { searchFrameworkSymbols } from '../../src/tools/search-framework-symbols.js';
import { handleListTechnologies } from '../../src/tools/list-technologies.js';
import { handleGetDocumentationUpdates } from '../../src/tools/get-documentation-updates.js';
import { parseSearchResults } from '../../src/tools/search-parser.js';
import { fetchAppleDocJson } from '../../src/tools/doc-fetcher.js';

const mockSearchFrameworkSymbols = searchFrameworkSymbols as jest.MockedFunction<typeof searchFrameworkSymbols>;
const mockHandleListTechnologies = handleListTechnologies as jest.MockedFunction<typeof handleListTechnologies>;
const mockHandleGetDocumentationUpdates = handleGetDocumentationUpdates as jest.MockedFunction<typeof handleGetDocumentationUpdates>;
const mockParseSearchResults = parseSearchResults as jest.MockedFunction<typeof parseSearchResults>;
const mockFetchAppleDocJson = fetchAppleDocJson as jest.MockedFunction<typeof fetchAppleDocJson>;

// httpClient.getText is invoked by the search_apple_docs flow before the
// parser runs — stub it so the call doesn't reach out to the network.
jest.mock('../../src/utils/http-client.js', () => ({
  httpClient: {
    getText: jest.fn().mockResolvedValue('<html></html>'),
  },
}));

describe('Tool dispatch (registerAllTools via in-memory transport)', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  const callTool = async (
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<McpToolCallResult> => {
    const result = await client.callTool({ name, arguments: args });
    return result as McpToolCallResult;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockSearchFrameworkSymbols.mockResolvedValue('Framework symbols');
    mockHandleListTechnologies.mockResolvedValue('Technologies list');
    mockHandleGetDocumentationUpdates.mockResolvedValue('Documentation updates');
    mockParseSearchResults.mockReturnValue({
      content: [{ type: 'text', text: 'Search results' }],
    } as any);
    mockFetchAppleDocJson.mockResolvedValue({
      content: [{ type: 'text', text: 'Doc content' }],
    } as any);

    ({ client, cleanup } = await createTestMcpClient());
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('tools/list', () => {
    it('exposes every production tool', async () => {
      const { tools } = await client.listTools();
      const names = tools.map(t => t.name).sort();

      expect(names).toEqual([
        'browse_wwdc_topics',
        'find_related_wwdc_videos',
        'find_similar_apis',
        'get_apple_doc_content',
        'get_cache_stats',
        'get_documentation_updates',
        'get_performance_report',
        'get_platform_compatibility',
        'get_related_apis',
        'get_sample_code',
        'get_technology_overviews',
        'get_wwdc_code_examples',
        'get_wwdc_video',
        'list_technologies',
        'list_wwdc_videos',
        'list_wwdc_years',
        'resolve_references_batch',
        'search_apple_docs',
        'search_framework_symbols',
        'search_wwdc_content',
      ]);
    });
  });

  describe('tools/call', () => {
    it('dispatches search_apple_docs to the parser', async () => {
      const result = await callTool('search_apple_docs', { query: 'SwiftUI', type: 'all' });

      expect(mockParseSearchResults).toHaveBeenCalled();
      expect(result.content[0].text).toBe('Search results');
    });

    it('dispatches get_apple_doc_content with all flags', async () => {
      const result = await callTool('get_apple_doc_content', {
        url: 'https://developer.apple.com/documentation/swiftui',
        includeRelatedApis: true,
        includeReferences: false,
      });

      expect(mockFetchAppleDocJson).toHaveBeenCalledWith(
        'https://developer.apple.com/documentation/swiftui',
        {
          includeRelatedApis: true,
          includeReferences: false,
          includeSimilarApis: false,
          includePlatformAnalysis: false,
        },
        expect.any(Number),
      );
      expect(result.content[0].text).toBe('Doc content');
    });

    it('returns isError when calling an unknown tool', async () => {
      const result = await callTool('unknown_tool', {});
      expect(result.isError).toBe(true);
    });

    it('applies Zod defaults to list_technologies arguments', async () => {
      await callTool('list_technologies', { category: 'games', language: 'swift', includeBeta: false });

      expect(mockHandleListTechnologies).toHaveBeenCalledWith('games', 'swift', false, 200);
    });

    it('applies Zod defaults when fields are omitted', async () => {
      await callTool('list_technologies', { category: 'ui', limit: 10 });

      expect(mockHandleListTechnologies).toHaveBeenCalledWith('ui', undefined, true, 10);
    });

    it('passes through every search_framework_symbols field', async () => {
      await callTool('search_framework_symbols', {
        framework: 'swiftui',
        symbolType: 'struct',
        namePattern: '*View',
        language: 'swift',
        limit: 100,
      });

      expect(mockSearchFrameworkSymbols).toHaveBeenCalledWith(
        'swiftui',
        'struct',
        '*View',
        'swift',
        100,
      );
    });

    it('passes through every get_documentation_updates field', async () => {
      await callTool('get_documentation_updates', {
        category: 'wwdc',
        technology: 'SwiftUI',
        year: '2024',
        searchQuery: 'animation',
        includeBeta: true,
        limit: 50,
      });

      expect(mockHandleGetDocumentationUpdates).toHaveBeenCalledWith(
        'wwdc',
        'SwiftUI',
        '2024',
        'animation',
        true,
        50,
      );
    });
  });
});
