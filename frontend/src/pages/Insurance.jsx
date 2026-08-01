import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import {
    Activity, AlertTriangle, BadgeCheck, Building2, Calculator,
    ChevronDown, CircleDollarSign, ClipboardCheck, DollarSign, FileCheck2, FilePlus2,
    FilterX, Layers, RefreshCw, RotateCcw, Search, ShieldCheck, SlidersHorizontal,
    User, WalletCards, XCircle, Plus, CheckCircle2, Calendar, FileText
} from 'lucide-react';
import {
    useCreateCoverageRuleMutation,
    useCreateInsuranceApprovalMutation,
    useCreateInsuranceContractMutation,
    useCreateInsuranceProviderMutation,
    useCreateClaimMutation,
    useGetClaimsQuery,
    useGetCoverageRulesQuery,
    useGetInsuranceApprovalsQuery,
    useGetInsuranceContractsQuery,
    useGetInsuranceProvidersQuery,
    useGetInsurancePoliciesQuery,
    useGetPatientsQuery,
    useGetInvoicesQuery,
    usePreviewCoverageQuery,
    useUpdateClaimStatusMutation,
} from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import { useTranslation } from 'react-i18next';
import TextPromptDialog from '../components/ui/TextPromptDialog';
import PageHeader from '../components/ui/PageHeader';
import { inputClass, primaryBtn, secondaryBtn } from '../utils/designTokens';

const statusTones = {
    Pending: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300',
    Approved: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300',
    Submitted: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300',
    Paid: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300',
    'Partially Paid': 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300',
    Rejected: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300',
    Resubmitted: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/50 dark:bg-cyan-950/40 dark:text-cyan-300',
    Expired: 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400',
    'Not Required': 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400',
};

const toNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;

const Insurance = () => {
    const { t, i18n } = useTranslation('insurance');
    const [searchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'claims');

    // Forms State
    const [providerForm, setProviderForm] = useState({ name: '', payerCode: '', phone: '', email: '' });
    const [contractForm, setContractForm] = useState({ providerId: '', entityName: '', entityType: 'Insurance', contractNumber: '', startDate: '', endDate: '' });
    const [ruleForm, setRuleForm] = useState({ providerId: '', contractId: '', coveragePercentage: '80', coverageCeiling: '', copayAmount: '0', modalityType: '', preauthorizationRequired: false });
    const [approvalForm, setApprovalForm] = useState({ patientId: '', providerId: '', policyId: '', appointmentId: '', examTypeId: '', status: 'Pending', requestedAmount: '', approvedAmount: '', documentUrl: '' });
    const [claimForm, setClaimForm] = useState({ patientId: '', providerId: '', invoiceId: '', policyId: '', approvalId: '', claimReferenceNumber: '', expectedAmount: '' });

    // Interactive Calculator State
    const [calcParams, setCalcParams] = useState({ providerId: '', modalityType: '', amount: '1000' });

    // Claims Filtering State
    const [claimSearch, setClaimSearch] = useState('');
    const [claimStatus, setClaimStatusFilter] = useState('all');
    const [claimProvider, setClaimProvider] = useState('all');
    const [claimAction, setClaimAction] = useState(null);

    // Queries
    const { data: providerData = [], isLoading: providersLoading, isError: providersError, refetch: refetchProviders } = useGetInsuranceProvidersQuery();
    const { data: contractData = [], isLoading: contractsLoading, isError: contractsError, refetch: refetchContracts } = useGetInsuranceContractsQuery();
    const { data: ruleData = [], isLoading: rulesLoading, isError: rulesError, refetch: refetchRules } = useGetCoverageRulesQuery();
    const { data: approvalData = [], isLoading: approvalsLoading, isError: approvalsError, refetch: refetchApprovals } = useGetInsuranceApprovalsQuery();
    const { data: claimData = [], isLoading: claimsLoading, isFetching: claimsFetching, isError: claimsError, refetch: refetchClaims } = useGetClaimsQuery({ limit: 50 });
    const { data: rejectedClaimData = [], isLoading: rejectedLoading, isError: rejectedError, refetch: refetchRejected } = useGetClaimsQuery({ rejectedOnly: 'true', limit: 50 });
    
    // Auxiliary Queries for Smart Selectors
    const { data: patientData = [] } = useGetPatientsQuery({ limit: 100 });
    const { data: invoiceData = [] } = useGetInvoicesQuery({ limit: 100 });
    const { data: patientPolicies = [] } = useGetInsurancePoliciesQuery({ patientId: claimForm.patientId }, { skip: !claimForm.patientId });
    const { data: calcResult, isFetching: calcLoading } = usePreviewCoverageQuery(
        { providerId: calcParams.providerId, modalityType: calcParams.modalityType || undefined, amount: Number(calcParams.amount) || 0 },
        { skip: !calcParams.providerId || !calcParams.amount }
    );

    // Mutations
    const [createProvider, { isLoading: isCreatingProvider }] = useCreateInsuranceProviderMutation();
    const [createContract, { isLoading: isCreatingContract }] = useCreateInsuranceContractMutation();
    const [createRule, { isLoading: isCreatingRule }] = useCreateCoverageRuleMutation();
    const [createApproval, { isLoading: isCreatingApproval }] = useCreateInsuranceApprovalMutation();
    const [createClaim, { isLoading: isCreatingClaim }] = useCreateClaimMutation();
    const [updateClaimStatus, { isLoading: isUpdatingClaim }] = useUpdateClaimStatusMutation();

    // Memoized Data
    const providers = useMemo(() => Array.isArray(providerData) ? providerData : [], [providerData]);
    const contracts = useMemo(() => Array.isArray(contractData) ? contractData : [], [contractData]);
    const rules = useMemo(() => Array.isArray(ruleData) ? ruleData : [], [ruleData]);
    const approvals = useMemo(() => Array.isArray(approvalData) ? approvalData : [], [approvalData]);
    const allClaims = useMemo(() => Array.isArray(claimData) ? claimData : [], [claimData]);
    const rejectedClaims = useMemo(() => Array.isArray(rejectedClaimData) ? rejectedClaimData : [], [rejectedClaimData]);
    const patients = useMemo(() => Array.isArray(patientData?.patients) ? patientData.patients : Array.isArray(patientData) ? patientData : [], [patientData]);
    const invoices = useMemo(() => Array.isArray(invoiceData?.invoices) ? invoiceData.invoices : Array.isArray(invoiceData) ? invoiceData : [], [invoiceData]);

    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-US';
    const formatCurrency = value => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(toNumber(value));
    const formatNumber = value => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(toNumber(value));

    const summary = useMemo(() => {
        const expected = allClaims.reduce((total, claim) => total + toNumber(claim.expected_amount), 0);
        const received = allClaims.reduce((total, claim) => total + toNumber(claim.received_amount), 0);
        return {
            providers: providers.length,
            activeContracts: contracts.filter(contract => contract.is_active).length,
            approvalPending: approvals.filter(item => item.status === 'Pending').length,
            rejectedClaims: rejectedClaims.length,
            outstanding: Math.max(0, expected - received),
        };
    }, [allClaims, approvals, contracts, providers, rejectedClaims]);

    const claimStatuses = useMemo(() => [...new Set(allClaims.map(claim => claim.status).filter(Boolean))], [allClaims]);
    const visibleClaims = useMemo(() => {
        const search = claimSearch.trim().toLowerCase();
        return allClaims.filter(claim => {
            if (claimStatus !== 'all' && claim.status !== claimStatus) return false;
            if (claimProvider !== 'all' && String(claim.provider_id) !== claimProvider) return false;
            if (!search) return true;
            return [claim.claim_number, claim.claim_reference_number, claim.provider_name, claim.patient_name, claim.mrn]
                .filter(Boolean).join(' ').toLowerCase().includes(search);
        });
    }, [allClaims, claimProvider, claimSearch, claimStatus]);

    const hasClaimFilters = Boolean(claimSearch || claimStatus !== 'all' || claimProvider !== 'all');
    const hasQueryError = providersError || contractsError || rulesError || approvalsError || claimsError || rejectedError;

    const refreshAll = () => {
        refetchProviders();
        refetchContracts();
        refetchRules();
        refetchApprovals();
        refetchClaims();
        refetchRejected();
    };

    const clearClaimFilters = () => {
        setClaimSearch('');
        setClaimStatusFilter('all');
        setClaimProvider('all');
    };

    // Save Handlers
    const saveProvider = async () => {
        try {
            await createProvider({ ...providerForm, name: providerForm.name.trim() }).unwrap();
            toast.success(t('messages.providerAdded'));
            setProviderForm({ name: '', payerCode: '', phone: '', email: '' });
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.providerError')));
        }
    };

    const saveContract = async () => {
        try {
            await createContract({ ...contractForm, providerId: contractForm.providerId || undefined }).unwrap();
            toast.success(t('messages.contractAdded'));
            setContractForm({ providerId: '', entityName: '', entityType: 'Insurance', contractNumber: '', startDate: '', endDate: '' });
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.contractError')));
        }
    };

    const saveRule = async () => {
        try {
            await createRule({
                ...ruleForm,
                contractId: ruleForm.contractId || undefined,
                coveragePercentage: Number(ruleForm.coveragePercentage || 0),
                coverageCeiling: ruleForm.coverageCeiling ? Number(ruleForm.coverageCeiling) : undefined,
                copayAmount: Number(ruleForm.copayAmount || 0),
                modalityType: ruleForm.modalityType || undefined,
            }).unwrap();
            toast.success(t('messages.ruleAdded'));
            setRuleForm(prev => ({ ...prev, coverageCeiling: '', modalityType: '', contractId: '', preauthorizationRequired: false }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.ruleError')));
        }
    };

    const saveApproval = async () => {
        try {
            await createApproval({
                ...approvalForm,
                providerId: approvalForm.providerId || undefined,
                policyId: approvalForm.policyId || undefined,
                appointmentId: approvalForm.appointmentId || undefined,
                examTypeId: approvalForm.examTypeId || undefined,
                requestedAmount: approvalForm.requestedAmount ? Number(approvalForm.requestedAmount) : undefined,
                approvedAmount: approvalForm.approvedAmount ? Number(approvalForm.approvedAmount) : undefined,
                documentUrl: approvalForm.documentUrl || undefined,
            }).unwrap();
            toast.success(t('messages.approvalAdded'));
            setApprovalForm({ patientId: '', providerId: '', policyId: '', appointmentId: '', examTypeId: '', status: 'Pending', requestedAmount: '', approvedAmount: '', documentUrl: '' });
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.approvalError')));
        }
    };

    const completeClaimAction = async value => {
        if (!claimAction) return false;
        const { claim, status } = claimAction;
        try {
            const payload = { id: claim.claim_id, status };
            if (status === 'Submitted') payload.claimReferenceNumber = value;
            if (status === 'Resubmitted') payload.resubmissionNotes = value;
            if (status === 'Rejected') payload.rejectionReason = value;
            if (status === 'Paid' || status === 'Partially Paid') payload.receivedAmount = Number(value);
            await updateClaimStatus(payload).unwrap();
            toast.success(status === 'Resubmitted'
                ? t('messages.resubmitted')
                : t('messages.claimStatus', { status: t(`statuses.${status}`, { defaultValue: status }) }));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.claimUpdatedError')));
            return false;
        }
    };

    const saveClaim = async () => {
        try {
            await createClaim({
                patientId: claimForm.patientId,
                providerId: claimForm.providerId,
                invoiceId: claimForm.invoiceId || undefined,
                policyId: claimForm.policyId || undefined,
                approvalId: claimForm.approvalId || undefined,
                claimReferenceNumber: claimForm.claimReferenceNumber || undefined,
                expectedAmount: claimForm.expectedAmount ? Number(claimForm.expectedAmount) : undefined,
            }).unwrap();
            toast.success(t('messages.claimCreated'));
            setClaimForm({ patientId: '', providerId: '', invoiceId: '', policyId: '', approvalId: '', claimReferenceNumber: '', expectedAmount: '' });
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.claimCreatedError')));
        }
    };

    const setClaimStatus = async (claim, status) => {
        if (status === 'Submitted' && !claim.claim_reference_number) {
            setClaimAction({ claim, status });
            return;
        }
        if (['Rejected', 'Paid', 'Partially Paid'].includes(status)) {
            setClaimAction({ claim, status });
            return;
        }
        try {
            await updateClaimStatus({ id: claim.claim_id, status }).unwrap();
            toast.success(t('messages.claimStatus', { status: t(`statuses.${status}`, { defaultValue: status }) }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.claimUpdatedError')));
        }
    };

    const claimDialogType = claimAction?.status === 'Submitted'
        ? 'submit'
        : claimAction?.status === 'Resubmitted'
            ? 'resubmit'
            : claimAction?.status === 'Rejected'
                ? 'reject'
                : 'payment';
    const claimDialogIsPayment = ['Paid', 'Partially Paid'].includes(claimAction?.status);

    // Tab items specification
    const tabs = [
        { id: 'claims', label: t('tabs.claims', 'Claims Workbench'), icon: WalletCards, count: visibleClaims.length },
        { id: 'providers', label: t('tabs.providers', 'Payers & Contracts'), icon: Building2, count: providers.length },
        { id: 'rules', label: t('tabs.rules', 'Coverage & Simulator'), icon: BadgeCheck, count: rules.length },
        { id: 'approvals', label: t('tabs.approvals', 'Pre-Authorizations'), icon: ClipboardCheck, count: approvals.length },
    ];

    return (
        <div className="space-y-6">
            {/* Top Page Header */}
            <PageHeader
                icon={ShieldCheck}
                eyebrow={t('header.eyebrow')}
                eyebrowIcon={Activity}
                title={t('header.title')}
                description={t('header.description')}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={refreshAll}
                            disabled={claimsFetching}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-4 text-sm font-bold text-slate-700 backdrop-blur-md transition hover:bg-slate-50 hover:text-teal-700 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-850 dark:hover:text-teal-300 shadow-xs"
                        >
                            <RefreshCw size={16} className={claimsFetching ? 'animate-spin' : ''} />
                            {claimsFetching ? t('actions.refreshing') : t('actions.refresh')}
                        </button>
                    </div>
                }
            />

            {hasQueryError && <QueryError onRetry={refreshAll} t={t} />}

            {/* Overall Statistics Bar */}
            <section className="grid grid-cols-2 gap-3.5 xl:grid-cols-5" aria-label={t('stats.label')}>
                <Stat icon={Building2} label={t('stats.providers')} value={formatNumber(summary.providers)} tone="cyan" loading={providersLoading} />
                <Stat icon={FileCheck2} label={t('stats.contracts')} value={formatNumber(summary.activeContracts)} tone="blue" loading={contractsLoading} />
                <Stat icon={ClipboardCheck} label={t('stats.approvals')} value={formatNumber(summary.approvalPending)} tone="amber" loading={approvalsLoading} />
                <Stat icon={XCircle} label={t('stats.rejected')} value={formatNumber(summary.rejectedClaims)} tone="rose" loading={rejectedLoading} />
                <Stat icon={CircleDollarSign} label={t('stats.outstanding')} value={formatCurrency(summary.outstanding)} tone="violet" loading={claimsLoading} className="col-span-2 xl:col-span-1" />
            </section>

            {/* Navigation Tabs Bar */}
            <nav className="flex space-x-1.5 overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/60 p-1.5 shadow-xs backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/60" aria-label="Insurance Subsystems">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`group inline-flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs font-bold transition-all sm:text-sm whitespace-nowrap ${
                                isActive
                                    ? 'bg-slate-950 text-white shadow-md shadow-slate-950/10 dark:bg-cyan-500 dark:text-slate-950'
                                    : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
                            }`}
                        >
                            <Icon size={17} className={isActive ? 'text-cyan-400 dark:text-slate-950' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'} />
                            <span>{tab.label}</span>
                            <span className={`ms-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                                isActive
                                    ? 'bg-white/20 text-white dark:bg-slate-950/20 dark:text-slate-950'
                                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                                {tab.count}
                            </span>
                        </button>
                    );
                })}
            </nav>

            {/* TAB 1: CLAIMS WORKBENCH */}
            {activeTab === 'claims' && (
                <div className="space-y-6">
                    <Panel
                        icon={WalletCards}
                        title={t('panels.claims')}
                        description={t('panels.claimsDescription')}
                        action={<CountBadge>{t('table.showing', { visible: formatNumber(visibleClaims.length), total: formatNumber(allClaims.length) })}</CountBadge>}
                    >
                        {/* New Claim Form Container */}
                        <div className="rounded-2xl border border-cyan-100/70 bg-gradient-to-br from-cyan-50/40 via-white to-white dark:from-cyan-950/30 dark:via-slate-900/60 dark:to-slate-900/40 p-4 sm:p-5 shadow-xs">
                            <div className="mb-4 flex items-center gap-3">
                                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-[#0b1426] text-cyan-700 dark:text-cyan-400 shadow-xs ring-1 ring-cyan-100 dark:ring-cyan-900/50">
                                    <FilePlus2 size={19} />
                                </span>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-950 dark:text-white">{t('forms.newClaim')}</h3>
                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('forms.newClaimDescription')}</p>
                                </div>
                            </div>
                            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                                {/* Smart Patient Selector */}
                                <Field label={t('fields.patient', 'Patient')}>
                                    <PatientSelect
                                        value={claimForm.patientId}
                                        onChange={patientId => setClaimForm(prev => ({ ...prev, patientId, policyId: '', approvalId: '' }))}
                                        patients={patients}
                                        t={t}
                                    />
                                </Field>

                                {/* Provider Select */}
                                <Field label={t('fields.provider')}>
                                    <ProviderSelect
                                        value={claimForm.providerId}
                                        onChange={providerId => setClaimForm(prev => ({ ...prev, providerId }))}
                                        providers={providers}
                                        t={t}
                                    />
                                </Field>

                                {/* Smart Invoice Select */}
                                <Field label={t('fields.invoice', 'Invoice')}>
                                    <InvoiceSelect
                                        value={claimForm.invoiceId}
                                        onChange={(invoiceId, amount) => setClaimForm(prev => ({
                                            ...prev,
                                            invoiceId,
                                            expectedAmount: amount ? String(amount) : prev.expectedAmount
                                        }))}
                                        invoices={invoices}
                                        t={t}
                                    />
                                </Field>

                                {/* Smart Patient Policy Select */}
                                <Field label={t('fields.policy', 'Policy')}>
                                    <PolicySelect
                                        value={claimForm.policyId}
                                        onChange={policyId => setClaimForm(prev => ({ ...prev, policyId }))}
                                        policies={patientPolicies}
                                        t={t}
                                        disabled={!claimForm.patientId}
                                    />
                                </Field>

                                <Field label={t('fields.approvalId')}>
                                    <input
                                        value={claimForm.approvalId}
                                        onChange={event => setClaimForm(prev => ({ ...prev, approvalId: event.target.value }))}
                                        placeholder={t('fields.approvalId')}
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label={t('fields.claimReference')}>
                                    <input
                                        value={claimForm.claimReferenceNumber}
                                        onChange={event => setClaimForm(prev => ({ ...prev, claimReferenceNumber: event.target.value }))}
                                        placeholder={t('fields.claimReference')}
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label={t('fields.expected')}>
                                    <input
                                        type="number"
                                        min="0"
                                        value={claimForm.expectedAmount}
                                        onChange={event => setClaimForm(prev => ({ ...prev, expectedAmount: event.target.value }))}
                                        placeholder={t('fields.expected')}
                                        className={inputClass}
                                    />
                                </Field>
                                <div className="flex items-end">
                                    <button
                                        type="button"
                                        onClick={saveClaim}
                                        disabled={isCreatingClaim || !claimForm.patientId || !claimForm.providerId}
                                        className={`${primaryBtn} w-full`}
                                    >
                                        <FilePlus2 size={17} />
                                        {isCreatingClaim ? t('actions.creating') : t('actions.createClaim')}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Claims Filter Toolbar */}
                        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-900/50 p-3 lg:flex-row lg:items-center">
                            <div className="relative min-w-0 flex-1">
                                <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="search"
                                    value={claimSearch}
                                    onChange={event => setClaimSearch(event.target.value)}
                                    placeholder={t('filters.search')}
                                    className={`${inputClass} bg-white/90 dark:bg-slate-900/80 ps-10`}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:flex">
                                <label className="relative">
                                    <span className="sr-only">{t('filters.status')}</span>
                                    <select
                                        value={claimStatus}
                                        onChange={event => setClaimStatusFilter(event.target.value)}
                                        className={`${inputClass} min-w-36 appearance-none bg-white/90 dark:bg-slate-900/80 pe-9`}
                                    >
                                        <option value="all">{t('filters.allStatuses')}</option>
                                        {claimStatuses.map(status => (
                                            <option key={status} value={status}>
                                                {t(`statuses.${status}`, { defaultValue: status })}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown size={15} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                </label>
                                <label className="relative">
                                    <span className="sr-only">{t('filters.provider')}</span>
                                    <select
                                        value={claimProvider}
                                        onChange={event => setClaimProvider(event.target.value)}
                                        className={`${inputClass} min-w-40 appearance-none bg-white/90 dark:bg-slate-900/80 pe-9`}
                                    >
                                        <option value="all">{t('filters.allProviders')}</option>
                                        {providers.map(provider => (
                                            <option key={provider.provider_id} value={provider.provider_id}>{provider.name}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={15} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                </label>
                            </div>
                            {hasClaimFilters && (
                                <button type="button" onClick={clearClaimFilters} className={secondaryBtn}>
                                    <FilterX size={16} />
                                    {t('filters.clear')}
                                </button>
                            )}
                        </div>

                        {/* Claims Data Display */}
                        <div className="mt-5">
                            {claimsLoading ? (
                                <ClaimsLoading />
                            ) : visibleClaims.length === 0 ? (
                                <EmptyState
                                    icon={SlidersHorizontal}
                                    title={hasClaimFilters ? t('empty.filteredClaims') : t('empty.claims')}
                                    description={hasClaimFilters ? t('empty.filteredClaimsDescription') : t('empty.claimsDescription')}
                                    action={hasClaimFilters ? <button type="button" onClick={clearClaimFilters} className={secondaryBtn}><FilterX size={16} />{t('filters.clear')}</button> : null}
                                />
                            ) : (
                                <>
                                    <div className="space-y-3 md:hidden">
                                        {visibleClaims.map(claim => (
                                            <ClaimCard key={claim.claim_id} claim={claim} t={t} currency={formatCurrency} onStatus={setClaimStatus} updating={isUpdatingClaim} />
                                        ))}
                                    </div>
                                    <div className="hidden overflow-x-auto rounded-2xl border border-slate-200/60 dark:border-slate-800/60 md:block">
                                        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-start text-sm">
                                            <thead>
                                                <tr className="bg-slate-50/50 dark:bg-slate-900/50 text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                                                    <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-start">{t('table.claim')}</th>
                                                    <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-start">{t('table.provider')}</th>
                                                    <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-start">{t('table.status')}</th>
                                                    <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-end">{t('table.expected')}</th>
                                                    <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-end">{t('table.received')}</th>
                                                    <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-end">{t('table.actions')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {visibleClaims.map(claim => (
                                                    <ClaimRow key={claim.claim_id} claim={claim} t={t} currency={formatCurrency} onStatus={setClaimStatus} updating={isUpdatingClaim} />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                    </Panel>
                </div>
            )}

            {/* TAB 2: PAYERS & COMMERCIAL CONTRACTS */}
            {activeTab === 'providers' && (
                <div className="grid gap-6 xl:grid-cols-2">
                    <Panel
                        icon={Building2}
                        title={t('panels.providers')}
                        description={t('panels.providersDescription')}
                        action={<CountBadge>{formatNumber(providers.length)}</CountBadge>}
                    >
                        <div className="grid gap-3.5 sm:grid-cols-2">
                            <Field label={t('fields.providerName')}>
                                <input value={providerForm.name} onChange={event => setProviderForm(prev => ({ ...prev, name: event.target.value }))} placeholder={t('fields.providerName')} className={inputClass} />
                            </Field>
                            <Field label={t('fields.payerCode')}>
                                <input value={providerForm.payerCode} onChange={event => setProviderForm(prev => ({ ...prev, payerCode: event.target.value }))} placeholder={t('fields.payerCode')} className={inputClass} />
                            </Field>
                            <Field label={t('fields.phone')}>
                                <input type="tel" value={providerForm.phone} onChange={event => setProviderForm(prev => ({ ...prev, phone: event.target.value }))} placeholder={t('fields.phone')} className={inputClass} />
                            </Field>
                            <Field label={t('fields.email')}>
                                <input type="email" value={providerForm.email} onChange={event => setProviderForm(prev => ({ ...prev, email: event.target.value }))} placeholder={t('fields.email')} className={inputClass} />
                            </Field>
                            <button type="button" onClick={saveProvider} disabled={isCreatingProvider} className={`${primaryBtn} sm:col-span-2`}>
                                <Building2 size={17} />
                                {isCreatingProvider ? t('actions.saving') : t('actions.addProvider')}
                            </button>
                        </div>
                        <RecordList
                            loading={providersLoading}
                            rows={providers}
                            emptyTitle={t('empty.providers')}
                            emptyDescription={t('empty.providersDescription')}
                            keyFor={provider => provider.provider_id}
                            render={provider => <RecordLine title={provider.name} meta={provider.payer_code ? `${t('fields.payerCode')}: ${provider.payer_code}` : t('empty.noPayerCode')} />}
                        />
                    </Panel>

                    <Panel
                        icon={FileCheck2}
                        title={t('panels.contracts')}
                        description={t('panels.contractsDescription')}
                        action={<CountBadge>{formatNumber(contracts.length)}</CountBadge>}
                    >
                        <div className="grid gap-3.5 sm:grid-cols-2">
                            <Field label={t('fields.provider')}>
                                <ProviderSelect value={contractForm.providerId} onChange={providerId => setContractForm(prev => ({ ...prev, providerId }))} providers={providers} t={t} />
                            </Field>
                            <Field label={t('fields.entityName')}>
                                <input value={contractForm.entityName} onChange={event => setContractForm(prev => ({ ...prev, entityName: event.target.value }))} placeholder={t('fields.entityName')} className={inputClass} />
                            </Field>
                            <Field label={t('fields.contractNumber')}>
                                <input value={contractForm.contractNumber} onChange={event => setContractForm(prev => ({ ...prev, contractNumber: event.target.value }))} placeholder={t('fields.contractNumber')} className={inputClass} />
                            </Field>
                            <Field label={t('fields.type')}>
                                <input value={contractForm.entityType} onChange={event => setContractForm(prev => ({ ...prev, entityType: event.target.value }))} placeholder={t('fields.type')} className={inputClass} />
                            </Field>
                            <Field label={t('fields.startDate')}>
                                <input type="date" value={contractForm.startDate} onChange={event => setContractForm(prev => ({ ...prev, startDate: event.target.value }))} className={inputClass} />
                            </Field>
                            <Field label={t('fields.endDate')}>
                                <input type="date" value={contractForm.endDate} onChange={event => setContractForm(prev => ({ ...prev, endDate: event.target.value }))} className={inputClass} />
                            </Field>
                            <button type="button" onClick={saveContract} disabled={isCreatingContract} className={`${primaryBtn} sm:col-span-2`}>
                                <FileCheck2 size={17} />
                                {isCreatingContract ? t('actions.saving') : t('actions.addContract')}
                            </button>
                        </div>
                        <RecordList
                            loading={contractsLoading}
                            rows={contracts}
                            emptyTitle={t('empty.contracts')}
                            emptyDescription={t('empty.contractsDescription')}
                            keyFor={contract => contract.contract_id}
                            render={contract => (
                                <RecordLine
                                    title={contract.entity_name}
                                    meta={contract.provider_name ? `${contract.provider_name} · ${contract.contract_number || ''}` : contract.contract_number}
                                    badge={contract.is_active ? t('statuses.Active') : t('statuses.Inactive')}
                                    badgeTone={contract.is_active ? 'emerald' : 'slate'}
                                />
                            )}
                        />
                    </Panel>
                </div>
            )}

            {/* TAB 3: COVERAGE RULES & SIMULATOR */}
            {activeTab === 'rules' && (
                <div className="grid gap-6 xl:grid-cols-2">
                    {/* Coverage Rule Creator */}
                    <Panel
                        icon={BadgeCheck}
                        title={t('panels.rules')}
                        description={t('panels.rulesDescription')}
                        action={<CountBadge>{formatNumber(rules.length)}</CountBadge>}
                    >
                        <div className="grid gap-3.5 sm:grid-cols-2">
                            <Field label={t('fields.provider')}>
                                <ProviderSelect
                                    value={ruleForm.providerId}
                                    onChange={providerId => setRuleForm(prev => ({ ...prev, providerId, contractId: '' }))}
                                    providers={providers}
                                    t={t}
                                />
                            </Field>
                            {/* Linked Contract Selector */}
                            <Field label={t('fields.contract', 'Linked Contract')}>
                                <ContractSelect
                                    value={ruleForm.contractId}
                                    onChange={contractId => setRuleForm(prev => ({ ...prev, contractId }))}
                                    contracts={contracts.filter(c => !ruleForm.providerId || String(c.provider_id) === String(ruleForm.providerId))}
                                    t={t}
                                />
                            </Field>
                            <Field label={t('fields.modality')}>
                                <input value={ruleForm.modalityType} onChange={event => setRuleForm(prev => ({ ...prev, modalityType: event.target.value }))} placeholder={t('fields.modality')} className={inputClass} />
                            </Field>
                            <Field label={t('fields.coverage')}>
                                <input type="number" min="0" max="100" value={ruleForm.coveragePercentage} onChange={event => setRuleForm(prev => ({ ...prev, coveragePercentage: event.target.value }))} placeholder={t('fields.coverage')} className={inputClass} />
                            </Field>
                            <Field label={t('fields.ceiling')}>
                                <input type="number" min="0" value={ruleForm.coverageCeiling} onChange={event => setRuleForm(prev => ({ ...prev, coverageCeiling: event.target.value }))} placeholder={t('fields.ceiling')} className={inputClass} />
                            </Field>
                            <Field label={t('fields.copay')}>
                                <input type="number" min="0" value={ruleForm.copayAmount} onChange={event => setRuleForm(prev => ({ ...prev, copayAmount: event.target.value }))} placeholder={t('fields.copay')} className={inputClass} />
                            </Field>
                            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200/70 bg-slate-50/40 px-3.5 text-sm font-semibold text-slate-700 dark:border-slate-800/70 dark:bg-slate-900/50 dark:text-slate-300 sm:col-span-2">
                                <input type="checkbox" checked={ruleForm.preauthorizationRequired} onChange={event => setRuleForm(prev => ({ ...prev, preauthorizationRequired: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500" />
                                {t('fields.preauth')}
                            </label>
                            <button type="button" onClick={saveRule} disabled={isCreatingRule || !ruleForm.providerId} className={`${primaryBtn} sm:col-span-2`}>
                                <BadgeCheck size={17} />
                                {isCreatingRule ? t('actions.saving') : t('actions.addRule')}
                            </button>
                        </div>
                        <RecordList
                            loading={rulesLoading}
                            rows={rules}
                            emptyTitle={t('empty.rules')}
                            emptyDescription={t('empty.rulesDescription')}
                            keyFor={rule => rule.rule_id}
                            render={rule => (
                                <RecordLine
                                    title={rule.provider_name}
                                    meta={`${formatNumber(rule.coverage_percentage)}% · ${rule.modality_type || rule.exam_type_name || t('allExams')}`}
                                    badge={rule.preauthorization_required ? t('fields.preauthShort') : null}
                                    badgeTone="amber"
                                />
                            )}
                        />
                    </Panel>

                    {/* Interactive Coverage Preview Calculator Simulator Widget */}
                    <Panel
                        icon={Calculator}
                        title={t('calculator.title', 'Coverage Preview Calculator')}
                        description={t('calculator.description', 'Estimate coverage amount, copay, and authorization requirements before billing.')}
                    >
                        <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/50 via-white to-slate-50/20 dark:border-slate-800/80 dark:from-slate-900/50 dark:via-slate-900/70 dark:to-slate-950 p-4 sm:p-5">
                            <div className="grid gap-3.5 sm:grid-cols-2">
                                <Field label={t('fields.provider')}>
                                    <ProviderSelect
                                        value={calcParams.providerId}
                                        onChange={providerId => setCalcParams(prev => ({ ...prev, providerId }))}
                                        providers={providers}
                                        t={t}
                                    />
                                </Field>
                                <Field label={t('fields.modality')}>
                                    <input
                                        value={calcParams.modalityType}
                                        onChange={e => setCalcParams(prev => ({ ...prev, modalityType: e.target.value }))}
                                        placeholder="e.g. MRI, CT, XRAY"
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label={t('calculator.testAmount', 'Gross Exam Price (EGP)')} className="sm:col-span-2">
                                    <input
                                        type="number"
                                        min="0"
                                        value={calcParams.amount}
                                        onChange={e => setCalcParams(prev => ({ ...prev, amount: e.target.value }))}
                                        placeholder="1000"
                                        className={inputClass}
                                    />
                                </Field>
                            </div>

                            {/* Calculator Results Widget */}
                            <div className="mt-5 border-t border-slate-150/70 dark:border-slate-800/70 pt-4">
                                {calcLoading ? (
                                    <div className="h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50" />
                                ) : !calcParams.providerId ? (
                                    <p className="py-4 text-center text-xs font-semibold text-slate-400 dark:text-slate-500">
                                        {t('fields.selectProvider')} to simulate coverage preview
                                    </p>
                                ) : calcResult ? (
                                    <div className="space-y-3">
                                        {calcResult.preauthorizationRequired && (
                                            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                                                <AlertTriangle size={16} className="shrink-0 text-amber-600" />
                                                <span>{t('calculator.preauthAlert', 'Pre-authorization Required for this Modality/Exam!')}</span>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                                    {t('calculator.resultCoverage', 'Covered by Insurance')}
                                                </span>
                                                <p className="mt-1 text-xl font-extrabold text-emerald-900 dark:text-emerald-300">
                                                    {formatCurrency(calcResult.coverageAmount)}
                                                </p>
                                            </div>
                                            <div className="rounded-xl border border-cyan-200/80 bg-cyan-50/60 p-3.5 dark:border-cyan-900/50 dark:bg-cyan-950/30">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
                                                    {t('calculator.resultPatient', 'Patient Copay Balance')}
                                                </span>
                                                <p className="mt-1 text-xl font-extrabold text-cyan-900 dark:text-cyan-300">
                                                    {formatCurrency(calcResult.patientAmount)}
                                                </p>
                                            </div>
                                        </div>
                                        {calcResult.rule ? (
                                            <div className="rounded-xl bg-slate-100/70 p-3 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
                                                <span className="font-bold text-slate-800 dark:text-slate-200">Matched Rule: </span>
                                                {calcResult.rule.coverage_percentage}% coverage
                                                {calcResult.rule.coverage_ceiling ? ` (Capped at ${formatCurrency(calcResult.rule.coverage_ceiling)})` : ''}
                                                {calcResult.rule.copay_amount > 0 ? ` + ${formatCurrency(calcResult.rule.copay_amount)} copay` : ''}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-amber-600 dark:text-amber-400">
                                                {t('calculator.noRuleMatched', 'No specific rule matched. Defaulting to 100% patient responsibility.')}
                                            </p>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </Panel>
                </div>
            )}

            {/* TAB 4: PRE-AUTHORIZATIONS & APPROVALS */}
            {activeTab === 'approvals' && (
                <div className="grid gap-6 xl:grid-cols-2">
                    <Panel
                        icon={ClipboardCheck}
                        title={t('panels.approvals')}
                        description={t('panels.approvalsDescription')}
                        action={<CountBadge>{formatNumber(approvals.length)}</CountBadge>}
                    >
                        <div className="grid gap-3.5 sm:grid-cols-2">
                            <Field label={t('fields.patient', 'Patient')}>
                                <PatientSelect
                                    value={approvalForm.patientId}
                                    onChange={patientId => setApprovalForm(prev => ({ ...prev, patientId, policyId: '' }))}
                                    patients={patients}
                                    t={t}
                                />
                            </Field>
                            <Field label={t('fields.provider')}>
                                <ProviderSelect
                                    value={approvalForm.providerId}
                                    onChange={providerId => setApprovalForm(prev => ({ ...prev, providerId }))}
                                    providers={providers}
                                    t={t}
                                />
                            </Field>
                            <Field label={t('fields.policy', 'Policy')}>
                                <PolicySelect
                                    value={approvalForm.policyId}
                                    onChange={policyId => setApprovalForm(prev => ({ ...prev, policyId }))}
                                    policies={patientPolicies}
                                    t={t}
                                    disabled={!approvalForm.patientId}
                                />
                            </Field>
                            <Field label={t('fields.status')}>
                                <select
                                    value={approvalForm.status}
                                    onChange={event => setApprovalForm(prev => ({ ...prev, status: event.target.value }))}
                                    className={inputClass}
                                >
                                    {['Not Required', 'Pending', 'Approved', 'Rejected', 'Expired'].map(status => (
                                        <option key={status} value={status}>{t(`statuses.${status}`)}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label={t('fields.requested')}>
                                <input type="number" min="0" value={approvalForm.requestedAmount} onChange={event => setApprovalForm(prev => ({ ...prev, requestedAmount: event.target.value }))} placeholder={t('fields.requested')} className={inputClass} />
                            </Field>
                            <Field label={t('fields.approved')}>
                                <input type="number" min="0" value={approvalForm.approvedAmount} onChange={event => setApprovalForm(prev => ({ ...prev, approvedAmount: event.target.value }))} placeholder={t('fields.approved')} className={inputClass} />
                            </Field>
                            <Field label={t('fields.documentUrl')} className="sm:col-span-2">
                                <input type="url" value={approvalForm.documentUrl} onChange={event => setApprovalForm(prev => ({ ...prev, documentUrl: event.target.value }))} placeholder={t('fields.documentUrl')} className={inputClass} />
                            </Field>
                            <button type="button" onClick={saveApproval} disabled={isCreatingApproval || !approvalForm.patientId} className={`${primaryBtn} sm:col-span-2`}>
                                <ClipboardCheck size={17} />
                                {isCreatingApproval ? t('actions.saving') : t('actions.recordApproval')}
                            </button>
                        </div>
                    </Panel>

                    {/* Rejected Queue and Pre-Authorizations Table */}
                    <div className="space-y-6">
                        <Panel
                            icon={AlertTriangle}
                            title={t('forms.rejectedQueue', 'Rejected Claims Queue')}
                            description="Monitor and resubmit rejected insurance claims needing corrective actions."
                        >
                            <RejectedClaims
                                loading={rejectedLoading}
                                claims={rejectedClaims}
                                t={t}
                                onResubmit={claim => setClaimAction({ claim, status: 'Resubmitted' })}
                                updating={isUpdatingClaim}
                            />
                        </Panel>

                        <Panel
                            icon={CheckCircle2}
                            title="Approval History"
                            description="Recent pre-authorization decisions recorded in the system."
                        >
                            <RecordList
                                loading={approvalsLoading}
                                rows={approvals.slice(0, 10)}
                                emptyTitle="No pre-authorizations recorded"
                                emptyDescription="Saved prior authorizations will appear here."
                                keyFor={app => app.approval_id}
                                render={app => (
                                    <RecordLine
                                        title={`${app.patient_name || app.mrn || 'Patient'} · ${app.approval_number || 'No Appr #'}`}
                                        meta={`${app.provider_name || 'Provider'} — Req: ${formatCurrency(app.requested_amount)} | Appr: ${formatCurrency(app.approved_amount)}`}
                                        badge={app.status}
                                        badgeTone={app.status === 'Approved' ? 'emerald' : app.status === 'Rejected' ? 'rose' : 'amber'}
                                    />
                                )}
                            />
                        </Panel>
                    </div>
                </div>
            )}

            {/* Status Change Dialog Modal */}
            <TextPromptDialog
                isOpen={Boolean(claimAction)}
                onClose={() => setClaimAction(null)}
                onConfirm={completeClaimAction}
                title={t(`claimDialog.${claimDialogType}Title`)}
                message={t(`claimDialog.${claimDialogType}Description`, { claim: claimAction?.claim?.claim_number || '—', amount: formatCurrency(claimAction?.claim?.expected_amount) })}
                label={claimDialogType === 'submit' ? t('prompts.claimReference') : claimDialogType === 'resubmit' ? t('prompts.resubmission') : claimDialogType === 'reject' ? t('prompts.rejection') : t('prompts.received')}
                initialValue={claimDialogIsPayment ? String(claimAction?.claim?.expected_amount || '') : ''}
                type={claimDialogIsPayment ? 'number' : 'text'}
                inputProps={claimDialogIsPayment ? { min: '0.01', step: '0.01', inputMode: 'decimal' } : { maxLength: 500 }}
                validate={value => {
                    if (!claimDialogIsPayment) return '';
                    const amount = Number(value);
                    if (!Number.isFinite(amount) || amount <= 0) return t('claimDialog.amountPositive');
                    const expected = toNumber(claimAction?.claim?.expected_amount);
                    if (expected > 0 && amount > expected) return t('claimDialog.amountExceeds');
                    return '';
                }}
                confirmLabel={t(`claimDialog.confirm${claimDialogType[0].toUpperCase()}${claimDialogType.slice(1)}`)}
                cancelLabel={t('claimDialog.cancel')}
                validationMessage={t('claimDialog.required')}
                isLoading={isUpdatingClaim}
            />
        </div>
    );
};

// UI Helper Components

const Panel = ({ id, icon: Icon, title, description, action, children }) => (
    <section id={id} className="min-w-0 scroll-mt-24 rounded-2xl border border-slate-200/70 bg-white/70 shadow-xs backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-900/60 p-4 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-150/60 dark:border-slate-800/60 pb-4">
            <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-900/50">
                    <Icon size={19} />
                </span>
                <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-950 dark:text-white">{title}</h2>
                    {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-snug">{description}</p>}
                </div>
            </div>
            {action}
        </div>
        {children}
    </section>
);

const Field = ({ label, className = '', children }) => (
    <label className={`block min-w-0 ${className}`}>
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.12em] text-slate-500 dark:text-slate-400">{label}</span>
        {children}
    </label>
);

const ProviderSelect = ({ value, onChange, providers, t }) => (
    <select value={value} onChange={event => onChange(event.target.value)} className={inputClass}>
        <option value="">{t('fields.selectProvider')}</option>
        {providers.map(provider => (
            <option key={provider.provider_id} value={provider.provider_id}>{provider.name}</option>
        ))}
    </select>
);

const ContractSelect = ({ value, onChange, contracts, t }) => (
    <select value={value} onChange={event => onChange(event.target.value)} className={inputClass}>
        <option value="">{t('fields.selectContract', 'Select contract (optional)')}</option>
        {contracts.map(contract => (
            <option key={contract.contract_id} value={contract.contract_id}>
                {contract.entity_name} ({contract.contract_number || 'No #'})
            </option>
        ))}
    </select>
);

const PatientSelect = ({ value, onChange, patients, t }) => (
    <select value={value} onChange={event => onChange(event.target.value)} className={inputClass}>
        <option value="">{t('fields.selectPatient', 'Select Patient')}</option>
        {patients.map(patient => (
            <option key={patient.patient_id} value={patient.patient_id}>
                {patient.full_name || patient.name || 'Patient'} ({patient.mrn || 'No MRN'})
            </option>
        ))}
    </select>
);

const InvoiceSelect = ({ value, onChange, invoices, t }) => (
    <select
        value={value}
        onChange={event => {
            const invId = event.target.value;
            const inv = invoices.find(i => String(i.invoice_id) === String(invId));
            onChange(invId, inv?.insurance_covered_amount || inv?.total_amount);
        }}
        className={inputClass}
    >
        <option value="">{t('fields.selectInvoice', 'Select Invoice')}</option>
        {invoices.map(inv => (
            <option key={inv.invoice_id} value={inv.invoice_id}>
                {inv.invoice_number} ({inv.patient_name || 'Invoice'})
            </option>
        ))}
    </select>
);

const PolicySelect = ({ value, onChange, policies, t, disabled }) => (
    <select value={value} onChange={event => onChange(event.target.value)} disabled={disabled} className={inputClass}>
        <option value="">{t('fields.selectPolicy', 'Select Policy')}</option>
        {policies.map(pol => (
            <option key={pol.policy_id} value={pol.policy_id}>
                {pol.plan_name || pol.policy_number} ({pol.provider_name || 'Provider'})
            </option>
        ))}
    </select>
);

const statTones = {
    cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-900/50',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/50',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/50',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/50',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/50',
};

const Stat = ({ icon: Icon, label, value, tone, loading, className = '' }) => (
    <article className={`group min-w-0 rounded-2xl border border-slate-200/70 bg-white/70 shadow-xs backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-900/60 p-4 transition hover:-translate-y-0.5 hover:border-cyan-200 dark:hover:border-cyan-800 sm:p-5 ${className}`}>
        <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-bold uppercase leading-4 tracking-[.12em] text-slate-400 dark:text-slate-500 sm:text-[11px]">{label}</p>
            <span className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-4 sm:flex ${statTones[tone]}`}>
                <Icon size={18} />
            </span>
        </div>
        {loading ? (
            <div className="mt-3 h-8 w-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50" />
        ) : (
            <p className="mt-2 truncate text-2xl font-extrabold tracking-tight text-slate-950 dark:text-white sm:text-3xl">{value}</p>
        )}
    </article>
);

const CountBadge = ({ children }) => (
    <span className="shrink-0 rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-cyan-700 dark:border-cyan-900/50 dark:bg-cyan-950/40 dark:text-cyan-300">
        {children}
    </span>
);

const StatusBadge = ({ status, t }) => (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${statusTones[status] || statusTones.Pending}`}>
        {t(`statuses.${status}`, { defaultValue: status })}
    </span>
);

const ClaimActions = ({ claim, t, onStatus, updating, compact = false }) => (
    <div className={`flex flex-wrap gap-2 ${compact ? '' : 'justify-end'}`}>
        <button type="button" onClick={() => onStatus(claim, 'Submitted')} disabled={updating} className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-bold text-cyan-800 transition hover:bg-cyan-100 disabled:opacity-50 dark:border-cyan-900/50 dark:bg-cyan-950/40 dark:text-cyan-300">{t('actions.submit')}</button>
        <button type="button" onClick={() => onStatus(claim, 'Partially Paid')} disabled={updating} className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-bold text-violet-800 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-300">{t('actions.partialPaid')}</button>
        <button type="button" onClick={() => onStatus(claim, 'Paid')} disabled={updating} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">{t('actions.paid')}</button>
        <button type="button" onClick={() => onStatus(claim, 'Rejected')} disabled={updating} className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-800 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">{t('actions.reject')}</button>
    </div>
);

const ClaimRow = ({ claim, t, currency, onStatus, updating }) => (
    <tr className="group transition hover:bg-cyan-50/30 dark:hover:bg-cyan-950/20">
        <td className="border-b border-slate-100 dark:border-slate-800/50 px-4 py-3.5">
            <p className="font-bold text-slate-900 dark:text-white">{claim.claim_number || '—'}</p>
            {claim.claim_reference_number && <p className="mt-0.5 text-xs text-slate-400">{claim.claim_reference_number}</p>}
        </td>
        <td className="border-b border-slate-100 dark:border-slate-800/50 px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-300">{claim.provider_name || '—'}</td>
        <td className="border-b border-slate-100 dark:border-slate-800/50 px-4 py-3.5"><StatusBadge status={claim.status} t={t} /></td>
        <td className="border-b border-slate-100 dark:border-slate-800/50 px-4 py-3.5 text-end font-semibold text-slate-700 dark:text-slate-300">{currency(claim.expected_amount)}</td>
        <td className="border-b border-slate-100 dark:border-slate-800/50 px-4 py-3.5 text-end font-bold text-emerald-600 dark:text-emerald-400">{currency(claim.received_amount)}</td>
        <td className="border-b border-slate-100 dark:border-slate-800/50 px-4 py-3.5"><ClaimActions claim={claim} t={t} onStatus={onStatus} updating={updating} /></td>
    </tr>
);

const ClaimCard = ({ claim, t, currency, onStatus, updating }) => (
    <article className="rounded-2xl border border-slate-200/70 bg-white/70 shadow-xs backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-900/60 p-4">
        <div className="flex items-start justify-between gap-3">
            <div>
                <p className="font-bold text-slate-950 dark:text-white">{claim.claim_number || '—'}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{claim.provider_name || '—'}</p>
            </div>
            <StatusBadge status={claim.status} t={t} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-150/60 bg-slate-50/40 p-3 dark:border-slate-800/60 dark:bg-slate-900/40">
            <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('table.expected')}</dt>
                <dd className="mt-1 text-sm font-extrabold text-slate-800 dark:text-slate-200">{currency(claim.expected_amount)}</dd>
            </div>
            <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('table.received')}</dt>
                <dd className="mt-1 text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{currency(claim.received_amount)}</dd>
            </div>
        </dl>
        <div className="mt-4"><ClaimActions claim={claim} t={t} onStatus={onStatus} updating={updating} compact /></div>
    </article>
);

const RecordList = ({ loading, rows, keyFor, render, emptyTitle, emptyDescription }) => (
    <div className="mt-5 border-t border-slate-100 dark:border-slate-800/50 pt-4">
        {loading ? (
            <div className="space-y-2">{[0, 1].map(item => <div key={item} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50" />)}</div>
        ) : rows.length === 0 ? (
            <EmptyState icon={FileCheck2} title={emptyTitle} description={emptyDescription} compact />
        ) : (
            <div className="space-y-2">
                {rows.map(row => (
                    <div key={keyFor(row)} className="rounded-xl border border-slate-150/60 bg-slate-50/40 px-3.5 py-3 text-sm text-slate-700 dark:border-slate-800/60 dark:bg-slate-900/40 dark:text-slate-300">
                        {render(row)}
                    </div>
                ))}
            </div>
        )}
    </div>
);

const RecordLine = ({ title, meta, badge, badgeTone = 'slate' }) => (
    <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
            <p className="truncate font-bold text-slate-800 dark:text-slate-200">{title || '—'}</p>
            {meta && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{meta}</p>}
        </div>
        {badge && (
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                badgeTone === 'emerald' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' :
                badgeTone === 'amber' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' :
                badgeTone === 'rose' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' :
                'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}>
                {badge}
            </span>
        )}
    </div>
);

const RejectedClaims = ({ loading, claims, t, onResubmit, updating }) => (
    <div className="mt-3">
        {loading ? (
            <div className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        ) : claims.length === 0 ? (
            <p className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-900/50">
                {t('empty.rejectedClaims')}
            </p>
        ) : (
            <div className="space-y-2">
                {claims.map(claim => (
                    <div key={claim.claim_id} className="flex flex-col gap-3 rounded-xl border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-rose-900 dark:text-rose-300">{claim.claim_number || '—'}</p>
                            <p className="mt-1 text-xs text-rose-700 dark:text-rose-400">{claim.rejection_reason || t('statuses.Rejected')}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => onResubmit(claim)}
                            disabled={updating}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-white dark:bg-[#0b1426] px-3 text-xs font-bold text-rose-700 dark:text-rose-400 shadow-xs ring-1 ring-rose-200 dark:ring-rose-900/50 disabled:opacity-50"
                        >
                            <RotateCcw size={14} />
                            {t('actions.resubmit')}
                        </button>
                    </div>
                ))}
            </div>
        )}
    </div>
);

const ClaimsLoading = () => (
    <div className="space-y-3">
        {[0, 1, 2].map(item => <div key={item} className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800/50" />)}
    </div>
);

const EmptyState = ({ icon: Icon, title, description, action, compact = false }) => (
    <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/70 bg-slate-50/40 text-center dark:border-slate-800/70 dark:bg-slate-900/30 ${compact ? 'p-5' : 'min-h-56 p-8'}`}>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white dark:bg-slate-800 text-slate-400 shadow-xs">
            <Icon size={21} />
        </span>
        <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">{title}</p>
        {description && <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
    </div>
);

const QueryError = ({ onRetry, t }) => (
    <div className="flex items-center justify-between rounded-2xl border border-rose-200/80 bg-rose-50/80 p-4 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
        <div className="flex items-center gap-3">
            <AlertTriangle size={18} className="shrink-0 text-rose-600" />
            <p className="text-xs font-semibold">{t('errors.load')}</p>
        </div>
        <button type="button" onClick={onRetry} className="rounded-xl border border-rose-300/80 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 shadow-xs dark:border-rose-800 dark:bg-rose-900 dark:text-rose-200">
            {t('errors.retry')}
        </button>
    </div>
);

export default Insurance;
