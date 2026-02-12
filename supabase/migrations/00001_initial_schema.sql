-- ============================================================================
-- ATS (Applicant Tracking System) - Initial Schema Migration
-- Multi-tenant, production-ready schema for 10-50 employee IT startups
-- Supabase / PostgreSQL 15+
-- ============================================================================

-- ============================================================================
-- 0. EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive text for emails

-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================
CREATE TYPE org_member_role AS ENUM ('admin', 'recruiter', 'hiring_manager');

CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'contract', 'internship');

CREATE TYPE job_status AS ENUM ('draft', 'published', 'closed', 'archived');

CREATE TYPE pipeline_stage_type AS ENUM (
    'applied', 'screening', 'interview', 'assessment', 'offer', 'hired', 'rejected'
);

CREATE TYPE application_status AS ENUM ('active', 'withdrawn', 'rejected', 'hired');

CREATE TYPE candidate_source AS ENUM (
    'direct', 'referral', 'linkedin', 'job_board', 'careers_page', 'other'
);

CREATE TYPE interview_type AS ENUM ('phone', 'video', 'onsite', 'technical', 'cultural');

CREATE TYPE interview_status AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');

CREATE TYPE panelist_role AS ENUM ('interviewer', 'lead', 'observer');

CREATE TYPE panelist_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TYPE feedback_recommendation AS ENUM ('strong_yes', 'yes', 'neutral', 'no', 'strong_no');

CREATE TYPE email_template_type AS ENUM (
    'rejection', 'offer', 'interview_invite', 'follow_up', 'custom'
);

CREATE TYPE email_send_status AS ENUM ('sent', 'failed', 'bounced');

CREATE TYPE offer_status AS ENUM ('draft', 'sent', 'accepted', 'declined', 'expired');

CREATE TYPE oauth_provider AS ENUM ('google_calendar', 'gmail');

CREATE TYPE comment_entity_type AS ENUM ('application', 'candidate', 'interview');


-- ============================================================================
-- 2. HELPER FUNCTIONS (used by RLS policies and triggers)
-- ============================================================================

-- Auto-update updated_at column on row modification.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- NOTE: user_org_ids() and user_role() are defined AFTER tables (section 3)
-- because they reference organization_members which must exist first.

-- Creates default pipeline stages when a new job is inserted.
CREATE OR REPLACE FUNCTION public.create_default_pipeline_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO pipeline_stages (id, job_id, organization_id, name, display_order, is_default, stage_type)
    VALUES
        (gen_random_uuid(), NEW.id, NEW.organization_id, 'Applied',     1, true, 'applied'),
        (gen_random_uuid(), NEW.id, NEW.organization_id, 'Screening',   2, true, 'screening'),
        (gen_random_uuid(), NEW.id, NEW.organization_id, 'Interview',   3, true, 'interview'),
        (gen_random_uuid(), NEW.id, NEW.organization_id, 'Assessment',  4, true, 'assessment'),
        (gen_random_uuid(), NEW.id, NEW.organization_id, 'Offer',       5, true, 'offer'),
        (gen_random_uuid(), NEW.id, NEW.organization_id, 'Hired',       6, true, 'hired'),
        (gen_random_uuid(), NEW.id, NEW.organization_id, 'Rejected',    7, true, 'rejected');
    RETURN NEW;
END;
$$;

-- Automatically set the initial pipeline stage on a new application.
CREATE OR REPLACE FUNCTION public.set_application_initial_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stage_id uuid;
BEGIN
    IF NEW.current_stage_id IS NULL THEN
        SELECT id INTO v_stage_id
        FROM pipeline_stages
        WHERE job_id = NEW.job_id
        ORDER BY display_order ASC
        LIMIT 1;

        IF v_stage_id IS NOT NULL THEN
            NEW.current_stage_id = v_stage_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- Automatically record a stage movement when an application's stage changes.
CREATE OR REPLACE FUNCTION public.record_stage_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF OLD.current_stage_id IS DISTINCT FROM NEW.current_stage_id THEN
        INSERT INTO stage_movements (application_id, organization_id, from_stage_id, to_stage_id, moved_by)
        VALUES (NEW.id, NEW.organization_id, OLD.current_stage_id, NEW.current_stage_id, auth.uid());
    END IF;
    RETURN NEW;
END;
$$;

-- Log an activity. Callable from application code or other triggers.
CREATE OR REPLACE FUNCTION public.log_activity(
    p_org_id        uuid,
    p_entity_type   text,
    p_entity_id     uuid,
    p_action        text,
    p_metadata      jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id uuid;
BEGIN
    INSERT INTO activity_logs (organization_id, user_id, entity_type, entity_id, action, metadata)
    VALUES (p_org_id, auth.uid(), p_entity_type, p_entity_id, p_action, p_metadata)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;


-- ============================================================================
-- 3. TABLES
-- ============================================================================

-- --------------------------------------------------------------------------
-- 3.1 organizations
-- --------------------------------------------------------------------------
CREATE TABLE organizations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    slug            text NOT NULL,
    logo_url        text,
    careers_page_config jsonb DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT organizations_slug_unique UNIQUE (slug),
    CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9\-]{1,62}[a-z0-9]$')
);

CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3.2 organization_members
-- --------------------------------------------------------------------------
CREATE TABLE organization_members (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    role            org_member_role NOT NULL DEFAULT 'hiring_manager',
    invited_email   citext,
    invited_at      timestamptz,
    joined_at       timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT org_members_user_org_unique UNIQUE (organization_id, user_id),
    CONSTRAINT org_members_must_have_user_or_invite
        CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL)
);

CREATE INDEX idx_org_members_org_id ON organization_members(organization_id);
CREATE INDEX idx_org_members_user_id ON organization_members(user_id);
CREATE INDEX idx_org_members_invited_email ON organization_members(invited_email)
    WHERE invited_email IS NOT NULL;

CREATE TRIGGER trg_org_members_updated_at
    BEFORE UPDATE ON organization_members
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3.3 jobs
-- --------------------------------------------------------------------------
CREATE TABLE jobs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title           text NOT NULL,
    department      text,
    location        text,
    employment_type employment_type NOT NULL DEFAULT 'full_time',
    description     text,
    requirements    text,
    salary_min      numeric(12,2),
    salary_max      numeric(12,2),
    salary_currency text DEFAULT 'USD',
    status          job_status NOT NULL DEFAULT 'draft',
    published_at    timestamptz,
    closed_at       timestamptz,
    created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz,

    CONSTRAINT jobs_salary_range
        CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max)
);

CREATE INDEX idx_jobs_org_id ON jobs(organization_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_org_status ON jobs(organization_id, status)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_jobs_created_by ON jobs(created_by);
CREATE INDEX idx_jobs_deleted_at ON jobs(deleted_at)
    WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_jobs_published ON jobs(organization_id, published_at)
    WHERE status = 'published' AND deleted_at IS NULL;

CREATE TRIGGER trg_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_jobs_default_pipeline
    AFTER INSERT ON jobs
    FOR EACH ROW EXECUTE FUNCTION public.create_default_pipeline_stages();

-- --------------------------------------------------------------------------
-- 3.4 pipeline_stages
-- --------------------------------------------------------------------------
CREATE TABLE pipeline_stages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            text NOT NULL,
    display_order   integer NOT NULL DEFAULT 0,
    is_default      boolean NOT NULL DEFAULT false,
    stage_type      pipeline_stage_type NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipeline_stages_job_id ON pipeline_stages(job_id);
CREATE INDEX idx_pipeline_stages_org_id ON pipeline_stages(organization_id);
CREATE INDEX idx_pipeline_stages_job_order ON pipeline_stages(job_id, display_order);

CREATE TRIGGER trg_pipeline_stages_updated_at
    BEFORE UPDATE ON pipeline_stages
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3.5 candidates
-- --------------------------------------------------------------------------
CREATE TABLE candidates (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    first_name          text NOT NULL,
    last_name           text NOT NULL,
    email               citext NOT NULL,
    phone               text,
    linkedin_url        text,
    portfolio_url       text,
    current_company     text,
    current_title       text,
    location            text,
    source              candidate_source NOT NULL DEFAULT 'direct',
    source_details      text,
    resume_url          text,
    resume_parsed_data  jsonb DEFAULT '{}'::jsonb,
    gdpr_consent        boolean NOT NULL DEFAULT false,
    gdpr_consent_at     timestamptz,
    notes               text,
    tags                text[] DEFAULT '{}',
    created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz,

    CONSTRAINT candidates_org_email_unique UNIQUE (organization_id, email)
);

CREATE INDEX idx_candidates_org_id ON candidates(organization_id);
CREATE INDEX idx_candidates_email ON candidates(email);
CREATE INDEX idx_candidates_name ON candidates(organization_id, last_name, first_name)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_candidates_source ON candidates(organization_id, source)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_candidates_tags ON candidates USING gin(tags)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_candidates_created_by ON candidates(created_by);
CREATE INDEX idx_candidates_deleted_at ON candidates(deleted_at)
    WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_candidates_resume_parsed ON candidates USING gin(resume_parsed_data jsonb_path_ops)
    WHERE deleted_at IS NULL;

CREATE TRIGGER trg_candidates_updated_at
    BEFORE UPDATE ON candidates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3.6 applications
-- --------------------------------------------------------------------------
CREATE TABLE applications (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    job_id            uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    candidate_id      uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    current_stage_id  uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL,
    status            application_status NOT NULL DEFAULT 'active',
    applied_at        timestamptz NOT NULL DEFAULT now(),
    rejected_at       timestamptz,
    hired_at          timestamptz,
    rejection_reason  text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT applications_job_candidate_unique UNIQUE (job_id, candidate_id)
);

CREATE INDEX idx_applications_org_id ON applications(organization_id);
CREATE INDEX idx_applications_job_id ON applications(job_id);
CREATE INDEX idx_applications_candidate_id ON applications(candidate_id);
CREATE INDEX idx_applications_stage_id ON applications(current_stage_id);
CREATE INDEX idx_applications_status ON applications(organization_id, status);
CREATE INDEX idx_applications_job_status ON applications(job_id, status);

CREATE TRIGGER trg_applications_updated_at
    BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_applications_initial_stage
    BEFORE INSERT ON applications
    FOR EACH ROW EXECUTE FUNCTION public.set_application_initial_stage();

CREATE TRIGGER trg_applications_stage_movement
    AFTER UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION public.record_stage_movement();

-- --------------------------------------------------------------------------
-- 3.7 stage_movements
-- --------------------------------------------------------------------------
CREATE TABLE stage_movements (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id  uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    from_stage_id   uuid REFERENCES pipeline_stages(id) ON DELETE SET NULL,
    to_stage_id     uuid NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
    moved_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    moved_at        timestamptz NOT NULL DEFAULT now(),
    notes           text
);

CREATE INDEX idx_stage_movements_application_id ON stage_movements(application_id);
CREATE INDEX idx_stage_movements_org_id ON stage_movements(organization_id);
CREATE INDEX idx_stage_movements_moved_at ON stage_movements(application_id, moved_at DESC);

-- --------------------------------------------------------------------------
-- 3.8 interviews
-- --------------------------------------------------------------------------
CREATE TABLE interviews (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    application_id              uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    job_id                      uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    candidate_id                uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    scheduled_at                timestamptz NOT NULL,
    duration_minutes            integer NOT NULL DEFAULT 60,
    location                    text,
    meeting_link                text,
    interview_type              interview_type NOT NULL DEFAULT 'video',
    status                      interview_status NOT NULL DEFAULT 'scheduled',
    google_calendar_event_id    text,
    notes                       text,
    created_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT interviews_duration_positive
        CHECK (duration_minutes > 0 AND duration_minutes <= 480)
);

CREATE INDEX idx_interviews_org_id ON interviews(organization_id);
CREATE INDEX idx_interviews_application_id ON interviews(application_id);
CREATE INDEX idx_interviews_job_id ON interviews(job_id);
CREATE INDEX idx_interviews_candidate_id ON interviews(candidate_id);
CREATE INDEX idx_interviews_scheduled_at ON interviews(organization_id, scheduled_at);
CREATE INDEX idx_interviews_status ON interviews(organization_id, status);
CREATE INDEX idx_interviews_created_by ON interviews(created_by);
CREATE INDEX idx_interviews_gcal ON interviews(google_calendar_event_id)
    WHERE google_calendar_event_id IS NOT NULL;

CREATE TRIGGER trg_interviews_updated_at
    BEFORE UPDATE ON interviews
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3.9 interview_panelists
-- --------------------------------------------------------------------------
CREATE TABLE interview_panelists (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id    uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role            panelist_role NOT NULL DEFAULT 'interviewer',
    status          panelist_status NOT NULL DEFAULT 'pending',
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT panelists_interview_user_unique UNIQUE (interview_id, user_id)
);

CREATE INDEX idx_panelists_interview_id ON interview_panelists(interview_id);
CREATE INDEX idx_panelists_org_id ON interview_panelists(organization_id);
CREATE INDEX idx_panelists_user_id ON interview_panelists(user_id);

-- --------------------------------------------------------------------------
-- 3.10 interview_feedback
-- --------------------------------------------------------------------------
CREATE TABLE interview_feedback (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id        uuid NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    application_id      uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    overall_rating      integer NOT NULL,
    recommendation      feedback_recommendation NOT NULL,
    strengths           text,
    weaknesses          text,
    notes               text,
    submitted_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT feedback_rating_range CHECK (overall_rating >= 1 AND overall_rating <= 5),
    CONSTRAINT feedback_interview_user_unique UNIQUE (interview_id, user_id)
);

CREATE INDEX idx_feedback_interview_id ON interview_feedback(interview_id);
CREATE INDEX idx_feedback_org_id ON interview_feedback(organization_id);
CREATE INDEX idx_feedback_user_id ON interview_feedback(user_id);
CREATE INDEX idx_feedback_application_id ON interview_feedback(application_id);

CREATE TRIGGER trg_feedback_updated_at
    BEFORE UPDATE ON interview_feedback
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3.11 scorecard_criteria
-- --------------------------------------------------------------------------
CREATE TABLE scorecard_criteria (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    job_id          uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    name            text NOT NULL,
    description     text,
    weight          integer NOT NULL DEFAULT 1,
    created_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT scorecard_weight_positive CHECK (weight >= 1 AND weight <= 10)
);

CREATE INDEX idx_scorecard_criteria_org_id ON scorecard_criteria(organization_id);
CREATE INDEX idx_scorecard_criteria_job_id ON scorecard_criteria(job_id);

-- --------------------------------------------------------------------------
-- 3.12 scorecard_ratings
-- --------------------------------------------------------------------------
CREATE TABLE scorecard_ratings (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    feedback_id     uuid NOT NULL REFERENCES interview_feedback(id) ON DELETE CASCADE,
    criteria_id     uuid NOT NULL REFERENCES scorecard_criteria(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    rating          integer NOT NULL,
    notes           text,

    CONSTRAINT scorecard_rating_range CHECK (rating >= 1 AND rating <= 5),
    CONSTRAINT scorecard_feedback_criteria_unique UNIQUE (feedback_id, criteria_id)
);

CREATE INDEX idx_scorecard_ratings_feedback_id ON scorecard_ratings(feedback_id);
CREATE INDEX idx_scorecard_ratings_criteria_id ON scorecard_ratings(criteria_id);
CREATE INDEX idx_scorecard_ratings_org_id ON scorecard_ratings(organization_id);

-- --------------------------------------------------------------------------
-- 3.13 email_templates
-- --------------------------------------------------------------------------
CREATE TABLE email_templates (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            text NOT NULL,
    subject         text NOT NULL,
    body_html       text NOT NULL,
    variables       jsonb DEFAULT '[]'::jsonb,
    template_type   email_template_type NOT NULL DEFAULT 'custom',
    created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_templates_org_id ON email_templates(organization_id);
CREATE INDEX idx_email_templates_type ON email_templates(organization_id, template_type);

CREATE TRIGGER trg_email_templates_updated_at
    BEFORE UPDATE ON email_templates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3.14 email_logs
-- --------------------------------------------------------------------------
CREATE TABLE email_logs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    application_id  uuid REFERENCES applications(id) ON DELETE SET NULL,
    candidate_id    uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    template_id     uuid REFERENCES email_templates(id) ON DELETE SET NULL,
    from_email      text NOT NULL,
    to_email        text NOT NULL,
    subject         text NOT NULL,
    body_html       text NOT NULL,
    status          email_send_status NOT NULL DEFAULT 'sent',
    sent_at         timestamptz,
    error_message   text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_logs_org_id ON email_logs(organization_id);
CREATE INDEX idx_email_logs_application_id ON email_logs(application_id);
CREATE INDEX idx_email_logs_candidate_id ON email_logs(candidate_id);
CREATE INDEX idx_email_logs_status ON email_logs(organization_id, status);
CREATE INDEX idx_email_logs_sent_at ON email_logs(organization_id, sent_at DESC);

-- --------------------------------------------------------------------------
-- 3.15 offer_letters
-- --------------------------------------------------------------------------
CREATE TABLE offer_letters (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    application_id      uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    candidate_id        uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    job_id              uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    template_html       text,
    generated_pdf_url   text,
    salary              numeric(12,2),
    salary_currency     text DEFAULT 'USD',
    start_date          date,
    expiry_date         date,
    status              offer_status NOT NULL DEFAULT 'draft',
    sent_at             timestamptz,
    responded_at        timestamptz,
    response_notes      text,
    created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT offer_expiry_after_start
        CHECK (expiry_date IS NULL OR start_date IS NULL OR expiry_date >= start_date)
);

CREATE INDEX idx_offers_org_id ON offer_letters(organization_id);
CREATE INDEX idx_offers_application_id ON offer_letters(application_id);
CREATE INDEX idx_offers_candidate_id ON offer_letters(candidate_id);
CREATE INDEX idx_offers_job_id ON offer_letters(job_id);
CREATE INDEX idx_offers_status ON offer_letters(organization_id, status);

CREATE TRIGGER trg_offers_updated_at
    BEFORE UPDATE ON offer_letters
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3.16 activity_logs
-- --------------------------------------------------------------------------
CREATE TABLE activity_logs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    entity_type     text NOT NULL,
    entity_id       uuid NOT NULL,
    action          text NOT NULL,
    metadata        jsonb DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_logs_org_id ON activity_logs(organization_id);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(organization_id, created_at DESC);
CREATE INDEX idx_activity_logs_org_entity ON activity_logs(organization_id, entity_type, entity_id);

-- --------------------------------------------------------------------------
-- 3.17 google_oauth_tokens
-- --------------------------------------------------------------------------
CREATE TABLE google_oauth_tokens (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    access_token    text NOT NULL,
    refresh_token   text NOT NULL,
    token_expiry    timestamptz NOT NULL,
    scopes          text[] DEFAULT '{}',
    provider        oauth_provider NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT oauth_user_org_provider_unique UNIQUE (user_id, organization_id, provider)
);

CREATE INDEX idx_oauth_user_id ON google_oauth_tokens(user_id);
CREATE INDEX idx_oauth_org_id ON google_oauth_tokens(organization_id);

CREATE TRIGGER trg_oauth_updated_at
    BEFORE UPDATE ON google_oauth_tokens
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3.18 comments
-- --------------------------------------------------------------------------
CREATE TABLE comments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    entity_type     comment_entity_type NOT NULL,
    entity_id       uuid NOT NULL,
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content         text NOT NULL,
    is_private      boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    deleted_at      timestamptz
);

CREATE INDEX idx_comments_org_id ON comments(organization_id);
CREATE INDEX idx_comments_entity ON comments(entity_type, entity_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_created_at ON comments(entity_type, entity_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE TRIGGER trg_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================================
-- 3.5 RLS HELPER FUNCTIONS (must be after organization_members table)
-- ============================================================================

-- Returns an array of organization IDs the current authenticated user belongs to.
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        array_agg(organization_id),
        '{}'::uuid[]
    )
    FROM organization_members
    WHERE user_id = auth.uid()
      AND joined_at IS NOT NULL;
$$;

-- Returns the role of the current authenticated user within a specific organization.
CREATE OR REPLACE FUNCTION public.user_role(p_org_id uuid)
RETURNS org_member_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role
    FROM organization_members
    WHERE user_id = auth.uid()
      AND organization_id = p_org_id
      AND joined_at IS NOT NULL
    LIMIT 1;
$$;


-- ============================================================================
-- 4. ROW LEVEL SECURITY - ENABLE ON ALL TABLES
-- ============================================================================
ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_movements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews            ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_panelists   ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_feedback    ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard_criteria    ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorecard_ratings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_letters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_oauth_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments              ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 5. RLS POLICIES
-- ============================================================================
-- Role hierarchy:
--   admin          = full CRUD within their org
--   recruiter      = full CRUD on recruitment entities within their org
--   hiring_manager = read access + submit own feedback + view own interviews
--
-- Org membership check is the baseline for every authenticated policy.
-- Role-based restrictions are layered on top where needed.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 5.1 organizations
-- --------------------------------------------------------------------------

CREATE POLICY "org_select_member"
    ON organizations FOR SELECT TO authenticated
    USING (id = ANY(public.user_org_ids()));

CREATE POLICY "org_select_public_careers"
    ON organizations FOR SELECT TO anon
    USING (true);

CREATE POLICY "org_insert_authenticated"
    ON organizations FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY "org_update_admin"
    ON organizations FOR UPDATE TO authenticated
    USING (public.user_role(id) = 'admin')
    WITH CHECK (public.user_role(id) = 'admin');

CREATE POLICY "org_delete_admin"
    ON organizations FOR DELETE TO authenticated
    USING (public.user_role(id) = 'admin');

-- --------------------------------------------------------------------------
-- 5.2 organization_members
-- --------------------------------------------------------------------------

CREATE POLICY "org_members_select"
    ON organization_members FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "org_members_insert_admin"
    ON organization_members FOR INSERT TO authenticated
    WITH CHECK (public.user_role(organization_id) = 'admin');

CREATE POLICY "org_members_insert_self_join"
    ON organization_members FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "org_members_update_admin"
    ON organization_members FOR UPDATE TO authenticated
    USING (public.user_role(organization_id) = 'admin')
    WITH CHECK (public.user_role(organization_id) = 'admin');

CREATE POLICY "org_members_delete_admin"
    ON organization_members FOR DELETE TO authenticated
    USING (public.user_role(organization_id) = 'admin');

CREATE POLICY "org_members_delete_self"
    ON organization_members FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- 5.3 jobs
-- --------------------------------------------------------------------------

CREATE POLICY "jobs_select_member"
    ON jobs FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "jobs_select_public"
    ON jobs FOR SELECT TO anon
    USING (status = 'published' AND deleted_at IS NULL);

CREATE POLICY "jobs_insert"
    ON jobs FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "jobs_update"
    ON jobs FOR UPDATE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    )
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "jobs_delete_admin"
    ON jobs FOR DELETE TO authenticated
    USING (public.user_role(organization_id) = 'admin');

-- --------------------------------------------------------------------------
-- 5.4 pipeline_stages
-- --------------------------------------------------------------------------

CREATE POLICY "pipeline_stages_select"
    ON pipeline_stages FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "pipeline_stages_insert"
    ON pipeline_stages FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "pipeline_stages_update"
    ON pipeline_stages FOR UPDATE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    )
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "pipeline_stages_delete"
    ON pipeline_stages FOR DELETE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

-- --------------------------------------------------------------------------
-- 5.5 candidates
-- --------------------------------------------------------------------------

CREATE POLICY "candidates_select"
    ON candidates FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "candidates_insert"
    ON candidates FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "candidates_insert_public"
    ON candidates FOR INSERT TO anon
    WITH CHECK (true);

CREATE POLICY "candidates_update"
    ON candidates FOR UPDATE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    )
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "candidates_delete_admin"
    ON candidates FOR DELETE TO authenticated
    USING (public.user_role(organization_id) = 'admin');

-- --------------------------------------------------------------------------
-- 5.6 applications
-- --------------------------------------------------------------------------

CREATE POLICY "applications_select"
    ON applications FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "applications_insert"
    ON applications FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "applications_insert_public"
    ON applications FOR INSERT TO anon
    WITH CHECK (true);

CREATE POLICY "applications_update"
    ON applications FOR UPDATE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    )
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "applications_delete_admin"
    ON applications FOR DELETE TO authenticated
    USING (public.user_role(organization_id) = 'admin');

-- --------------------------------------------------------------------------
-- 5.7 stage_movements (immutable audit trail - no UPDATE/DELETE)
-- --------------------------------------------------------------------------

CREATE POLICY "stage_movements_select"
    ON stage_movements FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "stage_movements_insert"
    ON stage_movements FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

-- --------------------------------------------------------------------------
-- 5.8 interviews
-- --------------------------------------------------------------------------

CREATE POLICY "interviews_select"
    ON interviews FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "interviews_insert"
    ON interviews FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "interviews_update"
    ON interviews FOR UPDATE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    )
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "interviews_delete_admin"
    ON interviews FOR DELETE TO authenticated
    USING (public.user_role(organization_id) = 'admin');

-- --------------------------------------------------------------------------
-- 5.9 interview_panelists
-- --------------------------------------------------------------------------

CREATE POLICY "panelists_select"
    ON interview_panelists FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "panelists_insert"
    ON interview_panelists FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

-- Any org member can update panelist status (accept/decline their own invitation).
CREATE POLICY "panelists_update"
    ON interview_panelists FOR UPDATE TO authenticated
    USING (organization_id = ANY(public.user_org_ids()))
    WITH CHECK (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "panelists_delete"
    ON interview_panelists FOR DELETE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

-- --------------------------------------------------------------------------
-- 5.10 interview_feedback
-- --------------------------------------------------------------------------

CREATE POLICY "feedback_select"
    ON interview_feedback FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

-- Any org member can submit their own feedback.
CREATE POLICY "feedback_insert"
    ON interview_feedback FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND user_id = auth.uid()
    );

-- Users update own feedback; admins update any.
CREATE POLICY "feedback_update_own"
    ON interview_feedback FOR UPDATE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND (user_id = auth.uid() OR public.user_role(organization_id) = 'admin')
    )
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND (user_id = auth.uid() OR public.user_role(organization_id) = 'admin')
    );

CREATE POLICY "feedback_delete_admin"
    ON interview_feedback FOR DELETE TO authenticated
    USING (public.user_role(organization_id) = 'admin');

-- --------------------------------------------------------------------------
-- 5.11 scorecard_criteria
-- --------------------------------------------------------------------------

CREATE POLICY "scorecard_criteria_select"
    ON scorecard_criteria FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "scorecard_criteria_insert"
    ON scorecard_criteria FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "scorecard_criteria_update"
    ON scorecard_criteria FOR UPDATE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "scorecard_criteria_delete"
    ON scorecard_criteria FOR DELETE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

-- --------------------------------------------------------------------------
-- 5.12 scorecard_ratings
-- --------------------------------------------------------------------------

CREATE POLICY "scorecard_ratings_select"
    ON scorecard_ratings FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "scorecard_ratings_insert"
    ON scorecard_ratings FOR INSERT TO authenticated
    WITH CHECK (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "scorecard_ratings_update"
    ON scorecard_ratings FOR UPDATE TO authenticated
    USING (organization_id = ANY(public.user_org_ids()))
    WITH CHECK (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "scorecard_ratings_delete"
    ON scorecard_ratings FOR DELETE TO authenticated
    USING (public.user_role(organization_id) = 'admin');

-- --------------------------------------------------------------------------
-- 5.13 email_templates
-- --------------------------------------------------------------------------

CREATE POLICY "email_templates_select"
    ON email_templates FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "email_templates_insert"
    ON email_templates FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "email_templates_update"
    ON email_templates FOR UPDATE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    )
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "email_templates_delete"
    ON email_templates FOR DELETE TO authenticated
    USING (public.user_role(organization_id) = 'admin');

-- --------------------------------------------------------------------------
-- 5.14 email_logs (immutable - no UPDATE/DELETE)
-- --------------------------------------------------------------------------

CREATE POLICY "email_logs_select"
    ON email_logs FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "email_logs_insert"
    ON email_logs FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

-- --------------------------------------------------------------------------
-- 5.15 offer_letters
-- --------------------------------------------------------------------------

CREATE POLICY "offers_select"
    ON offer_letters FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "offers_insert"
    ON offer_letters FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "offers_update"
    ON offer_letters FOR UPDATE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    )
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter')
    );

CREATE POLICY "offers_delete_admin"
    ON offer_letters FOR DELETE TO authenticated
    USING (public.user_role(organization_id) = 'admin');

-- --------------------------------------------------------------------------
-- 5.16 activity_logs (immutable - no UPDATE/DELETE)
-- --------------------------------------------------------------------------

CREATE POLICY "activity_logs_select"
    ON activity_logs FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "activity_logs_insert"
    ON activity_logs FOR INSERT TO authenticated
    WITH CHECK (organization_id = ANY(public.user_org_ids()));

-- --------------------------------------------------------------------------
-- 5.17 google_oauth_tokens (user-scoped)
-- --------------------------------------------------------------------------

CREATE POLICY "oauth_select_own"
    ON google_oauth_tokens FOR SELECT TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "oauth_insert_own"
    ON google_oauth_tokens FOR INSERT TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND organization_id = ANY(public.user_org_ids())
    );

CREATE POLICY "oauth_update_own"
    ON google_oauth_tokens FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "oauth_delete_own"
    ON google_oauth_tokens FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- 5.18 comments
-- --------------------------------------------------------------------------

-- Private comments visible only to admins, recruiters, and the author.
CREATE POLICY "comments_select"
    ON comments FOR SELECT TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND (
            is_private = false
            OR user_id = auth.uid()
            OR public.user_role(organization_id) IN ('admin', 'recruiter')
        )
    );

CREATE POLICY "comments_insert"
    ON comments FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND user_id = auth.uid()
    );

CREATE POLICY "comments_update"
    ON comments FOR UPDATE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND (user_id = auth.uid() OR public.user_role(organization_id) = 'admin')
    )
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND (user_id = auth.uid() OR public.user_role(organization_id) = 'admin')
    );

CREATE POLICY "comments_delete"
    ON comments FOR DELETE TO authenticated
    USING (
        organization_id = ANY(public.user_org_ids())
        AND (user_id = auth.uid() OR public.user_role(organization_id) = 'admin')
    );


-- ============================================================================
-- 6. GRANTS
-- ============================================================================
-- Supabase requires table-level grants so that RLS policies can take effect.
-- Without these grants, the roles have no table access at all.
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Anonymous access for public careers page
GRANT SELECT ON organizations TO anon;
GRANT SELECT ON jobs TO anon;
GRANT INSERT ON candidates TO anon;
GRANT INSERT ON applications TO anon;

-- Authenticated users get full table access (RLS enforces row-level rules)
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION public.user_org_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_activity(uuid, text, uuid, text, jsonb) TO authenticated;


-- ============================================================================
-- 7. OBJECT COMMENTS (documentation)
-- ============================================================================
COMMENT ON TABLE organizations IS 'Tenant organizations. Each org is an isolated workspace.';
COMMENT ON TABLE organization_members IS 'Maps users to organizations with role-based access (admin, recruiter, hiring_manager).';
COMMENT ON TABLE jobs IS 'Job postings within an organization. Supports soft delete via deleted_at.';
COMMENT ON TABLE pipeline_stages IS 'Customizable hiring pipeline stages per job. Defaults auto-created via trigger.';
COMMENT ON TABLE candidates IS 'Candidate profiles, unique per org by email. Supports soft delete and GDPR consent tracking.';
COMMENT ON TABLE applications IS 'Links candidates to jobs with pipeline stage tracking. One application per candidate per job.';
COMMENT ON TABLE stage_movements IS 'Immutable audit trail of application stage transitions.';
COMMENT ON TABLE interviews IS 'Scheduled interviews with Google Calendar integration support.';
COMMENT ON TABLE interview_panelists IS 'Interview panel members with acceptance tracking.';
COMMENT ON TABLE interview_feedback IS 'Structured feedback from interviewers with overall rating and recommendation.';
COMMENT ON TABLE scorecard_criteria IS 'Custom evaluation criteria per job for structured interview scorecards.';
COMMENT ON TABLE scorecard_ratings IS 'Per-criteria ratings linked to interview feedback entries.';
COMMENT ON TABLE email_templates IS 'Reusable email templates with variable substitution support.';
COMMENT ON TABLE email_logs IS 'Immutable log of all emails sent to candidates.';
COMMENT ON TABLE offer_letters IS 'Offer letter management with full lifecycle tracking (draft to accepted/declined).';
COMMENT ON TABLE activity_logs IS 'Immutable audit log of all significant user actions.';
COMMENT ON TABLE google_oauth_tokens IS 'OAuth tokens for Google Calendar and Gmail integration. User-scoped.';
COMMENT ON TABLE comments IS 'Threaded comments on applications, candidates, and interviews. Supports private comments and soft delete.';

COMMENT ON FUNCTION public.user_org_ids() IS 'Returns array of org IDs the current user belongs to (only joined members).';
COMMENT ON FUNCTION public.user_role(uuid) IS 'Returns the role of the current user in the specified organization, or NULL if not a member.';
COMMENT ON FUNCTION public.set_updated_at() IS 'Trigger function: auto-sets updated_at to now() on row update.';
COMMENT ON FUNCTION public.create_default_pipeline_stages() IS 'Trigger function: creates 7 default pipeline stages when a new job is inserted.';
COMMENT ON FUNCTION public.set_application_initial_stage() IS 'Trigger function: assigns the first pipeline stage (by display_order) to new applications.';
COMMENT ON FUNCTION public.record_stage_movement() IS 'Trigger function: inserts a stage_movements audit record when application stage changes.';
COMMENT ON FUNCTION public.log_activity(uuid, text, uuid, text, jsonb) IS 'Utility function: inserts an activity log entry for the current user.';
