-- Shift room assignment: staff shifts can be scoped to a room (imaging,
-- preparation, reading...) so planners can see and guard room coverage.
-- Over-staffing the same role in the same room is surfaced as a warning by
-- the API (not blocked): training and surge coverage are legitimate.

ALTER TABLE staff_shifts
    ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES rooms(room_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_shifts_room
    ON staff_shifts(room_id, start_time);
