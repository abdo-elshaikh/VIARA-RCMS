import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, Clock, Download, Search, ShieldAlert, UserRound, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useGetPrivacyRequestsQuery, useResolvePrivacyRequestMutation } from '../store/api';
import { downloadAuthenticatedFile } from '../utils/authenticatedFetch';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import PageHeader from '../components/ui/PageHeader';
import TextPromptDialog from '../components/ui/TextPromptDialog';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const CLOSED_STATUSES = new Set(['Completed', 'Resolved', 'Rejected', 'Cancelled']);

const PrivacyCenter = ({ embedded = false }) => {
    const { t, i18n } = useTranslation('governance');
    const { data: requests = [], isLoading } = useGetPrivacyRequestsQuery();
    const [resolvePrivacyRequest] = useResolvePrivacyRequestMutation();
    const [resolvingId, setResolvingId] = useState(null);
    const [pendingRequest, setPendingRequest] = useState(null);
    const [resolveTarget, setResolveTarget] = useState(null);
    const [rejectTarget, setRejectTarget] = useState(null);
    const [statusFilter, setStatusFilter] = useState('Open');
    const [typeFilter, setTypeFilter] = useState('All');
    const [searchTerm, setSearchTerm] = useState('');
    const [mounted, setMounted] = useState(false);
    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-GB';
    const pendingCount = useMemo(() => requests.filter((request) => !CLOSED_STATUSES.has(request.status)).length, [requests]);
    const summary = useMemo(() => ({
        open: pendingCount,
        completed: requests.filter((request) => ['Completed', 'Resolved'].includes(request.status)).length,
        rejected: requests.filter((request) => request.status === 'Rejected').length,
        exportsReady: requests.filter((request) => ['Completed', 'Resolved'].includes(request.status) && request.request_type === 'Export' && request.export_id).length
    }), [pendingCount, requests]);
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

    const executeRequest = async () => {
        if (!pendingRequest) return false;
        const { request_id: requestId, request_type: action } = pendingRequest;
        setResolvingId(requestId);
        try {
            const response = await resolvePrivacyRequest({ requestId, action }).unwrap();
            if (action === 'Export') {
                const exportId = response.export?.export_id;
                if (exportId) {
                    await downloadAuthenticatedFile(`${API_BASE}/privacy/exports/${exportId}/download`, `patient-data-${pendingRequest.mrn || requestId}.json`);
                }
                toast.success(t('privacyCenter.exported'));
            } else {
                toast.success(t('privacyCenter.anonymized'));
            }
            return true;
        } catch (error) {
            toast.error(error?.data?.error || t('privacyCenter.actionError', { action: t(`privacyCenter.types.${action}`, { defaultValue: action }) }));
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
            return true;
        } catch (error) {
            toast.error(error?.data?.error || t('privacyCenter.resolveError', { defaultValue: 'The request could not be resolved.' }));
            return false;
        } finally {
            setResolvingId(null);
        }
    };

    const requestType = (request) => t(`privacyCenter.types.${request.request_type}`, { defaultValue: request.request_type });
    const requestStatus = (request) => t(`privacyCenter.statuses.${request.status}`, { defaultValue: request.status });
    const patientName = (request) => request.patient_name || request.mrn || '-';
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

    if (isLoading) return <div className="p-10 text-center text-sm font-semibold text-slate-500">{t('privacyCenter.loading')}</div>;

    return (
        <div className={embedded ? 'space-y-6' : 'mx-auto max-w-6xl space-y-6'}>
            {!embedded && (
                <PageHeader
                    icon={ShieldAlert}
                    title={t('privacyCenter.title')}
                    description={t('privacyCenter.description')}
                    actions={
                        <span className="self-start rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">{t('privacyCenter.pendingCount', { count: pendingCount })}</span>
                    }
                />
            )}

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label={t('privacyCenter.summary.open')} value={summary.open} tone="amber" />
                <Metric label={t('privacyCenter.summary.completed')} value={summary.completed} tone="emerald" />
                <Metric label={t('privacyCenter.summary.rejected')} value={summary.rejected} tone="red" />
                <Metric label={t('privacyCenter.summary.exportsReady')} value={summary.exportsReady} tone="blue" />
            </section>

            <section style={reveal(80).style} className={`overflow-hidden rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 ${reveal(80).className}`}>
                <div className="grid gap-3 border-b border-slate-100 p-4 dark:border-slate-800/70 md:grid-cols-[minmax(0,1fr)_180px_180px]">
                    <label className="relative block">
                        <span className="sr-only">{t('privacyCenter.filters.search')}</span>
                        <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder={t('privacyCenter.filters.searchPlaceholder')}
                            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-10 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:ring-blue-950/40"
                        />
                    </label>
                    <label>
                        <span className="sr-only">{t('privacyCenter.filters.status')}</span>
                        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:ring-blue-950/40">
                            <option value="Open">{t('privacyCenter.filters.openOnly')}</option>
                            <option value="All">{t('privacyCenter.filters.allStatuses')}</option>
                            {['Pending', 'InReview', 'Approved', 'Completed', 'Resolved', 'Rejected', 'Cancelled'].map((status) => <option key={status} value={status}>{t(`privacyCenter.statuses.${status}`)}</option>)}
                        </select>
                    </label>
                    <label>
                        <span className="sr-only">{t('privacyCenter.filters.type')}</span>
                        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:ring-blue-950/40">
                            <option value="All">{t('privacyCenter.filters.allTypes')}</option>
                            {['Export', 'Correction', 'Anonymize'].map((type) => <option key={type} value={type}>{t(`privacyCenter.types.${type}`)}</option>)}
                        </select>
                    </label>
                </div>

                {requests.length === 0 ? (
                    <div className="px-6 py-16 text-center"><ShieldAlert size={34} className="mx-auto text-slate-300" /><h2 className="mt-4 font-semibold text-slate-800 dark:text-slate-100">{t('privacyCenter.emptyTitle')}</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">{t('privacyCenter.emptyDescription')}</p></div>
                ) : visibleRequests.length === 0 ? (
                    <div className="px-6 py-16 text-center"><Search size={34} className="mx-auto text-slate-300" /><h2 className="mt-4 font-semibold text-slate-800 dark:text-slate-100">{t('privacyCenter.emptyFilteredTitle')}</h2><p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">{t('privacyCenter.emptyFilteredDescription')}</p></div>
                ) : (
                    <>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full text-start text-sm">
                                <thead className="border-b border-slate-200/60 bg-slate-50/40 text-slate-500 dark:border-slate-800/60 dark:bg-slate-950/40 dark:text-slate-400"><tr>{['patient', 'type', 'date', 'status', 'actions'].map((key) => <th key={key} scope="col" className={`px-6 py-4 text-xs font-semibold uppercase tracking-wide ${key === 'actions' ? 'text-end' : 'text-start'}`}>{t(`privacyCenter.table.${key}`)}</th>)}</tr></thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">{visibleRequests.map((request) => <PrivacyRow key={request.request_id} request={request} patientName={patientName(request)} type={requestType(request)} status={requestStatus(request)} locale={locale} loading={resolvingId === request.request_id} onExecute={() => setPendingRequest(request)} onResolve={() => setResolveTarget(request)} onReject={() => setRejectTarget(request)} onDownload={() => downloadExistingExport(request)} t={t} />)}</tbody>
                            </table>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800/70 md:hidden">{visibleRequests.map((request) => <PrivacyCard key={request.request_id} request={request} patientName={patientName(request)} type={requestType(request)} status={requestStatus(request)} locale={locale} loading={resolvingId === request.request_id} onExecute={() => setPendingRequest(request)} onResolve={() => setResolveTarget(request)} onReject={() => setRejectTarget(request)} onDownload={() => downloadExistingExport(request)} t={t} />)}</div>
                    </>
                )}
            </section>

            <ConfirmDialog
                isOpen={Boolean(pendingRequest)}
                onClose={() => setPendingRequest(null)}
                onConfirm={executeRequest}
                title={pendingRequest?.request_type === 'Anonymize' ? t('privacyCenter.confirm.anonymizeTitle') : t('privacyCenter.confirm.exportTitle')}
                message={pendingRequest?.request_type === 'Anonymize' ? t('privacyCenter.confirm.anonymizeMessage', { patient: pendingRequest ? patientName(pendingRequest) : '' }) : t('privacyCenter.confirm.exportMessage', { patient: pendingRequest ? patientName(pendingRequest) : '' })}
                confirmLabel={pendingRequest?.request_type === 'Anonymize' ? t('privacyCenter.confirm.anonymizeAction') : t('privacyCenter.confirm.exportAction')}
                cancelLabel={t('privacyCenter.confirm.cancel')}
                variant={pendingRequest?.request_type === 'Anonymize' ? 'danger' : 'info'}
                isLoading={Boolean(resolvingId)}
            />

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
        </div>
    );
};

const metricTones = {
    amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300',
    red: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300',
    blue: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300'
};

const Metric = ({ label, value, tone }) => (
    <article className={`rounded-xl border p-4 ${metricTones[tone]}`}>
        <p className="text-xs font-black uppercase">{label}</p>
        <p className="mt-2 text-2xl font-black">{value}</p>
    </article>
);

const Status = ({ request, label }) => ['Completed', 'Resolved'].includes(request.status)
    ? <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700"><CheckCircle size={14} />{label}</span>
    : request.status === 'Rejected'
        ? <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700"><ShieldAlert size={14} />{label}</span>
        : <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700"><Clock size={14} />{label}</span>;

const Action = ({ request, type, loading, onExecute, onResolve, onReject, onDownload, t }) => {
    if (['Completed', 'Resolved'].includes(request.status) && request.request_type === 'Export' && request.export_id) {
        return <button type="button" onClick={onDownload} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><Download size={14} />{loading ? t('privacyCenter.processing') : t('privacyCenter.download', { defaultValue: 'Download export' })}</button>;
    }
    if (CLOSED_STATUSES.has(request.status)) return null;
    const executable = ['Export', 'Anonymize'].includes(request.request_type);
    const correction = request.request_type === 'Correction';
    return (
        <div className="flex flex-wrap items-center justify-end gap-2">
            {executable ? (
                <button type="button" onClick={onExecute} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-slate-800 to-slate-950 px-4 text-xs font-bold text-white shadow-sm transition hover:from-slate-900 hover:to-black disabled:opacity-50 dark:from-slate-100 dark:to-slate-200 dark:text-slate-900 dark:hover:from-white dark:hover:to-slate-100">{request.request_type === 'Export' && <Download size={14} />}{loading ? t('privacyCenter.processing') : t('privacyCenter.execute', { type })}</button>
            ) : correction ? (
                <button type="button" onClick={onResolve} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50">
                    <CheckCircle size={14} />
                    {loading ? t('privacyCenter.processing') : t('privacyCenter.resolve.button', { defaultValue: 'Resolve' })}
                </button>
            ) : (
                <span className="text-xs font-semibold text-slate-400">{t('privacyCenter.manualReview')}</span>
            )}
            <button type="button" onClick={onReject} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50">
                <XCircle size={14} />
                {t('privacyCenter.reject.button', { defaultValue: 'Reject' })}
            </button>
        </div>
    );
};

const requestNote = (request) => request.resolution_notes || request.notes;

const PrivacyRow = ({ request, patientName, type, status, locale, loading, onExecute, onResolve, onReject, onDownload, t }) => <tr className="hover:bg-slate-50/40 dark:hover:bg-slate-800/20"><td className="px-6 py-4"><p className="font-semibold text-slate-900 dark:text-slate-100">{patientName}</p><p className="mt-1 font-mono text-xs text-slate-500 ltr-embed">{request.mrn}</p></td><td className="px-6 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${request.request_type === 'Anonymize' ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'}`}>{type}</span>{requestNote(request) && <p className="mt-2 max-w-xs truncate text-xs text-slate-500" title={requestNote(request)}>{request.resolution_notes ? t('privacyCenter.resolutionNote') : t('privacyCenter.requestNote')}: {requestNote(request)}</p>}</td><td className="px-6 py-4 text-slate-600 dark:text-slate-300">{new Date(request.created_at).toLocaleDateString(locale)}</td><td className="px-6 py-4"><Status request={request} label={status} /></td><td className="px-6 py-4 text-end"><Action request={request} type={type} loading={loading} onExecute={onExecute} onResolve={onResolve} onReject={onReject} onDownload={onDownload} t={t} /></td></tr>;

const PrivacyCard = ({ request, patientName, type, status, locale, loading, onExecute, onResolve, onReject, onDownload, t }) => <article className="p-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-650 dark:bg-slate-955 dark:text-slate-350"><UserRound size={18} /></span><div className="min-w-0 flex-1"><h2 className="truncate font-semibold text-slate-900 dark:text-slate-100">{patientName}</h2><p className="mt-1 font-mono text-xs text-slate-500 ltr-embed">{request.mrn}</p></div><Status request={request} label={status} /></div><div className="mt-4 flex items-center justify-between rounded-xl border border-slate-150/65 bg-slate-50/30 p-3 dark:border-slate-800/60 dark:bg-slate-900/40"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${request.request_type === 'Anonymize' ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'}`}>{type}</span><time className="text-xs text-slate-500 dark:text-slate-400">{new Date(request.created_at).toLocaleDateString(locale)}</time></div>{requestNote(request) && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:bg-slate-950/50 dark:text-slate-300">{request.resolution_notes ? t('privacyCenter.resolutionNote') : t('privacyCenter.requestNote')}: {requestNote(request)}</p>}<div className="mt-4"><Action request={request} type={type} loading={loading} onExecute={onExecute} onResolve={onResolve} onReject={onReject} onDownload={onDownload} t={t} /></div></article>;

export default PrivacyCenter;
