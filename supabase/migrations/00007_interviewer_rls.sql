-- Allow interviewers (panelists) to update interviews they are assigned to
-- (e.g. mark as completed). Admins/recruiters can still update any interview.

DROP POLICY IF EXISTS "interviews_update" ON interviews;

CREATE POLICY "interviews_update"
    ON interviews FOR UPDATE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND (
            public.user_role(organization_id) IN ('admin', 'recruiter')
            OR (
                public.user_role(organization_id) = 'interviewer'
                AND EXISTS (
                    SELECT 1 FROM interview_panelists ip
                    WHERE ip.interview_id = interviews.id
                      AND ip.user_id = auth.uid()
                )
            )
        )
    )
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND (
            public.user_role(organization_id) IN ('admin', 'recruiter')
            OR (
                public.user_role(organization_id) = 'interviewer'
                AND EXISTS (
                    SELECT 1 FROM interview_panelists ip
                    WHERE ip.interview_id = interviews.id
                      AND ip.user_id = auth.uid()
                )
            )
        )
    );
