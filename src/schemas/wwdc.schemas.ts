/**
 * Zod schemas for WWDC tools
 */

import { z } from 'zod';

// Shared input validators for fields that flow into bundled-data file paths.
// These prevent path-traversal payloads (e.g. '../../etc/passwd') from
// reaching readBundledFile in src/utils/wwdc-data-source.ts.
const yearSchema = z
  .string()
  .regex(/^(\d{4}|all)$/, 'year must be a 4-digit year or "all"');
const videoIdSchema = z.string().regex(/^\d+$/, 'videoId must be digits only');
const topicIdSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, 'topicId must contain only lowercase letters, digits, or hyphens');

/**
 * Schema for list_wwdc_videos
 */
export const listWWDCVideosSchema = z.object({
  year: yearSchema.optional().describe('Filter by WWDC year'),
  topic: z.string().optional().describe('Filter by topic keyword'),
  hasCode: z.boolean().optional().describe('Filter by code availability'),
  limit: z.number().min(1).max(200).default(50).describe('Maximum number of videos'),
});

/**
 * Schema for search_wwdc_content
 */
export const searchWWDCContentSchema = z.object({
  query: z.string().min(1).describe('Search query'),
  searchIn: z.enum(['transcript', 'code', 'both']).default('both').describe('Where to search'),
  year: yearSchema.optional().describe('Filter by WWDC year'),
  language: z.string().optional().describe('Filter code by language'),
  limit: z.number().min(1).max(100).default(20).describe('Maximum number of results'),
});

/**
 * Schema for get_wwdc_video
 */
export const getWWDCVideoSchema = z.object({
  year: yearSchema.describe('WWDC year'),
  videoId: videoIdSchema.describe('Video ID'),
  includeTranscript: z.boolean().default(true).describe('Include transcript'),
  includeCode: z.boolean().default(true).describe('Include code examples'),
});

/**
 * Schema for get_wwdc_code_examples
 */
export const getWWDCCodeExamplesSchema = z.object({
  framework: z.string().optional().describe('Filter by framework'),
  topic: z.string().optional().describe('Filter by topic'),
  year: yearSchema.optional().describe('Filter by WWDC year'),
  language: z.string().optional().describe('Filter by programming language'),
  limit: z.number().min(1).max(100).default(30).describe('Maximum number of examples'),
});

/**
 * Schema for browse_wwdc_topics
 */
export const browseWWDCTopicsSchema = z.object({
  topicId: topicIdSchema.optional().describe('Specific topic ID to browse'),
  includeVideos: z.boolean().default(true).describe('Include video list'),
  year: yearSchema.optional().describe('Filter videos by year'),
  limit: z.number().min(1).max(100).default(20).describe('Maximum number of videos per topic'),
});

/**
 * Schema for find_related_wwdc_videos
 */
export const findRelatedWWDCVideosSchema = z.object({
  videoId: videoIdSchema.describe('Video ID to find related videos for'),
  year: yearSchema.describe('Year of the source video'),
  includeExplicitRelated: z.boolean().default(true).describe('Include explicitly related videos'),
  includeTopicRelated: z.boolean().default(true).describe('Include videos from same topics'),
  includeYearRelated: z.boolean().default(false).describe('Include videos from same year'),
  limit: z.number().min(1).max(50).default(15).describe('Maximum number of related videos'),
});

/**
 * Schema for list_wwdc_years
 */
export const listWWDCYearsSchema = z.object({});
