/**
 * Resilient API client with circuit breaker, retry logic, and graceful degradation
 */

import { CircuitBreaker, CircuitBreakerManager, CircuitBreakerConfig } from './circuit-breaker.js';
import { EnvironmentConfig } from './environment-config.js';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBackoff: boolean;
}

export interface ResilientApiConfig {
  circuitBreaker: CircuitBreakerConfig;
  retry: RetryConfig;
  timeoutMs: number;
}

export enum DegradationMode {
  FAIL = 'FAIL',           // Throw error
  MOCK = 'MOCK',           // Return mock response
  CACHE = 'CACHE',         // Use cached response
  BASIC = 'BASIC'          // Basic response without personalization
}

export interface ApiRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
  degradationMode?: DegradationMode;
  mockResponse?: any;
  cacheKey?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  degraded: boolean;
  degradationMode?: DegradationMode;
  responseTime: number;
  fromCache: boolean;
}

class ApiCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  set(key: string, data: any, ttlMs: number = 300000): void { // 5 minutes default
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export class ResilientApiClient {
  private circuitBreaker: CircuitBreaker;
  private config: ResilientApiConfig;
  private cache = new ApiCache();

  constructor(
    private serviceName: string,
    customConfig?: Partial<ResilientApiConfig>
  ) {
    const envConfig = EnvironmentConfig.getInstance();
    const envSettings = envConfig.getConfig();

    // Default configuration based on environment
    this.config = {
      circuitBreaker: {
        failureThreshold: envSettings.circuitBreakerThreshold,
        timeoutMs: envSettings.circuitBreakerTimeoutMs,
        monitoringPeriodMs: 60000, // 1 minute
        successThreshold: 3
      },
      retry: {
        maxRetries: envSettings.maxRetries,
        baseDelayMs: envSettings.retryDelayMs,
        maxDelayMs: 10000,
        exponentialBackoff: true
      },
      timeoutMs: 30000,
      ...customConfig
    };

    const breakerManager = CircuitBreakerManager.getInstance();
    this.circuitBreaker = breakerManager.getOrCreate(serviceName, this.config.circuitBreaker);
  }

  async execute<T>(request: ApiRequest): Promise<ApiResponse<T>> {
    const startTime = Date.now();

    try {
      const result = await this.circuitBreaker.execute(
        () => this.makeRequest<T>(request),
        () => this.handleDegradation<T>(request)
      );

      const responseTime = Date.now() - startTime;

      // Cache successful responses
      if (request.cacheKey && result.success && !result.degraded) {
        this.cache.set(request.cacheKey, result.data);
      }

      return {
        ...result,
        responseTime,
        fromCache: false
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;

      // Try degradation as last resort
      const degradedResult = await this.handleDegradation<T>(request);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        degraded: true,
        degradationMode: request.degradationMode || DegradationMode.FAIL,
        responseTime,
        fromCache: degradedResult.fromCache,
        data: degradedResult.data
      };
    }
  }

  private async makeRequest<T>(request: ApiRequest): Promise<ApiResponse<T>> {
    return await this.retryWrapper(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: {
            'Content-Type': 'application/json',
            ...request.headers
          },
          body: request.body ? JSON.stringify(request.body) : undefined,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        return {
          success: true,
          data,
          degraded: false,
          responseTime: 0, // Will be set by execute()
          fromCache: false
        };

      } finally {
        clearTimeout(timeoutId);
      }
    });
  }

  private async retryWrapper<T>(fn: () => Promise<ApiResponse<T>>): Promise<ApiResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retry.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt === this.config.retry.maxRetries) {
          break; // No more retries
        }

        // Calculate delay with exponential backoff
        let delay = this.config.retry.baseDelayMs;
        if (this.config.retry.exponentialBackoff) {
          delay = Math.min(
            this.config.retry.baseDelayMs * Math.pow(2, attempt),
            this.config.retry.maxDelayMs
          );
        }

        // Add jitter to prevent thundering herd
        delay = delay + Math.random() * delay * 0.1;

        console.warn(`API request failed (attempt ${attempt + 1}/${this.config.retry.maxRetries + 1}), retrying in ${delay}ms:`, lastError.message);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  private async handleDegradation<T>(request: ApiRequest): Promise<ApiResponse<T>> {
    const mode = request.degradationMode || DegradationMode.FAIL;

    switch (mode) {
      case DegradationMode.CACHE:
        if (request.cacheKey) {
          const cachedData = this.cache.get(request.cacheKey);
          if (cachedData) {
            console.warn(`Using cached response for ${this.serviceName}`);
            return {
              success: true,
              data: cachedData,
              degraded: true,
              degradationMode: mode,
              responseTime: 0,
              fromCache: true
            };
          }
        }
      // Fall through to MOCK if no cache

      case DegradationMode.MOCK:
        if (request.mockResponse) {
          console.warn(`Using mock response for ${this.serviceName}`);
          return {
            success: true,
            data: request.mockResponse,
            degraded: true,
            degradationMode: mode,
            responseTime: 0,
            fromCache: false
          };
        }
      // Fall through to BASIC if no mock

      case DegradationMode.BASIC:
        console.warn(`Using basic degraded response for ${this.serviceName}`);
        return {
          success: true,
          data: this.getBasicResponse<T>(),
          degraded: true,
          degradationMode: mode,
          responseTime: 0,
          fromCache: false
        };

      case DegradationMode.FAIL:
      default:
        throw new Error(`Service ${this.serviceName} is unavailable and no degradation strategy configured`);
    }
  }

  private getBasicResponse<T>(): T {
    // Basic fallback responses for different service types
    const basicResponses: Record<string, any> = {
      'user-progress': {
        success: true,
        message: 'Progress update queued (degraded mode)',
        degraded: true
      },
      'user-context': {
        user_id: 'unknown',
        preferences: {
          language_learning: 'english',
          learning_pace: 'moderate'
        },
        progress: {
          total_sessions: 0,
          words_learned: 0
        },
        degraded: true
      },
      'health-check': {
        status: 'degraded',
        message: 'Service operating in degraded mode'
      }
    };

    return basicResponses[this.serviceName] || { success: false, degraded: true } as T;
  }

  // Health check methods
  getHealth() {
    return {
      serviceName: this.serviceName,
      circuitBreaker: this.circuitBreaker.getMetrics(),
      cacheSize: this.cache.size()
    };
  }

  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  clearCache(): void {
    this.cache.clear();
  }
}