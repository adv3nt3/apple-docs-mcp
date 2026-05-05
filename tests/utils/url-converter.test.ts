/**
 * Tests for URL converter utilities
 */

import {
  convertToJsonApiUrl,
  isValidAppleDeveloperUrl,
  extractApiNameFromUrl,
  assertAppleDeveloperUrl,
} from '../../src/utils/url-converter.js';
import { ErrorType } from '../../src/utils/error-handler.js';

describe('URL Converter', () => {
  describe('convertToJsonApiUrl', () => {
    it('should convert documentation URL to JSON API URL', () => {
      const webUrl = 'https://developer.apple.com/documentation/swiftui/view';
      const expected = 'https://developer.apple.com/tutorials/data/documentation/swiftui/view.json';
      
      expect(convertToJsonApiUrl(webUrl)).toBe(expected);
    });

    it('should handle URLs with trailing slash', () => {
      const webUrl = 'https://developer.apple.com/documentation/swiftui/view/';
      const expected = 'https://developer.apple.com/tutorials/data/documentation/swiftui/view.json';
      
      expect(convertToJsonApiUrl(webUrl)).toBe(expected);
    });

    it('should convert tutorial URL to JSON API URL', () => {
      const webUrl = 'https://developer.apple.com/tutorials/swiftui/creating-and-combining-views';
      const expected = 'https://developer.apple.com/tutorials/data/swiftui/creating-and-combining-views.json';
      
      expect(convertToJsonApiUrl(webUrl)).toBe(expected);
    });

    it('should return original URL if not recognized format', () => {
      const webUrl = 'https://developer.apple.com/news/some-article';
      
      expect(convertToJsonApiUrl(webUrl)).toBe(webUrl);
    });
  });

  describe('isValidAppleDeveloperUrl', () => {
    it('should return true for valid Apple Developer URLs', () => {
      const validUrls = [
        'https://developer.apple.com/documentation/swiftui',
        'https://developer.apple.com/tutorials/swiftui',
        'https://developer.apple.com/news/some-article',
      ];

      validUrls.forEach(url => {
        expect(isValidAppleDeveloperUrl(url)).toBe(true);
      });
    });

    it('should return false for invalid URLs', () => {
      const invalidUrls = [
        'https://apple.com/documentation/swiftui',
        'https://google.com/search',
        'not-a-url',
        '',
      ];

      invalidUrls.forEach(url => {
        expect(isValidAppleDeveloperUrl(url)).toBe(false);
      });
    });

    // Regression: even when the hostname matches developer.apple.com, only
    // http(s) protocols may pass. Anything else (ftp, file, javascript, data)
    // is rejected to keep the SSRF surface tight (fix follow-up to H2).
    it.each([
      'ftp://developer.apple.com/foo',
      'file:///developer.apple.com',
      'file://developer.apple.com/etc/passwd',
      'javascript://developer.apple.com/%0aalert(1)',
      'data://developer.apple.com/text/plain;base64,Zm9v',
    ])('should reject non-http(s) protocol %s', (url) => {
      expect(isValidAppleDeveloperUrl(url)).toBe(false);
    });
  });

  describe('extractApiNameFromUrl', () => {
    it('should extract API name from URL', () => {
      const testCases = [
        {
          url: 'https://developer.apple.com/documentation/swiftui/view',
          expected: 'view'
        },
        {
          url: 'https://developer.apple.com/documentation/foundation/nsstring',
          expected: 'nsstring'
        },
        {
          url: 'https://developer.apple.com/documentation/swiftui/view/',
          expected: ''
        }
      ];

      testCases.forEach(({ url, expected }) => {
        const result = extractApiNameFromUrl(url);
        if (expected === '') {
          expect(result).toBe('Unknown API');
        } else {
          expect(result).toBe(expected);
        }
      });
    });

    it('should return "Unknown API" for invalid URLs', () => {
      expect(extractApiNameFromUrl('not-a-url')).toBe('Unknown API');
    });
  });

  describe('assertAppleDeveloperUrl (H2 SSRF guard)', () => {
    it.each([
      'https://developer.apple.com',
      'https://developer.apple.com/',
      'https://developer.apple.com/documentation/swiftui',
      'https://developer.apple.com/documentation/swiftui/view',
      'https://developer.apple.com/tutorials/swiftui',
      'https://developer.apple.com/news/some-article',
      'https://developer.apple.com/path?query=foo',
    ])('allows %s', (url) => {
      expect(() => assertAppleDeveloperUrl(url)).not.toThrow();
    });

    it.each([
      'https://attacker.example/',
      'https://apple.com/documentation/swiftui',
      'https://developer.apple.com.attacker.example/',
      'http://attacker.example/?developer.apple.com=foo',
      'https://attacker.example/?developer.apple.com=foo',
      'not-a-url',
      '',
      'file:///etc/passwd',
      // Substring-attack regression: just having developer.apple.com in
      // the URL anywhere must not be enough.
      'https://attacker.example/developer.apple.com/path',
      // Protocol-smuggling regression: even when the hostname parses to
      // developer.apple.com, non-http(s) protocols must be rejected so
      // they cannot reach the upstream fetch path.
      'ftp://developer.apple.com/foo',
      'file:///developer.apple.com',
      'file://developer.apple.com/etc/passwd',
    ])('throws an INVALID_INPUT AppError for %j', (url) => {
      let caught: unknown;
      try {
        assertAppleDeveloperUrl(url);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeDefined();
      // The thrown value is an AppError-shape object, not a vanilla Error.
      expect(typeof caught).toBe('object');
      expect(caught).toMatchObject({
        type: ErrorType.INVALID_INPUT,
        message: 'URL must be from developer.apple.com',
      });
    });

    it('passes the duck-type check used by handleAsyncOperation', () => {
      let caught: unknown;
      try {
        assertAppleDeveloperUrl('https://attacker.example/');
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeTruthy();
      // The 'type' in error guard from src/index.ts:handleAsyncOperation
      // must succeed against this thrown value.
      expect(typeof caught === 'object' && caught !== null && 'type' in caught).toBe(true);
    });
  });
});