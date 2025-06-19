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
                           key.toLowerCase().includes('key');
      
      if (Array.isArray(value)) {
        // Handle arrays - always process as arrays even if key is sensitive
        sanitized[key] = value.map(item => {
          if (typeof item === 'string' && item.includes('/')) {
            return item.split('/').pop();
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
      } else if (isSensitiveKey && typeof value === 'string') {
        // Remove sensitive information for non-array string values
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.includes('/')) {
        // Sanitize file paths - only show filename
        sanitized[key] = value.split('/').pop();
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeContext(value as Record<string, unknown>, seen);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
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