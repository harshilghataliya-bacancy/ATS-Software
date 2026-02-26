-- Add recruiter assignment to jobs
ALTER TABLE jobs ADD COLUMN assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Partial index for efficient filtering on assigned recruiter
CREATE INDEX idx_jobs_assigned_to ON jobs (assigned_to) WHERE assigned_to IS NOT NULL;
