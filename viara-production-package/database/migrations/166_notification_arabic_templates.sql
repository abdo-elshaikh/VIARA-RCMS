-- Provide Arabic templates for every active event/channel that currently only
-- has an English template. Required variables are kept as placeholders so the
-- Arabic path remains compatible with the notification contract.

WITH event_labels(event_type, label_ar) AS (
    VALUES
        ('ACCOUNT_LOCKED', 'قفل الحساب'),
        ('ACCOUNT_LOCKED_ACCESS', 'محاولة الوصول إلى حساب مقفل'),
        ('AI_ANALYSIS_REQUESTED', 'طلب تحليل بالذكاء الاصطناعي'),
        ('AppointmentCancelled', 'إلغاء الموعد'),
        ('AppointmentCreated', 'تأكيد الموعد'),
        ('AppointmentNoShow', 'عدم حضور المريض'),
        ('AppointmentReminder', 'تذكير بالموعد'),
        ('AppointmentRequested', 'طلب موعد جديد'),
        ('AppointmentRequestReviewed', 'مراجعة طلب الموعد'),
        ('AppointmentRescheduled', 'إعادة جدولة الموعد'),
        ('BackupCompleted', 'اكتمال النسخ الاحتياطي'),
        ('BackupFailed', 'فشل النسخ الاحتياطي'),
        ('ChatMessageReceived', 'رسالة جديدة'),
        ('ClaimApproved', 'اعتماد المطالبة'),
        ('ClaimPaid', 'سداد المطالبة'),
        ('ClaimRejected', 'رفض المطالبة'),
        ('ClaimSubmitted', 'إرسال المطالبة'),
        ('CONSENT_REVOKED', 'سحب الموافقة'),
        ('CriticalResultFinalized', 'اعتماد نتيجة حرجة'),
        ('CriticalResultEscalated', 'تصعيد نتيجة حرجة'),
        ('DATA_EXPORT_REQUESTED', 'طلب تصدير البيانات'),
        ('DocumentDownloaded', 'تنزيل المستند'),
        ('EquipmentDowntimeCreated', 'تسجيل توقف المعدات'),
        ('EquipmentDowntimeResolved', 'حل توقف المعدات'),
        ('EquipmentDowntimeUpdated', 'تحديث توقف المعدات'),
        ('EquipmentMaintenanceCreated', 'تسجيل صيانة المعدات'),
        ('EquipmentMaintenanceUpdated', 'تحديث صيانة المعدات'),
        ('ExamCreated', 'إنشاء الفحص'),
        ('ExamScheduled', 'جدولة الفحص'),
        ('ExamStatusChanged', 'تغيير حالة الفحص'),
        ('FollowUpReminder', 'تذكير بالمتابعة'),
        ('IMAGE_VIEW', 'عرض الصورة'),
        ('ItemExpired', 'انتهاء صلاحية الصنف'),
        ('LOGIN_FAILED', 'فشل تسجيل الدخول'),
        ('LowStock', 'انخفاض المخزون'),
        ('MarketingCampaign', 'حملة تسويقية'),
        ('OrderCreated', 'إنشاء الطلب'),
        ('PartialPaymentException', 'استثناء دفعة جزئية'),
        ('PACS_CONFIG_UPDATED', 'تحديث إعدادات PACS'),
        ('PaymentDue', 'استحقاق الدفع'),
        ('PaymentReceived', 'استلام الدفع'),
        ('PERMISSION_DENIED', 'رفض الصلاحية'),
        ('PrepInstructions', 'تعليمات التحضير'),
        ('PRIVACY_REQUEST_RESOLVED', 'إغلاق طلب الخصوصية'),
        ('ProfileUpdateRequested', 'طلب تحديث الملف الشخصي'),
        ('PurchaseOrderReceived', 'استلام أمر الشراء'),
        ('RefundProcessed', 'معالجة الاسترداد'),
        ('RefundRequested', 'طلب الاسترداد'),
        ('RefundReviewed', 'مراجعة الاسترداد'),
        ('ReportReady', 'جاهزية التقرير'),
        ('ResultDelivered', 'تسليم النتيجة'),
        ('STAFF_CREATED', 'إنشاء حساب موظف'),
        ('STAFF_DEACTIVATED', 'تعطيل حساب موظف'),
        ('STAFF_UPDATED', 'تحديث حساب موظف'),
        ('STUDY_EXPORTED', 'تصدير الدراسة'),
        ('STUDY_IMPORTED', 'استيراد الدراسة'),
        ('SUPPLY_ADDED_PAYMENT_DUE', 'إضافة مستلزم مع استحقاق الدفع'),
        ('TOKEN_REUSE_DETECTED', 'اكتشاف إعادة استخدام رمز الدخول'),
        ('EmergencyAccessGranted', 'منح وصول طارئ'),
        ('EmergencyAccessRevoked', 'إلغاء وصول طارئ'),
        ('PatientAppointmentNoShowNotice', 'إشعار عدم حضور المريض'),
        ('INTEGRATION_FAILED', 'فشل التكامل'),
        ('API_TOKEN_WRITE_SCOPE_DENIED', 'رفض نطاق الكتابة لرمز API'),
        ('ATTENDANCE_SESSION_AUTO_CAPPED', 'إغلاق جلسة الحضور تلقائيًا'),
        ('RECEPTION_SHIFT_AUTO_CLOSED', 'إغلاق وردية الاستقبال تلقائيًا'),
        ('AttendanceAutoAbsent', 'تسجيل الغياب تلقائيًا'),
        ('AttendanceEarlyDepartureAttempt', 'محاولة انصراف مبكر'),
        ('CASHIER_VARIANCE_REQUIRES_REVIEW', 'مراجعة فرق الصندوق'),
        ('LEAVE_REQUEST_SUBMITTED', 'إرسال طلب الإجازة'),
        ('LEAVE_REQUEST_DECIDED', 'اتخاذ قرار بشأن طلب الإجازة'),
        ('PayrollRunStatusChanged', 'تغيير حالة مسير الرواتب'),
        ('PenaltyImposed', 'فرض جزاء'),
        ('PenaltyDisputed', 'الاعتراض على الجزاء'),
        ('PenaltyDisputeResolved', 'حسم الاعتراض على الجزاء'),
        ('PenaltyCancelled', 'إلغاء الجزاء'),
        ('PayrollEmployeesSkipped', 'تخطي موظفين في مسير الرواتب'),
        ('CredentialExpiring', 'اقتراب انتهاء صلاحية الاعتماد')
), missing AS (
    SELECT DISTINCT ON (english.event_type, english.channel)
        english.event_type,
        english.channel,
        COALESCE(labels.label_ar, 'إشعار نظام VIARA') AS label_ar,
        COALESCE(catalog.required_variables, '[]'::jsonb) AS required_variables
    FROM notification_templates english
    LEFT JOIN event_labels labels ON labels.event_type = english.event_type
    LEFT JOIN notification_event_catalog catalog ON catalog.event_type = english.event_type
    WHERE english.language = 'en'
      AND english.is_active = TRUE
      AND NOT EXISTS (
          SELECT 1
          FROM notification_templates arabic
          WHERE arabic.event_type = english.event_type
            AND arabic.channel = english.channel
            AND arabic.language = 'ar'
      )
    ORDER BY english.event_type, english.channel, english.template_id
)
INSERT INTO notification_templates (event_type, channel, language, subject, body, is_active)
SELECT
    event_type,
    channel,
    'ar',
    CASE WHEN channel = 'Email' THEN label_ar ELSE NULL END,
    'تم تسجيل ' || label_ar || ' في نظام VIARA.' ||
        CASE WHEN jsonb_array_length(required_variables) > 0 THEN
            E'\n\nالتفاصيل:\n' || (
                SELECT string_agg('{{' || variable || '}}', E'\n' ORDER BY variable)
                FROM jsonb_array_elements_text(required_variables) AS variables(variable)
            )
        ELSE '' END,
    TRUE
FROM missing
ON CONFLICT (event_type, channel, language) DO UPDATE SET
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;