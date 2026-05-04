/**
 * WWDC Video MCP Tool Handler — list_wwdc_videos
 */

import type { WWDCVideo } from '../../types/wwdc.js';
import { logger } from '../../utils/logger.js';
import {
  loadGlobalMetadata,
  loadTopicIndex,
  loadYearIndex,
} from '../../utils/wwdc-data-source.js';

import { loadVideosData } from './_shared.js';

/**
 * List WWDC videos
 */
export async function handleListWWDCVideos(
  year?: string,
  topic?: string,
  hasCode?: boolean,
  limit: number = 50,
): Promise<string> {
  try {
    // Load metadata
    const metadata = await loadGlobalMetadata();

    let allVideos: Array<WWDCVideo & { year: string }> = [];

    if (topic?.includes('-')) {
      // If topic looks like a topic ID, try to use topic index
      try {
        const topicIndex = await loadTopicIndex(topic);

        // Filter by year
        const videosToLoad = year && year !== 'all'
          ? topicIndex.videos.filter(v => v.year === year)
          : topicIndex.videos;

        // Load video data
        const videoFiles = videosToLoad.map((v: any) => v.dataFile);
        const videos = await loadVideosData(videoFiles);

        allVideos = videos.map((v: WWDCVideo) => ({ ...v, year: v.year }));
      } catch (error) {
        logger.warn(`Failed to load topic index for ${topic}, will search by keyword instead`);
        // Fall through to load by year and filter by keyword
      }
    }

    if (allVideos.length === 0 && year && year !== 'all') {
      // If year is specified, use year index
      const yearIndex = await loadYearIndex(year);

      // 加载视频数据
      const videoFiles = yearIndex.videos.map((v: any) => v.dataFile);
      const videos = await loadVideosData(videoFiles);

      allVideos = videos.map((v: WWDCVideo) => ({ ...v, year: v.year }));
    } else if (allVideos.length === 0) {
      // Load all videos - through year indices
      const yearsToLoad = metadata.years;

      for (const y of yearsToLoad) {
        try {
          const yearIndex = await loadYearIndex(y);
          const videoFiles = yearIndex.videos.map((v: any) => v.dataFile);
          const videos = await loadVideosData(videoFiles);

          const videosWithYear = videos.map((v: WWDCVideo) => ({ ...v, year: y }));
          allVideos.push(...videosWithYear);
        } catch (error) {
          logger.warn(`Failed to load year ${y}:`, error);
        }
      }
    }

    // Apply filters
    let filteredVideos = allVideos;

    // Topic filter (if not already filtered through topic index)
    if (topic && allVideos.length > 0) {
      // If we loaded videos but didn't use topic index, filter by keyword
      const topicLower = topic.toLowerCase();
      const wasFilteredByTopicIndex = topic.includes('-') && allVideos.length > 0;

      if (!wasFilteredByTopicIndex) {
        filteredVideos = filteredVideos.filter(v =>
          v.topics.some(t => t.toLowerCase().includes(topicLower)) ||
          v.title.toLowerCase().includes(topicLower),
        );
      }
    }

    // Code filter
    if (hasCode !== undefined) {
      filteredVideos = filteredVideos.filter(v => v.hasCode === hasCode);
    }

    // Apply limit
    const limitedVideos = filteredVideos.slice(0, limit);

    // Format output
    return formatVideoList(limitedVideos, year, topic, hasCode);

  } catch (error) {
    logger.error('Failed to list WWDC videos:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Error: Failed to list WWDC videos: ${errorMessage}`;
  }
}

/**
 * Format video list
 */
function formatVideoList(
  videos: Array<WWDCVideo & { year: string }>,
  year?: string,
  topic?: string,
  hasCode?: boolean,
): string {
  if (videos.length === 0) {
    return 'No WWDC videos found matching the criteria.';
  }

  let content = '# WWDC Video List\n\n';

  // Filter conditions
  const filters: string[] = [];
  if (year && year !== 'all') {
    filters.push(`Year: ${year}`);
  }
  if (topic) {
    filters.push(`Topic: ${topic}`);
  }
  if (hasCode !== undefined) {
    filters.push(`Has Code: ${hasCode ? 'Yes' : 'No'}`);
  }

  if (filters.length > 0) {
    content += `**Filter Conditions:** ${filters.join(', ')}\n\n`;
  }

  content += `**Found ${videos.length} videos**\n\n`;

  // Group by year
  const videosByYear = videos.reduce((acc, video) => {
    if (!acc[video.year]) {
      acc[video.year] = [];
    }
    acc[video.year].push(video);
    return acc;
  }, {} as Record<string, typeof videos>);

  // Format each year
  Object.keys(videosByYear)
    .sort((a, b) => parseInt(b) - parseInt(a))
    .forEach(y => {
      content += `## WWDC${y}\n\n`;

      videosByYear[y].forEach(video => {
        content += `### [${video.title}](${video.url})\n`;

        const metadata: string[] = [];
        if (video.duration) {
          metadata.push(`Duration: ${video.duration}`);
        }
        if (video.speakers && video.speakers.length > 0) {
          metadata.push(`Speakers: ${video.speakers.join(', ')}`);
        }
        if (video.hasTranscript) {
          metadata.push('Transcript');
        }
        if (video.hasCode) {
          metadata.push('Code Examples');
        }

        if (metadata.length > 0) {
          content += `*${metadata.join(' | ')}*\n`;
        }

        if (video.topics.length > 0) {
          content += `**Topics:** ${video.topics.join(', ')}\n`;
        }

        content += '\n';
      });
    });

  return content;
}
