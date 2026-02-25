-- Add salary structure fields to offer_letters
ALTER TABLE offer_letters
  ADD COLUMN IF NOT EXISTS salary_components jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reporting_manager text,
  ADD COLUMN IF NOT EXISTS employment_type text DEFAULT 'full_time',
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS remuneration_type text DEFAULT 'annual',
  ADD COLUMN IF NOT EXISTS bonus_components jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pf_applicable boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS work_type text DEFAULT 'on_site',
  ADD COLUMN IF NOT EXISTS business_unit text;
