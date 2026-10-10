ALTER TABLE employee_compensation_profiles
    ADD COLUMN IF NOT EXISTS daily_rate DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS shift_rate DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS case_rate DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS percentage_rate DECIMAL(7, 4) NOT NULL DEFAULT 0;

ALTER TABLE employee_compensation_profiles
    DROP CONSTRAINT IF EXISTS employee_compensation_salary_type_check,
    DROP CONSTRAINT IF EXISTS employee_compensation_type_amount_check,
    ADD CONSTRAINT employee_compensation_salary_type_check
        CHECK (salary_type IN ('Monthly', 'Hourly', 'Daily', 'PerShift', 'PerCase', 'ShiftAndCase', 'Percentage')),
    ADD CONSTRAINT employee_compensation_type_amount_check
        CHECK (
            (salary_type = 'Monthly' AND base_salary > 0)
            OR (salary_type = 'Hourly' AND hourly_rate > 0)
            OR (salary_type = 'Daily' AND daily_rate > 0)
            OR (salary_type = 'PerShift' AND shift_rate > 0)
            OR (salary_type = 'PerCase' AND case_rate > 0)
            OR (salary_type = 'ShiftAndCase' AND shift_rate > 0 AND case_rate > 0)
            OR (salary_type = 'Percentage' AND percentage_rate > 0 AND percentage_rate <= 100)
        ) NOT VALID;

ALTER TABLE payroll_rules
    DROP CONSTRAINT IF EXISTS payroll_rules_type_check,
    DROP CONSTRAINT IF EXISTS payroll_rules_method_check,
    DROP CONSTRAINT IF EXISTS payroll_rules_logic_check,
    ADD CONSTRAINT payroll_rules_type_check
        CHECK (rule_type IN (
            'Overtime', 'Late', 'EarlyLeave', 'Absence', 'Allowance', 'Bonus',
            'Deduction', 'Penalty', 'EmployerContribution'
        )),
    ADD CONSTRAINT payroll_rules_method_check
        CHECK (calculation_method IN (
            'FixedAmount', 'PercentageOfBase', 'PercentageOfGross',
            'PercentageOfCollections', 'HourlyMultiplier', 'PerMinute',
            'PerDay', 'PerShift', 'PerCase'
        )),
    ADD CONSTRAINT payroll_rules_logic_check
        CHECK (
            value > 0
            AND (
                (rule_type = 'Overtime' AND calculation_method IN ('HourlyMultiplier', 'FixedAmount', 'PercentageOfBase'))
                OR (rule_type IN ('Late', 'EarlyLeave') AND calculation_method IN ('PerMinute', 'FixedAmount'))
                OR (rule_type = 'Absence' AND calculation_method IN ('PerDay', 'FixedAmount'))
                OR (rule_type IN ('Allowance', 'Bonus')
                    AND calculation_method IN (
                        'FixedAmount', 'PercentageOfBase', 'PercentageOfGross',
                        'PercentageOfCollections', 'PerDay', 'PerShift', 'PerCase'
                    ))
                OR (rule_type IN ('Deduction', 'Penalty', 'EmployerContribution')
                    AND calculation_method IN ('FixedAmount', 'PercentageOfBase', 'PercentageOfGross'))
            )
            AND (calculation_method <> 'HourlyMultiplier' OR value > 1)
            AND (calculation_method NOT IN ('PercentageOfBase', 'PercentageOfGross', 'PercentageOfCollections')
                 OR value <= 100)
        ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_payroll_line_items_paid_bonus_source
    ON payroll_line_items(source_id)
    WHERE source_type = 'payroll_rules';
