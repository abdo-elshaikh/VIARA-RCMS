import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    Activity,
    AlertTriangle,
    ArrowDownUp,
    BadgeCheck,
    CalendarClock,
    CheckCircle2,
    ClipboardCheck,
    Copy,
    Database,
    Eye,
    FileSearch,
    Filter,
    Link2,
    Loader2,
    Network,
    RefreshCw,
    Rows3,
    Search,
    ShieldAlert,
    ShieldCheck,
    SlidersHorizontal,
    TableProperties,
    Trash2,
    UserRound,
    X,
    TrendingUp,
    CalendarDays,
    AlertOctagon
} from 'lucide-react';
import {
    useDiscardQuarantineStudyMutation,
    useGetPacsQuarantineQuery,
    useLazySearchScheduledExamsQuery,
    useReconcileQuarantineStudyMutation
} from '../store/api';
import PageHeader from '../components/ui/PageHeader';

const missing = '-';
const all = 'all';

const reasonTone = {
    ACCESSION_NUMBER_NOT_FOUND: 'bg-gradient-to-r from-amber-50 to-amber-100/50 text-amber-700 ring-amber-200/60 shadow-sm dark:from-amber-950/30 dark:to-amber-900/10 dark:text-amber-400 dark:ring-amber-800/40',
    ACCESSION_NUMBER_MISSING: 'bg-gradient-to-r from-slate-50 to-slate-100/50 text-slate-700 ring-slate-200/60 shadow-sm dark:from-slate-800/60 dark:to-slate-900/40 dark:text-slate-350 dark:ring-slate-700/50',
    STUDY_INSTANCE_UID_MISSING: 'bg-gradient-to-r from-rose-50 to-rose-100/50 text-rose-700 ring-rose-200/60 shadow-sm dark:from-rose-950/30 dark:to-rose-900/10 dark:text-rose-400 dark:ring-rose-800/40',
    PATIENT_ID_MISMATCH: 'bg-gradient-to-r from-fuchsia-50 to-fuchsia-100/50 text-fuchsia-700 ring-fuchsia-200/60 shadow-sm dark:from-fuchsia-950/30 dark:to-fuchsia-900/10 dark:text-fuchsia-400 dark:ring-fuchsia-800/40',
    STUDY_INSTANCE_UID_MISMATCH: 'bg-gradient-to-r from-red-50 to-red-100/50 text-red-700 ring-red-200/60 shadow-sm dark:from-red-950/30 dark:to-red-900/10 dark:text-red-400 dark:ring-red-800/40',
    UNKNOWN: 'bg-gradient-to-r from-zinc-50 to-zinc-100/50 text-zinc-700 ring-zinc-200/60 shadow-sm dark:from-zinc-900/80 dark:to-zinc-950/40 dark:text-zinc-450 dark:ring-zinc-800/50'
};

const reasonSeverity = {
    ACCESSION_NUMBER_NOT_FOUND: 2,
    ACCESSION_NUMBER_MISSING: 2,
    STUDY_INSTANCE_UID_MISSING: 3,
    PATIENT_ID_MISMATCH: 3,
    STUDY_INSTANCE_UID_MISMATCH: 3,
    UNKNOWN: 1
};

const sortModes = ['priority', 'oldest', 'newest'];

/**
 * PacsReconciliation — PACS Study Quarantine & Reconciliation Center
 * Features:
 *   - Auto-searches candidate list on Linking Dialog mount
 *   - Structured split-panel comparison view with visual DICOM header checklist
 *   - Premium triage charts and status badges
 *   - Dark mode compliant telemetry metrics
 */
const PacsReconciliation = () => {
    const { t, i18n } = useTranslation('common');
    const { data: quarantine = [], error: loadError, isLoading, isError, refetch, isFetching } = useGetPacsQuarantineQuery('Pending');
    const [reconcile, { isLoading: isReconciling }] = useReconcileQuarantineStudyMutation();
    const [discard, { isLoading: isDiscarding }] = useDiscardQuarantineStudyMutation();
    const [activeStudy, setActiveStudy] = useState(null);
    const [discardTarget, setDiscardTarget] = useState(null);
    const [query, setQuery] = useState('');
    const [reasonFilter, setReasonFilter] = useState(all);
    const [modalityFilter, setModalityFilter] = useState(all);
    const [sortMode, setSortMode] = useState('priority');
    const [compactRows, setCompactRows] = useState(false);

    const busy = isReconciling || isDiscarding;
    const isRtl = i18n.dir() === 'rtl';
    const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-US';

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
        const q = query.trim().toLowerCase();
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

            return matchesReason && matchesModality && matchesQuery;
        });

        return [...filtered].sort((a, b) => {
            if (sortMode === 'oldest') return (a.__receivedAt || 0) - (b.__receivedAt || 0);
            if (sortMode === 'newest') return (b.__receivedAt || 0) - (a.__receivedAt || 0);
            return (b.__severity - a.__severity) || ((a.__receivedAt || 0) - (b.__receivedAt || 0));
        });
    }, [enrichedStudies, query, reasonFilter, modalityFilter, sortMode]);

    const stats = useMemo(() => {
        const oldestStudy = enrichedStudies.reduce((oldest, study) => {
            if (!study.created_at) return oldest;
            if (!oldest || new Date(study.created_at) < new Date(oldest.created_at)) return study;
            return oldest;
        }, null);

        return {
            total: enrichedStudies.length,
            visible: visibleStudies.length,
            critical: enrichedStudies.filter((study) => study.__severity >= 3).length,
            noAccession: (reasonCounts.ACCESSION_NUMBER_MISSING || 0) + (reasonCounts.ACCESSION_NUMBER_NOT_FOUND || 0),
            readyIdentity: enrichedStudies.filter((study) => study.__identityScore >= 3).length,
            oldest: oldestStudy?.created_at ? formatDate(oldestStudy.created_at, locale) : missing
        };
    }, [enrichedStudies, reasonCounts, visibleStudies.length, locale]);

    const activeFilterCount = [query.trim(), reasonFilter !== all, modalityFilter !== all].filter(Boolean).length;
    const selectedReasonLabel = reasonFilter === all ? null : t(`pacs.recon.reasons.${reasonFilter}`, { defaultValue: reasonFilter });

    const resetFilters = () => {
        setQuery('');
        setReasonFilter(all);
        setModalityFilter(all);
    };

    const copyValue = async (value) => {
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            toast.success(t('pacs.recon.copied', { defaultValue: 'Copied' }));
        } catch {
            toast.error(t('pacs.recon.copyFailed', { defaultValue: 'Copy failed' }));
        }
    };

    const confirmDiscard = async () => {
        if (!discardTarget) return;
        try {
            await discard(discardTarget.quarantine_id).unwrap();
            toast.success(t('pacs.recon.discarded', { defaultValue: 'Study discarded' }));
            setDiscardTarget(null);
        } catch (error) {
            toast.error(error?.data?.message || t('pacs.recon.error', { defaultValue: 'Action failed' }));
        }
    };

    const handleReconcile = async (examId) => {
        if (!activeStudy) return;
        try {
            await reconcile({ id: activeStudy.quarantine_id, examId }).unwrap();
            toast.success(t('pacs.recon.linked', { defaultValue: 'Study linked to examination' }));
            setActiveStudy(null);
        } catch (error) {
            toast.error(error?.data?.message || t('pacs.recon.error', { defaultValue: 'Action failed' }));
        }
    };

    return (
        <div className="flex min-h-screen w-full flex-col gap-4" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Page Header */}
            <PageHeader
                icon={ShieldAlert}
                eyebrow={t('pacs.recon.commandCenter', { defaultValue: 'PACS operations' })}
                title={t('pacs.recon.title', { defaultValue: 'Study Reconciliation' })}
                description={t('pacs.recon.subtitle', { defaultValue: 'Resolve unmatched DICOM studies by linking them to scheduled examinations or discarding invalid inbound studies.' })}
                meta={(
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                        <Activity size={12} className="animate-pulse" />
                        {t('pacs.recon.liveQueue', { defaultValue: 'Live quarantine queue' })}
                    </span>
                )}
                actions={(
                    <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[520px]">
                        <CommandChip
                            icon={AlertTriangle}
                            label={t('pacs.recon.command.highRisk', { defaultValue: 'High risk' })}
                            value={stats.critical}
                            tone="rose"
                        />
                        <CommandChip
                            icon={ClipboardCheck}
                            label={t('pacs.recon.command.readyToLink', { defaultValue: 'Ready IDs' })}
                            value={stats.readyIdentity}
                            tone="emerald"
                        />
                        <TooltipButton
                            label={t('actions.refresh', { defaultValue: 'Refresh' })}
                            tooltip={t('pacs.recon.tooltips.refresh', { defaultValue: 'Reload the quarantine queue' })}
                            icon={RefreshCw}
                            onClick={() => refetch()}
                            disabled={isFetching}
                            loading={isFetching}
                            fullWidth
                        />
                    </div>
                )}
            />

            <section className="overflow-hidden rounded-3xl border border-white/40 bg-white/70 shadow-xl shadow-slate-200/40 backdrop-blur-2xl dark:border-slate-700/50 dark:bg-[#0b1426]/80 transition-all duration-300">
                <div className="grid bg-slate-50/50 dark:bg-white/[0.01] sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                    <Metric icon={Database} label={t('pacs.recon.stats.pending', { defaultValue: 'Pending studies' })} value={stats.total} />
                    <Metric icon={FileSearch} label={t('pacs.recon.stats.visible', { defaultValue: 'Visible after filters' })} value={stats.visible} />
                    <Metric icon={AlertTriangle} label={t('pacs.recon.stats.critical', { defaultValue: 'High-risk mismatches' })} value={stats.critical} tone="rose" />
                    <Metric icon={ClipboardCheck} label={t('pacs.recon.stats.noAccession', { defaultValue: 'Missing accession' })} value={stats.noAccession} tone="amber" />
                    <Metric icon={BadgeCheck} label={t('pacs.recon.stats.readyIdentity', { defaultValue: 'Identity complete' })} value={stats.readyIdentity} tone="emerald" />
                    <Metric icon={CalendarClock} label={t('pacs.recon.stats.oldest', { defaultValue: 'Oldest received' })} value={stats.oldest} compact />
                </div>
            </section>

            {/* Main Content Workspace */}
            <section className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
                <div className="min-w-0 space-y-4">
                    {/* Search & Filters */}
                    <div className="rounded-3xl border border-white/40 bg-white/70 p-4 shadow-xl shadow-slate-200/40 backdrop-blur-2xl dark:border-slate-700/50 dark:bg-[#0b1426]/80 transition-all duration-300">
                        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_220px_190px_170px_auto_auto] lg:items-center">
                            <label className="relative">
                                <span className="sr-only">{t('actions.search', { defaultValue: 'Search' })}</span>
                                <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder={t('pacs.recon.filterPlaceholder', { defaultValue: 'Search patient, MRN, accession, UID, Orthanc ID...' })}
                                    className="min-h-11 w-full rounded-xl border border-slate-200/60 bg-white/80 ps-10 pe-3 text-sm font-semibold text-slate-800 shadow-sm backdrop-blur-sm transition-all duration-200 focus-within:border-teal-300 focus-within:ring-4 focus-within:ring-teal-500/10 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-100 outline-none"
                                />
                            </label>

                            <FilterSelect
                                icon={Filter}
                                value={reasonFilter}
                                onChange={setReasonFilter}
                                label={t('pacs.recon.reason', { defaultValue: 'Reason' })}
                                allLabel={t('pacs.recon.allReasons', { defaultValue: 'All reasons' })}
                                options={reasonOptions.map((reason) => ({
                                    value: reason,
                                    label: t(`pacs.recon.reasons.${reason}`, { defaultValue: reason })
                                }))}
                            />

                            <FilterSelect
                                icon={SlidersHorizontal}
                                value={modalityFilter}
                                onChange={setModalityFilter}
                                label={t('pacs.recon.modality', { defaultValue: 'Modality' })}
                                allLabel={t('pacs.recon.allModalities', { defaultValue: 'All modalities' })}
                                options={modalityOptions.map((modality) => ({ value: modality, label: modality }))}
                            />

                            <FilterSelect
                                icon={ArrowDownUp}
                                value={sortMode}
                                onChange={setSortMode}
                                label={t('pacs.recon.sort.label', { defaultValue: 'Sort' })}
                                options={sortModes.map((mode) => ({
                                    value: mode,
                                    label: t(`pacs.recon.sort.${mode}`, { defaultValue: mode })
                                }))}
                            />

                            <button
                                type="button"
                                onClick={() => setCompactRows((value) => !value)}
                                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-black transition ${
                                    compactRows 
                                        ? 'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900/60 dark:bg-teal-950/20 dark:text-teal-350' 
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-405 dark:hover:bg-slate-800'
                                }`}
                                title={t('pacs.recon.tooltips.compactRows', { defaultValue: 'Toggle compact table rows' })}
                                aria-pressed={compactRows}
                            >
                                <Rows3 size={15} />
                                <span className="hidden 2xl:inline">{t('pacs.recon.compactRows', { defaultValue: 'Compact' })}</span>
                            </button>

                            <button
                                type="button"
                                onClick={resetFilters}
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200/60 bg-white/80 px-4 text-xs font-black text-slate-600 shadow-sm backdrop-blur-sm transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/20"
                                title={t('pacs.recon.tooltips.clearFilters', { defaultValue: 'Clear search and filters' })}
                            >
                                <X size={15} />
                                {t('pacs.recon.clearFilters', { defaultValue: 'Clear' })}
                            </button>
                        </div>

                        {activeFilterCount > 0 && (
                            <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-[11px] font-bold dark:border-slate-800">
                                <span className="text-slate-400">{t('pacs.recon.activeFilters', { defaultValue: 'Active filters' })}</span>
                                {query.trim() && <FilterPill label={t('actions.search', { defaultValue: 'Search' })} value={query.trim()} />}
                                {selectedReasonLabel && <FilterPill label={t('pacs.recon.reason', { defaultValue: 'Reason' })} value={selectedReasonLabel} />}
                                {modalityFilter !== all && <FilterPill label={t('pacs.recon.modality', { defaultValue: 'Modality' })} value={modalityFilter} />}
                            </div>
                        )}
                    </div>

                    {/* Table / List Container */}
                    {isLoading ? (
                        <PageState icon={Loader2} spin title={t('pacs.recon.loading', { defaultValue: 'Loading quarantined studies...' })} />
                    ) : isError ? (
                        <PageState
                            icon={AlertTriangle}
                            title={getLoadErrorTitle(loadError, t)}
                            detail={getLoadErrorDetail(loadError, t)}
                            actionLabel={t('actions.retry', { defaultValue: 'Retry' })}
                            action={refetch}
                        />
                    ) : quarantine.length === 0 ? (
                        <PageState
                            icon={ShieldCheck}
                            title={t('pacs.recon.empty', { defaultValue: 'No studies in quarantine' })}
                            detail={t('pacs.recon.emptyHelp', { defaultValue: 'Received studies are auto-linked to scheduled orders.' })}
                            success
                        />
                    ) : visibleStudies.length === 0 ? (
                        <PageState
                            icon={Search}
                            title={t('pacs.recon.noFiltered', { defaultValue: 'No matching studies' })}
                            detail={t('pacs.recon.noFilteredHelp', { defaultValue: 'Try another patient, accession, UID, modality, or reason.' })}
                            actionLabel={t('pacs.recon.clearFilters', { defaultValue: 'Clear filters' })}
                            action={resetFilters}
                        />
                    ) : (
                        <>
                            {/* Mobile list view */}
                            <div className="grid gap-3 lg:hidden">
                                {visibleStudies.map((study) => (
                                    <StudyCard
                                        key={study.quarantine_id}
                                        study={study}
                                        t={t}
                                        locale={locale}
                                        busy={busy}
                                        onCopy={copyValue}
                                        onLink={setActiveStudy}
                                        onDiscard={setDiscardTarget}
                                        compact={compactRows}
                                    />
                                ))}
                            </div>

                            {/* Desktop tabular view */}
                            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#0b1426] lg:block">
                                <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between bg-slate-50/20 dark:bg-white/[0.01]">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <TableProperties size={17} className="text-teal-600 dark:text-teal-400" />
                                        <div className="min-w-0">
                                            <h2 className="truncate text-sm font-black text-slate-900 dark:text-slate-100">
                                                {t('pacs.recon.queueTitle', { defaultValue: 'Unmatched studies' })}
                                            </h2>
                                            <p className="mt-0.5 truncate text-[11px] font-bold text-slate-400 dark:text-slate-500">
                                                {t('pacs.recon.queueSubtitle', { defaultValue: 'Prioritized by patient safety risk, then oldest received study.' })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-400">
                                        <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-900 px-3 py-1.5 text-[10px] font-black text-slate-600 dark:text-slate-400">
                                            <Eye size={13} />
                                            {t('pacs.recon.queueCount', { defaultValue: '{{count}} shown', count: visibleStudies.length })}
                                        </span>
                                        <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-900 px-3 py-1.5 text-[10px] font-black text-slate-600 dark:text-slate-400">
                                            <ArrowDownUp size={13} />
                                            {t(`pacs.recon.sort.${sortMode}`, { defaultValue: sortMode })}
                                        </span>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[1180px] text-xs">
                                        <thead className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                                            <tr>
                                                <th className="px-5 py-4 text-start">{t('pacs.recon.patient', { defaultValue: 'Patient' })}</th>
                                                <th className="px-5 py-4 text-start">{t('pacs.recon.study', { defaultValue: 'Study' })}</th>
                                                <th className="px-5 py-4 text-start">{t('pacs.recon.integrity', { defaultValue: 'Integrity' })}</th>
                                                <th className="px-5 py-4 text-start">{t('pacs.recon.reason', { defaultValue: 'Reason' })}</th>
                                                <th className="px-5 py-4 text-start">{t('pacs.recon.received', { defaultValue: 'Received' })}</th>
                                                <th className="px-5 py-4 text-end">{t('pacs.recon.actions', { defaultValue: 'Actions' })}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                                            {visibleStudies.map((study) => (
                                                <StudyRow
                                                    key={study.quarantine_id}
                                                    study={study}
                                                    t={t}
                                                    locale={locale}
                                                    busy={busy}
                                                    onCopy={copyValue}
                                                    onLink={setActiveStudy}
                                                    onDiscard={setDiscardTarget}
                                                    compact={compactRows}
                                                />
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Sidebar Statistics & Protocols */}
                <aside className="space-y-4 xl:sticky xl:top-[88px] xl:self-start">
                    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#0b1426]">
                        <div className="flex items-center gap-2">
                            <AlertTriangle size={16} className="text-amber-500 dark:text-amber-400" />
                            <h2 className="text-xs font-black text-slate-850 dark:text-slate-100 uppercase tracking-wide">
                                {t('pacs.recon.triageTitle', { defaultValue: 'Triage profile' })}
                            </h2>
                        </div>
                        <div className="mt-4 space-y-1.5">
                            {reasonOptions.length === 0 ? (
                                <p className="text-xs font-semibold text-slate-405">{t('pacs.recon.noReasons', { defaultValue: 'No active reasons' })}</p>
                            ) : reasonOptions.map((reason) => (
                                <button
                                    key={reason}
                                    type="button"
                                    onClick={() => setReasonFilter(reason)}
                                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-start transition-all ${
                                        reasonFilter === reason 
                                            ? 'border-teal-200 bg-teal-50/50 text-teal-800 dark:border-teal-900/60 dark:bg-teal-950/20 dark:text-teal-300' 
                                            : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-900/60'
                                    }`}
                                >
                                    <ReasonChip reason={reason} t={t} compact />
                                    <span className="rounded-lg bg-white px-2 py-0.5 text-[10px] font-black text-slate-700 ring-1 ring-slate-150 dark:bg-slate-950/50 dark:text-slate-350 dark:ring-slate-800">
                                        {reasonCounts[reason]}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#0b1426]">
                        <div className="flex items-center gap-2">
                            <Network size={16} className="text-teal-600 dark:text-teal-400" />
                            <h2 className="text-xs font-black text-slate-850 dark:text-slate-100 uppercase tracking-wide">
                                {t('pacs.recon.modalityProfile', { defaultValue: 'Modality profile' })}
                            </h2>
                        </div>
                        <div className="mt-4 space-y-1.5">
                            {modalityOptions.length === 0 ? (
                                <p className="text-xs font-semibold text-slate-405">{t('pacs.recon.noModalities', { defaultValue: 'No active modalities' })}</p>
                            ) : modalityOptions.map((modality) => (
                                <button
                                    key={modality}
                                    type="button"
                                    onClick={() => setModalityFilter(modality)}
                                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition ${
                                        modalityFilter === modality 
                                            ? 'border-teal-200 bg-teal-50/50 text-teal-800 dark:border-teal-900/60 dark:bg-teal-950/20 dark:text-teal-350' 
                                            : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50 dark:border-slate-850 dark:hover:border-slate-700 dark:hover:bg-slate-900/60'
                                    }`}
                                    title={t('pacs.recon.tooltips.filterModality', { defaultValue: 'Filter the queue by this modality' })}
                                >
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-150 text-[10px] font-black text-slate-700 dark:bg-slate-800 dark:text-slate-355">{modality}</span>
                                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-850">
                                        <span className="block h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-400" style={{ width: `${Math.max(12, Math.round((modalityCounts[modality] / Math.max(1, stats.total)) * 100))}%` }} />
                                    </span>
                                    <span className="text-xs font-black text-slate-600 dark:text-slate-300">{modalityCounts[modality]}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#0b1426]">
                        <div className="flex items-center gap-2">
                            <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-450" />
                            <h2 className="text-xs font-black text-slate-850 dark:text-slate-100 uppercase tracking-wide">
                                {t('pacs.recon.protocolTitle', { defaultValue: 'Resolution protocol' })}
                            </h2>
                        </div>
                        <ol className="mt-4 space-y-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            <ProtocolStep index="1" text={t('pacs.recon.protocol.verifyIdentity', { defaultValue: 'Verify patient identity, accession, modality, and study UID before linking.' })} />
                            <ProtocolStep index="2" text={t('pacs.recon.protocol.searchOrder', { defaultValue: 'Search the scheduled examination and select the closest operational match.' })} />
                            <ProtocolStep index="3" text={t('pacs.recon.protocol.discardInvalid', { defaultValue: 'Discard only clearly invalid or duplicate inbound studies.' })} />
                        </ol>
                    </section>
                </aside>
            </section>

            {/* Reconciliation Modal Dialogue */}
            {activeStudy && (
                <ReconcileDialog
                    study={activeStudy}
                    onClose={() => setActiveStudy(null)}
                    onConfirm={handleReconcile}
                    locale={locale}
                />
            )}

            {/* Discard Confirmation Dialog */}
            {discardTarget && (
                <ConfirmDiscardDialog
                    study={discardTarget}
                    busy={isDiscarding}
                    onClose={() => setDiscardTarget(null)}
                    onConfirm={confirmDiscard}
                    t={t}
                    locale={locale}
                />
            )}
        </div>
    );
};

const StudyRow = ({ study, t, locale, busy, onCopy, onLink, onDiscard, compact = false }) => (
    <tr className="group transition-colors duration-200 hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
        <td className={`${compact ? 'px-5 py-2.5' : 'px-5 py-3.5'} ${getRiskBorder(study.__severity)} border-s-4 align-top`}>
            <PatientBlock study={study} t={t} onCopy={onCopy} />
        </td>
        <td className={`${compact ? 'px-5 py-2.5' : 'px-5 py-3.5'} align-top`}>
            <StudyMeta study={study} t={t} onCopy={onCopy} />
        </td>
        <td className={`${compact ? 'px-5 py-2.5' : 'px-5 py-3.5'} align-top`}>
            <IntegrityPanel study={study} t={t} compact={compact} />
        </td>
        <td className={`${compact ? 'px-5 py-2.5' : 'px-5 py-3.5'} align-top`}>
            <div className="space-y-1.5">
                <RiskBadge severity={study.__severity} t={t} />
                <div className="flex"><ReasonChip reason={study.quarantine_reason || 'UNKNOWN'} t={t} /></div>
            </div>
        </td>
        <td className={`${compact ? 'px-5 py-2.5' : 'px-5 py-3.5'} align-top`}>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                <CalendarClock size={13} />
                {formatDate(study.created_at, locale)}
            </span>
        </td>
        <td className={`${compact ? 'px-5 py-2.5' : 'px-5 py-3.5'} align-top`}>
            <div className="mt-0.5">
                <RowActions study={study} busy={busy} t={t} onLink={onLink} onDiscard={onDiscard} />
            </div>
        </td>
    </tr>
);

const StudyCard = ({ study, t, locale, busy, onCopy, onLink, onDiscard }) => (
    <article className={`group/study rounded-2xl border border-white/50 bg-white/60 p-4 shadow-lg shadow-slate-200/20 backdrop-blur-xl transition-all duration-300 hover:shadow-xl hover:bg-white/80 dark:border-slate-700/50 dark:bg-slate-900/60 dark:hover:bg-slate-900/80 ${getRiskBorder(study.__severity)} border-s-[3px]`}>
        <div className="flex items-start justify-between gap-3">
            <PatientBlock study={study} t={t} onCopy={onCopy} />
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-black text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {study.modality || '?'}
            </span>
        </div>
        <div className="mt-4 space-y-3">
            <StudyMeta study={study} t={t} onCopy={onCopy} />
            <IntegrityPanel study={study} t={t} />
            <div className="flex flex-wrap items-center gap-2">
                <RiskBadge severity={study.__severity} t={t} />
                <ReasonChip reason={study.quarantine_reason || 'UNKNOWN'} t={t} />
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <CalendarClock size={13} />
                    {formatDate(study.created_at, locale)}
                </span>
            </div>
        </div>
        <div className="mt-4">
            <RowActions study={study} busy={busy} t={t} onLink={onLink} onDiscard={onDiscard} />
        </div>
    </article>
);

const PatientBlock = ({ study, t, onCopy }) => (
    <div className="min-w-0">
        <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 text-slate-500 dark:text-slate-400 shadow-sm ring-1 ring-inset ring-slate-200/60 dark:ring-white/[0.04] transition-transform duration-300 group-hover:scale-105">
                <UserRound size={17} />
            </span>
            <div className="min-w-0">
                <p className="truncate font-black text-slate-850 dark:text-slate-100 leading-tight">{study.raw_patient_name || missing}</p>
                <CopyLine
                    label={t('pacs.recon.patientId', { defaultValue: 'Patient ID' })}
                    value={study.raw_patient_id || t('pacs.recon.noPatientId', { defaultValue: 'No patient ID' })}
                    copyValue={study.raw_patient_id}
                    onCopy={onCopy}
                    mono
                    compact
                />
            </div>
        </div>
    </div>
);

const StudyMeta = ({ study, t, onCopy }) => (
    <div className="grid max-w-xl gap-1 text-xs">
        <CopyLine label={t('pacs.recon.accession', { defaultValue: 'Accession' })} value={study.raw_accession_number || t('pacs.recon.noAccession', { defaultValue: 'No accession' })} copyValue={study.raw_accession_number} onCopy={onCopy} mono />
        <CopyLine label={t('pacs.recon.studyUid', { defaultValue: 'Study UID' })} value={study.study_instance_uid || missing} copyValue={study.study_instance_uid} onCopy={onCopy} mono />
        <CopyLine label={t('pacs.recon.orthancId', { defaultValue: 'Orthanc ID' })} value={study.orthanc_study_id || missing} copyValue={study.orthanc_study_id} onCopy={onCopy} mono />
        <p className="flex max-w-full items-center gap-1.5">
            <span className="shrink-0 font-bold text-slate-405">{t('pacs.recon.modality', { defaultValue: 'Modality' })}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">{study.modality || '?'}</span>
        </p>
    </div>
);

const CopyLine = ({ label, value, copyValue, onCopy, mono = false, compact = false }) => (
    <button
        type="button"
        onClick={() => onCopy(copyValue)}
        disabled={!copyValue}
        title={copyValue ? `${label}: ${copyValue}` : undefined}
        aria-label={copyValue ? `${label}: ${copyValue}` : label}
        className={`group/copy flex max-w-full items-center gap-1.5 text-start disabled:cursor-default ${compact ? 'mt-0.5' : ''} transition-colors duration-200`}
    >
        <span className="shrink-0 font-bold text-slate-400 transition-colors group-hover/copy:text-slate-500 dark:text-slate-500 dark:group-hover/copy:text-slate-400">{label}</span>
        <span dir={mono ? 'ltr' : undefined} className={`min-w-0 truncate text-slate-700 dark:text-slate-300 transition-colors group-hover/copy:text-slate-900 dark:group-hover/copy:text-slate-100 ${mono ? 'font-mono text-[10.5px]' : 'font-semibold'}`}>{value}</span>
        {copyValue && <Copy size={11} className="shrink-0 text-slate-300 opacity-0 -translate-x-2 transition-all duration-200 group-hover/copy:opacity-100 group-hover/copy:translate-x-0 group-hover/copy:text-teal-500 dark:text-slate-600 dark:group-hover/copy:text-teal-400" />}
    </button>
);

const IntegrityPanel = ({ study, t, compact = false }) => {
    const checks = [
        { key: 'patient', ok: Boolean(study.raw_patient_id), label: t('pacs.recon.integrityChecks.patient', { defaultValue: 'Patient ID' }) },
        { key: 'accession', ok: Boolean(study.raw_accession_number), label: t('pacs.recon.integrityChecks.accession', { defaultValue: 'Accession' }) },
        { key: 'studyUid', ok: Boolean(study.study_instance_uid), label: t('pacs.recon.integrityChecks.studyUid', { defaultValue: 'Study UID' }) },
        { key: 'modality', ok: Boolean(study.modality), label: t('pacs.recon.integrityChecks.modality', { defaultValue: 'Modality' }) }
    ];
    const passed = checks.filter((check) => check.ok).length;
    const tone = passed >= 3
        ? 'text-emerald-700 bg-gradient-to-r from-emerald-50 to-emerald-100/40 ring-emerald-200/60 shadow-sm dark:text-emerald-400 dark:from-emerald-950/30 dark:to-emerald-900/10 dark:ring-emerald-800/40'
        : passed >= 2
            ? 'text-amber-700 bg-gradient-to-r from-amber-50 to-amber-100/40 ring-amber-200/60 shadow-sm dark:text-amber-400 dark:from-amber-950/30 dark:to-amber-900/10 dark:ring-amber-800/40'
            : 'text-rose-700 bg-gradient-to-r from-rose-50 to-rose-100/40 ring-rose-200/60 shadow-sm dark:text-rose-455 dark:from-rose-950/30 dark:to-rose-900/10 dark:ring-rose-800/40';

    return (
        <div className="min-w-[180px]">
            <div className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-[9px] font-black ring-1 ${tone}`}>
                <ClipboardCheck size={11} />
                {t('pacs.recon.integrityScore', { defaultValue: '{{passed}}/4 ready', passed })}
            </div>
            {!compact && (
                <div className="mt-2 flex flex-wrap gap-1">
                    {checks.map((check) => (
                        <span
                            key={check.key}
                            title={check.label}
                            className={`inline-flex h-5.5 items-center gap-1 rounded-md px-1.5 text-[9px] font-bold ring-1 ${check.ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/10 dark:text-emerald-400 dark:ring-emerald-900/30' : 'bg-slate-50 text-slate-400 ring-slate-200 dark:bg-slate-900 dark:text-slate-600 dark:ring-slate-800'}`}
                        >
                            {check.ok ? <CheckCircle2 size={10} /> : <X size={10} />}
                            {check.label}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

const ReasonChip = ({ reason, t, compact = false }) => {
    const tone = reasonTone[reason] || reasonTone.UNKNOWN;
    const label = t(`pacs.recon.reasons.${reason}`, { defaultValue: reason || 'UNKNOWN' });
    return (
        <span className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-black ring-1 ${tone} ${compact ? 'min-w-0 flex-1' : ''}`}>
            <AlertTriangle size={11} className="shrink-0" />
            <span className="truncate">{label}</span>
        </span>
    );
};

const RowActions = ({ study, busy, t, onLink, onDiscard }) => (
    <div className="flex flex-wrap justify-end gap-1.5">
        <TooltipButton
            label={t('pacs.recon.link', { defaultValue: 'Link' })}
            tooltip={t('pacs.recon.tooltips.link', { defaultValue: 'Search scheduled exams and link this study' })}
            icon={Link2}
            onClick={() => onLink(study)}
            disabled={busy}
            primary
        />
        <TooltipButton
            label={t('pacs.recon.discard', { defaultValue: 'Discard' })}
            tooltip={t('pacs.recon.tooltips.discard', { defaultValue: 'Mark this quarantined study as discarded' })}
            icon={Trash2}
            onClick={() => onDiscard(study)}
            disabled={busy}
            danger
        />
    </div>
);

const ReconcileDialog = ({ study, onClose, onConfirm, locale }) => {
    const { t } = useTranslation('common');
    const [term, setTerm] = useState(study.raw_accession_number || study.raw_patient_id || '');
    const [runSearch, { data: results = [], isFetching, isError }] = useLazySearchScheduledExamsQuery();
    const [selected, setSelected] = useState(null);
    const [attempted, setAttempted] = useState(false);
    
    const rankedResults = useMemo(
        () => [...results].sort((a, b) => matchConfidence(study, b) - matchConfidence(study, a)),
        [results, study]
    );
    const bestScore = rankedResults.length > 0 ? matchConfidence(study, rankedResults[0]) : 0;
    const selectedScore = selected ? matchConfidence(study, selected) : 0;

    // Intelligent Mount Trigger: Auto searches for candidates immediately
    useEffect(() => {
        const initialSearch = study.raw_accession_number || study.raw_patient_id || study.raw_patient_name || '';
        if (initialSearch.trim().length >= 2) {
            runSearch(initialSearch.trim());
            setAttempted(true);
        }
    }, [study, runSearch]);

    const doSearch = (event) => {
        event.preventDefault();
        setAttempted(true);
        setSelected(null);
        if (term.trim().length >= 2) runSearch(term.trim());
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md animate-in fade-in duration-200" onClick={onClose}>
            <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-slate-700/50 dark:bg-[#0b1426]/95 animate-in zoom-in-95 duration-200" onClick={(event) => event.stopPropagation()}>
                
                <DialogHeader title={t('pacs.recon.linkTitle', { defaultValue: 'Link Quarantined Study to Examination' })} icon={Link2} onClose={onClose} />

                <div className="grid min-h-0 gap-0 overflow-y-auto lg:grid-cols-[330px_minmax(0,1fr)]">
                    {/* Left details panel */}
                    <aside className="border-b border-slate-200/50 bg-slate-50/50 p-5 dark:border-slate-800/50 dark:bg-slate-900/30 lg:border-b-0 lg:border-e">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                            {t('pacs.recon.inboundStudy', { defaultValue: 'Inbound DICOM details' })}
                        </p>
                        <div className="mt-4 space-y-4">
                            <PatientBlock study={study} t={t} onCopy={() => {}} />
                            <div className="flex"><ReasonChip reason={study.quarantine_reason || 'UNKNOWN'} t={t} /></div>
                            
                            <div className="h-px bg-slate-200/60 dark:bg-slate-800 my-4" />

                            <MetaLine label={t('pacs.recon.accession', { defaultValue: 'Accession Number' })} value={study.raw_accession_number || t('pacs.recon.noAccession', { defaultValue: 'No accession' })} mono />
                            <MetaLine label={t('pacs.recon.modality', { defaultValue: 'Modality' })} value={study.modality || '?'} />
                            <MetaLine label={t('pacs.recon.received', { defaultValue: 'Received date' })} value={formatDate(study.created_at, locale)} />
                            <MetaLine label={t('pacs.recon.studyUid', { defaultValue: 'Study Instance UID' })} value={study.study_instance_uid || missing} mono />
                        </div>
                    </aside>

                    {/* Right search and match comparison */}
                    <main className="min-w-0 p-5 flex flex-col min-h-[300px]">
                        <form onSubmit={doSearch} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <label className="relative">
                                <span className="sr-only">{t('pacs.recon.searchPlaceholder', { defaultValue: 'Search by order number or MRN' })}</span>
                                <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={term}
                                    onChange={(event) => setTerm(event.target.value)}
                                    placeholder={t('pacs.recon.searchPlaceholder', { defaultValue: 'Search by order number, MRN, or patient name' })}
                                    className="min-h-11 w-full rounded-xl border border-slate-200/60 bg-white/80 ps-10 pe-4 py-2 text-sm font-semibold text-slate-850 shadow-sm backdrop-blur-sm transition-all duration-200 focus-within:border-teal-300 focus-within:ring-4 focus-within:ring-teal-500/10 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-200 outline-none"
                                />
                            </label>
                            <button type="submit" className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl bg-teal-600 px-4 text-xs font-black text-white hover:bg-teal-700 transition">
                                {isFetching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                                <span className="ms-2 hidden sm:inline">{t('actions.search', { defaultValue: 'Search' })}</span>
                            </button>
                        </form>

                        {attempted && term.trim().length < 2 && (
                            <p className="mt-2 text-xs font-bold text-amber-600 dark:text-amber-450">
                                {t('pacs.recon.searchTooShort', { defaultValue: 'Enter at least 2 characters to search.' })}
                            </p>
                        )}

                        <div className="mt-4 flex-1 flex flex-col overflow-hidden rounded-xl border border-slate-200/60 dark:border-slate-700/50 bg-white/80 dark:bg-[#060b13]/80 shadow-sm backdrop-blur-sm">
                            <div className="flex flex-col gap-2 border-b border-slate-200/50 bg-slate-50/80 px-4 py-3 dark:border-slate-800/50 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <h3 className="text-xs font-black text-slate-850 dark:text-slate-100 uppercase tracking-wider">
                                        {t('pacs.recon.candidatesTitle', { defaultValue: 'Scheduled exam candidates' })}
                                    </h3>
                                    <p className="mt-0.5 text-[10px] font-bold text-slate-400">
                                        {t('pacs.recon.candidatesHelp', { defaultValue: 'Ranked by accession/order, MRN, patient name, and modality compatibility.' })}
                                    </p>
                                </div>
                                {rankedResults.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-lg bg-white px-2.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-150 dark:bg-slate-900 dark:text-slate-350 dark:ring-slate-800">
                                            {t('pacs.recon.candidatesCount', { defaultValue: '{{count}} candidates', count: rankedResults.length })}
                                        </span>
                                        <ConfidenceChip score={bestScore} t={t} />
                                    </div>
                                )}
                            </div>
                            
                            <div className="max-h-[30vh] overflow-y-auto divide-y divide-slate-150 dark:divide-slate-800">
                                {isError ? (
                                    <p className="px-4 py-10 text-center text-xs font-bold text-rose-500">{t('pacs.recon.searchError', { defaultValue: 'Search failed. Try again.' })}</p>
                                ) : rankedResults.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center px-4 py-12 text-center text-slate-405">
                                        <CalendarDays size={28} className="opacity-30 mb-2" />
                                        <p className="text-xs font-bold">
                                            {attempted ? t('pacs.recon.noResultsAfterSearch', { defaultValue: 'No available scheduled examination matched this search.' }) : t('pacs.recon.noResults', { defaultValue: 'Search for a scheduled examination.' })}
                                        </p>
                                    </div>
                                ) : rankedResults.map((exam, index) => {
                                    const confidence = matchConfidence(study, exam);
                                    const details = matchDetails(study, exam);
                                    return (
                                        <button
                                            key={exam.exam_id}
                                            type="button"
                                            onClick={() => setSelected(exam)}
                                            className={`grid w-full gap-3 px-4 py-3 text-start text-xs transition-colors duration-200 hover:bg-slate-50/80 dark:hover:bg-slate-900/60 sm:grid-cols-[minmax(0,1fr)_auto] ${
                                                selected?.exam_id === exam.exam_id 
                                                    ? 'bg-teal-50/50 ring-1 ring-inset ring-teal-500/30 shadow-[inset_4px_0_0_rgba(20,184,166,1)] dark:bg-teal-950/30 dark:ring-teal-500/30 dark:shadow-[inset_4px_0_0_rgba(20,184,166,0.8)]' 
                                                    : ''
                                            }`}
                                        >
                                            <span className="min-w-0">
                                                <span dir="ltr" className="block truncate font-mono text-[13px] font-black text-slate-900 dark:text-slate-100">{exam.order_number || exam.exam_id?.slice(0, 8) || missing}</span>
                                                <span className="mt-1 block truncate font-bold text-slate-700 dark:text-slate-350">{exam.patient_name || missing}</span>
                                                <span className="mt-1 block truncate text-slate-400">
                                                    {exam.exam_type_name || exam.modality_name || missing} | {t('pacs.recon.patientId', { defaultValue: 'Patient ID' })} <span dir="ltr" className="font-mono">{exam.mrn || missing}</span>
                                                </span>
                                                <span className="mt-2 flex flex-wrap gap-1">
                                                    <MatchDetailPills details={details} t={t} />
                                                </span>
                                            </span>
                                            <span className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                                                {index === 0 && confidence > 0 && (
                                                    <span className="rounded bg-teal-50 dark:bg-teal-950/40 px-2 py-0.5 text-[9px] font-black text-teal-700 dark:text-teal-350">
                                                        {t('pacs.recon.bestCandidate', { defaultValue: 'Best candidate' })}
                                                    </span>
                                                )}
                                                <ConfidenceChip score={confidence} t={t} />
                                                <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">{exam.status || missing}</span>
                                                {exam.scheduled_datetime && (
                                                    <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                                                        {formatDate(exam.scheduled_datetime, locale)}
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {selected && (
                            <MatchChecklist study={study} exam={selected} t={t} />
                        )}
                    </main>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200/50 bg-slate-50/80 px-5 py-4 dark:border-slate-800/50 dark:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between backdrop-blur-sm">
                    <div className="min-w-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {selected ? (
                            <span>
                                {t('pacs.recon.selectedExam', { defaultValue: 'Selected exam' })}: <strong dir="ltr" className="font-mono text-slate-900 dark:text-slate-200">{selected.order_number || selected.exam_id}</strong>
                                {selectedScore < 2 && (
                                    <span className="ms-2 inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/20 dark:text-amber-300 dark:ring-amber-900/40">
                                        <AlertOctagon size={11} />
                                        {t('pacs.recon.lowConfidenceSelection', { defaultValue: 'Low-confidence manual link' })}
                                    </span>
                                )}
                            </span>
                        ) : t('pacs.recon.selectExamHelp', { defaultValue: 'Select an examination to enable linking.' })}
                    </div>
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-350 dark:hover:bg-slate-800 transition">
                            {t('actions.cancel', { defaultValue: 'Cancel' })}
                        </button>
                        <button type="button" disabled={!selected} onClick={() => onConfirm(selected.exam_id)} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50 transition shadow-sm shadow-teal-500/10">
                            <Link2 size={13} />
                            {t('pacs.recon.confirm', { defaultValue: 'Confirm link' })}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

const ConfirmDiscardDialog = ({ study, busy, onClose, onConfirm, t, locale }) => createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md animate-in fade-in duration-150" onClick={onClose}>
        <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/60 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-slate-700/50 dark:bg-[#0b1426]/95 animate-in zoom-in-95 duration-150" onClick={(event) => event.stopPropagation()}>
            <DialogHeader title={t('pacs.recon.discardTitle', { defaultValue: 'Discard quarantined study?' })} icon={Trash2} onClose={onClose} danger />
            <div className="space-y-4 p-5 text-sm text-slate-600 dark:text-slate-300">
                <p className="font-semibold">{t('pacs.recon.discardWarning', { defaultValue: 'This marks the study as discarded. It will no longer appear in the pending reconciliation queue.' })}</p>
                <div className="rounded-xl bg-slate-50 dark:bg-slate-950/40 p-4 text-xs">
                    <p className="font-black text-slate-900 dark:text-slate-100">{study.raw_patient_name || missing}</p>
                    <p dir="ltr" className="mt-1 truncate font-mono text-slate-405">{study.raw_accession_number || study.study_instance_uid || missing}</p>
                    <p className="mt-2 text-slate-400 font-medium">{formatDate(study.created_at, locale)}</p>
                </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-350 dark:hover:bg-slate-800 disabled:opacity-50 transition">
                    {t('actions.cancel', { defaultValue: 'Cancel' })}
                </button>
                <button type="button" onClick={onConfirm} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 transition">
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    {t('pacs.recon.discard', { defaultValue: 'Discard' })}
                </button>
            </div>
        </div>
    </div>,
    document.body
);

const DialogHeader = ({ title, icon: Icon, onClose, danger = false }) => {
    const { t } = useTranslation('common');
    return (
        <div className="flex items-center justify-between border-b border-slate-200/50 bg-white/50 px-5 py-4 backdrop-blur-md dark:border-slate-800/50 dark:bg-slate-900/50">
            <div className="flex min-w-0 items-center gap-2">
                <Icon size={17} className={`shrink-0 ${danger ? 'text-rose-500' : 'text-teal-600 dark:text-teal-400'}`} />
                <h2 className="truncate text-sm font-black text-slate-800 dark:text-slate-100">{title}</h2>
            </div>
            <button type="button" onClick={onClose} title={t('actions.close', { defaultValue: 'Close' })} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300" aria-label={t('actions.close', { defaultValue: 'Close' })}>
                <X size={18} />
            </button>
        </div>
    );
};

const Metric = ({ icon: Icon, label, value, tone = 'cyan', compact = false }) => {
    const toneClass = {
        rose: 'bg-gradient-to-br from-rose-100/80 to-rose-50/40 text-rose-600 ring-rose-200/50 dark:from-rose-950/40 dark:to-rose-900/10 dark:text-rose-455 dark:ring-rose-900/30',
        amber: 'bg-gradient-to-br from-amber-100/80 to-amber-50/40 text-amber-600 ring-amber-200/50 dark:from-amber-950/40 dark:to-amber-900/10 dark:text-amber-400 dark:ring-amber-900/30',
        emerald: 'bg-gradient-to-br from-emerald-100/80 to-emerald-50/40 text-emerald-600 ring-emerald-200/50 dark:from-emerald-950/40 dark:to-emerald-900/10 dark:text-emerald-400 dark:ring-emerald-900/30',
        cyan: 'bg-gradient-to-br from-teal-100/80 to-teal-50/40 text-teal-600 ring-teal-200/50 dark:from-teal-950/40 dark:to-teal-900/10 dark:text-teal-400 dark:ring-teal-900/30'
    }[tone] || 'bg-gradient-to-br from-teal-100/80 to-teal-50/40 text-teal-600 ring-teal-200/50 dark:from-teal-950/40 dark:to-teal-900/10 dark:text-teal-400 dark:ring-teal-900/30';

    return (
        <div className="group border-b border-slate-100 p-4 transition-all duration-300 last:border-b-0 hover:bg-white/80 dark:border-white/[0.04] dark:hover:bg-slate-900/40 sm:border-e sm:last:border-e-0 xl:border-b-0 bg-white/40 dark:bg-white/[0.01]">
            <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 transition-colors group-hover:text-slate-600 dark:group-hover:text-slate-300">{label}</p>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset shadow-sm transition-transform duration-300 group-hover:scale-110 ${toneClass}`}>
                    <Icon size={17} />
                </span>
            </div>
            <p className={`mt-2 font-black text-slate-900 transition-all dark:text-slate-100 group-hover:tracking-tight ${compact ? 'truncate text-xs font-semibold text-slate-500 dark:text-slate-400' : 'text-xl drop-shadow-sm'}`}>{value}</p>
        </div>
    );
};

const CommandChip = ({ icon: Icon, label, value, tone = 'cyan' }) => {
    const toneClass = {
        rose: 'bg-rose-50/80 text-rose-700 ring-rose-200/60 shadow-[0_2px_10px_-3px_rgba(225,29,72,0.1)] dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-800/40',
        emerald: 'bg-emerald-50/80 text-emerald-700 ring-emerald-200/60 shadow-[0_2px_10px_-3px_rgba(16,185,129,0.1)] dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-800/40',
        cyan: 'bg-teal-50/80 text-teal-700 ring-teal-200/60 shadow-[0_2px_10px_-3px_rgba(20,184,166,0.1)] dark:bg-teal-950/30 dark:text-teal-400 dark:ring-teal-800/40'
    }[tone] || 'bg-teal-50/80 text-teal-700 ring-teal-200/60 shadow-[0_2px_10px_-3px_rgba(20,184,166,0.1)] dark:bg-teal-950/30 dark:text-teal-400 dark:ring-teal-800/40';

    return (
        <div className={`flex min-h-10 items-center gap-2 rounded-xl px-3 ring-1 ring-inset backdrop-blur-sm transition-transform duration-300 hover:scale-[1.02] ${toneClass}`}>
            <Icon size={15} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[10px] font-black uppercase tracking-wider opacity-90">{label}</span>
            <span className="text-sm font-black drop-shadow-sm">{value}</span>
        </div>
    );
};

const TooltipButton = ({ label, tooltip, icon: Icon, onClick, disabled, loading, primary = false, danger = false, fullWidth = false }) => {
    const base = `group relative inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 ${fullWidth ? 'w-full' : ''}`;
    const tone = primary
        ? 'bg-gradient-to-br from-teal-500 to-teal-600 text-white shadow-sm hover:from-teal-400 hover:to-teal-500 hover:shadow-md hover:shadow-teal-500/20 focus-visible:ring-teal-500'
        : danger
            ? 'border border-rose-200/60 bg-rose-50/80 text-rose-600 shadow-sm backdrop-blur-sm hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400 dark:hover:border-rose-800 dark:hover:bg-rose-900/40 focus-visible:ring-rose-500'
            : 'border border-slate-200/60 bg-white/80 text-slate-700 shadow-sm backdrop-blur-sm hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800/80 focus-visible:ring-slate-400';
    return (
        <button type="button" onClick={onClick} disabled={disabled} title={tooltip || label} aria-label={tooltip || label} className={`${base} ${tone}`}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
            <span>{label}</span>
            {tooltip && (
                <span className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] start-1/2 z-20 max-w-56 -translate-x-1/2 rounded-xl bg-slate-900/95 px-3 py-2 text-[10px] font-semibold leading-relaxed text-white opacity-0 shadow-xl backdrop-blur-sm transition-all duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 dark:bg-white/95 dark:text-slate-900">
                    {tooltip}
                </span>
            )}
        </button>
    );
};

const FilterSelect = ({ icon: Icon, value, onChange, label, allLabel, options }) => (
    <label className="relative">
        <span className="sr-only">{label}</span>
        <Icon size={14} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="min-h-11 w-full appearance-none rounded-xl border border-slate-200/60 bg-white/80 ps-10 pe-8 text-sm font-bold text-slate-700 shadow-sm backdrop-blur-sm transition-all duration-200 focus-within:border-teal-300 focus-within:ring-4 focus-within:ring-teal-500/10 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-200 outline-none"
        >
            {allLabel && <option value={all}>{allLabel}</option>}
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 border-5 border-transparent border-t-slate-400 dark:border-t-slate-600" />
    </label>
);

const FilterPill = ({ label, value }) => (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-gradient-to-r from-slate-100 to-slate-50 px-2.5 py-0.5 text-slate-700 ring-1 ring-inset ring-slate-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)] dark:from-slate-800/80 dark:to-slate-900/80 dark:text-slate-300 dark:ring-slate-700/50">
        <span className="shrink-0 text-slate-400">{label}</span>
        <span className="truncate font-black">{value}</span>
    </span>
);

const ProtocolStep = ({ index, text }) => (
    <li className="flex gap-3">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[10px] font-black text-teal-700 ring-1 ring-teal-100 dark:bg-teal-950/30 dark:text-teal-400 dark:ring-teal-900/50">{index}</span>
        <span className="leading-normal">{text}</span>
    </li>
);

const MetaLine = ({ label, value, mono = false }) => (
    <div>
        <p className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">{label}</p>
        <p dir={mono ? 'ltr' : undefined} className={`mt-1 break-words text-xs font-bold text-slate-700 dark:text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
);

const ConfidenceChip = ({ score, t }) => {
    const label = score >= 4
        ? t('pacs.recon.match.high', { defaultValue: 'Strong match' })
        : score >= 2
            ? t('pacs.recon.match.medium', { defaultValue: 'Partial match' })
            : t('pacs.recon.match.low', { defaultValue: 'Review carefully' });
    const tone = score >= 4
        ? 'bg-gradient-to-r from-emerald-50 to-emerald-100/40 text-emerald-700 ring-emerald-200/60 shadow-[0_1px_2px_rgba(16,185,129,0.1)] dark:from-emerald-950/30 dark:to-emerald-900/10 dark:text-emerald-400 dark:ring-emerald-800/40'
        : score >= 2
            ? 'bg-gradient-to-r from-amber-50 to-amber-100/40 text-amber-700 ring-amber-200/60 shadow-[0_1px_2px_rgba(245,158,11,0.1)] dark:from-amber-950/30 dark:to-amber-900/10 dark:text-amber-400 dark:ring-amber-800/40'
            : 'bg-gradient-to-r from-slate-100 to-slate-50 text-slate-650 ring-slate-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)] dark:from-slate-800/80 dark:to-slate-900/80 dark:text-slate-400 dark:ring-slate-700/50';

    return (
        <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[9px] font-black ring-1 ${tone}`}>
            <CheckCircle2 size={11} />
            {label}
        </span>
    );
};

const MatchDetailPills = ({ details, t }) => (
    details.map((detail) => (
        <span
            key={detail.key}
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-black ring-1 ${
                detail.ok
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-350 dark:ring-emerald-900/40'
                    : 'bg-slate-50 text-slate-400 ring-slate-200 dark:bg-slate-900 dark:text-slate-500 dark:ring-slate-800'
            }`}
        >
            {detail.ok ? <CheckCircle2 size={10} /> : <X size={10} />}
            {t(`pacs.recon.matchSignals.${detail.key}`, { defaultValue: detail.label })}
        </span>
    ))
);

const RiskBadge = ({ severity, t }) => {
    const label = severity >= 3
        ? t('pacs.recon.risk.critical', { defaultValue: 'Critical review' })
        : severity >= 2
            ? t('pacs.recon.risk.review', { defaultValue: 'Needs review' })
            : t('pacs.recon.risk.routine', { defaultValue: 'Routine' });
    const tone = severity >= 3
        ? 'bg-gradient-to-r from-rose-50 to-rose-100/40 text-rose-700 ring-rose-200/60 shadow-[0_1px_2px_rgba(225,29,72,0.1)] dark:from-rose-950/30 dark:to-rose-900/10 dark:text-rose-400 dark:ring-rose-800/40'
        : severity >= 2
            ? 'bg-gradient-to-r from-amber-50 to-amber-100/40 text-amber-700 ring-amber-200/60 shadow-[0_1px_2px_rgba(245,158,11,0.1)] dark:from-amber-950/30 dark:to-amber-900/10 dark:text-amber-400 dark:ring-amber-800/40'
            : 'bg-gradient-to-r from-slate-100 to-slate-50 text-slate-600 ring-slate-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.02)] dark:from-slate-800/80 dark:to-slate-900/80 dark:text-slate-400 dark:ring-slate-700/50';

    return (
        <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[9px] font-black ring-1 ${tone}`}>
            <ShieldAlert size={11} />
            {label}
        </span>
    );
};

const MatchChecklist = ({ study, exam, t }) => {
    const checks = matchDetails(study, exam);

    return (
        <section className="mt-5 rounded-xl border border-slate-200/60 bg-slate-50/80 p-4 shadow-sm backdrop-blur-sm animate-in slide-in-from-bottom-2 duration-200 dark:border-slate-700/50 dark:bg-slate-900/40">
            <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                    <Database size={16} className="text-teal-600 dark:text-teal-400" />
                    <h3 className="text-xs font-black text-slate-805 dark:text-slate-100">
                        {t('pacs.recon.matchReview', { defaultValue: 'DICOM Header Comparison' })}
                    </h3>
                </div>
                <ConfidenceChip score={matchConfidence(study, exam)} t={t} />
            </div>
            
            <div className="overflow-hidden rounded-xl border border-slate-200/60 bg-white/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)] backdrop-blur-sm dark:border-slate-700/50 dark:bg-[#060b13]/80">
                <table className="min-w-full text-xs text-start">
                    <thead className="border-b border-slate-200/50 bg-slate-50/80 text-[10px] font-black uppercase text-slate-500 dark:border-slate-800/50 dark:bg-slate-900/50">
                        <tr>
                            <th className="px-4 py-2.5 text-start">{t('pacs.recon.matchTable.tag', { defaultValue: 'Metadata tag' })}</th>
                            <th className="px-4 py-2.5 text-start">{t('pacs.recon.matchTable.inbound', { defaultValue: 'Inbound DICOM file' })}</th>
                            <th className="px-4 py-2.5 text-start">{t('pacs.recon.matchTable.order', { defaultValue: 'Scheduled RIS exam' })}</th>
                            <th className="px-4 py-2.5 text-center">{t('pacs.recon.matchTable.status', { defaultValue: 'Status' })}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                        {checks.map((check) => (
                            <tr key={check.key} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40">
                                <td className="px-4 py-3 font-bold text-slate-550 dark:text-slate-400">{t(`pacs.recon.matchSignals.${check.key}`, { defaultValue: check.label })}</td>
                                <td className="px-4 py-3 font-mono text-[11px] text-slate-700 dark:text-slate-300 break-all">{check.inbound}</td>
                                <td className="px-4 py-3 font-mono text-[11px] text-slate-700 dark:text-slate-300 break-all">{check.order}</td>
                                <td className="px-4 py-3 text-center">
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase ring-1 ${
                                        check.ok 
                                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:ring-emerald-900/30' 
                                            : 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:ring-rose-900/30'
                                    }`}>
                                        {check.ok
                                            ? t('pacs.recon.matchStatus.match', { defaultValue: 'MATCH' })
                                            : t('pacs.recon.matchStatus.mismatch', { defaultValue: 'MISMATCH' })}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

const PageState = ({ icon: Icon, title, detail, actionLabel, action, spin = false, success = false }) => (
    <div className="flex min-h-[46vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 text-center shadow-xs dark:border-slate-800 dark:bg-[#0b1426]">
        <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${success ? 'bg-emerald-50 text-emerald-500 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border dark:border-slate-800'}`}>
            <Icon size={24} className={spin ? 'animate-spin' : ''} />
        </span>
        <p className="mt-3.5 text-sm font-black text-slate-700 dark:text-slate-200">{title}</p>
        {detail && <p className="mt-1 max-w-md text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">{detail}</p>}
        {action && <button type="button" onClick={action} className="mt-4.5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-teal-600 px-5 text-xs font-bold text-white hover:bg-teal-700 shadow-sm shadow-teal-500/10 transition">{actionLabel}</button>}
    </div>
);

const countBy = (items, getKey) => items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
}, {});

const uniqueValues = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

const matchConfidence = (study, exam) => matchDetails(study, exam).reduce((score, detail) => score + (detail.ok ? detail.weight : 0), 0);

const matchDetails = (study, exam) => [
    {
        key: 'accession',
        label: 'Accession',
        weight: 3,
        inbound: study.raw_accession_number || missing,
        order: exam.order_number || exam.exam_id || missing,
        ok: valuesMatch(study.raw_accession_number, exam.order_number)
    },
    {
        key: 'patientId',
        label: 'Patient ID',
        weight: 2,
        inbound: study.raw_patient_id || missing,
        order: exam.mrn || missing,
        ok: valuesMatch(study.raw_patient_id, exam.mrn)
    },
    {
        key: 'patientName',
        label: 'Patient name',
        weight: 1,
        inbound: study.raw_patient_name || missing,
        order: exam.patient_name || missing,
        ok: namesCompatible(study.raw_patient_name, exam.patient_name)
    },
    {
        key: 'modality',
        label: 'Modality',
        weight: 1,
        inbound: study.modality || missing,
        order: exam.modality_type || exam.modality_name || missing,
        ok: modalityCompatible(study.modality, exam.modality_type || exam.modality_name)
    }
];

const valuesMatch = (first, second) => Boolean(first && second && String(first).trim().toLowerCase() === String(second).trim().toLowerCase());

const normalizeText = (value) => String(value || '')
    .toLowerCase()
    .replace(/\^/g, ' ')
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .trim();

const namesCompatible = (first, second) => {
    const a = normalizeText(first);
    const b = normalizeText(second);
    if (!a || !b) return false;
    return a === b || a.split(' ').filter(Boolean).every((part) => b.includes(part));
};

const normalizeModality = (value) => {
    const input = normalizeText(value).replace(/\s+/g, '');
    const aliases = {
        xray: 'dx',
        'x-ray': 'dx',
        radiography: 'dx',
        digitalradiography: 'dx',
        dr: 'dx',
        dx: 'dx',
        cr: 'cr',
        mri: 'mr',
        mr: 'mr',
        ct: 'ct',
        ultrasound: 'us',
        us: 'us',
        mammography: 'mg',
        mammo: 'mg',
        mg: 'mg',
        petct: 'pt',
        pet: 'pt'
    };
    return aliases[input] || input;
};

const modalityCompatible = (first, second) => {
    const a = normalizeModality(first);
    const b = normalizeModality(second);
    if (!a || !b) return false;
    return a === b || b.includes(a) || a.includes(b);
};

const getRiskBorder = (severity) => {
    if (severity >= 3) return 'border-s-[3px] border-s-rose-500 shadow-[inset_3px_0_10px_rgba(225,29,72,0.08)] dark:border-s-rose-500 dark:shadow-[inset_3px_0_12px_rgba(225,29,72,0.15)]';
    if (severity >= 2) return 'border-s-[3px] border-s-amber-500 shadow-[inset_3px_0_10px_rgba(245,158,11,0.08)] dark:border-s-amber-500 dark:shadow-[inset_3px_0_12px_rgba(245,158,11,0.15)]';
    return 'border-s-[3px] border-s-slate-200 dark:border-s-slate-700';
};

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

const getLoadErrorTitle = (error, t) => {
    if (error?.status === 401) return t('pacs.recon.authError', { defaultValue: 'Please sign in again' });
    if (error?.status === 403) return t('pacs.recon.permissionError', { defaultValue: 'PACS reconciliation access is not enabled' });
    return t('pacs.recon.loadError', { defaultValue: 'Could not load PACS quarantine' });
};

const getLoadErrorDetail = (error, t) => {
    if (error?.status === 401) {
        return t('pacs.recon.authErrorHelp', { defaultValue: 'Your session token is missing or expired.' });
    }
    if (error?.status === 403) {
        return t('pacs.recon.permissionErrorHelp', { defaultValue: 'Ask an administrator to grant RECONCILE_STUDIES or MANAGE_PACS.' });
    }
    return error?.data?.message || error?.data?.error || t('pacs.recon.loadErrorHelp', { defaultValue: 'Check the backend connection and try again.' });
};

export default PacsReconciliation;
