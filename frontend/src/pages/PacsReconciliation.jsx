import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import useDebounce from '../hooks/useDebounce';
import toast from 'react-hot-toast';
import {
    Activity,
    AlertCircle,
    AlertOctagon,
    AlertTriangle,
    ArrowDownUp,
    BadgeCheck,
    CalendarClock,
    CalendarDays,
    Check,
    CheckCircle2,
    CheckSquare,
    ClipboardCheck,
    Clock,
    Copy,
    Database,
    Eye,
    FileSearch,
    Filter,
    FilterX,
    Layers,
    Link2,
    Loader2,
    Network,
    Radio,
    RefreshCw,
    Rows3,
    Search,
    ShieldAlert,
    ShieldCheck,
    SlidersHorizontal,
    TableProperties,
    Trash2,
    User,
    UserRound,
    X,
    Zap
} from 'lucide-react';
import {
    useDiscardQuarantineStudyMutation,
    useGetPacsQuarantineQuery,
    useLazySearchScheduledExamsQuery,
    useReconcileQuarantineStudyMutation
} from '../store/api';
import PageHeader from '../components/ui/PageHeader';
import Pagination from '../components/ui/Pagination';
import { getPaginationState } from '../utils/pagination';

const missing = '—';
const all = 'all';

const ar = {
    eyebrow: 'إدارة وتكامل خادم الصور الإشعاعية (PACS & Orthanc)',
    title: 'مطابقة وفض اشتباك دراسات PACS',
    description: 'معالجة دراسات DICOM المعلقة في الحجر الصحي، ربط الصور الواردة بالمواعيد والفحوصات المجدولة، أو استبعاد الدراسات المكررة وغير الصالحة.',
    pending: 'الدراسات المعلقة',
    visible: 'المعروضة بعد التصفية',
    critical: 'اختلافات عالية الخطورة',
    noAccession: 'بدون رقم وصول (Accession)',
    readyIdentity: 'بيانات مكتملة للربط',
    oldest: 'أقدم دراسة واردة',
    searchPlaceholder: 'بحث باسم المريض، الرقم الطبي MRN، رقم الوصول Acc، أو معرف الدراسة UID...',
    allReasons: 'جميع أسباب الحجر',
    allModalities: 'جميع الأجهزة',
    reason: 'سبب الحجر',
    modality: 'نوع الفحص',
    sort: 'الترتيب',
    compact: 'عرض مضغوط',
    clear: 'مسح التصفية',
    triageAll: 'الكل',
    triageCritical: 'حالات حرجة',
    triageNoAccession: 'بدون Accession',
    triageReady: 'جاهزة للربط فوراً',
    link: 'مطابقة الفحص',
    discard: 'استبعاد',
    patient: 'المريض',
    study: 'بيانات الدراسة الإشعاعية',
    integrity: 'اكتمال الهوية',
    received: 'تاريخ الاستلام',
    actions: 'الإجراءات',
    triageTitle: 'تحليل أسباب الحجر',
    modalityTitle: 'توزيع أنواع الفحوصات',
    protocolTitle: 'بروتوكول المعالجة الموصى به',
    reasons: {
        ACCESSION_NUMBER_NOT_FOUND: 'رقم الوصول غير موجود في النظام',
        ACCESSION_NUMBER_MISSING: 'رقم الوصول مفقود من ملف DICOM',
        STUDY_INSTANCE_UID_MISSING: 'معرف الدراسة الإشعاعية UID مفقود',
        PATIENT_ID_MISMATCH: 'عدم تطابق رقم المريض MRN',
        STUDY_INSTANCE_UID_MISMATCH: 'عدم تطابق معرف دراسة DICOM',
        UNKNOWN: 'مراجعة بيانات الفحص'
    },
    risk: {
        critical: 'مراجعة حرجة (عالي الخطورة)',
        review: 'تحتاج مراجعة',
        routine: 'إجراء عادي'
    },
    copied: 'تم النسخ إلى الحافظة',
    linkTitle: 'مطابقة وربط دراسة DICOM بفحص مجدول',
    inboundDetails: 'بيانات ملف الـ DICOM الوارد',
    searchOrderPlaceholder: 'ابحث برقم الطلب، الرقم الطبي MRN، أو اسم المريض...',
    searchOrder: 'بحث في سجل الفحوصات المجدولة',
    confirmLink: 'تأكيد الربط واعتماد الدراسة',
    discardTitle: 'هل أنت متأكد من استبعاد هذه الدراسة؟',
    discardWarning: 'سيتم وسم هذه الدراسة كمستبعدة ولن تظهر مرة أخرى في قائمة الانتظار الحالية.',
    confirmDiscard: 'تأكيد الاستبعاد'
};

const tr = (t, key, defaultEn, defaultAr, isAr) => t(key, { defaultValue: isAr ? defaultAr : defaultEn });

const reasonSeverity = {
    ACCESSION_NUMBER_NOT_FOUND: 2,
    ACCESSION_NUMBER_MISSING: 2,
    STUDY_INSTANCE_UID_MISSING: 3,
    PATIENT_ID_MISMATCH: 3,
    STUDY_INSTANCE_UID_MISMATCH: 3,
    UNKNOWN: 1
};

const PacsReconciliation = () => {
    const { t, i18n } = useTranslation(['pacs', 'common']);
    const isAr = i18n.language?.startsWith('ar');
    const isRtl = i18n.dir() === 'rtl';
    const locale = isAr ? 'ar-EG' : 'en-US';

    const { data: quarantine = [], error: loadError, isLoading, isError, refetch, isFetching } = useGetPacsQuarantineQuery('Pending', {
        pollingInterval: 20000,
        refetchOnFocus: true
    });
    const [reconcile, { isLoading: isReconciling }] = useReconcileQuarantineStudyMutation();
    const [discard, { isLoading: isDiscarding }] = useDiscardQuarantineStudyMutation();

    const [activeStudy, setActiveStudy] = useState(null);
    const [discardTarget, setDiscardTarget] = useState(null);
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebounce(query, 180);

    const [triageTab, setTriageTab] = useState('all');
    const [reasonFilter, setReasonFilter] = useState(all);
    const [modalityFilter, setModalityFilter] = useState(all);
    const [sortMode, setSortMode] = useState('priority');
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkDiscardTarget, setBulkDiscardTarget] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(5);

    const busy = isReconciling || isDiscarding;

    const enrichedStudies = useMemo(() => quarantine.map((study) => {
        const reason = study.quarantine_reason || 'UNKNOWN';
        const severity = reasonSeverity[reason] || 1;
        const receivedAt = study.created_at ? new Date(study.created_at).getTime() : 0;
        return {
            ...study,
            __reason: reason,
            __severity: severity,
            __receivedAt: Number.isNaN(receivedAt) ? 0 : receivedAt,
            __identityScore: identityCompleteness(study)
        };
    }), [quarantine]);

    const reasonCounts = useMemo(() => countBy(enrichedStudies, (study) => study.__reason), [enrichedStudies]);
    const modalityOptions = useMemo(() => uniqueValues(enrichedStudies.map((study) => study.modality || missing)), [enrichedStudies]);
    const reasonOptions = useMemo(
        () => Object.keys(reasonCounts).sort((a, b) => (reasonSeverity[b] || 0) - (reasonSeverity[a] || 0) || a.localeCompare(b)),
        [reasonCounts]
    );
    const modalityCounts = useMemo(() => countBy(enrichedStudies, (study) => study.modality || missing), [enrichedStudies]);

    const visibleStudies = useMemo(() => {
        const q = debouncedQuery.trim().toLowerCase();
        const filtered = enrichedStudies.filter((study) => {
            const reason = study.__reason;
            const modality = study.modality || missing;
            const matchesReason = reasonFilter === all || reason === reasonFilter;
            const matchesModality = modalityFilter === all || modality === modalityFilter;
            const matchesQuery = !q || [
                study.raw_patient_name,
                study.raw_patient_id,
                study.raw_accession_number,
                study.study_instance_uid,
                study.modality,
                study.quarantine_reason,
                study.orthanc_study_id
            ].filter(Boolean).join(' ').toLowerCase().includes(q);

            const matchesTriage = triageTab === 'all'
                ? true
                : triageTab === 'critical'
                    ? study.__severity >= 3
                    : triageTab === 'no_accession'
                        ? (reason === 'ACCESSION_NUMBER_MISSING' || reason === 'ACCESSION_NUMBER_NOT_FOUND')
                        : triageTab === 'ready'
                            ? study.__identityScore >= 3
                            : true;

            return matchesReason && matchesModality && matchesQuery && matchesTriage;
        });

        return [...filtered].sort((a, b) => {
            if (sortMode === 'oldest') return (a.__receivedAt || 0) - (b.__receivedAt || 0);
            if (sortMode === 'newest') return (b.__receivedAt || 0) - (a.__receivedAt || 0);
            return (b.__severity - a.__severity) || ((a.__receivedAt || 0) - (b.__receivedAt || 0));
        });
    }, [enrichedStudies, debouncedQuery, reasonFilter, modalityFilter, sortMode, triageTab]);

    const baseStats = useMemo(() => {
        const oldestStudy = enrichedStudies.reduce((oldest, study) => {
            if (!study.created_at) return oldest;
            if (!oldest || new Date(study.created_at) < new Date(oldest.created_at)) return study;
            return oldest;
        }, null);
        return {
            total: enrichedStudies.length,
            critical: enrichedStudies.filter((s) => s.__severity >= 3).length,
            noAccession: (reasonCounts.ACCESSION_NUMBER_MISSING || 0) + (reasonCounts.ACCESSION_NUMBER_NOT_FOUND || 0),
            readyIdentity: enrichedStudies.filter((s) => s.__identityScore >= 3).length,
            oldest: oldestStudy?.created_at ? formatDate(oldestStudy.created_at, locale) : missing
        };
    }, [enrichedStudies, reasonCounts, locale]);

    const stats = useMemo(() => ({
        ...baseStats,
        visible: visibleStudies.length
    }), [baseStats, visibleStudies.length]);

    useEffect(() => { setCurrentPage(1); }, [debouncedQuery, reasonFilter, modalityFilter, sortMode, triageTab, pageSize]);

    const { pageCount, startIndex, endIndex } = useMemo(
        () => getPaginationState(visibleStudies.length, currentPage, pageSize),
        [visibleStudies.length, currentPage, pageSize]
    );
    const pagedStudies = useMemo(
        () => visibleStudies.slice(startIndex, endIndex),
        [visibleStudies, startIndex, endIndex]
    );

    const copyValue = useCallback(async (val) => {
        if (!val) return;
        try {
            await navigator.clipboard.writeText(val);
            toast.success(isAr ? ar.copied : 'Copied to clipboard');
        } catch {
            toast.error('Copy failed');
        }
    }, [isAr]);

    const handleReconcile = useCallback(async (examId) => {
        if (!activeStudy) return;
        try {
            await reconcile({ id: activeStudy.quarantine_id, examId }).unwrap();
            toast.success(isAr ? 'تم ربط الدراسة بالفحص الإشعاعي بنجاح' : 'Study successfully linked to examination');
            setActiveStudy(null);
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || 'Reconciliation failed.');
        }
    }, [activeStudy, reconcile, isAr, refetch]);

    const confirmDiscard = useCallback(async () => {
        if (!discardTarget) return;
        try {
            await discard(discardTarget.quarantine_id).unwrap();
            toast.success(isAr ? 'تم استبعاد الدراسة بنجاح' : 'Study discarded.');
            setDiscardTarget(null);
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || 'Action failed.');
        }
    }, [discard, discardTarget, isAr, refetch]);

    return (
        <div className="space-y-4 pb-12" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Header */}
            <PageHeader
                icon={Radio}
                eyebrow={tr(t, 'pacs.recon.commandCenter', 'PACS & DICOM Router Integration', ar.eyebrow, isAr)}
                title={tr(t, 'pacs.recon.title', 'PACS Study Reconciliation Deck', ar.title, isAr)}
                description={tr(t, 'pacs.recon.subtitle', 'Resolve quarantined and unmatched DICOM imaging series by linking them to scheduled RIS orders or discarding invalid studies.', ar.description, isAr)}
                meta={
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-700 dark:text-emerald-300">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                        {isAr ? 'خادم DICOM متصل ونشط' : 'Live PACS Router Connected'}
                    </span>
                }
                actions={
                    <button
                        type="button"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-4 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                        <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                        <span>{tr(t, 'actions.refresh', 'Refresh Queue', 'تحديث القائمة', isAr)}</span>
                    </button>
                }
            />

            {/* Top 6-Tile Telemetry Metric HUD */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {/* 1. Pending */}
                <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                    <div className="flex items-center justify-between">
                        <span className="grid h-8 w-8 place-items-center rounded-xl border border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300">
                            <Database size={16} />
                        </span>
                        <span className="font-mono text-[9px] font-black uppercase text-teal-600 dark:text-teal-400">TOTAL</span>
                    </div>
                    <p className="mt-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{ar.pending}</p>
                    <p className="mt-0.5 text-xl font-black tabular-nums text-slate-900 dark:text-white sm:text-2xl">{stats.total}</p>
                </div>

                {/* 2. Filtered Visible */}
                <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                    <div className="flex items-center justify-between">
                        <span className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            <FileSearch size={16} />
                        </span>
                        <span className="font-mono text-[9px] font-black uppercase text-slate-500">FILTER</span>
                    </div>
                    <p className="mt-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{ar.visible}</p>
                    <p className="mt-0.5 text-xl font-black tabular-nums text-slate-900 dark:text-white sm:text-2xl">{stats.visible}</p>
                </div>

                {/* 3. Critical */}
                <div
                    onClick={() => { setTriageTab(triageTab === 'critical' ? 'all' : 'critical'); setReasonFilter(all); }}
                    className={`cursor-pointer rounded-2xl border p-3.5 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md ${
                        triageTab === 'critical'
                            ? 'border-rose-500 bg-rose-50/90 ring-2 ring-rose-500/20 dark:bg-rose-950/40'
                            : 'border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="grid h-8 w-8 place-items-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300">
                            <AlertTriangle size={16} />
                        </span>
                        <span className="font-mono text-[9px] font-black uppercase text-rose-600 dark:text-rose-400">STAT</span>
                    </div>
                    <p className="mt-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{ar.critical}</p>
                    <p className="mt-0.5 text-xl font-black tabular-nums text-slate-900 dark:text-white sm:text-2xl">{stats.critical}</p>
                </div>

                {/* 4. Missing Accession */}
                <div
                    onClick={() => { setTriageTab(triageTab === 'no_accession' ? 'all' : 'no_accession'); setReasonFilter(all); }}
                    className={`cursor-pointer rounded-2xl border p-3.5 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md ${
                        triageTab === 'no_accession'
                            ? 'border-amber-500 bg-amber-50/90 ring-2 ring-amber-500/20 dark:bg-amber-950/40'
                            : 'border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="grid h-8 w-8 place-items-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                            <ClipboardCheck size={16} />
                        </span>
                        <span className="font-mono text-[9px] font-black uppercase text-amber-600 dark:text-amber-400">NO ACC</span>
                    </div>
                    <p className="mt-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{ar.noAccession}</p>
                    <p className="mt-0.5 text-xl font-black tabular-nums text-slate-900 dark:text-white sm:text-2xl">{stats.noAccession}</p>
                </div>

                {/* 5. Ready Identity */}
                <div
                    onClick={() => { setTriageTab(triageTab === 'ready' ? 'all' : 'ready'); setReasonFilter(all); }}
                    className={`cursor-pointer rounded-2xl border p-3.5 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md ${
                        triageTab === 'ready'
                            ? 'border-emerald-500 bg-emerald-50/90 ring-2 ring-emerald-500/20 dark:bg-emerald-950/40'
                            : 'border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="grid h-8 w-8 place-items-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                            <BadgeCheck size={16} />
                        </span>
                        <span className="font-mono text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400">READY</span>
                    </div>
                    <p className="mt-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{ar.readyIdentity}</p>
                    <p className="mt-0.5 text-xl font-black tabular-nums text-slate-900 dark:text-white sm:text-2xl">{stats.readyIdentity}</p>
                </div>

                {/* 6. Oldest Received */}
                <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                    <div className="flex items-center justify-between">
                        <span className="grid h-8 w-8 place-items-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                            <CalendarClock size={16} />
                        </span>
                        <span className="font-mono text-[9px] font-black uppercase text-sky-600 dark:text-sky-400">OLDEST</span>
                    </div>
                    <p className="mt-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{ar.oldest}</p>
                    <p className="mt-0.5 truncate font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{stats.oldest}</p>
                </div>
            </section>

            {/* Main Workbench: Search, Filters & Triage Chips */}
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_200px_180px_160px_auto]">
                    {/* Search Field */}
                    <div className="relative">
                        <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={ar.searchPlaceholder}
                            className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/70 ps-10 pe-4 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-slate-950/40 dark:text-white"
                        />
                        {query && (
                            <button type="button" onClick={() => setQuery('')} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Reason Filter */}
                    <select
                        value={reasonFilter}
                        onChange={(e) => setReasonFilter(e.target.value)}
                        className="h-10 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-white"
                    >
                        <option value="all">{ar.allReasons}</option>
                        {reasonOptions.map((r) => (
                            <option key={r} value={r}>{ar.reasons[r] || r}</option>
                        ))}
                    </select>

                    {/* Modality Filter */}
                    <select
                        value={modalityFilter}
                        onChange={(e) => setModalityFilter(e.target.value)}
                        className="h-10 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-white"
                    >
                        <option value="all">{ar.allModalities}</option>
                        {modalityOptions.map((m) => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>

                    {/* Sort Selector */}
                    <select
                        value={sortMode}
                        onChange={(e) => setSortMode(e.target.value)}
                        className="h-10 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-white"
                    >
                        <option value="priority">{isAr ? 'الأولوية أولاً' : 'Highest Risk First'}</option>
                        <option value="newest">{isAr ? 'الأحدث استلاماً' : 'Newest Received'}</option>
                        <option value="oldest">{isAr ? 'الأقدم استلاماً' : 'Oldest Received'}</option>
                    </select>

                    {/* Clear Button */}
                    {(query || reasonFilter !== all || modalityFilter !== all || triageTab !== 'all') && (
                        <button
                            type="button"
                            onClick={() => { setQuery(''); setReasonFilter(all); setModalityFilter(all); setTriageTab('all'); }}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                            <FilterX size={14} />
                            <span>{ar.clear}</span>
                        </button>
                    )}
                </div>

                {/* Triage Pills Bar */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {[
                        { id: 'all', label: ar.triageAll, count: stats.total },
                        { id: 'critical', label: ar.triageCritical, count: stats.critical, tone: 'rose' },
                        { id: 'no_accession', label: ar.triageNoAccession, count: stats.noAccession, tone: 'amber' },
                        { id: 'ready', label: ar.triageReady, count: stats.readyIdentity, tone: 'emerald' }
                    ].map((tab) => {
                        const isActive = triageTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setTriageTab(tab.id)}
                                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition-all ${
                                    isActive
                                        ? 'bg-slate-900 text-white shadow-xs dark:bg-white dark:text-slate-950'
                                        : 'border border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                                }`}
                            >
                                <span>{tab.label}</span>
                                <span className={`rounded-md px-1.5 py-0.2 text-[10px] font-mono ${isActive ? 'bg-white/20 dark:bg-slate-900/20' : 'bg-slate-100 dark:bg-slate-800'}`}>
                                    {tab.count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Main Content Layout: Study Feed + Resolution Sidebar */}
            <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
                {/* Left/Main Study Feed */}
                <div className="space-y-3">
                    {isLoading ? (
                        <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90">
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 size={32} className="animate-spin text-teal-600 dark:text-teal-400" />
                                <p className="text-sm font-bold text-slate-600 dark:text-slate-400">Loading quarantine studies...</p>
                            </div>
                        </div>
                    ) : visibleStudies.length === 0 ? (
                        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 text-center shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                            <ShieldCheck size={40} className="mx-auto text-emerald-600" />
                            <h3 className="mt-3 text-base font-black text-slate-900 dark:text-white">
                                {isAr ? 'لا توجد دراسات في الحجر الصحي مطابقة للبحث' : 'No matching studies in quarantine'}
                            </h3>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {isAr ? 'جميع الدراسات الواردة تم ربطها بنجاح مع أوامر الفحص المجدولة.' : 'Inbound imaging series are automatically verified and linked.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {pagedStudies.map((study) => {
                                const reason = study.__reason;
                                const isCritical = study.__severity >= 3;
                                const isWarning = study.__severity === 2;

                                return (
                                    <article
                                        key={study.quarantine_id}
                                        className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:bg-slate-900/90 sm:p-5"
                                    >
                                        {/* Left/Right Colored Acuity Stripe */}
                                        <div className={`absolute inset-y-0 start-0 w-1.5 ${isCritical ? 'bg-rose-500' : isWarning ? 'bg-amber-400' : 'bg-teal-500'}`} />

                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between ps-2">
                                            {/* Patient & Reason Column */}
                                            <div className="min-w-0 flex-1 space-y-2.5">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-black text-xs">
                                                        <User size={16} />
                                                    </div>
                                                    <div>
                                                        <h3 className="truncate text-sm font-black text-slate-900 dark:text-white sm:text-base">
                                                            {study.raw_patient_name || missing}
                                                        </h3>
                                                        <p className="flex items-center gap-2 font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                                            <span>MRN: <strong className="text-slate-800 dark:text-slate-200">{study.raw_patient_id || missing}</strong></span>
                                                            <span>·</span>
                                                            <span className="inline-flex items-center gap-1 rounded bg-teal-500/10 px-1.5 py-0.2 font-black text-teal-700 dark:text-teal-300">
                                                                {study.modality || 'DX'}
                                                            </span>
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* DICOM Header Metadata Box */}
                                                <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-950/40 text-xs font-mono">
                                                    <div className="grid gap-1.5 sm:grid-cols-2">
                                                        <div className="flex items-center justify-between gap-2 overflow-hidden">
                                                            <span className="text-[10px] font-bold uppercase text-slate-400">Accession:</span>
                                                            <span className="truncate font-bold text-slate-800 dark:text-slate-200">
                                                                {study.raw_accession_number || missing}
                                                            </span>
                                                            {study.raw_accession_number && (
                                                                <button type="button" onClick={() => copyValue(study.raw_accession_number)} className="text-slate-400 hover:text-teal-600">
                                                                    <Copy size={11} />
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center justify-between gap-2 overflow-hidden">
                                                            <span className="text-[10px] font-bold uppercase text-slate-400">Study UID:</span>
                                                            <span className="truncate font-bold text-slate-800 dark:text-slate-200" title={study.study_instance_uid}>
                                                                {study.study_instance_uid ? `...${study.study_instance_uid.slice(-16)}` : missing}
                                                            </span>
                                                            {study.study_instance_uid && (
                                                                <button type="button" onClick={() => copyValue(study.study_instance_uid)} className="text-slate-400 hover:text-teal-600">
                                                                    <Copy size={11} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Badges: Reason & Integrity */}
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10.5px] font-black ${
                                                        isCritical
                                                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                                                            : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                                                    }`}>
                                                        <AlertTriangle size={12} />
                                                        <span>{ar.reasons[reason] || reason}</span>
                                                    </span>

                                                    <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-mono text-[10.5px] font-black text-emerald-700 dark:text-emerald-300">
                                                        <CheckCircle2 size={12} />
                                                        <span>{study.__identityScore}/4 Ready</span>
                                                    </span>

                                                    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold text-slate-400 ms-auto">
                                                        <Clock size={11} />
                                                        <span>{formatDate(study.created_at, locale)}</span>
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Action Buttons Column */}
                                            <div className="flex flex-row lg:flex-col items-stretch gap-2 shrink-0 border-t border-slate-100 pt-3 lg:border-t-0 lg:pt-0 lg:ps-4">
                                                {/* Primary Match & Link Action Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveStudy(study)}
                                                    disabled={busy}
                                                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 active:scale-95 disabled:opacity-50 min-w-[140px]"
                                                >
                                                    <Link2 size={14} />
                                                    <span>{ar.link}</span>
                                                </button>

                                                {/* Discard Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => setDiscardTarget(study)}
                                                    disabled={busy}
                                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-500/20 disabled:opacity-50 dark:text-rose-300"
                                                >
                                                    <Trash2 size={13} />
                                                    <span>{ar.discard}</span>
                                                </button>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}

                            {visibleStudies.length > 0 && (
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        <span>
                                            {isAr
                                                ? `عرض ${startIndex + 1} - ${Math.min(endIndex, visibleStudies.length)} من إجمالي ${visibleStudies.length} دراسة`
                                                : `Showing ${startIndex + 1} - ${Math.min(endIndex, visibleStudies.length)} of ${visibleStudies.length} studies`}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-400">{isAr ? 'لكل صفحة:' : 'Per page:'}</span>
                                        <select
                                            value={pageSize}
                                            onChange={(e) => setPageSize(Number(e.target.value))}
                                            className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                        >
                                            {[5, 10, 20, 50].map((size) => (
                                                <option key={size} value={size}>{size}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <Pagination
                                        currentPage={currentPage}
                                        pageCount={pageCount}
                                        onPageChange={setCurrentPage}
                                        isRtl={isRtl}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Sidebar: Analytics & Protocol Advice */}
                <aside className="space-y-4">
                    {/* Triage Profile */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="flex items-center gap-2 mb-3">
                            <AlertTriangle size={15} className="text-amber-500" />
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                {ar.triageTitle}
                            </h3>
                        </div>
                        <div className="space-y-1.5">
                            {reasonOptions.map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setReasonFilter(reasonFilter === r ? all : r)}
                                    className={`flex w-full items-center justify-between rounded-xl border p-2.5 text-start text-xs font-semibold transition ${
                                        reasonFilter === r
                                            ? 'border-teal-500 bg-teal-50 text-teal-800 dark:bg-teal-950/30 dark:text-teal-300'
                                            : 'border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <span className="truncate">{ar.reasons[r] || r}</span>
                                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-black text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                        {reasonCounts[r]}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Modality Breakdown */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="flex items-center gap-2 mb-3">
                            <Network size={15} className="text-teal-600" />
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                {ar.modalityTitle}
                            </h3>
                        </div>
                        <div className="space-y-2">
                            {modalityOptions.map((m) => {
                                const cnt = modalityCounts[m] || 0;
                                const pct = Math.round((cnt / Math.max(1, stats.total)) * 100);
                                return (
                                    <div key={m} className="space-y-1">
                                        <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
                                            <span>{m}</span>
                                            <span className="font-mono text-slate-400">{cnt} ({pct}%)</span>
                                        </div>
                                        <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                            <div className="h-full bg-teal-600 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Resolution Protocol */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="flex items-center gap-2 mb-3">
                            <ShieldCheck size={15} className="text-emerald-600" />
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                {ar.protocolTitle}
                            </h3>
                        </div>
                        <ol className="space-y-2.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                            <li className="flex gap-2">
                                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-500/15 text-[10px] font-black text-teal-700 dark:text-teal-300">1</span>
                                <span>تحقق من مطابقة اسم المريض ورقم الملف (MRN) ونوع الفحص.</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-500/15 text-[10px] font-black text-teal-700 dark:text-teal-300">2</span>
                                <span>استخدم زر <strong>مطابقة الفحص</strong> للبحث في الفحوصات المجدولة وربط الدراسة فوراً.</span>
                            </li>
                            <li className="flex gap-2">
                                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-500/15 text-[10px] font-black text-teal-700 dark:text-teal-300">3</span>
                                <span>استبعد الدراسات المكررة أو غير الصالحة بالضغط على <strong>استبعاد</strong>.</span>
                            </li>
                        </ol>
                    </div>
                </aside>
            </div>

            {/* Reconciliation Match Dialogue */}
            {activeStudy && (
                <ReconcileDialog
                    study={activeStudy}
                    onClose={() => setActiveStudy(null)}
                    onConfirm={handleReconcile}
                    locale={locale}
                    isAr={isAr}
                />
            )}

            {/* Discard Confirmation Dialog */}
            {discardTarget && (
                <ConfirmDiscardDialog
                    study={discardTarget}
                    busy={isDiscarding}
                    onClose={() => setDiscardTarget(null)}
                    onConfirm={confirmDiscard}
                    locale={locale}
                    isAr={isAr}
                />
            )}
        </div>
    );
};

/* ─── Match Dialog ─── */
const ReconcileDialog = ({ study, onClose, onConfirm, locale, isAr }) => {
    const initialSearchTerm = study.raw_accession_number || study.raw_patient_id || '';
    const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
    const [searchQuery, { data: searchResults, isFetching }] = useLazySearchScheduledExamsQuery();
    const [selectedExam, setSelectedExam] = useState(null);

    useEffect(() => {
        if (initialSearchTerm) {
            searchQuery(initialSearchTerm);
        }
    }, [initialSearchTerm, searchQuery]);

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchTerm.trim()) {
            searchQuery(searchTerm.trim());
        }
    };

    const results = searchResults?.data || searchResults || [];

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md animate-in fade-in duration-150" onClick={onClose}>
            <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                        <span className="grid h-8 w-8 place-items-center rounded-xl bg-teal-500/15 text-teal-700 dark:text-teal-300">
                            <Link2 size={16} />
                        </span>
                        <h2 className="text-sm font-black text-slate-900 dark:text-white">
                            {isAr ? ar.linkTitle : 'Link Quarantined Study to Scheduled Examination'}
                        </h2>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="grid flex-1 overflow-y-auto lg:grid-cols-[280px_1fr]">
                    {/* Left: Inbound DICOM Details */}
                    <div className="border-b lg:border-b-0 lg:border-e border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/40 space-y-3">
                        <p className="text-[10px] font-black uppercase text-slate-400">{isAr ? ar.inboundDetails : 'Inbound DICOM File'}</p>
                        <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 space-y-2 text-xs">
                            <p className="font-black text-slate-900 dark:text-white">{study.raw_patient_name || missing}</p>
                            <p className="font-mono text-slate-500">MRN: <strong className="text-slate-800 dark:text-slate-200">{study.raw_patient_id || missing}</strong></p>
                            <p className="font-mono text-slate-500">Acc: <strong className="text-slate-800 dark:text-slate-200">{study.raw_accession_number || missing}</strong></p>
                            <p className="font-mono text-slate-500">Modality: <strong className="text-teal-600">{study.modality || 'DX'}</strong></p>
                            <p className="font-mono text-slate-500 truncate" title={study.study_instance_uid}>UID: {study.study_instance_uid ? `...${study.study_instance_uid.slice(-14)}` : missing}</p>
                        </div>
                    </div>

                    {/* Right: Search and Match Exam */}
                    <div className="p-4 space-y-3">
                        <form onSubmit={handleSearch} className="flex gap-2">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={isAr ? ar.searchOrderPlaceholder : 'Search order #, MRN, or patient name...'}
                                className="h-10 flex-1 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 text-xs font-semibold outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-white"
                            />
                            <button
                                type="submit"
                                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-black text-white hover:bg-teal-500 transition"
                            >
                                {isFetching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                                <span>{isAr ? 'بحث' : 'Search'}</span>
                            </button>
                        </form>

                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                            {results.length === 0 ? (
                                <p className="text-center py-6 text-xs text-slate-400 font-semibold">
                                    {isAr ? 'ابحث برقم الطلب أو الملف لعرض الفحوصات المتاحة للربط.' : 'Search by order or MRN to find candidate scheduled exams.'}
                                </p>
                            ) : (
                                results.map((exam) => {
                                    const isSelected = selectedExam?.exam_id === exam.exam_id;
                                    return (
                                        <div
                                            key={exam.exam_id}
                                            onClick={() => setSelectedExam(exam)}
                                            className={`cursor-pointer rounded-xl border p-3 transition ${
                                                isSelected
                                                    ? 'border-teal-500 bg-teal-50/80 ring-2 ring-teal-500/20 dark:bg-teal-950/40'
                                                    : 'border-slate-200/80 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <h4 className="text-xs font-black text-slate-900 dark:text-white">{exam.patient_name}</h4>
                                                    <p className="text-[11px] font-semibold text-slate-500">
                                                        {exam.exam_type_name || exam.modality_name} · MRN {exam.mrn || '—'} · Order #{exam.order_number || exam.exam_id}
                                                    </p>
                                                </div>
                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                    {exam.status}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        {isAr ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                        type="button"
                        onClick={() => selectedExam && onConfirm(selectedExam.exam_id)}
                        disabled={!selectedExam}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-600 px-5 text-xs font-black text-white hover:bg-teal-500 transition disabled:opacity-40"
                    >
                        <Check size={14} />
                        <span>{isAr ? ar.confirmLink : 'Confirm Link & Resolve'}</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

/* ─── Discard Dialog ─── */
const ConfirmDiscardDialog = ({ study, busy, onClose, onConfirm, isAr }) => createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md animate-in fade-in duration-150" onClick={onClose}>
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-rose-600">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-500/15">
                    <Trash2 size={20} />
                </span>
                <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">{isAr ? ar.discardTitle : 'Discard Study?'}</h3>
                    <p className="text-[11px] text-slate-500">{isAr ? ar.discardWarning : 'This marks the study as discarded from active quarantine.'}</p>
                </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200/70 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40">
                <p className="font-bold text-slate-800 dark:text-slate-200">{study.raw_patient_name || missing}</p>
                <p className="mt-1 font-mono text-slate-500">Acc: {study.raw_accession_number || missing} · MRN: {study.raw_patient_id || missing}</p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                    {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={busy}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-black text-white hover:bg-rose-500 transition disabled:opacity-50"
                >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    <span>{isAr ? ar.confirmDiscard : 'Confirm Discard'}</span>
                </button>
            </div>
        </div>
    </div>,
    document.body
);

const countBy = (items, getKey) => items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
}, {});

const uniqueValues = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

const identityCompleteness = (study) => [
    study.raw_patient_id,
    study.raw_accession_number,
    study.study_instance_uid,
    study.modality
].filter(Boolean).length;

const formatDate = (value, locale) => {
    if (!value) return missing;
    try {
        return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    } catch {
        return value;
    }
};

export default PacsReconciliation;
