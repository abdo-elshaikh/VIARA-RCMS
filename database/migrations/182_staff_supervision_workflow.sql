CREATE TABLE IF NOT EXISTS staff_supervisor_assignments (
    assignment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supervisor_id UUID NOT NULL REFERENCES users(user_id),
    employee_id UUID NOT NULL REFERENCES users(user_id),
    can_approve_leave BOOLEAN NOT NULL DEFAULT FALSE,
    can_approve_attendance BOOLEAN NOT NULL DEFAULT FALSE,
    can_approve_shifts BOOLEAN NOT NULL DEFAULT FALSE,
    can_recommend_adjustments BOOLEAN NOT NULL DEFAULT FALSE,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ends_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    assigned_by UUID NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT staff_supervisor_not_self CHECK (supervisor_id <> employee_id),
    CONSTRAINT staff_supervisor_valid_period CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_staff_supervisor_active
    ON staff_supervisor_assignments (supervisor_id, employee_id, starts_at)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS supervisor_adjustment_recommendations (
    recommendation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supervisor_id UUID NOT NULL REFERENCES users(user_id),
    employee_id UUID NOT NULL REFERENCES users(user_id),
    recommendation_type VARCHAR(20) NOT NULL CHECK (recommendation_type IN ('Incentive', 'Deduction', 'Penalty')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency_code VARCHAR(3) NOT NULL DEFAULT 'EGP',
    reason TEXT NOT NULL CHECK (length(trim(reason)) >= 10),
    status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
    reviewed_by UUID REFERENCES users(user_id),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_supervisor_adjustment_pending
    ON supervisor_adjustment_recommendations (status, created_at DESC);
