-- Create RPC function to check if a user location is within danger zones
-- This uses PostGIS ST_DWithin for efficient spatial distance calculations

CREATE OR REPLACE FUNCTION is_user_in_danger(
    user_lat DOUBLE PRECISION,
    user_lng DOUBLE PRECISION
)
RETURNS TABLE (
    in_danger BOOLEAN,
    zone_id BIGINT,
    threat_level TEXT,
    distance_meters DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_point GEOGRAPHY(POINT, 4326);
BEGIN
    -- Create point from user coordinates
    user_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326);
    
    -- Check if user is within any zone's radius
    RETURN QUERY
    SELECT 
        TRUE as in_danger,
        z.id as zone_id,
        z.threat_level,
        ST_Distance(user_point, z.center_point)::DOUBLE PRECISION as distance_meters
    FROM zones z
    WHERE ST_DWithin(user_point, z.center_point, z.radius_meters)
    ORDER BY distance_meters ASC
    LIMIT 1;
    
    -- If no zone found, return false
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::BIGINT, NULL::TEXT, NULL::DOUBLE PRECISION;
    END IF;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION is_user_in_danger IS 'Check if a user location (lat, lng) is within any danger zone';
