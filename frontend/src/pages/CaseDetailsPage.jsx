import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowLeft,
    Baby,
    Building2,
    Calendar,
    CalendarCheck2,
    Check,
    CheckCircle2,
    ClipboardCheck,
    ClipboardSignature,
    Clock,
    Copy,
    Download,
    ExternalLink,
    FileCheck2,
    FileSearch,
    FileText,
    Hash,
    HeartPulse,
    Info,
    Loader2,
    Monitor,
    PenLine,
    Phone,
    Printer,
    Radio,
    RotateCcw,
    ScanLine,
    ShieldAlert,
    ShieldCheck,
    Sparkles,
    Stethoscope,
    User,
    UserCheck,
    UserRound,
    Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useGetCaseReportsQuery, useGetWorklistQuery } from '../store/api';
import { formatDateTime, formatLocalizedDate } from '../utils/localizedDate';
import { authenticatedFetch } from '../utils/authenticatedFetch';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const STATUS_ORDER = ['Scheduled', 'Checked-in', 'Scanning', 'Reporting', 'Finalized'];

const ar = {
    loading: 'جاري تحميل ملف الحالة والبيانات التشخيصية...',
    notFound: 'الحالة غير موجودة أو تعذر الوصول إليها.',
    back: 'الرجوع لقائمة الفحوصات',
    eyebrow: 'ملف الحالة الإشعاعية',
    title: 'تفاصيل الحالة التشخيصية',
    description: 'مراجعة حالة الفحص، مسار العمل، بيانات المريض، التقرير الإشعاعي ومؤشرات السلامة.',
    unnamedPatient: 'مريض بدون اسم',
    patientProfile: 'ملف المريض الكامل',
    writeReport: 'كتابة التقرير الإشعاعي',
    printReport: 'طباعة التقرير PDF',
    openPdf: 'فتح ملف PDF',
    viewDicom: 'عارض DICOM (PACS)',
    printPage: 'طباعة الصفحة',
    template: 'قالب التقرير',
    status: 'حالة الفحص',
    priority: 'الأولوية',
    modality: 'الجهاز / الغرفة',
    report: 'التقرير',
    ready: 'معتمد وجاهز',
    pending: 'قيد الإعداد',
    workflow: 'مسار الفحص الإشعاعي',
    patientInfo: 'بيانات المريض الديموغرافية',
    clinicalInfo: 'التفاصيل والملخص السريري',
    safety: 'مؤشرات السلامة وموانع الفحص',
    timeline: 'سجل التوقيتات والأحداث',
    diagnosticReport: 'التقرير التشخيصي المعتمد',
    reportUnavailable: 'لم يتم تسجيل نص التقرير بعد. الحالة قيد المراجعة الإشعاعية.',
    copied: 'تم النسخ إلى الحافظة',
    printError: 'تعذر فتح ملف التقرير تلقائياً. سيتم فتح نافذة الطباعة.',
    step: 'المرحلة',
    of: 'من',
    copySummary: 'نسخ ملخص الحالة',
    radiologistSign: 'توقيع واعتماد استشاري الأشعة',
    telemetry: 'معلومات الجهاز ومكان الفحص'
};

const tr = (t, key, defaultEn, defaultAr, isAr) => t(key, { defaultValue: isAr ? defaultAr : defaultEn });

const translateStatus = (status, t, isAr) => {
    const fallback = {
        Scheduled: ['Scheduled', 'مجدول'],
        'Checked-in': ['Checked-in', 'تم الوصول'],
        Arrived: ['Arrived', 'تم الوصول'],
        Scanning: ['Scanning', 'جاري التصوير'],
        Reporting: ['Reporting', 'قيد كتابة التقرير'],
        Finalized: ['Finalized', 'معتمد ونهائي']
    }[status] || [status || 'Scheduled', status || 'مجدول'];
    return t(`status.${status}`, { defaultValue: isAr ? fallback[1] : fallback[0] });
};

const translatePriority = (priority, t, isAr) => {
    const fallback = {
        Routine: ['Routine', 'عادي'],
        Urgent: ['Urgent', 'عاجل'],
        Emergency: ['Emergency', 'طوارئ فوري']
    }[priority] || [priority || 'Routine', priority || 'عادي'];
    return t(`priority.${priority}`, { defaultValue: isAr ? fallback[1] : fallback[0] });
};

const translateGender = (gender, t, isAr) => {
    const fallback = {
        Male: ['Male', 'ذكر'],
        Female: ['Female', 'أنثى'],
        M: ['Male', 'ذكر'],
        F: ['Female', 'أنثى']
    }[gender] || [gender || '-', gender || '-'];
    return t(`gender.${gender}`, { defaultValue: isAr ? fallback[1] : fallback[0] });
};

const translateSafety = (status, t, isAr) => {
    const fallback = {
        Safe: ['Safe / Clear', 'آمن / سليم'],
        'Not Pregnant': ['Not Pregnant', 'غير حامل'],
        Pregnant: ['Pregnant (High Risk)', 'حامل (تنبيه)'],
        Warning: ['Caution / Warning', 'تحذير / يلزم مراجعة'],
        Danger: ['High Risk / Contraindicated', 'موانع فحص حرجة'],
        Unknown: ['Not Assessed', 'غير محدد']
    }[status] || ['Not Assessed', 'غير محدد'];
    return t(`safety.${status || 'Unknown'}`, { defaultValue: isAr ? fallback[1] : fallback[0] });
};

const getStatusIndex = (status) => {
    if (status === 'Arrived') return 1;
    const idx = STATUS_ORDER.indexOf(status);
    return idx === -1 ? 0 : idx;
};

const getInitials = (name) => {
    if (!name) return 'PT';
    return String(name).split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
};

const formatOrDash = (value, language, options) => (value ? formatLocalizedDate(value, language, options) : '—');
const formatDateTimeOrDash = (value, language) => (value ? formatDateTime(value, language) : '—');

const priorityBadgeStyles = {
    Emergency: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
    Urgent: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    Routine: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
};

const statusBadgeStyles = {
    Finalized: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
    Reporting: 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60',
    Scanning: 'bg-teal-500/15 text-teal-700 border-teal-500/30 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/60',
    'Checked-in': 'bg-indigo-500/15 text-indigo-700 border-indigo-500/30 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60',
    Scheduled: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
};

/* ─── Glassmorphism Panel Container ─── */
const SectionPanel = ({ icon: Icon, title, description, badge, action, children, className = '', tone = 'slate' }) => {
    return (
        <section className={`overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/90 ${className}`}>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100/80 bg-slate-50/50 px-4 py-3.5 dark:border-slate-800/80 dark:bg-slate-950/30 sm:px-5">
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
};

/* ─── Detail Field Component with Copy ─── */
const DetailField = ({ icon: Icon, label, value, copyable = false, strong = false, isAr = false }) => {
    const [copied, setCopied] = useState(false);

    const copyValue = async () => {
        if (!copyable || !value) return;
        try {
            await navigator.clipboard?.writeText(String(value));
            setCopied(true);
            toast.success(isAr ? ar.copied : `Copied ${label}`);
            window.setTimeout(() => setCopied(false), 1800);
        } catch {
            toast.error(isAr ? 'تعذر النسخ' : 'Copy failed');
        }
    };

    return (
        <div className="group relative min-w-0 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 transition-colors hover:border-slate-300 dark:border-slate-800/80 dark:bg-slate-950/40 dark:hover:border-slate-700">
            <dt className="flex items-center justify-between text-[9.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5 truncate">
                    {Icon && <Icon size={12} className="shrink-0 text-teal-600 dark:text-teal-400" aria-hidden="true" />}
                    <span className="truncate">{label}</span>
                </span>
                {copyable && value && (
                    <button
                        type="button"
                        onClick={copyValue}
                        className="rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:text-teal-700 group-hover:opacity-100 dark:hover:text-teal-300"
                        title="Copy"
                    >
                        {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    </button>
                )}
            </dt>
            <dd className="mt-1.5 flex min-w-0 items-center gap-2">
                <span className={`min-w-0 break-words text-xs sm:text-[13px] ${strong ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-200'}`}>
                    {value || '—'}
                </span>
            </dd>
        </div>
    );
};

/* ─── Workflow Stepper Timeline ─── */
const WorkflowStepper = ({ status, timestamps, language, isRtl, isAr, t }) => {
    const currentIndex = getStatusIndex(status);
    const steps = [
        { key: 'Scheduled', icon: CalendarCheck2, date: timestamps.created_at },
        { key: 'Checked-in', icon: UserCheck, date: timestamps.arrived_at },
        { key: 'Scanning', icon: ScanLine, date: timestamps.exam_started_at },
        { key: 'Reporting', icon: FileSearch, date: timestamps.reporting_started_at },
        { key: 'Finalized', icon: CheckCircle2, date: timestamps.report_finalized_at }
    ];

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal-500/15 text-teal-700 dark:text-teal-300">
                        <Activity size={15} />
                    </span>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                        {tr(t, 'caseDetails.workflow', 'Workflow Tracking', ar.workflow, isAr)}
                    </h3>
                </div>
                <span className="rounded-full bg-teal-500/15 px-2.5 py-0.5 font-mono text-[10px] font-black text-teal-700 dark:text-teal-300">
                    {isAr ? `${ar.step} ${currentIndex + 1} ${ar.of} ${steps.length}` : `Stage 0${currentIndex + 1} / 0${steps.length}`}
                </span>
            </div>

            <div className="relative pt-2 pb-1">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
                    {steps.map((step, index) => {
                        const isDone = index < currentIndex;
                        const isCurrent = index === currentIndex;
                        const isFuture = index > currentIndex;
                        const StepIcon = step.icon;

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
                                    <span
                                        className={`grid h-7 w-7 place-items-center rounded-lg ${
                                            isCurrent
                                                ? 'bg-teal-600 text-white shadow-xs'
                                                : isDone
                                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                        }`}
                                    >
                                        <StepIcon size={14} />
                                    </span>
                                    {isDone && <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />}
                                    {isCurrent && <span className="h-2 w-2 animate-ping rounded-full bg-teal-500" />}
                                </div>
                                <div className="mt-2 min-w-0">
                                    <strong className={`block truncate text-xs font-black ${isCurrent ? 'text-teal-900 dark:text-teal-200' : 'text-slate-800 dark:text-slate-200'}`}>
                                        {translateStatus(step.key, t, isAr)}
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
        </div>
    );
};

/* ─── Safety Metric Tile ─── */
const SafetyCheckCard = ({ icon: Icon, label, status, t, isAr }) => {
    const isSafe = status === 'Safe' || status === 'Not Pregnant';
    const isDanger = status === 'Danger' || status === 'Pregnant';
    const isWarning = status === 'Warning';

    const toneStyles = isSafe
        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
        : isDanger
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300 ring-1 ring-rose-500/20'
        : isWarning
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 ring-1 ring-amber-500/20'
        : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400';

    return (
        <div className={`flex items-center justify-between gap-2.5 rounded-xl border p-3 ${toneStyles}`}>
            <span className="flex min-w-0 items-center gap-2 font-bold text-xs">
                <Icon size={16} className="shrink-0" />
                <span className="truncate">{label}</span>
            </span>
            <span className="shrink-0 font-mono text-[10.5px] font-black uppercase">
                {translateSafety(status, t, isAr)}
            </span>
        </div>
    );
};

/* ─── Main Case Details Page ─── */
const CaseDetailsPage = () => {
    const { examId } = useParams();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['worklist', 'common']);
    const language = i18n.language;
    const isRtl = i18n.dir() === 'rtl';
    const isAr = language?.startsWith('ar');
    const [isPrintingReport, setIsPrintingReport] = useState(false);

    const { data: queueRes, isLoading: qLoading, isError: qError } = useGetWorklistQuery({ exam_id: examId }, { skip: !examId });
    const { data: reportRes, isLoading: rLoading } = useGetCaseReportsQuery({ exam_id: examId }, { skip: !examId });

    const qList = queueRes?.data || queueRes?.items || (Array.isArray(queueRes) ? queueRes : []);
    const rList = reportRes?.data || reportRes?.items || (Array.isArray(reportRes) ? reportRes : []);
    const exam = qList.find((item) => item.exam_id === examId) || qList[0] || rList.find((item) => item.exam_id === examId) || rList[0];
    const isLoading = qLoading || rLoading;
    const isError = qError && !exam;

    const timestamps = useMemo(() => ({
        created_at: exam?.created_at || exam?.start_time,
        arrived_at: exam?.arrived_at,
        exam_started_at: exam?.exam_started_at,
        exam_completed_at: exam?.exam_completed_at,
        reporting_started_at: exam?.reporting_started_at,
        report_finalized_at: exam?.report_finalized_at,
        delivered_at: exam?.delivered_at || exam?.last_delivery_at
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
                    <AlertCircle size={40} className="mx-auto text-rose-500" />
                    <h2 className="mt-3 text-base font-black text-slate-900 dark:text-white">
                        {tr(t, 'status.error', 'Case not found or access denied.', ar.notFound, isAr)}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        The requested study ID #{examId} could not be resolved from active worklists.
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/worklist')}
                        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
                    >
                        <ArrowLeft size={14} className="rtl:rotate-180" />
                        <span>{tr(t, 'actions.goBack', 'Back to Worklist', ar.back, isAr)}</span>
                    </button>
                </div>
            </div>
        );
    }

    const status = exam.status || 'Scheduled';
    const priority = exam.priority || 'Routine';
    const patientName = exam.patient_name || tr(t, 'fallback.unnamedPatient', 'Unnamed Patient', ar.unnamedPatient, isAr);
    const examTitle = exam.exam_type_name || exam.modality_name || 'Diagnostic Study';
    const radiologist = exam.performing_radiologist_name || exam.radiologist_name;
    const reportText = exam.report_text || exam.report_content || '';
    const impression = exam.impression || exam.report_sections?.impression || '';
    const isReportComplete = status === 'Finalized' || Boolean(reportText) || Boolean(impression);
    const translatedStatus = translateStatus(status, t, isAr);
    const translatedPriority = translatePriority(priority, t, isAr);
    const patientInitials = getInitials(patientName);

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
            toast.error(isAr ? ar.printError : 'Could not open report PDF.');
            window.print();
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
        const summary = `Case: ${examTitle}\nPatient: ${patientName} (MRN: ${exam.mrn || 'N/A'})\nOrder: #${exam.order_number || examId}\nStatus: ${status}\nModality: ${exam.modality_name || 'N/A'}`;
        try {
            await navigator.clipboard.writeText(summary);
            toast.success(isAr ? ar.copied : 'Case summary copied to clipboard');
        } catch {
            toast.error('Failed to copy summary');
        }
    };

    return (
        <div className="space-y-4 pb-12" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Top Navigation & Action Command Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-4">
                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        onClick={() => navigate('/worklist')}
                        className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        title={tr(t, 'actions.goBack', 'Back to Worklist', ar.back, isAr)}
                    >
                        <ArrowLeft size={16} className="rtl:rotate-180" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-black uppercase text-teal-600 dark:text-teal-400">
                                {tr(t, 'caseDetails.eyebrow', 'Case File', ar.eyebrow, isAr)}
                            </span>
                            <span className="text-slate-300 dark:text-slate-700">/</span>
                            <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-400">
                                #{exam.order_number || examId}
                            </span>
                        </div>
                        <h1 className="text-sm font-black text-slate-900 dark:text-white sm:text-base">
                            {examTitle}
                        </h1>
                    </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Launch DICOM PACS Viewer */}
                    <button
                        type="button"
                        onClick={handleOpenViewer}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3.5 text-xs font-bold text-sky-800 shadow-xs transition hover:bg-sky-500/20 dark:text-sky-300"
                    >
                        <Radio size={14} className="text-sky-500 animate-pulse" />
                        <span>{tr(t, 'actions.viewDicom', 'View DICOM', ar.viewDicom, isAr)}</span>
                    </button>

                    {/* Write / Edit Diagnostic Report */}
                    {status === 'Reporting' && (
                        <button
                            type="button"
                            onClick={() => navigate(`/reports/editor/${examId}`)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 text-xs font-black text-white shadow-xs transition hover:bg-teal-500"
                        >
                            <PenLine size={14} />
                            <span>{tr(t, 'actions.writeReport', 'Write Report', ar.writeReport, isAr)}</span>
                        </button>
                    )}

                    {/* Print / Download Report PDF */}
                    {isReportComplete && (
                        <button
                            type="button"
                            onClick={() => handlePrintReport(true)}
                            disabled={isPrintingReport}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-800 shadow-xs transition hover:bg-emerald-500/20 dark:text-emerald-300"
                        >
                            <Printer size={14} />
                            <span>{tr(t, 'actions.printReport', 'Print PDF', ar.printReport, isAr)}</span>
                        </button>
                    )}

                    {/* Copy Summary */}
                    <button
                        type="button"
                        onClick={copyCaseSummary}
                        className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        title={tr(t, 'caseDetails.copySummary', 'Copy Case Summary', ar.copySummary, isAr)}
                    >
                        <Copy size={15} />
                    </button>
                </div>
            </div>

            {/* Hero Patient & Case Card */}
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                {/* Patient Master Card */}
                <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-5">
                    <div className="flex items-start gap-3.5">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-teal-500/30 bg-teal-500/15 text-base font-black text-teal-700 dark:text-teal-300 sm:h-14 sm:w-14 sm:text-lg">
                            {patientInitials}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-black text-slate-900 dark:text-white sm:text-lg">
                                    {patientName}
                                </h2>
                                <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10.5px] font-black uppercase ${statusBadgeStyles[status] || statusBadgeStyles.Scheduled}`}>
                                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                    {translatedStatus}
                                </span>
                                <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10.5px] font-black uppercase ${priorityBadgeStyles[priority] || priorityBadgeStyles.Routine}`}>
                                    {translatedPriority}
                                </span>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                <span>MRN: <strong className="text-slate-900 dark:text-white">{exam.mrn || '—'}</strong></span>
                                <span>Gender: <strong>{translateGender(exam.gender, t, isAr)}</strong></span>
                                {exam.age && <span>Age: <strong>{exam.age} yrs</strong></span>}
                                {exam.date_of_birth && <span>DOB: <strong>{formatOrDash(exam.date_of_birth, language)}</strong></span>}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
                            <Phone size={13} className="text-teal-600" />
                            <span>{exam.phone || exam.patient_phone || 'No phone registered'}</span>
                        </div>
                        {exam.patient_id && (
                            <Link
                                to={`/patients/${exam.patient_id}`}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-teal-500/40 hover:bg-teal-50 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                                <UserRound size={13} />
                                <span>{tr(t, 'actions.patientProfile', 'Full Patient Record', ar.patientProfile, isAr)}</span>
                            </Link>
                        )}
                    </div>
                </div>

                {/* Modality & Clinical Summary Card */}
                <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-5">
                    <div>
                        <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
                            <span className="uppercase tracking-wider">{tr(t, 'caseDetails.telemetry', 'Equipment Telemetry', ar.telemetry, isAr)}</span>
                            <span className="font-mono text-[10px] font-black text-teal-600 dark:text-teal-400">ONLINE</span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
                                <small className="block text-[9px] font-bold uppercase text-slate-400">Modality</small>
                                <strong className="mt-0.5 block text-xs font-black text-slate-900 dark:text-white">
                                    {exam.modality_name || exam.modality_type || 'General'}
                                </strong>
                            </div>
                            <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
                                <small className="block text-[9px] font-bold uppercase text-slate-400">Machine Room</small>
                                <strong className="mt-0.5 block text-xs font-black text-slate-900 dark:text-white">
                                    {exam.machine_name || 'Suite 01'}
                                </strong>
                            </div>
                            <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
                                <small className="block text-[9px] font-bold uppercase text-slate-400">Referring Physician</small>
                                <strong className="mt-0.5 block truncate text-xs font-black text-slate-900 dark:text-white">
                                    {exam.referring_doctor_name || 'Self-referred'}
                                </strong>
                            </div>
                            <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/40">
                                <small className="block text-[9px] font-bold uppercase text-slate-400">Radiologist</small>
                                <strong className="mt-0.5 block truncate text-xs font-black text-slate-900 dark:text-white">
                                    {radiologist || 'Pending Assignment'}
                                </strong>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Workflow Progress Timeline Stepper */}
            <WorkflowStepper
                status={status}
                timestamps={timestamps}
                language={language}
                isRtl={isRtl}
                isAr={isAr}
                t={t}
            />

            {/* Main Two-Column Clinical Stage */}
            <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                {/* Left Column: Diagnostic Report & Clinical Requisition */}
                <div className="space-y-4">
                    {/* Diagnostic Report Section */}
                    <SectionPanel
                        icon={FileText}
                        title={tr(t, 'caseDetails.diagnosticReport', 'Diagnostic Report', ar.diagnosticReport, isAr)}
                        description={isReportComplete ? 'Final verified interpretation' : 'Awaiting radiologist review'}
                        badge={
                            isReportComplete ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[9.5px] font-black text-emerald-700 dark:text-emerald-300">
                                    <CheckCircle2 size={11} />
                                    {tr(t, 'report.ready', 'Verified & Signed', ar.ready, isAr)}
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[9.5px] font-black text-amber-700 dark:text-amber-300">
                                    <Clock size={11} />
                                    {tr(t, 'report.pending', 'Draft / In Progress', ar.pending, isAr)}
                                </span>
                            )
                        }
                        action={
                            status === 'Reporting' && (
                                <button
                                    type="button"
                                    onClick={() => navigate(`/reports/editor/${examId}`)}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-500 transition"
                                >
                                    <PenLine size={13} />
                                    <span>{tr(t, 'actions.writeReport', 'Open Report Editor', ar.writeReport, isAr)}</span>
                                </button>
                            )
                        }
                    >
                        {impression ? (
                            <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 dark:bg-emerald-950/20">
                                <div className="flex items-center justify-between text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">
                                    <span className="flex items-center gap-1.5">
                                        <Sparkles size={13} />
                                        {tr(t, 'report.impression', 'Diagnostic Impression', 'الخلاصة والتشخيص النهائي', isAr)}
                                    </span>
                                </div>
                                <p className="mt-2 text-xs font-bold leading-relaxed text-slate-900 dark:text-white sm:text-sm">
                                    {impression}
                                </p>
                            </div>
                        ) : null}

                        <div className="space-y-3">
                            <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                {tr(t, 'report.body', 'Full Report Content', 'نص التقرير الإشعاعي', isAr)}
                            </h4>
                            <div className="whitespace-pre-wrap rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 font-mono text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200">
                                {reportText || tr(t, 'report.unavailable', 'Report text has not been recorded yet.', ar.reportUnavailable, isAr)}
                            </div>
                        </div>

                        {radiologist && (
                            <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/30">
                                <div className="flex items-center gap-2">
                                    <UserCheck size={16} className="text-teal-600" />
                                    <div>
                                        <span className="block text-[9px] font-bold uppercase text-slate-400">{tr(t, 'report.radiologistSign', 'Radiologist Signature', ar.radiologistSign, isAr)}</span>
                                        <strong className="text-xs font-black text-slate-900 dark:text-white">{radiologist}</strong>
                                    </div>
                                </div>
                                {timestamps.report_finalized_at && (
                                    <span className="font-mono text-[10px] font-semibold text-slate-500">
                                        {formatDateTimeOrDash(timestamps.report_finalized_at, language)}
                                    </span>
                                )}
                            </div>
                        )}
                    </SectionPanel>

                    {/* Clinical Requisition & Reason for Exam */}
                    <SectionPanel
                        icon={Stethoscope}
                        title={tr(t, 'caseDetails.clinicalInfo', 'Clinical Details', ar.clinicalInfo, isAr)}
                        description="Requisition notes & physician indications"
                    >
                        <div className="space-y-3">
                            <DetailField
                                icon={FileText}
                                label={tr(t, 'exam.indication', 'Clinical Indication', 'دواعي الفحص والشكوى السريرية', isAr)}
                                value={exam.clinical_indication || 'No clinical history recorded'}
                                isAr={isAr}
                            />
                            {exam.provisional_diagnosis && (
                                <DetailField
                                    icon={Activity}
                                    label={tr(t, 'exam.provisional', 'Provisional Diagnosis', 'التشخيص المبدئي', isAr)}
                                    value={exam.provisional_diagnosis}
                                    isAr={isAr}
                                />
                            )}
                        </div>
                    </SectionPanel>
                </div>

                {/* Right Column: Safety Checklist & Timeline */}
                <div className="space-y-4">
                    {/* Clinical Safety Panel */}
                    <SectionPanel
                        icon={ClipboardCheck}
                        title={tr(t, 'caseDetails.safety', 'Clinical Safety Checks', ar.safety, isAr)}
                        description="Patient safety assessment & contraindications"
                    >
                        <div className="space-y-2.5">
                            <SafetyCheckCard
                                icon={Baby}
                                label={tr(t, 'safety.pregnancy', 'Pregnancy Check', 'فحص الحمل', isAr)}
                                status={exam.pregnancy_safety_status}
                                t={t}
                                isAr={isAr}
                            />
                            <SafetyCheckCard
                                icon={ShieldAlert}
                                label={tr(t, 'safety.implant', 'Metal Implants / Pacemaker', 'فحص الغرسات والأجسام المعدنية', isAr)}
                                status={exam.implant_safety_status}
                                t={t}
                                isAr={isAr}
                            />
                            <SafetyCheckCard
                                icon={HeartPulse}
                                label={tr(t, 'safety.renal', 'Renal Function / Contrast Risk', 'وظائف الكلى وتحمل الصبغة', isAr)}
                                status={exam.renal_safety_status}
                                t={t}
                                isAr={isAr}
                            />
                        </div>
                    </SectionPanel>

                    {/* Timeline & Event History */}
                    <SectionPanel
                        icon={Clock}
                        title={tr(t, 'caseDetails.timeline', 'Audit Timeline', ar.timeline, isAr)}
                        description="Exact chronological timestamps"
                    >
                        <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                            {[
                                ['Created / Booked', timestamps.created_at],
                                ['Patient Arrived', timestamps.arrived_at],
                                ['Acquisition Started', timestamps.exam_started_at],
                                ['Acquisition Completed', timestamps.exam_completed_at],
                                ['Reporting Initiated', timestamps.reporting_started_at],
                                ['Report Finalized', timestamps.report_finalized_at],
                                ['Delivered to Patient', timestamps.delivered_at]
                            ].map(([label, date]) => (
                                <div key={label} className="flex items-center justify-between py-2.5">
                                    <span className="font-semibold text-slate-600 dark:text-slate-400">{label}</span>
                                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                                        {formatDateTimeOrDash(date, language)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </SectionPanel>
                </div>
            </div>
        </div>
    );
};

export default CaseDetailsPage;