CREATE TABLE IF NOT EXISTS reception_supervisor_assignments (
    assignment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supervisor_id UUID NOT NULL REFERENCES users(user_id),
    employee_id UUID NOT NULL REFERENCES users(user_id),
    can_view_shifts BOOLEAN NOT NULL DEFAULT TRUE,
    can_manage_handovers BOOLEAN NOT NULL DEFAULT FALSE,
    can_transfer_tasks BOOLEAN NOT NULL DEFAULT FALSE,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ends_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    assigned_by UUID NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT reception_supervisor_not_self CHECK (supervisor_id <> employee_id),
    CONSTRAINT reception_supervisor_handover_visibility CHECK (NOT can_manage_handovers OR can_view_shifts),
    CONSTRAINT reception_supervisor_valid_period CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_reception_supervisor_active
    ON reception_supervisor_assignments (supervisor_id, employee_id, starts_at)
    WHERE revoked_at IS NULL;
