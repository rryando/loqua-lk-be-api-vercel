import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';
import {
    RoomJoinRequestSchema,
    RoomTokenResponseSchema,
    APIErrorSchema,
    createAuthenticatedRoute,
} from '../../../lib/openapi';

// Join LiveKit Room Route
export const joinRoomRoute = createRoute(
    createAuthenticatedRoute({
        method: 'post',
        path: '/join',
        tags: ['LiveKit'],
        summary: 'Generate LiveKit room access token',
        description: `
Generate a LiveKit access token for real-time video/audio sessions.

This endpoint:
- Validates user authentication
- Creates a LiveKit access token with appropriate permissions
- Includes user metadata for the Python agent to access
- Returns token with 24-hour expiration

**Integration Flow:**
1. Client app requests room token for authenticated user
2. API generates LiveKit token with user metadata
3. Client connects to LiveKit room using token
4. Python agent joins room and extracts user context from metadata
5. Agent personalizes conversation based on user data

**Token Permissions:**
- Room join access
- Audio/video publish and subscribe
- Data channel access (for agent communication)
- Metadata updates
    `,
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: RoomJoinRequestSchema,
                    },
                },
                description: 'Room join request data',
            },
        },
        responses: {
            200: {
                description: 'Room token generated successfully',
                content: {
                    'application/json': {
                        schema: RoomTokenResponseSchema,
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
            500: {
                description: 'LiveKit configuration error',
                content: {
                    'application/json': {
                        schema: APIErrorSchema,
                    },
                },
            },
        },
    })
);

// Get Active Rooms Route
export const getActiveRoomsRoute = createRoute(
    createAuthenticatedRoute({
        method: 'get',
        path: '/active',
        tags: ['LiveKit'],
        summary: 'Get active rooms for user',
        description: 'Retrieve list of active LiveKit rooms that the user is currently connected to.',
        responses: {
            200: {
                description: 'Active rooms retrieved successfully',
                content: {
                    'application/json': {
                        schema: z.object({
                            active_rooms: z.array(z.object({
                                room_name: z.string(),
                                connected_at: z.string(),
                                participants: z.number(),
                            })),
                        }),
                    },
                },
            },
        },
    })
);
