import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

/**
 * Logger threshold + env-var wiring tests.
 *
 * The logger is a module-scoped singleton built at import time, so the env
 * var (`MCP_LOG_LEVEL`) must be set BEFORE require()-ing the module. We use
 * `jest.isolateModules` to get a fresh module instance per case and assert
 * which `console.error`/`console.warn` calls actually fire at each level.
 */
describe('Logger', () => {
  const originalEnv = { ...process.env };
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
  let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  function loadLoggerWith(env: Record<string, string | undefined>): typeof import('../../src/utils/logger') {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    let mod!: typeof import('../../src/utils/logger');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('../../src/utils/logger');
    });
    return mod;
  }

  it('defaults to INFO when MCP_LOG_LEVEL is unset (info/warn/error pass, debug suppressed)', () => {
    const { logger } = loadLoggerWith({ MCP_LOG_LEVEL: undefined, MCP_DEBUG: undefined });

    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    // info + error route to console.error; warn routes to console.warn.
    // debug is gated by `enabled` (MCP_DEBUG) AND the level threshold; with
    // MCP_DEBUG unset it never fires regardless of level.
    const errorCalls = consoleErrorSpy.mock.calls.map(c => String(c[0]));
    const warnCalls = consoleWarnSpy.mock.calls.map(c => String(c[0]));

    expect(errorCalls.some(m => m.includes('[INFO]'))).toBe(true);
    expect(errorCalls.some(m => m.includes('[ERROR]'))).toBe(true);
    expect(warnCalls.some(m => m.includes('[WARN]'))).toBe(true);
    expect(errorCalls.some(m => m.includes('[DEBUG]'))).toBe(false);
  });

  it('honors MCP_LOG_LEVEL=warn (info filtered out, warn + error pass)', () => {
    const { logger } = loadLoggerWith({ MCP_LOG_LEVEL: 'warn', MCP_DEBUG: undefined });

    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    const errorCalls = consoleErrorSpy.mock.calls.map(c => String(c[0]));
    const warnCalls = consoleWarnSpy.mock.calls.map(c => String(c[0]));

    expect(errorCalls.some(m => m.includes('[INFO]'))).toBe(false);
    expect(warnCalls.some(m => m.includes('[WARN]'))).toBe(true);
    expect(errorCalls.some(m => m.includes('[ERROR]'))).toBe(true);
  });

  it('honors MCP_LOG_LEVEL=error (info + warn filtered, only error passes)', () => {
    const { logger } = loadLoggerWith({ MCP_LOG_LEVEL: 'error', MCP_DEBUG: undefined });

    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');

    const errorCalls = consoleErrorSpy.mock.calls.map(c => String(c[0]));
    const warnCalls = consoleWarnSpy.mock.calls.map(c => String(c[0]));

    expect(errorCalls.some(m => m.includes('[INFO]'))).toBe(false);
    expect(warnCalls.some(m => m.includes('[WARN]'))).toBe(false);
    expect(errorCalls.some(m => m.includes('[ERROR]'))).toBe(true);
  });

  it('parses MCP_LOG_LEVEL case-insensitively (e.g. "ERROR" === "error")', () => {
    const { logger } = loadLoggerWith({ MCP_LOG_LEVEL: 'ERROR', MCP_DEBUG: undefined });

    logger.info('info message');
    logger.error('error message');

    const errorCalls = consoleErrorSpy.mock.calls.map(c => String(c[0]));
    expect(errorCalls.some(m => m.includes('[INFO]'))).toBe(false);
    expect(errorCalls.some(m => m.includes('[ERROR]'))).toBe(true);
  });

  it('falls back to INFO on an unrecognized MCP_LOG_LEVEL value', () => {
    const { logger } = loadLoggerWith({ MCP_LOG_LEVEL: 'verbose-xyz', MCP_DEBUG: undefined });

    logger.info('info message');
    logger.error('error message');

    const errorCalls = consoleErrorSpy.mock.calls.map(c => String(c[0]));
    expect(errorCalls.some(m => m.includes('[INFO]'))).toBe(true);
    expect(errorCalls.some(m => m.includes('[ERROR]'))).toBe(true);
  });

  it('emits debug only when MCP_DEBUG=true AND level allows it', () => {
    const { logger } = loadLoggerWith({ MCP_LOG_LEVEL: 'debug', MCP_DEBUG: 'true' });

    logger.debug('debug message');

    const errorCalls = consoleErrorSpy.mock.calls.map(c => String(c[0]));
    expect(errorCalls.some(m => m.includes('[DEBUG]'))).toBe(true);
  });
});
