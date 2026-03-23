-- Interviewer Availability Slots
CREATE TABLE interviewer_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT availability_time_valid CHECK (start_time < end_time)
);

-- Index for fast lookups
CREATE INDEX idx_availability_user_date ON interviewer_availability(user_id, date);
CREATE INDEX idx_availability_org_date ON interviewer_availability(organization_id, date);

-- RLS
ALTER TABLE interviewer_availability ENABLE ROW LEVEL SECURITY;

-- All org members can view availability
CREATE POLICY "Org members can view availability" ON interviewer_availability
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = interviewer_availability.organization_id
        AND om.user_id = auth.uid()
        AND om.deleted_at IS NULL
    )
  );

-- Users can insert their own availability
CREATE POLICY "Users can insert own availability" ON interviewer_availability
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = interviewer_availability.organization_id
        AND om.user_id = auth.uid()
        AND om.deleted_at IS NULL
    )
  );

-- Users can update their own, admins can update any
CREATE POLICY "Users can update own availability" ON interviewer_availability
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = interviewer_availability.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
        AND om.deleted_at IS NULL
    )
  );

-- Users can delete their own, admins can delete any
CREATE POLICY "Users can delete own availability" ON interviewer_availability
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = interviewer_availability.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
        AND om.deleted_at IS NULL
    )
  );

-- Auto-update updated_at
CREATE TRIGGER set_interviewer_availability_updated_at
  BEFORE UPDATE ON interviewer_availability
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant access to service_role and authenticated users
GRANT ALL ON interviewer_availability TO service_role;
GRANT ALL ON interviewer_availability TO authenticated;
