ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_service_account boolean NOT NULL DEFAULT FALSE;
INSERT INTO public.users(user_id, full_name, email, password_hash, role, is_active, organization_id, is_org_admin, is_service_account)
SELECT md5('VIARA_SERVICE:' || o.id::text)::uuid, 'VIARA background service',
    'viara-service-' || o.id::text || '@internal.invalid', encode(gen_random_bytes(32), 'hex'),
    'Admin', FALSE, o.id, TRUE, TRUE
FROM public.organizations o
ON CONFLICT(user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.branch_row_access(p_branch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users u JOIN public.branches b ON b.organization_id = u.organization_id
        WHERE b.id = p_branch_id
          AND u.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND ((u.is_active AND NOT u.is_service_account AND current_setting('app.actor_kind', true) = 'Staff')
            OR (u.is_service_account AND current_setting('app.actor_kind', true) = 'Service'))
          AND (NULLIF(current_setting('app.current_branch_id', true), '')::uuid = p_branch_id
            OR (NULLIF(current_setting('app.current_branch_id', true), '') IS NULL AND u.is_org_admin))
          AND (u.is_org_admin OR u.role::text = 'Developer' OR EXISTS (
            SELECT 1 FROM public.user_branch_memberships m
            WHERE m.user_id = u.user_id AND m.branch_id = b.id AND m.is_active))
    );
$$;

-- Private referral projections avoid recursive RLS evaluation inside portal policies.
CREATE TABLE IF NOT EXISTS public.portal_appointment_acl (
    appointment_id uuid PRIMARY KEY, patient_id uuid, referring_doctor_id uuid
);
CREATE TABLE IF NOT EXISTS public.portal_exam_acl (
    exam_id uuid PRIMARY KEY, appointment_id uuid, patient_id uuid, external_referring_doctor_id uuid
);
REVOKE ALL ON public.portal_appointment_acl, public.portal_exam_acl FROM PUBLIC, rcms_app_user;
ALTER TABLE public.appointments NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.examinations NO FORCE ROW LEVEL SECURITY;
INSERT INTO public.portal_appointment_acl SELECT appointment_id, patient_id, referring_doctor_id FROM public.appointments
WHERE appointment_id IS NOT NULL ON CONFLICT (appointment_id) DO UPDATE SET patient_id = EXCLUDED.patient_id, referring_doctor_id = EXCLUDED.referring_doctor_id;
INSERT INTO public.portal_exam_acl SELECT exam_id, appointment_id, patient_id, external_referring_doctor_id FROM public.examinations
WHERE exam_id IS NOT NULL ON CONFLICT (exam_id) DO UPDATE SET appointment_id = EXCLUDED.appointment_id, patient_id = EXCLUDED.patient_id, external_referring_doctor_id = EXCLUDED.external_referring_doctor_id;
ALTER TABLE public.appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.examinations FORCE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.sync_portal_referral_acl()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
    IF TG_TABLE_NAME = 'appointments' THEN
        IF TG_OP = 'DELETE' THEN DELETE FROM public.portal_appointment_acl WHERE appointment_id = OLD.appointment_id;
        ELSE
            INSERT INTO public.portal_appointment_acl VALUES (NEW.appointment_id, NEW.patient_id, NEW.referring_doctor_id)
            ON CONFLICT (appointment_id) DO UPDATE SET patient_id = EXCLUDED.patient_id, referring_doctor_id = EXCLUDED.referring_doctor_id;
        END IF;
    ELSE
        IF TG_OP = 'DELETE' THEN DELETE FROM public.portal_exam_acl WHERE exam_id = OLD.exam_id;
        ELSE
            INSERT INTO public.portal_exam_acl VALUES (NEW.exam_id, NEW.appointment_id, NEW.patient_id, NEW.external_referring_doctor_id)
            ON CONFLICT (exam_id) DO UPDATE SET appointment_id = EXCLUDED.appointment_id, patient_id = EXCLUDED.patient_id, external_referring_doctor_id = EXCLUDED.external_referring_doctor_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_portal_referral_acl() FROM PUBLIC, rcms_app_user;
DROP TRIGGER IF EXISTS sync_portal_referral_acl ON public.appointments;
CREATE TRIGGER sync_portal_referral_acl AFTER INSERT OR UPDATE OR DELETE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.sync_portal_referral_acl();
DROP TRIGGER IF EXISTS sync_portal_referral_acl ON public.examinations;
CREATE TRIGGER sync_portal_referral_acl AFTER INSERT OR UPDATE OR DELETE ON public.examinations FOR EACH ROW EXECUTE FUNCTION public.sync_portal_referral_acl();

CREATE OR REPLACE FUNCTION public.portal_row_access(p_patient_id uuid, p_appointment_id uuid, p_exam_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
    SELECT CASE current_setting('app.actor_kind', true)
    WHEN 'Patient' THEN EXISTS (SELECT 1 FROM public.patients p
        WHERE p.patient_id = p_patient_id
          AND p.patient_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND p.patient_status::text = 'Active')
    WHEN 'Doctor' THEN EXISTS (
        SELECT 1 FROM public.referring_doctors d
        WHERE d.doctor_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND d.is_active AND d.portal_is_active
          AND ((p_exam_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.portal_exam_acl e LEFT JOIN public.portal_appointment_acl a ON a.appointment_id = e.appointment_id
              WHERE e.exam_id = p_exam_id AND e.patient_id = p_patient_id
              AND (e.external_referring_doctor_id = d.doctor_id OR a.referring_doctor_id = d.doctor_id)))
            OR (p_exam_id IS NULL AND p_appointment_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.portal_appointment_acl a WHERE a.appointment_id = p_appointment_id
              AND a.patient_id = p_patient_id AND a.referring_doctor_id = d.doctor_id)))
    ) ELSE FALSE END;
$$;
REVOKE ALL ON FUNCTION public.portal_row_access(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_row_access(uuid, uuid, uuid) TO rcms_app_user;

DO $$ DECLARE t text; expr text; BEGIN
    FOREACH t IN ARRAY ARRAY['appointments','examinations','invoices'] LOOP
        expr := CASE t WHEN 'examinations' THEN 'public.portal_row_access(patient_id, appointment_id, exam_id)'
            ELSE 'public.portal_row_access(patient_id, appointment_id, NULL)' END;
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'portal_' || t || '_read', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.valid_branch_context() AND %s)',
            'portal_' || t || '_read', t, expr);
    END LOOP;
END $$;
DROP POLICY IF EXISTS portal_appointments_book ON public.appointments;
DROP POLICY IF EXISTS portal_appointments_cancel ON public.appointments;
DROP POLICY IF EXISTS portal_payments_read ON public.payments;
CREATE POLICY portal_payments_read ON public.payments FOR SELECT USING (
    public.valid_branch_context() AND EXISTS (
        SELECT 1 FROM public.invoices i WHERE i.invoice_id = payments.invoice_id
          AND public.portal_row_access(i.patient_id, i.appointment_id, NULL)
    )
);
COMMENT ON COLUMN public.users.is_service_account IS 'Internal background principal: login disabled, excluded from human user quotas.';
