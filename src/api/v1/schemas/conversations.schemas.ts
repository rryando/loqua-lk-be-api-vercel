import { z } from 'zod';

// Conversation Entry Schema for storage
export const ConversationEntrySchema = z.object({
    userId: z.string().uuid().describe('User ID who sent/received the message'),
    sessionId: z.string().describe('Session ID to group related conversations'),
    message: z.string().min(1).describe('The conversation message content'),
    role: z.enum(['user', 'assistant']).describe('Who sent the message'),
    metadata: z.record(z.any()).optional().describe('Additional message metadata')
});

// User Summary Schema (cached in database)
export const UserSummarySchema = z.object({
    userId: z.string().uuid().describe('User ID this summary belongs to'),
    compactSummary: z.string().describe('AI-generated compact summary of all user data'),
    dataHash: z.string().describe('Hash of all user data to detect changes'),
    generatedAt: z.string().datetime().describe('When this summary was generated'),
    cacheExpiresAt: z.string().datetime().describe('When this cache expires')
});

// Request/Response Schemas
export const StoreConversationRequestSchema = z.object({
    conversations: z.array(ConversationEntrySchema).min(1).max(50).describe('Array of conversation entries to store')
});

export const StoreConversationResponseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    stored_count: z.number(),
    session_ids: z.array(z.string()),
    timestamp: z.string().datetime()
});

export const GetUserSummaryResponseSchema = z.object({
    success: z.boolean(),
    userId: z.string().uuid(),
    compactSummary: z.string().describe('Compact but detailed summary optimized for LLM consumption'),
    generatedAt: z.string().datetime(),
    fromCache: z.boolean().describe('Whether this summary was served from cache'),
    dataIncluded: z.object({
        conversationCount: z.number(),
        evaluationCount: z.number(),
        sessionCount: z.number(),
        hasUserContext: z.boolean()
    }).describe('Metadata about what data was included in the summary')
});

// Database Types (for internal use)
export interface DatabaseConversation {
    id: string;
    user_id: string;
    session_id: string;
    message: string;
    role: 'user' | 'assistant';
    metadata?: any;
    created_at: string;
}

export interface DatabaseUserSummary {
    id: string;
    user_id: string;
    compact_summary: string;
    data_hash: string;
    generated_at: string;
    cache_expires_at: string;
    created_at: string;
    updated_at: string;
}

export type ConversationEntry = z.infer<typeof ConversationEntrySchema>;
export type UserSummary = z.infer<typeof UserSummarySchema>;
export type StoreConversationRequest = z.infer<typeof StoreConversationRequestSchema>;
export type StoreConversationResponse = z.infer<typeof StoreConversationResponseSchema>;
export type GetUserSummaryResponse = z.infer<typeof GetUserSummaryResponseSchema>;