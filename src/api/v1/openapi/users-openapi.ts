import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import {
    UserContextResponseSchema,
    UpdateContextRequestSchema,
    UpdateContextResponseSchema,
    ProgressAnalyticsSchema,
    APIErrorSchema,
    createAuthenticatedRoute,
} from '../../../lib/openapi';
import {
    UserGetPronunciationEvaluationsQuerySchema,
    UserGetPronunciationEvaluationsResponseSchema,
    UserGetEvaluatedPhrasesQuerySchema,
    UserGetEvaluatedPhrasesResponseSchema,
} from '../schemas/users.schemas';

// Get User Context Route
export const getUserContextRoute = createRoute(
    createAuthenticatedRoute({
        method: 'get',
        path: '/{user_id}/context',
        tags: ['User Context'],
        summary: 'Get user learning context',
        description: 'Retrieve complete user context including preferences, progress, and session history.',
        request: {
            params: z.object({
                user_id: z.string().describe('The user ID to retrieve context for'),
            }),
        },
        responses: {
            200: {
                description: 'User context retrieved successfully',
                content: {
                    'application/json': {
                        schema: UserContextResponseSchema,
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

// Update User Context Route
export const updateUserContextRoute = createRoute(
    createAuthenticatedRoute({
        method: 'put',
        path: '/{user_id}/context',
        tags: ['User Context'],
        summary: 'Update user learning context',
        description: 'Create or update user context including preferences, progress, and session history.',
        request: {
            params: z.object({
                user_id: z.string().describe('The user ID to update context for'),
            }),
            body: {
                content: {
                    'application/json': {
                        schema: UpdateContextRequestSchema,
                    },
                },
                description: 'User context data to update',
            },
        },
        responses: {
            200: {
                description: 'User context updated successfully',
                content: {
                    'application/json': {
                        schema: UpdateContextResponseSchema,
                    },
                },
            },
            400: {
                description: 'Invalid request data',
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

// Get User Progress Route
export const getUserProgressRoute = createRoute(
    createAuthenticatedRoute({
        method: 'get',
        path: '/{user_id}/progress',
        tags: ['Analytics'],
        summary: 'Get user progress analytics',
        description: 'Retrieve detailed progress analytics including recent activity, achievements, and milestones.',
        request: {
            params: z.object({
                user_id: z.string().describe('The user ID to retrieve progress for'),
            }),
        },
        responses: {
            200: {
                description: 'Progress analytics retrieved successfully',
                content: {
                    'application/json': {
                        schema: ProgressAnalyticsSchema,
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
