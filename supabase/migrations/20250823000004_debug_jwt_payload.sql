-- Create a debug endpoint to see exactly what JWT payload we're getting
CREATE OR REPLACE FUNCTION debug_current_jwt() RETURNS JSON AS $$
DECLARE
    jwt_payload JSON;
BEGIN
    -- Get the current JWT payload
    jwt_payload := auth.jwt();
    
    -- Log it for debugging (will show in database logs)
    RAISE NOTICE 'Current JWT payload: %', jwt_payload;
    
    -- Return the JWT payload
    RETURN jwt_payload;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also create a simple test table to verify RLS behavior
CREATE TABLE IF NOT EXISTS debug_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS on debug table
ALTER TABLE debug_table ENABLE ROW LEVEL SECURITY;

-- Create a policy that only allows agents
CREATE POLICY "Only agents can access debug_table" ON debug_table
    FOR ALL USING (is_authenticated_agent_debug());

-- Insert a test row
INSERT INTO debug_table (message) VALUES ('Test row for agent access');

-- Grant usage
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON debug_table TO anon, authenticated;