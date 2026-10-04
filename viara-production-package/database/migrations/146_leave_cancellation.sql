-- Allow a requester to withdraw pending leave and HR/Admin to revoke approved leave.
-- The existing payroll queries intentionally consume only Approved rows.

ALTER TABLE leave_requests
    DROP CONSTRAINT IF EXISTS leave_requests_status_check;

ALTER TABLE leave_requests
    ADD CONSTRAINT leave_requests_status_check
    CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_leave_requests_active_dates
    ON leave_requests(user_id, start_date, end_date)
    WHERE status IN ('Pending', 'Approved');
