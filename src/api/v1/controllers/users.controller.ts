import type { Context } from 'hono';
import { extractUserId, getAuthenticatedSupabase } from '../../../middleware/index.js';
import {
    UserContextResponse,
    UpdateContextResponse,
    APIError,
    UserPreferences,
    UserProgress,
    SessionHistory,
    DatabaseUserContext,
    ProgressAnalytics
} from '../../../types/index.js';
import { pronunciationService, EnhancementRequest } from '../../../services/pronunciation.service.js';

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

    /**
     * Get user's pronunciation evaluations (user endpoint)
     */
    static async getPronunciationEvaluations(c: Context) {
        const requestedUserId = c.req.param('user_id');
        const currentUserId = extractUserId(c);
        const { topic, limit, offset, since_date } = c.req.query();

        // Check if user is requesting their own evaluations
        if (requestedUserId !== currentUserId) {
            const error: APIError = {
                error: {
                    code: 'INSUFFICIENT_PERMISSIONS',
                    message: 'You can only access your own pronunciation evaluations'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 403);
        }

        const supabase = getAuthenticatedSupabase(c);

        try {
            let query = supabase
                .from('pronunciation_evaluations')
                .select('*', { count: 'exact' })
                .eq('user_id', requestedUserId)
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
                        code: 'DATABASE_ERROR',
                        message: 'Failed to retrieve pronunciation evaluations'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 500);
            }

            if (!evaluations || evaluations.length === 0) {
                return c.json({
                    success: true,
                    evaluations: [],
                    total_count: 0,
                    has_more: false
                });
            }

            return c.json({
                success: true,
                evaluations: evaluations,
                total_count: count || 0,
                has_more: (count || 0) > offsetNum + limitNum
            });

        } catch (err) {
            console.error('User pronunciation evaluations retrieval error:', err);
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
     * Get evaluated phrases for user review (user endpoint)
     */
    static async getEvaluatedPhrases(c: Context) {
        const requestedUserId = c.req.param('user_id');
        const currentUserId = extractUserId(c);
        const { topic, days_back } = c.req.query();

        // Check if user is requesting their own evaluated phrases
        if (requestedUserId !== currentUserId) {
            const error: APIError = {
                error: {
                    code: 'INSUFFICIENT_PERMISSIONS',
                    message: 'You can only access your own evaluated phrases'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 403);
        }

        const supabase = getAuthenticatedSupabase(c);

        try {
            const daysBackNum = parseInt(days_back as string) || 7;
            const dateThreshold = new Date();
            dateThreshold.setDate(dateThreshold.getDate() - daysBackNum);

            let query = supabase
                .from('pronunciation_evaluations')
                .select('id, kanji, romaji, translation, topic, created_at, evaluation_score')
                .eq('user_id', requestedUserId)
                .gte('created_at', dateThreshold.toISOString())
                .order('created_at', { ascending: false });

            if (topic) {
                query = query.eq('topic', topic);
            }

            const { data: evaluations, error: queryError } = await query;

            if (queryError) {
                console.error('Evaluated phrases query error:', queryError);
                const error: APIError = {
                    error: {
                        code: 'DATABASE_ERROR',
                        message: 'Failed to retrieve evaluated phrases'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 500);
            }

            if (!evaluations || evaluations.length === 0) {
                return c.json({
                    success: true,
                    evaluated_phrases: [],
                    count: 0
                });
            }

            // Group by kanji to get best score and latest evaluation
            const phrasesMap = new Map();

            evaluations.forEach(evaluation => {
                const key = evaluation.kanji;
                const existing = phrasesMap.get(key);

                if (!existing ||
                    new Date(evaluation.created_at) > new Date(existing.latest_evaluation_date) ||
                    (evaluation.evaluation_score && (!existing.best_score || evaluation.evaluation_score > existing.best_score))) {

                    phrasesMap.set(key, {
                        id: evaluation.id,
                        kanji: evaluation.kanji,
                        romaji: evaluation.romaji,
                        translation: evaluation.translation,
                        topic: evaluation.topic,
                        latest_evaluation_date: evaluation.created_at,
                        best_score: evaluation.evaluation_score || existing?.best_score || null,
                        evaluation_count: (existing?.evaluation_count || 0) + 1
                    });
                }
            });

            const evaluatedPhrases = Array.from(phrasesMap.values());

            // Check if any phrases need enhancement (have dummy data)
            const needsEnhancement = evaluatedPhrases.filter(phrase =>
                phrase.romaji === 'pronunciation_needed' ||
                phrase.translation === 'translation_needed'
            );

            if (needsEnhancement.length > 0) {
                try {
                    console.log(`Enhancing ${needsEnhancement.length} phrases with dummy data`);

                    // Prepare enhancement requests
                    const enhancementRequests: EnhancementRequest[] = needsEnhancement.map(phrase => ({
                        kanji: phrase.kanji,
                        currentRomaji: phrase.romaji,
                        currentTranslation: phrase.translation
                    }));

                    // Get enhanced data from OpenAI
                    const enhancedResults = await pronunciationService.enhancePronunciationData(enhancementRequests);

                    // Update database with enhanced data
                    for (let i = 0; i < enhancedResults.length; i++) {
                        const enhanced = enhancedResults[i];
                        const original = needsEnhancement[i];

                        // Update the database if we got valid enhanced data
                        if (enhanced.romaji !== 'pronunciation_needed' && enhanced.translation !== 'translation_needed') {
                            const updateData: any = {};

                            if (original.romaji === 'pronunciation_needed') {
                                updateData.romaji = enhanced.romaji;
                            }
                            if (original.translation === 'translation_needed') {
                                updateData.translation = enhanced.translation;
                            }

                            // Update the database record
                            await supabase
                                .from('pronunciation_evaluations')
                                .update(updateData)
                                .eq('user_id', requestedUserId)
                                .eq('kanji', enhanced.kanji);

                            // Update the local data
                            const phraseIndex = evaluatedPhrases.findIndex(p => p.kanji === enhanced.kanji);
                            if (phraseIndex !== -1) {
                                evaluatedPhrases[phraseIndex] = {
                                    ...evaluatedPhrases[phraseIndex],
                                    romaji: enhanced.romaji,
                                    translation: enhanced.translation
                                };
                            }
                        }
                    }

                    console.log(`Successfully enhanced ${enhancedResults.length} phrases`);
                } catch (enhancementError) {
                    console.error('Enhancement failed, returning original data:', enhancementError);
                    // Continue with original data if enhancement fails
                }
            }

            // Map to client expected format
            const clientFormattedPhrases = evaluatedPhrases.map((phrase, index) => ({
                id: phrase.id,
                phrase: phrase.romaji, // Client expects 'phrase' field for romaji
                kanji: phrase.kanji,
                translation: phrase.translation,
                best_score: phrase.best_score,
                latest_evaluation_date: phrase.latest_evaluation_date,
                topic: phrase.topic,
                evaluation_count: phrase.evaluation_count
            }));

            return c.json({
                success: true,
                evaluated_phrases: clientFormattedPhrases,
                count: clientFormattedPhrases.length
            });

        } catch (err) {
            console.error('User evaluated phrases retrieval error:', err);
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
     * Generate audio for pronunciation (user endpoint)
     */
    static async generatePronunciationAudio(c: Context) {
        const evaluationId = c.req.param('evaluation_id');
        const currentUserId = extractUserId(c);

        const supabase = getAuthenticatedSupabase(c);

        try {
            // Get the evaluation record to ensure user owns it and get romaji/kanji
            const { data: evaluation, error: queryError } = await supabase
                .from('pronunciation_evaluations')
                .select('user_id, kanji, romaji')
                .eq('id', evaluationId)
                .single();

            if (queryError || !evaluation) {
                const error: APIError = {
                    error: {
                        code: 'EVALUATION_NOT_FOUND',
                        message: 'Pronunciation evaluation not found'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 404);
            }

            // Check if user owns this evaluation
            if (evaluation.user_id !== currentUserId) {
                const error: APIError = {
                    error: {
                        code: 'INSUFFICIENT_PERMISSIONS',
                        message: 'You can only access your own pronunciation evaluations'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 403);
            }

            // Check for dummy data
            if (evaluation.romaji === 'pronunciation_needed') {
                const error: APIError = {
                    error: {
                        code: 'PRONUNCIATION_DATA_UNAVAILABLE',
                        message: 'Pronunciation data not available for this evaluation'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 400);
            }

            // Generate audio
            try {
                const audioResult = await pronunciationService.generateAudio(evaluation.romaji, evaluation.kanji);
                const audioDataUrl = `data:audio/mp3;base64,${audioResult.base64}`;

                return c.json({
                    success: true,
                    audio_data: audioDataUrl,
                    audio_base64: audioResult.base64,
                    kanji: evaluation.kanji,
                    romaji: evaluation.romaji,
                });

            } catch (audioError) {
                console.error('Audio generation failed:', audioError);
                const error: APIError = {
                    error: {
                        code: 'AUDIO_GENERATION_FAILED',
                        message: 'Failed to generate pronunciation audio'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 500);
            }

        } catch (err) {
            console.error('User pronunciation audio generation error:', err);
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
