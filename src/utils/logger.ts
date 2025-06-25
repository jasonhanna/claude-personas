/**
 * Simple Logger Utility - Respects test environments and log levels
 * Enhanced with file-based logging for MCP servers
 */

import { promises as fs } from 'fs';
import path from 'path';

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
  logFile?: string;
  maxFileSize?: number; // in bytes
  maxFiles?: number; // number of rotated files to keep
}

class Logger {
  private config: LoggerConfig;
  private logFileHandle: fs.FileHandle | null = null;

  constructor(config: Partial<LoggerConfig> = {}) {
    // Default to silent in test environments, info otherwise
    const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
    
    this.config = {
      level: isTest ? LogLevel.SILENT : LogLevel.INFO,
      prefix: '',
      timestamp: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      ...config
    };

    // Allow environment variable override
    if (process.env.LOG_LEVEL) {
      const envLevel = process.env.LOG_LEVEL.toUpperCase();
      if (envLevel in LogLevel) {
        this.config.level = LogLevel[envLevel as keyof typeof LogLevel];
      }
    }

    // Initialize file logging if specified
    if (this.config.logFile) {
      this.initFileLogging();
    }
  }

  private async initFileLogging(): Promise<void> {
    try {
      if (!this.config.logFile) return;
      
      // Ensure log directory exists
      const logDir = path.dirname(this.config.logFile);
      await fs.mkdir(logDir, { recursive: true });
      
      // Check if log rotation is needed
      await this.rotateLogIfNeeded();
      
    } catch (error) {
      console.error(`Failed to initialize file logging: ${error}`);
    }
  }

  private async rotateLogIfNeeded(): Promise<void> {
    try {
      if (!this.config.logFile) return;
      
      const stats = await fs.stat(this.config.logFile).catch(() => null);
      if (!stats || stats.size < this.config.maxFileSize!) return;
      
      // Rotate existing log files
      for (let i = this.config.maxFiles! - 1; i >= 1; i--) {
        const oldFile = `${this.config.logFile}.${i}`;
        const newFile = `${this.config.logFile}.${i + 1}`;
        
        try {
          await fs.rename(oldFile, newFile);
        } catch (error) {
          // File doesn't exist, continue
        }
      }
      
      // Move current log to .1
      await fs.rename(this.config.logFile, `${this.config.logFile}.1`);
      
    } catch (error) {
      console.error(`Failed to rotate log file: ${error}`);
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

  private async writeToFile(level: string, message: string, ...args: any[]): Promise<void> {
    if (!this.config.logFile) return;
    
    try {
      await this.rotateLogIfNeeded();
      
      const logEntry = `${this.formatMessage(`[${level}] ${message}`)}${args.length ? ' ' + args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ') : ''}\n`;
      
      await fs.appendFile(this.config.logFile, logEntry);
    } catch (error) {
      console.error(`Failed to write to log file: ${error}`);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage(message), ...args);
      // Fire and forget async logging to avoid blocking
      this.writeToFile('ERROR', message, ...args).catch(err => 
        console.error('Failed to write to log file:', err)
      );
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage(message), ...args);
      this.writeToFile('WARN', message, ...args).catch(err => 
        console.error('Failed to write to log file:', err)
      );
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage(message), ...args);
      this.writeToFile('INFO', message, ...args).catch(err => 
        console.error('Failed to write to log file:', err)
      );
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage(message), ...args);
      this.writeToFile('DEBUG', message, ...args).catch(err => 
        console.error('Failed to write to log file:', err)
      );
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

// Factory function for creating MCP server loggers with file logging
export function createMCPLogger(personaName: string, projectRoot: string): Logger {
  const logFile = path.join(projectRoot, '.claude-agents', personaName, 'logs', 'mcp-server.log');
  
  return new Logger({
    prefix: `MCP-${personaName}`,
    logFile,
    level: LogLevel.INFO,
    timestamp: true
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