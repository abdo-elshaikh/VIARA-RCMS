import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    BookOpen,
    Check,
    CheckCircle,
    CheckCircle2,
    Clock,
    Download,
    Eye,
    FileSpreadsheet,
    FileText,
    History,
    Lock,
    Plus,
    RefreshCw,
    Search,
    Shield,
    ShieldAlert,
    ShieldCheck,
    SlidersHorizontal,
    User,
    UserCheck,
    UserRound,
    X,
    XCircle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    useGetPrivacyRequestsQuery,
    useResolvePrivacyRequestMutation,
    useCreatePrivacyRequestMutation,
    useGetPatientsQuery,
    useGetPatientConsentsQuery,
    useGetCurrentPatientConsentsQuery,
    useAddPatientConsentMutation,
    useRevokePatientConsentMutation
} from '../store/api';
import { downloadAuthenticatedFile } from '../utils/authenticatedFetch';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import TextPromptDialog from '../components/ui/TextPromptDialog';
import usePageTitle from '../hooks/usePageTitle';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const CLOSED_STATUSES = new Set(['Completed', 'Resolved', 'Rejected', 'Cancelled']);

const PrivacyCenter = ({ embedded = false }) => {
    const { t, i18n } = useTranslation('governance');
    usePageTitle(embedded ? null : t('privacyCenter.title', { defaultValue: 'Patient Privacy & Data Rights Center' }));
    const isRtl = i18n.dir() === 'rtl';
    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';

    // Top-Level Navigation Tab
    const [activeTab, setActiveTab] = useState('requests'); // 'requests' | 'consents' | 'retention'

    // Queries & Mutations
    const { data: requests = [], isLoading: isLoadingRequests, refetch: refetchRequests } = useGetPrivacyRequestsQuery();
    const [resolvePrivacyRequest] = useResolvePrivacyRequestMutation();
    const [createPrivacyRequest, { isLoading: isCreatingRequest }] = useCreatePrivacyRequestMutation();

    // Dialog & UI State for Requests Tab
    const [resolvingId, setResolvingId] = useState(null);
    const [pendingExportRequest, setPendingExportRequest] = useState(null);
    const [pendingAnonymizeRequest, setPendingAnonymizeRequest] = useState(null);
    const [anonymizeCheckboxConfirmed, setAnonymizeCheckboxConfirmed] = useState(false);
    const [resolveTarget, setResolveTarget] = useState(null);
    const [rejectTarget, setRejectTarget] = useState(null);
    const [inspectTarget, setInspectTarget] = useState(null);
    const [isNewModalOpen, setIsNewModalOpen] = useState(false);

    // New Request Form State
    const [patientSearch, setPatientSearch] = useState('');
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [newRequestType, setNewRequestType] = useState('Export');
    const [newNotes, setNewNotes] = useState('');

    // Quick Filters & Search for Requests Tab
    const [statusFilter, setStatusFilter] = useState('Open');
    const [typeFilter, setTypeFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [mounted, setMounted] = useState(false);

    // Consents Tab State
    const [consentPatientSearch, setConsentPatientSearch] = useState('');
    const [consentSelectedPatient, setConsentSelectedPatient] = useState(null);
    const [isGrantConsentModalOpen, setIsGrantConsentModalOpen] = useState(false);
    const [grantConsentType, setGrantConsentType] = useState('Treatment');
    const [grantConsentSource, setGrantConsentSource] = useState('Staff');
    const [grantConsentNotes, setGrantConsentNotes] = useState('');
    const [revokeConsentTarget, setRevokeConsentTarget] = useState(null);

    // Patient Queries for Dropdowns
    const { data: patientSearchResults = [] } = useGetPatientsQuery(
        { search: patientSearch },
        { skip: !isNewModalOpen || patientSearch.trim().length < 2 }
    );

    const { data: consentPatientResults = [] } = useGetPatientsQuery(
        { search: consentPatientSearch },
        { skip: !consentPatientSearch || consentPatientSearch.trim().length < 2 }
    );

    // Consents Queries for Selected Patient
    const selectedConsentPatientId = consentSelectedPatient?.patient_id;
    const {
        data: patientConsentsData,
        isLoading: isLoadingConsents,
        refetch: refetchConsents
    } = useGetCurrentPatientConsentsQuery(selectedConsentPatientId, {
        skip: !selectedConsentPatientId
    });

    const {
        data: patientConsentsHistory = [],
        refetch: refetchConsentsHistory
    } = useGetPatientConsentsQuery(selectedConsentPatientId, {
        skip: !selectedConsentPatientId
    });

    const [addPatientConsent, { isLoading: isAddingConsent }] = useAddPatientConsentMutation();
    const [revokePatientConsent, { isLoading: isRevokingConsent }] = useRevokePatientConsentMutation();

    // Telemetry & KPI calculations
    const pendingCount = useMemo(() => requests.filter((request) => !CLOSED_STATUSES.has(request.status)).length, [requests]);
    const summary = useMemo(() => {
        const completed = requests.filter((request) => ['Completed', 'Resolved'].includes(request.status)).length;
        const total = requests.length;
        const complianceRate = total > 0 ? Math.round((completed / total) * 100) : 100;
        return {
            open: pendingCount,
            completed,
            rejected: requests.filter((request) => request.status === 'Rejected').length,
            exportsReady: requests.filter((request) => ['Completed', 'Resolved'].includes(request.status) && request.request_type === 'Export' && request.export_id).length,
            complianceRate
        };
    }, [pendingCount, requests]);

    // Visible requests filtered
    const visibleRequests = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        return requests.filter((request) => {
            const open = !CLOSED_STATUSES.has(request.status);
            if (statusFilter === 'Open' && !open) return false;
            if (statusFilter !== 'All' && statusFilter !== 'Open' && request.status !== statusFilter) return false;
            if (typeFilter !== 'All' && request.request_type !== typeFilter) return false;
            if (!normalizedSearch) return true;
            return [request.patient_name, request.mrn, request.notes, request.resolution_notes]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(normalizedSearch));
        });
    }, [requests, searchTerm, statusFilter, typeFilter]);

    useEffect(() => { setMounted(true); }, []);

    const reveal = (delay = 0) => ({
        className: `transition-all duration-700 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'} motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none`,
        style: { transitionDelay: `${delay}ms` },
    });

    // Request Handlers
    const executeExport = async () => {
        if (!pendingExportRequest) return false;
        const { request_id: requestId } = pendingExportRequest;
        setResolvingId(requestId);
        try {
            const response = await resolvePrivacyRequest({ requestId, action: 'Export' }).unwrap();
            const exportId = response.export?.export_id;
            if (exportId) {
                await downloadAuthenticatedFile(`${API_BASE}/privacy/exports/${exportId}/download`, `patient-data-${pendingExportRequest.mrn || requestId}.json`);
            }
            toast.success(t('privacyCenter.exported'));
            setPendingExportRequest(null);
            refetchRequests();
            return true;
        } catch (error) {
            toast.error(error?.data?.error || t('privacyCenter.actionError', { action: 'Export' }));
            return false;
        } finally {
            setResolvingId(null);
        }
    };

    const executeAnonymize = async () => {
        if (!pendingAnonymizeRequest || !anonymizeCheckboxConfirmed) return false;
        const { request_id: requestId } = pendingAnonymizeRequest;
        setResolvingId(requestId);
        try {
            await resolvePrivacyRequest({ requestId, action: 'Anonymize' }).unwrap();
            toast.success(t('privacyCenter.anonymized'));
            setPendingAnonymizeRequest(null);
            setAnonymizeCheckboxConfirmed(false);
            refetchRequests();
            return true;
        } catch (error) {
            toast.error(error?.data?.error || t('privacyCenter.actionError', { action: 'Anonymize' }));
            return false;
        } finally {
            setResolvingId(null);
        }
    };

    const rejectRequest = async (notes) => {
        if (!rejectTarget) return false;
        setResolvingId(rejectTarget.request_id);
        try {
            await resolvePrivacyRequest({ requestId: rejectTarget.request_id, action: 'Reject', notes }).unwrap();
            toast.success(t('privacyCenter.rejected', { defaultValue: 'Privacy request rejected.' }));
            setRejectTarget(null);
            refetchRequests();
            return true;
        } catch (error) {
            toast.error(error?.data?.error || t('privacyCenter.rejectError', { defaultValue: 'The request could not be rejected.' }));
            return false;
        } finally {
            setResolvingId(null);
        }
    };

    const resolveCorrectionRequest = async (notes) => {
        if (!resolveTarget) return false;
        setResolvingId(resolveTarget.request_id);
        try {
            await resolvePrivacyRequest({ requestId: resolveTarget.request_id, action: 'Resolve', notes }).unwrap();
            toast.success(t('privacyCenter.resolved', { defaultValue: 'Privacy request resolved.' }));
            setResolveTarget(null);
            refetchRequests();
            return true;
        } catch (error) {
            toast.error(error?.data?.error || t('privacyCenter.resolveError', { defaultValue: 'The request could not be resolved.' }));
            return false;
        } finally {
            setResolvingId(null);
        }
    };

    const handleCreateNewRequest = async (e) => {
        e?.preventDefault();
        if (!selectedPatient) {
            toast.error(t('privacyCenter.newRequest.selectPatientWarning'));
            return;
        }

        try {
            await createPrivacyRequest({
                patient_id: selectedPatient.patient_id,
                request_type: newRequestType,
                notes: newNotes.trim() || undefined
            }).unwrap();

            toast.success(t('privacyCenter.newRequest.success'));
            setIsNewModalOpen(false);
            setSelectedPatient(null);
            setPatientSearch('');
            setNewNotes('');
            refetchRequests();
        } catch (error) {
            toast.error(error?.data?.error || t('privacyCenter.actionError', { action: newRequestType }));
        }
    };

    const handleExportAuditCsv = () => {
        if (visibleRequests.length === 0) {
            toast.error(isRtl ? 'لا توجد سجلات مطابقة للتصدير' : 'No records to export');
            return;
        }

        const headers = [
            isRtl ? 'رقم الطلب' : 'Request ID',
            isRtl ? 'اسم المريض' : 'Patient Name',
            isRtl ? 'الرقم الطبي' : 'MRN',
            isRtl ? 'نوع الطلب' : 'Request Type',
            isRtl ? 'الحالة' : 'Status',
            isRtl ? 'تاريخ التقديم' : 'Requested At',
            isRtl ? 'تاريخ المعالجة' : 'Resolved At',
            isRtl ? 'المعالج' : 'Handled By',
            isRtl ? 'ملاحظات الطلب' : 'Request Notes',
            isRtl ? 'ملاحظات الحل / الرفض' : 'Resolution / Rejection Notes'
        ];

        const escapeCsv = (str) => {
            if (!str) return '""';
            const clean = String(str).replace(/"/g, '""');
            return `"${clean}"`;
        };

        const rows = visibleRequests.map((r) => [
            escapeCsv(r.request_id),
            escapeCsv(r.patient_name),
            escapeCsv(r.mrn),
            escapeCsv(t(`privacyCenter.types.${r.request_type}`, { defaultValue: r.request_type })),
            escapeCsv(t(`privacyCenter.statuses.${r.status}`, { defaultValue: r.status })),
            escapeCsv(new Date(r.created_at).toLocaleString()),
            escapeCsv(r.resolved_at ? new Date(r.resolved_at).toLocaleString() : '—'),
            escapeCsv(r.resolved_by_name || '—'),
            escapeCsv(r.notes || '—'),
            escapeCsv(r.resolution_notes || '—')
        ]);

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `privacy-compliance-audit-${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success(t('privacyCenter.exportReport.success'));
    };

    const downloadExistingExport = async (request) => {
        if (!request.export_id) return;
        setResolvingId(request.request_id);
        try {
            await downloadAuthenticatedFile(`${API_BASE}/privacy/exports/${request.export_id}/download`, `patient-data-${request.mrn || request.request_id}.json`);
            toast.success(t('privacyCenter.downloaded', { defaultValue: 'Patient data export downloaded.' }));
        } catch (error) {
            toast.error(error?.message || t('privacyCenter.downloadError', { defaultValue: 'The export could not be downloaded.' }));
        } finally {
            setResolvingId(null);
        }
    };

    // Consent Actions
    const handleGrantConsent = async (e) => {
        e?.preventDefault();
        if (!consentSelectedPatient) return;

        try {
            await addPatientConsent({
                patientId: consentSelectedPatient.patient_id,
                type: grantConsentType,
                source: grantConsentSource,
                notes: grantConsentNotes.trim() || undefined
            }).unwrap();

            toast.success(t('privacyCenter.consentsTab.grantModal.success'));
            setIsGrantConsentModalOpen(false);
            setGrantConsentNotes('');
            refetchConsents();
            refetchConsentsHistory();
        } catch (error) {
            toast.error(error?.data?.error || (isRtl ? 'تعذر تسجيل الموافقة' : 'Could not record consent'));
        }
    };

    const handleRevokeConsent = async (reason) => {
        if (!revokeConsentTarget) return false;
        try {
            await revokePatientConsent({
                consentId: revokeConsentTarget.consent_id,
                reason
            }).unwrap();

            toast.success(t('privacyCenter.consentsTab.revokeModal.success'));
            setRevokeConsentTarget(null);
            refetchConsents();
            refetchConsentsHistory();
            return true;
        } catch (error) {
            toast.error(error?.data?.error || (isRtl ? 'تعذر إلغاء الموافقة' : 'Could not revoke consent'));
            return false;
        }
    };

    const requestType = (request) => t(`privacyCenter.types.${request.request_type}`, { defaultValue: request.request_type });
    const requestStatus = (request) => t(`privacyCenter.statuses.${request.status}`, { defaultValue: request.status });
    const patientName = (request) => request.patient_name || request.mrn || '-';

    if (isLoadingRequests) return <div className="p-10 text-center text-sm font-semibold text-slate-500">{t('privacyCenter.loading')}</div>;

    return (
        <div className={embedded ? 'space-y-5 pb-0' : 'mx-auto max-w-7xl space-y-6 pb-10'}>
            {/* VIARA Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8 space-y-6">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center min-w-0">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <ShieldCheck size={28} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <UserRound size={11} />
                                    <span>{t('privacyCenter.eyebrow')}</span>
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-black text-sky-700 dark:text-sky-300">
                                    <Lock size={10} />
                                    <span>HIPAA / PDPL Compliant</span>
                                </span>
                            </div>
                            <h1 className="mt-1 break-words text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('privacyCenter.title', { defaultValue: 'Patient Privacy & Data Rights Center' })}
                            </h1>
                            <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('privacyCenter.description', { defaultValue: 'Process DSAR export requests, patient record anonymization, right-to-be-forgotten directives, and data correction workflows.' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <button
                            type="button"
                            onClick={handleExportAuditCsv}
                            className="ds-button ds-button-secondary ds-button-sm flex items-center gap-1.5 text-xs font-bold"
                            title={t('privacyCenter.exportReport.button')}
                        >
                            <FileSpreadsheet size={15} className="text-emerald-600 dark:text-emerald-400" />
                            <span>{t('privacyCenter.exportReport.button')}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsNewModalOpen(true)}
                            className="ds-button ds-button-primary ds-button-sm flex items-center gap-1.5 text-xs font-bold shadow-sm"
                        >
                            <Plus size={15} />
                            <span>{t('privacyCenter.newRequest.button')}</span>
                        </button>
                    </div>
                </div>

                {/* Telemetry Facts HUD */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-amber-800 dark:text-amber-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <Clock size={16} className="text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-amber-600/80 dark:text-amber-400/80">{t('privacyCenter.summary.open', { defaultValue: 'Pending / Open' })}</p>
                            <p className="font-mono text-base font-black text-amber-900 dark:text-white">{summary.open}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-emerald-800 dark:text-emerald-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <CheckCircle size={16} className="text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600/80 dark:text-emerald-400/80">{t('privacyCenter.summary.completed', { defaultValue: 'Completed' })}</p>
                            <p className="font-mono text-base font-black text-emerald-900 dark:text-white">{summary.completed}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-rose-800 dark:text-rose-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <XCircle size={16} className="text-rose-600 dark:text-rose-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-rose-600/80 dark:text-rose-400/80">{t('privacyCenter.summary.rejected', { defaultValue: 'Rejected' })}</p>
                            <p className="font-mono text-base font-black text-rose-900 dark:text-white">{summary.rejected}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-sky-800 dark:text-sky-300">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <Download size={16} className="text-sky-600 dark:text-sky-400" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-sky-600/80 dark:text-sky-400/80">{t('privacyCenter.summary.exportsReady', { defaultValue: 'Exports Ready' })}</p>
                            <p className="font-mono text-base font-black text-sky-900 dark:text-white">{summary.exportsReady}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-teal-500/20 bg-teal-500/10 px-4 py-3 shadow-2xs backdrop-blur-md text-teal-800 dark:text-teal-300 sm:col-span-2 lg:col-span-1">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 dark:bg-slate-900/80 shadow-2xs">
                            <Shield size={16} className="text-teal-600 dark:text-teal-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-teal-600/80 dark:text-teal-400/80">
                                <span>{t('privacyCenter.complianceRate')}</span>
                                <span className="font-mono">{summary.complianceRate}%</span>
                            </div>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-teal-200/50 dark:bg-teal-950/50">
                                <div
                                    className="h-full rounded-full bg-teal-500 transition-all duration-500"
                                    style={{ width: `${summary.complianceRate}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Primary Tab Navigation */}
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={() => setActiveTab('requests')}
                        className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                            activeTab === 'requests'
                                ? 'bg-teal-500 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                    >
                        <ShieldAlert size={15} />
                        <span>{t('privacyCenter.tabs.requests')}</span>
                        <span className="ms-1 rounded-full bg-black/15 px-1.5 py-0.2 text-[10px] font-mono">
                            {requests.length}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('consents')}
                        className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                            activeTab === 'consents'
                                ? 'bg-teal-500 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                    >
                        <UserCheck size={15} />
                        <span>{t('privacyCenter.tabs.consents')}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('retention')}
                        className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
                            activeTab === 'retention'
                                ? 'bg-teal-500 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                    >
                        <BookOpen size={15} />
                        <span>{t('privacyCenter.tabs.retention')}</span>
                    </button>
                </div>
            </div>

            {/* TAB 1: PRIVACY REQUESTS (DSAR) */}
            {activeTab === 'requests' && (
                <section style={reveal(80).style} className={`overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 ${reveal(80).className}`}>
                    {/* Search & Select Filters */}
                    <div className="space-y-3 border-b border-slate-100 p-4 dark:border-slate-800/80">
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
                            <label className="relative block">
                                <span className="sr-only">{t('privacyCenter.filters.search')}</span>
                                <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="search"
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder={t('privacyCenter.filters.searchPlaceholder', { defaultValue: 'Search patient name, MRN, or notes...' })}
                                    className="min-h-11 w-full rounded-xl border border-slate-200 bg-white/80 px-10 text-sm font-semibold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                />
                            </label>
                            <label>
                                <span className="sr-only">{t('privacyCenter.filters.status')}</span>
                                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                                    <option value="Open">{t('privacyCenter.filters.openOnly', { defaultValue: 'Open Requests' })}</option>
                                    <option value="All">{t('privacyCenter.filters.allStatuses', { defaultValue: 'All Statuses' })}</option>
                                    {['Pending', 'InReview', 'Approved', 'Completed', 'Resolved', 'Rejected', 'Cancelled'].map((status) => <option key={status} value={status}>{t(`privacyCenter.statuses.${status}`, { defaultValue: status })}</option>)}
                                </select>
                            </label>
                            <label>
                                <span className="sr-only">{t('privacyCenter.filters.type')}</span>
                                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
                                    <option value="All">{t('privacyCenter.filters.allTypes', { defaultValue: 'All Types' })}</option>
                                    {['Export', 'Correction', 'Anonymize'].map((type) => <option key={type} value={type}>{t(`privacyCenter.types.${type}`, { defaultValue: type })}</option>)}
                                </select>
                            </label>
                        </div>

                        {/* Quick Filter Pills */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                            <span className="flex items-center gap-1 text-[11px] font-bold text-slate-400 me-1">
                                <SlidersHorizontal size={13} />
                                <span>{isRtl ? 'تصفية سريعة:' : 'Quick Filters:'}</span>
                            </span>
                            {[
                                { id: 'all', label: t('privacyCenter.quickFilters.all'), status: 'All', type: 'All' },
                                { id: 'open', label: t('privacyCenter.quickFilters.open'), status: 'Open', type: 'All' },
                                { id: 'export', label: t('privacyCenter.quickFilters.export'), status: 'All', type: 'Export' },
                                { id: 'correction', label: t('privacyCenter.quickFilters.correction'), status: 'All', type: 'Correction' },
                                { id: 'anonymize', label: t('privacyCenter.quickFilters.anonymize'), status: 'All', type: 'Anonymize' },
                                { id: 'completed', label: t('privacyCenter.quickFilters.completed'), status: 'Completed', type: 'All' },
                                { id: 'rejected', label: t('privacyCenter.quickFilters.rejected'), status: 'Rejected', type: 'All' },
                            ].map((pill) => {
                                const isActive = (pill.status === 'All' && pill.type === 'All')
                                    ? (statusFilter === 'All' && typeFilter === 'All')
                                    : (pill.status !== 'All' ? statusFilter === pill.status : typeFilter === pill.type);
                                return (
                                    <button
                                        key={pill.id}
                                        type="button"
                                        onClick={() => {
                                            setStatusFilter(pill.status);
                                            setTypeFilter(pill.type);
                                        }}
                                        className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                                            isActive
                                                ? 'bg-teal-500/15 text-teal-800 dark:text-teal-200 border border-teal-500/30'
                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-400'
                                        }`}
                                    >
                                        {pill.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {requests.length === 0 ? (
                        <div className="px-6 py-16 text-center"><ShieldAlert size={34} className="mx-auto text-slate-300" /><h2 className="mt-4 font-semibold text-slate-800 dark:text-slate-100">{t('privacyCenter.emptyTitle')}</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">{t('privacyCenter.emptyDescription')}</p></div>
                    ) : visibleRequests.length === 0 ? (
                        <div className="px-6 py-16 text-center"><Search size={34} className="mx-auto text-slate-300" /><h2 className="mt-4 font-semibold text-slate-800 dark:text-slate-100">{t('privacyCenter.emptyFilteredTitle')}</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">{t('privacyCenter.emptyFilteredDescription')}</p></div>
                    ) : (
                        <>
                            <div className="hidden overflow-x-auto md:block">
                                <table className="w-full text-start text-sm">
                                    <thead className="border-b border-slate-200/60 bg-slate-50/40 text-slate-500 dark:border-slate-800/60 dark:bg-slate-950/40 dark:text-slate-400">
                                        <tr>
                                            {['patient', 'type', 'date', 'status', 'actions'].map((key) => (
                                                <th key={key} scope="col" className={`px-6 py-4 text-xs font-semibold uppercase tracking-wide ${key === 'actions' ? 'text-end' : 'text-start'}`}>
                                                    {t(`privacyCenter.table.${key}`)}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                        {visibleRequests.map((request) => (
                                            <PrivacyRow
                                                key={request.request_id}
                                                request={request}
                                                patientName={patientName(request)}
                                                type={requestType(request)}
                                                status={requestStatus(request)}
                                                locale={locale}
                                                loading={resolvingId === request.request_id}
                                                onExecuteExport={() => setPendingExportRequest(request)}
                                                onExecuteAnonymize={() => {
                                                    setPendingAnonymizeRequest(request);
                                                    setAnonymizeCheckboxConfirmed(false);
                                                }}
                                                onResolve={() => setResolveTarget(request)}
                                                onReject={() => setRejectTarget(request)}
                                                onDownload={() => downloadExistingExport(request)}
                                                onInspect={() => setInspectTarget(request)}
                                                t={t}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-slate-800/70 md:hidden">
                                {visibleRequests.map((request) => (
                                    <PrivacyCard
                                        key={request.request_id}
                                        request={request}
                                        patientName={patientName(request)}
                                        type={requestType(request)}
                                        status={requestStatus(request)}
                                        locale={locale}
                                        loading={resolvingId === request.request_id}
                                        onExecuteExport={() => setPendingExportRequest(request)}
                                        onExecuteAnonymize={() => {
                                            setPendingAnonymizeRequest(request);
                                            setAnonymizeCheckboxConfirmed(false);
                                        }}
                                        onResolve={() => setResolveTarget(request)}
                                        onReject={() => setRejectTarget(request)}
                                        onDownload={() => downloadExistingExport(request)}
                                        onInspect={() => setInspectTarget(request)}
                                        t={t}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </section>
            )}

            {/* TAB 2: PATIENT CONSENTS & DIRECTIVES */}
            {activeTab === 'consents' && (
                <section style={reveal(80).style} className={`space-y-6 ${reveal(80).className}`}>
                    {/* Patient Selection Deck */}
                    <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-base font-black text-slate-900 dark:text-white">
                                    {t('privacyCenter.consentsTab.patientSelectTitle')}
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {t('privacyCenter.consentsTab.noPatientSelected')}
                                </p>
                            </div>

                            {consentSelectedPatient && (
                                <button
                                    type="button"
                                    onClick={() => setIsGrantConsentModalOpen(true)}
                                    className="ds-button ds-button-primary ds-button-sm flex items-center gap-1.5 text-xs font-bold"
                                >
                                    <Plus size={15} />
                                    <span>{t('privacyCenter.consentsTab.grantButton')}</span>
                                </button>
                            )}
                        </div>

                        {/* Search or Selected Badge */}
                        <div className="mt-4">
                            {consentSelectedPatient ? (
                                <div className="flex items-center justify-between rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/20 text-teal-700 dark:text-teal-300">
                                            <User size={20} />
                                        </div>
                                        <div>
                                            <p className="font-black text-slate-900 dark:text-white text-sm">
                                                {consentSelectedPatient.name || `${consentSelectedPatient.first_name || ''} ${consentSelectedPatient.last_name || ''}`.trim() || consentSelectedPatient.mrn}
                                            </p>
                                            <p className="font-mono text-xs text-slate-500" dir="ltr">
                                                MRN: {consentSelectedPatient.mrn}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setConsentSelectedPatient(null); setConsentPatientSearch(''); }}
                                        className="rounded-xl border border-teal-500/30 bg-white/80 px-3 py-1.5 text-xs font-bold text-teal-700 hover:bg-white dark:bg-slate-900/80 dark:text-teal-300"
                                    >
                                        {isRtl ? 'تغيير المريض' : 'Switch Patient'}
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="search"
                                        value={consentPatientSearch}
                                        onChange={(e) => setConsentPatientSearch(e.target.value)}
                                        placeholder={t('privacyCenter.consentsTab.searchPlaceholder')}
                                        className="min-h-11 w-full rounded-xl border border-slate-200 bg-white/80 px-10 text-sm font-semibold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                                    />
                                    {consentPatientResults.length > 0 && (
                                        <ul className="absolute top-full z-20 mt-1 max-h-48 w-full overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-xl dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                                            {consentPatientResults.slice(0, 6).map((p) => (
                                                <li
                                                    key={p.patient_id}
                                                    onClick={() => {
                                                        setConsentSelectedPatient(p);
                                                        setConsentPatientSearch('');
                                                    }}
                                                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-teal-500/5 dark:hover:bg-slate-800"
                                                >
                                                    <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                                                        {p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.mrn}
                                                    </span>
                                                    <span className="font-mono text-xs text-slate-400" dir="ltr">
                                                        {p.mrn}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Consents Status Cards */}
                    {consentSelectedPatient && (
                        <>
                            {isLoadingConsents ? (
                                <div className="p-8 text-center text-sm font-bold text-slate-400">
                                    <RefreshCw size={20} className="mx-auto mb-2 animate-spin text-teal-500" />
                                    <span>{t('privacyCenter.loading')}</span>
                                </div>
                            ) : (
                                <div className="grid gap-4 md:grid-cols-3">
                                    {/* 1. General Treatment Consent */}
                                    <ConsentCard
                                        title={t('privacyCenter.consentsTab.treatmentTitle')}
                                        description={t('privacyCenter.consentsTab.treatmentDesc')}
                                        icon={<ShieldCheck size={22} />}
                                        active={patientConsentsHistory.some(c => c.type === 'Treatment' && c.status === 'Active')}
                                        historyRecord={patientConsentsHistory.find(c => c.type === 'Treatment')}
                                        onGrant={() => {
                                            setGrantConsentType('Treatment');
                                            setIsGrantConsentModalOpen(true);
                                        }}
                                        onRevoke={(record) => setRevokeConsentTarget(record)}
                                        t={t}
                                        isRtl={isRtl}
                                    />

                                    {/* 2. Clinical Data Sharing Consent */}
                                    <ConsentCard
                                        title={t('privacyCenter.consentsTab.dataSharingTitle')}
                                        description={t('privacyCenter.consentsTab.dataSharingDesc')}
                                        icon={<Lock size={22} />}
                                        active={patientConsentsData?.current?.consent_data_sharing || patientConsentsHistory.some(c => c.type === 'DataSharing' && c.status === 'Active')}
                                        historyRecord={patientConsentsHistory.find(c => c.type === 'DataSharing')}
                                        onGrant={() => {
                                            setGrantConsentType('DataSharing');
                                            setIsGrantConsentModalOpen(true);
                                        }}
                                        onRevoke={(record) => setRevokeConsentTarget(record)}
                                        t={t}
                                        isRtl={isRtl}
                                    />

                                    {/* 3. Marketing & Communications Consent */}
                                    <ConsentCard
                                        title={t('privacyCenter.consentsTab.marketingTitle')}
                                        description={t('privacyCenter.consentsTab.marketingDesc')}
                                        icon={<FileText size={22} />}
                                        active={patientConsentsData?.current?.consent_marketing || patientConsentsHistory.some(c => c.type === 'Marketing' && c.status === 'Active')}
                                        historyRecord={patientConsentsHistory.find(c => c.type === 'Marketing')}
                                        onGrant={() => {
                                            setGrantConsentType('Marketing');
                                            setIsGrantConsentModalOpen(true);
                                        }}
                                        onRevoke={(record) => setRevokeConsentTarget(record)}
                                        t={t}
                                        isRtl={isRtl}
                                    />
                                </div>
                            )}

                            {/* Consents History Audit Log Table */}
                            <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                                <div className="border-b border-slate-100 p-4 dark:border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <History size={16} className="text-teal-600 dark:text-teal-400" />
                                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                                            {t('privacyCenter.consentsTab.historyTitle')}
                                        </h3>
                                    </div>
                                    <span className="font-mono text-xs text-slate-400">
                                        {patientConsentsHistory.length} {isRtl ? 'سجلات' : 'records'}
                                    </span>
                                </div>

                                {patientConsentsHistory.length === 0 ? (
                                    <div className="p-8 text-center text-xs font-semibold text-slate-400">
                                        {isRtl ? 'لا توجد سجلات موافقة تاريخية لهذا المريض بعد.' : 'No recorded consent history for this patient yet.'}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-start text-xs">
                                            <thead className="border-b border-slate-100 bg-slate-50/50 text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                                                <tr>
                                                    <th className="px-4 py-3 text-start">{t('privacyCenter.consentsTab.grantModal.typeLabel')}</th>
                                                    <th className="px-4 py-3 text-start">{t('privacyCenter.table.status')}</th>
                                                    <th className="px-4 py-3 text-start">{t('privacyCenter.consentsTab.grantModal.sourceLabel')}</th>
                                                    <th className="px-4 py-3 text-start">{t('privacyCenter.consentsTab.grantedOn')}</th>
                                                    <th className="px-4 py-3 text-start">{t('privacyCenter.consentsTab.revokedReason')}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {patientConsentsHistory.map((item) => (
                                                    <tr key={item.consent_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                                                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                                                            {item.type}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                                item.status === 'Active'
                                                                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                                                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                                                            }`}>
                                                                {item.status === 'Active' ? t('privacyCenter.consentsTab.statusActive') : t('privacyCenter.consentsTab.statusRevoked')}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                                            {item.source || 'Staff'}
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-500">
                                                            {new Date(item.signed_at).toLocaleString()}
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                                                            {item.revoked_reason || '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </section>
            )}

            {/* TAB 3: RETENTION & COMPLIANCE POLICIES */}
            {activeTab === 'retention' && (
                <section style={reveal(80).style} className={`space-y-6 ${reveal(80).className}`}>
                    {/* Retention Table Card */}
                    <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="border-b border-slate-100 p-6 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                                    <BookOpen size={22} />
                                </div>
                                <div>
                                    <h2 className="text-base font-black text-slate-900 dark:text-white">
                                        {t('privacyCenter.retentionTab.title')}
                                    </h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {t('privacyCenter.retentionTab.subtitle')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-start text-xs">
                                <thead className="border-b border-slate-100 bg-slate-50/50 text-slate-500 dark:border-slate-800 dark:bg-slate-950/50">
                                    <tr>
                                        <th className="px-6 py-4 text-start font-bold uppercase tracking-wider">{t('privacyCenter.retentionTab.tableType')}</th>
                                        <th className="px-6 py-4 text-start font-bold uppercase tracking-wider">{t('privacyCenter.retentionTab.tablePeriod')}</th>
                                        <th className="px-6 py-4 text-start font-bold uppercase tracking-wider">{t('privacyCenter.retentionTab.tableBasis')}</th>
                                        <th className="px-6 py-4 text-start font-bold uppercase tracking-wider">{t('privacyCenter.retentionTab.tableAction')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                                            {t('privacyCenter.retentionTab.row1Type')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex rounded-lg bg-teal-500/10 px-2.5 py-1 font-bold text-teal-700 dark:text-teal-300">
                                                {t('privacyCenter.retentionTab.row1Period')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                                            {t('privacyCenter.retentionTab.row1Basis')}
                                        </td>
                                        <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">
                                            {t('privacyCenter.retentionTab.row1Action')}
                                        </td>
                                    </tr>

                                    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                                            {t('privacyCenter.retentionTab.row2Type')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex rounded-lg bg-sky-500/10 px-2.5 py-1 font-bold text-sky-700 dark:text-sky-300">
                                                {t('privacyCenter.retentionTab.row2Period')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                                            {t('privacyCenter.retentionTab.row2Basis')}
                                        </td>
                                        <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">
                                            {t('privacyCenter.retentionTab.row2Action')}
                                        </td>
                                    </tr>

                                    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                                            {t('privacyCenter.retentionTab.row3Type')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex rounded-lg bg-indigo-500/10 px-2.5 py-1 font-bold text-indigo-700 dark:text-indigo-300">
                                                {t('privacyCenter.retentionTab.row3Period')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                                            {t('privacyCenter.retentionTab.row3Basis')}
                                        </td>
                                        <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">
                                            {t('privacyCenter.retentionTab.row3Action')}
                                        </td>
                                    </tr>

                                    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                                            {t('privacyCenter.retentionTab.row4Type')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex rounded-lg bg-amber-500/10 px-2.5 py-1 font-bold text-amber-700 dark:text-amber-300">
                                                {t('privacyCenter.retentionTab.row4Period')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                                            {t('privacyCenter.retentionTab.row4Basis')}
                                        </td>
                                        <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">
                                            {t('privacyCenter.retentionTab.row4Action')}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Cryptographic Protection Blueprint */}
                    <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-7">
                        <div className="flex items-center gap-3">
                            <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                                <Lock size={20} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                    {t('privacyCenter.retentionTab.securityTitle')}
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {t('privacyCenter.retentionTab.securityDesc')}
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                                <CheckCircle size={16} className="mt-0.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-relaxed">
                                    {t('privacyCenter.retentionTab.sec1')}
                                </p>
                            </div>

                            <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                                <CheckCircle size={16} className="mt-0.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-relaxed">
                                    {t('privacyCenter.retentionTab.sec2')}
                                </p>
                            </div>

                            <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                                <CheckCircle size={16} className="mt-0.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-relaxed">
                                    {t('privacyCenter.retentionTab.sec3')}
                                </p>
                            </div>

                            <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                                <CheckCircle size={16} className="mt-0.5 text-teal-600 dark:text-teal-400 shrink-0" />
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-relaxed">
                                    {t('privacyCenter.retentionTab.sec4')}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* MODAL 1: Export Confirmation */}
            <ConfirmDialog
                isOpen={Boolean(pendingExportRequest)}
                onClose={() => setPendingExportRequest(null)}
                onConfirm={executeExport}
                title={t('privacyCenter.confirm.exportTitle')}
                message={t('privacyCenter.confirm.exportMessage', { patient: pendingExportRequest ? patientName(pendingExportRequest) : '' })}
                confirmLabel={t('privacyCenter.confirm.exportAction')}
                cancelLabel={t('privacyCenter.confirm.cancel')}
                variant="info"
                isLoading={Boolean(resolvingId)}
            />

            {/* MODAL 2: High-Safety Anonymization Modal */}
            {pendingAnonymizeRequest && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in">
                    <div className="w-full max-w-lg rounded-3xl border border-rose-500/40 bg-white p-6 shadow-2xl dark:border-rose-500/30 dark:bg-slate-900 sm:p-7">
                        <div className="flex items-center justify-between border-b border-rose-100 pb-4 dark:border-rose-900/40">
                            <div className="flex items-center gap-3">
                                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-500/15 text-rose-600 dark:text-rose-400 ring-2 ring-rose-500/20">
                                    <AlertTriangle size={24} />
                                </div>
                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                                        {t('privacyCenter.anonymizeModal.highRisk')}
                                    </span>
                                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                                        {t('privacyCenter.anonymizeModal.title')}
                                    </h3>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setPendingAnonymizeRequest(null); setAnonymizeCheckboxConfirmed(false); }}
                                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="mt-5 space-y-4 text-xs">
                            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-rose-900 dark:text-rose-200">
                                <p className="font-bold">
                                    {isRtl ? 'المريض المستهدف:' : 'Target Patient:'} <span className="font-black underline">{patientName(pendingAnonymizeRequest)}</span>
                                </p>
                                <p className="mt-1 font-mono text-[11px] text-rose-700/80 dark:text-rose-300/80" dir="ltr">
                                    MRN: {pendingAnonymizeRequest.mrn}
                                </p>
                            </div>

                            <p className="font-bold text-slate-700 dark:text-slate-300">
                                {t('privacyCenter.anonymizeModal.explanation')}
                            </p>

                            <ul className="space-y-2 rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800">
                                <li className="flex items-start gap-2 text-slate-700 dark:text-slate-300 leading-relaxed">
                                    <XCircle size={15} className="mt-0.5 text-rose-600 shrink-0" />
                                    <span>{t('privacyCenter.anonymizeModal.point1')}</span>
                                </li>
                                <li className="flex items-start gap-2 text-slate-700 dark:text-slate-300 leading-relaxed">
                                    <XCircle size={15} className="mt-0.5 text-rose-600 shrink-0" />
                                    <span>{t('privacyCenter.anonymizeModal.point2')}</span>
                                </li>
                                <li className="flex items-start gap-2 text-slate-700 dark:text-slate-300 leading-relaxed">
                                    <CheckCircle2 size={15} className="mt-0.5 text-teal-600 shrink-0" />
                                    <span>{t('privacyCenter.anonymizeModal.point3')}</span>
                                </li>
                            </ul>

                            {/* Checkbox Acknowledgment */}
                            <label className="flex items-start gap-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-950 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={anonymizeCheckboxConfirmed}
                                    onChange={(e) => setAnonymizeCheckboxConfirmed(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                                />
                                <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-snug">
                                    {t('privacyCenter.anonymizeModal.confirmCheckbox')}
                                </span>
                            </label>
                        </div>

                        <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => { setPendingAnonymizeRequest(null); setAnonymizeCheckboxConfirmed(false); }}
                                className="ds-button ds-button-secondary ds-button-sm text-xs font-bold"
                            >
                                {t('privacyCenter.anonymizeModal.cancel')}
                            </button>
                            <button
                                type="button"
                                disabled={!anonymizeCheckboxConfirmed || Boolean(resolvingId)}
                                onClick={executeAnonymize}
                                className="ds-button ds-button-danger ds-button-sm flex items-center gap-1.5 text-xs font-bold disabled:opacity-50"
                            >
                                {resolvingId ? <RefreshCw size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                                <span>{t('privacyCenter.anonymizeModal.confirmButton')}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 3: Resolve Correction Request */}
            <TextPromptDialog
                isOpen={Boolean(resolveTarget)}
                onClose={() => setResolveTarget(null)}
                onConfirm={resolveCorrectionRequest}
                title={t('privacyCenter.resolve.title', { defaultValue: 'Resolve correction request' })}
                message={t('privacyCenter.resolve.message', { patient: resolveTarget ? patientName(resolveTarget) : '', defaultValue: 'Record what was reviewed or corrected for this patient.' })}
                label={t('privacyCenter.resolve.notes', { defaultValue: 'Resolution notes' })}
                placeholder={t('privacyCenter.resolve.placeholder', { defaultValue: 'Corrected demographic details after verifying supporting documents.' })}
                confirmLabel={t('privacyCenter.resolve.action', { defaultValue: 'Resolve request' })}
                cancelLabel={t('privacyCenter.confirm.cancel')}
                validationMessage={t('privacyCenter.resolve.required', { defaultValue: 'Enter resolution notes.' })}
                validate={(value) => value.length < 5 ? t('privacyCenter.resolve.tooShort', { defaultValue: 'Use at least 5 characters.' }) : ''}
                inputProps={{ maxLength: 2000 }}
                isLoading={Boolean(resolvingId)}
            />

            {/* MODAL 4: Reject Privacy Request */}
            <TextPromptDialog
                isOpen={Boolean(rejectTarget)}
                onClose={() => setRejectTarget(null)}
                onConfirm={rejectRequest}
                title={t('privacyCenter.reject.title', { defaultValue: 'Reject privacy request' })}
                message={t('privacyCenter.reject.message', { patient: rejectTarget ? patientName(rejectTarget) : '', defaultValue: 'Record why this privacy request is being rejected.' })}
                label={t('privacyCenter.reject.reason', { defaultValue: 'Reason' })}
                placeholder={t('privacyCenter.reject.placeholder', { defaultValue: 'Request cannot be completed because...' })}
                confirmLabel={t('privacyCenter.reject.action', { defaultValue: 'Reject request' })}
                cancelLabel={t('privacyCenter.confirm.cancel')}
                validationMessage={t('privacyCenter.reject.required', { defaultValue: 'Enter a rejection reason.' })}
                validate={(value) => value.length < 5 ? t('privacyCenter.reject.tooShort', { defaultValue: 'Use at least 5 characters.' }) : ''}
                inputProps={{ maxLength: 2000 }}
                isLoading={Boolean(resolvingId)}
            />

            {/* MODAL 5: Create New Privacy Request Modal */}
            {isNewModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
                    <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-7">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                                    <ShieldCheck size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                                        {t('privacyCenter.newRequest.title')}
                                    </h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {t('privacyCenter.newRequest.subtitle')}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setIsNewModalOpen(false); setSelectedPatient(null); }}
                                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateNewRequest} className="mt-5 space-y-4">
                            {/* Patient Selection */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                                    {t('privacyCenter.newRequest.patientLabel')}
                                </label>
                                {selectedPatient ? (
                                    <div className="flex items-center justify-between rounded-xl border border-teal-500/30 bg-teal-500/10 p-3 text-xs">
                                        <div className="flex items-center gap-2">
                                            <User size={16} className="text-teal-600 dark:text-teal-400" />
                                            <div>
                                                <p className="font-bold text-slate-900 dark:text-white">
                                                    {selectedPatient.name || `${selectedPatient.first_name || ''} ${selectedPatient.last_name || ''}`.trim() || selectedPatient.mrn}
                                                </p>
                                                <p className="font-mono text-[11px] text-slate-500" dir="ltr">
                                                    MRN: {selectedPatient.mrn}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedPatient(null)}
                                            className="text-xs font-bold text-teal-700 underline hover:text-teal-900 dark:text-teal-300"
                                        >
                                            {isRtl ? 'تغيير المريض' : 'Change'}
                                        </button>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="relative">
                                            <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="search"
                                                value={patientSearch}
                                                onChange={(e) => setPatientSearch(e.target.value)}
                                                placeholder={t('privacyCenter.newRequest.searchPatient')}
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-9 py-2.5 text-xs font-semibold text-slate-800 outline-none transition focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                                            />
                                        </div>
                                        {patientSearchResults.length > 0 && (
                                            <ul className="mt-2 max-h-36 overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-xs shadow-lg dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                                                {patientSearchResults.slice(0, 5).map((p) => (
                                                    <li
                                                        key={p.patient_id}
                                                        onClick={() => { setSelectedPatient(p); setPatientSearch(''); }}
                                                        className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                                    >
                                                        <span className="font-bold text-slate-800 dark:text-slate-200">
                                                            {p.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.mrn}
                                                        </span>
                                                        <span className="font-mono text-[10px] text-slate-400" dir="ltr">
                                                            {p.mrn}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Request Type Selector */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                                    {t('privacyCenter.newRequest.typeLabel')}
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { id: 'Export', label: t('privacyCenter.types.Export') },
                                        { id: 'Correction', label: t('privacyCenter.types.Correction') },
                                        { id: 'Anonymize', label: t('privacyCenter.types.Anonymize') }
                                    ].map((opt) => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => setNewRequestType(opt.id)}
                                            className={`rounded-xl border p-2.5 text-center text-xs font-bold transition-all ${
                                                newRequestType === opt.id
                                                    ? 'border-teal-500 bg-teal-500/10 text-teal-800 dark:text-teal-200 shadow-xs'
                                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Administrative Notes */}
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                                    {t('privacyCenter.newRequest.notesLabel')}
                                </label>
                                <textarea
                                    rows={3}
                                    value={newNotes}
                                    onChange={(e) => setNewNotes(e.target.value)}
                                    placeholder={t('privacyCenter.newRequest.notesPlaceholder')}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs font-semibold text-slate-800 outline-none transition focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => { setIsNewModalOpen(false); setSelectedPatient(null); }}
                                    className="ds-button ds-button-secondary ds-button-sm text-xs font-bold"
                                >
                                    {t('privacyCenter.newRequest.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={!selectedPatient || isCreatingRequest}
                                    className="ds-button ds-button-primary ds-button-sm text-xs font-bold flex items-center gap-1.5"
                                >
                                    {isCreatingRequest && <RefreshCw size={14} className="animate-spin" />}
                                    <span>{t('privacyCenter.newRequest.submit')}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 6: Inspect Details Drawer / Modal */}
            {inspectTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
                    <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-7">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                                    <Eye size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                                        {t('privacyCenter.details.title')}
                                    </h3>
                                    <p className="font-mono text-xs text-slate-400" dir="ltr">
                                        ID: {inspectTarget.request_id}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setInspectTarget(null)}
                                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="mt-5 space-y-3.5 text-xs">
                            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50/70 p-3.5 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800">
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-400">{t('privacyCenter.details.patient')}</p>
                                    <p className="mt-0.5 font-bold text-slate-800 dark:text-slate-200">{patientName(inspectTarget)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-400">{t('privacyCenter.details.mrn')}</p>
                                    <p className="mt-0.5 font-mono font-bold text-slate-800 dark:text-slate-200" dir="ltr">{inspectTarget.mrn}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50/70 p-3.5 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800">
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-400">{t('privacyCenter.details.type')}</p>
                                    <p className="mt-0.5 font-bold text-slate-800 dark:text-slate-200">{requestType(inspectTarget)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-400">{t('privacyCenter.details.status')}</p>
                                    <p className="mt-0.5 font-bold text-slate-800 dark:text-slate-200">{requestStatus(inspectTarget)}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50/70 p-3.5 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800">
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-400">{t('privacyCenter.details.requestedAt')}</p>
                                    <p className="mt-0.5 text-slate-700 dark:text-slate-300">{new Date(inspectTarget.created_at).toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-slate-400">{t('privacyCenter.details.resolvedAt')}</p>
                                    <p className="mt-0.5 text-slate-700 dark:text-slate-300">{inspectTarget.resolved_at ? new Date(inspectTarget.resolved_at).toLocaleString() : '—'}</p>
                                </div>
                            </div>

                            {inspectTarget.resolved_by_name && (
                                <div className="rounded-2xl bg-slate-50/70 p-3.5 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800">
                                    <p className="text-[10px] font-bold uppercase text-slate-400">{t('privacyCenter.details.resolvedBy')}</p>
                                    <p className="mt-0.5 font-bold text-slate-800 dark:text-slate-200">{inspectTarget.resolved_by_name}</p>
                                </div>
                            )}

                            {inspectTarget.notes && (
                                <div className="rounded-2xl bg-slate-50/70 p-3.5 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800">
                                    <p className="text-[10px] font-bold uppercase text-slate-400">{t('privacyCenter.details.requestNotes')}</p>
                                    <p className="mt-1 text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">{inspectTarget.notes}</p>
                                </div>
                            )}

                            {inspectTarget.resolution_notes && (
                                <div className="rounded-2xl bg-emerald-50/60 p-3.5 dark:bg-emerald-950/30 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                                    <p className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">{t('privacyCenter.details.resolutionNotes')}</p>
                                    <p className="mt-1 leading-relaxed whitespace-pre-line font-medium">{inspectTarget.resolution_notes}</p>
                                </div>
                            )}

                            {inspectTarget.export_id && (
                                <div className="flex items-center justify-between rounded-2xl bg-sky-50/70 p-3.5 dark:bg-sky-950/30 border border-sky-500/20">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase text-sky-700 dark:text-sky-400">{t('privacyCenter.details.exportId')}</p>
                                        <p className="font-mono text-xs font-bold text-sky-900 dark:text-sky-200" dir="ltr">{inspectTarget.export_id}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => downloadExistingExport(inspectTarget)}
                                        className="ds-button ds-button-primary ds-button-sm flex items-center gap-1.5 text-xs font-bold"
                                    >
                                        <Download size={14} />
                                        <span>{t('privacyCenter.download')}</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="mt-5 flex justify-end border-t border-slate-100 pt-3 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => setInspectTarget(null)}
                                className="ds-button ds-button-secondary ds-button-sm text-xs font-bold"
                            >
                                {t('privacyCenter.details.close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL 7: Grant New Consent Modal */}
            {isGrantConsentModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
                    <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-7">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                            <div className="flex items-center gap-3">
                                <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                                    <UserCheck size={20} />
                                </div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    {t('privacyCenter.consentsTab.grantModal.title')}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsGrantConsentModalOpen(false)}
                                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleGrantConsent} className="mt-5 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                                    {t('privacyCenter.consentsTab.grantModal.typeLabel')}
                                </label>
                                <select
                                    value={grantConsentType}
                                    onChange={(e) => setGrantConsentType(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                                >
                                    <option value="Treatment">{t('privacyCenter.consentsTab.treatmentTitle')}</option>
                                    <option value="DataSharing">{t('privacyCenter.consentsTab.dataSharingTitle')}</option>
                                    <option value="Marketing">{t('privacyCenter.consentsTab.marketingTitle')}</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                                    {t('privacyCenter.consentsTab.grantModal.sourceLabel')}
                                </label>
                                <select
                                    value={grantConsentSource}
                                    onChange={(e) => setGrantConsentSource(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 text-xs font-bold text-slate-800 outline-none transition focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                                >
                                    <option value="Staff">{t('privacyCenter.consentsTab.grantModal.sourceStaff')}</option>
                                    <option value="Paper">{t('privacyCenter.consentsTab.grantModal.sourcePaper')}</option>
                                    <option value="PatientPortal">{t('privacyCenter.consentsTab.grantModal.sourcePortal')}</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                                    {t('privacyCenter.consentsTab.grantModal.notesLabel')}
                                </label>
                                <textarea
                                    rows={2}
                                    value={grantConsentNotes}
                                    onChange={(e) => setGrantConsentNotes(e.target.value)}
                                    placeholder={t('privacyCenter.consentsTab.grantModal.notesPlaceholder')}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs font-semibold text-slate-800 outline-none transition focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsGrantConsentModalOpen(false)}
                                    className="ds-button ds-button-secondary ds-button-sm text-xs font-bold"
                                >
                                    {t('privacyCenter.consentsTab.grantModal.cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={isAddingConsent}
                                    className="ds-button ds-button-primary ds-button-sm text-xs font-bold flex items-center gap-1.5"
                                >
                                    {isAddingConsent && <RefreshCw size={14} className="animate-spin" />}
                                    <span>{t('privacyCenter.consentsTab.grantModal.submit')}</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL 8: Revoke Consent Prompt Dialog */}
            <TextPromptDialog
                isOpen={Boolean(revokeConsentTarget)}
                onClose={() => setRevokeConsentTarget(null)}
                onConfirm={handleRevokeConsent}
                title={t('privacyCenter.consentsTab.revokeModal.title')}
                message={t('privacyCenter.consentsTab.revokeModal.message')}
                label={t('privacyCenter.consentsTab.revokeModal.reasonLabel')}
                placeholder={t('privacyCenter.consentsTab.revokeModal.placeholder')}
                confirmLabel={t('privacyCenter.consentsTab.revokeModal.submit')}
                cancelLabel={t('privacyCenter.consentsTab.revokeModal.cancel')}
                validationMessage={t('privacyCenter.reject.required')}
                validate={(value) => value.length < 5 ? t('privacyCenter.reject.tooShort') : ''}
                isLoading={isRevokingConsent}
            />
        </div>
    );
};

const Status = ({ request, label }) => ['Completed', 'Resolved'].includes(request.status)
    ? <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400"><CheckCircle size={14} />{label}</span>
    : request.status === 'Rejected'
        ? <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-400"><ShieldAlert size={14} />{label}</span>
        : <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400"><Clock size={14} />{label}</span>;

const Action = ({ request, type, loading, onExecuteExport, onExecuteAnonymize, onResolve, onReject, onDownload, onInspect, t }) => {
    return (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
            <button
                type="button"
                onClick={onInspect}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-2xs transition hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                title={t('privacyCenter.details.button')}
            >
                <Eye size={14} />
            </button>

            {['Completed', 'Resolved'].includes(request.status) && request.request_type === 'Export' && request.export_id ? (
                <button
                    type="button"
                    onClick={onDownload}
                    disabled={loading}
                    className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                    <Download size={13} />
                    {loading ? t('privacyCenter.processing') : t('privacyCenter.download', { defaultValue: 'Download export' })}
                </button>
            ) : !CLOSED_STATUSES.has(request.status) ? (
                <>
                    {request.request_type === 'Export' ? (
                        <button
                            type="button"
                            onClick={onExecuteExport}
                            disabled={loading}
                            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-slate-800 to-slate-950 px-3 text-xs font-bold text-white shadow-2xs transition hover:from-slate-900 hover:to-black disabled:opacity-50 dark:from-slate-100 dark:to-slate-200 dark:text-slate-900"
                        >
                            <Download size={13} />
                            {loading ? t('privacyCenter.processing') : t('privacyCenter.execute', { type })}
                        </button>
                    ) : request.request_type === 'Anonymize' ? (
                        <button
                            type="button"
                            onClick={onExecuteAnonymize}
                            disabled={loading}
                            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
                        >
                            <AlertTriangle size={13} />
                            {loading ? t('privacyCenter.processing') : t('privacyCenter.execute', { type })}
                        </button>
                    ) : request.request_type === 'Correction' ? (
                        <button
                            type="button"
                            onClick={onResolve}
                            disabled={loading}
                            className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                        >
                            <CheckCircle2 size={13} />
                            {loading ? t('privacyCenter.processing') : t('privacyCenter.resolve.button', { defaultValue: 'Resolve' })}
                        </button>
                    ) : (
                        <span className="text-xs font-semibold text-slate-400">{t('privacyCenter.manualReview')}</span>
                    )}

                    <button
                        type="button"
                        onClick={onReject}
                        disabled={loading}
                        className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"
                        title={t('privacyCenter.reject.button')}
                    >
                        <XCircle size={13} />
                        <span>{t('privacyCenter.reject.button', { defaultValue: 'Reject' })}</span>
                    </button>
                </>
            ) : null}
        </div>
    );
};

const requestNote = (request) => request.resolution_notes || request.notes;

const PrivacyRow = ({ request, patientName, type, status, locale, loading, onExecuteExport, onExecuteAnonymize, onResolve, onReject, onDownload, onInspect, t }) => (
    <tr className="hover:bg-slate-50/40 dark:hover:bg-slate-800/20">
        <td className="px-6 py-4">
            <p className="font-semibold text-slate-900 dark:text-slate-100">{patientName}</p>
            <p className="mt-1 font-mono text-xs text-slate-500 ltr-embed" dir="ltr">{request.mrn}</p>
        </td>
        <td className="px-6 py-4">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                request.request_type === 'Anonymize'
                    ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                    : request.request_type === 'Correction'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
            }`}>
                {type}
            </span>
            {requestNote(request) && (
                <p className="mt-2 max-w-xs truncate text-xs text-slate-500" title={requestNote(request)}>
                    {request.resolution_notes ? t('privacyCenter.resolutionNote') : t('privacyCenter.requestNote')}: {requestNote(request)}
                </p>
            )}
        </td>
        <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
            {new Date(request.created_at).toLocaleDateString(locale)}
        </td>
        <td className="px-6 py-4">
            <Status request={request} label={status} />
        </td>
        <td className="px-6 py-4 text-end">
            <Action
                request={request}
                type={type}
                loading={loading}
                onExecuteExport={onExecuteExport}
                onExecuteAnonymize={onExecuteAnonymize}
                onResolve={onResolve}
                onReject={onReject}
                onDownload={onDownload}
                onInspect={onInspect}
                t={t}
            />
        </td>
    </tr>
);

const PrivacyCard = ({ request, patientName, type, status, locale, loading, onExecuteExport, onExecuteAnonymize, onResolve, onReject, onDownload, onInspect, t }) => (
    <article className="p-5">
        <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <UserRound size={18} />
            </span>
            <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold text-slate-900 dark:text-slate-100">{patientName}</h2>
                <p className="mt-1 font-mono text-xs text-slate-500 ltr-embed" dir="ltr">{request.mrn}</p>
            </div>
            <Status request={request} label={status} />
        </div>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-150 bg-slate-50/50 p-3 dark:border-slate-800/60 dark:bg-slate-900/40">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                request.request_type === 'Anonymize'
                    ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                    : request.request_type === 'Correction'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
            }`}>
                {type}
            </span>
            <time className="text-xs text-slate-500 dark:text-slate-400">
                {new Date(request.created_at).toLocaleDateString(locale)}
            </time>
        </div>
        {requestNote(request) && (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-950/50 dark:text-slate-300">
                {request.resolution_notes ? t('privacyCenter.resolutionNote') : t('privacyCenter.requestNote')}: {requestNote(request)}
            </p>
        )}
        <div className="mt-4">
            <Action
                request={request}
                type={type}
                loading={loading}
                onExecuteExport={onExecuteExport}
                onExecuteAnonymize={onExecuteAnonymize}
                onResolve={onResolve}
                onReject={onReject}
                onDownload={onDownload}
                onInspect={onInspect}
                t={t}
            />
        </div>
    </article>
);

const ConsentCard = ({ title, description, icon, active, historyRecord, onGrant, onRevoke, t, isRtl }) => {
    return (
        <div className={`flex flex-col justify-between rounded-3xl border p-5 transition-all ${
            active
                ? 'border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20'
                : 'border-slate-200/80 bg-white/80 dark:border-slate-800 dark:bg-slate-900/80'
        }`}>
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className={`grid h-10 w-10 place-items-center rounded-xl ${
                        active
                            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                        {icon}
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                        active
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-200/60 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                        {active ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
                        <span>{active ? t('privacyCenter.consentsTab.statusActive') : t('privacyCenter.consentsTab.statusRevoked')}</span>
                    </span>
                </div>

                <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                        {title}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        {description}
                    </p>
                </div>

                {historyRecord && (
                    <div className="rounded-xl bg-slate-50/70 p-2.5 text-[11px] text-slate-500 dark:bg-slate-950/50 dark:text-slate-400 border border-slate-100 dark:border-slate-800/80">
                        <div className="flex justify-between">
                            <span>{t('privacyCenter.consentsTab.grantedOn')}:</span>
                            <span className="font-mono text-slate-700 dark:text-slate-300">
                                {new Date(historyRecord.signed_at).toLocaleDateString()}
                            </span>
                        </div>
                        {historyRecord.source && (
                            <div className="flex justify-between mt-1">
                                <span>{t('privacyCenter.consentsTab.grantModal.sourceLabel')}:</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                    {historyRecord.source}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-end">
                {active ? (
                    <button
                        type="button"
                        onClick={() => onRevoke(historyRecord)}
                        className="ds-button ds-button-danger ds-button-sm text-xs font-bold"
                    >
                        {t('privacyCenter.consentsTab.revokeAction')}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onGrant}
                        className="ds-button ds-button-primary ds-button-sm text-xs font-bold"
                    >
                        {isRtl ? '+ منح الموافقة' : '+ Grant Consent'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default PrivacyCenter;
