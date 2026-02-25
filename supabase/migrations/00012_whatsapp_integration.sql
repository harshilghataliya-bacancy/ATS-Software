-- ============================================================================
-- WhatsApp Integration (Twilio)
-- ============================================================================

-- 1. whatsapp_config (org-wide Twilio credentials, one row per org)
-- ============================================================================

CREATE TABLE whatsapp_config (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    account_sid     text NOT NULL,
    auth_token      text NOT NULL,
    whatsapp_number text NOT NULL,
    is_sandbox      boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT whatsapp_config_org_unique UNIQUE (organization_id)
);

CREATE INDEX idx_whatsapp_config_org ON whatsapp_config(organization_id);

CREATE TRIGGER trg_whatsapp_config_updated_at
    BEFORE UPDATE ON whatsapp_config
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. whatsapp_messages (conversation log)
-- ============================================================================

CREATE TYPE whatsapp_message_direction AS ENUM ('outbound', 'inbound');
CREATE TYPE whatsapp_message_status AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');

CREATE TABLE whatsapp_messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    candidate_id    uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    application_id  uuid REFERENCES applications(id) ON DELETE SET NULL,
    from_number     text NOT NULL,
    to_number       text NOT NULL,
    message_body    text NOT NULL,
    direction       whatsapp_message_direction NOT NULL DEFAULT 'outbound',
    twilio_message_sid text,
    status          whatsapp_message_status NOT NULL DEFAULT 'queued',
    sent_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    error_message   text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_messages_org ON whatsapp_messages(organization_id);
CREATE INDEX idx_wa_messages_candidate ON whatsapp_messages(candidate_id);
CREATE INDEX idx_wa_messages_application ON whatsapp_messages(application_id);
CREATE INDEX idx_wa_messages_created ON whatsapp_messages(organization_id, candidate_id, created_at DESC);

-- 3. RLS
-- ============================================================================

ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- whatsapp_config: org members can read (to check status), admin-only write
CREATE POLICY "wa_config_select"
    ON whatsapp_config FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "wa_config_insert_admin"
    ON whatsapp_config FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) = 'admin'
    );

CREATE POLICY "wa_config_update_admin"
    ON whatsapp_config FOR UPDATE TO authenticated
    USING (public.user_role(organization_id) = 'admin')
    WITH CHECK (public.user_role(organization_id) = 'admin');

CREATE POLICY "wa_config_delete_admin"
    ON whatsapp_config FOR DELETE TO authenticated
    USING (public.user_role(organization_id) = 'admin');

-- whatsapp_messages: org members can read, non-interviewers can insert
CREATE POLICY "wa_messages_select"
    ON whatsapp_messages FOR SELECT TO authenticated
    USING (organization_id = ANY(public.user_org_ids()));

CREATE POLICY "wa_messages_insert"
    ON whatsapp_messages FOR INSERT TO authenticated
    WITH CHECK (
        organization_id = ANY(public.user_org_ids())
        AND public.user_role(organization_id) IN ('admin', 'recruiter', 'hiring_manager')
    );

-- 4. Grants
-- ============================================================================

GRANT ALL ON whatsapp_config TO authenticated, service_role;
GRANT ALL ON whatsapp_messages TO authenticated, service_role;
