/**
 * WWDC Video MCP Tool Handler — find_related_wwdc_videos
 */

import type { WWDCVideo } from '../../types/wwdc.js';
import { logger } from '../../utils/logger.js';
import {
  loadGlobalMetadata,
  loadTopicIndex,
  loadYearIndex,
  loadVideoData,
} from '../../utils/wwdc-data-source.js';

import { loadVideosData } from './_shared.js';

/**
 * Find related WWDC videos
 */
export async function handleFindRelatedWWDCVideos(
  videoId: string,
  year: string,
  includeExplicitRelated: boolean = true,
  includeTopicRelated: boolean = true,
  includeYearRelated: boolean = false,
  limit: number = 15,
): Promise<string> {
  try {
    // Load the source video
    const sourceVideo = await loadVideoData(year, videoId);

    let content = `# Related Videos for "${sourceVideo.title}"\n\n`;
    content += `**Source:** [${sourceVideo.title}](${sourceVideo.url}) (WWDC${year})\n\n`;

    const relatedVideos: Array<{
      video: WWDCVideo & { year: string };
      relationship: string;
      score: number;
    }> = [];

    // 1. Explicit related videos from video metadata
    if (includeExplicitRelated && sourceVideo.relatedVideos) {
      for (const related of sourceVideo.relatedVideos) {
        try {
          const relatedVideo = await loadVideoData(related.year, related.id);

          relatedVideos.push({
            video: { ...relatedVideo, year: related.year },
            relationship: 'Explicitly related',
            score: 10,
          });
        } catch (error) {
          logger.warn(`Failed to load related video ${related.year}-${related.id}:`, error);
        }
      }
    }

    // 2. Topic-related videos
    if (includeTopicRelated && sourceVideo.topics && sourceVideo.topics.length > 0) {
      for (const topic of sourceVideo.topics) {
        try {
          // Try to find topic by name mapping
          const metadata = await loadGlobalMetadata();
          const topicEntry = metadata.topics.find(t =>
            t.name.toLowerCase() === topic.toLowerCase() ||
            t.id.toLowerCase().includes(topic.toLowerCase().replace(/\s+/g, '-')),
          );

          if (topicEntry) {
            const topicIndex = await loadTopicIndex(topicEntry.id);

            // Get videos from same topic (excluding source video)
            const topicVideos = topicIndex.videos.filter(v => v.id !== videoId);

            // Load video data for scoring
            const videoFiles = topicVideos.slice(0, 10).map((v: any) => v.dataFile); // Limit to avoid too many requests
            const videos = await loadVideosData(videoFiles);

            for (const video of videos) {
              // Skip if already added
              if (relatedVideos.find(r => r.video.id === video.id && r.video.year === video.year)) {
                continue;
              }

              // Calculate similarity score based on shared topics
              const sharedTopics = (sourceVideo.topics || []).filter(t =>
                video.topics?.some(vt => vt.toLowerCase() === t.toLowerCase()) || false,
              );
              const score = sharedTopics.length * 2;

              relatedVideos.push({
                video: { ...video, year: video.year },
                relationship: `Same topic: ${topicEntry.name}`,
                score,
              });
            }
          }
        } catch (error) {
          logger.warn(`Failed to find topic-related videos for topic ${topic}:`, error);
        }
      }
    }

    // 3. Year-related videos (same year, similar topics)
    if (includeYearRelated) {
      try {
        const yearIndex = await loadYearIndex(year);

        // Get videos from same year with overlapping topics
        const yearVideos = yearIndex.videos.filter(v =>
          v.id !== videoId &&
          v.topics.some(t => sourceVideo.topics?.some(st => st.toLowerCase() === t.toLowerCase()) || false),
        );

        // Load a sample of videos
        const videoFiles = yearVideos.slice(0, 10).map((v: any) => v.dataFile);
        const videos = await loadVideosData(videoFiles);

        for (const video of videos) {
          // Skip if already added
          if (relatedVideos.find(r => r.video.id === video.id && r.video.year === video.year)) {
            continue;
          }

          const sharedTopics = (sourceVideo.topics || []).filter(t =>
            video.topics?.some(vt => vt.toLowerCase() === t.toLowerCase()) || false,
          );
          const score = sharedTopics.length;

          relatedVideos.push({
            video: { ...video, year: video.year },
            relationship: `Same year, shared topics: ${sharedTopics.join(', ')}`,
            score,
          });
        }
      } catch (error) {
        logger.warn('Failed to find year-related videos:', error);
      }
    }

    // Sort by score (descending) and apply limit
    relatedVideos.sort((a, b) => b.score - a.score);
    const limitedResults = relatedVideos.slice(0, limit);

    if (limitedResults.length === 0) {
      content += 'No related videos found.\n';
    } else {
      content += `## Related Videos (${limitedResults.length})\n\n`;

      limitedResults.forEach(result => {
        content += `### [${result.video.title}](${result.video.url})\n`;
        content += `*WWDC${result.video.year} | ${result.relationship}*\n\n`;

        const features: string[] = [];
        if (result.video.duration) {
          features.push(`Duration: ${result.video.duration}`);
        }
        if (result.video.hasTranscript) {
          features.push('Transcript');
        }
        if (result.video.hasCode) {
          features.push('Code');
        }

        if (features.length > 0) {
          content += `${features.join(' | ')}\n`;
        }

        if (result.video.topics.length > 0) {
          content += `**Topics:** ${result.video.topics.join(', ')}\n`;
        }

        content += '\n';
      });
    }

    return content;

  } catch (error) {
    logger.error('Failed to find related WWDC videos:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Error: Failed to find related WWDC videos: ${errorMessage}`;
  }
}
