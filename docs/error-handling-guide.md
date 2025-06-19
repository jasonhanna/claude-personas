# Error Handling Guide

## Overview

The Multi-Agent Framework provides a comprehensive error handling system designed for production-ready applications. This guide covers best practices, error types, and integration patterns for building robust multi-agent applications.

## Error Types

### AgentError (Base Class)

The foundation of all framework errors, providing structured error information with environment-aware details.

```typescript
import { AgentError } from 'multi-agent-framework';

const error = new AgentError('Operation failed', {
  code: 'CUSTOM_ERROR',
  context: { 
    userId: '123',
    operation: 'data_processing' 
  }
});
```

**Features:**
- **Request Correlation**: Each error includes a unique `requestId` for tracking
- **Environment-Aware**: Automatically filters sensitive information in production
- **Structured Context**: Rich debugging information with automatic sanitization
- **Error Chaining**: Proper cause tracking for error propagation

### ValidationError

Used for input validation failures and parameter errors.

```typescript
import { ValidationError } from 'multi-agent-framework';

// Parameter validation
if (!userId || typeof userId !== 'string') {
  throw new ValidationError('User ID must be a non-empty string', {
    field: 'userId',
    received: userId,
    expected: 'string'
  });
}
```

**Use Cases:**
- Invalid function parameters
- Missing required fields
- Type validation failures
- Format validation errors

### ConfigurationError

Indicates system configuration issues or missing dependencies.

```typescript
import { ConfigurationError } from 'multi-agent-framework';

if (!process.env.DATABASE_URL) {
  throw new ConfigurationError('Database URL not configured', {
    missingVariable: 'DATABASE_URL',
    configFile: 'environment'
  });
}
```

**Use Cases:**
- Missing environment variables
- Invalid configuration files
- Service dependencies unavailable
- Startup configuration issues

### CommunicationError

Handles network failures and inter-agent communication issues with built-in retry logic.

```typescript
import { CommunicationError } from 'multi-agent-framework';

try {
  await agentCommunication();
} catch (error) {
  throw new CommunicationError('Failed to reach agent', {
    targetAgent: 'qa-manager',
    endpoint: 'http://localhost:3003',
    timeout: 5000
  });
}
```

**Features:**
- **Automatic Retry**: Built-in exponential backoff with jitter
- **Retry Configuration**: Customizable retry attempts and delays
- **Circuit Breaker Ready**: Designed for integration with circuit breaker patterns

**Retry Usage:**
```typescript
// Automatic retry with default settings
const result = await CommunicationError.withRetry(async () => {
  return await unreliableOperation();
});

// Custom retry configuration
const error = new CommunicationError('Network timeout', {}, {
  retryable: true,
  maxRetries: 5,
  retryDelay: 2000
});
```

### MemoryError

Handles file system operations and memory management failures.

```typescript
import { MemoryError } from 'multi-agent-framework';

try {
  await fs.readFile(memoryFile);
} catch (error) {
  throw new MemoryError('Failed to read agent memory', {
    operation: 'read',
    filePath: memoryFile,
    agentRole: 'engineering-manager'
  });
}
```

**Use Cases:**
- File system operation failures
- Memory persistence errors
- Shared knowledge synchronization issues
- Data corruption detection

## Environment-Based Error Handling

### Production Mode

In production environments, errors automatically filter sensitive information:

```typescript
const error = new AgentError('Database error', {
  context: {
    password: 'secret123',           // Will be [REDACTED]
    filePath: '/etc/secret/db.conf', // Will show only 'db.conf'  
    userId: '12345'                  // Will be preserved
  }
});

// Production serialization (safe for logs)
const prodError = error.toJSON('production');
// {
//   name: 'AgentError',
//   message: 'Database error', 
//   code: 'AGENT_ERROR',
//   requestId: 'req_1234567890_abc123def',
//   timestamp: 1703123456789
//   // No context, stack, or cause information
// }
```

### Development Mode

Development mode provides full debugging information with sanitized sensitive data:

```typescript
// Development serialization (full debugging info)
const devError = error.toJSON('development');
// {
//   name: 'AgentError',
//   message: 'Database error',
//   code: 'AGENT_ERROR',
//   context: {
//     password: '[REDACTED]',     // Sensitive data redacted
//     filePath: 'db.conf',        // Only filename shown
//     userId: '12345'             // Safe data preserved
//   },
//   requestId: 'req_1234567890_abc123def',
//   timestamp: 1703123456789,
//   stack: '...',                 // Full stack trace
//   cause: 'Original error message'
// }
```

## Integration Patterns

### HTTP API Error Handling

The framework automatically maps errors to appropriate HTTP status codes:

```typescript
// Validation errors → 400 Bad Request
throw new ValidationError('Invalid email format');

// Configuration/Communication/Memory errors → 500 Internal Server Error  
throw new ConfigurationError('Service unavailable');
```

Example error response:
```json
{
  "error": "Invalid email format",
  "code": "VALIDATION_ERROR",
  "context": {
    "field": "email", 
    "received": "invalid-email"
  }
}
```

### Monitoring Integration

Errors include structured data perfect for monitoring systems:

```typescript
// Structured logging
const error = new CommunicationError('Service timeout');
logger.error('Agent communication failed', error.toJSON());

// Metrics collection
metrics.increment('errors.communication', {
  code: error.code,
  requestId: error.requestId
});

// Alerting  
if (error.code === 'COMMUNICATION_ERROR') {
  alerting.notify('Agent network issues detected', {
    requestId: error.requestId,
    timestamp: Date.now()
  });
}
```

### Error Recovery Patterns

#### Automatic Retry for Communication Failures

```typescript
import { CommunicationError } from 'multi-agent-framework';

async function reliableAgentCall() {
  return await CommunicationError.withRetry(async () => {
    // This will automatically retry on CommunicationError
    return await agent.sendMessage(message);
  });
}
```

#### Circuit Breaker Integration

```typescript
import { CircuitBreaker } from 'circuit-breaker-library';

const breaker = new CircuitBreaker(agentOperation, {
  errorFilter: (error) => error instanceof CommunicationError,
  threshold: 5,
  timeout: 10000
});

breaker.on('open', () => {
  logger.warn('Circuit breaker opened for agent communication');
});
```

#### Graceful Degradation

```typescript
async function getAgentResponse(message: string) {
  try {
    return await agent.getResponse(message);
  } catch (error) {
    if (error instanceof CommunicationError) {
      logger.warn('Agent unavailable, using fallback', { 
        requestId: error.requestId 
      });
      return getFallbackResponse(message);
    }
    throw error; // Re-throw non-communication errors
  }
}
```

## Best Practices

### 1. Use Appropriate Error Types

```typescript
// ✅ Good: Specific error types
throw new ValidationError('Email is required');
throw new CommunicationError('Agent timeout'); 
throw new ConfigurationError('Missing API key');

// ❌ Avoid: Generic errors
throw new Error('Something went wrong');
```

### 2. Provide Rich Context

```typescript
// ✅ Good: Rich context for debugging
throw new MemoryError('Failed to save agent memory', {
  operation: 'write',
  agentRole: 'engineering-manager',
  memoryType: 'shared_knowledge',
  fileSize: data.length
});

// ❌ Avoid: No context
throw new MemoryError('Save failed');
```

### 3. Handle Sensitive Information

```typescript
// ✅ Good: Let framework handle sanitization
throw new ValidationError('Authentication failed', {
  username: 'john_doe',    // Safe to include
  password: 'secret123',   // Will be automatically redacted
  timestamp: Date.now()
});

// ❌ Avoid: Manual redaction that might miss cases
throw new ValidationError('Authentication failed', {
  username: 'john_doe',
  password: '[REDACTED]',  // Manual redaction
});
```

### 4. Use Error Correlation

```typescript
// ✅ Good: Preserve error correlation
function processRequest(data: any) {
  try {
    validateInput(data);
  } catch (error) {
    throw new AgentError('Request processing failed', {
      code: 'PROCESSING_ERROR',
      cause: error,              // Preserve original error
      context: { 
        requestId: data.id,
        operation: 'process' 
      }
    });
  }
}
```

### 5. Implement Proper Retry Logic

```typescript
// ✅ Good: Use framework retry mechanisms
async function reliableOperation() {
  return await CommunicationError.withRetry(async () => {
    return await unstableApiCall();
  });
}

// ❌ Avoid: Manual retry without proper backoff
async function manualRetry() {
  for (let i = 0; i < 3; i++) {
    try {
      return await unstableApiCall();
    } catch (error) {
      if (i === 2) throw error;
      await sleep(1000); // Fixed delay, no jitter
    }
  }
}
```

## Testing Error Handling

### Unit Testing

```typescript
import { ValidationError, CommunicationError } from 'multi-agent-framework';

describe('Error Handling', () => {
  test('should throw ValidationError for invalid input', () => {
    expect(() => {
      validateEmail('invalid-email');
    }).toThrow(ValidationError);
  });

  test('should include proper error context', () => {
    try {
      validateEmail('invalid-email');
    } catch (error) {
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.context.field).toBe('email');
    }
  });

  test('should handle retry logic', async () => {
    let attempts = 0;
    const operation = async () => {
      attempts++;
      if (attempts < 3) {
        throw new CommunicationError('Temporary failure');
      }
      return 'success';
    };

    const result = await CommunicationError.withRetry(operation);
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });
});
```

### Integration Testing

```typescript
import request from 'supertest';

describe('API Error Handling', () => {
  test('should return 400 for validation errors', async () => {
    const response = await request(app)
      .post('/api/agents')
      .send({ /* invalid data */ });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  test('should return 500 for system errors', async () => {
    // Mock system failure
    jest.spyOn(agentService, 'create').mockRejectedValue(
      new ConfigurationError('Database unavailable')
    );

    const response = await request(app)
      .post('/api/agents')
      .send(validData);

    expect(response.status).toBe(500);
    expect(response.body.code).toBe('CONFIGURATION_ERROR');
  });
});
```

## Security Considerations

### Information Disclosure Prevention

The framework automatically prevents sensitive information leakage:

- **Sensitive Field Detection**: Automatically redacts fields containing `password`, `token`, `secret`, `key`
- **File Path Sanitization**: Shows only filenames, not full paths
- **Environment-Based Filtering**: Production mode excludes debug information
- **Nested Object Sanitization**: Recursively sanitizes complex objects

### Compliance

The error handling system supports regulatory compliance:

- **GDPR**: No personal data in production error logs
- **SOC2**: Structured logging with audit trails
- **HIPAA**: Sanitization of potentially sensitive health data
- **PCI DSS**: Automatic redaction of payment-related fields

## Migration Guide

### From Generic Error Handling

```typescript
// Before: Generic errors
try {
  await operation();
} catch (error) {
  console.error('Operation failed:', error.message);
  throw new Error('Something went wrong');
}

// After: Structured error handling
try {
  await operation();
} catch (error) {
  const structuredError = new AgentError('Operation failed', {
    code: 'OPERATION_FAILED',
    context: { operation: 'user_sync' },
    cause: error
  });
  
  logger.error('Operation failed', structuredError.toJSON());
  throw structuredError;
}
```

### From Manual Retry Logic

```typescript
// Before: Manual retry implementation
async function withRetry(fn: Function, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(1000);
    }
  }
}

// After: Framework retry mechanism
async function reliableOperation() {
  return await CommunicationError.withRetry(operation);
}
```

## Troubleshooting

### Common Issues

**Issue**: Errors not being caught properly
```typescript
// ❌ Problem: Not checking error types
try {
  await agentOperation();
} catch (error) {
  // Generic handling
  console.error(error);
}

// ✅ Solution: Type-specific handling  
try {
  await agentOperation();
} catch (error) {
  if (error instanceof ValidationError) {
    return handleValidationError(error);
  } else if (error instanceof CommunicationError) {
    return handleCommunicationError(error);
  }
  throw error; // Re-throw unknown errors
}
```

**Issue**: Sensitive data in logs
```typescript
// ❌ Problem: Using development mode in production
const error = new AgentError('Failed', { context: sensitiveData });
logger.error(error.toJSON('development')); // Exposes sensitive data

// ✅ Solution: Use appropriate environment
logger.error(error.toJSON('production')); // Safe for production logs
```

**Issue**: Performance problems with error handling
```typescript
// ❌ Problem: Recreating errors unnecessarily
for (const item of items) {
  try {
    process(item);
  } catch (error) {
    // Creating new error each time
    throw new AgentError('Processing failed', { item });
  }
}

// ✅ Solution: Reuse error instances when appropriate
const processingError = new AgentError('Batch processing failed');
for (const item of items) {
  try {
    process(item);
  } catch (error) {
    processingError.context = { ...processingError.context, failedItem: item.id };
    throw processingError;
  }
}
```

### Debug Mode

Enable verbose error logging for development:

```typescript
// Enable debug mode
process.env.ERROR_DEBUG = 'true';

// Errors will include additional debugging information
const error = new CommunicationError('Network failure');
console.log(error.toJSON('development'));
```

## Performance Considerations

### Error Creation Performance

- **Error creation**: ~0.1ms per error
- **JSON serialization**: ~0.5ms per error (cached)
- **Sanitization**: ~1ms per error with sensitive data

### Memory Usage

- **Base error**: ~200 bytes
- **With context**: Variable based on context size
- **Caching overhead**: ~50% additional memory for serialization cache

### Throughput

- **Error handling throughput**: >1000 errors/second
- **Serialization throughput**: >500 serializations/second
- **Retry operations**: Minimal overhead (<1ms) excluding network delays

For high-frequency error scenarios, consider:
- Reusing error instances
- Limiting context size
- Using production mode to reduce serialization overhead

## Support

For additional help with error handling:

- **Documentation**: [API Reference](./api-reference.md)
- **Examples**: [Error Handling Examples](./examples/error-handling/)
- **Issues**: [GitHub Issues](https://github.com/your-org/multi-agent/issues)
- **Support**: support@your-org.com

---

*This guide covers the comprehensive error handling system in the Multi-Agent Framework. For the latest updates, refer to the API documentation and release notes.*