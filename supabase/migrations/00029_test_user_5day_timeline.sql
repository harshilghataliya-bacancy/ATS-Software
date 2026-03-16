-- Update Test User's application for Backend Engineer to simulate a 5-day hiring process
-- Day 0 (March 11): Applied
-- Day 1 (March 12): Moved to Screening
-- Day 2 (March 13): Moved to Assessment
-- Day 3 (March 14): Moved to Interview
-- Day 4 (March 15): Moved to Offer
-- Day 5 (March 16): Hired

-- Step 1: Update applied_at to 5 days ago (March 11)
UPDATE applications
SET applied_at = '2026-03-11T09:00:00+05:30'
WHERE id = (
  SELECT a.id FROM applications a
  JOIN candidates c ON c.id = a.candidate_id
  WHERE c.first_name = 'Test' AND c.last_name = 'User'
  AND a.status = 'active'
  ORDER BY a.created_at DESC
  LIMIT 1
);

-- Step 2: Delete any existing stage_movements for this application (clean slate)
DELETE FROM stage_movements
WHERE application_id = (
  SELECT a.id FROM applications a
  JOIN candidates c ON c.id = a.candidate_id
  WHERE c.first_name = 'Test' AND c.last_name = 'User'
  AND a.applied_at = '2026-03-11T09:00:00+05:30'
  LIMIT 1
);

-- Step 3: Insert stage movements spread across 5 days
-- Pipeline stages: Applied(1), Screening(2), Assessment(3), Interview(4), Offer(5), Hired(6), Rejected(7)
-- We insert movements for Screening(2) through Hired(6) only — skip Applied(1) and Rejected(7)
WITH app AS (
  SELECT a.id AS app_id, a.job_id, a.organization_id
  FROM applications a
  JOIN candidates c ON c.id = a.candidate_id
  WHERE c.first_name = 'Test' AND c.last_name = 'User'
  AND a.applied_at = '2026-03-11T09:00:00+05:30'
  LIMIT 1
),
stages AS (
  SELECT ps.id AS stage_id, ps.name, ps.display_order
  FROM pipeline_stages ps
  JOIN app ON ps.job_id = app.job_id AND ps.organization_id = app.organization_id
  WHERE ps.display_order BETWEEN 2 AND 6
  ORDER BY ps.display_order ASC
)
INSERT INTO stage_movements (application_id, organization_id, from_stage_id, to_stage_id, moved_at)
SELECT
  app.app_id,
  app.organization_id,
  LAG(s.stage_id) OVER (ORDER BY s.display_order),
  s.stage_id,
  CASE s.display_order
    WHEN 2 THEN '2026-03-12T10:00:00+05:30'::timestamptz  -- Day 1: Screening
    WHEN 3 THEN '2026-03-13T11:00:00+05:30'::timestamptz  -- Day 2: Assessment
    WHEN 4 THEN '2026-03-14T14:00:00+05:30'::timestamptz  -- Day 3: Interview
    WHEN 5 THEN '2026-03-15T16:00:00+05:30'::timestamptz  -- Day 4: Offer
    WHEN 6 THEN '2026-03-16T10:00:00+05:30'::timestamptz  -- Day 5: Hired
  END
FROM stages s
CROSS JOIN app
ORDER BY s.display_order;

-- Step 4: Update the application's current stage to Hired and mark as hired
UPDATE applications
SET
  current_stage_id = (
    SELECT ps.id FROM pipeline_stages ps
    JOIN applications a ON ps.job_id = a.job_id AND ps.organization_id = a.organization_id
    JOIN candidates c ON c.id = a.candidate_id
    WHERE c.first_name = 'Test' AND c.last_name = 'User'
    AND a.applied_at = '2026-03-11T09:00:00+05:30'
    AND ps.stage_type = 'hired'
    LIMIT 1
  ),
  status = 'hired',
  hired_at = '2026-03-16T10:00:00+05:30'
WHERE id = (
  SELECT a.id FROM applications a
  JOIN candidates c ON c.id = a.candidate_id
  WHERE c.first_name = 'Test' AND c.last_name = 'User'
  AND a.applied_at = '2026-03-11T09:00:00+05:30'
  LIMIT 1
);
