-- Migration: Add exclusion constraint to prevent double-booking of modalities
-- Ensures no two non-cancelled appointments for the same modality overlap in time.

ALTER TABLE appointments
ADD CONSTRAINT no_overlapping_appointments
EXCLUDE USING gist (
    modality_id WITH =,
    tstzrange(start_time, end_time) WITH &&
)
WHERE (status != 'Cancelled');
