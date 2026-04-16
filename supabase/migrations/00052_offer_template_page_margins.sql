-- Add page_margins column to store Word document's actual page margins
ALTER TABLE offer_templates
  ADD COLUMN IF NOT EXISTS docx_page_margins jsonb DEFAULT NULL;

COMMENT ON COLUMN offer_templates.docx_page_margins IS 'Page margins from Word document sectPr (top/bottom/left/right/header/footer in mm)';
