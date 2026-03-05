-- =============================================================================
-- Assessment: Add name field and allow multiple per application
-- =============================================================================

-- 1. Add assessment_name column
ALTER TABLE assessment_invitations
  ADD COLUMN IF NOT EXISTS assessment_name text;

-- 2. Drop the unique constraint that limits one assessment per application
ALTER TABLE assessment_invitations
  DROP CONSTRAINT IF EXISTS assessment_invitation_app_unique;
