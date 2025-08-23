-- Add RLS policies to allow agents to access user data
-- This allows agents (authenticated with agent JWTs) to read/manage user data

-- Helper function to check if current user is an agent
CREATE OR REPLACE FUNCTION is_authenticated_agent() RETURNS BOOLEAN AS $$
BEGIN
    -- Check if the current user has agent role in their JWT metadata
    RETURN (
        auth.jwt() ->> 'role' = 'agent' AND
        auth.jwt() ->> 'sub' IS NOT NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Users table: Allow agents to read user data
CREATE POLICY "Agents can read user data" ON users
    FOR SELECT USING (is_authenticated_agent());

-- User contexts table: Allow agents to read/update user contexts  
CREATE POLICY "Agents can read user contexts" ON user_contexts
    FOR SELECT USING (is_authenticated_agent());

CREATE POLICY "Agents can update user contexts" ON user_contexts  
    FOR UPDATE USING (is_authenticated_agent());

CREATE POLICY "Agents can insert user contexts" ON user_contexts
    FOR INSERT WITH CHECK (is_authenticated_agent());

-- Learning sessions table: Allow agents to create sessions
CREATE POLICY "Agents can create learning sessions" ON learning_sessions
    FOR INSERT WITH CHECK (is_authenticated_agent());

CREATE POLICY "Agents can read learning sessions" ON learning_sessions
    FOR SELECT USING (is_authenticated_agent());

-- Achievements table: Allow agents to create achievements
CREATE POLICY "Agents can create achievements" ON achievements
    FOR INSERT WITH CHECK (is_authenticated_agent());

CREATE POLICY "Agents can read achievements" ON achievements  
    FOR SELECT USING (is_authenticated_agent());