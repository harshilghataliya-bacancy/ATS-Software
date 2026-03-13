-- Change default currency from USD to INR

ALTER TABLE jobs ALTER COLUMN salary_currency SET DEFAULT 'INR';
ALTER TABLE offer_letters ALTER COLUMN salary_currency SET DEFAULT 'INR';
