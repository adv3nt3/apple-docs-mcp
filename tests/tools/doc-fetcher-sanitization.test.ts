/**
 * Tests for the M1 sanitization helpers inside src/tools/doc-fetcher.ts:
 *   - sanitizeText: strips ASCII control chars and zero-width chars before
 *     embedding text into the markdown that becomes LLM context.
 *   - safeApiUrlFromIdentifier: URL-encodes each path segment derived from an
 *     Apple identifier so identifier characters can't break out of a markdown
 *     link target.
 *   - safeRefUrl: rewrites ref URLs whose absolute hostname is not
 *     developer.apple.com to the inert placeholder '#'.
 *
 * These helpers are intentionally NOT exported from doc-fetcher.ts. We test
 * them indirectly through fetchAppleDocJson by feeding mocked httpClient
 * responses with known-bad fields and asserting the markdown output.
 */

import { jest } from '@jest/globals';
import { fetchAppleDocJson } from '../../src/tools/doc-fetcher.js';

jest.mock('../../src/utils/cache.js', () => ({
  apiCache: {
    get: jest.fn(),
    set: jest.fn(),
  },
  docCache: {
    get: jest.fn(),
    set: jest.fn(),
  },
  generateEnhancedCacheKey: jest.fn((url) => `cache-key-${url}`),
}));

jest.mock('../../src/utils/http-client.js', () => ({
  httpClient: {
    getJson: jest.fn(),
  },
}));

jest.mock('../../src/utils/url-converter.js', () => ({
  convertToJsonApiUrl: jest.fn(),
  isValidAppleDeveloperUrl: jest.fn(() => true),
}));

import { apiCache } from '../../src/utils/cache.js';
import { httpClient } from '../../src/utils/http-client.js';
import { convertToJsonApiUrl } from '../../src/utils/url-converter.js';

const mockApiCache = apiCache as jest.Mocked<typeof apiCache>;
const mockHttpClient = httpClient as jest.Mocked<typeof httpClient>;
const mockConvertToJsonApiUrl =
  convertToJsonApiUrl as jest.MockedFunction<typeof convertToJsonApiUrl>;

const DOC_URL = 'https://developer.apple.com/documentation/uikit/uiview';
const JSON_URL =
  'https://developer.apple.com/tutorials/data/documentation/uikit/uiview.json';

beforeEach(() => {
  jest.clearAllMocks();
  mockConvertToJsonApiUrl.mockReturnValue(JSON_URL);
  (mockApiCache.get as jest.Mock).mockReturnValue(null);
});

describe('doc-fetcher sanitization (M1 fix)', () => {
  describe('sanitizeText: zero-width characters', () => {
    it('strips zero-width chars from titles in extracted references', async () => {
      // U+200B (ZWSP), U+200C (ZWNJ), U+200D (ZWJ), U+FEFF (BOM)
      const dirtyTitle = 'Hidden​Title‌With‍Zero﻿Width';
      mockHttpClient.getJson.mockResolvedValue({
        primaryContentSections: [
          {
            kind: 'content',
            content: [
              {
                type: 'paragraph',
                inlineContent: [{ type: 'text', text: 'Body.' }],
              },
            ],
          },
        ],
        seeAlsoSections: [
          { title: 'Section', identifiers: ['ref1'] },
        ],
        references: {
          ref1: {
            title: dirtyTitle,
            url: '/documentation/uikit/foo',
            kind: 'symbol',
          },
        },
      });

      const result = await fetchAppleDocJson(DOC_URL, {
        includeRelatedApis: true,
      });
      const text = result.content[0].text as string;

      // The dirty form must NOT appear; the cleaned form MUST appear.
      expect(text).not.toContain(dirtyTitle);
      expect(text).toContain('HiddenTitleWithZeroWidth');
    });

    it('strips zero-width chars from reference titles via includeReferences', async () => {
      const dirtyTitle = 'Re​f‌T‍i﻿tle';
      mockHttpClient.getJson.mockResolvedValue({
        primaryContentSections: [
          {
            kind: 'content',
            content: [
              {
                type: 'paragraph',
                inlineContent: [{ type: 'text', text: 'Body.' }],
              },
            ],
          },
        ],
        references: {
          ref1: {
            title: dirtyTitle,
            url: '/documentation/uikit/foo',
            kind: 'symbol',
            role: 'symbol',
          },
        },
      });

      const result = await fetchAppleDocJson(DOC_URL, {
        includeReferences: true,
      });
      const text = result.content[0].text as string;

      expect(text).not.toContain(dirtyTitle);
      expect(text).toContain('RefTitle');
    });
  });

  describe('sanitizeText: ASCII control characters', () => {
    it('strips control chars (\\x00, \\x07, \\x1F) from reference titles', async () => {
      const dirtyTitle = 'Bell\x07Null\x00Unit\x1FSep';
      mockHttpClient.getJson.mockResolvedValue({
        primaryContentSections: [
          {
            kind: 'content',
            content: [
              {
                type: 'paragraph',
                inlineContent: [{ type: 'text', text: 'Body.' }],
              },
            ],
          },
        ],
        seeAlsoSections: [
          { title: 'Section', identifiers: ['ref1'] },
        ],
        references: {
          ref1: {
            title: dirtyTitle,
            url: '/documentation/uikit/foo',
            kind: 'symbol',
          },
        },
      });

      const result = await fetchAppleDocJson(DOC_URL, {
        includeRelatedApis: true,
      });
      const text = result.content[0].text as string;

      expect(text).not.toContain(dirtyTitle);
      // The cleaned form should be present.
      expect(text).toContain('BellNullUnitSep');
      // Sanity: the raw control bytes must NOT survive into the output.
      expect(text).not.toMatch(/[\x00-\x08\x0B-\x1F\x7F]/);
    });

    it('preserves whitespace newlines and tabs (control chars in the allow-window)', async () => {
      // \t (0x09), \n (0x0A) are intentionally NOT stripped by sanitizeText.
      // Use them in a paragraph; they should survive.
      mockHttpClient.getJson.mockResolvedValue({
        primaryContentSections: [
          {
            kind: 'content',
            content: [
              {
                type: 'paragraph',
                inlineContent: [
                  { type: 'text', text: 'tab\there\nthere' },
                ],
              },
            ],
          },
        ],
      });

      const result = await fetchAppleDocJson(DOC_URL);
      const text = result.content[0].text as string;

      // Tab is preserved; the literal '\t' (escape sequence) must NOT appear.
      expect(text).toContain('tab\there');
    });
  });

  describe('safeApiUrlFromIdentifier: URL-encodes path segments', () => {
    it('URL-encodes characters in topic-section identifier paths that would break the link target', async () => {
      // formatAPICollectionContent uses safeApiUrlFromIdentifier when the
      // doc has topicSections (i.e. is treated as an API collection).
      // We feed an identifier with characters that, if left un-encoded in
      // the link target, would break out of the markdown link.
      mockHttpClient.getJson.mockResolvedValue({
        // No primaryContentSections — triggers collection mode.
        metadata: { title: 'UIView', roleHeading: 'Class' },
        topicSections: [
          {
            title: 'Initializers',
            identifiers: [
              'doc://com.apple.SwiftUI/documentation/uikit/uiview/init(frame:options here)',
            ],
          },
        ],
      });

      const result = await fetchAppleDocJson(DOC_URL);
      const text = result.content[0].text as string;

      // Spaces (which split URLs) and colons (which look like scheme
      // separators) MUST be encoded in the link target itself.
      // Find the link target inside the [...](...) markdown link.
      const linkMatch = text.match(/\]\((https?:\/\/[^)]*?init[^\s]+)\)/);
      expect(linkMatch).not.toBeNull();
      const linkTarget = linkMatch![1];
      // The space and colon in the original identifier must be encoded in the URL.
      expect(linkTarget).toContain('%20');
      expect(linkTarget).toContain('%3A');
      // The raw, unencoded space MUST NOT appear in the URL target.
      expect(linkTarget).not.toContain(' ');
      // The raw, unencoded colon (after the host part) MUST NOT appear.
      // Strip the scheme separator (https:) and check the rest.
      expect(linkTarget.replace(/^https?:/, '')).not.toContain(':');
    });
  });

  describe('safeRefUrl: collapses non-Apple hosts to "#"', () => {
    it('collapses references whose absolute url points off-Apple to "#"', async () => {
      mockHttpClient.getJson.mockResolvedValue({
        primaryContentSections: [
          {
            kind: 'content',
            content: [
              {
                type: 'paragraph',
                inlineContent: [{ type: 'text', text: 'Body.' }],
              },
            ],
          },
        ],
        seeAlsoSections: [
          { title: 'Section', identifiers: ['ref1'] },
        ],
        references: {
          ref1: {
            title: 'Evil',
            url: 'https://attacker.example/path',
            kind: 'symbol',
          },
        },
      });

      const result = await fetchAppleDocJson(DOC_URL, {
        includeRelatedApis: true,
      });
      const text = result.content[0].text as string;

      // The off-Apple URL must NOT appear anywhere in the output.
      expect(text).not.toContain('attacker.example');
      // The reference should be rendered with the inert '#' placeholder.
      expect(text).toContain('[**Evil**](#)');
    });

    it('preserves Apple URLs unchanged', async () => {
      mockHttpClient.getJson.mockResolvedValue({
        primaryContentSections: [
          {
            kind: 'content',
            content: [
              {
                type: 'paragraph',
                inlineContent: [{ type: 'text', text: 'Body.' }],
              },
            ],
          },
        ],
        seeAlsoSections: [
          { title: 'Section', identifiers: ['ref1'] },
        ],
        references: {
          ref1: {
            title: 'Good',
            url: 'https://developer.apple.com/documentation/foo',
            kind: 'symbol',
          },
        },
      });

      const result = await fetchAppleDocJson(DOC_URL, {
        includeRelatedApis: true,
      });
      const text = result.content[0].text as string;

      expect(text).toContain('https://developer.apple.com/documentation/foo');
    });

    it('promotes relative URLs to https://developer.apple.com/<path>', async () => {
      mockHttpClient.getJson.mockResolvedValue({
        primaryContentSections: [
          {
            kind: 'content',
            content: [
              {
                type: 'paragraph',
                inlineContent: [{ type: 'text', text: 'Body.' }],
              },
            ],
          },
        ],
        seeAlsoSections: [
          { title: 'Section', identifiers: ['ref1'] },
        ],
        references: {
          ref1: {
            title: 'Rel',
            url: '/documentation/foo/bar',
            kind: 'symbol',
          },
        },
      });

      const result = await fetchAppleDocJson(DOC_URL, {
        includeRelatedApis: true,
      });
      const text = result.content[0].text as string;

      expect(text).toContain('https://developer.apple.com/documentation/foo/bar');
    });
  });
});
