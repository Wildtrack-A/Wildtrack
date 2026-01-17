-- Migration script: Convert profiles table from Supabase Auth to Auth0
-- Run this ONLY if you already have a profiles table with UUID id column
-- This will DROP the old table and recreate it with TEXT id for Auth0

-- WARNING: This will delete all existing profile data!
-- Only run this if you're okay losing test data, or export it first

-- Drop the old table and its dependencies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Service role can manage profiles" ON profiles;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS profiles CASCADE;

-- Now run the new 06_create_users_table.sql
