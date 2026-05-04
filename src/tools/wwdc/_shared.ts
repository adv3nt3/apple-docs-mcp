/**
 * Shared helpers for WWDC tool handlers.
 *
 * `loadVideosData` is invoked by every handler that fans out across multiple
 * videos (list, search, code-examples, find-related); kept in one place so the
 * "extract year/id from filename, swallow per-file errors" loop has a single
 * implementation.
 */

import type { WWDCVideo } from '../../types/wwdc.js';
import { logger } from '../../utils/logger.js';
import { loadVideoData } from '../../utils/wwdc-data-source.js';

/**
 * Helper function to load multiple video data files
 */
export async function loadVideosData(videoFiles: string[]): Promise<WWDCVideo[]> {
  const videos: WWDCVideo[] = [];
  for (const file of videoFiles) {
    // Extract year and video ID from filename (e.g., "videos/2024-10015.json")
    const match = file.match(/(\d{4})-(\d+)\.json$/);
    if (match) {
      const [, year, videoId] = match;
      try {
        const video = await loadVideoData(year, videoId);
        videos.push(video);
      } catch (error) {
        // Skip videos that can't be loaded
        logger.debug(`Failed to load video ${file}:`, error);
      }
    }
  }
  return videos;
}
