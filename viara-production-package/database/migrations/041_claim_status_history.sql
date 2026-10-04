CREATE TABLE IF NOT EXISTS claim_status_history (
    history_id BIGSERIAL PRIMARY KEY,
    claim_id UUID NOT NULL REFERENCES insurance_claims(claim_id),
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by UUID REFERENCES users(user_id),
    changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_status_history_claim
    ON claim_status_history(claim_id, changed_at DESC);

CREATE OR REPLACE FUNCTION VIARA_record_claim_status()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO claim_status_history (claim_id, previous_status, new_status, changed_by)
        VALUES (NEW.claim_id, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
                NEW.status, NEW.updated_by);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_claim_status_history ON insurance_claims;
CREATE TRIGGER trg_claim_status_history
AFTER INSERT OR UPDATE OF status ON insurance_claims
FOR EACH ROW EXECUTE FUNCTION VIARA_record_claim_status();

CREATE OR REPLACE FUNCTION VIARA_protect_claim_status_history()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'claim status history is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_claim_status_history_append_only ON claim_status_history;
CREATE TRIGGER trg_claim_status_history_append_only
BEFORE UPDATE OR DELETE ON claim_status_history
FOR EACH ROW EXECUTE FUNCTION VIARA_protect_claim_status_history();
