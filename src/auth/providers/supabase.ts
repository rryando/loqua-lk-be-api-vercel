import { createServerClient } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';
import { BaseAuthProvider, AuthUser, AuthSession } from './base';

export class SupabaseAuthProvider extends BaseAuthProvider {
    name = 'supabase';
    private supabase: SupabaseClient;

    constructor(
        private supabaseUrl: string,
        private supabaseAnonKey: string,
        cookieHandler?: {
            getAll(): { name: string; value: string }[];
            setAll(cookies: { name: string; value: string; options?: any }[]): void;
        }
    ) {
        super();

        this.supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
            cookies: cookieHandler || {
                getAll() { return []; },
                setAll() { /* no-op for server usage */ },
            },
        });
    }

    async verifyToken(token: string): Promise<AuthUser | null> {
        try {
            const { data: { user }, error } = await this.supabase.auth.getUser(token);

            if (error || !user) {
                return null;
            }

            return {
                id: user.id,
                email: user.email || null,
                displayName: user.user_metadata?.full_name || user.email?.split('@')[0] || null,
                avatarUrl: user.user_metadata?.avatar_url || null,
                metadata: user.user_metadata || {},
            };
        } catch (error) {
            console.error('Supabase token verification error:', error);
            return null;
        }
    }

    async getSession(token: string): Promise<AuthSession | null> {
        const user = await this.verifyToken(token);
        if (!user) return null;

        return {
            user,
            accessToken: token,
            // Supabase handles refresh tokens internally
        };
    }

    async signOut(token: string): Promise<void> {
        try {
            await this.supabase.auth.signOut();
        } catch (error) {
            console.error('Supabase sign out error:', error);
        }
    }

    // Get the underlying Supabase client for direct access if needed
    getClient(): SupabaseClient {
        return this.supabase;
    }
}
