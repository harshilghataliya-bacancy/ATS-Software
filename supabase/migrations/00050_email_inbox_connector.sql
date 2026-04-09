-- Email Inbox Connector: auto-import candidates from Gmail inbox
-- =========================================================================

-- 1. Config table (per-org settings)
CREATE TABLE IF NOT EXISTS inbox_sync_config (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  enabled           boolean NOT NULL DEFAULT false,
  scan_label        text DEFAULT 'INBOX',
  auto_parse_resume boolean NOT NULL DEFAULT true,
  source_tag        text DEFAULT 'email-inbox',
  last_synced_at    timestamptz,
  last_history_id   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 2. Sync log table (tracks processed emails)
CREATE TABLE IF NOT EXISTS inbox_sync_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  gmail_message_id  text NOT NULL,
  gmail_thread_id   text,
  from_email        text NOT NULL,
  from_name         text,
  subject           text,
  received_at       timestamptz,
  candidate_id      uuid REFERENCES candidates(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'processed',
  error_message     text,
  attachments_found integer DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, gmail_message_id)
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_inbox_sync_log_org ON inbox_sync_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_inbox_sync_log_from ON inbox_sync_log(organization_id, from_email);

-- 4. RLS
ALTER TABLE inbox_sync_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY inbox_sync_config_select ON inbox_sync_config
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY inbox_sync_config_update ON inbox_sync_config
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'admin' AND deleted_at IS NULL
    )
  );

CREATE POLICY inbox_sync_config_insert ON inbox_sync_config
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'admin' AND deleted_at IS NULL
    )
  );

CREATE POLICY inbox_sync_log_select ON inbox_sync_log
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE POLICY inbox_sync_log_insert ON inbox_sync_log
  FOR INSERT WITH CHECK (true);

-- 5. Grants
GRANT SELECT, INSERT, UPDATE ON inbox_sync_config TO authenticated, service_role;
GRANT SELECT, INSERT ON inbox_sync_log TO authenticated, service_role;
