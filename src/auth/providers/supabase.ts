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
            // Create a new client instance with the token to verify the user
            const supabaseWithToken = createServerClient(this.supabaseUrl, this.supabaseAnonKey, {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                },
                cookies: {
                    getAll() { return []; },
                    setAll() { /* no-op */ },
                },
            });

            const { data: { user }, error } = await supabaseWithToken.auth.getUser();

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
            // Create a client instance with the token to sign out the specific session
            const supabaseWithToken = createServerClient(this.supabaseUrl, this.supabaseAnonKey, {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                },
                cookies: {
                    getAll() { return []; },
                    setAll() { /* no-op */ },
                },
            });

            await supabaseWithToken.auth.signOut();
        } catch (error) {
            console.error('Supabase sign out error:', error);
        }
    }

    // Get the underlying Supabase client for direct access if needed
    getClient(): SupabaseClient {
        return this.supabase;
    }
}
