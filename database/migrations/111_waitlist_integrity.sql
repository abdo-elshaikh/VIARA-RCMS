-- Harden waiting-list lifecycle and support active-entry lookups.

CREATE INDEX IF NOT EXISTS idx_waiting_list_active_priority
    ON waiting_list(priority, created_at)
    WHERE status IN ('Waiting', 'Contacted');

CREATE INDEX IF NOT EXISTS idx_waiting_list_assigned_appointment
    ON waiting_list(assigned_appointment_id)
    WHERE assigned_appointment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS waiting_list_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    waitlist_id UUID NOT NULL REFERENCES waiting_list(waitlist_id) ON DELETE CASCADE,
    from_status VARCHAR(20),
    to_status VARCHAR(20) NOT NULL,
    appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE SET NULL,
    reason TEXT,
    changed_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_waiting_list_events_entry
    ON waiting_list_events(waitlist_id, created_at DESC);
