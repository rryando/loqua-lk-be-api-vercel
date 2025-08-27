import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import {
    APIErrorSchema,
    createAuthenticatedRoute,
} from '../../../lib/openapi.js';
import {
    UserGetPronunciationEvaluationsQuerySchema,
    UserGetPronunciationEvaluationsResponseSchema,
    UserGetEvaluatedPhrasesQuerySchema,
    UserGetEvaluatedPhrasesResponseSchema,
    UserPronunciationAudioResponseSchema,
} from '../schemas/users.schemas.js';

// Get User Pronunciation Evaluations Route
export const getUserPronunciationEvaluationsRoute = createRoute(
    createAuthenticatedRoute({
        method: 'get',
        path: '/{user_id}/pronunciation-evaluations',
        tags: ['User Pronunciation'],
        summary: 'Get user pronunciation evaluations',
        description: `
Get pronunciation evaluations for the authenticated user.

**User Access Only:**
- Users can only access their own pronunciation evaluations
- Provides pagination, filtering by topic, and date range filtering
- Results ordered by most recent evaluations first

**Query Parameters:**
- \`topic\`: Filter evaluations by legacy topic string
- \`topic_id\`: Filter evaluations by specific topic ID
- \`category\`: Filter evaluations by topic category (conversation, business, academic, casual, technical)
- \`limit\`: Number of results (default: 50, max: 100)
- \`offset\`: Pagination offset (default: 0)
- \`since_date\`: ISO date to filter recent evaluations

**Use Cases:**
- Review pronunciation practice history
- Track improvement over time
- Filter by specific topics or time periods
- Export pronunciation data for analysis
        `,
        request: {
            params: z.object({
                user_id: z.string().describe('The user ID to retrieve evaluations for'),
            }),
            query: UserGetPronunciationEvaluationsQuerySchema,
        },
        responses: {
            200: {
                description: 'Pronunciation evaluations retrieved successfully',
                content: {
                    'application/json': {
                        schema: UserGetPronunciationEvaluationsResponseSchema,
                    },
                },
            },
            403: {
                description: 'Insufficient permissions - can only access own data',
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
    })
);

// Get User Evaluated Phrases Route
export const getUserEvaluatedPhrasesRoute = createRoute(
    createAuthenticatedRoute({
        method: 'get',
        path: '/{user_id}/pronunciation-evaluations/phrases',
        tags: ['User Pronunciation'],
        summary: 'Get evaluated phrases for user review',
        description: `
Get list of phrases that have been evaluated for pronunciation practice review.

**User Access Only:**
- Users can only access their own evaluated phrases
- Shows unique phrases with best scores and latest evaluation dates
- Useful for tracking which phrases have been practiced

**Query Parameters:**
- \`topic\`: Filter phrases by legacy topic string
- \`topic_id\`: Filter phrases by specific topic ID
- \`category\`: Filter phrases by topic category (conversation, business, academic, casual, technical)
- \`days_back\`: Days to look back for evaluations (default: 7, max: 30)

**Data Processing:**
- Groups evaluations by unique kanji/phrase
- Shows best score achieved for each phrase
- Returns latest evaluation date for each phrase
- Eliminates duplicate entries

**Use Cases:**
- Review which phrases have been practiced
- Identify phrases that need more practice (low scores)
- Track pronunciation improvement over time
- Generate personalized review lists
        `,
        request: {
            params: z.object({
                user_id: z.string().describe('The user ID to retrieve phrases for'),
            }),
            query: UserGetEvaluatedPhrasesQuerySchema,
        },
        responses: {
            200: {
                description: 'Evaluated phrases retrieved successfully',
                content: {
                    'application/json': {
                        schema: UserGetEvaluatedPhrasesResponseSchema,
                    },
                },
            },
            403: {
                description: 'Insufficient permissions - can only access own data',
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
    })
);

// Generate Pronunciation Audio Route
export const getUserPronunciationAudioRoute = createRoute(
    createAuthenticatedRoute({
        method: 'post',
        path: '/{user_id}/pronunciation-evaluations/{evaluation_id}/listen',
        tags: ['User Pronunciation'],
        summary: 'Generate pronunciation audio',
        description: `
Generate audio pronunciation for a specific evaluation.

**Features:**
- Uses OpenAI TTS with female voice (Nova)
- Generates lightweight MP3 format
- Caches audio files on filesystem for performance
- Returns audio data directly in multiple formats for immediate use

**User Access Only:**
- Users can only generate audio for their own evaluations
- Validates evaluation ownership before processing
- Returns error if pronunciation data is not available (dummy data)

**Audio Generation:**
- Input: Romaji pronunciation from evaluation
- Output: Spoken Japanese audio (MP3) returned as base64
- No filesystem storage - audio generated on-demand

**Response Format:**
- audio_data: Complete data URL for direct HTML audio element use
- audio_base64: Raw base64 data for custom implementations

**Use Cases:**
- Listen to correct pronunciation of practiced phrases
- Audio feedback for pronunciation training
- Accessibility support for pronunciation learning
- Direct audio playback without additional HTTP requests
        `,
        request: {
            params: z.object({
                user_id: z.string().describe('The user ID (must match authenticated user)'),
                evaluation_id: z.string().describe('The pronunciation evaluation ID'),
            }),
        },
        responses: {
            200: {
                description: 'Audio generated successfully',
                content: {
                    'application/json': {
                        schema: UserPronunciationAudioResponseSchema,
                    },
                },
            },
            400: {
                description: 'Pronunciation data not available (dummy data)',
                content: {
                    'application/json': {
                        schema: APIErrorSchema,
                    },
                },
            },
            403: {
                description: 'Insufficient permissions - can only access own evaluations',
                content: {
                    'application/json': {
                        schema: APIErrorSchema,
                    },
                },
            },
            404: {
                description: 'Evaluation not found',
                content: {
                    'application/json': {
                        schema: APIErrorSchema,
                    },
                },
            },
            500: {
                description: 'Audio generation failed or server error',
                content: {
                    'application/json': {
                        schema: APIErrorSchema,
                    },
                },
            },
        },
    })
);