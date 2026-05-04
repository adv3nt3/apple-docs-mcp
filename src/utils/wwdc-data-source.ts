/**
 * WWDC Data Source - Loads data from bundled JSON files
 *
 * This module provides functions to load WWDC video data from
 * JSON files that are bundled with the npm package.
 */

import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from './logger.js';
import { wwdcDataCache } from './cache.js';
import { WWDC_CONFIG } from './constants.js';
import { getWWDCDataDirectory } from './wwdc-data-source-path.js';
import type { WWDCVideo, GlobalMetadata, TopicIndex, YearIndex } from '../types/wwdc.js';

// Get the data directory from the separate module
const WWDC_DATA_DIR = getWWDCDataDirectory();

/**
 * Expected SHA-256 of the bundled `data/wwdc/index.json` file.
 *
 * This acts as a soft supply-chain integrity check: if a published npm
 * tarball or local install has tampered/swapped WWDC metadata, the
 * mismatch is logged via `logger.warn` so operators can investigate.
 *
 * NOTE: regenerate this constant after every WWDC data refresh, e.g.
 *   shasum -a 256 data/wwdc/index.json
 * or:
 *   node -e "const c=require('crypto');const fs=require('fs');\
 *console.log(c.createHash('sha256').update(\
 *fs.readFileSync('data/wwdc/index.json')).digest('hex'))"
 */
const EXPECTED_INDEX_SHA256 =
  '36f98581d9b0462d539d6761b841f6c3728a8382e56a1a3a07dd0164e4aa061c';

// Run the integrity check at most once per process.
let integrityCheckPromise: Promise<void> | null = null;

/**
 * Soft SHA-256 integrity check for `index.json`. Logs a warning on
 * mismatch but never throws — offline users who patch their bundled
 * data should not have their installs bricked.
 */
async function verifyIndexIntegrity(): Promise<void> {
  if (integrityCheckPromise) {
    return integrityCheckPromise;
  }

  integrityCheckPromise = (async () => {
    try {
      const indexPath = path.join(WWDC_DATA_DIR, 'index.json');
      const buf = await fs.readFile(indexPath);
      const actual = createHash('sha256').update(buf).digest('hex');
      if (actual !== EXPECTED_INDEX_SHA256) {
        logger.warn(
          `WWDC index.json SHA-256 mismatch (expected ${EXPECTED_INDEX_SHA256}, got ${actual}). ` +
            'Bundled data may have been modified locally or tampered with in transit. ' +
            'If you intentionally edited the data, regenerate EXPECTED_INDEX_SHA256 in src/utils/wwdc-data-source.ts.',
        );
      }
    } catch (error) {
      // Non-fatal: integrity check should never block data loading.
      logger.warn(
        `WWDC index.json integrity check skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  })();

  return integrityCheckPromise;
}

/**
 * Read file from bundled data directory
 */
async function readBundledFile(filePath: string): Promise<string> {
  const fullPath = path.join(WWDC_DATA_DIR, filePath);

  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    logger.debug(`Loaded bundled data: ${filePath}`);
    return content;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to read bundled data: ${filePath}`, error);
    throw new Error(`Failed to load WWDC data from ${filePath}: ${errorMessage}`);
  }
}

/**
 * Fetch data with caching support
 */
async function fetchData(filePath: string): Promise<string> {
  const cacheKey = `wwdc:${filePath}`;

  // Check cache first
  const cached = wwdcDataCache.get<string>(cacheKey);
  if (cached) {
    logger.debug(`Cache hit: ${filePath}`);
    return cached;
  }

  // Read from bundled data
  const data = await readBundledFile(filePath);

  // Cache the data
  wwdcDataCache.set(cacheKey, data, WWDC_CONFIG.CACHE_TTL);

  return data;
}

/**
 * Load global metadata (index.json)
 */
export async function loadGlobalMetadata(): Promise<GlobalMetadata> {
  try {
    // Fire-and-forget soft integrity check on the first call. Awaited
    // via void so a slow disk read never blocks metadata loading.
    void verifyIndexIntegrity();
    const data = await fetchData('index.json');
    return JSON.parse(data);
  } catch (error) {
    logger.error('Failed to load global metadata', error);
    throw new Error('Failed to load WWDC metadata. Please ensure the package is properly installed.');
  }
}

/**
 * Load topic index
 */
export async function loadTopicIndex(topicId: string): Promise<TopicIndex> {
  try {
    const data = await fetchData(`by-topic/${topicId}/index.json`);
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Failed to load topic index: ${topicId}`, error);
    throw new Error(`Topic not found: ${topicId}`);
  }
}

/**
 * Load year index
 */
export async function loadYearIndex(year: string): Promise<YearIndex> {
  try {
    const data = await fetchData(`by-year/${year}/index.json`);
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Failed to load year index: ${year}`, error);
    throw new Error(`Year not found: ${year}`);
  }
}

/**
 * Load individual video data
 */
export async function loadVideoData(year: string, videoId: string): Promise<WWDCVideo> {
  try {
    const data = await fetchData(`videos/${year}-${videoId}.json`);
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Failed to load video: ${year}-${videoId}`, error);
    throw new Error(`Video not found: ${year}-${videoId}`);
  }
}

/**
 * Load all videos list
 */
export async function loadAllVideos(): Promise<WWDCVideo[]> {
  try {
    const data = await fetchData('all-videos.json');
    return JSON.parse(data);
  } catch (error) {
    logger.error('Failed to load all videos', error);
    throw new Error('Failed to load WWDC video list');
  }
}

/**
 * Clear the WWDC data cache
 */
export function clearDataCache(): void {
  wwdcDataCache.clear();
  logger.info('WWDC data cache cleared');
}

/**
 * Check if WWDC data is available
 */
export async function isDataAvailable(): Promise<boolean> {
  try {
    await fs.access(WWDC_DATA_DIR);
    await fs.access(path.join(WWDC_DATA_DIR, 'index.json'));
    return true;
  } catch {
    return false;
  }
}