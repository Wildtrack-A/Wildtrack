-- Create table for Reddit-sourced wildlife sightings
-- Flexible schema: most fields are optional, with JSONB for extra data
CREATE TABLE IF NOT EXISTS reddit_sightings (
    id TEXT PRIMARY KEY,
    reddit_id TEXT UNIQUE NOT NULL,
    title TEXT,  -- Optional: some posts might not have titles
    content TEXT,  -- Optional: some posts might be link-only
    species TEXT[],  -- Optional: might not always detect species
    location_name TEXT,
    latitude REAL,
    longitude REAL,
    full_address TEXT,
    timestamp TIMESTAMP WITH TIME ZONE,  -- Optional: might not always have timestamp
    reddit_url TEXT NOT NULL,
    subreddit TEXT,
    score INTEGER DEFAULT 0,
    num_comments INTEGER DEFAULT 0,
    -- JSONB column for flexible/additional data from Reddit
    raw_data JSONB,  -- Store any additional Reddit post data (author, flair, images, etc.)
    metadata JSONB,  -- Store extracted/processed metadata that doesn't fit in columns
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_reddit_sightings_species ON reddit_sightings USING GIN(species) WHERE species IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reddit_sightings_location ON reddit_sightings(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reddit_sightings_timestamp ON reddit_sightings(timestamp DESC) WHERE timestamp IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reddit_sightings_reddit_id ON reddit_sightings(reddit_id);
-- Index for JSONB queries (useful for searching raw_data)
CREATE INDEX IF NOT EXISTS idx_reddit_sightings_raw_data ON reddit_sightings USING GIN(raw_data) WHERE raw_data IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reddit_sightings_metadata ON reddit_sightings USING GIN(metadata) WHERE metadata IS NOT NULL;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_reddit_sightings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER update_reddit_sightings_updated_at
    BEFORE UPDATE ON reddit_sightings
    FOR EACH ROW
    EXECUTE FUNCTION update_reddit_sightings_updated_at();
