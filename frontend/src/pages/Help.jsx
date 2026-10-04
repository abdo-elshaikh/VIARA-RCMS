import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Activity,
    BarChart3,
    BookOpen,
    CalendarDays,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    ClipboardList,
    Copy,
    CreditCard,
    ExternalLink,
    FileText,
    HardDrive,
    HelpCircle,
    Keyboard,
    LifeBuoy,
    Megaphone,
    Search,
    Settings,
    ShieldCheck,
    Sparkles,
    Stethoscope,
    Users,
    Wifi,
    WifiOff,
    Wrench,
    X,
    Zap,
    Cpu,
    Check,
    AlertTriangle,
    FileSpreadsheet,
    ShieldAlert,
    PhoneCall,
    Layers,
    SlidersHorizontal,
    Printer,
    Radio,
    Clock,
    Lock,
    Eye,
    CheckSquare,
    Bookmark,
    Database,
    FileCode,
    Award,
    HeartPulse,
    Scan,
    Droplets,
    FileQuestion,
    GitBranch,
    Shield,
    BadgeAlert,
    RadioTower
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { selectCurrentUser } from '../store/authSlice';
import { VIARA_BRAND } from '../config/brand';
import { canAccessRouteTarget } from '../config/routes';
import { getEffectivePermissions } from '../utils/effectivePermissions';
import PageHeader from '../components/ui/PageHeader';
import {
    HELP_CATEGORIES,
    HELP_ROLE_ORDER,
    HELP_TAB_IDS,
    HELP_SHORTCUTS,
    HELP_TROUBLESHOOTING,
    HELP_TYPE_LABELS,
    HELP_TASKS,
    WORKFLOW_STAGES,
    buildSearchCorpus,
    getRoleWorkflowStages,
    getArticleGovernance,
    getHelpFeedback,
    getLocalizedHelpItem,
    itemCanBeRead,
    itemCanOpen,
    recordHelpEvent,
    saveHelpFeedback,
    searchHelpCatalog,
} from '../help/helpCatalog';

/* ── Role Definitions & Playbooks ──────────────────────────── */
const ALL_STAFF = ['Developer', 'Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'Insurance_Staff', 'Referring_Doctor', 'HR', 'Technician', 'Nurse', 'Marketing'];

const ROLE_PLAYBOOKS = [
    {
        role: 'Radiologist',
        title: 'Radiologist & Reporting Physician',
        titleAr: 'طبيب الأشعة وكتابة التقارير',
        icon: Stethoscope,
        color: 'cyan',
        summary: 'Review imaging studies, dictate findings, compare prior scans, and electronically sign diagnostic reports.',
        summaryAr: 'مراجعة الفحوصات الطبية، كتابة وتدقيق التقارير، مقارنة الدراسات السابقة، والاعتماد والتوقيع الإلكتروني.',
        checklist: [
            { en: 'Review STAT and emergency cases in Clinical Worklist', ar: 'مراجعة الحالات الطارئة والعاجلة (STAT) في قائمة الفحوصات' },
            { en: 'Launch DICOM Web Viewer to review multi-frame series & MPR', ar: 'فتح مستعرض DICOM ثلاثي الأبعاد لمراجعة السلاسل ومقاطع MPR' },
            { en: 'Load report structured templates and dictate impressions', ar: 'استدعاء القوالب السريرية الجاهزة وتوثيق النتائج والاستنتاج' },
            { en: 'Flag critical unexpected findings and electronically sign', ar: 'تفعيل تنبيه النتائج الحرجة وتوقيع التقرير إلكترونياً' }
        ],
        primaryRoutes: [
            { name: 'Clinical Worklist', nameAr: 'قائمة الفحوصات الطبية', path: '/worklist' },
            { name: 'PACS Reconciliation', nameAr: 'مطابقة دراسات PACS', path: '/pacs/reconciliation' }
        ]
    },
    {
        role: 'Technician',
        title: 'Radiology Modality Technician',
        titleAr: 'فني التصوير والتشغيل بالأشعة',
        icon: HardDrive,
        color: 'teal',
        summary: 'Prepare patients, set machine protocols (MRI, CT, X-Ray, US), monitor scan execution, and push DICOM studies.',
        summaryAr: 'تحضير المرضى، اختيار بروتوكول الجهاز المناسب، مراقبة التصوير، وإرسال الدراسات إلى خادم PACS.',
        checklist: [
            { en: 'Verify patient safety screening (MRI implants, contrast allergy)', ar: 'التحقق من نموذج السلامة (الزرعات المعدنية وحساسية الصبغة)' },
            { en: 'Select the approved acquisition protocol and review device dose indicators when the configured modality exposes them', ar: 'اختر بروتوكول التصوير المعتمد وراجع مؤشرات جرعة الجهاز عندما يتيحها الجهاز المتكامل' },
            { en: 'Confirm image quality and send series to PACS gateway', ar: 'التأكد من جودة الصور وإرسال السلاسل لخادم الـ PACS' },
            { en: 'Log contrast consumables used (Batch & Volume)', ar: 'تسجيل الصبغات والمستهلكات المستخدمة (رقم التشغيلة والكمية)' }
        ],
        primaryRoutes: [
            { name: 'Worklist Queue', nameAr: 'قائمة الانتظار والتشغيل', path: '/worklist' },
            { name: 'Equipment Fleet', nameAr: 'جاهزية أسطول الأجهزة', path: '/equipment' }
        ]
    },
    {
        role: 'Receptionist',
        title: 'Front-Desk & Patient Coordination',
        titleAr: 'الاستقبال وتنسيق المواعيد',
        icon: Users,
        color: 'blue',
        summary: 'Register new patients, verify identity documents, manage multi-room appointment schedules, and coordinate waiting flow.',
        summaryAr: 'تسجيل المرضى، التحقق من بطاقات الهوية، جدولة المواعيد عبر التقويم متعدد الغرف، وتنظيم قائمة الانتظار.',
        checklist: [
            { en: 'Check duplicate patient records before registering new MRN', ar: 'فحص السجلات المتطابقة قبل إنشاء رقم ملف طبي جديد' },
            { en: 'Book examination slot based on modality room availability', ar: 'حجز موعد الفحص بناءً على توفر غرفة وجهاز التصوير' },
            { en: 'Confirm preparation instructions (Fasting, renal creatinine test)', ar: 'تأكيد تعليمات التحضير مع المريض (الصيام، فحص وظائف الكلى)' },
            { en: 'Check-in arriving patients and mark status as Arrived/In Preparation', ar: 'تسجيل وصول المريض وتحديث حالته إلى (وصل / قيد التحضير)' }
        ],
        primaryRoutes: [
            { name: 'Patient Directory', nameAr: 'دليل وسجل المرضى', path: '/patients' },
            { name: 'Appointments Calendar', nameAr: 'تقويم المواعيد', path: '/appointments' }
        ]
    },
    {
        role: 'Cashier',
        title: 'Cashier & Point-of-Sale Billing',
        titleAr: 'الخزينة والفواتير والتحصيل',
        icon: CreditCard,
        color: 'amber',
        summary: 'Open cashier shifts, issue study invoices, handle multi-currency payments & split settlement, and close daily balances.',
        summaryAr: 'فتح وردية الخزينة، إصدار فواتير الفحوصات، استلام المدفوعات بمختلف الطرق، وإقفال ومطابقة الوردية.',
        checklist: [
            { en: 'Open shift and enter verified initial opening float', ar: 'فتح الوردية وإدخال رصيد العهدة النقدية الافتتاحية' },
            { en: 'Apply insurer copay percentage and patient deductible', ar: 'تطبيق نسبة التحمل التأميني وحساب المبلغ الصافي على المريض' },
            { en: 'Process cash, card, or electronic wallet payments and issue receipt', ar: 'استلام الدفع (نقدي/بطاقة/محفظة) وطباعة الإيصال المالي' },
            { en: 'Perform end-of-shift cash count and print closing summary', ar: 'جرد النقدية عند نهاية الوردية وطباعة تقرير الإقفال المالي' }
        ],
        primaryRoutes: [
            { name: 'Cashier Workspace', nameAr: 'شاشة الخزينة والفواتير', path: '/reception' },
            { name: 'Financial Overview', nameAr: 'التقارير المالية', path: '/financials' }
        ]
    },
    {
        role: 'Admin',
        title: 'System Administrator & Governance',
        titleAr: 'مدير النظام والحوكمة والأمان',
        icon: ShieldCheck,
        color: 'rose',
        summary: 'Manage user access permissions, monitor audit logs, configure PACS/DICOM nodes, and schedule database backups.',
        summaryAr: 'إدارة صلاحيات المستخدمين، مراقبة سجلات التدقيق، ضبط خوادم PACS، ومتابعة النسخ الاحتياطي.',
        checklist: [
            { en: 'Audit high-risk permission changes and failed login attempts', ar: 'تدقيق تغييرات الصلاحيات الحساسة ومحاولات الدخول غير المصرح بها' },
            { en: 'Verify DICOM Echo connectivity to all modality scanners', ar: 'فحص اتصال DICOM Echo بجميع أجهزة الأشعة' },
            { en: 'Review daily automated database backup status and storage health', ar: 'التأكد من اكتمال النسخ الاحتياطي التلقائي ومساحة التخزين' },
            { en: 'Manage staff roles and password reset requests', ar: 'إدارة أدوار الموظفين وتعيين وتجديد كلمات المرور' }
        ],
        primaryRoutes: [
            { name: 'User Management', nameAr: 'إدارة المستخدمين', path: '/users' },
            { name: 'System Settings', nameAr: 'إعدادات النظام والأمان', path: '/settings' },
            { name: 'Audit Trails', nameAr: 'سجلات التدقيق والأمان', path: '/settings?tab=auditLogs' }
        ]
    },
    {
        role: 'Nurse', title: 'Nursing & Patient Preparation', titleAr: 'التمريض وتحضير المرضى', icon: HeartPulse, color: 'emerald',
        summary: 'Receive arrived patients, complete safety screening, document preparation, and hand off safely to modality staff.',
        summaryAr: 'استلام المرضى الواصلين، استكمال فحوص السلامة والتحضير، وتسليم الحالة بأمان لفني الجهاز.',
        checklist: [
            { en: 'Review All visible tasks for assigned and unassigned preparation cases', ar: 'راجع كل المهام الظاهرة للحالات المسندة وغير المسندة في التحضير' },
            { en: 'Claim only an unassigned task you can start immediately', ar: 'استلم فقط المهمة غير المسندة التي يمكنك بدء العمل عليها فوراً' },
            { en: 'Document MRI implants, pregnancy, renal screening, and contrast risks in the available safety fields', ar: 'وثق زرعات MRI والحمل وفحص الكلى ومخاطر الصبغة في حقول السلامة المتاحة' },
            { en: 'Advance the patient only when preparation and payment gates are complete', ar: 'قدّم المريض للمرحلة التالية فقط بعد اكتمال التحضير والبوابة المالية' }
        ],
        primaryRoutes: [{ name: 'Nurse Workspace', nameAr: 'مساحة عمل التمريض', path: '/nurse' }, { name: 'Clinical Worklist', nameAr: 'قائمة العمل السريري', path: '/worklist' }]
    },
    {
        role: 'Accountant', title: 'Accounting & Financial Governance', titleAr: 'المحاسبة والحوكمة المالية', icon: BarChart3, color: 'purple',
        summary: 'Control receivables, expenses, insurer settlements, commissions, periods, payroll approval, and financial reporting.',
        summaryAr: 'إدارة الذمم والمصروفات وتسويات التأمين والعمولات والفترات واعتماد الرواتب والتقارير المالية.',
        checklist: [
            { en: 'Review branch revenue, unpaid invoices, claim receipts, and daily variances', ar: 'راجع إيرادات الفروع والفواتير غير المسددة وإيصالات المطالبات وفروق الإقفال' },
            { en: 'Approve governed refunds, payroll, and financial exceptions with evidence', ar: 'اعتمد الاستردادات والرواتب والاستثناءات المالية وفق المستندات' },
            { en: 'Record expenses and commission settlements with valid references', ar: 'سجل المصروفات وتسويات العمولات بمراجع صحيحة' },
            { en: 'Finalize periods only after source counts and totals reconcile', ar: 'أغلق الفترات فقط بعد تطابق أعداد المصادر والإجماليات' }
        ],
        primaryRoutes: [{ name: 'Financials', nameAr: 'الماليات', path: '/financials' }, { name: 'Payroll', nameAr: 'الرواتب', path: '/payroll' }, { name: 'Insurance', nameAr: 'التأمين', path: '/insurance' }]
    },
    {
        role: 'Insurance_Staff', title: 'Insurance Authorization & Claims', titleAr: 'الموافقات والمطالبات التأمينية', icon: Shield, color: 'sky',
        summary: 'Validate policies and coverage, manage pre-authorization, submit claims, and resolve payer responses.',
        summaryAr: 'التحقق من الوثائق والتغطية وإدارة الموافقات المسبقة وتقديم المطالبات ومعالجة ردود الشركات.',
        checklist: [
            { en: 'Review expiring policies and pending pre-authorization requests', ar: 'راجع الوثائق القريبة من الانتهاء وطلبات الموافقة المسبقة' },
            { en: 'Attach the correct exam, invoice, prescription, and signed report', ar: 'اربط الفحص والفاتورة والروشتة والتقرير المعتمد الصحيح' },
            { en: 'Record rejection reasons and corrective action before resubmission', ar: 'سجل سبب الرفض والإجراء التصحيحي قبل إعادة التقديم' },
            { en: 'Reconcile claim receipts with paid and partially paid claims', ar: 'طابق إيصالات التحصيل مع المطالبات المدفوعة والمدفوعة جزئياً' }
        ],
        primaryRoutes: [{ name: 'Insurance Workbench', nameAr: 'منصة التأمين', path: '/insurance' }, { name: 'Approvals', nameAr: 'الموافقات', path: '/approvals' }]
    },
    {
        role: 'HR', title: 'Human Resources & Payroll Operations', titleAr: 'الموارد البشرية وعمليات الرواتب', icon: Users, color: 'emerald',
        summary: 'Maintain staff profiles, attendance, shifts, leave, compensation, payroll review, and employee access lifecycle.',
        summaryAr: 'إدارة ملفات الموظفين والحضور والورديات والإجازات والتعويضات ومراجعة الرواتب ودورة الحسابات.',
        checklist: [
            { en: 'Review attendance exceptions, leave requests, and staffing gaps', ar: 'راجع استثناءات الحضور وطلبات الإجازة ونقص التغطية' },
            { en: 'Maintain current compensation profiles before payroll calculation', ar: 'حدّث ملفات التعويضات قبل احتساب الرواتب' },
            { en: 'Review payroll employee items and deductions before approval', ar: 'راجع عناصر الموظفين والاستقطاعات قبل اعتماد الرواتب' },
            { en: 'Deactivate departed staff and verify their sessions and access are revoked', ar: 'عطّل حسابات المنتهية خدمتهم وتأكد من إلغاء جلساتهم وصلاحياتهم' }
        ],
        primaryRoutes: [{ name: 'HR Workspace', nameAr: 'مساحة الموارد البشرية', path: '/hr' }, { name: 'Payroll', nameAr: 'الرواتب', path: '/payroll' }, { name: 'Approvals', nameAr: 'الموافقات', path: '/approvals' }]
    },
    {
        role: 'Marketing', title: 'CRM, Campaigns & Patient Experience', titleAr: 'إدارة العلاقات والحملات وتجربة المريض', icon: Megaphone, color: 'pink',
        summary: 'Build consent-aware segments, coordinate campaigns, analyze referrals, and close patient-experience tasks.',
        summaryAr: 'إنشاء شرائح تحترم الموافقات وتنسيق الحملات وتحليل الإحالات ومتابعة تجربة المريض.',
        checklist: [
            { en: 'Review communication consent before adding any campaign recipient', ar: 'تحقق من موافقة التواصل قبل إضافة أي مستلم للحملة' },
            { en: 'Monitor queued, sent, failed, skipped, and converted recipients', ar: 'راقب المستلمين المنتظرين والمرسلين والفاشلين والمتجاوزين والمتحولين' },
            { en: 'Respond to feedback without exposing clinical details', ar: 'تعامل مع التقييمات دون كشف تفاصيل سريرية' },
            { en: 'Use analytics to compare campaigns, referrals, and retention', ar: 'استخدم التحليلات لمقارنة الحملات والإحالات والاحتفاظ' }
        ],
        primaryRoutes: [{ name: 'Marketing & CRM', nameAr: 'التسويق وCRM', path: '/marketing' }, { name: 'Analytics', nameAr: 'التحليلات', path: '/analytics' }]
    },
    {
        role: 'Developer', title: 'Developer & Platform Operations', titleAr: 'المطور وتشغيل المنصة', icon: FileCode, color: 'indigo',
        summary: 'Operate integrations, PACS, backups, security diagnostics, notification delivery, database controls, and technical support.',
        summaryAr: 'تشغيل التكاملات وPACS والنسخ الاحتياطي والتشخيصات الأمنية وتسليم الإشعارات وضوابط قاعدة البيانات.',
        checklist: [
            { en: 'Review integration health, retries, webhook signatures, and dead letters', ar: 'راجع صحة التكاملات والمحاولات والتوقيعات والرسائل الميتة' },
            { en: 'Monitor PACS reconciliation, storage, MWL, and AI worker health', ar: 'راقب مطابقة PACS والتخزين وMWL وعمال الذكاء الاصطناعي' },
            { en: 'Verify backups and test restore procedures without using production data', ar: 'تحقق من النسخ واختبر الاستعادة دون استخدام بيانات الإنتاج' },
            { en: 'Use audit diagnostics and least-privilege controls for support work', ar: 'استخدم تشخيصات التدقيق وأقل صلاحية في أعمال الدعم' }
        ],
        primaryRoutes: [{ name: 'System Settings', nameAr: 'إعدادات النظام', path: '/settings' }, { name: 'PACS Reconciliation', nameAr: 'مطابقة PACS', path: '/pacs/reconciliation' }, { name: 'Audit Logs', nameAr: 'سجلات التدقيق', path: '/settings?tab=auditLogs' }]
    },
    {
        role: 'Referring_Doctor', title: 'Referring Doctor Portal', titleAr: 'بوابة الطبيب المحول', icon: Stethoscope, color: 'blue',
        summary: 'Submit referral context, follow report readiness, acknowledge critical communication, and message the imaging center securely.',
        summaryAr: 'إرسال سياق الإحالة ومتابعة جاهزية التقرير وتأكيد البلاغات الحرجة ومراسلة مركز الأشعة بأمان.',
        checklist: [
            { en: 'Verify patient and referral identifiers before opening a result', ar: 'تحقق من هوية المريض والإحالة قبل فتح النتيجة' },
            { en: 'Review finalized reports and relevant images only for referred cases', ar: 'راجع التقارير المعتمدة والصور للحالات المحولة فقط' },
            { en: 'Acknowledge critical-result communication promptly', ar: 'أكد استلام بلاغ النتيجة الحرجة فوراً' },
            { en: 'Use secure portal messaging for clinical clarification', ar: 'استخدم رسائل البوابة الآمنة للاستفسارات السريرية' }
        ],
        primaryRoutes: [{ name: 'Profile & Security', nameAr: 'الملف والأمان', path: '/profile' }, { name: 'Notifications', nameAr: 'الإشعارات', path: '/notifications' }]
    }
];

/* ── Clinical Modality Protocols & Patient Preparation Dataset ─── */
const CLINICAL_PROTOCOLS = [
    {
        id: 'mri',
        modality: 'MRI (Magnetic Resonance Imaging)',
        modalityAr: 'الرنين المغناطيسي (MRI)',
        icon: Scan,
        color: 'cyan',
        exams: [
            {
                name: 'Brain MRI with Diffusion & TOF MRA',
                nameAr: 'رنين مغناطيسي على المخ مع شرايين المخ',
                fasting: 'None (unless contrast planned)',
                fastingAr: 'لا يشترط الصيام (إلا في حالة استخدام الصبغة 4 ساعات)',
                prep: 'Screen for pacemaker, aneurysm clips, metal implants, and pregnancy. Remove all jewelry.',
                prepAr: 'فحص السلامة للمنظم القلبي والزرعات المعدنية. خلع كافة المجوهرات والبطاقات الممغنطة.',
                contrast: 'Gadolinium (0.1 mmol/kg) if ordered. Serum creatinine & eGFR check mandatory.',
                contrastAr: 'صبغة الجادولينيوم عند الطلب. فحص وظائف الكلى (Creatinine) إلزامي قبل الحقن.'
            },
            {
                name: 'Abdomen / Pelvis MRCP (Biliary Tree)',
                nameAr: 'رنين مغناطيسي على القنوات المرارية والبنكرياس (MRCP)',
                fasting: 'Strict 6 hours fasting prior to examination.',
                fastingAr: 'صيام تام لمدة 6 ساعات متواصلة قبل الفحص.',
                prep: 'Drink 200ml pineapple juice or negative oral contrast 15 mins before scan to suppress bowel signal.',
                prepAr: 'تناول عصير الأناناس أو صبغة فموية سالبة قبل الفحص بـ 15 دقيقة لتثبيط إشارة الأمعاء.',
                contrast: 'Non-contrast MRCP or IV dynamic contrast depending on referring physician protocol.',
                contrastAr: 'بدون صبغة للقنوات المرارية أو مع الصبغة الديناميكية حسب طلب الطبيب المعالج.'
            }
        ]
    },
    {
        id: 'ct',
        modality: 'Computed Tomography (CT Scan)',
        modalityAr: 'الأشعة المقطعية متعددة المقاطع (CT)',
        icon: HardDrive,
        color: 'teal',
        exams: [
            {
                name: 'CT Angiography Pulmonary (PE Protocol)',
                nameAr: 'أشعة مقطعية لشرايين الرئة (استبعاد الجلطة الرئوية)',
                fasting: '4 hours fasting for IV contrast.',
                fastingAr: 'صيام 4 ساعات عن الطعام قبل حقن الصبغة الوريدية.',
                prep: 'Insert wide-bore 18G or 20G IV cannula in antecubital fossa for high-flow power injection (4-5 mL/s).',
                prepAr: 'تركيب كانيولا خضراء أو وردية (18G أو 20G) في مفصل الكوع لتحمل ضغط الحاقن الآلي السريع.',
                contrast: 'Non-ionic iodinated contrast (60-80 mL) with saline chaser bolus tracking.',
                contrastAr: 'صبغة يودية غير أيونية (60-80 مل) مع تتبع وصول الصبغة للشريان الرئوي (Bolus Tracking).'
            },
            {
                name: 'Triphasic CT Abdomen & Pelvis',
                nameAr: 'أشعة مقطعية ثلاثية المراحل على البطن والحوض (Triphasic)',
                fasting: '6 hours fasting. Oral hydration with water.',
                fastingAr: 'صيام 6 ساعات عن الطعام، مع شرب الماء لتحسين الرؤية.',
                prep: 'Verify renal clearance (eGFR > 30 mL/min). Check for prior adverse contrast reaction.',
                prepAr: 'التأكد من وظائف الكلى وسلامة المريض من أي حساسية سابقة لمركبات اليود.',
                contrast: 'Arterial, portal venous, and delayed equilibrium phase acquisition.',
                contrastAr: 'تصوير ثلاثي المراحل: مرحلة شريانية، وريدية بابية، ومرحلة متأخرة.'
            }
        ]
    },
    {
        id: 'us',
        modality: 'Ultrasound & Color Doppler',
        modalityAr: 'الموجات فوق الصوتية والدوبلر الملون',
        icon: Activity,
        color: 'blue',
        exams: [
            {
                name: 'Abdominal & Hepatobiliary Ultrasound',
                nameAr: 'سونار البطن والكبد والمرارة',
                fasting: 'Strict 6 to 8 hours fasting (water permitted).',
                fastingAr: 'صيام تام من 6 إلى 8 ساعات عن الطعام (مسموح بشرب الماء فقط).',
                prep: 'Fasting ensures gallbladder distension and minimizes bowel gas shadowing.',
                prepAr: 'الصيام ضروري لامتلاء المرارة وتجنب الغازات المعوية التي تعيق وضوح الفحص.',
                contrast: 'None required.',
                contrastAr: 'لا يتطلب أي صبغات.'
            },
            {
                name: 'Pelvic & Urinary Bladder Ultrasound',
                nameAr: 'سونار الحوض والمثانة والبروستاتا',
                fasting: 'No food restriction.',
                fastingAr: 'لا يشترط الصيام عن الطعام.',
                prep: 'Drink 1 Liter of water 1 hour before examination and do NOT void bladder.',
                prepAr: 'شرب 1 لتر من الماء قبل الفحص بساعة واحدة وعدم التبول لامتلاء المثانة تماماً.',
                contrast: 'None required.',
                contrastAr: 'لا يتطلب أي صبغات.'
            }
        ]
    },
    {
        id: 'xray',
        modality: 'Digital X-Ray & Fluoroscopy',
        modalityAr: 'الأشعة السينية الرقمية والفحص التلفزيوني',
        icon: RadioTower,
        color: 'amber',
        exams: [
            {
                name: 'Digital Chest X-Ray PA & Lateral',
                nameAr: 'أشعة سينية رقمية على الصدر (أمامي وجانبي)',
                fasting: 'None.',
                fastingAr: 'لا يشترط الصيام.',
                prep: 'Remove metallic necklaces, bras with underwires, and clothing with metal zippers or buttons.',
                prepAr: 'خلع السلاسل المعدنية والملابس المحتوية على أزرار أو سوست معدنية.',
                contrast: 'None.',
                contrastAr: 'بدون صبغة.'
            }
        ]
    }
];

/* ── Comprehensive bilingual knowledge-base articles ───────────────── */
const ARTICLES = [
    // 1. Getting Started
    {
        id: 'start',
        category: 'gettingStarted',
        icon: BookOpen,
        roles: ALL_STAFF,
        route: '/dashboard',
        color: 'emerald',
        titleEn: 'Getting Started & Workspace Navigation',
        titleAr: 'دليل البدء السريع والتنقل في النظام',
        descEn: 'Master dashboard widgets, quick search, global alerts, and customized preferences.',
        descAr: 'فهم مؤشرات لوحة القيادة، البحث السريع، التنبيهات المباشرة، وتخصيص إعدادات الحساب.',
        stepsEn: [
            'Log in with your credentials and check the role dashboard for today’s active workload.',
            'Use Ctrl + K from any screen to search patients, jump to modules, and open records you have access to.',
            'Open Settings to set your display theme (Dark/Light), preferred language, and digital signature.'
        ],
        stepsAr: [
            'سجل الدخول ببياناتك المعتمدة واطلع على بطاقات ومؤشرات العمل اليومية الخاصة برتبتك.',
            'استخدم الاختصار (Ctrl + K) من أي مكان للبحث عن المرضى أو الانتقال المباشر لأي شاشة.',
            'افتح الإعدادات لضبط مظهر الواجهة (ليلي/نهاري)، واللغة المفضلة، وحفظ التوقيع الإلكتروني.'
        ]
    },

    // 2. Clinical Worklist
    {
        id: 'worklist',
        category: 'clinical',
        icon: ClipboardList,
        roles: ['Admin', 'Radiologist', 'Technician', 'Nurse', 'Developer'],
        route: '/worklist',
        color: 'teal',
        titleEn: 'Clinical Worklist & Modality Execution Queue',
        titleAr: 'قائمة الفحوصات الطبية والتشغيل السريري',
        descEn: 'Track scheduled scans, manage modality preparation, and prioritize emergency STAT exams.',
        descAr: 'متابعة جدول الفحوصات اليومية، إدارة تحضير المرضى، وإعطاء الأولوية القصوى لحالات الطوارئ.',
        stepsEn: [
            'Filter the worklist by date, modality (MRI, CT, XR, US), or priority status (STAT/Routine).',
            'Update study status to "In Progress" when the patient enters the examination room.',
            'Inspect patient renal creatinine labs, allergy history, and contrast volume before scanning.',
            'Mark the study as "Completed" to instantly transfer images to the radiologist queue.'
        ],
        stepsAr: [
            'قم بتصفية القائمة حسب التاريخ، أو نوع الجهاز (MRI, CT, XR, US)، أو الأولوية (طوارئ STAT / روتيني).',
            'قم بتحديث حالة الفحص إلى (قيد الفحص) فور دخول المريض إلى غرفة الأشعة.',
            'راجع نتائج فحص وظائف الكلى للمريض، وتاريخ الحساسية، وجرعة الصبغة المحددة.',
            'اضغط على (اكتمل الفحص) لإتاحة الصور فوراً في قائمة الطبيب لكتابة التقرير.'
        ]
    },

    // 3. DICOM PACS Viewer
    {
        id: 'pacs_viewer',
        category: 'clinical',
        icon: HardDrive,
        roles: ['Admin', 'Radiologist', 'Technician', 'Nurse', 'Developer'],
        route: '/pacs/viewer',
        color: 'cyan',
        titleEn: 'DICOM Web Viewer & Diagnostic Imaging Tools',
        titleAr: 'مستعرض صور الأشعة DICOM وأدوات القياس',
        descEn: 'High-performance diagnostic image viewing with window/level presets and calibrated measurement tools.',
        descAr: 'عرض تشخيصي عالي الدقة لصور الأشعة مع إعدادات التباين والإضاءة وأدوات قياس بدقة ميليمترية.',
        stepsEn: [
            'Click the DICOM icon next to any completed study to launch the medical image viewer.',
            'Use keyboard shortcut (W) for Window/Level presets (Bone, Soft Tissue, Lung, Brain).',
            'Use (Z) for Zoom, (P) for Pan, (M) for calibrated distance, and (A) for angle measurements.',
            'Switch between available layouts to compare current study series with prior scans.'
        ],
        stepsAr: [
            'اضغط على أيقونة DICOM بجوار أي فحص مكتمل لفتح مستعرض الصور الطبية التفاعلي.',
            'استخدم زر (W) للتبديل بين إعدادات التباين والإضاءة الجاهزة (عظام، أنسجة رخوة، رئة، مخ).',
            'استخدم (Z) للتكبير، و (P) للتحريك، و (M) لقياس المسافات، و (A) لقياس الزوايا بدقة ميليمترية.',
            'بدّل بين التخطيطات المتاحة لمقارنة السلاسل الحالية مع الفحوصات السابقة.'
        ]
    },

    // 4. PACS Reconciliation
    {
        id: 'pacs_recon',
        category: 'clinical',
        icon: Cpu,
        roles: ['Admin', 'Radiologist', 'Technician', 'Developer'],
        route: '/pacs/reconciliation',
        color: 'indigo',
        titleEn: 'DICOM Ingestion & PACS Reconciliation',
        titleAr: 'مطابقة دراسات PACS وربط الفحوصات غير المعرفة',
        descEn: 'Resolve unmatched accession numbers and bind orphaned modality series to RIS orders.',
        descAr: 'معالجة الدراسات غير المطابقة وربط سلاسل الصور القادمة من أجهزة الأشعة بطلبات الحجز.',
        stepsEn: [
            'Open PACS Reconciliation to view unmatched or incoming studies from modality gateways.',
            'Search for the corresponding patient by MRN, Name, or appointment date.',
            'Click "Link / Reconcile" to bind the DICOM accession header to the RIS patient order.',
            'Verify that the reconciled images appear immediately in the reporting worklist.'
        ],
        stepsAr: [
            'افتح شاشة مطابقة الـ PACS لمعاينة الدراسات الواردة من أجهزة الأشعة والتي لم تتطابق تلقائياً.',
            'ابحث عن موعد المريض المطابق باستخدام رقم الملف MRN أو الاسم أو تاريخ الحجز.',
            'اضغط على (ربط / مطابقة) لربط صور الـ DICOM بملف وحجز المريض في النظام.',
            'تأكد من ظهور الصور فوراً في قائمة كتابة التقارير لدى طبيب الأشعة.'
        ]
    },

    // 5. Reporting Editor
    {
        id: 'reporting',
        category: 'clinical',
        icon: Stethoscope,
        roles: ['Admin', 'Radiologist', 'Developer'],
        route: '/case-reports',
        color: 'cyan',
        titleEn: 'Radiology Diagnostic Report Editor',
        titleAr: 'محرر وكتابة واعتماد التقارير الطبية',
        descEn: 'Structured clinical dictation, findings macros, abnormal alerts, and electronic signature.',
        descAr: 'كتابة التقارير الطبية المنظمة، استدعاء القوالب الجاهزة، توثيق الاستنتاج، والتوقيع الرقمي.',
        stepsEn: [
            'Select any completed exam and click "Open Report Editor".',
            'Insert standardized examination templates (e.g. Normal Brain MRI, Chest CT).',
            'Document clinical Technique, Findings, and Impression.',
            'Click "Finalize & Sign" to embed the radiologist electronic signature and generate PDF.'
        ],
        stepsAr: [
            'اختر الفحص المكتمل واضغط على (فتح محرر التقرير الطبي).',
            'استدعِ القوالب السريرية الجاهزة للفحص (مثل: رنين مخ سليم، أشعة مقطعية على الصدر).',
            'وثق تقنية التصوير، النتائج السريرية المفصلة (Findings)، والاستنتاج النهائي (Impression).',
            'اضغط على (اعتماد وتوقيع) لختم التقرير إلكترونياً بالتوقيع الرقمي وتوليد ملف الـ PDF.'
        ]
    },

    // 6. Critical Findings Protocol
    {
        id: 'critical_findings',
        category: 'clinical',
        icon: AlertTriangle,
        roles: ['Admin', 'Radiologist', 'Nurse', 'Developer'],
        route: '/case-reports',
        color: 'rose',
        titleEn: 'Critical & STAT Urgent Findings Protocol',
        titleAr: 'بروتوكول إخطار وتوثيق النتائج الحرجة والطارئة',
        descEn: 'Mandatory clinical safety workflow for life-threatening unexpected radiological discoveries.',
        descAr: 'المسار السريري الإلزامي للتعامل مع الاكتشافات الإشعاعية الخطيرة والمهددة للحياة.',
        stepsEn: [
            'When diagnosing an urgent finding (e.g. Aortic dissection, acute intracranial hemorrhage), toggle "Critical Finding" inside the report editor.',
            'Document the name of the treating physician notified and the communication timestamp in the dedicated critical-finding log.',
            'The system dispatches high-priority visual alerts and notification events to the configured clinical recipients per the notification policy.',
            'All critical finding communication logs are permanently stored in electronic audit trails.'
        ],
        stepsAr: [
            'عند تشخيص حالة حرجة طارئة (مثل: نزيف حاد بالمخ أو اشتباه جلطة)، فعل خيار (نتيجة حرجة) داخل محرر التقرير.',
            'سجل اسم الطبيب المعالج الذي تم التواصل معه ووقت الإبلاغ بدقة في سجل النتائج الحرجة.',
            'يقوم النظام بإرسال إشعار عاجل داخل التطبيق للأطراف السريرية وفقاً لسياسة الإشعارات المعرّفة.',
            'يتم حفظ سجل إبلاغ النتيجة الحرجة في سجلات التدقيق القانوني الطبي.'
        ]
    },

    // 7. Nurse Workspace
    {
        id: 'nurse_prep',
        category: 'clinical',
        icon: Activity,
        roles: ['Admin', 'Nurse', 'Technician', 'Developer'],
        route: '/nurse',
        color: 'teal',
        titleEn: 'Nursing Care, Vitals & Contrast Screening',
        titleAr: 'التمريض ومتابعة العلامات الحيوية وفحص الصبغة',
        descEn: 'Patient cannulation, contrast allergy screening, and vital signs monitoring.',
        descAr: 'تركيب الكانيولا، فحص حساسية الصبغة الوريدية، ومتابعة العلامات الحيوية للمريض.',
        stepsEn: [
            'Verify patient IV cannula gauge (18G/20G) suitability for power injector pressure.',
            'Confirm serum creatinine and eGFR laboratory clearance before IV contrast injection.',
            'Record baseline vital signs (BP, Pulse, SpO2) and monitor post-scan recovery.'
        ],
        stepsAr: [
            'التحقق من مقاس الكانيولا الوريدية (18G أو 20G) لتحمل ضغط الحاقن الآلي للصبغة.',
            'التأكد من نتائج فحص وظائف الكلى (Creatinine / eGFR) وموافقة الطبيب قبل حقن الصبغة.',
            'تسجيل العلامات الحيوية للمريض قبل الفحص وملاحظة المريض بعد انتهاء الأشعة.'
        ]
    },

    // 8. Patient Directory
    {
        id: 'patients',
        category: 'operations',
        icon: Users,
        roles: ['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse', 'Marketing', 'Developer'],
        route: '/patients',
        color: 'blue',
        titleEn: 'Master Patient Index & Demographics Registry',
        titleAr: 'دليل وسجل المرضى الرئيسي ومنع التكرار',
        descEn: 'Comprehensive medical records, national identity verification, and multi-tab demographics.',
        descAr: 'إدارة السجلات الطبية الشاملة، التحقق من الهوية، وتوثيق بيانات الاتصال والطوارئ.',
        stepsEn: [
            'Search patient registry by MRN, National ID, Phone, or Full Name.',
            'Review real-time duplicate suggestions before registering a new patient record.',
            'Document Emergency Contacts, Chronic Illnesses, and Communication Consents.',
            'Export filtered patient registries to CSV or view full historical clinical timeline.'
        ],
        stepsAr: [
            'ابحث في سجل المرضى برقم الملف MRN، الرقم القومي، رقم الهاتف، أو الاسم الكامل.',
            'راجع تنبيهات السجلات المتطابقة لمنع إنشاء ملفات مكررة لنفس المريض.',
            'سجل جهات الاتصال للطوارئ، الأمراض المزمنة، الحساسية، وموافقات الإشعارات.',
            'قم بتصدير السجلات إلى ملفات CSV أو استعرض السجل الطبي وتاريخ المواعيد السابقة.'
        ]
    },

    // 9. Appointments Calendar
    {
        id: 'appointments',
        category: 'operations',
        icon: CalendarDays,
        roles: ['Admin', 'Receptionist', 'Developer'],
        route: '/appointments',
        color: 'teal',
        titleEn: 'Multi-Room Appointment Scheduler & Calendar',
        titleAr: 'تقويم المواعيد متعدد الغرف وإدارة الموارد',
        descEn: 'Visual schedule management, machine room allocations, waitlists, and automated SMS reminders.',
        descAr: 'إدارة مرئية لجدول المواعيد، توزيع غرف وأجهزة الأشعة، وقوائم الانتظار ورسائل التأكيد.',
        stepsEn: [
            'Select Day, Week, or Month view filtered by Modality Room (e.g. MRI 1.5T Room).',
            'Click an available slot to book appointment, attaching patient MRN and exam type.',
            'Confirm pre-exam preparation instructions (e.g. 6-hour fasting for Abdominal US).',
            'Manage reschedules, cancellations, or bump waitlisted patients into cancelled slots.'
        ],
        stepsAr: [
            'اختر طريقة العرض (يومي/أسبوعي/شهري) مع تصفية غرفة الجهاز (مثل: غرفة الرنين 1.5T).',
            'اضغط على أي وقت متاح لحجز الموعد، مع تحديد ملف المريض ونوع الفحص المطلوب.',
            'تأكيد تعليمات التحضير الخاصة بالفحص مع المريض (مثل: الصيام 6 ساعات لفحص البطن).',
            'إدارة تعديل المواعيد، الإلغاءات، وتصعيد المرضى من قائمة الانتظار للمواعيد الملغاة.'
        ]
    },

    // 10. Cashier Workspace
    {
        id: 'payments',
        category: 'operations',
        icon: CreditCard,
        roles: ['Admin', 'Receptionist', 'Cashier', 'Developer'],
        route: '/reception',
        color: 'amber',
        titleEn: 'Cashier Workspace & Shift Settlement',
        titleAr: 'شاشة الخزينة وإصدار الفواتير وإقفال الوردية',
        descEn: 'Point-of-sale invoice creation, split payment methods, discounts, and shift reconciliation.',
        descAr: 'إصدار الفواتير الفورية، تقسيم المدفوعات (نقدي/فيزا/محفظة)، الخصومات، وجرد الوردية.',
        stepsEn: [
            'Open your cashier shift at shift start, entering the verified opening cash float.',
            'Select patient invoice, apply approved discount vouchers or insurance copays.',
            'Collect payment via Cash, Visa/Mastercard, or Electronic Wallets and print receipt.',
            'Perform end-of-shift cash count and execute formal shift closure report.'
        ],
        stepsAr: [
            'افتح وردية الخزينة في بداية الدوام وأدخل مبلغ العهدة النقدية الافتتاحية المؤكدة.',
            'اختر فاتورة المريض، وطبق كوبونات الخصم المعتمدة أو نسبة تحمل شركة التأمين.',
            'استلم المبلغ (نقداً، فيزا/ماستركارد، أو محافظ إلكترونية) واطبع إيصال السداد المالي.',
            'قم بجرد النقدية عند نهاية الوردية واعتمد تقرير الإقفال المالي والمطابقة.'
        ]
    },

    // 11. Insurance & Claims
    {
        id: 'insurance',
        category: 'operations',
        icon: FileText,
        roles: ['Admin', 'Receptionist', 'Accountant', 'Insurance_Staff', 'Developer'],
        route: '/insurance',
        color: 'sky',
        titleEn: 'Insurance Claims & Pre-Authorization Workbench',
        titleAr: 'منصة التأمين الطبي والموافقات المسبقة والمطالبات',
        descEn: 'Electronic claim generation, pre-authorization uploads, payer tariff rules, and rejection disputes.',
        descAr: 'إنشاء المطالبات التأمينية، رفع الموافقات الطبية المسبقة، ضبط التسعيرات، ومعالجة المرفوضات.',
        stepsEn: [
            'Verify patient insurance policy validity, network tier, and copay percentage.',
            'Upload insurer pre-authorization approval document for high-cost modalities (MRI/CT).',
            'Generate electronic claim batched with medical prescription and final signed report.',
            'Track claim status (Submitted, Approved, Paid, or Rejected) and handle appeals.'
        ],
        stepsAr: [
            'التحقق من سريان بطاقة التأمين للمريض، وفئة الشبكة الطبية، ونسبة التحمل المعتمدة.',
            'رفع مستند الموافقة الطبية المسبقة لفحوصات الأشعة المتقدمة (الرنين والمقطعية).',
            'توليد المطالبة الإلكترونية وتجميعها مع الروشتة الطبية والتقرير النهائي المعتمد.',
            'متابعة دورة المطالبة (مقدمة، معتمدة، مدفوعة، أو مرفوضة) وإعادة تقديم الاستئناف.'
        ]
    },

    // 12. Financial Reports
    {
        id: 'financial_reports',
        category: 'administration',
        icon: BarChart3,
        roles: ['Admin', 'Accountant', 'Developer'],
        route: '/financials',
        color: 'purple',
        titleEn: 'Financial Revenue & Profit/Loss Analytics',
        titleAr: 'التقارير المالية المجمعة والأرباح والخسائر',
        descEn: 'Comprehensive revenue tracking, expense ledgers, tax reports, and center profit margins.',
        descAr: 'متابعة الإيرادات الكلية، قيود المصروفات، تقارير القيمة المضافة، وهوامش ربحية المركز.',
        stepsEn: [
            'Inspect daily, monthly, and yearly revenue broken down by modality and department.',
            'Review collected cash versus outstanding corporate/insurance receivables.',
            'Generate official P&L statements and export financial ledgers to Excel/CSV.'
        ],
        stepsAr: [
            'استعرض الإيرادات اليومية والشهرية والسنوية مفصلة حسب نوع الجهاز والخدمة.',
            'راجع المتحصلات النقدية المحصلة مقارنة بالذمم المدينة المعلقة لدى شركات التأمين.',
            'استخرج القوائم المالية وقوائم الدخل والمصروفات وصدرها إلى Excel/CSV.'
        ]
    },

    // 13. Payroll Suite
    {
        id: 'payroll',
        category: 'administration',
        icon: FileSpreadsheet,
        roles: ['Admin', 'Accountant', 'HR', 'Developer'],
        route: '/payroll',
        color: 'emerald',
        titleEn: 'Payroll Ledger, Deductions & Bank Transfers',
        titleAr: 'مسيرات الرواتب والاستقطاعات والتحويلات البنكية',
        descEn: '5-Stage payroll workflow, employee compensation profiles, itemized payslips, and ACH bank file exports.',
        descAr: 'مسار اعتماد الرواتب الخماسي، هيكل الأجور، كشوفات الرواتب المفصلة، وتصدير ملفات البنوك.',
        stepsEn: [
            'Create payroll period and configure employee base compensation & hourly rates.',
            'Apply recurring deductions, social insurance, overtime multipliers, and penalties.',
            'Execute 5-step approval lifecycle: Calculate ➔ Review ➔ Approve ➔ Mark Paid ➔ Lock.',
            'Generate itemized employee payslips and export the bulk ACH bank salary disbursement file.'
        ],
        stepsAr: [
            'أنشئ الفترة المالية واضبط الرواتب الأساسية ومعدل الأجر بالساعة للموظفين.',
            'أضف الاستقطاعات والتأمينات ومكافآت الساعات الإضافية والجزاءات الإدارية.',
            'نفذ مسار الاعتماد الخماسي: احتساب ➔ مراجعة ➔ اعتماد ➔ صرف ➔ إقفال وتأمين.',
            'اطبع كشوفات الرواتب الفردية وصدر ملف التحويل البنكي المجمع (ACH/WPS).'
        ]
    },

    // 14. Doctor Referrals CRM
    {
        id: 'doctor_referrals',
        category: 'operations',
        icon: Megaphone,
        roles: ['Admin', 'Receptionist', 'HR', 'Marketing', 'Developer'],
        route: '/marketing',
        color: 'pink',
        titleEn: 'Referring Physicians CRM & Split Commissions',
        titleAr: 'شبكة الأطباء المحولين وعمولات الإحالة الطبية',
        descEn: 'Referring doctor network registry, case volume tracking, and commission settlement.',
        descAr: 'إدارة شبكة الأطباء المحولين، متابعة حجم الحالات المحولة، وتسوية العمولات الطبية.',
        stepsEn: [
            'Register referring physician details, medical specialty, and clinic address.',
            'Link referring doctor to patient appointment booking to automatically track referral credit.',
            'Review monthly referral analytics and execute commission settlement disbursements.'
        ],
        stepsAr: [
            'سجل بيانات الأطباء المحولين، التخصص الطبي، وعنوان وبيانات التواصل للعيادة.',
            'اربط اسم الطبيب المحول بحجز موعد المريض لاحتساب الإحالة الطبية تلقائياً.',
            'راجع تقارير نمو الإحالات الطبية الشهرية واعتمد تسوية مستحقات الأطباء المحولين.'
        ]
    },

    // 15. Equipment Fleet
    {
        id: 'equipment',
        category: 'operations',
        icon: Wrench,
        roles: ['Admin', 'Technician', 'Developer'],
        route: '/equipment',
        color: 'orange',
        titleEn: 'Equipment Fleet & Preventive Maintenance',
        titleAr: 'جاهزية أسطول الأجهزة والصيانة الدورية',
        descEn: 'Modality scanner telemetry, operational uptime calculation, and maintenance logbooks.',
        descAr: 'متابعة تشغيل أجهزة الأشعة، نسبة الجاهزية التشغيلية، وسجلات الصيانة الدورية والأعطال.',
        stepsEn: [
            'Monitor fleet telemetry HUD for real-time operational status (Operational, In Exam, Maintenance).',
            'Schedule recurring preventive maintenance and tube/coil calibration dates.',
            'Log unscheduled machine downtime incidents with root cause analysis and resolution duration.'
        ],
        stepsAr: [
            'تابع لوحة جاهزية الأجهزة لحالة التشغيل المباشرة (يعمل، قيد الفحص، تحت الصيانة).',
            'جدول مواعيد الصيانة الوقائية الدورية ومعايرة أجهزة الرنين والمقطعية والأشعة.',
            'سجل بلاغات الأعطال الطارئة مع توثيق سبب التوقف والوقت المستغرق للإصلاح.'
        ]
    },

    // 16. Inventory & FEFO
    {
        id: 'inventory',
        category: 'operations',
        icon: Layers,
        roles: ['Admin', 'Technician', 'Developer'],
        route: '/inventory',
        color: 'amber',
        titleEn: 'Consumables, Contrast Media & FEFO Expiry',
        titleAr: 'المخزون والمستهلكات ومعيار الصلاحية FEFO',
        descEn: 'Medical stock tracking, contrast media batch allocation, FEFO alerts, and purchase orders.',
        descAr: 'إدارة المستلزمات الطبية، صبغات الأشعة، تتبع تواريخ الصلاحية (FEFO)، وأوامر الشراء.',
        stepsEn: [
            'Track medical consumables and contrast media inventory by batch and expiry date.',
            'The system enforces First-Expiring-First-Out (FEFO) dispensing to prevent medication waste.',
            'Receive low-stock threshold alerts and generate supplier purchase replenishment orders.'
        ],
        stepsAr: [
            'تتبع مستلزمات الأشعة وعبوات الصبغة برقم التشغيلة وتاريخ انتهاء الصلاحية.',
            'يطبق النظام قاعدة (الأقرب انتهاءً يصرف أولاً - FEFO) لمنع هدر الأدوية والمستهلكات.',
            'استقبل تنبيهات نقص المخزون وأنشئ أوامر شراء التوريد مباشرة للموردين المعتمدين.'
        ]
    },

    // 17. Roles & Security
    {
        id: 'roles_security',
        category: 'administration',
        icon: ShieldCheck,
        roles: ['Admin', 'Developer'],
        route: '/settings?tab=roles',
        color: 'rose',
        titleEn: 'Role-Based Access Control (RBAC) & Security Governance',
        titleAr: 'الصلاحيات والأمان وإدارة أدوار المستخدمين',
        descEn: '12 role spectrums, privilege boundaries, password security, and active sessions.',
        descAr: 'إدارة 12 دوراً وظيفياً، تعيين الصلاحيات الدقيقة، سياسات كلمات المرور، والجلسات النشطة.',
        stepsEn: [
            'Assign users to pre-configured security roles (Radiologist, Cashier, Reception, Admin, etc.).',
            'Configure multi-factor authentication (MFA) and auto-session lockout timeouts.',
            'Revoke compromised account access or reset secure passwords with 1-click generators.'
        ],
        stepsAr: [
            'عيّن الموظفين في الأدوار الوظيفية المعتمدة (طبيب أشعة، كاشير، استقبال، مدير نظام، إلخ).',
            'اضبط سياسات المصادقة الثنائية (MFA) وفترات الإقفال التلقائي للجلسات غير النشطة.',
            'عطّل الحسابات غير المستخدمة أو أنشئ كلمات مرور معقدة بنقرة واحدة.'
        ]
    },

    // 18. Audit Trails
    {
        id: 'audit_logs',
        category: 'administration',
        icon: ShieldAlert,
        roles: ['Admin', 'Developer'],
        route: '/settings?tab=auditLogs',
        color: 'rose',
        titleEn: 'Electronic Audit Trails & Compliance Logging',
        titleAr: 'سجلات التدقيق والأمان السريري والقانوني',
        descEn: 'Immutable logs recording all patient record views, report amendments, and financial changes.',
        descAr: 'سجلات غير قابلة للتعديل ترصد كل عمليات فتح الملفات، تعديل التقارير، والعمليات المالية.',
        stepsEn: [
            'Search audit logs by User, Patient MRN, Action Type, or timestamp range.',
            'Inspect raw metadata changes (Before vs After) for modified clinical reports or invoices.',
            'Use the audit retention controls in the Settings panel to align logs with your compliance policy.'
        ],
        stepsAr: [
            'ابحث في سجلات التدقيق باسم المستخدم، رقم الملف MRN، نوع الإجراء، أو الفترة الزمنية.',
            'راجع التغييرات التفصيلية (قبل التعديل وبعده) لأي تقرير طبي أو فاتورة مالية تم تعديلها.',
            'استخدم إعدادات الاحتفاظ بسجلات التدقيق في شاشة الإعدادات لمواءمتها مع سياسة الامتثال لديك.'
        ]
    },

    // 19. Backup & Archiving
    {
        id: 'backup_archiving',
        category: 'administration',
        icon: Database,
        roles: ['Admin', 'Developer'],
        route: '/settings?tab=backups',
        color: 'indigo',
        titleEn: 'Database Backup & PACS Cold Storage Archiving',
        titleAr: 'النسخ الاحتياطي وتخزين وأرشفة الـ PACS',
        descEn: 'Scheduled automated database dumps, offsite disaster recovery, and clinical data retention policies.',
        descAr: 'النسخ الاحتياطي التلقائي لقاعدة البيانات، التعافي من الكوارث، وسياسات الاحتفاظ بالبيانات السريرية.',
        stepsEn: [
            'Verify daily automated database snapshots and offsite backup sync integrity.',
            'Configure database retention windows and offsite storage targets in the Settings panel.',
            'Execute test recovery drills to ensure business continuity in emergency events.'
        ],
        stepsAr: [
            'تأكد من اكتمال النسخ الاحتياطي التلقائي اليومي وسلامة المزامنة الخارجية.',
            'اضبط نوافذ الاحتفاظ بقاعدة البيانات وأهداف التخزين الخارجي من شاشة الإعدادات.',
            'نفذ اختبارات استعادة دورية لضمان استمرارية العمل في حالات الطوارئ.'
        ]
    },

    // 20. Settings & Customization
    {
        id: 'settings_customization',
        category: 'account',
        icon: Settings,
        roles: ALL_STAFF,
        route: '/settings',
        color: 'slate',
        titleEn: 'System Settings, Localization & Themes',
        titleAr: 'إعدادات النظام والتخصيص واللغة',
        descEn: 'Center branding, DICOM AE Title nodes, SMS gateways, language toggle, and dark mode.',
        descAr: 'بيانات المركز وشعاره، إعدادات خوادم DICOM، بوابات الرسائل، وتبديل اللغة والمظهر.',
        stepsEn: [
            'Customize facility header, legal registration numbers, and official letterhead logo.',
            'Configure DICOM Application Entity (AE) Titles and PACS IP listener ports.',
            'Toggle interface between Arabic (RTL) and English (LTR) with seamless typography.'
        ],
        stepsAr: [
            'خصص ترويسة المركز الطبي، أرقام السجل التجاري والترخيص، والشعار الرسمي على التقارير.',
            'اضبط معرفات أجهزة الأشعة (DICOM AE Title) ومنافذ استقبال صور الـ PACS.',
            'بدّل لغة الواجهة بين العربية (RTL) والإنجليزية (LTR) بسلاسة كاملة.'
        ]
    },
    {
        id: 'task_assignment', category: 'clinical', icon: CheckSquare,
        roles: ['Admin', 'Radiologist', 'Technician', 'Nurse', 'Developer'],
        route: '/worklist',
        color: 'emerald',
        titleEn: 'Assigned, Unassigned & Held Clinical Tasks', titleAr: 'المهام السريرية المسندة وغير المسندة والمعلّقة',
        descEn: 'Use All, My tasks, and Available tasks without losing shared work or taking another user’s assignment.',
        descAr: 'استخدم نطاقات الكل ومهامي والمتاحة دون إخفاء العمل المشترك أو أخذ مهمة مستخدم آخر.',
        stepsEn: [
            'All visible tasks combines your assignments with unassigned work available to your current station.',
            'My tasks shows only work assigned to you; Available tasks shows only unassigned work you can claim.',
            'Claim an available task before starting it. Assigned tasks are not transferable without an authorized assignment action.',
            'When placing work on hold, record a specific reason; release it promptly when the blocker is resolved.'
        ],
        stepsAr: [
            'يجمع نطاق كل المهام الظاهرة بين مهامك والمهام غير المسندة المتاحة لمحطتك الحالية.',
            'يعرض نطاق مهامي المسند إليك فقط، ويعرض نطاق المهام المتاحة غير المسندة القابلة للاستلام.',
            'استلم المهمة المتاحة قبل بدء العمل. لا تنقل مهمة مسندة لمستخدم آخر دون إجراء تكليف مخول.',
            'عند تعليق المهمة سجّل سبباً محدداً، ثم حررها فور زوال العائق.'
        ]
    },
    {
        id: 'approvals', category: 'administration', icon: ClipboardList,
        roles: ['Admin', 'HR', 'Accountant', 'Insurance_Staff', 'Receptionist', 'Developer'], route: '/approvals', color: 'amber',
        titleEn: 'Cross-Department Approvals & Exception Review', titleAr: 'الموافقات المشتركة ومراجعة الاستثناءات',
        descEn: 'Review leave, payroll, refund, insurance, privacy, cash variance, and governed exception requests.',
        descAr: 'مراجعة الإجازات والرواتب والاستردادات والتأمين والخصوصية وفروق النقدية والاستثناءات المحكومة.',
        stepsEn: ['Open the relevant approval queue and inspect evidence, requester, amount, and timeline.', 'Use the decision allowed by the request type; some workflows are acknowledgement-only.', 'Enter a specific review note for rejection, escalation, or variance acknowledgement.', 'Verify the resulting status and audit event after submitting the decision.'],
        stepsAr: ['افتح قائمة الموافقات المناسبة وراجع المستندات والطالب والمبلغ والتسلسل الزمني.', 'استخدم القرار المسموح لنوع الطلب؛ بعض المسارات تعتمد على الإقرار فقط.', 'أدخل ملاحظة محددة للرفض أو التصعيد أو إقرار فرق النقدية.', 'تحقق من الحالة الناتجة وسجل التدقيق بعد إرسال القرار.']
    },
    {
        id: 'notifications', category: 'operations', icon: Radio,
        roles: ALL_STAFF, route: '/notifications', color: 'sky',
        titleEn: 'Notifications, Preferences & Delivery Status', titleAr: 'الإشعارات والتفضيلات وحالة التسليم',
        descEn: 'Read in-app alerts, distinguish priorities, configure channels and quiet hours, and investigate failed delivery.',
        descAr: 'قراءة التنبيهات وتمييز الأولويات وضبط القنوات وساعات الهدوء والتحقق من فشل التسليم.',
        stepsEn: ['Open Notifications and prioritize Critical, Warning, and Action items before Normal messages.', 'Mark an alert read only after completing or recording its required action.', 'Configure Email, SMS, WhatsApp, In-App, timezone, and quiet hours in Settings.', 'Administrators review templates, jobs, retries, and provider health from notification settings.'],
        stepsAr: ['افتح الإشعارات وابدأ بالحرجة والتحذيرية والإجرائية قبل الرسائل العادية.', 'علّم التنبيه كمقروء بعد تنفيذ الإجراء المطلوب أو توثيقه.', 'اضبط البريد والرسائل وواتساب وداخل النظام والمنطقة الزمنية وساعات الهدوء من الإعدادات.', 'يراجع المسؤولون القوالب والمهام والمحاولات وصحة المزود من إعدادات الإشعارات.']
    },
    {
        id: 'communications', category: 'operations', icon: RadioTower,
        roles: ['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse', 'HR', 'Marketing', 'Developer'], route: '/communications', color: 'blue',
        titleEn: 'Secure Staff & Portal Communications', titleAr: 'اتصالات الموظفين والبوابات الآمنة',
        descEn: 'Use authorized channels for staff coordination and patient/doctor follow-up without leaking protected data.',
        descAr: 'استخدم القنوات المصرح بها لتنسيق الموظفين ومتابعة المرضى والأطباء دون تسريب بيانات محمية.',
        stepsEn: ['Choose the correct team or case context before sending a message.', 'Do not send credentials, exported reports, or patient identifiers outside approved channels.', 'Use threads and acknowledgements to keep clinical escalation traceable.', 'Escalate urgent clinical findings through the critical-result workflow, not ordinary chat.'],
        stepsAr: ['اختر الفريق أو سياق الحالة الصحيح قبل إرسال الرسالة.', 'لا ترسل بيانات الدخول أو التقارير المصدرة أو معرفات المرضى خارج القنوات المعتمدة.', 'استخدم سلاسل الرد والإقرار للحفاظ على قابلية تتبع التصعيد.', 'صعّد النتائج الحرجة عبر مسار النتائج الحرجة وليس المحادثة العادية.']
    },
    {
        id: 'hr_staff', category: 'administration', icon: Users,
        roles: ['Admin', 'HR', 'Developer'], route: '/hr', color: 'emerald',
        titleEn: 'Staff, Attendance, Shifts & Leave', titleAr: 'الموظفون والحضور والورديات والإجازات',
        descEn: 'Maintain employee profiles, rosters, attendance exceptions, leave decisions, and staffing readiness.',
        descAr: 'إدارة ملفات الموظفين والجداول واستثناءات الحضور وقرارات الإجازة وجاهزية التغطية.',
        stepsEn: ['Review active staff and required profile fields before scheduling shifts.', 'Inspect late, absent, overtime, and corrected attendance entries.', 'Process leave from Approvals and verify coverage before approval.', 'Keep employment status aligned with account access and payroll eligibility.'],
        stepsAr: ['راجع الموظفين النشطين والحقول المطلوبة قبل جدولة الورديات.', 'افحص التأخير والغياب والإضافي وتصحيحات الحضور.', 'عالج الإجازات من الموافقات وتحقق من التغطية قبل الاعتماد.', 'وحّد حالة التوظيف مع صلاحية الحساب واستحقاق الرواتب.']
    },
    {
        id: 'user_management', category: 'administration', icon: ShieldCheck,
        roles: ['Admin', 'HR', 'Developer'], route: '/users', color: 'rose',
        titleEn: 'Users, Activity & Account Lifecycle', titleAr: 'المستخدمون والنشاط ودورة حياة الحساب',
        descEn: 'Create staff accounts, assign roles, investigate activity, reset access, and deactivate safely.',
        descAr: 'إنشاء حسابات الموظفين وتعيين الأدوار ومراجعة النشاط وإعادة الوصول والتعطيل الآمن.',
        stepsEn: ['Create one identity per employee and assign the minimum operational role.', 'Review the user detail and activity timeline before changing access.', 'Use password reset and session revocation for suspected compromise.', 'Deactivate departed users; never recycle an old account for a new employee.'],
        stepsAr: ['أنشئ هوية واحدة لكل موظف وعيّن أقل دور تشغيلي مطلوب.', 'راجع تفاصيل المستخدم وتسلسل النشاط قبل تغيير الوصول.', 'استخدم إعادة كلمة المرور وإلغاء الجلسات عند الاشتباه في الاختراق.', 'عطّل حساب المنتهي خدمته ولا تعيد استخدامه لموظف جديد.']
    },
    {
        id: 'privacy', category: 'administration', icon: Lock,
        roles: ['Admin', 'Developer'], route: '/settings?tab=privacy', color: 'rose',
        titleEn: 'Privacy Requests, Consent & Data Governance', titleAr: 'طلبات الخصوصية والموافقات وحوكمة البيانات',
        descEn: 'Verify identity, process access/correction/export requests, control consent, and document every decision.',
        descAr: 'التحقق من الهوية ومعالجة الوصول والتصحيح والتصدير وإدارة الموافقات وتوثيق كل قرار.',
        stepsEn: ['Verify requester identity and legal basis before reviewing patient data.', 'Limit the request scope and attach only approved records.', 'Record approval, rejection, export expiry, or correction notes precisely.', 'Use audit logs to verify access, downloads, and completion.'],
        stepsAr: ['تحقق من هوية مقدم الطلب والأساس النظامي قبل مراجعة بيانات المريض.', 'حدد نطاق الطلب وأرفق السجلات المعتمدة فقط.', 'سجل الاعتماد أو الرفض أو انتهاء التصدير أو ملاحظات التصحيح بدقة.', 'استخدم سجل التدقيق للتحقق من الوصول والتنزيل والإكمال.']
    },
    {
        id: 'integrations', category: 'administration', icon: GitBranch,
        roles: ['Admin', 'Developer'], route: '/settings?tab=integrations', color: 'indigo',
        titleEn: 'External Integrations, Credentials & Webhooks', titleAr: 'التكاملات الخارجية والاعتمادات والـWebhooks',
        descEn: 'Configure providers, rotate secrets, set sender identity, verify signed webhooks, and monitor retries.',
        descAr: 'إعداد المزودين وتدوير الأسرار وضبط هوية المرسل والتحقق من التوقيعات ومراقبة المحاولات.',
        stepsEn: ['Enter credentials only in the encrypted integration settings fields.', 'Configure the inbound webhook secret separately from API credentials.', 'Set sender identity and provider-specific options before activation.', 'Use health checks and logs to investigate Failed, Degraded, or retrying deliveries.'],
        stepsAr: ['أدخل الاعتمادات فقط في حقول إعدادات التكامل المشفرة.', 'اضبط سر الـWebhook الوارد منفصلاً عن اعتماد API.', 'حدد هوية المرسل وخيارات المزود قبل التفعيل.', 'استخدم فحوص الصحة والسجلات للتحقق من الفشل أو التدهور أو إعادة المحاولة.']
    },
    {
        id: 'analytics_full', category: 'administration', icon: BarChart3,
        roles: ['Admin', 'Accountant', 'Marketing', 'Developer'], route: '/analytics', color: 'purple',
        titleEn: 'Operational Analytics & Export Governance', titleAr: 'التحليلات التشغيلية وحوكمة التصدير',
        descEn: 'Analyze volume, turnaround, cancellations, revenue, referral performance, and patient experience.',
        descAr: 'تحليل الحجم وزمن الإنجاز والإلغاءات والإيراد والإحالات وتجربة المريض.',
        stepsEn: ['Select a valid date range and compare like-for-like branches or modalities.', 'Read KPI definitions before interpreting charts and trends.', 'Drill into source records when an outlier requires investigation.', 'Export only the minimum dataset and store it according to facility policy.'],
        stepsAr: ['اختر فترة صحيحة وقارن الفروع أو الأجهزة المتجانسة.', 'اقرأ تعريفات المؤشرات قبل تفسير الرسوم والاتجاهات.', 'انتقل للسجلات المصدرية عند الحاجة للتحقق من قيمة شاذة.', 'صدّر أقل مجموعة لازمة واحفظها وفق سياسة المنشأة.']
    },
    {
        id: 'portal_workflows', category: 'operations', icon: ExternalLink,
        roles: ['Admin', 'Receptionist', 'Referring_Doctor', 'Developer'], route: '/notifications', color: 'sky',
        titleEn: 'Patient & Referring-Doctor Portal Workflows', titleAr: 'مسارات بوابة المريض والطبيب المحول',
        descEn: 'Manage appointment requests, profile changes, documents, result delivery, referral messages, and acknowledgements.',
        descAr: 'إدارة طلبات المواعيد وتحديث الملف والمستندات وتسليم النتائج ورسائل الإحالة والإقرارات.',
        stepsEn: ['Review incoming requests after verifying patient or doctor identity.', 'Publish only finalized, patient-visible documents and approved delivery links.', 'Record staff review notes for scheduled, rejected, or applied requests.', 'Use secure portal messaging and track delivery or acknowledgement status.'],
        stepsAr: ['راجع الطلبات الواردة بعد التحقق من هوية المريض أو الطبيب.', 'انشر المستندات النهائية الظاهرة للمريض وروابط التسليم المعتمدة فقط.', 'سجل ملاحظات المراجع للطلبات المجدولة أو المرفوضة أو المطبقة.', 'استخدم رسائل البوابة الآمنة وتابع حالة التسليم أو الإقرار.']
    },
    {
        id: 'printing', category: 'operations', icon: Printer,
        roles: ['Admin', 'Receptionist', 'Cashier', 'Radiologist', 'Technician', 'Nurse', 'Developer'], route: '/reception', color: 'amber',
        titleEn: 'Clinical & Financial Printing', titleAr: 'الطباعة السريرية والمالية',
        descEn: 'Print booking slips, labels, receipts, invoices, reports, and result copies with correct identity and page settings.',
        descAr: 'طباعة الحجز والملصقات والإيصالات والفواتير والتقارير ونسخ النتائج بهوية وإعدادات صحيحة.',
        stepsEn: ['Verify patient, exam, invoice, and copy destination before opening print view.', 'Use the correct paper size and enable background graphics where required.', 'Never leave printed patient material unattended.', 'Record result pickup and extra print-copy counts when applicable.'],
        stepsAr: ['تحقق من المريض والفحص والفاتورة ووجهة النسخة قبل فتح الطباعة.', 'استخدم مقاس الورق الصحيح وفعل رسومات الخلفية عند الحاجة.', 'لا تترك مطبوعات المريض دون رقابة.', 'سجل استلام النتائج وعدد النسخ الإضافية عند التطبيق.']
    }
];

const CATEGORIES = ['all', 'gettingStarted', 'clinical', 'operations', 'administration', 'account'];

const COLOR_MAP = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500/20', dot: 'bg-emerald-500', badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-500/20', dot: 'bg-blue-500', badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30' },
    violet: { bg: 'bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-500/20', dot: 'bg-violet-500', badge: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500/20', dot: 'bg-amber-500', badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30' },
    teal: { bg: 'bg-teal-500/10', text: 'text-teal-600 dark:text-teal-400', ring: 'ring-teal-500/20', dot: 'bg-teal-500', badge: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30' },
    cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-600 dark:text-cyan-400', ring: 'ring-cyan-500/20', dot: 'bg-cyan-500', badge: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30' },
    sky: { bg: 'bg-sky-500/10', text: 'text-sky-600 dark:text-sky-400', ring: 'ring-sky-500/20', dot: 'bg-sky-500', badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-400', ring: 'ring-purple-500/20', dot: 'bg-purple-500', badge: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30' },
    pink: { bg: 'bg-pink-500/10', text: 'text-pink-600 dark:text-pink-400', ring: 'ring-pink-500/20', dot: 'bg-pink-500', badge: 'bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/30' },
    orange: { bg: 'bg-orange-500/10', text: 'text-orange-600 dark:text-orange-400', ring: 'ring-orange-500/20', dot: 'bg-orange-500', badge: 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30' },
    indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-600 dark:text-indigo-400', ring: 'ring-indigo-500/20', dot: 'bg-indigo-500', badge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30' },
    rose: { bg: 'bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-500/20', dot: 'bg-rose-500', badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30' },
    slate: { bg: 'bg-slate-500/10', text: 'text-slate-600 dark:text-slate-400', ring: 'ring-slate-500/20', dot: 'bg-slate-500', badge: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30' },
};

const CAT_ICON = {
    gettingStarted: Sparkles,
    clinical: Stethoscope,
    operations: Activity,
    administration: ShieldCheck,
    account: Settings
};

/* ── Interactive Troubleshooting Matrix ─────────────────────── */
const TROUBLESHOOTING_GUIDES = [
    {
        id: 'dicom_missing',
        icon: HardDrive,
        color: 'cyan',
        title: 'DICOM Study Not Appearing in Worklist',
        titleAr: 'دراسة الصور DICOM لا تظهر في قائمة الفحوصات',
        cause: 'Accession number mismatch between RIS appointment and DICOM scanner header, or PACS gateway delay.',
        causeAr: 'عدم تطابق رقم الطلب (Accession Number) بين النظام وجهاز الأشعة، أو بطء مؤقت في خادم الـ PACS.',
        solutions: [
            { en: 'Open PACS Reconciliation page and search by Patient Name or MRN.', ar: 'افتح صفحة مطابقة الـ PACS وابحث باسم المريض أو رقم الملف MRN.' },
            { en: 'Click "Reconcile / Link" to manually bind the unlinked study to the patient appointment.', ar: 'اضغط على زر (ربط / مطابقة) لربط الدراسة غير المطابقة بموعد المريض يدوياً.' },
            { en: 'If the study is not found, verify that the technician sent/pushed the series from the scanner console.', ar: 'إذا لم تظهر، تأكد من قيام الفني بإرسال السلسلة من وحدة تحكم جهاز الأشعة (Push to PACS).' }
        ]
    },
    {
        id: 'claim_rejected',
        icon: FileText,
        color: 'rose',
        title: 'Insurance Claim Rejected by Payer',
        titleAr: 'رفض المطالبة التأمينية من جهة التأمين',
        cause: 'Missing pre-authorization approval code, non-covered examination code, or expired patient insurance policy.',
        causeAr: 'غياب كود الموافقة المسبقة، أو عدم شمولية الفحص في البوليصة، أو انتهاء صلاحية بطاقة التأمين.',
        solutions: [
            { en: 'Open Insurance Workbench and inspect the detailed rejection reason code from the payer.', ar: 'افتح منصة التأمين واقرأ كود وسبب الرفض المسجل من شركة التأمين.' },
            { en: 'Attach the supporting physician clinical referral prescription and pre-auth approval document.', ar: 'أرفق الروشتة الطبية المحولة والمستندات الداعمة للموافقة المسبقة.' },
            { en: 'Click "Resubmit Claim" with corrected tariff or revised invoice.', ar: 'اضغط على (إعادة تقديم المطالبة) بعد تصحيح بند التسعيرة أو الفاتورة.' }
        ]
    },
    {
        id: 'printer_issues',
        icon: Printer,
        color: 'amber',
        title: 'Barcode Label or Report Print Formatting Issues',
        titleAr: 'مشاكل طباعة باركود العينات أو تقارير الأشعة',
        cause: 'Browser print margins set incorrectly or thermal barcode printer page size mismatch.',
        causeAr: 'إعدادات هوامش المتصفح غير صحيحة أو عدم تطابق مقاس ملصق الباركود الحراري.',
        solutions: [
            { en: 'In browser Print Dialog, set Margins to "None" or "Minimum" and enable "Background Graphics".', ar: 'في نافذة الطباعة بالمتصفح، اضبط الهوامش على (None) وفعل خيار (Background Graphics).' },
            { en: 'For barcode printers (e.g. Zebra/Xprinter), ensure paper size is set to 50x25mm.', ar: 'لطابعات الباركود الحرارية، تأكد من ضبط مقاس الورق على 50×25 مم.' },
            { en: 'Clear browser print cache if layout appears distorted.', ar: 'قم بإعادة تحديث المتصفح إذا ظهرت المعاينة مشوهة.' }
        ]
    },
    {
        id: 'session_locked',
        icon: Lock,
        color: 'purple',
        title: 'Session Timeout or Access Denied Error (403)',
        titleAr: 'انتهاء وقت الجلسة أو خطأ رفض الوصول (403)',
        cause: 'User session token expired due to inactivity, or attempting to access an unauthorized module.',
        causeAr: 'انتهاء صلاحية رمز الجلسة لعدم النشاط، أو محاولة فتح شاشة غير مصرح بها لرتبتك الوظيفية.',
        solutions: [
            { en: 'Click Logout from user avatar menu, then log in again to refresh JWT credentials.', ar: 'سجل الخروج من قائمة الحساب، ثم سجل الدخول مجدداً لتجديد تصريح الجلسة.' },
            { en: 'If accessing a new clinical feature, ask system administrator to assign the required role.', ar: 'إذا كنت تحتاج شاشة إضافية، اطلب من مسؤول النظام منح الصلاحية المناسبة لحسابك.' }
        ]
    }
];

/* ── Keyboard Shortcuts Matrix (verified against implementation) ─── */
const KEYBOARD_SHORTCUTS = [
    { category: 'Global Navigation', categoryAr: 'التنقل العام', shortcuts: [
        { keys: ['Ctrl', 'K'], label: 'Global quick search (Patients, Modalities, Pages)', labelAr: 'البحث الشامل في المرضى والأجهزة والصفحات' },
        { keys: ['Esc'], label: 'Close active modal / dialog', labelAr: 'إغلاق النوافذ المنبثقة النشطة' },
        { keys: ['Alt', 'D'], label: 'Jump to Main Dashboard', labelAr: 'الانتقال السريع للوحة التحكم الرئيسية' },
        { keys: ['?'], label: 'Show keyboard shortcuts guide', labelAr: 'عرض دليل اختصارات لوحة المفاتيح' },
    ]},
    { category: 'Clinical & Reporting', categoryAr: 'التقارير الطبية والأشعة', shortcuts: [
        { keys: ['Ctrl', 'S'], label: 'Quick save report draft', labelAr: 'حفظ مسودة التقرير الطبي فوراً' },
        { keys: ['Ctrl', 'Enter'], label: 'Finalize & electronically sign report', labelAr: 'اعتماد وتوقيع التقرير الطبي نهائياً' },
        { keys: ['Ctrl', 'Space'], label: 'Insert template / macro snippet', labelAr: 'إدراج قالب تقرير أو عبارة سريرية جاهزة' },
    ]},
    { category: 'PACS DICOM Viewer', categoryAr: 'مستعرض صور الأشعة PACS', shortcuts: [
        { keys: ['W'], label: 'Window / Level (Contrast & Brightness adjustment)', labelAr: 'ضبط تباين وإضاءة صور الأشعة (Window/Level)' },
        { keys: ['P'], label: 'Pan image across canvas', labelAr: 'أداة تحريك الصورة (Pan)' },
        { keys: ['Z'], label: 'Zoom in / Zoom out tool', labelAr: 'أداة التكبير والتصغير' },
        { keys: ['M'], label: 'Length / distance measurement tool', labelAr: 'أداة قياس المسافات' },
        { keys: ['A'], label: 'Angle measurement (3 points)', labelAr: 'أداة قياس الزوايا (3 نقاط)' },
        { keys: ['E'], label: 'ROI area & pixel density tool', labelAr: 'أداة مساحة وكثافة البكسل (ROI)' },
        { keys: ['O'], label: 'Toggle corner DICOM overlays', labelAr: 'إظهار/إخفاء بيانات DICOM الزاوية' },
        { keys: ['Space'], label: 'Play / Pause Cine loop animation', labelAr: 'تشغيل / إيقاف تحريك مقاطع الفحص (Cine Loop)' },
        { keys: ['←', '→'], label: 'Previous / next image slice', labelAr: 'المقطع السابق / التالي' },
        { keys: ['S'], label: 'Toggle series drawer', labelAr: 'إظهار/إخفاء قائمة السلاسل' },
        { keys: ['Tab'], label: 'Toggle clinical report & DICOM inspector', labelAr: 'تبديل التقرير السريري وفاحص DICOM' },
        { keys: ['K'], label: 'Bookmark key image', labelAr: 'وضع علامة على الصورة المفتاحية' },
        { keys: ['F'], label: 'Toggle Fullscreen view', labelAr: 'تبديل وضع ملء الشاشة' }
    ]}
];

const articleCanBeRead = (article, user = {}) => {
    const governance = getArticleGovernance(article.id);
    return itemCanBeRead({
        roles: article.roles,
        permissions: governance.permissions,
    }, user);
};

const articleCanOpen = (article, user = {}) => (
    !article.route || canAccessRouteTarget(article.route, user)
);

const articleVisibleForRole = (article, user = {}) => articleCanBeRead(article, user);

const protocolAsSearchItem = (protocol) => ({
    id: `protocol.${protocol.id}`,
    type: 'protocol',
    category: 'clinical',
    roles: ['Admin', 'Radiologist', 'Technician', 'Nurse', 'Developer'],
    route: '/nurse',
    title: { en: protocol.modality, ar: protocol.modalityAr },
    summary: {
        en: 'Clinical preparation and contrast reference. Follow the approved facility protocol.',
        ar: 'مرجع التحضير السريري والصبغة. اتبع بروتوكول المنشأة المعتمد.',
    },
    aliases: protocol.exams.flatMap((exam) => [exam.name, exam.nameAr, exam.fasting, exam.fastingAr, exam.prep, exam.prepAr]),
});

const legacyArticleAsSearchItem = (article) => ({
    id: `guide.${article.id}`,
    type: 'guide',
    category: article.category,
    roles: article.roles,
    route: article.route,
    title: { en: article.titleEn, ar: article.titleAr },
    summary: { en: article.descEn, ar: article.descAr },
    aliases: article.keywords ? [article.keywords] : [],
    steps: { en: article.stepsEn, ar: article.stepsAr },
    permissions: getArticleGovernance(article.id).permissions,
});

const troubleshootingAsSearchItem = (item) => ({
    ...item,
    title: { en: item.title, ar: item.titleAr },
    summary: { en: item.cause, ar: item.causeAr },
    steps: {
        en: item.solutions.map((solution) => solution.en),
        ar: item.solutions.map((solution) => solution.ar),
    },
    aliases: [item.cause, item.causeAr],
});

/* ── Sub-components ─────────────────────────────────────────── */

const ShortcutRow = ({ keys, label }) => {
    const [active, setActive] = useState(false);
    const press = () => {
        setActive(true);
        setTimeout(() => setActive(false), 180);
    };
    return (
        <button
            type="button"
            onClick={press}
            className="group flex w-full items-center justify-between rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-2.5 text-start transition-all duration-150 hover:border-[var(--VIARA-accent)]/40 hover:bg-[var(--VIARA-surface-hover)] hover:shadow-sm"
        >
            <span className="text-xs font-semibold text-[var(--VIARA-ink)] pe-3 leading-snug group-hover:text-[var(--VIARA-accent)] transition-colors">{label}</span>
            <div className="flex shrink-0 items-center gap-1">
                {keys.map((k, i) => (
                    <React.Fragment key={k}>
                        {i > 0 && <span className="text-[9px] font-black text-[var(--VIARA-muted)] px-0.5">+</span>}
                        <kbd
                            className={`inline-flex items-center justify-center min-w-[26px] h-[22px] px-1.5 rounded-md font-mono text-[10px] font-black select-none transition-all duration-100
                                bg-[var(--VIARA-surface)] text-[var(--VIARA-ink)]
                                border border-[var(--VIARA-line)] border-b-[3px]
                                shadow-[0_2px_0_0_var(--VIARA-line)]
                                ${active ? 'translate-y-[2px] border-b-[1px] shadow-none' : 'group-hover:border-[var(--VIARA-accent)]/50 group-hover:text-[var(--VIARA-accent)]'}`}
                        >
                            {k}
                        </kbd>
                    </React.Fragment>
                ))}
            </div>
        </button>
    );
};

const QuickCard = ({ article, isArabic }) => {
    const { t } = useTranslation('help');
    const Icon = article.icon;
    const tone = COLOR_MAP[article.color] ?? COLOR_MAP.emerald;
    const label = isArabic ? article.titleAr : article.titleEn;
    return (
        <Link
            to={article.route}
            className="group relative flex items-center gap-3.5 overflow-hidden rounded-3xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-4 shadow-xs backdrop-blur-xl transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-[var(--VIARA-accent)]/40"
        >
            {/* Subtle gradient shimmer on hover */}
            <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-[var(--VIARA-accent)]/5 to-transparent rounded-3xl" />
            {/* Color accent bar on start edge */}
            <div className={`absolute start-0 top-3 bottom-3 w-1 rounded-full ${tone.dot} opacity-0 group-hover:opacity-100 transition-all duration-200`} />
            <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${tone.bg} border ${tone.badge.split(' ')[2] || 'border-teal-500/30'} transition-all duration-200 group-hover:scale-110 group-hover:shadow-md`}>
                <Icon size={19} className={tone.text} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-black text-[var(--VIARA-ink)] transition-colors duration-200 group-hover:text-[var(--VIARA-accent)]">
                    {label}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[10.5px] font-semibold text-[var(--VIARA-muted)] group-hover:text-[var(--VIARA-accent)]/70 transition-colors duration-200">
                    <ExternalLink size={10} />
                    <span>{t('openWorkspace')}</span>
                </p>
            </div>
            <ChevronRight size={15} className="shrink-0 text-[var(--VIARA-muted)] transition-all duration-200 group-hover:translate-x-1 group-hover:text-[var(--VIARA-accent)] rtl:rotate-180 rtl:group-hover:-translate-x-1 rtl:group-hover:translate-x-0" />
        </Link>
    );
};

const ArticleCard = ({ article, isArabic, canOpenRoute = true }) => {
    const { t } = useTranslation('help');
    const [open, setOpen] = useState(false);
    const [feedback, setFeedback] = useState(() => getHelpFeedback()[article.id] || null);
    const tone = COLOR_MAP[article.color] ?? COLOR_MAP.emerald;
    const Icon = article.icon;
    const CatIcon = CAT_ICON[article.category] ?? BookOpen;
    const governance = getArticleGovernance(article.id);

    const toggle = useCallback(() => setOpen((v) => !v), []);

    const title = isArabic ? article.titleAr : article.titleEn;
    const desc = isArabic ? article.descAr : article.descEn;
    const steps = isArabic ? article.stepsAr : article.stepsEn;
    const contentId = `help-article-${article.id}-content`;

    const submitFeedback = (value) => {
        setFeedback(value);
        saveHelpFeedback(article.id, value);
    };

    const riskColor = governance.riskLevel === 'clinical' || governance.riskLevel === 'high'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
        : governance.riskLevel === 'low'
        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
        : 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)] border-[var(--VIARA-line)]';

    return (
        <div
            className={`group/card overflow-hidden rounded-3xl border transition-all duration-200 ${
                open
                    ? 'border-[var(--VIARA-accent)]/50 bg-[var(--VIARA-surface)] shadow-lg shadow-[var(--VIARA-accent)]/5'
                    : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-xs backdrop-blur-xl hover:border-[var(--VIARA-accent)]/30 hover:shadow-md'
            }`}
        >
            {/* Colored left accent bar */}
            <div className={`absolute start-0 top-0 bottom-0 w-1 ${tone.dot} rounded-s-3xl transition-all duration-200 ${open ? 'opacity-100' : 'opacity-0 group-hover/card:opacity-60'}`} />
            <button
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-controls={contentId}
                aria-label={title}
                className="flex w-full items-start gap-4 p-5 ps-6 text-start transition-colors duration-200 hover:bg-[var(--VIARA-surface-hover)]"
            >
                <div className={`mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${tone.bg} border ${tone.badge.split(' ')[2] || 'border-teal-500/30'} transition-all duration-200 group-hover/card:scale-105 group-hover/card:shadow-md ${open ? 'scale-105' : ''}`}>
                    <Icon size={19} className={tone.text} />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className={`text-sm font-black transition-colors duration-200 ${open ? 'text-[var(--VIARA-accent)]' : 'text-[var(--VIARA-ink)] group-hover/card:text-[var(--VIARA-accent)]'}`}>
                            {title}
                        </h3>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[9.5px] font-black uppercase tracking-wider ${tone.badge}`}>
                            <CatIcon size={10} />
                            <span>{article.category}</span>
                        </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed font-medium text-[var(--VIARA-muted)]">
                        {desc}
                    </p>
                    <div className="mt-2.5 flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            {steps.map((_, si) => (
                                <span key={si} className={`h-1 rounded-full transition-all duration-300 ${open ? `w-4 ${tone.dot}` : `w-1.5 bg-[var(--VIARA-line)]`}`} />
                            ))}
                        </div>
                        <span className="text-[11px] font-bold text-[var(--VIARA-muted)]">{steps.length} {t('actionableSteps')}</span>
                    </div>
                </div>

                <div className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
                    open
                        ? 'bg-[var(--VIARA-accent)] text-[var(--VIARA-accent-contrast)] rotate-180'
                        : 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)] group-hover/card:bg-[var(--VIARA-accent)]/10 group-hover/card:text-[var(--VIARA-accent)]'
                }`}>
                    <ChevronDown size={15} />
                </div>
            </button>

            {open && (
                <div
                    id={contentId}
                    role="region"
                    aria-label={title}
                    className="border-t border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-5 ps-6 animate-in slide-in-from-top-1 fade-in-50 duration-200"
                >
                    {/* Step list with connecting line */}
                    <ol className="relative space-y-0">
                        {steps.map((stepText, i) => (
                            <li key={i} className="relative flex items-start gap-4 pb-4 last:pb-0">
                                {/* Vertical connector line */}
                                {i < steps.length - 1 && (
                                    <div className={`absolute start-[14px] top-6 w-0.5 bottom-0 ${tone.dot} opacity-20`} />
                                )}
                                <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${tone.bg} ${tone.text} border ${tone.badge.split(' ')[2] || 'border-emerald-500/30'} shadow-sm`}>
                                    {i + 1}
                                </span>
                                <p className="pt-1 text-xs leading-relaxed font-semibold text-[var(--VIARA-ink)]">{stepText}</p>
                            </li>
                        ))}
                    </ol>

                    {/* Governance footer */}
                    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--VIARA-line)] pt-4">
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 py-1 text-[10px] font-bold text-[var(--VIARA-muted)]">
                            <ShieldCheck size={9} className="shrink-0" />
                            {isArabic ? `المالك: ${governance.owner}` : `Owner: ${governance.owner}`}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 py-1 text-[10px] font-bold text-[var(--VIARA-muted)]">
                            {isArabic ? `v${governance.version}` : `v${governance.version}`}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold ${riskColor}`}>
                            <Clock size={9} className="shrink-0" />
                            {isArabic ? `مراجعة: ${governance.reviewedAt}` : `Reviewed: ${governance.reviewedAt}`}
                        </span>
                        {governance.riskLevel && (
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold ${riskColor}`}>
                                {governance.riskLevel}
                            </span>
                        )}
                    </div>

                    {article.route && canOpenRoute && (
                        <div className="mt-4 pt-4 border-t border-[var(--VIARA-line)] flex items-center justify-between gap-3">
                            <Link
                                to={article.route}
                                className={`inline-flex items-center gap-2 rounded-xl ${tone.bg} border ${tone.badge.split(' ')[2] || 'border-teal-500/30'} px-4 py-2 text-xs font-black ${tone.text} transition-all hover:scale-[1.02] hover:shadow-md active:scale-[0.98]`}
                            >
                                <Zap size={13} />
                                <span>{t('openInteractiveWorkspace')}</span>
                                <ExternalLink size={11} />
                            </Link>
                            <div className="flex items-center gap-2 text-[11px] font-bold text-[var(--VIARA-muted)]">
                                <span>{t('wasThisGuideHelpful')}</span>
                                <button type="button" aria-pressed={feedback === 'yes'} onClick={() => submitFeedback('yes')} className={`rounded-lg px-2.5 py-1 text-xs transition-all hover:scale-105 active:scale-95 ${feedback === 'yes' ? `${tone.bg} ${tone.text} border ${tone.badge.split(' ')[2] || ''}` : 'bg-[var(--VIARA-surface)] border border-[var(--VIARA-line)] hover:bg-[var(--VIARA-surface-hover)]'}`}>
                                    👍
                                </button>
                                <button type="button" aria-pressed={feedback === 'no'} onClick={() => submitFeedback('no')} className={`rounded-lg px-2.5 py-1 text-xs transition-all hover:scale-105 active:scale-95 ${feedback === 'no' ? 'bg-rose-500/10 text-rose-600 border border-rose-500/30' : 'bg-[var(--VIARA-surface)] border border-[var(--VIARA-line)] hover:bg-[var(--VIARA-surface-hover)]'}`}>
                                    👎
                                </button>
                            </div>
                        </div>
                    )}

                    {article.route && !canOpenRoute && (
                        <p role="note" className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-bold text-amber-800 dark:text-amber-300">
                            {t('youCanReadThisGuideBut')}
                        </p>
                    )}

                    {!article.route && (
                        <div className="mt-4 flex items-center gap-2 text-[11px] font-bold text-[var(--VIARA-muted)]">
                            <span>{t('wasThisGuideHelpful')}</span>
                            <button type="button" aria-pressed={feedback === 'yes'} onClick={() => submitFeedback('yes')} className={`rounded-lg px-2.5 py-1 text-xs transition-all hover:scale-105 active:scale-95 ${feedback === 'yes' ? `${tone.bg} ${tone.text} border ${tone.badge.split(' ')[2] || ''}` : 'bg-[var(--VIARA-surface)] border border-[var(--VIARA-line)] hover:bg-[var(--VIARA-surface-hover)]'}`}>
                                👍
                            </button>
                            <button type="button" aria-pressed={feedback === 'no'} onClick={() => submitFeedback('no')} className={`rounded-lg px-2.5 py-1 text-xs transition-all hover:scale-105 active:scale-95 ${feedback === 'no' ? 'bg-rose-500/10 text-rose-600 border border-rose-500/30' : 'bg-[var(--VIARA-surface)] border border-[var(--VIARA-line)] hover:bg-[var(--VIARA-surface-hover)]'}`}>
                                👎
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const TYPE_TONE = {
    task: { bg: 'bg-teal-500/10', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-500/30' },
    troubleshooting: { bg: 'bg-rose-500/10', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-500/30' },
    shortcut: { bg: 'bg-violet-500/10', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-500/30' },
    workflow: { bg: 'bg-sky-500/10', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-500/30' },
    protocol: { bg: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-500/30' },
    guide: { bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-500/30' },
};

const CatalogResultCard = ({ item, isArabic, user }) => {
    const { t } = useTranslation('help');
    const [expanded, setExpanded] = useState(false);
    const localized = getLocalizedHelpItem(item, isArabic ? 'ar' : 'en');
    const canOpen = itemCanOpen(item, user);
    const typeLabel = HELP_TYPE_LABELS[item.type]?.[isArabic ? 'ar' : 'en'] || item.type;
    const typeTone = TYPE_TONE[item.type] || TYPE_TONE.guide;
    const steps = localized.steps || [];

    return (
        <article className={`overflow-hidden rounded-2xl border ${typeTone.border} ${typeTone.bg} transition-all duration-200 hover:shadow-md`}>
            <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${typeTone.bg} ${typeTone.text} ${typeTone.border}`}>
                                {typeLabel}
                            </span>
                            {item.state && <span className="rounded-full border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)]/80 px-2 py-0.5 text-[9px] font-bold text-[var(--VIARA-muted)]">{item.state}</span>}
                        </div>
                        <h3 className="mt-1.5 text-sm font-black text-[var(--VIARA-ink)] leading-snug">{localized.title}</h3>
                        <p className="mt-0.5 text-xs font-medium leading-relaxed text-[var(--VIARA-muted)]">{localized.summary || localized.description}</p>
                    </div>
                    {item.route && canOpen && (
                        <Link
                            to={item.route}
                            onClick={() => recordHelpEvent('help_route_opened', { itemId: item.id })}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-black transition-all hover:scale-105 active:scale-95 ${typeTone.bg} ${typeTone.text} ${typeTone.border} hover:shadow-sm`}
                        >
                            <Zap size={11} />
                            {t('open')}
                        </Link>
                    )}
                </div>

                {steps.length > 0 && (
                    <div className="mt-3">
                        <button
                            type="button"
                            onClick={() => setExpanded(v => !v)}
                            className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider transition-colors ${typeTone.text} hover:opacity-80`}
                        >
                            <ChevronDown size={11} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                            {expanded
                                ? (isArabic ? 'إخفاء الخطوات' : 'Hide steps')
                                : (isArabic ? `${steps.length} خطوات — اضغط للعرض` : `${steps.length} steps — expand`)}
                        </button>
                        {expanded && (
                            <ol className="mt-2.5 space-y-2 animate-in fade-in-50 duration-200">
                                {steps.map((step, index) => (
                                    <li key={index} className="flex gap-2.5 text-xs font-medium text-[var(--VIARA-ink)]">
                                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-black mt-px ${typeTone.bg} ${typeTone.text}`}>{index + 1}</span>
                                        <span className="leading-relaxed">{step}</span>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                )}

                {item.route && !canOpen && <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] font-bold text-amber-700 dark:text-amber-300">{t('readOnlyGuidanceTheLinkedWorkspace')}</p>}
            </div>
        </article>
    );
};

/* ── Main Help Component ─────────────────────────────────────── */
const Help = () => {
    const { t, i18n } = useTranslation('help');
    const isArabic = i18n.language === 'ar';
    const user = useSelector(selectCurrentUser);
    const role = user?.role || 'Staff';
    const [searchParams, setSearchParams] = useSearchParams();
    const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

    const requestedTab = searchParams.get('tab');
    const requestedRole = searchParams.get('role');
    const requestedQuery = searchParams.get('q') || '';
    const requestedCategory = searchParams.get('category') || 'all';
    const initialTab = HELP_TAB_IDS.includes(requestedTab) ? requestedTab : 'guides';
    const initialCategory = HELP_CATEGORIES.includes(requestedCategory) ? requestedCategory : 'all';
    const requestedPlaybook = ROLE_PLAYBOOKS.find((playbook) => playbook.role === requestedRole);
    const requestedPlaybookAllowed = requestedPlaybook && (requestedPlaybook.role === role || role === 'Admin' || role === 'Developer');
    const [mainTab, setMainTabState] = useState(initialTab);
    const [search, setSearchState] = useState(requestedQuery);
    const [category, setCategoryState] = useState(initialCategory);
    const [selectedRolePlaybook, setSelectedRolePlaybook] = useState(
        requestedPlaybookAllowed ? requestedPlaybook : ROLE_PLAYBOOKS.find(p => p.role === role) || ROLE_PLAYBOOKS[0]
    );
    const [selectedProtocolModality, setSelectedProtocolModality] = useState(CLINICAL_PROTOCOLS[0]);
    const [copied, setCopied] = useState(false);
    const searchRef = useRef(null);

    const updateUrlState = useCallback((next = {}) => {
        const params = new URLSearchParams(searchParams);
        const values = {
            tab: mainTab,
            q: search,
            category,
            role: selectedRolePlaybook?.role || role,
            ...next,
        };
        Object.entries(values).forEach(([key, value]) => {
            const defaultValue = key === 'tab' ? 'guides' : key === 'category' ? 'all' : '';
            if (value && value !== defaultValue) params.set(key, value);
            else params.delete(key);
        });
        setSearchParams(params, { replace: true });
    }, [category, mainTab, role, search, searchParams, selectedRolePlaybook?.role, setSearchParams]);

    const setMainTab = useCallback((value) => {
        setMainTabState(value);
        updateUrlState({ tab: value });
        recordHelpEvent('help_tab_opened', { tab: value, role });
    }, [role, updateUrlState]);

    const setSearch = useCallback((value) => {
        setSearchState(value);
        updateUrlState({ q: value, tab: value ? 'guides' : mainTab });
        if (value) recordHelpEvent('help_search_submitted', { resultCount: null, role });
    }, [mainTab, role, updateUrlState]);

    const setCategory = useCallback((value) => {
        setCategoryState(value);
        updateUrlState({ category: value });
    }, [updateUrlState]);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    useEffect(() => {
        setMainTabState(initialTab);
        setSearchState(requestedQuery);
        setCategoryState(initialCategory);
        if (requestedPlaybookAllowed) {
            setSelectedRolePlaybook(ROLE_PLAYBOOKS.find((playbook) => playbook.role === requestedRole));
        }
    }, [initialCategory, initialTab, requestedPlaybookAllowed, requestedQuery, requestedRole]);

    useEffect(() => {
        if (!ROLE_PLAYBOOKS.some((playbook) => playbook.role === role)) return;
        if (!requestedRole) setSelectedRolePlaybook(ROLE_PLAYBOOKS.find((playbook) => playbook.role === role));
    }, [requestedRole, role]);

    /* Ctrl+K focuses the on-page help search */
    useEffect(() => {
        const handler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                e.stopPropagation();
                searchRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handler, true);
        return () => window.removeEventListener('keydown', handler, true);
    }, []);

    const visibleArticles = useMemo(() => {
        const q = search.trim().toLowerCase();
        return ARTICLES
            .filter((a) => articleVisibleForRole(a, user))
            .filter((a) => category === 'all' || a.category === category)
            .filter((a) => {
                if (!q) return true;
                const searchCorpus = [
                    a.titleEn,
                    a.titleAr,
                    a.descEn,
                    a.descAr,
                    a.stepsEn.join(' '),
                    a.stepsAr.join(' '),
                    a.keywords || ''
                ].join(' ').toLowerCase();
                return searchCorpus.includes(q);
            });
    }, [category, search, user]);

    const catalogItems = useMemo(() => [
        ...HELP_TASKS,
        ...HELP_TROUBLESHOOTING,
        ...HELP_SHORTCUTS,
        ...CLINICAL_PROTOCOLS.map(protocolAsSearchItem),
        ...ARTICLES.map(legacyArticleAsSearchItem),
    ], []);

    const catalogResults = useMemo(() => {
        if (!search.trim()) return [];
        const seen = new Set();
        return searchHelpCatalog(search, user || {}, i18n.language, catalogItems).filter((item) => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
        });
    }, [catalogItems, i18n.language, search, user]);

    const availableCategories = CATEGORIES.filter(
        (c) => c === 'all' || ARTICLES.some((a) => a.category === c && articleVisibleForRole(a, user))
    );

    const categoryCounts = useMemo(() => {
        const map = {};
        ARTICLES.filter((a) => articleVisibleForRole(a, user)).forEach((a) => {
            map[a.category] = (map[a.category] || 0) + 1;
        });
        return map;
    }, [user]);

    const quickLinks = useMemo(
        () => ARTICLES.filter((a) => articleVisibleForRole(a, user) && a.route && articleCanOpen(a, user)).slice(0, 4),
        [user]
    );
    const roleArticleCount = ARTICLES.filter((a) => articleVisibleForRole(a, user)).length;
    const accessiblePlaybooks = useMemo(() => ROLE_PLAYBOOKS.filter((playbook) => {
        if (playbook.role === role || role === 'Admin' || role === 'Developer') return true;
        return false;
    }), [role]);
    const roleStages = useMemo(() => getRoleWorkflowStages(role), [role]);
    const visibleTroubleshooting = useMemo(() => HELP_TROUBLESHOOTING.filter((item) => itemCanBeRead(item, user || {})), [user]);

    const clearSearch = () => {
        setSearch('');
        searchRef.current?.focus();
    };

    const selectPlaybook = (playbook) => {
        setSelectedRolePlaybook(playbook);
        updateUrlState({ role: playbook.role, tab: 'playbooks' });
    };

    const copyDiagnostics = async () => {
        const text = [
            `=========================================`,
            `VIARA RADIOLOGY ENTERPRISE DIAGNOSTICS`,
            `=========================================`,
            `Active User Role: ${role}`,
            `Interface Language: ${i18n.language}`,
            `Online Network Status: ${isOnline ? 'Connected' : 'Offline'}`,
            `Current Route: ${window.location.pathname}${window.location.search}`,
            `Effective Permissions: ${Array.from(getEffectivePermissions(user || {})).sort().join(', ') || 'role-only session'}`,
            `Help Content Version: 1.0`,
            `User Agent: ${navigator.userAgent}`,
            `Screen Viewport: ${window.innerWidth}x${window.innerHeight}`,
            `Client Timestamp: ${new Date().toISOString()}`,
            `=========================================`,
        ].join('\n');
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            toast.success(t('systemDiagnosticsCopiedToClipboard'));
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error(t('copyFailed'));
        }
    };

    return (
        <main className="mx-auto max-w-[1600px] space-y-6 pb-14">
            {/* ── Knowledge Hero Command Deck ─────────────────────── */}
            <div className="relative overflow-hidden rounded-3xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-sm backdrop-blur-xl">
                {/* Animated gradient blobs */}
                <div className="pointer-events-none absolute -end-24 -top-24 h-96 w-96 rounded-full bg-[var(--VIARA-accent)]/15 blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
                <div className="pointer-events-none absolute -bottom-24 -start-24 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '1s' }} />
                <div className="pointer-events-none absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 h-48 w-48 rounded-full bg-sky-500/5 blur-2xl" />

                <div className="relative p-6 sm:p-8">
                    {/* Top row: badges */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--VIARA-accent)]/30 bg-[var(--VIARA-accent-soft)] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-accent)]">
                            <Sparkles size={11} />
                            <span>{t('eyebrow', 'Knowledge Base & Operations Manual')}</span>
                        </span>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black ${
                            isOnline
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                            {isOnline ? t('onlineSync') : t('offlineMode')}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-1 text-[10px] font-black text-[var(--VIARA-ink)]">
                            <ShieldCheck size={11} className="text-[var(--VIARA-accent)]" />
                            {t(`roles.${role}`, { defaultValue: role })}
                        </span>
                    </div>

                    <PageHeader
                        icon={BookOpen}
                        title={isArabic ? 'مركز المعرفة والعمليات' : 'Knowledge & Operations Center'}
                        subtitle={isArabic
                            ? `تغطية تشغيلية كاملة لجميع الأقسام والبروتوكولات السريرية — دور: ${t(`roles.${role}`, { defaultValue: role })}`
                            : `Complete ${ARTICLES.length}-guide workflow manuals, clinical protocols, and troubleshooting for ${role}`}
                        metricsLabel={isArabic ? 'مؤشرات مركز المعرفة' : 'Knowledge center indicators'}
                        metrics={[
                            { icon: BookOpen, label: isArabic ? 'الأدلة المتاحة' : 'Guides', value: roleArticleCount, tone: 'teal' },
                            { icon: Layers, label: isArabic ? 'الأقسام' : 'Categories', value: Math.max(0, availableCategories.length - 1), tone: 'violet' },
                            { icon: GitBranch, label: isArabic ? 'مراحل المسار' : 'Workflow Stages', value: WORKFLOW_STAGES.length, tone: 'sky' },
                            { icon: Keyboard, label: isArabic ? 'اختصار لوحة مفاتيح' : 'Shortcuts', value: KEYBOARD_SHORTCUTS.reduce((acc, g) => acc + g.shortcuts.length, 0), tone: 'amber' },
                        ]}
                    />

                    {/* Search Bar */}
                    <div className="relative mt-5 max-w-2xl">
                        <Search size={17} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-[var(--VIARA-muted)]" />
                        <input
                            ref={searchRef}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('searchWorkflowsExamProtocolsShortcutsOr')}
                            aria-label={t('searchHelpGuides')}
                            className="h-14 w-full rounded-2xl border-2 border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] ps-12 pe-28 text-sm font-semibold text-[var(--VIARA-ink)] outline-none transition-all duration-200 placeholder:text-[var(--VIARA-muted)] placeholder:font-normal focus:border-[var(--VIARA-accent)] focus:bg-[var(--VIARA-surface)] focus:shadow-[0_0_0_4px_var(--VIARA-accent)]/10"
                        />
                        <div className="absolute end-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                            {search && (
                                <>
                                    {catalogResults.length > 0 && (
                                        <span className="rounded-full border border-[var(--VIARA-accent)]/30 bg-[var(--VIARA-accent-soft)] px-2 py-0.5 text-[10px] font-black text-[var(--VIARA-accent)]">
                                            {catalogResults.length}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={clearSearch}
                                        aria-label={t('clearSearch')}
                                        className="grid h-7 w-7 place-items-center rounded-lg text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-surface-hover)] hover:text-[var(--VIARA-ink)] transition"
                                    >
                                        <X size={14} />
                                    </button>
                                </>
                            )}
                            {!search && (
                                <kbd className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-[var(--VIARA-line)] border-b-2 bg-[var(--VIARA-surface)] px-2 py-1 font-mono text-[10px] font-black text-[var(--VIARA-muted)] shadow-sm">
                                    Ctrl<span className="opacity-50">+</span>K
                                </kbd>
                            )}
                        </div>
                    </div>

                    {/* Sub-Tabs Strip */}
                    <div role="tablist" aria-label={t('helpCenterSections')} className="mt-5 flex gap-1.5 overflow-x-auto border-t border-[var(--VIARA-line)] pt-4 scrollbar-none">
                        {[
                            { id: 'guides', label: isArabic ? `الأدلة` : `Guides`, count: ARTICLES.length, icon: BookOpen },
                            { id: 'playbooks', label: isArabic ? 'دليل الدور' : 'Playbooks', count: null, icon: CheckSquare },
                            { id: 'workflows', label: isArabic ? 'المسار' : 'Workflow', count: WORKFLOW_STAGES.length, icon: GitBranch },
                            { id: 'protocols', label: isArabic ? 'البروتوكولات' : 'Protocols', count: CLINICAL_PROTOCOLS.length, icon: HeartPulse },
                            { id: 'troubleshooting', label: isArabic ? 'استكشاف الأخطاء' : 'Troubleshoot', count: TROUBLESHOOTING_GUIDES.length + visibleTroubleshooting.length, icon: AlertTriangle },
                            { id: 'shortcuts', label: isArabic ? 'الاختصارات' : 'Shortcuts', count: KEYBOARD_SHORTCUTS.reduce((a, g) => a + g.shortcuts.length, 0), icon: Keyboard },
                        ].map(tab => {
                            const Icon = tab.icon;
                            const isActive = mainTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setMainTab(tab.id)}
                                    role="tab"
                                    id={`help-tab-${tab.id}`}
                                    aria-selected={isActive}
                                    aria-controls={`help-panel-${tab.id}`}
                                    tabIndex={isActive ? 0 : -1}
                                    className={`relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition-all duration-200 whitespace-nowrap ${
                                        isActive
                                            ? 'bg-[var(--VIARA-accent)] text-[var(--VIARA-accent-contrast)] shadow-md shadow-[var(--VIARA-accent)]/30'
                                            : 'border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-surface-hover)] hover:text-[var(--VIARA-ink)] hover:border-[var(--VIARA-accent)]/30'
                                    }`}
                                >
                                    <Icon size={13} />
                                    <span>{tab.label}</span>
                                    {tab.count != null && (
                                        <span className={`rounded-full px-1.5 py-px text-[9px] font-black ${
                                            isActive ? 'bg-white/25 text-white' : 'bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)]'
                                        }`}>{tab.count}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* TAB 1: WORKFLOW MANUALS */}
            {mainTab === 'guides' && (
                <div id="help-panel-guides" role="tabpanel" aria-labelledby="help-tab-guides" className="space-y-6">
                    {search.trim() && (
                        <section aria-live="polite" className="overflow-hidden rounded-3xl border border-[var(--VIARA-accent)]/30 bg-[var(--VIARA-surface)] shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--VIARA-line)] bg-[var(--VIARA-accent-soft)] px-5 py-3">
                                <div className="flex items-center gap-3">
                                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--VIARA-accent)] text-[var(--VIARA-accent-contrast)]">
                                        <Search size={14} />
                                    </div>
                                    <div>
                                        <h2 className="text-sm font-black text-[var(--VIARA-ink)]">{t('resultsAcrossTheEntireHelpCenter')}</h2>
                                        <p className="text-xs font-medium text-[var(--VIARA-muted)]">{isArabic ? `${catalogResults.length} نتيجة في المهام والأدلة والبروتوكولات` : `${catalogResults.length} results across tasks, guides, protocols, errors, and shortcuts`}</p>
                                    </div>
                                </div>
                                <span className="rounded-full border border-[var(--VIARA-accent)]/30 bg-[var(--VIARA-surface)] px-3 py-1 text-sm font-black text-[var(--VIARA-accent)]">{catalogResults.length}</span>
                            </div>
                            <div className="p-5">
                                {catalogResults.length > 0 ? (
                                    <div className="grid gap-3 lg:grid-cols-2">
                                        {catalogResults.slice(0, 12).map((item) => <CatalogResultCard key={item.id} item={item} isArabic={isArabic} user={user} />)}
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2 py-6 text-center">
                                        <Search size={28} className="text-[var(--VIARA-muted)] opacity-40" />
                                        <p className="text-xs font-bold text-[var(--VIARA-muted)]">{t('noMatchingResultTryAWorkflow')}</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {/* Quick Access Workspaces Strip */}
                    {!search.trim() && (
                        <section className="space-y-3" aria-labelledby="quick-heading">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 id="quick-heading" className="text-sm font-black text-[var(--VIARA-ink)]">
                                        {t('frequentRoleWorkspaces')}
                                    </h2>
                                    <p className="text-xs font-medium text-[var(--VIARA-muted)]">{t('directShortcutsToCriticalWorkflows')}</p>
                                </div>
                                <span className="rounded-full border border-[var(--VIARA-accent)]/30 bg-[var(--VIARA-accent-soft)] px-3 py-0.5 text-[11px] font-black text-[var(--VIARA-accent)]">
                                    {quickLinks.length}
                                </span>
                            </div>
                            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                                {quickLinks.map((a) => (
                                    <QuickCard key={a.id} article={a} isArabic={isArabic} />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Main Articles Grid & Support Sidebar */}
                    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                        {/* Article Directory */}
                        <div className="space-y-4 min-w-0">
                            {/* Section header */}
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-4 py-3">
                                <div>
                                    <h2 className="text-sm font-black text-[var(--VIARA-ink)]">{isArabic ? `فهرس الأدلة التشغيلية (${ARTICLES.length} دليلاً)` : `Full ${ARTICLES.length}-Guide Operational Index`}</h2>
                                    <p className="text-xs font-medium text-[var(--VIARA-muted)]">
                                        {isArabic ? `${visibleArticles.length} متاح لدورك` : `${visibleArticles.length} available for your role`}
                                    </p>
                                </div>
                                <span className="text-2xl font-black tabular-nums text-[var(--VIARA-accent)]">{visibleArticles.length}</span>
                            </div>

                            {/* Category Filter Pills */}
                            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                                {availableCategories.map((c) => {
                                    const Icon = c === 'all' ? BookOpen : CAT_ICON[c] || BookOpen;
                                    const active = category === c;
                                    const count = c === 'all' ? roleArticleCount : categoryCounts[c];
                                    const catName = isArabic ? {
                                        all: 'الكل',
                                        gettingStarted: 'البداية',
                                        clinical: 'السريري',
                                        operations: 'العمليات',
                                        administration: 'الإدارة',
                                        account: 'الحساب'
                                    }[c] || c : {
                                        all: 'All', gettingStarted: 'Getting Started', clinical: 'Clinical',
                                        operations: 'Operations', administration: 'Admin', account: 'Account'
                                    }[c] || c;

                                    return (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setCategory(c)}
                                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition-all duration-200 ${
                                                active
                                                    ? 'bg-[var(--VIARA-accent)] text-[var(--VIARA-accent-contrast)] shadow-sm shadow-[var(--VIARA-accent)]/30'
                                                    : 'border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] hover:border-[var(--VIARA-accent)]/30 hover:text-[var(--VIARA-ink)]'
                                            }`}
                                        >
                                            <Icon size={12} />
                                            <span>{catName}</span>
                                            {count != null && (
                                                <span className={`rounded-full px-1.5 text-[9px] font-black ${active ? 'bg-white/25 text-white' : 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)]'}`}>
                                                    {count}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Articles List */}
                            {visibleArticles.length === 0 ? (
                                <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-8 text-center">
                                    <Search size={30} className="text-[var(--VIARA-muted)] opacity-60" />
                                    <p className="mt-3 text-sm font-black text-[var(--VIARA-ink)]">{t('noMatchingGuidesFound')}</p>
                                    <p className="mt-1 text-xs font-medium text-[var(--VIARA-muted)]">{t('tryRefiningYourSearchKeywordOr')}</p>
                                    <button
                                        type="button"
                                        onClick={() => { clearSearch(); setCategory('all'); }}
                                        className="mt-4 rounded-xl border border-[var(--VIARA-accent)]/30 bg-[var(--VIARA-accent-soft)] px-4 py-2 text-xs font-bold text-[var(--VIARA-accent)] hover:brightness-110 transition"
                                    >
                                        {t('resetSearchFilters')}
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {visibleArticles.map((a) => (
                                        <ArticleCard key={a.id} article={a} isArabic={isArabic} canOpenRoute={articleCanOpen(a, user)} />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Sidebar Cards */}
                        <aside className="space-y-4">
                            {/* Support & Diagnostics Card */}
                            <div className="overflow-hidden rounded-3xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-xs">
                                <div className="flex items-center gap-3 border-b border-[var(--VIARA-line)] bg-amber-500/5 p-4">
                                    <div className="grid h-9 w-9 place-items-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                                        <LifeBuoy size={17} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-[var(--VIARA-ink)]">{t('technicalSupport')}</h3>
                                        <p className="text-[11px] font-medium text-[var(--VIARA-muted)]">{t('diagnosticLogsEscalation')}</p>
                                    </div>
                                </div>
                                <div className="p-4 space-y-3">
                                    <p className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-3 text-xs font-medium leading-relaxed text-amber-900 dark:text-amber-200">
                                        {t('contactTheRadiologyCenterSystemAdministrator')}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={copyDiagnostics}
                                        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black transition-all hover:scale-[1.02] active:scale-[0.98] ${
                                            copied
                                                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                                                : 'border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-ink)] hover:border-[var(--VIARA-accent)]/30 hover:text-[var(--VIARA-accent)]'
                                        }`}
                                    >
                                        {copied ? <Check size={14} /> : <Copy size={14} />}
                                        <span>{copied ? t('copied') : t('copySystemDiagnostics')}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Clinical Safety Compliance Card */}
                            <div className="relative overflow-hidden rounded-3xl border border-[var(--VIARA-accent)]/30 p-5">
                                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--VIARA-accent)]/10 via-[var(--VIARA-accent)]/5 to-transparent" />
                                <div className="relative">
                                    <div className="flex items-center gap-2 text-xs font-black text-[var(--VIARA-accent)]">
                                        <div className="grid h-7 w-7 place-items-center rounded-xl bg-[var(--VIARA-accent)]/10">
                                            <CheckCircle2 size={14} />
                                        </div>
                                        <span>{t('clinicalGovernanceSafety')}</span>
                                    </div>
                                    <p className="mt-2.5 text-xs font-medium text-[var(--VIARA-muted)] leading-relaxed">
                                        {t('reportAccessEditsAndApprovalsAre')}
                                    </p>
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        {[
                                            { icon: Eye, label: isArabic ? 'مراقبة الوصول' : 'Access Logged' },
                                            { icon: ShieldCheck, label: isArabic ? 'مراجعة التدقيق' : 'Audit Trails' },
                                            { icon: Lock, label: isArabic ? 'تشفير البيانات' : 'Encrypted' },
                                            { icon: Award, label: isArabic ? 'الإصدار 1.0' : 'Version 1.0' },
                                        ].map(feat => {
                                            const FeatIcon = feat.icon;
                                            return (
                                                <div key={feat.label} className="flex items-center gap-1.5 rounded-xl border border-[var(--VIARA-accent)]/20 bg-[var(--VIARA-surface)]/60 px-2.5 py-1.5">
                                                    <FeatIcon size={11} className="text-[var(--VIARA-accent)] shrink-0" />
                                                    <span className="text-[10px] font-bold text-[var(--VIARA-ink)] truncate">{feat.label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </aside>
                    </section>
                </div>
            )}

            {/* TAB 2: ROLE PLAYBOOKS */}
            {mainTab === 'playbooks' && (
                <section id="help-panel-playbooks" role="tabpanel" aria-labelledby="help-tab-playbooks" className="space-y-5">
                    {/* Role Selector Pills */}
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                        {accessiblePlaybooks.map((pb) => {
                            const Icon = pb.icon;
                            const isActive = selectedRolePlaybook.role === pb.role;
                            const tone = COLOR_MAP[pb.color] ?? COLOR_MAP.emerald;
                            return (
                                <button
                                    key={pb.role}
                                    type="button"
                                    onClick={() => selectPlaybook(pb)}
                                    className={`inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black transition-all duration-200 ${
                                        isActive
                                            ? `${tone.bg} ${tone.text} border ${tone.badge.split(' ')[2] || ''} shadow-sm`
                                            : 'border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-surface-hover)] hover:text-[var(--VIARA-ink)]'
                                    }`}
                                >
                                    <Icon size={15} />
                                    <span>{isArabic ? pb.titleAr.split(' ')[0] : pb.title.split(' ')[0]}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Selected Role Playbook Detail Card */}
                    {(() => {
                        const pb = selectedRolePlaybook;
                        const tone = COLOR_MAP[pb.color] ?? COLOR_MAP.emerald;
                        const PlaybookIcon = pb.icon;
                        return (
                            <div className="overflow-hidden rounded-3xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-xs">
                                {/* Gradient header */}
                                <div className={`relative overflow-hidden p-6 ${tone.bg} border-b ${tone.badge.split(' ')[2] || 'border-emerald-500/20'}`}>
                                    <div className="pointer-events-none absolute -end-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                                    <div className="relative flex items-center gap-4">
                                        <div className={`grid h-14 w-14 place-items-center rounded-2xl bg-[var(--VIARA-surface)] ${tone.text} shadow-sm`}>
                                            <PlaybookIcon size={26} />
                                        </div>
                                        <div className="min-w-0">
                                            <h2 className={`text-base font-black ${tone.text}`}>
                                                {isArabic ? pb.titleAr : pb.title}
                                            </h2>
                                            <p className="mt-0.5 text-xs font-medium text-[var(--VIARA-ink)] opacity-70 leading-relaxed max-w-lg">
                                                {isArabic ? pb.summaryAr : pb.summary}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6 space-y-6">
                                    {/* Checklist Section */}
                                    <div className="space-y-3">
                                        <h3 className={`flex items-center gap-2 text-xs font-black uppercase tracking-wider ${tone.text}`}>
                                            <CheckSquare size={14} />
                                            <span>{t('dailyCoreWorkflowChecklist')}</span>
                                        </h3>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            {pb.checklist.map((it, idx) => (
                                                <label
                                                    key={idx}
                                                    className={`group flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-all duration-200 hover:border-[var(--VIARA-accent)]/30 hover:shadow-sm ${tone.badge.split(' ')[2] ? `border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]` : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]'}`}
                                                >
                                                    <div className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-black ${tone.bg} ${tone.text} border ${tone.badge.split(' ')[2] || ''}`}>
                                                        {idx + 1}
                                                    </div>
                                                    <p className="text-xs font-semibold text-[var(--VIARA-ink)] leading-relaxed pt-0.5">
                                                        {isArabic ? it.ar : it.en}
                                                    </p>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Primary Workspaces Section */}
                                    <div className="space-y-3 border-t border-[var(--VIARA-line)] pt-5">
                                        <h3 className="text-xs font-black uppercase tracking-wider text-[var(--VIARA-muted)]">
                                            {t('primaryWorkspacesLinkedToThisRole')}
                                        </h3>
                                        <div className="grid gap-3 sm:grid-cols-3">
                                            {pb.primaryRoutes.filter(rt => canAccessRouteTarget(rt.path, user)).map(rt => (
                                                <Link
                                                    key={rt.path}
                                                    to={rt.path}
                                                    className={`group flex items-center gap-3 rounded-2xl border p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${tone.bg} ${tone.badge.split(' ')[2] ? `border-${tone.badge.split(' ')[2].replace('border-', '')}` : 'border-emerald-500/20'}`}
                                                >
                                                    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[var(--VIARA-surface)] ${tone.text}`}>
                                                        <ExternalLink size={14} />
                                                    </div>
                                                    <span className={`text-xs font-black ${tone.text}`}>{isArabic ? rt.nameAr : rt.name}</span>
                                                    <ChevronRight size={13} className={`ms-auto shrink-0 ${tone.text} transition-transform group-hover:translate-x-0.5 rtl:rotate-180`} />
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </section>
            )}

            {/* TAB 3: WORKFLOW JOURNEY */}
            {mainTab === 'workflows' && (
                <section id="help-panel-workflows" role="tabpanel" aria-labelledby="help-tab-workflows" className="space-y-5">
                    <div className="rounded-3xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-6 shadow-xs">
                        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
                            <div>
                                <h2 className="text-base font-black text-[var(--VIARA-ink)]">{t('studyJourneyFromRegistrationToDelivery')}</h2>
                                <p className="mt-1 text-xs font-medium text-[var(--VIARA-muted)]">{t('showsEachStationStateOwnerNext')}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--VIARA-accent)]/30 bg-[var(--VIARA-accent-soft)] px-3 py-1 text-xs font-black text-[var(--VIARA-accent)]">
                                    <GitBranch size={12} />
                                    {WORKFLOW_STAGES.length} {t('stages')}
                                </span>
                                {roleStages.length > 0 && (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-700 dark:text-emerald-300">
                                        <CheckCircle2 size={12} />
                                        {isArabic ? `${roleStages.length} مرحلة لدورك` : `${roleStages.length} your stages`}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Vertical stepper timeline */}
                        <div className="relative">
                            {/* Connecting backbone line */}
                            <div className="absolute start-[19px] top-5 bottom-5 w-0.5 bg-gradient-to-b from-[var(--VIARA-accent)]/40 via-[var(--VIARA-line)] to-[var(--VIARA-line)] rounded-full" />

                            <div className="space-y-3">
                                {WORKFLOW_STAGES.map((stage, index) => {
                                    const availableForRole = roleStages.some((candidate) => candidate.id === stage.id);
                                    const canOpen = canAccessRouteTarget(stage.route, user);
                                    return (
                                        <article
                                            key={stage.id}
                                            className={`relative flex gap-4 rounded-2xl border p-4 transition-all duration-200 ${
                                                availableForRole
                                                    ? 'border-[var(--VIARA-accent)]/40 bg-[var(--VIARA-accent-soft)] shadow-sm'
                                                    : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]'
                                            }`}
                                        >
                                            {/* Step bullet */}
                                            <span className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black transition-all ${
                                                availableForRole
                                                    ? 'bg-[var(--VIARA-accent)] text-[var(--VIARA-accent-contrast)] shadow-md shadow-[var(--VIARA-accent)]/30'
                                                    : 'border-2 border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)]'
                                            }`}>{index + 1}</span>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <div>
                                                        <h3 className={`text-sm font-black ${availableForRole ? 'text-[var(--VIARA-accent)]' : 'text-[var(--VIARA-ink)]'}`}>
                                                            {isArabic ? stage.ar : stage.en}
                                                        </h3>
                                                        <div className="mt-0.5 flex items-center gap-2 text-[10px] font-bold text-[var(--VIARA-muted)]">
                                                            <span className="rounded-full border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2 py-0.5">{stage.state}</span>
                                                            <ChevronRight size={9} />
                                                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5">{stage.next}</span>
                                                        </div>
                                                    </div>
                                                    {canOpen && (
                                                        <Link
                                                            to={stage.route}
                                                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--VIARA-accent)]/30 bg-[var(--VIARA-accent-soft)] px-3 py-1.5 text-[11px] font-black text-[var(--VIARA-accent)] transition hover:bg-[var(--VIARA-accent)] hover:text-[var(--VIARA-accent-contrast)]"
                                                        >
                                                            <ExternalLink size={11} />
                                                            {t('openStation')}
                                                        </Link>
                                                    )}
                                                </div>

                                                <p className="mt-2 text-xs font-medium leading-relaxed text-[var(--VIARA-muted)]">
                                                    {isArabic ? stage.escalationAr : stage.escalationEn}
                                                </p>

                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    {stage.roles.map((stageRole) => (
                                                        <span
                                                            key={stageRole}
                                                            className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${
                                                                availableForRole && stageRole === role
                                                                    ? 'border-[var(--VIARA-accent)]/40 bg-[var(--VIARA-accent)]/10 text-[var(--VIARA-accent)]'
                                                                    : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)]'
                                                            }`}
                                                        >
                                                            {t(`roles.${stageRole}`, { defaultValue: stageRole })}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* TAB 4: CLINICAL EXAM PROTOCOLS & PATIENT PREPARATION */}
            {mainTab === 'protocols' && (
                <section id="help-panel-protocols" role="tabpanel" aria-labelledby="help-tab-protocols" className="space-y-6">
                    <div role="note" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-bold leading-relaxed text-amber-900 dark:text-amber-200">
                        {t('clinicalSafetyReferenceThisGuidanceDoes')}
                        <span className="mt-2 block text-[10px] font-black uppercase tracking-wider">{t('ownerMedicalDirectorVersion10')}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <h2 className="text-base font-black text-[var(--VIARA-ink)]">
                                {t('clinicalModalityProtocolsPatientPrepDirectory')}
                            </h2>
                            <p className="text-xs font-semibold text-[var(--VIARA-muted)] mt-0.5">
                                {t('standardFastingInstructionsContrastSafetyAnd')}
                            </p>
                        </div>
                    </div>

                    {/* Modality Selector Pills */}
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                        {CLINICAL_PROTOCOLS.map((p) => {
                            const Icon = p.icon;
                            const isActive = selectedProtocolModality.id === p.id;
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setSelectedProtocolModality(p)}
                                    className={`inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-black transition ${
                                        isActive
                                            ? 'bg-[var(--VIARA-accent)] text-[var(--VIARA-accent-contrast)] shadow-sm'
                                            : 'border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-surface-hover)] hover:text-[var(--VIARA-ink)]'
                                    }`}
                                >
                                    <Icon size={16} />
                                    <span>{isArabic ? p.modalityAr : p.modality}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Protocols Grid */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        {selectedProtocolModality.exams.map((ex, idx) => (
                            <div
                                key={idx}
                                className="rounded-3xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-5 shadow-xs backdrop-blur-xl space-y-3.5"
                            >
                                <div className="flex items-start justify-between gap-3 border-b border-[var(--VIARA-line)] pb-3">
                                    <h3 className="text-sm font-black text-[var(--VIARA-ink)]">
                                        {isArabic ? ex.nameAr : ex.name}
                                    </h3>
                                    <span className="shrink-0 rounded-full border border-[var(--VIARA-accent)]/30 bg-[var(--VIARA-accent-soft)] px-2.5 py-0.5 text-[10px] font-black text-[var(--VIARA-accent)]">
                                        {selectedProtocolModality.id.toUpperCase()}
                                    </span>
                                </div>

                                <div className="space-y-2 text-xs">
                                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
                                            {t('fastingHydrationInstructions')}
                                        </p>
                                        <p className="mt-1 font-bold text-amber-950 dark:text-amber-200 leading-relaxed">
                                            {isArabic ? ex.fastingAr : ex.fasting}
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-3">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">
                                            {t('clinicalSafetyPreExamPrep')}
                                        </p>
                                        <p className="mt-1 font-semibold text-[var(--VIARA-ink)] leading-relaxed">
                                            {isArabic ? ex.prepAr : ex.prep}
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-sky-800 dark:text-sky-300">
                                            {t('intravenousContrastProtocol')}
                                        </p>
                                        <p className="mt-1 font-bold text-sky-950 dark:text-sky-200 leading-relaxed">
                                            {isArabic ? ex.contrastAr : ex.contrast}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* TAB 5: TROUBLESHOOTING MATRIX */}
            {mainTab === 'troubleshooting' && (
                <section id="help-panel-troubleshooting" role="tabpanel" aria-labelledby="help-tab-troubleshooting" className="space-y-4">
                    <div className="mb-2">
                        <h2 className="text-base font-black text-[var(--VIARA-ink)]">
                            {t('operationalTechnicalIncidentResolver')}
                        </h2>
                        <p className="text-xs font-semibold text-[var(--VIARA-muted)]">
                            {t('instantTroubleshootingStepsForCommonRadiology')}
                        </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {visibleTroubleshooting.map((item) => <CatalogResultCard key={item.id} item={item} isArabic={isArabic} user={user} />)}
                        {TROUBLESHOOTING_GUIDES.map(item => {
                            const Icon = item.icon;
                            const tone = COLOR_MAP[item.color] ?? COLOR_MAP.rose;
                            return (
                                <article
                                    key={item.id}
                                    className="rounded-3xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-5 shadow-xs backdrop-blur-xl space-y-3.5"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${tone.bg} ${tone.text} border ${tone.badge.split(' ')[2] || 'border-rose-500/30'}`}>
                                            <Icon size={20} />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-[var(--VIARA-ink)]">
                                                {isArabic ? item.titleAr : item.title}
                                            </h3>
                                            <p className={`text-[11px] font-semibold mt-0.5 ${tone.text}`}>
                                                {isArabic ? item.causeAr : item.cause}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-4 space-y-2">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-accent)]">
                                            {t('recommendedResolutionSteps')}
                                        </p>
                                        <ol className="space-y-1.5 text-xs font-bold text-[var(--VIARA-ink)]">
                                            {item.solutions.map((sol, idx) => (
                                                <li key={idx} className="flex items-start gap-2">
                                                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-black ${tone.bg} ${tone.text}`}>{idx + 1}</span>
                                                    <span className="pt-px">{isArabic ? sol.ar : sol.en}</span>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* TAB 6: KEYBOARD SHORTCUTS & PACS */}
            {mainTab === 'shortcuts' && (
                <section id="help-panel-shortcuts" role="tabpanel" aria-labelledby="help-tab-shortcuts" className="space-y-6">
                    <div className="mb-2">
                        <h2 className="text-base font-black text-[var(--VIARA-ink)]">
                            {t('completeKeyboardDicomViewerShortcuts')}
                        </h2>
                        <p className="text-xs font-semibold text-[var(--VIARA-muted)]">
                            {t('powerUserKeyboardKeysForRapid')}
                        </p>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-3">
                        {KEYBOARD_SHORTCUTS.map(group => (
                            <div
                                key={group.category}
                                className="rounded-3xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-5 shadow-xs backdrop-blur-xl space-y-3"
                            >
                                <h3 className="border-b border-[var(--VIARA-line)] pb-3 text-xs font-black uppercase tracking-wider text-[var(--VIARA-accent)]">
                                    {isArabic ? group.categoryAr : group.category}
                                </h3>
                                <div className="space-y-1">
                                    {group.shortcuts.map(s => (
                                        <ShortcutRow key={s.label} keys={s.keys} label={isArabic ? s.labelAr : s.label} />
                                    ))}
                                </div>
                            </div>
                        ))}
                        {/* Role-filtered catalog shortcuts as a dedicated group */}
                        {(() => {
                            const roleShortcuts = HELP_SHORTCUTS.filter((shortcut) => itemCanBeRead(shortcut, user || {}));
                            if (!roleShortcuts.length) return null;
                            return (
                                <div className="rounded-3xl border border-[var(--VIARA-accent)]/30 bg-[var(--VIARA-accent-soft)] p-5 shadow-xs backdrop-blur-xl space-y-3">
                                    <h3 className="border-b border-[var(--VIARA-accent)]/20 pb-3 text-xs font-black uppercase tracking-wider text-[var(--VIARA-accent)]">
                                        {isArabic ? 'مفاتيح دورك الوظيفي' : 'Your Role Shortcuts'}
                                    </h3>
                                    <div className="space-y-1">
                                        {roleShortcuts.map((shortcut) => {
                                            const localized = getLocalizedHelpItem(shortcut, isArabic ? 'ar' : 'en');
                                            return <ShortcutRow key={shortcut.id} keys={shortcut.keys} label={localized.title} />;
                                        })}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </section>
            )}
        </main>
    );
};

export default Help;
