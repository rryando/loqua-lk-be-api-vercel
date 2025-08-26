import type { Context } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { getSupabase, extractUserId } from '../../../middleware/index.js';
import {
    CreateSessionRequest,
    SessionResponse,
    APIError,
    UserProgress,
    DatabaseLearningSession
} from '../../../types/index.js';

export class SessionsController {
    /**
     * Create a new learning session
     */
    static async createSession(c: Context) {
        const sessionData = await c.req.json();
        const currentUserId = extractUserId(c);

        // Check if user is creating session for themselves
        if (sessionData.user_id !== currentUserId) {
            const error: APIError = {
                error: {
                    code: 'INSUFFICIENT_PERMISSIONS',
                    message: 'You can only create sessions for yourself'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 403);
        }

        const supabase = getSupabase(c);
        const sessionId = sessionData.session_id || uuidv4();

        try {
            // Create the learning session
            const newSession: Omit<DatabaseLearningSession, 'id' | 'created_at'> = {
                user_id: sessionData.user_id,
                session_id: sessionId,
                duration_minutes: sessionData.duration_minutes,
                topics_covered: sessionData.topics_covered,
                new_vocabulary: sessionData.new_vocabulary,
                grammar_points: sessionData.grammar_points,
                pronunciation_practice_count: sessionData.pronunciation_practice_count,
                overall_performance: sessionData.overall_performance,
                achievements: sessionData.achievements,
                session_data: {
                    created_by: 'user',
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
            await SessionsController.updateUserProgress(supabase, sessionData, sessionId);

            const response: SessionResponse = {
                success: true,
                session_id: sessionId,
                created_at: createdSession.created_at,
            };

            return c.json(response);
        } catch (err) {
            console.error('Session creation error:', err);
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
     * Get user's learning sessions
     */
    static async getUserSessions(c: Context) {
        const currentUserId = extractUserId(c);
        const query = c.req.query();

        if (!currentUserId) {
            const error: APIError = {
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'User authentication required'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 401);
        }

        const supabase = getSupabase(c);
        const limit = parseInt(query.limit || '10', 10);
        const offset = parseInt(query.offset || '0', 10);

        try {
            let dbQuery = supabase
                .from('learning_sessions')
                .select('*', { count: 'exact' })
                .eq('user_id', currentUserId)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            // Add date filters if provided
            if (query.from_date) {
                dbQuery = dbQuery.gte('created_at', query.from_date);
            }

            if (query.to_date) {
                dbQuery = dbQuery.lte('created_at', query.to_date);
            }

            const { data: sessions, error, count } = await dbQuery;

            if (error) {
                console.error('Database error:', error);
                const apiError: APIError = {
                    error: {
                        code: 'DATABASE_ERROR',
                        message: 'Failed to retrieve sessions'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(apiError, 500);
            }

            const response = {
                sessions: sessions?.map(session => ({
                    session_id: session.session_id,
                    duration_minutes: session.duration_minutes,
                    topics_covered: session.topics_covered,
                    new_vocabulary: session.new_vocabulary,
                    grammar_points: session.grammar_points,
                    pronunciation_practice_count: session.pronunciation_practice_count,
                    overall_performance: session.overall_performance,
                    achievements: session.achievements,
                    created_at: session.created_at,
                })) || [],
                total_count: count || 0,
                pagination: {
                    limit,
                    offset,
                    has_next: (count || 0) > offset + limit,
                },
            };

            return c.json(response);
        } catch (err) {
            console.error('Get sessions error:', err);
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
     * Helper method to update user progress after session creation
     */
    private static async updateUserProgress(supabase: any, sessionData: any, sessionId: string) {
        const { data: currentContext, error: contextError } = await supabase
            .from('user_contexts')
            .select('progress, session_history')
            .eq('user_id', sessionData.user_id)
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
                .eq('user_id', sessionData.user_id);
        }
    }
}
