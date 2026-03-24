-- Store the previous stage before rejection for rollback support
ALTER TABLE applications ADD COLUMN IF NOT EXISTS previous_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL;
