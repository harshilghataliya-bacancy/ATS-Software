-- Feature 1: Secure token for candidate-facing accept/decline links
ALTER TABLE offer_letters ADD COLUMN response_token UUID UNIQUE;
CREATE INDEX idx_offer_letters_response_token ON offer_letters(response_token) WHERE response_token IS NOT NULL;

-- Feature 2: Configurable reapply restriction period (months)
ALTER TABLE organizations ADD COLUMN offer_reapply_restriction_months INTEGER DEFAULT 6;

-- Feature 4: Offer PDF templates (admin-managed)
CREATE TABLE offer_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  logo_url TEXT,
  company_name TEXT,
  terms_and_conditions TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE offer_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offer_templates_select" ON offer_templates FOR SELECT TO authenticated
  USING (organization_id = ANY(public.user_org_ids()));
CREATE POLICY "offer_templates_modify" ON offer_templates FOR ALL TO authenticated
  USING (organization_id = ANY(public.user_org_ids()))
  WITH CHECK (organization_id = ANY(public.user_org_ids()) AND public.user_role(organization_id) IN ('admin'));
