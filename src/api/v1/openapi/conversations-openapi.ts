import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import { APIErrorSchema } from '../schemas/common.schemas';
import {
    StoreConversationRequestSchema,
    StoreConversationResponseSchema,
    GetUserSummaryResponseSchema,
} from '../schemas/conversations.schemas';

// Store Conversations Route
export const storeConversationsRoute = createRoute({
    method: 'post',
    path: '/conversations',
    tags: ['Conversations'],
    summary: 'Store conversation data',
    description: `
Store user conversation messages for summary generation.

**Usage:**
- Store conversation messages from chat sessions
- Supports batch storage of multiple messages
- Each message includes role (user/assistant), content, and metadata
- Used as input for AI-powered user summary generation

**Data Storage:**
- Messages stored with session grouping
- Supports metadata for additional context
- Timestamps automatically added
- No automatic cleanup (manual deletion required)

**Integration with Summary System:**
- Stored conversations feed into user summary generation
- Summary system aggregates all user data including conversations
- Cache invalidation triggers when new conversations added
    `,
    request: {
        body: {
            content: {
                'application/json': {
                    schema: StoreConversationRequestSchema,
                },
            },
            description: 'Array of conversation entries to store',
        },
    },
    responses: {
        201: {
            description: 'Conversations stored successfully',
            content: {
                'application/json': {
                    schema: StoreConversationResponseSchema,
                },
            },
        },
        400: {
            description: 'Invalid conversation data',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
        401: {
            description: 'Unauthorized - valid JWT required',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
        500: {
            description: 'Server error during storage',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
    },
    security: [{ bearerAuth: [] }],
});

// Get User Summary Route
export const getUserSummaryRoute = createRoute({
    method: 'get',
    path: '/users/{user_id}/summary',
    tags: ['User Summaries'],
    summary: 'Get comprehensive user summary',
    description: `
Get AI-generated compact summary of all user data for agent consumption.

**Summary Content:**
- User conversations and communication patterns
- Learning progress and evaluation history
- Preferences and behavior patterns  
- Key topics and knowledge areas
- Personality traits and interaction style

**Caching Strategy:**
- Long-term cache (24-48 hours)
- Hash-based invalidation when user data changes
- Lazy generation (on-demand only)
- Cost-optimized OpenAI usage

**Agent Integration:**
- Optimized for LLM consumption with minimal tokens
- Structured data format for easy parsing
- Detailed but compact for agent context
- Session-start loading pattern (not real-time)

**Performance:**
- First request: ~2-3 seconds (OpenAI generation)
- Cached requests: <100ms
- Maximum 1-2 OpenAI calls per user per day
    `,
    request: {
        params: z.object({
            user_id: z.string().uuid().describe('User ID to get summary for'),
        }),
    },
    responses: {
        200: {
            description: 'User summary retrieved successfully',
            content: {
                'application/json': {
                    schema: GetUserSummaryResponseSchema,
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
        401: {
            description: 'Unauthorized - valid JWT required',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
        500: {
            description: 'Server error during summary generation',
            content: {
                'application/json': {
                    schema: APIErrorSchema,
                },
            },
        },
    },
    security: [{ bearerAuth: [] }],
});