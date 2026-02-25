-- Add 'interviewer' to the org_member_role enum
ALTER TYPE org_member_role ADD VALUE IF NOT EXISTS 'interviewer';
