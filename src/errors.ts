export type ErrorEnvironment = 'production' | 'development';

export class AgentError extends Error {
  public readonly code: string;
  public readonly context: Record<string, unknown>;
  public readonly cause?: Error;
  public readonly requestId: string;
  private _serializedCache?: Record<string, string>;

  constructor(
    message: string,
    options: {
      code?: string;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'AgentError';
    this.code = options.code || 'AGENT_ERROR';
    this.context = options.context || {};
    this.cause = options.cause;
    this.requestId = this.generateRequestId();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AgentError);
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sanitizeContext(context: Record<string, unknown>, seen = new WeakSet()): Record<string, unknown> {
    // Handle circular references
    if (typeof context === 'object' && context !== null && seen.has(context)) {
      return { '[Circular]': true };
    }
    
    if (typeof context === 'object' && context !== null) {
      seen.add(context);
    }
    
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(context)) {
      const isSensitiveKey = key.toLowerCase().includes('password') || 
                           key.toLowerCase().includes('token') || 
                           key.toLowerCase().includes('secret') ||
                           this.isSensitiveKeyField(key);
      
      if (Array.isArray(value)) {
        // Handle arrays - always process as arrays even if key is sensitive
        sanitized[key] = value.map(item => {
          if (typeof item === 'string' && this.isFilePath(item)) {
            return this.extractFilename(item);
          } else if (typeof item === 'string' && (
            isSensitiveKey ||
            item.toLowerCase().includes('token') ||
            item.toLowerCase().includes('secret') ||
            item.toLowerCase().includes('password')
          )) {
            return '[REDACTED]';
          } else if (typeof item === 'object' && item !== null) {
            return this.sanitizeContext(item as Record<string, unknown>, seen);
          }
          return item;
        });
      } else if (typeof value === 'string') {
        // Handle string values - check for paths first, then sensitivity
        if (this.isFilePath(value)) {
          // Extract filename from paths, even for sensitive keys like keyFile
          sanitized[key] = this.extractFilename(value);
        } else if (key.toLowerCase().includes('connectionstring')) {
          // Special handling for connection strings - extract the key name
          sanitized[key] = key.replace(/([A-Z])/g, (match, letter, index) => 
            index === 0 ? letter.toLowerCase() : letter.toLowerCase()
          ).replace(/connection|string/gi, '').replace(/^string$/, 'connectionString') || 'connectionString';
        } else if (isSensitiveKey || 
                   value.toLowerCase().includes('token') ||
                   value.toLowerCase().includes('secret') ||
                   value.toLowerCase().includes('password')) {
          // Redact sensitive values
          sanitized[key] = '[REDACTED]';
        } else {
          // Keep non-sensitive, non-path strings as-is
          sanitized[key] = value;
        }
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeContext(value as Record<string, unknown>, seen);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  private isFilePath(str: string): boolean {
    // Check if string looks like a file path vs. other uses of slashes
    // File paths typically have:
    // - Multiple path segments
    // - File extensions
    // - Known path prefixes
    // - Backslashes (Windows)
    
    // Short strings with single slash are likely not paths (e.g., "3/4", "1/2")
    if (str.length < 5 && str.split('/').length === 2) {
      return false;
    }
    
    // Date-like patterns
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(str)) {
      return false;
    }
    
    // Version-like patterns
    if (/^v?\d+\.\d+\/\w+$/.test(str)) {
      return false;
    }
    
    // Simple ratios or fractions
    if (/^\d+\/\d+$/.test(str)) {
      return false;
    }
    
    return (
      // Unix/Linux paths
      str.startsWith('/') ||
      str.startsWith('./') ||
      str.startsWith('../') ||
      // Windows paths
      /^[A-Za-z]:\\/.test(str) ||
      str.includes('\\') ||
      // Network paths
      str.startsWith('\\\\') ||
      // URLs (treat as paths for sanitization)
      str.startsWith('http://') ||
      str.startsWith('https://') ||
      // Multi-segment paths with file extensions
      (str.includes('/') && str.includes('.') && str.split('/').length > 2)
    );
  }

  private extractFilename(path: string): string {
    // Handle different path separators
    if (path.includes('\\')) {
      // Windows path
      return path.split('\\').pop() || path;
    } else if (path.includes('/')) {
      // Unix path or URL
      const segments = path.split('/');
      return segments[segments.length - 1] || segments[segments.length - 2] || path;
    }
    return path;
  }

  private isSensitiveKeyField(key: string): boolean {
    const lowerKey = key.toLowerCase().replace(/[-_]/g, '');
    
    // Check for key-related fields that should be redacted
    // But exclude file path fields that should be path-sanitized instead
    const isKeyField = lowerKey.includes('key');
    const isFileField = lowerKey.includes('file') || lowerKey.includes('path');
    
    // If it's a key field but not a file field, it's sensitive
    return isKeyField && !isFileField;
  }

  toJSON(environment: ErrorEnvironment = process.env.NODE_ENV === 'production' ? 'production' : 'development'): Record<string, unknown> {
    // Use cached serialization if available
    if (this._serializedCache && this._serializedCache[environment]) {
      return JSON.parse(this._serializedCache[environment]);
    }

    let errorData: Record<string, unknown>;
    
    if (environment === 'production') {
      // Production: minimal, sanitized error information
      errorData = {
        name: this.name,
        message: this.message,
        code: this.code,
        requestId: this.requestId,
        timestamp: Date.now()
      };
    } else {
      // Development: full error information with sanitized context
      errorData = {
        name: this.name,
        message: this.message,
        code: this.code,
        context: this.sanitizeContext(this.context),
        requestId: this.requestId,
        timestamp: Date.now(),
        stack: this.stack,
        cause: this.cause?.message
      };
    }

    // Cache the serialized result
    if (!this._serializedCache) {
      this._serializedCache = {};
    }
    this._serializedCache[environment] = JSON.stringify(errorData);
    
    return errorData;
  }

  toString(): string {
    return `${this.name}: ${this.message} (${this.code}) [${this.requestId}]`;
  }
}

export class ValidationError extends AgentError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { code: 'VALIDATION_ERROR', context });
    this.name = 'ValidationError';
  }
}

export class ConfigurationError extends AgentError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { code: 'CONFIGURATION_ERROR', context });
    this.name = 'ConfigurationError';
  }
}

export class CommunicationError extends AgentError {
  public readonly retryable: boolean;
  public readonly maxRetries: number;
  public readonly retryDelay: number;

  constructor(
    message: string, 
    context?: Record<string, unknown>,
    options: {
      retryable?: boolean;
      maxRetries?: number;
      retryDelay?: number;
      cause?: Error;
    } = {}
  ) {
    super(message, { code: 'COMMUNICATION_ERROR', context, cause: options.cause });
    this.name = 'CommunicationError';
    this.retryable = options.retryable ?? true;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000; // 1 second base delay
  }

  shouldRetry(attemptNumber: number): boolean {
    return this.retryable && attemptNumber < this.maxRetries;
  }

  getRetryDelay(attemptNumber: number): number {
    // Exponential backoff with jitter
    const exponentialDelay = this.retryDelay * Math.pow(2, attemptNumber);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    return Math.floor(exponentialDelay + jitter);
  }

  static async withRetry<T>(
    operation: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T> {
    let lastError: CommunicationError;
    
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof CommunicationError) {
          lastError = error;
          if (error.shouldRetry(attempt)) {
            const delay = error.getRetryDelay(attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        throw error;
      }
    }
    
    throw lastError!;
  }
}

export class MemoryError extends AgentError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { code: 'MEMORY_ERROR', context });
    this.name = 'MemoryError';
  }
}