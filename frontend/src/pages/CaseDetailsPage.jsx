import React, { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Activity,
    AlertTriangle,
    ArrowLeft,
    Baby,
    Check,
    CheckCircle2,
    CircleDashed,
    ClipboardCheck,
    Clock,
    Copy,
    FileCheck2,
    FileSearch,
    FileText,
    HeartPulse,
    Image as ImageIcon,
    Info,
    Loader2,
    Lock,
    PenLine,
    Printer,
    RefreshCw,
    ScanLine,
    ShieldAlert,
    ShieldCheck,
    Stethoscope,
    Syringe,
    Unlink,
    UserCheck,
    UserRound,
    XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useGetExamQuery } from '../store/api';
import { selectCurrentUser } from '../store/authSlice';
import { useSelector } from 'react-redux';
import { canAccessRoute } from '../config/routes';
import { formatDateTime, formatLocalizedDate } from '../utils/localizedDate';
import { authenticatedFetch } from '../utils/authenticatedFetch';
import PageHeader from '../components/ui/PageHeader';
import { printWhenReady } from '../utils/printDocument';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const ar = {
    loading: 'جاري تحميل ملف الحالة...',
    notFound: 'الحالة غير موجودة أو تعذر الوصول إليها.',
    notFoundHelp: 'قد تكون الزيارة حُذفت أو لم تُسند إليك أو تغيّرت صلاحية الوصول. ارجع إلى قائمة العمل وحاول مجددًا.',
    back: 'قائمة العمل',
    eyebrow: 'ملف الحالة الإشعاعية',
    patientProfile: 'ملف المريض',
    writeReport: 'كتابة التقرير',
    openReport: 'متابعة التقرير',
    printReport: 'طباعة التقرير PDF',
    printPage: 'طباعة الصفحة',
    refresh: 'تحديث',
    viewDicom: 'عارض الصور (PACS)',
    copySummary: 'نسخ ملخص الحالة',
    copied: 'تم النسخ إلى الحافظة',
    copyFailed: 'تعذر النسخ',
    printError: 'تعذر فتح ملف التقرير. فُتحت نافذة طباعة الصفحة.',
    stage: 'المرحلة',
    priority: 'الأولوية',
    report: 'التقرير',
    radiologist: 'طبيب الأشعة',
    workflow: 'مسار الفحص',
    patientInfo: 'بيانات المريض',
    clinicalInfo: 'الطلب والتفاصيل السريرية',
    safety: 'فحوصات السلامة',
    timeline: 'الجدول الزمني',
    diagnosticReport: 'التقرير التشخيصي',
    logistics: 'بيانات الفحص',
    reportUnavailable: 'لم يُسجَّل نص التقرير بعد.',
    reportRestricted: 'نص التقرير متاح فقط للأدوار المصرح لها بالاطلاع على التقارير.',
    radiologistSign: 'توقيع الإشعاعي',
    impression: 'الخلاصة',
    findings: 'المعطيات',
    indication: 'دواعي الفحص',
    provisional: 'التشخيص المبدئي',
    bodyPart: 'المنطقة التشريحية',
    contrast: 'الصبغة',
    icd: 'رمز ICD',
    preparation: 'تعليمات التحضير',
    notes: 'ملاحظات الحجز',
    followUp: 'متابعة لفحص سابق',
    priorStudy: 'الفحص السابق',
    modality: 'الجهاز',
    room: 'الغرفة',
    technician: 'أخصائي التصوير',
    nurse: 'التمريض',
    referrer: 'الطبيب المحوّل',
    selfReferred: 'بدون إحالة',
    unassigned: 'غير معيّن',
    required: 'مطلوبة',
    notRequired: 'غير مطلوبة',
    allergies: 'الحساسية',
    chronic: 'الأمراض المزمنة',
    cancelled: 'ملغاة',
    delivered: 'تم التسليم',
    locked: 'مقفل ومعتمد',
    amended: 'معدَّل',
    amendmentReason: 'سبب التعديل',
    restrictedNotice: 'مقيّد بالصلاحية',
};

const tr = (t, key, defaultEn, defaultAr, isAr) => t(key, { defaultValue: isAr ? defaultAr : defaultEn });

const STAGE_FALLBACK = {
    'Registered': ['Registered', 'تسجيل'],
    'Scheduled': ['Scheduled', 'مجدول'],
    'Arrived': ['Arrived', 'حضر المريض'],
    'Payment Pending': ['Payment Pending', 'بانتظار الدفع'],
    'Prep Pending': ['Prep Pending', 'بانتظار التحضير'],
    'Ready for Exam': ['Ready for Exam', 'جاهز للفحص'],
    'In Exam': ['In Exam', 'جاري التصوير'],
    'Images Ready': ['Images Ready', 'الصور جاهزة'],
    'Images Delivered': ['Images Delivered', 'تسليم الصور'],
    'Reporting': ['Reporting', 'قيد التقرير'],
    'Finalized': ['Finalized', 'معتمد'],
    'Delivered': ['Delivered', 'تم التسليم'],
    'Cancelled': ['Cancelled', 'ملغى'],
};

const translateStage = (stage, t, isAr) => {
    if (!stage) return '—';
    const fallback = STAGE_FALLBACK[stage] || [stage, stage];
    return t(`roleCommand.stages.${stage}`, { defaultValue: isAr ? fallback[1] : fallback[0] });
};

const translatePriority = (priority, t, isAr) => {
    const fallback = {
        Routine: ['Routine', 'عادي'],
        Urgent: ['Urgent', 'عاجل'],
        Emergency: ['Emergency', 'طارئ']
    }[priority] || [priority || 'Routine', priority || 'عادي'];
    return t(`priorities.${priority}`, { defaultValue: isAr ? fallback[1] : fallback[0] });
};

const translateGender = (gender, t, isAr) => {
    const normalized = String(gender || '').toLowerCase().startsWith('m') ? 'Male'
        : String(gender || '').toLowerCase().startsWith('f') ? 'Female' : null;
    if (!normalized) return '—';
    return t(`patient.gender.${normalized}`, {
        defaultValue: isAr ? (normalized === 'Male' ? 'ذكر' : 'أنثى') : normalized
    });
};

// Backend enum: Unknown | Cleared | At Risk | Not Applicable
const SAFETY_FALLBACK = {
    Cleared: ['Cleared', 'آمن'],
    'At Risk': ['At Risk', 'خطر محتمل'],
    'Not Applicable': ['Not Applicable', 'لا ينطبق'],
    Unknown: ['Not Assessed', 'لم يُقيَّم'],
};
const safetyTone = (status) => {
    if (status === 'Cleared' || status === 'Not Applicable') {
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300';
    }
    if (status === 'At Risk') {
        return 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-300 ring-1 ring-rose-500/20';
    }
    return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400';
};

const translateSafety = (status, t, isAr) => {
    const fallback = SAFETY_FALLBACK[status] || SAFETY_FALLBACK.Unknown;
    return t(`safety.${status || 'Unknown'}`, { defaultValue: isAr ? fallback[1] : fallback[0] });
};

const REPORT_STATUS_FALLBACK = {
    Draft: ['Draft', 'مسودة'],
    Typed: ['Typed', 'مُملى'],
    Reviewed: ['Reviewed', 'مراجع'],
    Approved: ['Approved', 'معتمد'],
    Finalized: ['Finalized', 'نهائي'],
    Amended: ['Amended', 'معدَّل'],
};

const translateReportStatus = (status, t, isAr) => {
    if (!status) return '—';
    const fallback = REPORT_STATUS_FALLBACK[status] || [status, status];
    return t(`statuses.${status}`, { defaultValue: isAr ? fallback[1] : fallback[0] });
};

const getInitials = (name) => {
    if (!name) return 'PT';
    return String(name).split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
};

const calculateAge = (dob) => {
    if (!dob) return null;
    const birth = new Date(dob);
    if (Number.isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDelta = today.getMonth() - birth.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1;
    return age >= 0 && age < 130 ? age : null;
};

const formatDateTimeOrDash = (value, language) => (value ? formatDateTime(value, language) : '—');

const parseSections = (sections) => {
    if (!sections) return {};
    if (typeof sections === 'string') {
        try { return JSON.parse(sections) || {}; } catch { return {}; }
    }
    return sections;
};

const priorityBadgeStyles = {
    Emergency: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
    Urgent: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    Routine: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
};

const stageBadgeStyles = {
    danger: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
    success: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
    info: 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
};

const stageBadgeTone = (stage) => {
    if (stage === 'Cancelled') return 'danger';
    if (stage === 'Finalized' || stage === 'Delivered') return 'success';
    if (stage === 'Reporting' || stage === 'Images Ready' || stage === 'Images Delivered') return 'info';
    return 'neutral';
};

/* ─── Section Panel ─── */
const SectionPanel = ({ icon: Icon, title, description, badge, action, children, className = '' }) => (
    <section className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 ${className}`}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100/80 bg-slate-50/50 px-4 py-3 dark:border-slate-800/80 dark:bg-slate-950/30 sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-teal-500/15 text-teal-700 dark:text-teal-300">
                    <Icon size={16} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <h2 className="truncate text-sm font-black text-slate-900 dark:text-white">{title}</h2>
                        {badge}
                    </div>
                    {description && <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500 dark:text-slate-400">{description}</p>}
                </div>
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </header>
        <div className="p-4 sm:p-5">{children}</div>
    </section>
);

/* ─── Detail Field ─── */
const DetailField = ({ icon: Icon, label, value, mono = false }) => (
    <div className="min-w-0 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 dark:border-slate-800/80 dark:bg-slate-950/40">
        <div className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {Icon && <Icon size={12} className="shrink-0 text-teal-600 dark:text-teal-400" aria-hidden="true" />}
            <span className="truncate">{label}</span>
        </div>
        <p className={`mt-1 break-words text-xs font-semibold text-slate-800 dark:text-slate-200 sm:text-[13px] ${mono ? 'font-mono' : ''}`}>
            {value || '—'}
        </p>
    </div>
);

/* ─── Workflow Stepper ─── */
const WorkflowStepper = ({ stage, exam, language, isAr, t }) => {
    const cancelled = stage === 'Cancelled' || exam.status === 'Cancelled';
    const stages = [
        { key: 'Arrived', icon: UserCheck, date: exam.arrived_at, activeStages: ['Arrived', 'Payment Pending'] },
        { key: 'Prep', icon: ClipboardCheck, date: exam.prep_completed_at, activeStages: ['Prep Pending', 'Ready for Exam'] },
        { key: 'Exam', icon: ScanLine, date: exam.exam_completed_at, activeStages: ['In Exam'] },
        { key: 'Images', icon: ImageIcon, date: exam.images_ready_at, activeStages: ['Images Ready', 'Images Delivered'] },
        { key: 'Reporting', icon: FileSearch, date: exam.reporting_started_at, activeStages: ['Reporting'] },
        { key: 'Final', icon: FileCheck2, date: exam.report_finalized_at, activeStages: ['Finalized', 'Delivered'] },
    ];
    const activeIndex = stages.findIndex((step) => step.activeStages.includes(stage));

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal-500/15 text-teal-700 dark:text-teal-300">
                        <Activity size={15} />
                    </span>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                        {tr(t, 'caseDetails.workflow', 'Examination workflow', ar.workflow, isAr)}
                    </h3>
                </div>
                {cancelled ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[10px] font-black text-rose-700 dark:text-rose-300">
                        <XCircle size={12} />
                        {translateStage('Cancelled', t, isAr)}
                    </span>
                ) : (
                    <span className="rounded-full bg-teal-500/15 px-2.5 py-0.5 font-mono text-[10px] font-black text-teal-700 dark:text-teal-300">
                        {activeIndex >= 0 ? `${activeIndex + 1}/${stages.length}` : '—'}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
                {stages.map((step, index) => {
                    const isDone = cancelled ? false : (index < activeIndex || (activeIndex === -1 && Boolean(step.date)));
                    const isCurrent = !cancelled && index === activeIndex;
                    const StepIcon = step.icon;
                    const labels = {
                        Arrived: [isAr ? 'الوصول' : 'Arrival', 'Arrived', 'الوصول'],
                        Prep: [isAr ? 'التحضير' : 'Preparation', 'Prep Pending', 'التحضير'],
                        Exam: [isAr ? 'التصوير' : 'Imaging', 'In Exam', 'التصوير'],
                        Images: [isAr ? 'الصور' : 'Images', 'Images Ready', 'الصور'],
                        Reporting: [isAr ? 'التقرير' : 'Reporting', 'Reporting', 'التقرير'],
                        Final: [isAr ? 'الاعتماد' : 'Finalize', 'Finalized', 'الاعتماد'],
                    }[step.key];

                    return (
                        <div
                            key={step.key}
                            className={`relative flex flex-col justify-between rounded-xl border p-2.5 transition-all ${
                                isCurrent
                                    ? 'border-teal-500/50 bg-teal-500/10 shadow-sm ring-2 ring-teal-500/20 dark:bg-teal-950/30'
                                    : isDone
                                    ? 'border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-950/40'
                                    : 'border-slate-200/60 bg-white/40 opacity-50 dark:border-slate-800/60 dark:bg-slate-900/40'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className={`grid h-7 w-7 place-items-center rounded-lg ${
                                    isCurrent
                                        ? 'bg-teal-600 text-white shadow-xs'
                                        : isDone
                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                }`}>
                                    <StepIcon size={14} />
                                </span>
                                {isDone && <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />}
                                {isCurrent && <span className="h-2 w-2 animate-ping rounded-full bg-teal-500" />}
                            </div>
                            <div className="mt-2 min-w-0">
                                <strong className={`block truncate text-xs font-black ${isCurrent ? 'text-teal-900 dark:text-teal-200' : 'text-slate-800 dark:text-slate-200'}`}>
                                    {labels[0]}
                                </strong>
                                <small className="block truncate font-mono text-[9px] font-semibold text-slate-500 dark:text-slate-400">
                                    {formatDateTimeOrDash(step.date, language)}
                                </small>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

/* ─── Safety Tile ─── */
const SafetyCheckCard = ({ icon: Icon, label, status, t, isAr }) => (
    <div className={`flex items-center justify-between gap-2.5 rounded-xl border p-3 ${safetyTone(status)}`}>
        <span className="flex min-w-0 items-center gap-2 text-xs font-bold">
            <Icon size={16} className="shrink-0" />
            <span className="truncate">{label}</span>
        </span>
        <span className="shrink-0 font-mono text-[10.5px] font-black uppercase">
            {translateSafety(status, t, isAr)}
        </span>
    </div>
);

const headerButtonClass = 'inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800';

/* ─── Main Case Details Page ─── */
const CaseDetailsPage = () => {
    const { examId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { t, i18n } = useTranslation(['worklist', 'common']);
    const language = i18n.language;
    const isRtl = i18n.dir() === 'rtl';
    const isAr = language?.startsWith('ar');
    const [isPrintingReport, setIsPrintingReport] = useState(false);

    const user = useSelector(selectCurrentUser);
    const canViewReport = canAccessRoute('/case-reports', user);
    const canWriteReport = canAccessRoute('/reports/editor/:examId', user);
    const canViewPacs = canAccessRoute('/pacs/viewer', user);
    const canOpenPatientRecord = canAccessRoute('/patients/:patientId', user);

    const {
        data: exam,
        isLoading,
        isError,
        isFetching,
        refetch,
    } = useGetExamQuery(examId, { skip: !examId });

    const requestedReturnTo = location.state?.returnTo;
    const safeReturnTo = typeof requestedReturnTo === 'string' && requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//')
        ? requestedReturnTo
        : null;

    const stage = exam?.queue_stage || exam?.status || 'Scheduled';
    const isCancelled = stage === 'Cancelled' || exam?.status === 'Cancelled';
    const isReportFinalized = ['Finalized', 'Amended'].includes(exam?.report_status)
        && Boolean(exam?.report_locked)
        && Boolean(exam?.report_finalized_at);

    const timestamps = useMemo(() => ({
        booked_at: exam?.created_at || exam?.start_time,
        arrived_at: exam?.arrived_at,
        prep_completed_at: exam?.prep_completed_at,
        exam_started_at: exam?.exam_started_at,
        exam_completed_at: exam?.exam_completed_at,
        images_ready_at: exam?.images_ready_at,
        reporting_started_at: exam?.reporting_started_at,
        report_finalized_at: exam?.report_finalized_at,
        delivered_at: exam?.delivered_at,
    }), [exam]);

    if (isLoading) {
        return (
            <div className="flex min-h-[500px] items-center justify-center p-6">
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 p-8 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                    <Loader2 size={32} className="animate-spin text-teal-600 dark:text-teal-400" />
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                        {tr(t, 'status.loading', 'Loading case details...', ar.loading, isAr)}
                    </p>
                </div>
            </div>
        );
    }

    if (isError || !exam) {
        return (
            <div className="flex min-h-[500px] items-center justify-center p-6">
                <div className="max-w-md rounded-2xl border border-rose-200 bg-white/90 p-8 text-center shadow-sm backdrop-blur-xl dark:border-rose-900/50 dark:bg-slate-900/90">
                    <AlertTriangle size={40} className="mx-auto text-rose-500" />
                    <h2 className="mt-3 text-base font-black text-slate-900 dark:text-white">
                        {tr(t, 'status.error', 'Case not found or access denied.', ar.notFound, isAr)}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {tr(t, 'caseDetails.unavailableHelp', 'This visit may have been removed, assigned elsewhere, or your access may have changed. Return to the previous record or worklist and try again.', ar.notFoundHelp, isAr)}
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate(safeReturnTo || '/worklist')}
                        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
                    >
                        <ArrowLeft size={14} className={isRtl ? 'rotate-180' : ''} />
                        <span>{tr(t, 'caseDetails.backToWorklist', 'Back to worklist', ar.back, isAr)}</span>
                    </button>
                </div>
            </div>
        );
    }

    const patientName = exam.patient_name || (isAr ? 'مريض بدون اسم' : 'Unnamed Patient');
    const examTitle = exam.exam_type_name || exam.modality_name || (isAr ? 'فحص إشعاعي' : 'Diagnostic Study');
    const radiologist = exam.radiologist_name;
    const age = calculateAge(exam.date_of_birth);
    const priority = exam.priority || 'Routine';
    const sections = parseSections(exam.report_sections);
    const reportFindings = sections.findings || '';
    const impression = sections.impression || '';
    const reportText = exam.report_content || '';
    const backTarget = safeReturnTo || (canOpenPatientRecord && exam.patient_id ? `/patients/${encodeURIComponent(exam.patient_id)}?tab=visits` : '/worklist');
    const backLabel = canOpenPatientRecord && exam.patient_id
        ? tr(t, 'caseDetails.backToPatient', 'Back to patient visits', 'العودة إلى زيارات المريض', isAr)
        : tr(t, 'caseDetails.backToWorklist', 'Back to worklist', ar.back, isAr);

    const handlePrintReport = async (autoPrint = true) => {
        if (isPrintingReport) return;
        setIsPrintingReport(true);
        try {
            const queryParams = new URLSearchParams({
                templateStyle: 'modern',
                fields: 'patient_name,mrn,study_date,referring_doctor'
            });
            const response = await authenticatedFetch(`${API_BASE}/exams/${examId}/report/pdf?${queryParams.toString()}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const htmlText = await response.text();
            const url = URL.createObjectURL(new Blob([htmlText], { type: 'text/html' }));
            const popup = window.open(url, '_blank', 'noopener,noreferrer');
            if (!popup) {
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.target = '_blank';
                anchor.click();
            } else if (autoPrint) {
                popup.addEventListener('load', () => popup.print(), { once: true });
            }
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch {
            toast.error(isAr ? ar.printError : 'Could not open the finalized report. Opening print dialog.');
            await printWhenReady();
        } finally {
            setIsPrintingReport(false);
        }
    };

    const handleOpenViewer = () => {
        const params = new URLSearchParams();
        if (exam.study_instance_uid) params.set('StudyInstanceUID', exam.study_instance_uid);
        if (examId) params.set('examId', examId);
        navigate(`/pacs/viewer?${params.toString()}`);
    };

    const copyCaseSummary = async () => {
        const summary = [
            `Case: ${examTitle}`,
            `Patient: ${patientName} (MRN: ${exam.mrn || 'N/A'})`,
            `Order: #${exam.order_number || examId}`,
            `Stage: ${stage}`,
            `Priority: ${priority}`,
            `Modality: ${exam.modality_name || 'N/A'}${exam.room_number ? ` · Room ${exam.room_number}` : ''}`,
            `Radiologist: ${radiologist || 'Unassigned'}`,
            `Report: ${exam.report_status || 'Pending'}${isReportFinalized ? ' (finalized)' : ''}`
        ].join('\n');
        try {
            await navigator.clipboard.writeText(summary);
            toast.success(isAr ? ar.copied : 'Case summary copied');
        } catch {
            toast.error(isAr ? ar.copyFailed : 'Failed to copy');
        }
    };

    const canResumeReport = canWriteReport && !isCancelled && !isReportFinalized;
    const hasReportContent = Boolean(reportText || reportFindings || impression);

    return (
        <div className="space-y-4 pb-12" dir={isRtl ? 'rtl' : 'ltr'}>
            <PageHeader
                icon={FileSearch}
                eyebrow={tr(t, 'caseDetails.eyebrow', 'Radiology case file', ar.eyebrow, isAr)}
                title={examTitle}
                description={`${patientName} · ${exam.mrn || '—'} · #${exam.order_number || examId}`}
                meta={
                    <>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-black text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <UserRound size={12} />
                            {translateGender(exam.gender, t, isAr)}
                            {age !== null && ` · ${age}`}
                        </span>
                        {exam.is_follow_up && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-50 px-2.5 py-0.5 text-[10px] font-black text-violet-700 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-300">
                                <RefreshCw size={12} />
                                {tr(t, 'details.followUp', 'Follow-up', ar.followUp, isAr)}
                            </span>
                        )}
                    </>
                }
                metrics={[
                    {
                        key: 'stage',
                        icon: Activity,
                        label: tr(t, 'details.status', 'Stage', ar.stage, isAr),
                        value: translateStage(stage, t, isAr),
                        tone: isCancelled ? 'rose' : ['Finalized', 'Delivered'].includes(stage) ? 'emerald' : 'teal'
                    },
                    {
                        key: 'priority',
                        icon: ShieldAlert,
                        label: tr(t, 'details.priority', 'Priority', ar.priority, isAr),
                        value: translatePriority(priority, t, isAr),
                        tone: priority === 'Routine' ? 'slate' : 'rose'
                    },
                    {
                        key: 'report',
                        icon: FileCheck2,
                        label: tr(t, 'details.diagnosis', 'Report', ar.report, isAr),
                        value: translateReportStatus(exam.report_status, t, isAr),
                        tone: isReportFinalized ? 'emerald' : exam.report_request_status === 'NotRequested' ? 'slate' : 'amber'
                    },
                    {
                        key: 'radiologist',
                        icon: Stethoscope,
                        label: tr(t, 'table.patient', 'Radiologist', ar.radiologist, isAr),
                        value: radiologist || (isAr ? ar.unassigned : 'Unassigned'),
                        tone: radiologist ? 'blue' : 'slate'
                    }
                ]}
                metricsLabel={isAr ? 'مؤشرات سجل الحالة' : 'Case record indicators'}
                actions={
                    <div className="flex flex-wrap items-center gap-2 print:hidden">
                        {canResumeReport && (
                            <button
                                type="button"
                                onClick={() => navigate(`/reports/editor/${examId}`)}
                                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-black text-white shadow-xs transition hover:bg-teal-500"
                            >
                                <PenLine size={14} />
                                <span>{hasReportContent
                                    ? tr(t, 'actions.editReport', 'Resume report', ar.openReport, isAr)
                                    : tr(t, 'actions.writeReport', 'Write report', ar.writeReport, isAr)}</span>
                            </button>
                        )}
                        {canViewReport && isReportFinalized && (
                            <button
                                type="button"
                                onClick={() => handlePrintReport(true)}
                                disabled={isPrintingReport}
                                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 text-xs font-bold text-emerald-800 shadow-xs transition hover:bg-emerald-500/20 disabled:opacity-60 dark:text-emerald-300"
                            >
                                <Printer size={14} />
                                <span>{tr(t, 'actions.exportReport', 'Report PDF', ar.printReport, isAr)}</span>
                            </button>
                        )}
                        {canViewPacs && !isCancelled && (
                            <button
                                type="button"
                                onClick={handleOpenViewer}
                                className={headerButtonClass}
                            >
                                <ImageIcon size={14} className="text-sky-500" />
                                <span>{tr(t, 'actions.launchPacs', 'PACS viewer', ar.viewDicom, isAr)}</span>
                            </button>
                        )}
                        {canOpenPatientRecord && exam.patient_id && (
                            <Link to={`/patients/${encodeURIComponent(exam.patient_id)}`} className={headerButtonClass}>
                                <UserRound size={14} />
                                <span className="hidden sm:inline">{tr(t, 'actions.viewPatient', 'Patient record', ar.patientProfile, isAr)}</span>
                            </Link>
                        )}
                        <button type="button" onClick={copyCaseSummary} className={`w-10 px-0 ${headerButtonClass}`} title={tr(t, 'caseDetails.copySummary', 'Copy case summary', ar.copySummary, isAr)} aria-label={tr(t, 'caseDetails.copySummary', 'Copy case summary', ar.copySummary, isAr)}>
                            <Copy size={15} />
                        </button>
                        <button
                            type="button"
                            onClick={() => { refetch(); }}
                            className={`w-10 px-0 ${headerButtonClass}`}
                            title={tr(t, 'caseDetails.refresh', 'Refresh', ar.refresh, isAr)}
                            aria-label={tr(t, 'caseDetails.refresh', 'Refresh', ar.refresh, isAr)}
                        >
                            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                        </button>
                        <button type="button" onClick={() => navigate(backTarget)} className={`w-10 px-0 ${headerButtonClass}`} title={backLabel} aria-label={backLabel}>
                            <ArrowLeft size={15} className={isRtl ? 'rotate-180' : ''} />
                        </button>
                    </div>
                }
            />

            {isCancelled && (
                <div className="flex items-center gap-2.5 rounded-2xl border border-rose-300/60 bg-rose-500/10 p-3.5 text-sm font-bold text-rose-800 dark:border-rose-900/60 dark:text-rose-300">
                    <XCircle size={18} className="shrink-0" />
                    <span>{tr(t, 'statuses.Cancelled', 'This case has been cancelled.', isAr ? 'تم إلغاء هذه الحالة.' : 'This case has been cancelled.')}</span>
                </div>
            )}

            {/* Patient & logistics */}
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-5">
                    <div className="flex items-start gap-3.5">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-teal-500/30 bg-teal-500/15 text-base font-black text-teal-700 dark:text-teal-300 sm:h-14 sm:w-14 sm:text-lg">
                            {getInitials(patientName)}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-black text-slate-900 dark:text-white sm:text-lg">{patientName}</h2>
                                <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10.5px] font-black uppercase ${stageBadgeStyles[stageBadgeTone(stage)]}`}>
                                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                    {translateStage(stage, t, isAr)}
                                </span>
                                <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10.5px] font-black uppercase ${priorityBadgeStyles[priority] || priorityBadgeStyles.Routine}`}>
                                    {translatePriority(priority, t, isAr)}
                                </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                <span>MRN: <strong className="text-slate-900 dark:text-white">{exam.mrn || '—'}</strong></span>
                                <span>{tr(t, 'details.sex', 'Gender', 'النوع', isAr)}: <strong>{translateGender(exam.gender, t, isAr)}</strong></span>
                                {age !== null && <span>{tr(t, 'details.age', 'Age', 'العمر', isAr)}: <strong>{age}</strong></span>}
                                {exam.date_of_birth && <span>DOB: <strong>{formatLocalizedDate(exam.date_of_birth, language)}</strong></span>}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 sm:grid-cols-4">
                        <DetailField icon={Clock} label={tr(t, 'details.scheduled', 'Appointment', 'الموعد', isAr)} value={timestamps.booked_at ? formatDateTimeOrDash(exam.start_time || timestamps.booked_at, language) : '—'} mono />
                        <DetailField icon={ClipboardCheck} label={tr(t, 'details.preparation', 'Preparation', 'التحضير', isAr)} value={exam.preparation_status || '—'} />
                        <DetailField icon={FileText} label={tr(t, 'details.order', 'Order', 'رقم الطلب', isAr)} value={exam.order_number || '—'} mono />
                        <DetailField
                            icon={exam.contrast_required ? Syringe : ShieldCheck}
                            label={tr(t, 'details.contrast', 'Contrast', 'الصبغة', isAr)}
                            value={exam.contrast_required
                                ? tr(t, 'roleCommand.required', 'Required', ar.required, isAr)
                                : tr(t, 'roleCommand.notRequired', 'Not required', ar.notRequired, isAr)}
                        />
                    </div>
                </div>

                <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-5">
                    <h3 className="mb-3 text-[10px] font-black uppercase tracking-wider text-slate-400">
                        {tr(t, 'caseDetails.telemetry', 'Study logistics', ar.logistics, isAr)}
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                        <DetailField icon={ImageIcon} label={tr(t, 'details.modality', 'Modality', ar.modality, isAr)} value={exam.modality_name || exam.modality_type || '—'} />
                        <DetailField icon={Activity} label={tr(t, 'details.machine', 'Room', ar.room, isAr)} value={exam.room_number || '—'} mono />
                        <DetailField icon={UserCheck} label={tr(t, 'details.patient', 'Radiologist', ar.radiologist, isAr)} value={radiologist || (isAr ? ar.unassigned : 'Unassigned')} />
                        <DetailField icon={ScanLine} label={tr(t, 'details.exam', 'Technician', ar.technician, isAr)} value={exam.technician_name || '—'} />
                        <DetailField icon={HeartPulse} label={tr(t, 'details.referrer', 'Referrer', ar.referrer, isAr)} value={exam.referring_doctor_name || (isAr ? ar.selfReferred : 'Self-referred')} />
                        <DetailField icon={Stethoscope} label={tr(t, 'table.patient', 'Nurse', 'التمريض', isAr)} value={exam.nurse_name || '—'} />
                    </div>
                    {exam.is_follow_up && exam.prior_order_number && (
                        <div className="mt-3 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/70 p-2.5 text-[11px] font-bold text-violet-800 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-300">
                            <RefreshCw size={13} className="shrink-0" />
                            <span className="min-w-0 truncate">
                                {tr(t, 'details.priorStudy', 'Prior study', ar.priorStudy, isAr)}: #{exam.prior_order_number}
                                {exam.prior_exam_time ? ` · ${formatDateTimeOrDash(exam.prior_exam_time, language)}` : ''}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <WorkflowStepper stage={stage} exam={exam} language={language} isAr={isAr} t={t} />

            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                    {/* Diagnostic report */}
                    <SectionPanel
                        icon={FileText}
                        title={tr(t, 'caseDetails.diagnosticReport', 'Diagnostic report', ar.diagnosticReport, isAr)}
                        description={isReportFinalized
                            ? (isAr ? 'تقرير معتمد وموقّع' : 'Final signed interpretation')
                            : (isAr ? 'قيد المراجعة الإشعاعية' : 'Awaiting radiologist review')}
                        badge={
                            exam.report_status ? (
                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9.5px] font-black ${
                                    isReportFinalized
                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                }`}>
                                    {isReportFinalized ? <CheckCircle2 size={11} /> : <CircleDashed size={11} />}
                                    {translateReportStatus(exam.report_status, t, isAr)}
                                    {exam.report_status === 'Amended' && ` · ${ar.amended}`}
                                </span>
                            ) : null
                        }
                    >
                        {!canViewReport ? (
                            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
                                <Lock size={15} className="shrink-0 text-slate-400" />
                                <span>{tr(t, 'caseDetails.reportRestricted', 'Report text is restricted to roles with report-view access.', ar.reportRestricted, isAr)}</span>
                            </div>
                        ) : (
                            <>
                                {exam.critical_result && (
                                    <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-rose-400/50 bg-rose-500/10 p-3.5 text-xs font-black text-rose-800 ring-1 ring-rose-500/20 dark:text-rose-300">
                                        <AlertTriangle size={16} className="shrink-0" />
                                        <span>{tr(t, 'reporting.criticalResult', 'Critical result — requires acknowledgement', 'نتيجة حرجة — تتطلب الإقرار', isAr)}</span>
                                    </div>
                                )}
                                {impression && (
                                    <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 dark:bg-emerald-950/20">
                                        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">
                                            <Check size={13} />
                                            {tr(t, 'report.impression', 'Impression', ar.impression, isAr)}
                                        </div>
                                        <p className="mt-2 text-xs font-bold leading-relaxed text-slate-900 dark:text-white sm:text-sm">
                                            {impression}
                                        </p>
                                    </div>
                                )}
                                {reportFindings && (
                                    <div className="mb-4">
                                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                            {tr(t, 'report.findings', 'Findings', ar.findings, isAr)}
                                        </h4>
                                        <p className="mt-1.5 whitespace-pre-wrap rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200">
                                            {reportFindings}
                                        </p>
                                    </div>
                                )}
                                {reportText && !reportFindings && (
                                    <div>
                                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                            {tr(t, 'report.body', 'Report content', 'نص التقرير', isAr)}
                                        </h4>
                                        <p className="mt-1.5 whitespace-pre-wrap rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 font-mono text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200">
                                            {reportText}
                                        </p>
                                    </div>
                                )}
                                {!impression && !reportFindings && !reportText && (
                                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center text-xs font-semibold text-slate-400 dark:border-slate-800 dark:bg-slate-950/30">
                                        {tr(t, 'report.unavailable', 'Report text has not been recorded yet.', ar.reportUnavailable, isAr)}
                                    </p>
                                )}
                                {isReportFinalized && radiologist && (
                                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/30">
                                        <div className="flex items-center gap-2">
                                            <UserCheck size={16} className="text-teal-600" />
                                            <div>
                                                <span className="block text-[9px] font-bold uppercase text-slate-400">
                                                    {tr(t, 'report.radiologistSign', 'Radiologist signature', ar.radiologistSign, isAr)}
                                                </span>
                                                <strong className="text-xs font-black text-slate-900 dark:text-white">
                                                    {exam.digital_signature_name || radiologist}
                                                    {exam.digital_signature_role ? ` · ${exam.digital_signature_role}` : ''}
                                                </strong>
                                            </div>
                                        </div>
                                        <div className="text-end">
                                            <span className="block font-mono text-[10px] font-semibold text-slate-500">
                                                {formatDateTimeOrDash(timestamps.report_finalized_at, language)}
                                            </span>
                                            {exam.amended_at && (
                                                <span className="block text-[9px] font-bold text-amber-600 dark:text-amber-400">
                                                    {ar.amended}: {formatDateTimeOrDash(exam.amended_at, language)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {exam.amendment_reason && (
                                    <p className="mt-3 rounded-xl border border-amber-300/50 bg-amber-500/10 p-3 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                                        {tr(t, 'reporting.amendmentReason', 'Amendment reason', ar.amendmentReason, isAr)}: {exam.amendment_reason}
                                    </p>
                                )}
                            </>
                        )}
                    </SectionPanel>

                    {/* Clinical requisition */}
                    <SectionPanel
                        icon={Stethoscope}
                        title={tr(t, 'caseDetails.clinicalInfo', 'Clinical details', ar.clinicalInfo, isAr)}
                        description={isAr ? 'الطلب السريري وملاحظات الإحالة' : 'Requisition notes and physician indications'}
                    >
                        <div className="space-y-3">
                            <DetailField
                                icon={FileText}
                                label={tr(t, 'details.clinicalIndication', 'Clinical indication', ar.indication, isAr)}
                                value={exam.clinical_indication || (isAr ? 'لا يوجد تاريخ مرضي مسجل' : 'No clinical history recorded')}
                            />
                            <div className="grid gap-3 sm:grid-cols-2">
                                <DetailField
                                    icon={Activity}
                                    label={tr(t, 'details.diagnosis', 'Provisional diagnosis', ar.provisional, isAr)}
                                    value={exam.provisional_diagnosis}
                                />
                                <DetailField
                                    icon={Info}
                                    label={tr(t, 'details.bodyPart', 'Body part', ar.bodyPart, isAr)}
                                    value={exam.body_part}
                                />
                            </div>
                            {exam.icd_code && (
                                <DetailField icon={FileCheck2} label={tr(t, 'details.studyDate', 'ICD code', ar.icd, isAr)} value={exam.icd_code} mono />
                            )}
                            {exam.preparation_instructions && (
                                <p className="whitespace-pre-wrap rounded-xl border border-sky-200/70 bg-sky-50/60 p-3 text-[11px] font-semibold leading-relaxed text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-200">
                                    <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-400">
                                        {tr(t, 'details.preparation', 'Preparation instructions', ar.preparation, isAr)}
                                    </span>
                                    {exam.preparation_instructions}
                                </p>
                            )}
                            {exam.appointment_notes && (
                                <p className="whitespace-pre-wrap rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 text-[11px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                                    <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-400">
                                        {tr(t, 'details.notes', 'Notes', ar.notes, isAr)}
                                    </span>
                                    {exam.appointment_notes}
                                </p>
                            )}
                        </div>
                    </SectionPanel>
                </div>

                <div className="space-y-4">
                    {/* Safety */}
                    <SectionPanel
                        icon={ClipboardCheck}
                        title={tr(t, 'caseDetails.safety', 'Clinical safety', ar.safety, isAr)}
                        description={isAr ? 'تقييم سلامة المريض وموانع الفحص' : 'Patient safety assessment and contraindications'}
                    >
                        <div className="space-y-2.5">
                            <SafetyCheckCard
                                icon={Baby}
                                label={tr(t, 'reporting.pregnancy', 'Pregnancy', 'الحمل', isAr)}
                                status={exam.pregnancy_safety_status}
                                t={t}
                                isAr={isAr}
                            />
                            <SafetyCheckCard
                                icon={ShieldAlert}
                                label={tr(t, 'reporting.implants', 'Implants / metal', 'الغرسات والمعادن', isAr)}
                                status={exam.implant_safety_status}
                                t={t}
                                isAr={isAr}
                            />
                            <SafetyCheckCard
                                icon={HeartPulse}
                                label={tr(t, 'reporting.renal', 'Renal / contrast', 'الكلى والصبغة', isAr)}
                                status={exam.renal_safety_status}
                                t={t}
                                isAr={isAr}
                            />
                            {exam.allergies && (
                                <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-[11px] font-bold text-amber-900 dark:text-amber-200">
                                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                                    <span>
                                        <span className="block text-[9px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                                            {tr(t, 'reporting.allergies', 'Allergies', ar.allergies, isAr)}
                                        </span>
                                        {exam.allergies}
                                    </span>
                                </div>
                            )}
                            {exam.chronic_diseases && (
                                <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                                    <HeartPulse size={15} className="mt-0.5 shrink-0 text-slate-400" />
                                    <span>
                                        <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
                                            {tr(t, 'reporting.chronicConditions', 'Chronic conditions', ar.chronic, isAr)}
                                        </span>
                                        {exam.chronic_diseases}
                                    </span>
                                </div>
                            )}
                        </div>
                    </SectionPanel>

                    {/* Timeline */}
                    <SectionPanel
                        icon={Clock}
                        title={tr(t, 'caseDetails.timeline', 'Timeline', ar.timeline, isAr)}
                        description={isAr ? 'التوقيتات الفعلية للأحداث' : 'Chronological record of events'}
                    >
                        <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                            {[
                                [tr(t, 'timeline.booked', 'Booked', 'الحجز', isAr), timestamps.booked_at],
                                [tr(t, 'timeline.arrived', 'Patient arrived', 'وصول المريض', isAr), timestamps.arrived_at],
                                [tr(t, 'timeline.examStarted', 'Imaging started', 'بدء التصوير', isAr), timestamps.exam_started_at],
                                [tr(t, 'timeline.examCompleted', 'Imaging completed', 'انتهاء التصوير', isAr), timestamps.exam_completed_at],
                                [tr(t, 'timeline.imagesReady', 'Images ready', 'الصور جاهزة', isAr), timestamps.images_ready_at],
                                [tr(t, 'timeline.reporting', 'Reporting started', 'بدء التقرير', isAr), timestamps.reporting_started_at],
                                [tr(t, 'timeline.finalized', 'Report finalized', 'اعتماد التقرير', isAr), timestamps.report_finalized_at],
                                [tr(t, 'timeline.delivered', 'Results delivered', 'تسليم النتيجة', isAr), timestamps.delivered_at],
                            ].map(([label, date]) => (
                                <div key={label} className="flex items-center justify-between gap-2 py-2">
                                    <span className="font-semibold text-slate-600 dark:text-slate-400">{label}</span>
                                    <span className={`font-mono font-bold ${date ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-700'}`}>
                                        {date ? formatDateTimeOrDash(date, language) : '—'}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => printWhenReady()}
                            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 print:hidden"
                        >
                            <Printer size={13} />
                            {tr(t, 'caseDetails.printPage', 'Print this page', ar.printPage, isAr)}
                        </button>
                    </SectionPanel>

                    <div className="flex items-start gap-2 rounded-2xl border border-slate-200/80 bg-white/70 p-3.5 text-[10px] font-semibold leading-relaxed text-slate-400 dark:border-slate-800 dark:bg-slate-900/60">
                        <Unlink size={13} className="mt-0.5 shrink-0" />
                        <span>
                            {tr(t, 'caseDetails.accessNote', 'All actions and sections follow your role permissions. Report text and images require the matching clinical access.', 'جميع الإجراءات والأقسام تخضع لصلاحيات دورك. نص التقرير والصور يتطلبان صلاحية الاطلاع السريري المقابلة.', isAr)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CaseDetailsPage;
