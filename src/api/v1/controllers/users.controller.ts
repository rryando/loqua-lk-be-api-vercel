import type { Context } from 'hono';
import { extractUserId, getAuthenticatedSupabase } from '../../../middleware/index';
import {
    UserContextResponse,
    UpdateContextResponse,
    APIError,
    UserPreferences,
    UserProgress,
    SessionHistory,
    DatabaseUserContext,
    ProgressAnalytics
} from '../../../types/index';

export class UsersController {
    /**
     * Get user context
     */
    static async getUserContext(c: Context) {
        const requestedUserId = c.req.param('user_id');
        const currentUserId = extractUserId(c);

        console.log('here', requestedUserId, currentUserId)

        // Check if user is requesting their own context
        if (requestedUserId !== currentUserId) {
            const error: APIError = {
                error: {
                    code: 'INSUFFICIENT_PERMISSIONS',
                    message: 'You can only access your own context'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 403);
        }

        const supabase = getAuthenticatedSupabase(c);

        try {
            // Get user context
            const { data: userContext, error } = await supabase
                .from('user_contexts')
                .select('*')
                .eq('user_id', requestedUserId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') { // Not found
                    const emptyUserResponse: UserContextResponse = {
                        user_id: requestedUserId,
                        preferences: {
                            learning_level: null,
                            learning_goals: [],
                            preferred_topics: [],
                            practice_frequency: null,
                            session_duration_preference: 0,
                            wants_formal_speech: null,
                            wants_kanji_practice: null,
                            wants_grammar_focus: null,
                        },
                        progress: {
                            total_sessions: 0,
                            total_conversation_time: 0,
                            words_learned: 0,
                            phrases_practiced: 0,
                            pronunciation_score_avg: 0,
                            grammar_points_covered: [],
                            achievements_unlocked: [],
                            last_session_date: "-",
                            current_streak: 0,
                        },
                        session_history: [],
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    };

                    return c.json(emptyUserResponse);
                }

                console.error('Database error:', error);
                const apiError: APIError = {
                    error: {
                        code: 'DATABASE_ERROR',
                        message: 'Failed to retrieve user context'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(apiError, 500);
            }

            const response: UserContextResponse = {
                user_id: userContext.user_id,
                preferences: userContext.preferences as UserPreferences,
                progress: userContext.progress as UserProgress,
                session_history: userContext.session_history as SessionHistory[],
                created_at: userContext.created_at,
                updated_at: userContext.updated_at,
            };

            return c.json(response);
        } catch (err) {
            console.error('Get context error:', err);
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
     * Update user context
     */
    static async updateUserContext(c: Context) {
        const requestedUserId = c.req.param('user_id');
        const currentUserId = extractUserId(c);
        const updateData = await c.req.json();

        console.log(requestedUserId, currentUserId, updateData)

        // Check if user is updating their own context
        if (requestedUserId !== currentUserId) {
            const error: APIError = {
                error: {
                    code: 'INSUFFICIENT_PERMISSIONS',
                    message: 'You can only update your own context'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 403);
        }

        const supabase = getAuthenticatedSupabase(c);

        console.log(updateData)

        try {
            // Build update object
            const updateObj: Partial<DatabaseUserContext> = {};

            if (updateData.preferences) {
                updateObj.preferences = updateData.preferences;
            }

            if (updateData.progress) {
                updateObj.progress = updateData.progress;
            }

            if (updateData.session_history) {
                updateObj.session_history = updateData.session_history;
            }

            // Update user context
            const { data, error } = await supabase
                .from('user_contexts')
                .update(updateObj)
                .eq('user_id', requestedUserId)
                .select('updated_at')
                .single();

            if (error) {
                if (error.code === 'PGRST116') { // Not found
                    const { data: userContext, error: userContextError } = await supabase
                        .from('user_contexts')
                        .insert({
                            user_id: requestedUserId,
                            preferences: updateData.preferences,
                            progress: updateData.progress,
                            session_history: updateData.session_history,
                        })
                        .select('updated_at')
                        .single();

                    if (userContextError) {
                        console.error('User context error:', userContextError);
                    }

                    const response: UpdateContextResponse = {
                        success: true,
                        user_id: requestedUserId,
                        updated_at: userContext?.updated_at,
                    };

                    return c.json(response);
                }

                console.error('Database error:', error);
                const apiError: APIError = {
                    error: {
                        code: 'DATABASE_ERROR',
                        message: 'Failed to update user context'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(apiError, 500);
            }

            const response: UpdateContextResponse = {
                success: true,
                user_id: requestedUserId,
                updated_at: data.updated_at,
            };

            return c.json(response);
        } catch (err) {
            console.error('Update context error:', err);
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
     * Get user progress analytics
     */
    static async getUserProgress(c: Context) {
        const requestedUserId = c.req.param('user_id');
        const currentUserId = extractUserId(c);

        console.log('here', requestedUserId, currentUserId)

        // Check if user is requesting their own progress
        if (requestedUserId !== currentUserId) {
            const error: APIError = {
                error: {
                    code: 'INSUFFICIENT_PERMISSIONS',
                    message: 'You can only access your own progress'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 403);
        }

        const supabase = getAuthenticatedSupabase(c);

        try {
            // Get user context for basic stats
            const { data: userContext, error: contextError } = await supabase
                .from('user_contexts')
                .select('progress')
                .eq('user_id', requestedUserId)
                .single();

            if (contextError) {
                console.error('Context error:', contextError);
                const apiError: APIError = {
                    error: {
                        code: 'USER_NOT_FOUND',
                        message: 'User progress not found'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(apiError, 404);
            }

            // Get recent learning sessions (last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const { data: recentSessions, error: sessionsError } = await supabase
                .from('learning_sessions')
                .select('*')
                .eq('user_id', requestedUserId)
                .gte('created_at', thirtyDaysAgo.toISOString())
                .order('created_at', { ascending: false });

            if (sessionsError) {
                console.error('Sessions error:', sessionsError);
            }

            // Get achievements
            const { data: achievements, error: achievementsError } = await supabase
                .from('achievements')
                .select('achievement_id, title, description, icon, unlocked_at')
                .eq('user_id', requestedUserId)
                .order('unlocked_at', { ascending: false });

            if (achievementsError) {
                console.error('Achievements error:', achievementsError);
            }

            const progress = userContext.progress as UserProgress;

            // Calculate recent activity
            const recentActivity = recentSessions?.reduce((acc: any[], session) => {
                const date = session.created_at.split('T')[0];
                const existing = acc.find(item => item.date === date);

                if (existing) {
                    existing.session_count += 1;
                    existing.study_minutes += session.duration_minutes || 0;
                    existing.topics_covered.push(...(session.topics_covered || []));
                } else {
                    acc.push({
                        date,
                        session_count: 1,
                        study_minutes: session.duration_minutes || 0,
                        topics_covered: session.topics_covered || [],
                    });
                }

                return acc;
            }, []) || [];

            // Remove duplicate topics
            recentActivity.forEach(item => {
                item.topics_covered = [...new Set(item.topics_covered)];
            });

            const response: ProgressAnalytics = {
                total_stats: {
                    sessions_completed: progress.total_sessions,
                    total_study_time: progress.total_conversation_time,
                    vocabulary_learned: progress.words_learned,
                    current_streak: progress.current_streak,
                    level_progression: progress.grammar_points_covered,
                },
                recent_activity: recentActivity,
                achievements: achievements?.map(ach => ({
                    id: ach.achievement_id,
                    title: ach.title,
                    description: ach.description || '',
                    unlocked_at: ach.unlocked_at,
                    icon: ach.icon,
                })) || [],
                next_milestones: [
                    {
                        title: 'Session Master',
                        progress: progress.total_sessions,
                        target: Math.ceil((progress.total_sessions + 10) / 10) * 10,
                    },
                    {
                        title: 'Vocabulary Builder',
                        progress: progress.words_learned,
                        target: Math.ceil((progress.words_learned + 50) / 50) * 50,
                    },
                    {
                        title: 'Study Streak',
                        progress: progress.current_streak,
                        target: Math.max(progress.current_streak + 1, 7),
                    },
                ],
            };

            return c.json(response);
        } catch (err) {
            console.error('Get progress error:', err);
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
}
