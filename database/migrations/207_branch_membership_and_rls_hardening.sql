-- Forward-only repair; migration 206 remains unchanged for checksum integrity.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER ROLE rcms_app_user NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- Existing inconsistent memberships must be corrected deliberately, not deleted.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.user_branch_memberships m
        JOIN public.users u ON u.user_id = m.user_id
        JOIN public.branches b ON b.id = m.branch_id
        WHERE u.organization_id IS DISTINCT FROM b.organization_id) THEN
        RAISE EXCEPTION 'Cross-organization memberships require repair before migration 207';
    END IF;
END $$;

UPDATE public.user_branch_memberships m SET role = u.role::text
FROM public.users u WHERE u.user_id = m.user_id AND m.role IS NULL;
ALTER TABLE public.user_branch_memberships ALTER COLUMN role SET NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_branch_membership_organization()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.users u JOIN public.branches b
        ON b.organization_id = u.organization_id
        WHERE u.user_id = NEW.user_id AND b.id = NEW.branch_id) THEN
        RAISE EXCEPTION 'Membership user and branch must belong to the same organization'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_membership_organization ON public.user_branch_memberships;
CREATE TRIGGER validate_membership_organization BEFORE INSERT OR UPDATE
ON public.user_branch_memberships FOR EACH ROW
EXECUTE FUNCTION public.validate_branch_membership_organization();

-- Do not trust an app.is_org_admin boolean as permission to read all organizations.
CREATE OR REPLACE FUNCTION public.branch_row_access(p_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.branches b ON b.organization_id = u.organization_id
        WHERE b.id = p_branch_id AND u.is_active = TRUE
          AND u.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND (
              NULLIF(current_setting('app.current_branch_id', true), '')::uuid = p_branch_id
              OR (NULLIF(current_setting('app.current_branch_id', true), '') IS NULL
                  AND (u.is_org_admin OR u.role::text = 'Developer'))
          )
          AND (u.is_org_admin OR u.role::text = 'Developer' OR EXISTS (
              SELECT 1 FROM public.user_branch_memberships m
              WHERE m.user_id = u.user_id AND m.branch_id = b.id AND m.is_active = TRUE
          ))
    );
$$;
REVOKE ALL ON FUNCTION public.branch_row_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.branch_row_access(uuid) TO rcms_app_user;

DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['appointments','examinations','invoices','cashier_shifts',
        'inventory_items','stock_movements','payments','refunds','expenses','insurance_claims','waiting_list'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_' || t || '_branch_isolation', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (public.branch_row_access(branch_id)) WITH CHECK (public.branch_row_access(branch_id))',
            'rls_' || t || '_branch_isolation', t);
    END LOOP;
END $$;

ALTER FUNCTION public.set_branch_context(uuid, uuid, boolean) SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_branch_context(uuid, boolean) SET search_path = pg_catalog, public;
ALTER FUNCTION public.clear_branch_context() SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.set_branch_context(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_branch_context(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_branch_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_branch_context(uuid, uuid, boolean), public.clear_branch_context() TO rcms_app_user;
