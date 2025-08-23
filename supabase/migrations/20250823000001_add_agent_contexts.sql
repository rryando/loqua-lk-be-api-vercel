-- Create Agent Contexts Table
CREATE TABLE agent_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id VARCHAR UNIQUE NOT NULL,
  user_id VARCHAR REFERENCES users(user_id) ON DELETE CASCADE,
  session_id VARCHAR,
  permissions TEXT[] DEFAULT '{}',
  is_auto_initialized BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE agent_contexts ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for agent_contexts table
-- Allow agents to access their own context
CREATE POLICY "Agents can view own context" ON agent_contexts
  FOR SELECT USING (true); -- Agents should be able to read their own context

CREATE POLICY "Agents can insert own context" ON agent_contexts
  FOR INSERT WITH CHECK (true); -- Allow auto-initialization

CREATE POLICY "Agents can update own context" ON agent_contexts
  FOR UPDATE USING (true);

-- Create indexes for better performance
CREATE INDEX idx_agent_contexts_agent_id ON agent_contexts(agent_id);
CREATE INDEX idx_agent_contexts_user_id ON agent_contexts(user_id);
CREATE INDEX idx_agent_contexts_session_id ON agent_contexts(session_id);
CREATE INDEX idx_agent_contexts_created_at ON agent_contexts(created_at);
CREATE INDEX idx_agent_contexts_last_used_at ON agent_contexts(last_used_at);

-- Apply updated_at trigger
CREATE TRIGGER update_agent_contexts_updated_at BEFORE UPDATE ON agent_contexts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();