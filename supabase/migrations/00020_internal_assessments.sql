-- =============================================================================
-- Replace TestGorilla with Internal Assessment Workflow
-- =============================================================================

-- 1. Make testgorilla_assessment_id nullable (no longer required)
ALTER TABLE assessment_invitations
  ALTER COLUMN testgorilla_assessment_id DROP NOT NULL;

-- 2. Add new internal assessment columns
ALTER TABLE assessment_invitations
  ADD COLUMN IF NOT EXISTS assessment_link text,
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- 3. Remove testgorilla_assessment_id from jobs
ALTER TABLE jobs DROP COLUMN IF EXISTS testgorilla_assessment_id;

-- 4. Drop TestGorilla config table (no longer needed)
DROP TABLE IF EXISTS testgorilla_config CASCADE;
