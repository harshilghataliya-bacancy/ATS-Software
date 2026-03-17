-- Fix: Grant table permissions for job_recruiters to PostgREST roles
-- The original migration created the table and RLS policies but forgot table-level GRANTs

GRANT ALL ON job_recruiters TO authenticated;
GRANT SELECT ON job_recruiters TO anon;
GRANT ALL ON job_recruiters TO service_role;
