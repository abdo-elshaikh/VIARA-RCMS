import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
    Activity,
    AlertTriangle,
    ArrowLeft,
    Calendar,
    Check,
    ChevronDown,
    Clock,
    Copy,
    Download,
    Eye,
    Filter,
    FilterX,
    Key,
    Layers,
    Lock,
    Printer,
    Radio,
    RefreshCw,
    Search,
    Shield,
    ShieldAlert,
    ShieldCheck,
    ShieldX,
    Sparkles,
    User,
    UserCheck,
    Users,
    X,
    FileText,
    ExternalLink,
    BarChart3,
    TrendingUp,
    Info,
    Table as TableIcon,
    List,
    Trophy,
    Award,
    Moon,
    PlusCircle,
    Edit3,
    Trash2,
    Database,
    SearchCheck
} from 'lucide-react';
import {
    useGetStaffActivityLogsQuery,
    useGetStaffQuery
} from '../store/api';
import PageHeader from '../components/ui/PageHeader';
import Pagination from '../components/ui/Pagination';
import Modal from '../components/ui/Modal';
import { formatRelativeTime } from '../utils/dateFormat';
import { selectCurrentUser } from '../store/authSlice';

const PAGE_SIZE = 20;

const ROLE_THEMES = {
    Admin: { bg: 'from-violet-500/20 to-purple-600/20', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-300 dark:border-violet-800' },
    Developer: { bg: 'from-rose-500/20 to-pink-600/20', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-300 dark:border-rose-800' },
    Radiologist: { bg: 'from-cyan-500/20 to-blue-600/20', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-300 dark:border-cyan-800' },
    Technician: { bg: 'from-amber-500/20 to-orange-600/20', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-800' },
    Nurse: { bg: 'from-emerald-500/20 to-teal-600/20', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-800' },
    Receptionist: { bg: 'from-blue-500/20 to-indigo-600/20', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-800' },
    Cashier: { bg: 'from-indigo-500/20 to-violet-600/20', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-300 dark:border-indigo-800' },
    Accountant: { bg: 'from-sky-500/20 to-blue-600/20', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-300 dark:border-sky-800' },
    HR: { bg: 'from-fuchsia-500/20 to-pink-600/20', text: 'text-fuchsia-700 dark:text-fuchsia-300', border: 'border-fuchsia-300 dark:border-fuchsia-800' },
    Marketing: { bg: 'from-emerald-500/20 to-green-600/20', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-800' },
};

const CATEGORY_NAMES_AR = {
    DATA_WRITE: 'تعديل البيانات',
    BILLING: 'الفوترة والمالية',
    CONFIG: 'إعدادات النظام',
};

const CATEGORY_NAMES_EN = {
    DATA_WRITE: 'Data Modifications',
    BILLING: 'Billing & Cashier',
    CONFIG: 'System Settings'
};

const RESOURCE_TABLES = [
    { id: '', labelAr: 'كافة الجداول والأهداف', labelEn: 'All Resource Targets' },
    { id: 'patients', labelAr: 'سجلات المرضى (patients)', labelEn: 'Patients (patients)' },
    { id: 'examinations', labelAr: 'فحوصات الأشعة (examinations)', labelEn: 'Examinations (examinations)' },
    { id: 'invoices', labelAr: 'الفواتير والمالية (invoices)', labelEn: 'Invoices (invoices)' },
    { id: 'appointments', labelAr: 'المواعيد والحجوزات (appointments)', labelEn: 'Appointments (appointments)' },
    { id: 'modalities', labelAr: 'الأجهزة الطبية (modalities)', labelEn: 'Modalities (modalities)' },
    { id: 'users', labelAr: 'المستخدمون (users)', labelEn: 'Users (users)' },
];

const getOperationType = (log) => {
    const method = log.http_method?.toUpperCase();
    const action = (log.event_code || log.action || '').toUpperCase();
    const isDelete = method === 'DELETE' || action.includes('DELETE') || action.includes('REMOVE') || action.includes('VOID') || action.includes('CANCEL');
    if (isDelete) {
        return {
            type: 'delete',
            labelAr: 'حذف',
            labelEn: 'DELETE',
            badgeBg: 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900',
            icon: Trash2
        };
    }

    const isCreate = method === 'POST' || action.includes('CREATE') || action.includes('INSERT') || action.includes('REGISTER') || action.includes('BOOK');
    if (isCreate) {
        return {
            type: 'create',
            labelAr: 'إضافة',
            labelEn: 'CREATE',
            badgeBg: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
            icon: PlusCircle
        };
    }

    const isUpdate = method === 'PUT' || method === 'PATCH' || action.includes('UPDATE') || action.includes('EDIT') || action.includes('MODIFY') || action.includes('AMEND');
    if (isUpdate) {
        return {
            type: 'update',
            labelAr: 'تعديل',
            labelEn: 'UPDATE',
            badgeBg: 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-900',
            icon: Edit3
        };
    }

    return {
        type: 'query',
        labelAr: 'استعلام',
        labelEn: 'QUERY',
        badgeBg: 'bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-900',
        icon: Eye
    };
};

export default function UserActivityTracking() {
    const { t, i18n } = useTranslation(['admin', 'common'], { nsMode: 'fallback' });
    const isAr = i18n.language?.startsWith('ar');
    const locale = isAr ? 'ar-EG' : 'en-EG';
    const navigate = useNavigate();
    const currentUser = useSelector(selectCurrentUser);
    const canExportActivity = ['Developer', 'Admin'].includes(currentUser?.role)
        || currentUser?.permissions?.includes('EXPORT_STAFF_ACTIVITY')
        || currentUser?.elevatedPermissions?.includes('EXPORT_STAFF_ACTIVITY');
    const canViewAuditTrail = ['Developer', 'Admin', 'CISO', 'ComplianceOfficer'].includes(currentUser?.role)
        || currentUser?.permissions?.includes('VIEW_AUDIT_TRAILS')
        || currentUser?.elevatedPermissions?.includes('VIEW_AUDIT_TRAILS');

    // View Mode ('stream' | 'table' | 'leaderboard')
    const [viewMode, setViewMode] = useState('stream');

    // Live Auto-Refresh State
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [inspectingUser, setInspectingUser] = useState(null); // Modal for user analytics
    const [showVisualAnalytics, setShowVisualAnalytics] = useState(true);
    const [page, setPage] = useState(1);
    const [expandedLogId, setExpandedLogId] = useState(null);
    const [copiedId, setCopiedId] = useState(null);
    const [exporting, setExporting] = useState(false);

    // Filters State
    const [filters, setFilters] = useState({
        q: '',
        category: '',
        outcome: '',
        targetType: '',
        operationType: '', // 'create' | 'update' | 'delete' | 'query'
        startDate: '',
        endDate: '',
    });

    // Active scenario preset
    const [activeScenario, setActiveScenario] = useState('all');

    // Fetch Staff Roster
    const { data: staffList = [], isLoading: isStaffLoading } = useGetStaffQuery();

    // Active Query Parameters
    const queryParams = useMemo(() => {
        const params = {
            limit: PAGE_SIZE,
            offset: (page - 1) * PAGE_SIZE,
        };
        if (selectedUser) params.userId = selectedUser.user_id;
        if (filters.q) params.q = filters.q;
        if (filters.category) params.category = filters.category;
        if (filters.outcome) params.outcome = filters.outcome;
        if (filters.targetType) params.targetType = filters.targetType;
        if (filters.operationType) params.operationType = filters.operationType;
        if (filters.startDate) params.startDate = filters.startDate;
        if (filters.endDate) params.endDate = filters.endDate;
        return params;
    }, [page, selectedUser, filters]);

    // Fetch Audit Logs
    const {
        data: auditData,
        isLoading: isAuditLoading,
        isFetching: isAuditFetching,
        isError: isAuditError,
        refetch: refetchAudit
    } = useGetStaffActivityLogsQuery(queryParams, {
        pollingInterval: autoRefresh ? 12000 : 0
    });

    const logs = useMemo(() => auditData?.logs || [], [auditData?.logs]);
    const total = Number(auditData?.total || 0);
    const summary = auditData?.summary || {};
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // Reset pagination when filter criteria change
    const updateFilter = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setActiveScenario('custom');
        setPage(1);
    };

    const clearAllFilters = () => {
        setSelectedUser(null);
        setActiveScenario('all');
        setFilters({
            q: '',
            category: '',
            outcome: '',
            targetType: '',
            operationType: '',
            startDate: '',
            endDate: '',
        });
        setPage(1);
    };

    // Quick Date Preset Handlers
    const applyDatePreset = (days) => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);
        setFilters(prev => ({
            ...prev,
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0]
        }));
        setPage(1);
    };

    // Quick Scenario Handlers
    const handleApplyScenario = (scenarioId) => {
        setActiveScenario(scenarioId);
        setPage(1);
        switch (scenarioId) {
            case 'create':
                setFilters(prev => ({ ...prev, operationType: 'create', category: '', outcome: '' }));
                break;
            case 'update':
                setFilters(prev => ({ ...prev, operationType: 'update', category: '', outcome: '' }));
                break;
            case 'delete':
                setFilters(prev => ({ ...prev, operationType: 'delete', category: '', outcome: '' }));
                break;
            case 'query':
                setFilters(prev => ({ ...prev, operationType: 'query', category: '', outcome: '' }));
                break;
            case 'all':
            default:
                setFilters(prev => ({ ...prev, category: '', outcome: '', operationType: '' }));
                break;
        }
    };

    // Export CSV of filtered user activities
    const handleExportCsv = async () => {
        setExporting(true);
        try {
            const searchParams = new URLSearchParams({
                ...queryParams,
                limit: 50000,
                offset: 0
            });
            const API_BASE = import.meta.env.VITE_API_URL || '/api';
            const response = await fetch(`${API_BASE}/v1/audit/activity/export?${searchParams.toString()}`, {
                headers: {
                    ...(currentUser?.token ? { Authorization: `Bearer ${currentUser.token}` } : {})
                },
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Export failed');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `user-activity-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success(t('userActivityExportedSuccessfully'));
        } catch (error) {
            toast.error(t('failedToExportActivityLog'));
        } finally {
            setExporting(false);
        }
    };

    const copyLogPayload = (log) => {
        navigator.clipboard.writeText(JSON.stringify(log, null, 2));
        setCopiedId(log.log_id);
        toast.success(t('activityPayloadCopied'));
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Calculate dynamic hourly distribution of current events
    const hourlyActivity = useMemo(() => {
        const slots = Array(8).fill(0); // 3-hour buckets
        logs.forEach(l => {
            if (!l.timestamp) return;
            const hour = new Date(l.timestamp).getHours();
            const bucket = Math.floor(hour / 3);
            if (bucket >= 0 && bucket < 8) slots[bucket]++;
        });
        const max = Math.max(...slots, 1);
        return slots.map((count, i) => ({
            label: `${i * 3}:00`,
            count,
            percentage: Math.round((count / max) * 100)
        }));
    }, [logs]);

    // Anomaly detection: Out-of-hours operations (10 PM to 6 AM)
    const outOfHoursEvents = useMemo(() => {
        return logs.filter(l => {
            if (!l.timestamp) return false;
            const hour = new Date(l.timestamp).getHours();
            return hour >= 22 || hour < 6;
        });
    }, [logs]);

    // Staff Activity Leaderboard
    const staffLeaderboard = useMemo(() => {
        const counts = {};
        logs.forEach(l => {
            const uid = l.actor_user_id || l.user_id;
            if (!uid) return;
            if (!counts[uid]) {
                counts[uid] = {
                    userId: uid,
                    name: l.actor_name || l.user_name || 'Staff Member',
                    role: l.actor_role || l.user_role || 'Staff',
                    total: 0,
                    creates: 0,
                    updates: 0,
                    deletes: 0,
                    queries: 0,
                    failures: 0,
                    lastActive: l.timestamp
                };
            }
            counts[uid].total++;
            const op = getOperationType(l);
            if (op.type === 'create') counts[uid].creates++;
            if (op.type === 'update') counts[uid].updates++;
            if (op.type === 'delete') counts[uid].deletes++;
            if (op.type === 'query') counts[uid].queries++;
            if (l.outcome === 'failure' || l.outcome === 'denied') counts[uid].failures++;
        });
        return Object.values(counts).sort((a, b) => b.total - a.total);
    }, [logs]);

    const activeFilterCount = (selectedUser ? 1 : 0) + Object.values(filters).filter(Boolean).length;

    return (
        <main className="mx-auto max-w-[1600px] space-y-6 pb-20">
            {/* Page Header */}
            <PageHeader
                icon={Activity}
                eyebrow={t('governanceUserActivity')}
                title={t('userActivityMovementTracker')}
                description={t('trackAndAuditCreationModificationDeletion')}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        {canViewAuditTrail && (
                            <Link
                                to="/audit-logs"
                                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 shadow-2xs hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                            >
                                <ShieldCheck size={14} />
                                <span>{isAr ? 'سجل تدقيق الأمان' : 'Security Audit'}</span>
                            </Link>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setAutoRefresh(prev => !prev);
                                toast.success(!autoRefresh
                                    ? (t('liveActivityTrackingEnabled12s'))
                                    : (t('liveTrackingPaused')));
                            }}
                            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${autoRefresh
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                                }`}
                        >
                            <Radio size={14} className={autoRefresh ? 'text-emerald-600 animate-pulse' : 'text-slate-400'} />
                            <span>{autoRefresh ? (t('liveStream')) : (t('manual'))}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowVisualAnalytics(prev => !prev)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <BarChart3 size={14} className="text-teal-600 dark:text-teal-400" />
                            <span>{showVisualAnalytics ? (t('hideStats')) : (t('showStats'))}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => window.print()}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 print:hidden"
                        >
                            <Printer size={14} />
                            <span>{t('print')}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => refetchAudit()}
                            disabled={isAuditFetching}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <RefreshCw size={14} className={isAuditFetching ? 'animate-spin' : ''} />
                            <span>{t('refresh')}</span>
                        </button>

                        {canExportActivity && <button
                            type="button"
                            onClick={handleExportCsv}
                            disabled={exporting || !total}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
                        >
                            {exporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                            <span>{t('exportCsv')}</span>
                        </button>}
                    </div>
                }
                metrics={[
                    { key: 'creates', icon: PlusCircle, label: t('creations'), value: Number(summary.creates || 0).toLocaleString(locale), tone: 'emerald', loading: isAuditLoading },
                    { key: 'updates', icon: Edit3, label: t('modifications'), value: Number(summary.updates || 0).toLocaleString(locale), tone: 'blue', loading: isAuditLoading },
                    { key: 'deletes', icon: Trash2, label: t('deletions'), value: Number(summary.deletes || 0).toLocaleString(locale), tone: 'rose', loading: isAuditLoading },
                    { key: 'queries', icon: SearchCheck, label: t('queriesViews'), value: Number(summary.queries || 0).toLocaleString(locale), tone: 'teal', loading: isAuditLoading },
                    { key: 'failures', icon: ShieldAlert, label: t('failedActions'), value: Number(summary.failures || 0).toLocaleString(locale), tone: summary.failures ? 'amber' : 'emerald', loading: isAuditLoading },
                ]}
                metricsLabel={t('crudOperationMetrics')}
            />

            {/* Out-of-Hours Activity Anomaly Banner */}
            {outOfHoursEvents.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/80 p-4 text-amber-900 shadow-xs dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                    <div className="flex items-center gap-2.5">
                        <Moon size={18} className="shrink-0 text-amber-600" />
                        <div>
                            <p className="text-xs font-bold">
                                {isAr
                                    ? `تم رصد ${outOfHoursEvents.length} حركة خارج أوقات العمل الرسمية (بين 10:00 مساءً و 6:00 صباحاً).`
                                    : `Detected ${outOfHoursEvents.length} events logged outside standard working hours (10:00 PM - 06:00 AM).`}
                            </p>
                            <p className="text-[11px] text-amber-700 dark:text-amber-300">
                                {t('reviewNightShiftOperationsToEnsure')}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setFilters(prev => ({ ...prev, q: 'Night' }));
                        }}
                        className="rounded-xl border border-amber-300 bg-white px-3 py-1 text-xs font-bold text-amber-900 shadow-2xs hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200"
                    >
                        {t('inspectNightEvents')}
                    </button>
                </div>
            )}

            {/* Visual Analytics Deck (Peak Hours & CRUD Breakdown) */}
            {showVisualAnalytics && (
                <section className="grid gap-4 md:grid-cols-3">
                    {/* Hourly Distribution Activity Heatmap */}
                    <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/80 md:col-span-2">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                                <TrendingUp size={16} className="text-teal-600 dark:text-teal-400" />
                                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                    {t('activityByHourOfDay')}
                                </h3>
                            </div>
                            <span className="text-[11px] font-mono text-slate-400">
                                {t('currentPageSample')}
                            </span>
                        </div>
                        <div className="mt-4 flex items-end justify-between gap-2 h-24 pt-2">
                            {hourlyActivity.map((slot, idx) => (
                                <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                                    <span className="text-[10px] font-mono font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition">
                                        {slot.count}
                                    </span>
                                    <div
                                        style={{ height: `${Math.max(12, slot.percentage)}%` }}
                                        className="w-full max-w-[32px] rounded-t-lg bg-gradient-to-t from-teal-600 to-teal-400 dark:from-teal-700 dark:to-teal-400 transition-all duration-300 group-hover:scale-105"
                                    />
                                    <span className="text-[9px] font-mono text-slate-400 mt-1">
                                        {slot.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* CRUD Operations Ratio */}
                    <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/80">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                                <Database size={16} className="text-sky-600 dark:text-sky-400" />
                                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                    {t('crudqOperationBreakdown')}
                                </h3>
                            </div>
                        </div>
                        <div className="mt-3 space-y-2 text-xs">
                            <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300">
                                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                    <PlusCircle size={13} />
                                    {t('create')}
                                </span>
                                <span className="font-mono">{Number(summary.creates || 0)}</span>
                            </div>
                            <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300">
                                <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                                    <Edit3 size={13} />
                                    {t('update')}
                                </span>
                                <span className="font-mono">{Number(summary.updates || 0)}</span>
                            </div>
                            <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300">
                                <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                                    <Trash2 size={13} />
                                    {t('delete')}
                                </span>
                                <span className="font-mono">{Number(summary.deletes || 0)}</span>
                            </div>
                            <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300">
                                <span className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                                    <SearchCheck size={13} />
                                    {t('query')}
                                </span>
                                <span className="font-mono">{Number(summary.queries || 0)}</span>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Staff Quick Inspector Strip */}
            <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/80">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                        <Users size={16} className="text-teal-600 dark:text-teal-400" />
                        <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                            {t('quickStaffInspector')}
                        </h2>
                    </div>
                    {selectedUser && (
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setInspectingUser(selectedUser)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-sky-600 hover:text-sky-700 dark:text-sky-400"
                            >
                                <Info size={13} />
                                <span>{t('inspectInsights')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedUser(null)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400"
                            >
                                <X size={13} />
                                <span>{t('showAllStaff')}</span>
                            </button>
                        </div>
                    )}
                </div>

                <div className="mt-3 flex gap-2.5 overflow-x-auto pb-1 scrollbar-thin">
                    <button
                        type="button"
                        onClick={() => setSelectedUser(null)}
                        className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2 text-xs font-bold transition ${!selectedUser
                            ? 'border-teal-500 bg-teal-50 text-teal-800 shadow-2xs dark:border-teal-400 dark:bg-teal-950/50 dark:text-teal-200'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                            }`}
                    >
                        <Layers size={14} />
                        <span>{t('allStaff')}</span>
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] text-slate-500 dark:bg-slate-800">
                            {staffList.length}
                        </span>
                    </button>

                    {staffList.map((staff) => {
                        const isSelected = selectedUser?.user_id === staff.user_id;
                        const roleTheme = ROLE_THEMES[staff.role] || ROLE_THEMES.Receptionist;
                        return (
                            <button
                                key={staff.user_id}
                                type="button"
                                onClick={() => {
                                    setSelectedUser(isSelected ? null : staff);
                                    setPage(1);
                                }}
                                className={`flex shrink-0 items-center gap-2.5 rounded-2xl border px-3 py-1.5 text-xs font-bold transition ${isSelected
                                    ? 'border-teal-500 bg-teal-50 text-teal-900 ring-2 ring-teal-500/20 dark:border-teal-400 dark:bg-teal-950/60 dark:text-teal-100'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                                    }`}
                            >
                                <div className={`flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br ${roleTheme.bg} font-black text-[11px] ${roleTheme.text}`}>
                                    {staff.full_name?.charAt(0) || 'U'}
                                </div>
                                <div className="text-start">
                                    <p className="max-w-[130px] truncate font-bold text-xs leading-none text-slate-900 dark:text-white">
                                        {staff.full_name}
                                    </p>
                                    <p className="mt-0.5 font-mono text-[10px] text-slate-400 leading-none">
                                        {staff.role}
                                    </p>
                                </div>
                                {staff.is_active && (
                                    <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" title="Active" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Smart CRUDQ & Scenario Presets Strip */}
            <section className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-500">
                    {t('crudqOperations')}
                </span>

                <button
                    type="button"
                    onClick={() => handleApplyScenario('all')}
                    className={`rounded-xl border px-3 py-1 text-xs font-bold transition ${activeScenario === 'all'
                        ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                        }`}
                >
                    {t('allEvents')}
                </button>

                <button
                    type="button"
                    onClick={() => handleApplyScenario('create')}
                    className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1 text-xs font-bold transition ${activeScenario === 'create'
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                        }`}
                >
                    <PlusCircle size={13} />
                    <span>{t('createX')}</span>
                </button>

                <button
                    type="button"
                    onClick={() => handleApplyScenario('update')}
                    className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1 text-xs font-bold transition ${activeScenario === 'update'
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300'
                        }`}
                >
                    <Edit3 size={13} />
                    <span>{t('updateX')}</span>
                </button>

                <button
                    type="button"
                    onClick={() => handleApplyScenario('delete')}
                    className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1 text-xs font-bold transition ${activeScenario === 'delete'
                        ? 'border-rose-600 bg-rose-600 text-white'
                        : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
                        }`}
                >
                    <Trash2 size={13} />
                    <span>{t('deleteX')}</span>
                </button>

                <button
                    type="button"
                    onClick={() => handleApplyScenario('query')}
                    className={`inline-flex items-center gap-1 rounded-xl border px-3 py-1 text-xs font-bold transition ${activeScenario === 'query'
                        ? 'border-purple-600 bg-purple-600 text-white'
                        : 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-300'
                        }`}
                >
                    <SearchCheck size={13} />
                    <span>{t('queryX')}</span>
                </button>

                <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

            </section>

            {/* Filter Control Engine */}
            <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/80">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                        <Filter size={16} className="text-slate-500" />
                        <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                            {t('advancedActivityFilters')}
                        </h2>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Quick Date Presets */}
                        <button type="button" onClick={() => applyDatePreset(0)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                            {t('today')}
                        </button>
                        <button type="button" onClick={() => applyDatePreset(7)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                            {t('7Days')}
                        </button>
                        <button type="button" onClick={() => applyDatePreset(30)} className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                            {t('30Days')}
                        </button>

                        <button
                            type="button"
                            onClick={clearAllFilters}
                            disabled={!activeFilterCount}
                            className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-2xs hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <FilterX size={13} />
                            <span>{t('reset')} {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}</span>
                        </button>
                    </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                    {/* Search Field */}
                    <div className="relative lg:col-span-2">
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {isAr ? 'بحث في النشاط' : 'Search activity'}
                        </span>
                        <div className="relative">
                            <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={filters.q}
                                onChange={(e) => updateFilter('q', e.target.value)}
                                placeholder={isAr ? 'ابحث بالعملية أو اسم الموظف' : 'Search by action or staff member'}
                                aria-label={isAr ? 'ابحث بالعملية أو اسم الموظف' : 'Search by action or staff member'}
                                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 ps-9 pe-3 text-xs font-semibold text-slate-900 focus:border-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 dark:border-slate-800 dark:bg-slate-950/50 dark:text-white"
                            />
                        </div>
                    </div>

                    {/* Operation Type CRUD Selector */}
                    <div>
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {t('operationType')}
                        </span>
                        <select
                            value={filters.operationType}
                            onChange={(e) => updateFilter('operationType', e.target.value)}
                            aria-label={t('operationType')}
                            className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-semibold text-slate-900 focus:border-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 dark:border-slate-800 dark:bg-slate-950/50 dark:text-white"
                        >
                            <option value="">{t('allOperations')}</option>
                            <option value="create">{t('createXX')}</option>
                            <option value="update">{t('updateXX')}</option>
                            <option value="delete">{t('deleteXX')}</option>
                            <option value="query">{t('queryXX')}</option>
                        </select>
                    </div>

                    {/* Target Resource Table */}
                    <div>
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {t('targetResource')}
                        </span>
                        <select
                            value={filters.targetType}
                            onChange={(e) => updateFilter('targetType', e.target.value)}
                            aria-label={t('targetResource')}
                            className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-semibold text-slate-900 focus:border-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 dark:border-slate-800 dark:bg-slate-950/50 dark:text-white"
                        >
                            {RESOURCE_TABLES.map(res => (
                                <option key={res.id} value={res.id}>
                                    {isAr ? res.labelAr : res.labelEn}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Start Date */}
                    <div>
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {t('startDate')}
                        </span>
                        <input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => updateFilter('startDate', e.target.value)}
                            aria-label={t('startDate')}
                            className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-semibold text-slate-900 focus:border-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 dark:border-slate-800 dark:bg-slate-950/50 dark:text-white"
                        />
                    </div>

                    {/* End Date */}
                    <div>
                        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            {t('endDate')}
                        </span>
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => updateFilter('endDate', e.target.value)}
                            aria-label={t('endDate')}
                            className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 text-xs font-semibold text-slate-900 focus:border-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 dark:border-slate-800 dark:bg-slate-950/50 dark:text-white"
                        />
                    </div>
                </div>
            </section>

            {/* View Mode Tabs (Stream vs Table vs Leaderboard) */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setViewMode('stream')}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${viewMode === 'stream'
                            ? 'bg-teal-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                    >
                        <List size={14} />
                        <span>{t('activityStream')}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setViewMode('table')}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${viewMode === 'table'
                            ? 'bg-teal-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                    >
                        <TableIcon size={14} />
                        <span>{t('compactLedgerTable')}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setViewMode('leaderboard')}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${viewMode === 'leaderboard'
                            ? 'bg-teal-600 text-white shadow-2xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                    >
                        <Trophy size={14} />
                        <span>{t('staffLeaderboard')}</span>
                    </button>
                </div>

                <span className="text-xs font-mono text-slate-400">
                    {total} {t('loggedEntries')}
                </span>
            </div>

            {/* View Mode 1: Leaderboard Matrix */}
            {viewMode === 'leaderboard' && (
                <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/80 p-6">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800 mb-4">
                        <Award size={18} className="text-amber-500" />
                        <h3 className="text-sm font-black uppercase text-slate-900 dark:text-white">
                            {t('staffActivityVolumeRanking')}
                        </h3>
                    </div>

                    {staffLeaderboard.length === 0 ? (
                        <p className="text-center text-xs text-slate-400 py-8">
                            {t('noActivityLoggedForLeaderboard')}
                        </p>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {staffLeaderboard.map((item, index) => {
                                const roleTheme = ROLE_THEMES[item.role] || ROLE_THEMES.Receptionist;
                                return (
                                    <div
                                        key={item.userId}
                                        className="relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 gap-3"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className={`grid h-7 w-7 place-items-center rounded-xl font-black text-xs ${index === 0 ? 'bg-amber-400 text-slate-950' : index === 1 ? 'bg-slate-300 text-slate-950' : index === 2 ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                    }`}>
                                                    #{index + 1}
                                                </span>

                                                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${roleTheme.bg} font-black text-sm ${roleTheme.text}`}>
                                                    {item.name.charAt(0)}
                                                </div>

                                                <div>
                                                    <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                                                        {item.name}
                                                    </h4>
                                                    <p className="font-mono text-[10px] text-slate-400">
                                                        {item.role}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="text-end">
                                                <span className="font-mono text-base font-black text-teal-600 dark:text-teal-400">
                                                    {item.total}
                                                </span>
                                                <p className="text-[9px] font-bold text-slate-400 uppercase">
                                                    {t('actions')}
                                                </p>
                                            </div>
                                        </div>

                                        {/* CRUD Breakdown Chips */}
                                        <div className="flex items-center justify-between border-t border-slate-200/60 pt-2 text-[10px] font-mono dark:border-slate-800">
                                            <span className="text-emerald-600 dark:text-emerald-400">+{item.creates} {t('add')}</span>
                                            <span className="text-blue-600 dark:text-blue-400">✎{item.updates} {t('edit')}</span>
                                            <span className="text-rose-600 dark:text-rose-400">🗑{item.deletes} {t('del')}</span>
                                            <span className="text-purple-600 dark:text-purple-400">👁{item.queries} {t('view')}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {/* View Mode 2: Compact Ledger Table */}
            {viewMode === 'table' && (
                <section className="overflow-x-auto rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/80">
                    <table className="w-full text-start text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                            <tr>
                                <th className="p-3.5 text-start">{t('time')}</th>
                                <th className="p-3.5 text-start">{t('staff')}</th>
                                <th className="p-3.5 text-start">{t('operation')}</th>
                                <th className="p-3.5 text-start">{t('eventAction')}</th>
                                <th className="p-3.5 text-start">{t('category')}</th>
                                <th className="p-3.5 text-start">{t('target')}</th>
                                <th className="p-3.5 text-start">{t('outcome')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {logs.map((log) => {
                                const op = getOperationType(log);
                                const OpIcon = op.icon;
                                const isFailure = log.outcome === 'failure' || log.outcome === 'denied';
                                return (
                                    <tr key={log.log_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="p-3.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                                            {log.timestamp ? new Date(log.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                                        </td>
                                        <td className="p-3.5 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                            {log.actor_name || log.user_name || 'SYSTEM'}
                                            <span className="ms-1.5 font-mono text-[10px] text-slate-400">({log.actor_role || log.user_role || '—'})</span>
                                        </td>
                                        <td className="p-3.5 whitespace-nowrap">
                                            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-black ${op.badgeBg}`}>
                                                <OpIcon size={11} />
                                                <span>{isAr ? op.labelAr : op.labelEn}</span>
                                            </span>
                                        </td>
                                        <td className="p-3.5 font-mono font-bold text-slate-800 dark:text-slate-200">
                                            {log.event_code || log.action}
                                        </td>
                                        <td className="p-3.5 font-mono text-[10px] text-slate-500">
                                            {log.category}
                                        </td>
                                        <td className="p-3.5 text-slate-600 dark:text-slate-300">
                                            {log.target_type || log.resource_table || '—'}
                                        </td>
                                        <td className="p-3.5">
                                            <span className={`inline-flex rounded px-1.5 py-0.5 font-mono text-[9px] font-black uppercase ${isFailure ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                }`}>
                                                {log.outcome || 'success'}
                                            </span>
                                        </td>
                                        <td className="p-3.5 text-[10px] text-slate-500">
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </section>
            )}

            {/* View Mode 3: Timeline Stream Feed */}
            {viewMode === 'stream' && (
                <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/80">
                    <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800 sm:px-6">
                        <div>
                            <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                {t('userActivityFeed')}
                            </h2>
                            <p className="mt-0.5 text-xs text-slate-400">
                                {isAr
                                    ? `عرض ${(page - 1) * PAGE_SIZE + 1} إلى ${Math.min(page * PAGE_SIZE, total)} من إجمالي ${total} حركة مسجلة`
                                    : `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total} events`}
                            </p>
                        </div>

                        {selectedUser && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-500">{t('filteredBy')}</span>
                                <span className="inline-flex items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                                    <span>{selectedUser.full_name}</span>
                                    <button type="button" onClick={() => setSelectedUser(null)} className="text-teal-500 hover:text-teal-800">
                                        <X size={12} />
                                    </button>
                                </span>
                            </div>
                        )}
                    </div>

                    {isAuditLoading ? (
                        <div className="space-y-3 p-6">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
                            ))}
                        </div>
                    ) : isAuditError ? (
                        <div className="p-12 text-center">
                            <AlertTriangle size={32} className="mx-auto text-rose-500" />
                            <p className="mt-3 font-bold text-slate-900 dark:text-white">
                                {t('failedToLoadActivityStream')}
                            </p>
                            <button
                                type="button"
                                onClick={() => refetchAudit()}
                                className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white dark:bg-white dark:text-slate-900"
                            >
                                {t('retry')}
                            </button>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="p-12 text-center">
                            <Activity size={36} className="mx-auto text-slate-300 dark:text-slate-600" />
                            <p className="mt-3 font-bold text-slate-900 dark:text-white">
                                {t('noUserActivitiesMatchCurrentFilter')}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                                {t('tryChangingDatePresetsOrSelecting')}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                            {logs.map((log) => {
                                const isExpanded = expandedLogId === log.log_id;
                                const roleTheme = ROLE_THEMES[log.actor_role || log.user_role] || ROLE_THEMES.Receptionist;
                                const op = getOperationType(log);
                                const OpIcon = op.icon;
                                const isDenied = log.outcome === 'denied';
                                const isFailure = log.outcome === 'failure';

                                return (
                                    <article
                                        key={log.log_id}
                                        className={`p-4 transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40 sm:p-5 ${isExpanded ? 'bg-slate-50/50 dark:bg-slate-800/30' : ''
                                            }`}
                                    >
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                            {/* Actor Profile & Basic Info */}
                                            <div className="flex items-start gap-3">
                                                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${roleTheme.bg} font-black text-sm ${roleTheme.text}`}>
                                                    {log.actor_name?.charAt(0) || log.user_name?.charAt(0) || 'S'}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                                                            {log.actor_name || log.user_name || (t('system'))}
                                                        </span>
                                                        {(log.actor_role || log.user_role) && (
                                                            <span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${roleTheme.border} ${roleTheme.text}`}>
                                                                {log.actor_role || log.user_role}
                                                            </span>
                                                        )}
                                                        {log.category && (
                                                            <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
                                                                {isAr ? (CATEGORY_NAMES_AR[log.category] || log.category) : (CATEGORY_NAMES_EN[log.category] || log.category)}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                                        {/* CRUD Operation Pill */}
                                                        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] font-black ${op.badgeBg}`}>
                                                            <OpIcon size={11} />
                                                            <span>{isAr ? op.labelAr : op.labelEn}</span>
                                                        </span>

                                                        <span className="inline-flex rounded-lg bg-slate-900 px-2.5 py-0.5 font-mono text-xs font-black uppercase text-white shadow-2xs dark:bg-slate-100 dark:text-slate-900">
                                                            {log.event_code || log.action}
                                                        </span>

                                                        {log.outcome && (
                                                            <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${isFailure
                                                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                                                : isDenied
                                                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                                }`}>
                                                                {log.outcome}
                                                            </span>
                                                        )}

                                                    </div>
                                                </div>
                                            </div>

                                            {/* Timestamp & Action Toolbar */}
                                            <div className="flex items-center gap-2 self-end sm:self-start">
                                                <div className="text-end">
                                                    <p className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                                                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                                                    </p>
                                                    <p className="font-mono text-[10px] text-slate-400">
                                                        {log.timestamp ? formatRelativeTime(log.timestamp, locale) : '—'}
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => copyLogPayload(log)}
                                                        title={t('copyJson')}
                                                        className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                                                    >
                                                        {copiedId === log.log_id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedLogId(isExpanded ? null : log.log_id)}
                                                        aria-expanded={isExpanded}
                                                        title={t('toggleDetails')}
                                                        className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                                                    >
                                                        <ChevronDown size={15} className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 1-Click Resource Navigation Badges & Device Tags */}
                                        <div className="mt-3 flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                                            {(log.target_type || log.resource_table) && (
                                                <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10.5px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                    <Layers size={10} />
                                                    {log.target_type || log.resource_table}
                                                </span>
                                            )}
                                        </div>

                                        {/* Expandable State Modification & Technical Parameters */}
                                        {isExpanded && (
                                            <div className="mt-3.5 space-y-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-white animate-in fade-in duration-150">
                                                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                                        {t('technicalEventContext')}
                                                    </span>
                                                    <span className="font-mono text-[10px] text-slate-500">Log ID #{log.log_id}</span>
                                                </div>

                                                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-slate-800 bg-slate-900/80 p-3 font-mono text-[11px] text-slate-300">
                                                    {JSON.stringify({
                                                        event: log.event_code || log.action,
                                                        category: log.category,
                                                        outcome: log.outcome,
                                                        target: log.target_type || log.resource_table || undefined,
                                                    }, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {/* Pagination Toolbar */}
            {!isAuditLoading && !isAuditError && total > 0 && viewMode !== 'leaderboard' ? (
                <Pagination
                    currentPage={page}
                    pageCount={pageCount}
                    onPageChange={setPage}
                    isRtl={isAr}
                    ariaLabel={t('activityPagination')}
                    className="border-t border-slate-100 px-4 dark:border-slate-800 sm:px-6"
                />
            ) : null}

            {/* Inspect User Insights Modal */}
            {inspectingUser && (
                <Modal
                    isOpen={Boolean(inspectingUser)}
                    onClose={() => setInspectingUser(null)}
                    title={isAr ? `لوحة تحليل نشاط: ${inspectingUser.full_name}` : `Staff Activity Analytics: ${inspectingUser.full_name}`}
                >
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 font-black text-white text-lg">
                                {inspectingUser.full_name?.charAt(0)}
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                                    {inspectingUser.full_name}
                                </h4>
                                <p className="text-xs text-slate-500 font-mono">
                                    {inspectingUser.email} • {inspectingUser.role}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    {t('accountStatus')}
                                </span>
                                <p className="font-bold text-xs text-emerald-600 mt-1">
                                    {inspectingUser.is_active ? (t('active')) : (t('disabled'))}
                                </p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    {t('joinedDate')}
                                </span>
                                <p className="font-mono text-xs text-slate-700 dark:text-slate-300 mt-1">
                                    {inspectingUser.created_at ? new Date(inspectingUser.created_at).toLocaleDateString(locale) : '—'}
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => {
                                    navigate(`/users/${inspectingUser.user_id}`);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-500"
                            >
                                <ExternalLink size={13} />
                                <span>{t('openFullUserProfile')}</span>
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </main>
    );
}
