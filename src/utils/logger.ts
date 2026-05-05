/**
 * Simple logger utility for consistent logging across the application.
 *
 * IMPORTANT: This server runs on the MCP stdio transport. stdout is reserved
 * for the JSON-RPC protocol stream — any write to stdout corrupts the channel
 * and breaks every tool call. All log levels MUST go to stderr (console.error
 * / console.warn). Never reintroduce console.log here.
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Coerce a free-form environment string (case-insensitive) into a `LogLevel`.
 * Returns `undefined` for empty / unrecognized input so the caller can fall
 * back to the default level.
 */
function parseLogLevel(raw: string | undefined): LogLevel | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  // Map narrows the comparison through string keys, sidestepping the
  // `no-unsafe-enum-comparison` lint that fires on `case LogLevel.DEBUG:`.
  const lookup: Record<string, LogLevel> = {
    debug: LogLevel.DEBUG,
    info: LogLevel.INFO,
    warn: LogLevel.WARN,
    error: LogLevel.ERROR,
  };
  return lookup[normalized];
}

class Logger {
  private enabled: boolean = process.env.MCP_DEBUG === 'true';
  private level: LogLevel = parseLogLevel(process.env.MCP_LOG_LEVEL) ?? LogLevel.INFO;

  /**
   * Log debug message (gated by MCP_DEBUG=true; writes to stderr)
   */
  debug(message: string, ...args: any[]): void {
    if (this.enabled && this.shouldLog(LogLevel.DEBUG)) {
      console.error(`[DEBUG] ${message}`, ...args);
    }
  }

  /**
   * Log info message (always on for boot/operational diagnostics; writes to stderr)
   */
  info(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.error(`[INFO] ${message}`, ...args);
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  /**
   * Log error message
   */
  error(message: string, error?: unknown): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(`[ERROR] ${message}`);
      if (error) {
        console.error(error);
      }
    }
  }

  /**
   * Check if should log based on level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentLevelIndex = levels.indexOf(this.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Enable/disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// Export singleton instance
export const logger = new Logger();