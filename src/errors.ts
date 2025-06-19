export class AgentError extends Error {
  public readonly code: string;
  public readonly context: Record<string, unknown>;
  public readonly cause?: Error;

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

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AgentError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: this.stack,
      cause: this.cause?.message
    };
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
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { code: 'COMMUNICATION_ERROR', context });
    this.name = 'CommunicationError';
  }
}

export class MemoryError extends AgentError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, { code: 'MEMORY_ERROR', context });
    this.name = 'MemoryError';
  }
}