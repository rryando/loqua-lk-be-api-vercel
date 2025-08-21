import type { Context, MiddlewareHandler } from 'hono';
import { getSupabase, getAuthManager, getCurrentUser } from './auth.middleware';
import { APIError } from '../types/index';

declare module 'hono' {
    interface ContextVariableMap {
        agentContext: {
            agentId: string;
            userId: string;
            sessionId?: string;
            permissions: string[];
        } | null;
    }
}

export const getAgentContext = (c: Context) => {
    return c.get('agentContext');
};

// Middleware for agent authentication
export const agentAuthMiddleware = (): MiddlewareHandler => {
    return async (c, next) => {
        const authManager = getAuthManager(c);

        // Get the authorization header
        const authHeader = c.req.header('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            const error: APIError = {
                error: {
                    code: 'AUTH_REQUIRED',
                    message: 'Agent authorization header is required'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 401);
        }

        const token = authHeader.substring(7);

        try {
            // Try to verify as agent token first
            const agentProvider = authManager.getProvider('agent');
            if (!agentProvider) {
                const error: APIError = {
                    error: {
                        code: 'AGENT_AUTH_NOT_CONFIGURED',
                        message: 'Agent authentication not configured'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 500);
            }

            const agent = await agentProvider.verifyToken(token);
            if (!agent || !agent.metadata?.isAgent) {
                const error: APIError = {
                    error: {
                        code: 'INVALID_AGENT_TOKEN',
                        message: 'Invalid or expired agent token'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 401);
            }

            // Set agent in context for downstream use
            c.set('user', agent);

            await next();
        } catch (err) {
            console.error('Agent auth middleware error:', err);
            const error: APIError = {
                error: {
                    code: 'AGENT_AUTH_ERROR',
                    message: 'Agent authentication failed'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 401);
        }
    };
};

// Middleware to validate agent context (userId + sessionId)
export const validateAgentContext = (): MiddlewareHandler => {
    return async (c, next) => {
        const user = getCurrentUser(c);

        // Verify this is an agent request
        if (!user?.metadata?.isAgent) {
            const error: APIError = {
                error: {
                    code: 'NOT_AGENT',
                    message: 'This endpoint requires agent authentication'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 403);
        }

        // Get request body to extract userId and sessionId
        const body = await c.req.json().catch(() => ({}));
        const { userId, sessionId } = body;

        if (!userId) {
            const error: APIError = {
                error: {
                    code: 'MISSING_USER_ID',
                    message: 'Agent requests must include userId in request body'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 400);
        }

        // TODO: Validate that userId + sessionId matches active LiveKit session
        // For now, we'll do basic validation that the user exists
        const supabase = getSupabase(c);
        const { data: dbUser, error: dbError } = await supabase
            .from('users')
            .select('user_id')
            .eq('user_id', userId)
            .single();

        if (dbError || !dbUser) {
            const error: APIError = {
                error: {
                    code: 'INVALID_USER_ID',
                    message: 'Specified userId does not exist'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 400);
        }

        // Set agent context for downstream handlers
        c.set('agentContext', {
            agentId: user.id,
            userId,
            sessionId,
            permissions: user.metadata?.permissions || [],
        });

        await next();
    };
};

// Helper to check if agent has specific permission
export const requireAgentPermission = (permission: string): MiddlewareHandler => {
    return async (c, next) => {
        const agentContext = getAgentContext(c);

        if (!agentContext) {
            const error: APIError = {
                error: {
                    code: 'NO_AGENT_CONTEXT',
                    message: 'Agent context not found'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 403);
        }

        if (!agentContext.permissions.includes(permission)) {
            const error: APIError = {
                error: {
                    code: 'INSUFFICIENT_AGENT_PERMISSIONS',
                    message: `Agent lacks required permission: ${permission}`
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 403);
        }

        await next();
    };
};
