-- Extends Word template support to store header/footer HTML plus an optional
-- full-page background image URL (for templates that use a single letterhead
-- image anchored behind all content as the "header").
--
-- page_background_url holds a base64 data URL or a storage path pointing to the
-- extracted background image. We store it directly so the preview can apply it
-- as a CSS background on the A4 page without another round-trip.

ALTER TABLE offer_templates
  ADD COLUMN IF NOT EXISTS docx_header_html TEXT,
  ADD COLUMN IF NOT EXISTS docx_footer_html TEXT,
  ADD COLUMN IF NOT EXISTS docx_page_background_url TEXT;
