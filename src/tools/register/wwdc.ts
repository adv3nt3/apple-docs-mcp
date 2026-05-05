/**
 * Tool registrations for WWDC video tools.
 *
 * Backed by the bundled WWDC corpus under `data/wwdc/` (loaded via
 * `src/utils/wwdc-data-source.ts`); each handler lives in its own file
 * under `src/tools/wwdc/` per project convention.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import {
  listWWDCVideosSchema,
  searchWWDCContentSchema,
  getWWDCVideoSchema,
  getWWDCCodeExamplesSchema,
  browseWWDCTopicsSchema,
  findRelatedWWDCVideosSchema,
  listWWDCYearsSchema,
} from '../../schemas/wwdc.schemas.js';

import { handleListWWDCVideos } from '../wwdc/list-videos.js';
import { handleSearchWWDCContent } from '../wwdc/search-content.js';
import { handleGetWWDCVideo } from '../wwdc/get-video.js';
import { handleGetWWDCCodeExamples } from '../wwdc/get-code-examples.js';
import { handleBrowseWWDCTopics } from '../wwdc/browse-topics.js';
import { handleFindRelatedWWDCVideos } from '../wwdc/find-related-videos.js';
import { handleListWWDCYears } from '../wwdc/list-years.js';

export function registerWWDCTools(server: McpServer): void {
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
}
