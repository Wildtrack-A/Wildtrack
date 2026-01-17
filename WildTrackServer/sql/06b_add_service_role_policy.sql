-- Add service role policy for profiles table
-- This allows the API (using service role key) to manage profiles

CREATE POLICY "Service role can manage profiles"
    ON profiles FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
