import type { Context, MiddlewareHandler } from 'hono';
import { getSupabase, getAuthManager, getCurrentUser, getAuthenticatedSupabase } from './auth.middleware';
import { APIError } from '../types/index';
import { v4 as uuidv4 } from 'uuid';

declare module 'hono' {
    interface ContextVariableMap {
        agentContext: {
            agentId: string;
            userId: string;
            sessionId?: string;
            permissions: string[];
            isAutoInitialized?: boolean;
        } | null;
        requestBody?: any;
    }
}

// Helper function to create default agent context
const createDefaultAgentContext = async (c: Context, requestBody?: any) => {
    const agentId = `auto-agent-${uuidv4()}`;
    const userId = requestBody?.user_id || requestBody?.userId || 'unknown';
    const sessionId = requestBody?.session_id || requestBody?.sessionId;

    // Minimal safe permissions for auto-initialized contexts
    const defaultPermissions = [
        'basic_access',
        'read_user_context',
        'create_session',
        'update_progress'
    ];

    const defaultContext = {
        agentId,
        userId,
        sessionId,
        permissions: defaultPermissions,
        isAutoInitialized: true
    };

    // Log the auto-initialization for audit purposes
    console.log(`Auto-initialized agent context: ${agentId} for user: ${userId}`);

    return defaultContext;
};


// Enhanced getAgentContext with auto-initialization
export const getAgentContext = async (c: Context, autoInitialize: boolean = true) => {
    const requestStartTime = Date.now();
    let agentContext = c.get('agentContext');

    // If context exists, return it
    if (agentContext) {
        return agentContext;
    }

    // If auto-initialization is disabled, return null
    if (!autoInitialize) {
        console.log('Agent context not found, auto-initialization disabled');
        return null;
    }

    console.log('Agent context not found, attempting auto-initialization...');

    try {
        // Try to parse request body to get context clues
        let requestBody = {};

        try {
            // Try to get JSON body - this will work if body hasn't been consumed yet
            requestBody = await c.req.json().catch(() => ({}));
            console.log(`Successfully parsed request body for context initialization`);
        } catch (e) {
            console.warn('Failed to parse request body for context initialization:', e);
            // Try to extract context hints from URL parameters as fallback
            try {
                const userId = c.req.param('user_id') || c.req.query('user_id') || c.req.query('userId');
                const sessionId = c.req.query('session_id') || c.req.query('sessionId');
                if (userId) {
                    requestBody = { user_id: userId, session_id: sessionId };
                    console.log('Extracted context from URL parameters');
                }
            } catch (urlError) {
                console.warn('Failed to extract context from URL:', urlError);
            }
        }

        // Create default context
        const defaultContext = await createDefaultAgentContext(c, requestBody);

        // Set the ephemeral context for this request (no database persistence)
        c.set('agentContext', defaultContext);

        // Log successful initialization
        console.log(`Agent context auto-initialized: ${defaultContext.agentId} for user: ${defaultContext.userId}`);

        return defaultContext;
    } catch (error) {
        console.error('Critical failure in agent context auto-initialization:', {
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined,
            url: c.req.url,
            method: c.req.method,
            duration: Date.now() - requestStartTime
        });
        return null;
    }
};

// Legacy synchronous version for backward compatibility
export const getAgentContextSync = (c: Context) => {
    return c.get('agentContext');
};

// Helper to get pre-parsed request body from context
export const getRequestBody = (c: Context) => {
    return c.get('requestBody') || {};
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

        // Read request body once and store in context for controller to use
        const body = await c.req.json().catch(() => ({}));

        // Handle both camelCase (userId) and snake_case (user_id) for compatibility
        const userId = body.userId || body.user_id;
        const sessionId = body.sessionId || body.session_id;

        if (!userId) {
            const error: APIError = {
                error: {
                    code: 'MISSING_USER_ID',
                    message: 'Agent requests must include userId or user_id in request body'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 400);
        }

        // Store the parsed body in context so controller doesn't need to re-read it
        c.set('requestBody', body);

        // Use authenticated Supabase client for consistent database access (service role)
        try {
            const supabase = getAuthenticatedSupabase(c);
            const { data: dbUser, error: dbError } = await supabase
                .from('users')
                .select('user_id')
                .eq('user_id', userId)
                .single();

            if (dbError || !dbUser) {
                console.log(`🔍 Agent context validation - User ${userId} not found:`, dbError);
                const error: APIError = {
                    error: {
                        code: 'INVALID_USER_ID',
                        message: 'Specified user does not exist'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 400);
            }
        } catch (dbAccessError) {
            console.error('🔍 Agent context validation - Database access error:', dbAccessError);
            // Fallback: Skip user validation for now, let controller handle it
            // This allows the request to proceed if there are temporary DB issues
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
        const agentContext = await getAgentContext(c);

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
