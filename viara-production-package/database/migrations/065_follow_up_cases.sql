-- Link a follow-up appointment/case to the examination it is reviewing.

ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS is_follow_up BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS prior_exam_id UUID,
    ADD COLUMN IF NOT EXISTS follow_up_reason TEXT;

ALTER TABLE examinations
    ADD COLUMN IF NOT EXISTS is_follow_up BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS prior_exam_id UUID,
    ADD COLUMN IF NOT EXISTS follow_up_reason TEXT;

ALTER TABLE appointments
    DROP CONSTRAINT IF EXISTS fk_appointments_prior_exam,
    ADD CONSTRAINT fk_appointments_prior_exam
        FOREIGN KEY (prior_exam_id) REFERENCES examinations(exam_id) ON DELETE RESTRICT,
    DROP CONSTRAINT IF EXISTS chk_appointments_follow_up_link,
    ADD CONSTRAINT chk_appointments_follow_up_link CHECK (
        (is_follow_up = TRUE AND prior_exam_id IS NOT NULL)
        OR (is_follow_up = FALSE AND prior_exam_id IS NULL)
    );

ALTER TABLE examinations
    DROP CONSTRAINT IF EXISTS fk_examinations_prior_exam,
    ADD CONSTRAINT fk_examinations_prior_exam
        FOREIGN KEY (prior_exam_id) REFERENCES examinations(exam_id) ON DELETE RESTRICT,
    DROP CONSTRAINT IF EXISTS chk_examinations_follow_up_link,
    ADD CONSTRAINT chk_examinations_follow_up_link CHECK (
        ((is_follow_up = TRUE AND prior_exam_id IS NOT NULL)
        OR (is_follow_up = FALSE AND prior_exam_id IS NULL))
        AND prior_exam_id IS DISTINCT FROM exam_id
    );

CREATE INDEX IF NOT EXISTS idx_appointments_prior_exam ON appointments(prior_exam_id)
    WHERE prior_exam_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_examinations_prior_exam ON examinations(prior_exam_id)
    WHERE prior_exam_id IS NOT NULL;
