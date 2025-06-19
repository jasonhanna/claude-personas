import { 
  AgentError, 
  ValidationError, 
  ConfigurationError, 
  CommunicationError, 
  MemoryError 
} from '../src/errors.js';

describe('Security Tests - Information Disclosure Prevention', () => {
  
  describe('Production Environment Security', () => {
    test('should not expose sensitive context in production', () => {
      const sensitiveContext = {
        password: 'super_secret_password',
        apiKey: 'sk-1234567890abcdef',
        secretKey: 'secret_key_value',
        token: 'bearer_token_123',
        databasePassword: 'db_password',
        privateKey: 'private_key_content',
        credentials: 'user:pass',
        authToken: 'auth_123'
      };
      
      const error = new AgentError('Test error', { context: sensitiveContext });
      const prodSerialized = error.toJSON('production');
      
      // Production should not expose any context
      expect(prodSerialized.context).toBeUndefined();
      expect(prodSerialized.stack).toBeUndefined();
      expect(prodSerialized.cause).toBeUndefined();
      
      // Should only have safe fields
      expect(prodSerialized).toEqual({
        name: 'AgentError',
        message: 'Test error',
        code: 'AGENT_ERROR',
        requestId: expect.stringMatching(/^req_\d+_[a-z0-9]{9}$/),
        timestamp: expect.any(Number)
      });
    });

    test('should not expose file paths in production', () => {
      const context = {
        configPath: '/etc/secrets/database.conf',
        logPath: '/var/log/sensitive/app.log',
        keyPath: '/home/user/.ssh/id_rsa',
        filePath: '/secret/directory/file.json'
      };
      
      const error = new MemoryError('File operation failed', context);
      const prodSerialized = error.toJSON('production');
      
      expect(prodSerialized.context).toBeUndefined();
      
      // Verify the error message itself doesn't contain paths
      expect(prodSerialized.message).not.toContain('/etc/');
      expect(prodSerialized.message).not.toContain('/var/');
      expect(prodSerialized.message).not.toContain('/home/');
    });

    test('should not expose stack traces in production', () => {
      const error = new ValidationError('Validation failed');
      const prodSerialized = error.toJSON('production');
      
      expect(prodSerialized.stack).toBeUndefined();
    });

    test('should not expose error causes in production', () => {
      const originalError = new Error('Database connection failed: user=admin, password=secret123');
      const error = new CommunicationError('Connection error', {}, { cause: originalError });
      const prodSerialized = error.toJSON('production');
      
      expect(prodSerialized.cause).toBeUndefined();
    });
  });

  describe('Development Environment Security', () => {
    test('should sanitize sensitive fields in development context', () => {
      const sensitiveContext = {
        username: 'john_doe',
        password: 'super_secret_password',
        email: 'john@example.com',
        apiKey: 'sk-1234567890abcdef',
        secretKey: 'secret_key_value',
        token: 'bearer_token_123',
        normalField: 'safe_value'
      };
      
      const error = new AgentError('Test error', { context: sensitiveContext });
      const devSerialized = error.toJSON('development');
      const sanitizedContext = devSerialized.context as Record<string, unknown>;
      
      // Sensitive fields should be redacted
      expect(sanitizedContext.password).toBe('[REDACTED]');
      expect(sanitizedContext.apiKey).toBe('[REDACTED]');
      expect(sanitizedContext.secretKey).toBe('[REDACTED]');
      expect(sanitizedContext.token).toBe('[REDACTED]');
      
      // Safe fields should be preserved
      expect(sanitizedContext.username).toBe('john_doe');
      expect(sanitizedContext.email).toBe('john@example.com');
      expect(sanitizedContext.normalField).toBe('safe_value');
    });

    test('should sanitize file paths to show only filenames', () => {
      const context = {
        configFile: '/etc/myapp/config.json',
        logFile: '/var/log/application.log',
        keyFile: '/home/user/.ssh/id_rsa',
        relativePath: './config/database.conf',
        windowsPath: 'C:\\Users\\admin\\secrets\\file.txt'
      };
      
      const error = new ConfigurationError('Config error', context);
      const devSerialized = error.toJSON('development');
      const sanitizedContext = devSerialized.context as Record<string, unknown>;
      
      expect(sanitizedContext.configFile).toBe('config.json');
      expect(sanitizedContext.logFile).toBe('application.log');
      expect(sanitizedContext.keyFile).toBe('id_rsa');
      expect(sanitizedContext.relativePath).toBe('database.conf');
      expect(sanitizedContext.windowsPath).toBe('file.txt');
    });

    test('should sanitize nested sensitive data', () => {
      const context = {
        user: {
          id: '123',
          name: 'John Doe',
          credentials: {
            password: 'secret123',
            apiKey: 'sk-abcdef',
            profile: {
              email: 'john@example.com',
              secretAnswer: 'my_secret'
            }
          }
        },
        config: {
          database: {
            host: 'localhost',
            password: 'db_secret',
            connectionString: 'mongodb://user:pass@localhost'
          }
        }
      };
      
      const error = new AgentError('Test error', { context });
      const devSerialized = error.toJSON('development');
      const sanitizedContext = devSerialized.context as Record<string, unknown>;
      
      const user = sanitizedContext.user as any;
      expect(user.id).toBe('123');
      expect(user.name).toBe('John Doe');
      expect(user.credentials.password).toBe('[REDACTED]');
      expect(user.credentials.apiKey).toBe('[REDACTED]');
      expect(user.credentials.profile.email).toBe('john@example.com');
      expect(user.credentials.profile.secretAnswer).toBe('[REDACTED]');
      
      const config = sanitizedContext.config as any;
      expect(config.database.host).toBe('localhost');
      expect(config.database.password).toBe('[REDACTED]');
      expect(config.database.connectionString).toBe('connectionString');
    });
  });

  describe('Cross-Environment Consistency', () => {
    test('should maintain consistent error identification across environments', () => {
      const error = new ValidationError('Invalid input', { field: 'email' });
      
      const prodSerialized = error.toJSON('production');
      const devSerialized = error.toJSON('development');
      
      // Core identification should be identical
      expect(prodSerialized.name).toBe(devSerialized.name);
      expect(prodSerialized.message).toBe(devSerialized.message);
      expect(prodSerialized.code).toBe(devSerialized.code);
      expect(prodSerialized.requestId).toBe(devSerialized.requestId);
    });

    test('should maintain error message consistency', () => {
      const message = 'Database connection failed';
      const error = new CommunicationError(message);
      
      const prodSerialized = error.toJSON('production');
      const devSerialized = error.toJSON('development');
      
      expect(prodSerialized.message).toBe(message);
      expect(devSerialized.message).toBe(message);
    });
  });

  describe('Sensitive Keywords Detection', () => {
    test('should detect various forms of sensitive keywords', () => {
      const sensitiveFields = {
        PASSWORD: 'value1',
        Password: 'value2',
        password: 'value3',
        'user-password': 'value4',
        userPassword: 'value5',
        TOKEN: 'value6',
        Token: 'value7',
        token: 'value8',
        'auth-token': 'value9',
        authToken: 'value10',
        SECRET: 'value11',
        Secret: 'value12',
        secret: 'value13',
        'api-secret': 'value14',
        apiSecret: 'value15',
        KEY: 'value16',
        Key: 'value17',
        key: 'value18',
        'private-key': 'value19',
        privateKey: 'value20'
      };
      
      const error = new AgentError('Test', { context: sensitiveFields });
      const devSerialized = error.toJSON('development');
      const sanitizedContext = devSerialized.context as Record<string, unknown>;
      
      // All should be redacted
      Object.values(sanitizedContext).forEach(value => {
        expect(value).toBe('[REDACTED]');
      });
    });

    test('should not over-redact legitimate fields', () => {
      const legitimateFields = {
        username: 'john_doe',
        email: 'john@example.com',
        userId: '12345',
        accountId: 'acc_123',
        sessionId: 'sess_456',
        requestId: 'req_789',
        filename: 'document.pdf',
        timestamp: '2023-01-01T00:00:00Z',
        status: 'active',
        role: 'admin'
      };
      
      const error = new AgentError('Test', { context: legitimateFields });
      const devSerialized = error.toJSON('development');
      const sanitizedContext = devSerialized.context as Record<string, unknown>;
      
      // All should be preserved (not redacted)
      Object.entries(legitimateFields).forEach(([key, value]) => {
        expect(sanitizedContext[key]).toBe(value);
      });
    });
  });

  describe('File Path Sanitization', () => {
    test('should handle various file path formats', () => {
      const paths = {
        unixAbsolute: '/home/user/secret/file.txt',
        unixRelative: './config/secret.json',
        windowsAbsolute: 'C:\\Users\\admin\\Documents\\secret.docx',
        windowsRelative: '.\\config\\database.conf',
        urlPath: 'https://example.com/api/secret/endpoint',
        networkPath: '\\\\server\\share\\secret\\file.txt'
      };
      
      const error = new AgentError('Test', { context: paths });
      const devSerialized = error.toJSON('development');
      const sanitizedContext = devSerialized.context as Record<string, unknown>;
      
      expect(sanitizedContext.unixAbsolute).toBe('file.txt');
      expect(sanitizedContext.unixRelative).toBe('secret.json');
      expect(sanitizedContext.windowsAbsolute).toBe('secret.docx');
      expect(sanitizedContext.windowsRelative).toBe('database.conf');
      expect(sanitizedContext.urlPath).toBe('endpoint');
      expect(sanitizedContext.networkPath).toBe('file.txt');
    });

    test('should preserve non-path strings with slashes', () => {
      const context = {
        ratio: '3/4',
        date: '2023/12/25',
        fraction: '1/2',
        version: 'v1.0/stable'
      };
      
      const error = new AgentError('Test', { context });
      const devSerialized = error.toJSON('development');
      const sanitizedContext = devSerialized.context as Record<string, unknown>;
      
      // These shouldn't be treated as file paths
      expect(sanitizedContext.ratio).toBe('3/4');
      expect(sanitizedContext.date).toBe('2023/12/25');
      expect(sanitizedContext.fraction).toBe('1/2');
      expect(sanitizedContext.version).toBe('v1.0/stable');
    });
  });

  describe('Security Regression Tests', () => {
    test('should not accidentally expose data through toString()', () => {
      const error = new AgentError('Test error', {
        context: { password: 'secret123' }
      });
      
      const toString = error.toString();
      
      expect(toString).not.toContain('secret123');
      expect(toString).not.toContain('password');
    });

    test('should not expose data through error properties in production', () => {
      const sensitiveContext = { password: 'secret123', token: 'abc123' };
      const error = new AgentError('Test', { context: sensitiveContext });
      
      // Direct property access should still work
      expect(error.context.password).toBe('secret123');
      
      // But serialization should be clean
      const prodSerialized = error.toJSON('production');
      const serializedString = JSON.stringify(prodSerialized);
      
      expect(serializedString).not.toContain('secret123');
      expect(serializedString).not.toContain('abc123');
      expect(serializedString).not.toContain('password');
      expect(serializedString).not.toContain('token');
    });

    test('should maintain security across multiple serializations', () => {
      const error = new AgentError('Test', {
        context: { secret: 'hidden_value' }
      });
      
      // Multiple serializations should be consistent
      const prod1 = error.toJSON('production');
      const prod2 = error.toJSON('production');
      const dev1 = error.toJSON('development');
      const dev2 = error.toJSON('development');
      
      expect(prod1).toEqual(prod2);
      expect(dev1).toEqual(dev2);
      
      // Production should remain clean
      expect(JSON.stringify(prod1)).not.toContain('hidden_value');
      expect(JSON.stringify(prod2)).not.toContain('hidden_value');
    });
  });

  describe('Performance Security', () => {
    test('should not leak sensitive data in performance optimization caching', () => {
      const error = new AgentError('Test', {
        context: { password: 'secret' }
      });
      
      // Force caching by calling multiple times
      error.toJSON('production');
      error.toJSON('development');
      error.toJSON('production');
      error.toJSON('development');
      
      // Check that cache doesn't leak between environments
      const prodResult = error.toJSON('production');
      const devResult = error.toJSON('development');
      
      expect(prodResult.context).toBeUndefined();
      expect((devResult.context as any).password).toBe('[REDACTED]');
    });
  });
});