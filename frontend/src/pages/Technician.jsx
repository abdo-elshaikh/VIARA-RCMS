import React, { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowRight,
    Baby,
    Bell,
    CheckCircle2,
    Clock,
    Clock3,
    Filter,
    FilterX,
    HeartPulse,
    Layers,
    Loader2,
    Monitor,
    Play,
    Radio,
    RefreshCw,
    Scan,
    ScanLine,
    Search,
    ShieldAlert,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    Timer,
    UserCheck,
    UserRound,
    Zap
} from 'lucide-react';
import {
    useGetWorklistQuery,
    useUpdateReportMutation,
    useTransitionQueueMutation,
    useCompleteAcquisitionMutation,
    useBroadcastPatientCallMutation,
    useGetEquipmentDowntimeQuery
} from '../store/api';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';
import Modal from '../components/ui/Modal';
import { getPaginationState } from '../utils/pagination';
import { formatLocalizedDate } from '../utils/localizedDate';

const normalizeStatus = (status = '') => String(status).toLowerCase().replace(/\s+/g, '_');

const ar = {
    eyebrow: 'إدارة أجهزة وغرف التصوير الإشعاعي',
    title: 'لوحة تحكم فني الأشعة',
    description: 'متابعة المرضى الواصلين، بدء جلسات التصوير الطبي، تسجيل موانع الفحص، وتسليم الدراسات المكتملة للأطباء لكتابة التقرير.',
    checkedIn: 'جاهز للتصوير',
    scanning: 'جاري التصوير الآن',
    statPriority: 'حالات طارئة وعاجلة',
    completedToday: 'دراسات مكتملة اليوم',
    searchPlaceholder: 'بحث باسم المريض، الرقم الطبي MRN، أو نوع الفحص...',
    modality: 'نوع الجهاز',
    allModalities: 'جميع الأجهزة',
    priority: 'الأولوية',
    allPriorities: 'جميع الحالات',
    startScan: 'بدء التصوير (Acquisition)',
    completeScan: 'إنهاء الفحص والتسليم للتقرير',
    openPacs: 'عارض DICOM (PACS)',
    viewCase: 'ملف الحالة',
    notes: 'الملاحظات الإكلينيكية والبروتوكول',
    noNotes: 'لا توجد ملاحظات خاصة بالبروتوكول.',
    safetyClear: 'فحص السلامة سليم',
    safetyRisk: 'تنبيه موانع فحص',
    elapsed: 'الوقت المنقضي',
    room: 'الغرفة / الجهاز',
    liveSync: 'مزامنة حية',
    emptyTitle: 'لا يوجد مرضى في قائمة الانتظار الحالية',
    emptyDesc: 'ستظهر هنا الحالات التي تم تأكيد وصولها أو التي يجري تصويرها حالياً.',
    scanStarted: 'تم بدء جلسة التصوير بنجاح.',
    scanCompleted: 'تم إنهاء التصوير ونقل الحالة إلى قائمة كتابة التقارير.'
};

const tr = (t, key, defaultEn, defaultAr, isAr) => t(key, { defaultValue: isAr ? defaultAr : defaultEn });

/* ─── Active Scan Timer Sub-component ─── */
const LiveScanTimer = ({ startedAt }) => {
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        const parsedStartTime = startedAt ? new Date(startedAt).getTime() : NaN;
        const startTime = Number.isFinite(parsedStartTime) ? parsedStartTime : Date.now();
        const update = () => {
            const now = Date.now();
            setSeconds(Math.max(0, Math.floor((now - startTime) / 1000)));
        };
        update();
        const interval = setInterval(update, 1000);
        return () => clearInterval(interval);
    }, [startedAt]);

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    return (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-black text-cyan-600 dark:text-cyan-400">
            <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
            </span>
            {formatted}
        </span>
    );
};

const Technician = () => {
    const { t, i18n } = useTranslation(['technician', 'worklist', 'common']);
    const navigate = useNavigate();
    const isAr = i18n.language?.startsWith('ar');
    const isRtl = i18n.dir() === 'rtl';

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [modalityFilter, setModalityFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');
    const [viewFilter, setViewFilter] = useState('all'); // all, checked_in, scanning
    const [completionTarget, setCompletionTarget] = useState(null);

    const { data: examsResponse, isLoading, refetch, isFetching } = useGetWorklistQuery(undefined, {
        pollingInterval: 15000,
        refetchOnFocus: true
    });
    const { data: downtimeRecords = [] } = useGetEquipmentDowntimeQuery(undefined, { pollingInterval: 30000 });

    const activeDowntimes = useMemo(() => {
        return (Array.isArray(downtimeRecords) ? downtimeRecords : []).filter(r => r.status !== 'Resolved');
    }, [downtimeRecords]);
    const [updateStatus, { isLoading: isUpdating }] = useUpdateReportMutation();
    const [transitionQueue] = useTransitionQueueMutation();
    const [completeAcquisition, { isLoading: isCompleting }] = useCompleteAcquisitionMutation();
    const [broadcastPatientCall] = useBroadcastPatientCallMutation();

    const allExams = useMemo(() => {
        const rows = Array.isArray(examsResponse) ? examsResponse : examsResponse?.data || [];
        return rows.filter((exam) => {
            const st = normalizeStatus(exam.status || exam.queue_stage);
            return ['checked_in', 'arrived', 'scanning', 'in_exam', 'ready_for_exam'].includes(st);
        });
    }, [examsResponse]);

    // Available modalities
    const modalities = useMemo(() => {
        const set = new Set();
        allExams.forEach((e) => {
            const m = e.modality_type || e.modality_name;
            if (m) set.add(m);
        });
        return Array.from(set);
    }, [allExams]);

    // Filtered exams
    const filteredExams = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return allExams.filter((exam) => {
            const st = normalizeStatus(exam.status || exam.queue_stage);
            const isScanning = ['scanning', 'in_exam'].includes(st);
            const isCheckedIn = ['checked_in', 'arrived', 'ready_for_exam'].includes(st);

            if (viewFilter === 'scanning' && !isScanning) return false;
            if (viewFilter === 'checked_in' && !isCheckedIn) return false;

            if (modalityFilter !== 'all') {
                const m = exam.modality_type || exam.modality_name;
                if (m !== modalityFilter) return false;
            }

            if (priorityFilter !== 'all' && (exam.priority || 'Routine') !== priorityFilter) {
                return false;
            }

            if (q) {
                const combined = [
                    exam.patient_name,
                    exam.mrn,
                    exam.order_number,
                    exam.exam_id,
                    exam.exam_type_name,
                    exam.modality_name,
                    exam.machine_name
                ].filter(Boolean).join(' ').toLowerCase();
                if (!combined.includes(q)) return false;
            }

            return true;
        });
    }, [allExams, modalityFilter, priorityFilter, searchQuery, viewFilter]);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(6);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, modalityFilter, priorityFilter, viewFilter, pageSize]);

    const { pageCount, startIndex, endIndex } = useMemo(
        () => getPaginationState(filteredExams.length, currentPage, pageSize),
        [filteredExams.length, currentPage, pageSize]
    );

    const pagedExams = useMemo(
        () => filteredExams.slice(startIndex, endIndex),
        [filteredExams, startIndex, endIndex]
    );

    // Metrics
    const metrics = useMemo(() => {
        const scanning = allExams.filter((e) => ['scanning', 'in_exam'].includes(normalizeStatus(e.status || e.queue_stage))).length;
        const checkedIn = allExams.filter((e) => ['checked_in', 'arrived', 'ready_for_exam'].includes(normalizeStatus(e.status || e.queue_stage))).length;
        const statCount = allExams.filter((e) => ['Emergency', 'Urgent'].includes(e.priority)).length;
        return { scanning, checkedIn, statCount, total: allExams.length };
    }, [allExams]);

    const handleAction = async (exam, targetStatus) => {
        try {
            if (transitionQueue && exam.exam_id) {
                await transitionQueue({
                    examId: exam.exam_id,
                    toStage: targetStatus === 'Reporting' ? 'Reporting' : 'In Exam'
                }).unwrap();
            } else {
                await updateStatus({
                    examId: exam.exam_id,
                    content: exam.report_content || '',
                    status: targetStatus
                }).unwrap();
            }
            toast.success(targetStatus === 'Scanning' || targetStatus === 'In Exam' ? (isAr ? ar.scanStarted : 'Scan started.') : (isAr ? ar.scanCompleted : 'Scan completed. Sent to reporting.'));
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || t('actionFailed', { ns: 'common' }));
        }
    };

    const completeScan = async (resultMode) => {
        if (!completionTarget?.exam_id) return;
        try {
            await completeAcquisition({
                examId: completionTarget.exam_id,
                resultMode
            }).unwrap();
            toast.success(resultMode === 'ImagesOnly'
                ? (isAr ? 'تم إنهاء الفحص وتجهيز الصور للاستلام دون تقرير.' : 'Examination completed. Images are ready for pickup without a report.')
                : (isAr ? 'تم إنهاء الفحص وإرساله إلى قائمة التقارير.' : 'Examination completed and sent to reporting.'));
            setCompletionTarget(null);
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || (isAr ? 'تعذر إنهاء الفحص.' : 'Could not complete the examination.'));
        }
    };

    return (
        <div className="space-y-4 pb-12" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Header */}
            <PageHeader
                icon={ScanLine}
                eyebrow={tr(t, 'technician.eyebrow', 'Modality Acquisition Operations', ar.eyebrow, isAr)}
                title={tr(t, 'technician.title', 'Technician Modality Workspace', ar.title, isAr)}
                description={tr(t, 'technician.description', 'Track arrived patients, trigger image acquisitions, review safety contraindications, and handover completed studies to reporting radiologists.', ar.description, isAr)}
                meta={
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-black text-teal-700 dark:text-teal-300">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
                        </span>
                        {tr(t, 'technician.liveSync', 'Live Modality Deck', ar.liveSync, isAr)}
                    </span>
                }
                actions={
                    <div className="flex items-center gap-2">
                        <Link
                            to="/equipment"
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-4 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <Monitor size={14} className="text-teal-600 dark:text-teal-400" />
                            <span>{isAr ? 'حالة الأجهزة' : 'Equipment Status'}</span>
                        </Link>
                        <button
                            type="button"
                            onClick={() => refetch()}
                            disabled={isFetching}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-4 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                            <span>{tr(t, 'actions.refresh', 'Refresh Queue', 'تحديث القائمة', isAr)}</span>
                        </button>
                    </div>
                }
                metrics={[
                    { key: 'checked-in', icon: Timer, tone: 'amber', label: tr(t, 'technician.checkedIn', 'Waiting / Checked-In', ar.checkedIn, isAr), value: metrics.checkedIn, onClick: () => setViewFilter(viewFilter === 'checked_in' ? 'all' : 'checked_in'), loading: isLoading },
                    { key: 'scanning', icon: ScanLine, tone: 'blue', label: tr(t, 'technician.scanning', 'In acquisition', ar.scanning, isAr), value: metrics.scanning, onClick: () => setViewFilter(viewFilter === 'scanning' ? 'all' : 'scanning'), loading: isLoading },
                    { key: 'priority', icon: AlertTriangle, tone: 'rose', label: tr(t, 'technician.priority', 'Priority cases', ar.priority, isAr), value: metrics.statCount, loading: isLoading },
                    { key: 'total', icon: Activity, tone: 'teal', label: tr(t, 'technician.totalQueue', 'Assigned studies', 'إجمالي قائمة الفني', isAr), value: metrics.total, loading: isLoading },
                ]}
                metricsLabel={isAr ? 'مؤشرات سجل فحوص الفني' : 'Technician work record indicators'}
            />

            {/* Equipment Downtime Warning Banner for Technicians */}
            {activeDowntimes.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-xs font-semibold text-amber-950 shadow-xs dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400">
                            <AlertTriangle size={18} />
                        </div>
                        <div>
                            <p className="font-black text-slate-900 dark:text-white">
                                {isAr
                                    ? `تنبيه صيانة الأجهزة: يوجد (${activeDowntimes.length}) جهاز في حالة توقف أو صيانة حالياً.`
                                    : `Equipment Maintenance Alert: (${activeDowntimes.length}) machine(s) currently under maintenance.`}
                            </p>
                            <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                                {isAr
                                    ? 'يرجى التنسيق مع مهندسي الصيانة والطب الحيوي، وتوجيه الحالات للأجهزة البديلة الشاغرة.'
                                    : 'Please coordinate with biomedical engineering and route scans to operational units.'}
                            </p>
                        </div>
                    </div>
                    <Link
                        to="/equipment?tab=downtime"
                        className="inline-flex items-center justify-center shrink-0 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-black text-white shadow-xs hover:bg-amber-700 transition"
                    >
                        {isAr ? 'سجل الأعطال والصيانة' : 'View Maintenance'}
                    </Link>
                </div>
            )}

            {/* Top Telemetry Metric HUD */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div
                    onClick={() => setViewFilter(viewFilter === 'checked_in' ? 'all' : 'checked_in')}
                    className={`cursor-pointer rounded-2xl border p-3.5 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md ${
                        viewFilter === 'checked_in'
                            ? 'border-amber-500 bg-amber-50/90 ring-2 ring-amber-500/20 dark:bg-amber-950/40'
                            : 'border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="grid h-9 w-9 place-items-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            <Timer size={18} />
                        </span>
                        <span className="font-mono text-[10px] font-black uppercase text-amber-600 dark:text-amber-400">READY</span>
                    </div>
                    <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {tr(t, 'technician.checkedIn', 'Waiting / Checked-In', ar.checkedIn, isAr)}
                    </p>
                    <p className="mt-0.5 text-2xl font-black tabular-nums text-slate-900 dark:text-white sm:text-3xl">
                        {metrics.checkedIn}
                    </p>
                </div>

                <div
                    onClick={() => setViewFilter(viewFilter === 'scanning' ? 'all' : 'scanning')}
                    className={`cursor-pointer rounded-2xl border p-3.5 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md ${
                        viewFilter === 'scanning'
                            ? 'border-cyan-500 bg-cyan-50/90 ring-2 ring-cyan-500/20 dark:bg-cyan-950/40'
                            : 'border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-500/30 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300">
                            <Scan size={18} className="animate-pulse" />
                        </span>
                        <span className="font-mono text-[10px] font-black uppercase text-cyan-600 dark:text-cyan-400">ACTIVE</span>
                    </div>
                    <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {tr(t, 'technician.scanning', 'Currently In-Scan', ar.scanning, isAr)}
                    </p>
                    <p className="mt-0.5 text-2xl font-black tabular-nums text-slate-900 dark:text-white sm:text-3xl">
                        {metrics.scanning}
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                    <div className="flex items-center justify-between">
                        <span className="grid h-9 w-9 place-items-center rounded-xl border border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300">
                            <AlertTriangle size={18} />
                        </span>
                        <span className="font-mono text-[10px] font-black uppercase text-rose-600 dark:text-rose-400">STAT</span>
                    </div>
                    <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {tr(t, 'technician.statPriority', 'Urgent / Emergency', ar.statPriority, isAr)}
                    </p>
                    <p className="mt-0.5 text-2xl font-black tabular-nums text-slate-900 dark:text-white sm:text-3xl">
                        {metrics.statCount}
                    </p>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                    <div className="flex items-center justify-between">
                        <span className="grid h-9 w-9 place-items-center rounded-xl border border-teal-500/30 bg-teal-500/15 text-teal-700 dark:text-teal-300">
                            <Layers size={18} />
                        </span>
                        <span className="font-mono text-[10px] font-black uppercase text-teal-600 dark:text-teal-400">QUEUE</span>
                    </div>
                    <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {tr(t, 'technician.totalQueue', 'Total Modality Queue', 'إجمالي قائمة الفني', isAr)}
                    </p>
                    <p className="mt-0.5 text-2xl font-black tabular-nums text-slate-900 dark:text-white sm:text-3xl">
                        {metrics.total}
                    </p>
                </div>
            </section>

            {/* Search & Filter Bar */}
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_200px_180px_auto]">
                    {/* Search Input */}
                    <div className="relative">
                        <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={tr(t, 'technician.search', 'Search patient name, MRN, exam type...', ar.searchPlaceholder, isAr)}
                            className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/70 ps-10 pe-4 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-slate-950/40 dark:text-white"
                        />
                    </div>

                    {/* Modality Filter */}
                    <select
                        value={modalityFilter}
                        onChange={(e) => setModalityFilter(e.target.value)}
                        className="h-10 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-white"
                    >
                        <option value="all">{tr(t, 'filters.allModalities', 'All Modalities (MRI, CT, XR...)', ar.allModalities, isAr)}</option>
                        {modalities.map((m) => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>

                    {/* Priority Filter */}
                    <select
                        value={priorityFilter}
                        onChange={(e) => setPriorityFilter(e.target.value)}
                        className="h-10 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-white"
                    >
                        <option value="all">{tr(t, 'filters.allPriorities', 'All Priorities', ar.allPriorities, isAr)}</option>
                        <option value="Emergency">Emergency / Stat</option>
                        <option value="Urgent">Urgent</option>
                        <option value="Routine">Routine</option>
                    </select>

                    {/* Clear Filters */}
                    {(searchQuery || modalityFilter !== 'all' || priorityFilter !== 'all' || viewFilter !== 'all') && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearchQuery('');
                                setModalityFilter('all');
                                setPriorityFilter('all');
                                setViewFilter('all');
                            }}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                            <FilterX size={14} />
                            <span>{tr(t, 'filters.clear', 'Clear', 'مسح', isAr)}</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Main Modality Queue */}
            {isLoading ? (
                <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-200/80 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 size={32} className="animate-spin text-teal-600 dark:text-teal-400" />
                        <p className="text-sm font-bold text-slate-600 dark:text-slate-400">Loading technician queue...</p>
                    </div>
                </div>
            ) : filteredExams.length === 0 ? (
                <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 text-center shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                    <CheckCircle2 size={40} className="mx-auto text-emerald-600" />
                    <h3 className="mt-3 text-base font-black text-slate-900 dark:text-white">
                        {tr(t, 'technician.emptyTitle', 'No patients waiting for scan acquisition', ar.emptyTitle, isAr)}
                    </h3>
                    <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                        {tr(t, 'technician.emptyDesc', 'Checked-in patients and ongoing scans will appear here automatically.', ar.emptyDesc, isAr)}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {pagedExams.map((exam) => {
                        const st = normalizeStatus(exam.status || exam.queue_stage);
                        const isScanning = ['scanning', 'in_exam'].includes(st);
                        const isStat = ['Emergency', 'Urgent'].includes(exam.priority);
                        const modality = exam.modality_type || exam.modality_name || 'General';

                        return (
                            <article
                                key={exam.exam_id}
                                className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-white/90 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md dark:bg-slate-900/90 ${
                                    isScanning
                                        ? 'border-cyan-500/50 ring-2 ring-cyan-500/20 dark:border-cyan-800'
                                        : isStat
                                        ? 'border-rose-500/40 dark:border-rose-900/60'
                                        : 'border-slate-200/80 dark:border-slate-800'
                                }`}
                            >
                                {/* Top colored status rail */}
                                <div className={`h-1.5 w-full ${isScanning ? 'bg-gradient-to-r from-cyan-500 to-teal-500' : isStat ? 'bg-rose-500' : 'bg-amber-400'}`} />

                                <div className="p-4 sm:p-5">
                                    {/* Header tags */}
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 font-mono text-[10px] font-black uppercase text-teal-700 dark:text-teal-300">
                                                {modality}
                                            </span>
                                            {exam.machine_name && (
                                                <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                    {exam.machine_name}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                            {isScanning ? (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase text-cyan-700 dark:text-cyan-300">
                                                    <LiveScanTimer startedAt={exam.exam_started_at} />
                                                </span>
                                            ) : (
                                                <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase text-amber-700 dark:text-amber-300">
                                                    {tr(t, 'technician.checkedIn', 'Ready for Scan', ar.checkedIn, isAr)}
                                                </span>
                                            )}

                                            {exam.priority === 'Emergency' && (
                                                <span className="rounded-full bg-rose-600 px-2 py-0.5 font-mono text-[9.5px] font-black uppercase text-white shadow-xs">
                                                    STAT
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Patient & Study Info */}
                                    <div className="mt-3.5 flex items-start gap-3">
                                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 font-black text-sm">
                                            {String(exam.patient_name || 'PT').charAt(0)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h3 className="truncate text-sm font-black text-slate-900 dark:text-white sm:text-base">
                                                {exam.patient_name || 'Patient Name'}
                                            </h3>
                                            <p className="truncate text-xs font-bold text-teal-700 dark:text-teal-400">
                                                {exam.exam_type_name || exam.modality_name || 'Diagnostic Examination'}
                                            </p>
                                            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                                <span>MRN: <strong>{exam.mrn || '—'}</strong></span>
                                                {exam.gender && <span>· {exam.gender}</span>}
                                                {exam.body_part && <span>· Part: <strong>{exam.body_part}</strong></span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Clinical Notes & Protocol Checklist */}
                                    <div className="mt-3.5 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/40">
                                        <p className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                                            <AlertCircle size={14} className="mt-0.5 shrink-0 text-slate-400" />
                                            <span className="line-clamp-2">
                                                <strong>{tr(t, 'technician.notes', 'Protocol Notes:', ar.notes, isAr)}</strong> {exam.clinical_indication || exam.notes || tr(t, 'technician.noNotes', 'Standard acquisition protocol.', ar.noNotes, isAr)}
                                            </span>
                                        </p>
                                    </div>

                                    {/* Safety Checklist Badges */}
                                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                        {exam.pregnancy_safety_status === 'At Risk' || exam.pregnancy_safety_status === 'Pregnant' ? (
                                            <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[9.5px] font-black text-rose-700 dark:text-rose-300">
                                                <Baby size={11} /> Pregnancy Alert
                                            </span>
                                        ) : null}
                                        {exam.implant_safety_status === 'At Risk' || exam.implant_safety_status === 'Danger' ? (
                                            <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[9.5px] font-black text-rose-700 dark:text-rose-300">
                                                <ShieldAlert size={11} /> Metal Implant
                                            </span>
                                        ) : null}
                                        {exam.renal_safety_status === 'At Risk' ? (
                                            <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9.5px] font-black text-amber-700 dark:text-amber-300">
                                                <HeartPulse size={11} /> Renal Caution
                                            </span>
                                        ) : null}
                                        {!['At Risk', 'Pregnant', 'Danger'].includes(exam.pregnancy_safety_status) && !['At Risk', 'Danger'].includes(exam.implant_safety_status) && (
                                            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9.5px] font-black text-emerald-700 dark:text-emerald-300">
                                                <ShieldCheck size={11} /> Safety Clear
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Action Buttons Footer */}
                                <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/30">
                                    <div className="flex items-center gap-2">
                                        {/* PACS Viewer Button (Shown only when images exist) */}
                                        {Boolean(exam.images_available || exam.has_images || Number(exam.image_count) > 0 || exam.study_instance_uid || (exam.pacs_status && !['No Images', 'Not Received', 'Pending', 'No Study', 'None'].includes(exam.pacs_status))) && (
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/pacs/viewer?examId=${exam.exam_id}`)}
                                                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 text-xs font-bold text-sky-800 transition hover:bg-sky-500/20 dark:text-sky-300"
                                                title="Open PACS DICOM Viewer"
                                            >
                                                <Radio size={13} className="text-sky-500" />
                                                <span>{tr(t, 'actions.pacs', 'PACS', ar.openPacs, isAr)}</span>
                                            </button>
                                        )}

                                        {/* Case File Details */}
                                        <button
                                            type="button"
                                            onClick={() => navigate(`/cases/${exam.exam_id}`)}
                                            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                            title="Open Case Details"
                                        >
                                            <Activity size={13} className="text-teal-600 dark:text-teal-400" />
                                            <span>{tr(t, 'actions.case', 'Case', ar.viewCase, isAr)}</span>
                                        </button>

                                        {/* Call Patient Broadcast Button */}
                                        {!isScanning && (
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    try {
                                                        await broadcastPatientCall({
                                                            orderNumber: exam.order_number || exam.accession_number || String(exam.exam_id),
                                                            patientName: exam.patient_name || '',
                                                            queueNumber: exam.queue_number || null,
                                                            roomName: exam.room_name || exam.machine_name || exam.modality_name || (isAr ? 'غرفة الفحص' : 'Exam Suite'),
                                                            modalityId: exam.modality_id || null,
                                                            callByName: Boolean(exam.patient_name)
                                                        }).unwrap();
                                                        toast.success(isAr ? `🔔 تم إرسال نداء للمريض ${exam.patient_name || exam.order_number || ''} لشاشات الانتظار` : '🔔 Patient call sent to waiting display');
                                                    } catch {
                                                        toast.error(isAr ? 'تعذر إرسال نداء المريض للشاشة' : 'Could not broadcast call');
                                                    }
                                                }}
                                                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 active:scale-95 shadow-2xs"
                                                title={isAr ? 'نداء المريض إلى غرفة الفحص على شاشات العرض' : 'Call patient to exam suite on display board'}
                                                aria-label={isAr ? 'نداء المريض' : 'Call patient'}
                                            >
                                                <Bell size={13} className="text-amber-600 dark:text-amber-400" />
                                                <span>{isAr ? 'نداء' : 'Call'}</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Primary Workflow Trigger */}
                                    <button
                                        type="button"
                                        onClick={() => isScanning ? setCompletionTarget(exam) : handleAction(exam, 'Scanning')}
                                        disabled={isUpdating || isCompleting}
                                        className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-black text-white shadow-xs transition active:scale-95 disabled:opacity-50 ${
                                            isScanning
                                                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                                                : 'bg-teal-600 hover:bg-teal-500 shadow-teal-600/20'
                                        }`}
                                    >
                                        {isScanning ? <CheckCircle2 size={16} /> : <Play size={16} />}
                                        <span>
                                            {isScanning
                                                ? tr(t, 'technician.completeScan', 'Complete Scan & Handover', ar.completeScan, isAr)
                                                : tr(t, 'technician.startScan', 'Start Acquisition', ar.startScan, isAr)}
                                        </span>
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                    </div>

                    {filteredExams.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                <span>
                                    {isAr
                                        ? `عرض ${startIndex + 1} - ${Math.min(endIndex, filteredExams.length)} من إجمالي ${filteredExams.length} فحص`
                                        : `Showing ${startIndex + 1} - ${Math.min(endIndex, filteredExams.length)} of ${filteredExams.length} exams`}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-400">{isAr ? 'لكل صفحة:' : 'Per page:'}</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => setPageSize(Number(e.target.value))}
                                    className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
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
            )}

            <Modal
                isOpen={Boolean(completionTarget)}
                onClose={() => !isCompleting && setCompletionTarget(null)}
                title={isAr ? 'إنهاء الفحص' : 'Complete examination'}
                size="sm"
            >
                <div className="space-y-4 p-5">
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {isAr
                            ? 'اختر مسار النتيجة لهذا الفحص. يمكن طلب التقرير لاحقًا إذا استلم المريض الصور فقط.'
                            : 'Choose the result path for this examination. A report can be requested later after images-only pickup.'}
                    </p>
                    <button
                        type="button"
                        disabled={isCompleting}
                        onClick={() => completeScan('ReportAndImages')}
                        className="flex w-full items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-start transition hover:border-violet-400 hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800 dark:bg-violet-950/30"
                    >
                        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-violet-600" />
                        <span>
                            <strong className="block text-sm text-violet-900 dark:text-violet-200">{isAr ? 'إرسال للتقرير' : 'Send to reporting'}</strong>
                            <span className="mt-1 block text-xs leading-5 text-violet-700 dark:text-violet-300">{isAr ? 'إنهاء التصوير وبدء مهمة إعداد التقرير.' : 'Complete acquisition and start the reporting task.'}</span>
                        </span>
                    </button>
                    <button
                        type="button"
                        disabled={isCompleting}
                        onClick={() => completeScan('ImagesOnly')}
                        className="flex w-full items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-start transition hover:border-emerald-400 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                    >
                        <ScanLine size={20} className="mt-0.5 shrink-0 text-emerald-600" />
                        <span>
                            <strong className="block text-sm text-emerald-900 dark:text-emerald-200">{isAr ? 'صور فقط — دون تقرير' : 'Images only — no report'}</strong>
                            <span className="mt-1 block text-xs leading-5 text-emerald-700 dark:text-emerald-300">{isAr ? 'إنهاء الفحص وتجهيز الصور للاستلام، مع إمكانية طلب التقرير لاحقًا.' : 'Finish the examination and prepare images for pickup; the report may be requested later.'}</span>
                        </span>
                    </button>
                </div>
            </Modal>
        </div>
    );
};

export default Technician;
