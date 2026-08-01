-- Migration 010: Add Refresh Tokens

CREATE TABLE IF NOT EXISTS refresh_tokens (
    token_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patients(patient_id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked BOOLEAN DEFAULT FALSE,
    
    -- Ensure token is tied to either a user OR a patient, not both, not neither
    CONSTRAINT chk_token_owner CHECK (
        (user_id IS NOT NULL AND patient_id IS NULL) OR 
        (patient_id IS NOT NULL AND user_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_patient ON refresh_tokens(patient_id);
