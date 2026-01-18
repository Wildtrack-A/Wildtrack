-- Create table to track which species are classified as endangered
-- This allows us to mark species as endangered and query them efficiently

CREATE TABLE IF NOT EXISTS endangered_species (
    id BIGSERIAL PRIMARY KEY,
    species_name TEXT UNIQUE NOT NULL,
    is_endangered BOOLEAN NOT NULL DEFAULT true,
    conservation_status TEXT,  -- e.g., 'Endangered', 'Critically Endangered', 'Vulnerable'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_endangered_species_name ON endangered_species(species_name);
CREATE INDEX IF NOT EXISTS idx_endangered_species_status ON endangered_species(is_endangered) WHERE is_endangered = true;

-- Add comment for documentation
COMMENT ON TABLE endangered_species IS 'Reference table for species conservation status';
COMMENT ON COLUMN endangered_species.species_name IS 'Name of the species (should match species names in observations table)';
COMMENT ON COLUMN endangered_species.is_endangered IS 'Whether this species is classified as endangered';
COMMENT ON COLUMN endangered_species.conservation_status IS 'IUCN conservation status (e.g., Endangered, Critically Endangered, Vulnerable)';

-- Note: Run 14_populate_endangered_species.sql after creating this table
-- to populate it with a comprehensive list of ~50 endangered species
