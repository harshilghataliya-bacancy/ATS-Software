-- Add extra job fields: experience level, openings, deadline, remote policy,
-- skills, benefits, nice-to-have, education level, experience range, priority

ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS experience_level      text,
    ADD COLUMN IF NOT EXISTS num_openings           integer DEFAULT 1,
    ADD COLUMN IF NOT EXISTS application_deadline   date,
    ADD COLUMN IF NOT EXISTS remote_policy          text DEFAULT 'on_site',
    ADD COLUMN IF NOT EXISTS skills                 text[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS benefits               text,
    ADD COLUMN IF NOT EXISTS nice_to_have           text,
    ADD COLUMN IF NOT EXISTS education_level        text,
    ADD COLUMN IF NOT EXISTS experience_min         numeric,
    ADD COLUMN IF NOT EXISTS experience_max         numeric,
    ADD COLUMN IF NOT EXISTS priority               text DEFAULT 'medium';
