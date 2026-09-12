CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE clinical_task_assignment_events
    DROP CONSTRAINT IF EXISTS clinical_task_assignment_events_action_check;
ALTER TABLE clinical_task_assignment_events
    ADD CONSTRAINT clinical_task_assignment_events_action_check
    CHECK (action IN ('Claim', 'Assign', 'Transfer', 'Release', 'Complete'));

ALTER TABLE clinical_task_assignment_events
    ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS entry_hash VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinical_task_assignment_event_hash
    ON clinical_task_assignment_events(entry_hash)
    WHERE entry_hash IS NOT NULL;

DO $$
DECLARE
    event_record RECORD;
    prior_hash VARCHAR(64) := repeat('0', 64);
    calculated_hash VARCHAR(64);
BEGIN
    FOR event_record IN
        SELECT *
        FROM clinical_task_assignment_events
        ORDER BY created_at, event_id
    LOOP
        calculated_hash := encode(digest(
            concat_ws('|',
                prior_hash,
                event_record.event_id::text,
                event_record.exam_id::text,
                COALESCE(event_record.appointment_id::text, ''),
                event_record.task_role,
                event_record.action,
                COALESCE(event_record.previous_user_id::text, ''),
                COALESCE(event_record.new_user_id::text, ''),
                event_record.performed_by::text,
                COALESCE(event_record.reason, ''),
                COALESCE(event_record.available_at::text, ''),
                event_record.assignment_version::text,
                event_record.created_at::text
            ),
            'sha256'
        ), 'hex');

        UPDATE clinical_task_assignment_events
        SET previous_hash = prior_hash,
            entry_hash = calculated_hash
        WHERE event_id = event_record.event_id;
        prior_hash := calculated_hash;
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION chain_clinical_task_assignment_event()
RETURNS TRIGGER AS $$
DECLARE
    last_hash VARCHAR(64);
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('VIARA_clinical_task_assignment_event_chain'));
    SELECT entry_hash INTO last_hash
    FROM clinical_task_assignment_events
    ORDER BY created_at DESC, event_id DESC
    LIMIT 1;

    NEW.previous_hash := COALESCE(last_hash, repeat('0', 64));
    NEW.entry_hash := encode(digest(
        concat_ws('|',
            NEW.previous_hash,
            NEW.event_id::text,
            NEW.exam_id::text,
            COALESCE(NEW.appointment_id::text, ''),
            NEW.task_role,
            NEW.action,
            COALESCE(NEW.previous_user_id::text, ''),
            COALESCE(NEW.new_user_id::text, ''),
            NEW.performed_by::text,
            COALESCE(NEW.reason, ''),
            COALESCE(NEW.available_at::text, ''),
            NEW.assignment_version::text,
            NEW.created_at::text
        ),
        'sha256'
    ), 'hex');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clinical_task_assignment_event_chain ON clinical_task_assignment_events;
CREATE TRIGGER trg_clinical_task_assignment_event_chain
BEFORE INSERT ON clinical_task_assignment_events
FOR EACH ROW EXECUTE FUNCTION chain_clinical_task_assignment_event();

CREATE OR REPLACE FUNCTION protect_clinical_task_assignment_event()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('VIARA.assignment_audit_maintenance', TRUE) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'clinical_task_assignment_events are append-only';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clinical_task_assignment_event_append_only ON clinical_task_assignment_events;
CREATE TRIGGER trg_clinical_task_assignment_event_append_only
BEFORE UPDATE OR DELETE ON clinical_task_assignment_events
FOR EACH ROW EXECUTE FUNCTION protect_clinical_task_assignment_event();
