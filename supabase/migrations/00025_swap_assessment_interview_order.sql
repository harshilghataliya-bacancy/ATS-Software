-- Swap display_order for Assessment (currently 4) and Interview (currently 3)
-- New order: Applied(1), Screening(2), Assessment(3), Interview(4), Offer(5), Hired(6), Rejected(7)

-- Swap for all existing jobs
UPDATE pipeline_stages SET display_order = 3 WHERE stage_type = 'assessment';
UPDATE pipeline_stages SET display_order = 4 WHERE stage_type = 'interview';

-- Update the trigger function for new jobs
CREATE OR REPLACE FUNCTION public.create_default_pipeline_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO pipeline_stages (id, job_id, organization_id, name, display_order, is_default, stage_type)
    VALUES
        (gen_random_uuid(), NEW.id, NEW.organization_id, 'Applied',     1, true, 'applied'),
        (gen_random_uuid(), NEW.id, NEW.organization_id, 'Screening',   2, true, 'screening'),
        (gen_random_uuid(), NEW.id, NEW.organization_id, 'Assessment',  3, true, 'assessment'),
        (gen_random_uuid(), NEW.id, NEW.organization_id, 'Interview',   4, true, 'interview'),
        (gen_random_uuid(), NEW.id, NEW.organization_id, 'Offer',       5, true, 'offer'),
        (gen_random_uuid(), NEW.id, NEW.organization_id, 'Hired',       6, true, 'hired'),
        (gen_random_uuid(), NEW.id, NEW.organization_id, 'Rejected',    7, true, 'rejected');
    RETURN NEW;
END;
$$;
