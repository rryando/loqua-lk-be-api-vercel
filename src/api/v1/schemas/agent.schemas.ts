import { z } from 'zod';

// Agent Progress Update Schema
export const AgentProgressUpdateSchema = z.object({
    userId: z.string().describe('User ID from LiveKit metadata'),
    sessionId: z.string().optional().describe('Session ID from LiveKit metadata'),
    data: z.object({
        status: z.enum(['in_progress', 'completed', 'failed']),
        progress: z.object({
            words_learned: z.number().optional(),
            phrases_practiced: z.number().optional(),
            pronunciation_score: z.number().min(0).max(100).optional(),
            topics_covered: z.array(z.string()).optional(),
            grammar_points: z.array(z.string()).optional(),
        }).optional(),
    }),
});

// Agent Session Create Schema
export const AgentSessionCreateSchema = z.object({
    userId: z.string().describe('User ID from LiveKit metadata'),
    sessionId: z.string().optional().describe('Session ID (auto-generated if not provided)'),
    duration_minutes: z.number().nonnegative(),
    topics_covered: z.array(z.string()),
    new_vocabulary: z.array(z.string()),
    grammar_points: z.array(z.string()),
    pronunciation_practice_count: z.number().nonnegative(),
    overall_performance: z.string(),
    achievements: z.array(z.string()),
    next_session_recommendations: z.array(z.string()).optional(),
});

// Agent User Context Request Schema (for retrieval)
export const AgentUserContextRequestSchema = z.object({
    user_id: z.string().describe('User ID for validation (must match path param)'),
    session_id: z.string().optional().describe('Optional session ID for tracking'),
});

// Agent User Context Update Schema (for updating context)
export const AgentUserContextUpdateSchema = z.object({
    user_id: z.string().describe('User ID for validation (must match path param)'),
    name: z.string().optional().describe('Display name of the user'),
    preferences: z.object({
        learning_level: z.string().optional(),
        learning_goals: z.array(z.string()).optional(),
        preferred_topics: z.array(z.string()).optional(),
        practice_frequency: z.string().optional(),
        session_duration_preference: z.number().optional(),
        wants_formal_speech: z.boolean().optional(),
        wants_kanji_practice: z.boolean().optional(),
        wants_grammar_focus: z.boolean().optional(),
    }).optional(),
    progress: z.object({
        total_sessions: z.number().optional(),
        total_conversation_time: z.number().optional(),
        words_learned: z.number().optional(),
        phrases_practiced: z.number().optional(),
        pronunciation_score_avg: z.number().optional(),
        grammar_points_covered: z.number().optional(),
        achievements_unlocked: z.array(z.string()).optional(),
        last_session_date: z.string().nullable().optional(),
        current_streak: z.number().optional(),
    }).optional(),
    session_history: z.array(z.object({
        session_id: z.string(),
        date: z.string(),
        duration_minutes: z.number(),
        topics_covered: z.array(z.string()),
    })).optional(),
    created_at: z.string().optional().describe('Creation timestamp'),
    updated_at: z.string().optional().describe('Last update timestamp'),
});

// Agent Health Check Schema
export const AgentHealthCheckSchema = z.object({
    userId: z.string().describe('User ID for agent context validation'),
});

// Response Schemas
export const AgentProgressUpdateResponseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    userId: z.string(),
    sessionId: z.string().optional(),
    agentId: z.string(),
    timestamp: z.string(),
});

export const AgentSessionCreateResponseSchema = z.object({
    success: z.boolean(),
    session_id: z.string(),
    created_at: z.string(),
    created_by: z.literal('agent'),
    agent_id: z.string(),
});

export const AgentUserContextResponseSchema = z.object({
    user_id: z.string(),
    name: z.string().optional().describe('Display name of the user'),
    preferences: z.object({
        learning_level: z.string(),
        learning_goals: z.array(z.string()),
        preferred_topics: z.array(z.string()),
        practice_frequency: z.string(),
        session_duration_preference: z.number(),
        wants_formal_speech: z.boolean(),
        wants_kanji_practice: z.boolean(),
        wants_grammar_focus: z.boolean(),
    }),
    progress: z.object({
        total_sessions: z.number(),
        total_conversation_time: z.number(),
        words_learned: z.number(),
        phrases_practiced: z.number(),
        pronunciation_score_avg: z.number(),
        grammar_points_covered: z.number(),
        achievements_unlocked: z.array(z.string()),
        last_session_date: z.string().nullable(),
        current_streak: z.number(),
    }),
    session_history: z.array(z.object({
        session_id: z.string(),
        date: z.string(),
        duration_minutes: z.number(),
        topics_covered: z.array(z.string()),
    })),
    created_at: z.string(),
    updated_at: z.string(),
    accessed_by: z.object({
        agent_id: z.string(),
        timestamp: z.string(),
    }).optional(),
});

export const AgentHealthCheckResponseSchema = z.object({
    status: z.literal('healthy'),
    agent_id: z.string(),
    permissions: z.array(z.string()),
    timestamp: z.string(),
});

// Pronunciation Evaluation Schemas
export const PronunciationEvaluationSchema = z.object({
    kanji: z.string().min(1, 'Kanji is required'),
    romaji: z.string().min(1, 'Romaji is required'),
    translation: z.string().min(1, 'Translation is required'),
    topic: z.string().min(1, 'Topic is required'),
    user_pronunciation: z.string().min(1, 'User pronunciation is required'),
    evaluation_score: z.number().int().min(0).max(100).optional(),
    evaluation_feedback: z.string().optional(),
    evaluation_details: z.record(z.any()).optional(),
});

export const StorePronunciationEvaluationSchema = z.object({
    userId: z.string().min(1, 'User ID is required'),
    sessionId: z.string().optional(),
    evaluation: PronunciationEvaluationSchema,
    generate_audio: z.boolean().default(false).describe('Whether to generate and return audio data'),
});

export const GetPronunciationEvaluationsQuerySchema = z.object({
    topic: z.string().optional(),
    limit: z.coerce.number().positive().max(100).default(50),
    offset: z.coerce.number().nonnegative().default(0),
    since_date: z.string().datetime().optional(),
});

export const GetEvaluatedPhrasesQuerySchema = z.object({
    topic: z.string().optional(),
    days_back: z.coerce.number().positive().max(30).default(7),
});

// Pronunciation Evaluation Response Schemas
export const StorePronunciationEvaluationResponseSchema = z.object({
    success: z.literal(true),
    evaluation_id: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    message: z.string(),
    is_update: z.boolean().describe('True if this was an update to existing evaluation'),
    practice_count: z.number().describe('Number of times this phrase has been practiced'),
    audio_data: z.string().optional().describe('Base64 encoded audio data for pronunciation'),
});

export const PronunciationEvaluationItemSchema = z.object({
    id: z.string(),
    kanji: z.string(),
    romaji: z.string(),
    translation: z.string(),
    topic: z.string(),
    user_pronunciation: z.string(),
    evaluation_score: z.number().nullable(),
    evaluation_feedback: z.string().nullable(),
    evaluation_details: z.record(z.any()).nullable(),
    practice_count: z.number().default(1),
    created_at: z.string(),
    updated_at: z.string(),
});

export const GetPronunciationEvaluationsResponseSchema = z.object({
    success: z.literal(true),
    evaluations: z.array(PronunciationEvaluationItemSchema),
    total_count: z.number(),
    has_more: z.boolean(),
});

export const EvaluatedPhraseSchema = z.object({
    kanji: z.string(),
    romaji: z.string(),
    topic: z.string(),
    last_evaluated: z.string(),
    best_score: z.number().nullable(),
});

export const GetEvaluatedPhrasesResponseSchema = z.object({
    success: z.literal(true),
    evaluated_phrases: z.array(EvaluatedPhraseSchema),
    count: z.number(),
});

// Agent Bootstrap Schemas
export const AgentBootstrapRequestSchema = z.object({
    user_id: z.string().min(1, 'User ID is required'),
    include_raw_data: z.boolean().default(false).describe('Whether to include raw data alongside AI summary'),
});

export const AgentBootstrapResponseSchema = z.object({
    success: z.literal(true),
    user_id: z.string(),
    timestamp: z.string(),

    // AI-generated summary (always included)
    ai_summary: z.object({
        compact_summary: z.string(),
        generated_at: z.string(),
        from_cache: z.boolean(),
        data_included: z.object({
            conversation_count: z.number(),
            evaluation_count: z.number(),
            session_count: z.number(),
            has_user_context: z.boolean(),
        }),
    }),

    // User authentication data
    user_auth: z.object({
        display_name: z.string().nullable(),
        email: z.string().nullable(),
        avatar_url: z.string().nullable(),
        user_verified: z.boolean(),
    }),

    // Performance metadata
    performance: z.object({
        total_queries: z.number(),
        cache_hits: z.number(),
        execution_time_ms: z.number(),
    }),

    // Raw data (optional, only if include_raw_data=true)
    raw_data: z.object({
        user_context: z.object({
            user_id: z.string(),
            preferences: z.any(),
            progress: z.any(),
            session_history: z.any(),
            created_at: z.string(),
            updated_at: z.string(),
        }).nullable().optional(),
        evaluated_phrases: z.array(EvaluatedPhraseSchema).optional(),
        recent_sessions: z.array(z.object({
            session_id: z.string(),
            duration_minutes: z.number(),
            topics_covered: z.array(z.string()),
            created_at: z.string(),
        })).optional(),
    }).optional(),
});
