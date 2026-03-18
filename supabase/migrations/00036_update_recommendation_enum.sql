-- Update feedback_recommendation enum: remove old values, add new ones (select, reject, hold)
-- PostgreSQL doesn't support DROP VALUE from enum, so we need to recreate it

-- Step 1: Change column to text first (so we can update values freely)
ALTER TABLE interview_feedback ALTER COLUMN recommendation TYPE text;

-- Step 2: Drop old enum and create new one
DROP TYPE feedback_recommendation;
CREATE TYPE feedback_recommendation AS ENUM ('select', 'reject', 'hold');

-- Step 3: Map old values to new ones
UPDATE interview_feedback SET recommendation = 'select' WHERE recommendation IN ('strong_yes', 'yes');
UPDATE interview_feedback SET recommendation = 'reject' WHERE recommendation IN ('no', 'strong_no');
UPDATE interview_feedback SET recommendation = 'hold' WHERE recommendation = 'neutral';

-- Step 4: Convert column back to enum
ALTER TABLE interview_feedback ALTER COLUMN recommendation TYPE feedback_recommendation USING recommendation::feedback_recommendation;
