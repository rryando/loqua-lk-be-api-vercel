-- Add audio URL column to pronunciation_evaluations table
ALTER TABLE pronunciation_evaluations 
ADD COLUMN audio_url VARCHAR;

-- Create index for audio URL lookups
CREATE INDEX idx_pronunciation_evals_audio_url ON pronunciation_evaluations(audio_url) 
WHERE audio_url IS NOT NULL;