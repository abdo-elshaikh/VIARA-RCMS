-- Phase 17: Insurance Deductions, Policy-Contract Link, and Claim Batches

ALTER TABLE insurance_claims
    ADD COLUMN IF NOT EXISTS deduction_amount DECIMAL(10,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deduction_reason TEXT,
    ADD COLUMN IF NOT EXISTS batch_reference VARCHAR(100);

ALTER TABLE patient_insurance_policies
    ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES contracts(contract_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_insurance_claims_batch
    ON insurance_claims(batch_reference)
    WHERE batch_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_insurance_contract
    ON patient_insurance_policies(contract_id)
    WHERE contract_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insurance_claims_deductions_check') THEN
        ALTER TABLE insurance_claims
            ADD CONSTRAINT insurance_claims_deductions_check
            CHECK (
                deduction_amount >= 0
                AND (received_amount + deduction_amount) <= (expected_amount + 0.005)
            ) NOT VALID;
    END IF;
END $$;
