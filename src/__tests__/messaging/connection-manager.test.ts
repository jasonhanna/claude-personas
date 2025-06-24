/**
 * Unit tests for Connection Manager
 */

import { testEnvironments } from '../../test-utils/test-environment-separation.js';
import { ConnectionManager, AgentEndpoint } from '../../messaging/connection-manager.js';
import { MockTransport, createTestConnectionManager, createTestAgentEndpoints, testAssertions } from '../../test-utils/index.js';

describe('Connection Manager', () => {
  let connectionManager: ConnectionManager;
  let mockDependencies: any;
  let mockTransport: MockTransport;

  beforeEach(async () => {
    // Set up unit test environment for connection manager testing
    const testName = expect.getState().currentTestName || 'connection-manager-test';
    const environment = testEnvironments.unit(testName);
    await environment.setup();
    (global as any).testEnvironment = environment;

    const testSetup = createTestConnectionManager();
    connectionManager = testSetup.connectionManager;
    mockDependencies = testSetup.mockDependencies;
    
    mockTransport = new MockTransport();
    await mockTransport.connect();
    connectionManager.registerTransport('mock', mockTransport);
    
    // Register with resource registry for cleanup
    const registry = environment.getResourceRegistry();
    registry.registerResource(connectionManager, async () => {
      await connectionManager.stop();
    }, { name: 'connection-manager' });
    registry.registerResource(mockTransport, async () => {
      await mockTransport.disconnect();
    }, { name: 'mock-transport' });
  });

  afterEach(async () => {
    await connectionManager.stop();
    await mockTransport.disconnect();
    
    // Clean up test environment
    const environment = (global as any).testEnvironment;
    if (environment) {
      await environment.teardown();
      delete (global as any).testEnvironment;
    }
  });

  describe('Agent Registration', () => {
    test('should register agent endpoint', () => {
      const endpoint: AgentEndpoint = {
        id: 'test-agent',
        role: 'engineering-manager',
        address: 'localhost',
        port: 3001,
        transport: 'mock',
        status: 'healthy',
        lastSeen: Date.now()
      };

      connectionManager.registerAgent(endpoint);
      
      const registered = connectionManager.getAgent('test-agent');
      expect(registered).toBeDefined();
      expect(registered!.id).toBe('test-agent');
      expect(registered!.role).toBe('engineering-manager');
    });

    test('should reject agent without required fields', () => {
      const invalidEndpoint = {
        address: 'localhost',
        port: 3001
        // missing id and role
      } as AgentEndpoint;

      expect(() => {
        connectionManager.registerAgent(invalidEndpoint);
      }).toThrow('Agent endpoint must have id and role');
    });

    test('should update existing agent registration', () => {
      const endpoint: AgentEndpoint = {
        id: 'test-agent',
        role: 'engineering-manager',
        address: 'localhost',
        port: 3001,
        transport: 'mock',
        status: 'healthy',
        lastSeen: Date.now()
      };

      connectionManager.registerAgent(endpoint);
      
      // Update with new port
      const updatedEndpoint = { ...endpoint, port: 3002 };
      connectionManager.registerAgent(updatedEndpoint);
      
      const registered = connectionManager.getAgent('test-agent');
      expect(registered!.port).toBe(3002);
    });
  });

  describe('Agent Queries', () => {
    beforeEach(() => {
      const endpoints = createTestAgentEndpoints();
      endpoints.forEach(endpoint => connectionManager.registerAgent(endpoint));
    });

    test('should get agent by ID', () => {
      const agent = connectionManager.getAgent('test-engineering-manager');
      expect(agent).toBeDefined();
      expect(agent!.role).toBe('engineering-manager');
    });

    test('should get agents by role', () => {
      const engineers = connectionManager.getAgentsByRole('engineering-manager');
      expect(engineers).toHaveLength(1);
      expect(engineers[0].id).toBe('test-engineering-manager');
      
      const productManagers = connectionManager.getAgentsByRole('product-manager');
      expect(productManagers).toHaveLength(1);
      expect(productManagers[0].id).toBe('test-product-manager');
    });

    test('should get healthy agents only', () => {
      const healthyAgents = connectionManager.getHealthyAgents();
      // From test data: engineering-manager and product-manager are healthy, qa-manager is unhealthy
      expect(healthyAgents).toHaveLength(2);
      
      const healthyIds = healthyAgents.map(a => a.id);
      expect(healthyIds).toContain('test-engineering-manager');
      expect(healthyIds).toContain('test-product-manager');
      expect(healthyIds).not.toContain('test-qa-manager');
    });

    test('should get all agents', () => {
      const allAgents = connectionManager.getAllAgents();
      expect(allAgents).toHaveLength(3);
      
      testAssertions.connectionManagerAgents(connectionManager, {
        totalAgents: 3,
        healthyAgents: 2,
        agentsByRole: {
          'engineering-manager': 1,
          'product-manager': 1,
          'qa-manager': 1
        }
      });
    });
  });

  describe('Agent Discovery', () => {
    test('should use custom discovery method', async () => {
      const discoveredAgents: AgentEndpoint[] = [
        {
          id: 'discovered-agent',
          role: 'engineering-manager',
          address: 'localhost',
          port: 3001,
          transport: 'mock',
          status: 'healthy',
          lastSeen: Date.now()
        }
      ];

      mockDependencies.discoveryMethod.mockResolvedValue(discoveredAgents);
      
      await connectionManager.start();
      
      // Give discovery time to run
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockDependencies.discoveryMethod.mock.calls).toHaveLength(1);
      
      const agent = connectionManager.getAgent('discovered-agent');
      expect(agent).toBeDefined();
      expect(agent!.role).toBe('engineering-manager');
    });

    test('should handle discovery errors gracefully', async () => {
      mockDependencies.discoveryMethod.mockRejectedValue(new Error('Discovery failed'));
      
      // Should not throw
      await expect(connectionManager.start()).resolves.not.toThrow();
    });
  });

  describe('Health Monitoring', () => {
    test('should use custom health checker', async () => {
      const endpoint: AgentEndpoint = {
        id: 'test-agent',
        role: 'engineering-manager',
        address: 'localhost',
        port: 3001,
        transport: 'mock',
        status: 'healthy',
        lastSeen: Date.now()
      };

      connectionManager.registerAgent(endpoint);
      mockDependencies.healthChecker.mockResolvedValue({ healthy: false, latency: 100 });
      
      await connectionManager.start();
      
      // Manually trigger health checks
      await connectionManager.runHealthChecks();
      
      expect(mockDependencies.healthChecker.mock.calls.length).toBeGreaterThan(0);
    });

    test('should handle health check errors', async () => {
      const endpoint: AgentEndpoint = {
        id: 'test-agent',
        role: 'engineering-manager',
        address: 'localhost',
        port: 3001,
        transport: 'mock',
        status: 'healthy',
        lastSeen: Date.now()
      };

      connectionManager.registerAgent(endpoint);
      mockDependencies.healthChecker.mockRejectedValue(new Error('Health check failed'));
      
      await connectionManager.start();
      
      // Manually trigger health checks
      await connectionManager.runHealthChecks();
      
      // Should still be running despite health check errors
      expect(connectionManager.getAllAgents()).toHaveLength(1);
    });
  });

  describe('Agent Selection', () => {
    beforeEach(() => {
      const endpoints = createTestAgentEndpoints();
      endpoints.forEach(endpoint => connectionManager.registerAgent(endpoint));
    });

    test('should find best agent for role', async () => {
      const agent = await connectionManager.findBestAgent('engineering-manager');
      expect(agent).toBeDefined();
      expect(agent!.role).toBe('engineering-manager');
      expect(agent!.status).toBe('healthy');
    });

    test('should return null for unavailable role', async () => {
      const agent = await connectionManager.findBestAgent('unknown-role');
      expect(agent).toBeNull();
    });

    test('should filter by metadata criteria', async () => {
      // Add agent with specific metadata
      const endpoint: AgentEndpoint = {
        id: 'special-agent',
        role: 'engineering-manager',
        address: 'localhost',
        port: 3001,
        transport: 'mock',
        status: 'healthy',
        lastSeen: Date.now(),
        metadata: { special: true, version: '2.0' }
      };
      connectionManager.registerAgent(endpoint);

      const agent = await connectionManager.findBestAgent('engineering-manager', {
        metadata: { special: true }
      });
      
      expect(agent).toBeDefined();
      expect(agent!.id).toBe('special-agent');
    });

    test('should fallback to any healthy agent when criteria not met', async () => {
      const agent = await connectionManager.findBestAgent('engineering-manager', {
        metadata: { nonexistent: true }
      });
      
      // Should still return the healthy engineering-manager even though metadata doesn't match
      expect(agent).toBeDefined();
      expect(agent!.role).toBe('engineering-manager');
    });
  });

  describe('Wait for Agent', () => {
    test('should return agent when available', async () => {
      const endpoint: AgentEndpoint = {
        id: 'test-agent',
        role: 'engineering-manager',
        address: 'localhost',
        port: 3001,
        transport: 'mock',
        status: 'healthy',
        lastSeen: Date.now()
      };
      connectionManager.registerAgent(endpoint);

      const agent = await connectionManager.waitForAgent('engineering-manager', 1000);
      expect(agent.id).toBe('test-agent');
    });

    test('should timeout when agent not available', async () => {
      await expect(
        connectionManager.waitForAgent('unknown-role', 100)
      ).rejects.toThrow("Agent with role 'unknown-role' not found within timeout");
    });

    test('should wait for agent to become available', async () => {
      // Start waiting before agent is registered
      const waitPromise = connectionManager.waitForAgent('engineering-manager', 1000);
      
      // Register agent after a delay
      setTimeout(() => {
        const endpoint: AgentEndpoint = {
          id: 'delayed-agent',
          role: 'engineering-manager',
          address: 'localhost',
          port: 3001,
          transport: 'mock',
          status: 'healthy',
          lastSeen: Date.now()
        };
        connectionManager.registerAgent(endpoint);
      }, 50);
      
      const agent = await waitPromise;
      expect(agent.id).toBe('delayed-agent');
    });
  });

  describe('Circuit Breaker', () => {
    test('should track agent failures', () => {
      connectionManager.markAgentFailure('test-agent');
      expect(connectionManager.isCircuitOpen('test-agent')).toBe(false);
      
      // Mark multiple failures to trip circuit breaker
      connectionManager.markAgentFailure('test-agent');
      connectionManager.markAgentFailure('test-agent');
      
      expect(connectionManager.isCircuitOpen('test-agent')).toBe(true);
    });

    test('should mark agent as unhealthy on failure', () => {
      const endpoint: AgentEndpoint = {
        id: 'test-agent',
        role: 'engineering-manager',
        address: 'localhost',
        port: 3001,
        transport: 'mock',
        status: 'healthy',
        lastSeen: Date.now()
      };
      connectionManager.registerAgent(endpoint);

      connectionManager.markAgentFailure('test-agent');
      
      const agent = connectionManager.getAgent('test-agent');
      expect(agent!.status).toBe('unhealthy');
    });
  });

  describe('Lifecycle Management', () => {
    test('should start and stop cleanly', async () => {
      await connectionManager.start();
      await connectionManager.stop();
      
      // Timers should be cleaned up
      expect(mockDependencies.timer.mock.calls.length).toBeGreaterThan(0);
    });

    test('should handle double start/stop', async () => {
      await connectionManager.start();
      await connectionManager.start(); // Should not throw
      
      await connectionManager.stop();
      await connectionManager.stop(); // Should not throw
    });

    test('should unregister agents', () => {
      const endpoint: AgentEndpoint = {
        id: 'test-agent',
        role: 'engineering-manager',
        address: 'localhost',
        port: 3001,
        transport: 'mock',
        status: 'healthy',
        lastSeen: Date.now()
      };
      connectionManager.registerAgent(endpoint);
      
      expect(connectionManager.getAgent('test-agent')).toBeDefined();
      
      connectionManager.unregisterAgent('test-agent');
      
      expect(connectionManager.getAgent('test-agent')).toBeUndefined();
    });
  });
});