import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import {
    UserContextResponseSchema,
    SessionResponseSchema,
    APIErrorSchema,
    createAuthenticatedRoute,
} from '../../../lib/openapi';
import {
    StorePronunciationEvaluationSchema,
    StorePronunciationEvaluationResponseSchema,
    GetPronunciationEvaluationsQuerySchema,
    GetPronunciationEvaluationsResponseSchema,
    GetEvaluatedPhrasesQuerySchema,
    GetEvaluatedPhrasesResponseSchema,
    AgentBootstrapResponseSchema,
} from '../schemas/agent.schemas';

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
                        user_id: z.string().describe('User ID for validation (must match path param)'),
                        session_id: z.string().optional().describe('Optional session ID for tracking'),
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


export const agentCreateUserFlashCardRoute = createRoute({
    method: 'post',
    path: '/user/{user_id}/create_flash_card',
    tags: ['Agent'],
    summary: 'Create flash card for user (Agent)',
    description: `
Create a flash card for a user.

**Agent Use Case:**
The Python agent calls this endpoint when a user creates a flash card to:
- Create a flash card for a user

**Security:**
- Requires agent service account JWT with 'user.create_flash_card' permission
- Agent must provide userId in request body for validation
- Returns flash card created successfully

  `,
    request: {
        params: z.object({
            user_id: z.string().describe('User ID to retrieve context for'),
        }),
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        cardId: z.string().describe('Card ID for validation (must match path param)'),
                        cardType: z.string().describe('Card Type for validation (must match path param)'),
                        cardData: z.string().describe('Card Data for validation (must match path param)'),
                    }),
                },
            },
            description: 'Agent flash card creation request with user validation',
        },
    },
    responses: {
        200: {
            description: 'Flash card created successfully',
            content: {
                'application/json': {
                    schema: z.object({
                        card_id: z.string(),
                        card_type: z.string(),
                        card_data: z.string(),
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


// Agent User Token Route
export const agentUserTokenRoute = createRoute({
    method: 'post',
    path: '/user-token',
    tags: ['Agent'],
    summary: 'Get encrypted user JWT token',
    description: `
Get encrypted user JWT token for agent to use when making API calls on behalf of user.

**Purpose:**
- Agent requests encrypted user JWT after user joins room
- Prevents race conditions by waiting for user presence first
- Enables agent to act on behalf of user with proper permissions

**Pattern:**
1. User joins LiveKit room with metadata containing userId
2. Agent waits for participant presence using ctx.wait_for_participant()
3. Agent extracts userId from participant metadata
4. Agent requests encrypted user JWT from this endpoint
5. Agent decrypts JWT and uses it for subsequent API calls

**Security:**
- User JWT is encrypted using AES-256-CBC
- Agent must provide valid agent JWT for authentication
- Room and user validation ensures proper access control

**Python Agent Usage:**
\`\`\`python
# After waiting for participant
user_participant = await ctx.wait_for_participant()
user_id = user_participant.attributes.get("user_id")

# Request encrypted user token
response = await http_client.post("/api/v1/agent/user-token", 
  headers={"Authorization": f"Bearer {AGENT_JWT}"},
  json={
    "room_name": ctx.room.name,
    "user_id": user_id,
    "agent_id": "my-agent-id"
  })

encrypted_token = response.json()["encrypted_token"]
user_jwt = decrypt_token(encrypted_token, SHARED_SECRET)

# Use user_jwt for subsequent API calls
\`\`\`
  `,
    request: {
        body: {
            content: {
                'application/json': {
                    schema: z.object({
                        room_name: z.string().describe('LiveKit room name'),
                        user_id: z.string().describe('User ID from LiveKit participant metadata'),
                        agent_id: z.string().describe('Agent identifier for audit logging'),
                    }),
                },
            },
            description: 'User token request parameters',
        },
    },
    responses: {
        200: {
            description: 'Encrypted user JWT token',
            content: {
                'application/json': {
                    schema: z.object({
                        encrypted_token: z.string().describe('AES-256-CBC encrypted user JWT'),
                        user_id: z.string().describe('User ID this token belongs to'),
                        room_name: z.string().describe('Room name this token is valid for'),
                        expires_in: z.number().describe('Token expiry in seconds'),
                        issued_at: z.string().describe('ISO timestamp when token was issued'),
                        issued_to: z.string().describe('Agent ID this token was issued to'),
                    }),
                },
            },
        },
        400: {
            description: 'Missing required fields',
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
        404: {
            description: 'User not found',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
        500: {
            description: 'Server error or configuration issue',
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

// Store Pronunciation Evaluation Route
export const agentStorePronunciationEvaluationRoute = createRoute({
    method: 'post',
    path: '/pronunciation-evaluations',
    tags: ['Agent'],
    summary: 'Store pronunciation evaluation (Agent)',
    description: `
Store a new pronunciation evaluation result for flashcard review.

**Agent Use Case:**
The Python agent calls this endpoint after evaluating user pronunciation to:
- Store evaluation results for user progress tracking
- Enable flashcard system for pronunciation practice
- Prevent duplicate evaluations within 24 hours

**Security:**
- Requires agent service account JWT 
- Agent can store evaluations for any user (for agent operations)
- Validates user exists in database
- Application-level duplicate prevention (same kanji within 24h)

**Integration with Agent:**
1. Agent evaluates user pronunciation using STT/analysis
2. Agent calls this endpoint to store results
3. System prevents duplicates automatically
4. Data becomes available for flashcard generation
  `,
    request: {
        body: {
            content: {
                'application/json': {
                    schema: StorePronunciationEvaluationSchema,
                },
            },
            description: 'Pronunciation evaluation data',
        },
    },
    responses: {
        201: {
            description: 'Pronunciation evaluation stored successfully',
            content: {
                'application/json': {
                    schema: StorePronunciationEvaluationResponseSchema,
                },
            },
        },
        400: {
            description: 'Invalid evaluation data - missing required fields',
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
        409: {
            description: 'Duplicate evaluation - same phrase evaluated today',
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

// Get User Pronunciation Evaluations Route  
export const agentGetPronunciationEvaluationsRoute = createRoute({
    method: 'get',
    path: '/pronunciation-evaluations/{user_id}',
    tags: ['Agent'],
    summary: 'Get user pronunciation evaluations (Agent)',
    description: `
Retrieve pronunciation evaluations for flashcard generation and review.

**Agent Use Case:**
The Python agent calls this endpoint to:
- Generate flashcards from previous evaluations
- Review user's pronunciation progress
- Filter by topic or date range
- Support pagination for large datasets

**Query Parameters:**
- \`topic\`: Filter evaluations by learning topic
- \`limit\`: Number of results (default: 50, max: 100)
- \`offset\`: Pagination offset (default: 0)
- \`since_date\`: ISO date to filter recent evaluations

**Security:**
- Requires agent service account JWT
- Agent can access evaluations for any user
- Results ordered by most recent first
  `,
    request: {
        params: z.object({
            user_id: z.string().describe('User ID to retrieve evaluations for'),
        }),
        query: GetPronunciationEvaluationsQuerySchema,
    },
    responses: {
        200: {
            description: 'Pronunciation evaluations retrieved successfully',
            content: {
                'application/json': {
                    schema: GetPronunciationEvaluationsResponseSchema,
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
        404: {
            description: 'No evaluations found for user',
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

// Get Evaluated Phrases for LLM Context Route
export const agentGetEvaluatedPhrasesRoute = createRoute({
    method: 'get',
    path: '/pronunciation-evaluations/{user_id}/phrases',
    tags: ['Agent'],
    summary: 'Get evaluated phrases for LLM context (Agent)',
    description: `
Get list of already-evaluated phrases so LLM doesn't repeat them during lessons.

**Agent Use Case:**
The Python agent calls this endpoint at session start to:
- Get list of recently practiced phrases
- Provide context to LLM for avoiding repetition
- Focus on new vocabulary and phrases
- Optimize learning progression

**Query Parameters:**
- \`topic\`: Filter phrases by learning topic
- \`days_back\`: Days to look back for evaluations (default: 7, max: 30)

**Caching:**
- Results are cached for 30 minutes for performance
- Cache key includes user, topic, and days_back parameters
- Automatic cache invalidation on new evaluations

**Performance:**
- Optimized query with proper indexing
- Groups by kanji to show unique phrases only
- Returns best score and latest evaluation date
  `,
    request: {
        params: z.object({
            user_id: z.string().describe('User ID to retrieve phrases for'),
        }),
        query: GetEvaluatedPhrasesQuerySchema,
    },
    responses: {
        200: {
            description: 'Evaluated phrases retrieved successfully',
            content: {
                'application/json': {
                    schema: GetEvaluatedPhrasesResponseSchema,
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

// Agent Bootstrap Route - Unified startup endpoint
export const agentBootstrapRoute = createRoute({
    method: 'get',
    path: '/bootstrap/{user_id}',
    tags: ['Agent'],
    summary: 'Unified agent bootstrap endpoint (Agent)',
    description: `
Unified endpoint that provides all agent startup data in a single API call.

**Purpose:**
Replaces multiple separate API calls during agent startup:
- User authentication data
- AI-generated user summary
- User context (optional)
- Evaluated phrases (optional)
- Recent sessions (optional)

**Performance Benefits:**
- Single round-trip instead of 4+ separate calls
- Reduced startup latency by 60-75%
- Consistent caching across all data
- Atomic operation with better error handling

**Query Parameters:**
- \`include_raw_data\`: Set to 'true' to include structured raw data alongside AI summary

**Agent Use Case:**
1. Agent starts up and needs user context
2. Instead of calling /user-context, /summary, /evaluated-phrases separately
3. Agent calls this single endpoint to get everything needed
4. Agent uses AI summary for quick context, raw data for detailed operations

**Caching:**
- AI summary: Cached for 48 hours with smart invalidation
- Raw data: Cached for 10 minutes for performance
- Performance metadata shows cache hit ratios

**Security:**
- Requires agent service account JWT
- Agent can access bootstrap data for any user
- Validates user exists and returns comprehensive context
  `,
    request: {
        params: z.object({
            user_id: z.string().describe('User ID to bootstrap agent for'),
        }),
        query: z.object({
            include_raw_data: z.string().optional().describe('Set to "true" to include raw structured data'),
        }),
    },
    responses: {
        200: {
            description: 'Agent bootstrap data retrieved successfully',
            content: {
                'application/json': {
                    schema: AgentBootstrapResponseSchema,
                },
            },
        },
        400: {
            description: 'Invalid user ID format',
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
        404: {
            description: 'User not found or no data available',
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