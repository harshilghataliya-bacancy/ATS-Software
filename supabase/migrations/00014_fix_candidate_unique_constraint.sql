-- Drop the old unique constraint that blocks re-creating deleted candidates
ALTER TABLE candidates DROP CONSTRAINT candidates_org_email_unique;

-- Replace with a partial unique index that only enforces uniqueness for non-deleted rows
CREATE UNIQUE INDEX candidates_org_email_unique ON candidates (organization_id, email)
    WHERE deleted_at IS NULL;
