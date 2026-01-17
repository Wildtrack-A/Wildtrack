-- Add user_id column to journals table for Auth0 user association
ALTER TABLE journals ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Create index for user-based queries
CREATE INDEX IF NOT EXISTS idx_journals_user_id ON journals(user_id);

-- Add foreign key constraint (optional - depends on if you have a users table)
-- If Auth0 user IDs are stored elsewhere, you might want to skip the FK constraint
-- ALTER TABLE journals ADD CONSTRAINT fk_journals_user_id FOREIGN KEY (user_id) REFERENCES users(id);
