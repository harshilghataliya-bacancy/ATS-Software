-- Add application_received email template type
ALTER TYPE email_template_type ADD VALUE IF NOT EXISTS 'application_received';
