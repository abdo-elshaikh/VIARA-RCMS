ALTER TABLE financial_closures
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id);

UPDATE financial_closures
SET branch_id = '00000000-0000-4000-8000-000000000001'
WHERE branch_id IS NULL;

ALTER TABLE financial_closures
    ALTER COLUMN branch_id SET DEFAULT '00000000-0000-4000-8000-000000000001',
    ALTER COLUMN branch_id SET NOT NULL;

ALTER TABLE financial_closures
    DROP CONSTRAINT IF EXISTS financial_closures_closure_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_closures_branch_date
    ON financial_closures(branch_id, closure_date);

ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS request_fingerprint VARCHAR(64);
