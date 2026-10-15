-- Migration 215: Scopes license_quota_usage aggregation to the active organization
-- Ensures multi-tenant isolation so quotas for patients, users, appointments, and reports
-- are strictly filtered by organization_id.

CREATE OR REPLACE FUNCTION public.license_quota_usage(p_quota text)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
    v_org_id uuid;
    v_branch_id uuid;
    v_user_id uuid;
BEGIN
    IF NOT public.valid_branch_context() THEN
        RAISE EXCEPTION 'Signed context required' USING ERRCODE = '42501';
    END IF;

    v_branch_id := NULLIF(current_setting('app.current_branch_id', true), '')::uuid;
    v_user_id := NULLIF(current_setting('app.current_user_id', true), '')::uuid;

    -- Resolve organization ID: from current branch, then user, then fallback to default organization
    IF v_branch_id IS NOT NULL THEN
        SELECT organization_id INTO v_org_id FROM public.branches WHERE id = v_branch_id;
    END IF;
    IF v_org_id IS NULL AND v_user_id IS NOT NULL THEN
        SELECT organization_id INTO v_org_id FROM public.users WHERE user_id = v_user_id;
    END IF;
    v_org_id := COALESCE(v_org_id, '00000000-0000-4000-8000-000000000000'::uuid);

    CASE p_quota
    WHEN 'patients' THEN
        RETURN (
            SELECT count(DISTINCT p.patient_id)
            FROM public.patients p
            WHERE COALESCE(p.patient_status, 'Active') = 'Active'
              AND (
                  EXISTS (
                      SELECT 1 FROM public.appointments a
                      JOIN public.branches b ON a.branch_id = b.id
                      WHERE a.patient_id = p.patient_id AND b.organization_id = v_org_id
                  )
                  OR NOT EXISTS (
                      SELECT 1 FROM public.appointments a2
                      WHERE a2.patient_id = p.patient_id
                  )
              )
        );
    WHEN 'users' THEN
        RETURN (
            SELECT count(*)
            FROM public.users
            WHERE is_active AND NOT is_service_account
              AND (organization_id IS NULL OR organization_id = v_org_id)
        );
    WHEN 'appointments' THEN
        RETURN (
            SELECT count(*)
            FROM public.appointments a
            JOIN public.branches b ON a.branch_id = b.id
            WHERE date_trunc('month', a.created_at) = date_trunc('month', statement_timestamp())
              AND b.organization_id = v_org_id
        );
    WHEN 'reports' THEN
        RETURN (
            SELECT count(*)
            FROM public.examinations e
            JOIN public.branches b ON e.branch_id = b.id
            WHERE e.report_finalized_at >= CURRENT_DATE
              AND b.organization_id = v_org_id
        );
    ELSE
        RAISE EXCEPTION 'Unknown license quota' USING ERRCODE = '22023';
    END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.license_quota_usage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_quota_usage(text) TO rcms_app_user;
