-- Optimize user summary performance with activity counters table and triggers
-- This migration reduces database queries from 9+ to 1 for summary generation

-- Create user_activity_counters table for maintaining real-time statistics
CREATE TABLE user_activity_counters (
  user_id VARCHAR PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  conversation_count INTEGER DEFAULT 0,
  evaluation_count INTEGER DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  context_updated_at TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT NOW(),
  data_hash VARCHAR(32),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS for the counters table
ALTER TABLE user_activity_counters ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_activity_counters
CREATE POLICY "Users can view own activity counters" ON user_activity_counters
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can update own activity counters" ON user_activity_counters
  FOR UPDATE USING (auth.uid()::text = user_id);

-- Agent access policies
CREATE POLICY "Agents can read all activity counters" ON user_activity_counters
  FOR SELECT USING (
    current_setting('request.jwt.claims', true)::json->>'agent_role' = 'service_account'
  );

CREATE POLICY "Agents can write all activity counters" ON user_activity_counters
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::json->>'agent_role' = 'service_account'
  );

-- Create indexes for optimal performance
CREATE INDEX idx_user_activity_counters_user_id ON user_activity_counters(user_id);
CREATE INDEX idx_user_activity_counters_last_activity ON user_activity_counters(last_activity_at);
CREATE INDEX idx_user_activity_counters_data_hash ON user_activity_counters(data_hash);

-- Apply updated_at trigger
CREATE TRIGGER update_user_activity_counters_updated_at BEFORE UPDATE ON user_activity_counters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Initialize counters for existing users
INSERT INTO user_activity_counters (user_id, conversation_count, evaluation_count, session_count, context_updated_at, last_activity_at)
SELECT 
  u.user_id,
  COALESCE(conv_counts.conversation_count, 0),
  COALESCE(eval_counts.evaluation_count, 0),
  COALESCE(session_counts.session_count, 0),
  uc.updated_at,
  GREATEST(
    COALESCE(conv_counts.last_conversation, '1970-01-01'::timestamp),
    COALESCE(eval_counts.last_evaluation, '1970-01-01'::timestamp),
    COALESCE(session_counts.last_session, '1970-01-01'::timestamp),
    COALESCE(uc.updated_at, '1970-01-01'::timestamp)
  )
FROM users u
LEFT JOIN (
  SELECT user_id, COUNT(*) as conversation_count, MAX(created_at) as last_conversation
  FROM conversations 
  GROUP BY user_id
) conv_counts ON u.user_id = conv_counts.user_id
LEFT JOIN (
  SELECT user_id, COUNT(*) as evaluation_count, MAX(created_at) as last_evaluation
  FROM pronunciation_evaluations 
  GROUP BY user_id
) eval_counts ON u.user_id = eval_counts.user_id
LEFT JOIN (
  SELECT user_id, COUNT(*) as session_count, MAX(created_at) as last_session
  FROM learning_sessions 
  GROUP BY user_id
) session_counts ON u.user_id = session_counts.user_id
LEFT JOIN user_contexts uc ON u.user_id = uc.user_id
ON CONFLICT (user_id) DO NOTHING;

-- Function to update activity counters and calculate data hash
CREATE OR REPLACE FUNCTION update_user_activity_counter(p_user_id VARCHAR, p_table_name VARCHAR, p_operation VARCHAR)
RETURNS VOID AS $$
DECLARE
  new_hash VARCHAR(32);
  counter_data JSONB;
BEGIN
  -- Update the appropriate counter
  IF p_table_name = 'conversations' THEN
    IF p_operation = 'INSERT' THEN
      UPDATE user_activity_counters 
      SET conversation_count = conversation_count + 1,
          last_activity_at = NOW(),
          updated_at = NOW()
      WHERE user_id = p_user_id;
    ELSIF p_operation = 'DELETE' THEN
      UPDATE user_activity_counters 
      SET conversation_count = GREATEST(conversation_count - 1, 0),
          last_activity_at = NOW(),
          updated_at = NOW()
      WHERE user_id = p_user_id;
    END IF;
  ELSIF p_table_name = 'pronunciation_evaluations' THEN
    IF p_operation = 'INSERT' THEN
      UPDATE user_activity_counters 
      SET evaluation_count = evaluation_count + 1,
          last_activity_at = NOW(),
          updated_at = NOW()
      WHERE user_id = p_user_id;
    ELSIF p_operation = 'DELETE' THEN
      UPDATE user_activity_counters 
      SET evaluation_count = GREATEST(evaluation_count - 1, 0),
          last_activity_at = NOW(),
          updated_at = NOW()
      WHERE user_id = p_user_id;
    END IF;
  ELSIF p_table_name = 'learning_sessions' THEN
    IF p_operation = 'INSERT' THEN
      UPDATE user_activity_counters 
      SET session_count = session_count + 1,
          last_activity_at = NOW(),
          updated_at = NOW()
      WHERE user_id = p_user_id;
    ELSIF p_operation = 'DELETE' THEN
      UPDATE user_activity_counters 
      SET session_count = GREATEST(session_count - 1, 0),
          last_activity_at = NOW(),
          updated_at = NOW()
      WHERE user_id = p_user_id;
    END IF;
  ELSIF p_table_name = 'user_contexts' THEN
    UPDATE user_activity_counters 
    SET context_updated_at = NOW(),
        last_activity_at = NOW(),
        updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;

  -- Recalculate and update data hash
  SELECT jsonb_build_object(
    'conversations', conversation_count,
    'evaluations', evaluation_count,
    'sessions', session_count,
    'context_updated', COALESCE(context_updated_at::text, '')
  ) INTO counter_data
  FROM user_activity_counters
  WHERE user_id = p_user_id;

  new_hash := md5(counter_data::text);
  
  UPDATE user_activity_counters 
  SET data_hash = new_hash
  WHERE user_id = p_user_id;

  -- Insert row if it doesn't exist (for new users)
  INSERT INTO user_activity_counters (user_id, conversation_count, evaluation_count, session_count, data_hash, last_activity_at)
  VALUES (p_user_id, 0, 0, 0, new_hash, NOW())
  ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Trigger functions for each table
CREATE OR REPLACE FUNCTION trigger_conversations_counter()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM update_user_activity_counter(NEW.user_id, 'conversations', 'INSERT');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM update_user_activity_counter(OLD.user_id, 'conversations', 'DELETE');
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_evaluations_counter()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM update_user_activity_counter(NEW.user_id, 'pronunciation_evaluations', 'INSERT');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM update_user_activity_counter(OLD.user_id, 'pronunciation_evaluations', 'DELETE');
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_sessions_counter()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM update_user_activity_counter(NEW.user_id, 'learning_sessions', 'INSERT');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM update_user_activity_counter(OLD.user_id, 'learning_sessions', 'DELETE');
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_contexts_counter()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM update_user_activity_counter(NEW.user_id, 'user_contexts', 'UPDATE');
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers on all relevant tables
CREATE TRIGGER conversations_counter_trigger
  AFTER INSERT OR DELETE ON conversations
  FOR EACH ROW EXECUTE FUNCTION trigger_conversations_counter();

CREATE TRIGGER evaluations_counter_trigger
  AFTER INSERT OR DELETE ON pronunciation_evaluations
  FOR EACH ROW EXECUTE FUNCTION trigger_evaluations_counter();

CREATE TRIGGER sessions_counter_trigger
  AFTER INSERT OR DELETE ON learning_sessions
  FOR EACH ROW EXECUTE FUNCTION trigger_sessions_counter();

CREATE TRIGGER contexts_counter_trigger
  AFTER INSERT OR UPDATE ON user_contexts
  FOR EACH ROW EXECUTE FUNCTION trigger_contexts_counter();