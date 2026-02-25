-- Add soft delete (deleted_at) to all main entity tables
-- This prevents cascade errors and preserves data for audit trails

-- offer_letters
ALTER TABLE offer_letters ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_offer_letters_deleted ON offer_letters (deleted_at) WHERE deleted_at IS NOT NULL;

-- email_templates
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_email_templates_deleted ON email_templates (deleted_at) WHERE deleted_at IS NOT NULL;

-- applications
ALTER TABLE applications ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_applications_deleted ON applications (deleted_at) WHERE deleted_at IS NOT NULL;

-- interviews
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_interviews_deleted ON interviews (deleted_at) WHERE deleted_at IS NOT NULL;

-- interview_feedback
ALTER TABLE interview_feedback ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_interview_feedback_deleted ON interview_feedback (deleted_at) WHERE deleted_at IS NOT NULL;

-- organization_members (for when admins remove members)
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_org_members_deleted ON organization_members (deleted_at) WHERE deleted_at IS NOT NULL;
