-- Add practice_count and updated_at columns to pronunciation_evaluations table
-- This supports the new upsert behavior for tracking practice frequency

-- Add practice_count column (defaults to 1 for existing records)
ALTER TABLE pronunciation_evaluations 
ADD COLUMN practice_count INTEGER NOT NULL DEFAULT 1;

-- Add updated_at column (initially set to created_at for existing records)
ALTER TABLE pronunciation_evaluations 
ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();

-- Update existing records to have updated_at = created_at
UPDATE pronunciation_evaluations 
SET updated_at = created_at 
WHERE updated_at IS NULL;

-- Add policies for agents to update pronunciation evaluations
CREATE POLICY "Agents can update pronunciation evaluations for users" ON pronunciation_evaluations
  FOR UPDATE USING (true); -- Allow agents to update evaluations for users

-- Create index for efficient upsert queries
CREATE INDEX idx_pronunciation_evals_unique_phrase ON pronunciation_evaluations(user_id, kanji, romaji, translation);

-- Create index for practice count queries
CREATE INDEX idx_pronunciation_evals_practice_count ON pronunciation_evaluations(practice_count);

-- Create index for updated_at queries
CREATE INDEX idx_pronunciation_evals_updated_at ON pronunciation_evaluations(updated_at);

-- Remove audio_url column since we're no longer storing files on filesystem
-- Drop the index first
DROP INDEX IF EXISTS idx_pronunciation_evals_audio_url;
-- Remove the column
ALTER TABLE pronunciation_evaluations DROP COLUMN IF EXISTS audio_url;
