/**
 * WWDC Video MCP Tool Handler — get_wwdc_code_examples
 */

import { logger } from '../../utils/logger.js';
import {
  loadGlobalMetadata,
  loadTopicIndex,
  loadYearIndex,
} from '../../utils/wwdc-data-source.js';

import { loadVideosData } from './_shared.js';

/**
 * Get WWDC code examples
 */
export async function handleGetWWDCCodeExamples(
  framework?: string,
  topic?: string,
  year?: string,
  language?: string,
  limit: number = 30,
): Promise<string> {
  try {
    const metadata = await loadGlobalMetadata();
    const codeExamples: Array<{
      code: string;
      language: string;
      title?: string;
      timestamp?: string;
      videoTitle: string;
      videoUrl: string;
      year: string;
    }> = [];

    // Determine years to search
    const yearsToSearch = year ? [year] : metadata.years;

    for (const y of yearsToSearch) {
      try {
        const yearIndex = await loadYearIndex(y);

        // Pre-filter: only load videos with code
        const videosWithCode = yearIndex.videos.filter(v => v.hasCode);

        // Topic filter
        let filteredVideos = videosWithCode;
        if (topic) {
          if (topic.includes('-')) {
            // If it's a standard topic ID, use topic index directly
            try {
              const topicIndex = await loadTopicIndex(topic);
              const topicVideoIds = new Set(topicIndex.videos.map((v: any) => v.id));
              filteredVideos = videosWithCode.filter(v => topicVideoIds.has(v.id));
            } catch (error) {
              // If topic index doesn't exist, fallback to string matching
              const topicLower = topic.toLowerCase();
              filteredVideos = videosWithCode.filter(v =>
                v.topics.some(t => t.toLowerCase().includes(topicLower)) ||
                v.title.toLowerCase().includes(topicLower),
              );
            }
          } else {
            // Search by name
            const topicLower = topic.toLowerCase();
            filteredVideos = videosWithCode.filter(v =>
              v.topics.some(t => t.toLowerCase().includes(topicLower)) ||
              v.title.toLowerCase().includes(topicLower),
            );
          }
        }

        if (filteredVideos.length === 0) {
          continue;
        }

        // 加载视频数据
        const videoFiles = filteredVideos.map((v: any) => v.dataFile);
        const videos = await loadVideosData(videoFiles);

        // Extract code examples
        for (const video of videos) {
          if (!video.codeExamples || video.codeExamples.length === 0) {
            continue;
          }

          for (const example of video.codeExamples) {
            // Language filter
            if (language && example.language.toLowerCase() !== language.toLowerCase()) {
              continue;
            }

            // Framework filter (search in code)
            if (framework && !example.code.toLowerCase().includes(framework.toLowerCase())) {
              continue;
            }

            codeExamples.push({
              code: example.code,
              language: example.language,
              title: example.title,
              timestamp: example.timestamp,
              videoTitle: video.title,
              videoUrl: video.url,
              year: y,
            });
          }
        }
      } catch (error) {
        logger.warn(`Failed to search code examples for year ${y}:`, error);
      }
    }

    // Limit result count
    const limitedExamples = codeExamples.slice(0, limit);

    return formatCodeExamples(limitedExamples, framework, topic, language);

  } catch (error) {
    logger.error('Failed to get WWDC code examples:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Error: Failed to get WWDC code examples: ${errorMessage}`;
  }
}

/**
 * Format code examples
 */
function formatCodeExamples(
  examples: Array<{
    code: string;
    language: string;
    title?: string;
    timestamp?: string;
    videoTitle: string;
    videoUrl: string;
    year: string;
  }>,
  framework?: string,
  topic?: string,
  language?: string,
): string {
  if (examples.length === 0) {
    return 'No code examples found matching the criteria.';
  }

  let content = '# WWDC Code Examples\n\n';

  // Filter conditions
  const filters: string[] = [];
  if (framework) {
    filters.push(`Framework: ${framework}`);
  }
  if (topic) {
    filters.push(`Topic: ${topic}`);
  }
  if (language) {
    filters.push(`Language: ${language}`);
  }

  if (filters.length > 0) {
    content += `**Filter Conditions:** ${filters.join(', ')}\n\n`;
  }

  content += `**Found ${examples.length} code examples**\n\n`;

  // Group by language
  const examplesByLanguage = examples.reduce((acc, ex) => {
    if (!acc[ex.language]) {
      acc[ex.language] = [];
    }
    acc[ex.language].push(ex);
    return acc;
  }, {} as Record<string, typeof examples>);

  Object.keys(examplesByLanguage).forEach(lang => {
    content += `## ${lang.charAt(0).toUpperCase() + lang.slice(1)}\n\n`;

    examplesByLanguage[lang].forEach(example => {
      content += `### ${example.title ?? 'Code Example'}\n`;
      content += `*From: [${example.videoTitle}](${example.videoUrl}) (WWDC${example.year})*`;

      if (example.timestamp) {
        content += ` *@ ${example.timestamp}*`;
      }
      content += '\n\n';

      content += `\`\`\`${example.language}\n`;
      content += example.code;
      content += '\n\`\`\`\n\n';
    });
  });

  return content;
}
