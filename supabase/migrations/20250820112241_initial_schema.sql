-- Create Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR UNIQUE NOT NULL,
  email VARCHAR,
  display_name VARCHAR,
  avatar_url VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create User Contexts Table
CREATE TABLE user_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(user_id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{
    "learning_level": "absolute_beginner",
    "learning_goals": ["general"],
    "preferred_topics": [],
    "practice_frequency": "daily",
    "session_duration_preference": 25,
    "wants_formal_speech": false,
    "wants_kanji_practice": true,
    "wants_grammar_focus": true
  }',
  progress JSONB NOT NULL DEFAULT '{
    "total_sessions": 0,
    "total_conversation_time": 0,
    "words_learned": 0,
    "phrases_practiced": 0,
    "pronunciation_score_avg": 0,
    "grammar_points_covered": [],
    "achievements_unlocked": [],
    "last_session_date": null,
    "current_streak": 0
  }',
  session_history JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create Learning Sessions Table
CREATE TABLE learning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(user_id) ON DELETE CASCADE,
  session_id VARCHAR UNIQUE NOT NULL,
  duration_minutes INTEGER DEFAULT 0,
  topics_covered TEXT[] DEFAULT '{}',
  new_vocabulary TEXT[] DEFAULT '{}',
  grammar_points TEXT[] DEFAULT '{}',
  pronunciation_practice_count INTEGER DEFAULT 0,
  overall_performance TEXT,
  achievements TEXT[] DEFAULT '{}',
  session_data JSONB DEFAULT '{}',
  next_session_recommendations TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create Achievements Table
CREATE TABLE achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR REFERENCES users(user_id) ON DELETE CASCADE,
  achievement_id VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  description TEXT,
  icon VARCHAR,
  data JSONB DEFAULT '{}',
  unlocked_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for users table
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Create RLS Policies for user_contexts table
CREATE POLICY "Users can view own context" ON user_contexts
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can update own context" ON user_contexts
  FOR UPDATE USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own context" ON user_contexts
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Create RLS Policies for learning_sessions table
CREATE POLICY "Users can view own sessions" ON learning_sessions
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own sessions" ON learning_sessions
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Create RLS Policies for achievements table
CREATE POLICY "Users can view own achievements" ON achievements
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can insert own achievements" ON achievements
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Create indexes for better performance
CREATE INDEX idx_users_user_id ON users(user_id);
CREATE INDEX idx_user_contexts_user_id ON user_contexts(user_id);
CREATE INDEX idx_learning_sessions_user_id ON learning_sessions(user_id);
CREATE INDEX idx_learning_sessions_session_id ON learning_sessions(session_id);
CREATE INDEX idx_achievements_user_id ON achievements(user_id);
CREATE INDEX idx_learning_sessions_created_at ON learning_sessions(created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_contexts_updated_at BEFORE UPDATE ON user_contexts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
