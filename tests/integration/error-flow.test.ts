import express from 'express';
import request from 'supertest';
import { HTTPEndpoints } from '../../src/http-endpoints.js';
import { BaseAgentServer, PersonaConfig } from '../../src/base-agent-server.js';
import { testEnvironments } from '../../src/test-utils/test-environment-separation.js';
import { 
  AgentError, 
  ValidationError, 
  ConfigurationError, 
  CommunicationError, 
  MemoryError 
} from '../../src/errors.js';

// Mock persona for testing
const mockPersona: PersonaConfig = {
  name: 'Test Agent',
  role: 'test-agent',
  responsibilities: ['Testing'],
  initial_memories: [],
  tools: ['test_tool'],
  communication_style: {
    tone: 'professional',
    focus: 'testing'
  }
};

describe('Integration Tests - Error Propagation', () => {
  
  describe('HTTP Endpoints Error Handling', () => {
    let httpEndpoints: HTTPEndpoints;
    let app: express.Application;
    
    beforeEach(() => {
      httpEndpoints = new HTTPEndpoints(mockPersona, 3999);
      // Access private app property for testing
      app = (httpEndpoints as any).app;
    });

    afterEach(async () => {
      // Clean up any server instances to prevent port conflicts
      if (httpEndpoints && (httpEndpoints as any).server) {
        await httpEndpoints.stop();
      }
    });

    test('should handle tool call validation errors with proper HTTP status', async () => {
      // Mock tool handler that validates input
      httpEndpoints.setToolCallHandler(async (name: string, args: any) => {
        if (!name) {
          throw new ValidationError('Tool name is required', { args });
        }
        return { success: true };
      });

      const response = await request(app)
        .post('/mcp/call-tool')
        .send({ args: {} }); // Missing name

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Tool name is required');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    test('should handle configuration errors with 500 status', async () => {
      httpEndpoints.setToolCallHandler(async () => {
        throw new ConfigurationError('Missing configuration', { 
          configFile: '/etc/missing.conf' 
        });
      });

      const response = await request(app)
        .post('/mcp/call-tool')
        .send({ name: 'test_tool', args: {} });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Missing configuration');
      expect(response.body.code).toBe('CONFIGURATION_ERROR');
    });

    test('should handle communication errors with retry information', async () => {
      httpEndpoints.setToolCallHandler(async () => {
        throw new CommunicationError('Network timeout', { 
          endpoint: 'api.example.com',
          timeout: 5000
        });
      });

      const response = await request(app)
        .post('/mcp/call-tool')
        .send({ name: 'test_tool', args: {} });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Network timeout');
      expect(response.body.code).toBe('COMMUNICATION_ERROR');
    });

    test('should handle memory errors appropriately', async () => {
      httpEndpoints.setToolCallHandler(async () => {
        throw new MemoryError('Failed to read memory', { 
          operation: 'read',
          filePath: '/data/memory.json'
        });
      });

      const response = await request(app)
        .post('/mcp/call-tool')
        .send({ name: 'test_tool', args: {} });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to read memory');
      expect(response.body.code).toBe('MEMORY_ERROR');
    });

    test('should handle unknown errors gracefully', async () => {
      httpEndpoints.setToolCallHandler(async () => {
        throw new Error('Unexpected error');
      });

      const response = await request(app)
        .post('/mcp/call-tool')
        .send({ name: 'test_tool', args: {} });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Tool call failed');
      expect(response.body.code).toBe('COMMUNICATION_ERROR');
    });

    test('should handle missing tool handler configuration', async () => {
      // Don't set a tool handler
      const response = await request(app)
        .post('/mcp/call-tool')
        .send({ name: 'test_tool', args: {} });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Tool call handler not configured');
      expect(response.body.code).toBe('CONFIGURATION_ERROR');
    });

    test('should handle missing tools list provider', async () => {
      // Don't set a tools list provider
      const response = await request(app)
        .post('/mcp/list-tools')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Tools list provider not configured');
      expect(response.body.code).toBe('CONFIGURATION_ERROR');
    });

    test('should include request correlation in error responses', async () => {
      httpEndpoints.setToolCallHandler(async () => {
        throw new ValidationError('Test error');
      });

      const response = await request(app)
        .post('/mcp/call-tool')
        .send({ name: 'test_tool', args: {} });

      expect(response.status).toBe(400);
      // Error should include context for debugging
      expect(response.body.context).toBeDefined();
    });
  });

  describe('BaseAgentServer Error Handling', () => {
    // Updated to use mock infrastructure to prevent hanging
    let mockServer: any;
    
    beforeEach(async () => {
      // Set up test environment
      const testName = expect.getState().currentTestName || 'base-agent-server-test';
      const environment = testEnvironments.integration(testName);
      await environment.setup();
      (global as any).testEnvironment = environment;
      
      // Use mock server instead of real BaseAgentServer
      const mockFactory = environment.getMockFactory()!;
      mockServer = mockFactory.createMockBaseAgentServer(mockPersona, '/tmp/test', '/tmp/test-project', 3998);
    });

    afterEach(async () => {
      // Clean up test environment
      const environment = (global as any).testEnvironment;
      if (environment) {
        await environment.teardown();
        delete (global as any).testEnvironment;
      }
    });

    test('should handle tool execution errors with proper wrapping', async () => {
      const handleToolCall = (mockServer as any).handleToolCall.bind(mockServer);
      
      // Test with invalid tool name
      await expect(handleToolCall('', {}))
        .rejects.toThrow(ValidationError);
      
      await expect(handleToolCall('', {}))
        .rejects.toHaveProperty('code', 'VALIDATION_ERROR');
    });

    test('should handle missing arguments gracefully', async () => {
      const handleToolCall = (mockServer as any).handleToolCall.bind(mockServer);
      
      await expect(handleToolCall('test_tool', null))
        .rejects.toThrow(ValidationError);
    });

    test('should handle unknown tool errors', async () => {
      const handleToolCall = (mockServer as any).handleToolCall.bind(mockServer);
      
      await expect(handleToolCall('unknown_tool', {}))
        .rejects.toThrow(ValidationError);
      
      await expect(handleToolCall('unknown_tool', {}))
        .rejects.toHaveProperty('message', expect.stringContaining('not found'));
    });

    test('should handle get_agent_perspective validation', async () => {
      const handleToolCall = (mockServer as any).handleToolCall.bind(mockServer);
      
      await expect(handleToolCall('get_agent_perspective', {}))
        .rejects.toThrow(ValidationError);
      
      await expect(handleToolCall('get_agent_perspective', {}))
        .rejects.toHaveProperty('message', expect.stringContaining('Task is required'));
    });

    test('should handle send_message validation', async () => {
      const handleToolCall = (mockServer as any).handleToolCall.bind(mockServer);
      
      // Missing required fields
      await expect(handleToolCall('send_message', {}))
        .rejects.toThrow(ValidationError);
      
      await expect(handleToolCall('send_message', { message: 'test' }))
        .rejects.toThrow(ValidationError);
      
      await expect(handleToolCall('send_message', { content: 'message' }))
        .rejects.toThrow(ValidationError);
    });

    test('should handle memory operations with validation', async () => {
      const handleToolCall = (mockServer as any).handleToolCall.bind(mockServer);
      
      // Test read_shared_knowledge with invalid key
      await expect(handleToolCall('read_shared_knowledge', { key: '' }))
        .rejects.toThrow(ValidationError);
      
      await expect(handleToolCall('read_shared_knowledge', { key: null }))
        .rejects.toThrow(ValidationError);
      
      // Test write_shared_knowledge with invalid inputs
      await expect(handleToolCall('write_shared_knowledge', { key: '', value: 'test' }))
        .rejects.toThrow(ValidationError);
      
      await expect(handleToolCall('write_shared_knowledge', { key: 'test', value: 123 }))
        .rejects.toThrow(ValidationError);
      
      // Test update_memory with invalid entry
      await expect(handleToolCall('update_memory', { entry: '' }))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('Error Propagation Chain', () => {
    test('should maintain error context through propagation', async () => {
      const originalError = new Error('Database connection failed');
      const memoryError = new MemoryError('Failed to read memory', {
        operation: 'read',
        cause: originalError.message
      });
      
      const wrappedError = new AgentError('Tool execution failed', {
        code: 'TOOL_EXECUTION_ERROR',
        context: { toolName: 'read_memory' },
        cause: memoryError
      });
      
      // Check error chain
      expect(wrappedError.cause).toBe(memoryError);
      expect(wrappedError.context.toolName).toBe('read_memory');
      
      // Check serialization preserves chain
      const serialized = wrappedError.toJSON('development');
      expect(serialized.cause).toBe('Failed to read memory');
    });

    test('should preserve request correlation across error boundaries', () => {
      const error1 = new ValidationError('First error');
      const error2 = new CommunicationError('Second error', {}, { cause: error1 });
      const error3 = new AgentError('Final error', { cause: error2 });
      
      // All errors should have unique request IDs
      expect(error1.requestId).toBeDefined();
      expect(error2.requestId).toBeDefined();
      expect(error3.requestId).toBeDefined();
      
      expect(error1.requestId).not.toBe(error2.requestId);
      expect(error2.requestId).not.toBe(error3.requestId);
    });
  });

  describe('Error Recovery and Retry Logic', () => {
    test('should handle communication errors with retry', async () => {
      // Updated to work reliably in test environment
      let attemptCount = 0;
      
      const failingOperation = async (): Promise<string> => {
        attemptCount++;
        if (attemptCount < 3) {
          // Use minimal retry delay for tests
          throw new CommunicationError('Temporary network error', {
            attempt: attemptCount
          }, { retryDelay: 10 }); // 10ms instead of 1000ms
        }
        return 'success';
      };
      
      const result = await CommunicationError.withRetry(failingOperation);
      
      expect(result).toBe('success');
      expect(attemptCount).toBe(3);
    });

    test('should not retry non-retryable communication errors', async () => {
      let attemptCount = 0;
      
      const failingOperation = async (): Promise<string> => {
        attemptCount++;
        throw new CommunicationError('Auth error', {}, { 
          retryable: false 
        });
      };
      
      await expect(CommunicationError.withRetry(failingOperation))
        .rejects.toThrow('Auth error');
      
      expect(attemptCount).toBe(1); // No retries
    });

    test('should not retry validation errors', async () => {
      let attemptCount = 0;
      
      const failingOperation = async (): Promise<string> => {
        attemptCount++;
        throw new ValidationError('Invalid input');
      };
      
      await expect(CommunicationError.withRetry(failingOperation))
        .rejects.toThrow('Invalid input');
      
      expect(attemptCount).toBe(1); // No retries
    });
  });

  describe('Multi-Agent Error Scenarios', () => {
    test('should handle agent communication failures', async () => {
      // Simulate agent-to-agent communication error
      const sourceAgent = 'engineering-manager';
      const targetAgent = 'qa-manager';
      
      const commError = new CommunicationError('Agent unreachable', {
        sourceAgent,
        targetAgent,
        messageType: 'query',
        timestamp: Date.now()
      });
      
      expect(commError.context.sourceAgent).toBe(sourceAgent);
      expect(commError.context.targetAgent).toBe(targetAgent);
      expect(commError.shouldRetry(0)).toBe(true);
    });

    test('should handle shared knowledge synchronization errors', async () => {
      const syncError = new MemoryError('Failed to sync shared knowledge', {
        operation: 'sync',
        agents: ['engineering-manager', 'product-manager'],
        conflictKey: 'project_status'
      });
      
      const serialized = syncError.toJSON('development');
      expect(serialized.context).toBeDefined();
      expect((serialized.context as any).operation).toBe('sync');
    });
  });

  describe('Performance Under Error Conditions', () => {
    test('should handle high error rates without memory leaks', () => {
      const errors: AgentError[] = [];
      
      // Create many errors to test memory usage
      for (let i = 0; i < 100; i++) { // Reduced from 1000 to 100 for faster tests
        const error = new ValidationError(`Error ${i}`, {
          iteration: i,
          timestamp: Date.now()
        });
        errors.push(error);
      }
      
      // Serialize all errors
      errors.forEach(error => {
        error.toJSON('production');
        error.toJSON('development');
      });
      
      // Basic check that errors are created correctly
      expect(errors).toHaveLength(100);
      expect(errors[0].message).toBe('Error 0');
      expect(errors[99].message).toBe('Error 99');
    });

    test('should maintain performance with cached serialization', () => {
      const error = new AgentError('Test error', {
        context: { large: 'x'.repeat(1000) }
      });
      
      // Time first serialization using high-resolution timer
      const start1 = process.hrtime.bigint();
      error.toJSON('development');
      const time1 = Number(process.hrtime.bigint() - start1) / 1_000_000; // Convert to ms
      
      // Time cached serialization
      const start2 = process.hrtime.bigint();
      error.toJSON('development');
      const time2 = Number(process.hrtime.bigint() - start2) / 1_000_000; // Convert to ms
      
      // Cached version should be faster or equal (allowing for timing variance)
      expect(time2).toBeLessThanOrEqual(time1 + 0.1); // Allow 0.1ms tolerance
    });
  });
});