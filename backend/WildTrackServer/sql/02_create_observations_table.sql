-- Create observations table for raw GPS pings
-- This table stores individual animal sightings with location and timestamp data

CREATE TABLE IF NOT EXISTS observations (
    id BIGSERIAL PRIMARY KEY,
    animal_id TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
    ) STORED,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    species TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_observations_animal_id ON observations(animal_id);
CREATE INDEX IF NOT EXISTS idx_observations_timestamp ON observations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_observations_location ON observations USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_observations_species ON observations(species) WHERE species IS NOT NULL;

-- Add comment for documentation
COMMENT ON TABLE observations IS 'Raw GPS pings/sightings from tracking devices';
COMMENT ON COLUMN observations.location IS 'PostGIS geography point generated from latitude/longitude';
