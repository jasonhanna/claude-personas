/**
 * Unit tests for Message Broker
 */

import { testEnvironments } from '../../test-utils/test-environment-separation.js';
import { MessageBroker, BrokerMessage } from '../../messaging/message-broker.js';
import { MockTransport, createTestMessageBroker, testAssertions } from '../../test-utils/index.js';

describe('Message Broker', () => {
  let broker: MessageBroker;
  let mockDatabase: any;
  let mockTransport: MockTransport;

  beforeEach(async () => {
    // Set up unit test environment for message broker testing
    const testName = expect.getState().currentTestName || 'message-broker-test';
    const environment = testEnvironments.unit(testName);
    await environment.setup();
    (global as any).testEnvironment = environment;

    const testSetup = createTestMessageBroker();
    broker = testSetup.broker;
    mockDatabase = testSetup.database;
    mockTransport = new MockTransport();
    
    // Register with resource registry for cleanup
    const registry = environment.getResourceRegistry();
    registry.registerResource(broker, async () => {
      await broker.stop();
    }, { name: 'message-broker' });
    registry.registerResource(mockTransport, async () => {
      await mockTransport.disconnect();
    }, { name: 'mock-transport' });
    
    await broker.start();
    broker.registerTransport('test', mockTransport);
    await mockTransport.connect();
  });

  afterEach(async () => {
    await broker.stop();
    await mockTransport.disconnect();
    mockDatabase.reset();
    
    // Clean up test environment
    const environment = (global as any).testEnvironment;
    if (environment) {
      await environment.teardown();
      delete (global as any).testEnvironment;
    }
  });

  describe('Message Creation', () => {
    test('should create valid notification message', async () => {
      const content = { action: 'test', data: 'hello' };
      
      await broker.sendMessage('target-agent', 'notification', content);
      
      const messages = mockDatabase.getTable('messages');
      expect(messages).toHaveLength(1);
      
      const message = messages[0];
      testAssertions.validMessage(message, 'database');
      expect(message.to_agent).toBe('target-agent');
      expect(message.type).toBe('notification');
      expect(JSON.parse(message.content)).toEqual(content);
    });

    test('should assign unique IDs to messages', async () => {
      await broker.sendMessage('agent-1', 'notification', { test: 1 });
      await broker.sendMessage('agent-2', 'notification', { test: 2 });
      
      const messages = mockDatabase.getTable('messages');
      expect(messages).toHaveLength(2);
      expect(messages[0].id).not.toBe(messages[1].id);
    });

    test('should set default priority and retry settings', async () => {
      await broker.sendMessage('target-agent', 'notification', { test: true });
      
      const messages = mockDatabase.getTable('messages');
      const message = messages[0];
      
      expect(message.priority).toBe('normal');
      expect(message.retry_count).toBe(0);
      expect(message.max_retries).toBeGreaterThan(0);
    });
  });

  describe('Message Options', () => {
    test('should apply custom message options', async () => {
      const options = {
        priority: 'high' as const,
        timeout: 10000,
        retries: 5,
        correlationId: 'test-correlation-123',
        metadata: { source: 'test' }
      };
      
      await broker.sendMessage('target-agent', 'notification', { test: true }, options);
      
      const messages = mockDatabase.getTable('messages');
      const message = messages[0];
      
      expect(message.priority).toBe('high');
      expect(message.max_retries).toBe(5);
      expect(message.correlation_id).toBe('test-correlation-123');
      expect(JSON.parse(message.metadata)).toEqual({ source: 'test' });
    });

    test('should handle empty options', async () => {
      await broker.sendMessage('target-agent', 'notification', { test: true }, {});
      
      const messages = mockDatabase.getTable('messages');
      expect(messages).toHaveLength(1);
      expect(messages[0].priority).toBe('normal');
    });
  });

  describe('Transport Integration', () => {
    test('should send message through registered transport', async () => {
      const content = { action: 'test' };
      
      await broker.sendMessage('target-agent', 'notification', content);
      
      const sentMessages = mockTransport.getSentMessages();
      expect(sentMessages).toHaveLength(1);
      
      const transportMessage = sentMessages[0];
      expect(transportMessage.to).toBe('target-agent');
      expect(transportMessage.type).toBe('notification');
      expect(transportMessage.content).toEqual(content);
    });

    test('should handle transport failure gracefully', async () => {
      // Make transport unhealthy to simulate failure
      mockTransport.setHealthy(false);
      
      // Sending should not throw but message should still be persisted
      await expect(broker.sendMessage('target-agent', 'notification', { test: true }))
        .rejects.toThrow();
      
      // Message should still be persisted in database
      const messages = mockDatabase.getTable('messages');
      expect(messages).toHaveLength(1);
    });

    test('should handle multiple transports', async () => {
      const mockTransport2 = new MockTransport();
      await mockTransport2.connect();
      broker.registerTransport('test2', mockTransport2);
      
      // Make first transport fail
      mockTransport.setHealthy(false);
      
      await broker.sendMessage('target-agent', 'notification', { test: true });
      
      // Check that messages were sent correctly
      const sent1 = mockTransport.getSentMessages();
      const sent2 = mockTransport2.getSentMessages();
      
      // First transport should have tried but failed (no message stored)
      expect(sent1).toHaveLength(0); 
      // Second transport should have succeeded 
      expect(sent2).toHaveLength(1);
    });
  });

  describe('Request-Response Pattern', () => {
    test('should handle request-response flow', async () => {
      const request = { query: 'status' };
      const response = { status: 'healthy' };
      
      // Simulate response by having transport trigger a response message
      const responsePromise = broker.requestResponse('target-agent', request);
      
      // Simulate incoming response after a delay
      setTimeout(() => {
        const sentMessages = mockTransport.getSentMessages();
        const requestMessage = sentMessages[0];
        
        // Simulate response message coming back
        mockTransport.simulateReceiveMessage({
          id: 'response-123',
          from: 'target-agent',
          to: requestMessage.from,
          type: 'response',
          content: response,
          timestamp: Date.now(),
          correlationId: requestMessage.correlationId,
          metadata: {}
        });
      }, 10);
      
      const result = await responsePromise;
      expect(result).toEqual(response);
    });

    test('should timeout request when no response received', async () => {
      const request = { query: 'status' };
      
      await expect(
        broker.requestResponse('target-agent', request, { timeout: 100 })
      ).rejects.toThrow('Request timeout');
    });
  });

  describe('Message Handlers', () => {
    test('should route messages to registered handlers', async () => {
      const handlerCalls: BrokerMessage[] = [];
      
      broker.registerHandler('target-agent', async (message) => {
        handlerCalls.push(message);
      });
      
      // Simulate incoming message
      mockTransport.simulateReceiveMessage({
        id: 'incoming-123',
        from: 'source-agent',
        to: 'target-agent',
        type: 'notification',
        content: { action: 'test' },
        timestamp: Date.now(),
        metadata: {}
      });
      
      // Give handler time to process
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(handlerCalls).toHaveLength(1);
      expect(handlerCalls[0].to).toBe('target-agent');
    });

    test('should handle wildcard pattern', async () => {
      const handlerCalls: BrokerMessage[] = [];
      
      broker.registerHandler('*', async (message) => {
        handlerCalls.push(message);
      });
      
      // Simulate incoming message
      mockTransport.simulateReceiveMessage({
        id: 'incoming-123',
        from: 'source-agent',
        to: 'any-agent',
        type: 'notification',
        content: { action: 'test' },
        timestamp: Date.now(),
        metadata: {}
      });
      
      // Give handler time to process
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(handlerCalls).toHaveLength(1);
    });
  });

  describe('Database Persistence', () => {
    test('should persist messages to database', async () => {
      await broker.sendMessage('target-agent', 'notification', { test: true });
      
      const messages = mockDatabase.getTable('messages');
      expect(messages).toHaveLength(1);
      
      const message = messages[0];
      expect(message.to_agent).toBe('target-agent');
      expect(message.from_agent).toBe('current-agent'); // Default sender
    });

    test('should handle database errors gracefully', async () => {
      // Close database to simulate error
      await mockDatabase.close();
      
      await expect(
        broker.sendMessage('target-agent', 'notification', { test: true })
      ).rejects.toThrow();
    });
  });

  describe('Cleanup and Lifecycle', () => {
    test('should start and stop cleanly', async () => {
      const newBroker = createTestMessageBroker().broker;
      
      await newBroker.start();
      expect(newBroker).toBeDefined();
      
      await newBroker.stop();
      // Should not throw on double stop
      await newBroker.stop();
    });

    test('should not start twice', async () => {
      await broker.start(); // Already started in beforeEach
      // Should not throw on double start
      await broker.start();
    });
  });
});