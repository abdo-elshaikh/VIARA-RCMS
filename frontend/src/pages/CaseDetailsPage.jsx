import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowLeft,
    Baby,
    Calendar,
    CalendarCheck2,
    Check,
    CheckCircle2,
    ClipboardSignature,
    Clock,
    Copy,
    Download,
    ExternalLink,
    FileSearch,
    FileText,
    Hash,
    Loader2,
    PenLine,
    Printer,
    Radio,
    ScanLine,
    ShieldCheck,
    Sparkles,
    Stethoscope,
    User,
    UserCheck,
    UserRound
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useGetWorklistQuery, useGetCaseReportsQuery } from '../store/api';
import PageHeader from '../components/ui/PageHeader';
import { formatDateTime, formatLocalizedDate } from '../utils/localizedDate';
import { authenticatedFetch } from '../utils/authenticatedFetch';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const statusOrder = ['Scheduled', 'Checked-in', 'Scanning', 'Reporting', 'Finalized'];

const getStatusIndex = (status) => {
    if (status === 'Arrived') return 1;
    const idx = statusOrder.indexOf(status);
    return idx === -1 ? 0 : idx;
};

// Robust helper that provides fallback strings for both English and Arabic
const tr = (t, key, defaultEn, defaultAr, isAr) => {
    const fallback = isAr ? defaultAr : defaultEn;
    return t(key, { defaultValue: fallback });
};

const getStatusTranslation = (status, t, isAr) => {
    const mapEn = {
        'Scheduled': 'Scheduled',
        'Checked-in': 'Checked-in',
        'Arrived': 'Arrived',
        'Scanning': 'Scanning',
        'Reporting': 'Reporting',
        'Finalized': 'Finalized',
    };
    const mapAr = {
        'Scheduled': 'مجدول',
        'Checked-in': 'تم الوصول',
        'Arrived': 'تم الوصول',
        'Scanning': 'جاري التصوير',
        'Reporting': 'جاري التقرير',
        'Finalized': 'معتمد',
    };
    const fallback = isAr ? (mapAr[status] || status) : (mapEn[status] || status);
    return t(`status.${status}`, { defaultValue: fallback });
};

const getPriorityTranslation = (priority, t, isAr) => {
    const mapEn = { 'Routine': 'Routine', 'Urgent': 'Urgent', 'Emergency': 'Emergency' };
    const mapAr = { 'Routine': 'عادي', 'Urgent': 'عاجل', 'Emergency': 'طوارئ' };
    const fallback = isAr ? (mapAr[priority] || priority) : (mapEn[priority] || priority);
    return t(`priority.${priority}`, { defaultValue: fallback || (isAr ? 'عادي' : 'Routine') });
};

const getGenderTranslation = (gender, t, isAr) => {
    const mapEn = { 'Male': 'Male', 'Female': 'Female', 'M': 'Male', 'F': 'Female' };
    const mapAr = { 'Male': 'ذكر', 'Female': 'أنثى', 'M': 'ذكر', 'F': 'أنثى' };
    const fallback = isAr ? (mapAr[gender] || gender) : (mapEn[gender] || gender);
    return t(`gender.${gender}`, { defaultValue: fallback || '--' });
};

const getSafetyTranslation = (status, t, isAr) => {
    const mapEn = { 'Safe': 'Safe', 'Not Pregnant': 'Not Pregnant', 'Warning': 'Warning', 'Danger': 'Danger', 'Unknown': 'Unknown' };
    const mapAr = { 'Safe': 'آمن', 'Not Pregnant': 'غير حوامل', 'Warning': 'تحذير', 'Danger': 'خطر / حامل', 'Unknown': 'غير محدد' };
    const fallback = isAr ? (mapAr[status] || status) : (mapEn[status] || status);
    return t(`safety.${status}`, { defaultValue: fallback || (isAr ? 'غير محدد' : 'Unknown') });
};

const getInitials = (name) => {
    if (!name) return 'PT';
    return name.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
};

// Interactive Card Container with cursor-tracking glow
const GlowCard = ({ children, className = '' }) => {
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    };

    return (
        <div
            onMouseMove={handleMouseMove}
            className={`group relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl transition-all duration-300 hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] dark:border-slate-800/70 dark:bg-slate-900/60 ${className}`}
        >
            <div
                className="pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition duration-300 group-hover:opacity-100"
                style={{
                    background: `radial-gradient(350px circle at ${mousePos.x}px ${mousePos.y}px, rgba(8, 145, 178, 0.1), transparent 40%)`,
                }}
            />
            <div className="relative z-10">{children}</div>
        </div>
    );
};

const WorkflowStepper = ({ currentStatus, timestamps, language, isRtl, isAr, t }) => {
    const currentIndex = getStatusIndex(currentStatus);

    const steps = [
        {
            key: 'scheduled',
            title: tr(t, 'workflow.scheduled', 'Scheduled', 'الموعد', isAr),
            description: timestamps.created_at ? formatDateTime(timestamps.created_at, language) : '--',
            icon: CalendarCheck2,
            isActive: currentIndex >= 0,
            isCurrent: currentIndex === 0
        },
        {
            key: 'arrived',
            title: tr(t, 'workflow.arrived', 'Arrived', 'تم الوصول', isAr),
            description: timestamps.arrived_at ? formatDateTime(timestamps.arrived_at, language) : '--',
            icon: UserCheck,
            isActive: currentIndex >= 1,
            isCurrent: currentIndex === 1
        },
        {
            key: 'scanning',
            title: tr(t, 'workflow.scanning', 'Scanning', 'التصوير', isAr),
            description: timestamps.exam_started_at ? formatDateTime(timestamps.exam_started_at, language) : '--',
            icon: ScanLine,
            isActive: currentIndex >= 2,
            isCurrent: currentIndex === 2
        },
        {
            key: 'reporting',
            title: tr(t, 'workflow.reporting', 'Reporting', 'التقرير', isAr),
            description: timestamps.reporting_started_at ? formatDateTime(timestamps.reporting_started_at, language) : '--',
            icon: FileSearch,
            isActive: currentIndex >= 3,
            isCurrent: currentIndex === 3
        },
        {
            key: 'finalized',
            title: tr(t, 'workflow.finalized', 'Finalized', 'معتمد', isAr),
            description: timestamps.report_finalized_at ? formatDateTime(timestamps.report_finalized_at, language) : '--',
            icon: CheckCircle2,
            isActive: currentIndex >= 4,
            isCurrent: currentIndex === 4
        }
    ];

    const progressPercentage = (currentIndex / (steps.length - 1)) * 100;

    return (
        <GlowCard className="overflow-x-auto relative before:absolute before:inset-x-0 before:top-0 before:h-1 before:rounded-t-3xl before:bg-gradient-to-r before:from-cyan-500 before:to-blue-600 before:opacity-60">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-cyan-500" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                        {tr(t, 'caseDetails.workflow', 'Workflow Tracking', 'تتبع مسار العمل', isAr)}
                    </h3>
                </div>
                <span className="rounded-full bg-cyan-500/10 px-3 py-1 font-mono text-[11px] font-bold text-cyan-600 dark:text-cyan-400">
                    Step {currentIndex + 1} of {steps.length} ({Math.round(progressPercentage)}%)
                </span>
            </div>
            <div className="relative z-10 min-w-[640px] pt-2">
                <div className="relative flex items-start justify-between">
                    {/* Connecting Line background */}
                    <div className="absolute top-6 start-6 end-6 h-1 rounded-full bg-slate-100/80 shadow-inner dark:bg-slate-800/60 -z-10" />
                    
                    {/* Connecting Line active fill */}
                    <div
                        className={`absolute top-6 h-1 rounded-full bg-gradient-to-r ${isRtl ? 'from-blue-600 to-cyan-500' : 'from-cyan-500 to-blue-600'} shadow-[0_0_12px_rgba(6,182,212,0.5)] -z-10 transition-all duration-700 ease-in-out`}
                        style={{ width: `calc(${progressPercentage}% - 3rem)` }}
                    />

                    {steps.map((step, index) => {
                        const Icon = step.icon;
                        const isCompleted = index < currentIndex;
                        const isCurrent = step.isCurrent;

                        let colorClass = 'bg-slate-50 border-slate-200/60 text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-500';
                        if (isCompleted) {
                            colorClass = 'bg-gradient-to-br from-emerald-500 to-teal-600 border-transparent text-white shadow-lg shadow-emerald-500/30 ring-4 ring-emerald-50 dark:ring-emerald-500/10';
                        } else if (isCurrent) {
                            colorClass = 'bg-gradient-to-br from-cyan-500 to-blue-600 border-transparent text-white shadow-lg shadow-cyan-500/30 ring-4 ring-cyan-50 dark:ring-cyan-500/10';
                        }

                        return (
                            <div key={step.key} className="flex flex-col items-center flex-1 z-10 group cursor-default">
                                <div className={`relative flex h-12 w-12 items-center justify-center rounded-2xl border-2 transition-all duration-500 group-hover:scale-110 ${isRtl ? 'group-hover:-rotate-3' : 'group-hover:rotate-3'} ${colorClass}`}>
                                    {isCurrent && <span className="absolute h-full w-full animate-ping rounded-2xl bg-cyan-400/50"></span>}
                                    <Icon size={20} className={`relative z-10 ${isCompleted || isCurrent ? 'text-white' : ''}`} />
                                </div>
                                <div className="mt-4 text-center">
                                    <h4 className={`text-sm transition-colors ${isCompleted || isCurrent ? 'font-black text-slate-950 dark:text-white' : 'font-bold text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`}>
                                        {step.title}
                                    </h4>
                                    <p className="mt-1.5 font-mono text-[10px] font-bold text-slate-400 dark:text-slate-500 opacity-80">
                                        {step.description}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </GlowCard>
    );
};

const SectionHeader = ({ icon: Icon, title, badge, action }) => (
    <div className="relative mb-6 flex items-center justify-between border-b border-slate-100/60 pb-4 dark:border-slate-800/60">
        <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 text-cyan-600 shadow-inner ring-1 ring-cyan-500/20 dark:text-cyan-400">
                <Icon size={18} />
            </div>
            <h3 className="text-sm font-black tracking-wide text-slate-950 dark:text-white">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
            {badge && <span className="rounded-full bg-slate-100 px-3 py-1 font-mono text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{badge}</span>}
            {action}
        </div>
    </div>
);

const DetailRow = ({ label, value, highlight = false, copyable = false, isAr = false, icon: Icon }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (!value) return;
        navigator.clipboard.writeText(value);
        setCopied(true);
        toast.success(isAr ? `تم نسخ ${label}` : `Copied ${label}`);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="group flex flex-col py-2 transition-all duration-300">
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.15em] text-slate-400 transition-colors group-hover:text-cyan-600 dark:group-hover:text-cyan-400">
                {Icon && <Icon size={12} className="shrink-0 text-slate-400" />}
                {label}
            </span>
            <div className="mt-2 flex items-center gap-2">
                <span className={`break-words text-sm ${highlight ? 'font-black text-slate-950 dark:text-white' : 'font-bold text-slate-700 dark:text-slate-300'}`}>
                    {value || '--'}
                </span>
                {copyable && value && (
                    <button
                        type="button"
                        onClick={handleCopy}
                        aria-label={`Copy ${label}`}
                        className="opacity-0 transition-opacity group-hover:opacity-100 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400"
                    >
                        {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                )}
            </div>
        </div>
    );
};

const SafetyRow = ({ icon: Icon, label, status, t, isAr }) => {
    const translatedStatus = getSafetyTranslation(status, t, isAr);
    let toneClass = 'text-slate-500 bg-slate-50/80 ring-1 ring-slate-200/60 dark:bg-slate-900/50 dark:ring-slate-800/50 dark:text-slate-400';
    if (status === 'Safe' || status === 'Not Pregnant') {
        toneClass = 'text-emerald-700 bg-emerald-50/80 ring-1 ring-emerald-200 shadow-[0_2px_10px_rgba(16,185,129,0.08)] dark:text-emerald-300 dark:bg-emerald-500/10 dark:ring-emerald-500/20';
    } else if (status === 'Warning') {
        toneClass = 'text-amber-700 bg-amber-50/80 ring-1 ring-amber-200 shadow-[0_2px_10px_rgba(245,158,11,0.08)] dark:text-amber-300 dark:bg-amber-500/10 dark:ring-amber-500/20';
    } else if (status === 'Danger' || status === 'Pregnant') {
        toneClass = 'text-rose-700 bg-rose-50/80 ring-1 ring-rose-200 shadow-[0_2px_10px_rgba(244,63,94,0.08)] dark:text-rose-300 dark:bg-rose-500/10 dark:ring-rose-500/20';
    }

    return (
        <div className={`flex items-center justify-between rounded-2xl p-4 transition-all duration-300 hover:scale-[1.01] ${toneClass}`}>
            <div className="flex items-center gap-3">
                <Icon size={18} className="shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
            </div>
            <span className="text-xs font-black">{translatedStatus}</span>
        </div>
    );
};

const CaseDetailsPage = () => {
    const { examId } = useParams();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['worklist', 'common']);
    const language = i18n.language;
    const isRtl = i18n.dir() === 'rtl';
    const isAr = language?.startsWith('ar');
    const [isPrintingReport, setIsPrintingReport] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState('modern');

    // Fetch from Worklist (active cases) or Case Reports (finalized cases)
    const { data: queueRes, isLoading: qLoading, isError: qError } = useGetWorklistQuery({ exam_id: examId }, { skip: !examId });
    const { data: reportRes, isLoading: rLoading } = useGetCaseReportsQuery({ exam_id: examId }, { skip: !examId });
    
    const qList = queueRes?.data || queueRes?.items || (Array.isArray(queueRes) ? queueRes : []);
    const rList = reportRes?.data || reportRes?.items || (Array.isArray(reportRes) ? reportRes : []);
    
    // Find exact match or use the first returned if backend filtered it
    const exam = qList.find(x => x.exam_id === examId) || qList[0] || rList.find(x => x.exam_id === examId) || rList[0];
    const isLoading = qLoading || rLoading;
    const isError = qError && !exam;

    if (isLoading) {
        return (
            <div className="flex min-h-[400px] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-100 border-t-cyan-600 dark:border-slate-800" />
                    <p className="text-sm font-semibold text-slate-500">{tr(t, 'status.loading', 'Loading details...', 'جارٍ تحميل التفاصيل...', isAr)}</p>
                </div>
            </div>
        );
    }

    if (isError || !exam) {
        return (
            <div className="flex min-h-[400px] items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-rose-500">
                    <AlertCircle size={48} />
                    <p className="text-sm font-semibold">{tr(t, 'status.error', 'Case not found or access denied.', 'الحالة غير موجودة أو تعذر الوصول إليها.', isAr)}</p>
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="mt-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                        {tr(t, 'actions.goBack', 'Go Back', 'رجوع', isAr)}
                    </button>
                </div>
            </div>
        );
    }

    const {
        status,
        created_at,
        arrived_at,
        exam_started_at,
        exam_completed_at,
        reporting_started_at,
        report_finalized_at,
        delivered_at,
        patient_name,
        mrn,
        patient_id,
        gender,
        date_of_birth,
        phone,
        exam_type_name,
        modality_name,
        order_number,
        clinical_indication,
        provisional_diagnosis,
        pregnancy_safety_status,
        implant_safety_status,
        renal_safety_status,
        priority,
        referring_doctor_name,
        performing_radiologist_name,
        report_text,
        impression
    } = exam;

    const timestamps = {
        created_at,
        arrived_at,
        exam_started_at,
        exam_completed_at,
        reporting_started_at,
        report_finalized_at,
        delivered_at
    };

    const isReportComplete = status === 'Finalized' || Boolean(report_text) || Boolean(impression);

    const handlePrintReport = async (autoPrint = true, style = selectedTemplate) => {
        if (isPrintingReport) return;
        setIsPrintingReport(true);
        try {
            const queryParams = new URLSearchParams({
                templateStyle: style || 'modern',
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
        } catch (error) {
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

    const translatedStatus = getStatusTranslation(status, t, isAr);
    const translatedPriority = getPriorityTranslation(priority, t, isAr);
    const patientInitials = getInitials(patient_name);

    return (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
            
            {/* Page Header with Actions */}
            <PageHeader
                icon={FileText}
                eyebrowIcon={Activity}
                eyebrow={tr(t, 'caseDetails.eyebrow', 'Case Overview', 'نظرة عامة على الحالة', isAr)}
                title={tr(t, 'caseDetails.title', 'Case Details', 'تفاصيل الحالة', isAr)}
                description={tr(t, 'caseDetails.description', 'Review exam status, patient information, and clinical summaries.', 'مراجعة حالة الفحص والمعلومات السريرية وملخصات التقرير.', isAr)}
                actions={(
                    <div className="flex items-center gap-2">
                        {status === 'Reporting' ? (
                            <button
                                type="button"
                                onClick={() => navigate(`/reports/editor/${examId}`)}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-5 text-xs font-bold text-white shadow-lg shadow-cyan-600/25 transition hover:shadow-cyan-600/40 hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <PenLine size={16} />
                                {tr(t, 'actions.writeReport', 'Write Report', 'كتابة التقرير', isAr)}
                            </button>
                        ) : null}
                        {isReportComplete ? (
                            <div className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-1 dark:border-emerald-500/20 dark:bg-emerald-500/10" dir={isRtl ? 'rtl' : undefined}>
                                <select
                                    value={selectedTemplate}
                                    onChange={(e) => setSelectedTemplate(e.target.value)}
                                    className="h-8 rounded-lg border-0 bg-white/90 px-2.5 text-xs font-bold text-slate-700 shadow-sm outline-none cursor-pointer hover:bg-white dark:bg-slate-900 dark:text-slate-200"
                                    dir={isRtl ? 'rtl' : 'ltr'}
                                    title={tr(t, 'report.template', 'Select Template', 'اختر قالب التقرير', isAr)}
                                >
                                    {isRtl ? (
                                        <>
                                            <option value="corporate">Royal Corporate</option>
                                            <option value="clinical">Clinical Emerald</option>
                                            <option value="minimal">Minimal Clean</option>
                                            <option value="classic">Classic Hospital</option>
                                            <option value="modern">Modern Template</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="modern">Modern Template</option>
                                            <option value="classic">Classic Hospital</option>
                                            <option value="minimal">Minimal Clean</option>
                                            <option value="clinical">Clinical Emerald</option>
                                            <option value="corporate">Royal Corporate</option>
                                        </>
                                    )}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => handlePrintReport(true)}
                                    disabled={isPrintingReport}
                                    className="inline-flex h-8 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition hover:shadow-emerald-600/35 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                                >
                                    {isPrintingReport ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                                    {tr(t, 'actions.printReport', 'Print PDF', 'طباعة تقرير PDF', isAr)}
                                </button>
                            </div>
                        ) : null}
                        <button
                            type="button"
                            onClick={handleOpenViewer}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50/80 px-4 text-xs font-bold text-cyan-700 shadow-sm backdrop-blur transition hover:bg-cyan-100 hover:text-cyan-800 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300 dark:hover:bg-cyan-500/20"
                        >
                            <Radio size={16} />
                            {tr(t, 'actions.viewDicom', 'View DICOM', 'عرض الصور DICOM', isAr)}
                        </button>
                        <button
                            type="button"
                            onClick={() => window.print()}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                            title={tr(t, 'actions.printPage', 'Print Case Page', 'طباعة صفحة الحالة', isAr)}
                        >
                            <Printer size={16} />
                        </button>
                    </div>
                )}
                meta={(
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="group inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-4 py-2 text-xs font-bold text-slate-700 shadow-sm backdrop-blur transition hover:bg-slate-100 hover:text-slate-950 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                        <ArrowLeft size={16} className={`transition-transform group-hover:-translate-x-1 ${isRtl ? 'rotate-180 group-hover:translate-x-1' : ''}`} />
                        {tr(t, 'actions.back', 'Back', 'رجوع', isAr)}
                    </button>
                )}
            />

            {/* Patient & Exam Cockpit Summary Banner */}
            <div className="fade-in-up">
            <GlowCard className="p-6 sm:p-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                        {/* Patient Initials Avatar */}
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-xl font-black text-white shadow-lg shadow-cyan-500/25 ring-4 ring-cyan-500/10">
                            {patientInitials}
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2.5">
                                <h1 className="truncate text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                                    {patient_name || tr(t, 'fallback.unnamedPatient', 'Unnamed Patient', 'مريض بدون اسم', isAr)}
                                </h1>
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs font-bold ${
                                    status === 'Finalized'
                                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                        : status === 'Reporting'
                                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                                        : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20'
                                }`}>
                                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                                    {translatedStatus}
                                </span>
                                {priority === 'Urgent' || priority === 'Emergency' ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 font-mono text-xs font-bold text-rose-600 border border-rose-500/20 dark:text-rose-400">
                                        <AlertTriangle size={12} />
                                        {translatedPriority}
                                    </span>
                                ) : null}
                            </div>

                            <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                                {exam_type_name || modality_name} {modality_name && exam_type_name ? `· ${modality_name}` : ''}
                            </p>

                            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                                {mrn && (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 font-mono dark:bg-slate-800 dark:text-slate-200">
                                        <User size={13} className="text-cyan-600 dark:text-cyan-400" />
                                        MRN: {mrn}
                                    </span>
                                )}
                                {order_number && (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 font-mono dark:bg-slate-800 dark:text-slate-200">
                                        <Hash size={13} className="text-blue-600 dark:text-blue-400" />
                                        Order #: {order_number}
                                    </span>
                                )}
                                {gender && (
                                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
                                        {getGenderTranslation(gender, t, isAr)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {patient_id && (
                        <div className="shrink-0">
                            <Link
                                to={`/patients/${patient_id}`}
                                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-cyan-300 hover:bg-white hover:text-cyan-700 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                                <UserRound size={15} />
                                {tr(t, 'actions.patientProfile', 'Full Patient Profile', 'الملف الكامل للمريض', isAr)}
                                <ExternalLink size={13} />
                            </Link>
                        </div>
                    )}
                </div>
            </GlowCard>
            </div>

            {/* Workflow Tracker Section */}
            <div className="fade-in-up" style={{ animationDelay: '100ms' }}>
            <WorkflowStepper currentStatus={status} timestamps={timestamps} language={language} isRtl={isRtl} isAr={isAr} t={t} />
            </div>

            {/* Case Details Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Column: Patient & Exam Details */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="fade-in-up" style={{ animationDelay: '200ms' }}>
                    <GlowCard className="relative before:absolute before:inset-x-0 before:top-0 before:h-1 before:rounded-t-3xl before:bg-gradient-to-r before:from-cyan-500 before:to-blue-600 before:opacity-60">
                        <SectionHeader icon={User} title={tr(t, 'caseDetails.patientInfo', 'Patient Information', 'بيانات المريض', isAr)} badge={mrn ? `MRN: ${mrn}` : undefined} />
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                            <DetailRow icon={User} label={tr(t, 'patient.name', 'Patient Name', 'اسم المريض', isAr)} value={patient_name} highlight copyable isAr={isAr} />
                            <DetailRow icon={Hash} label={tr(t, 'patient.mrn', 'MRN', 'رقم السجل الطبي (MRN)', isAr)} value={mrn} highlight copyable isAr={isAr} />
                            <DetailRow icon={UserCheck} label={tr(t, 'patient.gender', 'Gender', 'الجنس', isAr)} value={getGenderTranslation(gender, t, isAr)} isAr={isAr} />
                            {date_of_birth && <DetailRow icon={Calendar} label={tr(t, 'patient.dob', 'Date of Birth', 'تاريخ الميلاد', isAr)} value={formatLocalizedDate(date_of_birth, language)} isAr={isAr} />}
                            {phone && <DetailRow icon={Activity} label={tr(t, 'patient.phone', 'Phone Number', 'رقم الهاتف', isAr)} value={phone} copyable isAr={isAr} />}
                            {referring_doctor_name && <DetailRow icon={Stethoscope} label={tr(t, 'patient.referringDoctor', 'Referring Doctor', 'الطبيب المحول', isAr)} value={referring_doctor_name} isAr={isAr} />}
                        </div>
                    </GlowCard>
                    </div>

                    <div className="fade-in-up" style={{ animationDelay: '300ms' }}>
                    <GlowCard className="relative before:absolute before:inset-x-0 before:top-0 before:h-1 before:rounded-t-3xl before:bg-gradient-to-r before:from-sky-500 before:to-indigo-600 before:opacity-60">
                        <SectionHeader icon={Stethoscope} title={tr(t, 'caseDetails.clinicalInfo', 'Clinical Details', 'التفاصيل السريرية', isAr)} />
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                                <DetailRow icon={ScanLine} label={tr(t, 'exam.modality', 'Modality', 'الجهاز', isAr)} value={modality_name} highlight isAr={isAr} />
                                <DetailRow icon={FileSearch} label={tr(t, 'exam.type', 'Examination Type', 'نوع الفحص', isAr)} value={exam_type_name} highlight isAr={isAr} />
                                <DetailRow icon={AlertTriangle} label={tr(t, 'exam.priority', 'Priority', 'الأولوية', isAr)} value={translatedPriority} isAr={isAr} />
                            </div>
                            
                            {clinical_indication && (
                                <div className="group">
                                    <span className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400 transition-colors group-hover:text-cyan-600 dark:group-hover:text-cyan-400">{tr(t, 'exam.indication', 'Clinical Indication', 'دواعي الفحص السريرية', isAr)}</span>
                                    <div className="mt-2.5 rounded-2xl border border-slate-200/60 bg-slate-50/80 p-5 text-sm font-semibold leading-relaxed text-slate-700 shadow-inner dark:border-slate-800/80 dark:bg-slate-950/40 dark:text-slate-300">
                                        {clinical_indication}
                                    </div>
                                </div>
                            )}

                            {provisional_diagnosis && (
                                <div className="group">
                                    <span className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400 transition-colors group-hover:text-cyan-600 dark:group-hover:text-cyan-400">{tr(t, 'exam.provisional', 'Provisional Diagnosis', 'التشخيص المبدئي', isAr)}</span>
                                    <div className="mt-2.5 rounded-2xl border border-slate-200/60 bg-slate-50/80 p-5 text-sm font-semibold leading-relaxed text-slate-700 shadow-inner dark:border-slate-800/80 dark:bg-slate-950/40 dark:text-slate-300">
                                        {provisional_diagnosis}
                                    </div>
                                </div>
                            )}
                        </div>
                    </GlowCard>
                    </div>

                    {/* Diagnostic Report Section (Available or Finalized) */}
                    {(report_text || impression || status === 'Finalized') && (
                        <div className="fade-in-up" style={{ animationDelay: '400ms' }}>
                        <GlowCard className="relative before:absolute before:inset-x-0 before:top-0 before:h-1 before:rounded-t-3xl before:bg-gradient-to-r before:from-rose-500 before:to-pink-600 before:opacity-60">
                            <SectionHeader
                                icon={FileText}
                                title={tr(t, 'caseDetails.diagnosticReport', 'Diagnostic Report', 'التقرير التشخيصي المعتمد', isAr)}
                                badge={performing_radiologist_name || undefined}
                                action={
                                    <button
                                        type="button"
                                        onClick={() => handlePrintReport(true)}
                                        disabled={isPrintingReport}
                                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600 transition hover:bg-emerald-500/20 dark:text-emerald-400"
                                    >
                                        {isPrintingReport ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}
                                        {tr(t, 'actions.printReportPdf', 'Print Report PDF', 'طباعة تقرير PDF', isAr)}
                                    </button>
                                }
                            />
                            <div className="space-y-4">
                                {performing_radiologist_name && (
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                                        <Stethoscope size={15} className="text-cyan-600 dark:text-cyan-400" />
                                        <span>{tr(t, 'report.radiologist', 'Radiologist', 'الطبيب الاستشاري', isAr)}:</span>
                                        <span className="font-black text-slate-950 dark:text-white">{performing_radiologist_name}</span>
                                    </div>
                                )}

                                {impression && (
                                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-sm">
                                        <p className="text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">{tr(t, 'report.impression', 'Impression', 'الخلاصة والتوصيات', isAr)}</p>
                                        <p className="mt-2 text-sm font-bold leading-relaxed text-slate-900 dark:text-white">{impression}</p>
                                    </div>
                                )}

                                {report_text ? (
                                    <div className="rounded-2xl border border-slate-200/60 bg-slate-50 p-5 text-sm leading-relaxed text-slate-800 dark:border-slate-800/60 dark:bg-slate-950/40 dark:text-slate-200 font-mono whitespace-pre-wrap">
                                        {report_text}
                                    </div>
                                ) : (
                                    <div className="rounded-2xl border border-slate-200/40 bg-slate-50/50 p-4 text-xs font-semibold text-slate-500 text-center">
                                        {tr(t, 'report.availableInPdf', 'Full finalized report document available for printing.', 'مستند التقرير النهائي المعتمد جاهز للطباعة.', isAr)}
                                    </div>
                                )}
                            </div>
                        </GlowCard>
                        </div>
                    )}
                </div>

                {/* Right Column: Safety & Timing */}
                <div className="space-y-6">
                    <div className="fade-in-up" style={{ animationDelay: '250ms' }}>
                    <GlowCard className="relative before:absolute before:inset-x-0 before:top-0 before:h-1 before:rounded-t-3xl before:bg-gradient-to-r before:from-cyan-500 before:to-blue-600 before:opacity-60">
                        <SectionHeader icon={ClipboardSignature} title={tr(t, 'caseDetails.safety', 'Safety Checks', 'فحوصات السلامة', isAr)} />
                        <div className="space-y-4">
                            <SafetyRow icon={Baby} label={tr(t, 'safety.pregnancy', 'Pregnancy Check', 'فحص الحمل', isAr)} status={pregnancy_safety_status} t={t} isAr={isAr} />
                            <SafetyRow icon={ShieldCheck} label={tr(t, 'safety.implant', 'Implants Check', 'فحص الغرسات والأجهزة', isAr)} status={implant_safety_status} t={t} isAr={isAr} />
                            <SafetyRow icon={Activity} label={tr(t, 'safety.renal', 'Renal Function', 'وظائف الكلى', isAr)} status={renal_safety_status} t={t} isAr={isAr} />
                        </div>
                    </GlowCard>
                    </div>

                    <div className="fade-in-up" style={{ animationDelay: '350ms' }}>
                    <GlowCard className="relative before:absolute before:inset-x-0 before:top-0 before:h-1 before:rounded-t-3xl before:bg-gradient-to-r before:from-emerald-500 before:to-teal-600 before:opacity-60">
                        <SectionHeader icon={Clock} title={tr(t, 'caseDetails.timeline', 'Key Timestamps', 'التوقيتات الزمنية', isAr)} />
                        <div className={`space-y-5 divide-y divide-slate-100/60 dark:divide-slate-800/60 ${isRtl ? 'space-x-reverse divide-x-reverse' : ''}`}>
                            <div className="group flex items-center justify-between pt-2">
                                <span className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400 transition-colors group-hover:text-cyan-600 dark:group-hover:text-cyan-400">{tr(t, 'timeline.created', 'Created', 'وقت الموعد', isAr)}</span>
                                <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">{timestamps.created_at ? formatDateTime(timestamps.created_at, language) : '--'}</span>
                            </div>
                            <div className="group flex items-center justify-between pt-5">
                                <span className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400 transition-colors group-hover:text-cyan-600 dark:group-hover:text-cyan-400">{tr(t, 'timeline.arrived', 'Arrived', 'وقت الوصول', isAr)}</span>
                                <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">{timestamps.arrived_at ? formatDateTime(timestamps.arrived_at, language) : '--'}</span>
                            </div>
                            <div className="group flex items-center justify-between pt-5">
                                <span className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400 transition-colors group-hover:text-cyan-600 dark:group-hover:text-cyan-400">{tr(t, 'timeline.examStart', 'Exam Started', 'بداية الفحص', isAr)}</span>
                                <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">{timestamps.exam_started_at ? formatDateTime(timestamps.exam_started_at, language) : '--'}</span>
                            </div>
                            <div className="group flex items-center justify-between pt-5">
                                <span className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400 transition-colors group-hover:text-cyan-600 dark:group-hover:text-cyan-400">{tr(t, 'timeline.reported', 'Report Finalized', 'اعتماد التقرير', isAr)}</span>
                                <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">{timestamps.report_finalized_at ? formatDateTime(timestamps.report_finalized_at, language) : '--'}</span>
                            </div>
                        </div>
                    </GlowCard>
                    </div>

                </div>

            </div>
        </div>
    );
};

export default CaseDetailsPage;
