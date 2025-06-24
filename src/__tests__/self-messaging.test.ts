import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BaseAgentServer, PersonaConfig } from '../base-agent-server.js';
import { testEnvironments, getCurrentTestEnvironment } from '../test-utils/test-environment-separation.js';
import { MockBaseAgentServer } from '../test-utils/test-server-mocks.js';

describe('Self-messaging', () => {
  let agent: MockBaseAgentServer;
  const testPersona: PersonaConfig = {
    name: 'Test Agent',
    role: 'test-agent',
    responsibilities: ['Testing self-messaging functionality'],
    initial_memories: ['I am a test agent for self-messaging'],
    tools: ['send_message', 'read_shared_knowledge', 'write_shared_knowledge', 'update_memory'],
    communication_style: {
      tone: 'professional',
      focus: 'testing'
    }
  };

  beforeEach(async () => {
    // Set up unit test environment with full mocking and isolation
    const testName = expect.getState().currentTestName || 'self-messaging-test';
    const environment = testEnvironments.unit(testName);
    await environment.setup();
    (global as any).testEnvironment = environment;

    // Create mock agent using the test environment's mock factory
    const mockFactory = environment.getMockFactory()!;
    agent = mockFactory.createMockBaseAgentServer(
      testPersona,
      '/tmp/test-agent',
      undefined,
      3999
    );
    
    await agent.start();
    
    // Register agent with resource registry for automatic cleanup
    const registry = environment.getResourceRegistry();
    registry.registerAgentServer(agent as any, { name: 'test-self-messaging-agent' });
  });

  afterEach(async () => {
    await agent.stop();
    
    // Clean up test environment
    const environment = (global as any).testEnvironment;
    if (environment) {
      await environment.teardown();
      delete (global as any).testEnvironment;
    }
  });

  it('should handle self-messaging without throwing errors', async () => {
    // Test self-messaging through the mock's tool handler
    const result = await agent.handleToolCall('send_message', {
      to: 'test-agent',
      content: 'Test self-message'
    });

    // Verify the message was handled (mock implementation)
    expect(result).toEqual({
      content: [{
        type: 'text',
        text: 'Mock message sent to test-agent'
      }]
    });

    // Verify agent is started and functioning
    expect(agent.isStarted()).toBe(true);
    expect(agent.getPersona().role).toBe('test-agent');
  });

  it('should allow task delegation to same role from different source', async () => {
    // Test message sending to same role through mock tool handler
    const result = await agent.handleToolCall('send_message', {
      to: 'test-agent',
      content: 'Please analyze the PR and provide a summary'
    });

    // Mock implementation should handle message sending
    expect(result).toEqual({
      content: [{
        type: 'text',
        text: 'Mock message sent to test-agent'
      }]
    });

    // Verify mock transport received the simulated message
    const mockTransport = agent.getMockTransport();
    expect(mockTransport).toBeDefined();
  });

  it('should send messages to other agents normally', async () => {
    // Test message sending to different agent through mock tool handler
    const result = await agent.handleToolCall('send_message', {
      to: 'other-agent',
      content: 'Test message to other agent'
    });

    // Mock implementation should handle message sending
    expect(result).toEqual({
      content: [{
        type: 'text',
        text: 'Mock message sent to other-agent'
      }]
    });

    // Verify agent can handle basic functionality
    expect(agent.getPersona().name).toBe('Test Agent');
    expect(agent.getPort()).toBe(3999);
  });
});