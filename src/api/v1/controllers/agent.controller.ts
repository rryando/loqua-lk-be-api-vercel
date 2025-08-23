import type { Context } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { env } from 'hono/adapter';
import jwt from 'jsonwebtoken';
import { getAgentContext, getAuthenticatedSupabase, getAgentInfo, getRequestBody } from '../../../middleware/index';
import { TokenEncryption } from '../../../utils/token-encryption';
import { EnvironmentConfig } from '../../../utils/environment-config';
import { globalHealthMonitor } from '../../../utils/health-monitor';
import { globalRequestBatcher, globalCache } from '../../../utils/request-batcher';
import { v4 as generateId } from 'uuid';
import {
    APIError,
    UserProgress,
    DatabaseLearningSession,
    DatabaseUserFlashCard,
} from '../../../types/index';

type EncryptionEnv = {
    JWT_SECRET?: string;
    VITE_JWT_SECRET?: string;
    AGENT_TOKEN_SECRET?: string;
};

export class AgentController {
    /**
     * Get encrypted user JWT token for agent to use
     */
    static async getUserToken(c: Context) {
        // Get the pre-parsed request body from middleware to avoid double-reading JSON
        const { room_name, user_id, agent_id } = getRequestBody(c);
        const agentContext = await getAgentContext(c);

        // Use authenticated Supabase client with agent JWT instead of anonymous client
        const supabase = getAuthenticatedSupabase(c);

        if (!agentContext) {
            const error: APIError = {
                error: {
                    code: 'CONTEXT_INITIALIZATION_FAILED',
                    message: 'Failed to initialize agent context'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 500);
        }

        // Validate required fields
        if (!room_name || !user_id || !agent_id) {
            const error: APIError = {
                error: {
                    code: 'MISSING_REQUIRED_FIELDS',
                    message: 'room_name, user_id, and agent_id are required'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 400);
        }

        // Validate field formats
        if (typeof room_name !== 'string' || room_name.trim().length === 0) {
            const error: APIError = {
                error: {
                    code: 'INVALID_ROOM_NAME',
                    message: 'room_name must be a non-empty string'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 400);
        }

        if (typeof user_id !== 'string' || user_id.trim().length === 0) {
            const error: APIError = {
                error: {
                    code: 'INVALID_USER_ID',
                    message: 'user_id must be a non-empty string'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 400);
        }

        if (typeof agent_id !== 'string' || agent_id.trim().length === 0) {
            const error: APIError = {
                error: {
                    code: 'INVALID_AGENT_ID',
                    message: 'agent_id must be a non-empty string'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 400);
        }

        try {
            // Get environment-specific configuration first
            const envConfig = EnvironmentConfig.getInstance();

            // Log detailed database connection info

            // Try to get a simple count first to test RLS
            const { count: totalUsers, error: countError } = await supabase
                .from('users')
                .select('*', { count: 'exact', head: true });


            // Test JWT payload
            try {
                const { data: jwtDebug } = await supabase.rpc('debug_current_jwt');
            } catch (jwtError) {
            }

            // Get user's current session token by looking up user in database
            const { data: user, error: userError } = await supabase
                .from('users')
                .select('user_id, email, display_name, avatar_url')
                .eq('user_id', user_id)
                .single();

            if (userError || !user) {
                console.error(`❌ User ${user_id} not found in database. Error:`, userError);


                // Let's also try a different query approach
                const { data: allUsersTest } = await supabase
                    .from('users')
                    .select('user_id')
                    .limit(3);


                const error: APIError = {
                    error: {
                        code: 'USER_NOT_FOUND',
                        message: 'User not found in database - please ensure user is properly registered',
                        details: userError?.message
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 404);
            }

            const config = envConfig.getConfig();

            if (!config.agentTokenSecret) {
                console.error(`No encryption secret found for ${config.environment} environment`);
                const error: APIError = {
                    error: {
                        code: 'CONFIGURATION_ERROR',
                        message: 'Token encryption not configured for current environment'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 500);
            }

            // Generate a new Supabase JWT for the user
            // This approach regenerates a valid user JWT on-demand
            const supabaseEnv = env<any>(c);
            const supabaseUrl = supabaseEnv.VITE_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
            const supabaseAnonKey = supabaseEnv.VITE_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

            if (!supabaseUrl || !supabaseAnonKey) {
                console.error('Supabase configuration missing for JWT generation');
                const error: APIError = {
                    error: {
                        code: 'CONFIGURATION_ERROR',
                        message: 'Supabase configuration missing'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 500);
            }

            // Use the user data we just retrieved
            const userData = user;

            // Generate a proper JWT token for the user that can be used with existing auth middleware
            const userJwtPayload = {
                sub: userData.user_id,
                email: userData.email,
                user_metadata: {
                    display_name: userData.display_name,
                    avatar_url: userData.avatar_url
                },
                iss: 'agent-service',
                aud: 'authenticated',
                exp: Math.floor(Date.now() / 1000) + config.tokenExpirySeconds,
                iat: Math.floor(Date.now() / 1000)
            };

            if (!config.jwtSecret) {
                console.error(`No JWT secret found for ${config.environment} environment`);
                const error: APIError = {
                    error: {
                        code: 'CONFIGURATION_ERROR',
                        message: 'JWT signing secret not configured for current environment'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 500);
            }

            const userJWT = jwt.sign(userJwtPayload, config.jwtSecret);

            // Encrypt the user's JWT using environment-specific secret
            const encryptedToken = TokenEncryption.encrypt(userJWT, config.agentTokenSecret);


            return c.json({
                encrypted_token: encryptedToken,
                user_id: user_id,
                room_name: room_name,
                expires_in: config.tokenExpirySeconds,
                issued_at: new Date().toISOString(),
                issued_to: agent_id,
                environment: config.environment,
                agent_context_initialized: agentContext.isAutoInitialized || false,
                user_found: true
            });

        } catch (err) {
            console.error('Agent user token retrieval error:', err);

            // Check for specific error types
            if (err instanceof Error) {
                if (err.message.includes('Token encryption failed') || err.message.includes('Token decryption failed')) {
                    const error: APIError = {
                        error: {
                            code: 'ENCRYPTION_ERROR',
                            message: 'Token encryption/decryption failed'
                        },
                        timestamp: new Date().toISOString()
                    };
                    return c.json(error, 500);
                }

                if (err.message.includes('JWT')) {
                    const error: APIError = {
                        error: {
                            code: 'JWT_GENERATION_ERROR',
                            message: 'Failed to generate JWT token'
                        },
                        timestamp: new Date().toISOString()
                    };
                    return c.json(error, 500);
                }
            }

            const error: APIError = {
                error: {
                    code: 'SERVER_ERROR',
                    message: 'Failed to retrieve user token'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 500);
        }
    }

    /**
     * Update user progress during a learning session
     */
    static async updateProgress(c: Context) {
        const updateData = await c.req.json();
        const agentContext = await getAgentContext(c);
        const agentInfo = getAgentInfo(c);
        const startTime = Date.now();

        if (!agentContext) {
            const error: APIError = {
                error: {
                    code: 'CONTEXT_INITIALIZATION_FAILED',
                    message: 'Failed to initialize agent context'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 500);
        }

        try {
            // Use batching for progress updates to optimize database operations
            const batchRequest = {
                id: generateId(),
                type: 'progress_update' as const,
                data: updateData.data,
                userId: updateData.userId,
                sessionId: updateData.sessionId,
                timestamp: Date.now()
            };

            // Add to batch queue for processing
            await globalRequestBatcher.addToBatch(batchRequest);

            // Record request for monitoring
            globalHealthMonitor.recordRequest(true, Date.now() - startTime);

            // Log agent action for audit
            console.log(`Progress update queued by agent ${agentInfo.agentId || agentContext.agentId} for user ${updateData.userId}`);

            return c.json({
                success: true,
                message: 'Progress update queued for processing',
                userId: updateData.userId,
                sessionId: updateData.sessionId,
                agentId: agentInfo.agentId || agentContext.agentId,
                timestamp: new Date().toISOString(),
                batched: true,
                batchId: batchRequest.id,
                agent_context_initialized: agentContext.isAutoInitialized || false
            });
        } catch (err) {
            // Record failed request
            globalHealthMonitor.recordRequest(false, Date.now() - startTime);

            console.error('Agent progress update error:', err);
            const error: APIError = {
                error: {
                    code: 'SERVER_ERROR',
                    message: 'Internal server error'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 500);
        }
    }

    /**
     * Create a learning session on behalf of a user
     */
    static async createSession(c: Context) {
        const sessionData = await c.req.json();
        const agentContext = await getAgentContext(c);
        const agentInfo = getAgentInfo(c);
        const supabase = getAuthenticatedSupabase(c);
        const sessionId = sessionData.sessionId || uuidv4();

        if (!agentContext) {
            const error: APIError = {
                error: {
                    code: 'CONTEXT_INITIALIZATION_FAILED',
                    message: 'Failed to initialize agent context'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 500);
        }

        try {
            // Create the learning session
            const newSession: Omit<DatabaseLearningSession, 'id' | 'created_at'> = {
                user_id: sessionData.userId,
                session_id: sessionId,
                duration_minutes: sessionData.duration_minutes,
                topics_covered: sessionData.topics_covered,
                new_vocabulary: sessionData.new_vocabulary,
                grammar_points: sessionData.grammar_points,
                pronunciation_practice_count: sessionData.pronunciation_practice_count,
                overall_performance: sessionData.overall_performance,
                achievements: sessionData.achievements,
                session_data: {
                    created_by: 'agent',
                    agent_id: agentInfo.agentId || agentContext.agentId,
                },
                next_session_recommendations: sessionData.next_session_recommendations || [],
            };

            const { data: createdSession, error: sessionError } = await supabase
                .from('learning_sessions')
                .insert(newSession)
                .select('session_id, created_at')
                .single();

            if (sessionError) {
                console.error('Session creation error:', sessionError);
                const error: APIError = {
                    error: {
                        code: 'SESSION_CREATION_FAILED',
                        message: 'Failed to create learning session'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 500);
            }

            // Update user progress
            await AgentController.updateUserProgress(supabase, sessionData, sessionId);

            // Log agent action for audit
            console.log(`Session created by agent ${agentInfo.agentId || agentContext.agentId} for user ${sessionData.userId}`);

            return c.json({
                success: true,
                session_id: sessionId,
                created_at: createdSession.created_at,
                created_by: 'agent' as const,
                agent_id: agentInfo.agentId || agentContext.agentId,
                agent_context_initialized: agentContext.isAutoInitialized || false
            });
        } catch (err) {
            console.error('Agent session creation error:', err);
            const error: APIError = {
                error: {
                    code: 'SERVER_ERROR',
                    message: 'Internal server error'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 500);
        }
    }

    /**
     * Create a flash card for a user
     */
    static async createUserFlashCard(c: Context) {
        const flashCardData = await c.req.json();
        const agentContext = await getAgentContext(c);
        const agentInfo = getAgentInfo(c);
        const supabase = getAuthenticatedSupabase(c);

        if (!agentContext) {
            const error: APIError = {
                error: {
                    code: 'CONTEXT_INITIALIZATION_FAILED',
                    message: 'Failed to initialize agent context'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 500);
        }

        try {
            // Create the flash card
            const newFlashCard: Omit<DatabaseUserFlashCard, 'id' | 'created_at'> = {
                user_id: flashCardData.userId,
                card_id: flashCardData.cardId,
                card_type: flashCardData.cardType,
                card_data: flashCardData.cardData,
                created_by: 'agent' as const,
                agent_id: agentInfo.agentId || agentContext.agentId,
            };

            const { data: createdFlashCard, error: flashCardError } = await supabase
                .from('user_flash_cards')
                .insert(newFlashCard)
                .select('card_id, created_at')
                .single();

            if (flashCardError) {
                console.error('Flash card creation error:', flashCardError);
                const error: APIError = {
                    error: {
                        code: 'FLASH_CARD_CREATION_FAILED',
                        message: 'Failed to create flash card'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 500);
            }

            // Log agent action for audit
            console.log(`Flash card created by agent ${agentInfo.agentId || agentContext.agentId} for user ${flashCardData.userId}`);

            return c.json({
                success: true,
                card_id: createdFlashCard.card_id,
                created_at: createdFlashCard.created_at,
                created_by: 'agent' as const,
                agent_id: agentInfo.agentId || agentContext.agentId,
                agent_context_initialized: agentContext.isAutoInitialized || false
            });
        } catch (err) {
            console.error('Agent flash card creation error:', err);
            const error: APIError = {
                error: {
                    code: 'SERVER_ERROR',
                    message: 'Internal server error'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 500);
        }
    }

    /**
     * Get user context for agent personalization
     */
    static async getUserContext(c: Context) {
        const userId = c.req.param('user_id');
        const agentContext = await getAgentContext(c);
        const agentInfo = getAgentInfo(c);
        const supabase = getAuthenticatedSupabase(c);
        const startTime = Date.now();

        if (!agentContext) {
            const error: APIError = {
                error: {
                    code: 'CONTEXT_INITIALIZATION_FAILED',
                    message: 'Failed to initialize agent context'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 500);
        }

        try {
            const cacheKey = `user_context:${userId}`;

            // Try to get from cache first
            const userContext = await globalCache.getOrSet(
                cacheKey,
                async () => {
                    let { data, error } = await supabase
                        .from('user_contexts')
                        .select('*, users!user_id(display_name)')
                        .eq('user_id', userId)
                        .single();

                    if (error) {
                        throw new Error(`Database error: ${error.message}`);
                    }

                    return data;
                },
                300000 // 5 minutes cache
            );

            // Record successful request
            globalHealthMonitor.recordRequest(true, Date.now() - startTime);

            // Log agent action for audit
            console.log(`User context accessed by agent ${agentInfo.agentId || agentContext.agentId} for user ${userId}`);
            console.log(userContext)
            console.log(userContext.users)

            return c.json({
                name: userContext.users?.display_name,
                user_id: userContext.user_id,
                preferences: userContext.preferences,
                progress: userContext.progress,
                session_history: userContext.session_history,
                created_at: userContext.created_at,
                updated_at: userContext.updated_at,
                accessed_by: {
                    agent_id: agentInfo.agentId || agentContext.agentId,
                    timestamp: new Date().toISOString(),
                },
                cached: true, // Indicate this might be cached data
                agent_context_initialized: agentContext.isAutoInitialized || false
            });
        } catch (err) {
            // Record failed request
            globalHealthMonitor.recordRequest(false, Date.now() - startTime);

            console.error('Agent context retrieval error:', err);

            if (err instanceof Error && err.message.includes('not found')) {
                const apiError: APIError = {
                    error: {
                        code: 'USER_CONTEXT_NOT_FOUND',
                        message: 'User context not found'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(apiError, 404);
            }

            const error: APIError = {
                error: {
                    code: 'SERVER_ERROR',
                    message: 'Internal server error'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 500);
        }
    }

    /**
     * Simple agent health check matching OpenAPI specification
     */
    static async healthCheck(c: Context) {
        const agentContext = await getAgentContext(c);
        const agentInfo = getAgentInfo(c);
        const startTime = Date.now();

        try {
            // Record this health check request
            globalHealthMonitor.recordRequest(true, Date.now() - startTime);

            // Return simple health status matching OpenAPI spec
            return c.json({
                status: 'healthy' as const,
                agent_id: agentInfo.agentId || agentContext?.agentId || 'unknown',
                permissions: agentContext?.permissions || [],
                timestamp: new Date().toISOString(),
                agent_context_initialized: agentContext?.isAutoInitialized || false
            });

        } catch (error) {
            // Record failed health check
            globalHealthMonitor.recordRequest(false, Date.now() - startTime);

            console.error('Health check failed:', error);

            const errorResponse: APIError = {
                error: {
                    code: 'HEALTH_CHECK_FAILED',
                    message: 'Agent health check failed',
                    details: error instanceof Error ? error.message : 'Unknown error'
                },
                timestamp: new Date().toISOString()
            };

            return c.json(errorResponse, 500);
        }
    }

    /**
     * Helper method to update user progress after session creation
     */
    private static async updateUserProgress(supabase: any, sessionData: any, sessionId: string) {
        const { data: currentContext, error: contextError } = await supabase
            .from('user_contexts')
            .select('progress, session_history')
            .eq('user_id', sessionData.userId)
            .single();

        if (!contextError && currentContext) {
            const currentProgress = currentContext.progress as UserProgress;
            const currentSessionHistory = currentContext.session_history as any[] || [];

            // Calculate streak
            const today = new Date().toISOString().split('T')[0];
            const lastSessionDate = currentProgress.last_session_date;
            let newStreak = currentProgress.current_streak;

            if (lastSessionDate) {
                const lastDate = new Date(lastSessionDate);
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);

                if (lastDate.toISOString().split('T')[0] === yesterday.toISOString().split('T')[0]) {
                    newStreak += 1;
                } else if (lastDate.toISOString().split('T')[0] !== today) {
                    newStreak = 1;
                }
            } else {
                newStreak = 1;
            }

            const updatedProgress: UserProgress = {
                total_sessions: currentProgress.total_sessions + 1,
                total_conversation_time: currentProgress.total_conversation_time + sessionData.duration_minutes,
                words_learned: currentProgress.words_learned + sessionData.new_vocabulary.length,
                phrases_practiced: currentProgress.phrases_practiced + sessionData.pronunciation_practice_count,
                pronunciation_score_avg: currentProgress.pronunciation_score_avg,
                grammar_points_covered: [
                    ...new Set([
                        ...currentProgress.grammar_points_covered,
                        ...sessionData.grammar_points
                    ])
                ],
                achievements_unlocked: [
                    ...new Set([
                        ...currentProgress.achievements_unlocked,
                        ...sessionData.achievements
                    ])
                ],
                last_session_date: new Date().toISOString(),
                current_streak: newStreak,
            };

            const newSessionHistoryItem = {
                session_id: sessionId,
                date: new Date().toISOString(),
                duration_minutes: sessionData.duration_minutes,
                topics_covered: sessionData.topics_covered,
            };

            const updatedSessionHistory = [
                newSessionHistoryItem,
                ...currentSessionHistory.slice(0, 49)
            ];

            await supabase
                .from('user_contexts')
                .update({
                    progress: updatedProgress,
                    session_history: updatedSessionHistory,
                })
                .eq('user_id', sessionData.userId);
        }
    }
}
