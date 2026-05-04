/**
 * WWDC Video MCP Tool Handler — list_wwdc_years
 */

import { logger } from '../../utils/logger.js';
import { loadGlobalMetadata } from '../../utils/wwdc-data-source.js';

/**
 * List all available WWDC years
 */
export async function handleListWWDCYears(): Promise<string> {
  try {
    // Load metadata to get available years
    const metadata = await loadGlobalMetadata();

    let content = '# Available WWDC Years\n\n';

    // Check if years exist in metadata
    if (!metadata.years || metadata.years.length === 0) {
      return 'No WWDC years available.';
    }

    // Sort years in descending order (newest first)
    const sortedYears = [...metadata.years].sort((a, b) => b.localeCompare(a));

    content += `**Total Years:** ${sortedYears.length}\n\n`;
    content += '## Years with Video Counts\n\n';

    // Get video count for each year from statistics
    for (const year of sortedYears) {
      const videoCount = metadata.statistics?.byYear?.[year] || 0;
      content += `- **${year}**: ${videoCount} videos\n`;
    }

    // Add total video count
    content += `\n**Total Videos:** ${metadata.totalVideos || 0}\n`;

    // Add statistics summary if available
    if (metadata.statistics) {
      content += '\n## Statistics\n\n';
      content += `- **Videos with Code:** ${metadata.statistics.videosWithCode || 0}\n`;
      content += `- **Videos with Transcript:** ${metadata.statistics.videosWithTranscript || 0}\n`;
      content += `- **Videos with Resources:** ${metadata.statistics.videosWithResources || 0}\n`;
    }

    return content;

  } catch (error) {
    logger.error('Failed to list WWDC years:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Error: Failed to list WWDC years: ${errorMessage}`;
  }
}
