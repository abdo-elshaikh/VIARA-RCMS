import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    CalendarDays,
    Camera,
    Check,
    CheckCircle2,
    CheckSquare,
    ChevronDown,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ClipboardCheck,
    Clock,
    Download,
    Eye,
    FileSpreadsheet,
    FileText,
    Filter,
    FilterX,
    Hash,
    Layers,
    Loader2,
    Mail,
    Monitor,
    PenLine,
    Phone,
    Printer,
    QrCode,
    RefreshCw,
    ScanLine,
    Search,
    Send,
    ShieldAlert,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    Square,
    Stethoscope,
    User,
    UserRound,
    X,
    Zap
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
import { hasEffectivePermission } from '../utils/effectivePermissions';
import PageHeader from '../components/ui/PageHeader';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import { getPaginationState } from '../utils/pagination';
import { printWhenReady } from '../utils/printDocument';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
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

const ar = {
    eyebrow: 'إدارة وتوثيق التقارير الطبية السريرية',
    title: 'تقارير الحالات وسجل النتائج',
    description: 'متابعة وإدارة التقارير التشخيصية، التسليم للمرضى، الطباعة والتصدير، والبحث السريع عبر رمز QR للإيصال.',
    scanQr: 'مسح رمز QR للإيصال',
    refresh: 'تحديث السجل',
    totalReports: 'التقارير المسجلة',
    finalizedReports: 'تقارير معتمدة',
    pendingReports: 'بحاجة لتقرير / مراجعة',
    deliveredReports: 'تم تسليمها للمريض',
    queues: {
        all: 'كل الحالات',
        pending: 'بحاجة لتقرير',
        finalized: 'معتمدة',
        notDelivered: 'جاهزة للتسليم',
        urgent: 'عاجلة',
        today: 'اليوم'
    },
    searchPlaceholder: 'بحث باسم المريض، الرقم الطبي MRN، رقم الطلب، أو الفاتورة...',
    allReportStatuses: 'جميع حالات التقرير',
    allExamStatuses: 'جميع مراحل الفحص',
    allPriorities: 'جميع درجات الأولوية',
    allModalities: 'جميع أجهزة الأشعة',
    apply: 'تطبيق الفلاتر',
    clear: 'مسح التصفية',
    advanced: 'فلاتر متقدمة',
    from: 'من تاريخ',
    to: 'إلى تاريخ',
    delivered: 'حالة التسليم',
    hasReport: 'محتوى التقرير',
    receipt: 'رقم الإيصال',
    registerTitle: 'سجل تقارير الحالات',
    templateLabel: 'قالب التقرير:',
    savedReport: 'التقرير المحفوظ',
    exportCsv: 'تصدير CSV',
    selectedCount: 'تم تحديد {{count}} تقرير',
    printSelected: 'طباعة المحدد',
    wordSelected: 'تصدير Word',
    csvSelected: 'تصدير CSV',
    clearSelection: 'إلغاء التحديد',
    patientOrder: 'المريض / رقم الطلب',
    examination: 'الفحص والجهاز',
    priority: 'الأولوية',
    reportStatusCol: 'حالة التقرير',
    deliveryCol: 'التسليم للمريض',
    actionsCol: 'الإجراءات السريعة',
    deliveredStatus: 'تم التسليم',
    notDeliveredStatus: 'لم يتم التسليم بعد',
    perPage: 'لكل صفحة:'
};

const tr = (t, key, defaultEn, defaultAr, isAr) => t(key, { defaultValue: isAr ? defaultAr : defaultEn });

const QUICK_QUEUES = [
    { key: '', labelKey: 'all', icon: FileText },
    { key: 'pending', labelKey: 'pending', icon: PenLine },
    { key: 'finalized', labelKey: 'finalized', icon: CheckCircle2 },
    { key: 'notDelivered', labelKey: 'notDelivered', icon: Send },
    { key: 'urgent', labelKey: 'urgent', icon: AlertTriangle },
    { key: 'today', labelKey: 'today', icon: CalendarDays }
];

const statusTone = {
    Draft: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    Typed: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
    Reviewed: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    Approved: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800',
    Finalized: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    Amended: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800'
};

const priorityTone = {
    Emergency: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
    Urgent: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    Routine: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700'
};

const priorityRail = {
    Emergency: 'bg-rose-500',
    Urgent: 'bg-amber-500',
    Routine: 'bg-teal-500'
};

const reportStatus = (item) => item.report_status || (item.report_finalized_at ? 'Finalized' : item.report_content ? 'Typed' : 'Draft');
const isFinalReport = (item) => ['Finalized', 'Amended'].includes(reportStatus(item));
const fmtDate = (value, locale, options = { dateStyle: 'medium' }) => value ? formatLocalizedDate(value, locale, options) : '—';

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

const userHasPermission = (user, permission) => {
    if (!user) return false;
    return hasEffectivePermission(user, permission);
};

const CaseReports = () => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['worklist', 'common']);
    const isAr = i18n.language?.startsWith('ar');
    const isRtl = i18n.dir() === 'rtl';
    const locale = isAr ? 'ar-EG' : 'en-US';
    const reportLanguage = isAr ? 'ar' : 'en';

    const currentUser = useSelector(selectCurrentUser);
    const canDeliver = useMemo(() => userHasPermission(currentUser, 'DELIVER_RESULTS'), [currentUser]);
    const canImprove = useMemo(() => userHasPermission(currentUser, 'IMPROVE_REPORT_FORMAT'), [currentUser]);
    const canWrite = useMemo(() => userHasPermission(currentUser, 'WRITE_REPORTS') || userHasPermission(currentUser, 'AMEND_REPORTS'), [currentUser]);

    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [pageSize, setPageSize] = useState(10);
    const [page, setPage] = useState(1);
    const [activeFilters, setActiveFilters] = useState({ ...EMPTY_FILTERS, limit: 10, offset: 0 });

    const [expandedId, setExpandedId] = useState(null);
    const [selectedIds, setSelectedIds] = useState([]);
    const [deliveryTarget, setDeliveryTarget] = useState(null);
    const [improveTarget, setImproveTarget] = useState(null);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scanValue, setScanValue] = useState('');
    const [isExportingWord, setIsExportingWord] = useState(false);
    const [isBatchBusy, setIsBatchBusy] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');

    const { data, isLoading, isFetching, isError, refetch } = useGetCaseReportsQuery(activeFilters, {
        pollingInterval: 25000,
        refetchOnFocus: true
    });
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

    const { pageCount, startIndex, endIndex } = useMemo(
        () => getPaginationState(summary.total, page, pageSize),
        [summary.total, page, pageSize]
    );

    const pageStart = summary.total ? startIndex + 1 : 0;
    const pageEnd = Math.min(endIndex, summary.total);
    const allPageSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.exam_id));

    useEffect(() => {
        const visibleIds = new Set(items.map((item) => item.exam_id));
        setSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
    }, [items]);

    const setFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

    const applyFilters = () => {
        setActiveFilters({ ...filters, limit: pageSize, offset: 0 });
        setPage(1);
        setExpandedId(null);
        setSelectedIds([]);
    };

    const clearFilters = () => {
        setFilters(EMPTY_FILTERS);
        setActiveFilters({ ...EMPTY_FILTERS, limit: pageSize, offset: 0 });
        setPage(1);
        setExpandedId(null);
        setSelectedIds([]);
    };

    const setQuickQueue = (queue) => {
        const nextFilters = { ...EMPTY_FILTERS, queue };
        setFilters(nextFilters);
        setActiveFilters({ ...nextFilters, limit: pageSize, offset: 0 });
        setPage(1);
        setExpandedId(null);
        setSelectedIds([]);
    };

    const goToPage = (nextPage) => {
        const bounded = Math.min(Math.max(nextPage, 1), pageCount);
        setPage(bounded);
        setExpandedId(null);
        setSelectedIds([]);
        setActiveFilters((current) => ({ ...current, limit: pageSize, offset: (bounded - 1) * pageSize }));
    };

    const handlePageSizeChange = (newSize) => {
        setPageSize(newSize);
        setPage(1);
        setExpandedId(null);
        setSelectedIds([]);
        setActiveFilters((current) => ({ ...current, limit: newSize, offset: 0 }));
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
            const queryParam = selectedTemplateId ? `?templateId=${encodeURIComponent(selectedTemplateId)}` : '';
            const response = await authenticatedFetch(`${API_BASE}/exams/${item.exam_id}/report/pdf${queryParam}`);
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

    const downloadPdf = useCallback(async (item) => {
        try {
            const queryParam = selectedTemplateId
                ? `?templateId=${encodeURIComponent(selectedTemplateId)}&format=pdf&disposition=attachment`
                : '?format=pdf&disposition=attachment';
            const response = await authenticatedFetch(`${API_BASE}/exams/${item.exam_id}/report/pdf${queryParam}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            const patientStem = String(item?.patient_name || 'Patient').replace(/[^a-zA-Z0-9_\u0600-\u06FF]+/g, '_');
            const examStem = String(item?.exam_type_name || 'Report').replace(/[^a-zA-Z0-9_\u0600-\u06FF]+/g, '_');
            const orderStem = String(item?.order_number || item?.mrn || item.exam_id).replace(/[^a-zA-Z0-9_\u0600-\u06FF]+/g, '_');
            anchor.download = `${patientStem}_${examStem}_${orderStem}.pdf`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
            toast.success(t('messages.pdfDownloaded', { defaultValue: 'PDF downloaded successfully' }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('caseReports.toasts.downloadError', { defaultValue: 'Failed to download PDF' })));
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
        const popup = window.open('about:blank', '_blank');
        if (!popup) {
            toast.error(t('caseReports.toasts.popupBlocked', { defaultValue: 'Allow pop-ups to print selected reports.' }));
            return;
        }
        setIsBatchBusy(true);
        try {
            const documents = await Promise.all(selectedItems.map(async (item) => {
                const queryParam = selectedTemplateId ? `?templateId=${encodeURIComponent(selectedTemplateId)}` : '';
                const response = await authenticatedFetch(`${API_BASE}/exams/${item.exam_id}/report/pdf${queryParam}`);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const html = await response.text();
                const parsed = new DOMParser().parseFromString(html, 'text/html');
                parsed.querySelectorAll('.customize-panel, script, .no-print').forEach((node) => node.remove());
                return {
                    body: parsed.body?.innerHTML || html,
                    styles: Array.from(parsed.head?.querySelectorAll('style') || []).map((style) => style.textContent).join('\n'),
                    dir: parsed.documentElement?.dir || 'ltr'
                };
            }));
            const dir = documents.some((document) => document.dir === 'rtl') ? 'rtl' : 'ltr';
            const reportStyles = documents[0]?.styles || '';
            const html = `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Selected case reports</title><style>${reportStyles}</style><style>html,body{margin:0}.report-page{break-after:page;page-break-after:always}.report-page:last-child{break-after:auto;page-break-after:auto}@media screen{body{background:#334155}.report-page{margin-block-end:24px}}@media print{@page{size:A4;margin:12mm 12mm 16mm}.report-page{break-after:page;page-break-after:always}.report-page:last-child{break-after:auto;page-break-after:auto}.customize-panel,.no-print{display:none!important}}</style></head><body>${documents.map((document) => `<section class="report-page">${document.body}</section>`).join('')}</body></html>`;
            const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
            popup.addEventListener('load', () => printWhenReady(popup), { once: true });
            popup.location.replace(url);
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (error) {
            popup.close();
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
            setActiveFilters({ ...EMPTY_FILTERS, receipt: match.receipt_number || match.invoice_number || match.order_number || code, limit: pageSize, offset: 0 });
            setExpandedId(match.exam_id);
            setPage(1);
            setSelectedIds([]);
            setScannerOpen(false);
            toast.success(t('caseReports.toasts.qrOpened', { ref: match.order_number || match.mrn || t('caseReports.title') }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('caseReports.toasts.qrError')));
        }
    }, [lookupReport, scanValue, pageSize, t]);

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
            refetch();
        } catch (error) {
            toast.error(getErrorMessage(error, t('caseReports.toasts.deliveryError')));
        }
    };

    return (
        <div className="space-y-4 pb-12" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Header */}
            <PageHeader
                icon={FileText}
                eyebrowIcon={ShieldCheck}
                eyebrow={tr(t, 'caseReports.eyebrow', 'Clinical Diagnostic Reporting Deck', ar.eyebrow, isAr)}
                title={tr(t, 'caseReports.title', 'Case Reports Register', ar.title, isAr)}
                description={tr(t, 'caseReports.description', 'Manage diagnostic reports, finalize impressions, record patient delivery, print/export documents, and look up receipt QR codes.', ar.description, isAr)}
                meta={isFetching && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-black text-teal-700 dark:text-teal-300">
                        <Loader2 size={13} className="animate-spin" />
                        <span>{tr(t, 'caseReports.syncing', 'Syncing register...', 'جاري المزامنة...', isAr)}</span>
                    </span>
                )}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setScannerOpen(true)}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 active:scale-95"
                        >
                            <QrCode size={16} />
                            <span>{tr(t, 'caseReports.scanQr', 'Scan Receipt QR', ar.scanQr, isAr)}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => refetch()}
                            disabled={isFetching}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-4 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                            <span>{tr(t, 'caseReports.refresh', 'Refresh', ar.refresh, isAr)}</span>
                        </button>
                    </div>
                }
                metrics={[
                    { key: 'total', icon: FileText, tone: 'slate', label: ar.totalReports, value: summary.total, loading: isLoading, error: isError },
                    { key: 'final', icon: CheckCircle2, tone: 'emerald', label: ar.finalizedReports, value: summary.finalized, loading: isLoading, error: isError },
                    { key: 'pending', icon: PenLine, tone: 'amber', label: ar.pendingReports, value: summary.pending, loading: isLoading, error: isError },
                    { key: 'delivered', icon: Send, tone: 'teal', label: ar.deliveredReports, value: summary.delivered, loading: isLoading, error: isError },
                ]}
                metricsLabel={tr(t, 'caseReports.metricsLabel', 'Case report record indicators', 'مؤشرات سجل التقارير', isAr)}
            />

            {/* Quick Queue Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                {QUICK_QUEUES.map((queue) => {
                    const isActive = (activeFilters.queue || '') === queue.key;
                    const Icon = queue.icon;
                    return (
                        <button
                            key={queue.key || 'all'}
                            type="button"
                            onClick={() => setQuickQueue(queue.key)}
                            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-black transition-all ${isActive
                                    ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                                    : 'border border-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                                }`}
                        >
                            <Icon size={14} />
                            <span>{ar.queues[queue.labelKey] || queue.labelKey}</span>
                        </button>
                    );
                })}
            </div>

            {/* Search & Comprehensive Filters */}
            <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1fr_180px_180px_160px_160px_auto_auto]">
                    {/* Search Field */}
                    <div className="relative">
                        <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={filters.search}
                            onChange={(e) => setFilter('search', e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                            placeholder={ar.searchPlaceholder}
                            className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/70 ps-10 pe-4 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-slate-950/40 dark:text-white"
                        />
                        {filters.search && (
                            <button type="button" onClick={() => { setFilter('search', ''); applyFilters(); }} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Report Status */}
                    <select
                        value={filters.reportStatus}
                        onChange={(e) => setFilter('reportStatus', e.target.value)}
                        className="h-10 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-white"
                    >
                        <option value="">{ar.allReportStatuses}</option>
                        {REPORT_STATUSES.map((st) => (
                            <option key={st} value={st}>{st}</option>
                        ))}
                    </select>

                    {/* Exam Stage */}
                    <select
                        value={filters.status}
                        onChange={(e) => setFilter('status', e.target.value)}
                        className="h-10 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-white"
                    >
                        <option value="">{ar.allExamStatuses}</option>
                        {EXAM_STATUSES.map((st) => (
                            <option key={st} value={st}>{st}</option>
                        ))}
                    </select>

                    {/* Priority */}
                    <select
                        value={filters.priority}
                        onChange={(e) => setFilter('priority', e.target.value)}
                        className="h-10 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-white"
                    >
                        <option value="">{ar.allPriorities}</option>
                        {PRIORITIES.map((p) => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>

                    {/* Modality */}
                    <select
                        value={filters.modality}
                        onChange={(e) => setFilter('modality', e.target.value)}
                        className="h-10 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-white"
                    >
                        <option value="">{ar.allModalities}</option>
                        {modalityOptions.map((m) => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>

                    {/* Apply Button */}
                    <button
                        type="button"
                        onClick={applyFilters}
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 active:scale-95"
                    >
                        <Filter size={14} />
                        <span>{ar.apply}</span>
                    </button>

                    {/* Clear Button */}
                    <button
                        type="button"
                        onClick={clearFilters}
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                        <FilterX size={14} />
                        <span>{ar.clear}</span>
                    </button>
                </div>

                {/* Collapsible Advanced Filters */}
                <details className="overflow-hidden rounded-xl border border-slate-200/60 bg-slate-50/50 dark:border-slate-800/60 dark:bg-slate-950/30">
                    <summary className="flex cursor-pointer select-none items-center gap-2 p-3 text-xs font-black uppercase tracking-wider text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                        <SlidersHorizontal size={14} />
                        <span>{ar.advanced}</span>
                        {activeFilterCount > 0 && (
                            <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-black text-teal-700 dark:text-teal-300">
                                {activeFilterCount}
                            </span>
                        )}
                    </summary>
                    <div className="grid gap-3 border-t border-slate-200/50 p-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
                        <div>
                            <span className="block text-[10px] font-black uppercase text-slate-400 mb-1">{ar.from}</span>
                            <input
                                type="date"
                                value={filters.dateFrom}
                                onChange={(e) => setFilter('dateFrom', e.target.value)}
                                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <span className="block text-[10px] font-black uppercase text-slate-400 mb-1">{ar.to}</span>
                            <input
                                type="date"
                                value={filters.dateTo}
                                onChange={(e) => setFilter('dateTo', e.target.value)}
                                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <span className="block text-[10px] font-black uppercase text-slate-400 mb-1">{ar.delivered}</span>
                            <select
                                value={filters.delivered}
                                onChange={(e) => setFilter('delivered', e.target.value)}
                                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            >
                                <option value="">{isAr ? 'الكل' : 'All'}</option>
                                <option value="yes">{isAr ? 'تم التسليم' : 'Delivered'}</option>
                                <option value="no">{isAr ? 'لم يتم التسليم' : 'Not Delivered'}</option>
                            </select>
                        </div>
                        <div>
                            <span className="block text-[10px] font-black uppercase text-slate-400 mb-1">{ar.receipt}</span>
                            <input
                                type="text"
                                value={filters.receipt}
                                onChange={(e) => setFilter('receipt', e.target.value)}
                                placeholder="REC-000123"
                                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            />
                        </div>
                    </div>
                </details>
            </section>

            {/* Register Container & Table */}
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                {/* Table Header Controls */}
                <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                    <div>
                        <h2 className="text-sm font-black text-slate-900 dark:text-white">
                            {ar.registerTitle}
                        </h2>
                        <p className="mt-0.5 text-xs font-semibold text-slate-400">
                            {isAr ? `عرض ${pageStart} - ${pageEnd} من إجمالي ${summary.total}` : `Showing ${pageStart} - ${pageEnd} of ${summary.total}`}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Template Dropdown */}
                        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300">
                            <FileText size={14} className="text-teal-600" />
                            <span className="text-[10px] uppercase text-slate-400">{ar.templateLabel}</span>
                            <select
                                value={selectedTemplateId}
                                onChange={(e) => setSelectedTemplateId(e.target.value)}
                                disabled={isFetchingTemplates}
                                className="bg-transparent outline-none cursor-pointer max-w-[150px] text-xs font-black"
                            >
                                <option value="">{ar.savedReport}</option>
                                {reportTemplates.map((t) => (
                                    <option key={t.template_id} value={t.template_id}>{t.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Export CSV */}
                        <button
                            type="button"
                            onClick={() => downloadCsv(selectedItems)}
                            disabled={!items.length}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                            <FileSpreadsheet size={14} />
                            <span>{ar.exportCsv}</span>
                        </button>
                    </div>
                </div>

                {/* Batch Action Toolbar */}
                {selectedItems.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-500/20 bg-teal-50/80 p-3 dark:border-teal-900/40 dark:bg-teal-950/30">
                        <div className="flex items-center gap-2 text-xs font-black text-teal-800 dark:text-teal-200">
                            <ClipboardCheck size={16} />
                            <span>{isAr ? `تم تحديد ${selectedItems.length} تقرير` : `${selectedItems.length} reports selected`}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={printBatch}
                                disabled={isBatchBusy}
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-xs font-bold text-white hover:bg-teal-500 disabled:opacity-50"
                            >
                                <Printer size={13} />
                                <span>{ar.printSelected}</span>
                            </button>
                            <button
                                type="button"
                                onClick={exportSelectedWord}
                                disabled={isExportingWord}
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-teal-500/30 bg-white px-3 text-xs font-bold text-teal-800 hover:bg-teal-50 dark:bg-slate-900 dark:text-teal-300"
                            >
                                <FileText size={13} />
                                <span>{ar.wordSelected}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedIds([])}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                                <X size={13} />
                                <span>{ar.clearSelection}</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Table Header Row */}
                <div className="hidden grid-cols-[36px_1.4fr_1.2fr_100px_110px_140px_auto] items-center gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-950/40 lg:grid">
                    <button
                        type="button"
                        onClick={togglePageSelected}
                        className="flex h-5 w-5 items-center justify-center text-slate-400 hover:text-teal-600"
                    >
                        {allPageSelected ? <CheckSquare size={16} className="text-teal-600" /> : <Square size={16} />}
                    </button>
                    <span>{ar.patientOrder}</span>
                    <span>{ar.examination}</span>
                    <span>{ar.priority}</span>
                    <span>{ar.reportStatusCol}</span>
                    <span>{ar.deliveryCol}</span>
                    <span className="text-end">{ar.actionsCol}</span>
                </div>

                {/* Table Body Rows */}
                {isLoading ? (
                    <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-slate-400">
                        <Loader2 size={28} className="animate-spin text-teal-600" />
                        <p className="text-xs font-bold">Loading case reports register...</p>
                    </div>
                ) : isError ? (
                    <div className="p-8 text-center">
                        <AlertTriangle size={36} className="mx-auto text-rose-500" />
                        <p className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-200">Could not load case reports</p>
                        <button type="button" onClick={() => refetch()} className="mt-3 inline-flex h-9 items-center rounded-xl bg-teal-600 px-4 text-xs font-bold text-white">
                            Retry
                        </button>
                    </div>
                ) : items.length === 0 ? (
                    <div className="p-12 text-center">
                        <FileText size={40} className="mx-auto text-slate-300 dark:text-slate-600" />
                        <h3 className="mt-3 text-sm font-black text-slate-800 dark:text-white">
                            {isAr ? 'لا توجد تقارير مطابقة للفلاتر الحالية' : 'No matching case reports'}
                        </h3>
                        <p className="mt-1 text-xs text-slate-400">
                            {isAr ? 'جرب تغيير شروط البحث أو اختيار قائمة أخرى.' : 'Try changing your search query or queue filters.'}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                        {items.map((item) => {
                            const status = reportStatus(item);
                            const finalized = isFinalReport(item);
                            const priorityKey = PRIORITIES.includes(item.priority) ? item.priority : 'Routine';
                            const isSelected = selectedIds.includes(item.exam_id);
                            const isExpanded = expandedId === item.exam_id;

                            return (
                                <article
                                    key={item.exam_id}
                                    className={`group relative transition-all duration-150 ${isSelected
                                            ? 'bg-teal-50/60 dark:bg-teal-950/20'
                                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-900/40'
                                        }`}
                                >
                                    {/* Acuity Side Stripe */}
                                    <div className={`absolute inset-y-0 start-0 w-1 ${priorityRail[priorityKey]}`} />

                                    <div className="grid grid-cols-1 gap-3 p-4 ps-5 lg:grid-cols-[36px_1.4fr_1.2fr_100px_110px_140px_auto] lg:items-center">
                                        {/* Checkbox */}
                                        <button
                                            type="button"
                                            onClick={() => toggleSelected(item.exam_id)}
                                            className="flex h-6 w-6 items-center justify-center text-slate-400 hover:text-teal-600"
                                        >
                                            {isSelected ? <CheckSquare size={16} className="text-teal-600" /> : <Square size={16} />}
                                        </button>

                                        {/* Patient Info */}
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 font-black text-xs">
                                                    <User size={14} />
                                                </span>
                                                <h3 className="truncate text-xs font-black text-slate-900 dark:text-white">
                                                    {item.patient_name || '—'}
                                                </h3>
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                                                <span>MRN: <strong className="text-slate-700 dark:text-slate-300">{item.mrn || '—'}</strong></span>
                                                <span>·</span>
                                                <span>Order #{item.order_number || item.exam_id}</span>
                                            </div>
                                        </div>

                                        {/* Examination & Modality */}
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-200">
                                                {item.exam_type_name || item.modality_name || '—'}
                                            </p>
                                            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                                                <Monitor size={12} className="text-teal-600" />
                                                <span>{item.modality_name || '—'} {item.body_part ? `· ${item.body_part}` : ''}</span>
                                            </p>
                                        </div>

                                        {/* Priority Badge */}
                                        <div>
                                            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase ${priorityTone[priorityKey] || priorityTone.Routine}`}>
                                                {priorityKey}
                                            </span>
                                        </div>

                                        {/* Report Status Badge */}
                                        <div>
                                            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase ${statusTone[status] || statusTone.Draft}`}>
                                                {status}
                                            </span>
                                        </div>

                                        {/* Delivery Info */}
                                        <div className="min-w-0 text-xs">
                                            <p className="font-bold text-slate-700 dark:text-slate-300">
                                                {item.last_delivery_status || (item.delivered_at ? ar.deliveredStatus : ar.notDeliveredStatus)}
                                            </p>
                                            <p className="font-mono text-[10.5px] text-slate-400">
                                                {fmtDate(item.last_delivery_at || item.delivered_at || item.report_finalized_at, locale, { dateStyle: 'short', timeStyle: 'short' })}
                                            </p>
                                        </div>

                                        {/* Quick Action Icons */}
                                        <div className="flex flex-wrap items-center justify-start lg:justify-end gap-1">
                                            {/* Open / Edit Report */}
                                            <button
                                                type="button"
                                                onClick={() => navigate(`/reports/editor/${item.exam_id}`, { state: { exam: item } })}
                                                title={finalized ? 'View Report' : 'Write / Edit Report'}
                                                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-teal-500 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
                                            >
                                                {finalized || !canWrite ? <Eye size={14} /> : <PenLine size={14} />}
                                            </button>

                                            {/* Print PDF */}
                                            <button
                                                type="button"
                                                onClick={() => openPrintableReport(item, true)}
                                                title="Print PDF Report"
                                                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-teal-500 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
                                            >
                                                <Printer size={14} />
                                            </button>

                                            {/* Download PDF */}
                                            <button
                                                type="button"
                                                onClick={() => downloadPdf(item)}
                                                title="Download PDF"
                                                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-teal-500 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
                                            >
                                                <Download size={14} />
                                            </button>

                                            {/* Export Word */}
                                            <button
                                                type="button"
                                                onClick={() => exportWord(item)}
                                                disabled={isExportingWord}
                                                title="Export DOCX Word"
                                                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-teal-500 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
                                            >
                                                <FileText size={14} />
                                            </button>

                                            {/* AI Format / Improve */}
                                            {canImprove && (
                                                <button
                                                    type="button"
                                                    onClick={() => setImproveTarget(item)}
                                                    title="AI Format & Polish Report"
                                                    className="grid h-8 w-8 place-items-center rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-700 hover:bg-teal-500 hover:text-white dark:text-teal-300 transition"
                                                >
                                                    <Sparkles size={14} />
                                                </button>
                                            )}

                                            {/* Deliver to Patient */}
                                            {canDeliver && (
                                                <button
                                                    type="button"
                                                    onClick={() => setDeliveryTarget(item)}
                                                    disabled={!finalized}
                                                    title="Deliver Report to Patient"
                                                    className="grid h-8 w-8 place-items-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-700 hover:bg-sky-500 hover:text-white disabled:opacity-40 dark:text-sky-300 transition"
                                                >
                                                    <Send size={14} />
                                                </button>
                                            )}

                                            {/* Expand Details */}
                                            <button
                                                type="button"
                                                onClick={() => setExpandedId(isExpanded ? null : item.exam_id)}
                                                title="Toggle Case Metadata"
                                                className={`grid h-8 w-8 place-items-center rounded-lg border text-slate-500 transition ${isExpanded
                                                        ? 'border-teal-500 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300 rotate-180'
                                                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                                                    }`}
                                            >
                                                <ChevronDown size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Expanded Details Drawer */}
                                    {isExpanded && (
                                        <div className="border-t border-slate-100 bg-slate-50/80 p-4 ps-12 dark:border-slate-800 dark:bg-slate-950/40 space-y-3 animate-in fade-in duration-150">
                                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-xs">
                                                <div>
                                                    <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Scheduled Date</span>
                                                    <p className="font-bold text-slate-800 dark:text-slate-200">{fmtDate(item.start_time, locale, { dateStyle: 'medium', timeStyle: 'short' })}</p>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Radiologist</span>
                                                    <p className="font-bold text-slate-800 dark:text-slate-200">{item.radiologist_name || '—'}</p>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Referring Doctor</span>
                                                    <p className="font-bold text-slate-800 dark:text-slate-200">{item.referring_doctor_name || '—'}</p>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Invoice #</span>
                                                    <p className="font-mono font-bold text-slate-800 dark:text-slate-200">{item.invoice_number || '—'}</p>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Receipt QR #</span>
                                                    <p className="font-mono font-bold text-slate-800 dark:text-slate-200">{item.receipt_number || '—'}</p>
                                                </div>
                                            </div>

                                            {item.clinical_indication && (
                                                <div className="rounded-xl border border-slate-200/80 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
                                                    <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Clinical Indication</span>
                                                    <p className="font-medium text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{item.clinical_indication}</p>
                                                </div>
                                            )}

                                            {item.report_sections?.impression && (
                                                <div className="rounded-xl border border-teal-500/30 bg-teal-50/50 p-3 text-xs dark:border-teal-900/40 dark:bg-teal-950/20">
                                                    <span className="text-[10px] font-black uppercase text-teal-700 dark:text-teal-300 block mb-1">Diagnostic Impression</span>
                                                    <p className="font-bold text-slate-900 dark:text-white whitespace-pre-wrap">{item.report_sections.impression}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                )}

                {/* Rich Pagination Control Bar */}
                {summary.total > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            <span>
                                {isAr
                                    ? `عرض ${pageStart} - ${pageEnd} من إجمالي ${summary.total} تقرير`
                                    : `Showing ${pageStart} - ${pageEnd} of ${summary.total} case reports`}
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400">{ar.perPage}</span>
                            <select
                                value={pageSize}
                                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                                {[10, 25, 50, 100].map((size) => (
                                    <option key={size} value={size}>{size}</option>
                                ))}
                            </select>
                        </div>

                        <Pagination
                            currentPage={page}
                            pageCount={pageCount}
                            onPageChange={goToPage}
                            isRtl={isRtl}
                        />
                    </div>
                )}
            </section>

            {/* QR Scanner Dialog */}
            {scannerOpen && (
                <ScannerDialog
                    value={scanValue}
                    onChange={setScanValue}
                    onClose={() => setScannerOpen(false)}
                    onLookup={runLookup}
                    busy={isLookingUp}
                    t={t}
                    isAr={isAr}
                />
            )}

            {/* Delivery Dialog */}
            {deliveryTarget && (
                <DeliveryDialog
                    item={deliveryTarget}
                    onClose={() => setDeliveryTarget(null)}
                    onSubmit={deliverToPatient}
                    busy={isDelivering}
                    t={t}
                    isAr={isAr}
                />
            )}

            {/* AI Improve Dialog */}
            {improveTarget && (
                <ImproveDialog
                    item={improveTarget}
                    language={reportLanguage}
                    onClose={() => setImproveTarget(null)}
                    t={t}
                    isAr={isAr}
                />
            )}
        </div>
    );
};

/* ─── Scanner Modal ─── */
const ScannerDialog = ({ value, onChange, onClose, onLookup, busy, t, isAr }) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const rafRef = useRef(null);
    const closedRef = useRef(false);
    const [cameraState, setCameraState] = useState('idle');
    const supported = typeof window !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

    const stopCamera = useCallback(() => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setCameraState('idle');
    }, []);

    useEffect(() => () => {
        closedRef.current = true;
        stopCamera();
    }, [stopCamera]);

    const startCamera = async () => {
        if (!supported) {
            setCameraState('unsupported');
            return;
        }
        try {
            setCameraState('starting');
            const [stream, jsqrModule] = await Promise.all([
                navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }),
                import('jsqr').then((m) => m.default || m).catch(() => null)
            ]);

            if (closedRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }

            if (!jsqrModule) {
                toast.error(t('caseReports.scanner.loadError') || 'Failed to initialize QR engine');
                setCameraState('unsupported');
                stream.getTracks().forEach((track) => track.stop());
                return;
            }

            streamRef.current = stream;
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            setCameraState('scanning');

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', { willReadFrequently: true });

            const tick = () => {
                if (!videoRef.current || !streamRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
                    if (streamRef.current) rafRef.current = requestAnimationFrame(tick);
                    return;
                }
                canvas.height = videoRef.current.videoHeight;
                canvas.width = videoRef.current.videoWidth;
                context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const code = typeof jsqrModule === 'function' ? jsqrModule(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' }) : null;

                if (code && code.data) {
                    onChange(code.data);
                    stopCamera();
                    onLookup(code.data);
                    return;
                }
                rafRef.current = requestAnimationFrame(tick);
            };
            rafRef.current = requestAnimationFrame(tick);
        } catch {
            if (!closedRef.current) setCameraState('blocked');
        }
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={<span className="flex items-center gap-2"><QrCode size={18} className="text-teal-600" />{isAr ? 'البحث عن تقرير بواسطة رمز QR للإيصال' : 'Find report by receipt QR'}</span>}
            size="default"
        >
            <div className="space-y-4">
                <label className="block">
                    <span className="mb-1 block text-[10px] font-black uppercase text-slate-400">{isAr ? 'أدخل كود الإيصال أو رقم الفحص' : 'Enter Receipt Code / Order #'}</span>
                    <input
                        autoFocus
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && onLookup()}
                        placeholder="REC-000123 / ORD-000456"
                        className="h-10 w-full rounded-xl border border-slate-200 px-3.5 text-xs font-semibold outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                </label>
                <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-black dark:border-slate-800">
                    <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
                    {cameraState === 'scanning' && (
                        <span className="pointer-events-none absolute inset-6 rounded-lg border-2 border-teal-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                    )}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                    <button
                        type="button"
                        onClick={cameraState === 'scanning' ? stopCamera : startCamera}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                        <Camera size={14} />
                        <span>{cameraState === 'scanning' ? (isAr ? 'إيقاف الكاميرا' : 'Stop Camera') : (isAr ? 'تشغيل الكاميرا' : 'Use Camera')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onLookup()}
                        disabled={busy || !value.trim()}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-black text-white hover:bg-teal-500 transition disabled:opacity-40"
                    >
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
                        <span>{isAr ? 'بحث عن الحالة' : 'Lookup Case'}</span>
                    </button>
                </div>
            </div>
        </Modal>
    );
};

/* ─── Delivery Modal ─── */
const DeliveryDialog = ({ item, onClose, onSubmit, busy, isAr }) => {
    const [method, setMethod] = useState('Patient Portal');
    const [contact, setContact] = useState(item.patient_email || item.patient_phone || '');
    const [notes, setNotes] = useState('');

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={<span className="flex items-center gap-2"><Send size={18} className="text-teal-600" />{isAr ? 'تسليم التقرير للمريض' : 'Deliver Case Report'}</span>}
            size="default"
            footer={
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                        {isAr ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                        type="submit"
                        form="case-report-delivery-form"
                        disabled={busy}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-600 px-5 text-xs font-black text-white hover:bg-teal-500 transition disabled:opacity-50"
                    >
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        <span>{isAr ? 'تأكيد التسليم' : 'Record Delivery'}</span>
                    </button>
                </div>
            }
        >
            <form id="case-report-delivery-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ item, method, contact, notes }); }}>
                <div className="space-y-3 text-xs">
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                        <p className="font-black text-slate-900 dark:text-white">{item.patient_name || item.mrn}</p>
                        <p className="mt-0.5 text-slate-500">{item.exam_type_name || item.modality_name} · Order #{item.order_number || item.exam_id}</p>
                    </div>

                    <label className="block">
                        <span className="block text-[10px] font-black uppercase text-slate-400 mb-1">{isAr ? 'وسيلة التسليم' : 'Delivery Method'}</span>
                        <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                            {DELIVERY_METHODS.map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </label>

                    <label className="block">
                        <span className="block text-[10px] font-black uppercase text-slate-400 mb-1">{isAr ? 'جهة الاتصال (البريد / الهاتف)' : 'Recipient Contact'}</span>
                        <input
                            value={contact}
                            onChange={(e) => setContact(e.target.value)}
                            placeholder="patient@example.com / +20 100 000 0000"
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                    </label>

                    <label className="block">
                        <span className="block text-[10px] font-black uppercase text-slate-400 mb-1">{isAr ? 'ملاحظات التسليم' : 'Delivery Notes'}</span>
                        <input
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder={isAr ? 'ملاحظات إضافية...' : 'Optional notes...'}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                    </label>
                </div>
            </form>
        </Modal>
    );
};

/* ─── AI Improve Modal ─── */
const ImproveDialog = ({ item, language, onClose, t, isAr }) => {
    const original = useMemo(() => reportPlainText(item), [item]);
    const [suggestion, setSuggestion] = useState('');
    const [improveReportFormat, { isLoading }] = useImproveReportFormatMutation();

    const runImprove = useCallback(async () => {
        if (!original || original.trim().length < 10) {
            toast.error('Report text is empty or too short');
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
            toast.error('AI refinement service unavailable.');
        }
    }, [original, improveReportFormat, item.exam_id, item.modality_name, item.exam_type_name, language]);

    useEffect(() => { runImprove(); }, [runImprove]);

    const applySuggestion = async () => {
        if (!suggestion) return;
        try {
            await navigator.clipboard?.writeText(suggestion);
            toast.success(isAr ? 'تم نسخ التقرير المحسن إلى الحافظة' : 'Improved report copied to clipboard');
        } catch {
            toast.success('Applied successfully');
        }
        onClose();
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            title={<span className="flex items-center gap-2"><Sparkles size={18} className="text-teal-600" />{isAr ? 'تحسين وتنسيق التقرير بالذكاء الاصطناعي' : 'AI Clinical Report Polishing'}</span>}
            size="large"
            footer={
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                        {isAr ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button type="button" onClick={runImprove} disabled={isLoading} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
                        <span>{isAr ? 'إعادة التوليد' : 'Regenerate'}</span>
                    </button>
                    <button type="button" onClick={applySuggestion} disabled={isLoading || !suggestion} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-600 px-5 text-xs font-black text-white hover:bg-teal-500 transition disabled:opacity-50">
                        <Sparkles size={14} />
                        <span>{isAr ? 'نسخ واستخدام' : 'Copy & Apply'}</span>
                    </button>
                </div>
            }
        >
            <div className="space-y-3">
                <div className="grid gap-3 lg:grid-cols-2">
                    <div>
                        <span className="block text-[10px] font-black uppercase text-slate-400 mb-1">{isAr ? 'النص الأصلي' : 'Original Text'}</span>
                        <div className="h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300 whitespace-pre-wrap font-mono">
                            {original || '—'}
                        </div>
                    </div>
                    <div>
                        <span className="block text-[10px] font-black uppercase text-slate-400 mb-1">{isAr ? 'المقترح المحسن بالذكاء الاصطناعي' : 'AI Polished Suggestion'}</span>
                        {isLoading ? (
                            <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                                <Loader2 size={24} className="animate-spin text-teal-600" />
                                <span className="text-xs font-bold">{isAr ? 'جاري تحسين التقرير...' : 'Polishing report...'}</span>
                            </div>
                        ) : (
                            <textarea
                                value={suggestion}
                                onChange={(e) => setSuggestion(e.target.value)}
                                className="h-64 w-full rounded-xl border border-teal-500/40 bg-teal-50/30 p-3 text-xs leading-relaxed text-slate-900 outline-none focus:border-teal-500 focus:bg-white dark:border-teal-900/40 dark:bg-teal-950/20 dark:text-white dark:focus:bg-slate-900 font-mono"
                            />
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default CaseReports;
