import type { Context } from 'hono';
import { getAuthenticatedSupabase } from '../../../middleware/index.js';
import { conversationSummaryService } from '../../../services/conversation-summary.service.js';
import { APIError } from '../../../types/index.js';

export class ConversationsController {
    /**
     * Store conversation messages
     */
    static async storeConversations(c: Context) {
        try {
            const requestBody = await c.req.json();
            const { conversations } = requestBody;

            if (!conversations || !Array.isArray(conversations) || conversations.length === 0) {
                const error: APIError = {
                    error: {
                        code: 'INVALID_REQUEST',
                        message: 'conversations array is required and cannot be empty'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 400);
            }

            // Validate conversation entries
            for (const conv of conversations) {
                if (!conv.userId || !conv.sessionId || !conv.message || !conv.role) {
                    const error: APIError = {
                        error: {
                            code: 'INVALID_CONVERSATION_DATA',
                            message: 'Each conversation must have userId, sessionId, message, and role'
                        },
                        timestamp: new Date().toISOString()
                    };
                    return c.json(error, 400);
                }

                if (!['user', 'assistant'].includes(conv.role)) {
                    const error: APIError = {
                        error: {
                            code: 'INVALID_ROLE',
                            message: 'role must be either "user" or "assistant"'
                        },
                        timestamp: new Date().toISOString()
                    };
                    return c.json(error, 400);
                }
            }

            const supabase = getAuthenticatedSupabase(c);
            const result = await conversationSummaryService.storeConversations(supabase, conversations);

            return c.json({
                success: true,
                message: 'Conversations stored successfully',
                stored_count: result.stored_count,
                session_ids: result.session_ids,
                timestamp: new Date().toISOString()
            }, 201);

        } catch (error) {
            console.error('Store conversations error:', error);
            const apiError: APIError = {
                error: {
                    code: 'SERVER_ERROR',
                    message: 'Failed to store conversations',
                    details: error instanceof Error ? error.message : 'Unknown error'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(apiError, 500);
        }
    }

    /**
     * Get user summary with AI-generated insights
     */
    static async getUserSummary(c: Context) {
        try {
            const userId = c.req.param('user_id');

            if (!userId) {
                const error: APIError = {
                    error: {
                        code: 'MISSING_USER_ID',
                        message: 'User ID is required'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 400);
            }

            // Validate UUID format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(userId)) {
                const error: APIError = {
                    error: {
                        code: 'INVALID_USER_ID',
                        message: 'User ID must be a valid UUID'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 400);
            }

            const supabase = getAuthenticatedSupabase(c);

            // Check if user exists
            const { data: user, error: userError } = await supabase
                .from('users')
                .select('user_id')
                .eq('user_id', userId)
                .single();

            if (userError || !user) {
                const error: APIError = {
                    error: {
                        code: 'USER_NOT_FOUND',
                        message: 'User not found'
                    },
                    timestamp: new Date().toISOString()
                };
                return c.json(error, 404);
            }

            const summary = await conversationSummaryService.getUserSummary(supabase, userId);
            return c.json(summary);

        } catch (error) {
            console.error('Get user summary error:', error);
            
            // Handle specific error types
            if (error instanceof Error) {
                if (error.message.includes('No user data found')) {
                    const apiError: APIError = {
                        error: {
                            code: 'NO_DATA_AVAILABLE',
                            message: 'No data available to generate summary for this user'
                        },
                        timestamp: new Date().toISOString()
                    };
                    return c.json(apiError, 404);
                }

                if (error.message.includes('OpenAI') || error.message.includes('Failed to generate')) {
                    const apiError: APIError = {
                        error: {
                            code: 'SUMMARY_GENERATION_FAILED',
                            message: 'Failed to generate user summary'
                        },
                        timestamp: new Date().toISOString()
                    };
                    return c.json(apiError, 500);
                }
            }

            const apiError: APIError = {
                error: {
                    code: 'SERVER_ERROR',
                    message: 'Internal server error',
                    details: error instanceof Error ? error.message : 'Unknown error'
                },
                timestamp: new Date().toISOString()
            };
            return c.json(apiError, 500);
        }
    }
}