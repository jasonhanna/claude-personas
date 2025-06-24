/**
 * Unit tests for Error Classes
 */

import { 
  AgentError, 
  ValidationError, 
  MemoryError, 
  CommunicationError,
  ConfigurationError
} from '../errors.js';

describe('Error Classes', () => {
  describe('AgentError', () => {
    test('should create basic error with message', () => {
      const error = new AgentError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('AgentError');
      expect(error.code).toBe('AGENT_ERROR');
      expect(error.context).toEqual({});
      expect(error.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
    });

    test('should create error with custom code and context', () => {
      const context = { userId: 123, action: 'test' };
      const error = new AgentError('Test error', { 
        code: 'CUSTOM_ERROR', 
        context 
      });
      
      expect(error.code).toBe('CUSTOM_ERROR');
      expect(error.context).toEqual(context);
    });

    test('should create error with cause', () => {
      const cause = new Error('Root cause');
      const error = new AgentError('Test error', { cause });
      
      expect(error.cause).toBe(cause);
    });

    test('should sanitize sensitive context data', () => {
      const context = {
        password: 'secret123',
        token: 'abc123',
        secret: 'hidden',
        normalField: 'visible'
      };
      
      const error = new AgentError('Test error', { context });
      const serialized = error.toJSON('development');
      
      expect((serialized.context as any).password).toBe('[REDACTED]');
      expect((serialized.context as any).token).toBe('[REDACTED]');
      expect((serialized.context as any).secret).toBe('[REDACTED]');
      expect((serialized.context as any).normalField).toBe('visible');
    });

    test('should handle circular references in context', () => {
      const context: any = { name: 'test' };
      context.self = context; // Create circular reference
      
      const error = new AgentError('Test error', { context });
      const serialized = error.toJSON('development');
      
      expect((serialized.context as any).name).toBe('test');
      expect((serialized.context as any).self).toEqual({ '[Circular]': true });
    });

    test('should generate unique request IDs', () => {
      const error1 = new AgentError('Test 1');
      const error2 = new AgentError('Test 2');
      
      expect(error1.requestId).not.toBe(error2.requestId);
    });

    test('should format error for production environment', () => {
      const context = { 
        password: 'secret',
        filePath: '/home/user/app/src/secret.js',
        normalField: 'value'
      };
      const cause = new Error('Database connection failed');
      
      const error = new AgentError('Test error', { 
        code: 'TEST_ERROR',
        context,
        cause 
      });
      
      const formatted = error.toJSON('production');
      
      expect(formatted.message).toBe('Test error');
      expect(formatted.context).toBeUndefined(); // No context in production
      expect(formatted.cause).toBeUndefined(); // No cause in production
    });

    test('should format error for development environment', () => {
      const context = { 
        password: 'secret',
        filePath: '/home/user/app/src/secret.js',
        normalField: 'value'
      };
      const cause = new Error('Database connection failed');
      
      const error = new AgentError('Test error', { 
        code: 'TEST_ERROR',
        context,
        cause 
      });
      
      const formatted = error.toJSON('development');
      
      expect(formatted.message).toBe('Test error');
      expect((formatted.context as any).password).toBe('[REDACTED]');
      expect((formatted.context as any).filePath).toBe('secret.js');
      expect((formatted.context as any).normalField).toBe('value');
      expect(formatted.cause).toBe('Database connection failed'); // Cause included in dev
    });
  });

  describe('ValidationError', () => {
    test('should create validation error with default code', () => {
      const error = new ValidationError('Invalid input');
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Invalid input');
    });

    test('should create validation error with custom field', () => {
      const error = new ValidationError('Invalid email', { field: 'email' });
      expect(error.context.field).toBe('email');
    });
  });

  describe('MemoryError', () => {
    test('should create memory error with default code', () => {
      const error = new MemoryError('Memory allocation failed');
      expect(error.name).toBe('MemoryError');
      expect(error.code).toBe('MEMORY_ERROR');
      expect(error.message).toBe('Memory allocation failed');
    });

    test('should create memory error with memory type', () => {
      const error = new MemoryError('Out of memory', { memoryType: 'heap' });
      expect(error.context.memoryType).toBe('heap');
    });
  });

  describe('CommunicationError', () => {
    test('should create communication error with default code', () => {
      const error = new CommunicationError('Connection failed');
      expect(error.name).toBe('CommunicationError');
      expect(error.code).toBe('COMMUNICATION_ERROR');
      expect(error.message).toBe('Connection failed');
    });

    test('should create communication error with endpoint', () => {
      const error = new CommunicationError('Timeout', { endpoint: 'http://api.example.com' });
      expect(error.context.endpoint).toBe('http://api.example.com');
    });

    test('should handle retry logic', () => {
      const error = new CommunicationError('Network error', {}, { 
        retryable: true, 
        maxRetries: 3 
      });
      
      expect(error.shouldRetry(0)).toBe(true);
      expect(error.shouldRetry(1)).toBe(true);
      expect(error.shouldRetry(2)).toBe(true);
      expect(error.shouldRetry(3)).toBe(false);
    });

    test('should calculate exponential backoff delay', () => {
      const error = new CommunicationError('Network error', {}, { 
        retryDelay: 1000 
      });
      
      const delay1 = error.getRetryDelay(0);
      const delay2 = error.getRetryDelay(1);
      const delay3 = error.getRetryDelay(2);
      
      expect(delay1).toBeGreaterThanOrEqual(1000);
      expect(delay2).toBeGreaterThanOrEqual(2000);
      expect(delay3).toBeGreaterThanOrEqual(4000);
    });

    test('should handle non-retryable errors', () => {
      const error = new CommunicationError('Fatal error', {}, { 
        retryable: false 
      });
      
      expect(error.shouldRetry(0)).toBe(false);
    });
  });

  describe('ConfigurationError', () => {
    test('should create configuration error with default code', () => {
      const error = new ConfigurationError('Invalid configuration');
      expect(error.name).toBe('ConfigurationError');
      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.message).toBe('Invalid configuration');
    });

    test('should create configuration error with config details', () => {
      const error = new ConfigurationError('Missing required setting', { 
        configFile: 'app.json',
        missingSetting: 'database.host'
      });
      expect(error.context.configFile).toBe('app.json');
      expect(error.context.missingSetting).toBe('database.host');
    });
  });

  describe('Error Serialization', () => {
    test('should serialize error to JSON', () => {
      const error = new AgentError('Test error', {
        code: 'TEST_ERROR',
        context: { field: 'value' }
      });
      
      const json = error.toJSON();
      
      expect(json.name).toBe('AgentError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe('TEST_ERROR');
      expect((json.context as any).field).toBe('value');
      expect(json.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
    });

    test('should cache serialized result', () => {
      const error = new AgentError('Test error');
      
      const json1 = error.toJSON();
      const json2 = error.toJSON();
      
      expect(json1).toEqual(json2); // Should return equivalent cached result
    });
  });
});