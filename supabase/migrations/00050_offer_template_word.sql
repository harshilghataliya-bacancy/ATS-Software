-- Offer Letter Word Template Support
-- Adds columns to offer_templates so admins can upload a .docx file and edit it
-- as rich-text HTML, alongside the existing form-based templates.

ALTER TABLE offer_templates
  ADD COLUMN IF NOT EXISTS template_source TEXT NOT NULL DEFAULT 'manual'
    CHECK (template_source IN ('manual', 'word')),
  ADD COLUMN IF NOT EXISTS docx_content_html TEXT,
  ADD COLUMN IF NOT EXISTS docx_storage_path TEXT;

-- Storage bucket for original uploaded .docx files. Private — access is mediated
-- by the service role via the API, not by public URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('offer-templates', 'offer-templates', false)
ON CONFLICT (id) DO NOTHING;
