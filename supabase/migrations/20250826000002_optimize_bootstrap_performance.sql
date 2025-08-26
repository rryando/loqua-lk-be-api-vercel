-- Create optimized RPC function for agent bootstrap data
-- This replaces 5-6 separate queries with a single comprehensive query

CREATE OR REPLACE FUNCTION get_agent_bootstrap_data(
    p_user_id VARCHAR,
    p_include_raw_data BOOLEAN DEFAULT FALSE,
    p_days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
    user_id VARCHAR,
    email VARCHAR,
    display_name VARCHAR,
    avatar_url VARCHAR,
    conversation_count INTEGER,
    evaluation_count INTEGER,
    session_count INTEGER,
    user_context JSONB,
    evaluations JSONB,
    sessions JSONB,
    conversations JSONB
) AS $$
DECLARE
    date_threshold TIMESTAMP;
BEGIN
    -- Calculate date threshold for evaluations
    date_threshold := NOW() - (p_days_back || ' days')::INTERVAL;
    
    -- Main query with conditional JOINs
    RETURN QUERY
    SELECT 
        u.user_id,
        u.email,
        u.display_name,
        u.avatar_url,
        
        -- Get counts from optimized counters table (if available) or direct counts
        COALESCE(uac.conversation_count, 
            (SELECT COUNT(*)::INTEGER FROM conversations conv WHERE conv.user_id = p_user_id)) as conversation_count,
        COALESCE(uac.evaluation_count,
            (SELECT COUNT(*)::INTEGER FROM pronunciation_evaluations eval WHERE eval.user_id = p_user_id)) as evaluation_count,
        COALESCE(uac.session_count,
            (SELECT COUNT(*)::INTEGER FROM learning_sessions sess WHERE sess.user_id = p_user_id)) as session_count,
        
        -- User context (only if raw data requested)
        CASE 
            WHEN p_include_raw_data THEN 
                (SELECT jsonb_build_object(
                    'preferences', uctx.preferences,
                    'progress', uctx.progress,
                    'session_history', uctx.session_history,
                    'created_at', uctx.created_at,
                    'updated_at', uctx.updated_at
                ) FROM user_contexts uctx WHERE uctx.user_id = p_user_id)
            ELSE NULL
        END as user_context,
        
        -- Recent evaluations (only if raw data requested)
        CASE 
            WHEN p_include_raw_data THEN 
                (SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'kanji', pe.kanji,
                        'romaji', pe.romaji,
                        'topic', pe.topic,
                        'created_at', pe.created_at,
                        'evaluation_score', pe.evaluation_score
                    ) ORDER BY pe.created_at DESC
                ), '[]'::jsonb)
                FROM pronunciation_evaluations pe 
                WHERE pe.user_id = p_user_id 
                AND pe.created_at >= date_threshold
                LIMIT 50)
            ELSE '[]'::jsonb
        END as evaluations,
        
        -- Recent sessions (only if raw data requested)
        CASE 
            WHEN p_include_raw_data THEN 
                (SELECT COALESCE(jsonb_agg(
                    jsonb_build_object(
                        'session_id', ls.session_id,
                        'duration_minutes', ls.duration_minutes,
                        'topics_covered', ls.topics_covered,
                        'created_at', ls.created_at
                    ) ORDER BY ls.created_at DESC
                ), '[]'::jsonb)
                FROM learning_sessions ls 
                WHERE ls.user_id = p_user_id
                LIMIT 10)
            ELSE '[]'::jsonb
        END as sessions,
        
        -- Recent conversations for LLM context (always include for agent summary)
        (SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'message', c.message,
                'role', c.role,
                'session_id', c.session_id,
                'created_at', c.created_at
            ) ORDER BY c.created_at DESC
        ), '[]'::jsonb)
        FROM conversations c 
        WHERE c.user_id = p_user_id
        AND c.created_at >= date_threshold
        LIMIT 50) as conversations
        
    FROM users u
    LEFT JOIN user_activity_counters uac ON u.user_id = uac.user_id
    WHERE u.user_id = p_user_id;
    
    -- Check if we got results
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permission to authenticated users and service accounts
GRANT EXECUTE ON FUNCTION get_agent_bootstrap_data TO authenticated;
GRANT EXECUTE ON FUNCTION get_agent_bootstrap_data TO service_role;

-- Create indexes to optimize the RPC function (only if they don't exist)
DO $$ 
BEGIN
    -- Index for recent evaluations lookup  
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pronunciation_evaluations_user_created') THEN
        CREATE INDEX idx_pronunciation_evaluations_user_created ON pronunciation_evaluations(user_id, created_at DESC);
    END IF;
    
    -- Index for recent sessions lookup
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_learning_sessions_user_created') THEN
        CREATE INDEX idx_learning_sessions_user_created ON learning_sessions(user_id, created_at DESC);
    END IF;
    
    -- Index for recent conversations lookup
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_conversations_user_created') THEN
        CREATE INDEX idx_conversations_user_created ON conversations(user_id, created_at DESC);
    END IF;
END $$;