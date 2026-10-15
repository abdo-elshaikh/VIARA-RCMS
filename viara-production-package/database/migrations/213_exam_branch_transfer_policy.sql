-- Migration 213: Exam Branch Transfer RLS Policy
-- Allows transferring examinations across branches for staff holding
-- valid active memberships in both source and target branches, or for org admins.

CREATE OR REPLACE FUNCTION public.branch_transfer_target_access(p_target_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users u
        JOIN public.branches b ON b.organization_id = u.organization_id
        JOIN public.user_branch_memberships m ON m.user_id = u.user_id AND m.branch_id = b.id AND m.is_active = TRUE
        WHERE b.id = p_target_branch_id
          AND u.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND u.is_active = TRUE AND NOT u.is_service_account
          AND current_setting('app.actor_kind', true) = 'Staff'
          AND (
              u.is_org_admin = TRUE
              OR EXISTS (
                  SELECT 1 FROM public.user_branch_memberships m_curr
                  WHERE m_curr.user_id = u.user_id
                    AND m_curr.branch_id = NULLIF(current_setting('app.current_branch_id', true), '')::uuid
                    AND m_curr.is_active = TRUE
              )
          )
    );
$$;
REVOKE ALL ON FUNCTION public.branch_transfer_target_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.branch_transfer_target_access(uuid) TO rcms_app_user;

DROP POLICY IF EXISTS rls_examinations_branch_isolation ON public.examinations;
CREATE POLICY rls_examinations_branch_isolation ON public.examinations FOR ALL
USING (public.valid_branch_context() AND (public.branch_row_access(branch_id) OR public.branch_transfer_target_access(branch_id)))
WITH CHECK (public.valid_branch_context() AND (public.branch_row_access(branch_id) OR public.branch_transfer_target_access(branch_id)));

