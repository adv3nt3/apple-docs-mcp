/**
 * Tests for resolve_references_batch tool. Mirrors the mock pattern in
 * tests/tools/get-related-apis.test.ts.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { handleResolveReferencesBatch } from '../../src/tools/resolve-references-batch.js';
import { httpClient } from '../../src/utils/http-client.js';
import {
  convertToJsonApiUrl,
  assertAppleDeveloperUrl,
} from '../../src/utils/url-converter.js';
import { ErrorType } from '../../src/utils/error-handler.js';

jest.mock('../../src/utils/http-client.js');
jest.mock('../../src/utils/url-converter.js', () => ({
  convertToJsonApiUrl: jest.fn(),
  isValidAppleDeveloperUrl: jest.fn().mockReturnValue(true),
  assertAppleDeveloperUrl: jest.fn(),
}));

const mockHttpClient = httpClient as jest.Mocked<typeof httpClient>;
const mockConvertToJsonApiUrl = convertToJsonApiUrl as jest.MockedFunction<
  typeof convertToJsonApiUrl
>;
const mockAssertAppleDeveloperUrl =
  assertAppleDeveloperUrl as jest.MockedFunction<typeof assertAppleDeveloperUrl>;

describe('handleResolveReferencesBatch', () => {
  const sourceUrl = 'https://developer.apple.com/documentation/swiftui/view';
  const jsonUrl =
    'https://developer.apple.com/tutorials/data/documentation/swiftui/view.json';

  /**
   * Build a synthetic Apple JSON response with N references of the given role
   * (default 'symbol') so we can exercise filtering and limits independently.
   */
  function buildResponse(
    refsByRole: Record<string, number>,
    extras: Partial<Record<string, unknown>> = {},
  ): Record<string, unknown> {
    const references: Record<string, unknown> = {};
    for (const [role, count] of Object.entries(refsByRole)) {
      for (let i = 0; i < count; i++) {
        const id = `${role}-${i}`;
        references[id] = {
          title: `${role[0].toUpperCase()}${role.slice(1)} ${i}`,
          url: `/documentation/swiftui/${id}`,
          role,
          kind: role === 'symbol' ? 'symbol' : undefined,
          abstract: [{ text: `An ${role} reference.` }],
        };
      }
    }
    return {
      metadata: { title: 'View' },
      references,
      ...extras,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockConvertToJsonApiUrl.mockReturnValue(jsonUrl);
    mockAssertAppleDeveloperUrl.mockImplementation(() => undefined);
  });

  describe('happy path', () => {
    it('formats references grouped by role when filterByType=all', async () => {
      mockHttpClient.getJson.mockResolvedValue(
        buildResponse({ symbol: 2, article: 1, sampleCode: 1 }),
      );

      const result = await handleResolveReferencesBatch(sourceUrl, 20, 'all');

      // Header
      expect(result).toContain('# References from View');
      expect(result).toContain(sourceUrl);
      expect(result).toContain('**Resolved 4 references:**');

      // Each role-group section appears.
      expect(result).toContain('## API Symbols (2)');
      expect(result).toContain('## Articles (1)');
      expect(result).toContain('## Sample Code (1)');

      // Individual references rendered.
      expect(result).toContain('### [Symbol 0]');
      expect(result).toContain('### [Article 0]');
      expect(result).toContain('### [SampleCode 0]');

      // URLs are absolutized to developer.apple.com.
      expect(result).toContain(
        'https://developer.apple.com/documentation/swiftui/symbol-0',
      );

      // Footer.
      expect(result).toContain('Total: 4 references resolved');
    });
  });

  describe('filterByType', () => {
    it('keeps only symbol refs when filterByType="symbol"', async () => {
      mockHttpClient.getJson.mockResolvedValue(
        buildResponse({ symbol: 2, article: 3 }),
      );

      const result = await handleResolveReferencesBatch(
        sourceUrl,
        20,
        'symbol',
      );

      expect(result).toContain('**Resolved 2 references:**');
      expect(result).toContain('## API Symbols (2)');
      // No article group should appear.
      expect(result).not.toContain('## Articles');
      expect(result).not.toContain('Article 0');
      expect(result).not.toContain('Article 1');
      expect(result).not.toContain('Article 2');
    });
  });

  describe('maxReferences cap', () => {
    it('caps the output to N entries when maxReferences=5', async () => {
      mockHttpClient.getJson.mockResolvedValue(buildResponse({ symbol: 12 }));

      const result = await handleResolveReferencesBatch(sourceUrl, 5, 'all');

      expect(result).toContain('**Resolved 5 references:**');
      expect(result).toContain('## API Symbols (5)');
      expect(result).toContain('Total: 5 references resolved');
      // The 6th and beyond must NOT be rendered.
      expect(result).not.toContain('Symbol 5');
      expect(result).not.toContain('Symbol 6');
    });
  });

  describe('empty input', () => {
    it('returns the "No references found" message when references is empty', async () => {
      mockHttpClient.getJson.mockResolvedValue({
        metadata: { title: 'View' },
        references: {},
      });

      const result = await handleResolveReferencesBatch(sourceUrl, 20, 'all');

      expect(result).toContain('No references found in:');
      expect(result).toContain(sourceUrl);
    });

    it('returns the "No references found" message when references is missing', async () => {
      mockHttpClient.getJson.mockResolvedValue({ metadata: { title: 'View' } });

      const result = await handleResolveReferencesBatch(sourceUrl, 20, 'all');

      expect(result).toContain('No references found in:');
    });
  });

  describe('error path', () => {
    it('returns the failure message when convertToJsonApiUrl returns null', async () => {
      mockConvertToJsonApiUrl.mockReturnValue(null);

      const result = await handleResolveReferencesBatch(sourceUrl, 20, 'all');

      expect(result).toContain('Error: Failed to resolve references:');
      expect(result).toContain('Invalid Apple Developer Documentation URL');
    });

    it('returns the failure message when httpClient.getJson throws', async () => {
      mockHttpClient.getJson.mockRejectedValue(new Error('boom'));

      const result = await handleResolveReferencesBatch(sourceUrl, 20, 'all');

      expect(result).toContain('Error: Failed to resolve references:');
    });
  });

  describe('URL validation (H2 SSRF guard wiring)', () => {
    it('propagates the AppError thrown by assertAppleDeveloperUrl for non-Apple URLs', async () => {
      mockAssertAppleDeveloperUrl.mockImplementation(() => {
        throw {
          type: ErrorType.INVALID_INPUT,
          message: 'URL must be from developer.apple.com',
        };
      });

      let caught: unknown;
      try {
        await handleResolveReferencesBatch(
          'https://attacker.example/',
          20,
          'all',
        );
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeDefined();
      expect(caught).toMatchObject({ type: ErrorType.INVALID_INPUT });
      // httpClient must NOT have been called since validation runs first.
      expect(mockHttpClient.getJson).not.toHaveBeenCalled();
    });
  });
});
