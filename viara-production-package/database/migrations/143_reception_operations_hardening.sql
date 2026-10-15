-- Migration 143: harden concurrent reception work and add operational shift sessions.

-- Resolve any historic duplicate active rows before enforcing the invariant.
WITH ranked_active AS (
    SELECT work_item_id,
           ROW_NUMBER() OVER (
               PARTITION BY appointment_id
               ORDER BY claimed_at DESC NULLS LAST, created_at DESC, work_item_id DESC
           ) AS row_rank
    FROM reception_work_items
    WHERE status IN ('Claimed', 'In_Progress')
      AND appointment_id IS NOT NULL
)
UPDATE reception_work_items rwi
SET status = 'Released',
    notes = CONCAT_WS(E'\n', NULLIF(rwi.notes, ''), 'Released while enforcing single active reception owner'),
    updated_at = CURRENT_TIMESTAMP
FROM ranked_active ranked
WHERE rwi.work_item_id = ranked.work_item_id
  AND ranked.row_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_reception_work_items_one_active_per_appointment
    ON reception_work_items (appointment_id)
    WHERE status IN ('Claimed', 'In_Progress');

CREATE INDEX IF NOT EXISTS idx_reception_work_items_lease_expiry
    ON reception_work_items (lease_expires_at)
    WHERE status IN ('Claimed', 'In_Progress');

CREATE TABLE IF NOT EXISTS reception_shift_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    desk_identifier VARCHAR(100) NOT NULL,
    room_ids TEXT[] NOT NULL DEFAULT '{}',
    modality_ids TEXT[] NOT NULL DEFAULT '{}',
    scope VARCHAR(30) NOT NULL DEFAULT 'all'
        CHECK (scope IN ('all', 'rooms', 'modalities', 'mine', 'unclaimed', 'emergency')),
    status VARCHAR(20) NOT NULL DEFAULT 'Open'
        CHECK (status IN ('Open', 'Closed')),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    closing_notes TEXT,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reception_shift_one_open_per_user
    ON reception_shift_sessions (user_id)
    WHERE status = 'Open';

CREATE UNIQUE INDEX IF NOT EXISTS uq_reception_shift_one_open_per_desk
    ON reception_shift_sessions (LOWER(desk_identifier))
    WHERE status = 'Open';

CREATE INDEX IF NOT EXISTS idx_reception_shift_sessions_period
    ON reception_shift_sessions (user_id, started_at DESC, ended_at DESC);

ALTER TABLE reception_work_items
    ADD COLUMN IF NOT EXISTS shift_session_id UUID REFERENCES reception_shift_sessions(session_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reception_work_items_shift
    ON reception_work_items (shift_session_id, status);

-- Durable, non-PII call events survive process restarts and multi-instance deployments.
CREATE TABLE IF NOT EXISTS display_call_events (
    call_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(80) NOT NULL,
    room_name VARCHAR(150),
    modality_id UUID REFERENCES modalities(modality_id) ON DELETE SET NULL,
    called_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    call_by_name BOOLEAN NOT NULL DEFAULT FALSE,
    called_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '45 seconds')
);

CREATE INDEX IF NOT EXISTS idx_display_call_events_active
    ON display_call_events (expires_at DESC);

-- Complete the notification contract for denied write-scoped API token requests.
INSERT INTO notification_event_catalog
    (event_type, category, default_priority, default_channels, description)
VALUES
    ('API_TOKEN_WRITE_SCOPE_DENIED', 'Security', 'Warning', ARRAY['InApp'],
     'A write-scoped API token request was denied')
ON CONFLICT (event_type) DO UPDATE SET
    category = EXCLUDED.category,
    default_priority = EXCLUDED.default_priority,
    default_channels = EXCLUDED.default_channels,
    description = EXCLUDED.description;

INSERT INTO notification_audience_policies
    (event_type, event_category, role, allowed_channels, min_priority,
     inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled)
VALUES
    ('API_TOKEN_WRITE_SCOPE_DENIED', NULL, 'Admin', ARRAY['InApp'], 'Warning',
     TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO UPDATE SET
    allowed_channels = EXCLUDED.allowed_channels,
    min_priority = EXCLUDED.min_priority,
    inapp_enabled = EXCLUDED.inapp_enabled,
    email_enabled = EXCLUDED.email_enabled,
    sms_enabled = EXCLUDED.sms_enabled,
    whatsapp_enabled = EXCLUDED.whatsapp_enabled;

INSERT INTO notification_templates
    (event_type, channel, language, subject, body, is_active)
VALUES
    ('API_TOKEN_WRITE_SCOPE_DENIED', 'InApp', 'en', 'Write API Token Request Denied',
     'A request to create a write-scoped API token was denied.', TRUE)
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE;
