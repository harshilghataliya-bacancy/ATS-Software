-- Add custom_variables JSONB column to offer_templates
ALTER TABLE offer_templates ADD COLUMN IF NOT EXISTS custom_variables jsonb DEFAULT NULL;
