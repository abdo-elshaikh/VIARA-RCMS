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
    ArrowUpDown,
    BadgeCheck,
    CalendarClock,
    CalendarDays,
    Check,
    CheckCircle2,
    ClipboardCheck,
    Clock,
    Copy,
    Database,
    ExternalLink,
    Eye,
    EyeOff,
    FileSearch,
    FileText,
    Filter,
    FilterX,
    Info,
    Layers,
    LayoutGrid,
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
    Sparkles,
    TableProperties,
    Trash2,
    User,
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

const getReconciliationText = (t, key, options = {}) => t(`recon.${key}`, {
    ns: 'pacsReconciliation',
    ...options
});

const normalizeReasonKey = (rawReason) => {
    if (!rawReason) return 'UNKNOWN';
    const s = String(rawReason).toUpperCase().replace(/[\s-]+/g, '_');
    if (s.includes('ACCESSION') && (s.includes('MISSING') || s.includes('EMPTY'))) return 'ACCESSION_NUMBER_MISSING';
    if (s.includes('ACCESSION') && s.includes('NOT_FOUND')) return 'ACCESSION_NUMBER_NOT_FOUND';
    if (s.includes('PATIENT') || s.includes('IDENTIFIER') || s.includes('MRN')) return 'PATIENT_ID_MISMATCH';
    if (s.includes('STUDY') && s.includes('MISSING')) return 'STUDY_INSTANCE_UID_MISSING';
    if (s.includes('STUDY') && s.includes('MISMATCH')) return 'STUDY_INSTANCE_UID_MISMATCH';
    return rawReason;
};

const reasonSeverity = {
    ACCESSION_NUMBER_NOT_FOUND: 2,
    ACCESSION_NUMBER_MISSING: 2,
    STUDY_INSTANCE_UID_MISSING: 3,
    PATIENT_ID_MISMATCH: 3,
    STUDY_INSTANCE_UID_MISMATCH: 3,
    UNKNOWN: 1
};

const getModalityTheme = (modality) => {
    const mod = String(modality || '').toUpperCase();
    if (mod.includes('CT')) {
        return {
            badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30 dark:bg-sky-500/15',
            avatar: 'bg-sky-500 text-white dark:bg-sky-600',
            label: 'CT'
        };
    }
    if (mod.includes('MR')) {
        return {
            badge: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 dark:bg-purple-500/15',
            avatar: 'bg-purple-500 text-white dark:bg-purple-600',
            label: 'MRI'
        };
    }
    if (mod.includes('US')) {
        return {
            badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 dark:bg-amber-500/15',
            avatar: 'bg-amber-500 text-white dark:bg-amber-600',
            label: 'US'
        };
    }
    if (mod.includes('DX') || mod.includes('CR') || mod.includes('XR')) {
        return {
            badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 dark:bg-emerald-500/15',
            avatar: 'bg-emerald-500 text-white dark:bg-emerald-600',
            label: 'X-RAY'
        };
    }
    if (mod.includes('NM') || mod.includes('PT')) {
        return {
            badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 dark:bg-rose-500/15',
            avatar: 'bg-rose-500 text-white dark:bg-rose-600',
            label: 'NM'
        };
    }
    return {
        badge: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30 dark:bg-slate-500/15',
        avatar: 'bg-slate-700 text-white dark:bg-slate-600',
        label: modality || 'DX'
    };
};

const getSeverityTheme = (severity) => {
    if (severity >= 3) {
        return {
            stripe: 'bg-rose-500',
            badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
            icon: AlertOctagon,
            tone: 'rose'
        };
    }
    if (severity === 2) {
        return {
            stripe: 'bg-amber-500',
            badge: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
            icon: AlertTriangle,
            tone: 'amber'
        };
    }
    return {
        stripe: 'bg-teal-500',
        badge: 'bg-teal-500/15 text-teal-800 dark:text-teal-300 border-teal-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
        icon: BadgeCheck,
        tone: 'emerald'
    };
};

const PacsReconciliation = () => {
    const { t, i18n } = useTranslation(['pacsReconciliation', 'common']);
    const isAr = i18n.language?.startsWith('ar');
    const isRtl = i18n.dir() === 'rtl';
    const locale = isAr ? 'ar-EG' : 'en-US';
    const tx = useCallback((key, options) => getReconciliationText(t, key, options), [t]);

    const { data: quarantine = [], error: loadError, isLoading, isError, refetch, isFetching } = useGetPacsQuarantineQuery('Pending', {
        pollingInterval: 20000,
        refetchOnFocus: true
    });
    const [reconcile, { isLoading: isReconciling }] = useReconcileQuarantineStudyMutation();
    const [discard, { isLoading: isDiscarding }] = useDiscardQuarantineStudyMutation();

    const [activeStudy, setActiveStudy] = useState(null);
    const [discardTarget, setDiscardTarget] = useState(null);
    const [expandedStudies, setExpandedStudies] = useState(new Set());
    const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebounce(query, 180);

    const [triageTab, setTriageTab] = useState('all');
    const [reasonFilter, setReasonFilter] = useState(all);
    const [modalityFilter, setModalityFilter] = useState(all);
    const [sortMode, setSortMode] = useState('priority');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(6);

    const busy = isReconciling || isDiscarding;

    const enrichedStudies = useMemo(() => quarantine.map((study) => {
        const reason = normalizeReasonKey(study.quarantine_reason);
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
            if (sortMode === 'completeness') return (b.__identityScore - a.__identityScore) || (b.__receivedAt - a.__receivedAt);
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

    const toggleExpand = useCallback((quarantineId) => {
        setExpandedStudies((prev) => {
            const next = new Set(prev);
            if (next.has(quarantineId)) {
                next.delete(quarantineId);
            } else {
                next.add(quarantineId);
            }
            return next;
        });
    }, []);

    const copyValue = useCallback(async (val, label = '') => {
        if (!val) return;
        try {
            await navigator.clipboard.writeText(val);
            toast.success(label ? tx('copyLabeled', { label }) : tx('copySuccess'));
        } catch {
            toast.error(tx('copyFailed'));
        }
    }, [tx]);

    const handleReconcile = useCallback(async (examId) => {
        if (!activeStudy) return;
        try {
            await reconcile({ id: activeStudy.quarantine_id, examId }).unwrap();
            toast.success(tx('linkSuccess'));
            setActiveStudy(null);
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || tx('reconcileFailed'));
        }
    }, [activeStudy, reconcile, refetch, tx]);

    const confirmDiscard = useCallback(async () => {
        if (!discardTarget) return;
        try {
            await discard(discardTarget.quarantine_id).unwrap();
            toast.success(tx('discardSuccess'));
            setDiscardTarget(null);
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || tx('discardFailed'));
        }
    }, [discard, discardTarget, refetch, tx]);

    return (
        <div className="space-y-4 pb-12" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Executive Page Header */}
            <PageHeader
                icon={Radio}
                eyebrow={tx('eyebrow')}
                title={tx('title')}
                description={tx('description')}
                meta={
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-700 dark:text-emerald-300">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                        {tx('liveConnected')}
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
                        <span>{tx('refreshQueue')}</span>
                    </button>
                }
                metrics={[
                    { key: 'total', icon: Database, tone: 'teal', label: tx('pending'), value: stats.total, loading: isLoading, error: isError },
                    { key: 'visible', icon: FileSearch, tone: 'slate', label: tx('visible'), value: stats.visible, loading: isLoading, error: isError },
                    { key: 'critical', icon: AlertTriangle, tone: 'rose', label: tx('critical'), value: stats.critical, onClick: () => { setTriageTab(triageTab === 'critical' ? 'all' : 'critical'); setReasonFilter(all); }, loading: isLoading, error: isError },
                    { key: 'accession', icon: ClipboardCheck, tone: 'amber', label: tx('noAccession'), value: stats.noAccession, onClick: () => { setTriageTab(triageTab === 'no_accession' ? 'all' : 'no_accession'); setReasonFilter(all); }, loading: isLoading, error: isError },
                    { key: 'identity', icon: BadgeCheck, tone: 'emerald', label: tx('readyIdentity'), value: stats.readyIdentity, onClick: () => { setTriageTab(triageTab === 'ready' ? 'all' : 'ready'); setReasonFilter(all); }, loading: isLoading, error: isError },
                    { key: 'oldest', icon: CalendarClock, tone: 'sky', label: tx('oldest'), value: stats.oldest, loading: isLoading, error: isError },
                ]}
                metricsLabel={tx('metricsLabel')}
            />

            {/* Workbench Control Panel: Search, Multi-Filter & View Switcher */}
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] space-y-3.5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_210px_170px_190px_auto]">
                    {/* Search Field */}
                    <div className="relative">
                        <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={tx('searchPlaceholder')}
                            className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/70 ps-10 pe-9 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-field)] dark:text-[var(--VIARA-ink)] dark:placeholder:text-[var(--VIARA-muted)]"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Reason Filter */}
                    <div className="relative">
                        <select
                            value={reasonFilter}
                            onChange={(e) => setReasonFilter(e.target.value)}
                            className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-field)] dark:text-[var(--VIARA-ink)]"
                        >
                            <option value="all">{tx('allReasons')}</option>
                            {reasonOptions.map((r) => (
                                <option key={r} value={r}>{tx(`reasons.${r}`, { defaultValue: r })}</option>
                            ))}
                        </select>
                    </div>

                    {/* Modality Filter */}
                    <div className="relative">
                        <select
                            value={modalityFilter}
                            onChange={(e) => setModalityFilter(e.target.value)}
                            className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-field)] dark:text-[var(--VIARA-ink)]"
                        >
                            <option value="all">{tx('allModalities')}</option>
                            {modalityOptions.map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>

                    {/* Sort Selector */}
                    <div className="relative">
                        <select
                            value={sortMode}
                            onChange={(e) => setSortMode(e.target.value)}
                            className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-field)] dark:text-[var(--VIARA-ink)]"
                        >
                            <option value="priority">{tx('sortPriority')}</option>
                            <option value="newest">{tx('sortNewest')}</option>
                            <option value="oldest">{tx('sortOldest')}</option>
                            <option value="completeness">{tx('sortCompleteness')}</option>
                        </select>
                    </div>

                    {/* Action Bar (View mode toggle & Clear) */}
                    <div className="flex items-center gap-1.5 justify-end">
                        {/* View Switcher */}
                        <div className="inline-flex rounded-xl border border-slate-200/80 bg-slate-50 p-0.5 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-field)]">
                            <button
                                type="button"
                                onClick={() => setViewMode('cards')}
                                title={tx('viewCards')}
                                className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                                    viewMode === 'cards'
                                        ? 'bg-white text-teal-600 shadow-xs dark:bg-slate-800 dark:text-emerald-400'
                                        : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
                                }`}
                            >
                                <LayoutGrid size={15} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('table')}
                                title={tx('viewTable')}
                                className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                                    viewMode === 'table'
                                        ? 'bg-white text-teal-600 shadow-xs dark:bg-slate-800 dark:text-emerald-400'
                                        : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
                                }`}
                            >
                                <Rows3 size={15} />
                            </button>
                        </div>

                        {/* Clear Filters Button */}
                        {(query || reasonFilter !== all || modalityFilter !== all || triageTab !== 'all') && (
                            <button
                                type="button"
                                onClick={() => { setQuery(''); setReasonFilter(all); setModalityFilter(all); setTriageTab('all'); }}
                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-muted)] dark:text-slate-300 dark:hover:bg-[var(--VIARA-surface-hover)]"
                            >
                                <FilterX size={14} />
                                <span className="hidden sm:inline">{tx('clearFilters')}</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Triage Tabs with Counter Pills */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-[var(--VIARA-line)]">
                    <span className="text-[11px] font-bold text-slate-400 me-1">{tx('quickTriageLabel')}</span>
                    {[
                        { id: 'all', label: tx('triageAll'), count: stats.total },
                        { id: 'critical', label: tx('triageCritical'), count: stats.critical, tone: 'rose' },
                        { id: 'no_accession', label: tx('triageNoAccession'), count: stats.noAccession, tone: 'amber' },
                        { id: 'ready', label: tx('triageReady'), count: stats.readyIdentity, tone: 'emerald' }
                    ].map((tab) => {
                        const isActive = triageTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setTriageTab(tab.id)}
                                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-black transition-all ${
                                    isActive
                                        ? 'bg-slate-900 text-white shadow-xs dark:bg-emerald-500 dark:text-slate-950 ring-2 ring-slate-900/10 dark:ring-emerald-500/20'
                                        : 'border border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-field)] dark:text-slate-300 dark:hover:bg-[var(--VIARA-surface-hover)]'
                                }`}
                            >
                                <span>{tab.label}</span>
                                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-mono font-bold ${
                                    isActive
                                        ? 'bg-white/20 dark:bg-slate-950/20'
                                        : 'bg-slate-100 text-slate-600 dark:bg-[var(--VIARA-surface-muted)] dark:text-slate-300'
                                }`}>
                                    {tab.count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Main Clinical Workbench Feed + Analytics Sidebar */}
            <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
                {/* Primary Content Stream */}
                <div className="space-y-3">
                    {isLoading ? (
                        <div className="flex min-h-[380px] items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] shadow-sm">
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 size={36} className="animate-spin text-teal-600 dark:text-emerald-400" />
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                    {tx('loading')}
                                </p>
                            </div>
                        </div>
                    ) : visibleStudies.length === 0 ? (
                        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-10 text-center shadow-sm backdrop-blur-xl dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)]">
                            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                                <ShieldCheck size={36} />
                            </div>
                            <h3 className="mt-4 text-base font-black text-slate-900 dark:text-[var(--VIARA-ink)]">
                                {tx('emptyTitle')}
                            </h3>
                            <p className="mt-1.5 max-w-md mx-auto text-xs font-medium text-slate-500 dark:text-[var(--VIARA-muted)] leading-relaxed">
                                {tx('emptyDesc')}
                            </p>
                        </div>
                    ) : viewMode === 'cards' ? (
                        /* Card View Mode */
                        <div className="space-y-3.5">
                            {pagedStudies.map((study) => {
                                const reason = study.__reason;
                                const isCritical = study.__severity >= 3;
                                const isWarning = study.__severity === 2;
                                const severityTheme = getSeverityTheme(study.__severity);
                                const modalityTheme = getModalityTheme(study.modality);
                                const isExpanded = expandedStudies.has(study.quarantine_id);

                                return (
                                    <article
                                        key={study.quarantine_id}
                                        className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 sm:p-5 shadow-xs transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)]"
                                    >
                                        {/* Visual Acuity Colored Edge */}
                                        <div className={`absolute inset-y-0 start-0 w-1.5 ${severityTheme.stripe}`} />

                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between ps-2">
                                            {/* Patient & Study Metadata Details */}
                                            <div className="min-w-0 flex-1 space-y-3">
                                                {/* Header Line: Modality Badge, Patient Name & MRN */}
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl font-black text-xs shadow-xs ${modalityTheme.avatar}`}>
                                                        {modalityTheme.label}
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <h3 className="truncate text-sm sm:text-base font-black text-slate-900 dark:text-[var(--VIARA-ink)]">
                                                                {study.raw_patient_name || missing}
                                                            </h3>
                                                            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-black border ${modalityTheme.badge}`}>
                                                                {study.modality || 'DX'}
                                                            </span>
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs font-semibold text-slate-500 dark:text-[var(--VIARA-muted)]">
                                                            <span>{tx('mrn')}:</span>
                                                            <strong className="font-mono text-slate-800 dark:text-[var(--VIARA-ink)]">
                                                                {study.raw_patient_id || missing}
                                                            </strong>
                                                            {study.raw_patient_id && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => copyValue(study.raw_patient_id, tx('mrn'))}
                                                                    className="text-slate-400 hover:text-teal-600 transition dark:hover:text-emerald-400"
                                                                    title={tx('copySuccess')}
                                                                >
                                                                    <Copy size={12} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Inbound DICOM Attributes Strip */}
                                                <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 text-xs font-mono dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-field)]">
                                                    <div className="grid gap-2 sm:grid-cols-2">
                                                        {/* Accession Number */}
                                                        <div className="flex items-center justify-between gap-2 overflow-hidden">
                                                            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                                                                {tx('accession')}:
                                                            </span>
                                                            <span className={`truncate font-bold ${
                                                                study.raw_accession_number
                                                                    ? 'text-slate-800 dark:text-[var(--VIARA-ink)]'
                                                                    : 'text-amber-600 dark:text-amber-400 italic'
                                                            }`}>
                                                                {study.raw_accession_number || tx('missingInDicom')}
                                                            </span>
                                                            {study.raw_accession_number && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => copyValue(study.raw_accession_number, tx('accession'))}
                                                                    className="text-slate-400 hover:text-teal-600 transition dark:hover:text-emerald-400"
                                                                >
                                                                    <Copy size={11} />
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Study Instance UID */}
                                                        <div className="flex items-center justify-between gap-2 overflow-hidden">
                                                            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                                                                {tx('studyUid')}:
                                                            </span>
                                                            <span className="truncate font-bold text-slate-800 dark:text-[var(--VIARA-ink)]" title={study.study_instance_uid}>
                                                                {study.study_instance_uid ? `...${study.study_instance_uid.slice(-18)}` : missing}
                                                            </span>
                                                            {study.study_instance_uid && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => copyValue(study.study_instance_uid, tx('studyUid'))}
                                                                    className="text-slate-400 hover:text-teal-600 transition dark:hover:text-emerald-400"
                                                                >
                                                                    <Copy size={11} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Expanded Details Pane (Optional Raw Information) */}
                                                {isExpanded && (
                                                    <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-3 text-xs dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-muted)] space-y-2 animate-in fade-in duration-150">
                                                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                                            <span>معرف خادم Orthanc الداخلي:</span>
                                                            <span className="font-mono text-slate-800 dark:text-slate-200">{study.orthanc_study_id || missing}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                                                            <span>المعرف الكامل لـ Study Instance UID:</span>
                                                            <span className="font-mono text-[10px] break-all text-slate-700 dark:text-slate-300">{study.study_instance_uid || missing}</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Status Callout & Tags Row */}
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {/* Quarantine Reason Badge */}
                                                    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-black border ${severityTheme.badge}`}>
                                                        <severityTheme.icon size={13} />
                                                        <span>{tx(`reasons.${reason}`, { defaultValue: reason })}</span>
                                                    </span>

                                                    {/* Readiness Score Bar */}
                                                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] font-black text-emerald-700 dark:text-emerald-300 dark:bg-emerald-500/15">
                                                        <CheckCircle2 size={13} />
                                                        <span>{study.__identityScore}/4 {tx('ready')}</span>
                                                    </span>

                                                    {/* Toggle Quick Details */}
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleExpand(study.quarantine_id)}
                                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                                                    >
                                                        {isExpanded ? <EyeOff size={12} /> : <Eye size={12} />}
                                                        <span>{isExpanded ? tx('hideDetails') : tx('quickView')}</span>
                                                    </button>

                                                    {/* Received Time */}
                                                    <span className="inline-flex items-center gap-1 font-mono text-[10.5px] font-semibold text-slate-400 ms-auto">
                                                        <Clock size={12} />
                                                        <span>{formatDate(study.created_at, locale)}</span>
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Action Buttons Column */}
                                            <div className="flex flex-row lg:flex-col items-stretch gap-2 shrink-0 border-t border-slate-100 pt-3 lg:border-t-0 lg:pt-0 lg:ps-4 dark:border-[var(--VIARA-line)]">
                                                {/* Primary Match & Link Action */}
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveStudy(study)}
                                                    disabled={busy}
                                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 text-xs font-black text-white shadow-xs transition hover:opacity-95 active:scale-95 disabled:opacity-50 min-w-[150px]"
                                                >
                                                    <Link2 size={15} />
                                                    <span>{tx('linkAction')}</span>
                                                </button>

                                                {/* Discard Action */}
                                                <button
                                                    type="button"
                                                    onClick={() => setDiscardTarget(study)}
                                                    disabled={busy}
                                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-500/20 active:scale-95 disabled:opacity-50 dark:text-rose-300"
                                                >
                                                    <Trash2 size={13} />
                                                    <span>{tx('discardAction')}</span>
                                                </button>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    ) : (
                        /* Compact Table View Mode */
                        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-xs backdrop-blur-xl dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)]">
                            <div className="overflow-x-auto">
                                <table className="w-full text-start text-xs">
                                    <thead className="border-b border-slate-200/80 bg-slate-50/80 text-[11px] font-black uppercase text-slate-500 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-field)] dark:text-slate-400">
                                        <tr>
                                            <th className="py-3 px-3 text-start w-12">#</th>
                                            <th className="py-3 px-3 text-start">{tx('patient')}</th>
                                            <th className="py-3 px-3 text-start">{tx('modality')}</th>
                                            <th className="py-3 px-3 text-start">{tx('accession')}</th>
                                            <th className="py-3 px-3 text-start">{tx('reason')}</th>
                                            <th className="py-3 px-3 text-start">{tx('readiness')}</th>
                                            <th className="py-3 px-3 text-start">{tx('receivedAt')}</th>
                                            <th className="py-3 px-3 text-end">{tx('actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-[var(--VIARA-line)]">
                                        {pagedStudies.map((study, idx) => {
                                            const reason = study.__reason;
                                            const severityTheme = getSeverityTheme(study.__severity);
                                            const modalityTheme = getModalityTheme(study.modality);

                                            return (
                                                <tr key={study.quarantine_id} className="transition hover:bg-slate-50/60 dark:hover:bg-[var(--VIARA-surface-hover)]">
                                                    <td className="py-3 px-3 font-mono font-bold text-slate-400">
                                                        {startIndex + idx + 1}
                                                    </td>
                                                    <td className="py-3 px-3">
                                                        <div className="font-black text-slate-900 dark:text-[var(--VIARA-ink)]">
                                                            {study.raw_patient_name || missing}
                                                        </div>
                                                        <div className="font-mono text-[10px] text-slate-500">
                                                            MRN: {study.raw_patient_id || missing}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-3">
                                                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black border ${modalityTheme.badge}`}>
                                                            {study.modality || 'DX'}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 font-mono font-semibold">
                                                        {study.raw_accession_number ? (
                                                            <div className="flex items-center gap-1.5 text-slate-800 dark:text-[var(--VIARA-ink)]">
                                                                <span>{study.raw_accession_number}</span>
                                                                <button type="button" onClick={() => copyValue(study.raw_accession_number)} className="text-slate-400 hover:text-teal-600">
                                                                    <Copy size={11} />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-amber-600 dark:text-amber-400 italic">مفقود</span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-3">
                                                        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold border ${severityTheme.badge}`}>
                                                            <severityTheme.icon size={11} />
                                                            <span>{tx(`reasons.${reason}`, { defaultValue: reason })}</span>
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                                        {study.__identityScore}/4
                                                    </td>
                                                    <td className="py-3 px-3 font-mono text-[10.5px] text-slate-500">
                                                        {formatDate(study.created_at, locale)}
                                                    </td>
                                                    <td className="py-3 px-3 text-end">
                                                        <div className="inline-flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => setActiveStudy(study)}
                                                                title={tx('linkAction')}
                                                                className="inline-flex h-8 items-center gap-1 rounded-lg bg-teal-600 px-2.5 text-[11px] font-black text-white hover:bg-teal-500 transition"
                                                            >
                                                                <Link2 size={13} />
                                                                <span>{tx('linkShort')}</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setDiscardTarget(study)}
                                                                title={tx('discardAction')}
                                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 transition dark:text-rose-300"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Pagination Bar */}
                    {visibleStudies.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-xs backdrop-blur-xl dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)]">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                <span>
                                    {isAr
                                        ? `عرض ${startIndex + 1} - ${Math.min(endIndex, visibleStudies.length)} من إجمالي ${visibleStudies.length} دراسة`
                                        : `Showing ${startIndex + 1} - ${Math.min(endIndex, visibleStudies.length)} of ${visibleStudies.length} studies`}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-400">{tx('perPage')}:</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => setPageSize(Number(e.target.value))}
                                    className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-field)] dark:text-[var(--VIARA-ink)]"
                                >
                                    {[6, 12, 24, 48].map((size) => (
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

                {/* Right Clinical Sidebar: Analytics & Protocol Advice */}
                <aside className="space-y-4">
                    {/* Reason Distribution Profile */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)]">
                        <div className="flex items-center gap-2 mb-3.5">
                            <span className="grid h-6 w-6 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
                                <AlertTriangle size={14} />
                            </span>
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-[var(--VIARA-ink)]">
                                {tx('triageTitle')}
                            </h3>
                        </div>

                        <div className="space-y-2">
                            {reasonOptions.map((r) => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setReasonFilter(reasonFilter === r ? all : r)}
                                    className={`flex w-full items-center justify-between rounded-xl border p-2.5 text-start text-xs font-semibold transition ${
                                        reasonFilter === r
                                            ? 'border-teal-500 bg-teal-50/80 text-teal-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300'
                                            : 'border-slate-100 hover:bg-slate-50 dark:border-[var(--VIARA-line)] dark:hover:bg-[var(--VIARA-surface-muted)] dark:text-slate-300'
                                    }`}
                                >
                                    <span className="truncate pe-2">{tx(`reasons.${r}`, { defaultValue: r })}</span>
                                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-black text-slate-700 dark:bg-[var(--VIARA-surface-muted)] dark:text-slate-300">
                                        {reasonCounts[r]}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Modality Breakdown */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)]">
                        <div className="flex items-center gap-2 mb-3.5">
                            <span className="grid h-6 w-6 place-items-center rounded-lg bg-teal-500/10 text-teal-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                                <Network size={14} />
                            </span>
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-[var(--VIARA-ink)]">
                                {tx('modalityTitle')}
                            </h3>
                        </div>

                        <div className="space-y-2.5">
                            {modalityOptions.map((m) => {
                                const cnt = modalityCounts[m] || 0;
                                const pct = Math.round((cnt / Math.max(1, stats.total)) * 100);
                                const theme = getModalityTheme(m);
                                return (
                                    <div key={m} className="space-y-1">
                                        <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                                            <span className="flex items-center gap-1.5">
                                                <span className={`inline-block h-2 w-2 rounded-full ${theme.avatar}`} />
                                                <span>{m}</span>
                                            </span>
                                            <span className="font-mono text-slate-400">{cnt} ({pct}%)</span>
                                        </div>
                                        <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[var(--VIARA-surface-muted)] overflow-hidden">
                                            <div className="h-full bg-teal-600 dark:bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Resolution Protocol & SOP */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)]">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="grid h-6 w-6 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                                <ShieldCheck size={14} />
                            </span>
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-[var(--VIARA-ink)]">
                                {tx('protocolTitle')}
                            </h3>
                        </div>

                        <ol className="space-y-3 text-xs font-medium text-slate-600 dark:text-slate-300">
                            {tx('protocolSteps', { returnObjects: true }).map((step, idx) => (
                                <li key={idx} className="flex gap-2.5">
                                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-500/15 text-[10px] font-black text-teal-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                                        {idx + 1}
                                    </span>
                                    <span className="leading-relaxed">{step}</span>
                                </li>
                            ))}
                        </ol>
                    </div>
                </aside>
            </div>

            {/* Reconciliation Match Workbench Modal */}
            {activeStudy && (
                <ReconcileDialog
                    study={activeStudy}
                    onClose={() => setActiveStudy(null)}
                    onConfirm={handleReconcile}
                    locale={locale}
                    isAr={isAr}
                    t={t}
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
                    t={t}
                />
            )}
        </div>
    );
};

/* ─── Match & Reconciliation Station Modal ─── */
const ReconcileDialog = ({ study, onClose, onConfirm, locale, isAr, t }) => {
    const tx = useCallback((key, options) => getReconciliationText(t, key, options), [t]);
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
        if (e) e.preventDefault();
        if (searchTerm.trim()) {
            searchQuery(searchTerm.trim());
        }
    };

    const results = searchResults?.data || searchResults || [];
    const modalityTheme = getModalityTheme(study.modality);

    // Compute live verification diff
    const diff = useMemo(() => {
        if (!selectedExam) return null;

        const nameA = String(study.raw_patient_name || '').trim().toLowerCase();
        const nameB = String(selectedExam.patient_name || '').trim().toLowerCase();
        const namesMatch = nameA && nameB && (nameA === nameB || nameA.includes(nameB) || nameB.includes(nameA));

        const mrnA = String(study.raw_patient_id || '').trim();
        const mrnB = String(selectedExam.mrn || '').trim();
        const mrnsMatch = mrnA && mrnB && mrnA === mrnB;

        const modA = String(study.modality || '').trim().toUpperCase();
        const modB = String(selectedExam.modality_type || selectedExam.modality_name || '').trim().toUpperCase();
        const modalitiesMatch = modA && modB && (modA === modB || modB.includes(modA) || modA.includes(modB));

        return {
            namesMatch,
            mrnsMatch,
            modalitiesMatch,
            hasConflict: !namesMatch || !mrnsMatch
        };
    }, [study, selectedExam]);

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-3 sm:p-4 backdrop-blur-md animate-in fade-in duration-150" dir={isAr ? 'rtl' : 'ltr'} onClick={onClose}>
            <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-500/20 to-emerald-500/20 text-teal-600 dark:text-emerald-400">
                            <Link2 size={18} />
                        </span>
                        <div>
                            <h2 className="text-sm font-black text-slate-900 dark:text-white sm:text-base">
                                {tx('linkDialogTitle')}
                            </h2>
                            <p className="text-[11px] font-medium text-slate-500">
                                {tx('linkDialogSubtitle')}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body Dual Pane Layout */}
                <div className="grid flex-1 overflow-y-auto lg:grid-cols-[340px_1fr]">
                    {/* Left Pane: Inbound DICOM Details */}
                    <div className="border-b lg:border-b-0 lg:border-e border-slate-100 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-950/40 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                                {tx('inboundHeader')}
                            </span>
                            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black border ${modalityTheme.badge}`}>
                                {study.modality || 'DX'}
                            </span>
                        </div>

                        {/* Inbound Metadata Card */}
                        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 space-y-2.5 text-xs shadow-xs">
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 block">{tx('patient')}:</span>
                                <p className="font-black text-slate-900 dark:text-white text-sm">
                                    {study.raw_patient_name || missing}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 block">{tx('mrn')}:</span>
                                    <p className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                        {study.raw_patient_id || missing}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 block">{tx('accession')}:</span>
                                    <p className={`font-mono font-bold ${study.raw_accession_number ? 'text-slate-800 dark:text-slate-200' : 'text-amber-600 italic'}`}>
                                        {study.raw_accession_number || missing}
                                    </p>
                                </div>
                            </div>

                            <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                                <span className="text-[10px] font-bold text-slate-400 block">{tx('studyUid')}:</span>
                                <p className="font-mono text-[10px] text-slate-600 dark:text-slate-400 break-all">
                                    {study.study_instance_uid || missing}
                                </p>
                            </div>

                            <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                                <span className="text-[10px] font-bold text-slate-400 block">{tx('reason')}:</span>
                                <span className="inline-flex items-center gap-1 mt-0.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10.5px] font-bold text-amber-800 dark:text-amber-300">
                                    <AlertTriangle size={11} />
                                    <span>{tx(`reasons.${study.__reason}`, { defaultValue: study.__reason })}</span>
                                </span>
                            </div>
                        </div>

                        {/* Quick fill buttons */}
                        <div className="space-y-1.5">
                            <span className="text-[10.5px] font-bold text-slate-400 block">{tx('searchBy')}</span>
                            <div className="flex flex-wrap gap-1.5">
                                {study.raw_accession_number && (
                                    <button
                                        type="button"
                                        onClick={() => { setSearchTerm(study.raw_accession_number); searchQuery(study.raw_accession_number); }}
                                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                    >
                                        Acc: {study.raw_accession_number}
                                    </button>
                                )}
                                {study.raw_patient_id && (
                                    <button
                                        type="button"
                                        onClick={() => { setSearchTerm(study.raw_patient_id); searchQuery(study.raw_patient_id); }}
                                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                    >
                                        MRN: {study.raw_patient_id}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Pane: Search & Select Scheduled Candidate */}
                    <div className="p-4 sm:p-5 space-y-4 flex flex-col justify-between">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                    {tx('searchSectionTitle')}
                                </span>
                                <span className="text-xs font-semibold text-slate-400">
                                    {tx('candidatesCount', { count: results.length })}
                                </span>
                            </div>

                            {/* Search Form */}
                            <form onSubmit={handleSearch} className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder={tx('searchOrderPlaceholder')}
                                        className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/70 ps-9 pe-4 text-xs font-semibold outline-none transition focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-white"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-black text-white hover:bg-teal-500 transition active:scale-95"
                                >
                                    {isFetching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                                    <span>{tx('searchBtn')}</span>
                                </button>
                            </form>

                            {/* Candidates List */}
                            <div className="space-y-2 max-h-[260px] overflow-y-auto pe-1">
                                {results.length === 0 ? (
                                    <div className="py-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-4">
                                        <FileSearch size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                                        <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                                            {tx('noCandidatesFound')}
                                        </p>
                                    </div>
                                ) : (
                                    results.map((exam) => {
                                        const isSelected = selectedExam?.exam_id === exam.exam_id;
                                        return (
                                            <div
                                                key={exam.exam_id}
                                                onClick={() => setSelectedExam(exam)}
                                                className={`cursor-pointer rounded-xl border p-3.5 transition ${
                                                    isSelected
                                                        ? 'border-teal-500 bg-teal-50/80 ring-2 ring-teal-500/30 dark:bg-teal-950/40'
                                                        : 'border-slate-200/80 hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/60'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                                                                {exam.patient_name}
                                                            </h4>
                                                            <span className="rounded bg-teal-500/10 px-1.5 py-0.5 font-mono text-[10px] font-black text-teal-700 dark:text-teal-300">
                                                                {exam.modality_type || exam.modality_name || 'DX'}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex flex-wrap gap-2">
                                                            <span>{exam.exam_type_name || exam.exam_type_code}</span>
                                                            <span>·</span>
                                                            <span className="font-mono">MRN: <strong className="text-slate-800 dark:text-slate-200">{exam.mrn || missing}</strong></span>
                                                            <span>·</span>
                                                            <span className="font-mono">Order: <strong className="text-slate-800 dark:text-slate-200">#{exam.order_number || exam.exam_id}</strong></span>
                                                        </p>
                                                    </div>

                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                            {exam.status}
                                                        </span>
                                                        {isSelected && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-black text-teal-600 dark:text-emerald-400">
                                                                <Check size={12} />
                                                                <span>{tx('selected')}</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Live Verification Diff Panel (when a candidate is selected) */}
                        {selectedExam && diff && (
                            <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3.5 dark:border-slate-800 dark:bg-slate-950/60 space-y-2.5 animate-in fade-in duration-150">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                        <Sparkles size={14} className="text-teal-600 dark:text-emerald-400" />
                                        <span>{tx('diffHeader')}</span>
                                    </span>
                                    {diff.hasConflict ? (
                                        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-rose-600 dark:text-rose-400">
                                            <AlertTriangle size={12} />
                                            <span>{tx('mismatchWarning')}</span>
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400">
                                            <BadgeCheck size={12} />
                                            <span>{tx('exactMatch')}</span>
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div className="rounded-lg bg-white p-2 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                        <span className="text-[10px] font-bold text-slate-400 block">{tx('fieldPatientName')}:</span>
                                        <span className={`font-black truncate block ${diff.namesMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                            {selectedExam.patient_name}
                                        </span>
                                    </div>
                                    <div className="rounded-lg bg-white p-2 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                        <span className="text-[10px] font-bold text-slate-400 block">{tx('fieldMrn')}:</span>
                                        <span className={`font-mono font-bold block ${diff.mrnsMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            {selectedExam.mrn}
                                        </span>
                                    </div>
                                    <div className="rounded-lg bg-white p-2 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                        <span className="text-[10px] font-bold text-slate-400 block">{tx('fieldModality')}:</span>
                                        <span className="font-bold text-slate-800 dark:text-slate-200 block">
                                            {selectedExam.modality_type || selectedExam.modality_name}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between border-t border-slate-100 p-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
                    <span className="text-xs font-semibold text-slate-500">
                        {selectedExam ? (tx('readyToConfirm')) : tx('candidateHelper')}
                    </span>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            {tx('cancelBtn')}
                        </button>
                        <button
                            type="button"
                            onClick={() => selectedExam && onConfirm(selectedExam.exam_id)}
                            disabled={!selectedExam}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-5 text-xs font-black text-white hover:opacity-95 transition disabled:opacity-40 active:scale-95 shadow-xs"
                        >
                            <Check size={14} />
                            <span>{tx('confirmMatchBtn')}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

/* ─── Discard Confirmation Modal ─── */
const ConfirmDiscardDialog = ({ study, busy, onClose, onConfirm, isAr, t }) => {
    const tx = useCallback((key, options) => getReconciliationText(t, key, options), [t]);
    return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md animate-in fade-in duration-150" dir={isAr ? 'rtl' : 'ltr'} onClick={onClose}>
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-rose-600">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-500/15">
                    <Trash2 size={20} />
                </span>
                <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                        {tx('discardTitle')}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                        {tx('discardSubtitle')}
                    </p>
                </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200/70 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950/40 space-y-1.5">
                <p className="font-black text-slate-900 dark:text-slate-200 text-sm">
                    {study.raw_patient_name || missing}
                </p>
                <div className="flex items-center gap-3 font-mono text-slate-500">
                    <span>MRN: <strong className="text-slate-700 dark:text-slate-300">{study.raw_patient_id || missing}</strong></span>
                    <span>·</span>
                    <span>Acc: <strong className="text-slate-700 dark:text-slate-300">{study.raw_accession_number || missing}</strong></span>
                </div>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {tx('discardWarning')}
            </p>

            <div className="mt-5 flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                    {tx('cancelBtn')}
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={busy}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-black text-white hover:bg-rose-500 transition disabled:opacity-50 active:scale-95 shadow-xs"
                >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    <span>{tx('confirmDiscardBtn')}</span>
                </button>
            </div>
        </div>
    </div>,
    document.body
    );
};

/* Helper Functions */
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
