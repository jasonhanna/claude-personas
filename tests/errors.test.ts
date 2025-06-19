import { 
  AgentError, 
  ValidationError, 
  ConfigurationError, 
  CommunicationError, 
  MemoryError,
  ErrorEnvironment 
} from '../src/errors.js';

describe('Error Classes Unit Tests', () => {
  
  describe('AgentError Base Class', () => {
    test('should create basic error with default values', () => {
      const error = new AgentError('Test error');
      
      expect(error.name).toBe('AgentError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('AGENT_ERROR');
      expect(error.context).toEqual({});
      expect(error.cause).toBeUndefined();
      expect(error.requestId).toMatch(/^req_\d+_[a-z0-9]{9}$/);
    });

    test('should create error with custom options', () => {
      const cause = new Error('Original error');
      const context = { userId: '123', action: 'test' };
      
      const error = new AgentError('Test error', {
        code: 'CUSTOM_ERROR',
        context,
        cause
      });
      
      expect(error.code).toBe('CUSTOM_ERROR');
      expect(error.context).toEqual(context);
      expect(error.cause).toBe(cause);
    });

    test('should generate unique request IDs', () => {
      const error1 = new AgentError('Test 1');
      const error2 = new AgentError('Test 2');
      
      expect(error1.requestId).not.toBe(error2.requestId);
    });

    test('should inherit from Error properly', () => {
      const error = new AgentError('Test error');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AgentError);
    });

    test('should capture stack trace', () => {
      const error = new AgentError('Test error');
      
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AgentError');
    });

    test('toString() should include error details', () => {
      const error = new AgentError('Test error', { code: 'TEST_CODE' });
      const toString = error.toString();
      
      expect(toString).toContain('AgentError');
      expect(toString).toContain('Test error');
      expect(toString).toContain('TEST_CODE');
      expect(toString).toContain(error.requestId);
    });
  });

  describe('AgentError JSON Serialization', () => {
    test('should serialize with full details in development mode', () => {
      const context = { 
        filePath: '/secret/config/file.json',
        userId: '123',
        password: 'secret123',
        normalField: 'value'
      };
      const cause = new Error('Original error');
      
      const error = new AgentError('Test error', {
        code: 'TEST_ERROR',
        context,
        cause
      });
      
      const serialized = error.toJSON('development');
      
      expect(serialized.name).toBe('AgentError');
      expect(serialized.message).toBe('Test error');
      expect(serialized.code).toBe('TEST_ERROR');
      expect(serialized.requestId).toBeDefined();
      expect(serialized.timestamp).toBeDefined();
      expect(serialized.stack).toBeDefined();
      expect(serialized.cause).toBe('Original error');
      
      // Check context sanitization
      const sanitizedContext = serialized.context as Record<string, unknown>;
      expect(sanitizedContext.filePath).toBe('file.json'); // Only filename
      expect(sanitizedContext.userId).toBe('123'); // Normal field preserved
      expect(sanitizedContext.password).toBe('[REDACTED]'); // Sensitive field redacted
      expect(sanitizedContext.normalField).toBe('value');
    });

    test('should serialize with minimal details in production mode', () => {
      const context = { 
        filePath: '/secret/config/file.json',
        password: 'secret123',
        userId: '123'
      };
      const cause = new Error('Original error');
      
      const error = new AgentError('Test error', {
        code: 'TEST_ERROR',
        context,
        cause
      });
      
      const serialized = error.toJSON('production');
      
      expect(serialized.name).toBe('AgentError');
      expect(serialized.message).toBe('Test error');
      expect(serialized.code).toBe('TEST_ERROR');
      expect(serialized.requestId).toBeDefined();
      expect(serialized.timestamp).toBeDefined();
      expect(serialized.context).toBeUndefined(); // No context in production
      expect(serialized.stack).toBeUndefined(); // No stack in production
      expect(serialized.cause).toBeUndefined(); // No cause in production
    });

    test('should use cached serialization for performance', () => {
      const error = new AgentError('Test error');
      
      const first = error.toJSON('development');
      const second = error.toJSON('development');
      
      expect(first).toEqual(second);
      // Verify it's the same object reference (cached)
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    });

    test('should handle nested context sanitization', () => {
      const context = {
        user: {
          id: '123',
          password: 'secret',
          profile: {
            name: 'John',
            secretKey: 'hidden'
          }
        },
        config: {
          filePath: '/path/to/config.json'
        }
      };
      
      const error = new AgentError('Test error', { context });
      const serialized = error.toJSON('development');
      const sanitizedContext = serialized.context as Record<string, unknown>;
      
      expect((sanitizedContext.user as any).password).toBe('[REDACTED]');
      expect((sanitizedContext.user as any).profile.secretKey).toBe('[REDACTED]');
      expect((sanitizedContext.user as any).id).toBe('123');
      expect((sanitizedContext.config as any).filePath).toBe('config.json');
    });

    test('should default to production mode based on NODE_ENV', () => {
      const originalEnv = process.env.NODE_ENV;
      
      try {
        process.env.NODE_ENV = 'production';
        const error = new AgentError('Test error', {
          context: { secret: 'hidden' }
        });
        
        const serialized = error.toJSON();
        expect(serialized.context).toBeUndefined();
        
        process.env.NODE_ENV = 'development';
        const serialized2 = error.toJSON();
        expect(serialized2.context).toBeDefined();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('ValidationError', () => {
    test('should create ValidationError with correct properties', () => {
      const context = { field: 'username', value: null };
      const error = new ValidationError('Invalid input', context);
      
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.context).toEqual(context);
      expect(error).toBeInstanceOf(AgentError);
      expect(error).toBeInstanceOf(ValidationError);
    });

    test('should work without context', () => {
      const error = new ValidationError('Invalid input');
      
      expect(error.name).toBe('ValidationError');
      expect(error.context).toEqual({});
    });
  });

  describe('ConfigurationError', () => {
    test('should create ConfigurationError with correct properties', () => {
      const context = { configFile: 'app.json', missingKey: 'database' };
      const error = new ConfigurationError('Missing configuration', context);
      
      expect(error.name).toBe('ConfigurationError');
      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.context).toEqual(context);
      expect(error).toBeInstanceOf(AgentError);
      expect(error).toBeInstanceOf(ConfigurationError);
    });
  });

  describe('CommunicationError', () => {
    test('should create CommunicationError with default retry settings', () => {
      const error = new CommunicationError('Network timeout');
      
      expect(error.name).toBe('CommunicationError');
      expect(error.code).toBe('COMMUNICATION_ERROR');
      expect(error.retryable).toBe(true);
      expect(error.maxRetries).toBe(3);
      expect(error.retryDelay).toBe(1000);
    });

    test('should create CommunicationError with custom retry settings', () => {
      const options = {
        retryable: false,
        maxRetries: 5,
        retryDelay: 2000
      };
      
      const error = new CommunicationError('Network error', {}, options);
      
      expect(error.retryable).toBe(false);
      expect(error.maxRetries).toBe(5);
      expect(error.retryDelay).toBe(2000);
    });

    test('shouldRetry() should work correctly', () => {
      const retryableError = new CommunicationError('Network error');
      const nonRetryableError = new CommunicationError('Error', {}, { retryable: false });
      
      expect(retryableError.shouldRetry(0)).toBe(true);
      expect(retryableError.shouldRetry(2)).toBe(true);
      expect(retryableError.shouldRetry(3)).toBe(false); // >= maxRetries
      
      expect(nonRetryableError.shouldRetry(0)).toBe(false);
    });

    test('getRetryDelay() should implement exponential backoff with jitter', () => {
      const error = new CommunicationError('Network error', {}, { retryDelay: 1000 });
      
      const delay0 = error.getRetryDelay(0);
      const delay1 = error.getRetryDelay(1);
      const delay2 = error.getRetryDelay(2);
      
      // Base delays (before jitter): 1000, 2000, 4000
      expect(delay0).toBeGreaterThanOrEqual(1000);
      expect(delay0).toBeLessThanOrEqual(1100); // 10% jitter
      
      expect(delay1).toBeGreaterThanOrEqual(2000);
      expect(delay1).toBeLessThanOrEqual(2200);
      
      expect(delay2).toBeGreaterThanOrEqual(4000);
      expect(delay2).toBeLessThanOrEqual(4400);
    });

    describe('CommunicationError.withRetry()', () => {
      test('should succeed on first attempt', async () => {
        const mockOperation = jest.fn().mockResolvedValue('success');
        
        const result = await CommunicationError.withRetry(mockOperation);
        
        expect(result).toBe('success');
        expect(mockOperation).toHaveBeenCalledTimes(1);
      });

      test('should retry on CommunicationError and eventually succeed', async () => {
        const mockOperation = jest.fn()
          .mockRejectedValueOnce(new CommunicationError('Network error'))
          .mockRejectedValueOnce(new CommunicationError('Network error'))
          .mockResolvedValue('success');
        
        const result = await CommunicationError.withRetry(mockOperation);
        
        expect(result).toBe('success');
        expect(mockOperation).toHaveBeenCalledTimes(3);
      });

      test('should fail after max retries', async () => {
        const error = new CommunicationError('Persistent error');
        const mockOperation = jest.fn().mockRejectedValue(error);
        
        await expect(CommunicationError.withRetry(mockOperation))
          .rejects.toThrow('Persistent error');
        
        expect(mockOperation).toHaveBeenCalledTimes(3); // Default max retries
      }, 10000);

      test('should not retry non-CommunicationErrors', async () => {
        const error = new ValidationError('Invalid input');
        const mockOperation = jest.fn().mockRejectedValue(error);
        
        await expect(CommunicationError.withRetry(mockOperation))
          .rejects.toThrow('Invalid input');
        
        expect(mockOperation).toHaveBeenCalledTimes(1); // No retries
      });

      test('should not retry non-retryable CommunicationErrors', async () => {
        const error = new CommunicationError('Auth error', {}, { retryable: false });
        const mockOperation = jest.fn().mockRejectedValue(error);
        
        await expect(CommunicationError.withRetry(mockOperation))
          .rejects.toThrow('Auth error');
        
        expect(mockOperation).toHaveBeenCalledTimes(1); // No retries
      });
    });
  });

  describe('MemoryError', () => {
    test('should create MemoryError with correct properties', () => {
      const context = { operation: 'read', filePath: '/data/memory.json' };
      const error = new MemoryError('Failed to read memory', context);
      
      expect(error.name).toBe('MemoryError');
      expect(error.code).toBe('MEMORY_ERROR');
      expect(error.context).toEqual(context);
      expect(error).toBeInstanceOf(AgentError);
      expect(error).toBeInstanceOf(MemoryError);
    });
  });

  describe('Error Inheritance Chain', () => {
    test('instanceof checks should work correctly', () => {
      const agentError = new AgentError('Base error');
      const validationError = new ValidationError('Validation error');
      const configError = new ConfigurationError('Config error');
      const commError = new CommunicationError('Comm error');
      const memoryError = new MemoryError('Memory error');
      
      // All should be instances of Error and AgentError
      [agentError, validationError, configError, commError, memoryError].forEach(error => {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(AgentError);
      });
      
      // Specific type checks
      expect(validationError).toBeInstanceOf(ValidationError);
      expect(configError).toBeInstanceOf(ConfigurationError);
      expect(commError).toBeInstanceOf(CommunicationError);
      expect(memoryError).toBeInstanceOf(MemoryError);
      
      // Cross-type checks should fail
      expect(validationError).not.toBeInstanceOf(ConfigurationError);
      expect(configError).not.toBeInstanceOf(ValidationError);
    });
  });

  describe('Context Sanitization Edge Cases', () => {
    test('should handle null and undefined values', () => {
      const context = {
        nullValue: null,
        undefinedValue: undefined,
        emptyString: '',
        zeroNumber: 0,
        falseBoolean: false
      };
      
      const error = new AgentError('Test error', { context });
      const serialized = error.toJSON('development');
      const sanitizedContext = serialized.context as Record<string, unknown>;
      
      expect(sanitizedContext.nullValue).toBeNull();
      expect(sanitizedContext.undefinedValue).toBeUndefined();
      expect(sanitizedContext.emptyString).toBe('');
      expect(sanitizedContext.zeroNumber).toBe(0);
      expect(sanitizedContext.falseBoolean).toBe(false);
    });

    test('should handle circular references safely', () => {
      const context: any = { name: 'test' };
      context.self = context; // Create circular reference
      
      const error = new AgentError('Test error', { context });
      
      // Should not throw on serialization
      expect(() => error.toJSON('development')).not.toThrow();
      
      const serialized = error.toJSON('development');
      const sanitizedContext = serialized.context as any;
      expect(sanitizedContext.name).toBe('test');
      expect(sanitizedContext.self).toEqual({ '[Circular]': true });
    });

    test('should handle arrays in context', () => {
      const context = {
        paths: ['/secret/file1.txt', '/public/file2.txt'],
        tokens: ['secret123', 'public456'],
        mixed: ['normal', { password: 'secret' }]
      };
      
      const error = new AgentError('Test error', { context });
      const serialized = error.toJSON('development');
      const sanitizedContext = serialized.context as Record<string, unknown>;
      
      
      expect(sanitizedContext.paths).toEqual(['file1.txt', 'file2.txt']);
      expect(sanitizedContext.tokens).toEqual(['[REDACTED]', '[REDACTED]']);
    });
  });
});