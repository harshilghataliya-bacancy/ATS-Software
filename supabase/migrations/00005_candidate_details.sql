-- Add additional detail columns to candidates table (Keka-like fields)
ALTER TABLE candidates
    ADD COLUMN IF NOT EXISTS current_salary    numeric,
    ADD COLUMN IF NOT EXISTS expected_salary   numeric,
    ADD COLUMN IF NOT EXISTS education         text,
    ADD COLUMN IF NOT EXISTS experience_years  numeric,
    ADD COLUMN IF NOT EXISTS notice_period     text,
    ADD COLUMN IF NOT EXISTS cover_letter      text,
    ADD COLUMN IF NOT EXISTS date_of_birth     date,
    ADD COLUMN IF NOT EXISTS gender            text;
