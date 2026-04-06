-- Interview Reminder System
-- Adds reminder settings to organizations and tracks sent reminders

-- Add reminder_intervals to organizations (stores minutes: 720=12h, 240=4h, 60=1h, 30=30m, 15=15m)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS reminder_intervals integer[] DEFAULT '{60}';

-- Track sent reminders to prevent duplicates
CREATE TABLE IF NOT EXISTS interview_reminders_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  reminder_minutes integer NOT NULL,
  sent_at timestamptz DEFAULT now(),
  UNIQUE(interview_id, reminder_minutes)
);

-- RLS
ALTER TABLE interview_reminders_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view reminders"
  ON interview_reminders_sent FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

CREATE POLICY "Service role can insert reminders"
  ON interview_reminders_sent FOR INSERT
  WITH CHECK (true);

-- Add new template types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'interview_reminder_candidate' AND enumtypid = 'email_template_type'::regtype) THEN
    ALTER TYPE email_template_type ADD VALUE 'interview_reminder_candidate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'interview_reminder_interviewer' AND enumtypid = 'email_template_type'::regtype) THEN
    ALTER TYPE email_template_type ADD VALUE 'interview_reminder_interviewer';
  END IF;
END$$;

-- Grant access
GRANT SELECT, INSERT ON interview_reminders_sent TO authenticated;
GRANT SELECT, INSERT ON interview_reminders_sent TO service_role;
