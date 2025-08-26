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
     * Store pronunciation evaluation result
     */
    static async storePronunciationEvaluation(c: Context) {
        const evaluationData = await c.req.json();
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
            const { userId, evaluation } = evaluationData;

            // Application-level duplicate check (same user + kanji within 24 hours)
            const oneDayAgo = new Date();
            oneDayAgo.setDate(oneDayAgo.getDate() - 1);

            const { data: existingEvaluation } = await supabase
                .from('pronunciation_evaluations')
                .select('id, created_at')
                .eq('user_id', userId)
                .eq('kanji', evaluation.kanji)
                .gte('created_at', oneDayAgo.toISOString())
                .single();

            if (existingEvaluation) {
                const error: APIError = {
                    error: {
                        code: 'DUPLICATE_EVALUATION',
                        message: 'Evaluation for this phrase already exists today'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 409);
            }

            // Create pronunciation evaluation
            const newEvaluation = {
                user_id: userId,
                kanji: evaluation.kanji,
                romaji: evaluation.romaji,
                translation: evaluation.translation,
                topic: evaluation.topic,
                user_pronunciation: evaluation.user_pronunciation,
                evaluation_score: evaluation.evaluation_score || null,
                evaluation_feedback: evaluation.evaluation_feedback || null,
                evaluation_details: evaluation.evaluation_details || null,
            };

            const { data: createdEvaluation, error: insertError } = await supabase
                .from('pronunciation_evaluations')
                .insert(newEvaluation)
                .select('id, created_at')
                .single();

            if (insertError) {
                console.error('Pronunciation evaluation creation error:', insertError);
                const error: APIError = {
                    error: {
                        code: 'INVALID_EVALUATION_DATA',
                        message: 'Required fields missing: kanji, romaji, translation'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 400);
            }

            // Record successful request
            globalHealthMonitor.recordRequest(true, Date.now() - startTime);

            // Log agent action for audit
            console.log(`Pronunciation evaluation stored by agent ${agentInfo.agentId || agentContext.agentId} for user ${userId}`);

            return c.json({
                success: true,
                evaluation_id: createdEvaluation.id,
                created_at: createdEvaluation.created_at,
                message: 'Pronunciation evaluation stored successfully'
            });

        } catch (err) {
            // Record failed request
            globalHealthMonitor.recordRequest(false, Date.now() - startTime);

            console.error('Agent pronunciation evaluation storage error:', err);
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
     * Get user's pronunciation evaluations
     */
    static async getPronunciationEvaluations(c: Context) {
        const userId = c.req.param('user_id');
        const { topic, limit, offset, since_date } = c.req.query();
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
            let query = supabase
                .from('pronunciation_evaluations')
                .select('*', { count: 'exact' })
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (topic) {
                query = query.eq('topic', topic);
            }

            if (since_date) {
                query = query.gte('created_at', since_date);
            }

            const limitNum = parseInt(limit as string) || 50;
            const offsetNum = parseInt(offset as string) || 0;

            query = query.range(offsetNum, offsetNum + limitNum - 1);

            const { data: evaluations, error: queryError, count } = await query;

            if (queryError) {
                console.error('Pronunciation evaluations query error:', queryError);
                const error: APIError = {
                    error: {
                        code: 'SERVER_ERROR',
                        message: 'Internal server error'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 500);
            }

            if (!evaluations || evaluations.length === 0) {
                const error: APIError = {
                    error: {
                        code: 'NO_EVALUATIONS_FOUND',
                        message: 'No pronunciation evaluations found for user'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 404);
            }

            // Record successful request
            globalHealthMonitor.recordRequest(true, Date.now() - startTime);

            // Log agent action for audit
            console.log(`Pronunciation evaluations accessed by agent ${agentInfo.agentId || agentContext.agentId} for user ${userId}`);

            return c.json({
                success: true,
                evaluations: evaluations,
                total_count: count || 0,
                has_more: (count || 0) > offsetNum + limitNum
            });

        } catch (err) {
            // Record failed request
            globalHealthMonitor.recordRequest(false, Date.now() - startTime);

            console.error('Agent pronunciation evaluations retrieval error:', err);
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
     * Get evaluated phrases for LLM context (cached)
     */
    static async getEvaluatedPhrases(c: Context) {
        const userId = c.req.param('user_id');
        const { topic, days_back } = c.req.query();
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
            const daysBackNum = parseInt(days_back as string) || 7;
            const dateThreshold = new Date();
            dateThreshold.setDate(dateThreshold.getDate() - daysBackNum);

            const cacheKey = `evaluated_phrases:${userId}:${topic || 'all'}:${daysBackNum}`;

            // Long-term caching (30 minutes)
            const evaluatedPhrases = await globalCache.getOrSet(
                cacheKey,
                async () => {
                    let query = supabase
                        .from('pronunciation_evaluations')
                        .select('kanji, romaji, topic, created_at, evaluation_score')
                        .eq('user_id', userId)
                        .gte('created_at', dateThreshold.toISOString())
                        .order('created_at', { ascending: false });

                    if (topic) {
                        query = query.eq('topic', topic);
                    }

                    const { data: evaluations, error: queryError } = await query;

                    if (queryError) {
                        throw new Error(`Database error: ${queryError.message}`);
                    }

                    if (!evaluations || evaluations.length === 0) {
                        return [];
                    }

                    // Group by kanji to get best score and latest evaluation
                    const phrasesMap = new Map();

                    evaluations.forEach(evaluation => {
                        const key = evaluation.kanji;
                        const existing = phrasesMap.get(key);

                        if (!existing ||
                            new Date(evaluation.created_at) > new Date(existing.last_evaluated) ||
                            (evaluation.evaluation_score && (!existing.best_score || evaluation.evaluation_score > existing.best_score))) {

                            phrasesMap.set(key, {
                                kanji: evaluation.kanji,
                                romaji: evaluation.romaji,
                                topic: evaluation.topic,
                                last_evaluated: evaluation.created_at,
                                best_score: evaluation.evaluation_score || existing?.best_score || null
                            });
                        }
                    });

                    return Array.from(phrasesMap.values());
                },
                1800000 // 30 minutes cache
            );

            // Record successful request
            globalHealthMonitor.recordRequest(true, Date.now() - startTime);

            // Log agent action for audit
            console.log(`Evaluated phrases accessed by agent ${agentInfo.agentId || agentContext.agentId} for user ${userId}`);

            return c.json({
                success: true,
                evaluated_phrases: evaluatedPhrases,
                count: evaluatedPhrases.length
            });

        } catch (err) {
            // Record failed request
            globalHealthMonitor.recordRequest(false, Date.now() - startTime);

            console.error('Agent evaluated phrases retrieval error:', err);
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
     * Unified agent bootstrap endpoint - combines all startup data
     */
    static async bootstrap(c: Context) {
        const userId = c.req.param('user_id');
        const { include_raw_data } = c.req.query();
        const agentContext = await getAgentContext(c);
        const agentInfo = getAgentInfo(c);
        const supabase = getAuthenticatedSupabase(c);
        const startTime = Date.now();

        let totalQueries = 0;
        let cacheHits = 0;

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

        if (!userId) {
            const error: APIError = {
                error: {
                    code: 'MISSING_USER_ID',
                    message: 'User ID is required'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 400);
        }

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(userId)) {
            const error: APIError = {
                error: {
                    code: 'INVALID_USER_ID',
                    message: 'User ID must be a valid UUID'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 400);
        }

        try {
            // OPTIMIZED: Single query to get all bootstrap data
            const cacheKey = `bootstrap_unified:${userId}:${include_raw_data}`;

            const bootstrapData = await globalCache.getOrSet(
                cacheKey,
                async () => {
                    // Single comprehensive query using PostgreSQL JSON aggregation
                    const { data, error } = await supabase.rpc('get_agent_bootstrap_data', {
                        p_user_id: userId,
                        p_include_raw_data: include_raw_data === 'true',
                        p_days_back: 7
                    });
                    totalQueries = 1; // Only one RPC call

                    if (error) {
                        throw new Error(`Bootstrap query failed: ${error.message}`);
                    }

                    if (!data || data.length === 0) {
                        throw new Error('User not found or no data available');
                    }

                    const result = data[0];

                    // Process evaluated phrases if raw data was requested
                    let processedEvaluatedPhrases = [];
                    if (result.evaluations && result.evaluations.length > 0) {
                        const phrasesMap = new Map();
                        result.evaluations.forEach((evaluation: any) => {
                            const key = evaluation.kanji;
                            const existing = phrasesMap.get(key);

                            if (!existing ||
                                new Date(evaluation.created_at) > new Date(existing.last_evaluated) ||
                                (evaluation.evaluation_score && (!existing.best_score || evaluation.evaluation_score > existing.best_score))) {

                                phrasesMap.set(key, {
                                    kanji: evaluation.kanji,
                                    romaji: evaluation.romaji,
                                    topic: evaluation.topic,
                                    last_evaluated: evaluation.created_at,
                                    best_score: evaluation.evaluation_score || existing?.best_score || null
                                });
                            }
                        });
                        processedEvaluatedPhrases = Array.from(phrasesMap.values());
                    }

                    return {
                        user: {
                            user_id: result.user_id,
                            email: result.email,
                            display_name: result.display_name,
                            avatar_url: result.avatar_url
                        },
                        summary_data: {
                            conversation_count: result.conversation_count || 0,
                            evaluation_count: result.evaluation_count || 0,
                            session_count: result.session_count || 0,
                            has_user_context: !!result.user_context
                        },
                        conversations: result.conversations || [],
                        evaluations: result.evaluations || [],
                        raw_data: include_raw_data === 'true' ? {
                            user_context: result.user_context ? {
                                user_id: userId,
                                preferences: result.user_context.preferences,
                                progress: result.user_context.progress,
                                session_history: result.user_context.session_history,
                                created_at: result.user_context.created_at,
                                updated_at: result.user_context.updated_at,
                            } : null,
                            evaluated_phrases: processedEvaluatedPhrases,
                            recent_sessions: result.sessions || []
                        } : undefined
                    };
                },
                300000 // 5 minutes cache for unified data
            );

            // Note: Cache performance tracked via summary service

            // 2. Generate ultra-efficient agent context from bootstrap data
            const generatedSummary = await AgentController.generateAgentContext(bootstrapData, userId);
            totalQueries += generatedSummary.llmQueries; // Track LLM API calls separately

            // Record successful request
            globalHealthMonitor.recordRequest(true, Date.now() - startTime);

            // Log agent action for audit
            console.log(`Bootstrap data accessed by agent ${agentInfo.agentId || agentContext?.agentId || 'unknown'} for user ${userId}`);

            const executionTime = Date.now() - startTime;

            return c.json({
                success: true,
                user_id: userId,
                timestamp: new Date().toISOString(),

                ai_summary: {
                    compact_summary: generatedSummary.compact_summary,
                    generated_at: generatedSummary.generated_at,
                    from_cache: generatedSummary.from_cache,
                    data_included: {
                        conversation_count: bootstrapData.summary_data.conversation_count,
                        evaluation_count: bootstrapData.summary_data.evaluation_count,
                        session_count: bootstrapData.summary_data.session_count,
                        has_user_context: bootstrapData.summary_data.has_user_context
                    }
                },

                user_auth: {
                    display_name: bootstrapData.user.display_name,
                    email: bootstrapData.user.email,
                    avatar_url: bootstrapData.user.avatar_url,
                    user_verified: true
                },

                performance: {
                    total_queries: totalQueries,
                    cache_hits: cacheHits,
                    execution_time_ms: executionTime
                },

                ...(bootstrapData.raw_data ? { raw_data: bootstrapData.raw_data } : {})
            });

        } catch (err) {
            // Record failed request
            globalHealthMonitor.recordRequest(false, Date.now() - startTime);

            console.error('Agent bootstrap error:', err);

            if (err instanceof Error && err.message.includes('No user data found')) {
                const apiError: APIError = {
                    error: {
                        code: 'NO_DATA_AVAILABLE',
                        message: 'No data available to generate summary for this user'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(apiError, 404);
            }

            const error: APIError = {
                error: {
                    code: 'SERVER_ERROR',
                    message: 'Failed to bootstrap agent data',
                    details: err instanceof Error ? err.message : 'Unknown error'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 500);
        }
    }

    /**
     * Generate ultra-efficient agent context (token-optimized)
     */
    private static async generateAgentContext(bootstrapData: any, userId: string): Promise<{
        compact_summary: string;
        generated_at: string;
        from_cache: boolean;
        llmQueries: number;
    }> {
        const cacheKey = `agent_context:${userId}`;

        // Check cache first (30 min cache for agent context)
        const cached = await globalCache.get(cacheKey);
        if (cached && typeof cached === 'string') {
            return {
                compact_summary: cached,
                generated_at: new Date().toISOString(),
                from_cache: true,
                llmQueries: 0
            };
        }

        // Extract key metrics for ultra-compact format
        const user = bootstrapData.user;
        const context = bootstrapData.raw_data?.user_context;
        const conversations = bootstrapData.conversations || [];
        const evaluations = bootstrapData.evaluations || [];

        // Calculate dynamic stats
        const level = context?.preferences?.learning_level || 'unknown';
        const streak = context?.progress?.current_streak || 0;
        const avgScore = evaluations.length > 0
            ? (evaluations.reduce((sum: number, e: any) => sum + (e.evaluation_score || 0), 0) / evaluations.length).toFixed(1)
            : '0';

        // Identify strengths and gaps from recent performance
        const recentTopics = [...new Set(evaluations.slice(0, 10).map((e: any) => e.topic))].slice(0, 3);
        const goodScores = evaluations.filter((e: any) => e.evaluation_score >= 8).map((e: any) => e.topic);
        const weakScores = evaluations.filter((e: any) => e.evaluation_score < 6).map((e: any) => e.topic);

        // Get conversation patterns (last 10 messages)
        const recentMessages = conversations.slice(0, 10).map((c: any) => c.message).join(' ');
        const commonWords = this.extractKeywords(recentMessages, 3);

        // Build token-efficient context (target: ~50 tokens)
        const compactSummary = [
            `USER: ${user.display_name || 'Student'} (${level.toUpperCase()}, ${streak}d streak)`,
            `STATS: ${bootstrapData.summary_data.conversation_count} convos, ${bootstrapData.summary_data.evaluation_count} evals, ${avgScore}/10 avg`,
            `TOPICS: ${recentTopics.join(', ') || 'general'}`,
            goodScores.length > 0 ? `STRONG: ${[...new Set(goodScores)].slice(0, 3).join(', ')}` : '',
            weakScores.length > 0 ? `FOCUS: ${[...new Set(weakScores)].slice(0, 3).join(', ')}` : '',
            commonWords.length > 0 ? `RECENT: ${commonWords.join(', ')}` : ''
        ].filter(line => line.length > 0).join(' | ');

        // Cache for 30 minutes
        globalCache.set(cacheKey, compactSummary, 1800000);

        return {
            compact_summary: compactSummary,
            generated_at: new Date().toISOString(),
            from_cache: false,
            llmQueries: 0 // No LLM needed - pure algorithmic generation
        };
    }

    /**
     * Extract top N keywords from text (simple frequency-based)
     */
    private static extractKeywords(text: string, limit: number): string[] {
        if (!text) return [];

        // Simple keyword extraction (could be enhanced with NLP)
        const words = text.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 3)
            .filter(word => !['this', 'that', 'with', 'have', 'will', 'from', 'they', 'been', 'said', 'each', 'which', 'their', 'time', 'would', 'there', 'could', 'other'].includes(word));

        const freq = words.reduce((acc: any, word) => {
            acc[word] = (acc[word] || 0) + 1;
            return acc;
        }, {});

        return Object.entries(freq)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .slice(0, limit)
            .map(([word]) => word);
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
