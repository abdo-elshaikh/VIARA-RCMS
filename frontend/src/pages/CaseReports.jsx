import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    CalendarDays,
    Camera,
    CheckCircle2,
    CheckSquare,
    ChevronDown,
    ChevronsLeft,
    ChevronsRight,
    ClipboardCheck,
    Download,
    Eye,
    FileSpreadsheet,
    FileText,
    Filter,
    FilterX,
    Hash,
    Loader2,
    Mail,
    Monitor,
    PenLine,
    Printer,
    QrCode,
    RefreshCw,
    ScanLine,
    Search,
    Send,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    Square,
    Stethoscope,
    UserRound,
    X
} from 'lucide-react';
import {
    useDeliverResultMutation,
    useGetCaseReportsQuery,
    useGetCenterSettingsQuery,
    useGetReportTemplatesQuery,
    useImproveReportFormatMutation,
    useLazyLookupCaseReportQuery
} from '../store/api';
import { selectCurrentUser } from '../store/authSlice';
import { authenticatedFetch } from '../utils/authenticatedFetch';
import { formatLocalizedDate } from '../utils/localizedDate';
import { getErrorMessage } from '../utils/getErrorMessage';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const PAGE_SIZE = 25;
const REPORT_STATUSES = ['Draft', 'Typed', 'Reviewed', 'Approved', 'Finalized', 'Amended'];
const EXAM_STATUSES = ['Scheduled', 'Checked-in', 'Scanning', 'Reporting', 'Finalized'];
const PRIORITIES = ['Routine', 'Urgent', 'Emergency'];
const DELIVERY_METHODS = ['Patient Portal', 'Email', 'SMS Link', 'WhatsApp Link', 'Printed', 'Physical Pickup'];
const EMPTY_FILTERS = {
    search: '',
    reportStatus: '',
    status: '',
    priority: '',
    modality: '',
    dateFrom: '',
    dateTo: '',
    delivered: '',
    hasReport: '',
    receipt: '',
    queue: ''
};
const QUICK_QUEUES = [
    { key: '', labelKey: 'all', icon: FileText },
    { key: 'pending', labelKey: 'pending', icon: PenLine },
    { key: 'finalized', labelKey: 'finalized', icon: CheckCircle2 },
    { key: 'notDelivered', labelKey: 'notDelivered', icon: Send },
    { key: 'urgent', labelKey: 'urgent', icon: AlertTriangle },
    { key: 'today', labelKey: 'today', icon: CalendarDays }
];

const statusTone = {
    Draft: 'bg-gradient-to-br from-slate-100/80 to-slate-50/40 text-slate-700 ring-slate-200/50 shadow-sm dark:from-slate-800/60 dark:to-slate-900/40 dark:text-slate-300 dark:ring-slate-700/50',
    Typed: 'bg-gradient-to-br from-sky-100/80 to-sky-50/40 text-sky-700 ring-sky-200/50 shadow-[0_2px_10px_-3px_rgba(14,165,233,0.2)] dark:from-sky-950/40 dark:to-sky-900/10 dark:text-sky-300 dark:ring-sky-900/30',
    Reviewed: 'bg-gradient-to-br from-amber-100/80 to-amber-50/40 text-amber-700 ring-amber-200/50 shadow-[0_2px_10px_-3px_rgba(245,158,11,0.2)] dark:from-amber-950/40 dark:to-amber-900/10 dark:text-amber-300 dark:ring-amber-900/30',
    Approved: 'bg-gradient-to-br from-violet-100/80 to-violet-50/40 text-violet-700 ring-violet-200/50 shadow-[0_2px_10px_-3px_rgba(139,92,246,0.2)] dark:from-violet-950/40 dark:to-violet-900/10 dark:text-violet-300 dark:ring-violet-900/30',
    Finalized: 'bg-gradient-to-br from-emerald-100/80 to-emerald-50/40 text-emerald-700 ring-emerald-200/50 shadow-[0_2px_10px_-3px_rgba(16,185,129,0.2)] dark:from-emerald-950/40 dark:to-emerald-900/10 dark:text-emerald-300 dark:ring-emerald-900/30',
    Amended: 'bg-gradient-to-br from-orange-100/80 to-orange-50/40 text-orange-700 ring-orange-200/50 shadow-[0_2px_10px_-3px_rgba(249,115,22,0.2)] dark:from-orange-950/40 dark:to-orange-900/10 dark:text-orange-300 dark:ring-orange-900/30'
};

const priorityTone = {
    Emergency: 'bg-gradient-to-br from-rose-100/80 to-rose-50/40 text-rose-700 ring-rose-200/50 shadow-[0_2px_10px_-3px_rgba(225,29,72,0.2)] dark:from-rose-950/40 dark:to-rose-900/10 dark:text-rose-300 dark:ring-rose-900/30',
    Urgent: 'bg-gradient-to-br from-amber-100/80 to-amber-50/40 text-amber-700 ring-amber-200/50 shadow-[0_2px_10px_-3px_rgba(245,158,11,0.2)] dark:from-amber-950/40 dark:to-amber-900/10 dark:text-amber-300 dark:ring-amber-900/30',
    Routine: 'bg-gradient-to-br from-slate-100/80 to-slate-50/40 text-slate-600 ring-slate-200/50 shadow-sm dark:from-slate-800/60 dark:to-slate-900/40 dark:text-slate-300 dark:ring-slate-700/50'
};

// Left-edge triage rail colour, mirrors the acuity-rail pattern used on the Nurse/Modality queues.
const priorityRail = {
    Emergency: 'bg-rose-500',
    Urgent: 'bg-amber-500',
    Routine: 'bg-slate-300 dark:bg-slate-700'
};

const reportStatus = (item) => item.report_status || (item.report_finalized_at ? 'Finalized' : item.report_content ? 'Typed' : 'Draft');
const isFinalReport = (item) => ['Finalized', 'Amended'].includes(reportStatus(item));
const fmtDate = (value, locale, options = { dateStyle: 'medium' }) => value ? formatLocalizedDate(value, locale, options) : '-';
const normalizeSections = (item, template = null) => ({
    clinicalHistory: item.report_sections?.clinicalHistory || item.clinical_indication || template?.clinical_history || template?.clinicalHistory || '',
    technique: item.report_sections?.technique || template?.technique || '',
    findings: item.report_sections?.findings || template?.findings || '',
    impression: item.report_sections?.impression || template?.impression || '',
    recommendations: item.report_sections?.recommendations || template?.recommendations || ''
});
const reportPlainText = (item) => {
    if (item.report_content && item.report_content.trim()) return item.report_content.trim();
    const sections = normalizeSections(item);
    return [
        sections.clinicalHistory && `Clinical Indication:\n${sections.clinicalHistory}`,
        sections.technique && `Technique:\n${sections.technique}`,
        sections.findings && `Findings:\n${sections.findings}`,
        sections.impression && `Impression:\n${sections.impression}`,
        sections.recommendations && `Recommendations:\n${sections.recommendations}`
    ].filter(Boolean).join('\n\n');
};

// Mirrors the RequirePermission component: Developer bypass, then break-glass, then standard grants.
const userHasPermission = (user, permission) => {
    if (!user) return false;
    if (user.role === 'Developer') return true;
    if (user.elevatedPermissions?.includes(permission)) return true;
    return Boolean(user.permissions?.includes(permission));
};

const CaseReports = () => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation('worklist');
    const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-US';
    const reportLanguage = i18n.language?.startsWith('ar') ? 'ar' : 'en';
    const currentUser = useSelector(selectCurrentUser);
    const canDeliver = useMemo(() => userHasPermission(currentUser, 'DELIVER_RESULTS'), [currentUser]);
    const canImprove = useMemo(() => userHasPermission(currentUser, 'IMPROVE_REPORT_FORMAT'), [currentUser]);
    const canWrite = useMemo(() => userHasPermission(currentUser, 'WRITE_REPORTS') || userHasPermission(currentUser, 'AMEND_REPORTS'), [currentUser]);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [activeFilters, setActiveFilters] = useState({ ...EMPTY_FILTERS, limit: PAGE_SIZE, offset: 0 });
    const [page, setPage] = useState(1);
    const [expandedId, setExpandedId] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [deliveryTarget, setDeliveryTarget] = useState(null);
    const [improveTarget, setImproveTarget] = useState(null);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scanValue, setScanValue] = useState('');
    const [isExportingWord, setIsExportingWord] = useState(false);
    const [isBatchBusy, setIsBatchBusy] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const { data, isLoading, isFetching, isError, refetch } = useGetCaseReportsQuery(activeFilters);
    const [lookupReport, { isFetching: isLookingUp }] = useLazyLookupCaseReportQuery();
    const [deliverResult, { isLoading: isDelivering }] = useDeliverResultMutation();
    const { data: centerSettings } = useGetCenterSettingsQuery();
    const { data: reportTemplates = [], isFetching: isFetchingTemplates } = useGetReportTemplatesQuery({ active: true });

    const items = useMemo(() => data?.items || [], [data?.items]);
    const modalityOptions = useMemo(() => [...new Set(items.map((item) => item.modality_name).filter(Boolean))].sort(), [items]);
    const selectedItems = useMemo(() => items.filter((item) => selectedIds.includes(item.exam_id)), [items, selectedIds]);
    const selectedTemplate = useMemo(() => reportTemplates.find((template) => template.template_id === selectedTemplateId) || null, [reportTemplates, selectedTemplateId]);
    const activeFilterCount = Object.entries(activeFilters).filter(([key, value]) => !['limit', 'offset'].includes(key) && value).length;
    const summary = useMemo(() => {
        const finalized = items.filter(isFinalReport).length;
        const delivered = items.filter((item) => item.delivered_at || item.last_delivery_status).length;
        const pending = items.length - finalized;
        return {
            total: data?.summary?.total ?? items.length,
            finalized: data?.summary?.finalized ?? finalized,
            pending: data?.summary?.pending ?? pending,
            delivered: data?.summary?.delivered ?? delivered
        };
    }, [data?.summary, items]);
    const pageCount = Math.max(1, Math.ceil(summary.total / PAGE_SIZE));
    const pageStart = summary.total ? ((page - 1) * PAGE_SIZE) + 1 : 0;
    const pageEnd = Math.min(page * PAGE_SIZE, summary.total);
    const allPageSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.exam_id));

    useEffect(() => {
        const visibleIds = new Set(items.map((item) => item.exam_id));
        setSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
    }, [items]);

    const setFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));
    const applyFilters = () => {
        setActiveFilters({ ...filters, limit: PAGE_SIZE, offset: 0 });
        setPage(1);
        setExpandedId(null);
        setSelectedIds([]);
    };
    const clearFilters = () => {
        setFilters(EMPTY_FILTERS);
        setActiveFilters({ ...EMPTY_FILTERS, limit: PAGE_SIZE, offset: 0 });
        setPage(1);
        setExpandedId(null);
        setSelectedIds([]);
    };
    const setQuickQueue = (queue) => {
        const nextFilters = { ...EMPTY_FILTERS, queue };
        setFilters(nextFilters);
        setActiveFilters({ ...nextFilters, limit: PAGE_SIZE, offset: 0 });
        setPage(1);
        setExpandedId(null);
        setSelectedIds([]);
    };
    const goToPage = (nextPage) => {
        const bounded = Math.min(Math.max(nextPage, 1), pageCount);
        setPage(bounded);
        setExpandedId(null);
        setSelectedIds([]);
        setActiveFilters((current) => ({ ...current, limit: PAGE_SIZE, offset: (bounded - 1) * PAGE_SIZE }));
    };
    const toggleSelected = (examId) => {
        setSelectedIds((current) => current.includes(examId)
            ? current.filter((id) => id !== examId)
            : [...current, examId]);
    };
    const togglePageSelected = () => {
        setSelectedIds(allPageSelected ? [] : items.map((item) => item.exam_id));
    };

    const openPrintableReport = useCallback(async (item, autoPrint = false) => {
        try {
            const query = selectedTemplateId ? `?templateId=${encodeURIComponent(selectedTemplateId)}` : '';
            const response = await authenticatedFetch(`${API_BASE}/exams/${item.exam_id}/report/pdf${query}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const url = URL.createObjectURL(new Blob([await response.text()], { type: 'text/html' }));
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
            toast.error(getErrorMessage(error, t('caseReports.toasts.openError')));
        }
    }, [selectedTemplateId, t]);

    const exportWord = useCallback(async (item) => {
        if (isExportingWord) return;
        setIsExportingWord(true);
        try {
            const { exportReportToWord } = await import('../utils/exportReportToWord');
            await exportReportToWord({ exam: item, sections: normalizeSections(item, selectedTemplate), t, locale, centerSettings });
            toast.success(t('caseReports.toasts.wordExported'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('caseReports.toasts.wordExportError')));
        } finally {
            setIsExportingWord(false);
        }
    }, [centerSettings, isExportingWord, locale, selectedTemplate, t]);

    const downloadCsv = useCallback((rows) => {
        const source = rows.length ? rows : items;
        if (!source.length) {
            toast.error(t('caseReports.toasts.csvEmpty'));
            return;
        }
        const headers = ['MRN', 'Patient', 'Order', 'Exam', 'Modality', 'Priority', 'Report status', 'Delivery', 'Radiologist', 'Scheduled', 'Invoice', 'Receipt'];
        const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
        const csv = [
            headers.map(escapeCell).join(','),
            ...source.map((item) => [
                item.mrn,
                item.patient_name,
                item.order_number,
                item.exam_type_name,
                item.modality_name,
                item.priority,
                reportStatus(item),
                item.last_delivery_status || (item.delivered_at ? 'Delivered' : 'Not delivered'),
                item.radiologist_name,
                item.start_time ? new Date(item.start_time).toISOString() : '',
                item.invoice_number,
                item.receipt_number
            ].map(escapeCell).join(','))
        ].join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `case-reports-${new Date().toISOString().slice(0, 10)}.csv`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, [items, t]);

    const printBatch = useCallback(async () => {
        if (!selectedItems.length) return;
        setIsBatchBusy(true);
        try {
            const documents = await Promise.all(selectedItems.map(async (item) => {
                const query = selectedTemplateId ? `?templateId=${encodeURIComponent(selectedTemplateId)}` : '';
                const response = await authenticatedFetch(`${API_BASE}/exams/${item.exam_id}/report/pdf${query}`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const html = await response.text();
                const parsed = new DOMParser().parseFromString(html, 'text/html');
                return parsed.body?.innerHTML || html;
            }));
            const html = `<!doctype html><html><head><meta charset="utf-8"><title>Selected case reports</title><style>body{margin:0;font-family:Arial,"Noto Sans Arabic",sans-serif}.report-page{break-after:page;page-break-after:always}.report-page:last-child{break-after:auto;page-break-after:auto}@media print{.report-page{break-after:page;page-break-after:always}}</style></head><body>${documents.map((body) => `<section class="report-page">${body}</section>`).join('')}</body></html>`;
            const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
            const popup = window.open(url, '_blank', 'noopener,noreferrer');
            if (popup) popup.addEventListener('load', () => popup.print(), { once: true });
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (error) {
            toast.error(getErrorMessage(error, t('caseReports.toasts.batchPrintError')));
        } finally {
            setIsBatchBusy(false);
        }
    }, [selectedItems, selectedTemplateId, t]);

    const exportSelectedWord = useCallback(async () => {
        if (!selectedItems.length || isExportingWord) return;
        setIsExportingWord(true);
        try {
            const { exportReportToWord } = await import('../utils/exportReportToWord');
            for (const item of selectedItems) {
                await exportReportToWord({ exam: item, sections: normalizeSections(item, selectedTemplate), t, locale, centerSettings });
            }
            toast.success(selectedItems.length === 1
                ? t('caseReports.toasts.wordExportedSingular')
                : t('caseReports.toasts.wordExportedPlural', { count: selectedItems.length }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('caseReports.toasts.wordExportError')));
        } finally {
            setIsExportingWord(false);
        }
    }, [centerSettings, isExportingWord, locale, selectedItems, selectedTemplate, t]);

    const runLookup = useCallback(async (rawCode = scanValue) => {
        const code = String(rawCode || '').trim();
        if (!code) return;
        try {
            const result = await lookupReport(code).unwrap();
            const match = result?.items?.[0];
            if (!match) {
                toast.error(t('caseReports.toasts.qrNotFound'));
                return;
            }
            setFilters({ ...EMPTY_FILTERS, receipt: match.receipt_number || match.invoice_number || match.order_number || code });
            setActiveFilters({ ...EMPTY_FILTERS, receipt: match.receipt_number || match.invoice_number || match.order_number || code, limit: PAGE_SIZE, offset: 0 });
            setExpandedId(match.exam_id);
            setPage(1);
            setSelectedIds([]);
            setScannerOpen(false);
            toast.success(t('caseReports.toasts.qrOpened', { ref: match.order_number || match.mrn || t('caseReports.title') }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('caseReports.toasts.qrError')));
        }
    }, [lookupReport, scanValue, t]);

    const deliverToPatient = async ({ item, method, contact, notes }) => {
        try {
            await deliverResult({
                examId: item.exam_id,
                deliveryMethod: method,
                recipientName: item.patient_name || item.mrn || '',
                recipientContact: contact || '',
                notes: notes || t('caseReports.deliveryDialog.defaultNote'),
                printCopyCount: method === 'Printed' ? 1 : 0
            }).unwrap();
            toast.success(t('caseReports.toasts.deliveryRecorded'));
            setDeliveryTarget(null);
        } catch (error) {
            toast.error(getErrorMessage(error, t('caseReports.toasts.deliveryError')));
        }
    };

    return (
        <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-5 bg-slate-50/60 pb-20 dark:bg-[#090E17]">
            <PageHeader
                icon={FileText}
                eyebrowIcon={ShieldCheck}
                eyebrow={t('caseReports.eyebrow')}
                title={t('caseReports.title')}
                description={t('caseReports.description')}
                meta={isFetching && <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><Loader2 size={13} className="animate-spin" /> {t('caseReports.syncing')}</span>}
                actions={(
                    <div className="flex flex-wrap gap-2">
                        <IconButton icon={QrCode} label={t('caseReports.scanQr')} onClick={() => setScannerOpen(true)} primary />
                        <IconButton icon={RefreshCw} label={t('caseReports.refresh')} onClick={() => refetch()} />
                    </div>
                )}
            />

            {/* KPI strip */}
            <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm shadow-slate-200/40 backdrop-blur-xl dark:border-slate-800/60 dark:bg-[#0b1426]/80">
                <div className="grid grid-cols-2 divide-x divide-slate-150/60 dark:divide-slate-800/60 lg:grid-cols-4 rtl:divide-x-reverse">
                    <Metric icon={FileText} label={t('caseReports.metrics.loaded')} value={summary.total} />
                    <Metric icon={CheckCircle2} label={t('caseReports.metrics.finalized')} value={summary.finalized} tone="emerald" />
                    <Metric icon={PenLine} label={t('caseReports.metrics.pending')} value={summary.pending} tone="amber" />
                    <Metric icon={Send} label={t('caseReports.metrics.delivered')} value={summary.delivered} tone="teal" />
                </div>
                <div className="flex gap-2 overflow-x-auto border-t border-slate-200/60 bg-slate-50/60 p-2.5 dark:border-slate-800/60 dark:bg-slate-900/20">
                    {QUICK_QUEUES.map((queue) => (
                        <QueueButton
                            key={queue.key || 'all'}
                            icon={queue.icon}
                            label={t(`caseReports.queues.${queue.labelKey}`)}
                            active={(activeFilters.queue || '') === queue.key}
                            onClick={() => setQuickQueue(queue.key)}
                        />
                    ))}
                </div>
            </section>

            {/* Filters */}
            <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-3.5 shadow-sm shadow-slate-200/40 backdrop-blur-xl dark:border-slate-800/60 dark:bg-[#0b1426]/80 sm:p-4" aria-label={t('caseReports.filterLabels.filters')}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[minmax(260px,1.4fr)_repeat(4,minmax(120px,1fr))_auto_auto]">
                    <label className="relative sm:col-span-2 lg:col-span-4 xl:col-span-1">
                        <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input value={filters.search} onChange={(event) => setFilter('search', event.target.value)} onKeyDown={(event) => event.key === 'Enter' && applyFilters()} placeholder={t('caseReports.search')} className={`${fieldClass} min-h-11 ps-10 pe-3`} />
                    </label>
                    <Select value={filters.reportStatus} onChange={(value) => setFilter('reportStatus', value)} label={t('caseReports.filterLabels.reportStatus')} options={REPORT_STATUSES} optionLabel={(v) => t(`statuses.${v}`, v)} />
                    <Select value={filters.status} onChange={(value) => setFilter('status', value)} label={t('caseReports.filterLabels.examStatus')} options={EXAM_STATUSES} optionLabel={(v) => t(`roleCommand.stages.${v}`, v)} />
                    <Select value={filters.priority} onChange={(value) => setFilter('priority', value)} label={t('caseReports.filterLabels.priority')} options={PRIORITIES} optionLabel={(v) => t(`priorities.${v}`, v)} />
                    <Select value={filters.modality} onChange={(value) => setFilter('modality', value)} label={t('caseReports.filterLabels.modality')} options={modalityOptions} />
                    <IconButton icon={Filter} label={t('caseReports.filterLabels.apply')} onClick={applyFilters} primary />
                    <IconButton icon={FilterX} label={t('caseReports.filterLabels.clear')} onClick={clearFilters} />
                </div>
                <details className="mt-3 overflow-hidden rounded-xl border border-slate-200/60 bg-white/60 dark:border-slate-800/60 dark:bg-slate-900/30">
                    <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2.5 text-xs font-black uppercase tracking-wide text-slate-500 marker:content-none">
                        <SlidersHorizontal size={14} /> {t('caseReports.filterLabels.advanced')} {activeFilterCount > 0 && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-teal-700 dark:bg-teal-950/50 dark:text-teal-200">{activeFilterCount}</span>}
                    </summary>
                    <div className="grid gap-3 border-t border-slate-200/50 p-3 dark:border-slate-800 sm:grid-cols-2 lg:grid-cols-5">
                        <Field label={t('caseReports.filterLabels.from')}><input type="date" value={filters.dateFrom} onChange={(event) => setFilter('dateFrom', event.target.value)} className={fieldClass} /></Field>
                        <Field label={t('caseReports.filterLabels.to')}><input type="date" value={filters.dateTo} onChange={(event) => setFilter('dateTo', event.target.value)} className={fieldClass} /></Field>
                        <Field label={t('caseReports.filterLabels.delivered')}><Select bare value={filters.delivered} onChange={(value) => setFilter('delivered', value)} label={t('caseReports.filterLabels.any')} options={[['yes', t('caseReports.filterLabels.deliveredYes')], ['no', t('caseReports.filterLabels.deliveredNo')]]} /></Field>
                        <Field label={t('caseReports.filterLabels.hasReport')}><Select bare value={filters.hasReport} onChange={(value) => setFilter('hasReport', value)} label={t('caseReports.filterLabels.any')} options={[['yes', t('caseReports.filterLabels.hasContent')], ['no', t('caseReports.filterLabels.noContent')]]} /></Field>
                        <Field label={t('caseReports.filterLabels.receipt')}><input value={filters.receipt} onChange={(event) => setFilter('receipt', event.target.value)} placeholder={t('caseReports.filterLabels.receiptPlaceholder')} className={fieldClass} /></Field>
                    </div>
                </details>
            </section>

            {/* Register */}
            <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm shadow-slate-200/40 backdrop-blur-xl dark:border-slate-800/60 dark:bg-[#0b1426]/80">
                <div className="flex flex-col gap-3 border-b border-slate-150/60 px-4 py-3.5 dark:border-slate-800/60 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">{t('caseReports.register.title')}</h2>
                        <p className="text-xs font-semibold text-slate-400">{t('caseReports.register.showing', { start: pageStart, end: pageEnd, total: summary.total })}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200/60 bg-white/80 px-3 dark:border-slate-800/60 dark:bg-slate-900/50">
                            <FileText size={14} className="shrink-0 text-teal-600" />
                            <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">{t('caseReports.templateLabel', { defaultValue: 'Template' })}</span>
                            <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} disabled={isFetchingTemplates} className="max-w-[160px] bg-transparent text-xs font-bold text-slate-700 outline-none dark:text-slate-200">
                                <option value="">{t('caseReports.savedReport', { defaultValue: 'Saved report' })}</option>
                                {reportTemplates.map((template) => <option key={template.template_id} value={template.template_id}>{template.name}</option>)}
                            </select>
                        </label>
                        <IconButton icon={FileSpreadsheet} label={t('caseReports.register.exportCsv')} onClick={() => downloadCsv(selectedItems)} disabled={!items.length} />
                        <div className="hidden text-xs font-bold text-slate-400 sm:block">{t('caseReports.register.page', { page, count: pageCount })}</div>
                    </div>
                </div>

                {selectedItems.length > 0 && (
                    <div className="flex flex-col gap-2 border-b border-teal-100 bg-teal-50/70 px-4 py-3 dark:border-teal-900/50 dark:bg-teal-950/20 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 text-xs font-black text-teal-800 dark:text-teal-200">
                            <ClipboardCheck size={15} /> {t('caseReports.selection.count', { count: selectedItems.length })}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <IconButton icon={Printer} label={t('caseReports.selection.printSelected')} onClick={printBatch} disabled={isBatchBusy} />
                            <IconButton icon={FileText} label={t('caseReports.selection.wordSelected')} onClick={exportSelectedWord} disabled={isExportingWord} />
                            <IconButton icon={FileSpreadsheet} label={t('caseReports.selection.csvSelected')} onClick={() => downloadCsv(selectedItems)} />
                            <IconButton icon={X} label={t('caseReports.selection.clear')} onClick={() => setSelectedIds([])} />
                        </div>
                    </div>
                )}

                {/* Table header — desktop/tablet-landscape only */}
                <div className="hidden grid-cols-[28px_18px_1.3fr_1.05fr_110px_120px_150px_220px] items-center gap-3 border-b border-slate-200/60 bg-slate-50/70 px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 dark:border-slate-800/60 dark:bg-slate-900/30 lg:grid">
                    <button type="button" title={allPageSelected ? t('caseReports.columns.clearPage') : t('caseReports.columns.selectPage')} onClick={togglePageSelected} className="flex h-5 w-5 items-center justify-center text-slate-400 transition-colors hover:text-teal-700">
                        {allPageSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                    <span aria-hidden="true" />
                    <span>{t('caseReports.columns.patientOrder')}</span>
                    <span>{t('caseReports.columns.examination')}</span>
                    <span>{t('caseReports.columns.priority')}</span>
                    <span>{t('caseReports.columns.report')}</span>
                    <span>{t('caseReports.columns.delivery')}</span>
                    <span className="text-end">{t('caseReports.columns.actions')}</span>
                </div>

                {isLoading && <PageState icon={Loader2} spin title={t('caseReports.states.loading')} />}
                {isError && !isLoading && <PageState icon={AlertTriangle} title={t('caseReports.states.errorTitle')} detail={t('caseReports.states.errorDetail')} action={refetch} actionLabel={t('caseReports.states.retry')} />}
                {!isLoading && !isError && items.length === 0 && <PageState icon={FileText} title={t('caseReports.states.emptyTitle')} detail={t('caseReports.states.emptyDetail')} action={clearFilters} actionLabel={t('caseReports.states.clearFilters')} />}

                {!isLoading && !isError && items.length > 0 && (
                    <div className="flex flex-col divide-y divide-slate-100/70 dark:divide-slate-800/50">
                        {items.map((item) => (
                            <ReportRow
                                key={item.exam_id}
                                item={item}
                                locale={locale}
                                t={t}
                                selected={selectedIds.includes(item.exam_id)}
                                expanded={expandedId === item.exam_id}
                                canDeliver={canDeliver}
                                canImprove={canImprove}
                                canWrite={canWrite}
                                onSelect={() => toggleSelected(item.exam_id)}
                                onToggle={() => setExpandedId((current) => current === item.exam_id ? null : item.exam_id)}
                                onViewCase={() => navigate(`/cases/${item.exam_id}`)}
                                onOpen={() => navigate(`/reports/editor/${item.exam_id}`, { state: { exam: item } })}
                                onPrint={() => openPrintableReport(item, true)}
                                onPdf={() => openPrintableReport(item, false)}
                                onWord={() => exportWord(item)}
                                onImprove={() => setImproveTarget(item)}
                                onDeliver={() => setDeliveryTarget(item)}
                                wordBusy={isExportingWord}
                            />
                        ))}
                    </div>
                )}

                {pageCount > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                        <div className="flex gap-2">
                            <PageButton icon={ChevronsLeft} label={t('caseReports.pagination.first')} disabled={page === 1} onClick={() => goToPage(1)} />
                            <PageButton icon={ArrowLeft} label={t('caseReports.pagination.previous')} disabled={page === 1} onClick={() => goToPage(page - 1)} />
                        </div>
                        <div className="text-xs font-black text-slate-400">{pageStart}-{pageEnd} / {summary.total}</div>
                        <div className="flex gap-2">
                            <PageButton icon={ArrowRight} label={t('caseReports.pagination.next')} disabled={page === pageCount} onClick={() => goToPage(page + 1)} />
                            <PageButton icon={ChevronsRight} label={t('caseReports.pagination.last')} disabled={page === pageCount} onClick={() => goToPage(pageCount)} />
                        </div>
                    </div>
                )}
            </section>

            {scannerOpen && (
                <ScannerDialog
                    value={scanValue}
                    onChange={setScanValue}
                    onClose={() => setScannerOpen(false)}
                    onLookup={runLookup}
                    busy={isLookingUp}
                    t={t}
                />
            )}

            {deliveryTarget && (
                <DeliveryDialog
                    item={deliveryTarget}
                    onClose={() => setDeliveryTarget(null)}
                    onSubmit={deliverToPatient}
                    busy={isDelivering}
                    t={t}
                />
            )}

            {improveTarget && (
                <ImproveDialog
                    item={improveTarget}
                    language={reportLanguage}
                    onClose={() => setImproveTarget(null)}
                    t={t}
                />
            )}
        </div>
    );
};

const ImproveDialog = ({ item, language, onClose, t }) => {
    const original = useMemo(() => reportPlainText(item), [item]);
    const [suggestion, setSuggestion] = useState('');
    const [improveReportFormat, { isLoading }] = useImproveReportFormatMutation();

    const runImprove = useCallback(async () => {
        if (!original || original.trim().length < 10) {
            toast.error(t('caseReports.improveDialog.empty'));
            return;
        }
        try {
            const result = await improveReportFormat({
                reportText: original,
                examId: item.exam_id,
                modality: item.modality_name || undefined,
                examType: item.exam_type_name || undefined,
                language
            }).unwrap();
            setSuggestion(result?.improved || '');
        } catch (error) {
            if (error?.status === 503) {
                toast.error(t('caseReports.toasts.improveUnavailable'));
            } else {
                toast.error(getErrorMessage(error, t('caseReports.toasts.improveError')));
            }
        }
    }, [original, improveReportFormat, item.exam_id, item.modality_name, item.exam_type_name, language, t]);

    useEffect(() => { runImprove(); }, [runImprove]);

    const applySuggestion = useCallback(async () => {
        if (!suggestion) return;
        try {
            await navigator.clipboard?.writeText(suggestion);
            toast.success(t('caseReports.improveDialog.copied'));
        } catch {
            toast.success(t('caseReports.toasts.improveApplied'));
        }
        onClose();
    }, [suggestion, onClose, t]);

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={<span className="flex items-center gap-2"><Sparkles size={18} className="text-teal-600" />{t('caseReports.improveDialog.title')}</span>}
            width="max-w-3xl"
            footer={(
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onClose} className={smallButtonClass}>{t('caseReports.improveDialog.cancel')}</button>
                    <button type="button" onClick={runImprove} disabled={isLoading} className={smallButtonClass}><RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> {t('caseReports.improveDialog.regenerate')}</button>
                    <button type="button" onClick={applySuggestion} disabled={isLoading || !suggestion} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-black text-white shadow-sm transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"><Sparkles size={14} /> {t('caseReports.improveDialog.apply')}</button>
                </div>
            )}
        >
                <div className="space-y-4">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t('caseReports.improveDialog.description')}</p>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                            <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">{t('caseReports.improveDialog.original')}</p>
                            <div className="h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-rose-200/60 bg-rose-50/30 p-4 text-[13px] font-medium leading-relaxed text-slate-700 shadow-inner dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-slate-300">{original || '-'}</div>
                        </div>
                        <div>
                            <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400">{t('caseReports.improveDialog.suggestion')}</p>
                            {isLoading
                                ? <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400"><Loader2 size={22} className="animate-spin" /><span className="text-xs font-bold">{t('caseReports.improveDialog.generating')}</span></div>
                                : <textarea value={suggestion} onChange={(event) => setSuggestion(event.target.value)} className="h-64 w-full whitespace-pre-wrap rounded-xl border border-emerald-200/60 bg-emerald-50/30 p-4 text-[13px] font-medium leading-relaxed text-slate-800 shadow-inner outline-none transition-all focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-slate-200 dark:focus:bg-slate-900" />}
                        </div>
                    </div>
                </div>
        </Modal>
    );
};

const ReportRow = ({ item, locale, t, selected, expanded, canDeliver, canImprove, canWrite, onSelect, onToggle, onViewCase, onOpen, onPrint, onPdf, onWord, onImprove, onDeliver, wordBusy }) => {
    const status = reportStatus(item);
    const finalized = isFinalReport(item);
    const priority = item.priority || 'Routine';
    
    const priorityKey = PRIORITIES.includes(item.priority) ? item.priority : 'Routine';
    return (
        <article className={`group/row relative transition-colors duration-200 ${selected ? 'bg-teal-50/60 dark:bg-teal-950/10' : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/40'}`}>
            <span aria-hidden="true" className={`absolute inset-y-0 start-0 w-1 ${priorityRail[priorityKey]}`} />
            <div className="grid grid-cols-1 gap-3 py-3.5 ps-5 pe-4 lg:grid-cols-[28px_18px_1.3fr_1.05fr_110px_120px_150px_220px] lg:items-center lg:gap-3 lg:py-3">
                <div className="flex items-center justify-between gap-2 lg:contents">
                    <button type="button" title={selected ? t('caseReports.row.clearSelection') : t('caseReports.row.select')} onClick={onSelect} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950/30 dark:hover:text-teal-300 lg:h-5 lg:w-5">
                        {selected ? <CheckSquare size={17} /> : <Square size={17} />}
                    </button>
                    <span className={`hidden h-2 w-2 shrink-0 rounded-full lg:block ${priorityRail[priorityKey]}`} title={t(`priorities.${priorityKey}`, priorityKey)} />
                    <Badge tone={priorityTone[priorityKey] || priorityTone.Routine} className="lg:hidden">{t(`priorities.${priorityKey}`, item.priority || 'Routine')}</Badge>
                </div>

                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-black text-slate-900 dark:text-slate-100">{item.patient_name || '-'}</p>
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300"><Hash size={10} />{item.mrn || '-'}</span>
                        {item.communication_preference && <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-400 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">{item.communication_preference}</span>}
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-400">{item.order_number || item.exam_id}</p>
                </div>

                <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-700 dark:text-slate-300">{item.exam_type_name || item.modality_name || '-'}</p>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] font-semibold text-slate-400"><Monitor size={12} />{item.modality_name || '-'} {item.body_part ? `- ${item.body_part}` : ''}</p>
                </div>

                <div className="hidden lg:block">
                    <Badge tone={priorityTone[priorityKey] || priorityTone.Routine}>{t(`priorities.${priorityKey}`, item.priority || 'Routine')}</Badge>
                </div>

                <div className="flex items-center justify-between gap-2 lg:block">
                    <span className="text-[10px] font-black uppercase tracking-wide text-slate-400 lg:hidden">{t('caseReports.columns.report')}</span>
                    <Badge tone={statusTone[status] || statusTone.Draft}>{t(`statuses.${status}`, status)}</Badge>
                </div>

                <div className="min-w-0">
                    <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400 lg:hidden">{t('caseReports.columns.delivery')}</p>
                    <p className="truncate text-xs font-bold text-slate-600 dark:text-slate-300">{item.last_delivery_status || (item.delivered_at ? t('caseReports.row.delivered') : t('caseReports.row.notDelivered'))}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">{fmtDate(item.last_delivery_at || item.delivered_at || item.report_finalized_at, locale, { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100/80 pt-2.5 lg:justify-end lg:border-0 lg:pt-0 dark:border-slate-800/60">
                    <MiniAction icon={ChevronDown} label={t('caseReports.row.details')} onClick={onToggle} active={expanded} />
                    {/* <MiniAction icon={Activity} label={t('caseReports.row.viewCase', 'View Case')} onClick={onViewCase} /> */}
                    <MiniAction icon={finalized || !canWrite ? Eye : PenLine} label={finalized || !canWrite ? t('caseReports.row.viewEdit') : t('caseReports.row.openEditor')} onClick={onOpen} />
                    <MiniAction icon={Printer} label={t('caseReports.row.print')} onClick={onPrint} />
                    <MiniAction icon={Download} label={t('caseReports.row.pdf')} onClick={onPdf} />
                    <MiniAction icon={FileText} label={t('caseReports.row.word')} onClick={onWord} disabled={wordBusy} />
                    {canImprove && <MiniAction icon={Sparkles} label={t('caseReports.row.improve')} onClick={onImprove} />}
                    {canDeliver && <MiniAction icon={Mail} label={t('caseReports.row.send')} onClick={onDeliver} disabled={!finalized} />}
                </div>
            </div>
            {expanded && (
                <div className="border-t border-slate-200/60 bg-slate-50/80 px-5 py-4 ms-1 dark:border-slate-800/60 dark:bg-slate-900/40">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <Detail icon={CalendarDays} label={t('caseReports.detail.scheduled')} value={fmtDate(item.start_time, locale, { dateStyle: 'medium', timeStyle: 'short' })} />
                        <Detail icon={Stethoscope} label={t('caseReports.detail.radiologist')} value={item.radiologist_name} />
                        <Detail icon={UserRound} label={t('caseReports.detail.referringDoctor')} value={item.referring_doctor_name} />
                        <Detail icon={Hash} label={t('caseReports.detail.invoice')} value={item.invoice_number} />
                        <Detail icon={QrCode} label={t('caseReports.detail.receipt')} value={item.receipt_number} />
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Detail icon={Mail} label={t('caseReports.detail.patientEmail')} value={item.patient_email} />
                        <Detail icon={Send} label={t('caseReports.detail.patientPhone')} value={item.patient_phone} />
                        <Detail icon={ClipboardCheck} label={t('caseReports.detail.consent')} value={[
                            item.consent_email && t('delivery.methods.Email', 'Email'),
                            item.consent_sms && t('delivery.methods.SMS Link', 'SMS'),
                            item.consent_whatsapp && t('delivery.methods.WhatsApp Link', 'WhatsApp')
                        ].filter(Boolean).join(', ')} />
                        <Detail icon={Monitor} label={t('caseReports.detail.station')} value={item.current_station || item.queue_stage} />
                    </div>
                    <div className="mt-3 grid gap-3 rounded-xl border border-slate-200/60 bg-white/70 p-3 dark:border-slate-800/60 dark:bg-slate-950/30 lg:grid-cols-2">
                        <TextBlock label={t('caseReports.detail.clinicalIndication')} value={item.clinical_indication} />
                        <TextBlock label={t('caseReports.detail.impression')} value={item.report_sections?.impression} />
                    </div>
                </div>
            )}
        </article>
    );
};

const ScannerDialog = ({ value, onChange, onClose, onLookup, busy, t }) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const rafRef = useRef(null);
    const [cameraState, setCameraState] = useState('idle');
    const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

    const stopCamera = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setCameraState('idle');
    }, []);

    useEffect(() => stopCamera, [stopCamera]);

    const startCamera = async () => {
        if (!supported) {
            setCameraState('unsupported');
            return;
        }
        try {
            setCameraState('starting');
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            streamRef.current = stream;
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            setCameraState('scanning');
            const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            const tick = async () => {
                if (!videoRef.current || !streamRef.current) return;
                const codes = await detector.detect(videoRef.current).catch(() => []);
                if (codes[0]?.rawValue) {
                    onChange(codes[0].rawValue);
                    stopCamera();
                    onLookup(codes[0].rawValue);
                    return;
                }
                rafRef.current = requestAnimationFrame(tick);
            };
            rafRef.current = requestAnimationFrame(tick);
        } catch {
            setCameraState('blocked');
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={<span className="flex items-center gap-2"><QrCode size={18} className="text-teal-600" />{t('caseReports.scanner.title')}</span>}
            size="default"
        >
                <div className="space-y-4">
                    <label className="block">
                        <span className="mb-1 block text-[10px] font-black uppercase text-slate-400">{t('caseReports.scanner.input')}</span>
                        <input autoFocus value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && onLookup()} placeholder={t('caseReports.scanner.placeholder')} className={fieldClass} />
                    </label>
                    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-black dark:border-slate-800">
                        <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
                        {cameraState === 'scanning' && (
                            <span className="pointer-events-none absolute inset-6 rounded-lg border-2 border-teal-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                        )}
                    </div>
                    <p className="text-xs font-semibold text-slate-500">{cameraState === 'unsupported' ? t('caseReports.scanner.unsupported') : cameraState === 'blocked' ? t('caseReports.scanner.blocked') : t('caseReports.scanner.hint')}</p>
                    <div className="flex flex-wrap justify-end gap-2">
                        <IconButton icon={Camera} label={cameraState === 'scanning' ? t('caseReports.scanner.stopCamera') : t('caseReports.scanner.useCamera')} onClick={cameraState === 'scanning' ? stopCamera : startCamera} />
                        <IconButton icon={ScanLine} label={busy ? t('caseReports.scanner.searching') : t('caseReports.scanner.find')} onClick={() => onLookup()} disabled={busy} primary />
                    </div>
                </div>
        </Modal>
    );
};

const DeliveryDialog = ({ item, onClose, onSubmit, busy, t }) => {
    const [method, setMethod] = useState('Patient Portal');
    const defaultContactFor = useCallback((deliveryMethod) => {
        if (deliveryMethod === 'Email' || deliveryMethod === 'Patient Portal') return item.patient_email || '';
        if (deliveryMethod === 'SMS Link' || deliveryMethod === 'WhatsApp Link') return item.patient_phone || '';
        return '';
    }, [item.patient_email, item.patient_phone]);
    const [contact, setContact] = useState(() => defaultContactFor('Patient Portal'));
    const [notes, setNotes] = useState('');
    const contactRequired = ['Email', 'SMS Link', 'WhatsApp Link'].includes(method);
    const handleMethodChange = (nextMethod) => {
        setMethod(nextMethod);
        setContact((current) => current || defaultContactFor(nextMethod));
    };
    return (
        <Modal
            isOpen
            onClose={onClose}
            title={<span className="flex items-center gap-2"><Send size={18} className="text-teal-600" />{t('caseReports.deliveryDialog.title')}</span>}
            size="default"
            footer={(
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onClose} className={smallButtonClass}>{t('caseReports.deliveryDialog.cancel')}</button>
                    <button type="submit" form="case-report-delivery-form" disabled={busy || (contactRequired && !contact.trim())} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-black text-white shadow-sm transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {t('caseReports.deliveryDialog.send')}</button>
                </div>
            )}
        >
            <form id="case-report-delivery-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ item, method, contact, notes }); }}>
                <div className="space-y-4">
                    <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900/60">
                        <p className="font-black text-slate-900 dark:text-slate-100">{item.patient_name || item.mrn}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-slate-500">
                            <span>{item.order_number || '-'}</span>
                            <span aria-hidden="true">&bull;</span>
                            <span>{item.exam_type_name || item.modality_name || '-'}</span>
                        </p>
                    </div>
                    <Field label={t('caseReports.deliveryDialog.method')}><select value={method} onChange={(event) => handleMethodChange(event.target.value)} className={fieldClass}>{DELIVERY_METHODS.map((option) => <option key={option} value={option}>{t(`delivery.methods.${option}`, option)}</option>)}</select></Field>
                    <Field label={t('caseReports.deliveryDialog.contact')}><input value={contact} onChange={(event) => setContact(event.target.value)} required={contactRequired} placeholder={contactRequired ? t('caseReports.deliveryDialog.contactRequired') : t('caseReports.deliveryDialog.contactOptional')} className={fieldClass} /></Field>
                    <Field label={t('caseReports.deliveryDialog.notes')}><input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder={t('caseReports.deliveryDialog.notesPlaceholder')} className={fieldClass} /></Field>
                </div>
            </form>
        </Modal>
    );
};

const Select = ({ value, onChange, label, options, optionLabel, bare = false }) => (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={bare ? fieldClass : `${fieldClass} min-h-11`}>
        <option value="">{label}</option>
        {options.map((option) => Array.isArray(option)
            ? <option key={option[0]} value={option[0]}>{optionLabel ? optionLabel(option[0]) : option[1]}</option>
            : <option key={option} value={option}>{optionLabel ? optionLabel(option) : option}</option>)}
    </select>
);

const Metric = ({ icon: Icon, label, value, tone = 'slate' }) => {
    const tones = {
        slate: 'bg-gradient-to-br from-slate-100 to-slate-50 text-slate-600 ring-1 ring-inset ring-slate-200/60 shadow-sm dark:from-slate-800/80 dark:to-slate-900/80 dark:text-slate-300 dark:ring-slate-700/50',
        teal: 'bg-gradient-to-br from-teal-100/80 to-teal-50/40 text-teal-600 ring-1 ring-inset ring-teal-200/50 shadow-sm dark:from-teal-950/40 dark:to-teal-900/10 dark:text-teal-400 dark:ring-teal-900/30',
        emerald: 'bg-gradient-to-br from-emerald-100/80 to-emerald-50/40 text-emerald-600 ring-1 ring-inset ring-emerald-200/50 shadow-sm dark:from-emerald-950/40 dark:to-emerald-900/10 dark:text-emerald-400 dark:ring-emerald-900/30',
        amber: 'bg-gradient-to-br from-amber-100/80 to-amber-50/40 text-amber-600 ring-1 ring-inset ring-amber-200/50 shadow-sm dark:from-amber-950/40 dark:to-amber-900/10 dark:text-amber-400 dark:ring-amber-900/30'
    };
    return (
        <div className="group border-b border-slate-150/60 p-4 transition-colors duration-200 last:border-b-0 hover:bg-white/80 dark:border-slate-800/60 dark:hover:bg-slate-900/40 sm:p-5 lg:border-b-0">
            <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 transition-colors group-hover:text-slate-600 dark:group-hover:text-slate-300 sm:text-xs">{label}</p>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 sm:h-10 sm:w-10 ${tones[tone]}`}><Icon size={17} /></span>
            </div>
            <p className="mt-2 text-xl font-black tabular-nums text-slate-950 dark:text-white sm:text-2xl">{value}</p>
        </div>
    );
};

const QueueButton = ({ icon: Icon, label, active, onClick }) => (
    <button type="button" title={label} onClick={onClick} className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-all duration-200 ${active ? 'bg-teal-600 text-white shadow-sm shadow-teal-500/30' : 'border border-slate-200/70 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-teal-700 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:border-teal-900/50 dark:hover:bg-teal-950/30'}`}>
        <Icon size={14} /> {label}
    </button>
);

const IconButton = ({ icon: Icon, label, onClick, disabled, primary = false }) => (
    <button type="button" title={label} onClick={onClick} disabled={disabled} className={`group relative inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-black transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900 ${primary ? 'bg-teal-600 text-white shadow-sm hover:bg-teal-700 focus-visible:ring-teal-500' : 'border border-slate-200/70 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-800/80 focus-visible:ring-slate-400'}`}>
        <Icon size={15} /> <span>{label}</span>
    </button>
);

const PageButton = ({ icon: Icon, label, onClick, disabled }) => (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/70 bg-white text-slate-500 shadow-sm transition-colors duration-150 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:border-teal-800 dark:hover:bg-teal-950/30 dark:hover:text-teal-300">
        <Icon size={16} />
    </button>
);

const MiniAction = ({ icon: Icon, label, onClick, disabled, active }) => (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className={`group/mini flex h-8 w-8 items-center justify-center rounded-lg border text-slate-500 transition-all duration-150 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 ${active ? 'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300' : 'border-slate-200/70 bg-white hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700/60 dark:bg-slate-900/50 dark:hover:border-teal-800 dark:hover:bg-teal-950/30 dark:hover:text-teal-300'}`}>
        <Icon size={14} className={`transition-transform duration-200 group-hover/mini:scale-110 ${active ? 'rotate-180' : ''}`} />
    </button>
);

const Badge = ({ tone, children, className = '' }) => <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ring-inset ${tone} ${className}`}>{children}</span>;
const Field = ({ label, children }) => <label className="block"><span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</span>{children}</label>;
const Detail = ({ icon: Icon, label, value }) => <div><p className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400"><Icon size={11} />{label}</p><p className="mt-1 truncate text-xs font-bold text-slate-700 dark:text-slate-300">{value || '-'}</p></div>;
const TextBlock = ({ label, value }) => <div><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs font-medium leading-5 text-slate-600 dark:text-slate-300">{value || '-'}</p></div>;

const PageState = ({ icon: Icon, title, detail, action, actionLabel, spin = false }) => (
    <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"><Icon size={26} className={spin ? 'animate-spin' : ''} /></span>
        <p className="mt-3 text-sm font-black text-slate-800 dark:text-slate-200">{title}</p>
        {detail && <p className="mt-1 max-w-md text-xs font-semibold text-slate-500 dark:text-slate-400">{detail}</p>}
        {action && <button type="button" onClick={action} className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-teal-700 px-4 text-xs font-black text-white shadow-sm transition-colors hover:bg-teal-800">{actionLabel}</button>}
    </div>
);

const fieldClass = 'w-full rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-all duration-150 focus:border-teal-400 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200 outline-none';
const smallButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200/70 bg-white px-4 text-xs font-black text-slate-600 shadow-sm transition-colors duration-150 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:border-slate-600/50 dark:hover:bg-slate-800/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400';

export default CaseReports;
