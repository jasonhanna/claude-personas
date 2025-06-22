import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BaseAgentServer, PersonaConfig } from '../base-agent-server';

describe('Self-messaging', () => {
  let agent: BaseAgentServer;
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
    agent = new BaseAgentServer(testPersona, '/tmp/test-agent');
    await agent.start();
    
    // Mock the message broker to avoid delivery failures in tests
    const messageBroker = (agent as any).messageBroker;
    jest.spyOn(messageBroker, 'sendMessage').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await agent.stop();
  });

  it('should handle self-messaging without throwing errors', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Access the private method through reflection for testing
    const sendMessage = (agent as any).sendMessage.bind(agent);
    
    const result = await sendMessage({
      from: 'test-agent',
      to: 'test-agent',
      type: 'notification',
      content: 'Test self-message',
      timestamp: Date.now()
    });

    // Verify the message was handled locally
    expect(result).toEqual({
      content: [{
        type: 'text',
        text: 'Message processed locally (self-message)'
      }]
    });

    // Verify the self-message detection log was written
    const logs = consoleSpy.mock.calls.map(call => call[0]);
    const selfMessageLog = logs.find(log => 
      typeof log === 'string' && log.includes('Self-message detected for test-agent')
    );
    expect(selfMessageLog).toBeTruthy();

    consoleSpy.mockRestore();
  });

  it('should allow task delegation to same role from different source', async () => {
    // Access the private method through reflection for testing
    const sendMessage = (agent as any).sendMessage.bind(agent);
    
    const result = await sendMessage({
      from: 'claude-code',  // Different source
      to: 'test-agent',     // Same role as current agent
      type: 'query',
      content: 'Please analyze the PR and provide a summary',
      timestamp: Date.now()
    });

    // Should send the message normally, not handle as self-message
    expect(result).toEqual({
      content: [{
        type: 'text',
        text: 'Message sent to test-agent'
      }]
    });
  });

  it('should send messages to other agents normally', async () => {
    // Access the private method through reflection for testing
    const sendMessage = (agent as any).sendMessage.bind(agent);
    
    const result = await sendMessage({
      from: 'test-agent',
      to: 'other-agent',
      type: 'notification',
      content: 'Test message to other agent',
      timestamp: Date.now()
    });

    // Should get normal success message for non-self messages
    expect(result).toEqual({
      content: [{
        type: 'text',
        text: 'Message sent to other-agent'
      }]
    });
  });
});