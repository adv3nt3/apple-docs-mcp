/**
 * Integration tests for WWDC tools — drive the production tool surface
 * through an in-memory MCP transport (Client → InMemoryTransport → McpServer
 * with all tools registered via registerAllTools).
 */

// Mock dependencies BEFORE any imports
jest.mock('../../../src/utils/http-client');
jest.mock('../../../src/utils/wwdc-data-source');

import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { createTestMcpClient, type McpToolCallResult } from '../../helpers/mcp-test-server';

// Import mocked functions
import {
  loadGlobalMetadata,
  loadTopicIndex,
  loadYearIndex,
  loadVideoData,
  loadAllVideos,
} from '../../../src/utils/wwdc-data-source';

const mockLoadGlobalMetadata = loadGlobalMetadata as jest.MockedFunction<typeof loadGlobalMetadata>;
const mockLoadTopicIndex = loadTopicIndex as jest.MockedFunction<typeof loadTopicIndex>;
const mockLoadYearIndex = loadYearIndex as jest.MockedFunction<typeof loadYearIndex>;
const mockLoadVideoData = loadVideoData as jest.MockedFunction<typeof loadVideoData>;
const mockLoadAllVideos = loadAllVideos as jest.MockedFunction<typeof loadAllVideos>;

describe('WWDC Tools Integration', () => {
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

    // Setup default mocks
    mockLoadGlobalMetadata.mockResolvedValue({
      version: '1.0',
      lastUpdated: '2025-01-01',
      totalVideos: 100,
      topics: [
        { id: 'swiftui', name: 'SwiftUI', url: 'https://example.com' },
      ],
      years: ['2025', '2024'],
      statistics: {
        byTopic: { swiftui: 10 },
        byYear: { '2025': 50, '2024': 50 },
        videosWithCode: 80,
        videosWithTranscript: 90,
        videosWithResources: 70,
      },
    } as any);

    mockLoadYearIndex.mockResolvedValue({
      year: '2025',
      videoCount: 50,
      topics: ['SwiftUI', 'UIKit'],
      videos: [
        {
          id: '10001',
          year: '2025',
          title: 'Test Video',
          topics: ['SwiftUI'],
          duration: '20 min',
          hasCode: true,
          hasTranscript: true,
          dataFile: 'videos/2025-10001.json',
          url: 'https://example.com/10001',
        },
      ],
    } as any);

    mockLoadVideoData.mockResolvedValue({
      id: '10001',
      title: 'Test Video',
      year: '2025',
      duration: '20 min',
      topics: ['SwiftUI'],
      hasTranscript: true,
      hasCode: true,
      transcript: {
        fullText: 'Test transcript content',
        segments: [],
      },
      codeExamples: [
        {
          language: 'swift',
          platform: 'iOS',
          title: 'Example',
          code: 'print("Hello")',
        },
      ],
      resources: {
        download: 'https://example.com/download',
      },
      relatedVideos: [],
      url: 'https://example.com/10001',
      description: 'Test video description',
      speakers: [],
    } as any);

    mockLoadTopicIndex.mockResolvedValue({
      topicId: 'swiftui-ui-frameworks',
      topicName: 'SwiftUI & UI Frameworks',
      videoCount: 10,
      videos: ['videos/2025-10001.json'],
    } as any);

    mockLoadAllVideos.mockResolvedValue([
      {
        id: '10001',
        title: 'Test Video',
        year: '2025',
        topics: ['SwiftUI'],
      },
    ] as any);

    ({ client, cleanup } = await createTestMcpClient());
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('list_wwdc_videos', () => {
    it('should list WWDC videos', async () => {
      const result = await callTool('list_wwdc_videos', {});

      expect(result).toHaveProperty('content');
      expect(result.content[0].text).toContain('WWDC Video List');
      expect(mockLoadGlobalMetadata).toHaveBeenCalled();
    });

    it('should filter videos by year', async () => {
      const result = await callTool('list_wwdc_videos', { year: '2025' });

      expect(result.content[0].text).toContain('2025');
      expect(mockLoadYearIndex).toHaveBeenCalledWith('2025');
    });

    it('should filter videos by topic', async () => {
      await callTool('list_wwdc_videos', { topic: 'swiftui-ui-frameworks' });

      expect(mockLoadTopicIndex).toHaveBeenCalledWith('swiftui-ui-frameworks');
    });
  });

  describe('search_wwdc_content', () => {
    it('should search WWDC content', async () => {
      const result = await callTool('search_wwdc_content', { query: 'SwiftUI' });

      expect(result).toHaveProperty('content');
      expect(mockLoadGlobalMetadata).toHaveBeenCalled();
    });

    it('should search with filters', async () => {
      await callTool('search_wwdc_content', {
        query: 'animation',
        year: '2025',
        searchIn: 'both',
      });

      expect(mockLoadYearIndex).toHaveBeenCalledWith('2025');
    });
  });

  describe('get_wwdc_video', () => {
    it('should get video details', async () => {
      const result = await callTool('get_wwdc_video', {
        videoId: '10001',
        year: '2025',
      });

      expect(result.content[0].text).toContain('Test Video');
      expect(mockLoadVideoData).toHaveBeenCalledWith('2025', '10001');
    });

    it('should include transcript when requested', async () => {
      const result = await callTool('get_wwdc_video', {
        videoId: '10001',
        year: '2025',
        includeTranscript: true,
      });

      expect(result.content[0].text).toContain('transcript');
    });
  });

  describe('get_wwdc_code_examples', () => {
    it('should get code examples', async () => {
      const result = await callTool('get_wwdc_code_examples', {});

      expect(result).toHaveProperty('content');
      expect(mockLoadGlobalMetadata).toHaveBeenCalled();
    });

    it('should filter by framework', async () => {
      const result = await callTool('get_wwdc_code_examples', { framework: 'SwiftUI' });

      expect(result).toHaveProperty('content');
    });
  });

  describe('browse_wwdc_topics', () => {
    it('should list all topics', async () => {
      const result = await callTool('browse_wwdc_topics', {});

      expect(result.content[0].text).toContain('WWDC Topics');
      expect(mockLoadGlobalMetadata).toHaveBeenCalled();
    });

    it('should show specific topic', async () => {
      await callTool('browse_wwdc_topics', { topicId: 'swiftui' });

      expect(mockLoadTopicIndex).toHaveBeenCalledWith('swiftui');
    });
  });

  describe('find_related_wwdc_videos', () => {
    it('should find related videos', async () => {
      const result = await callTool('find_related_wwdc_videos', {
        videoId: '10001',
        year: '2025',
      });

      expect(result).toHaveProperty('content');
      expect(mockLoadVideoData).toHaveBeenCalledWith('2025', '10001');
    });
  });

  describe('list_wwdc_years', () => {
    it('should list available years', async () => {
      const result = await callTool('list_wwdc_years', {});

      expect(result.content[0].text).toContain('2025');
      expect(result.content[0].text).toContain('2024');
      expect(mockLoadGlobalMetadata).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle data loading errors gracefully', async () => {
      mockLoadGlobalMetadata.mockRejectedValue(new Error('Network error'));

      const result = await callTool('list_wwdc_videos', {});

      expect(result.content[0].text).toContain('Error');
    });

    it('should handle invalid video ID', async () => {
      mockLoadVideoData.mockRejectedValue(new Error('Video not found'));

      const result = await callTool('get_wwdc_video', {
        videoId: '123',
        year: '2025',
      });

      expect(result.content[0].text).toContain('Error');
    });
  });
});
