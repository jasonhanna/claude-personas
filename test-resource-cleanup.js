#!/usr/bin/env node

/**
 * Test script to validate Phase 1 resource cleanup fixes
 * Tests the ResourceRegistry pattern and component cleanup
 */

import { ResourceRegistry, GlobalResourceRegistry } from './src/resource-registry.js';
import { MessageBroker } from './src/messaging/message-broker.js';
import { ConnectionManager } from './src/messaging/connection-manager.js';
import { setTimeout } from 'timers/promises';

class ResourceCleanupTester {
  constructor() {
    this.results = [];
    this.globalRegistry = GlobalResourceRegistry.getInstance();
  }

  async runAllTests() {
    console.log('🧪 Starting Resource Cleanup Tests...\n');

    try {
      await this.testResourceRegistry();
      await this.testMessageBrokerCleanup();
      await this.testConnectionManagerCleanup();
      await this.testGlobalCleanup();
      
      this.printResults();
      
      const failed = this.results.filter(r => !r.passed).length;
      if (failed > 0) {
        console.log(`\n❌ ${failed} test(s) failed`);
        process.exit(1);
      } else {
        console.log('\n✅ All tests passed!');
        process.exit(0);
      }
    } catch (error) {
      console.error('\n💥 Test suite crashed:', error);
      process.exit(1);
    }
  }

  async testResourceRegistry() {
    const testName = 'ResourceRegistry Basic Operations';
    console.log(`🔬 Testing ${testName}...`);

    try {
      const registry = new ResourceRegistry('TestComponent');
      
      // Test timer registration
      const timer = setTimeout(() => {}, 5000);
      const timerId = registry.registerTimer(timer, { name: 'test-timer' });
      
      // Test interval registration
      const interval = setInterval(() => {}, 1000);
      const intervalId = registry.registerInterval(interval, { name: 'test-interval' });
      
      // Test resource registration
      const resource = { value: 'test' };
      let cleanupCalled = false;
      const resourceId = registry.registerResource(
        resource,
        () => { cleanupCalled = true; },
        { name: 'test-resource' }
      );
      
      // Verify resources are tracked
      const counts = registry.getResourceCounts();
      const expectedActive = counts.timers === 1 && counts.intervals === 1 && counts.resources === 1;
      
      // Test cleanup
      await registry.cleanup();
      
      // Verify cleanup
      const countsAfter = registry.getResourceCounts();
      const allCleaned = countsAfter.total === 0;
      const resourceCleanupCalled = cleanupCalled;
      
      const passed = expectedActive && allCleaned && resourceCleanupCalled;
      
      this.results.push({
        name: testName,
        passed,
        details: {
          resourcesBeforeCleanup: counts,
          resourcesAfterCleanup: countsAfter,
          cleanupCalled: resourceCleanupCalled
        }
      });
      
      console.log(`  ${passed ? '✅' : '❌'} ${testName}`);
      
    } catch (error) {
      this.results.push({
        name: testName,
        passed: false,
        error: error.message
      });
      console.log(`  ❌ ${testName} - ${error.message}`);
    }
  }

  async testMessageBrokerCleanup() {
    const testName = 'MessageBroker Resource Cleanup';
    console.log(`🔬 Testing ${testName}...`);

    try {
      // Use in-memory database for testing
      const mockDb = {
        run: () => Promise.resolve(),
        get: () => Promise.resolve({}),
        all: () => Promise.resolve([]),
        close: (callback) => {
          setTimeout(() => callback(null), 10);
        }
      };

      const broker = new MessageBroker(
        {
          dbPath: ':memory:',
          cleanupInterval: 100,
          defaultTimeout: 1000,
          defaultRetries: 1,
          batchSize: 10,
          messageRetention: 1000
        },
        { database: mockDb }
      );

      // Start broker (should register timer)
      await broker.start();
      
      // Wait a moment to ensure timer is registered
      await setTimeout(50);
      
      // Stop broker (should clean up all resources)
      const stopPromise = broker.stop();
      
      // Ensure stop completes within reasonable time
      await Promise.race([
        stopPromise,
        setTimeout(5000).then(() => { throw new Error('MessageBroker stop timeout'); })
      ]);
      
      this.results.push({
        name: testName,
        passed: true,
        details: 'MessageBroker stopped without hanging'
      });
      
      console.log(`  ✅ ${testName}`);
      
    } catch (error) {
      this.results.push({
        name: testName,
        passed: false,
        error: error.message
      });
      console.log(`  ❌ ${testName} - ${error.message}`);
    }
  }

  async testConnectionManagerCleanup() {
    const testName = 'ConnectionManager Resource Cleanup';
    console.log(`🔬 Testing ${testName}...`);

    try {
      const connectionManager = new ConnectionManager(
        {
          discoveryInterval: 100,
          healthCheckInterval: 100,
          healthCheckTimeout: 1000,
          maxRetries: 1,
          retryBackoff: 100
        },
        {
          // Mock dependencies to prevent actual network calls
          timer: setInterval,
          setTimeout: setTimeout,
          discoveryMethod: async () => [],
          healthChecker: async () => ({ healthy: true })
        }
      );

      // Start connection manager (should register timers)
      await connectionManager.start();
      
      // Wait a moment to ensure timers are registered
      await setTimeout(50);
      
      // Stop connection manager (should clean up all resources)
      const stopPromise = connectionManager.stop();
      
      // Ensure stop completes within reasonable time
      await Promise.race([
        stopPromise,
        setTimeout(5000).then(() => { throw new Error('ConnectionManager stop timeout'); })
      ]);
      
      this.results.push({
        name: testName,
        passed: true,
        details: 'ConnectionManager stopped without hanging'
      });
      
      console.log(`  ✅ ${testName}`);
      
    } catch (error) {
      this.results.push({
        name: testName,
        passed: false,
        error: error.message
      });
      console.log(`  ❌ ${testName} - ${error.message}`);
    }
  }

  async testGlobalCleanup() {
    const testName = 'Global Resource Registry Cleanup';
    console.log(`🔬 Testing ${testName}...`);

    try {
      // Create multiple component registries
      const registry1 = this.globalRegistry.getRegistry('Component1');
      const registry2 = this.globalRegistry.getRegistry('Component2');
      
      // Register some resources
      const timer1 = setTimeout(() => {}, 5000);
      const timer2 = setTimeout(() => {}, 5000);
      
      registry1.registerTimer(timer1, { name: 'timer1' });
      registry2.registerTimer(timer2, { name: 'timer2' });
      
      // Verify resources exist
      const beforeCleanup = this.globalRegistry.hasActiveResources();
      
      // Global cleanup
      await this.globalRegistry.cleanupAll();
      
      // Verify cleanup
      const afterCleanup = this.globalRegistry.hasActiveResources();
      
      const passed = beforeCleanup && !afterCleanup;
      
      this.results.push({
        name: testName,
        passed,
        details: {
          hadResourcesBeforeCleanup: beforeCleanup,
          hasResourcesAfterCleanup: afterCleanup
        }
      });
      
      console.log(`  ${passed ? '✅' : '❌'} ${testName}`);
      
    } catch (error) {
      this.results.push({
        name: testName,
        passed: false,
        error: error.message
      });
      console.log(`  ❌ ${testName} - ${error.message}`);
    }
  }

  printResults() {
    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    
    this.results.forEach((result, index) => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${index + 1}. ${status} - ${result.name}`);
      
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      
      if (result.details && typeof result.details === 'object') {
        console.log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
      } else if (result.details) {
        console.log(`   Details: ${result.details}`);
      }
    });
  }
}

// Run tests
const tester = new ResourceCleanupTester();
tester.runAllTests().catch(console.error);