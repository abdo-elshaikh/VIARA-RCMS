-- Ensure appointment overlap checks are scoped to a single modality.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE appointments
DROP CONSTRAINT IF EXISTS no_overlap;

ALTER TABLE appointments
ADD CONSTRAINT no_overlap EXCLUDE USING GIST (
    modality_id WITH =,
    tstzrange(start_time, end_time) WITH &&
) WHERE (status != 'Cancelled');
