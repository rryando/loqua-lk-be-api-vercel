import OpenAI from 'openai';
import * as crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    ConversationEntry,
    DatabaseConversation,
    DatabaseUserSummary,
    GetUserSummaryResponse
} from '../api/v1/schemas/conversations.schemas';

export class ConversationSummaryService {
    private openai: OpenAI;

    constructor() {
        const apiKey = process.env.OPENAI_API_KEY || import.meta.env.VITE_OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OpenAI API key not found in environment variables');
        }

        this.openai = new OpenAI({
            apiKey: apiKey,
        });
    }

    /**
     * Store conversation entries in database
     */
    async storeConversations(
        supabase: SupabaseClient,
        conversations: ConversationEntry[]
    ): Promise<{ stored_count: number; session_ids: string[] }> {
        const conversationsToInsert: Omit<DatabaseConversation, 'id' | 'created_at'>[] = conversations.map(conv => ({
            user_id: conv.userId,
            session_id: conv.sessionId,
            message: conv.message,
            role: conv.role,
            metadata: conv.metadata || null,
        }));

        const { data, error } = await supabase
            .from('conversations')
            .insert(conversationsToInsert)
            .select('session_id');

        if (error) {
            throw new Error(`Failed to store conversations: ${error.message}`);
        }

        const sessionIds = [...new Set(data?.map(d => d.session_id) || [])];

        return {
            stored_count: conversationsToInsert.length,
            session_ids: sessionIds
        };
    }

    /**
     * Get or generate user summary with caching
     */
    async getUserSummary(
        supabase: SupabaseClient,
        userId: string
    ): Promise<GetUserSummaryResponse> {
        // Check if cached summary exists and is valid
        const cachedSummary = await this.getCachedSummary(supabase, userId);

        if (cachedSummary) {
            return {
                success: true,
                userId: userId,
                compactSummary: cachedSummary.compact_summary,
                generatedAt: cachedSummary.generated_at,
                fromCache: true,
                dataIncluded: await this.getDataIncludedMetadata(supabase, userId)
            };
        }

        // Generate new summary
        const summary = await this.generateUserSummary(supabase, userId);

        return {
            success: true,
            userId: userId,
            compactSummary: summary.compact_summary,
            generatedAt: summary.generated_at,
            fromCache: false,
            dataIncluded: summary.dataIncluded
        };
    }

    /**
     * Check for valid cached summary using optimized counters
     */
    private async getCachedSummary(
        supabase: SupabaseClient,
        userId: string
    ): Promise<DatabaseUserSummary | null> {
        const { data: cached, error } = await supabase
            .from('user_summaries')
            .select('*')
            .eq('user_id', userId)
            .gt('cache_expires_at', new Date().toISOString())
            .single();

        if (error || !cached) {
            return null;
        }

        // Get current data hash from counters table (single query)
        const { data: counters } = await supabase
            .from('user_activity_counters')
            .select('data_hash')
            .eq('user_id', userId)
            .single();

        if (!counters || cached.data_hash !== counters.data_hash) {
            // Data has changed, cached summary is stale
            return null;
        }

        return cached;
    }

    /**
     * Generate new user summary using OpenAI
     */
    private async generateUserSummary(
        supabase: SupabaseClient,
        userId: string
    ): Promise<{
        compact_summary: string;
        generated_at: string;
        dataIncluded: any;
    }> {
        // Gather all user data
        const userData = await this.gatherUserData(supabase, userId);

        if (!userData.hasAnyData) {
            throw new Error('No user data found to generate summary');
        }

        // Generate summary using OpenAI
        const compactSummary = await this.callOpenAIForSummary(userData);

        // Get data hash from counters table (single query)
        const { data: counters } = await supabase
            .from('user_activity_counters')
            .select('data_hash')
            .eq('user_id', userId)
            .single();

        const dataHash = counters?.data_hash || '';

        // Cache the summary
        const generatedAt = new Date().toISOString();
        const cacheExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // 48 hours

        await this.cacheSummary(supabase, userId, compactSummary, dataHash, generatedAt, cacheExpiresAt);

        return {
            compact_summary: compactSummary,
            generated_at: generatedAt,
            dataIncluded: userData.metadata
        };
    }

    /**
     * Gather all user data for summary generation
     */
    private async gatherUserData(supabase: SupabaseClient, userId: string) {
        const [userProfile, conversations, evaluations, sessions, userContext] = await Promise.all([
            // Get user profile (name and basic info)
            supabase
                .from('users')
                .select('user_id, display_name, email')
                .eq('user_id', userId)
                .single(),

            // Get recent conversations
            supabase
                .from('conversations')
                .select('message, role, session_id, created_at, metadata')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(100),

            // Get pronunciation evaluations
            supabase
                .from('pronunciation_evaluations')
                .select('kanji, romaji, translation, evaluation_score, evaluation_feedback, topic, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50),

            // Get learning sessions
            supabase
                .from('learning_sessions')
                .select('duration_minutes, topics_covered, new_vocabulary, grammar_points, overall_performance, achievements, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(20),

            // Get user context
            supabase
                .from('user_contexts')
                .select('preferences, progress, session_history')
                .eq('user_id', userId)
                .single()
        ]);

        // Get activity counters for metadata (single additional query)
        const { data: counters } = await supabase
            .from('user_activity_counters')
            .select('conversation_count, evaluation_count, session_count, context_updated_at')
            .eq('user_id', userId)
            .single();

        const hasAnyData = (conversations.data?.length || 0) + (evaluations.data?.length || 0) +
            (sessions.data?.length || 0) + (userContext.data ? 1 : 0) > 0;

        return {
            userProfile: userProfile.data || null,
            conversations: conversations.data || [],
            evaluations: evaluations.data || [],
            sessions: sessions.data || [],
            userContext: userContext.data || null,
            hasAnyData,
            metadata: {
                conversationCount: counters?.conversation_count || conversations.data?.length || 0,
                evaluationCount: counters?.evaluation_count || evaluations.data?.length || 0,
                sessionCount: counters?.session_count || sessions.data?.length || 0,
                hasUserContext: !!counters?.context_updated_at || !!userContext.data
            }
        };
    }

    /**
     * Call OpenAI to generate compact user summary
     */
    private async callOpenAIForSummary(userData: any): Promise<string> {
        const prompt = this.constructSummaryPrompt(userData);

        const completion = await this.openai.chat.completions.create({
            model: "gpt-5-nano", // Cost-effective model for summarization
            messages: [
                {
                    role: "system",
                    content: "Create ultra-compact user summaries for AI agents. Use EXACTLY this format:\n\n**Profile:** [Name, level, goals in 1 line]\n**Style:** [Communication/learning style in 1 line]\n**Progress:** [Key metrics, strengths, gaps in 1 line]\n**Focus:** [Current topics, interests in 1 line]\n**Approach:** [Best teaching method in 1 line]\n\nBe extremely concise. Each section MAX 20 words. No fluff."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
        });

        console.log(prompt)

        console.log(JSON.stringify(completion, null, 2))

        const summary = completion.choices[0]?.message?.content;
        if (!summary) {
            throw new Error('Failed to generate summary from OpenAI');
        }

        return summary;
    }

    /**
     * Construct prompt for OpenAI summarization
     */
    private constructSummaryPrompt(userData: any): string {
        const userName = userData.userProfile?.display_name || 'User';

        // Extract key metrics
        const totalConversations = userData.conversations.length;
        const totalEvaluations = userData.evaluations.length;
        const totalSessions = userData.sessions.length;

        // Get recent conversation samples (last 5)
        const recentConversations = userData.conversations.slice(0, 5);

        // Get top evaluation scores
        const topEvaluations = userData.evaluations
            .filter((e: any) => e.evaluation_score)
            .sort((a: any, b: any) => b.evaluation_score - a.evaluation_score)
            .slice(0, 3);

        // Extract user preferences/progress
        const userPrefs = userData.userContext?.preferences || {};
        const userProgress = userData.userContext?.progress || {};

        return `
USER: ${userName}

ACTIVITY: ${totalConversations} conversations, ${totalEvaluations} evaluations, ${totalSessions} sessions

RECENT CONVERSATIONS:
${recentConversations.length > 0 ? recentConversations.map((c: any) =>
            `[${c.role}]: ${c.message.substring(0, 100)}${c.message.length > 100 ? '...' : ''}`
        ).join('\n') : 'None'}

TOP EVALUATIONS:
${topEvaluations.length > 0 ? topEvaluations.map((e: any) =>
            `${e.kanji} (${e.romaji}) - ${e.evaluation_score}/10`
        ).join(', ') : 'None'}

PREFERENCES: Level: ${userPrefs.learning_level || 'unknown'}, Goals: ${userPrefs.learning_goals?.join(', ') || 'general'}, Topics: ${userPrefs.preferred_topics?.join(', ') || 'various'}

PROGRESS: Sessions: ${userProgress.total_sessions || 0}, Words: ${userProgress.words_learned || 0}, Streak: ${userProgress.current_streak || 0}

Create compact summary for ${userName}.`;
    }

    /**
     * Get data hash from optimized counters table (single query)
     * @deprecated - Hash is now maintained automatically by triggers
     */
    private async calculateDataHash(supabase: SupabaseClient, userId: string): Promise<string> {
        const { data: counters } = await supabase
            .from('user_activity_counters')
            .select('data_hash')
            .eq('user_id', userId)
            .single();

        return counters?.data_hash || '';
    }

    /**
     * Cache the generated summary
     */
    private async cacheSummary(
        supabase: SupabaseClient,
        userId: string,
        compactSummary: string,
        dataHash: string,
        generatedAt: string,
        cacheExpiresAt: string
    ): Promise<void> {
        const { error } = await supabase
            .from('user_summaries')
            .upsert({
                user_id: userId,
                compact_summary: compactSummary,
                data_hash: dataHash,
                generated_at: generatedAt,
                cache_expires_at: cacheExpiresAt,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

        if (error) {
            throw new Error(`Failed to cache summary: ${error.message}`);
        }
    }

    /**
     * Get metadata about what data was included in summary from counters
     */
    private async getDataIncludedMetadata(supabase: SupabaseClient, userId: string) {
        const { data: counters } = await supabase
            .from('user_activity_counters')
            .select('conversation_count, evaluation_count, session_count, context_updated_at')
            .eq('user_id', userId)
            .single();

        return {
            conversationCount: counters?.conversation_count || 0,
            evaluationCount: counters?.evaluation_count || 0,
            sessionCount: counters?.session_count || 0,
            hasUserContext: !!counters?.context_updated_at
        };
    }
}

// Export singleton instance
export const conversationSummaryService = new ConversationSummaryService();