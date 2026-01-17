-- Row Level Security (RLS) Policies
-- This enables the "Sustainability" pitch: public can see zones but not exact observations

-- Enable RLS on tables
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

-- Zones: Public can read (for safety), but only service role can write
CREATE POLICY "Public can read zones for safety"
    ON zones
    FOR SELECT
    USING (true);

CREATE POLICY "Service role can manage zones"
    ON zones
    FOR ALL
    USING (auth.role() = 'service_role');

-- Observations: Only service role can access (prevents poaching)
-- Public cannot see exact animal locations
CREATE POLICY "Service role can manage observations"
    ON observations
    FOR ALL
    USING (auth.role() = 'service_role');

-- Note: When using Supabase client with API keys:
-- - Public API key will only work for SELECT on zones (due to RLS)
-- - Service role key (stored in SUPABASE_SERVICE_KEY) can access everything
-- - Make sure to use the appropriate key in your FastAPI application
