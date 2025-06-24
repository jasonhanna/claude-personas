/**
 * Test Environment Separation - Utilities for separating unit and integration tests
 * Provides clear patterns and configurations for different test types
 */

import { TestResourceRegistry } from './test-resource-registry.js';
import { TestIsolationManager, TestIsolationOptions } from './test-isolation.js';
import { MockServerFactory } from './test-server-mocks.js';
import {
  createTestAuthService,
  createTestMessageBroker,
  createTestConnectionManager,
  setupTestEnvironment,
  teardownTestEnvironment
} from './index.js';

export type TestType = 'unit' | 'integration' | 'system' | 'performance';

export interface TestEnvironmentConfig {
  type: TestType;
  isolation: TestIsolationOptions;
  resources: {
    enableResourceTracking: boolean;
    autoCleanup: boolean;
    maxTestDuration: number;
  };
  mocking: {
    mockServers: boolean;
    mockDatabase: boolean;
    mockNetworking: boolean;
    mockTimers: boolean;
  };
  logging: {
    enableTestLogs: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    silenceComponents: string[];
  };
}

/**
 * Predefined test environment configurations
 */
export const TEST_ENVIRONMENT_CONFIGS: Record<TestType, TestEnvironmentConfig> = {
  unit: {
    type: 'unit',
    isolation: {
      timeout: 5000, // 5 seconds for unit tests
      enableResourceTracking: true,
      enableHangingDetection: true,
      isolateConsole: true,
      isolateTimers: true,
      cleanupOnFailure: true,
      maxMemoryMB: 50
    },
    resources: {
      enableResourceTracking: true,
      autoCleanup: true,
      maxTestDuration: 5000
    },
    mocking: {
      mockServers: true,
      mockDatabase: true,
      mockNetworking: true,
      mockTimers: true
    },
    logging: {
      enableTestLogs: false,
      logLevel: 'error',
      silenceComponents: ['ResourceRegistry', 'MockServer', 'MockOrchestrator']
    }
  },

  integration: {
    type: 'integration',
    isolation: {
      timeout: 15000, // 15 seconds for integration tests
      enableResourceTracking: true,
      enableHangingDetection: true,
      isolateConsole: false, // Allow console output for debugging
      isolateTimers: false, // Allow real timers for timing behavior
      cleanupOnFailure: true,
      maxMemoryMB: 100
    },
    resources: {
      enableResourceTracking: true,
      autoCleanup: true,
      maxTestDuration: 15000
    },
    mocking: {
      mockServers: true, // Still mock servers but with more realistic behavior
      mockDatabase: true, // Use in-memory database
      mockNetworking: false, // Allow real networking between components
      mockTimers: false // Use real timers
    },
    logging: {
      enableTestLogs: true,
      logLevel: 'warn',
      silenceComponents: ['ResourceRegistry']
    }
  },

  system: {
    type: 'system',
    isolation: {
      timeout: 30000, // 30 seconds for system tests
      enableResourceTracking: true,
      enableHangingDetection: true,
      isolateConsole: false,
      isolateTimers: false,
      cleanupOnFailure: true,
      maxMemoryMB: 200
    },
    resources: {
      enableResourceTracking: true,
      autoCleanup: true,
      maxTestDuration: 30000
    },
    mocking: {
      mockServers: false, // Use real servers in system tests
      mockDatabase: false, // Use real database (or test database)
      mockNetworking: false,
      mockTimers: false
    },
    logging: {
      enableTestLogs: true,
      logLevel: 'info',
      silenceComponents: []
    }
  },

  performance: {
    type: 'performance',
    isolation: {
      timeout: 60000, // 1 minute for performance tests
      enableResourceTracking: true,
      enableHangingDetection: false, // Disable hanging detection for perf tests
      isolateConsole: false,
      isolateTimers: false,
      cleanupOnFailure: true,
      maxMemoryMB: 500
    },
    resources: {
      enableResourceTracking: true,
      autoCleanup: true,
      maxTestDuration: 60000
    },
    mocking: {
      mockServers: false,
      mockDatabase: false,
      mockNetworking: false,
      mockTimers: false
    },
    logging: {
      enableTestLogs: true,
      logLevel: 'warn',
      silenceComponents: []
    }
  }
};

/**
 * Test environment manager for creating appropriate test setups
 */
export class TestEnvironmentManager {
  private config: TestEnvironmentConfig;
  private resourceRegistry: TestResourceRegistry;
  private isolationManager: TestIsolationManager;
  private mockFactory?: MockServerFactory;
  private originalConsole: Record<string, any> = {};

  constructor(testType: TestType, testName: string, customConfig?: Partial<TestEnvironmentConfig>) {
    this.config = {
      ...TEST_ENVIRONMENT_CONFIGS[testType],
      ...customConfig
    };

    this.resourceRegistry = new TestResourceRegistry(
      testName,
      this.config.resources.autoCleanup
    );

    this.isolationManager = new TestIsolationManager(testName, this.config.isolation);

    if (this.config.mocking.mockServers) {
      this.mockFactory = new MockServerFactory(this.resourceRegistry);
    }
  }

  /**
   * Set up the test environment
   */
  async setup(): Promise<void> {
    // Configure logging
    this.setupLogging();

    // Set up resource tracking
    if (this.config.resources.enableResourceTracking) {
      // Resource registry is already created and will be used by test components
    }

    // Initialize mock factory if needed
    if (this.mockFactory) {
      // Mock factory is ready to create components
    }
  }

  /**
   * Tear down the test environment
   */
  async teardown(): Promise<void> {
    try {
      // Cleanup resources
      await this.resourceRegistry.cleanup();
    } catch (error) {
      console.error('Failed to cleanup test resources:', error);
      
      // Try emergency cleanup
      try {
        await this.resourceRegistry.emergencyCleanup();
      } catch (emergencyError) {
        console.error('Emergency cleanup failed:', emergencyError);
      }
    } finally {
      // Restore logging
      this.restoreLogging();
    }
  }

  /**
   * Run a test with the configured environment
   */
  async runTest<T>(testFunction: () => Promise<T> | T): Promise<T> {
    const result = await this.isolationManager.runWithIsolation(testFunction);
    
    if (!result.success) {
      throw result.error || new Error('Test failed');
    }
    
    if (result.resourcesLeaked) {
      console.warn(`[TestEnvironment] Resources leaked during test execution`);
    }
    
    return result.result!;
  }

  /**
   * Get the resource registry for manual resource management
   */
  getResourceRegistry(): TestResourceRegistry {
    return this.resourceRegistry;
  }

  /**
   * Get the mock factory for creating mock components
   */
  getMockFactory(): MockServerFactory | undefined {
    return this.mockFactory;
  }

  /**
   * Get the test configuration
   */
  getConfig(): TestEnvironmentConfig {
    return this.config;
  }

  private setupLogging(): void {
    if (!this.config.logging.enableTestLogs) {
      // Capture and filter console output
      this.originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug
      };

      const shouldSilence = (message: string) => {
        return this.config.logging.silenceComponents.some(component => 
          message.includes(`[${component}]`)
        );
      };

      console.log = (...args) => {
        const message = args.join(' ');
        if (!shouldSilence(message)) {
          this.originalConsole.log(...args);
        }
      };

      console.warn = (...args) => {
        const message = args.join(' ');
        if (!shouldSilence(message) && this.shouldLog('warn')) {
          this.originalConsole.warn(...args);
        }
      };

      console.error = (...args) => {
        const message = args.join(' ');
        if (!shouldSilence(message) && this.shouldLog('error')) {
          this.originalConsole.error(...args);
        }
      };

      console.info = (...args) => {
        const message = args.join(' ');
        if (!shouldSilence(message) && this.shouldLog('info')) {
          this.originalConsole.info(...args);
        }
      };

      console.debug = (...args) => {
        const message = args.join(' ');
        if (!shouldSilence(message) && this.shouldLog('debug')) {
          this.originalConsole.debug(...args);
        }
      };
    }
  }

  private restoreLogging(): void {
    if (Object.keys(this.originalConsole).length > 0) {
      Object.assign(console, this.originalConsole);
      this.originalConsole = {};
    }
  }

  private shouldLog(level: string): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    const configLevel = levels.indexOf(this.config.logging.logLevel);
    const messageLevel = levels.indexOf(level);
    return messageLevel <= configLevel;
  }
}

/**
 * Factory functions for creating test environments
 */
export const testEnvironments = {
  /**
   * Create a unit test environment with full mocking and isolation
   */
  unit(testName: string, customConfig?: Partial<TestEnvironmentConfig>): TestEnvironmentManager {
    return new TestEnvironmentManager('unit', testName, customConfig);
  },

  /**
   * Create an integration test environment with selective mocking
   */
  integration(testName: string, customConfig?: Partial<TestEnvironmentConfig>): TestEnvironmentManager {
    return new TestEnvironmentManager('integration', testName, customConfig);
  },

  /**
   * Create a system test environment with minimal mocking
   */
  system(testName: string, customConfig?: Partial<TestEnvironmentConfig>): TestEnvironmentManager {
    return new TestEnvironmentManager('system', testName, customConfig);
  },

  /**
   * Create a performance test environment
   */
  performance(testName: string, customConfig?: Partial<TestEnvironmentConfig>): TestEnvironmentManager {
    return new TestEnvironmentManager('performance', testName, customConfig);
  }
};

/**
 * Utility decorators for test methods
 */
export function withTestEnvironment(testType: TestType, customConfig?: Partial<TestEnvironmentConfig>) {
  return function<T extends (...args: any[]) => Promise<any>>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value!;
    
    descriptor.value = (async function(this: any, ...args: any[]) {
      const testName = `${target.constructor.name}.${propertyKey}`;
      const environment = new TestEnvironmentManager(testType, testName, customConfig);
      
      await environment.setup();
      
      try {
        return await environment.runTest(() => originalMethod.apply(this, args));
      } finally {
        await environment.teardown();
      }
    }) as T;
    
    return descriptor;
  };
}

/**
 * Jest setup helpers for different test types
 */
export const jestSetup = {
  /**
   * Set up Jest for unit tests
   */
  unit() {
    beforeEach(function() {
      const testName = expect.getState().currentTestName || 'unknown-unit-test';
      const environment = testEnvironments.unit(testName);
      (global as any).testEnvironment = environment;
      return environment.setup();
    });

    afterEach(async function() {
      const environment = (global as any).testEnvironment;
      if (environment) {
        await environment.teardown();
        delete (global as any).testEnvironment;
      }
    });
  },

  /**
   * Set up Jest for integration tests
   */
  integration() {
    beforeEach(function() {
      const testName = expect.getState().currentTestName || 'unknown-integration-test';
      const environment = testEnvironments.integration(testName);
      (global as any).testEnvironment = environment;
      return environment.setup();
    });

    afterEach(async function() {
      const environment = (global as any).testEnvironment;
      if (environment) {
        await environment.teardown();
        delete (global as any).testEnvironment;
      }
    });
  },

  /**
   * Set up Jest for system tests
   */
  system() {
    beforeEach(function() {
      const testName = expect.getState().currentTestName || 'unknown-system-test';
      const environment = testEnvironments.system(testName);
      (global as any).testEnvironment = environment;
      return environment.setup();
    });

    afterEach(async function() {
      const environment = (global as any).testEnvironment;
      if (environment) {
        await environment.teardown();
        delete (global as any).testEnvironment;
      }
    });
  },

  /**
   * Set up Jest for performance tests
   */
  performance() {
    beforeEach(function() {
      const testName = expect.getState().currentTestName || 'unknown-performance-test';
      const environment = testEnvironments.performance(testName);
      (global as any).testEnvironment = environment;
      return environment.setup();
    });

    afterEach(async function() {
      const environment = (global as any).testEnvironment;
      if (environment) {
        await environment.teardown();
        delete (global as any).testEnvironment;
      }
    });
  }
};

/**
 * Helper to get current test environment
 */
export function getCurrentTestEnvironment(): TestEnvironmentManager {
  const environment = (global as any).testEnvironment;
  if (!environment) {
    throw new Error('Test environment not available. Make sure the appropriate jest setup is called.');
  }
  return environment;
}

/**
 * Test categorization utilities
 */
export const testCategories = {
  /**
   * Check if a test should run based on environment variables
   */
  shouldRun(testType: TestType): boolean {
    const runAll = process.env.RUN_ALL_TESTS === 'true';
    const runUnit = process.env.RUN_UNIT_TESTS !== 'false'; // Default true
    const runIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';
    const runSystem = process.env.RUN_SYSTEM_TESTS === 'true';
    const runPerformance = process.env.RUN_PERFORMANCE_TESTS === 'true';

    if (runAll) return true;

    switch (testType) {
      case 'unit':
        return runUnit;
      case 'integration':
        return runIntegration;
      case 'system':
        return runSystem;
      case 'performance':
        return runPerformance;
      default:
        return false;
    }
  },

  /**
   * Skip test conditionally based on type and environment
   */
  skipIf(condition: boolean, reason?: string) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
      if (condition) {
        descriptor.value = function() {
          console.log(`Skipping ${propertyKey}: ${reason || 'condition met'}`);
        };
      }
      return descriptor;
    };
  },

  /**
   * Mark test as slow (useful for CI optimization)
   */
  slow(threshold: number = 5000) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
      const originalMethod = descriptor.value;
      descriptor.value = function(...args: any[]) {
        const start = Date.now();
        const result = originalMethod.apply(this, args);
        
        if (result instanceof Promise) {
          return result.finally(() => {
            const duration = Date.now() - start;
            if (duration > threshold) {
              console.warn(`[SLOW TEST] ${propertyKey} took ${duration}ms (threshold: ${threshold}ms)`);
            }
          });
        } else {
          const duration = Date.now() - start;
          if (duration > threshold) {
            console.warn(`[SLOW TEST] ${propertyKey} took ${duration}ms (threshold: ${threshold}ms)`);
          }
          return result;
        }
      };
      return descriptor;
    };
  }
};