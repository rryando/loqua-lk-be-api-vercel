/**
 * Circuit Breaker pattern implementation for API resilience
 * Prevents cascading failures and enables graceful degradation
 */

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Fast-fail mode during outages
  HALF_OPEN = 'HALF_OPEN' // Testing service recovery
}

export interface CircuitBreakerConfig {
  failureThreshold: number;    // Number of failures before opening circuit
  timeoutMs: number;          // Time to wait before attempting recovery
  monitoringPeriodMs: number; // Window for failure rate calculation
  successThreshold: number;   // Successful calls needed to close circuit from half-open
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  totalRequests: number;
  failureRate: number;
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private lastSuccessTime: number = 0;
  private nextAttempt: number = 0;
  private totalRequests: number = 0;

  constructor(
    private config: CircuitBreakerConfig,
    private name: string = 'default'
  ) {}

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        // Circuit is open and timeout hasn't passed
        if (fallback) {
          console.warn(`Circuit breaker ${this.name} is OPEN, using fallback`);
          return await fallback();
        }
        throw new CircuitBreakerError(`Circuit breaker ${this.name} is OPEN. Service temporarily unavailable.`);
      } else {
        // Timeout has passed, try half-open
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        console.log(`Circuit breaker ${this.name} transitioning to HALF_OPEN`);
      }
    }

    this.totalRequests++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      
      if (fallback) {
        console.warn(`Circuit breaker ${this.name} failed, using fallback`);
        return await fallback();
      }
      
      throw error;
    }
  }

  private onSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.successCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.successCount >= this.config.successThreshold) {
        // Enough successes to close the circuit
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        console.log(`Circuit breaker ${this.name} closing after ${this.successCount} successes`);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;

    if (this.state === CircuitState.CLOSED || this.state === CircuitState.HALF_OPEN) {
      if (this.failureCount >= this.config.failureThreshold) {
        // Open the circuit
        this.state = CircuitState.OPEN;
        this.nextAttempt = Date.now() + this.config.timeoutMs;
        console.error(`Circuit breaker ${this.name} opening after ${this.failureCount} failures`);
      }
    }
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const now = Date.now();
    const recentPeriodStart = now - this.config.monitoringPeriodMs;
    
    // Calculate failure rate over monitoring period
    let failureRate = 0;
    if (this.totalRequests > 0) {
      failureRate = this.failureCount / this.totalRequests;
    }

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      failureRate: failureRate
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.totalRequests = 0;
    this.nextAttempt = 0;
    console.log(`Circuit breaker ${this.name} manually reset`);
  }

  /**
   * Check if circuit breaker is healthy
   */
  isHealthy(): boolean {
    return this.state === CircuitState.CLOSED;
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }
}

/**
 * Circuit Breaker Manager for managing multiple circuit breakers
 */
export class CircuitBreakerManager {
  private static instance: CircuitBreakerManager;
  private breakers = new Map<string, CircuitBreaker>();

  private constructor() {}

  public static getInstance(): CircuitBreakerManager {
    if (!CircuitBreakerManager.instance) {
      CircuitBreakerManager.instance = new CircuitBreakerManager();
    }
    return CircuitBreakerManager.instance;
  }

  public getOrCreate(name: string, config: CircuitBreakerConfig): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(config, name));
    }
    return this.breakers.get(name)!;
  }

  public get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  public getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    for (const [name, breaker] of this.breakers) {
      metrics[name] = breaker.getMetrics();
    }
    return metrics;
  }

  public getHealthStatus(): { healthy: boolean; details: Record<string, boolean> } {
    const details: Record<string, boolean> = {};
    let allHealthy = true;

    for (const [name, breaker] of this.breakers) {
      const isHealthy = breaker.isHealthy();
      details[name] = isHealthy;
      if (!isHealthy) {
        allHealthy = false;
      }
    }

    return { healthy: allHealthy, details };
  }

  public resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}