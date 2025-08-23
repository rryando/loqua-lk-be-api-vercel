/**
 * Request batching and caching utilities optimized for Vercel serverless environment
 * Reduces database load and improves response times
 */

export interface BatchRequest {
  id: string;
  type: 'progress_update' | 'vocabulary_insert' | 'achievement_unlock';
  data: any;
  userId: string;
  sessionId?: string;
  timestamp: number;
}

export interface BatchResult {
  id: string;
  success: boolean;
  error?: string;
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  key: string;
}

export class RequestBatcher {
  private static instance: RequestBatcher;
  private batchQueue = new Map<string, BatchRequest[]>();
  private batchTimers = new Map<string, NodeJS.Timeout>();
  private readonly batchSizeLimit = 10;
  // Removed unused batchTimeoutMs - using maxBatchDelay instead
  private readonly maxBatchDelay = 5000; // 5 seconds max delay

  private constructor() {}

  public static getInstance(): RequestBatcher {
    if (!RequestBatcher.instance) {
      RequestBatcher.instance = new RequestBatcher();
    }
    return RequestBatcher.instance;
  }

  /**
   * Add a request to the batch queue
   */
  async addToBatch(request: BatchRequest): Promise<void> {
    const batchKey = this.getBatchKey(request);
    
    // Initialize batch if it doesn't exist
    if (!this.batchQueue.has(batchKey)) {
      this.batchQueue.set(batchKey, []);
    }

    const batch = this.batchQueue.get(batchKey)!;
    batch.push(request);

    // If batch is full, process immediately
    if (batch.length >= this.batchSizeLimit) {
      await this.processBatch(batchKey);
      return;
    }

    // Set or reset the batch timer
    this.setBatchTimer(batchKey);
  }

  /**
   * Process a batch of requests
   */
  private async processBatch(batchKey: string): Promise<BatchResult[]> {
    const batch = this.batchQueue.get(batchKey);
    if (!batch || batch.length === 0) {
      return [];
    }

    // Clear the batch and timer
    this.batchQueue.delete(batchKey);
    const timer = this.batchTimers.get(batchKey);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(batchKey);
    }

    console.log(`Processing batch ${batchKey} with ${batch.length} requests`);

    try {
      const results = await this.executeBatch(batch);
      console.log(`Batch ${batchKey} completed: ${results.filter(r => r.success).length}/${results.length} successful`);
      return results;
    } catch (error) {
      console.error(`Batch ${batchKey} failed:`, error);
      return batch.map(req => ({
        id: req.id,
        success: false,
        error: error instanceof Error ? error.message : 'Batch processing failed'
      }));
    }
  }

  /**
   * Execute a batch of requests based on type
   */
  private async executeBatch(batch: BatchRequest[]): Promise<BatchResult[]> {
    // Group by request type
    const groupedRequests = batch.reduce((groups, request) => {
      if (!groups[request.type]) {
        groups[request.type] = [];
      }
      groups[request.type].push(request);
      return groups;
    }, {} as Record<string, BatchRequest[]>);

    const allResults: BatchResult[] = [];

    // Process each group
    for (const [type, requests] of Object.entries(groupedRequests)) {
      switch (type) {
        case 'progress_update':
          allResults.push(...await this.batchProgressUpdates(requests));
          break;
        case 'vocabulary_insert':
          allResults.push(...await this.batchVocabularyInserts(requests));
          break;
        case 'achievement_unlock':
          allResults.push(...await this.batchAchievementUnlocks(requests));
          break;
        default:
          allResults.push(...requests.map(req => ({
            id: req.id,
            success: false,
            error: `Unknown request type: ${type}`
          })));
      }
    }

    return allResults;
  }

  /**
   * Batch process progress updates
   */
  private async batchProgressUpdates(requests: BatchRequest[]): Promise<BatchResult[]> {
    // Group by user for efficient updates
    const userUpdates = new Map<string, BatchRequest[]>();
    
    for (const request of requests) {
      if (!userUpdates.has(request.userId)) {
        userUpdates.set(request.userId, []);
      }
      userUpdates.get(request.userId)!.push(request);
    }

    const results: BatchResult[] = [];

    for (const [userId, userRequests] of userUpdates) {
      try {
        // Aggregate all progress updates for this user
        const aggregatedProgress = this.aggregateProgressUpdates(userRequests);
        
        // Single database update per user
        // This would integrate with your Supabase client
        console.log(`Updating progress for user ${userId}:`, aggregatedProgress);
        
        // Mark all requests as successful
        results.push(...userRequests.map(req => ({
          id: req.id,
          success: true
        })));

      } catch (error) {
        // Mark all requests for this user as failed
        results.push(...userRequests.map(req => ({
          id: req.id,
          success: false,
          error: error instanceof Error ? error.message : 'Progress update failed'
        })));
      }
    }

    return results;
  }

  /**
   * Batch process vocabulary insertions
   */
  private async batchVocabularyInserts(requests: BatchRequest[]): Promise<BatchResult[]> {
    try {
      // Collect all vocabulary items
      const vocabularyItems = requests.flatMap(req => req.data.vocabulary || []);
      
      if (vocabularyItems.length === 0) {
        return requests.map(req => ({ id: req.id, success: true }));
      }

      // Bulk insert vocabulary
      console.log(`Bulk inserting ${vocabularyItems.length} vocabulary items`);
      
      // This would be a single bulk insert to your database
      // await supabase.from('vocabulary').insert(vocabularyItems);

      return requests.map(req => ({ id: req.id, success: true }));

    } catch (error) {
      return requests.map(req => ({
        id: req.id,
        success: false,
        error: error instanceof Error ? error.message : 'Vocabulary insert failed'
      }));
    }
  }

  /**
   * Batch process achievement unlocks
   */
  private async batchAchievementUnlocks(requests: BatchRequest[]): Promise<BatchResult[]> {
    try {
      // Group achievements by user
      const userAchievements = new Map<string, Set<string>>();
      
      for (const request of requests) {
        if (!userAchievements.has(request.userId)) {
          userAchievements.set(request.userId, new Set());
        }
        const achievements = request.data.achievements || [];
        achievements.forEach((achievement: string) => {
          userAchievements.get(request.userId)!.add(achievement);
        });
      }

      // Bulk update achievements per user
      for (const [userId, achievements] of userAchievements) {
        console.log(`Unlocking ${achievements.size} achievements for user ${userId}`);
        // This would update the user's achievement list
      }

      return requests.map(req => ({ id: req.id, success: true }));

    } catch (error) {
      return requests.map(req => ({
        id: req.id,
        success: false,
        error: error instanceof Error ? error.message : 'Achievement unlock failed'
      }));
    }
  }

  /**
   * Aggregate multiple progress updates into a single update
   */
  private aggregateProgressUpdates(requests: BatchRequest[]): any {
    const aggregated = {
      words_learned: 0,
      phrases_practiced: 0,
      pronunciation_scores: [] as number[],
      grammar_points: new Set<string>(),
      session_time: 0
    };

    for (const request of requests) {
      const progress = request.data.progress || {};
      
      aggregated.words_learned += progress.words_learned || 0;
      aggregated.phrases_practiced += progress.phrases_practiced || 0;
      
      if (progress.pronunciation_score) {
        aggregated.pronunciation_scores.push(progress.pronunciation_score);
      }
      
      if (progress.grammar_points) {
        progress.grammar_points.forEach((point: string) => {
          aggregated.grammar_points.add(point);
        });
      }

      aggregated.session_time += progress.session_time || 0;
    }

    return {
      words_learned: aggregated.words_learned,
      phrases_practiced: aggregated.phrases_practiced,
      pronunciation_score_avg: aggregated.pronunciation_scores.length > 0
        ? aggregated.pronunciation_scores.reduce((a, b) => a + b, 0) / aggregated.pronunciation_scores.length
        : undefined,
      grammar_points_covered: Array.from(aggregated.grammar_points),
      total_session_time: aggregated.session_time
    };
  }

  /**
   * Set or reset batch timer
   */
  private setBatchTimer(batchKey: string): void {
    // Clear existing timer
    const existingTimer = this.batchTimers.get(batchKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      await this.processBatch(batchKey);
    }, this.maxBatchDelay);

    this.batchTimers.set(batchKey, timer);
  }

  /**
   * Generate batch key for grouping requests
   */
  private getBatchKey(request: BatchRequest): string {
    // Group by type and user for efficient batching
    return `${request.type}:${request.userId}`;
  }

  /**
   * Force process all pending batches (useful for shutdown)
   */
  async flushAll(): Promise<void> {
    const batchKeys = Array.from(this.batchQueue.keys());
    const flushPromises = batchKeys.map(key => this.processBatch(key));
    
    await Promise.allSettled(flushPromises);
  }

  /**
   * Get current batch statistics
   */
  getStats() {
    const totalPending = Array.from(this.batchQueue.values())
      .reduce((total, batch) => total + batch.length, 0);

    return {
      pendingBatches: this.batchQueue.size,
      totalPendingRequests: totalPending,
      activeBatchTimers: this.batchTimers.size
    };
  }
}

/**
 * Simple in-memory cache optimized for Vercel serverless
 */
export class VercelCache {
  private static instance: VercelCache;
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize = 1000; // Limit memory usage

  private constructor() {
    // Clean up expired entries periodically
    setInterval(() => {
      this.cleanup();
    }, 300000); // Every 5 minutes
  }

  public static getInstance(): VercelCache {
    if (!VercelCache.instance) {
      VercelCache.instance = new VercelCache();
    }
    return VercelCache.instance;
  }

  /**
   * Set cache entry with TTL
   */
  set<T>(key: string, data: T, ttlMs: number = 300000): void {
    // Check cache size limit
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
      key
    });
  }

  /**
   * Get cache entry if not expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Get or set cache entry with factory function
   */
  async getOrSet<T>(
    key: string, 
    factory: () => Promise<T>, 
    ttlMs: number = 300000
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await factory();
    this.set(key, data, ttlMs);
    return data;
  }

  /**
   * Delete cache entry
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`Cache cleanup: removed ${removedCount} expired entries`);
    }
  }

  /**
   * Evict oldest entries when cache is full
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let expiredCount = 0;
    let totalSize = 0;

    for (const entry of this.cache.values()) {
      if (now - entry.timestamp > entry.ttl) {
        expiredCount++;
      }
      // Rough estimate of memory usage
      totalSize += JSON.stringify(entry.data).length;
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      expiredEntries: expiredCount,
      estimatedMemoryKB: Math.round(totalSize / 1024),
      hitRate: 0 // Would need hit/miss tracking for accurate rate
    };
  }
}

// Global instances
export const globalRequestBatcher = RequestBatcher.getInstance();
export const globalCache = VercelCache.getInstance();