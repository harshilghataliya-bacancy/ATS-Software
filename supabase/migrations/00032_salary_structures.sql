-- Salary Structures: org-scoped configurable salary breakdown templates
-- Replaces the hardcoded SALARY_STRUCTURE_CONFIG constant

CREATE TABLE salary_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_default boolean DEFAULT false,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- RLS
ALTER TABLE salary_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view salary structures"
  ON salary_structures FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

CREATE POLICY "Org members can manage salary structures"
  ON salary_structures FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

GRANT ALL ON salary_structures TO authenticated;

CREATE INDEX idx_salary_structures_org ON salary_structures(organization_id) WHERE deleted_at IS NULL;

-- Add salary_structure_id reference to offer_letters
ALTER TABLE offer_letters
  ADD COLUMN IF NOT EXISTS salary_structure_id uuid REFERENCES salary_structures(id);
