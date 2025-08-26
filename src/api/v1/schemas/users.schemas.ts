import { z } from 'zod';

// User Preferences Schema
export const UserPreferencesSchema = z.object({
    learning_level: z.enum(["absolute_beginner", "beginner", "elementary", "intermediate", "upper_intermediate", "advanced"]),
    learning_goals: z.array(z.enum(["conversation", "travel", "business", "anime_manga", "culture", "jlpt_prep", "general"])),
    preferred_topics: z.array(z.string()),
    practice_frequency: z.string(),
    session_duration_preference: z.number().positive(),
    wants_formal_speech: z.boolean(),
    wants_kanji_practice: z.boolean(),
    wants_grammar_focus: z.boolean(),
});

// User Progress Schema
export const UserProgressSchema = z.object({
    total_sessions: z.number().nonnegative(),
    total_conversation_time: z.number().nonnegative(),
    words_learned: z.number().nonnegative(),
    phrases_practiced: z.number().nonnegative(),
    pronunciation_score_avg: z.number().min(0).max(100),
    grammar_points_covered: z.array(z.string()),
    achievements_unlocked: z.array(z.string()),
    last_session_date: z.string().nullable(),
    current_streak: z.number().nonnegative(),
});

// Session History Schema
export const SessionHistorySchema = z.array(z.object({
    session_id: z.string(),
    date: z.string(),
    duration_minutes: z.number().positive(),
    topics_covered: z.array(z.string()),
}));

// Update Context Schema
export const UpdateContextSchema = z.object({
    preferences: UserPreferencesSchema.optional(),
    progress: UserProgressSchema.optional(),
    session_history: SessionHistorySchema.optional(),
});

// User Context Response Schema
export const UserContextResponseSchema = z.object({
    user_id: z.string(),
    preferences: UserPreferencesSchema,
    progress: UserProgressSchema,
    session_history: SessionHistorySchema,
    created_at: z.string(),
    updated_at: z.string(),
});

// Update Context Response Schema
export const UpdateContextResponseSchema = z.object({
    success: z.boolean(),
    user_id: z.string(),
    updated_at: z.string(),
});

// Progress Analytics Schema
export const ProgressAnalyticsSchema = z.object({
    total_stats: z.object({
        sessions_completed: z.number(),
        total_study_time: z.number(),
        vocabulary_learned: z.number(),
        current_streak: z.number(),
        level_progression: z.array(z.string()),
    }),
    recent_activity: z.array(z.object({
        date: z.string(),
        session_count: z.number(),
        study_minutes: z.number(),
        topics_covered: z.array(z.string()),
    })),
    achievements: z.array(z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        unlocked_at: z.string(),
        icon: z.string().optional(),
    })),
    next_milestones: z.array(z.object({
        title: z.string(),
        progress: z.number(),
        target: z.number(),
    })),
});

// User Pronunciation Evaluation Schemas
export const UserGetPronunciationEvaluationsQuerySchema = z.object({
    topic: z.string().optional(),
    limit: z.coerce.number().positive().max(100).default(50),
    offset: z.coerce.number().nonnegative().default(0),
    since_date: z.string().datetime().optional(),
});

export const UserGetEvaluatedPhrasesQuerySchema = z.object({
    topic: z.string().optional(),
    days_back: z.coerce.number().positive().max(30).default(7),
});

// User Pronunciation Evaluation Response Schemas
export const UserPronunciationEvaluationItemSchema = z.object({
    id: z.string(),
    kanji: z.string(),
    romaji: z.string(),
    translation: z.string(),
    topic: z.string(),
    user_pronunciation: z.string(),
    evaluation_score: z.number().nullable(),
    evaluation_feedback: z.string().nullable(),
    evaluation_details: z.record(z.any()).nullable(),
    created_at: z.string(),
});

export const UserGetPronunciationEvaluationsResponseSchema = z.object({
    success: z.literal(true),
    evaluations: z.array(UserPronunciationEvaluationItemSchema),
    total_count: z.number(),
    has_more: z.boolean(),
});

export const UserEvaluatedPhraseSchema = z.object({
    id: z.string(),
    phrase: z.string(), // romaji pronunciation
    kanji: z.string(),
    translation: z.string(),
    topic: z.string(),
    latest_evaluation_date: z.string(),
    best_score: z.number().nullable(),
    evaluation_count: z.number(),
});

export const UserGetEvaluatedPhrasesResponseSchema = z.object({
    success: z.literal(true),
    evaluated_phrases: z.array(UserEvaluatedPhraseSchema),
    count: z.number(),
});

// User Pronunciation Audio Response Schema
export const UserPronunciationAudioResponseSchema = z.object({
    success: z.literal(true),
    audio_data: z.string().describe('Complete data URL with base64 encoded MP3 audio (data:audio/mp3;base64,...)'),
    audio_base64: z.string().describe('Raw base64 encoded MP3 audio data without MIME prefix'),
    kanji: z.string().describe('The original Japanese text'),
    romaji: z.string().describe('The romanized pronunciation'),
});
