/**
 * Response format validation tests
 *
 * Drives every tool through the in-memory MCP transport and verifies that the
 * returned `CallToolResult` is well-formed (text-typed content, no nested
 * objects masquerading as text). The double-wrap regression
 * (`{ content: [{ text: { content: [...] } }] }`) was the original motivation
 * for this suite.
 */

import { jest } from '@jest/globals';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Mock wwdc-data-source before importing anything that uses it
jest.mock('../src/utils/wwdc-data-source.js', () => ({
  loadGlobalMetadata: jest.fn(),
  loadTopicIndex: jest.fn(),
  loadYearIndex: jest.fn(),
  loadVideoData: jest.fn(),
  loadAllVideos: jest.fn(),
  clearDataCache: jest.fn(),
  isDataAvailable: jest.fn().mockResolvedValue(true),
}));

// Mock external dependencies
jest.mock('../src/utils/http-client.js', () => ({
  httpClient: {
    getText: jest.fn().mockResolvedValue('<html><body><ul class="search-results"></ul></body></html>'),
    get: jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    }),
  },
}));

jest.mock('../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../src/utils/cache.js', () => ({
  apiCache: {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    has: jest.fn().mockReturnValue(false),
  },
  generateUrlCacheKey: jest.fn().mockReturnValue('test-cache-key'),
}));

// Mock all handler functions to return proper string responses
jest.mock('../src/tools/list-technologies.js', () => ({
  handleListTechnologies: jest.fn().mockResolvedValue('Mock technologies list'),
}));

jest.mock('../src/tools/search-framework-symbols.js', () => ({
  searchFrameworkSymbols: jest.fn().mockResolvedValue('Mock framework symbols'),
}));

jest.mock('../src/tools/get-related-apis.js', () => ({
  handleGetRelatedApis: jest.fn().mockResolvedValue('Mock related APIs'),
}));

jest.mock('../src/tools/resolve-references-batch.js', () => ({
  handleResolveReferencesBatch: jest.fn().mockResolvedValue('Mock references'),
}));

jest.mock('../src/tools/get-platform-compatibility.js', () => ({
  handleGetPlatformCompatibility: jest.fn().mockResolvedValue('Mock platform compatibility'),
}));

jest.mock('../src/tools/find-similar-apis.js', () => ({
  handleFindSimilarApis: jest.fn().mockResolvedValue('Mock similar APIs'),
}));

jest.mock('../src/tools/get-documentation-updates.js', () => ({
  handleGetDocumentationUpdates: jest.fn().mockResolvedValue('Mock documentation updates'),
}));

jest.mock('../src/tools/get-technology-overviews.js', () => ({
  handleGetTechnologyOverviews: jest.fn().mockResolvedValue('Mock technology overviews'),
}));

jest.mock('../src/tools/get-sample-code.js', () => ({
  handleGetSampleCode: jest.fn().mockResolvedValue('Mock sample code'),
}));

jest.mock('../src/tools/doc-fetcher.js', () => ({
  fetchAppleDocJson: jest.fn().mockResolvedValue({
    content: [{
      type: 'text',
      text: 'Mock doc content',
    }],
  }),
}));

// Search parser is real — we need it to actually format the search response
// for assertions like "contains 'Apple Documentation Search Results'".

import { createTestMcpClient, type McpToolCallResult } from './helpers/mcp-test-server';

describe('Response Format Validation', () => {
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
    ({ client, cleanup } = await createTestMcpClient());
  });

  afterEach(async () => {
    await cleanup();
  });

  /**
   * Valid MCP response format should be:
   * {
   *   content: [
   *     {
   *       type: 'text',
   *       text: string
   *     }
   *   ],
   *   isError?: boolean
   * }
   */
  const validateResponseFormat = (response: any) => {
    expect(response).toHaveProperty('content');
    expect(Array.isArray(response.content)).toBe(true);
    expect(response.content.length).toBeGreaterThan(0);

    response.content.forEach((item: any) => {
      expect(item).toHaveProperty('type');
      expect(item.type).toBe('text');
      expect(item).toHaveProperty('text');
      expect(typeof item.text).toBe('string');

      // Ensure text is not a nested object (the main issue we're preventing)
      expect(typeof item.text).not.toBe('object');
      expect(item.text).not.toHaveProperty('content');
    });
  };

  describe('search_apple_docs response format', () => {
    it('should return properly formatted response for valid query', async () => {
      const response = await callTool('search_apple_docs', { query: 'SwiftUI', type: 'all' });

      validateResponseFormat(response);
      expect(typeof response.content[0].text).toBe('string');
      expect(response.content[0].text).toContain('Apple Documentation Search Results');
    });

    it('should return properly formatted error response for invalid input', async () => {
      const response = await callTool('search_apple_docs', { query: '', type: 'all' });

      validateResponseFormat(response);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Error:');
    });
  });

  describe('All MCP tools response format consistency', () => {
    const toolTests: Array<{ tool: string; args: Record<string, unknown> }> = [
      { tool: 'list_technologies', args: {} },
      { tool: 'search_framework_symbols', args: { framework: 'SwiftUI' } },
      { tool: 'get_apple_doc_content', args: { url: 'https://developer.apple.com/documentation/swiftui' } },
      { tool: 'get_related_apis', args: { apiUrl: 'https://developer.apple.com/documentation/swiftui/view' } },
      { tool: 'resolve_references_batch', args: { sourceUrl: 'https://developer.apple.com/documentation/swiftui' } },
      { tool: 'get_platform_compatibility', args: { apiUrl: 'https://developer.apple.com/documentation/swiftui/view' } },
      { tool: 'find_similar_apis', args: { apiUrl: 'https://developer.apple.com/documentation/swiftui/view' } },
      { tool: 'get_documentation_updates', args: {} },
      { tool: 'get_technology_overviews', args: {} },
      { tool: 'get_sample_code', args: {} },
    ];

    toolTests.forEach(({ tool, args }) => {
      it(`${tool} should return properly formatted response`, async () => {
        const response = await callTool(tool, args);

        validateResponseFormat(response);
        expect(typeof response.content[0].text).toBe('string');
      });
    });
  });

  describe('Error response format consistency', () => {
    it('should maintain consistent error format across all tools', async () => {
      // Test with invalid URL to trigger error in get_apple_doc_content
      const response = await callTool('get_apple_doc_content', { url: 'invalid-url' });

      validateResponseFormat(response);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Error:');
    });

    it('should handle network errors with proper format', async () => {
      // Mock network failure
      const { httpClient } = await import('../src/utils/http-client.js');
      (httpClient.getText as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const response = await callTool('search_apple_docs', { query: 'SwiftUI', type: 'all' });

      validateResponseFormat(response);
      expect(response.isError).toBe(true);
    });
  });

  describe('Regression tests for nested response issue', () => {
    it('should not return nested content objects in search_apple_docs', async () => {
      const response = await callTool('search_apple_docs', { query: 'SwiftUI', type: 'all' });

      const textContent = response.content[0].text;
      expect(typeof textContent).toBe('string');
      expect(textContent).not.toHaveProperty('content');

      if (typeof textContent === 'object') {
        fail(`search_apple_docs returned object instead of string: ${JSON.stringify(textContent)}`);
      }
    });

    it('should prevent double-wrapping of response content', async () => {
      const response = await callTool('search_apple_docs', { query: 'SwiftUI', type: 'all' });

      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);

      const firstItem = response.content[0];
      expect(firstItem.type).toBe('text');
      expect(typeof firstItem.text).toBe('string');

      // Parse the text to ensure it's not stringified JSON
      try {
        const parsed = JSON.parse(firstItem.text);
        if (parsed && typeof parsed === 'object' && parsed.content) {
          fail('Response text appears to be stringified JSON with nested content structure');
        }
      } catch {
        // This is expected - text should not be valid JSON
      }
    });

    it('should not return nested content objects in get_apple_doc_content', async () => {
      const response = await callTool('get_apple_doc_content', {
        url: 'https://developer.apple.com/documentation/uikit/uiviewcontroller',
      });

      const textContent = response.content[0].text;
      expect(typeof textContent).toBe('string');
      expect(textContent).not.toHaveProperty('content');

      if (typeof textContent === 'object') {
        fail(`get_apple_doc_content returned object instead of string: ${JSON.stringify(textContent)}`);
      }
    });

    it('should prevent double-wrapping in get_apple_doc_content when fetchAppleDocJson returns MCP format', async () => {
      const response = await callTool('get_apple_doc_content', {
        url: 'https://developer.apple.com/documentation/swiftui/view',
      });

      validateResponseFormat(response);

      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);

      const firstItem = response.content[0];
      expect(firstItem.type).toBe('text');
      expect(typeof firstItem.text).toBe('string');

      // Ensure the text content is not a stringified MCP response
      try {
        const parsed = JSON.parse(firstItem.text);
        if (parsed && typeof parsed === 'object' && parsed.content && Array.isArray(parsed.content)) {
          fail('get_apple_doc_content text appears to be stringified MCP response - this indicates double-wrapping');
        }
      } catch {
        // This is expected - text should not be valid JSON representing an MCP response
      }
    });

    it('should handle get_apple_doc_content with enhanced options without nesting', async () => {
      const response = await callTool('get_apple_doc_content', {
        url: 'https://developer.apple.com/documentation/swiftui/view',
        includeRelatedApis: true,
        includeReferences: true,
        includeSimilarApis: true,
        includePlatformAnalysis: true,
      });

      validateResponseFormat(response);

      const textContent = response.content[0].text;
      expect(typeof textContent).toBe('string');
      expect(textContent).not.toHaveProperty('content');

      // Verify that enhanced content was requested (mock should still return simple content)
      expect(textContent).toContain('Mock doc content');
    });
  });

  describe('Response size and performance validation', () => {
    it('should return reasonable response sizes', async () => {
      const response = await callTool('search_apple_docs', { query: 'SwiftUI', type: 'all' });

      validateResponseFormat(response);

      const responseText = response.content[0].text;
      expect(responseText.length).toBeLessThan(50000); // 50KB limit
      expect(responseText.length).toBeGreaterThan(10); // Not empty
    });

    it('should handle large responses gracefully', async () => {
      // Mock a large response
      const largeHtml = '<html><body><ul class="search-results">' +
        '<li class="search-result">'.repeat(100) +
        '<article><h1>Test Result</h1><p>Description</p></article></li>'.repeat(100) +
        '</ul></body></html>';

      const { httpClient } = await import('../src/utils/http-client.js');
      (httpClient.getText as jest.Mock).mockResolvedValueOnce(largeHtml);

      const response = await callTool('search_apple_docs', { query: 'SwiftUI', type: 'all' });

      validateResponseFormat(response);
      // Should handle large responses without breaking format
      expect(response.content[0].text).toBeDefined();
    });
  });
});
