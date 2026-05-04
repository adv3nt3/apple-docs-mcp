/**
 * WWDC Video MCP Tool Handler — search_wwdc_content
 */

import type { WWDCVideo } from '../../types/wwdc.js';
import { logger } from '../../utils/logger.js';
import {
  loadGlobalMetadata,
  loadYearIndex,
} from '../../utils/wwdc-data-source.js';

import { loadVideosData } from './_shared.js';

/**
 * Search WWDC content
 */
export async function handleSearchWWDCContent(
  query: string,
  searchIn: 'transcript' | 'code' | 'both' = 'both',
  year?: string,
  language?: string,
  limit: number = 20,
): Promise<string> {
  try {
    const metadata = await loadGlobalMetadata();
    const queryLower = query.toLowerCase();
    const results: Array<{
      video: WWDCVideo & { year: string };
      matches: Array<{ type: 'transcript' | 'code'; context: string; timestamp?: string }>;
    }> = [];

    // Determine years to search
    const yearsToSearch = year ? [year] : metadata.years;

    // Search each year
    for (const y of yearsToSearch) {
      try {
        const yearIndex = await loadYearIndex(y);

        // Pre-filter: only load videos that might contain search content
        const potentialVideos = yearIndex.videos.filter(v => {
          // Basic title and topic matching
          const titleMatch = v.title?.toLowerCase().includes(queryLower) || false;
          const topicMatch = v.topics?.some(t => t.toLowerCase().includes(queryLower)) || false;
          return titleMatch || topicMatch ||
                 (searchIn === 'code' || searchIn === 'both') && v.hasCode ||
                 (searchIn === 'transcript' || searchIn === 'both') && v.hasTranscript;
        });

        if (potentialVideos.length === 0) {
          continue;
        }

        // 加载视频数据
        const videoFiles = potentialVideos.map((v: any) => v.dataFile);
        const videos = await loadVideosData(videoFiles);

        // Search each video
        for (const video of videos) {
          const matches: Array<{ type: 'transcript' | 'code'; context: string; timestamp?: string }> = [];

          // Search transcript
          if ((searchIn === 'transcript' || searchIn === 'both') && video.transcript) {
            const transcriptMatches = searchInTranscript(video.transcript.fullText, queryLower);
            matches.push(...transcriptMatches.map(m => ({
              type: 'transcript' as const,
              context: m.context,
              timestamp: m.timestamp,
            })));
          }

          // Search code
          if ((searchIn === 'code' || searchIn === 'both') && video.codeExamples) {
            const codeMatches = searchInCode(video.codeExamples, queryLower, language);
            matches.push(...codeMatches.map(m => ({
              type: 'code' as const,
              context: m.context,
              timestamp: m.timestamp,
            })));
          }

          if (matches.length > 0) {
            results.push({
              video: { ...video, year: y },
              matches: matches.slice(0, 3), // Max 3 matches per video
            });
          }
        }
      } catch (error) {
        logger.warn(`Failed to search year ${y}:`, error);
      }
    }

    // Sort by match count
    results.sort((a, b) => b.matches.length - a.matches.length);

    // Apply limit
    const limitedResults = results.slice(0, limit);

    return formatSearchResults(limitedResults, query, searchIn);

  } catch (error) {
    logger.error('Failed to search WWDC content:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `Error: Failed to search WWDC content: ${errorMessage}`;
  }
}

/**
 * Search in transcript
 */
function searchInTranscript(
  fullText: string,
  query: string,
): Array<{ context: string; timestamp?: string }> {
  const matches: Array<{ context: string; timestamp?: string }> = [];
  const lines = fullText.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.toLowerCase().includes(query)) {
      // Get context (one line before and after)
      const context = [
        lines[i - 1] || '',
        line,
        lines[i + 1] || '',
      ].filter(l => l.trim()).join(' ... ');

      matches.push({ context });
    }
  }

  return matches;
}

/**
 * Search in code
 */
function searchInCode(
  codeExamples: Array<{ code: string; language: string; timestamp?: string; title?: string }>,
  query: string,
  language?: string,
): Array<{ context: string; timestamp?: string }> {
  const matches: Array<{ context: string; timestamp?: string }> = [];

  for (const example of codeExamples) {
    // Language filter
    if (language && example.language.toLowerCase() !== language.toLowerCase()) {
      continue;
    }

    if (example.code.toLowerCase().includes(query)) {
      // Extract code snippet containing the query
      const lines = example.code.split('\n');
      const matchingLines = lines.filter(line => line.toLowerCase().includes(query));

      matches.push({
        context: `[${example.language}] ${example.title || ''}: ${matchingLines[0]}`,
        timestamp: example.timestamp,
      });
    }
  }

  return matches;
}

/**
 * Format search results
 */
function formatSearchResults(
  results: Array<{
    video: WWDCVideo & { year: string };
    matches: Array<{ type: 'transcript' | 'code'; context: string; timestamp?: string }>;
  }>,
  query: string,
  searchIn: string,
): string {
  if (results.length === 0) {
    return `No ${searchIn === 'code' ? 'code' : searchIn === 'transcript' ? 'transcript' : 'content'} found containing "${query}".`;
  }

  let content = '# WWDC Content Search Results\n\n';
  content += `**Search Query:** "${query}"\n`;
  content += `**Search Scope:** ${searchIn === 'code' ? 'Code' : searchIn === 'transcript' ? 'Transcript' : 'All Content'}\n`;
  content += `**Found ${results.length} related videos**\n\n`;

  results.forEach(result => {
    content += `## [${result.video.title}](${result.video.url})\n`;
    content += `*WWDC${result.video.year} | ${result.matches.length} matches*\n\n`;

    result.matches.forEach(match => {
      content += `**${match.type === 'code' ? 'Code' : 'Transcript'}**`;
      if (match.timestamp) {
        content += ` (${match.timestamp})`;
      }
      content += '\n';
      content += `> ${match.context}\n\n`;
    });
  });

  return content;
}
