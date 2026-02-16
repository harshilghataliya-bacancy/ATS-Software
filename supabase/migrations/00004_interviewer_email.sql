-- Add interviewer_email column to interviews table
-- This stores the interviewer's email entered during scheduling,
-- so it can be displayed even if the interviewer is not an org member.

ALTER TABLE interviews ADD COLUMN IF NOT EXISTS interviewer_email text;
