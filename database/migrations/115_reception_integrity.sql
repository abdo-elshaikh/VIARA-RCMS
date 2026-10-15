-- Reception financial and clinical workflow integrity.

ALTER TABLE inventory_items
    ADD COLUMN IF NOT EXISTS is_contrast_agent BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS insurance_policy_id UUID
        REFERENCES patient_insurance_policies(policy_id) ON DELETE RESTRICT;

-- Preserve the policy used by historical insured invoices. Resolving the
-- current primary policy at read time can silently rewrite billing history.
UPDATE invoices i
SET insurance_policy_id = (
    SELECT pip.policy_id
    FROM patient_insurance_policies pip
    JOIN insurance_providers ip ON ip.provider_id = pip.provider_id
    WHERE pip.patient_id = i.patient_id
      AND COALESCE(ip.is_active, true) = true
      AND (pip.valid_from IS NULL OR pip.valid_from <= COALESCE(i.service_date, i.business_date, i.generated_at::date))
      AND (pip.valid_to IS NULL OR pip.valid_to >= COALESCE(i.service_date, i.business_date, i.generated_at::date))
    ORDER BY pip.is_primary DESC, pip.created_at DESC
    LIMIT 1
)
WHERE i.insurance_covered_amount > 0
  AND i.insurance_policy_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_insurance_policy
    ON invoices(insurance_policy_id)
    WHERE insurance_policy_id IS NOT NULL;

UPDATE inventory_items
SET is_contrast_agent = TRUE
WHERE LOWER(TRIM(COALESCE(category, ''))) IN ('contrast', 'contrast agent');

-- Partial-payment approvals are scoped to one clinical target and consumed
-- atomically. Legacy broad approvals must not remain reusable.
UPDATE partial_payment_exceptions
SET status = 'Expired'
WHERE status = 'Approved'
  AND COALESCE(metadata->>'targetStage', '') = '';

DROP INDEX IF EXISTS idx_partial_payment_exceptions_one_pending;
CREATE UNIQUE INDEX IF NOT EXISTS idx_partial_payment_exceptions_one_pending_target
    ON partial_payment_exceptions(invoice_id, transaction_type, (metadata->>'targetStage'))
    WHERE status = 'Pending';

CREATE INDEX IF NOT EXISTS idx_inventory_items_contrast_agent
    ON inventory_items(is_contrast_agent)
    WHERE is_contrast_agent = TRUE;
