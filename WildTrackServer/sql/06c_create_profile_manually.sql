-- Manually create profile for existing user (bypasses RLS)
-- Use this if the trigger didn't run

-- Create a helper function to bypass RLS
CREATE OR REPLACE FUNCTION public.create_profile_manually(
    p_id UUID,
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
        full_name = EXCLUDED.full_name;
END;
$$;

-- Call the function to create the profile
SELECT public.create_profile_manually(
    'a7112cd2-237a-41e4-baa3-1d55e8a11439'::UUID,
    'string',
    'field_researcher',
    'string'
);
