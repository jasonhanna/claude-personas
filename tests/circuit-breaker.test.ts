import { describe, it, expect, beforeEach } from '@jest/globals';
import { CircuitBreaker, CircuitBreakerFactory, CircuitBreakerError, CircuitState } from '../src/circuit-breaker.js';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 1000, // 1 second for testing
      monitoringPeriod: 5000,  // 5 seconds
      successThreshold: 2
    }, 'test-service');
  });

  describe('Constructor validation', () => {
    it('should throw error for invalid failure threshold', () => {
      expect(() => new CircuitBreaker({
        failureThreshold: 0,
        recoveryTimeout: 1000,
        monitoringPeriod: 5000
      }, 'test')).toThrow('Failure threshold must be greater than 0');
    });

    it('should throw error for invalid recovery timeout', () => {
      expect(() => new CircuitBreaker({
        failureThreshold: 3,
        recoveryTimeout: 0,
        monitoringPeriod: 5000
      }, 'test')).toThrow('Recovery timeout must be greater than 0');
    });

    it('should throw error for invalid monitoring period', () => {
      expect(() => new CircuitBreaker({
        failureThreshold: 3,
        recoveryTimeout: 1000,
        monitoringPeriod: 0
      }, 'test')).toThrow('Monitoring period must be greater than 0');
    });
  });

  describe('CLOSED state behavior', () => {
    it('should start in CLOSED state', () => {
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
    });

    it('should allow execution in CLOSED state', () => {
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should execute operations successfully', async () => {
      const operation = (): Promise<string> => Promise.resolve('success');
      
      const result = await circuitBreaker.execute(operation);
      
      expect(result).toBe('success');
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
      expect(metrics.successCount).toBe(1);
      expect(metrics.failureCount).toBe(0);
    });

    it('should handle single failures without opening', async () => {
      const operation = (): Promise<string> => Promise.reject(new Error('test failure'));
      
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('test failure');
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
      expect(metrics.failureCount).toBe(1);
    });

    it('should open circuit after failure threshold is reached', async () => {
      const operation = (): Promise<string> => Promise.reject(new Error('repeated failure'));
      
      // Fail 3 times (threshold)
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow('repeated failure');
      }
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.OPEN);
      expect(metrics.failureCount).toBe(3);
    });
  });

  describe('OPEN state behavior', () => {
    beforeEach(async () => {
      // Force circuit to open
      const operation = (): Promise<string> => Promise.reject(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(operation).catch(() => {});
      }
    });

    it('should reject requests immediately when OPEN', async () => {
      const operation = (): Promise<string> => Promise.resolve('should not be called');
      
      await expect(circuitBreaker.execute(operation))
        .rejects.toThrow(CircuitBreakerError);
    });

    it('should not allow execution when OPEN and before recovery timeout', () => {
      expect(circuitBreaker.canExecute()).toBe(false);
    });

    it('should transition to HALF_OPEN after recovery timeout', async () => {
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      expect(circuitBreaker.canExecute()).toBe(true);
      
      // Next execution should transition to HALF_OPEN
      const operation = (): Promise<string> => Promise.resolve('recovery test');
      await circuitBreaker.execute(operation);
      
      // Need 2 successes (successThreshold: 2)
      await circuitBreaker.execute(operation);
      
      // Should be in CLOSED state after 2 successful executions in HALF_OPEN
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('HALF_OPEN state behavior', () => {
    beforeEach(async () => {
      // Force circuit to open
      const operation = (): Promise<string> => Promise.reject(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(operation).catch(() => {});
      }
      
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
    });

    it('should close circuit on successful execution in HALF_OPEN', async () => {
      const operation = (): Promise<string> => Promise.resolve('success');
      
      // First call transitions to HALF_OPEN
      await circuitBreaker.execute(operation);
      
      // Need 2 successes (successThreshold: 2)
      await circuitBreaker.execute(operation);
      
      // Should be in CLOSED state after 2 successful executions in HALF_OPEN
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
    });

    it('should return to OPEN on failure in HALF_OPEN', async () => {
      const operation = (): Promise<string> => Promise.reject(new Error('still failing'));
      
      await expect(circuitBreaker.execute(operation))
        .rejects.toThrow('still failing');
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.OPEN);
    });

    it('should require multiple successes if configured', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 2,
        recoveryTimeout: 100,
        monitoringPeriod: 5000,
        successThreshold: 3 // Require 3 successes
      }, 'multi-success-test');

      // Force open
      cb.forceOpen();

      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 150));

      const successOp = (): Promise<string> => Promise.resolve('ok');

      // First success - should stay in HALF_OPEN
      await cb.execute(successOp);
      expect(cb.getMetrics().state).toBe(CircuitState.HALF_OPEN);

      // Second success - should stay in HALF_OPEN
      await cb.execute(successOp);
      expect(cb.getMetrics().state).toBe(CircuitState.HALF_OPEN);

      // Third success - should close
      await cb.execute(successOp);
      expect(cb.getMetrics().state).toBe(CircuitState.CLOSED);
    });
  });

  describe('Manual control', () => {
    it('should force open circuit', () => {
      circuitBreaker.forceOpen();
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.OPEN);
      expect(circuitBreaker.canExecute()).toBe(false);
    });

    it('should force close circuit', async () => {
      // First open the circuit
      const operation = (): Promise<string> => Promise.reject(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(operation).catch(() => {});
      }
      
      expect(circuitBreaker.getMetrics().state).toBe(CircuitState.OPEN);
      
      // Force close
      circuitBreaker.forceClose();
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);
      expect(metrics.failureCount).toBe(0);
      expect(circuitBreaker.canExecute()).toBe(true);
    });
  });

  describe('Metrics tracking', () => {
    it('should track total requests', async () => {
      const operation = (): Promise<string> => Promise.resolve('success');
      
      await circuitBreaker.execute(operation);
      await circuitBreaker.execute(operation);
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.totalRequests).toBe(2);
    });

    it('should track rejected requests', async () => {
      // Force circuit open
      circuitBreaker.forceOpen();
      
      const operation = (): Promise<string> => Promise.resolve('success');
      await circuitBreaker.execute(operation).catch(() => {});
      await circuitBreaker.execute(operation).catch(() => {});
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.rejectedRequests).toBe(2);
    });

    it('should track success and failure counts', async () => {
      let callCount = 0;
      const operation = (): Promise<string> => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('fail'));
        }
        return Promise.resolve('success');
      };
      
      await circuitBreaker.execute(operation);
      await circuitBreaker.execute(operation).catch(() => {});
      await circuitBreaker.execute(operation);
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.successCount).toBe(2);
      expect(metrics.failureCount).toBe(1);
    });

    it('should track last failure and success times', async () => {
      const startTime = Date.now();
      
      const failOp = (): Promise<string> => Promise.reject(new Error('failure'));
      await circuitBreaker.execute(failOp).catch(() => {});
      
      const successOp = (): Promise<string> => Promise.resolve('success');
      await circuitBreaker.execute(successOp);
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.lastFailureTime).toBeGreaterThanOrEqual(startTime);
      expect(metrics.lastSuccessTime).toBeGreaterThanOrEqual(startTime);
      expect(metrics.lastSuccessTime!).toBeGreaterThanOrEqual(metrics.lastFailureTime!);
    });
  });

  describe('Factory methods', () => {
    it('should create default circuit breaker', () => {
      const cb = CircuitBreakerFactory.createDefault('test');
      const metrics = cb.getMetrics();
      
      expect(metrics.state).toBe(CircuitState.CLOSED);
      expect(cb.canExecute()).toBe(true);
    });

    it('should create fast-fail circuit breaker', () => {
      const cb = CircuitBreakerFactory.createFastFail('test');
      expect(cb.canExecute()).toBe(true);
    });

    it('should create resilient circuit breaker', () => {
      const cb = CircuitBreakerFactory.createResilient('test');
      expect(cb.canExecute()).toBe(true);
    });
  });

  describe('Performance under load', () => {
    it('should handle many concurrent requests efficiently', async () => {
      const operation = (): Promise<string> => Promise.resolve('success');
      
      const startTime = Date.now();
      const requests = Array.from({ length: 100 }, () => 
        circuitBreaker.execute(operation)
      );
      
      await Promise.all(requests);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(100); // Should be very fast
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.successCount).toBe(100);
      expect(metrics.totalRequests).toBe(100);
    });

    it('should fail fast under load when circuit is open', async () => {
      // Force circuit open
      circuitBreaker.forceOpen();
      
      const startTime = Date.now();
      const operation = (): Promise<string> => Promise.resolve('success');
      const requests = Array.from({ length: 50 }, () =>
        circuitBreaker.execute(operation).catch(e => e)
      );
      
      const results = await Promise.all(requests);
      const duration = Date.now() - startTime;
      
      // Should fail very quickly
      expect(duration).toBeLessThan(50);
      
      // All should be circuit breaker errors
      results.forEach(result => {
        expect(result).toBeInstanceOf(CircuitBreakerError);
      });
    });
  });
});