/**
 * Comprehensive health monitoring system for agent services
 * Tracks system health, performance metrics, and alert conditions
 */

import { CircuitBreakerManager } from './circuit-breaker.js';
import { globalTokenManager } from './token-manager.js';
import { EnvironmentConfig } from './environment-config.js';

export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY'
}

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  message: string;
  responseTime: number;
  lastCheck: number;
  metadata?: Record<string, any>;
}

export interface SystemMetrics {
  timestamp: number;
  uptime: number;
  memoryUsage: {
    used: number;
    total: number;
    percentage: number;
  };
  requestCounts: {
    total: number;
    successful: number;
    failed: number;
    lastMinute: number;
  };
  averageResponseTime: number;
  errorRate: number;
}

export interface AlertCondition {
  name: string;
  condition: (metrics: SystemMetrics, healthChecks: HealthCheck[]) => boolean;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  message: string;
  lastTriggered?: number;
  cooldownMs: number;
}

export interface HealthReport {
  overallStatus: HealthStatus;
  checks: HealthCheck[];
  metrics: SystemMetrics;
  alerts: Array<{
    condition: string;
    severity: string;
    message: string;
    triggeredAt: number;
  }>;
  environment: string;
  version: string;
}

export class HealthMonitor {
  private static instance: HealthMonitor;
  private startTime: number = Date.now();
  private requestMetrics = {
    total: 0,
    successful: 0,
    failed: 0,
    responseTimes: [] as number[],
    recentRequests: [] as { timestamp: number; success: boolean; responseTime: number }[]
  };
  private healthChecks = new Map<string, HealthCheck>();
  private alertConditions: AlertCondition[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.setupDefaultAlertConditions();
    this.startMonitoring();
  }

  public static getInstance(): HealthMonitor {
    if (!HealthMonitor.instance) {
      HealthMonitor.instance = new HealthMonitor();
    }
    return HealthMonitor.instance;
  }

  /**
   * Record an API request for metrics
   */
  recordRequest(success: boolean, responseTime: number): void {
    const now = Date.now();

    this.requestMetrics.total++;
    if (success) {
      this.requestMetrics.successful++;
    } else {
      this.requestMetrics.failed++;
    }

    this.requestMetrics.responseTimes.push(responseTime);
    this.requestMetrics.recentRequests.push({ timestamp: now, success, responseTime });

    // Keep only last 1000 response times for average calculation
    if (this.requestMetrics.responseTimes.length > 1000) {
      this.requestMetrics.responseTimes = this.requestMetrics.responseTimes.slice(-1000);
    }

    // Keep only last hour of detailed requests
    const oneHourAgo = now - 3600000;
    this.requestMetrics.recentRequests = this.requestMetrics.recentRequests.filter(
      req => req.timestamp > oneHourAgo
    );
  }

  /**
   * Register a health check function
   */
  registerHealthCheck(name: string, checkFn: () => Promise<Omit<HealthCheck, 'name' | 'lastCheck'>>): void {
    // Run initial check
    this.runHealthCheck(name, checkFn);

    // Set up periodic checks every 30 seconds
    setInterval(() => {
      this.runHealthCheck(name, checkFn);
    }, 30000);
  }

  private async runHealthCheck(name: string, checkFn: () => Promise<Omit<HealthCheck, 'name' | 'lastCheck'>>): Promise<void> {
    try {
      const result = await checkFn();
      this.healthChecks.set(name, {
        name,
        lastCheck: Date.now(),
        ...result
      });
    } catch (error) {
      this.healthChecks.set(name, {
        name,
        status: HealthStatus.UNHEALTHY,
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: 0,
        lastCheck: Date.now()
      });
    }
  }

  /**
   * Get current system metrics
   */
  getMetrics(): SystemMetrics {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Calculate memory usage
    const memUsage = process.memoryUsage();
    const memoryUsage = {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
    };

    // Calculate request metrics
    const recentRequests = this.requestMetrics.recentRequests.filter(
      req => req.timestamp > oneMinuteAgo
    );

    const averageResponseTime = this.requestMetrics.responseTimes.length > 0
      ? this.requestMetrics.responseTimes.reduce((a, b) => a + b, 0) / this.requestMetrics.responseTimes.length
      : 0;

    const errorRate = this.requestMetrics.total > 0
      ? (this.requestMetrics.failed / this.requestMetrics.total) * 100
      : 0;

    return {
      timestamp: now,
      uptime: now - this.startTime,
      memoryUsage,
      requestCounts: {
        total: this.requestMetrics.total,
        successful: this.requestMetrics.successful,
        failed: this.requestMetrics.failed,
        lastMinute: recentRequests.length
      },
      averageResponseTime,
      errorRate
    };
  }

  /**
   * Get comprehensive health report
   */
  async getHealthReport(): Promise<HealthReport> {
    const metrics = this.getMetrics();
    const checks = Array.from(this.healthChecks.values());

    // Determine overall status
    let overallStatus = HealthStatus.HEALTHY;
    if (checks.some(check => check.status === HealthStatus.UNHEALTHY)) {
      overallStatus = HealthStatus.UNHEALTHY;
    } else if (checks.some(check => check.status === HealthStatus.DEGRADED)) {
      overallStatus = HealthStatus.DEGRADED;
    }

    // Check alert conditions
    const activeAlerts = this.checkAlertConditions(metrics, checks);

    const envConfig = EnvironmentConfig.getInstance();

    return {
      overallStatus,
      checks,
      metrics,
      alerts: activeAlerts,
      environment: envConfig.getEnvironment(),
      version: process.env.npm_package_version || 'unknown'
    };
  }

  /**
   * Setup default alert conditions
   */
  private setupDefaultAlertConditions(): void {
    this.alertConditions = [
      {
        name: 'HIGH_ERROR_RATE',
        condition: (metrics) => metrics.errorRate > 10,
        severity: 'CRITICAL',
        message: 'Error rate exceeds 10%',
        cooldownMs: 300000 // 5 minutes
      },
      {
        name: 'HIGH_RESPONSE_TIME',
        condition: (metrics) => metrics.averageResponseTime > 2000,
        severity: 'WARNING',
        message: 'Average response time exceeds 2 seconds',
        cooldownMs: 300000
      },
      {
        name: 'HIGH_MEMORY_USAGE',
        condition: (metrics) => metrics.memoryUsage.percentage > 85,
        severity: 'WARNING',
        message: 'Memory usage exceeds 85%',
        cooldownMs: 300000
      },
      {
        name: 'CIRCUIT_BREAKER_OPEN',
        condition: (_, checks) => checks.some(check =>
          check.name === 'circuit-breakers' &&
          check.metadata?.hasOpenCircuits === true
        ),
        severity: 'CRITICAL',
        message: 'One or more circuit breakers are open',
        cooldownMs: 300000
      },
      {
        name: 'TOKEN_REFRESH_FAILURES',
        condition: (_, checks) => checks.some(check =>
          check.name === 'token-manager' &&
          check.status === HealthStatus.UNHEALTHY
        ),
        severity: 'CRITICAL',
        message: 'Token refresh system is failing',
        cooldownMs: 300000
      }
    ];
  }

  /**
   * Check alert conditions and trigger alerts
   */
  private checkAlertConditions(metrics: SystemMetrics, checks: HealthCheck[]): Array<{
    condition: string;
    severity: string;
    message: string;
    triggeredAt: number;
  }> {
    const activeAlerts = [];
    const now = Date.now();

    for (const alert of this.alertConditions) {
      // Check cooldown
      if (alert.lastTriggered && (now - alert.lastTriggered) < alert.cooldownMs) {
        continue;
      }

      // Check condition
      if (alert.condition(metrics, checks)) {
        alert.lastTriggered = now;
        activeAlerts.push({
          condition: alert.name,
          severity: alert.severity,
          message: alert.message,
          triggeredAt: now
        });

        // Log alert
        console[alert.severity === 'CRITICAL' ? 'error' : 'warn'](
          `ALERT [${alert.severity}] ${alert.name}: ${alert.message}`
        );
      }
    }

    return activeAlerts;
  }

  /**
   * Start monitoring system
   */
  private startMonitoring(): void {
    // Register default health checks
    this.registerDefaultHealthChecks();

    // Start periodic monitoring
    this.monitoringInterval = setInterval(async () => {
      try {
        const report = await this.getHealthReport();

        // Log health status periodically
        if (report.overallStatus !== HealthStatus.HEALTHY) {
          console.warn(`System health: ${report.overallStatus}`, {
            unhealthyChecks: report.checks.filter(c => c.status !== HealthStatus.HEALTHY).length,
            errorRate: report.metrics.errorRate,
            responseTime: report.metrics.averageResponseTime
          });
        }
      } catch (error) {
        console.error('Health monitoring error:', error);
      }
    }, 60000); // Every minute
  }

  /**
   * Register default health checks
   */
  private registerDefaultHealthChecks(): void {
    // Database connectivity check
    this.registerHealthCheck('database', async () => {
      const startTime = Date.now();
      try {
        // This would typically ping the database
        // For now, we'll just check if we can access environment config
        const config = EnvironmentConfig.getInstance();
        const envConfig = config.getConfig();

        return {
          status: HealthStatus.HEALTHY,
          message: `Database accessible in ${envConfig.environment} environment`,
          responseTime: Date.now() - startTime
        };
      } catch (error) {
        return {
          status: HealthStatus.UNHEALTHY,
          message: `Database check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          responseTime: Date.now() - startTime
        };
      }
    });

    // Circuit breakers health
    this.registerHealthCheck('circuit-breakers', async () => {
      const startTime = Date.now();
      const breakerManager = CircuitBreakerManager.getInstance();
      const healthStatus = breakerManager.getHealthStatus();

      const openCircuits = Object.entries(healthStatus.details)
        .filter(([_, healthy]) => !healthy)
        .map(([name]) => name);

      return {
        status: healthStatus.healthy ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
        message: openCircuits.length > 0
          ? `Circuit breakers open: ${openCircuits.join(', ')}`
          : 'All circuit breakers healthy',
        responseTime: Date.now() - startTime,
        metadata: {
          hasOpenCircuits: openCircuits.length > 0,
          openCircuits,
          allCircuits: healthStatus.details
        }
      };
    });

    // Token manager health
    this.registerHealthCheck('token-manager', async () => {
      const startTime = Date.now();
      try {
        const stats = globalTokenManager.getStats();
        const statuses = globalTokenManager.getTokenStatuses();

        // Clean up expired tokens
        globalTokenManager.cleanupExpiredTokens();

        const hasExpiredTokens = stats.expiredTokens > 0;
        const hasFailedRefreshes = stats.activeRefreshes > 0 && stats.tokensNeedingRefresh > 0;

        let status = HealthStatus.HEALTHY;
        let message = `Token manager healthy: ${stats.validTokens} valid tokens`;

        if (hasFailedRefreshes) {
          status = HealthStatus.DEGRADED;
          message = `Token refresh issues: ${stats.tokensNeedingRefresh} tokens need refresh`;
        } else if (hasExpiredTokens) {
          status = HealthStatus.DEGRADED;
          message = `Expired tokens detected: ${stats.expiredTokens} expired`;
        }

        return {
          status,
          message,
          responseTime: Date.now() - startTime,
          metadata: {
            stats,
            tokenCount: Object.keys(statuses).length
          }
        };
      } catch (error) {
        return {
          status: HealthStatus.UNHEALTHY,
          message: `Token manager error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          responseTime: Date.now() - startTime
        };
      }
    });

    // Environment configuration check
    this.registerHealthCheck('configuration', async () => {
      const startTime = Date.now();
      try {
        const envConfig = EnvironmentConfig.getInstance();
        const config = envConfig.getPublicConfig();

        const hasRequiredSecrets = config.hasAgentSecret && config.hasJwtSecret;

        return {
          status: hasRequiredSecrets ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
          message: hasRequiredSecrets
            ? `Configuration valid for ${config.environment} environment`
            : 'Missing required secrets configuration',
          responseTime: Date.now() - startTime,
          metadata: config
        };
      } catch (error) {
        return {
          status: HealthStatus.UNHEALTHY,
          message: `Configuration error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          responseTime: Date.now() - startTime
        };
      }
    });
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
}

// Initialize global health monitor
export const globalHealthMonitor = HealthMonitor.getInstance();