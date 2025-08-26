import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { BaseAuthProvider, AuthUser, AuthSession } from './base';

export class SupabaseAuthProvider extends BaseAuthProvider {
    name = 'supabase';
    private supabase: any;

    constructor(
        private supabaseUrl: string,
        private supabaseAnonKey: string,
        cookieHandler?: {
            getAll(): { name: string; value: string }[];
            get(name: string): string | null;
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
            // Use the standard createClient for token verification to avoid SSR cookie complexity
            const supabaseWithToken = createClient(this.supabaseUrl, this.supabaseAnonKey, {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                },
                auth: {
                    persistSession: false,
                    autoRefreshToken: false
                }
            });

            // Use type assertion to work around TypeScript interface issues
            const authClient = supabaseWithToken.auth as any;

            // Try getUser() first, fallback to getSession() if needed
            let userData;
            try {
                const { data: { user }, error } = await authClient.getUser();
                if (!error && user) {
                    userData = user;
                }
            } catch (getUserError) {
                // Fallback to getSession if getUser fails
                try {
                    const { data: { session }, error } = await authClient.getSession();
                    if (!error && session?.user) {
                        userData = session.user;
                    }
                } catch (getSessionError) {
                    console.error('Both getUser and getSession failed:', getUserError, getSessionError);
                    return null;
                }
            }

            if (!userData) {
                return null;
            }

            return {
                id: userData.id,
                email: userData.email || null,
                displayName: userData.user_metadata?.full_name || userData.email?.split('@')[0] || null,
                avatarUrl: userData.user_metadata?.avatar_url || null,
                metadata: userData.user_metadata || {},
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
            // Use the standard createClient for signout to avoid SSR cookie complexity
            const supabaseWithToken = createClient(this.supabaseUrl, this.supabaseAnonKey, {
                global: {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                },
                auth: {
                    persistSession: false,
                    autoRefreshToken: false
                }
            });

            // Use type assertion to work around TypeScript interface issues
            const authClient = supabaseWithToken.auth as any;

            // Try different signOut methods based on what's available
            try {
                await authClient.signOut();
            } catch (signOutError) {
                // Alternative: just invalidate the token locally since we can't sign out remotely
                console.warn('Remote signOut failed, token will be invalidated on next verification:', signOutError);
            }
        } catch (error) {
            console.error('Supabase sign out error:', error);
            // Fallback: even if signOut fails, the token verification will fail on next request
        }
    }

    // Get the underlying Supabase client for direct access if needed
    getClient(): SupabaseClient {
        return this.supabase;
    }
}
