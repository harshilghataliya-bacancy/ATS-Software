-- Candidate Banks (similar to Keka's Candidate Pools)
-- Default bank auto-contains all non-rejected candidates
-- Custom banks let recruiters organize candidates by skill/category

CREATE TABLE IF NOT EXISTS candidate_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Junction table: which candidates are in which custom bank
CREATE TABLE IF NOT EXISTS candidate_bank_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES candidate_banks(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bank_id, candidate_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_candidate_banks_org ON candidate_banks(organization_id);
CREATE INDEX IF NOT EXISTS idx_candidate_bank_members_bank ON candidate_bank_members(bank_id);
CREATE INDEX IF NOT EXISTS idx_candidate_bank_members_candidate ON candidate_bank_members(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_bank_members_org ON candidate_bank_members(organization_id);

-- Only one default bank per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_banks_default ON candidate_banks(organization_id) WHERE is_default = true;

-- Enable RLS
ALTER TABLE candidate_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_bank_members ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Org members can view banks"
  ON candidate_banks FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

CREATE POLICY "Org members can manage banks"
  ON candidate_banks FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND deleted_at IS NULL AND role IN ('admin', 'recruiter', 'hiring_manager')
  ));

CREATE POLICY "Org members can view bank members"
  ON candidate_bank_members FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));

CREATE POLICY "Org members can manage bank members"
  ON candidate_bank_members FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND deleted_at IS NULL AND role IN ('admin', 'recruiter', 'hiring_manager')
  ));
