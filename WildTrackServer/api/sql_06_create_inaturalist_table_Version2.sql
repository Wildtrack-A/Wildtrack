-- Create a dedicated table to store iNaturalist observations and simple sync state.
-- Run these in Supabase SQL editor.

-- 1) table for iNaturalist observations
CREATE TABLE IF NOT EXISTS public.inaturalist_observations (
  id BIGSERIAL PRIMARY KEY,
  inat_id BIGINT UNIQUE NOT NULL,
  species_guess TEXT,
  taxon_id BIGINT,
  taxon_name TEXT,
  observed_on DATE,
  observed_at TIMESTAMP WITH TIME ZONE,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  user_id BIGINT,
  user_login TEXT,
  photos JSONB,
  license TEXT,
  raw_json JSONB,
  source TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- 2) simple key-value table for incremental sync state
CREATE TABLE IF NOT EXISTS public.sync_state (
  key TEXT PRIMARY KEY,
  value JSONB
);