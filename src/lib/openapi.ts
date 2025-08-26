import { OpenAPIHono, z } from '@hono/zod-openapi';
// import { swaggerUI } from '@hono/swagger-ui';  // Temporarily disabled due to dependency issues
import { apiReference } from '@scalar/hono-api-reference';

// Common response schemas
export const APIErrorSchema = z.object({
    error: z.object({
        code: z.string(),
        message: z.string(),
        details: z.any().optional(),
    }),
    timestamp: z.string(),
});

export const SuccessResponseSchema = z.object({
    success: z.boolean(),
    message: z.string().optional(),
});

// User schemas
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

export const SessionHistorySchema = z.array(z.object({
    session_id: z.string(),
    date: z.string(),
    duration_minutes: z.number().positive(),
    topics_covered: z.array(z.string()),
}));

export const UserContextResponseSchema = z.object({
    user_id: z.string(),
    preferences: UserPreferencesSchema,
    progress: UserProgressSchema,
    session_history: SessionHistorySchema,
    created_at: z.string(),
    updated_at: z.string(),
});

export const UpdateContextRequestSchema = z.object({
    preferences: UserPreferencesSchema.optional(),
    progress: UserProgressSchema.optional(),
    session_history: SessionHistorySchema.optional(),
});

export const UpdateContextResponseSchema = z.object({
    success: z.boolean(),
    user_id: z.string(),
    updated_at: z.string(),
});

// Session schemas
export const CreateSessionRequestSchema = z.object({
    user_id: z.string(),
    session_id: z.string().optional(),
    duration_minutes: z.number().positive(),
    topics_covered: z.array(z.string()),
    new_vocabulary: z.array(z.string()),
    grammar_points: z.array(z.string()),
    pronunciation_practice_count: z.number().nonnegative(),
    overall_performance: z.string(),
    achievements: z.array(z.string()),
    next_session_recommendations: z.array(z.string()).optional(),
});

export const SessionResponseSchema = z.object({
    success: z.boolean(),
    session_id: z.string(),
    created_at: z.string(),
});

// Room schemas
export const RoomJoinRequestSchema = z.object({
    user_id: z.string(),
    room_name: z.string(),
});

export const RoomTokenResponseSchema = z.object({
    token: z.string(),
    room_url: z.string(),
    room_name: z.string(),
    expires_at: z.string(),
});

// Progress analytics schemas
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

// Common responses
export const UnauthorizedResponse = {
    401: {
        description: 'Unauthorized',
        content: {
            'application/json': {
                schema: APIErrorSchema,
            },
        },
    },
};

export const NotFoundResponse = {
    404: {
        description: 'Not Found',
        content: {
            'application/json': {
                schema: APIErrorSchema,
            },
        },
    },
};

export const InternalServerErrorResponse = {
    500: {
        description: 'Internal Server Error',
        content: {
            'application/json': {
                schema: APIErrorSchema,
            },
        },
    },
};

export const CommonResponses = {
    ...UnauthorizedResponse,
    ...NotFoundResponse,
    ...InternalServerErrorResponse,
};

// Authentication security schemes
export const BearerAuthSchema = {
    bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'User authentication token (Supabase or custom JWT)',
    },
    agentAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Agent service account token with specific permissions',
    },
} as const;

// Helper to create authenticated routes
export function createAuthenticatedRoute(route: any) {
    return {
        ...route,
        security: [{ bearerAuth: [] }],
        responses: {
            ...route.responses,
            ...CommonResponses,
        },
    };
}

// Create the main OpenAPI app
export function createOpenAPIApp() {
    const app = new OpenAPIHono({
        defaultHook: (result, c) => {
            if (!result.success) {
                return c.json(
                    {
                        error: {
                            code: 'VALIDATION_ERROR',
                            message: 'Request validation failed',
                            details: '',
                        },
                        timestamp: new Date().toISOString(),
                    },
                    400
                );
            }
        },
    });

    return app;
}

// Documentation routes
export function setupDocumentation(app: OpenAPIHono) {
    // OpenAPI JSON endpoint
    app.doc('/openapi.json', () => ({
        openapi: '3.1.0',
        info: {
            title: 'Japanese Language Tutor API',
            description: `
# Japanese Language Tutor API

A comprehensive API for managing Japanese language learning sessions, user progress, and LiveKit integration.

## Authentication

The API supports multiple authentication methods:

### 🔐 **User Authentication** (Standard Endpoints)
- **Supabase Auth**: Google OAuth, email/password, and more
- **Custom JWT**: Your own JWT tokens
- **Header**: \`Authorization: Bearer <user_token>\`

### 🤖 **Agent Authentication** (Agent Endpoints)
- **Service Account**: Special JWT tokens for the Python agent
- **Permissions**: \`user.context\`, \`user.progress\`, \`session.create\`
- **Header**: \`Authorization: Bearer <agent_token>\`

## Agent Integration

The agent endpoints follow the **app-flow.md** pattern:

1. **User connects** → Gets LiveKit token with metadata
2. **Agent joins room** → Extracts userId from metadata  
3. **Agent calls API** → Uses service JWT + userId context
4. **API validates** → Agent permissions + user existence

### 🔗 Integration Flow

\`\`\`python
# Python Agent Example
headers = {'Authorization': f'Bearer {AGENT_SERVICE_JWT}'}

# Get user context for personalization
context = requests.get(f'/api/agent/user/{user_id}/context', 
                      headers=headers,
                      json={'userId': user_id})

# Update progress during session
requests.post('/api/agent/progress',
               headers=headers,
               json={'userId': user_id, 'data': {...}})

# Create session record
requests.post('/api/agent/sessions',
               headers=headers, 
               json={'userId': user_id, ...})
\`\`\`
      `,
            version: '1.0.0',
            contact: {
                name: 'API Support',
                email: 'support@example.com',
            },
            license: {
                name: 'MIT',
                url: 'https://opensource.org/licenses/MIT',
            },
        },
        servers: [
            {
                url: 'http://localhost:5173',
                description: 'Development server',
            },
            {
                url: 'https://api.yourdomain.com',
                description: 'Production server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'User authentication token (Supabase or custom JWT)',
                },
                agentAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Agent service account token with specific permissions',
                },
            },
        },
        tags: [
            {
                name: 'Health',
                description: 'Service health and status endpoints',
            },
            {
                name: 'User Context',
                description: 'User preferences, progress, and context management',
            },
            {
                name: 'Sessions',
                description: 'Learning session creation and management',
            },
            {
                name: 'LiveKit',
                description: 'Real-time video/audio room management',
            },
            {
                name: 'Analytics',
                description: 'Progress tracking and analytics',
            },
            {
                name: 'Agent',
                description: '🤖 Agent service endpoints for Python agent integration (requires agent JWT)',
            },
        ],
    }));

    // Swagger UI (temporarily disabled due to dependency issues)
    // app.get('/docs', swaggerUI({ url: '/openapi.json' }));

    // Redirect docs to scalar for now
    app.get('/docs', (c) => c.redirect('/scalar'));

    // Scalar API Reference (prettier than Swagger)
    app.get('/scalar', apiReference({
        spec: {
            url: '/openapi.json',
        },
        theme: 'purple',
        pageTitle: 'Japanese Language Tutor API Documentation',
    }));

    // Alternative documentation route
    app.get('/reference', apiReference({
        spec: {
            url: '/openapi.json',
        },
        theme: 'default',
        pageTitle: 'API Reference',
    }));
}
