import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import {
    CreateSessionRequestSchema,
    SessionResponseSchema,
    APIErrorSchema,
    createAuthenticatedRoute,
} from '../../../lib/openapi.js';

// Create Learning Session Route
export const createSessionRoute = createRoute(
    createAuthenticatedRoute({
        method: 'post',
        path: '/',
        tags: ['Sessions'],
        summary: 'Create a learning session',
        description: `
Create a new learning session record with automatic progress tracking.

This endpoint will:
- Create a session record in the database
- Update user progress (sessions count, vocabulary learned, etc.)
- Update learning streak
- Create achievement records for any new achievements
- Add session to user's session history

**Session Flow:**
1. User completes a learning session with the Japanese tutor agent
2. Agent calls this endpoint with session data
3. API updates user progress and achievements
4. Returns session ID and creation timestamp
    `,
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: CreateSessionRequestSchema,
                    },
                },
                description: 'Learning session data',
            },
        },
        responses: {
            200: {
                description: 'Session created successfully',
                content: {
                    'application/json': {
                        schema: SessionResponseSchema,
                    },
                },
            },
            400: {
                description: 'Invalid session data',
                content: {
                    'application/json': {
                        schema: APIErrorSchema,
                    },
                },
            },
            403: {
                description: 'Insufficient permissions',
                content: {
                    'application/json': {
                        schema: APIErrorSchema,
                    },
                },
            },
        },
    })
);

// Get User Sessions Route
export const getUserSessionsRoute = createRoute(
    createAuthenticatedRoute({
        method: 'get',
        path: '/',
        tags: ['Sessions'],
        summary: 'Get current user\'s learning sessions',
        description: 'Retrieve paginated list of the authenticated user\'s learning sessions ordered by most recent.',
        request: {
            query: z.object({
                limit: z.string().optional().default('20').describe('Number of sessions to return (max 100)'),
                offset: z.string().optional().default('0').describe('Number of sessions to skip'),
            }),
        },
        responses: {
            200: {
                description: 'Sessions retrieved successfully',
                content: {
                    'application/json': {
                        schema: z.object({
                            sessions: z.array(z.object({
                                id: z.string(),
                                user_id: z.string(),
                                session_id: z.string(),
                                duration_minutes: z.number(),
                                topics_covered: z.array(z.string()),
                                new_vocabulary: z.array(z.string()),
                                grammar_points: z.array(z.string()),
                                pronunciation_practice_count: z.number(),
                                overall_performance: z.string().nullable(),
                                achievements: z.array(z.string()),
                                next_session_recommendations: z.array(z.string()),
                                created_at: z.string(),
                            })),
                        }),
                    },
                },
            },
        },
    })
);
