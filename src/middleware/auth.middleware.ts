import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Context, MiddlewareHandler } from 'hono';
import { env } from 'hono/adapter';
import { setCookie } from 'hono/cookie';
// import { HTTPException } from 'hono/http-exception';
import { DatabaseUser, APIError } from '../types/index';
import { AuthManager } from '../auth/manager';
import { SupabaseAuthProvider } from '../auth/providers/supabase';
import { JWTAuthProvider } from '../auth/providers/jwt';
import { AgentAuthProvider } from '../auth/providers/agent';
import { AuthUser } from '../auth/providers/base';
import { EnvironmentConfig } from '../utils/environment-config';

declare module 'hono' {
  interface ContextVariableMap {
    supabase: SupabaseClient;
    authManager: AuthManager;
    user: AuthUser | null;
    dbUser: DatabaseUser | null;
  }
}

export const getSupabase = (c: Context) => {
  return c.get('supabase');
};

export const getCurrentUser = (c: Context) => {
  return c.get('user');
};

export const getAuthManager = (c: Context) => {
  return c.get('authManager');
};

export const getCurrentDbUser = (c: Context) => {
  return c.get('dbUser');
};

export const getAuthenticatedSupabase = (c: Context) => {
  const supabaseEnv = env<SupabaseEnv>(c);
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No authorization token found');
  }

  // For agent operations, use the service role key which bypasses RLS
  const serviceKey = supabaseEnv.VITE_SUPABASE_SERVICE_ROLE_KEY ?? import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    throw new Error('Service role key required for agent operations. Please set VITE_SUPABASE_SERVICE_ROLE_KEY');
  }

  return createServerClient(
    supabaseEnv.VITE_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL,
    serviceKey,
    {
      cookies: {
        getAll() { return []; },
        setAll() { /* no-op */ }
      }
    }
  );
};

type SupabaseEnv = {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  VITE_SUPABASE_SERVICE_ROLE_KEY?: string;
  JWT_SECRET?: string;
  VITE_JWT_SECRET?: string;
};

export const supabaseMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const supabaseEnv = env<SupabaseEnv>(c);
    const supabaseUrl =
      supabaseEnv.VITE_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
    const supabasePublishableKey =
      supabaseEnv.VITE_SUPABASE_ANON_KEY ??
      import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL missing!');
    }

    if (!supabasePublishableKey) {
      throw new Error('SUPABASE_ANON_KEY missing!');
    }

    const cookieHandler = {
      getAll() {
        const cookies = parseCookieHeader(c.req.header('Cookie') ?? '');
        // Ensure value is never undefined to match the new interface
        return cookies.map(cookie => ({
          name: cookie.name,
          value: cookie.value ?? ''
        }));
      },
      get(name: string) {
        const cookies = parseCookieHeader(c.req.header('Cookie') ?? '');
        const cookie = cookies.find(c => c.name === name);
        return cookie?.value ?? null;
      },
      setAll(cookiesToSet: any[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            // Check if we can still modify the response
            if (c.finalized) {
              console.warn('Response already finalized, skipping cookie:', name);
              return;
            }
            setCookie(c, name, value, options as any);
          } catch (error) {
            // Log the error but don't throw to prevent app crashes
            console.warn('Failed to set cookie:', name, error instanceof Error ? error.message : error);
          }
        });
      },
    };

    const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
      cookies: cookieHandler,
    });

    c.set('supabase', supabase);

    // Set up auth manager with multiple providers
    const authManager = new AuthManager();

    // Register Supabase provider as default
    const supabaseProvider = new SupabaseAuthProvider(
      supabaseUrl,
      supabasePublishableKey,
      cookieHandler
    );
    authManager.registerProvider(supabaseProvider, true);

    // Register JWT provider and Agent provider using environment-specific configuration
    try {
      const envConfig = EnvironmentConfig.getInstance();
      const jwtSecret = envConfig.getJwtSecret();

      console.log('Environment:', envConfig.getEnvironment()); // Debug log
      console.log('JWT Secret available:', !!jwtSecret); // Debug log

      if (jwtSecret) {
        const jwtProvider = new JWTAuthProvider(jwtSecret);
        authManager.registerProvider(jwtProvider);

        // Also register agent provider using environment-specific secret
        const agentProvider = new AgentAuthProvider(jwtSecret);
        authManager.registerProvider(agentProvider);
        console.log('Registered JWT and Agent providers with environment-specific secrets'); // Debug log
      } else {
        console.log('No JWT secret found, skipping JWT/Agent providers'); // Debug log
      }
    } catch (error) {
      console.error('Failed to get environment configuration:', error);
      // Fallback to old method if environment config fails
      const jwtSecret = supabaseEnv.JWT_SECRET ?? supabaseEnv.VITE_JWT_SECRET ?? process.env.JWT_SECRET ?? import.meta.env.VITE_JWT_SECRET;
      if (jwtSecret) {
        const jwtProvider = new JWTAuthProvider(jwtSecret);
        authManager.registerProvider(jwtProvider);
        const agentProvider = new AgentAuthProvider(jwtSecret);
        authManager.registerProvider(agentProvider);
        console.log('Using fallback JWT secret'); // Debug log
      }
    }

    c.set('authManager', authManager);

    await next();
  };
};

export const authMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const authManager = getAuthManager(c);

    // Get the authorization header
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const error: APIError = {
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Authorization header is required'
        },
        timestamp: new Date().toISOString()
      };
      return c.json(error, 401);
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      // Try to verify token with fallback strategy
      const authResult = await authManager.verifyTokenWithFallback(token);

      if (!authResult) {
        const apiError: APIError = {
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired token'
          },
          timestamp: new Date().toISOString()
        };
        return c.json(apiError, 401);
      }

      const { user } = authResult;
      // Set the user in context
      c.set('user', user);

      // Create authenticated supabase client with the user's token for all operations
      const supabaseEnv = env<SupabaseEnv>(c);
      const authenticatedSupabase = createServerClient(
        supabaseEnv.VITE_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL,
        supabaseEnv.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          },
          cookies: {
            getAll() { return []; },
            setAll() { /* no-op */ }
          }
        }
      );

      // Get or create database user record using authenticated client
      const { data: dbUser, error: dbError } = await authenticatedSupabase
        .from('users')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (dbError && dbError.code !== 'PGRST116') { // PGRST116 is "not found"
        console.error('Database error:', dbError);
        const apiError: APIError = {
          error: {
            code: 'DATABASE_ERROR',
            message: 'Failed to retrieve user data'
          },
          timestamp: new Date().toISOString()
        };
        return c.json(apiError, 500);
      }

      if (!dbUser) {
        // Create new user record using authenticated client
        const newUser: Partial<DatabaseUser> = {
          user_id: user.id,
          email: user.email || null,
          display_name: user.displayName || user.email?.split('@')[0] || null,
          avatar_url: user.avatarUrl || null,
        };

        // Use the already created authenticated client
        const { data: createdUser, error: createError } = await authenticatedSupabase
          .from('users')
          .insert(newUser)
          .select()
          .single();

        if (createError) {
          console.error('User creation error:', createError);
          const apiError: APIError = {
            error: {
              code: 'USER_CREATION_FAILED',
              message: 'Failed to create user record'
            },
            timestamp: new Date().toISOString()
          };
          return c.json(apiError, 500);
        }

        c.set('dbUser', createdUser);

        // Also create initial user context using authenticated client
        const { error: contextError } = await authenticatedSupabase
          .from('user_contexts')
          .insert({ user_id: user.id });

        if (contextError) {
          console.error('User context creation error:', contextError);
        }
      } else {
        c.set('dbUser', dbUser);
      }

      await next();
    } catch (err) {
      console.error('Auth middleware error:', err);
      const error: APIError = {
        error: {
          code: 'AUTH_ERROR',
          message: 'Authentication failed'
        },
        timestamp: new Date().toISOString()
      };
      return c.json(error, 401);
    }
  };
};

export const requireAuth = authMiddleware;

// Helper function to extract user ID from various sources
export const extractUserId = (c: Context): string | null => {
  const user = getCurrentUser(c);
  const dbUser = getCurrentDbUser(c);

  // Try to get from authenticated user
  if (user?.id) {
    return user.id;
  }

  // Try to get from database user
  if (dbUser?.user_id) {
    return dbUser.user_id;
  }

  return null;
};

// Helper function to extract agent identification from headers
export const getAgentInfo = (c: Context): { agentId?: string; isAgentRequest: boolean } => {
  const agentIdHeader = c.req.header('X-Agent-ID');
  const userAgentHeader = c.req.header('User-Agent');

  // Check if this is an agent-made request
  const isAgentRequest = !!(agentIdHeader || userAgentHeader?.includes('livekit-agent'));

  return {
    agentId: agentIdHeader || undefined,
    isAgentRequest
  };
};

// Helper function to check if user is acting via agent
export const isAgentOnBehalfRequest = (c: Context): boolean => {
  const agentInfo = getAgentInfo(c);
  return agentInfo.isAgentRequest;
};
