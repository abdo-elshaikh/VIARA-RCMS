-- Phase 16: Human Resources Support

-- 1. Employee Profiles
CREATE TABLE IF NOT EXISTS employee_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    employee_id VARCHAR(50) UNIQUE,
    department VARCHAR(100),
    job_title VARCHAR(100),
    hire_date DATE,
    employment_status VARCHAR(50) DEFAULT 'Full-Time', -- Full-Time, Part-Time, Contract
    salary DECIMAL(12, 2), -- Restricted visibility field
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Backfill existing users (who aren't Referring Doctors)
INSERT INTO employee_profiles (user_id, department, job_title, hire_date, employment_status)
SELECT user_id, role, role, CURRENT_DATE, 'Full-Time'
FROM users
WHERE role != 'Referring_Doctor'
ON CONFLICT (user_id) DO NOTHING;

-- 2. Staff Shifts
CREATE TABLE IF NOT EXISTS staff_shifts (
    shift_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Attendance Logs
CREATE TABLE IF NOT EXISTS attendance_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    clock_in TIMESTAMP WITH TIME ZONE NOT NULL,
    clock_out TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'Present', -- Present, Late, Absent, Half-Day
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Leave Requests
CREATE TABLE IF NOT EXISTS leave_requests (
    request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    leave_type VARCHAR(50) NOT NULL, -- Sick, Vacation, Unpaid, Personal
    reason TEXT,
    status VARCHAR(50) DEFAULT 'Pending', -- Pending, Approved, Rejected
    approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_staff_shifts_user ON staff_shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_shifts_time ON staff_shifts(start_time);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_user ON attendance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_time ON attendance_logs(clock_in);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
