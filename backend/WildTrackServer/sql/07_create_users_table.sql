-- Create profiles table that links to Auth0 users
-- This stores extra user information (role, username, etc.) linked to Auth0 user IDs
-- Note: id is TEXT to store Auth0 user IDs (format: auth0|xxxxx)

CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,  -- Auth0 user ID (e.g., "auth0|xxxxx")
    username TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'public' CHECK (role IN ('field_researcher', 'admin', 'public')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Add comment for documentation
COMMENT ON TABLE profiles IS 'User profiles linked to Auth0 user IDs';
COMMENT ON COLUMN profiles.role IS 'User role: field_researcher, admin, or public';

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage all profiles (for API operations)
-- Note: User access is controlled via Auth0 JWT validation in the API layer
CREATE POLICY "Service role can manage profiles"
    ON profiles FOR ALL
    USING (auth.role() = 'service_role');

-- Note: Profile creation is handled via API endpoint /api/v1/auth/sync-profile
-- This is called after Auth0 authentication to create the profile entry
