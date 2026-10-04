-- Run immediately after historical migration 083, before payroll constraints.
-- Preserve 083's immutable checksum while retaining the fresh-install fix:
-- LATE_MINUTES was seeded with a non-functional zero deduction. Migration 117
-- rejects zero rates, and migration 147's backfill would fail on that seed.
-- Existing installations with migration 117 applied are deliberately untouched.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM schema_migrations WHERE filename = '117_hr_payroll_integrity.sql'
    ) THEN
        DELETE FROM payroll_rules
        WHERE rule_type = 'Late'
          AND name = 'Late arrival minute deduction'
          AND calculation_method = 'PerMinute'
          AND value = 0
          AND created_by IS NULL
          AND metadata = '{"code":"LATE_MINUTES"}'::jsonb;
    END IF;
END $$;
