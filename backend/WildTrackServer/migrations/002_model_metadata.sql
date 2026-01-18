-- Migration: Create model_metadata table for tracking zone model training state
-- Run this in Supabase SQL Editor

-- Create model_metadata table
CREATE TABLE IF NOT EXISTS model_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment
COMMENT ON TABLE model_metadata IS 'Stores metadata for zone model training, including observation counters and training status';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_model_metadata_updated_at ON model_metadata(updated_at);

-- Insert initial values
INSERT INTO model_metadata (key, value, metadata) VALUES
    ('observations_since_last_training', '0', '{"description": "Count of new observations since last model training"}'),
    ('last_training_timestamp', '', '{"description": "Timestamp of last successful model training"}'),
    ('last_training_result', '', '{"description": "Result of last training attempt"}'),
    ('training_status', 'idle', '{"description": "Current training status: idle, in_progress, error"}'),
    ('global_threshold', '1000', '{"description": "Number of new observations that trigger automatic retraining"}')
ON CONFLICT (key) DO NOTHING;

-- Enable RLS
ALTER TABLE model_metadata ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role full access (for backend operations)
CREATE POLICY "Service role has full access to model_metadata"
    ON model_metadata
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Policy: Allow authenticated users to read (for status checks)
CREATE POLICY "Authenticated users can read model_metadata"
    ON model_metadata
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT SELECT ON model_metadata TO authenticated;
GRANT ALL ON model_metadata TO service_role;