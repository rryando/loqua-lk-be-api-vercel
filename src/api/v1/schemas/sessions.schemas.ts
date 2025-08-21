import { z } from 'zod';

// Create Session Schema
export const CreateSessionSchema = z.object({
    user_id: z.string(),
    session_id: z.string().optional().describe('Will be generated if not provided'),
    duration_minutes: z.number().positive(),
    topics_covered: z.array(z.string()),
    new_vocabulary: z.array(z.string()),
    grammar_points: z.array(z.string()),
    pronunciation_practice_count: z.number().nonnegative(),
    overall_performance: z.string(),
    achievements: z.array(z.string()),
    next_session_recommendations: z.array(z.string()).optional(),
});

// Session Response Schema
export const SessionResponseSchema = z.object({
    success: z.boolean(),
    session_id: z.string(),
    created_at: z.string(),
});

// Get User Sessions Query Schema
export const GetUserSessionsQuerySchema = z.object({
    limit: z.string().transform(Number).optional(),
    offset: z.string().transform(Number).optional(),
    from_date: z.string().optional(),
    to_date: z.string().optional(),
});

// User Sessions Response Schema
export const UserSessionsResponseSchema = z.object({
    sessions: z.array(z.object({
        session_id: z.string(),
        duration_minutes: z.number(),
        topics_covered: z.array(z.string()),
        new_vocabulary: z.array(z.string()),
        grammar_points: z.array(z.string()),
        pronunciation_practice_count: z.number(),
        overall_performance: z.string().nullable(),
        achievements: z.array(z.string()),
        created_at: z.string(),
    })),
    total_count: z.number(),
    pagination: z.object({
        limit: z.number(),
        offset: z.number(),
        has_next: z.boolean(),
    }),
});
