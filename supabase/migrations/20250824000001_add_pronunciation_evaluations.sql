-- Create Pronunciation Evaluations Table
CREATE TABLE pronunciation_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(user_id) ON DELETE CASCADE,
  kanji TEXT NOT NULL,
  romaji TEXT NOT NULL,
  translation TEXT NOT NULL,
  topic VARCHAR NOT NULL,
  user_pronunciation TEXT NOT NULL,
  evaluation_score INTEGER, -- 0-100
  evaluation_feedback TEXT,
  evaluation_details JSONB, -- specific pronunciation analysis
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE pronunciation_evaluations ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for pronunciation_evaluations table
-- Users can view their own pronunciation evaluations
CREATE POLICY "Users can view own pronunciation evaluations" ON pronunciation_evaluations
  FOR SELECT USING (auth.uid()::text = user_id);

-- Users can insert their own pronunciation evaluations
CREATE POLICY "Users can insert own pronunciation evaluations" ON pronunciation_evaluations
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Agents can view pronunciation evaluations for any user (for agent operations)
CREATE POLICY "Agents can view all pronunciation evaluations" ON pronunciation_evaluations
  FOR SELECT USING (true); -- Agents should be able to read pronunciation data for any user

-- Agents can insert pronunciation evaluations for any user
CREATE POLICY "Agents can insert pronunciation evaluations for users" ON pronunciation_evaluations
  FOR INSERT WITH CHECK (true); -- Allow agents to create evaluations for users

-- Create indexes for efficient queries
CREATE INDEX idx_pronunciation_evals_user_id ON pronunciation_evaluations(user_id);
CREATE INDEX idx_pronunciation_evals_topic ON pronunciation_evaluations(topic);
CREATE INDEX idx_pronunciation_evals_created_at ON pronunciation_evaluations(created_at);
CREATE INDEX idx_pronunciation_evals_user_kanji ON pronunciation_evaluations(user_id, kanji);
CREATE INDEX idx_pronunciation_evals_user_created ON pronunciation_evaluations(user_id, created_at);