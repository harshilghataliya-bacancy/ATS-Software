-- Fix: allow feedback owners to delete their own scorecard_ratings
-- Previously only admins could delete, which broke the edit feedback flow

DROP POLICY IF EXISTS "scorecard_ratings_delete" ON scorecard_ratings;

CREATE POLICY "scorecard_ratings_delete"
    ON scorecard_ratings FOR DELETE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND (
            public.user_role(organization_id) = 'admin'
            OR feedback_id IN (
                SELECT id FROM interview_feedback WHERE user_id = auth.uid()
            )
        )
    );
