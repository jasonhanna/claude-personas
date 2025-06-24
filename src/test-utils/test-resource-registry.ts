/**
 * Test Resource Registry - Specialized resource management for test environments
 * Extends the core ResourceRegistry with test-specific features and safeguards
 */

import { ResourceRegistry, GlobalResourceRegistry } from '../resource-registry.js';
import { BaseAgentServer } from '../base-agent-server.js';
import { MessageBroker } from '../messaging/message-broker.js';
import { ConnectionManager } from '../messaging/connection-manager.js';
import { AgentOrchestrator } from '../orchestrator.js';

export interface TestResourceOptions {
  name?: string;
  testSuite?: string;
  timeout?: number;
  autoCleanup?: boolean;
}

export interface TestResourceStats {
  totalResources: number;
  byType: Record<string, number>;
  byTestSuite: Record<string, number>;
  longestRunning: { id: string; duration: number } | null;
}

/**
 * Test-specific resource registry with enhanced tracking and automatic cleanup
 */
export class TestResourceRegistry extends ResourceRegistry {
  private testStartTime = Date.now();
  private testSuite: string;
  private autoCleanupEnabled = true;
  private resourceMetadata = new Map<string, {
    testSuite: string;
    createdAt: number;
    options: TestResourceOptions;
  }>();

  constructor(testSuite: string, autoCleanup = true) {
    super(`Test-${testSuite}`);
    this.testSuite = testSuite;
    this.autoCleanupEnabled = autoCleanup;
  }

  /**
   * Register a BaseAgentServer for test cleanup
   */
  registerAgentServer(server: BaseAgentServer, options: TestResourceOptions = {}): string {
    const resourceId = this.registerResource(
      server,
      async () => {
        try {
          await server.stop();
        } catch (error) {
          console.warn(`Failed to stop agent server in test cleanup:`, error);
        }
      },
      { name: options.name || 'agent-server', component: this.testSuite }
    );

    this.resourceMetadata.set(resourceId, {
      testSuite: this.testSuite,
      createdAt: Date.now(),
      options
    });

    return resourceId;
  }

  /**
   * Register a MessageBroker for test cleanup
   */
  registerMessageBroker(broker: MessageBroker, options: TestResourceOptions = {}): string {
    const resourceId = this.registerResource(
      broker,
      async () => {
        try {
          await broker.stop();
        } catch (error) {
          console.warn(`Failed to stop message broker in test cleanup:`, error);
        }
      },
      { name: options.name || 'message-broker', component: this.testSuite }
    );

    this.resourceMetadata.set(resourceId, {
      testSuite: this.testSuite,
      createdAt: Date.now(),
      options
    });

    return resourceId;
  }

  /**
   * Register a ConnectionManager for test cleanup
   */
  registerConnectionManager(manager: ConnectionManager, options: TestResourceOptions = {}): string {
    const resourceId = this.registerResource(
      manager,
      async () => {
        try {
          await manager.stop();
        } catch (error) {
          console.warn(`Failed to stop connection manager in test cleanup:`, error);
        }
      },
      { name: options.name || 'connection-manager', component: this.testSuite }
    );

    this.resourceMetadata.set(resourceId, {
      testSuite: this.testSuite,
      createdAt: Date.now(),
      options
    });

    return resourceId;
  }

  /**
   * Register an AgentOrchestrator for test cleanup
   */
  registerOrchestrator(orchestrator: AgentOrchestrator, options: TestResourceOptions = {}): string {
    const resourceId = this.registerResource(
      orchestrator,
      async () => {
        try {
          await orchestrator.shutdown();
        } catch (error) {
          console.warn(`Failed to shutdown orchestrator in test cleanup:`, error);
        }
      },
      { name: options.name || 'orchestrator', component: this.testSuite }
    );

    this.resourceMetadata.set(resourceId, {
      testSuite: this.testSuite,
      createdAt: Date.now(),
      options
    });

    return resourceId;
  }

  /**
   * Register a test timer with automatic cleanup
   */
  registerTestTimer(timer: NodeJS.Timeout, options: TestResourceOptions = {}): string {
    const resourceId = this.registerTimer(timer, {
      name: options.name || 'test-timer',
      component: this.testSuite
    });

    this.resourceMetadata.set(resourceId, {
      testSuite: this.testSuite,
      createdAt: Date.now(),
      options
    });

    return resourceId;
  }

  /**
   * Register a test interval with automatic cleanup
   */
  registerTestInterval(interval: NodeJS.Timeout, options: TestResourceOptions = {}): string {
    const resourceId = this.registerInterval(interval, {
      name: options.name || 'test-interval',
      component: this.testSuite
    });

    this.resourceMetadata.set(resourceId, {
      testSuite: this.testSuite,
      createdAt: Date.now(),
      options
    });

    return resourceId;
  }

  /**
   * Get detailed resource statistics for test analysis
   */
  getTestResourceStats(): TestResourceStats {
    const counts = this.getResourceCounts();
    const byTestSuite: Record<string, number> = {};
    let longestRunning: { id: string; duration: number } | null = null;
    const currentTime = Date.now();

    for (const [id, metadata] of this.resourceMetadata) {
      const testSuite = metadata.testSuite;
      byTestSuite[testSuite] = (byTestSuite[testSuite] || 0) + 1;

      const duration = currentTime - metadata.createdAt;
      if (!longestRunning || duration > longestRunning.duration) {
        longestRunning = { id, duration };
      }
    }

    return {
      totalResources: counts.total,
      byType: {
        timers: counts.timers,
        intervals: counts.intervals,
        processes: counts.processes,
        servers: counts.servers,
        resources: counts.resources
      },
      byTestSuite,
      longestRunning
    };
  }

  /**
   * Check for resource leaks (resources running longer than expected)
   */
  checkForLeaks(maxAge = 30000): Array<{ id: string; age: number; metadata: any }> {
    const leaks: Array<{ id: string; age: number; metadata: any }> = [];
    const currentTime = Date.now();

    for (const [id, metadata] of this.resourceMetadata) {
      const age = currentTime - metadata.createdAt;
      if (age > maxAge) {
        leaks.push({ id, age, metadata });
      }
    }

    return leaks;
  }

  /**
   * Emergency cleanup for hanging test resources
   */
  async emergencyCleanup(): Promise<void> {
    console.warn(`[TEST] Emergency cleanup for test suite: ${this.testSuite}`);
    
    try {
      // Force cleanup all resources with shorter timeout
      await Promise.race([
        this.cleanup(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Emergency cleanup timeout')), 5000)
        )
      ]);
    } catch (error) {
      console.error(`[TEST] Emergency cleanup failed for ${this.testSuite}:`, error);
      
      // Try global emergency shutdown as last resort
      try {
        await BaseAgentServer.emergencyShutdown();
      } catch (globalError) {
        console.error(`[TEST] Global emergency shutdown failed:`, globalError);
      }
    }
  }

  /**
   * Override cleanup to include metadata cleanup
   */
  async cleanup(): Promise<void> {
    try {
      await super.cleanup();
    } finally {
      this.resourceMetadata.clear();
    }
  }
}

/**
 * Global test resource coordinator for managing test isolation
 */
export class TestResourceCoordinator {
  private static instance: TestResourceCoordinator;
  private testRegistries = new Map<string, TestResourceRegistry>();
  private currentTest: string | null = null;

  private constructor() {}

  static getInstance(): TestResourceCoordinator {
    if (!TestResourceCoordinator.instance) {
      TestResourceCoordinator.instance = new TestResourceCoordinator();
    }
    return TestResourceCoordinator.instance;
  }

  /**
   * Start a new test and get its resource registry
   */
  startTest(testName: string, autoCleanup = true): TestResourceRegistry {
    if (this.testRegistries.has(testName)) {
      console.warn(`[TEST] Test ${testName} already started, returning existing registry`);
      return this.testRegistries.get(testName)!;
    }

    const registry = new TestResourceRegistry(testName, autoCleanup);
    this.testRegistries.set(testName, registry);
    this.currentTest = testName;

    return registry;
  }

  /**
   * End a test and cleanup its resources
   */
  async endTest(testName: string): Promise<void> {
    const registry = this.testRegistries.get(testName);
    if (!registry) {
      console.warn(`[TEST] No registry found for test: ${testName}`);
      return;
    }

    try {
      await registry.cleanup();
    } catch (error) {
      console.error(`[TEST] Failed to cleanup test ${testName}:`, error);
      
      // Try emergency cleanup
      try {
        await registry.emergencyCleanup();
      } catch (emergencyError) {
        console.error(`[TEST] Emergency cleanup failed for ${testName}:`, emergencyError);
      }
    } finally {
      this.testRegistries.delete(testName);
      if (this.currentTest === testName) {
        this.currentTest = null;
      }
    }
  }

  /**
   * Get the current test's resource registry
   */
  getCurrentRegistry(): TestResourceRegistry | null {
    return this.currentTest ? this.testRegistries.get(this.currentTest) || null : null;
  }

  /**
   * Get resource statistics for all active tests
   */
  getAllTestStats(): Record<string, TestResourceStats> {
    const stats: Record<string, TestResourceStats> = {};
    
    for (const [testName, registry] of this.testRegistries) {
      stats[testName] = registry.getTestResourceStats();
    }
    
    return stats;
  }

  /**
   * Emergency cleanup for all tests
   */
  async emergencyCleanupAll(): Promise<void> {
    console.warn(`[TEST] Emergency cleanup for all tests`);
    
    const cleanupPromises = Array.from(this.testRegistries.entries()).map(
      async ([testName, registry]) => {
        try {
          await registry.emergencyCleanup();
        } catch (error) {
          console.error(`[TEST] Emergency cleanup failed for ${testName}:`, error);
        }
      }
    );

    await Promise.allSettled(cleanupPromises);
    
    // Clear all registries
    this.testRegistries.clear();
    this.currentTest = null;

    // Global emergency shutdown as final resort
    try {
      const globalRegistry = GlobalResourceRegistry.getInstance();
      await globalRegistry.cleanupAll();
    } catch (error) {
      console.error(`[TEST] Global registry cleanup failed:`, error);
    }
  }

  /**
   * Check for resource leaks across all tests
   */
  checkForGlobalLeaks(maxAge = 30000): Record<string, Array<{ id: string; age: number; metadata: any }>> {
    const leaks: Record<string, Array<{ id: string; age: number; metadata: any }>> = {};
    
    for (const [testName, registry] of this.testRegistries) {
      const testLeaks = registry.checkForLeaks(maxAge);
      if (testLeaks.length > 0) {
        leaks[testName] = testLeaks;
      }
    }
    
    return leaks;
  }
}

/**
 * Jest setup helper for automatic resource management
 */
export function setupTestResourceManagement() {
  const coordinator = TestResourceCoordinator.getInstance();
  
  // Global setup
  beforeAll(() => {
    // Silence resource registry events in tests unless debugging
    if (!process.env.DEBUG_TEST_RESOURCES) {
      const originalConsoleLog = console.log;
      console.log = (...args: any[]) => {
        const message = args.join(' ');
        if (!message.includes('[ResourceRegistry]') && !message.includes('[TEST]')) {
          originalConsoleLog(...args);
        }
      };
    }
  });

  // Per-test setup
  beforeEach(function() {
    // Get test name from Jest context
    const testName = expect.getState().currentTestName || 'unknown-test';
    const registry = coordinator.startTest(testName);
    
    // Make registry available to test
    (global as any).testRegistry = registry;
  });

  // Per-test cleanup
  afterEach(async function() {
    const testName = expect.getState().currentTestName || 'unknown-test';
    
    try {
      await coordinator.endTest(testName);
    } catch (error) {
      console.error(`[TEST] Failed to cleanup test ${testName}:`, error);
    }
    
    // Clear global registry reference
    delete (global as any).testRegistry;
  });

  // Global cleanup
  afterAll(async () => {
    // Check for any remaining leaks
    const leaks = coordinator.checkForGlobalLeaks();
    if (Object.keys(leaks).length > 0) {
      console.warn(`[TEST] Resource leaks detected:`, leaks);
    }
    
    // Emergency cleanup if needed
    try {
      await coordinator.emergencyCleanupAll();
    } catch (error) {
      console.error(`[TEST] Final cleanup failed:`, error);
    }
  });
}

/**
 * Helper to get the current test's resource registry
 */
export function getTestRegistry(): TestResourceRegistry {
  const registry = (global as any).testRegistry;
  if (!registry) {
    throw new Error('Test registry not available. Make sure setupTestResourceManagement() is called.');
  }
  return registry;
}

/**
 * Utility for creating test-managed timeouts
 */
export function createTestTimeout(callback: () => void, delay: number): NodeJS.Timeout {
  const timeout = setTimeout(callback, delay);
  const registry = getTestRegistry();
  registry.registerTestTimer(timeout, { name: 'test-timeout' });
  return timeout;
}

/**
 * Utility for creating test-managed intervals
 */
export function createTestInterval(callback: () => void, interval: number): NodeJS.Timeout {
  const intervalId = setInterval(callback, interval);
  const registry = getTestRegistry();
  registry.registerTestInterval(intervalId, { name: 'test-interval' });
  return intervalId;
}