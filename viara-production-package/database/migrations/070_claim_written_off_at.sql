-- Immutable write-off timestamp for insurance claims.
--
-- Receivables aging previously keyed written-off claims off `updated_at`, which
-- is bumped on every claim edit (updated_at = NOW() in updateClaimStatus). That
-- let a later edit retroactively move a write-off in or out of a historical
-- as-of snapshot. `written_off_at` is set once, when a claim first transitions
-- to 'Written Off', and never changed afterwards, so aging snapshots are stable.

ALTER TABLE insurance_claims
    ADD COLUMN IF NOT EXISTS written_off_at TIMESTAMP WITH TIME ZONE;

-- Backfill existing written-off claims. `updated_at` is the best available proxy
-- for the historical write-off moment; for non-written-off claims it stays NULL.
UPDATE insurance_claims
SET written_off_at = COALESCE(written_off_at, updated_at)
WHERE status = 'Written Off' AND written_off_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_insurance_claims_written_off_at
    ON insurance_claims(written_off_at)
    WHERE written_off_at IS NOT NULL;
