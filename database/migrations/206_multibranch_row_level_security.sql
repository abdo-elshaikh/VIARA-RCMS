-- Migration 206: Enterprise Multi-Branch Row-Level Security (RLS) & Database-Level Defense
-- Specifications: MBT-801, MBT-802, MBT-803
-- Purpose: Provides fail-closed defense-in-depth at the PostgreSQL database engine level.
-- When queries run under the unprivileged application role (rcms_app_user), PostgreSQL
-- strictly confines queries and mutations to the transaction-scoped branch context.
-- If no branch context is set, queries FAIL CLOSED (match 0 rows, reject mutations).

-- 1. Create dedicated application role (rcms_app_user) with NOBYPASSRLS and operational grants
DO $$
DECLARE
    app_pwd text := COALESCE(NULLIF(current_setting('app.db_app_user_password', true), ''), 'rcms_app_secure_pass_2026');
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rcms_app_user') THEN
        EXECUTE format('CREATE ROLE rcms_app_user WITH LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS', app_pwd);
    ELSE
        ALTER ROLE rcms_app_user WITH NOSUPERUSER NOBYPASSRLS;
    END IF;
END $$;

DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO rcms_app_user', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO rcms_app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rcms_app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rcms_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rcms_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO rcms_app_user;

-- 2. Helper functions for setting transaction-scoped branch context (SECURITY DEFINER)
-- Hardened against arbitrary client session manipulation: validates user identity against users table
DROP FUNCTION IF EXISTS set_branch_context(uuid, boolean);
DROP FUNCTION IF EXISTS set_branch_context(uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION set_branch_context(
    p_branch_id uuid,
    p_user_id uuid DEFAULT NULL,
    p_is_org_admin boolean DEFAULT false
) RETURNS void AS $$
DECLARE
    v_actual_is_admin boolean := false;
BEGIN
    -- Independent verification of org admin privileges against users table
    IF p_user_id IS NOT NULL THEN
        SELECT (COALESCE(is_org_admin, false) = TRUE OR role = 'Developer')
        INTO v_actual_is_admin
        FROM users
        WHERE user_id = p_user_id AND is_active = TRUE;
        v_actual_is_admin := COALESCE(v_actual_is_admin, false);
    ELSIF SESSION_USER = 'postgres' THEN
        -- Allow database superuser to set admin mode for migrations/maintenance
        v_actual_is_admin := COALESCE(p_is_org_admin, false);
    ELSE
        -- Non-superuser callers without valid user_id can NEVER claim admin status
        v_actual_is_admin := false;
    END IF;

    PERFORM set_config('app.current_branch_id', COALESCE(p_branch_id::text, ''), true);
    PERFORM set_config('app.current_user_id', COALESCE(p_user_id::text, ''), true);
    PERFORM set_config('app.is_org_admin', CASE WHEN v_actual_is_admin IS TRUE THEN 'true' ELSE 'false' END, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION set_branch_context(p_branch_id uuid, p_is_org_admin boolean)
RETURNS void AS $$
BEGIN
    -- Legacy 2-arg overload: only postgres superuser may assert admin directly without user_id
    IF SESSION_USER = 'postgres' THEN
        PERFORM set_branch_context(p_branch_id, NULL, p_is_org_admin);
    ELSE
        -- rcms_app_user calling 2-arg signature without user_id cannot elevate to admin
        PERFORM set_branch_context(p_branch_id, NULL, false);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION clear_branch_context()
RETURNS void AS $$
BEGIN
    PERFORM set_config('app.current_branch_id', '', true);
    PERFORM set_config('app.current_user_id', '', true);
    PERFORM set_config('app.is_org_admin', 'false', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION set_branch_context(uuid, uuid, boolean) TO rcms_app_user;
GRANT EXECUTE ON FUNCTION set_branch_context(uuid, boolean) TO rcms_app_user;
GRANT EXECUTE ON FUNCTION clear_branch_context() TO rcms_app_user;

-- 3. Enable RLS and FORCE RLS on core operational multi-branch tables (Fail-Closed)

-- A. APPOINTMENTS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_appointments_branch_isolation ON appointments;
CREATE POLICY rls_appointments_branch_isolation ON appointments
    FOR ALL
    USING (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    )
    WITH CHECK (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    );

-- B. EXAMINATIONS
ALTER TABLE examinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE examinations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_examinations_branch_isolation ON examinations;
CREATE POLICY rls_examinations_branch_isolation ON examinations
    FOR ALL
    USING (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    )
    WITH CHECK (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    );

-- C. INVOICES
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_invoices_branch_isolation ON invoices;
CREATE POLICY rls_invoices_branch_isolation ON invoices
    FOR ALL
    USING (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    )
    WITH CHECK (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    );

-- D. CASHIER SHIFTS
ALTER TABLE cashier_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashier_shifts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_cashier_shifts_branch_isolation ON cashier_shifts;
CREATE POLICY rls_cashier_shifts_branch_isolation ON cashier_shifts
    FOR ALL
    USING (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    )
    WITH CHECK (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    );

-- E. INVENTORY ITEMS
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_inventory_items_branch_isolation ON inventory_items;
CREATE POLICY rls_inventory_items_branch_isolation ON inventory_items
    FOR ALL
    USING (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    )
    WITH CHECK (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    );

-- F. STOCK MOVEMENTS
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_stock_movements_branch_isolation ON stock_movements;
CREATE POLICY rls_stock_movements_branch_isolation ON stock_movements
    FOR ALL
    USING (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    )
    WITH CHECK (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    );

-- G. PAYMENTS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_payments_branch_isolation ON payments;
CREATE POLICY rls_payments_branch_isolation ON payments
    FOR ALL
    USING (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    )
    WITH CHECK (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    );

-- H. REFUNDS
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_refunds_branch_isolation ON refunds;
CREATE POLICY rls_refunds_branch_isolation ON refunds
    FOR ALL
    USING (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    )
    WITH CHECK (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    );

-- I. EXPENSES
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_expenses_branch_isolation ON expenses;
CREATE POLICY rls_expenses_branch_isolation ON expenses
    FOR ALL
    USING (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    )
    WITH CHECK (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    );

-- J. INSURANCE CLAIMS
ALTER TABLE insurance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_claims FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_insurance_claims_branch_isolation ON insurance_claims;
CREATE POLICY rls_insurance_claims_branch_isolation ON insurance_claims
    FOR ALL
    USING (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    )
    WITH CHECK (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    );

-- K. WAITING LIST
ALTER TABLE waiting_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiting_list FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_waiting_list_branch_isolation ON waiting_list;
CREATE POLICY rls_waiting_list_branch_isolation ON waiting_list
    FOR ALL
    USING (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    )
    WITH CHECK (
        CURRENT_USER = 'postgres'
        OR current_setting('app.is_org_admin', true) = 'true'
        OR (
            nullif(current_setting('app.current_branch_id', true), '') IS NOT NULL
            AND branch_id = (NULLIF(current_setting('app.current_branch_id', true), ''))::uuid
        )
    );
