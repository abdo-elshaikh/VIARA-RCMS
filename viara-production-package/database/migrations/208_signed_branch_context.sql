CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.branch_context_signing_key (
    singleton boolean PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    secret bytea NOT NULL CHECK (octet_length(secret) = 32)
);
REVOKE ALL ON public.branch_context_signing_key FROM PUBLIC, rcms_app_user;

CREATE OR REPLACE FUNCTION public.valid_branch_context()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE expiry bigint; proof text; payload text; signing_key bytea;
BEGIN
    expiry := NULLIF(current_setting('app.context_expires', true), '')::bigint;
    proof := current_setting('app.context_signature', true);
    IF expiry IS NULL OR expiry < extract(epoch FROM statement_timestamp())::bigint
        OR expiry > extract(epoch FROM statement_timestamp())::bigint + 180
        OR proof IS NULL OR proof !~ '^[0-9a-f]{64}$' THEN RETURN FALSE; END IF;
    SELECT secret INTO signing_key FROM public.branch_context_signing_key WHERE singleton = TRUE;
    IF signing_key IS NULL THEN RETURN FALSE; END IF;
    payload := COALESCE(current_setting('app.current_branch_id', true), '') || '|'
        || COALESCE(current_setting('app.current_user_id', true), '') || '|' || expiry::text
        || '|' || COALESCE(current_setting('app.actor_kind', true), 'Staff');
    RETURN public.hmac(convert_to(payload, 'UTF8'), signing_key, 'sha256') = decode(proof, 'hex');
EXCEPTION WHEN OTHERS THEN RETURN FALSE;
END $$;
REVOKE ALL ON FUNCTION public.valid_branch_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.valid_branch_context() TO rcms_app_user;

DO $$ DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['appointments','examinations','invoices','cashier_shifts',
        'inventory_items','stock_movements','payments','refunds','expenses','insurance_claims','waiting_list'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_' || t || '_branch_isolation', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (public.valid_branch_context() AND public.branch_row_access(branch_id)) WITH CHECK (public.valid_branch_context() AND public.branch_row_access(branch_id))',
            'rls_' || t || '_branch_isolation', t);
    END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.set_branch_context(uuid, boolean);
DROP FUNCTION IF EXISTS public.set_branch_context(uuid, uuid, boolean);
CREATE OR REPLACE FUNCTION public.set_branch_context(
    p_branch_id uuid, p_user_id uuid, p_is_org_admin boolean,
    p_signature text, p_expires bigint, p_actor_kind text DEFAULT 'Staff'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
    PERFORM set_config('app.current_branch_id', COALESCE(p_branch_id::text, ''), TRUE);
    PERFORM set_config('app.current_user_id', COALESCE(p_user_id::text, ''), TRUE);
    PERFORM set_config('app.context_signature', COALESCE(p_signature, ''), TRUE);
    PERFORM set_config('app.context_expires', COALESCE(p_expires::text, ''), TRUE);
    PERFORM set_config('app.actor_kind', p_actor_kind, TRUE);
    PERFORM set_config('app.is_org_admin', 'false', TRUE);
    IF NOT public.valid_branch_context() THEN
        RAISE EXCEPTION 'Invalid signed branch context' USING ERRCODE = '42501';
    END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_branch_context(uuid, uuid, boolean, text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_branch_context(uuid, uuid, boolean, text, bigint, text) TO rcms_app_user;
