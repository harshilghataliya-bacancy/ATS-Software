-- Add display_name column to google_oauth_tokens to store the Gmail sender display name
ALTER TABLE google_oauth_tokens ADD COLUMN IF NOT EXISTS display_name text;

-- Clear all existing OAuth tokens to force fresh reconnection
TRUNCATE google_oauth_tokens;
