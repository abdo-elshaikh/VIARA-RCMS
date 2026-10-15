CREATE OR REPLACE FUNCTION public.emergency_row_access(p_branch_id uuid, p_patient_id uuid, p_appointment_id uuid, p_exam_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.emergency_access_logs g
        JOIN public.users u ON u.user_id = g.user_id
        JOIN public.branches b ON b.id = p_branch_id AND b.organization_id = u.organization_id
        WHERE current_setting('app.actor_kind', true) LIKE 'Emergency:%'
          AND g.grant_id::text = split_part(current_setting('app.actor_kind', true), ':', 2)
          AND g.session_id::text = split_part(current_setting('app.actor_kind', true), ':', 3)
          AND g.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND p_branch_id = NULLIF(current_setting('app.current_branch_id', true), '')::uuid
          AND u.is_active AND NOT u.is_service_account
          AND g.organization_id = u.organization_id AND g.status = 'Active' AND g.expires_at > statement_timestamp()
          AND (g.target_branch_id IS NULL OR g.target_branch_id = p_branch_id)
          AND (g.target_resource_id IS NULL
              OR (lower(g.target_resource_type) = 'patient' AND g.target_resource_id = p_patient_id)
              OR (lower(g.target_resource_type) IN ('exam', 'examination') AND g.target_resource_id = p_exam_id)
              OR (lower(g.target_resource_type) = 'appointment' AND g.target_resource_id = p_appointment_id))
    );
$$;
REVOKE ALL ON FUNCTION public.emergency_row_access(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emergency_row_access(uuid, uuid, uuid, uuid) TO rcms_app_user;
DROP POLICY IF EXISTS emergency_appointments_read ON public.appointments;
CREATE POLICY emergency_appointments_read ON public.appointments FOR SELECT USING (
    public.valid_branch_context() AND public.emergency_row_access(branch_id, patient_id, appointment_id, NULL));
DROP POLICY IF EXISTS emergency_examinations_read ON public.examinations;
CREATE POLICY emergency_examinations_read ON public.examinations FOR SELECT USING (
    public.valid_branch_context() AND public.emergency_row_access(branch_id, patient_id, appointment_id, exam_id));
-- No emergency policies are granted for writes or financial/inventory tables.
