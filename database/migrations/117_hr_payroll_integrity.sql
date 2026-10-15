-- HR and payroll integrity hardening.
-- Keeps historical data intact while preventing new overlapping operational records.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE employee_profiles
    ADD COLUMN IF NOT EXISTS termination_date DATE;

ALTER TABLE employee_profiles DROP CONSTRAINT IF EXISTS employee_profiles_employment_dates_check;
ALTER TABLE employee_profiles
    ADD CONSTRAINT employee_profiles_employment_dates_check
    CHECK (termination_date IS NULL OR hire_date IS NULL OR termination_date >= hire_date) NOT VALID;

ALTER TABLE attendance_logs
    ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES staff_shifts(shift_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS late_minutes NUMERIC(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS early_leave_minutes NUMERIC(10, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS corrected_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMP WITH TIME ZONE;

-- Preserve the newest open session and settle older duplicates at zero duration.
WITH ranked_open_sessions AS (
    SELECT log_id,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY clock_in DESC, created_at DESC, log_id DESC) AS row_number
    FROM attendance_logs
    WHERE clock_out IS NULL
)
UPDATE attendance_logs a
SET clock_out = a.clock_in,
    notes = CONCAT_WS(E'\n', NULLIF(a.notes, ''), '[migration] Duplicate open attendance session settled')
FROM ranked_open_sessions ranked
WHERE ranked.log_id = a.log_id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_one_open_session_per_user
    ON attendance_logs(user_id)
    WHERE clock_out IS NULL;

CREATE OR REPLACE FUNCTION prevent_attendance_overlap()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 11705));
    IF EXISTS (
        SELECT 1 FROM attendance_logs a
        WHERE a.user_id = NEW.user_id
          AND a.log_id <> COALESCE(NEW.log_id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND tstzrange(a.clock_in, COALESCE(a.clock_out, 'infinity'::timestamptz), '[)')
              && tstzrange(NEW.clock_in, COALESCE(NEW.clock_out, 'infinity'::timestamptz), '[)')
    ) THEN
        RAISE EXCEPTION 'Attendance record overlaps another session' USING ERRCODE = '23P01';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_attendance_overlap ON attendance_logs;
CREATE TRIGGER trg_prevent_attendance_overlap
BEFORE INSERT OR UPDATE OF user_id, clock_in, clock_out ON attendance_logs
FOR EACH ROW EXECUTE FUNCTION prevent_attendance_overlap();

ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_time_check;
ALTER TABLE attendance_logs
    ADD CONSTRAINT attendance_logs_time_check
    CHECK (clock_out IS NULL OR clock_out >= clock_in) NOT VALID;

ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_status_check;
ALTER TABLE attendance_logs
    ADD CONSTRAINT attendance_logs_status_check
    CHECK (status IN ('Present', 'Late', 'Absent', 'Half-Day')) NOT VALID;

ALTER TABLE attendance_logs DROP CONSTRAINT IF EXISTS attendance_logs_minutes_check;
ALTER TABLE attendance_logs
    ADD CONSTRAINT attendance_logs_minutes_check
    CHECK (late_minutes >= 0 AND early_leave_minutes >= 0) NOT VALID;

ALTER TABLE staff_shifts DROP CONSTRAINT IF EXISTS staff_shifts_time_check;
ALTER TABLE staff_shifts
    ADD CONSTRAINT staff_shifts_time_check CHECK (end_time > start_time) NOT VALID;

ALTER TABLE leave_requests
    ADD COLUMN IF NOT EXISTS review_notes TEXT;

ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_date_check;
ALTER TABLE leave_requests
    ADD CONSTRAINT leave_requests_date_check CHECK (end_date >= start_date) NOT VALID;

ALTER TABLE employee_penalties
    ADD COLUMN IF NOT EXISTS remaining_amount DECIMAL(14, 2);

ALTER TABLE payroll_periods
    ADD COLUMN IF NOT EXISTS total_employer_contributions DECIMAL(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE payroll_runs
    ADD COLUMN IF NOT EXISTS total_employer_contributions DECIMAL(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE payroll_employee_items
    ADD COLUMN IF NOT EXISTS total_employer_contributions DECIMAL(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE employee_deductions
    ADD COLUMN IF NOT EXISTS payroll_period_id UUID REFERENCES payroll_periods(period_id) ON DELETE SET NULL;

ALTER TABLE employee_compensation_profiles DROP CONSTRAINT IF EXISTS employee_compensation_type_amount_check;
ALTER TABLE employee_compensation_profiles
    ADD CONSTRAINT employee_compensation_type_amount_check
    CHECK (
        (salary_type = 'Monthly' AND base_salary > 0)
        OR (salary_type = 'Hourly' AND hourly_rate > 0)
    ) NOT VALID;

ALTER TABLE payroll_rules DROP CONSTRAINT IF EXISTS payroll_rules_logic_check;
ALTER TABLE payroll_rules
    ADD CONSTRAINT payroll_rules_logic_check
    CHECK (
        value > 0
        AND (
            (rule_type = 'Overtime' AND calculation_method IN ('HourlyMultiplier', 'FixedAmount', 'PercentageOfBase'))
            OR (rule_type IN ('Late', 'EarlyLeave') AND calculation_method IN ('PerMinute', 'FixedAmount'))
            OR (rule_type = 'Absence' AND calculation_method IN ('PerDay', 'FixedAmount'))
            OR (rule_type IN ('Allowance', 'Deduction', 'Penalty', 'EmployerContribution')
                AND calculation_method IN ('FixedAmount', 'PercentageOfBase', 'PercentageOfGross'))
        )
        AND (calculation_method <> 'HourlyMultiplier' OR value > 1)
    ) NOT VALID;

ALTER TABLE employee_deductions DROP CONSTRAINT IF EXISTS employee_deductions_logic_check;
ALTER TABLE employee_deductions
    ADD CONSTRAINT employee_deductions_logic_check
    CHECK (
        (
            deduction_type = 'Percentage'
            AND percentage > 0
            AND amount = 0
        )
        OR (
            deduction_type <> 'Percentage'
            AND amount > 0
            AND (
                deduction_type NOT IN ('Installment', 'Advance', 'Loan')
                OR (
                    total_amount > 0
                    AND COALESCE(remaining_amount, total_amount) >= amount
                    AND COALESCE(remaining_amount, total_amount) <= total_amount
                )
            )
        )
    ) NOT VALID;

UPDATE employee_penalties
SET remaining_amount = CASE WHEN status = 'Applied' THEN 0 ELSE amount END
WHERE remaining_amount IS NULL;

ALTER TABLE employee_penalties
    ALTER COLUMN remaining_amount SET DEFAULT 0;

ALTER TABLE employee_penalties DROP CONSTRAINT IF EXISTS employee_penalties_remaining_check;
ALTER TABLE employee_penalties
    ADD CONSTRAINT employee_penalties_remaining_check
    CHECK (amount > 0 AND remaining_amount >= 0 AND remaining_amount <= amount) NOT VALID;

-- Make compensation profiles the canonical payroll source for existing legacy salaries.
INSERT INTO employee_compensation_profiles (
    user_id, salary_type, base_salary, hourly_rate, standard_hours_per_day,
    standard_days_per_period, effective_from, is_active, notes
)
SELECT ep.user_id,
       'Monthly',
       ep.salary,
       0,
       8,
       22,
       COALESCE(ep.hire_date, CURRENT_DATE),
       TRUE,
       'Backfilled from employee_profiles.salary by migration 117'
FROM employee_profiles ep
JOIN users u ON u.user_id = ep.user_id
WHERE ep.salary IS NOT NULL
  AND ep.salary > 0
  AND u.role NOT IN ('Referring_Doctor', 'Developer')
  AND NOT EXISTS (
      SELECT 1 FROM employee_compensation_profiles cp WHERE cp.user_id = ep.user_id
  );

-- Serialize and reject new temporal overlaps at the database boundary.
CREATE OR REPLACE FUNCTION prevent_staff_shift_overlap()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 11701));
    IF EXISTS (
        SELECT 1 FROM staff_shifts s
        WHERE s.user_id = NEW.user_id
          AND s.shift_id <> COALESCE(NEW.shift_id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND tstzrange(s.start_time, s.end_time, '[)') && tstzrange(NEW.start_time, NEW.end_time, '[)')
    ) THEN
        RAISE EXCEPTION 'Employee already has an overlapping shift' USING ERRCODE = '23P01';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_staff_shift_overlap ON staff_shifts;
CREATE TRIGGER trg_prevent_staff_shift_overlap
BEFORE INSERT OR UPDATE OF user_id, start_time, end_time ON staff_shifts
FOR EACH ROW EXECUTE FUNCTION prevent_staff_shift_overlap();

CREATE OR REPLACE FUNCTION prevent_active_leave_overlap()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status NOT IN ('Pending', 'Approved') THEN
        RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 11702));
    IF EXISTS (
        SELECT 1 FROM leave_requests l
        WHERE l.user_id = NEW.user_id
          AND l.request_id <> COALESCE(NEW.request_id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND l.status IN ('Pending', 'Approved')
          AND daterange(l.start_date, l.end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
    ) THEN
        RAISE EXCEPTION 'Leave dates overlap an existing pending or approved request' USING ERRCODE = '23P01';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_active_leave_overlap ON leave_requests;
CREATE TRIGGER trg_prevent_active_leave_overlap
BEFORE INSERT OR UPDATE OF user_id, start_date, end_date, status ON leave_requests
FOR EACH ROW EXECUTE FUNCTION prevent_active_leave_overlap();

CREATE OR REPLACE FUNCTION prevent_compensation_profile_overlap()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active IS NOT TRUE THEN
        RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 11703));
    IF EXISTS (
        SELECT 1 FROM employee_compensation_profiles cp
        WHERE cp.user_id = NEW.user_id
          AND cp.profile_id <> COALESCE(NEW.profile_id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND cp.is_active = TRUE
          AND daterange(cp.effective_from, COALESCE(cp.effective_to, '9999-12-31'::date), '[]')
              && daterange(NEW.effective_from, COALESCE(NEW.effective_to, '9999-12-31'::date), '[]')
    ) THEN
        RAISE EXCEPTION 'Employee already has an active compensation profile in this date range' USING ERRCODE = '23P01';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_compensation_profile_overlap ON employee_compensation_profiles;
CREATE TRIGGER trg_prevent_compensation_profile_overlap
BEFORE INSERT OR UPDATE OF user_id, effective_from, effective_to, is_active ON employee_compensation_profiles
FOR EACH ROW EXECUTE FUNCTION prevent_compensation_profile_overlap();

CREATE OR REPLACE FUNCTION prevent_payroll_period_overlap()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'Cancelled' THEN
        RETURN NEW;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.branch_id::text, 11704));
    IF EXISTS (
        SELECT 1 FROM payroll_periods p
        WHERE p.branch_id = NEW.branch_id
          AND p.period_id <> COALESCE(NEW.period_id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND p.status <> 'Cancelled'
          AND daterange(p.start_date, p.end_date, '[]') && daterange(NEW.start_date, NEW.end_date, '[]')
    ) THEN
        RAISE EXCEPTION 'Payroll period overlaps an existing active period' USING ERRCODE = '23P01';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_payroll_period_overlap ON payroll_periods;
CREATE TRIGGER trg_prevent_payroll_period_overlap
BEFORE INSERT OR UPDATE OF branch_id, start_date, end_date, status ON payroll_periods
FOR EACH ROW EXECUTE FUNCTION prevent_payroll_period_overlap();

CREATE INDEX IF NOT EXISTS idx_attendance_shift ON attendance_logs(shift_id);
CREATE INDEX IF NOT EXISTS idx_leave_user_dates_status ON leave_requests(user_id, start_date, end_date, status);
CREATE INDEX IF NOT EXISTS idx_penalties_remaining ON employee_penalties(status, remaining_amount) WHERE status = 'Approved';
CREATE INDEX IF NOT EXISTS idx_deductions_reserved_period ON employee_deductions(payroll_period_id) WHERE status = 'Approved';

INSERT INTO permissions (name, module, description) VALUES
('MANAGE_ATTENDANCE', 'HR', 'Correct attendance times and attendance classifications')
ON CONFLICT (name) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description;

INSERT INTO role_permissions (role_name, permission_id)
SELECT role_name::user_role, p.permission_id
FROM (VALUES ('Developer'), ('Admin'), ('HR')) AS grants(role_name)
JOIN permissions p ON p.name = 'MANAGE_ATTENDANCE'
ON CONFLICT DO NOTHING;
