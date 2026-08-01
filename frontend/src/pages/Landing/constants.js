import {
    Activity,
    BarChart3,
    Calendar,
    CheckCircle2,
    CreditCard,
    FileText,
    Radio,
    Share2,
    Sliders,
    Sparkles,
    Stethoscope,
    UserCheck,
    UserCircle,
} from 'lucide-react';

export const METRICS = [
    { key: 'today_exams', dataKey: 'studiesToday', fallbackEn: 'Studies today', fallbackAr: 'فحوصات اليوم', icon: Activity, tone: 'blue' },
    { key: 'pending_reports', dataKey: 'pendingReports', fallbackEn: 'Reports pending', fallbackAr: 'تقارير معلقة', icon: FileText, tone: 'amber' },
    { key: 'active_devices', dataKey: 'activeModalities', fallbackEn: 'Active modalities', fallbackAr: 'أجهزة نشطة', icon: Radio, tone: 'violet' },
    { key: 'completion_rate', dataKey: 'completionRate', suffix: '%', fallbackEn: 'Completion rate today', fallbackAr: 'معدل الإنجاز اليوم', icon: CheckCircle2, tone: 'emerald' },
];

export const PORTAL_SHORTCUTS = [
    { key: 'staff', enLabel: 'Staff entry', arLabel: 'دخول الموظفين', icon: UserCheck, path: '/login', primary: true },
    { key: 'patient', enLabel: 'Patient portal', arLabel: 'بوابة المريض', icon: UserCircle, path: '/login' },
    { key: 'doctor', enLabel: 'Doctor portal', arLabel: 'بوابة الطبيب', icon: Stethoscope, path: '/login' },
];

export const SERVICE_CATEGORIES = [
    { id: 'live', enLabel: 'Live activity', arLabel: 'نشاط مباشر', hasDot: true },
    { id: 'pacs', enLabel: 'PACS and clinical', arLabel: 'PACS والسريرية' },
    { id: 'reception', enLabel: 'Reception and appointments', arLabel: 'الاستقبال والمواعيد' },
    { id: 'financial', enLabel: 'Finance and analytics', arLabel: 'المالية والتحليلات' },
];

export const ALL_SERVICES = [
    {
        key: 'reception',
        category: 'reception',
        icon: Calendar,
        enTitle: 'Reception and scheduling',
        arTitle: 'الاستقبال والجدولة',
        enDescription: 'Register visits, manage appointments, track arrivals, and move reception queues without interruption.',
        arDescription: 'تسجيل الزيارات وإدارة المواعيد ومتابعة الوصول وتحريك طوابير الاستقبال دون انقطاع.',
        badgeEn: 'Live queue',
        badgeAr: 'طابور مباشر',
        badgeTone: 'blue',
    },
    {
        key: 'pacs',
        category: 'pacs',
        icon: Radio,
        enTitle: 'PACS worklists',
        arTitle: 'قوائم عمل PACS',
        enDescription: 'Give modality teams a direct view of assigned studies, cases, templates, and image availability.',
        arDescription: 'منح فرق الأجهزة رؤية مباشرة للفحوصات المخصصة والحالات والقوالب وتوفر الصور.',
        badgeEn: 'DICOM link',
        badgeAr: 'ربط DICOM',
        badgeTone: 'teal',
    },
    {
        key: 'reporting',
        category: 'pacs',
        icon: FileText,
        enTitle: 'Reporting workspace',
        arTitle: 'مساحة التقارير',
        enDescription: 'Bring dictation, templates, review, reconciliation, printing, and report delivery into one place.',
        arDescription: 'تجميع الإملاء والقوالب والمراجعة والمطابقة والطباعة وتسليم التقارير في مكان واحد.',
        badgeEn: 'Smart reports',
        badgeAr: 'تقارير ذكية',
        badgeTone: 'sky',
    },
    {
        key: 'billing',
        category: 'financial',
        icon: CreditCard,
        enTitle: 'Billing and revenue',
        arTitle: 'الفوترة والإيرادات',
        enDescription: 'Connect claims, invoices, receipts, and insurance to seamless payment tracking.',
        arDescription: 'ربط المطالبات والفواتير والإيصالات والتأمين ومتابعة الدفع بسير العمل السلس.',
        badgeEn: 'Instant claims',
        badgeAr: 'مطالبات فورية',
        badgeTone: 'emerald',
    },
    {
        key: 'analytics',
        category: 'financial',
        icon: BarChart3,
        enTitle: 'Management analytics',
        arTitle: 'تحليلات الإدارة',
        enDescription: 'Track productivity, turnaround time, modality utilization, workload, and revenue trends.',
        arDescription: 'مقاييس إنتاجية وزمن الإنجاز واستخدام الأجهزة وعبء عمل أطباء الأشعة واتجاهات الإيرادات.',
        badgeEn: 'Admin KPIs',
        badgeAr: 'مؤشرات الإدارة',
        badgeTone: 'purple',
    },
    {
        key: 'settings',
        category: 'reception',
        icon: Sliders,
        enTitle: 'Center configuration',
        arTitle: 'تهيئة المركز',
        enDescription: 'Manage branches, departments, users, report alerts, printing, and system preferences.',
        arDescription: 'إدارة الفروع والأقسام والمستخدمين وتنبيهات التقارير وإعدادات الطباعة وتفضيلات النظام العامة.',
        badgeEn: 'Full governance',
        badgeAr: 'حوكمة كاملة',
        badgeTone: 'amber',
    },
];

export const PATIENT_PORTAL_SERVICE = {
    key: 'patient_portal',
    icon: Share2,
    enTitle: 'Results delivery and patient portals',
    arTitle: 'تسليم النتائج وبوابات المرضى',
    enDescription: 'Secure report delivery through QR codes, WhatsApp, SMS notifications, referring-doctor access, and protected file sharing.',
    arDescription: 'تسليم التقارير عبر رمز QR الآمن، وإرسال إشعارات واتساب ورسائل قصيرة، وبوابة الأطباء المعالجين ومشاركة الملفات المحمية.',
    badgeEn: 'Secure portal',
    badgeAr: 'بوابة آمنة',
};

export const WORKFLOW_STEPS = [
    { key: 'reception', dataKey: 'registrationMinutes', number: '01', icon: Calendar, fallbackTitleEn: 'Referral and registration', fallbackTitleAr: 'الاستقبال والإحالة والتسجيل' },
    { key: 'imaging', dataKey: 'imagingMinutes', number: '02', icon: Radio, fallbackTitleEn: 'Imaging and PACS link', fallbackTitleAr: 'التصوير وربط PACS' },
    { key: 'reporting', dataKey: 'reportingMinutes', number: '03', icon: Sparkles, fallbackTitleEn: 'Reporting and approval', fallbackTitleAr: 'التقارير والاعتماد' },
    { key: 'delivery', dataKey: 'deliveryMinutes', number: '04', icon: CheckCircle2, fallbackTitleEn: 'Delivery and billing', fallbackTitleAr: 'التسليم والفوترة' },
];
