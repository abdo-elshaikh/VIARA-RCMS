-- 156_advanced_attendance_system.sql
-- Advanced Attendance & Workforce Compliance Upgrade:
-- 1. Automated shift-linking snapshots and classification.
-- 2. attendance_permissions for early departure, late arrival, and emergency shift access.
-- 3. attendance_audit_ledger for immutable compliance and payroll verification.
-- 4. Central system settings for grace periods, early leave lock, and shift-based login restriction.
-- 5. Notification catalog events for real-time compliance alerting.

-- 1. Extend attendance_logs with shift snapshot metadata
ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS shift_link_type VARCHAR(20) DEFAULT 'Auto'
    CHECK (shift_link_type IN ('Auto', 'Manual', 'Unscheduled', 'EmergencyCover')),
  ADD COLUMN IF NOT EXISTS scheduled_start_snapshot TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS scheduled_end_snapshot TIMESTAMP WITH TIME ZONE;

-- 2. Attendance permissions table (Early departure, Late arrival, Emergency access)
CREATE TABLE IF NOT EXISTS attendance_permissions (
    permission_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    shift_id UUID REFERENCES staff_shifts(shift_id) ON DELETE SET NULL,
    permission_type VARCHAR(30) NOT NULL CHECK (permission_type IN ('EarlyDeparture', 'LateArrival', 'EmergencyAccess')),
    effective_date DATE NOT NULL,
    allowed_time TIME,
    minutes_granted INT DEFAULT 0 CHECK (minutes_granted >= 0),
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
    reviewed_by UUID REFERENCES users(user_id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attendance_permissions_user_date ON attendance_permissions(user_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_attendance_permissions_status ON attendance_permissions(status);

-- 3. Comprehensive immutable attendance audit ledger
CREATE TABLE IF NOT EXISTS attendance_audit_ledger (
    audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    log_id UUID REFERENCES attendance_logs(log_id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    actor_user_id UUID NOT NULL REFERENCES users(user_id),
    action_type VARCHAR(50) NOT NULL,
    event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    previous_state JSONB,
    new_state JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    reason TEXT,
    is_violation BOOLEAN DEFAULT FALSE,
    violation_details JSONB
);

CREATE INDEX IF NOT EXISTS idx_attendance_audit_ledger_user ON attendance_audit_ledger(user_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_audit_ledger_log ON attendance_audit_ledger(log_id);
CREATE INDEX IF NOT EXISTS idx_attendance_audit_ledger_violation ON attendance_audit_ledger(is_violation) WHERE is_violation = TRUE;

-- 4. Default configuration parameters in system_settings
INSERT INTO system_settings (setting_key, setting_value, updated_at) VALUES
    ('hr.attendance.grace_period_late_minutes', '15', CURRENT_TIMESTAMP),
    ('hr.attendance.grace_period_early_minutes', '10', CURRENT_TIMESTAMP),
    ('hr.attendance.deduct_full_delay_after_grace', 'true', CURRENT_TIMESTAMP),
    ('hr.attendance.require_early_leave_approval', 'true', CURRENT_TIMESTAMP),
    ('hr.attendance.enforce_shift_login_restriction', 'false', CURRENT_TIMESTAMP),
    ('hr.attendance.login_buffer_before_minutes', '30', CURRENT_TIMESTAMP),
    ('hr.attendance.login_buffer_after_minutes', '30', CURRENT_TIMESTAMP),
    ('hr.attendance.exempt_roles_from_login_restriction', 'Admin,Developer,HR,Doctor,Radiologist,Physician', CURRENT_TIMESTAMP)
ON CONFLICT (setting_key) DO NOTHING;

-- 5. Notification event catalog entries
INSERT INTO notification_event_catalog (event_type, category, default_priority, default_channels, description, required_variables) VALUES
('AttendanceLate', 'Operational', 'Warning', '{InApp}', 'Employee clocked in late past the grace period', '["employee_name", "late_minutes"]'::jsonb),
('AttendanceEarlyDepartureAttempt', 'Operational', 'Warning', '{InApp,Email}', 'Employee attempted or performed unapproved early departure', '["employee_name", "early_minutes"]'::jsonb),
('AttendanceUnscheduled', 'Operational', 'Warning', '{InApp}', 'Employee clocked in without a scheduled roster shift', '["employee_name", "clock_in"]'::jsonb),
('AttendanceAutoAbsent', 'Operational', 'Warning', '{InApp}', 'Shift ended without attendance and was automatically marked absent', '["employee_name", "shift_date"]'::jsonb),
('AttendancePermissionFiled', 'Operational', 'Normal', '{InApp}', 'A staff member submitted an attendance permission request', '["employee_name", "permission_type"]'::jsonb),
('AttendancePermissionResolved', 'Operational', 'Normal', '{InApp}', 'An attendance permission request was approved or rejected', '["employee_name", "permission_type", "status"]'::jsonb)
ON CONFLICT (event_type) DO NOTHING;

-- Audience policies for attendance events
INSERT INTO notification_audience_policies
    (event_type, event_category, role, allowed_channels, min_priority, inapp_enabled, email_enabled, sms_enabled, whatsapp_enabled) VALUES
('AttendanceLate', NULL, 'Admin', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('AttendanceLate', NULL, 'HR', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('AttendanceEarlyDepartureAttempt', NULL, 'Admin', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
('AttendanceEarlyDepartureAttempt', NULL, 'HR', ARRAY['InApp', 'Email'], 'Warning', TRUE, TRUE, FALSE, FALSE),
('AttendanceUnscheduled', NULL, 'Admin', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('AttendanceUnscheduled', NULL, 'HR', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('AttendanceAutoAbsent', NULL, 'Admin', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('AttendanceAutoAbsent', NULL, 'HR', ARRAY['InApp'], 'Warning', TRUE, FALSE, FALSE, FALSE),
('AttendancePermissionFiled', NULL, 'Admin', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE),
('AttendancePermissionFiled', NULL, 'HR', ARRAY['InApp'], 'Normal', TRUE, FALSE, FALSE, FALSE)
ON CONFLICT (event_type, role) DO NOTHING;

-- Templates
INSERT INTO notification_templates (event_type, channel, language, subject, body) VALUES
('AttendanceLate', 'InApp', 'ar', 'تنبيه: تأخر موظف عن الوردية', 'سجل الموظف {{employee_name}} حضوراً متأخراً بـ {{late_minutes}} دقيقة بعد تجاوز فترة السماح.'),
('AttendanceLate', 'InApp', 'en', 'Alert: Late Shift Clock-In', 'Staff {{employee_name}} clocked in {{late_minutes}} minutes late past the grace period.'),
('AttendanceEarlyDepartureAttempt', 'InApp', 'ar', 'تنبيه عاجل: انصراف مبكر', 'قام الموظف {{employee_name}} بتسجيل انصراف مبكر بـ {{early_minutes}} دقيقة قبل موعد نهاية الوردية.'),
('AttendanceEarlyDepartureAttempt', 'InApp', 'en', 'Urgent: Early Departure', 'Staff {{employee_name}} departed {{early_minutes}} minutes prior to shift end.'),
('AttendanceAutoAbsent', 'InApp', 'ar', 'تسجيل غياب تلقائي لوردية منتهية', 'انتهت وردية الموظف {{employee_name}} بتاريخ {{shift_date}} دون تسجيل حضور وتم تسجيله غائباً تلقائياً.'),
('AttendanceAutoAbsent', 'InApp', 'en', 'Automatic Absence Recorded', 'Shift for {{employee_name}} on {{shift_date}} ended with no clock-in and was automatically marked absent.'),
('AttendancePermissionFiled', 'InApp', 'ar', 'طلب إذن حضور/انصراف جديد', 'قدم الموظف {{employee_name}} طلب إذن {{permission_type}} بتاريخ {{effective_date}}. يرجى المراجعة والاعتماد.'),
('AttendancePermissionFiled', 'InApp', 'en', 'New Attendance Permission Request', 'Staff {{employee_name}} submitted a {{permission_type}} request for {{effective_date}}. Please review.'),
('AttendancePermissionResolved', 'InApp', 'ar', 'تحديث حالة طلب الإذن', 'تم {{status}} طلب إذن {{permission_type}} المقدم لتاريخ {{effective_date}}.'),
('AttendancePermissionResolved', 'InApp', 'en', 'Attendance Permission Status Update', 'Your {{permission_type}} request for {{effective_date}} has been {{status}}.')
ON CONFLICT (event_type, channel, language) DO NOTHING;
