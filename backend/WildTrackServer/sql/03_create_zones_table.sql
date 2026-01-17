-- Create zones table for AI-calculated danger areas
-- Zones represent clustered areas where animals are currently located

CREATE TABLE IF NOT EXISTS zones (
    id BIGSERIAL PRIMARY KEY,
    center_latitude DOUBLE PRECISION NOT NULL,
    center_longitude DOUBLE PRECISION NOT NULL,
    center_point GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS (
        ST_SetSRID(ST_MakePoint(center_longitude, center_latitude), 4326)
    ) STORED,
    radius_meters DOUBLE PRECISION NOT NULL CHECK (radius_meters > 0),
    threat_level TEXT NOT NULL CHECK (threat_level IN ('low', 'medium', 'high', 'critical')),
    species TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for spatial queries
CREATE INDEX IF NOT EXISTS idx_zones_center_point ON zones USING GIST(center_point);
CREATE INDEX IF NOT EXISTS idx_zones_threat_level ON zones(threat_level);
CREATE INDEX IF NOT EXISTS idx_zones_updated_at ON zones(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_zones_species ON zones(species) WHERE species IS NOT NULL;

-- Add comment for documentation
COMMENT ON TABLE zones IS 'AI-calculated danger zones from clustered observations';
COMMENT ON COLUMN zones.center_point IS 'PostGIS geography point for zone center';
COMMENT ON COLUMN zones.radius_meters IS 'Radius of the danger zone in meters';
