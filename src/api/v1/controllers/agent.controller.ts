import type { Context } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { getSupabase, getAgentContext } from '../../../middleware/index';
import {
    APIError,
    UserProgress,
    DatabaseLearningSession,
} from '../../../types/index';

export class AgentController {
    /**
     * Update user progress during a learning session
     */
    static async updateProgress(c: Context) {
        const updateData = await c.req.json();
        const agentContext = getAgentContext(c);
        const supabase = getSupabase(c);

        if (!agentContext) {
            const error: APIError = {
                error: {
                    code: 'NO_AGENT_CONTEXT',
                    message: 'Agent context not available'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 500);
        }

        try {
            // Get current user progress
            const { data: userContext, error: contextError } = await supabase
                .from('user_contexts')
                .select('progress')
                .eq('user_id', updateData.userId)
                .single();

            if (contextError) {
                console.error('Failed to get user context:', contextError);
                const error: APIError = {
                    error: {
                        code: 'USER_CONTEXT_ERROR',
                        message: 'Failed to retrieve user context'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 500);
            }

            const currentProgress = userContext.progress as UserProgress;

            // Update progress based on agent data
            const progressUpdate = updateData.data.progress;
            if (progressUpdate) {
                const updatedProgress: UserProgress = {
                    ...currentProgress,
                    words_learned: progressUpdate.words_learned ?? currentProgress.words_learned,
                    phrases_practiced: progressUpdate.phrases_practiced ?? currentProgress.phrases_practiced,
                    pronunciation_score_avg: progressUpdate.pronunciation_score ?? currentProgress.pronunciation_score_avg,
                    grammar_points_covered: progressUpdate.grammar_points
                        ? [...new Set([...currentProgress.grammar_points_covered, ...progressUpdate.grammar_points])]
                        : currentProgress.grammar_points_covered,
                };

                // Update in database
                const { error: updateError } = await supabase
                    .from('user_contexts')
                    .update({ progress: updatedProgress })
                    .eq('user_id', updateData.userId);

                if (updateError) {
                    console.error('Failed to update progress:', updateError);
                    const error: APIError = {
                        error: {
                            code: 'PROGRESS_UPDATE_FAILED',
                            message: 'Failed to update user progress'
                        },
                        timestamp: new Date().toISOString()
                    };
                    return c.json(error, 500);
                }
            }

            return c.json({
                success: true,
                message: 'Progress updated successfully',
                userId: updateData.userId,
                sessionId: updateData.sessionId,
                agentId: agentContext.agentId,
                timestamp: new Date().toISOString(),
            });
        } catch (err) {
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
        const agentContext = getAgentContext(c);
        const supabase = getSupabase(c);
        const sessionId = sessionData.sessionId || uuidv4();

        if (!agentContext) {
            const error: APIError = {
                error: {
                    code: 'NO_AGENT_CONTEXT',
                    message: 'Agent context not available'
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
                    agent_id: agentContext.agentId,
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

            return c.json({
                success: true,
                session_id: sessionId,
                created_at: createdSession.created_at,
                created_by: 'agent' as const,
                agent_id: agentContext.agentId,
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
     * Get user context for agent personalization
     */
    static async getUserContext(c: Context) {
        const userId = c.req.param('user_id');
        const agentContext = getAgentContext(c);
        const supabase = getSupabase(c);

        if (!agentContext) {
            const error: APIError = {
                error: {
                    code: 'NO_AGENT_CONTEXT',
                    message: 'Agent context not available'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 500);
        }

        try {
            const { data: userContext, error } = await supabase
                .from('user_contexts')
                .select('*')
                .eq('user_id', userId)
                .single();

            if (error) {
                console.error('Database error:', error);
                const apiError: APIError = {
                    error: {
                        code: 'USER_CONTEXT_NOT_FOUND',
                        message: 'User context not found'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(apiError, 404);
            }

            return c.json({
                user_id: userContext.user_id,
                preferences: userContext.preferences,
                progress: userContext.progress,
                session_history: userContext.session_history,
                created_at: userContext.created_at,
                updated_at: userContext.updated_at,
                accessed_by: {
                    agent_id: agentContext.agentId,
                    timestamp: new Date().toISOString(),
                },
            });
        } catch (err) {
            console.error('Agent context retrieval error:', err);
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
     * Agent health check
     */
    static async healthCheck(c: Context) {
        const agentContext = getAgentContext(c);

        return c.json({
            status: 'healthy' as const,
            agent_id: agentContext?.agentId || '',
            permissions: agentContext?.permissions || [],
            timestamp: new Date().toISOString(),
        });
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
