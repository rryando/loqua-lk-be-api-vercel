/**
 * Environment-specific configuration management for agent operations
 * Supports development, staging, and production environments
 */

export type Environment = 'development' | 'staging' | 'production';

export interface AgentConfig {
  environment: Environment;
  agentTokenSecret: string;
  jwtSecret: string;
  apiBaseUrl: string;
  tokenExpirySeconds: number;
  tokenRefreshThresholdSeconds: number;
  maxRetries: number;
  retryDelayMs: number;
  circuitBreakerThreshold: number;
  circuitBreakerTimeoutMs: number;
}

export class EnvironmentConfig {
  private static instance: EnvironmentConfig;
  private config: AgentConfig;

  private constructor() {
    this.config = this.loadConfiguration();
  }

  public static getInstance(): EnvironmentConfig {
    if (!EnvironmentConfig.instance) {
      EnvironmentConfig.instance = new EnvironmentConfig();
    }
    return EnvironmentConfig.instance;
  }

  private detectEnvironment(): Environment {
    const env = process.env.NODE_ENV?.toLowerCase() || import.meta.env?.MODE?.toLowerCase();

    if (env === 'production' || process.env.VERCEL_ENV === 'production') {
      return 'production';
    }
    if (env === 'preview' || process.env.VERCEL_ENV === 'preview' || env === 'staging') {
      return 'staging';
    }
    return 'development';
  }

  private loadConfiguration(): AgentConfig {
    const environment = this.detectEnvironment();

    // Environment-specific secret keys
    const secretKey = this.getEnvironmentSecret(environment);
    const jwtSecret = this.getJwtSecretForEnvironment(environment);

    // Base configuration with environment-specific overrides
    const baseConfig: AgentConfig = {
      environment,
      agentTokenSecret: secretKey,
      jwtSecret: jwtSecret,
      apiBaseUrl: this.getApiBaseUrl(environment),
      tokenExpirySeconds: 3600, // 1 hour
      tokenRefreshThresholdSeconds: 300, // 5 minutes before expiry
      maxRetries: 3,
      retryDelayMs: 1000,
      circuitBreakerThreshold: 5, // failures before opening circuit
      circuitBreakerTimeoutMs: 30000, // 30 seconds
    };

    // Environment-specific overrides
    switch (environment) {
      case 'development':
        return {
          ...baseConfig,
          tokenExpirySeconds: 7200, // 2 hours for dev convenience
          maxRetries: 5, // More retries for unstable dev environments
          retryDelayMs: 500, // Faster retries in dev
        };

      case 'staging':
        return {
          ...baseConfig,
          tokenExpirySeconds: 3600, // 1 hour
          maxRetries: 3,
          retryDelayMs: 1000,
        };

      case 'production':
        return {
          ...baseConfig,
          tokenExpirySeconds: 3600, // 1 hour
          maxRetries: 2, // Conservative retries in prod
          retryDelayMs: 2000, // Longer delays to avoid overwhelming services
          circuitBreakerThreshold: 3, // More sensitive circuit breaker
        };

      default:
        return baseConfig;
    }
  }

  private getEnvironmentSecret(environment: Environment): string {
    // Try environment-specific secrets first
    const secrets = {
      development: process.env.DEV_AGENT_SECRET || import.meta.env?.VITE_DEV_AGENT_SECRET,
      staging: process.env.STAGING_AGENT_SECRET || import.meta.env?.VITE_STAGING_AGENT_SECRET,
      production: process.env.PROD_AGENT_SECRET || import.meta.env?.VITE_PROD_AGENT_SECRET,
    };

    const envSecret = secrets[environment];
    if (envSecret) {
      return envSecret;
    }

    // Fallback to generic secrets
    const fallbackSecret = process.env.AGENT_TOKEN_SECRET ||
      process.env.SHARED_SECRET ||
      import.meta.env?.VITE_AGENT_TOKEN_SECRET ||
      import.meta.env?.VITE_SHARED_SECRET;

    if (!fallbackSecret) {
      throw new Error(`No agent token secret found for environment: ${environment}. Please set ${environment.toUpperCase()}_AGENT_SECRET or AGENT_TOKEN_SECRET`);
    }

    console.warn(`Using fallback secret for ${environment} environment. Consider setting ${environment.toUpperCase()}_AGENT_SECRET`);
    return fallbackSecret;
  }

  private getJwtSecretForEnvironment(environment: Environment): string {
    // Try environment-specific JWT secrets
    const jwtSecrets = {
      development: process.env.DEV_JWT_SECRET || import.meta.env?.VITE_DEV_JWT_SECRET,
      staging: process.env.STAGING_JWT_SECRET || import.meta.env?.VITE_STAGING_JWT_SECRET,
      production: process.env.PROD_JWT_SECRET || import.meta.env?.VITE_PROD_JWT_SECRET,
    };

    const envJwtSecret = jwtSecrets[environment];
    if (envJwtSecret) {
      return envJwtSecret;
    }

    // Fallback to generic JWT secrets
    const fallbackJwtSecret = process.env.JWT_SECRET ||
      process.env.VITE_JWT_SECRET ||
      import.meta.env?.VITE_JWT_SECRET;

    if (!fallbackJwtSecret) {
      throw new Error(`No JWT secret found for environment: ${environment}. Please set ${environment.toUpperCase()}_JWT_SECRET or JWT_SECRET`);
    }

    return fallbackJwtSecret;
  }

  private getApiBaseUrl(environment: Environment): string {
    // Environment-specific API URLs
    const apiUrls = {
      development: process.env.DEV_API_BASE_URL || import.meta.env?.VITE_DEV_API_BASE_URL || 'http://localhost:3000',
      staging: process.env.STAGING_API_BASE_URL || import.meta.env?.VITE_STAGING_API_BASE_URL || 'https://staging-api.loqua.app',
      production: process.env.PROD_API_BASE_URL || import.meta.env?.VITE_PROD_API_BASE_URL || 'https://api.loqua.app',
    };

    return apiUrls[environment] || process.env.API_BASE_URL || import.meta.env?.VITE_API_BASE_URL || apiUrls.development;
  }

  public getConfig(): AgentConfig {
    return { ...this.config };
  }

  public getSecret(): string {
    return this.config.agentTokenSecret;
  }

  public getJwtSecret(): string {
    return this.config.jwtSecret;
  }

  public getEnvironment(): Environment {
    return this.config.environment;
  }

  public isProduction(): boolean {
    return this.config.environment === 'production';
  }

  public isDevelopment(): boolean {
    return this.config.environment === 'development';
  }

  // Utility method for logging configuration (without secrets)
  public getPublicConfig() {
    const { agentTokenSecret, jwtSecret, ...publicConfig } = this.config;
    return {
      ...publicConfig,
      hasAgentSecret: !!agentTokenSecret,
      hasJwtSecret: !!jwtSecret,
    };
  }
}