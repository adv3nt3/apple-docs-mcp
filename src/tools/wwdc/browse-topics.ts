/**
 * WWDC Video MCP Tool Handler — browse_wwdc_topics
 */

import { logger } from '../../utils/logger.js';
import {
  loadGlobalMetadata,
  loadTopicIndex,
} from '../../utils/wwdc-data-source.js';

/**
 * Browse WWDC topics
 */
export async function handleBrowseWWDCTopics(
  topicId?: string,
  includeVideos: boolean = true,
  year?: string,
  limit: number = 20,
): Promise<string> {
  try {
    const metadata = await loadGlobalMetadata();

    if (!topicId) {
      // List all available topics
      let content = '# WWDC Topics\n\n';
      content += `Found ${metadata.topics.length} topics:\n\n`;

      metadata.topics.forEach(topic => {
        content += `## [${topic.name}](${topic.url})\n`;
        content += `**Topic ID:** ${topic.id}\n`;

        // Show video count for this topic
        const topicStats = metadata.statistics.byTopic[topic.id];
        if (topicStats) {
          content += `**Videos:** ${topicStats}\n`;
        }

        content += '\n';
      });

      return content;
    }

    // Browse specific topic
    const topic = metadata.topics.find(t => t.id === topicId);
    if (!topic) {
      return `Topic "${topicId}" not found. Available topics: ${metadata.topics.map(t => t.id).join(', ')}`;
    }

    let content = `# ${topic.name}\n\n`;
    content += `**Topic ID:** ${topic.id}\n`;
    content += `**URL:** [${topic.url}](${topic.url})\n\n`;

    if (includeVideos) {
      try {
        const topicIndex = await loadTopicIndex(topicId);

        // Filter by year if specified
        let videosToShow = topicIndex.videos;
        if (year && year !== 'all') {
          videosToShow = videosToShow.filter(v => v.year === year);
        }

        // Apply limit
        videosToShow = videosToShow.slice(0, limit);

        content += `## Videos (${videosToShow.length}${videosToShow.length === limit ? '+' : ''})\n\n`;

        if (videosToShow.length === 0) {
          content += 'No videos found for this topic.\n';
        } else {
          // Group by year
          const videosByYear = videosToShow.reduce((acc, video) => {
            if (!acc[video.year]) {
              acc[video.year] = [];
            }
            acc[video.year].push(video);
            return acc;
          }, {} as Record<string, typeof videosToShow>);

          Object.keys(videosByYear)
            .sort((a, b) => parseInt(b) - parseInt(a))
            .forEach(y => {
              content += `### WWDC${y}\n\n`;

              videosByYear[y].forEach(video => {
                content += `- [${video.title}](${video.url})`;

                const features: string[] = [];
                if (video.hasTranscript) {
                  features.push('Transcript');
                }
                if (video.hasCode) {
                  features.push('Code');
                }

                if (features.length > 0) {
                  content += ` | ${features.join(' | ')}`;
                }

                content += '\n';
              });

              content += '\n';
            });
        }

      } catch (error) {
        content += `Error loading videos for topic: ${error instanceof Error ? error.message : String(error)}\n`;
      }
    }

    return content;

  } catch (error) {
    logger.error('Failed to browse WWDC topics:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Error: Failed to browse WWDC topics: ${errorMessage}`;
  }
}
