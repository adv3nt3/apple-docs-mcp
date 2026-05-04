/**
 * Tests for get_platform_compatibility tool. Mirrors the mock pattern in
 * tests/tools/get-related-apis.test.ts: stub url-converter and httpClient,
 * then drive handleGetPlatformCompatibility through the formatted-output
 * surface.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { handleGetPlatformCompatibility } from '../../src/tools/get-platform-compatibility.js';
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

describe('handleGetPlatformCompatibility', () => {
  const apiUrl = 'https://developer.apple.com/documentation/swiftui/view';
  const jsonUrl =
    'https://developer.apple.com/tutorials/data/documentation/swiftui/view.json';

  beforeEach(() => {
    jest.clearAllMocks();
    mockConvertToJsonApiUrl.mockReturnValue(jsonUrl);
    mockAssertAppleDeveloperUrl.mockImplementation(() => undefined);
  });

  describe('single-API mode', () => {
    it('formats output with platform names, beta flags, deprecation flags, and min versions', async () => {
      mockHttpClient.getJson.mockResolvedValue({
        metadata: {
          title: 'View',
          platforms: [
            { name: 'iOS', introducedAt: '13.0' },
            { name: 'macOS', introducedAt: '10.15', deprecated: true, deprecatedAt: '14.0' },
            { name: 'visionOS', introducedAt: '1.0', beta: true },
          ],
        },
      });

      const result = await handleGetPlatformCompatibility(apiUrl);

      // Header / source.
      expect(result).toContain('# Platform Compatibility: View');
      expect(result).toContain(apiUrl);

      // Each platform name appears.
      expect(result).toContain('iOS');
      expect(result).toContain('macOS');
      expect(result).toContain('visionOS');

      // Min version section emitted.
      expect(result).toContain('## Minimum Version Requirements');
      expect(result).toContain('iOS:** 13.0+');
      expect(result).toContain('macOS:** 10.15+');
      expect(result).toContain('visionOS:** 1.0+');

      // Beta and deprecation flags.
      expect(result).toContain('Beta Platforms:** visionOS');
      expect(result).toContain('Deprecated Platforms:** macOS');
      expect(result).toContain('Deprecated: 14.0');
    });

    it('flags an API supported on multiple platforms as cross-platform', async () => {
      mockHttpClient.getJson.mockResolvedValue({
        metadata: {
          title: 'View',
          platforms: [
            { name: 'iOS', introducedAt: '13.0' },
            { name: 'macOS', introducedAt: '10.15' },
            { name: 'tvOS', introducedAt: '13.0' },
          ],
        },
      });

      const result = await handleGetPlatformCompatibility(apiUrl);

      expect(result).toContain('**Cross-Platform:** Yes');
      expect(result).toContain('Cross-platform compatible');
      // All three platforms must be listed in the supported list.
      expect(result).toMatch(/Supported Platforms:\*\* iOS, macOS, tvOS/);
    });

    it('flags an API supported on a single platform as platform-specific', async () => {
      mockHttpClient.getJson.mockResolvedValue({
        metadata: {
          title: 'iOSOnly',
          platforms: [{ name: 'iOS', introducedAt: '17.0' }],
        },
      });

      const result = await handleGetPlatformCompatibility(apiUrl);

      expect(result).toContain('**Cross-Platform:** No');
      expect(result).toContain('Platform-specific');
      expect(result).toContain('only available on iOS');
    });

    it('flags a beta-only API in the metadata summary', async () => {
      mockHttpClient.getJson.mockResolvedValue({
        metadata: {
          title: 'BetaThing',
          platforms: [
            { name: 'iOS', introducedAt: '18.0', beta: true },
            { name: 'macOS', introducedAt: '15.0', beta: true },
          ],
        },
      });

      const result = await handleGetPlatformCompatibility(apiUrl);

      expect(result).toContain('Beta Platforms:** iOS, macOS');
      expect(result).toContain('Beta platforms');
      // Each beta status line under detailed info.
      const betaLines = result.match(/Status: Beta/g);
      expect(betaLines).not.toBeNull();
      expect(betaLines!.length).toBeGreaterThanOrEqual(2);
    });

    it('returns a graceful message when metadata.platforms is missing', async () => {
      mockHttpClient.getJson.mockResolvedValue({ metadata: { title: 'No platforms' } });

      const result = await handleGetPlatformCompatibility(apiUrl);

      expect(result).toContain('No platform information available for:');
      expect(result).toContain(apiUrl);
    });
  });

  describe('framework mode (compareMode: "framework")', () => {
    it('returns aggregate output and (since includeRelated defaults to true in framework mode) walks topic sections', async () => {
      // The framework path forces includeRelated=true and then calls the
      // single-API analyzer; on a topic-section walk, each related ref is
      // fetched again. We mock the second getJson with another platform set.
      mockHttpClient.getJson
        .mockResolvedValueOnce({
          metadata: {
            title: 'SwiftUI',
            platforms: [{ name: 'iOS', introducedAt: '13.0' }],
          },
          topicSections: [
            {
              title: 'Views',
              identifiers: ['ref1'],
            },
          ],
          references: {
            ref1: {
              title: 'TextView',
              url: '/documentation/swiftui/textview',
            },
          },
        })
        .mockResolvedValueOnce({
          metadata: {
            title: 'TextView',
            platforms: [
              { name: 'iOS', introducedAt: '13.0' },
              { name: 'macOS', introducedAt: '10.15' },
            ],
          },
        });

      const result = await handleGetPlatformCompatibility(
        apiUrl,
        'framework',
        false,
      );

      expect(result).toContain('# Platform Compatibility: SwiftUI');
      // Related-API block must appear because framework mode forces
      // includeRelated regardless of the third arg.
      expect(result).toContain('## Related APIs Compatibility');
      expect(result).toContain('### Platform Compatibility: TextView');
    });
  });

  describe('error path', () => {
    it('returns a generic "Failed to analyze platform compatibility" message when httpClient throws', async () => {
      mockHttpClient.getJson.mockRejectedValue(new Error('network down'));

      const result = await handleGetPlatformCompatibility(apiUrl);

      expect(result).toContain('Error: Failed to analyze platform compatibility');
    });

    it('returns the failure message when convertToJsonApiUrl returns null', async () => {
      mockConvertToJsonApiUrl.mockReturnValue(null);

      const result = await handleGetPlatformCompatibility(apiUrl);

      expect(result).toContain('Error: Failed to analyze platform compatibility');
      expect(result).toContain('Invalid Apple Developer Documentation URL');
    });
  });

  describe('URL validation (security: H2 SSRF guard wiring)', () => {
    it('propagates the AppError thrown by assertAppleDeveloperUrl for non-Apple URLs', async () => {
      mockAssertAppleDeveloperUrl.mockImplementation(() => {
        throw {
          type: ErrorType.INVALID_INPUT,
          message: 'URL must be from developer.apple.com',
        };
      });

      let caught: unknown;
      try {
        await handleGetPlatformCompatibility('https://attacker.example/');
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
