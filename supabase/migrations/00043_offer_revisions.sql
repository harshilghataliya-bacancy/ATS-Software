-- Add offer revision columns
ALTER TABLE offer_letters
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_offer_id uuid REFERENCES offer_letters(id),
  ADD COLUMN IF NOT EXISTS revised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for efficient version history queries
CREATE INDEX IF NOT EXISTS idx_offer_letters_parent ON offer_letters(parent_offer_id) WHERE parent_offer_id IS NOT NULL;

-- RLS: inherit from existing offer_letters policies (same org-scoped access)
