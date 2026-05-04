/**
 * Tests for WWDC schema input validators (security fix H1) and the
 * path-containment guard inside readBundledFile.
 *
 * The schema regexes are the FIRST line of defense — they prevent path
 * traversal payloads from ever reaching readBundledFile. The containment
 * guard inside readBundledFile is the SECOND line of defense — it catches
 * anything that bypasses the schemas (e.g. a future caller that forgets to
 * validate input or a refactor that exposes a new entry point).
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  listWWDCVideosSchema,
  searchWWDCContentSchema,
  getWWDCVideoSchema,
  getWWDCCodeExamplesSchema,
  browseWWDCTopicsSchema,
  findRelatedWWDCVideosSchema,
} from '../../src/schemas/wwdc.schemas.js';

// Importantly, do NOT mock '../../src/utils/wwdc-data-source.js' — this file
// exercises the real readBundledFile path-containment check via the public
// loaders. The global mock of '../../src/utils/wwdc-data-source-path.js' from
// tests/setup.ts forces WWDC_DATA_DIR = '/mock/data/wwdc'.
import {
  loadTopicIndex,
  loadYearIndex,
  loadVideoData,
  loadAllVideos,
} from '../../src/utils/wwdc-data-source.js';

describe('WWDC schema input validators (H1 fix)', () => {
  describe('yearSchema (via getWWDCVideoSchema.shape.year)', () => {
    const yearField = getWWDCVideoSchema.shape.year;

    it.each([['2024'], ['2025'], ['2020'], ['1999'], ['all']])(
      'accepts valid year %s',
      (value) => {
        expect(() => yearField.parse(value)).not.toThrow();
      },
    );

    it.each([
      ['../etc'],
      ['2024;rm'],
      [''],
      ['xx'],
      ['99999'],
      ['2024/'],
      ['2024 '],
      ['../2024'],
      ['ALL'],
      ['2024.json'],
    ])('rejects malicious year %j', (value) => {
      expect(() => yearField.parse(value)).toThrow();
    });
  });

  describe('videoIdSchema (via getWWDCVideoSchema.shape.videoId)', () => {
    const videoIdField = getWWDCVideoSchema.shape.videoId;

    it.each([['123'], ['10001'], ['1'], ['9999999']])(
      'accepts valid videoId %s',
      (value) => {
        expect(() => videoIdField.parse(value)).not.toThrow();
      },
    );

    it.each([
      ['../etc/passwd'],
      ['1;rm'],
      ['abc'],
      [''],
      ['1.json'],
      ['1 2'],
      ['10001/'],
      ['1\n2'],
    ])('rejects malicious videoId %j', (value) => {
      expect(() => videoIdField.parse(value)).toThrow();
    });
  });

  describe('topicIdSchema (via browseWWDCTopicsSchema.shape.topicId)', () => {
    // topicId is optional, so we have to unwrap.
    const topicIdField = browseWWDCTopicsSchema.shape.topicId;

    it.each([
      ['swiftui-ui-frameworks'],
      ['audio-video'],
      ['essentials'],
      ['ml'],
      ['123-abc'],
    ])('accepts valid topicId %s', (value) => {
      expect(() => topicIdField.parse(value)).not.toThrow();
    });

    it.each([
      ['../foo'],
      ['Up_Case'],
      [''],
      ['../../etc'],
      ['has space'],
      ['has.dot'],
      ['UPPER'],
      ['has/slash'],
      ['has;semicolon'],
    ])('rejects malicious topicId %j', (value) => {
      expect(() => topicIdField.parse(value)).toThrow();
    });
  });

  describe('schema reuse across all WWDC tools', () => {
    it('listWWDCVideosSchema rejects ../etc as year', () => {
      expect(() => listWWDCVideosSchema.parse({ year: '../etc' })).toThrow();
    });

    it('searchWWDCContentSchema rejects ../etc as year', () => {
      expect(() =>
        searchWWDCContentSchema.parse({ query: 'foo', year: '../etc' }),
      ).toThrow();
    });

    it('getWWDCCodeExamplesSchema rejects ../etc as year', () => {
      expect(() => getWWDCCodeExamplesSchema.parse({ year: '../etc' })).toThrow();
    });

    it('findRelatedWWDCVideosSchema rejects malicious videoId and year', () => {
      expect(() =>
        findRelatedWWDCVideosSchema.parse({
          videoId: '1;rm',
          year: '2024',
        }),
      ).toThrow();
      expect(() =>
        findRelatedWWDCVideosSchema.parse({
          videoId: '123',
          year: '../etc',
        }),
      ).toThrow();
    });

    it('listWWDCVideosSchema accepts a fully valid input', () => {
      expect(() =>
        listWWDCVideosSchema.parse({ year: '2024', limit: 10 }),
      ).not.toThrow();
    });
  });
});

describe('readBundledFile path-containment guard (H1 fix)', () => {
  // Spy on console.error to capture the inner logger.error call.
  // tests/setup.ts already replaces console.error with a fresh jest.fn()
  // before each test, so we can read the mock calls directly.
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Helper: scan the captured console.error mock calls for a string that
   * matches the path-containment error message. The logger writes the
   * thrown Error as a separate console.error argument, so we have to scan
   * each call and each argument.
   */
  function findPathInvalidError(): string | null {
    const calls = (console.error as jest.Mock).mock.calls;
    for (const call of calls) {
      for (const arg of call) {
        const text =
          arg instanceof Error
            ? arg.message
            : typeof arg === 'string'
              ? arg
              : '';
        if (text.includes('Invalid WWDC data path:')) {
          return text;
        }
      }
    }
    return null;
  }

  it('rejects a topicId that escapes the WWDC data directory', async () => {
    // loadTopicIndex builds: by-topic/<topicId>/index.json
    // joining with /mock/data/wwdc and resolving '..' segments must NOT
    // escape /mock/data/wwdc. The schema would normally block this; here
    // we deliberately bypass the schema to exercise the inner guard.
    await expect(loadTopicIndex('../../../../etc')).rejects.toThrow(
      /Topic not found/,
    );
    expect(findPathInvalidError()).toMatch(/Invalid WWDC data path:/);
  });

  it('rejects a year that escapes the WWDC data directory', async () => {
    await expect(loadYearIndex('../../../etc')).rejects.toThrow(
      /Year not found/,
    );
    expect(findPathInvalidError()).toMatch(/Invalid WWDC data path:/);
  });

  it('rejects a videoId that escapes the WWDC data directory', async () => {
    // Constructed path: videos/<year>-<videoId>.json
    // To force a path-traversal, the year segment itself must contain '..'
    // (the literal "2024-.." is a single non-collapsing segment).
    await expect(
      loadVideoData('../../..', 'etc/passwd'),
    ).rejects.toThrow(/Video not found/);
    expect(findPathInvalidError()).toMatch(/Invalid WWDC data path:/);
  });

  it('emits the exact "Invalid WWDC data path: <filePath>" prefix', async () => {
    await expect(loadTopicIndex('../../../etc')).rejects.toThrow();
    const errMsg = findPathInvalidError();
    expect(errMsg).not.toBeNull();
    // The prefix must be stable so callers/log scrapers can detect it.
    expect(errMsg).toMatch(/^Invalid WWDC data path: /m);
  });

  it('does NOT throw the path-traversal error for a benign (but missing) filePath', async () => {
    // A valid-shaped path that simply doesn't exist on disk should fail
    // with the read error wrapper, NOT the path-containment guard.
    // The mock data dir /mock/data/wwdc doesn't exist on the filesystem.
    await expect(loadAllVideos()).rejects.toThrow(
      /Failed to load WWDC video list/,
    );
    expect(findPathInvalidError()).toBeNull();
  });
});
