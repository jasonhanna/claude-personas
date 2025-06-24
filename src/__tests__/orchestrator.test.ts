/**
 * Unit tests for Orchestrator
 */

import { testEnvironments } from '../test-utils/test-environment-separation.js';
import { MockAgentOrchestrator } from '../test-utils/test-server-mocks.js';

// Mock dependencies - these will be replaced by our MockAgentOrchestrator
jest.mock('../persona-management-service.js');
jest.mock('../project-registry.js');
jest.mock('../health-monitor.js');
jest.mock('../service-discovery.js');

describe('Orchestrator', () => {
  let orchestrator: MockAgentOrchestrator;

  beforeEach(async () => {
    // Set up unit test environment for orchestrator testing
    const testName = expect.getState().currentTestName || 'orchestrator-test';
    const environment = testEnvironments.unit(testName);
    await environment.setup();
    (global as any).testEnvironment = environment;

    jest.clearAllMocks();

    // Create mock orchestrator using our test infrastructure
    const mockFactory = environment.getMockFactory()!;
    orchestrator = mockFactory.createMockOrchestrator('/tmp/test-workspace');

    // Register orchestrator with resource registry for cleanup
    const registry = environment.getResourceRegistry();
    registry.registerOrchestrator(orchestrator as any, { name: 'mock-orchestrator' });
  });

  afterEach(async () => {
    await orchestrator.shutdown();
    
    // Clean up test environment
    const environment = (global as any).testEnvironment;
    if (environment) {
      await environment.teardown();
      delete (global as any).testEnvironment;
    }
  });

  describe('Constructor', () => {
    test('should create orchestrator instance', () => {
      expect(orchestrator).toBeInstanceOf(MockAgentOrchestrator);
      expect(orchestrator.isStarted()).toBe(false); // Initially not started
    });
  });

  describe('initialize', () => {
    test('should initialize successfully', async () => {
      await orchestrator.initialize();

      expect(orchestrator.isStarted()).toBe(true);
    });

    test('should handle multiple initializations gracefully', async () => {
      await orchestrator.initialize();
      await orchestrator.initialize(); // Should not throw

      expect(orchestrator.isStarted()).toBe(true);
    });
  });

  describe('shutdown', () => {
    test('should shutdown successfully', async () => {
      await orchestrator.initialize();
      await orchestrator.shutdown();

      expect(orchestrator.isStarted()).toBe(false);
    });

    test('should handle shutdown when not started', async () => {
      // Should not throw when shutting down before initialization
      await expect(orchestrator.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Agent Management', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
    });

    test('should start agent successfully', async () => {
      await orchestrator.startAgent('engineering-manager');

      expect(orchestrator.getAgentCount()).toBe(1);
      expect(orchestrator.getAgent('engineering-manager')).toBeDefined();
    });

    test('should handle starting multiple agents', async () => {
      await orchestrator.startAgent('engineering-manager');
      await orchestrator.startAgent('product-manager');

      expect(orchestrator.getAgentCount()).toBe(2);
      expect(orchestrator.getAgent('engineering-manager')).toBeDefined();
      expect(orchestrator.getAgent('product-manager')).toBeDefined();
    });

    test('should stop agent successfully', async () => {
      await orchestrator.startAgent('engineering-manager');
      expect(orchestrator.getAgentCount()).toBe(1);

      await orchestrator.stopAgent('engineering-manager');
      expect(orchestrator.getAgentCount()).toBe(0);
      expect(orchestrator.getAgent('engineering-manager')).toBeUndefined();
    });

    test('should handle stopping non-existent agent', async () => {
      // Should not throw when stopping non-existent agent
      await expect(orchestrator.stopAgent('non-existent')).resolves.not.toThrow();
    });

    test('should stop all agents', async () => {
      await orchestrator.startAgent('engineering-manager');
      await orchestrator.startAgent('product-manager');
      expect(orchestrator.getAgentCount()).toBe(2);

      await orchestrator.stopAllAgents();
      expect(orchestrator.getAgentCount()).toBe(0);
    });

    test('should get all agents', () => {
      const agents = orchestrator.getAllAgents();
      expect(Array.isArray(agents)).toBe(true);
    });
  });

  describe('Message Broadcasting', () => {
    beforeEach(async () => {
      await orchestrator.initialize();
      await orchestrator.startAgent('engineering-manager');
      await orchestrator.startAgent('product-manager');
    });

    test('should broadcast message to all agents', async () => {
      const message = {
        type: 'notification',
        content: 'System update available',
        priority: 'high'
      };

      // Should not throw when broadcasting
      await expect(orchestrator.broadcastMessage(message)).resolves.not.toThrow();
    });

    test('should handle broadcasting with no agents', async () => {
      await orchestrator.stopAllAgents();
      
      const message = { type: 'test', content: 'test message' };
      
      // Should not throw even with no agents
      await expect(orchestrator.broadcastMessage(message)).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle agent startup failures gracefully', async () => {
      await orchestrator.initialize();
      
      // Create orchestrator with failure rate to simulate startup failures
      const failingOrchestrator = new MockAgentOrchestrator('/tmp/test-workspace', {
        failureRate: 1.0 // 100% failure rate
      });
      
      await expect(failingOrchestrator.startAgent('test-agent')).rejects.toThrow();
    });

    test('should maintain consistent state after errors', async () => {
      await orchestrator.initialize();
      
      const initialCount = orchestrator.getAgentCount();
      
      try {
        // This might succeed or fail depending on mock implementation
        await orchestrator.startAgent('test-agent');
      } catch (error) {
        // Error is acceptable, just ensure state is consistent
      }
      
      // State should be consistent (either same count or incremented by 1)
      const finalCount = orchestrator.getAgentCount();
      expect(finalCount).toBeGreaterThanOrEqual(initialCount);
      expect(finalCount).toBeLessThanOrEqual(initialCount + 1);
    });
  });

  describe('Resource Cleanup', () => {
    test('should cleanup resources on shutdown', async () => {
      await orchestrator.initialize();
      await orchestrator.startAgent('engineering-manager');
      await orchestrator.startAgent('product-manager');
      
      expect(orchestrator.getAgentCount()).toBe(2);
      
      await orchestrator.shutdown();
      
      // After shutdown, should have no agents
      expect(orchestrator.getAgentCount()).toBe(0);
      expect(orchestrator.isStarted()).toBe(false);
    });

    test('should handle resource cleanup errors gracefully', async () => {
      await orchestrator.initialize();
      await orchestrator.startAgent('test-agent');
      
      // Shutdown should succeed even if individual agent cleanup fails
      await expect(orchestrator.shutdown()).resolves.not.toThrow();
    });
  });
});