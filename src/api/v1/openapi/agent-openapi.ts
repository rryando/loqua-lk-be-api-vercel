import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import {
    UserContextResponseSchema,
    SessionResponseSchema,
    APIErrorSchema,
    createAuthenticatedRoute,
} from '../../../lib/openapi';

// Agent Progress Update Route
export const agentProgressRoute = createRoute({
    method: 'post',
    path: '/progress',
    tags: ['Agent'],
    summary: 'Update user progress (Agent)',
    description: `
Update user progress during a learning session on behalf of a user.

**Agent Service Account Pattern:**
This endpoint follows the app-flow.md pattern where the agent uses its own service JWT 
but passes the userId from LiveKit session metadata.

**Authentication:**
- Requires agent service account JWT with 'user.progress' permission
- Validates that userId exists in database
- Validates that agent is authorized to act on behalf of user

**Usage in Python Agent:**
\`\`\`python
headers = {'Authorization': f'Bearer {AGENT_SERVICE_JWT}'}
response = requests.post('/api/agent/progress', 
  headers=headers,
  json={
    'userId': user_id_from_livekit_metadata,
    'sessionId': session_id_from_livekit_metadata,
    'data': {'status': 'in_progress', 'progress': {...}}
  })
\`\`\`
  `,
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
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
                    }),
                },
            },
            description: 'Progress update data with user context',
        },
    },
    responses: {
        200: {
            description: 'Progress updated successfully',
            content: {
                'application/json': {
                    schema: z.object({
                        success: z.boolean(),
                        message: z.string(),
                        userId: z.string(),
                        sessionId: z.string().optional(),
                        agentId: z.string(),
                        timestamp: z.string(),
                    }),
                },
            },
        },
        400: {
            description: 'Invalid request data or missing userId',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
        401: {
            description: 'Invalid agent token',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
        403: {
            description: 'Insufficient agent permissions',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
        500: {
            description: 'Server error',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
    },
    security: [{ agentAuth: [] }],
});

// Agent Session Creation Route
export const agentSessionRoute = createRoute({
    method: 'post',
    path: '/sessions',
    tags: ['Agent'],
    summary: 'Create learning session (Agent)',
    description: `
Create a learning session record on behalf of a user.

**Agent Service Account Pattern:**
The agent creates session records after completing voice interactions with users.
This endpoint validates the agent's authority and the user's existence.

**Automatic Progress Updates:**
- Updates user's total sessions count
- Adds vocabulary learned
- Updates learning streak
- Creates achievement records
- Adds to session history

**Security:**
- Requires agent service account JWT with 'session.create' permission
- Validates userId exists in database
- Session data includes agent identification for audit trail
  `,
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        userId: z.string().describe('User ID from LiveKit metadata'),
                        sessionId: z.string().optional().describe('Session ID (auto-generated if not provided)'),
                        duration_minutes: z.number().positive(),
                        topics_covered: z.array(z.string()),
                        new_vocabulary: z.array(z.string()),
                        grammar_points: z.array(z.string()),
                        pronunciation_practice_count: z.number().nonnegative(),
                        overall_performance: z.string(),
                        achievements: z.array(z.string()),
                        next_session_recommendations: z.array(z.string()).optional(),
                    }),
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
                    schema: z.object({
                        success: z.boolean(),
                        session_id: z.string(),
                        created_at: z.string(),
                        created_by: z.literal('agent'),
                        agent_id: z.string(),
                    }),
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
        401: {
            description: 'Invalid agent token',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
        403: {
            description: 'Insufficient agent permissions',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
    },
    security: [{ agentAuth: [] }],
});

// Agent User Context Route
export const agentUserContextRoute = createRoute({
    method: 'post',
    path: '/user/{user_id}/context',
    tags: ['Agent'],
    summary: 'Get user context (Agent)',
    description: `
Retrieve user learning context for personalization during agent sessions.

**Agent Use Case:**
The Python agent calls this endpoint when a user joins a LiveKit room to:
- Get user's learning level and preferences
- Understand user's progress and history
- Personalize conversation topics and difficulty
- Access achievement history for motivation

**Security:**
- Requires agent service account JWT with 'user.context' permission
- Agent must provide userId in request body for validation
- Returns comprehensive user learning profile

**Integration with LiveKit:**
1. User joins LiveKit room with metadata containing userId
2. Agent extracts userId from room metadata
3. Agent calls this endpoint to get user context
4. Agent personalizes session based on user data
  `,
    request: {
        params: z.object({
            user_id: z.string().describe('User ID to retrieve context for'),
        }),
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        userId: z.string().describe('User ID for validation (must match path param)'),
                        sessionId: z.string().optional().describe('Optional session ID for tracking'),
                    }),
                },
            },
            description: 'Agent context request with user validation',
        },
    },
    responses: {
        200: {
            description: 'User context retrieved successfully',
            content: {
                'application/json': {
                    schema: z.object({
                        user_id: z.string(),
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
                            grammar_points_covered: z.array(z.string()),
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
                        }),
                    }),
                },
            },
        },
        400: {
            description: 'Invalid request or missing userId',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
        401: {
            description: 'Invalid agent token',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
        403: {
            description: 'Insufficient agent permissions',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
        404: {
            description: 'User context not found',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
    },
    security: [{ agentAuth: [] }],
});

// Agent Health Check Route
export const agentHealthRoute = createRoute({
    method: 'post',
    path: '/health',
    tags: ['Agent'],
    summary: 'Agent health check',
    description: `
Health check endpoint specifically for agent services.

**Purpose:**
- Verify agent authentication is working
- Check agent permissions
- Monitor agent service status
- Validate agent can communicate with API

**Returns:**
- Agent ID from JWT token
- Agent permissions list
- Service timestamp
- Health status

**Note:** Requires userId in request body for agent context validation.
  `,
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        userId: z.string().describe('User ID for agent context validation'),
                    }),
                },
            },
            description: 'Health check with user context',
        },
    },
    responses: {
        200: {
            description: 'Agent service is healthy',
            content: {
                'application/json': {
                    schema: z.object({
                        status: z.literal('healthy'),
                        agent_id: z.string(),
                        permissions: z.array(z.string()),
                        timestamp: z.string(),
                    }),
                },
            },
        },
        400: {
            description: 'Missing userId or invalid request',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
        401: {
            description: 'Invalid agent token',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
        403: {
            description: 'Insufficient agent permissions',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
    },
    security: [{ agentAuth: [] }],
});


export const notLoggedInHealthRoute = createRoute({
    method: 'get',
    path: '/health',
    tags: ['Agent'],
    summary: 'Agent health check',
    description: `
Health check endpoint specifically for agent services.
  `,
    responses: {
        200: {
            description: 'Agent service is healthy',
            content: {
                'application/json': {
                    schema: z.object({
                        status: z.literal('healthy'),
                        timestamp: z.string(),
                    }),
                },
            },
        },
    },
});