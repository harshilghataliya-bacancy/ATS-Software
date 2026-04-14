-- ============================================================================
-- Job-Specific Scorecard Cloning
-- Adds support for cloning org-level scorecard templates into job-specific
-- instances, ensuring isolation between jobs.
-- ============================================================================

-- Add columns to scorecards for job-specific copies
ALTER TABLE scorecards ADD COLUMN job_id UUID REFERENCES jobs(id) ON DELETE CASCADE;
ALTER TABLE scorecards ADD COLUMN source_scorecard_id UUID REFERENCES scorecards(id) ON DELETE SET NULL;
ALTER TABLE scorecards ADD COLUMN label TEXT;

-- Index for efficient job-scoped lookups
CREATE INDEX idx_scorecards_job ON scorecards(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_scorecards_org_job ON scorecards(organization_id, job_id);

-- Update RLS: Allow recruiters to manage job-specific scorecards (not just admins)
CREATE POLICY "Recruiters can manage job scorecards"
  ON scorecards FOR ALL
  USING (
    job_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = scorecards.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('admin', 'recruiter')
        AND om.deleted_at IS NULL
    )
  );

-- Same for criteria of job-specific scorecards
CREATE POLICY "Recruiters can manage job scorecard criteria"
  ON scorecard_template_criteria FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM scorecards s
      WHERE s.id = scorecard_template_criteria.scorecard_id
        AND s.job_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM organization_members om
          WHERE om.organization_id = s.organization_id
            AND om.user_id = auth.uid()
            AND om.role IN ('admin', 'recruiter')
            AND om.deleted_at IS NULL
        )
    )
  );
