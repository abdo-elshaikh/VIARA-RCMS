-- Improve privacy export cleanup and consent/request history lookup performance.

CREATE INDEX IF NOT EXISTS idx_privacy_exports_expires
    ON privacy_export_artifacts(expires_at);

CREATE INDEX IF NOT EXISTS idx_patient_consents_patient_type_status_signed
    ON patient_consents(patient_id, type, status, signed_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_patient_created
    ON data_privacy_requests(patient_id, created_at DESC);
