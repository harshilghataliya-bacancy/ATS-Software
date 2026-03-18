-- Fix: scorecard_ratings.criteria_id FK only references scorecard_criteria (job-level),
-- but we now also store scorecard_template_criteria IDs.
-- Drop the FK constraint so both can be used.

ALTER TABLE scorecard_ratings DROP CONSTRAINT scorecard_ratings_criteria_id_fkey;

-- Also drop the rating range constraint since text-type criteria use rating=0
ALTER TABLE scorecard_ratings DROP CONSTRAINT IF EXISTS scorecard_rating_range;
