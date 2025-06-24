/**
 * Test Isolation Utilities - Comprehensive test boundaries and timeout management
 * Provides utilities to prevent test hanging, ensure proper isolation, and detect resource leaks
 */

import { TestResourceRegistry, getTestRegistry } from './test-resource-registry.js';

export interface TestTimeout {
  id: string;
  startTime: number;
  timeout: number;
  description: string;
  cleanup?: () => Promise<void> | void;
}

export interface TestIsolationOptions {
  timeout?: number;
  enableResourceTracking?: boolean;
  enableHangingDetection?: boolean;
  isolateConsole?: boolean;
  isolateTimers?: boolean;
  cleanupOnFailure?: boolean;
  maxMemoryMB?: number;
}

export interface TestBoundaryResult<T = any> {
  success: boolean;
  result?: T;
  error?: Error;
  duration: number;
  resourcesLeaked: boolean;
  memoryUsed?: number;
  timeouts: TestTimeout[];
}

/**
 * Test isolation manager for comprehensive test boundaries
 */
export class TestIsolationManager {
  private activeTimeouts = new Map<string, TestTimeout>();
  private originalConsole: Record<string, any> = {};
  private originalTimers: Record<string, any> = {};
  private testStartMemory = 0;
  private testId: string;
  private options: Required<TestIsolationOptions>;

  constructor(testId: string, options: TestIsolationOptions = {}) {
    this.testId = testId;
    this.options = {
      timeout: 30000, // 30 seconds default
      enableResourceTracking: true,
      enableHangingDetection: true,
      isolateConsole: false,
      isolateTimers: false,
      cleanupOnFailure: true,
      maxMemoryMB: 100,
      ...options
    };
  }

  /**
   * Run a test function with comprehensive isolation and timeout protection
   */
  async runWithIsolation<T>(
    testFunction: () => Promise<T> | T,
    description = 'Test function'
  ): Promise<TestBoundaryResult<T>> {
    const startTime = Date.now();
    let resourceRegistry: TestResourceRegistry | undefined;

    try {
      // Setup isolation
      await this.setupIsolation();

      // Track test start memory
      if (global.gc) {
        global.gc();
        this.testStartMemory = process.memoryUsage().heapUsed;
      }

      // Get or create resource registry
      if (this.options.enableResourceTracking) {
        try {
          resourceRegistry = getTestRegistry();
        } catch {
          // No global registry available, create local one
          resourceRegistry = new TestResourceRegistry(this.testId);
        }
      }

      // Create timeout protection
      const timeoutPromise = this.createTimeoutProtection(description);

      // Run the test function with timeout protection
      const result = await Promise.race([
        Promise.resolve(testFunction()),
        timeoutPromise
      ]);

      // Check for resource leaks
      const resourcesLeaked = this.checkResourceLeaks(resourceRegistry);

      // Calculate memory usage
      let memoryUsed: number | undefined;
      if (global.gc) {
        global.gc();
        memoryUsed = (process.memoryUsage().heapUsed - this.testStartMemory) / 1024 / 1024; // MB
      }

      return {
        success: true,
        result,
        duration: Date.now() - startTime,
        resourcesLeaked,
        memoryUsed,
        timeouts: Array.from(this.activeTimeouts.values())
      };

    } catch (error) {
      const resourcesLeaked = this.checkResourceLeaks(resourceRegistry);

      // Cleanup on failure if enabled
      if (this.options.cleanupOnFailure && resourceRegistry) {
        try {
          await resourceRegistry.emergencyCleanup();
        } catch (cleanupError) {
          console.warn(`[TestIsolation] Cleanup failed for ${this.testId}:`, cleanupError);
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime,
        resourcesLeaked,
        timeouts: Array.from(this.activeTimeouts.values())
      };

    } finally {
      // Cleanup isolation
      await this.cleanupIsolation();
    }
  }

  /**
   * Create a protected async operation with timeout
   */
  async withTimeout<T>(
    operation: () => Promise<T>,
    timeout: number,
    description: string,
    cleanup?: () => Promise<void> | void
  ): Promise<T> {
    const timeoutId = `timeout-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    
    const timeoutInfo: TestTimeout = {
      id: timeoutId,
      startTime: Date.now(),
      timeout,
      description,
      cleanup
    };

    this.activeTimeouts.set(timeoutId, timeoutInfo);

    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Test timeout: ${description} exceeded ${timeout}ms`));
          }, timeout);
        })
      ]);

      return result;

    } finally {
      this.activeTimeouts.delete(timeoutId);
      if (cleanup) {
        try {
          await cleanup();
        } catch (error) {
          console.warn(`[TestIsolation] Cleanup failed for ${description}:`, error);
        }
      }
    }
  }

  /**
   * Create a hanging detection monitor
   */
  createHangingDetector(
    operation: string,
    maxDuration: number = 5000
  ): { detector: Promise<never>; cancel: () => void } {
    let cancelled = false;
    let timeoutId: NodeJS.Timeout;

    const detector = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        if (!cancelled) {
          reject(new Error(`Hanging detected: ${operation} exceeded ${maxDuration}ms`));
        }
      }, maxDuration);
    });

    const cancel = () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };

    return { detector, cancel };
  }

  /**
   * Monitor memory usage during test execution
   */
  async monitorMemoryUsage<T>(
    operation: () => Promise<T>,
    maxMemoryMB: number = this.options.maxMemoryMB
  ): Promise<T> {
    let initialMemory = 0;
    if (global.gc) {
      global.gc();
      initialMemory = process.memoryUsage().heapUsed;
    }

    const memoryMonitor = setInterval(() => {
      if (global.gc) {
        const currentMemory = process.memoryUsage().heapUsed;
        const memoryUsedMB = (currentMemory - initialMemory) / 1024 / 1024;
        
        if (memoryUsedMB > maxMemoryMB) {
          clearInterval(memoryMonitor);
          throw new Error(`Memory limit exceeded: ${memoryUsedMB.toFixed(2)}MB > ${maxMemoryMB}MB`);
        }
      }
    }, 100);

    try {
      const result = await operation();
      return result;
    } finally {
      clearInterval(memoryMonitor);
    }
  }

  private async setupIsolation(): Promise<void> {
    // Isolate console if requested
    if (this.options.isolateConsole) {
      this.originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info
      };

      // Replace with isolated console
      const isolatedLogs: string[] = [];
      console.log = (...args) => isolatedLogs.push(`LOG: ${args.join(' ')}`);
      console.warn = (...args) => isolatedLogs.push(`WARN: ${args.join(' ')}`);
      console.error = (...args) => isolatedLogs.push(`ERROR: ${args.join(' ')}`);
      console.info = (...args) => isolatedLogs.push(`INFO: ${args.join(' ')}`);
    }

    // Isolate timers if requested
    if (this.options.isolateTimers) {
      this.originalTimers = {
        setTimeout: global.setTimeout,
        setInterval: global.setInterval,
        clearTimeout: global.clearTimeout,
        clearInterval: global.clearInterval
      };

      // Track all timers created during test
      const testTimers = new Set<NodeJS.Timeout>();
      
      global.setTimeout = ((callback: any, delay: number, ...args: any[]) => {
        const timer = this.originalTimers.setTimeout(callback, delay, ...args);
        testTimers.add(timer);
        return timer;
      }) as any;

      global.setInterval = ((callback: any, delay: number, ...args: any[]) => {
        const timer = this.originalTimers.setInterval(callback, delay, ...args);
        testTimers.add(timer);
        return timer;
      }) as any;

      global.clearTimeout = ((timer: any) => {
        testTimers.delete(timer);
        return this.originalTimers.clearTimeout(timer);
      }) as any;

      global.clearInterval = ((timer: any) => {
        testTimers.delete(timer);
        return this.originalTimers.clearInterval(timer);
      }) as any;

      // Store reference for cleanup
      (this as any).testTimers = testTimers;
    }
  }

  private async cleanupIsolation(): Promise<void> {
    // Restore console
    if (this.options.isolateConsole && Object.keys(this.originalConsole).length > 0) {
      Object.assign(console, this.originalConsole);
      this.originalConsole = {};
    }

    // Restore timers and cleanup
    if (this.options.isolateTimers && Object.keys(this.originalTimers).length > 0) {
      const testTimers = (this as any).testTimers as Set<NodeJS.Timeout>;
      
      // Clear all test timers
      if (testTimers) {
        for (const timer of testTimers) {
          try {
            clearTimeout(timer);
            clearInterval(timer);
          } catch (error) {
            // Timer may already be cleared
          }
        }
        testTimers.clear();
      }

      Object.assign(global, this.originalTimers);
      this.originalTimers = {};
    }

    // Clear active timeouts
    for (const timeout of this.activeTimeouts.values()) {
      if (timeout.cleanup) {
        try {
          await timeout.cleanup();
        } catch (error) {
          console.warn(`[TestIsolation] Failed to cleanup timeout ${timeout.id}:`, error);
        }
      }
    }
    this.activeTimeouts.clear();
  }

  private createTimeoutProtection(description: string): Promise<never> {
    return new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Test timeout: ${description} exceeded ${this.options.timeout}ms`));
      }, this.options.timeout);

      // Register timeout for cleanup
      const testTimeout: TestTimeout = {
        id: `test-timeout-${Date.now()}`,
        startTime: Date.now(),
        timeout: this.options.timeout,
        description: `Global test timeout: ${description}`,
        cleanup: () => clearTimeout(timeoutId)
      };

      this.activeTimeouts.set(testTimeout.id, testTimeout);
    });
  }

  private checkResourceLeaks(resourceRegistry?: TestResourceRegistry): boolean {
    if (!this.options.enableResourceTracking || !resourceRegistry) {
      return false;
    }

    const stats = resourceRegistry.getTestResourceStats();
    const leaks = resourceRegistry.checkForLeaks(1000); // 1 second max age for test resources

    if (stats.totalResources > 0 || leaks.length > 0) {
      console.warn(`[TestIsolation] Resource leaks detected in ${this.testId}:`, {
        totalResources: stats.totalResources,
        leaks: leaks.length,
        stats
      });
      return true;
    }

    return false;
  }
}

/**
 * Utility functions for common test isolation patterns
 */
export const testIsolation = {
  /**
   * Run a test with automatic timeout and resource cleanup
   */
  async withBoundaries<T>(
    testFunction: () => Promise<T> | T,
    options: TestIsolationOptions = {}
  ): Promise<T> {
    const testId = `test-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    const manager = new TestIsolationManager(testId, options);
    
    const result = await manager.runWithIsolation(testFunction, 'Test function');
    
    if (!result.success) {
      throw result.error || new Error('Test failed');
    }
    
    if (result.resourcesLeaked) {
      console.warn(`[TestIsolation] Resources leaked during test execution`);
    }
    
    return result.result!;
  },

  /**
   * Create a test with hanging detection
   */
  async withHangingDetection<T>(
    operation: () => Promise<T>,
    maxDuration: number = 5000,
    description = 'Operation'
  ): Promise<T> {
    const testId = `hanging-test-${Date.now()}`;
    const manager = new TestIsolationManager(testId, { enableHangingDetection: true });
    
    return await manager.withTimeout(operation, maxDuration, description);
  },

  /**
   * Create a test with memory monitoring
   */
  async withMemoryMonitoring<T>(
    operation: () => Promise<T>,
    maxMemoryMB: number = 100
  ): Promise<T> {
    const testId = `memory-test-${Date.now()}`;
    const manager = new TestIsolationManager(testId);
    
    return await manager.monitorMemoryUsage(operation, maxMemoryMB);
  },

  /**
   * Create a test with complete isolation (console, timers, resources)
   */
  async withCompleteIsolation<T>(
    testFunction: () => Promise<T> | T,
    timeout: number = 30000
  ): Promise<T> {
    return await testIsolation.withBoundaries(testFunction, {
      timeout,
      enableResourceTracking: true,
      enableHangingDetection: true,
      isolateConsole: true,
      isolateTimers: true,
      cleanupOnFailure: true
    });
  },

  /**
   * Wait for a condition with timeout protection
   */
  async waitFor(
    condition: () => boolean | Promise<boolean>,
    options: {
      timeout?: number;
      interval?: number;
      description?: string;
    } = {}
  ): Promise<void> {
    const {
      timeout = 5000,
      interval = 100,
      description = 'condition'
    } = options;

    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`Timeout waiting for ${description} after ${timeout}ms`);
  },

  /**
   * Retry an operation with exponential backoff
   */
  async retry<T>(
    operation: () => Promise<T>,
    options: {
      maxAttempts?: number;
      initialDelay?: number;
      maxDelay?: number;
      backoffFactor?: number;
      description?: string;
    } = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      initialDelay = 100,
      maxDelay = 5000,
      backoffFactor = 2,
      description = 'operation'
    } = options;

    let lastError: Error;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxAttempts) {
          break;
        }
        
        console.warn(`[TestIsolation] ${description} failed (attempt ${attempt}/${maxAttempts}):`, lastError.message);
        
        await new Promise(resolve => setTimeout(resolve, Math.min(delay, maxDelay)));
        delay *= backoffFactor;
      }
    }
    
    throw new Error(`${description} failed after ${maxAttempts} attempts. Last error: ${lastError!.message}`);
  }
};

/**
 * Jest setup for automatic test isolation
 */
export function setupTestIsolation(options: TestIsolationOptions = {}) {
  let currentManager: TestIsolationManager | null = null;

  beforeEach(function() {
    const testName = expect.getState().currentTestName || 'unknown-test';
    currentManager = new TestIsolationManager(testName, options);
    
    // Make available globally
    (global as any).testIsolation = currentManager;
  });

  afterEach(async function() {
    if (currentManager) {
      try {
        // Force cleanup if test didn't clean up properly
        await (currentManager as any).cleanupIsolation();
      } catch (error) {
        console.warn(`[TestIsolation] Failed to cleanup test isolation:`, error);
      }
      
      currentManager = null;
      delete (global as any).testIsolation;
    }
  });
}

/**
 * Helper to get current test isolation manager
 */
export function getCurrentTestIsolation(): TestIsolationManager {
  const manager = (global as any).testIsolation;
  if (!manager) {
    throw new Error('Test isolation not available. Make sure setupTestIsolation() is called.');
  }
  return manager;
}