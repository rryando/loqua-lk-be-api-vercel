-- Add topic_id and translation_breakdown columns to pronunciation_evaluations
ALTER TABLE pronunciation_evaluations 
  ADD COLUMN topic_id UUID REFERENCES topics(id),
  ADD COLUMN translation_breakdown JSONB;

-- Create index for topic_id foreign key
CREATE INDEX idx_pronunciation_evals_topic_id ON pronunciation_evaluations(topic_id);

-- Create GIN index for JSONB translation_breakdown queries
CREATE INDEX idx_pronunciation_evals_translation_breakdown ON pronunciation_evaluations USING GIN (translation_breakdown);

-- Update existing records to link with topics based on current topic string
-- This migration maps existing topic strings to topic IDs
UPDATE pronunciation_evaluations 
SET topic_id = (
  SELECT id FROM topics 
  WHERE LOWER(topics.category) = LOWER(pronunciation_evaluations.topic)
  LIMIT 1
)
WHERE topic_id IS NULL AND topic IS NOT NULL;

-- For records that don't match any category, assign to 'General Conversation'
UPDATE pronunciation_evaluations 
SET topic_id = (
  SELECT id FROM topics 
  WHERE name = 'General Conversation' 
  LIMIT 1
)
WHERE topic_id IS NULL;