import type { Context } from 'hono';
import { AccessToken } from 'livekit-server-sdk';
import { env } from 'hono/adapter';
import { getSupabase, extractUserId, getCurrentDbUser } from '../../../middleware/index.js';
import {
    RoomJoinRequest,
    RoomTokenResponse,
    APIError
} from '../../../types/index.js';

// Environment variables type
type LiveKitEnv = {
    LIVEKIT_API_KEY: string;
    LIVEKIT_API_SECRET: string;
    LIVEKIT_URL: string;
};

export class RoomsController {
    /**
     * Generate LiveKit room token for user
     */
    static async joinRoom(c: Context) {
        const { user_id, room_name } = await c.req.json();
        const currentUserId = extractUserId(c);
        const dbUser = getCurrentDbUser(c);

        // Check if user is requesting token for themselves
        if (user_id !== currentUserId) {
            const error: APIError = {
                error: {
                    code: 'INSUFFICIENT_PERMISSIONS',
                    message: 'You can only join rooms as yourself'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 403);
        }

        try {
            // Get LiveKit environment variables
            const liveKitEnv = env<LiveKitEnv>(c);
            const apiKey = liveKitEnv.LIVEKIT_API_KEY || import.meta.env.VITE_LIVEKIT_API_KEY;
            const apiSecret = liveKitEnv.LIVEKIT_API_SECRET || import.meta.env.VITE_LIVEKIT_API_SECRET;
            const liveKitUrl = liveKitEnv.LIVEKIT_URL || import.meta.env.VITE_LIVEKIT_URL;

            if (!apiKey || !apiSecret || !liveKitUrl) {
                console.error('LiveKit configuration missing:', {
                    hasApiKey: !!apiKey,
                    hasApiSecret: !!apiSecret,
                    hasUrl: !!liveKitUrl
                });
                const error: APIError = {
                    error: {
                        code: 'CONFIGURATION_ERROR',
                        message: 'LiveKit configuration is incomplete'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 500);
            }

            // Generate session ID for this LiveKit session
            const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Create LiveKit access token
            const accessToken = new AccessToken(apiKey, apiSecret, {
                identity: user_id,
                name: dbUser?.display_name || dbUser?.email || user_id,
                // Add user metadata for the agent to access (following app-flow.md pattern)
                metadata: JSON.stringify({
                    user_id: user_id,
                    sessionId: sessionId,
                    email: dbUser?.email,
                    display_name: dbUser?.display_name,
                }),
            });

            // Add room permissions
            accessToken.addGrant({
                room: room_name,
                roomJoin: true,
                canPublish: true,
                canSubscribe: true,
                canPublishData: true,
                canUpdateOwnMetadata: true,
            });

            // Generate JWT token
            const token = await accessToken.toJwt();

            // Calculate expiration time (24 hours from now)
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

            const response: RoomTokenResponse = {
                token,
                room_url: liveKitUrl,
                room_name,
                expires_at: expiresAt.toISOString(),
                session_id: sessionId, // Include sessionId for agent reference
            };

            return c.json(response);
        } catch (err) {
            console.error('LiveKit token generation error:', err);
            const error: APIError = {
                error: {
                    code: 'TOKEN_GENERATION_FAILED',
                    message: 'Failed to generate room access token'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(error, 500);
        }
    }

    /**
     * Get active rooms for user
     */
    static async getActiveRooms(c: Context) {
        // This would typically query LiveKit API for active rooms
        // For now, return empty array as this requires additional LiveKit API calls
        return c.json({
            active_rooms: []
        });
    }
}
