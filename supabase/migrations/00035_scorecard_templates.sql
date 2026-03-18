-- ============================================================================
-- Scorecard Templates System
-- Reusable evaluation scorecards that can be linked to interviews
-- ============================================================================

-- Scorecard templates (org-scoped)
CREATE TABLE scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scorecards_org ON scorecards(organization_id);

-- Criteria per scorecard template
CREATE TABLE scorecard_template_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scorecard_id UUID NOT NULL REFERENCES scorecards(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  weight INTEGER DEFAULT 1 CHECK (weight >= 1 AND weight <= 10),
  rating_type TEXT NOT NULL DEFAULT 'rating' CHECK (rating_type IN ('rating', 'yes_no', 'text')),
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_scorecard_template_criteria_scorecard ON scorecard_template_criteria(scorecard_id);

-- Link interviews to scorecards
ALTER TABLE interviews ADD COLUMN scorecard_id UUID REFERENCES scorecards(id) ON DELETE SET NULL;

-- Add rating_type support to scorecard_ratings (for yes/no and text responses)
ALTER TABLE scorecard_ratings ADD COLUMN rating_type TEXT DEFAULT 'rating';
ALTER TABLE scorecard_ratings ADD COLUMN text_value TEXT;
ALTER TABLE scorecard_ratings ALTER COLUMN rating DROP NOT NULL;

-- RLS for scorecards
ALTER TABLE scorecards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view scorecards"
  ON scorecards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = scorecards.organization_id
        AND om.user_id = auth.uid()
        AND om.deleted_at IS NULL
    )
  );

CREATE POLICY "Admins can manage scorecards"
  ON scorecards FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = scorecards.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
        AND om.deleted_at IS NULL
    )
  );

-- RLS for scorecard_template_criteria
ALTER TABLE scorecard_template_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view scorecard template criteria"
  ON scorecard_template_criteria FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = scorecard_template_criteria.organization_id
        AND om.user_id = auth.uid()
        AND om.deleted_at IS NULL
    )
  );

CREATE POLICY "Admins can manage scorecard template criteria"
  ON scorecard_template_criteria FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = scorecard_template_criteria.organization_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
        AND om.deleted_at IS NULL
    )
  );

-- Grant access
GRANT ALL ON scorecards TO authenticated;
GRANT ALL ON scorecard_template_criteria TO authenticated;
