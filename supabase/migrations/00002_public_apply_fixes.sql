-- ==========================================================================
-- Migration: Public Apply Fixes
-- Adds anon SELECT policies + GRANTS so the public careers apply form works.
-- Also adds anon SELECT on pipeline_stages and a Storage bucket for resumes.
-- ==========================================================================

-- 1. Candidates: anon needs SELECT to check for existing candidate by email
CREATE POLICY "candidates_select_public"
    ON candidates FOR SELECT TO anon
    USING (true);

GRANT SELECT ON candidates TO anon;

-- 2. Pipeline stages: anon needs SELECT to find the first stage for a job
CREATE POLICY "pipeline_stages_select_public"
    ON pipeline_stages FOR SELECT TO anon
    USING (true);

GRANT SELECT ON pipeline_stages TO anon;

-- 3. Applications: anon needs SELECT to check for duplicate applications
CREATE POLICY "applications_select_public"
    ON applications FOR SELECT TO anon
    USING (true);

GRANT SELECT ON applications TO anon;

-- 4. Candidates: anon needs UPDATE to set resume_url after upload
CREATE POLICY "candidates_update_public"
    ON candidates FOR UPDATE TO anon
    USING (true)
    WITH CHECK (true);

GRANT UPDATE ON candidates TO anon;

-- 5. Create resumes storage bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', true)
ON CONFLICT (id) DO NOTHING;

-- 6. Storage policies for resumes bucket
CREATE POLICY "resumes_upload_auth"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'resumes');

CREATE POLICY "resumes_upload_anon"
    ON storage.objects FOR INSERT TO anon
    WITH CHECK (bucket_id = 'resumes');

CREATE POLICY "resumes_read_all"
    ON storage.objects FOR SELECT TO authenticated, anon
    USING (bucket_id = 'resumes');

CREATE POLICY "resumes_update_auth"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'resumes');

CREATE POLICY "resumes_update_anon"
    ON storage.objects FOR UPDATE TO anon
    USING (bucket_id = 'resumes');
