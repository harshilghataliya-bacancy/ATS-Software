-- ============================================================================
-- HireFlow ATS - Full Database Reset
-- Deletes ALL data from all tables AND all auth.users
-- Order: leaf tables first → root tables last (respects FK constraints)
-- ============================================================================

BEGIN;

-- -----------------------------------------------------------------------
-- Tier 8: Deepest dependencies
-- -----------------------------------------------------------------------
TRUNCATE TABLE scorecard_ratings CASCADE;
TRUNCATE TABLE assessment_invitations CASCADE;

-- -----------------------------------------------------------------------
-- Tier 7: Interview sub-tables
-- -----------------------------------------------------------------------
TRUNCATE TABLE interview_feedback CASCADE;
TRUNCATE TABLE interview_panelists CASCADE;

-- -----------------------------------------------------------------------
-- Tier 6: Interviews
-- -----------------------------------------------------------------------
TRUNCATE TABLE interviews CASCADE;

-- -----------------------------------------------------------------------
-- Tier 5: Application & Candidate sub-tables
-- -----------------------------------------------------------------------
TRUNCATE TABLE stage_movements CASCADE;
TRUNCATE TABLE candidate_match_scores CASCADE;
TRUNCATE TABLE email_logs CASCADE;
TRUNCATE TABLE offer_letters CASCADE;
TRUNCATE TABLE whatsapp_messages CASCADE;

-- -----------------------------------------------------------------------
-- Tier 4: Applications
-- -----------------------------------------------------------------------
TRUNCATE TABLE applications CASCADE;

-- -----------------------------------------------------------------------
-- Tier 3: Job & Candidate sub-tables
-- -----------------------------------------------------------------------
TRUNCATE TABLE pipeline_stages CASCADE;
TRUNCATE TABLE scorecard_criteria CASCADE;
TRUNCATE TABLE candidates CASCADE;

-- -----------------------------------------------------------------------
-- Tier 2: Jobs
-- -----------------------------------------------------------------------
TRUNCATE TABLE jobs CASCADE;

-- -----------------------------------------------------------------------
-- Tier 1: Org sub-tables
-- -----------------------------------------------------------------------
TRUNCATE TABLE comments CASCADE;
TRUNCATE TABLE activity_logs CASCADE;
TRUNCATE TABLE google_oauth_tokens CASCADE;
TRUNCATE TABLE email_templates CASCADE;
TRUNCATE TABLE offer_templates CASCADE;
TRUNCATE TABLE ai_scoring_config CASCADE;
TRUNCATE TABLE testgorilla_config CASCADE;
TRUNCATE TABLE whatsapp_config CASCADE;
TRUNCATE TABLE organization_branding CASCADE;
TRUNCATE TABLE organization_subdomains CASCADE;
TRUNCATE TABLE organization_domains CASCADE;

-- -----------------------------------------------------------------------
-- Tier 0: Org & Members
-- -----------------------------------------------------------------------
TRUNCATE TABLE organization_members CASCADE;
TRUNCATE TABLE organizations CASCADE;

-- -----------------------------------------------------------------------
-- Delete all Supabase Auth users
-- (requires service_role key — run via Supabase SQL editor or admin client)
-- -----------------------------------------------------------------------
DELETE FROM auth.users;

COMMIT;
