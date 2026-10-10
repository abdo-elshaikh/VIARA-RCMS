import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowLeft,
    Ban,
    Building2,
    CalendarClock,
    CalendarDays,
    Check,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    ClipboardCheck,
    Clock3,
    Download,
    FileText,
    History,
    Loader2,
    MoonStar,
    RefreshCw,
    RotateCcw,
    Search,
    Sparkles,
    Stethoscope,
    User,
    X,
    XCircle,
} from 'lucide-react';

import { selectCurrentUser, selectCurrentToken } from '../store/authSlice';
import PageHeader from '../components/ui/PageHeader';
import ConfirmDialog from '../components/ui/ConfirmDialog';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const getCsrfToken = () => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
};

const toDateInputValue = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const addDaysToDateInput = (dateValue, days) => {
    const [year, month, day] = String(dateValue).split('-').map(Number);
    if (!year || !month || !day) return toDateInputValue(new Date());
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

// apiFetch requires the JWT token to be passed explicitly so this module
// stays usable outside React component context (e.g. subagent calls).
const apiFetch = async (path, opts = {}, token = null) => {
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': getCsrfToken() || '',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(opts.headers || {}),
        },
        ...opts,
    });

    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || body?.message || `HTTP ${res.status}`);
    }

    return res.json();
};

const STAGE_LABELS = {
    Scheduled: 'مجدول',
    Arrived: 'حضر',
    'Payment Pending': 'انتظار الدفع',
    'Prep Pending': 'انتظار التحضير',
    'Ready for Exam': 'جاهز للفحص',
};

const STAGE_LABELS_EN = {
    Scheduled: 'Scheduled',
    Arrived: 'Arrived',
    'Payment Pending': 'Payment pending',
    'Prep Pending': 'Preparation pending',
    'Ready for Exam': 'Ready for exam',
};

const PRIORITY_LABELS_EN = {
    Emergency: 'Emergency',
    Urgent: 'Urgent',
    High: 'High',
    Normal: 'Normal',
    Routine: 'Routine',
};

const getStageLabel = (stage, localeCopy) =>
    (localeCopy.language === 'en' ? STAGE_LABELS_EN[stage] : STAGE_LABELS[stage]) || stage || '—';

const STAGE_TONES = {
    Scheduled: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300',
    Arrived: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/35 dark:text-sky-300',
    'Payment Pending': 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-300',
    'Prep Pending': 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/70 dark:bg-violet-950/35 dark:text-violet-300',
    'Ready for Exam': 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/35 dark:text-emerald-300',
};

const PRIORITY_META = {
    Emergency: {
        label: 'طارئ',
        className: 'border-red-300 bg-red-50 text-red-800 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300',
        dot: 'bg-red-600',
        rank: 0,
    },
    Urgent: {
        label: 'عاجل',
        className: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/35 dark:text-rose-300',
        dot: 'bg-rose-500',
        rank: 1,
    },
    High: {
        label: 'مرتفع',
        className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-300',
        dot: 'bg-amber-500',
        rank: 2,
    },
    Normal: {
        label: 'عادي',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-300',
        dot: 'bg-emerald-500',
        rank: 3,
    },
    Routine: {
        label: 'روتيني',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-300',
        dot: 'bg-emerald-500',
        rank: 3,
    },
};

const END_OF_DAY_COPY = {
    ar: {
        language: 'ar',
        carryForwardTitle: 'ترحيل لليوم التالي',
        carryForwardShort: 'ترحيل',
        carryForwardDescription: 'إبقاء الحالة مفتوحة لليوم التالي مع تسجيل سبب الترحيل.',
        rescheduleTitle: 'إعادة الجدولة',
        rescheduleShort: 'إعادة الجدولة',
        rescheduleDescription: 'تحديد تاريخ ووقت جديدين للمريض.',
        noShowTitle: 'تسجيل عدم حضور',
        noShowShort: 'عدم حضور',
        noShowDescription: 'إلغاء الموعد الحالي وتسجيل الحالة كعدم حضور.',
        pendingReviewTitle: 'مراجعة الحالة العالقة',
        pendingReviewSubtitle: 'اختر الإجراء المناسب قبل إغلاق اليوم',
        chooseAction: 'اختر الإجراء المناسب قبل إغلاق اليوم',
        noPendingCasesTitle: 'اليوم جاهز للإغلاق',
        noPendingCasesSubtitle: 'لا توجد حالات تحتاج قرارًا إضافيًا.',
        actionConfirm: 'تأكيد',
        actionCancel: 'إلغاء',
        actionBack: 'رجوع',
        actionRetry: 'إعادة المحاولة',
        selectedCases: 'حالات محددة',
        clearSelection: 'إلغاء التحديد',
        bulkCarryForward: 'ترحيل المحدد',
        bulkNoShow: 'عدم حضور',
        bulkReschedule: 'إعادة جدولة المحدد',
        processing: 'جارٍ التنفيذ...',
        close: 'إغلاق',
        unknownPatient: 'مريض غير محدد',
        newAppointment: 'الموعد الجديد',
        newDate: 'التاريخ الجديد',
        time: 'الوقت',
        optional: 'اختياري',
        notes: 'ملاحظات',
        notesPlaceholder: 'سبب الترحيل، تعليمات التواصل، أو أي ملاحظة مهمة...',
        selectedCasesQuestion: 'للحالات المحددة؟',
        bulkConfirmation: (count) => `سيتم تطبيق الإجراء على ${count} حالة. تأكد من أن الحالات المختارة صحيحة قبل المتابعة.`,
        noSearchResults: 'لا توجد نتائج مطابقة',
        noPendingCases: 'لا توجد حالات عالقة',
        tryAnotherSearch: 'جرّب اسمًا مختلفًا أو رقم طلب أو نوع فحص آخر.',
        allCasesReviewed: 'تمت مراجعة ومعالجة جميع حالات هذا اليوم. الوردية جاهزة للإغلاق.',
        patient: 'المريض',
        exam: 'الفحص',
        appointmentStatus: 'الموعد والحالة',
        priority: 'الأولوية',
        receptionist: 'موظف الاستقبال',
        referringDoctor: 'الطبيب المحوّل',
        action: 'الإجراء',
        review: 'مراجعة',
        todayTotal: 'إجمالي اليوم',
        completed: 'مكتمل',
        pendingCases: 'حالات عالقة',
        urgentCases: 'حالة عاجلة',
        needsDecision: 'تحتاج قرارًا قبل الإغلاق',
        cancelled: 'ملغى',
        reporting: 'مرحلة التقارير',
        pendingTab: 'الحالات العالقة',
        reviewLogTab: 'سجل المراجعة',
        shiftHistoryTab: 'سجل الورديات',
        endOfDayReview: 'مراجعة نهاية الوردية',
        shiftClose: 'إغلاق الوردية',
        reviewDescription: 'راجع الحالات غير المكتملة واتخذ الإجراء المناسب قبل الإغلاق',
        returnToReception: 'العودة للاستقبال',
        shiftClosedNotice: 'تم إغلاق الوردية بنجاح',
        shiftClosedInstructions: 'تبقى مراجعة الحالات العالقة فقط. عالج كل حالة أو رحّلها قبل إنهاء المراجعة.',
        pendingCountCases: (count) => `${count} حالة`,
        pendingHelp: 'العاجل يظهر أولًا. حدّد عدة حالات لتنفيذ إجراء جماعي.',
        searchPlaceholder: 'اسم المريض، رقم الطلب، نوع الفحص...',
        clearSearch: 'مسح البحث',
        carryAllTomorrow: 'ترحيل الكل للغد',
        carryAllConfirm: (count) => `ترحيل ${count} حالة معلقة إلى الغد؟`,
        loadingShiftCases: 'جارٍ تحميل حالات الوردية...',
        selectVisible: 'تحديد كل النتائج الظاهرة',
        unassigned: 'غير مسند',
        noReviewActions: 'لا توجد إجراءات مسجلة',
        noReviewActionsDescription: 'لم يتم تنفيذ إجراءات نهاية وردية لهذا اليوم بعد.',
        exportLog: 'تصدير',
        exportLogTitle: 'تصدير السجل (CSV)',
        actionCount: (count) => `${count} إجراء`,
        loadingReviewLog: 'جارٍ تحميل سجل المراجعة...',
        tableTime: 'الوقت',
        user: 'المستخدم',
        role: 'الدور',
        selectPatient: (name) => `تحديد ${name}`,
        previousStatus: 'الحالة السابقة',
        notesColumn: 'الملاحظات',
        risk: 'المخاطرة',
        previous: 'السابق',
        next: 'التالي',
        pageOf: (page, total) => `صفحة ${page} من ${total}`,
        reviewDataLoadFailed: 'فشل تحميل البيانات',
        reviewLogLoadFailed: 'فشل تحميل سجل المراجعة',
        bulkActionFailed: 'فشل الإجراء الجماعي',
        bulkActionFailedCount: (count) => `تعذرت معالجة ${count} حالة — تحقق من تفاصيلها في الجدول`,
        bulkActionSuccessCount: (count) => `تمت معالجة ${count} حالة بنجاح`,
        logExportSuccess: 'تم تصدير سجل المراجعة بنجاح',
        processingFailed: 'فشل الإجراء',
        carryForwardFailed: 'فشل ترحيل الحالات',
        casesCarriedForwardCount: (count, date) => `تم ترحيل ${count} حالة بنجاح إلى ${date}`,
        casesCouldNotProcess: (count) => `تعذرت معالجة ${count} حالة — تحقق من تفاصيلها في الجدول`,
        reviewDate: 'تاريخ المراجعة',
        refresh: 'تحديث',
        refreshData: 'تحديث البيانات',
        back: 'العودة',
        completionRate: 'نسبة الإنجاز',
    },
    en: {
        language: 'en',
        carryForwardTitle: 'Carry forward to next day',
        carryForwardShort: 'Carry forward',
        carryForwardDescription: 'Keep the case open for the next day and record the reason for the carry-forward.',
        rescheduleTitle: 'Reschedule',
        rescheduleShort: 'Reschedule',
        rescheduleDescription: 'Set a new date and time for the patient.',
        noShowTitle: 'Mark no-show',
        noShowShort: 'No-show',
        noShowDescription: 'Cancel the current appointment and record the case as a no-show.',
        pendingReviewTitle: 'Review pending case',
        pendingReviewSubtitle: 'Select the appropriate action before closing the day',
        chooseAction: 'Select the appropriate action before closing the day',
        noPendingCasesTitle: 'The day is ready to close',
        noPendingCasesSubtitle: 'No cases require any additional decision.',
        actionConfirm: 'Confirm',
        actionCancel: 'Cancel',
        actionBack: 'Back',
        actionRetry: 'Retry',
        selectedCases: 'Selected cases',
        clearSelection: 'Clear selection',
        bulkCarryForward: 'Carry forward selected',
        bulkNoShow: 'No-show',
        bulkReschedule: 'Reschedule selected',
        processing: 'Processing...',
        close: 'Close',
        unknownPatient: 'Unknown patient',
        newAppointment: 'New appointment',
        newDate: 'New date',
        time: 'Time',
        optional: 'Optional',
        notes: 'Notes',
        notesPlaceholder: 'Reason for carrying forward, contact instructions, or any important note...',
        selectedCasesQuestion: 'for selected cases?',
        bulkConfirmation: (count) => `This action will be applied to ${count} selected cases. Make sure the chosen entries are correct before continuing.`,
        noSearchResults: 'No matching results',
        noPendingCases: 'No pending cases',
        tryAnotherSearch: 'Try another name, order number, or exam type.',
        allCasesReviewed: 'All cases for today have been reviewed. The shift is ready to close.',
        patient: 'Patient',
        exam: 'Exam',
        appointmentStatus: 'Appointment and status',
        priority: 'Priority',
        receptionist: 'Receptionist',
        referringDoctor: 'Referring doctor',
        action: 'Action',
        review: 'Review',
        todayTotal: "Today's total",
        completed: 'Completed',
        pendingCases: 'Pending cases',
        urgentCases: 'urgent cases',
        needsDecision: 'Needs a decision before closing',
        cancelled: 'Cancelled',
        reporting: 'In reporting',
        pendingTab: 'Pending cases',
        reviewLogTab: 'Review log',
        shiftHistoryTab: 'Shift history',
        endOfDayReview: 'End-of-day review',
        shiftClose: 'Shift close',
        reviewDescription: 'Review incomplete cases and take the appropriate action before closing',
        returnToReception: 'Return to reception',
        shiftClosedNotice: 'Shift closed successfully',
        shiftClosedInstructions: 'Only pending cases remain. Resolve or carry each case forward before finishing the review.',
        pendingCountCases: (count) => `${count} cases`,
        pendingHelp: 'Urgent cases appear first. Select multiple entries to run a bulk action.',
        searchPlaceholder: 'Patient name, order number, or exam type...',
        clearSearch: 'Clear search',
        carryAllTomorrow: 'Carry all to tomorrow',
        carryAllConfirm: (count) => `Carry ${count} pending cases forward to tomorrow?`,
        loadingShiftCases: 'Loading shift cases...',
        selectVisible: 'Select all visible results',
        unassigned: 'Unassigned',
        noReviewActions: 'No actions recorded',
        noReviewActionsDescription: 'No end-of-day actions have been performed for this day yet.',
        exportLog: 'Export',
        exportLogTitle: 'Export log (CSV)',
        actionCount: (count) => `${count} actions`,
        loadingReviewLog: 'Loading review log...',
        tableTime: 'Time',
        user: 'User',
        role: 'Role',
        selectPatient: (name) => `Select ${name}`,
        previousStatus: 'Previous status',
        notesColumn: 'Notes',
        risk: 'Risk',
        previous: 'Previous',
        next: 'Next',
        pageOf: (page, total) => `Page ${page} of ${total}`,
        reviewDataLoadFailed: 'Failed to load review data',
        reviewLogLoadFailed: 'Failed to load review log',
        bulkActionFailed: 'Bulk action failed',
        bulkActionFailedCount: (count) => `${count} cases could not be processed. Check their row details.`,
        bulkActionSuccessCount: (count) => `${count} cases processed successfully`,
        logExportSuccess: 'Review log exported successfully',
        processingFailed: 'Action failed',
        carryForwardFailed: 'Could not carry forward cases',
        casesCarriedForwardCount: (count, date) => `${count} cases carried forward to ${date}`,
        casesCouldNotProcess: (count) => `${count} cases could not be processed. Check their row details.`,
        reviewDate: 'Review date',
        refresh: 'Refresh',
        refreshData: 'Refresh data',
        back: 'Back',
        completionRate: 'completion rate',
    },
};

const getActionMeta = (localeCopy) => ({
    carry_forward: {
        label: localeCopy.carryForwardTitle,
        shortLabel: localeCopy.carryForwardShort,
        description: localeCopy.carryForwardDescription,
        icon: RotateCcw,
        tone: 'teal',
    },
    reschedule: {
        label: localeCopy.rescheduleTitle,
        shortLabel: localeCopy.rescheduleShort,
        description: localeCopy.rescheduleDescription,
        icon: CalendarClock,
        tone: 'sky',
    },
    no_show: {
        label: localeCopy.noShowTitle,
        shortLabel: localeCopy.noShowShort,
        description: localeCopy.noShowDescription,
        icon: Ban,
        tone: 'rose',
    },
});

const formatTime = (timeStr, locale = 'ar-EG') => {
    if (!timeStr) return '—';
    try {
        return new Date(timeStr).toLocaleTimeString(locale, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
    } catch {
        return timeStr;
    }
};

const formatDate = (dateStr, locale = 'ar-EG') => {
    if (!dateStr) return '—';
    try {
        const value = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr}T12:00:00` : dateStr;
        return new Date(value).toLocaleDateString(locale, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    } catch {
        return dateStr;
    }
};

const initials = (name = '') => {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '؟';
    return parts.slice(0, 2).map((part) => part[0]).join('');
};

const SurfaceCard = ({ children, className = '' }) => (
    <section
        className={`overflow-hidden border-y border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] ${className}`}
    >
        {children}
    </section>
);

const StageBadge = ({ stage, localeCopy = END_OF_DAY_COPY.ar }) => (
    <span
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-black ${STAGE_TONES[stage] || STAGE_TONES.Scheduled}`}
    >
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-65" />
        {getStageLabel(stage, localeCopy)}
    </span>
);

const PriorityBadge = ({ priority, localeCopy = END_OF_DAY_COPY.ar }) => {
    const meta = PRIORITY_META[priority] || PRIORITY_META.Normal;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-black ${meta.className}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {localeCopy.language === 'en' ? PRIORITY_LABELS_EN[priority] || priority || 'Normal' : meta.label}
        </span>
    );
};

const StatCard = ({ icon: Icon, label, value, sub, tone = 'slate', loading = false }) => {
    const toneMap = {
        slate: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
        teal: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
        emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        amber: 'bg-amber-500/10 text-amber-800 dark:text-amber-300',
        rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
        sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    };

    return (
            <div className="flex min-w-0 items-center gap-2.5 border-b border-e border-[var(--VIARA-line)] px-3 py-2.5 last:border-e-0 md:border-b-0">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${toneMap[tone] || toneMap.slate}`}>
                <Icon size={16} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-bold text-[var(--VIARA-muted)]">{label}</p>
                <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
                    <span className="text-lg font-black tabular-nums leading-none text-[var(--VIARA-ink)]">
                        {loading ? <Loader2 size={15} className="animate-spin text-[var(--VIARA-muted)]" /> : value ?? '—'}
                    </span>
                    {sub && <span className="truncate text-[9px] font-semibold text-[var(--VIARA-muted)]">{sub}</span>}
                </div>
            </div>
        </div>
    );
};

const EmptyState = ({ searchQuery, localeCopy = END_OF_DAY_COPY.ar }) => (
    <div className="flex min-h-[210px] flex-col items-center justify-center px-6 py-9 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-300">
            {searchQuery ? <Search size={24} /> : <CheckCircle2 size={26} />}
        </span>
        <h3 className="mt-4 text-sm font-black text-[var(--VIARA-ink)]">
            {searchQuery ? localeCopy.noSearchResults : localeCopy.noPendingCases}
        </h3>
        <p className="mt-1 max-w-md text-xs font-medium leading-6 text-[var(--VIARA-muted)]">
            {searchQuery
                ? localeCopy.tryAnotherSearch
                : localeCopy.allCasesReviewed}
        </p>
    </div>
);

const ActionModal = ({ exam, onClose, onConfirm, loading, localeCopy = END_OF_DAY_COPY.ar }) => {
    const [action, setAction] = useState('carry_forward');
    const [newDate, setNewDate] = useState('');
    const [newTime, setNewTime] = useState('');
    const [notes, setNotes] = useState('');
    const today = toDateInputValue();
    const actionMeta = getActionMeta(localeCopy)[action];

    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === 'Escape' && !loading) onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [loading, onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="action-modal-title"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !loading) onClose();
            }}
        >
            <div className="w-full max-w-[620px] overflow-hidden rounded-[26px] border border-white/20 bg-[var(--VIARA-surface)] shadow-2xl shadow-slate-950/30">
                <div className="flex items-start justify-between gap-4 border-b border-[var(--VIARA-line)] bg-gradient-to-l from-teal-500/[0.08] via-[var(--VIARA-surface)] to-transparent px-4 py-4 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-600/15">
                            <ClipboardCheck size={19} />
                        </span>
                        <div className="min-w-0">
                            <h3 id="action-modal-title" className="text-sm font-black text-[var(--VIARA-ink)]">{localeCopy.pendingReviewTitle}</h3>
                            <p className="mt-0.5 text-[10.5px] font-medium text-[var(--VIARA-muted)]">{localeCopy.pendingReviewSubtitle}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[var(--VIARA-line)] text-[var(--VIARA-muted)] transition hover:bg-[var(--VIARA-surface-muted)] hover:text-[var(--VIARA-ink)] disabled:opacity-50"
                        aria-label={localeCopy.close}
                    >
                        <X size={15} />
                    </button>
                </div>

                <div className="max-h-[76vh] overflow-y-auto p-4 sm:p-5">
                    <div className="flex items-center gap-3 rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/45 p-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-500/10 text-xs font-black text-teal-700 dark:text-teal-300">
                            {initials(exam.patient_name)}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-black text-[var(--VIARA-ink)]">{exam.patient_name || localeCopy.unknownPatient}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold text-[var(--VIARA-muted)]">
                                <span className="inline-flex items-center gap-1"><Stethoscope size={10} /> {exam.exam_type || '—'}</span>
                                <span className="inline-flex items-center gap-1"><Clock3 size={10} /> {formatTime(exam.appointment_time, localeCopy.language === 'en' ? 'en-US' : 'ar-EG')}</span>
                                {exam.order_number && <span className="font-mono text-teal-700 dark:text-teal-300">#{exam.order_number}</span>}
                            </div>
                        </div>
                        <PriorityBadge priority={exam.priority} localeCopy={localeCopy} />
                    </div>

                    <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                        {Object.entries(getActionMeta(localeCopy)).map(([value, meta]) => {
                            const Icon = meta.icon;
                            const selected = action === value;
                            const selectedClass = value === 'no_show'
                                ? 'border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/15'
                                : value === 'reschedule'
                                    ? 'border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/15'
                                    : 'border-teal-500 bg-teal-500/10 ring-2 ring-teal-500/15';
                            const iconClass = value === 'no_show'
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
                                : value === 'reschedule'
                                    ? 'bg-sky-500/10 text-sky-600 dark:text-sky-300'
                                    : 'bg-teal-500/10 text-teal-700 dark:text-teal-300';

                            return (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setAction(value)}
                                    aria-pressed={selected}
                                    className={`relative flex min-h-[126px] flex-col items-start rounded-2xl border p-3 text-start transition-all ${selected ? selectedClass : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] hover:border-teal-500/30 hover:bg-[var(--VIARA-surface-muted)]/45'}`}
                                >
                                    <span className={`grid h-8 w-8 place-items-center rounded-xl ${iconClass}`}>
                                        <Icon size={15} strokeWidth={2.25} />
                                    </span>
                                    <span className="mt-2 text-[11px] font-black text-[var(--VIARA-ink)]">{meta.label}</span>
                                    <span className="mt-1 text-[9.5px] font-medium leading-5 text-[var(--VIARA-muted)]">{meta.description}</span>
                                    {selected && (
                                        <span className="absolute end-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-teal-600 text-white">
                                            <Check size={11} strokeWidth={3} />
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {action === 'reschedule' && (
                        <div className="mt-4 rounded-2xl border border-sky-200/100 bg-sky-50/60 p-3 dark:border-sky-900/60 dark:bg-sky-950/20">
                            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-black text-sky-900 dark:text-sky-200">
                                <CalendarClock size={13} /> {localeCopy.newAppointment}
                            </div>
                            <div className="grid gap-2.5 sm:grid-cols-2">
                                <label className="space-y-1.5">
                                    <span className="text-[10px] font-black text-[var(--VIARA-muted)]">{localeCopy.newDate} *</span>
                                    <input
                                        type="date"
                                        min={today}
                                        value={newDate}
                                        onChange={(event) => setNewDate(event.target.value)}
                                        className="min-h-10 w-full rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-xs font-bold text-[var(--VIARA-ink)] outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                                    />
                                </label>
                                <label className="space-y-1.5">
                                    <span className="text-[10px] font-black text-[var(--VIARA-muted)]">{localeCopy.time} <span className="font-semibold">({localeCopy.optional})</span></span>
                                    <input
                                        type="time"
                                        value={newTime}
                                        onChange={(event) => setNewTime(event.target.value)}
                                        className="min-h-10 w-full rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-xs font-bold text-[var(--VIARA-ink)] outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                                    />
                                </label>
                            </div>
                        </div>
                    )}

                    <label className="mt-4 block space-y-1.5">
                        <span className="flex items-center gap-1.5 text-[10px] font-black text-[var(--VIARA-muted)]">
                            <FileText size={11} /> {localeCopy.notes} <span className="font-semibold">({localeCopy.optional})</span>
                        </span>
                        <textarea
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            rows={3}
                            placeholder={localeCopy.notesPlaceholder}
                            className="w-full resize-none rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 py-2.5 text-xs font-semibold text-[var(--VIARA-ink)] outline-none transition placeholder:text-[var(--VIARA-muted)] focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                        />
                    </label>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/25 px-4 py-3 sm:px-5">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="min-h-9 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-4 text-xs font-black text-[var(--VIARA-muted)] transition hover:text-[var(--VIARA-ink)] disabled:opacity-50"
                    >
                        {localeCopy.actionCancel}
                    </button>
                    <button
                        type="button"
                        disabled={loading || (action === 'reschedule' && !newDate)}
                        onClick={() => onConfirm({ action, newDate, newTime, notes, appointmentId: exam.appointment_id })}
                        className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black text-white shadow-md transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45 ${action === 'no_show' ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/15' : 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:brightness-105 shadow-teal-600/15'}`}
                    >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : React.createElement(actionMeta.icon, { size: 14 })}
                        <span>{loading ? localeCopy.processing : actionMeta.shortLabel}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export const BulkConfirmModal = ({ intent, count, loading, onCancel, onConfirm }) => {
    const action = typeof intent === 'string' ? intent : intent?.action;
    const localeCopy = intent?.localeCopy || END_OF_DAY_COPY.ar;
    const meta = getActionMeta(localeCopy)[action];
    const isDanger = action === 'no_show';
    const Icon = meta?.icon;

    useEffect(() => {
        if (!meta) return;
        const onKeyDown = (event) => {
            if (event.key === 'Escape' && !loading) onCancel();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [loading, onCancel, meta]);

    if (!meta) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-confirm-title"
        >
            <div className="w-full max-w-md overflow-hidden rounded-[24px] border border-white/20 bg-[var(--VIARA-surface)] shadow-2xl shadow-slate-950/30">
                <div className="p-5 text-center">
                    <span className={`mx-auto grid h-12 w-12 place-items-center rounded-2xl ${isDanger ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300' : 'bg-teal-500/10 text-teal-700 dark:text-teal-300'}`}>
                        <Icon size={21} />
                    </span>
                    <h3 id="bulk-confirm-title" className="mt-3 text-sm font-black text-[var(--VIARA-ink)]">{meta.label} {localeCopy.selectedCasesQuestion}</h3>
                    <p className="mt-1 text-xs font-medium leading-6 text-[var(--VIARA-muted)]">
                        {localeCopy.bulkConfirmation(count)}
                    </p>
                </div>
                <div className="flex items-center gap-2 border-t border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/25 p-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={loading}
                        className="min-h-10 flex-1 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-xs font-black text-[var(--VIARA-muted)] transition hover:text-[var(--VIARA-ink)] disabled:opacity-50"
                    >
                        {localeCopy.actionBack}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={loading}
                        className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl text-xs font-black text-white transition disabled:opacity-50 ${isDanger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-teal-600 hover:bg-teal-500'}`}
                    >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        {localeCopy.actionConfirm}
                    </button>
                </div>
            </div>
        </div>
    );
};

const BulkActionBar = ({ selectedCount, onClear, onBulkAction, loading, localeCopy = END_OF_DAY_COPY.ar }) => {
    const [bulkRescheduleDate, setBulkRescheduleDate] = useState('');
    if (selectedCount === 0) return null;

    return (
        <div className="mx-3 mt-3 flex flex-wrap items-center justify-between gap-2 border-y border-teal-200 bg-teal-50/45 px-3 py-2.5 dark:border-teal-900/60 dark:bg-teal-950/20 sm:mx-4">
            <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-teal-600 text-[10px] font-black text-white shadow-sm">{selectedCount}</span>
                <div>
                    <p className="text-[11px] font-black text-teal-950 dark:text-teal-100">{localeCopy.selectedCases}</p>
                    <button type="button" onClick={onClear} className="text-[9.5px] font-bold text-teal-700 hover:underline dark:text-teal-300">{localeCopy.clearSelection}</button>
                </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => onBulkAction('carry_forward')}
                    disabled={loading}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-teal-300 bg-[var(--VIARA-surface)] px-2.5 text-[10.5px] font-black text-teal-800 transition hover:bg-teal-50 disabled:opacity-50 dark:border-teal-800 dark:text-teal-200 dark:hover:bg-teal-950/40"
                >
                    <RotateCcw size={12} /> {localeCopy.bulkCarryForward}
                </button>
                <button
                    type="button"
                    onClick={() => onBulkAction('no_show')}
                    disabled={loading}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-rose-300 bg-[var(--VIARA-surface)] px-2.5 text-[10.5px] font-black text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                >
                    <Ban size={12} /> {localeCopy.bulkNoShow}
                </button>
                {bulkRescheduleDate ? (
                    <>
                        <input
                            type="date"
                            value={bulkRescheduleDate}
                            onChange={(e) => setBulkRescheduleDate(e.target.value)}
                            min={toDateInputValue()}
                            className="h-8 rounded-lg border border-teal-300 bg-[var(--VIARA-surface)] ps-2 pe-2 text-[10.5px] font-black text-teal-800 focus:border-teal-500"
                        />
                        <button
                            type="button"
                            onClick={() => onBulkAction({ action: 'reschedule', date: bulkRescheduleDate })}
                            disabled={loading || !bulkRescheduleDate}
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-blue-300 bg-[var(--VIARA-surface)] px-2.5 text-[10.5px] font-black text-blue-800 transition hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:text-blue-200 dark:hover:bg-blue-950/40"
                        >
                            <CalendarClock size={12} /> {localeCopy.bulkReschedule}
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        onClick={() => setBulkRescheduleDate(toDateInputValue())}
                        disabled={loading}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-blue-300 bg-[var(--VIARA-surface)] px-2.5 text-[10.5px] font-black text-blue-800 transition hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:text-blue-200 dark:hover:bg-blue-950/40"
                    >
                        <CalendarClock size={12} /> {localeCopy.bulkReschedule}
                    </button>
                )}
            </div>
        </div>
    );
};

const PendingMobileCard = ({ exam, checked, onToggle, onAction, localeCopy = END_OF_DAY_COPY.ar }) => (
    <article className={`rounded-lg border p-3 transition ${checked ? 'border-teal-400 bg-teal-50/35 ring-2 ring-teal-500/10 dark:border-teal-700 dark:bg-teal-950/15' : ['Urgent', 'Emergency'].includes(exam.priority) ? 'border-rose-200 bg-rose-50/20 dark:border-rose-900/50 dark:bg-rose-950/10' : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)]'}`}>
        <div className="flex items-start gap-2.5">
            <input
                type="checkbox"
                checked={checked}
                onChange={onToggle}
                className="mt-2 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                aria-label={localeCopy.selectPatient(exam.patient_name)}
            />
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-500/10 text-[10px] font-black text-teal-700 dark:text-teal-300">
                {initials(exam.patient_name)}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="truncate text-xs font-black text-[var(--VIARA-ink)]">{exam.patient_name}</p>
                        <p className="mt-0.5 truncate text-[10px] font-semibold text-[var(--VIARA-muted)]">{exam.exam_type || '—'} {exam.modality_type ? `· ${exam.modality_type}` : ''}</p>
                    </div>
                    <PriorityBadge priority={exam.priority} localeCopy={localeCopy} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--VIARA-surface-muted)] px-2 py-1 text-[10px] font-black text-[var(--VIARA-ink)]"><Clock3 size={10} /> {formatTime(exam.appointment_time, localeCopy.language === 'en' ? 'en-US' : 'ar-EG')}</span>
                    <StageBadge stage={exam.queue_stage} localeCopy={localeCopy} />
                    {exam.order_number && <span className="rounded-lg bg-[var(--VIARA-surface-muted)] px-2 py-1 font-mono text-[9.5px] font-bold text-[var(--VIARA-muted)]">#{exam.order_number}</span>}
                </div>
                {exam.referring_doctor_name && (
                    <p className="mt-2 truncate text-[9.5px] font-medium text-[var(--VIARA-muted)]">{localeCopy.referringDoctor}: {exam.referring_doctor_name}</p>
                )}
                <p className="mt-1 truncate text-[9.5px] font-medium text-[var(--VIARA-muted)]">
                    {localeCopy.receptionist}: {exam.receptionist_name || localeCopy.unassigned}
                    {exam.receptionist_desk ? ` · ${exam.receptionist_desk}` : ''}
                </p>
            </div>
        </div>
        <button
            type="button"
            onClick={onAction}
            className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/70 text-[11px] font-black text-teal-800 transition hover:bg-teal-100 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300"
        >
            مراجعة الحالة <ChevronLeft size={13} className="rtl:rotate-0 ltr:rotate-180" />
        </button>
    </article>
);

export default function EndOfDayReview({ embedded = false, sessionId: propSessionId = null, fromShiftClose: propFromShiftClose = false, initialDate = null, currentShift = null, onBack = null }) {
    const user = useSelector(selectCurrentUser);
    const token = useSelector(selectCurrentToken);
    const navigate = useNavigate();
    const location = useLocation();
    const { i18n, t } = useTranslation('common');
    const localeCopy = END_OF_DAY_COPY[i18n.language?.startsWith('en') ? 'en' : 'ar'];

    // Convenience wrapper that injects the current JWT into every request.
    const authFetch = useCallback(
        (path, opts = {}) => apiFetch(path, opts, token),
        [token],
    );

    // In embedded mode the sessionId comes from the parent (ReceptionOperations).
    // In standalone mode it comes from navigation state (legacy route).
    const queryParams = new URLSearchParams(location.search);
    const [selectedSessionId, setSelectedSessionId] = useState(null);
    const resolvedSessionId = selectedSessionId || propSessionId || location.state?.sessionId || queryParams.get('sessionId') || null;
    const fromShiftClose = propFromShiftClose || Boolean(location.state?.fromShiftClose) || queryParams.get('fromShiftClose') === 'true';
    const [date, setDate] = useState(() => initialDate || queryParams.get('date') || toDateInputValue());
    const [summary, setSummary] = useState(null);
    const [pending, setPending] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [sessionLookupComplete, setSessionLookupComplete] = useState(!embedded || Boolean(propSessionId));
    const dataRequestIdRef = useRef(0);
    const [actionLoading, setActionLoading] = useState(false);
    const [showCarryAllConfirm, setShowCarryAllConfirm] = useState(false);
    const [selected, setSelected] = useState(new Set());
    const [activeExam, setActiveExam] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [resolvedIds, setResolvedIds] = useState(new Set());
    const [activeTab, setActiveTab] = useState('pending');
    const [reviewLog, setReviewLog] = useState([]);
    const [reviewLogTotal, setReviewLogTotal] = useState(0);
    const [reviewLogLoading, setReviewLogLoading] = useState(false);
    const [reviewLogPage, setReviewLogPage] = useState(0);
    const [shiftHistory, setShiftHistory] = useState([]);
    const [shiftHistoryLoading, setShiftHistoryLoading] = useState(false);
    const [historyFromDate, setHistoryFromDate] = useState(() => `${toDateInputValue().slice(0, 7)}-01`);
    const [historyToDate, setHistoryToDate] = useState(() => toDateInputValue());
    const [bulkIntent, setBulkIntent] = useState({ action: null, date: null });
    // Shift context for embedded mode
    const [shiftDetails, setShiftDetails] = useState(null);

    const isAdmin = user?.role === 'Admin' || user?.role === 'Developer';
    const isReceptionist = user?.role === 'Receptionist';
    const isRTL = i18n.dir() === 'rtl';

    useEffect(() => {
        setSelectedSessionId(null);
    }, [propSessionId]);

    // Fetch shift details for embedded mode
    useEffect(() => {
        if (embedded && resolvedSessionId) {
            authFetch(`/reception/shifts/${resolvedSessionId}`)
                .then(res => setShiftDetails(res))
                .catch(() => setShiftDetails(null));
        } else {
            setShiftDetails(null);
        }
    }, [embedded, resolvedSessionId, authFetch]);

    // When the tab is opened directly from Reception after a shift has already
    // closed, there is no active shift prop or URL context. Bind the review to
    // the user's latest shift for the selected business date so the tab opens
    // with the correct shift instead of an unscoped, apparently empty view.
    useEffect(() => {
        if (!embedded || resolvedSessionId || propSessionId) {
            setSessionLookupComplete(true);
            return undefined;
        }
        let cancelled = false;
        setSessionLookupComplete(false);
        const params = new URLSearchParams({ fromDate: date, toDate: date, limit: '1' });
        authFetch(`/reception/shifts?${params.toString()}`)
            .then((rows) => {
                if (!cancelled && Array.isArray(rows) && rows[0]?.session_id) {
                    setSelectedSessionId(rows[0].session_id);
                }
            })
            .catch(() => undefined)
            .finally(() => {
                if (!cancelled) setSessionLookupComplete(true);
            });
        return () => { cancelled = true; };
    }, [date, embedded, propSessionId, resolvedSessionId, authFetch]);

    const loadData = useCallback(async () => {
        if (embedded && !resolvedSessionId && !sessionLookupComplete) return;
        const requestId = ++dataRequestIdRef.current;
        setLoading(true);
        setSummaryLoading(true);
        setLoadError('');
        try {
            const params = new URLSearchParams({ date, limit: '200' });
            if (resolvedSessionId) params.set('sessionId', resolvedSessionId);
            // In standalone mode (no sessionId), Receptionists see only their own work items
            if (!resolvedSessionId && isReceptionist && !isAdmin && user?.user_id) {
                params.set('receptionistId', user.user_id);
            }
            const query = params.toString();
            const [pendingRes, summaryRes] = await Promise.all([
                authFetch(`/end-of-day/pending?${query}`),
                authFetch(`/end-of-day/summary?${query}`),
            ]);
            if (requestId !== dataRequestIdRef.current) return;
            setPending(pendingRes.data || []);
            setTotal(pendingRes.total || 0);
            setSummary(summaryRes);
            setResolvedIds(new Set());
        } catch (err) {
            if (requestId === dataRequestIdRef.current) setLoadError(err.message || localeCopy.reviewDataLoadFailed);
            toast.error(`${localeCopy.reviewDataLoadFailed}: ${err.message}`);
        } finally {
            if (requestId === dataRequestIdRef.current) {
                setLoading(false);
                setSummaryLoading(false);
            }
        }
    }, [date, embedded, resolvedSessionId, sessionLookupComplete, isReceptionist, isAdmin, user?.user_id, authFetch, localeCopy]);

    const loadReviewLog = useCallback(async (page = 0) => {
        setReviewLogLoading(true);
        try {
            const sessionParam = resolvedSessionId ? `&sessionId=${resolvedSessionId}` : '';
            const receptionistParam = !resolvedSessionId && isReceptionist && !isAdmin 
                ? `&receptionistId=${user.user_id}` 
                : '';
            const res = await authFetch(`/end-of-day/review-log?date=${date}&limit=50&offset=${page * 50}${sessionParam}${receptionistParam}`);
            setReviewLog(res.rows || []);
            setReviewLogTotal(res.total || 0);
            setReviewLogPage(page);
        } catch (err) {
            toast.error(`${localeCopy.reviewLogLoadFailed}: ${err.message}`);
        } finally {
            setReviewLogLoading(false);
        }
    }, [date, resolvedSessionId, isReceptionist, isAdmin, user?.user_id, authFetch, localeCopy]);

    const loadShiftHistory = useCallback(async () => {
        if (!historyFromDate || !historyToDate || historyFromDate > historyToDate) {
            toast.error(isRTL ? 'تحقق من نطاق التاريخ المحدد' : 'Check the selected date range');
            return;
        }
        setShiftHistoryLoading(true);
        try {
            const params = new URLSearchParams({ fromDate: historyFromDate, toDate: historyToDate, limit: '200' });
            const rows = await authFetch(`/reception/shifts?${params.toString()}`);
            setShiftHistory(Array.isArray(rows) ? rows : []);
        } catch (err) {
            toast.error(`${isRTL ? 'تعذر تحميل سجل الورديات' : 'Could not load shift history'}: ${err.message}`);
        } finally {
            setShiftHistoryLoading(false);
        }
    }, [authFetch, historyFromDate, historyToDate, isRTL]);

    useEffect(() => {
        loadData();
        return () => { dataRequestIdRef.current += 1; };
    }, [loadData]);

    useEffect(() => {
        if (activeTab === 'review-log') loadReviewLog(0);
    }, [activeTab, loadReviewLog]);

    useEffect(() => {
        if (activeTab === 'shift-history') loadShiftHistory();
    }, [activeTab, loadShiftHistory]);

    useEffect(() => {
        setSelected(new Set());
        setResolvedIds(new Set());
        setSearchQuery('');
    }, [date]);

    const handleResolve = async ({ action, newDate, newTime, notes, appointmentId }) => {
        setActionLoading(true);
        try {
            await authFetch(`/end-of-day/resolve/${appointmentId}`, {
                method: 'POST',
                body: JSON.stringify({ action, newDate, newTime, notes, sessionId: resolvedSessionId }),
            });

            toast.success(
                action === 'carry_forward'
                    ? (isRTL ? `تم ترحيل الحالة إلى ${formatDate(addDaysToDateInput(date, 1))}` : `Case carried forward to ${formatDate(addDaysToDateInput(date, 1), 'en-US')}`)
                    : action === 'no_show'
                        ? (isRTL ? 'تم تسجيل عدم حضور المريض' : 'Patient marked as a no-show')
                        : (isRTL ? 'تمت إعادة جدولة الموعد بنجاح' : 'Appointment rescheduled successfully')
            );

            setResolvedIds((prev) => new Set([...prev, appointmentId]));
            setSelected((prev) => {
                const next = new Set(prev);
                next.delete(appointmentId);
                return next;
            });
            setActiveExam(null);
            await loadData();
            if (activeTab === 'review-log') await loadReviewLog(0);
        } catch (err) {
            toast.error(`${localeCopy.processingFailed}: ${err.message}`);
        } finally {
            setActionLoading(false);
        }
    };

    const executeBulkAction = async () => {
        const action = typeof bulkIntent === 'string' ? bulkIntent : bulkIntent?.action;
        if (!action || selected.size === 0) return;
        const newDate = typeof bulkIntent === 'string' ? null : bulkIntent?.date;
        setActionLoading(true);
        try {
            const ids = [...selected];
            const items = ids.map((appointmentId) => ({ appointmentId, action, newDate, sessionId: resolvedSessionId }));
            const res = await authFetch('/end-of-day/bulk-resolve', {
                method: 'POST',
                body: JSON.stringify({ items }),
            });

            const successIds = new Set(
                (res.results || []).filter((item) => item.success).map((item) => item.appointmentId)
            );
            const failedIds = new Set(
                (res.results || []).filter((item) => !item.success).map((item) => item.appointmentId)
            );

            if (res.failed > 0) {
                toast.error(localeCopy.bulkActionFailedCount(res.failed), { duration: 6000 });
            }
            if (res.resolved > 0) {
                toast.success(localeCopy.bulkActionSuccessCount(res.resolved));
            }

            // Remove only successfully processed cases from view.
            // Failed cases remain visible and STAY selected so the user
            // can retry or take a different action on them.
            setResolvedIds((prev) => new Set([...prev, ...successIds]));
            setSelected(failedIds); // keep failed ones selected
            setBulkIntent({ action: null, date: null });
            await loadData();
            if (activeTab === 'review-log') await loadReviewLog(0);
        } catch (err) {
            toast.error(`${localeCopy.bulkActionFailed}: ${err.message}`);
        } finally {
            setActionLoading(false);
        }
    };

    const exportReviewLog = () => {
        if (reviewLog.length === 0) return;
        const headers = [localeCopy.tableTime, localeCopy.user, localeCopy.role, localeCopy.action, localeCopy.previousStatus, localeCopy.notesColumn, localeCopy.risk];
        const rows = reviewLog.map((entry) => {
            const details = entry.details || {};
            const role = entry.user_role || entry.actor_role || '—';
            const risk = Number(entry.risk_score || 0);
            return [
                new Date(entry.timestamp).toLocaleString(isRTL ? 'ar-EG' : 'en-US'),
                entry.user_name || entry.actor_name || '—',
                role,
                actionLabels[details.action] || details.action || '—',
                getStageLabel(details.previousStage, localeCopy),
                details.notes || '—',
                `${risk}/100`,
            ];
        });
        const csvContent = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `end-of-day-review-log-${date}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success(localeCopy.logExportSuccess);
    };

    const handleCarryForwardAll = () => {
        if (filteredPending.length === 0) return;
        setShowCarryAllConfirm(true);
    };

    const confirmCarryForwardAll = async () => {
        setShowCarryAllConfirm(false);
        setActionLoading(true);
        try {
            const newDate = addDaysToDateInput(date, 1);
            const ids = visibleIds;
            const items = ids.map((appointmentId) => ({ appointmentId, action: 'carry_forward', newDate, sessionId: resolvedSessionId }));
            const res = await authFetch('/end-of-day/bulk-resolve', {
                method: 'POST',
                body: JSON.stringify({ items }),
            });
            const successIds = new Set((res.results || []).filter((item) => item.success).map((item) => item.appointmentId));
            const failedIds = new Set((res.results || []).filter((item) => !item.success).map((item) => item.appointmentId));
            if (res.failed > 0) toast.error(localeCopy.casesCouldNotProcess(res.failed), { duration: 6000 });
            if (res.resolved > 0) {
                toast.success(localeCopy.casesCarriedForwardCount(res.resolved, formatDate(newDate, isRTL ? 'ar-EG' : 'en-US')));
            }
            setResolvedIds((prev) => new Set([...prev, ...successIds]));
            setSelected(failedIds);
            await loadData();
            if (activeTab === 'review-log') await loadReviewLog(0);
        } catch (err) {
            toast.error(`${localeCopy.carryForwardFailed}: ${err.message}`);
        } finally {
            setActionLoading(false);
        }
    };

    const toggleSelect = (id) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const filteredPending = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return pending
            .filter((exam) => {
                if (resolvedIds.has(exam.appointment_id)) return false;
                if (!q) return true;
                return [
                    exam.patient_name,
                    exam.exam_type,
                    exam.order_number,
                    exam.referring_doctor_name,
                    exam.receptionist_name,
                    exam.receptionist_desk,
                    exam.modality_type,
                ].some((value) => String(value || '').toLowerCase().includes(q));
            })
            .sort((a, b) => {
                const priorityDiff = (PRIORITY_META[a.priority]?.rank ?? 3) - (PRIORITY_META[b.priority]?.rank ?? 3);
                if (priorityDiff !== 0) return priorityDiff;
                return new Date(a.appointment_time || 0) - new Date(b.appointment_time || 0);
            });
    }, [pending, resolvedIds, searchQuery]);

    const visibleIds = useMemo(() => filteredPending.map((exam) => exam.appointment_id), [filteredPending]);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

    const toggleSelectAll = () => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
            else visibleIds.forEach((id) => next.add(id));
            return next;
        });
    };

    const pendingCount = summary?.pending ?? filteredPending.length;
    const hasPendingCases = pendingCount > 0;
    const completionRate = Number(summary?.completionRate ?? 0);
    const guidanceShift = resolvedSessionId && shiftDetails?.session_id === resolvedSessionId
        ? shiftDetails
        : currentShift?.status === 'Open' ? currentShift : shiftDetails;
    const guidanceIsOpen = guidanceShift?.status === 'Open';
    const guidanceMetrics = guidanceShift?.live_metrics || guidanceShift?.metrics || {};
    const shiftNextSteps = guidanceIsOpen
        ? [
            guidanceMetrics.active > 0
                ? (isRTL ? `أكمل أو حوّل المهام النشطة (${guidanceMetrics.active}) قبل الإغلاق.` : `Complete or transfer ${guidanceMetrics.active} active tasks before closing.`)
                : (isRTL ? 'تأكد من إنهاء المهام النشطة أو تحويلها.' : 'Confirm active tasks are completed or handed over.'),
            isRTL ? 'سوِّ وردية الخزينة ورصيد الدرج قبل إغلاق الاستقبال.' : 'Reconcile the cashier shift and drawer before closing reception.',
            isRTL ? 'سجّل ملاحظات التسليم ثم أغلق الوردية.' : 'Record handover notes, then close the shift.',
        ]
        : hasPendingCases
            ? [
                isRTL ? `راجع الحالات المعلقة وعددها ${pendingCount}.` : `Review the ${pendingCount} pending cases.`,
                isRTL ? 'رحّل الحالة أو أعد جدولتها إذا تعذر إجراء الفحص.' : 'Carry a case forward or reschedule it if the exam could not be performed.',
                isRTL ? 'سجّل عدم الحضور فقط لموعد بدأ ولم يصل صاحبه.' : 'Mark no-show only after the appointment time when the patient did not arrive.',
            ]
            : [isRTL ? 'لا توجد حالات معلقة؛ اكتملت مراجعة هذه الوردية.' : 'No pending cases remain; this shift review is complete.'];

    const actionLabels = {
        no_show: localeCopy.noShowShort,
        carry_forward: localeCopy.carryForwardShort,
        reschedule: localeCopy.rescheduleShort,
    };

    const EmbeddedToolbar = () => (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--VIARA-line)] bg-transparent px-0 py-2">
            <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300">
                    <MoonStar size={16} />
                </span>
                <div>
                    <p className="text-xs font-black text-[var(--VIARA-ink)]">{localeCopy.endOfDayReview}</p>
                    <p className="text-[10px] font-medium text-[var(--VIARA-muted)]">{formatDate(date, isRTL ? 'ar-EG' : 'en-US')}</p>
                </div>
            </div>
            <div className="flex items-center gap-1.5">
                <label className="relative">
                    <CalendarDays size={13} className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-teal-600" />
                    <input
                        type="date"
                        max={toDateInputValue()}
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                        className="h-8 min-w-[140px] rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] ps-2.5 pe-8 text-[11px] font-black text-[var(--VIARA-ink)] outline-none focus:border-teal-500"
                        aria-label={localeCopy.reviewDate}
                    />
                </label>
                <button
                    type="button"
                    onClick={loadData}
                    disabled={loading}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] transition hover:border-teal-500/35 hover:text-teal-700 disabled:opacity-50"
                    title={localeCopy.refresh}
                >
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                </button>
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 text-[11px] font-black text-[var(--VIARA-muted)] transition hover:border-teal-500/35 hover:text-[var(--VIARA-ink)]"
                    >
                        <ArrowLeft size={13} className="rtl:rotate-180" />
                        <span>{localeCopy.back}</span>
                    </button>
                )}
            </div>
        </div>
    );

    const MobileDatePicker = () => (
        <div className="sm:hidden">
            <label className="relative block">
                <CalendarDays size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-teal-600" />
                <input
                    type="date"
                    max={toDateInputValue()}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="h-10 w-full rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] ps-3 pe-9 text-xs font-black text-[var(--VIARA-ink)] outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                    aria-label={localeCopy.reviewDate}
                />
            </label>
        </div>
    );

    return (
        <div className={`relative space-y-5 pb-10${embedded ? ' px-1' : ' mx-auto max-w-[1360px] px-3 sm:px-5 lg:px-7'}`} dir={isRTL ? 'rtl' : 'ltr'}>

            {/* Standalone mode: full PageHeader */}
            {!embedded && (
            <PageHeader
                compact
                icon={MoonStar}
                eyebrow={localeCopy.shiftClose}
                eyebrowIcon={Sparkles}
                title={localeCopy.endOfDayReview}
                description={`${localeCopy.reviewDescription} · ${formatDate(date, isRTL ? 'ar-EG' : 'en-US')}`}
                actions={
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <label className="relative hidden sm:block">
                            <CalendarDays size={14} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-teal-600" />
                            <input
                                type="date"
                                max={toDateInputValue()}
                                value={date}
                                onChange={(event) => setDate(event.target.value)}
                                className="h-10 min-w-[150px] rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] ps-3 pe-9 text-xs font-black text-[var(--VIARA-ink)] outline-none transition hover:border-teal-500/35 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10"
                                aria-label={localeCopy.reviewDate}
                            />
                        </label>
                        <button
                            type="button"
                            onClick={loadData}
                            disabled={loading}
                            className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] transition hover:border-teal-500/35 hover:text-teal-700 disabled:opacity-50 dark:hover:text-teal-300"
                            title={localeCopy.refreshData}
                        >
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate('/reception')}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-xs font-black text-[var(--VIARA-muted)] transition hover:border-teal-500/35 hover:text-[var(--VIARA-ink)]"
                        >
                            <ArrowLeft size={15} className="rtl:rotate-180" />
                            <span className="hidden sm:inline">{localeCopy.returnToReception}</span>
                        </button>
                    </div>
                }
            />
            )} {/* end !embedded PageHeader */}

            {/* Embedded mode: compact inline toolbar */}
            {embedded && <EmbeddedToolbar />}

            {/* Mobile date picker for standalone mode */}
            {!embedded && <MobileDatePicker />}

            {fromShiftClose && (
                <div className="flex items-start gap-3 border-s-4 border-amber-500 bg-amber-50/60 px-3 py-2.5 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                        <AlertTriangle size={16} />
                    </span>
                    <div className="min-w-0">
                        <p className="text-xs font-black">{localeCopy.shiftClosedNotice}</p>
                        <p className="mt-0.5 text-[10.5px] font-medium leading-5 text-amber-800/90 dark:text-amber-200/100">
                            {localeCopy.shiftClosedInstructions}
                        </p>
                    </div>
                </div>
            )}

            <SurfaceCard className="px-3.5 py-3.5 sm:px-4 sm:py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${guidanceIsOpen ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : hasPendingCases ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
                            {guidanceIsOpen ? <Building2 size={17} /> : hasPendingCases ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}
                        </span>
                        <div>
                            <h2 className="text-sm font-black text-[var(--VIARA-ink)]">
                                {guidanceIsOpen
                                    ? (isRTL ? 'الوردية الحالية والإجراء التالي' : 'Current shift and next steps')
                                    : guidanceShift
                                        ? (isRTL ? 'مراجعة الوردية المحددة' : 'Selected shift review')
                                        : (isRTL ? 'خطوات إغلاق ومراجعة الوردية' : 'Shift close and review steps')}
                            </h2>
                            <p className="mt-0.5 text-[10.5px] font-semibold text-[var(--VIARA-muted)]">
                                {guidanceShift
                                    ? `${guidanceShift.desk_identifier || (isRTL ? 'مكتب الاستقبال' : 'Reception desk')} · ${formatDate(guidanceShift.started_at)}`
                                    : (isRTL ? 'اتبع الخطوات بحسب حالة الوردية والحالات المتبقية.' : 'Follow the steps for the shift status and remaining cases.')}
                            </p>
                        </div>
                    </div>
                    {guidanceShift && (
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${guidanceIsOpen ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'bg-slate-500/10 text-slate-600 dark:text-slate-300'}`}>
                            {guidanceIsOpen ? (isRTL ? 'مفتوحة' : 'Open') : (isRTL ? 'مغلقة' : 'Closed')}
                        </span>
                    )}
                </div>
                <ol className="mt-3 grid gap-2 border-t border-[var(--VIARA-line)] pt-3 sm:grid-cols-3">
                    {shiftNextSteps.map((step, index) => (
                        <li key={`${index}-${step}`} className="flex items-start gap-2 text-[10.5px] font-semibold leading-5 text-[var(--VIARA-ink)] sm:border-e sm:border-[var(--VIARA-line)] sm:px-3 first:sm:ps-0 last:sm:border-e-0">
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-teal-600/10 text-[9px] font-black text-teal-700 dark:text-teal-300">{index + 1}</span>
                            {step}
                        </li>
                    ))}
                </ol>
                {guidanceIsOpen && (
                    <p className="mt-2 text-[10px] font-bold text-[var(--VIARA-muted)]">
                        {isRTL ? `المهام النشطة الآن: ${guidanceMetrics.active ?? 0} · المستلمة: ${guidanceMetrics.claimed ?? 0} · المكتملة: ${guidanceMetrics.completed ?? 0}` : `Active tasks: ${guidanceMetrics.active ?? 0} · Claimed: ${guidanceMetrics.claimed ?? 0} · Completed: ${guidanceMetrics.completed ?? 0}`}
                    </p>
                )}
            </SurfaceCard>


            <div className="grid grid-cols-2 border-y border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] md:grid-cols-5">
                <StatCard icon={Activity} label={localeCopy.todayTotal} value={summary?.total ?? total} loading={summaryLoading} tone="slate" />
                <StatCard icon={CheckCircle2} label={localeCopy.completed} value={summary?.completed} loading={summaryLoading} tone="emerald" sub={summary ? `${completionRate}% ${localeCopy.completionRate}` : null} />
                <StatCard icon={AlertTriangle} label={localeCopy.pendingCases} value={pendingCount} loading={summaryLoading} tone={hasPendingCases ? 'amber' : 'emerald'} sub={summary?.urgent_pending > 0 ? `${summary.urgent_pending} ${localeCopy.urgentCases}` : localeCopy.needsDecision} />
                <StatCard icon={XCircle} label={localeCopy.cancelled} value={summary?.cancelled} loading={summaryLoading} tone="rose" />
                <StatCard icon={FileText} label={localeCopy.reporting} value={summary?.reporting} loading={summaryLoading} tone="sky" />
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-[var(--VIARA-line)]">
                <div className="flex min-w-0 flex-1 items-center gap-1">
                    <button
                        type="button"
                        onClick={() => setActiveTab('pending')}
                        className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 border-b-2 px-3 text-xs font-black transition sm:flex-none ${activeTab === 'pending' ? 'border-teal-600 text-teal-800 dark:text-teal-200' : 'border-transparent text-[var(--VIARA-muted)] hover:border-[var(--VIARA-line)] hover:text-[var(--VIARA-ink)]'}`}
                    >
                        <AlertCircle size={14} />
                        {localeCopy.pendingTab}
                        {pendingCount > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${activeTab === 'pending' ? 'bg-teal-600/10 text-teal-800 dark:text-teal-200' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>{pendingCount}</span>}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('review-log')}
                        className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 border-b-2 px-3 text-xs font-black transition sm:flex-none ${activeTab === 'review-log' ? 'border-teal-600 text-teal-800 dark:text-teal-200' : 'border-transparent text-[var(--VIARA-muted)] hover:border-[var(--VIARA-line)] hover:text-[var(--VIARA-ink)]'}`}
                    >
                        <History size={14} />
                        {localeCopy.reviewLogTab}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('shift-history')}
                        className={`inline-flex min-h-10 flex-1 items-center justify-center gap-2 border-b-2 px-3 text-xs font-black transition sm:flex-none ${activeTab === 'shift-history' ? 'border-teal-600 text-teal-800 dark:text-teal-200' : 'border-transparent text-[var(--VIARA-muted)] hover:border-[var(--VIARA-line)] hover:text-[var(--VIARA-ink)]'}`}
                    >
                        <CalendarDays size={14} />
                        {localeCopy.shiftHistoryTab}
                    </button>
                </div>

                <div className="hidden items-center gap-2 pe-2 md:flex">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--VIARA-surface-muted)]">
                        <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, completionRate))}%` }} />
                    </div>
                    <span className="text-[10px] font-black tabular-nums text-[var(--VIARA-muted)]">{completionRate}%</span>
                </div>
            </div>

            {activeTab === 'pending' && (
                <SurfaceCard>
                    <div className="flex flex-col gap-3 border-b border-[var(--VIARA-line)] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-sm font-black text-[var(--VIARA-ink)]">{localeCopy.pendingReviewTitle}</h2>
                                {filteredPending.length > 0 && (
                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9.5px] font-black text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
                                        {localeCopy.pendingCountCases(filteredPending.length)}
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 text-[10px] font-medium text-[var(--VIARA-muted)]">{localeCopy.pendingHelp}</p>
                        </div>

                        <div className="relative w-full sm:w-[310px]">
                            <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--VIARA-muted)]" />
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder={localeCopy.searchPlaceholder}
                                className="h-10 w-full rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/35 ps-9 pe-9 text-xs font-semibold text-[var(--VIARA-ink)] outline-none transition placeholder:text-[var(--VIARA-muted)] focus:border-teal-500 focus:bg-[var(--VIARA-surface)] focus:ring-4 focus:ring-teal-500/10"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute end-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-lg text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-surface-muted)] hover:text-[var(--VIARA-ink)]"
                                    aria-label={localeCopy.clearSearch}
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                    </div>

                    <BulkActionBar
                        selectedCount={selected.size}
                        onClear={() => setSelected(new Set())}
                        onBulkAction={(intent) => setBulkIntent(typeof intent === 'string' ? { action: intent, date: null, localeCopy } : { ...intent, localeCopy })}
                        loading={actionLoading}
                        localeCopy={localeCopy}
                    />

                    {filteredPending.length > 0 && !actionLoading && (
                        <button
                            type="button"
                            onClick={handleCarryForwardAll}
                            className="mx-3 mt-1 inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-[var(--VIARA-surface)] px-3 py-1.5 text-[10.5px] font-black text-amber-800 transition hover:bg-amber-50 dark:border-amber-900 dark:text-amber-200 dark:hover:bg-amber-950/40"
                            title={localeCopy.carryAllConfirm(filteredPending.length)}
                        >
                            <RotateCcw size={12} /> {localeCopy.carryAllTomorrow}
                        </button>
                    )}

                    {loadError ? (
                        <div role="alert" className="flex min-h-48 flex-col items-center justify-center gap-3 px-5 text-center">
                            <AlertTriangle size={24} className="text-rose-600 dark:text-rose-400" />
                            <p className="text-xs font-black text-rose-800 dark:text-rose-200">
                                {localeCopy.reviewDataLoadFailed}
                            </p>
                            <p className="max-w-lg text-[11px] font-medium text-[var(--VIARA-muted)]">{loadError}</p>
                            <button type="button" onClick={loadData} disabled={loading} className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
                                {localeCopy.actionRetry}
                            </button>
                        </div>
                    ) : loading ? (
                        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3">
                            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-300">
                                <Loader2 size={22} className="animate-spin" />
                            </span>
                            <p className="text-xs font-bold text-[var(--VIARA-muted)]">{localeCopy.loadingShiftCases}</p>
                        </div>
                    ) : filteredPending.length === 0 ? (
                        <EmptyState searchQuery={searchQuery} localeCopy={localeCopy} />
                    ) : (
                        <>
                            <div className="space-y-2.5 p-3 lg:hidden">
                                <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/35 px-3 text-[10.5px] font-black text-[var(--VIARA-muted)]">
                                    <input
                                        type="checkbox"
                                        checked={allVisibleSelected}
                                        onChange={toggleSelectAll}
                                        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                    />
                                    {localeCopy.selectVisible}
                                </label>
                                {filteredPending.map((exam) => (
                                    <PendingMobileCard
                                        key={exam.appointment_id}
                                        exam={exam}
                                        checked={selected.has(exam.appointment_id)}
                                        onToggle={() => toggleSelect(exam.appointment_id)}
                                        onAction={() => setActiveExam(exam)}
                                        localeCopy={localeCopy}
                                    />
                                ))}
                            </div>

                            <div className="hidden overflow-x-auto lg:block">
                                <table className="w-full min-w-[960px] border-collapse text-start">
                                    <thead>
                                        <tr className="border-b border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/45 text-[9.5px] font-black uppercase tracking-[0.05em] text-[var(--VIARA-muted)]">
                                            <th scope="col" className="w-12 px-4 py-3 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={allVisibleSelected}
                                                    onChange={toggleSelectAll}
                                                    className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                                    aria-label={localeCopy.selectVisible}
                                                />
                                            </th>
                                            <th scope="col" className="px-3 py-3 text-start">{localeCopy.patient}</th>
                                            <th scope="col" className="px-3 py-3 text-start">{localeCopy.exam}</th>
                                            <th scope="col" className="px-3 py-3 text-start">{localeCopy.appointmentStatus}</th>
                                            <th scope="col" className="px-3 py-3 text-start">{localeCopy.priority}</th>
                                            <th scope="col" className="px-3 py-3 text-start">{localeCopy.receptionist}</th>
                                            <th scope="col" className="px-3 py-3 text-start">{localeCopy.referringDoctor}</th>
                                            <th scope="col" className="w-36 px-3 py-3 text-center">{localeCopy.action}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--VIARA-line)]">
                                        {filteredPending.map((exam) => {
                                            const checked = selected.has(exam.appointment_id);
                                            return (
                                                <tr
                                                    key={exam.appointment_id}
                                                    className={`group transition-colors ${checked ? 'bg-teal-50/50 dark:bg-teal-950/15' : ['Urgent', 'Emergency'].includes(exam.priority) ? 'bg-rose-50/20 hover:bg-rose-50/45 dark:bg-rose-950/10 dark:hover:bg-rose-950/20' : 'hover:bg-[var(--VIARA-surface-muted)]/35'}`}
                                                >
                                                    <td className="px-4 py-3 text-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => toggleSelect(exam.appointment_id)}
                                                            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                                            aria-label={localeCopy.selectPatient(exam.patient_name)}
                                                        />
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div className="flex min-w-[190px] items-center gap-2.5">
                                                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-500/10 text-[10px] font-black text-teal-700 dark:text-teal-300">
                                                                {initials(exam.patient_name)}
                                                            </span>
                                                            <div className="min-w-0">
                                                                <p className="max-w-[220px] truncate text-[11.5px] font-black text-[var(--VIARA-ink)]">{exam.patient_name || '—'}</p>
                                                                {exam.order_number && <p className="mt-0.5 font-mono text-[9px] font-bold text-[var(--VIARA-muted)]">#{exam.order_number}</p>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <p className="max-w-[240px] truncate text-[11px] font-black text-[var(--VIARA-ink)]">{exam.exam_type || '—'}</p>
                                                        {exam.modality_type && <p className="mt-0.5 text-[9.5px] font-semibold text-[var(--VIARA-muted)]">{exam.modality_type}</p>}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div className="flex min-w-[150px] flex-col items-start gap-1.5">
                                                            <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-black text-[var(--VIARA-ink)]"><Clock3 size={11} className="text-teal-600" /> {formatTime(exam.appointment_time, localeCopy.language === 'en' ? 'en-US' : 'ar-EG')}</span>
                                                            <StageBadge stage={exam.queue_stage} localeCopy={localeCopy} />
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3"><PriorityBadge priority={exam.priority} localeCopy={localeCopy} /></td>
                                                    <td className="px-3 py-3">
                                                        <span className="block max-w-[190px] truncate text-[10.5px] font-black text-[var(--VIARA-ink)]">{exam.receptionist_name || localeCopy.unassigned}</span>
                                                        {exam.receptionist_desk && <span className="mt-0.5 block text-[9px] font-semibold text-[var(--VIARA-muted)]">{exam.receptionist_desk}</span>}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <span className="block max-w-[190px] truncate text-[10.5px] font-semibold text-[var(--VIARA-muted)]">{exam.referring_doctor_name || '—'}</span>
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => setActiveExam(exam)}
                                                            disabled={actionLoading}
                                                            className="inline-flex min-h-8.5 items-center justify-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/70 px-3 text-[10.5px] font-black text-teal-800 transition hover:border-teal-300 hover:bg-teal-100 disabled:opacity-50 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-950/45"
                                                        >
                                                            {localeCopy.review}
                                                            <ChevronLeft size={12} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </SurfaceCard>
            )}

            {activeTab === 'shift-history' && (
                <SurfaceCard>
                    <div className="flex flex-col gap-3 border-b border-[var(--VIARA-line)] px-3.5 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-4">
                        <div>
                            <h2 className="text-sm font-black text-[var(--VIARA-ink)]">{isRTL ? 'سجل وردياتك' : 'Your shift history'}</h2>
                            <p className="mt-0.5 text-[10px] font-medium text-[var(--VIARA-muted)]">
                                {isRTL ? 'يعرض الشهر الحالي تلقائيًا. اختر فترة أخرى لمراجعة وردياتك وإجراءات كل وردية.' : 'This month is shown by default. Choose another period to review shifts and their actions.'}
                            </p>
                            <p className="mt-1 text-[9px] font-medium text-amber-700 dark:text-amber-300">
                                {isRTL ? 'قد لا تظهر تفاصيل إجراءات المراجعة لبعض الورديات القديمة إذا لم تكن مرتبطة برقم الوردية في سجلها.' : 'Some older review actions may not be attributed to a shift if their audit record predates session tracking.'}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                            <label className="grid gap-1 text-[9px] font-bold text-[var(--VIARA-muted)]">
                                {isRTL ? 'من' : 'From'}
                                <input type="date" value={historyFromDate} max={historyToDate || undefined} onChange={(event) => setHistoryFromDate(event.target.value)} className="h-9 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2 text-[10px] font-bold text-[var(--VIARA-ink)]" />
                            </label>
                            <label className="grid gap-1 text-[9px] font-bold text-[var(--VIARA-muted)]">
                                {isRTL ? 'إلى' : 'To'}
                                <input type="date" value={historyToDate} min={historyFromDate || undefined} max={toDateInputValue()} onChange={(event) => setHistoryToDate(event.target.value)} className="h-9 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2 text-[10px] font-bold text-[var(--VIARA-ink)]" />
                            </label>
                            <button type="button" onClick={loadShiftHistory} disabled={shiftHistoryLoading} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-700 px-3 text-[10px] font-black text-white transition hover:bg-teal-600 disabled:opacity-50">
                                {shiftHistoryLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                                {isRTL ? 'تطبيق الفترة' : 'Apply range'}
                            </button>
                        </div>
                    </div>
                    {shiftHistoryLoading ? (
                        <div className="flex min-h-48 items-center justify-center gap-2 text-xs font-bold text-[var(--VIARA-muted)]"><Loader2 size={18} className="animate-spin text-teal-600" />{isRTL ? 'جارٍ تحميل الورديات...' : 'Loading shifts...'}</div>
                    ) : shiftHistory.length === 0 ? (
                        <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-5 text-center">
                            <CalendarDays size={23} className="text-[var(--VIARA-muted)]" />
                            <p className="text-xs font-black text-[var(--VIARA-ink)]">{isRTL ? 'لا توجد ورديات في هذه الفترة' : 'No shifts in this period'}</p>
                        </div>
                    ) : (
                        <div className="grid gap-2.5 p-3 sm:grid-cols-2 xl:grid-cols-3">
                            {shiftHistory.map((shift) => {
                                const metrics = shift.session_id === currentShift?.session_id
                                    ? (currentShift.live_metrics || currentShift.metrics || {})
                                    : (shift.metrics || {});
                                const shiftOpen = shift.status === 'Open';
                                return (
                                    <article key={shift.session_id} className="rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-black text-[var(--VIARA-ink)]">{shift.desk_identifier || (isRTL ? 'مكتب الاستقبال' : 'Reception desk')}</p>
                                                <p className="mt-0.5 text-[9.5px] font-semibold text-[var(--VIARA-muted)]">{new Date(shift.started_at).toLocaleString(isRTL ? 'ar-EG' : 'en-US')}</p>
                                                <p className="text-[9px] font-medium text-[var(--VIARA-muted)]">
                                                    {shift.ended_at
                                                        ? `${isRTL ? 'انتهت' : 'Ended'} · ${new Date(shift.ended_at).toLocaleTimeString(isRTL ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}`
                                                        : (isRTL ? 'الوردية مستمرة' : 'Shift in progress')}
                                                </p>
                                            </div>
                                            <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${shiftOpen ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'bg-slate-500/10 text-slate-600 dark:text-slate-300'}`}>
                                                {shiftOpen ? (isRTL ? 'جارية' : 'Open') : (isRTL ? 'مغلقة' : 'Closed')}
                                            </span>
                                        </div>
                                        <div className="mt-3 grid grid-cols-3 gap-1.5">
                                            <div className="rounded-lg bg-[var(--VIARA-surface-muted)] p-2"><p className="text-[8px] font-bold text-[var(--VIARA-muted)]">{isRTL ? 'استلام' : 'Claimed'}</p><p className="mt-0.5 text-xs font-black text-[var(--VIARA-ink)]">{metrics.claimed ?? 0}</p></div>
                                            <div className="rounded-lg bg-[var(--VIARA-surface-muted)] p-2"><p className="text-[8px] font-bold text-[var(--VIARA-muted)]">{isRTL ? 'إنجاز' : 'Completed'}</p><p className="mt-0.5 text-xs font-black text-emerald-700">{metrics.completed ?? 0}</p></div>
                                            <div className="rounded-lg bg-[var(--VIARA-surface-muted)] p-2"><p className="text-[8px] font-bold text-[var(--VIARA-muted)]">{isRTL ? 'تحويل' : 'Transferred'}</p><p className="mt-0.5 text-xs font-black text-[var(--VIARA-ink)]">{metrics.transferred ?? 0}</p></div>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] font-semibold text-[var(--VIARA-muted)]">
                                            <span>{isRTL ? 'إجراءات المراجعة' : 'Review actions'}: <b className="text-[var(--VIARA-ink)]">{shift.actions_reviewed ?? 0}</b></span>
                                            <span>{isRTL ? 'ترحيل' : 'Carried'}: <b className="text-[var(--VIARA-ink)]">{shift.carried_forward ?? 0}</b></span>
                                            <span>{isRTL ? 'إعادة جدولة' : 'Rescheduled'}: <b className="text-[var(--VIARA-ink)]">{shift.rescheduled ?? 0}</b></span>
                                            <span>{isRTL ? 'عدم حضور' : 'No-show'}: <b className="text-[var(--VIARA-ink)]">{shift.marked_no_show ?? 0}</b></span>
                                        </div>
                                        <div className="mt-3 flex items-center justify-between border-t border-[var(--VIARA-line)] pt-2">
                                            <span className="text-[9px] font-semibold text-[var(--VIARA-muted)]">
                                                {isRTL ? 'التحصيل المسجل' : 'Collected'}: {Number(metrics.collectedAmount || 0).toLocaleString(isRTL ? 'ar-EG' : 'en-US')} EGP
                                            </span>
                                            <button type="button" onClick={() => { setSelectedSessionId(shift.session_id); setDate(new Date(shift.started_at).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })); setActiveTab('pending'); }} className="text-[9px] font-black text-teal-700 hover:text-teal-600 dark:text-teal-300">
                                                {isRTL ? 'مراجعة الحالات' : 'Review cases'}
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </SurfaceCard>
            )}

            {activeTab === 'review-log' && (
                <SurfaceCard>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--VIARA-line)] px-4 py-3">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="grid h-8 w-8 place-items-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300"><History size={15} /></span>
                                <div>
                                            <h2 className="text-sm font-black text-[var(--VIARA-ink)]">{localeCopy.reviewLogTitle}</h2>
                                            <p className="text-[9.5px] font-medium text-[var(--VIARA-muted)]">{localeCopy.reviewLogSubtitle}</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => exportReviewLog()}
                                disabled={reviewLogLoading || reviewLog.length === 0}
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 text-[10.5px] font-black text-[var(--VIARA-muted)] transition hover:border-teal-500/35 hover:text-teal-700 disabled:opacity-50"
                                title={localeCopy.exportLogTitle}
                            >
                                <Download size={13} />
                                <span className="hidden sm:inline">{localeCopy.exportLog}</span>
                            </button>
                            <span className="rounded-full border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-2.5 py-1 text-[10px] font-black text-[var(--VIARA-muted)]">{localeCopy.actionCount(reviewLogTotal)}</span>
                        </div>
                    </div>

                    {reviewLogLoading ? (
                        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3">
                            <Loader2 size={22} className="animate-spin text-teal-600" />
                            <p className="text-xs font-bold text-[var(--VIARA-muted)]">{localeCopy.loadingReviewLog}</p>
                        </div>
                    ) : reviewLog.length === 0 ? (
                        <div className="flex min-h-[280px] flex-col items-center justify-center px-6 text-center">
                            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-500/10 text-slate-500"><History size={21} /></span>
                            <h3 className="mt-3 text-sm font-black text-[var(--VIARA-ink)]">{localeCopy.noReviewActions}</h3>
                            <p className="mt-1 text-xs font-medium text-[var(--VIARA-muted)]">{localeCopy.noReviewActionsDescription}</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[900px] border-collapse">
                                <thead>
                                    <tr className="border-b border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/45 text-[9.5px] font-black text-[var(--VIARA-muted)]">
                                        <th scope="col" className="px-4 py-3 text-start">{localeCopy.tableTime}</th>
                                        <th scope="col" className="px-3 py-3 text-start">{localeCopy.user}</th>
                                        <th scope="col" className="px-3 py-3 text-start">{localeCopy.action}</th>
                                        <th scope="col" className="px-3 py-3 text-start">{localeCopy.previousStatus}</th>
                                        <th scope="col" className="px-3 py-3 text-start">{localeCopy.notesColumn}</th>
                                        {isAdmin && <th scope="col" className="px-3 py-3 text-center">{localeCopy.risk}</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--VIARA-line)]">
                                    {reviewLog.map((entry) => {
                                        const details = entry.details || {};
                                        const role = entry.user_role || entry.actor_role || '—';
                                        const risk = Number(entry.risk_score || 0);
                                        return (
                                            <tr key={entry.log_id} className="transition hover:bg-[var(--VIARA-surface-muted)]/30">
                                                <td className="px-4 py-3">
                                                    <p className="font-mono text-[10.5px] font-black text-[var(--VIARA-ink)]">{formatTime(entry.timestamp, isRTL ? 'ar-EG' : 'en-US')}</p>
                                                    <p className="mt-0.5 text-[9px] font-semibold text-[var(--VIARA-muted)]">{new Date(entry.timestamp).toLocaleDateString(isRTL ? 'ar-EG' : 'en-US')}</p>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <p className="text-[10.5px] font-black text-[var(--VIARA-ink)]">{entry.user_name || entry.actor_name || '—'}</p>
                                                    <span className="mt-1 inline-flex rounded-md bg-[var(--VIARA-surface-muted)] px-1.5 py-0.5 text-[8.5px] font-black text-[var(--VIARA-muted)]">{role}</span>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <span className="inline-flex rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-[9.5px] font-black text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300">{actionLabels[details.action] || details.action || '—'}</span>
                                                </td>
                                                <td className="px-3 py-3 text-[10.5px] font-semibold text-[var(--VIARA-muted)]">{getStageLabel(details.previousStage, localeCopy)}</td>
                                                <td className="max-w-[280px] px-3 py-3 text-[10.5px] font-medium leading-5 text-[var(--VIARA-muted)]">{details.notes || '—'}</td>
                                                {isAdmin && <td className="px-3 py-3 text-center">
                                                    <span className={`inline-flex min-w-14 justify-center rounded-lg border px-2 py-1 font-mono text-[9.5px] font-black ${risk >= 40 ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300' : risk >= 20 ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300'}`}>{risk}/100</span>
                                                </td>}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {reviewLogTotal > 50 && (
                        <div className="flex items-center justify-between gap-3 border-t border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/20 px-4 py-3">
                            <button
                                type="button"
                                onClick={() => loadReviewLog(reviewLogPage - 1)}
                                disabled={reviewLogPage === 0 || reviewLogLoading}
                                className="inline-flex min-h-8.5 items-center gap-1 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-[10.5px] font-black text-[var(--VIARA-muted)] transition hover:text-[var(--VIARA-ink)] disabled:opacity-40"
                            >
                                <ChevronRight size={12} /> {localeCopy.previous}
                            </button>
                            <span className="text-[10px] font-black text-[var(--VIARA-muted)]">{localeCopy.pageOf(reviewLogPage + 1, Math.ceil(reviewLogTotal / 50))}</span>
                            <button
                                type="button"
                                onClick={() => loadReviewLog(reviewLogPage + 1)}
                                disabled={(reviewLogPage + 1) * 50 >= reviewLogTotal || reviewLogLoading}
                                className="inline-flex min-h-8.5 items-center gap-1 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-[10.5px] font-black text-[var(--VIARA-muted)] transition hover:text-[var(--VIARA-ink)] disabled:opacity-40"
                            >
                                {localeCopy.next} <ChevronLeft size={12} />
                            </button>
                        </div>
                    )}
                </SurfaceCard>
            )}

            {activeExam && (
                <ActionModal
                    exam={activeExam}
                    loading={actionLoading}
                    onClose={() => setActiveExam(null)}
                    onConfirm={handleResolve}
                    localeCopy={localeCopy}
                />
            )}

            <BulkConfirmModal
                intent={{ ...bulkIntent, localeCopy }}
                count={selected.size}
                loading={actionLoading}
                onCancel={() => !actionLoading && setBulkIntent(null)}
                onConfirm={executeBulkAction}
            />

            <ConfirmDialog
                isOpen={showCarryAllConfirm}
                title={localeCopy.carryAllTomorrow}
                message={localeCopy.carryAllConfirm(filteredPending.length)}
                confirmText={localeCopy.actionConfirm}
                cancelText={localeCopy.actionCancel}
                variant="warning"
                onConfirm={confirmCarryForwardAll}
                onCancel={() => setShowCarryAllConfirm(false)}
            />
        </div>
    );
}
