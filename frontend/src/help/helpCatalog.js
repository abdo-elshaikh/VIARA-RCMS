import { canAccessRouteTarget } from '../config/routes';
import { getEffectivePermissions, isEmergencyAccessActive } from '../utils/effectivePermissions';

export const HELP_ROLE_ORDER = [
    'Developer',
    'Admin',
    'Radiologist',
    'Receptionist',
    'Cashier',
    'Accountant',
    'Insurance_Staff',
    'HR',
    'Technician',
    'Nurse',
    'Marketing',
    'Referring_Doctor',
];

export const HELP_TAB_IDS = ['guides', 'playbooks', 'workflows', 'protocols', 'troubleshooting', 'shortcuts'];

export const HELP_CATEGORIES = ['all', 'gettingStarted', 'clinical', 'operations', 'administration', 'account'];

export const DEFAULT_HELP_GOVERNANCE = Object.freeze({
    owner: 'Operations',
    version: '1.0',
    reviewedAt: '2026-09-10',
    status: 'published',
    riskLevel: 'medium',
});

export const ARTICLE_GOVERNANCE = Object.freeze({
    start: { owner: 'Operations', riskLevel: 'low' },
    worklist: { owner: 'Clinical Operations', riskLevel: 'clinical', permissions: ['VIEW_EXAMS'] },
    pacs_viewer: { owner: 'Radiology & IT', riskLevel: 'clinical', permissions: ['VIEW_PACS_IMAGES'] },
    pacs_recon: { owner: 'Radiology & IT', riskLevel: 'high', permissions: ['RECONCILE_STUDIES'] },
    reporting: { owner: 'Radiology', riskLevel: 'clinical', permissions: ['WRITE_REPORTS'] },
    critical_findings: { owner: 'Medical Director', riskLevel: 'clinical', permissions: ['WRITE_REPORTS'] },
    nurse_prep: { owner: 'Clinical Operations', riskLevel: 'clinical', permissions: ['MANAGE_SAFETY'] },
    patients: { owner: 'Patient Administration', riskLevel: 'high', permissions: ['VIEW_PATIENTS'] },
    appointments: { owner: 'Reception', riskLevel: 'medium', permissions: ['VIEW_APPOINTMENTS'] },
    payments: { owner: 'Finance', riskLevel: 'high', permissions: ['VIEW_INVOICES'] },
    insurance: { owner: 'Insurance', riskLevel: 'high', permissions: ['VIEW_INSURANCE'] },
    financial_reports: { owner: 'Finance', riskLevel: 'high', permissions: ['VIEW_FINANCIALS'] },
    payroll: { owner: 'HR & Finance', riskLevel: 'high', permissions: ['VIEW_PAYROLL'] },
    doctor_referrals: { owner: 'Referrals', riskLevel: 'medium', permissions: ['VIEW_REFERRING_DOCTORS'] },
    equipment: { owner: 'Biomedical Operations', riskLevel: 'medium', permissions: ['VIEW_EQUIPMENT'] },
    inventory: { owner: 'Inventory', riskLevel: 'high', permissions: ['VIEW_INVENTORY'] },
    roles_security: { owner: 'Security', riskLevel: 'high', permissions: ['MANAGE_ROLES', 'MANAGE_PROTECTED_ROLES'] },
    audit_logs: { owner: 'Security', riskLevel: 'high', permissions: ['VIEW_AUDIT_TRAILS', 'VIEW_AUDIT_LOGS'] },
    backup_archiving: { owner: 'Platform Operations', riskLevel: 'high', permissions: ['MANAGE_BACKUPS'] },
    settings_customization: { owner: 'Platform Operations', riskLevel: 'medium' },
    task_assignment: { owner: 'Clinical Operations', riskLevel: 'high', permissions: ['MANAGE_QUEUE'] },
    approvals: { owner: 'Governance', riskLevel: 'high' },
    notifications: { owner: 'Operations', riskLevel: 'low' },
    communications: { owner: 'Operations & Privacy', riskLevel: 'high', permissions: ['MANAGE_CHAT'] },
    hr_staff: { owner: 'Human Resources', riskLevel: 'high', permissions: ['VIEW_STAFF'] },
    user_management: { owner: 'Security & HR', riskLevel: 'high', permissions: ['VIEW_USERS', 'MANAGE_USERS'] },
    privacy: { owner: 'Privacy Officer', riskLevel: 'high', permissions: ['VIEW_PRIVACY_REQUESTS'] },
    integrations: { owner: 'Platform Operations', riskLevel: 'high', permissions: ['MANAGE_INTEGRATIONS'] },
    analytics_full: { owner: 'Operations Analytics', riskLevel: 'medium', permissions: ['VIEW_ANALYTICS', 'VIEW_REFERRAL_ANALYTICS'] },
    portal_workflows: { owner: 'Patient Experience', riskLevel: 'high' },
    printing: { owner: 'Operations & Privacy', riskLevel: 'high' },
});

export const getArticleGovernance = (articleId) => ({
    ...DEFAULT_HELP_GOVERNANCE,
    ...(ARTICLE_GOVERNANCE[articleId] || {}),
});

export const WORKFLOW_STAGES = [
    {
        id: 'registration',
        en: 'Registration & scheduling',
        ar: 'التسجيل والجدولة',
        roles: ['Receptionist', 'Admin'],
        route: '/appointments',
        state: 'Registered / Scheduled',
        next: 'Arrived',
        escalationEn: 'Escalate duplicate identity, resource conflict, or missing appointment data to reception supervision.',
        escalationAr: 'صعّد التكرار أو تعارض الموارد أو نقص بيانات الموعد إلى مشرف الاستقبال.',
    },
    {
        id: 'arrival',
        en: 'Arrival & payment gate',
        ar: 'الوصول والبوابة المالية',
        roles: ['Receptionist', 'Cashier', 'Accountant'],
        route: '/reception?tab=billing',
        state: 'Arrived / Payment Pending',
        next: 'Prep Pending',
        escalationEn: 'Route unpaid or partially paid invoices through the governed exception workflow.',
        escalationAr: 'مرّر الفواتير غير المسددة أو الجزئية عبر مسار الاستثناء المالي المحكوم.',
    },
    {
        id: 'preparation',
        en: 'Safety preparation',
        ar: 'التحضير وفحص السلامة',
        roles: ['Nurse', 'Radiologist'],
        route: '/nurse',
        state: 'Prep Pending',
        next: 'Ready for Exam',
        escalationEn: 'Stop when a safety domain is Unknown or At Risk and escalate to the responsible clinician.',
        escalationAr: 'أوقف المسار عند وجود مجال سلامة غير معروف أو معرض للخطر وصعّد إلى المسؤول السريري.',
    },
    {
        id: 'acquisition',
        en: 'Image acquisition',
        ar: 'تنفيذ التصوير',
        roles: ['Technician', 'Nurse'],
        route: '/modality',
        state: 'Ready for Exam / In Exam',
        next: 'Reporting',
        escalationEn: 'Report equipment downtime, missing images, identity mismatch, or contrast blockers before continuing.',
        escalationAr: 'أبلغ عن توقف الجهاز أو الصور المفقودة أو عدم تطابق الهوية أو عوائق الصبغة قبل المتابعة.',
    },
    {
        id: 'reporting',
        en: 'Reporting & approval',
        ar: 'القراءة والاعتماد',
        roles: ['Radiologist'],
        route: '/case-reports',
        state: 'Reporting',
        next: 'Finalized',
        escalationEn: 'Use an amendment for corrections after finalization and document critical-result communication separately.',
        escalationAr: 'استخدم تعديلاً موثقاً بعد الاعتماد، ووثق إبلاغ النتيجة الحرجة في مساره المنفصل.',
    },
    {
        id: 'delivery',
        en: 'Delivery & acknowledgement',
        ar: 'التسليم والإقرار',
        roles: ['Receptionist', 'Radiologist', 'Admin'],
        route: '/case-reports',
        state: 'Finalized',
        next: 'Delivered',
        escalationEn: 'Do not deliver drafts; verify recipient identity and record the delivery acknowledgement.',
        escalationAr: 'لا تسلّم المسودات؛ تحقق من هوية المستلم وسجل إقرار التسليم.',
    },
];

export const HELP_TASKS = [
    {
        id: 'task.claim-clinical',
        type: 'task',
        category: 'clinical',
        roles: ['Nurse', 'Technician', 'Radiologist', 'Admin'],
        permissions: ['MANAGE_QUEUE'],
        route: '/worklist',
        state: 'Prep Pending / Ready for Exam',
        title: { en: 'Claim and release a clinical task', ar: 'استلام وتحرير مهمة سريرية' },
        summary: { en: 'Use the correct task scope without taking work assigned to another user.', ar: 'استخدم نطاق المهمة الصحيح دون أخذ عمل مسند إلى مستخدم آخر.' },
        aliases: ['claim', 'assignment', 'unassigned', 'unassigned work', 'held', 'استلام', 'إسناد', 'غير مسندة', 'معلقة'],
        steps: {
            en: ['Open All, My tasks, or Available according to the work you need.', 'Claim only an unassigned task you can start immediately.', 'Record a hold reason when blocked and release the task when the blocker is resolved.'],
            ar: ['افتح نطاق الكل أو مهامي أو المتاحة حسب العمل المطلوب.', 'استلم فقط المهمة غير المسندة التي يمكنك بدء العمل عليها فوراً.', 'سجل سبب التعليق وحرر المهمة بعد زوال العائق.'],
        },
        escalation: { en: 'Escalate assignment conflicts to the station supervisor.', ar: 'صعّد تعارض الإسناد إلى مشرف المحطة.' },
    },
    {
        id: 'task.safety-clearance',
        type: 'task',
        category: 'clinical',
        roles: ['Nurse', 'Radiologist', 'Technician', 'Admin'],
        permissions: ['MANAGE_SAFETY'],
        route: '/nurse',
        state: 'Prep Pending',
        title: { en: 'Complete the safety checklist', ar: 'إكمال قائمة فحص السلامة' },
        summary: { en: 'Resolve pregnancy, implant, renal, and contrast screening before acquisition.', ar: 'استكمل فحص الحمل والزرعات والكلى والصبغة قبل التصوير.' },
        aliases: ['pregnancy', 'implant', 'renal', 'contrast', 'safety', 'الحمل', 'زرعات', 'كلى', 'صبغة', 'سلامة'],
        steps: {
            en: ['Review each domain and use Cleared or Not Applicable only when clinically justified.', 'Stop on Unknown or At Risk and escalate to the responsible clinician.', 'Confirm the cleared state is visible before moving the case forward.'],
            ar: ['راجع كل مجال واستخدم آمن أو غير منطبق فقط عند وجود مبرر سريري.', 'أوقف المسار عند غير معروف أو يوجد خطر وصعّد إلى المسؤول السريري.', 'تأكد من ظهور حالة السلامة المعتمدة قبل تقديم الحالة.'],
        },
        escalation: { en: 'Do not override a safety domain without the authorized clinical decision.', ar: 'لا تتجاوز مجال السلامة دون قرار سريري مخول.' },
    },
    {
        id: 'task.start-exam',
        type: 'task',
        category: 'clinical',
        roles: ['Technician', 'Admin'],
        permissions: ['PERFORM_EXAMS'],
        route: '/modality',
        state: 'Ready for Exam',
        title: { en: 'Start and complete an examination', ar: 'بدء وإكمال الفحص' },
        summary: { en: 'Move a prepared study through acquisition and hand it off for reporting.', ar: 'انقل الفحص المحضر خلال التصوير وسلمه للقراءة.' },
        aliases: ['start exam', 'in exam', 'complete study', 'بدء الفحص', 'قيد الفحص', 'إكمال'],
        steps: {
            en: ['Confirm identity, device, room, and safety status.', 'Start only an assigned task and record contrast or consumables when used.', 'Verify image quality and move the case to Reporting after acquisition.'],
            ar: ['تحقق من الهوية والجهاز والغرفة وحالة السلامة.', 'ابدأ فقط مهمة مسندة وسجل الصبغة أو المستهلكات عند استخدامها.', 'تحقق من جودة الصور وانقل الحالة إلى التقرير بعد التصوير.'],
        },
        escalation: { en: 'Use equipment downtime or PACS reconciliation when images or device readiness are blocked.', ar: 'استخدم مسار توقف الجهاز أو مطابقة PACS عند تعطل الصور أو الجاهزية.' },
    },
    {
        id: 'task.finalize-report',
        type: 'task',
        category: 'clinical',
        roles: ['Radiologist', 'Admin'],
        permissions: ['FINALIZE_REPORTS'],
        route: '/case-reports',
        state: 'Reporting',
        title: { en: 'Review, finalize, and amend a report', ar: 'مراجعة التقرير واعتماده وتعديله' },
        summary: { en: 'Complete findings and impression, sign the report, and use amendments for later corrections.', ar: 'أكمل النتائج والانطباع ووقّع التقرير واستخدم التعديل للتصحيحات اللاحقة.' },
        aliases: ['report', 'finalize', 'sign', 'amendment', 'تقرير', 'اعتماد', 'توقيع', 'تعديل'],
        steps: {
            en: ['Open a Reporting-stage case and verify the linked study.', 'Save the draft, complete required sections, and review critical findings.', 'Finalize only after clinical review; use an amendment instead of editing a locked report.'],
            ar: ['افتح حالة مرحلة التقرير وتحقق من الدراسة المرتبطة.', 'احفظ المسودة وأكمل الأقسام المطلوبة وراجع النتائج الحرجة.', 'اعتمد بعد المراجعة السريرية واستخدم تعديلاً بدلاً من تعديل تقرير مقفل.'],
        },
        escalation: { en: 'Escalate missing images or a locked report to the radiology lead or PACS support.', ar: 'صعّد الصور المفقودة أو التقرير المقفل إلى مسؤول الأشعة أو دعم PACS.' },
    },
    {
        id: 'task.collect-payment',
        type: 'task',
        category: 'operations',
        roles: ['Cashier', 'Receptionist', 'Accountant', 'Admin'],
        permissions: ['PROCESS_PAYMENTS'],
        route: '/reception?tab=billing',
        state: 'Payment Pending',
        title: { en: 'Open a shift and collect payment', ar: 'فتح الوردية وتحصيل الدفعة' },
        summary: { en: 'Collect against the correct invoice and preserve the separation between request, approval, and execution.', ar: 'حصّل على الفاتورة الصحيحة مع الحفاظ على فصل الطلب والاعتماد والتنفيذ.' },
        aliases: ['cashier', 'invoice', 'payment', 'refund', 'تحصيل', 'فاتورة', 'دفع', 'استرداد'],
        steps: {
            en: ['Open an assigned cashier shift before collecting.', 'Verify outstanding balance, payment method, and reference.', 'Route discounts, partial-payment exceptions, and refunds through their approval path.'],
            ar: ['افتح وردية خزينة مسندة قبل التحصيل.', 'تحقق من الرصيد المستحق وطريقة الدفع والمرجع.', 'مرر الخصومات واستثناءات الدفع الجزئي والاستردادات عبر مسار اعتمادها.'],
        },
        escalation: { en: 'Escalate material variances and refund decisions to accounting or an authorized supervisor.', ar: 'صعّد فروقات النقدية والاستردادات إلى المحاسبة أو المشرف المخول.' },
    },
    {
        id: 'task.insurance-claim',
        type: 'task',
        category: 'operations',
        roles: ['Insurance_Staff', 'Accountant', 'Receptionist', 'Admin'],
        permissions: ['MANAGE_INSURANCE_CLAIMS'],
        route: '/insurance?tab=claims',
        state: 'Claim Draft / Submitted / Rejected',
        title: { en: 'Submit and resubmit an insurance claim', ar: 'تقديم وإعادة تقديم المطالبة التأمينية' },
        summary: { en: 'Validate coverage, attach evidence, record payer responses, and correct rejected claims.', ar: 'تحقق من التغطية وأرفق المستندات وسجل ردود الجهة وصحح المطالبات المرفوضة.' },
        aliases: ['claim', 'payer', 'preauthorization', 'rejected', 'مطالبة', 'تأمين', 'رفض'],
        steps: {
            en: ['Verify policy, coverage, authorization, invoice, and finalized clinical references.', 'Record the payer response and rejection reason without duplicating the claim.', 'Resubmit only after documenting the corrective action.'],
            ar: ['تحقق من الوثيقة والتغطية والموافقة والفاتورة والمراجع السريرية المعتمدة.', 'سجل رد الجهة وسبب الرفض دون تكرار المطالبة.', 'أعد التقديم بعد توثيق الإجراء التصحيحي فقط.'],
        },
        escalation: { en: 'Escalate contract or coverage interpretation to the insurance lead.', ar: 'صعّد تفسير العقد أو التغطية إلى مسؤول التأمين.' },
    },
    {
        id: 'task.payroll-review',
        type: 'task',
        category: 'administration',
        roles: ['HR', 'Accountant', 'Admin'],
        permissions: ['REVIEW_PAYROLL'],
        route: '/payroll?tab=periods',
        state: 'Calculated / Reviewed / Approved / Paid / Locked',
        title: { en: 'Review and close a payroll run', ar: 'مراجعة وإقفال دورة الرواتب' },
        summary: { en: 'Validate inputs and approvals before payment and lock the period against accidental changes.', ar: 'تحقق من المدخلات والاعتمادات قبل الصرف وأغلق الفترة ضد التغييرات غير المقصودة.' },
        aliases: ['payroll', 'salary', 'period', 'lock', 'رواتب', 'فترة', 'إقفال'],
        steps: {
            en: ['Review attendance, compensation, deductions, and penalties.', 'Approve only after source counts and totals reconcile.', 'Record payment execution and lock the run when the period is complete.'],
            ar: ['راجع الحضور والتعويضات والاستقطاعات والجزاءات.', 'اعتمد بعد تطابق الأعداد والإجماليات مع المصادر.', 'سجل تنفيذ الدفع وأغلق الدورة عند اكتمال الفترة.'],
        },
        escalation: { en: 'Escalate unexplained payroll variance to HR and accounting before approval.', ar: 'صعّد فروق الرواتب غير المفسرة إلى الموارد البشرية والمحاسبة قبل الاعتماد.' },
    },
    {
        id: 'task.user-lifecycle',
        type: 'task',
        category: 'administration',
        roles: ['Admin', 'HR', 'Developer'],
        permissions: ['MANAGE_USERS'],
        route: '/users',
        state: 'Staff lifecycle',
        title: { en: 'Create, review, and deactivate a user safely', ar: 'إنشاء المستخدم ومراجعته وتعطيله بأمان' },
        summary: { en: 'Use one identity per employee, least privilege, session revocation, and audit review.', ar: 'استخدم هوية واحدة لكل موظف وأقل صلاحية وإلغاء الجلسات ومراجعة التدقيق.' },
        aliases: ['users', 'role', 'password', 'deactivate', 'مستخدمون', 'دور', 'كلمة مرور', 'تعطيل'],
        steps: {
            en: ['Create one account for one employee and assign the minimum role.', 'Review activity before changing access or resetting credentials.', 'Deactivate departed staff and revoke active sessions; never recycle an old identity.'],
            ar: ['أنشئ حساباً واحداً لكل موظف وعيّن أقل دور مطلوب.', 'راجع النشاط قبل تغيير الوصول أو إعادة الاعتماد.', 'عطّل الموظف المنتهي خدمته وألغ جلساته ولا تعِد استخدام هويته.'],
        },
        escalation: { en: 'Escalate protected-role changes and suspected compromise to the system administrator.', ar: 'صعّد تغييرات الأدوار المحمية والاشتباه بالاختراق إلى مسؤول النظام.' },
    },
];

export const HELP_TROUBLESHOOTING = [
    {
        id: 'error.queue-empty',
        type: 'troubleshooting',
        category: 'clinical',
        roles: HELP_ROLE_ORDER,
        route: '/worklist',
        title: { en: 'A task is visible in Worklist but missing from a station', ar: 'المهمة تظهر في قائمة العمل ولا تظهر في المحطة' },
        summary: { en: 'Check station, task scope, date scope, assignment, and active permissions before escalating.', ar: 'تحقق من المحطة ونطاق المهمة والتاريخ والإسناد والصلاحيات قبل التصعيد.' },
        aliases: ['empty queue', 'today cases', 'date filter', 'modality', 'nurse', 'queue', 'قائمة فارغة', 'حالات اليوم', 'التاريخ'],
        steps: {
            en: ['Switch from Today to All Active to include overdue work.', 'Confirm the station matches the current workflow stage.', 'Check All, My tasks, and Available scopes and refresh once.', 'If still missing, capture the request ID and escalate without changing the record.'],
            ar: ['بدّل من حالات اليوم إلى كل النشط لإظهار العمل المتأخر.', 'تأكد من أن المحطة تطابق مرحلة سير العمل الحالية.', 'تحقق من نطاق الكل ومهامي والمتاحة ثم حدّث مرة واحدة.', 'إذا استمرت المشكلة انسخ رقم الطلب وصعّد دون تعديل السجل.'],
        },
    },
    {
        id: 'error.pacs-missing',
        type: 'troubleshooting',
        category: 'clinical',
        roles: ['Technician', 'Radiologist', 'Admin', 'Developer'],
        route: '/pacs/reconciliation',
        title: { en: 'A DICOM study is not appearing', ar: 'دراسة DICOM لا تظهر' },
        summary: { en: 'Validate accession, patient identity, gateway delivery, and reconciliation candidates.', ar: 'تحقق من رقم الطلب وهوية المريض وتسليم البوابة ومرشحي المطابقة.' },
        aliases: ['DICOM', 'PACS', 'study missing', 'accession', 'صور مفقودة', 'مطابقة'],
        steps: {
            en: ['Search PACS Reconciliation by accession, MRN, or study UID.', 'Verify the scanner pushed the series and the gateway is healthy.', 'Link only after confirming patient and appointment identifiers.'],
            ar: ['ابحث في مطابقة PACS برقم الطلب أو MRN أو معرف الدراسة.', 'تحقق من إرسال الجهاز للسلسلة ومن صحة البوابة.', 'اربط الدراسة بعد تأكيد هوية المريض والموعد فقط.'],
        },
    },
    {
        id: 'error.access-denied',
        type: 'troubleshooting',
        category: 'account',
        roles: HELP_ROLE_ORDER,
        route: '/help?tab=troubleshooting',
        title: { en: '401, 403, or access denied', ar: '401 أو 403 أو رفض الوصول' },
        summary: { en: 'Separate expired sessions from missing role or permission claims.', ar: 'ميّز بين انتهاء الجلسة ونقص الدور أو الصلاحية.' },
        aliases: ['401', '403', 'forbidden', 'permission', 'session', 'رفض الوصول', 'جلسة'],
        steps: {
            en: ['Refresh the session by signing out and in again; do not share credentials.', 'Confirm the exact route and action that failed.', 'Ask an administrator to review effective permissions and audit events.'],
            ar: ['جدد الجلسة بتسجيل الخروج والدخول ولا تشارك بيانات الاعتماد.', 'حدد المسار والإجراء الذي فشل بدقة.', 'اطلب من المسؤول مراجعة الصلاحيات الفعالة وسجل التدقيق.'],
        },
    },
    {
        id: 'error.partial-payment',
        type: 'troubleshooting',
        category: 'operations',
        roles: ['Receptionist', 'Cashier', 'Accountant', 'Admin'],
        route: '/approvals',
        permissions: ['REQUEST_PARTIAL_PAYMENT_EXCEPTION'],
        title: { en: 'A partially paid invoice blocks clinical progress', ar: 'فاتورة جزئية تمنع تقدم الحالة السريرية' },
        summary: { en: 'Use the governed partial-payment exception instead of retrying the queue transition.', ar: 'استخدم استثناء الدفع الجزئي المحكوم بدلاً من تكرار نقل الحالة.' },
        aliases: ['partial', 'payment gate', 'exception', 'دفع جزئي', 'استثناء مالي'],
        steps: {
            en: ['Verify the invoice and outstanding balance.', 'Create the exception request with a specific reason and supporting evidence.', 'Wait for an authorized decision, then refresh the queue before continuing.'],
            ar: ['تحقق من الفاتورة والرصيد المتبقي.', 'أنشئ طلب الاستثناء بسبب محدد ومستندات داعمة.', 'انتظر القرار المخول ثم حدّث الطابور قبل المتابعة.'],
        },
    },
];

export const HELP_SHORTCUTS = [
    { id: 'global-search', type: 'shortcut', roles: HELP_ROLE_ORDER, keys: ['Ctrl', 'K'], title: { en: 'Focus global search', ar: 'التركيز على البحث العام' }, aliases: ['search', 'بحث'] },
    { id: 'report-save', type: 'shortcut', roles: ['Radiologist', 'Admin', 'Developer'], keys: ['Ctrl', 'S'], title: { en: 'Save report draft', ar: 'حفظ مسودة التقرير' }, aliases: ['save', 'حفظ'] },
    { id: 'report-finalize', type: 'shortcut', roles: ['Radiologist', 'Admin', 'Developer'], keys: ['Ctrl', 'Enter'], title: { en: 'Open finalize and sign', ar: 'فتح الاعتماد والتوقيع' }, aliases: ['finalize', 'sign', 'اعتماد', 'توقيع'] },
    { id: 'report-templates', type: 'shortcut', roles: ['Radiologist', 'Admin', 'Developer'], keys: ['Ctrl', 'Space'], title: { en: 'Open templates and macros', ar: 'فتح القوالب والماكرو' }, aliases: ['template', 'macro', 'قالب'] },
    { id: 'pacs-window-level', type: 'shortcut', roles: ['Radiologist', 'Technician', 'Admin', 'Nurse', 'Developer'], keys: ['W'], title: { en: 'Window and level tool', ar: 'أداة التباين والإضاءة' }, aliases: ['window', 'level', 'contrast', 'تباين'] },
    { id: 'pacs-measure', type: 'shortcut', roles: ['Radiologist', 'Technician', 'Admin', 'Nurse', 'Developer'], keys: ['M'], title: { en: 'Ruler measurement tool', ar: 'أداة قياس المسافة' }, aliases: ['measure', 'ruler', 'قياس'] },
    { id: 'pacs-angle', type: 'shortcut', roles: ['Radiologist', 'Technician', 'Admin', 'Nurse', 'Developer'], keys: ['A'], title: { en: 'Angle measurement tool', ar: 'أداة قياس الزاوية' }, aliases: ['angle', 'زاوية'] },
    { id: 'pacs-roi', type: 'shortcut', roles: ['Radiologist', 'Technician', 'Admin', 'Nurse', 'Developer'], keys: ['E'], title: { en: 'ROI measurement tool', ar: 'أداة قياس ROI' }, aliases: ['roi', 'area', 'كثافة'] },
    { id: 'pacs-fullscreen', type: 'shortcut', roles: ['Radiologist', 'Technician', 'Admin', 'Nurse', 'Developer'], keys: ['F'], title: { en: 'Toggle fullscreen viewer', ar: 'تبديل ملء الشاشة' }, aliases: ['fullscreen', 'ملء الشاشة'] },
    { id: 'pacs-cine', type: 'shortcut', roles: ['Radiologist', 'Technician', 'Admin', 'Nurse', 'Developer'], keys: ['Space'], title: { en: 'Play or pause cine loop', ar: 'تشغيل أو إيقاف الحركة المتتابعة' }, aliases: ['cine', 'loop', 'حركة'] },
];

export const HELP_TYPE_LABELS = {
    task: { en: 'Task', ar: 'مهمة' },
    troubleshooting: { en: 'Troubleshooting', ar: 'استكشاف خطأ' },
    shortcut: { en: 'Shortcut', ar: 'اختصار' },
    workflow: { en: 'Workflow', ar: 'مسار عمل' },
    protocol: { en: 'Protocol', ar: 'بروتوكول' },
    guide: { en: 'Guide', ar: 'دليل' },
};

const normalize = (value) => String(value || '').toLocaleLowerCase().normalize('NFKC');

export const getLocalizedHelpItem = (item, language = 'en') => {
    const alternateLanguage = language === 'ar' ? 'en' : 'ar';
    const localized = item?.[language];
    const alternate = item?.[alternateLanguage];
    if (localized && typeof localized === 'object') return localized;

    const title = item?.title;
    const summary = item?.summary || item?.description;
    const steps = item?.steps;
    return {
        title: typeof title === 'object' ? (title[language] || title[alternateLanguage] || '') : title || '',
        summary: typeof summary === 'object' ? (summary[language] || summary[alternateLanguage] || '') : summary || '',
        description: typeof item?.description === 'object'
            ? (item.description[language] || item.description[alternateLanguage] || '')
            : item?.description || '',
        steps: typeof steps === 'object' && !Array.isArray(steps)
            ? (steps[language] || steps[alternateLanguage] || [])
            : (Array.isArray(steps) ? steps : []),
    };
};

export const itemMatchesRole = (item, user = {}) => {
    const role = user?.role;
    if (!role) return false;
    return item.roles?.includes(role) || (role === 'Developer' && item.roles?.includes('Admin'));
};

export const itemHasRequiredPermissions = (item, user = {}) => {
    if (!item.permissions?.length || user?.role === 'Developer') return true;
    if (!Array.isArray(user?.permissions) && !isEmergencyAccessActive(user)) return true;
    const effective = getEffectivePermissions(user);
    return item.permissions.some((permission) => effective.has(permission));
};

export const itemCanOpen = (item, user = {}) => {
    if (!itemCanBeRead(item, user)) return false;
    if (!itemHasRequiredPermissions(item, user)) return false;
    if (!item.route) return true;
    return canAccessRouteTarget(item.route, user);
};

export const itemCanBeRead = (item, user = {}) => {
    if (!itemMatchesRole(item, user)) return false;
    return item.visibility !== 'permission' || itemHasRequiredPermissions(item, user);
};

export const buildSearchCorpus = (item, language = 'en') => {
    const localized = getLocalizedHelpItem(item, language);
    const alternate = getLocalizedHelpItem(item, language === 'ar' ? 'en' : 'ar');
    return normalize([
        localized.title,
        localized.summary,
        localized.description,
        ...(localized.steps || []),
        alternate.title,
        alternate.summary,
        alternate.description,
        ...(alternate.steps || []),
        ...(item.aliases || []),
        item.state,
        item.route,
        ...(item.permissions || []),
    ].join(' '));
};

export const getHelpCatalog = (extraItems = []) => [
    ...HELP_TASKS,
    ...HELP_TROUBLESHOOTING,
    ...HELP_SHORTCUTS,
    ...extraItems,
].filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);

export const searchHelpCatalog = (query, user = {}, language = 'en', extraItems = []) => {
    const normalizedQuery = normalize(query).trim();
    if (!normalizedQuery) return [];
    return getHelpCatalog(extraItems)
        .filter((item) => itemCanBeRead(item, user))
        .filter((item) => buildSearchCorpus(item, language).includes(normalizedQuery))
        .map((item) => ({ ...item, canOpen: itemCanOpen(item, user) }));
};

export const getRoleWorkflowStages = (role) => WORKFLOW_STAGES.filter((stage) => stage.roles.includes(role) || role === 'Developer');

export const getHelpTarget = (target) => {
    const [pathname, rawSearch = ''] = String(target || '').split('?');
    return { pathname, search: rawSearch ? `?${rawSearch}` : '' };
};

const HELP_EVENT_KEY = 'viara.help.events.v1';
const HELP_FEEDBACK_KEY = 'viara.help.feedback.v1';

const safeStorageRead = (key, fallback) => {
    try {
        return JSON.parse(localStorage.getItem(key) || '') || fallback;
    } catch {
        return fallback;
    }
};

export const recordHelpEvent = (type, payload = {}) => {
    if (typeof localStorage === 'undefined') return;
    const events = safeStorageRead(HELP_EVENT_KEY, []);
    const safePayload = {
        itemId: payload.itemId || null,
        resultCount: Number.isFinite(payload.resultCount) ? payload.resultCount : null,
        tab: payload.tab || null,
        role: payload.role || null,
    };
    events.push({ type, payload: safePayload, timestamp: new Date().toISOString() });
    localStorage.setItem(HELP_EVENT_KEY, JSON.stringify(events.slice(-100)));
};

export const getHelpFeedback = () => safeStorageRead(HELP_FEEDBACK_KEY, {});

export const saveHelpFeedback = (itemId, value) => {
    if (typeof localStorage === 'undefined') return {};
    const feedback = { ...getHelpFeedback(), [itemId]: value };
    localStorage.setItem(HELP_FEEDBACK_KEY, JSON.stringify(feedback));
    recordHelpEvent('help_feedback_submitted', { itemId });
    return feedback;
};
