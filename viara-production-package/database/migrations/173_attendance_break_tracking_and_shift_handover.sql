-- Phase: Attendance Break Tracking & Reception Shift Handover
-- Migration: 173

-- 1. Add break tracking columns to attendance_logs
ALTER TABLE attendance_logs 
    ADD COLUMN IF NOT EXISTS break_start TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS break_end TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS total_break_minutes INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_paid_break BOOLEAN DEFAULT true;

-- 2. Add branch_id to reception_shift_sessions for multi-location support
ALTER TABLE reception_shift_sessions
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES financial_branches(branch_id);

-- 3. Create reception shift handover table
CREATE TABLE IF NOT EXISTS reception_shift_handovers (
    handover_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_session_id UUID NOT NULL REFERENCES reception_shift_sessions(session_id) ON DELETE CASCADE,
    to_session_id UUID REFERENCES reception_shift_sessions(session_id) ON DELETE SET NULL,
    to_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    pending_task_ids UUID[] DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by UUID REFERENCES users(user_id) ON DELETE SET NULL
);

-- 4. Create index for handover queries
CREATE INDEX IF NOT EXISTS idx_reception_shift_handovers_from ON reception_shift_handovers(from_session_id);
CREATE INDEX IF NOT EXISTS idx_reception_shift_handovers_to ON reception_shift_handovers(to_session_id);
CREATE INDEX IF NOT EXISTS idx_reception_shift_handovers_to_user ON reception_shift_handovers(to_user_id);
CREATE INDEX IF NOT EXISTS idx_reception_shift_sessions_branch ON reception_shift_sessions(branch_id);

-- 5. Add system settings for break configuration
INSERT INTO system_settings (setting_key, setting_value) VALUES
    ('hr.attendance.break_duration_minutes', '60'),
    ('hr.attendance.max_continuous_hours', '16'),
    ('hr.attendance.geofence_enabled', 'false'),
    ('hr.attendance.geofence_radius_meters', '100'),
    ('hr.shift.handover_required', 'true'),
    ('hr.shift.swap_requires_approval', 'true'),
    ('hr.shift.template_lookahead_days', '30')
ON CONFLICT (setting_key) DO NOTHING;

-- 6. Create shift templates table for recurring schedules
CREATE TABLE IF NOT EXISTS shift_templates (
    template_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    role user_role NOT NULL,
    room_id UUID REFERENCES rooms(room_id) ON DELETE SET NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    recurrence_rule JSONB NOT NULL, -- { freq: 'weekly', byday: [1,3,5], until: '2026-12-31' }
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shift_templates_role ON shift_templates(role);
CREATE INDEX IF NOT EXISTS idx_shift_templates_active ON shift_templates(is_active);

-- 7. Create shift swap requests table
CREATE TABLE IF NOT EXISTS shift_swap_requests (
    request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_shift_id UUID NOT NULL REFERENCES staff_shifts(shift_id) ON DELETE CASCADE,
    to_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'Pending', -- Pending, Accepted, Rejected, Approved, Cancelled
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_shift_swap_requests_from_shift ON shift_swap_requests(from_shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_swap_requests_to_user ON shift_swap_requests(to_user_id);
CREATE INDEX IF NOT EXISTS idx_shift_swap_requests_status ON shift_swap_requests(status);
