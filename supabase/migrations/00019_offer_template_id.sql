-- Add offer_template_id to offer_letters so the send route can use the selected template
ALTER TABLE offer_letters
  ADD COLUMN IF NOT EXISTS offer_template_id uuid REFERENCES offer_templates(id) ON DELETE SET NULL;
