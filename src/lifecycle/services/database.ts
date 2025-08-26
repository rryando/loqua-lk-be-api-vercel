import { SupabaseClient } from '@supabase/supabase-js';
import { LifecycleService } from '../manager.js';

export class DatabaseService implements LifecycleService {
    name = 'database';

    constructor(private supabase: SupabaseClient) { }

    async start(): Promise<void> {
        // Test database connection
        const { error } = await this.supabase.from('users').select('count').limit(1);
        if (error) {
            throw new Error(`Database connection failed: ${error.message}`);
        }
    }

    async stop(): Promise<void> {
        // Supabase client doesn't need explicit cleanup in most cases
        // Any pending requests will be handled by the underlying HTTP client
    }

    async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details?: any }> {
        try {
            const start = Date.now();
            const { error, count } = await this.supabase
                .from('users')
                .select('*', { count: 'exact', head: true });

            const latency = Date.now() - start;

            if (error) {
                return {
                    status: 'unhealthy',
                    details: {
                        error: error.message,
                        latency,
                    },
                };
            }

            return {
                status: 'healthy',
                details: {
                    latency,
                    user_count: count,
                    connection: 'active',
                },
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
            };
        }
    }
}
