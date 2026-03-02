-- =============================================================================
-- TestGorilla Assessment Integration
-- =============================================================================

-- 1. TestGorilla configuration (one per org)
CREATE TABLE IF NOT EXISTS testgorilla_config (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    api_key         text NOT NULL,
    is_enabled      boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT testgorilla_config_org_unique UNIQUE (organization_id)
);

-- 2. Add testgorilla_assessment_id to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS testgorilla_assessment_id text;

-- 3. Assessment invitation status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assessment_invitation_status') THEN
        CREATE TYPE assessment_invitation_status AS ENUM ('invited','started','completed','expired');
    END IF;
END
$$;

-- 4. Assessment invitations table (tracks invites + results)
CREATE TABLE IF NOT EXISTS assessment_invitations (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    application_id              uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    candidate_id                uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    job_id                      uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    testgorilla_assessment_id   text NOT NULL,
    testgorilla_test_taker_id   text,
    testgorilla_candidature_id  text,
    status                      assessment_invitation_status NOT NULL DEFAULT 'invited',
    score                       numeric,
    results_data                jsonb DEFAULT '{}',
    invited_at                  timestamptz NOT NULL DEFAULT now(),
    completed_at                timestamptz,
    invited_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT assessment_invitation_app_unique UNIQUE (application_id)
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_assessment_invitations_org ON assessment_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_assessment_invitations_job ON assessment_invitations(job_id);
CREATE INDEX IF NOT EXISTS idx_assessment_invitations_candidate ON assessment_invitations(candidate_id);
CREATE INDEX IF NOT EXISTS idx_assessment_invitations_status ON assessment_invitations(status);
CREATE INDEX IF NOT EXISTS idx_testgorilla_config_org ON testgorilla_config(organization_id);

-- 6. Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_testgorilla_config_updated_at ON testgorilla_config;
CREATE TRIGGER set_testgorilla_config_updated_at
    BEFORE UPDATE ON testgorilla_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_assessment_invitations_updated_at ON assessment_invitations;
CREATE TRIGGER set_assessment_invitations_updated_at
    BEFORE UPDATE ON assessment_invitations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. RLS
ALTER TABLE testgorilla_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_invitations ENABLE ROW LEVEL SECURITY;

-- testgorilla_config: org members can SELECT, admins can INSERT/UPDATE/DELETE
CREATE POLICY testgorilla_config_select ON testgorilla_config
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );

CREATE POLICY testgorilla_config_insert ON testgorilla_config
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND role = 'admin' AND deleted_at IS NULL
        )
    );

CREATE POLICY testgorilla_config_update ON testgorilla_config
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND role = 'admin' AND deleted_at IS NULL
        )
    );

CREATE POLICY testgorilla_config_delete ON testgorilla_config
    FOR DELETE USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND role = 'admin' AND deleted_at IS NULL
        )
    );

-- assessment_invitations: org members can SELECT, admin/recruiter/hiring_manager can INSERT/UPDATE
CREATE POLICY assessment_invitations_select ON assessment_invitations
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND deleted_at IS NULL
        )
    );

CREATE POLICY assessment_invitations_insert ON assessment_invitations
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND role IN ('admin', 'recruiter', 'hiring_manager') AND deleted_at IS NULL
        )
    );

CREATE POLICY assessment_invitations_update ON assessment_invitations
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND role IN ('admin', 'recruiter', 'hiring_manager') AND deleted_at IS NULL
        )
    );

-- 8. Grant access
GRANT ALL ON testgorilla_config TO authenticated;
GRANT ALL ON assessment_invitations TO authenticated;
GRANT ALL ON testgorilla_config TO service_role;
GRANT ALL ON assessment_invitations TO service_role;
