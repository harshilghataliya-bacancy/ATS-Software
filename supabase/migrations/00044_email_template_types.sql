-- Add new email template types for all system emails
ALTER TYPE email_template_type ADD VALUE IF NOT EXISTS 'interview_scheduled';
ALTER TYPE email_template_type ADD VALUE IF NOT EXISTS 'interview_scheduled_interviewer';
ALTER TYPE email_template_type ADD VALUE IF NOT EXISTS 'interview_updated';
ALTER TYPE email_template_type ADD VALUE IF NOT EXISTS 'interview_cancelled';
ALTER TYPE email_template_type ADD VALUE IF NOT EXISTS 'assessment_invitation';
ALTER TYPE email_template_type ADD VALUE IF NOT EXISTS 'interviewer_invite';
ALTER TYPE email_template_type ADD VALUE IF NOT EXISTS 'offer_letter';

-- Add is_system column to mark auto-seeded templates (cannot be deleted via UI)
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
