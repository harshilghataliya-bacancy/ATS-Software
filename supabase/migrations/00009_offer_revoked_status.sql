-- Add 'revoked' status to offer_status enum
ALTER TYPE offer_status ADD VALUE IF NOT EXISTS 'revoked';
ad