-- Create a SECURITY DEFINER function to create profiles (bypasses RLS)
-- This function will be called by the API to create profiles
-- Note: p_id is TEXT to support Auth0 user IDs (format: "auth0|xxxxx")

CREATE OR REPLACE FUNCTION public.create_user_profile(
    p_id TEXT,
    p_username TEXT,
    p_role TEXT DEFAULT 'public',
    p_full_name TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.profiles (id, username, role, full_name)
    VALUES (p_id, p_username, p_role, p_full_name)
    ON CONFLICT (id) DO UPDATE 
    SET username = EXCLUDED.username,
        role = EXCLUDED.role,
        full_name = EXCLUDED.full_name,
        updated_at = NOW();
END;
$$;

COMMENT ON FUNCTION public.create_user_profile IS 'Create or update user profile (bypasses RLS)';
