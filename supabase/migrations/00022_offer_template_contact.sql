-- 00022_offer_template_contact.sql
-- Add company contact/address fields to offer_templates for PDF header/footer

ALTER TABLE offer_templates
  ADD COLUMN IF NOT EXISTS company_phone   TEXT,
  ADD COLUMN IF NOT EXISTS company_email   TEXT,
  ADD COLUMN IF NOT EXISTS company_website TEXT,
  ADD COLUMN IF NOT EXISTS company_address TEXT;
restart 




