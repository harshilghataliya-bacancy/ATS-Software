-- Add title column to interviews table for interview name
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS title text;
