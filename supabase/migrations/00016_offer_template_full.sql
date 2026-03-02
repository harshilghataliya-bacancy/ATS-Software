-- 00016_offer_template_full.sql
-- Expand offer_templates with full Keka-style customization:
-- branding, PDF content sections, signature, section toggles, footer, email customization.

ALTER TABLE offer_templates
  -- Branding
  ADD COLUMN primary_color TEXT DEFAULT '#1e3a5f',
  ADD COLUMN accent_color TEXT DEFAULT '#2563eb',
  ADD COLUMN header_subtitle TEXT DEFAULT 'Confidential',
  -- PDF Content Sections
  ADD COLUMN greeting_text TEXT,
  ADD COLUMN intro_text TEXT,
  ADD COLUMN closing_text TEXT,
  ADD COLUMN validity_text TEXT,
  ADD COLUMN acceptance_text TEXT,
  -- Signature
  ADD COLUMN signatory_name TEXT,
  ADD COLUMN signatory_title TEXT,
  ADD COLUMN signatory_label TEXT DEFAULT 'Authorized Signatory',
  ADD COLUMN candidate_sig_label TEXT DEFAULT 'Acceptance by Candidate',
  -- Section toggles
  ADD COLUMN show_salary_breakdown BOOLEAN DEFAULT true,
  ADD COLUMN show_bonus_section BOOLEAN DEFAULT true,
  ADD COLUMN show_terms_section BOOLEAN DEFAULT true,
  ADD COLUMN show_acceptance_section BOOLEAN DEFAULT true,
  ADD COLUMN show_signature_block BOOLEAN DEFAULT true,
  -- Footer
  ADD COLUMN footer_text TEXT,
  -- Email customization
  ADD COLUMN email_subject TEXT,
  ADD COLUMN email_body TEXT;
