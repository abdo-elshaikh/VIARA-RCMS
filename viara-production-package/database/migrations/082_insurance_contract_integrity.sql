-- Harden insurance setup and claim integrity without mutating earlier migrations.

UPDATE patient_insurance_policies p
SET is_primary = false,
    updated_at = NOW()
FROM (
    SELECT policy_id,
           ROW_NUMBER() OVER (
               PARTITION BY patient_id
               ORDER BY is_primary DESC, created_at DESC, policy_id DESC
           ) AS rn
    FROM patient_insurance_policies
) ranked
WHERE p.policy_id = ranked.policy_id
  AND ranked.rn > 1
  AND p.is_primary = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_insurance_one_primary
    ON patient_insurance_policies(patient_id)
    WHERE is_primary = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_insurance_providers_payer_code_unique
    ON insurance_providers(lower(payer_code))
    WHERE payer_code IS NOT NULL AND payer_code <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_insurance_approvals_provider_number_unique
    ON insurance_approvals(provider_id, lower(approval_number))
    WHERE approval_number IS NOT NULL AND approval_number <> '';

CREATE INDEX IF NOT EXISTS idx_contracts_provider_active_dates
    ON contracts(provider_id, entity_type, is_active, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_coverage_rules_scope_dates
    ON insurance_coverage_rules(provider_id, contract_id, exam_type_id, modality_type, is_active, effective_from, effective_to);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_date_order_check') THEN
        ALTER TABLE contracts
            ADD CONSTRAINT contracts_date_order_check
            CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_insurance_policy_date_order_check') THEN
        ALTER TABLE patient_insurance_policies
            ADD CONSTRAINT patient_insurance_policy_date_order_check
            CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insurance_coverage_rules_amounts_check') THEN
        ALTER TABLE insurance_coverage_rules
            ADD CONSTRAINT insurance_coverage_rules_amounts_check
            CHECK (
                coverage_percentage >= 0
                AND coverage_percentage <= 100
                AND (coverage_ceiling IS NULL OR coverage_ceiling >= 0)
                AND copay_amount >= 0
                AND (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insurance_approvals_amounts_check') THEN
        ALTER TABLE insurance_approvals
            ADD CONSTRAINT insurance_approvals_amounts_check
            CHECK (
                requested_amount >= 0
                AND approved_amount >= 0
                AND approved_amount <= requested_amount
            ) NOT VALID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'insurance_claims_amounts_check') THEN
        ALTER TABLE insurance_claims
            ADD CONSTRAINT insurance_claims_amounts_check
            CHECK (
                expected_amount >= 0
                AND received_amount >= 0
                AND received_amount <= expected_amount
            ) NOT VALID;
    END IF;
END $$;
