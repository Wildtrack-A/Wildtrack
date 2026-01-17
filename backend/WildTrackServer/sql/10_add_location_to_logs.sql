-- Add latitude and longitude columns to logs table for GPS location tracking
ALTER TABLE logs ADD COLUMN IF NOT EXISTS latitude REAL;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS longitude REAL;

-- Create index for location-based queries
CREATE INDEX IF NOT EXISTS idx_logs_location ON logs(latitude, longitude);
