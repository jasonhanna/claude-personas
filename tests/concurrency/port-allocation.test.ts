import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('Port Allocation Concurrency Tests', () => {
  // Simple mock for testing concurrency patterns
  class MockPortAllocator {
    private allocatedPorts = new Set<number>();
    private readonly PORT_RANGE = { start: 30000, end: 40000 };

    async allocatePort(): Promise<number> {
      const maxAttempts = 10;
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const port = this.PORT_RANGE.start + 
          Math.floor(Math.random() * (this.PORT_RANGE.end - this.PORT_RANGE.start + 1));
        
        if (!this.allocatedPorts.has(port)) {
          this.allocatedPorts.add(port);
          return port;
        }
      }
      
      throw new Error('Port allocation failed - no available ports');
    }

    async releasePort(port: number): Promise<void> {
      this.allocatedPorts.delete(port);
    }

    getAllocatedPorts(): Set<number> {
      return new Set(this.allocatedPorts);
    }
  }

  let allocator: MockPortAllocator;

  beforeEach(() => {
    allocator = new MockPortAllocator();
  });

  describe('Concurrent Port Allocation', () => {
    it('should handle concurrent port allocation requests without conflicts', async () => {
      // Simulate concurrent port allocation requests
      const concurrentRequests = [];
      for (let i = 0; i < 5; i++) {
        concurrentRequests.push(allocator.allocatePort());
      }

      const allocatedPorts = await Promise.all(concurrentRequests);
      
      // Verify all ports are allocated and unique
      expect(allocatedPorts).toHaveLength(5);
      
      const uniquePorts = new Set(allocatedPorts);
      expect(uniquePorts.size).toBe(5); // All ports should be unique
      
      // Verify all ports are in valid range
      allocatedPorts.forEach(port => {
        expect(port).toBeGreaterThanOrEqual(30000);
        expect(port).toBeLessThanOrEqual(40000);
      });
    });

    it('should handle high volume concurrent requests', async () => {
      const startTime = Date.now();
      const numRequests = 20;
      
      const requests = Array.from({ length: numRequests }, () =>
        allocator.allocatePort()
      );

      const ports = await Promise.all(requests);
      const duration = Date.now() - startTime;

      // Verify results
      expect(ports).toHaveLength(numRequests);
      expect(new Set(ports).size).toBe(numRequests); // All unique
      
      // Performance check - should complete within reasonable time
      expect(duration).toBeLessThan(1000); // 1 second max for mock
      
      console.log(`Completed ${numRequests} concurrent allocations in ${duration}ms`);
    });

    it('should handle rapid allocation and deallocation cycles', async () => {
      const cycles = 10;
      const startTime = Date.now();
      
      for (let cycle = 0; cycle < cycles; cycle++) {
        // Allocate
        const port = await allocator.allocatePort();
        
        // Verify it's tracked
        expect(allocator.getAllocatedPorts().has(port)).toBe(true);
        
        // Immediately deallocate
        await allocator.releasePort(port);
        
        // Verify it's released
        expect(allocator.getAllocatedPorts().has(port)).toBe(false);
      }
      
      const duration = Date.now() - startTime;
      const avgCycleTime = duration / cycles;
      
      expect(avgCycleTime).toBeLessThan(50); // Average cycle should be under 50ms
      
      console.log(`Completed ${cycles} allocation/deallocation cycles, avg: ${avgCycleTime.toFixed(2)}ms per cycle`);
    });

    it('should maintain consistency under concurrent allocation and deallocation', async () => {
      const operations = [];
      
      // Mix of allocations and deallocations
      for (let i = 0; i < 10; i++) {
        operations.push(allocator.allocatePort());
      }
      
      // Wait for all allocations
      const allocatedPorts = await Promise.all(operations);
      
      // Now mix releases
      const releaseOperations = [];
      for (let i = 0; i < 5; i++) {
        releaseOperations.push(allocator.releasePort(allocatedPorts[i]));
      }
      
      await Promise.all(releaseOperations);
      
      // Verify final state
      const finalAllocated = allocator.getAllocatedPorts();
      expect(finalAllocated.size).toBe(5); // 10 allocated - 5 released = 5 remaining
    });
  });

  describe('Race Condition Simulation', () => {
    it('should handle simulated race conditions gracefully', async () => {
      // Mock a scenario where ports get allocated very quickly
      class RaceConditionAllocator extends MockPortAllocator {
        private allocationCount = 0;

        async allocatePort(): Promise<number> {
          this.allocationCount++;
          
          // Simulate race condition every 3rd allocation
          if (this.allocationCount % 3 === 0) {
            // Add artificial delay to simulate race condition
            await new Promise(resolve => setTimeout(resolve, 1));
          }
          
          return super.allocatePort();
        }
      }
      
      const raceAllocator = new RaceConditionAllocator();
      
      // Try many concurrent allocations
      const requests = Array.from({ length: 15 }, () =>
        raceAllocator.allocatePort()
      );

      const ports = await Promise.all(requests);
      
      // Should still succeed despite race conditions
      expect(ports).toHaveLength(15);
      expect(new Set(ports).size).toBe(15); // All unique
    });

    it('should handle resource exhaustion under concurrent load', async () => {
      // Create allocator with very limited port range
      class LimitedPortAllocator {
        private allocatedPorts = new Set<number>();
        private readonly availablePorts = [30000, 30001, 30002]; // Only 3 ports
        
        async allocatePort(): Promise<number> {
          for (const port of this.availablePorts) {
            if (!this.allocatedPorts.has(port)) {
              this.allocatedPorts.add(port);
              return port;
            }
          }
          throw new Error('No available ports');
        }
      }
      
      const limitedAllocator = new LimitedPortAllocator();
      
      // Try to allocate more ports than available
      const requests = Array.from({ length: 5 }, () =>
        limitedAllocator.allocatePort().catch(e => e)
      );

      const results = await Promise.all(requests);
      
      // Some should succeed, some should fail
      const successes = results.filter(r => typeof r === 'number');
      const failures = results.filter(r => r instanceof Error);
      
      expect(successes).toHaveLength(3); // Only 3 ports available
      expect(failures).toHaveLength(2); // 2 should fail
    });
  });

  describe('Performance Under Concurrency', () => {
    it('should maintain performance with many concurrent operations', async () => {
      const startTime = Date.now();
      const operations = [];
      
      // Create a mix of allocations and releases
      for (let i = 0; i < 50; i++) {
        if (i % 2 === 0) {
          operations.push(allocator.allocatePort());
        }
      }
      
      const ports = await Promise.all(operations);
      
      // Release half of them
      const releaseOps = [];
      for (let i = 0; i < ports.length / 2; i++) {
        releaseOps.push(allocator.releasePort(ports[i]));
      }
      
      await Promise.all(releaseOps);
      
      const duration = Date.now() - startTime;
      
      // Should complete quickly
      expect(duration).toBeLessThan(500); // 500ms max
      
      console.log(`Completed mixed operations in ${duration}ms`);
    });
  });
});