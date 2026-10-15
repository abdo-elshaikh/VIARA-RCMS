CREATE OR REPLACE FUNCTION public.license_quota_usage(p_quota text)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    IF NOT public.valid_branch_context() THEN RAISE EXCEPTION 'Signed context required' USING ERRCODE = '42501'; END IF;
    -- A license covers the deployment; switching branches cannot reset usage.
    CASE p_quota
    WHEN 'patients' THEN RETURN (SELECT count(*) FROM public.patients WHERE is_active);
    WHEN 'users' THEN RETURN (SELECT count(*) FROM public.users WHERE is_active AND NOT is_service_account);
    WHEN 'appointments' THEN RETURN (SELECT count(*) FROM public.appointments WHERE date_trunc('month', created_at) = date_trunc('month', statement_timestamp()));
    WHEN 'reports' THEN RETURN (SELECT count(*) FROM public.examinations WHERE report_finalized_at >= CURRENT_DATE);
    ELSE RAISE EXCEPTION 'Unknown license quota' USING ERRCODE = '22023';
    END CASE;
END;
$$;
REVOKE ALL ON FUNCTION public.license_quota_usage(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_quota_usage(text) TO rcms_app_user;
