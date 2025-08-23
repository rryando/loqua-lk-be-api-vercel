-- Debug helper function to see what the JWT contains
CREATE OR REPLACE FUNCTION debug_agent_jwt() RETURNS JSON AS $$
BEGIN
    -- Return the full JWT payload for debugging
    RETURN auth.jwt();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Temporary debug policy that logs the JWT content
CREATE OR REPLACE FUNCTION is_authenticated_agent_debug() RETURNS BOOLEAN AS $$
DECLARE
    jwt_payload JSON;
    jwt_role TEXT;
    jwt_sub TEXT;
BEGIN
    -- Get JWT payload
    jwt_payload := auth.jwt();
    jwt_role := jwt_payload ->> 'role';
    jwt_sub := jwt_payload ->> 'sub';
    
    -- Log the JWT details (this will appear in Postgres logs)
    RAISE NOTICE 'JWT Debug - Role: %, Sub: %, Full payload: %', jwt_role, jwt_sub, jwt_payload;
    
    -- Check if the current user has agent role in their JWT metadata
    RETURN (
        jwt_role = 'agent' AND
        jwt_sub IS NOT NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the users policy to use the debug version temporarily
DROP POLICY IF EXISTS "Agents can read user data" ON users;
CREATE POLICY "Agents can read user data" ON users
    FOR SELECT USING (is_authenticated_agent_debug());