/**
 * Circuit Breaker implementation for service resilience
 * 
 * Prevents cascading failures by failing fast when a service is unavailable
 * and automatically attempting recovery after a timeout period.
 */

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing fast, service assumed down
  HALF_OPEN = 'HALF_OPEN' // Testing if service has recovered
}

export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms to wait before attempting recovery */
  recoveryTimeout: number;
  /** Time window in ms for counting failures */
  monitoringPeriod: number;
  /** Optional success threshold for half-open to closed transition */
  successThreshold?: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  totalRequests: number;
  rejectedRequests: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private totalRequests: number = 0;
  private rejectedRequests: number = 0;
  private nextAttempt?: number;

  constructor(
    private readonly config: CircuitBreakerConfig,
    private readonly serviceName: string = 'unknown'
  ) {
    // Validate config
    if (config.failureThreshold <= 0) {
      throw new Error('Failure threshold must be greater than 0');
    }
    if (config.recoveryTimeout <= 0) {
      throw new Error('Recovery timeout must be greater than 0');
    }
    if (config.monitoringPeriod <= 0) {
      throw new Error('Monitoring period must be greater than 0');
    }
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    if (this.state === CircuitState.OPEN) {
      if (!this.shouldAttemptReset()) {
        this.rejectedRequests++;
        throw new CircuitBreakerError(
          `Circuit breaker is OPEN for ${this.serviceName}. Service assumed down.`,
          this.serviceName,
          this.state
        );
      }
      
      // Transition to half-open
      this.state = CircuitState.HALF_OPEN;
      console.log(`[CircuitBreaker] ${this.serviceName}: Transitioning to HALF_OPEN`);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Check if circuit breaker will allow the request
   */
  canExecute(): boolean {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      return true;
    }

    // OPEN state
    return this.shouldAttemptReset();
  }

  /**
   * Get current metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      rejectedRequests: this.rejectedRequests
    };
  }

  /**
   * Force circuit to open (for testing or manual intervention)
   */
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.config.recoveryTimeout;
    console.log(`[CircuitBreaker] ${this.serviceName}: Forced to OPEN state`);
  }

  /**
   * Force circuit to close (for testing or manual intervention)
   */
  forceClose(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = undefined;
    console.log(`[CircuitBreaker] ${this.serviceName}: Forced to CLOSED state`);
  }

  private onSuccess(): void {
    this.successCount++;
    this.lastSuccessTime = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      const successThreshold = this.config.successThreshold || 1;
      if (this.successCount >= successThreshold) {
        this.reset();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.resetFailureCount();
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open goes back to open
      this.tripBreaker();
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we should trip the breaker
      if (this.shouldTripBreaker()) {
        this.tripBreaker();
      }
    }
  }

  private shouldTripBreaker(): boolean {
    if (this.failureCount < this.config.failureThreshold) {
      return false;
    }

    // Check if failures occurred within the monitoring period
    const now = Date.now();
    const monitoringStart = now - this.config.monitoringPeriod;
    
    return (this.lastFailureTime || 0) >= monitoringStart;
  }

  private tripBreaker(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.config.recoveryTimeout;
    this.successCount = 0; // Reset success count
    
    console.log(
      `[CircuitBreaker] ${this.serviceName}: Circuit OPENED after ${this.failureCount} failures`
    );
  }

  private shouldAttemptReset(): boolean {
    if (!this.nextAttempt) {
      return false;
    }
    
    return Date.now() >= this.nextAttempt;
  }

  private reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = undefined;
    
    console.log(`[CircuitBreaker] ${this.serviceName}: Circuit CLOSED - service recovered`);
  }

  private resetFailureCount(): void {
    // Only reset if enough time has passed since last failure
    const now = Date.now();
    if (this.lastFailureTime && (now - this.lastFailureTime) > this.config.monitoringPeriod) {
      this.failureCount = 0;
    }
  }
}

export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly serviceName: string,
    public readonly circuitState: CircuitState
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Factory function for creating circuit breakers with common configurations
 */
export class CircuitBreakerFactory {
  static createDefault(serviceName: string): CircuitBreaker {
    return new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 30000, // 30 seconds
      monitoringPeriod: 60000, // 1 minute
      successThreshold: 2
    }, serviceName);
  }

  static createFastFail(serviceName: string): CircuitBreaker {
    return new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 10000, // 10 seconds
      monitoringPeriod: 30000, // 30 seconds
      successThreshold: 1
    }, serviceName);
  }

  static createResilient(serviceName: string): CircuitBreaker {
    return new CircuitBreaker({
      failureThreshold: 10,
      recoveryTimeout: 60000, // 1 minute
      monitoringPeriod: 300000, // 5 minutes
      successThreshold: 3
    }, serviceName);
  }
}