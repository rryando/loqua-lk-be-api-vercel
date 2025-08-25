-- Add conversations table for storing user conversation data
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(user_id) ON DELETE CASCADE,
  session_id VARCHAR NOT NULL,
  message TEXT NOT NULL,
  role VARCHAR NOT NULL CHECK (role IN ('user', 'assistant')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add user_summaries table for caching AI-generated summaries
CREATE TABLE user_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(user_id) ON DELETE CASCADE UNIQUE,
  compact_summary TEXT NOT NULL,
  data_hash VARCHAR(32) NOT NULL,
  generated_at TIMESTAMP NOT NULL,
  cache_expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_summaries ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for conversations table
CREATE POLICY "Users can view own conversations" ON conversations
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own conversations" ON conversations
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own conversations" ON conversations
  FOR UPDATE USING (auth.uid()::text = user_id);

-- Create RLS Policies for user_summaries table
CREATE POLICY "Users can view own summary" ON user_summaries
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own summary" ON user_summaries
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update own summary" ON user_summaries
  FOR UPDATE USING (auth.uid()::text = user_id);

-- Agent access policies for conversations (agents can read all conversations for summary generation)
CREATE POLICY "Agents can read all conversations" ON conversations
  FOR SELECT USING (
    current_setting('request.jwt.claims', true)::json->>'agent_role' = 'service_account'
  );

-- Agent access policies for user_summaries (agents can read/write all summaries)
CREATE POLICY "Agents can read all user summaries" ON user_summaries
  FOR SELECT USING (
    current_setting('request.jwt.claims', true)::json->>'agent_role' = 'service_account'
  );

CREATE POLICY "Agents can write all user summaries" ON user_summaries
  FOR ALL USING (
    current_setting('request.jwt.claims', true)::json->>'agent_role' = 'service_account'
  );

-- Create indexes for better performance
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_session_id ON conversations(session_id);
CREATE INDEX idx_conversations_user_session ON conversations(user_id, session_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);
CREATE INDEX idx_conversations_role ON conversations(role);

CREATE INDEX idx_user_summaries_user_id ON user_summaries(user_id);
CREATE INDEX idx_user_summaries_cache_expires_at ON user_summaries(cache_expires_at);
CREATE INDEX idx_user_summaries_data_hash ON user_summaries(data_hash);
CREATE INDEX idx_user_summaries_generated_at ON user_summaries(generated_at);

-- Apply updated_at trigger to user_summaries
CREATE TRIGGER update_user_summaries_updated_at BEFORE UPDATE ON user_summaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();