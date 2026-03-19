-- Interview locations managed by admins for face-to-face interview scheduling
CREATE TABLE interview_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, name)
);

ALTER TABLE interview_locations ENABLE ROW LEVEL SECURITY;

GRANT ALL ON interview_locations TO authenticated;
GRANT ALL ON interview_locations TO service_role;
GRANT ALL ON interview_locations TO anon;

CREATE POLICY "Org members can view interview locations"
  ON interview_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = interview_locations.organization_id
        AND om.user_id = auth.uid()
        AND om.deleted_at IS NULL
    )
  );

CREATE POLICY "Admins can manage interview locations"
  ON interview_locations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = interview_locations.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
        AND om.deleted_at IS NULL
    )
  );
