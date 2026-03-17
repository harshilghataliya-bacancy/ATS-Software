-- Multi-Recruiter Assignment: junction table + application-level assignment
-- ==========================================================================

-- Junction table for many-to-many job-recruiter assignment
CREATE TABLE job_recruiters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(job_id, user_id)
);

ALTER TABLE job_recruiters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view job recruiters" ON job_recruiters
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM jobs j
      JOIN organization_members om ON om.organization_id = j.organization_id
      WHERE j.id = job_recruiters.job_id
        AND om.user_id = auth.uid()
        AND om.deleted_at IS NULL
    )
  );

CREATE POLICY "Admins can manage job recruiters" ON job_recruiters
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM jobs j
      JOIN organization_members om ON om.organization_id = j.organization_id
      WHERE j.id = job_recruiters.job_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
        AND om.deleted_at IS NULL
    )
  );

-- Application-level recruiter assignment
ALTER TABLE applications ADD COLUMN IF NOT EXISTS assigned_recruiter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill: migrate existing assigned_to data into junction table
INSERT INTO job_recruiters (job_id, user_id)
SELECT id, assigned_to FROM jobs WHERE assigned_to IS NOT NULL
ON CONFLICT DO NOTHING;
