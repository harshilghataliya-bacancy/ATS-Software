-- Fix: offer_templates table was created in 00015 without GRANT
-- The initial 00001 migration has GRANT ALL ON ALL TABLES but only covers tables that existed at that time.
GRANT ALL ON offer_templates TO authenticated;
GRANT ALL ON offer_templates TO service_role;
