/**
 * Token lifecycle management with automatic refresh and validation
 */

import * as jwt from 'jsonwebtoken';
import { TokenEncryption } from './token-encryption.js';
import { EnvironmentConfig } from './environment-config.js';
import { ResilientApiClient, ApiRequest, DegradationMode } from './resilient-api.js';

export interface TokenInfo {
  token: string;
  encryptedToken?: string;
  expiresAt: number;
  issuedAt: number;
  userId: string;
  agentId: string;
  roomName: string;
}

export interface TokenValidationResult {
  isValid: boolean;
  expiresIn: number;
  needsRefresh: boolean;
  error?: string;
}

export class TokenManager {
  private tokens = new Map<string, TokenInfo>();
  private refreshPromises = new Map<string, Promise<TokenInfo>>();
  private apiClient: ResilientApiClient;
  private config = EnvironmentConfig.getInstance().getConfig();

  constructor(apiBaseUrl?: string) {
    this.apiClient = new ResilientApiClient('token-service', {
      circuitBreaker: {
        failureThreshold: 3,
        timeoutMs: 30000,
        monitoringPeriodMs: 60000,
        successThreshold: 2
      },
      retry: {
        maxRetries: 2,
        baseDelayMs: 1000,
        maxDelayMs: 5000,
        exponentialBackoff: true
      }
    });
  }

  /**
   * Request a new encrypted user token from the API
   */
  async requestUserToken(
    roomName: string,
    userId: string,
    agentId: string,
    agentJwt: string
  ): Promise<TokenInfo> {
    const tokenKey = this.getTokenKey(roomName, userId, agentId);

    // Check if there's already a refresh in progress
    const existingRefresh = this.refreshPromises.get(tokenKey);
    if (existingRefresh) {
      console.log(`Token refresh already in progress for ${tokenKey}, waiting...`);
      return await existingRefresh;
    }

    // Start new token request
    const refreshPromise = this.doRequestUserToken(roomName, userId, agentId, agentJwt);
    this.refreshPromises.set(tokenKey, refreshPromise);

    try {
      const tokenInfo = await refreshPromise;
      this.tokens.set(tokenKey, tokenInfo);
      console.log(`Successfully obtained token for user ${userId} in room ${roomName}`);
      return tokenInfo;
    } finally {
      this.refreshPromises.delete(tokenKey);
    }
  }

  private async doRequestUserToken(
    roomName: string,
    userId: string,
    agentId: string,
    agentJwt: string
  ): Promise<TokenInfo> {
    const request: ApiRequest = {
      method: 'POST',
      url: '/api/v1/agent/user-token',
      headers: {
        'Authorization': `Bearer ${agentJwt}`,
        'X-Agent-ID': agentId
      },
      body: {
        room_name: roomName,
        user_id: userId,
        agent_id: agentId
      },
      degradationMode: DegradationMode.FAIL // Token requests can't be degraded
    };

    const response = await this.apiClient.execute(request);

    if (!response.success || !response.data) {
      throw new Error(`Failed to request user token: ${response.error}`);
    }

    const { encrypted_token, expires_in, issued_at } = response.data as {
      encrypted_token: string;
      expires_in: number;
      issued_at: string;
    };

    // Decrypt the token
    const decryptedToken = TokenEncryption.decrypt(encrypted_token, this.config.agentTokenSecret);

    // Validate the decrypted token format
    if (!TokenEncryption.validateTokenFormat(decryptedToken)) {
      throw new Error('Received invalid JWT token format');
    }

    const issuedAtMs = new Date(issued_at).getTime();
    const expiresAtMs = issuedAtMs + (expires_in * 1000);

    return {
      token: decryptedToken,
      encryptedToken: encrypted_token,
      expiresAt: expiresAtMs,
      issuedAt: issuedAtMs,
      userId,
      agentId,
      roomName
    };
  }

  /**
   * Get a valid token, refreshing if necessary
   */
  async getValidToken(
    roomName: string,
    userId: string,
    agentId: string,
    agentJwt: string
  ): Promise<string> {
    const tokenKey = this.getTokenKey(roomName, userId, agentId);
    let tokenInfo = this.tokens.get(tokenKey);

    // If no token exists, request a new one
    if (!tokenInfo) {
      tokenInfo = await this.requestUserToken(roomName, userId, agentId, agentJwt);
    }

    // Check if token needs refresh
    const validation = this.validateToken(tokenInfo);

    if (!validation.isValid) {
      console.log(`Token for ${tokenKey} is invalid: ${validation.error}`);
      tokenInfo = await this.requestUserToken(roomName, userId, agentId, agentJwt);
    } else if (validation.needsRefresh) {
      console.log(`Token for ${tokenKey} needs refresh (expires in ${validation.expiresIn}s)`);
      // Start background refresh but return current token
      this.backgroundRefresh(roomName, userId, agentId, agentJwt);
    }

    return tokenInfo.token;
  }

  /**
   * Validate a token and check if it needs refresh
   */
  validateToken(tokenInfo: TokenInfo): TokenValidationResult {
    const now = Date.now();
    const expiresIn = Math.floor((tokenInfo.expiresAt - now) / 1000);

    // Check if token is expired
    if (expiresIn <= 0) {
      return {
        isValid: false,
        expiresIn,
        needsRefresh: false,
        error: 'Token has expired'
      };
    }

    // Check if token is about to expire (needs refresh)
    const needsRefresh = expiresIn < this.config.tokenRefreshThresholdSeconds;

    // Validate JWT structure and claims
    try {
      const decoded = jwt.decode(tokenInfo.token, { complete: true });
      if (!decoded || typeof decoded === 'string') {
        return {
          isValid: false,
          expiresIn,
          needsRefresh: false,
          error: 'Invalid JWT structure'
        };
      }

      const payload = decoded.payload as any;
      if (payload.sub !== tokenInfo.userId) {
        return {
          isValid: false,
          expiresIn,
          needsRefresh: false,
          error: 'Token user ID mismatch'
        };
      }

    } catch (error) {
      return {
        isValid: false,
        expiresIn,
        needsRefresh: false,
        error: `JWT validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }

    return {
      isValid: true,
      expiresIn,
      needsRefresh
    };
  }

  /**
   * Start background token refresh
   */
  private async backgroundRefresh(
    roomName: string,
    userId: string,
    agentId: string,
    agentJwt: string
  ): Promise<void> {
    const tokenKey = this.getTokenKey(roomName, userId, agentId);

    // Avoid multiple background refreshes
    if (this.refreshPromises.has(tokenKey)) {
      return;
    }

    try {
      await this.requestUserToken(roomName, userId, agentId, agentJwt);
      console.log(`Background refresh completed for ${tokenKey}`);
    } catch (error) {
      console.error(`Background refresh failed for ${tokenKey}:`, error);
      // Keep the old token if refresh fails
    }
  }

  /**
   * Remove expired tokens from memory
   */
  cleanupExpiredTokens(): number {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, tokenInfo] of this.tokens.entries()) {
      if (tokenInfo.expiresAt <= now) {
        this.tokens.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`Cleaned up ${removedCount} expired tokens`);
    }

    return removedCount;
  }

  /**
   * Get all token statuses for monitoring
   */
  getTokenStatuses(): Record<string, { valid: boolean; expiresIn: number; needsRefresh: boolean }> {
    const statuses: Record<string, { valid: boolean; expiresIn: number; needsRefresh: boolean }> = {};

    for (const [key, tokenInfo] of this.tokens.entries()) {
      const validation = this.validateToken(tokenInfo);
      statuses[key] = {
        valid: validation.isValid,
        expiresIn: validation.expiresIn,
        needsRefresh: validation.needsRefresh
      };
    }

    return statuses;
  }

  /**
   * Force refresh all tokens
   */
  async refreshAllTokens(): Promise<void> {
    const refreshPromises: Promise<void>[] = [];

    for (const [key, tokenInfo] of this.tokens.entries()) {
      // We need agent JWT to refresh, which we don't have stored
      // This would need to be called with agent context
      console.warn(`Cannot refresh token ${key} without agent JWT context`);
    }

    await Promise.allSettled(refreshPromises);
  }

  /**
   * Clear all tokens
   */
  clearAllTokens(): void {
    this.tokens.clear();
    this.refreshPromises.clear();
    console.log('All tokens cleared');
  }

  /**
   * Get token cache size and stats
   */
  getStats() {
    const now = Date.now();
    let validCount = 0;
    let expiredCount = 0;
    let refreshNeededCount = 0;

    for (const tokenInfo of this.tokens.values()) {
      const validation = this.validateToken(tokenInfo);
      if (validation.isValid) {
        validCount++;
        if (validation.needsRefresh) {
          refreshNeededCount++;
        }
      } else {
        expiredCount++;
      }
    }

    return {
      totalTokens: this.tokens.size,
      validTokens: validCount,
      expiredTokens: expiredCount,
      tokensNeedingRefresh: refreshNeededCount,
      activeRefreshes: this.refreshPromises.size
    };
  }

  private getTokenKey(roomName: string, userId: string, agentId: string): string {
    return `${roomName}:${userId}:${agentId}`;
  }
}

// Singleton instance for global use
export const globalTokenManager = new TokenManager();