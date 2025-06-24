/**
 * Simple Logger Utility - Respects test environments and log levels
 */

export enum LogLevel {
  SILENT = 0,
  ERROR = 1,
  WARN = 2, 
  INFO = 3,
  DEBUG = 4
}

export interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
  timestamp?: boolean;
}

class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    // Default to silent in test environments, info otherwise
    const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
    
    this.config = {
      level: isTest ? LogLevel.SILENT : LogLevel.INFO,
      prefix: '',
      timestamp: true,
      ...config
    };

    // Allow environment variable override
    if (process.env.LOG_LEVEL) {
      const envLevel = process.env.LOG_LEVEL.toUpperCase();
      if (envLevel in LogLevel) {
        this.config.level = LogLevel[envLevel as keyof typeof LogLevel];
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return this.config.level >= level;
  }

  private formatMessage(message: string): string {
    let formatted = message;
    
    if (this.config.prefix) {
      formatted = `[${this.config.prefix}] ${formatted}`;
    }
    
    if (this.config.timestamp) {
      formatted = `[${new Date().toISOString()}] ${formatted}`;
    }
    
    return formatted;
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage(message), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(message), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage(message), ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage(message), ...args);
    }
  }

  // Convenience method for updating log level
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }
}

// Default logger instance
export const defaultLogger = new Logger();

// Factory function for creating component-specific loggers
export function createLogger(component: string, config: Partial<LoggerConfig> = {}): Logger {
  return new Logger({
    prefix: component,
    ...config
  });
}

// Quick access functions using default logger
export const log = {
  error: (message: string, ...args: any[]) => defaultLogger.error(message, ...args),
  warn: (message: string, ...args: any[]) => defaultLogger.warn(message, ...args),
  info: (message: string, ...args: any[]) => defaultLogger.info(message, ...args),
  debug: (message: string, ...args: any[]) => defaultLogger.debug(message, ...args),
  setLevel: (level: LogLevel) => defaultLogger.setLevel(level)
};

export { Logger };