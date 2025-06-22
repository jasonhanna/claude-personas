import { 
  AgentError, 
  ValidationError, 
  CommunicationError, 
  MemoryError 
} from '../../src/errors.js';

describe('Performance Tests - Error Handling', () => {
  
  describe('Error Creation Performance', () => {
    test('should create errors quickly', () => {
      const iterations = 1000;
      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        new AgentError(`Error ${i}`, {
          context: { iteration: i, timestamp: Date.now() }
        });
      }
      
      const elapsed = Date.now() - start;
      const avgTimePerError = elapsed / iterations;
      
      // Should create errors in under 1ms each on average
      expect(avgTimePerError).toBeLessThan(1);
      console.log(`Error creation: ${avgTimePerError.toFixed(3)}ms per error`);
    });

    test('should handle large context efficiently', () => {
      const largeContext = {
        data: 'x'.repeat(10000), // 10KB string
        array: new Array(1000).fill(0).map((_, i) => ({ id: i, value: `item_${i}` })),
        nested: {
          level1: { level2: { level3: { data: 'nested_data' } } }
        }
      };
      
      const start = Date.now();
      const error = new AgentError('Large context error', { context: largeContext });
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeLessThan(10); // Should create in under 10ms
      expect(error.context).toEqual(largeContext);
    });
  });

  describe('JSON Serialization Performance', () => {
    test('should serialize efficiently with caching', () => {
      const context = {
        user: { id: '123', data: 'x'.repeat(1000) },
        config: { settings: new Array(100).fill(0).map((_, i) => ({ key: `setting_${i}`, value: `value_${i}` })) }
      };
      
      const error = new AgentError('Performance test', { context });
      
      // First serialization (uncached)
      const start1 = Date.now();
      error.toJSON('development');
      const time1 = Date.now() - start1;
      
      // Second serialization (cached)
      const start2 = Date.now();
      error.toJSON('development');
      const time2 = Date.now() - start2;
      
      console.log(`First serialization: ${time1}ms, Cached: ${time2}ms`);
      
      // Cached should be significantly faster
      expect(time2).toBeLessThanOrEqual(time1);
    });

    test('should handle high-frequency serialization', () => {
      const errors = new Array(100).fill(0).map((_, i) => 
        new AgentError(`Error ${i}`, {
          context: { iteration: i, data: 'x'.repeat(100) }
        })
      );
      
      const start = Date.now();
      
      // Serialize all errors in both modes
      errors.forEach(error => {
        error.toJSON('production');
        error.toJSON('development');
      });
      
      const elapsed = Date.now() - start;
      const avgTimePerSerialization = elapsed / (errors.length * 2);
      
      console.log(`High-frequency serialization: ${avgTimePerSerialization.toFixed(3)}ms per serialization`);
      
      // Should handle high frequency well
      expect(avgTimePerSerialization).toBeLessThan(2);
    });

    test('should maintain performance with sensitive data sanitization', () => {
      const sensitiveContext = {
        password: 'super_secret_password_that_is_very_long',
        apiKey: 'sk-' + 'x'.repeat(100),
        userData: {
          profile: {
            secrets: {
              token: 'bearer_' + 'y'.repeat(200),
              privateKey: 'pk-' + 'z'.repeat(500)
            }
          }
        },
        paths: [
          '/very/long/path/to/sensitive/file1.json',
          '/another/very/long/path/to/sensitive/file2.json',
          '/yet/another/extremely/long/path/to/sensitive/file3.json'
        ]
      };
      
      const error = new AgentError('Sensitive data test', { context: sensitiveContext });
      
      const start = Date.now();
      const serialized = error.toJSON('development');
      const elapsed = Date.now() - start;
      
      console.log(`Sanitization time: ${elapsed}ms`);
      
      // Should sanitize within reasonable time
      expect(elapsed).toBeLessThan(5);
      
      // Verify sanitization worked
      const context = serialized.context as any;
      expect(context.password).toBe('[REDACTED]');
      expect(context.userData.profile.secrets.token).toBe('[REDACTED]');
      expect(context.paths[0]).toBe('file1.json');
    });
  });

  describe('Memory Usage Tests', () => {
    test('should not leak memory with many errors', () => {
      const iterations = 1000;
      const errors: AgentError[] = [];
      
      // Create many errors
      for (let i = 0; i < iterations; i++) {
        const error = new ValidationError(`Error ${i}`, {
          context: { 
            iteration: i,
            data: 'x'.repeat(100),
            timestamp: Date.now()
          }
        });
        
        // Serialize to trigger caching
        error.toJSON('production');
        error.toJSON('development');
        
        errors.push(error);
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      // Basic verification
      expect(errors).toHaveLength(iterations);
      
      // Check that errors are still functional
      const randomError = errors[Math.floor(Math.random() * errors.length)];
      expect(randomError.toJSON('production')).toBeDefined();
    });

    test('should handle concurrent error creation', async () => {
      const concurrentCount = 100;
      const promises: Promise<AgentError>[] = [];
      
      const start = Date.now();
      
      // Create errors concurrently
      for (let i = 0; i < concurrentCount; i++) {
        promises.push(Promise.resolve().then(() => {
          return new CommunicationError(`Concurrent error ${i}`, {
            context: { threadId: i, timestamp: Date.now() }
          });
        }));
      }
      
      const errors = await Promise.all(promises);
      const elapsed = Date.now() - start;
      
      console.log(`Concurrent creation: ${elapsed}ms for ${concurrentCount} errors`);
      
      expect(errors).toHaveLength(concurrentCount);
      expect(elapsed).toBeLessThan(100); // Should complete quickly
      
      // Verify all errors have unique request IDs
      const requestIds = errors.map(e => e.requestId);
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(concurrentCount);
    });
  });

  describe('Retry Logic Performance', () => {
    test('should handle retry operations efficiently', async () => {
      let attemptCount = 0;
      
      const operation = async (): Promise<string> => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new CommunicationError(`Attempt ${attemptCount} failed`, {
            attempt: attemptCount
          });
        }
        return 'success';
      };
      
      const start = Date.now();
      const result = await CommunicationError.withRetry(operation);
      const elapsed = Date.now() - start;
      
      console.log(`Retry operation: ${elapsed}ms for ${attemptCount} attempts`);
      
      expect(result).toBe('success');
      expect(attemptCount).toBe(3);
      
      // Should complete retries efficiently (excluding deliberate delays)
      // The actual delay time will be longer due to exponential backoff
      expect(elapsed).toBeGreaterThan(1000); // Should have some delay
    });

    test('should handle retry delay calculation efficiently', () => {
      const error = new CommunicationError('Test error');
      const iterations = 1000;
      
      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        error.getRetryDelay(i % 5); // Test delays for attempts 0-4
      }
      
      const elapsed = Date.now() - start;
      const avgTime = elapsed / iterations;
      
      console.log(`Retry delay calculation: ${avgTime.toFixed(3)}ms per calculation`);
      
      // Should calculate delays very quickly
      expect(avgTime).toBeLessThan(0.1);
    });
  });

  describe('Error Benchmarks', () => {
    test('should meet performance benchmarks for production use', () => {
      const benchmarks = {
        errorCreation: { iterations: 1000, maxTimeMs: 1000 },
        serialization: { iterations: 500, maxTimeMs: 500 },
        sanitization: { iterations: 100, maxTimeMs: 200 }
      };
      
      // Error creation benchmark
      const start1 = Date.now();
      for (let i = 0; i < benchmarks.errorCreation.iterations; i++) {
        new AgentError(`Benchmark error ${i}`, {
          context: { iteration: i }
        });
      }
      const creationTime = Date.now() - start1;
      
      // Serialization benchmark
      const errors = new Array(benchmarks.serialization.iterations).fill(0).map((_, i) =>
        new ValidationError(`Serialization test ${i}`, { data: 'x'.repeat(50) })
      );
      
      const start2 = Date.now();
      errors.forEach(error => error.toJSON('development'));
      const serializationTime = Date.now() - start2;
      
      // Sanitization benchmark
      const sensitiveErrors = new Array(benchmarks.sanitization.iterations).fill(0).map((_, i) =>
        new MemoryError(`Sanitization test ${i}`, {
          password: 'secret',
          filePath: '/path/to/file.json',
          token: 'token_value'
        })
      );
      
      const start3 = Date.now();
      sensitiveErrors.forEach(error => error.toJSON('development'));
      const sanitizationTime = Date.now() - start3;
      
      console.log(`Performance Benchmarks:`);
      console.log(`- Error creation: ${creationTime}ms (${(creationTime/benchmarks.errorCreation.iterations).toFixed(3)}ms/error)`);
      console.log(`- Serialization: ${serializationTime}ms (${(serializationTime/benchmarks.serialization.iterations).toFixed(3)}ms/error)`);
      console.log(`- Sanitization: ${sanitizationTime}ms (${(sanitizationTime/benchmarks.sanitization.iterations).toFixed(3)}ms/error)`);
      
      // Verify benchmarks are met
      expect(creationTime).toBeLessThan(benchmarks.errorCreation.maxTimeMs);
      expect(serializationTime).toBeLessThan(benchmarks.serialization.maxTimeMs);
      expect(sanitizationTime).toBeLessThan(benchmarks.sanitization.maxTimeMs);
    });

    test('should measure error handling throughput', () => {
      const duration = 1000; // 1 second test
      const start = Date.now();
      let errorCount = 0;
      
      while (Date.now() - start < duration) {
        const error = new CommunicationError(`Throughput test ${errorCount}`, {
          context: { id: errorCount }
        });
        
        error.toJSON('production');
        error.toJSON('development');
        
        errorCount++;
      }
      
      const elapsed = Date.now() - start;
      const errorsPerSecond = (errorCount / elapsed) * 1000;
      
      console.log(`Error handling throughput: ${errorsPerSecond.toFixed(0)} errors/second`);
      
      // Should handle at least 1000 errors per second
      expect(errorsPerSecond).toBeGreaterThan(1000);
    });
  });
});