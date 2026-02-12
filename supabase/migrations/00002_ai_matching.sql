-- ============================================================================
-- AI Candidate Matching & Scoring Migration
-- ============================================================================

-- --------------------------------------------------------------------------
-- candidate_match_scores - Stores AI-generated match scores per application
-- --------------------------------------------------------------------------
CREATE TABLE candidate_match_scores (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    application_id    uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    candidate_id      uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    job_id            uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

    -- Scores (0-100)
    overall_score     integer NOT NULL DEFAULT 0,
    skill_score       integer NOT NULL DEFAULT 0,
    experience_score  integer NOT NULL DEFAULT 0,
    semantic_score    integer NOT NULL DEFAULT 0,

    -- AI-generated content
    ai_summary        text,
    recommendation    text,
    strengths         text[] DEFAULT '{}',
    concerns          text[] DEFAULT '{}',

    -- Detailed breakdown stored as JSON
    breakdown         jsonb DEFAULT '{}'::jsonb,

    -- Scoring weights used at time of scoring
    weights           jsonb DEFAULT '{"skill": 40, "experience": 30, "semantic": 30}'::jsonb,

    -- Metadata
    model_used        text DEFAULT 'gpt-4o',
    scored_at         timestamptz NOT NULL DEFAULT now(),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT match_score_range CHECK (overall_score >= 0 AND overall_score <= 100),
    CONSTRAINT skill_score_range CHECK (skill_score >= 0 AND skill_score <= 100),
    CONSTRAINT experience_score_range CHECK (experience_score >= 0 AND experience_score <= 100),
    CONSTRAINT semantic_score_range CHECK (semantic_score >= 0 AND semantic_score <= 100),
    CONSTRAINT match_scores_application_unique UNIQUE (application_id)
);

CREATE INDEX idx_match_scores_org_id ON candidate_match_scores(organization_id);
CREATE INDEX idx_match_scores_application_id ON candidate_match_scores(application_id);
CREATE INDEX idx_match_scores_candidate_id ON candidate_match_scores(candidate_id);
CREATE INDEX idx_match_scores_job_id ON candidate_match_scores(job_id);
CREATE INDEX idx_match_scores_overall ON candidate_match_scores(organization_id, overall_score DESC);

CREATE TRIGGER trg_match_scores_updated_at
    BEFORE UPDATE ON candidate_match_scores
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- ai_scoring_config - Per-organization AI scoring settings
-- --------------------------------------------------------------------------
CREATE TABLE ai_scoring_config (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    enabled           boolean NOT NULL DEFAULT true,
    skill_weight      integer NOT NULL DEFAULT 40,
    experience_weight integer NOT NULL DEFAULT 30,
    semantic_weight   integer NOT NULL DEFAULT 30,
    auto_score        boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT scoring_config_org_unique UNIQUE (organization_id),
    CONSTRAINT weights_positive CHECK (
        skill_weight >= 0 AND skill_weight <= 100
        AND experience_weight >= 0 AND experience_weight <= 100
        AND semantic_weight >= 0 AND semantic_weight <= 100
    )
);

CREATE TRIGGER trg_scoring_config_updated_at
    BEFORE UPDATE ON ai_scoring_config
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- RLS Policies
-- --------------------------------------------------------------------------
ALTER TABLE candidate_match_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_scoring_config ENABLE ROW LEVEL SECURITY;

-- Match scores: org members can read, admin/recruiter can write
CREATE POLICY "match_scores_select"
    ON candidate_match_scores FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "match_scores_insert"
    ON candidate_match_scores FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "match_scores_update"
    ON candidate_match_scores FOR UPDATE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    )
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "match_scores_delete"
    ON candidate_match_scores FOR DELETE TO authenticated
    USING (public.user_role(organization_id) = 'admin');

-- AI scoring config: admin only
CREATE POLICY "scoring_config_select"
    ON ai_scoring_config FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "scoring_config_insert"
    ON ai_scoring_config FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) = 'admin'
    );

CREATE POLICY "scoring_config_update"
    ON ai_scoring_config FOR UPDATE TO authenticated
    USING (public.user_role(organization_id) = 'admin')
    WITH CHECK (public.user_role(organization_id) = 'admin');

-- Grants
GRANT ALL ON candidate_match_scores TO authenticated;
GRANT ALL ON ai_scoring_config TO authenticated;

COMMENT ON TABLE candidate_match_scores IS 'AI-generated match scores between candidates and job postings. One score per application.';
COMMENT ON TABLE ai_scoring_config IS 'Per-organization configuration for AI scoring weights and settings.';
