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

  // Defense-in-depth: ensure the resolved path stays within WWDC_DATA_DIR.
  // path.join collapses '..' segments, so a caller-supplied filePath like
  // '../../etc/passwd' would otherwise escape the data root.
  const resolved = path.resolve(fullPath);
  const root = path.resolve(WWDC_DATA_DIR);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Invalid WWDC data path: ${filePath}`);
  }

  try {
    const content = await fs.readFile(resolved, 'utf-8');
    logger.debug(`Loaded bundled data: ${filePath}`);
    return content;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to read bundled data: ${filePath}`, error);
    throw new Error(`Failed to load WWDC data from ${filePath}: ${errorMessage}`, { cause: error });
  }
}

/**
 * Fetch and parse a JSON file with caching support.
 *
 * The cache is keyed by the resolved absolute path so that equivalent
 * input paths share the same entry, and only parsed-and-validated JSON
 * is ever stored — never raw bytes. This prevents a failed/malicious
 * read from poisoning subsequent callers.
 */
async function fetchJson<T>(filePath: string): Promise<T> {
  const fullPath = path.resolve(path.join(WWDC_DATA_DIR, filePath));
  const cacheKey = `wwdc:${fullPath}`;

  // Check cache first — only parsed values are stored here.
  const cached = wwdcDataCache.get<unknown>(cacheKey);
  if (cached !== undefined) {
    logger.debug(`Cache hit: ${filePath}`);
    return cached as T;
  }

  // Read from bundled data and parse before caching.
  const data = await readBundledFile(filePath);
  const parsed = JSON.parse(data) as T;

  wwdcDataCache.set(cacheKey, parsed, WWDC_CONFIG.CACHE_TTL);

  return parsed;
}

/**
 * Load global metadata (index.json)
 */
export async function loadGlobalMetadata(): Promise<GlobalMetadata> {
  try {
    // Fire-and-forget soft integrity check on the first call. Awaited
    // via void so a slow disk read never blocks metadata loading.
    void verifyIndexIntegrity();
    return await fetchJson<GlobalMetadata>('index.json');
  } catch (error) {
    logger.error('Failed to load global metadata', error);
    throw new Error(
      'Failed to load WWDC metadata. Please ensure the package is properly installed.',
      { cause: error },
    );
  }
}

/**
 * Load topic index
 */
export async function loadTopicIndex(topicId: string): Promise<TopicIndex> {
  try {
    return await fetchJson<TopicIndex>(`by-topic/${topicId}/index.json`);
  } catch (error) {
    logger.error(`Failed to load topic index: ${topicId}`, error);
    throw new Error(`Topic not found: ${topicId}`, { cause: error });
  }
}

/**
 * Load year index
 */
export async function loadYearIndex(year: string): Promise<YearIndex> {
  try {
    return await fetchJson<YearIndex>(`by-year/${year}/index.json`);
  } catch (error) {
    logger.error(`Failed to load year index: ${year}`, error);
    throw new Error(`Year not found: ${year}`, { cause: error });
  }
}

/**
 * Load individual video data
 */
export async function loadVideoData(year: string, videoId: string): Promise<WWDCVideo> {
  try {
    return await fetchJson<WWDCVideo>(`videos/${year}-${videoId}.json`);
  } catch (error) {
    logger.error(`Failed to load video: ${year}-${videoId}`, error);
    throw new Error(`Video not found: ${year}-${videoId}`, { cause: error });
  }
}

/**
 * Load all videos list
 */
export async function loadAllVideos(): Promise<WWDCVideo[]> {
  try {
    return await fetchJson<WWDCVideo[]>('all-videos.json');
  } catch (error) {
    logger.error('Failed to load all videos', error);
    throw new Error('Failed to load WWDC video list', { cause: error });
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