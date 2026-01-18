-- Populate endangered_species table with comprehensive list of endangered animals
-- This list includes mammals, birds, reptiles, marine animals, and other endangered species
-- Run this AFTER creating the table with 13_create_endangered_species_table.sql

INSERT INTO endangered_species (species_name, is_endangered, conservation_status) VALUES
    -- Big Cats
    ('Tiger', true, 'Endangered'),
    ('Lion', true, 'Vulnerable'),
    ('Leopard', true, 'Vulnerable'),
    ('Snow Leopard', true, 'Vulnerable'),
    ('Jaguar', true, 'Near Threatened'),
    ('Cheetah', true, 'Vulnerable'),
    ('Clouded Leopard', true, 'Vulnerable'),
    
    -- Primates
    ('Orangutan', true, 'Critically Endangered'),
    ('Gorilla', true, 'Critically Endangered'),
    ('Chimpanzee', true, 'Endangered'),
    ('Bonobo', true, 'Endangered'),
    ('Gibbon', true, 'Endangered'),
    ('Lemur', true, 'Endangered'),
    
    -- Bears
    ('Giant Panda', true, 'Vulnerable'),
    ('Polar Bear', true, 'Vulnerable'),
    ('Sun Bear', true, 'Vulnerable'),
    ('Sloth Bear', true, 'Vulnerable'),
    
    -- Elephants and Rhinos
    ('African Elephant', true, 'Endangered'),
    ('Asian Elephant', true, 'Endangered'),
    ('Black Rhinoceros', true, 'Critically Endangered'),
    ('White Rhinoceros', true, 'Near Threatened'),
    ('Sumatran Rhinoceros', true, 'Critically Endangered'),
    ('Javan Rhinoceros', true, 'Critically Endangered'),
    
    -- Marine Mammals
    ('Blue Whale', true, 'Endangered'),
    ('Humpback Whale', true, 'Least Concern'),
    ('Fin Whale', true, 'Vulnerable'),
    ('Sei Whale', true, 'Endangered'),
    ('Sperm Whale', true, 'Vulnerable'),
    ('Killer Whale', true, 'Data Deficient'),
    ('Dugong', true, 'Vulnerable'),
    ('Manatee', true, 'Vulnerable'),
    
    -- Marine Reptiles
    ('Green Sea Turtle', true, 'Endangered'),
    ('Leatherback Sea Turtle', true, 'Vulnerable'),
    ('Hawksbill Sea Turtle', true, 'Critically Endangered'),
    ('Loggerhead Sea Turtle', true, 'Vulnerable'),
    ('Olive Ridley Sea Turtle', true, 'Vulnerable'),
    
    -- Birds
    ('Bald Eagle', true, 'Least Concern'),
    ('California Condor', true, 'Critically Endangered'),
    ('Whooping Crane', true, 'Endangered'),
    ('Spoon-billed Sandpiper', true, 'Critically Endangered'),
    ('Kakapo', true, 'Critically Endangered'),
    ('Philippine Eagle', true, 'Critically Endangered'),
    ('Harpy Eagle', true, 'Vulnerable'),
    
    -- Other Mammals
    ('Red Panda', true, 'Endangered'),
    ('Koala', true, 'Vulnerable'),
    ('Tasmanian Devil', true, 'Endangered'),
    ('Amur Leopard', true, 'Critically Endangered'),
    ('Iberian Lynx', true, 'Endangered'),
    ('Saiga Antelope', true, 'Critically Endangered'),
    ('Vaquita', true, 'Critically Endangered'),
    ('Yangtze Finless Porpoise', true, 'Critically Endangered'),
    
    -- Reptiles and Amphibians
    ('Komodo Dragon', true, 'Endangered'),
    ('Gharial', true, 'Critically Endangered'),
    ('Chinese Alligator', true, 'Critically Endangered'),
    ('Galapagos Tortoise', true, 'Vulnerable'),
    
    -- Additional Endangered Species
    ('African Wild Dog', true, 'Endangered'),
    ('Ethiopian Wolf', true, 'Endangered'),
    ('Mountain Gorilla', true, 'Endangered'),
    ('Sumatran Orangutan', true, 'Critically Endangered'),
    ('Bornean Orangutan', true, 'Critically Endangered')
ON CONFLICT (species_name) DO UPDATE 
SET 
    is_endangered = EXCLUDED.is_endangered,
    conservation_status = EXCLUDED.conservation_status,
    updated_at = NOW();

-- Verify the insert
SELECT COUNT(*) as total_endangered_species FROM endangered_species WHERE is_endangered = true;
