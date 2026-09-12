import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import {
    Activity, AlertTriangle, BadgeCheck, Building2, Calculator,
    ChevronDown, CircleDollarSign, ClipboardCheck, DollarSign, Download,
    Edit2, FileCheck2, FilePlus2, FileSpreadsheet, FileText, FilterX,
    Layers, Plus, RefreshCw, RotateCcw, Search, ShieldCheck, SlidersHorizontal,
    User, WalletCards, X, XCircle, CheckCircle2, Calendar
} from 'lucide-react';
import {
    useCreateCoverageRuleMutation,
    useCreateInsuranceApprovalMutation,
    useCreateInsuranceContractMutation,
    useCreateInsuranceProviderMutation,
    useCreateInsurancePolicyMutation,
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
    useUpdateInsuranceProviderMutation,
    useUpdateInsuranceContractMutation,
    useUpdateInsurancePolicyMutation,
    useUpdateCoverageRuleMutation,
} from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import { useTranslation } from 'react-i18next';
import TextPromptDialog from '../components/ui/TextPromptDialog';
import PageHeader from '../components/ui/PageHeader';
import { inputClass, primaryBtn, secondaryBtn } from '../utils/designTokens';
import { downloadAuthenticatedFile } from '../utils/authenticatedFetch';

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
    const [searchParams, setSearchParams] = useSearchParams();

    // Forms State
    const [providerForm, setProviderForm] = useState({ name: '', payerCode: '', phone: '', email: '' });
    const [contractForm, setContractForm] = useState({ providerId: '', entityName: '', entityType: 'Insurance', contractNumber: '', startDate: '', endDate: '', commissionPercentage: '' });
    const [ruleForm, setRuleForm] = useState({ providerId: '', contractId: '', coveragePercentage: '80', coverageCeiling: '', copayAmount: '0', modalityType: '', preauthorizationRequired: false });
    const [approvalForm, setApprovalForm] = useState({ patientId: '', providerId: '', policyId: '', appointmentId: '', examTypeId: '', status: 'Pending', requestedAmount: '', documentUrl: '' });
    const [claimForm, setClaimForm] = useState({ patientId: '', providerId: '', invoiceId: '', policyId: '', approvalId: '', claimReferenceNumber: '', expectedAmount: '' });
    const [newPolicyForm, setNewPolicyForm] = useState({ patientId: '', providerId: '', contractId: '', policyNumber: '', memberNumber: '', planName: '', holderName: '', relationshipToHolder: 'Self', validFrom: '', validTo: '', isPrimary: true });

    // Interactive Calculator State
    const [calcParams, setCalcParams] = useState({ providerId: '', contractId: '', modalityType: '', amount: '1000' });

    // Claims Filtering State
    const [claimSearch, setClaimSearch] = useState('');
    const [claimStatus, setClaimStatusFilter] = useState('all');
    const [claimProvider, setClaimProvider] = useState('all');
    const [claimAction, setClaimAction] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportParams, setExportParams] = useState({
        providerId: 'all',
        status: 'all',
        startDate: '',
        endDate: '',
        format: 'csv'
    });

    // Edit Modals State
    const [editingProvider, setEditingProvider] = useState(null);
    const [editingContract, setEditingContract] = useState(null);
    const [editingRule, setEditingRule] = useState(null);
    const [editingPolicy, setEditingPolicy] = useState(null);
    const [settlementClaim, setSettlementClaim] = useState(null);

    // Policy Tab Search
    const [policySearch, setPolicySearch] = useState('');

    // Queries
    const { data: providerData = [], isLoading: providersLoading, isError: providersError, refetch: refetchProviders } = useGetInsuranceProvidersQuery();
    const { data: contractData = [], isLoading: contractsLoading, isError: contractsError, refetch: refetchContracts } = useGetInsuranceContractsQuery();
    const { data: ruleData = [], isLoading: rulesLoading, isError: rulesError, refetch: refetchRules } = useGetCoverageRulesQuery();
    const { data: approvalData = [], isLoading: approvalsLoading, isError: approvalsError, refetch: refetchApprovals } = useGetInsuranceApprovalsQuery();
    const { data: allPoliciesData = [], isLoading: policiesLoading, isError: policiesError, refetch: refetchPolicies } = useGetInsurancePoliciesQuery();
    const { data: claimData = [], isLoading: claimsLoading, isFetching: claimsFetching, isError: claimsError, refetch: refetchClaims } = useGetClaimsQuery({ limit: 100 });
    const { data: rejectedClaimData = [], isLoading: rejectedLoading, isError: rejectedError, refetch: refetchRejected } = useGetClaimsQuery({ rejectedOnly: 'true', limit: 50 });

    // Auxiliary Queries for Smart Selectors
    const { data: patientData = [] } = useGetPatientsQuery({ limit: 100 });
    const { data: invoiceData = [] } = useGetInvoicesQuery({ limit: 100 });
    const { data: claimPolicies = [] } = useGetInsurancePoliciesQuery({ patientId: claimForm.patientId }, { skip: !claimForm.patientId });
    const { data: approvalPolicies = [] } = useGetInsurancePoliciesQuery({ patientId: approvalForm.patientId }, { skip: !approvalForm.patientId });
    const { data: calcResult, isFetching: calcLoading } = usePreviewCoverageQuery(
        { providerId: calcParams.providerId, contractId: calcParams.contractId || undefined, modalityType: calcParams.modalityType || undefined, amount: Number(calcParams.amount) || 0 },
        { skip: !calcParams.providerId || !calcParams.amount }
    );

    // Mutations
    const [createProvider, { isLoading: isCreatingProvider }] = useCreateInsuranceProviderMutation();
    const [updateProviderMutation, { isLoading: isUpdatingProvider }] = useUpdateInsuranceProviderMutation();
    const [createContract, { isLoading: isCreatingContract }] = useCreateInsuranceContractMutation();
    const [updateContractMutation, { isLoading: isUpdatingContract }] = useUpdateInsuranceContractMutation();
    const [createRule, { isLoading: isCreatingRule }] = useCreateCoverageRuleMutation();
    const [updateCoverageRuleMutation, { isLoading: isUpdatingRule }] = useUpdateCoverageRuleMutation();
    const [createPolicy, { isLoading: isCreatingPolicy }] = useCreateInsurancePolicyMutation();
    const [updatePolicyMutation, { isLoading: isUpdatingPolicy }] = useUpdateInsurancePolicyMutation();
    const [createApproval, { isLoading: isCreatingApproval }] = useCreateInsuranceApprovalMutation();
    const [createClaim, { isLoading: isCreatingClaim }] = useCreateClaimMutation();
    const [updateClaimStatus, { isLoading: isUpdatingClaim }] = useUpdateClaimStatusMutation();

    // Memoized Data
    const providers = useMemo(() => Array.isArray(providerData) ? providerData : [], [providerData]);
    const contracts = useMemo(() => Array.isArray(contractData) ? contractData : [], [contractData]);
    const rules = useMemo(() => Array.isArray(ruleData) ? ruleData : [], [ruleData]);
    const approvals = useMemo(() => Array.isArray(approvalData) ? approvalData : [], [approvalData]);
    const policies = useMemo(() => Array.isArray(allPoliciesData) ? allPoliciesData : [], [allPoliciesData]);
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
        const deductions = allClaims.reduce((total, claim) => total + toNumber(claim.deduction_amount || 0), 0);
        return {
            providers: providers.length,
            activeContracts: contracts.filter(contract => contract.is_active).length,
            totalPolicies: policies.length,
            approvalPending: approvals.filter(item => item.status === 'Pending').length,
            rejectedClaims: rejectedClaims.length,
            outstanding: Math.max(0, expected - (received + deductions)),
        };
    }, [allClaims, approvals, contracts, policies, providers, rejectedClaims]);

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

    const visiblePolicies = useMemo(() => {
        const search = policySearch.trim().toLowerCase();
        if (!search) return policies;
        return policies.filter(pol => {
            return [pol.policy_number, pol.member_number, pol.plan_name, pol.holder_name, pol.provider_name, pol.mrn, pol.first_name, pol.last_name]
                .filter(Boolean).join(' ').toLowerCase().includes(search);
        });
    }, [policies, policySearch]);

    const hasClaimFilters = Boolean(claimSearch || claimStatus !== 'all' || claimProvider !== 'all');
    const hasQueryError = providersError || contractsError || rulesError || approvalsError || claimsError || rejectedError || policiesError;

    const refreshAll = () => {
        refetchProviders();
        refetchContracts();
        refetchRules();
        refetchApprovals();
        refetchPolicies();
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

    const handleUpdateProvider = async (e) => {
        e.preventDefault();
        if (!editingProvider) return;
        try {
            await updateProviderMutation({
                id: editingProvider.provider_id,
                name: editingProvider.name,
                payerCode: editingProvider.payer_code,
                phone: editingProvider.phone,
                email: editingProvider.email,
                address: editingProvider.address,
                isActive: editingProvider.is_active,
                notes: editingProvider.notes
            }).unwrap();
            toast.success(t('messages.providerUpdated', 'Provider details updated successfully.'));
            setEditingProvider(null);
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.providerError')));
        }
    };

    const saveContract = async () => {
        try {
            await createContract({
                ...contractForm,
                providerId: contractForm.providerId || undefined,
                commissionPercentage: contractForm.commissionPercentage ? Number(contractForm.commissionPercentage) : undefined
            }).unwrap();
            toast.success(t('messages.contractAdded'));
            setContractForm({ providerId: '', entityName: '', entityType: 'Insurance', contractNumber: '', startDate: '', endDate: '', commissionPercentage: '' });
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.contractError')));
        }
    };

    const handleUpdateContract = async (e) => {
        e.preventDefault();
        if (!editingContract) return;
        try {
            await updateContractMutation({
                id: editingContract.contract_id,
                entityName: editingContract.entity_name,
                entityType: editingContract.entity_type,
                providerId: editingContract.provider_id || undefined,
                contractNumber: editingContract.contract_number,
                commissionPercentage: editingContract.commission_percentage !== '' ? Number(editingContract.commission_percentage) : undefined,
                startDate: editingContract.start_date ? editingContract.start_date.slice(0, 10) : undefined,
                endDate: editingContract.end_date ? editingContract.end_date.slice(0, 10) : undefined,
                isActive: editingContract.is_active,
                coverageNotes: editingContract.coverage_notes
            }).unwrap();
            toast.success(t('messages.contractUpdated', 'Contract updated successfully.'));
            setEditingContract(null);
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

    const handleUpdateRule = async (e) => {
        e.preventDefault();
        if (!editingRule) return;
        try {
            await updateCoverageRuleMutation({
                id: editingRule.rule_id,
                providerId: editingRule.provider_id,
                contractId: editingRule.contract_id || undefined,
                modalityType: editingRule.modality_type || undefined,
                coveragePercentage: Number(editingRule.coverage_percentage),
                coverageCeiling: editingRule.coverage_ceiling !== '' ? Number(editingRule.coverage_ceiling) : null,
                copayAmount: Number(editingRule.copay_amount || 0),
                preauthorizationRequired: Boolean(editingRule.preauthorization_required),
                isActive: Boolean(editingRule.is_active)
            }).unwrap();
            toast.success(t('messages.ruleUpdated', 'Coverage rule updated successfully.'));
            setEditingRule(null);
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.ruleError')));
        }
    };

    const savePolicy = async () => {
        try {
            await createPolicy({
                ...newPolicyForm,
                contractId: newPolicyForm.contractId || undefined,
                validFrom: newPolicyForm.validFrom || undefined,
                validTo: newPolicyForm.validTo || undefined,
            }).unwrap();
            toast.success(t('messages.policyAdded', 'Insurance policy added successfully.'));
            setNewPolicyForm({ patientId: '', providerId: '', contractId: '', policyNumber: '', memberNumber: '', planName: '', holderName: '', relationshipToHolder: 'Self', validFrom: '', validTo: '', isPrimary: true });
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.policyError', 'Failed to save policy.')));
        }
    };

    const handleUpdatePolicy = async (e) => {
        e.preventDefault();
        if (!editingPolicy) return;
        try {
            await updatePolicyMutation({
                id: editingPolicy.policy_id,
                providerId: editingPolicy.provider_id,
                contractId: editingPolicy.contract_id || undefined,
                policyNumber: editingPolicy.policy_number,
                memberNumber: editingPolicy.member_number,
                planName: editingPolicy.plan_name,
                holderName: editingPolicy.holder_name,
                relationshipToHolder: editingPolicy.relationship_to_holder,
                validFrom: editingPolicy.valid_from ? editingPolicy.valid_from.slice(0, 10) : undefined,
                validTo: editingPolicy.valid_to ? editingPolicy.valid_to.slice(0, 10) : undefined,
                isPrimary: Boolean(editingPolicy.is_primary)
            }).unwrap();
            toast.success(t('messages.policyUpdated', 'Insurance policy updated successfully.'));
            setEditingPolicy(null);
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.policyError', 'Failed to update policy.')));
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
                documentUrl: approvalForm.documentUrl || undefined,
            }).unwrap();
            toast.success(t('messages.approvalAdded'));
            setApprovalForm({ patientId: '', providerId: '', policyId: '', appointmentId: '', examTypeId: '', status: 'Pending', requestedAmount: '', documentUrl: '' });
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

    const handleSettlementSubmit = async (settlementData) => {
        if (!settlementClaim) return;
        try {
            const { receivedAmount, deductionAmount, deductionReason } = settlementData;
            const expected = toNumber(settlementClaim.expected_amount);
            const total = Number(receivedAmount) + Number(deductionAmount || 0);
            const targetStatus = total >= expected - 0.005 ? 'Paid' : 'Partially Paid';

            await updateClaimStatus({
                id: settlementClaim.claim_id,
                status: targetStatus,
                receivedAmount: Number(receivedAmount),
                deductionAmount: deductionAmount ? Number(deductionAmount) : 0,
                deductionReason: deductionReason || undefined
            }).unwrap();

            toast.success(t('messages.claimStatus', { status: t(`statuses.${targetStatus}`, { defaultValue: targetStatus }) }));
            setSettlementClaim(null);
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.claimUpdatedError')));
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
        if (status === 'Rejected') {
            setClaimAction({ claim, status });
            return;
        }
        if (['Paid', 'Partially Paid'].includes(status)) {
            setSettlementClaim(claim);
            return;
        }
        try {
            await updateClaimStatus({ id: claim.claim_id, status }).unwrap();
            toast.success(t('messages.claimStatus', { status: t(`statuses.${status}`, { defaultValue: status }) }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.claimUpdatedError')));
        }
    };

    const exportProviderClaims = async (provider, format = 'csv') => {
        try {
            setIsExporting(true);
            const safeName = (provider.name || 'provider').replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_');
            await downloadAuthenticatedFile(
                `/api/claims/export?providerId=${provider.provider_id}&format=${format}`,
                `claims-${safeName}-${new Date().toISOString().slice(0, 10)}.${format}`
            );
            toast.success(t('messages.exportSuccess', 'Claims exported successfully.'));
        } catch (err) {
            toast.error(getErrorMessage(err, t('messages.exportFailed', 'Failed to export claims.')));
        } finally {
            setIsExporting(false);
        }
    };

    const handleCustomExport = async (e) => {
        if (e) e.preventDefault();
        try {
            setIsExporting(true);
            const params = new URLSearchParams();
            if (exportParams.providerId && exportParams.providerId !== 'all') {
                params.append('providerId', exportParams.providerId);
            }
            if (exportParams.status && exportParams.status !== 'all') {
                params.append('status', exportParams.status);
            }
            if (exportParams.startDate) {
                params.append('startDate', exportParams.startDate);
            }
            if (exportParams.endDate) {
                params.append('endDate', exportParams.endDate);
            }
            params.append('format', exportParams.format || 'csv');

            let providerName = 'all-providers';
            if (exportParams.providerId && exportParams.providerId !== 'all') {
                const foundProv = providers.find(p => String(p.provider_id) === String(exportParams.providerId));
                if (foundProv?.name) {
                    providerName = foundProv.name.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_');
                }
            }

            const filename = `claims-${providerName}-${new Date().toISOString().slice(0, 10)}.${exportParams.format || 'csv'}`;
            await downloadAuthenticatedFile(`/api/claims/export?${params.toString()}`, filename);
            toast.success(t('messages.exportSuccess', 'Claims exported successfully.'));
            setIsExportModalOpen(false);
        } catch (err) {
            toast.error(getErrorMessage(err, t('messages.exportFailed', 'Failed to export claims.')));
        } finally {
            setIsExporting(false);
        }
    };

    const handleExport = async (format = 'csv') => {
        try {
            setIsExporting(true);
            const params = new URLSearchParams();
            if (claimStatus !== 'all') params.append('status', claimStatus);
            if (claimProvider !== 'all') params.append('providerId', claimProvider);
            params.append('format', format);

            let providerName = 'all-providers';
            if (claimProvider !== 'all') {
                const foundProv = providers.find(p => String(p.provider_id) === String(claimProvider));
                if (foundProv?.name) {
                    providerName = foundProv.name.replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_');
                }
            }

            await downloadAuthenticatedFile(
                `/api/claims/export?${params.toString()}`,
                `claims-${providerName}-${new Date().toISOString().slice(0, 10)}.${format}`
            );
            toast.success(t('messages.exportSuccess', 'Claims exported successfully.'));
        } catch (err) {
            toast.error(getErrorMessage(err, t('messages.exportFailed', 'Failed to export claims.')));
        } finally {
            setIsExporting(false);
        }
    };

    const exportPoliciesCsv = () => {
        if (!visiblePolicies.length) {
            toast.error(t('empty.noDataToExport', 'No policies to export'));
            return;
        }
        const headers = ['Patient Name', 'MRN', 'Provider', 'Policy Number', 'Member Number', 'Plan', 'Contract', 'Valid From', 'Valid To', 'Primary'];
        const rows = visiblePolicies.map(p => [
            `"${(`${p.first_name || ''} ${p.last_name || ''}`).trim() || p.patient_name || 'Patient'}"`,
            p.mrn || '',
            `"${(p.provider_name || '').replace(/"/g, '""')}"`,
            p.policy_number || '',
            p.member_number || '',
            `"${(p.plan_name || '').replace(/"/g, '""')}"`,
            `"${(p.contract_name || p.contract_number || '').replace(/"/g, '""')}"`,
            p.valid_from ? p.valid_from.slice(0, 10) : '',
            p.valid_to ? p.valid_to.slice(0, 10) : '',
            p.is_primary ? 'Yes' : 'No'
        ]);
        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `patient-policies-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(t('messages.exportSuccess', 'Policies exported successfully.'));
    };

    const claimDialogType = claimAction?.status === 'Submitted'
        ? 'submit'
        : claimAction?.status === 'Resubmitted'
            ? 'resubmit'
            : 'reject';

    // Tab items specification
    const tabs = [
        { id: 'claims', label: t('tabs.claims', 'Claims Workbench'), icon: WalletCards, count: visibleClaims.length },
        { id: 'providers', label: t('tabs.providers', 'Payers & Contracts'), icon: Building2, count: providers.length },
        { id: 'policies', label: t('tabs.policies', 'Patient Policies'), icon: FileText, count: policies.length },
        { id: 'rules', label: t('tabs.rules', 'Coverage & Simulator'), icon: BadgeCheck, count: rules.length },
        { id: 'approvals', label: t('tabs.approvals', 'Pre-Authorizations'), icon: ClipboardCheck, count: approvals.length },
    ];
    const requestedTab = searchParams.get('tab');
    const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : 'claims';
    const setActiveTab = (tab) => setSearchParams((current) => { const next = new URLSearchParams(current); next.set('tab', tab); return next; }, { replace: true });

    return (
        <main className="mx-auto max-w-[1540px] space-y-4 pb-12">
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
                            onClick={() => {
                                setExportParams({
                                    providerId: claimProvider !== 'all' ? claimProvider : 'all',
                                    status: claimStatus !== 'all' ? claimStatus : 'all',
                                    startDate: '',
                                    endDate: '',
                                    format: 'csv'
                                });
                                setIsExportModalOpen(true);
                            }}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-teal-200/80 bg-teal-50/80 px-3.5 text-xs font-bold text-teal-800 shadow-xs backdrop-blur-md transition hover:bg-teal-100 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-900/60"
                        >
                            <SlidersHorizontal size={16} className="text-teal-600 dark:text-teal-400" />
                            <span>{t('exportModal.quickExportByProvider', 'Export by Provider')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleExport('csv')}
                            disabled={isExporting}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3.5 text-xs font-bold text-emerald-800 shadow-xs backdrop-blur-md transition hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 disabled:opacity-50"
                        >
                            <FileSpreadsheet size={16} className="text-emerald-600 dark:text-emerald-400" />
                            <span>{isExporting ? t('actions.exporting', 'Exporting...') : t('actions.exportClaimsCsv', 'Export Claims (Excel/CSV)')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleExport('json')}
                            disabled={isExporting}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-cyan-200/80 bg-cyan-50/80 px-3.5 text-xs font-bold text-cyan-800 shadow-xs backdrop-blur-md transition hover:bg-cyan-100 dark:border-cyan-900/50 dark:bg-cyan-950/40 dark:text-cyan-300 dark:hover:bg-cyan-900/60 disabled:opacity-50"
                        >
                            <Download size={16} className="text-cyan-600 dark:text-cyan-400" />
                            <span>{t('actions.exportClaimsJson', 'Export Claims (JSON)')}</span>
                        </button>
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
                meta={
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${hasQueryError ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
                        <span className={`h-2 w-2 rounded-full ${hasQueryError ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                        {hasQueryError ? t('errors.partialStatus') : t('stats.liveStatus')}
                    </span>
                }
                metrics={[
                    { key: 'providers', icon: Building2, label: t('stats.providers'), value: formatNumber(summary.providers), tone: 'cyan', loading: providersLoading },
                    { key: 'contracts', icon: FileCheck2, label: t('stats.contracts'), value: formatNumber(summary.activeContracts), tone: 'blue', loading: contractsLoading },
                    { key: 'policies', icon: FileText, label: t('tabs.policies', 'Patient Policies'), value: formatNumber(summary.totalPolicies), tone: 'teal', loading: policiesLoading },
                    { key: 'approvals', icon: ClipboardCheck, label: t('stats.approvals'), value: formatNumber(summary.approvalPending), tone: 'amber', loading: approvalsLoading },
                    { key: 'rejected', icon: XCircle, label: t('stats.rejected'), value: formatNumber(summary.rejectedClaims), tone: summary.rejectedClaims > 0 ? 'rose' : 'emerald', loading: rejectedLoading },
                    { key: 'outstanding', icon: CircleDollarSign, label: t('stats.outstanding'), value: formatCurrency(summary.outstanding), tone: 'violet', loading: claimsLoading },
                ]}
                metricsLabel={t('stats.label')}
            />

            {hasQueryError && <QueryError onRetry={refreshAll} t={t} />}

            {/* Navigation Tabs Bar */}
<div data-workspace-tabs className="rounded-3xl border border-slate-200/80 bg-white/90 p-2 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 lg:hidden">
                <nav className="flex gap-2 overflow-x-auto p-1 scrollbar-none" aria-label="Insurance Subsystems">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`group inline-flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-xs font-black transition-all whitespace-nowrap ${
                                    isActive
                                        ? 'border border-teal-500/40 bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                                        : 'border border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-950/40 dark:text-slate-400 dark:hover:bg-slate-800'
                                }`}
                            >
                                <Icon size={16} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'} />
                                <span>{tab.label}</span>
                                <span className={`ms-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
                                    isActive
                                        ? 'bg-white/20 text-white'
                                        : 'bg-slate-200/80 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                }`}>
                                    {tab.count}
                                </span>
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* TAB 1: CLAIMS WORKBENCH */}
            {activeTab === 'claims' && (
                <div className="space-y-6">
                    <Panel
                        icon={WalletCards}
                        title={t('panels.claims')}
                        description={t('panels.claimsDescription')}
                        action={
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleExport('csv')}
                                    disabled={isExporting}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                >
                                    <FileSpreadsheet size={15} className="text-emerald-600" />
                                    <span>{t('actions.exportCsv', 'Export CSV')}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleExport('json')}
                                    disabled={isExporting}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                >
                                    <Download size={15} className="text-cyan-600" />
                                    <span>{t('actions.exportJson', 'Export JSON')}</span>
                                </button>
                                <CountBadge>{t('table.showing', { visible: formatNumber(visibleClaims.length), total: formatNumber(allClaims.length) })}</CountBadge>
                            </div>
                        }
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
                                <Field label={t('fields.patient', 'Patient')}>
                                    <PatientSelect
                                        value={claimForm.patientId}
                                        onChange={patientId => setClaimForm(prev => ({ ...prev, patientId, policyId: '', approvalId: '' }))}
                                        patients={patients}
                                        t={t}
                                    />
                                </Field>
                                <Field label={t('fields.provider')}>
                                    <ProviderSelect
                                        value={claimForm.providerId}
                                        onChange={providerId => setClaimForm(prev => ({ ...prev, providerId }))}
                                        providers={providers}
                                        t={t}
                                    />
                                </Field>
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
                                <Field label={t('fields.policy', 'Policy')}>
                                    <PolicySelect
                                        value={claimForm.policyId}
                                        onChange={policyId => setClaimForm(prev => ({ ...prev, policyId }))}
                                        policies={claimPolicies}
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

                        {/* Claims Filter Bar */}
                        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-3">
                                <label className="relative min-w-56">
                                    <span className="sr-only">{t('filters.search')}</span>
                                    <input
                                        value={claimSearch}
                                        onChange={event => setClaimSearch(event.target.value)}
                                        placeholder={t('filters.search')}
                                        className={`${inputClass} bg-white/90 dark:bg-slate-900/80 ps-9`}
                                    />
                                    <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                </label>
                                <label className="relative">
                                    <span className="sr-only">{t('filters.status')}</span>
                                    <select
                                        value={claimStatus}
                                        onChange={event => setClaimStatusFilter(event.target.value)}
                                        className={`${inputClass} min-w-36 appearance-none bg-white/90 dark:bg-slate-900/80 pe-9`}
                                    >
                                        <option value="all">{t('filters.allStatuses')}</option>
                                        {claimStatuses.map(status => (
                                            <option key={status} value={status}>{t(`statuses.${status}`)}</option>
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
                                <div className="ms-auto flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setExportParams({
                                                providerId: claimProvider !== 'all' ? claimProvider : 'all',
                                                status: claimStatus !== 'all' ? claimStatus : 'all',
                                                startDate: '',
                                                endDate: '',
                                                format: 'csv'
                                            });
                                            setIsExportModalOpen(true);
                                        }}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200/80 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800 shadow-xs hover:bg-teal-100 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-300"
                                    >
                                        <SlidersHorizontal size={15} className="text-teal-600" />
                                        <span>{t('exportModal.quickExportByProvider', 'Export by Provider')}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleExport('csv')}
                                        disabled={isExporting}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 shadow-xs hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300 disabled:opacity-50"
                                    >
                                        <FileSpreadsheet size={15} className="text-emerald-600" />
                                        <span>{isExporting ? t('actions.exporting', 'Exporting...') : 'Excel / CSV'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleExport('json')}
                                        disabled={isExporting}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-200/80 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-800 shadow-xs hover:bg-cyan-100 dark:border-cyan-900/50 dark:bg-cyan-950/40 dark:text-cyan-300 disabled:opacity-50"
                                    >
                                        <Download size={15} className="text-cyan-600" />
                                        <span>JSON</span>
                                    </button>
                                </div>
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
                                        <table className="w-full min-w-[860px] border-separate border-spacing-0 text-start text-sm">
                                            <thead>
                                                <tr className="bg-slate-50/50 dark:bg-slate-900/50 text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                                                    <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-start">{t('table.claim')}</th>
                                                    <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-start">{t('table.provider')}</th>
                                                    <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-start">{t('table.status')}</th>
                                                    <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-end">{t('table.expected')}</th>
                                                    <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-end">{t('table.received')}</th>
                                                    <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-end">{t('forms.deductionAmount', 'Deduction')}</th>
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
                            render={provider => (
                                <RecordLine
                                    title={provider.name}
                                    meta={provider.payer_code ? `${t('fields.payerCode')}: ${provider.payer_code}` : t('empty.noPayerCode')}
                                    badge={provider.is_active ? t('statuses.Active') : t('statuses.Inactive')}
                                    badgeTone={provider.is_active ? 'emerald' : 'slate'}
                                    action={
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => exportProviderClaims(provider, 'csv')}
                                                disabled={isExporting}
                                                title={t('exportModal.exportProvider', 'Export Claims for this Provider')}
                                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300 disabled:opacity-50"
                                            >
                                                <FileSpreadsheet size={12} className="text-emerald-600 dark:text-emerald-400" />
                                                <span>{t('actions.export', 'Export')}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEditingProvider({ ...provider })}
                                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                                            >
                                                <Edit2 size={12} />
                                                <span>{t('actions.edit', 'Edit')}</span>
                                            </button>
                                        </div>
                                    }
                                />
                            )}
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
                                    action={
                                        <button
                                            type="button"
                                            onClick={() => setEditingContract({ ...contract })}
                                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                                        >
                                            <Edit2 size={12} />
                                            <span>{t('actions.edit', 'Edit')}</span>
                                        </button>
                                    }
                                />
                            )}
                        />
                    </Panel>
                </div>
            )}

            {/* TAB 3: PATIENT POLICIES */}
            {activeTab === 'policies' && (
                <div className="space-y-6">
                    <Panel
                        icon={FileText}
                        title={t('panels.policies', 'Patient Insurance Policies')}
                        description={t('panels.policiesDescription', 'View and manage patient insurance policies, plans, and contract links.')}
                        action={<CountBadge>{formatNumber(visiblePolicies.length)}</CountBadge>}
                    >
                        {/* Add Policy Form */}
                        <div className="rounded-2xl border border-teal-100/70 bg-gradient-to-br from-teal-50/40 via-white to-white dark:from-teal-950/30 dark:via-slate-900/60 dark:to-slate-900/40 p-4 sm:p-5 shadow-xs mb-6">
                            <div className="mb-4 flex items-center gap-3">
                                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white dark:bg-[#0b1426] text-teal-700 dark:text-teal-400 shadow-xs ring-1 ring-teal-100 dark:ring-teal-900/50">
                                    <Plus size={19} />
                                </span>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-950 dark:text-white">{t('actions.addPolicy', 'Add Patient Policy')}</h3>
                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Attach patient to provider and insurance plan</p>
                                </div>
                            </div>
                            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                                <Field label={t('fields.patient', 'Patient')}>
                                    <PatientSelect
                                        value={newPolicyForm.patientId}
                                        onChange={patientId => setNewPolicyForm(prev => ({ ...prev, patientId }))}
                                        patients={patients}
                                        t={t}
                                    />
                                </Field>
                                <Field label={t('fields.provider')}>
                                    <ProviderSelect
                                        value={newPolicyForm.providerId}
                                        onChange={providerId => setNewPolicyForm(prev => ({ ...prev, providerId, contractId: '' }))}
                                        providers={providers}
                                        t={t}
                                    />
                                </Field>
                                <Field label={t('fields.contract', 'Contract')}>
                                    <ContractSelect
                                        value={newPolicyForm.contractId}
                                        onChange={contractId => setNewPolicyForm(prev => ({ ...prev, contractId }))}
                                        contracts={contracts.filter(c => !newPolicyForm.providerId || String(c.provider_id) === String(newPolicyForm.providerId))}
                                        t={t}
                                    />
                                </Field>
                                <Field label="Policy Number">
                                    <input
                                        value={newPolicyForm.policyNumber}
                                        onChange={e => setNewPolicyForm(prev => ({ ...prev, policyNumber: e.target.value }))}
                                        placeholder="e.g. POL-12345"
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label="Member Number">
                                    <input
                                        value={newPolicyForm.memberNumber}
                                        onChange={e => setNewPolicyForm(prev => ({ ...prev, memberNumber: e.target.value }))}
                                        placeholder="e.g. MEM-999"
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label="Plan Name">
                                    <input
                                        value={newPolicyForm.planName}
                                        onChange={e => setNewPolicyForm(prev => ({ ...prev, planName: e.target.value }))}
                                        placeholder="e.g. Gold VIP"
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label="Valid From">
                                    <input
                                        type="date"
                                        value={newPolicyForm.validFrom}
                                        onChange={e => setNewPolicyForm(prev => ({ ...prev, validFrom: e.target.value }))}
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label="Valid To">
                                    <input
                                        type="date"
                                        value={newPolicyForm.validTo}
                                        onChange={e => setNewPolicyForm(prev => ({ ...prev, validTo: e.target.value }))}
                                        className={inputClass}
                                    />
                                </Field>
                                <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200/70 bg-slate-50/40 px-3.5 text-sm font-semibold text-slate-700 dark:border-slate-800/70 dark:bg-slate-900/50 dark:text-slate-300 sm:col-span-2">
                                    <input
                                        type="checkbox"
                                        checked={newPolicyForm.isPrimary}
                                        onChange={e => setNewPolicyForm(prev => ({ ...prev, isPrimary: e.target.checked }))}
                                        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                    />
                                    <span>Primary Insurance Policy (الوثيقة الأساسية)</span>
                                </label>
                                <div className="flex items-end sm:col-span-2">
                                    <button
                                        type="button"
                                        onClick={savePolicy}
                                        disabled={isCreatingPolicy || !newPolicyForm.patientId || !newPolicyForm.providerId || !newPolicyForm.policyNumber}
                                        className={`${primaryBtn} w-full`}
                                    >
                                        <Plus size={17} />
                                        <span>{isCreatingPolicy ? t('actions.saving') : t('actions.addPolicy', 'Add Patient Policy')}</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Search and Table */}
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <label className="relative block max-w-md flex-1">
                                <span className="sr-only">Search policies</span>
                                <input
                                    value={policySearch}
                                    onChange={e => setPolicySearch(e.target.value)}
                                    placeholder="Search by Patient MRN, Name, Policy #, or Provider..."
                                    className={`${inputClass} ps-9`}
                                />
                                <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            </label>
                            <button
                                type="button"
                                onClick={exportPoliciesCsv}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                            >
                                <FileSpreadsheet size={15} className="text-teal-600" />
                                <span>{t('actions.exportPolicies', 'Export Policies (CSV)')}</span>
                            </button>
                        </div>

                        {policiesLoading ? (
                            <ClaimsLoading />
                        ) : visiblePolicies.length === 0 ? (
                            <EmptyState
                                icon={FileText}
                                title="No Insurance Policies Found"
                                description="Patient insurance policies will appear here once added."
                            />
                        ) : (
                            <div className="overflow-x-auto rounded-2xl border border-slate-200/60 dark:border-slate-800/60">
                                <table className="w-full min-w-[850px] border-separate border-spacing-0 text-start text-sm">
                                    <thead>
                                        <tr className="bg-slate-50/50 dark:bg-slate-900/50 text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">
                                            <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-start">Patient</th>
                                            <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-start">Provider</th>
                                            <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-start">Policy #</th>
                                            <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-start">Plan</th>
                                            <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-start">Contract</th>
                                            <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-start">Validity</th>
                                            <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-start">Primary</th>
                                            <th className="border-b border-slate-200/60 dark:border-slate-800/60 px-4 py-3 text-end">{t('table.actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visiblePolicies.map(pol => (
                                            <tr key={pol.policy_id} className="transition hover:bg-slate-50/50 dark:hover:bg-slate-850/40">
                                                <td className="border-b border-slate-150/60 dark:border-slate-800/60 px-4 py-3 font-semibold text-slate-900 dark:text-white">
                                                    <div>
                                                        <span>{`${pol.first_name || ''} ${pol.last_name || ''}`.trim() || pol.patient_name || 'Patient'}</span>
                                                        <span className="block text-[11px] font-normal text-slate-400">MRN: {pol.mrn || '—'}</span>
                                                    </div>
                                                </td>
                                                <td className="border-b border-slate-150/60 dark:border-slate-800/60 px-4 py-3 text-slate-700 dark:text-slate-300">
                                                    {pol.provider_name || '—'}
                                                </td>
                                                <td className="border-b border-slate-150/60 dark:border-slate-800/60 px-4 py-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                                                    {pol.policy_number}
                                                    {pol.member_number && <span className="block text-[10px] font-normal text-slate-400">Mem: {pol.member_number}</span>}
                                                </td>
                                                <td className="border-b border-slate-150/60 dark:border-slate-800/60 px-4 py-3 text-slate-700 dark:text-slate-300">
                                                    {pol.plan_name || 'Standard'}
                                                </td>
                                                <td className="border-b border-slate-150/60 dark:border-slate-800/60 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                                                    {pol.contract_name || pol.contract_number || '—'}
                                                </td>
                                                <td className="border-b border-slate-150/60 dark:border-slate-800/60 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                                                    {pol.valid_from ? pol.valid_from.slice(0, 10) : '—'} → {pol.valid_to ? pol.valid_to.slice(0, 10) : '—'}
                                                </td>
                                                <td className="border-b border-slate-150/60 dark:border-slate-800/60 px-4 py-3">
                                                    {pol.is_primary ? (
                                                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">Primary</span>
                                                    ) : (
                                                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Secondary</span>
                                                    )}
                                                </td>
                                                <td className="border-b border-slate-150/60 dark:border-slate-800/60 px-4 py-3 text-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingPolicy({ ...pol })}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                                                    >
                                                        <Edit2 size={13} />
                                                        <span>{t('actions.edit', 'Edit')}</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Panel>
                </div>
            )}

            {/* TAB 4: COVERAGE RULES & SIMULATOR */}
            {activeTab === 'rules' && (
                <div className="grid gap-6 xl:grid-cols-2">
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
                            <Field label={t('fields.contract', 'Linked Contract')}>
                                <ContractSelect
                                    value={ruleForm.contractId}
                                    onChange={contractId => setRuleForm(prev => ({ ...prev, contractId }))}
                                    contracts={contracts.filter(c => !ruleForm.providerId || String(c.provider_id) === String(ruleForm.providerId))}
                                    t={t}
                                />
                            </Field>
                            <Field label={t('fields.modality')}>
                                <input
                                    value={ruleForm.modalityType}
                                    onChange={event => setRuleForm(prev => ({ ...prev, modalityType: event.target.value }))}
                                    placeholder="e.g. CT, MRI, X-RAY, US"
                                    list="modality-suggestions"
                                    className={inputClass}
                                />
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
                                    action={
                                        <button
                                            type="button"
                                            onClick={() => setEditingRule({ ...rule })}
                                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                                        >
                                            <Edit2 size={12} />
                                            <span>{t('actions.edit', 'Edit')}</span>
                                        </button>
                                    }
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
                                        onChange={providerId => setCalcParams(prev => ({ ...prev, providerId, contractId: '' }))}
                                        providers={providers}
                                        t={t}
                                    />
                                </Field>
                                <Field label={t('fields.contract')}>
                                    <ContractSelect
                                        value={calcParams.contractId}
                                        onChange={contractId => setCalcParams(prev => ({ ...prev, contractId }))}
                                        contracts={contracts.filter(contract => !calcParams.providerId || contract.provider_id === calcParams.providerId)}
                                        t={t}
                                    />
                                </Field>
                                <Field label={t('fields.modality')}>
                                    <input
                                        value={calcParams.modalityType}
                                        onChange={e => setCalcParams(prev => ({ ...prev, modalityType: e.target.value }))}
                                        placeholder="e.g. CT, MRI, X-RAY, US"
                                        list="modality-suggestions"
                                        className={inputClass}
                                    />
                                </Field>
                                <datalist id="modality-suggestions">
                                    <option value="CT" />
                                    <option value="MRI" />
                                    <option value="X-RAY" />
                                    <option value="US" />
                                    <option value="MAMMO" />
                                    <option value="PET-CT" />
                                    <option value="FLUORO" />
                                    <option value="DEXA" />
                                </datalist>
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

            {/* TAB 5: PRE-AUTHORIZATIONS & APPROVALS */}
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
                                    policies={approvalPolicies}
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
                                    {['Not Required', 'Pending'].map(status => (
                                        <option key={status} value={status}>{t(`statuses.${status}`)}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label={t('fields.requested')}>
                                <input type="number" min="0" value={approvalForm.requestedAmount} onChange={event => setApprovalForm(prev => ({ ...prev, requestedAmount: event.target.value }))} placeholder={t('fields.requested')} className={inputClass} />
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

            {/* Status Change Dialog Modal (Submit / Resubmit / Reject) */}
            <TextPromptDialog
                isOpen={Boolean(claimAction)}
                onClose={() => setClaimAction(null)}
                onConfirm={completeClaimAction}
                title={t(`claimDialog.${claimDialogType}Title`)}
                message={t(`claimDialog.${claimDialogType}Description`, { claim: claimAction?.claim?.claim_number || '—', amount: formatCurrency(claimAction?.claim?.expected_amount) })}
                label={claimDialogType === 'submit' ? t('prompts.claimReference') : claimDialogType === 'resubmit' ? t('prompts.resubmission') : t('prompts.rejection')}
                initialValue=""
                type="text"
                inputProps={{ maxLength: 500 }}
                confirmLabel={t(`claimDialog.confirm${claimDialogType[0].toUpperCase()}${claimDialogType.slice(1)}`)}
                cancelLabel={t('claimDialog.cancel')}
                validationMessage={t('claimDialog.required')}
                isLoading={isUpdatingClaim}
            />

            {/* Settle Claim Modal with Deductions */}
            {settlementClaim && (
                <ClaimSettlementModal
                    claim={settlementClaim}
                    onClose={() => setSettlementClaim(null)}
                    onConfirm={handleSettlementSubmit}
                    isLoading={isUpdatingClaim}
                    t={t}
                    currency={formatCurrency}
                />
            )}

            {/* Edit Provider Modal */}
            {editingProvider && (
                <Modal title={t('actions.editProvider', 'Edit Provider')} onClose={() => setEditingProvider(null)}>
                    <form onSubmit={handleUpdateProvider} className="space-y-4">
                        <Field label={t('fields.providerName')}>
                            <input
                                value={editingProvider.name || ''}
                                onChange={e => setEditingProvider(prev => ({ ...prev, name: e.target.value }))}
                                className={inputClass}
                                required
                            />
                        </Field>
                        <Field label={t('fields.payerCode')}>
                            <input
                                value={editingProvider.payer_code || ''}
                                onChange={e => setEditingProvider(prev => ({ ...prev, payer_code: e.target.value }))}
                                className={inputClass}
                            />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={t('fields.phone')}>
                                <input
                                    type="tel"
                                    value={editingProvider.phone || ''}
                                    onChange={e => setEditingProvider(prev => ({ ...prev, phone: e.target.value }))}
                                    className={inputClass}
                                />
                            </Field>
                            <Field label={t('fields.email')}>
                                <input
                                    type="email"
                                    value={editingProvider.email || ''}
                                    onChange={e => setEditingProvider(prev => ({ ...prev, email: e.target.value }))}
                                    className={inputClass}
                                />
                            </Field>
                        </div>
                        <Field label="Address">
                            <input
                                value={editingProvider.address || ''}
                                onChange={e => setEditingProvider(prev => ({ ...prev, address: e.target.value }))}
                                className={inputClass}
                            />
                        </Field>
                        <label className="flex items-center gap-2.5 text-sm font-bold text-slate-700 dark:text-slate-300">
                            <input
                                type="checkbox"
                                checked={Boolean(editingProvider.is_active)}
                                onChange={e => setEditingProvider(prev => ({ ...prev, is_active: e.target.checked }))}
                                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                            />
                            <span>Active Provider (مقدم خدمة نشط)</span>
                        </label>
                        <div className="flex justify-end gap-2 pt-2">
                            <button type="button" onClick={() => setEditingProvider(null)} className={secondaryBtn}>
                                Cancel
                            </button>
                            <button type="submit" disabled={isUpdatingProvider} className={primaryBtn}>
                                {isUpdatingProvider ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Edit Contract Modal */}
            {editingContract && (
                <Modal title={t('actions.editContract', 'Edit Contract')} onClose={() => setEditingContract(null)}>
                    <form onSubmit={handleUpdateContract} className="space-y-4">
                        <Field label={t('fields.entityName')}>
                            <input
                                value={editingContract.entity_name || ''}
                                onChange={e => setEditingContract(prev => ({ ...prev, entity_name: e.target.value }))}
                                className={inputClass}
                                required
                            />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={t('fields.contractNumber')}>
                                <input
                                    value={editingContract.contract_number || ''}
                                    onChange={e => setEditingContract(prev => ({ ...prev, contract_number: e.target.value }))}
                                    className={inputClass}
                                />
                            </Field>
                            <Field label="Commission / Discount %">
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={editingContract.commission_percentage ?? ''}
                                    onChange={e => setEditingContract(prev => ({ ...prev, commission_percentage: e.target.value }))}
                                    className={inputClass}
                                />
                            </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={t('fields.startDate')}>
                                <input
                                    type="date"
                                    value={editingContract.start_date ? editingContract.start_date.slice(0, 10) : ''}
                                    onChange={e => setEditingContract(prev => ({ ...prev, start_date: e.target.value }))}
                                    className={inputClass}
                                />
                            </Field>
                            <Field label={t('fields.endDate')}>
                                <input
                                    type="date"
                                    value={editingContract.end_date ? editingContract.end_date.slice(0, 10) : ''}
                                    onChange={e => setEditingContract(prev => ({ ...prev, end_date: e.target.value }))}
                                    className={inputClass}
                                />
                            </Field>
                        </div>
                        <Field label="Coverage Notes">
                            <textarea
                                value={editingContract.coverage_notes || ''}
                                onChange={e => setEditingContract(prev => ({ ...prev, coverage_notes: e.target.value }))}
                                rows={2}
                                className={inputClass}
                            />
                        </Field>
                        <label className="flex items-center gap-2.5 text-sm font-bold text-slate-700 dark:text-slate-300">
                            <input
                                type="checkbox"
                                checked={Boolean(editingContract.is_active)}
                                onChange={e => setEditingContract(prev => ({ ...prev, is_active: e.target.checked }))}
                                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                            />
                            <span>Active Contract (عقد نشط)</span>
                        </label>
                        <div className="flex justify-end gap-2 pt-2">
                            <button type="button" onClick={() => setEditingContract(null)} className={secondaryBtn}>
                                Cancel
                            </button>
                            <button type="submit" disabled={isUpdatingContract} className={primaryBtn}>
                                {isUpdatingContract ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Edit Rule Modal */}
            {editingRule && (
                <Modal title={t('actions.editRule', 'Edit Coverage Rule')} onClose={() => setEditingRule(null)}>
                    <form onSubmit={handleUpdateRule} className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={t('fields.modality')}>
                                <input
                                    value={editingRule.modality_type || ''}
                                    onChange={e => setEditingRule(prev => ({ ...prev, modality_type: e.target.value }))}
                                    list="modality-suggestions"
                                    placeholder="e.g. CT, MRI, X-RAY, US"
                                    className={inputClass}
                                />
                            </Field>
                            <Field label={t('fields.coverage')}>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={editingRule.coverage_percentage ?? ''}
                                    onChange={e => setEditingRule(prev => ({ ...prev, coverage_percentage: e.target.value }))}
                                    className={inputClass}
                                    required
                                />
                            </Field>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={t('fields.ceiling')}>
                                <input
                                    type="number"
                                    min="0"
                                    value={editingRule.coverage_ceiling ?? ''}
                                    onChange={e => setEditingRule(prev => ({ ...prev, coverage_ceiling: e.target.value }))}
                                    className={inputClass}
                                />
                            </Field>
                            <Field label={t('fields.copay')}>
                                <input
                                    type="number"
                                    min="0"
                                    value={editingRule.copay_amount ?? ''}
                                    onChange={e => setEditingRule(prev => ({ ...prev, copay_amount: e.target.value }))}
                                    className={inputClass}
                                />
                            </Field>
                        </div>
                        <label className="flex items-center gap-2.5 text-sm font-bold text-slate-700 dark:text-slate-300">
                            <input
                                type="checkbox"
                                checked={Boolean(editingRule.preauthorization_required)}
                                onChange={e => setEditingRule(prev => ({ ...prev, preauthorization_required: e.target.checked }))}
                                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                            />
                            <span>{t('fields.preauth')}</span>
                        </label>
                        <label className="flex items-center gap-2.5 text-sm font-bold text-slate-700 dark:text-slate-300">
                            <input
                                type="checkbox"
                                checked={Boolean(editingRule.is_active)}
                                onChange={e => setEditingRule(prev => ({ ...prev, is_active: e.target.checked }))}
                                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                            />
                            <span>Active Rule (قاعدة نشطة)</span>
                        </label>
                        <div className="flex justify-end gap-2 pt-2">
                            <button type="button" onClick={() => setEditingRule(null)} className={secondaryBtn}>
                                Cancel
                            </button>
                            <button type="submit" disabled={isUpdatingRule} className={primaryBtn}>
                                {isUpdatingRule ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* Edit Policy Modal */}
            {editingPolicy && (
                <Modal title={t('actions.editPolicy', 'Edit Policy')} onClose={() => setEditingPolicy(null)}>
                    <form onSubmit={handleUpdatePolicy} className="space-y-4">
                        <Field label={t('fields.provider')}>
                            <ProviderSelect
                                value={editingPolicy.provider_id || ''}
                                onChange={providerId => setEditingPolicy(prev => ({ ...prev, provider_id: providerId }))}
                                providers={providers}
                                t={t}
                            />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Policy Number">
                                <input
                                    value={editingPolicy.policy_number || ''}
                                    onChange={e => setEditingPolicy(prev => ({ ...prev, policy_number: e.target.value }))}
                                    className={inputClass}
                                    required
                                />
                            </Field>
                            <Field label="Member Number">
                                <input
                                    value={editingPolicy.member_number || ''}
                                    onChange={e => setEditingPolicy(prev => ({ ...prev, member_number: e.target.value }))}
                                    className={inputClass}
                                />
                            </Field>
                        </div>
                        <Field label="Plan Name">
                            <input
                                value={editingPolicy.plan_name || ''}
                                onChange={e => setEditingPolicy(prev => ({ ...prev, plan_name: e.target.value }))}
                                className={inputClass}
                            />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Valid From">
                                <input
                                    type="date"
                                    value={editingPolicy.valid_from ? editingPolicy.valid_from.slice(0, 10) : ''}
                                    onChange={e => setEditingPolicy(prev => ({ ...prev, valid_from: e.target.value }))}
                                    className={inputClass}
                                />
                            </Field>
                            <Field label="Valid To">
                                <input
                                    type="date"
                                    value={editingPolicy.valid_to ? editingPolicy.valid_to.slice(0, 10) : ''}
                                    onChange={e => setEditingPolicy(prev => ({ ...prev, valid_to: e.target.value }))}
                                    className={inputClass}
                                />
                            </Field>
                        </div>
                        <label className="flex items-center gap-2.5 text-sm font-bold text-slate-700 dark:text-slate-300">
                            <input
                                type="checkbox"
                                checked={Boolean(editingPolicy.is_primary)}
                                onChange={e => setEditingPolicy(prev => ({ ...prev, is_primary: e.target.checked }))}
                                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                            />
                            <span>Primary Insurance Policy (الوثيقة الأساسية للمريض)</span>
                        </label>
                        <div className="flex justify-end gap-2 pt-2">
                            <button type="button" onClick={() => setEditingPolicy(null)} className={secondaryBtn}>
                                Cancel
                            </button>
                            <button type="submit" disabled={isUpdatingPolicy} className={primaryBtn}>
                                {isUpdatingPolicy ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}

            {isExportModalOpen && (
                <ExportClaimsModal
                    isOpen={isExportModalOpen}
                    onClose={() => setIsExportModalOpen(false)}
                    exportParams={exportParams}
                    setExportParams={setExportParams}
                    onExport={handleCustomExport}
                    providers={providers}
                    isLoading={isExporting}
                    t={t}
                />
            )}
        </main>
    );
};

// Claim Settlement Dialog supporting Deductions & Live Balance
const ClaimSettlementModal = ({ claim, onClose, onConfirm, isLoading, t, currency }) => {
    const expected = toNumber(claim.expected_amount);
    const prevReceived = toNumber(claim.received_amount);
    const prevDeduction = toNumber(claim.deduction_amount || 0);

    const [receivedAmount, setReceivedAmount] = useState(String(expected - prevDeduction));
    const [deductionAmount, setDeductionAmount] = useState(String(prevDeduction));
    const [deductionReason, setDeductionReason] = useState(claim.deduction_reason || '');

    const numReceived = Number(receivedAmount) || 0;
    const numDeduction = Number(deductionAmount) || 0;
    const totalSettled = numReceived + numDeduction;
    const remaining = Math.max(0, expected - totalSettled);
    const isFullSettlement = totalSettled >= expected - 0.005;

    const handleSubmit = (e) => {
        e.preventDefault();
        if (numReceived <= 0 && numDeduction <= 0) {
            toast.error(t('claimDialog.amountPositive', 'Enter an amount greater than zero.'));
            return;
        }
        if (totalSettled > expected + 0.005) {
            toast.error(t('claimDialog.amountExceeds', 'Total settled amount cannot exceed expected claim amount.'));
            return;
        }
        if (numDeduction > 0 && !deductionReason.trim()) {
            toast.error('A reason is required when recording a contractual deduction.');
            return;
        }
        onConfirm({
            receivedAmount: numReceived,
            deductionAmount: numDeduction,
            deductionReason: deductionReason.trim()
        });
    };

    return (
        <Modal title={t('settlement.title', 'Settle Claim & Record Payment')} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-3 text-xs text-cyan-900 dark:border-cyan-900/50 dark:bg-cyan-950/30 dark:text-cyan-200">
                    <p className="font-bold">{claim.claim_number} — {claim.provider_name || 'Insurance Payer'}</p>
                    <p className="mt-1">{t('settlement.description')}</p>
                    <div className="mt-2 flex items-center justify-between border-t border-cyan-200/50 pt-2 font-mono font-bold">
                        <span>{t('settlement.expectedAmount', 'Expected')}: {currency(expected)}</span>
                        <span>{t('table.received')}: {currency(prevReceived)}</span>
                    </div>
                </div>

                <Field label={t('settlement.receivedAmount', 'Received Amount (EGP)')}>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={receivedAmount}
                        onChange={e => setReceivedAmount(e.target.value)}
                        className={inputClass}
                        required
                    />
                </Field>

                <Field label={t('settlement.deductionAmount', 'Contractual Deduction / Disallowance (EGP)')}>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={deductionAmount}
                        onChange={e => setDeductionAmount(e.target.value)}
                        className={inputClass}
                    />
                </Field>

                {numDeduction > 0 && (
                    <Field label={t('settlement.deductionReason', 'Deduction / Disallowance Reason')}>
                        <input
                            type="text"
                            value={deductionReason}
                            onChange={e => setDeductionReason(e.target.value)}
                            placeholder={t('settlement.deductionReasonPlaceholder')}
                            className={inputClass}
                            required
                        />
                    </Field>
                )}

                {/* Real-time Calculation Summary */}
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                        <span>{t('settlement.totalSettled', 'Total Settled')}:</span>
                        <span className="font-mono text-sm font-extrabold text-teal-600 dark:text-teal-400">{currency(totalSettled)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>{t('settlement.remaining', 'Remaining')}:</span>
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{currency(remaining)}</span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                            isFullSettlement
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300'
                        }`}>
                            {isFullSettlement ? t('settlement.settlePaid', 'Full Settlement (Paid)') : t('settlement.settlePartial', 'Partial Settlement')}
                        </span>
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className={secondaryBtn}>
                        {t('claimDialog.cancel', 'Cancel')}
                    </button>
                    <button type="submit" disabled={isLoading} className={primaryBtn}>
                        {isLoading ? 'Processing...' : t('settlement.confirm', 'Confirm Settlement')}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

// Export Claims Filtered by Provider Modal
const ExportClaimsModal = ({ isOpen, onClose, exportParams, setExportParams, onExport, providers, isLoading, t }) => {
    if (!isOpen) return null;
    return (
        <Modal title={t('exportModal.title', 'Export Claims by Provider')} onClose={onClose}>
            <form onSubmit={onExport} className="space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {t('exportModal.description')}
                </p>

                <Field label={t('exportModal.provider')}>
                    <select
                        value={exportParams.providerId}
                        onChange={e => setExportParams(prev => ({ ...prev, providerId: e.target.value }))}
                        className={inputClass}
                    >
                        <option value="all">{t('exportModal.allProviders')}</option>
                        {providers.map(p => (
                            <option key={p.provider_id} value={p.provider_id}>
                                {p.name} {p.payer_code ? `(${p.payer_code})` : ''}
                            </option>
                        ))}
                    </select>
                </Field>

                <Field label={t('exportModal.status')}>
                    <select
                        value={exportParams.status}
                        onChange={e => setExportParams(prev => ({ ...prev, status: e.target.value }))}
                        className={inputClass}
                    >
                        <option value="all">{t('exportModal.allStatuses')}</option>
                        <option value="Submitted">{t('statuses.Submitted')}</option>
                        <option value="Paid">{t('statuses.Paid')}</option>
                        <option value="Partially Paid">{t('statuses.Partially Paid')}</option>
                        <option value="Rejected">{t('statuses.Rejected')}</option>
                        <option value="Approved">{t('statuses.Approved')}</option>
                        <option value="Pending Approval">{t('statuses.Pending')}</option>
                    </select>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                    <Field label={t('exportModal.startDate')}>
                        <input
                            type="date"
                            value={exportParams.startDate}
                            onChange={e => setExportParams(prev => ({ ...prev, startDate: e.target.value }))}
                            className={inputClass}
                        />
                    </Field>
                    <Field label={t('exportModal.endDate')}>
                        <input
                            type="date"
                            value={exportParams.endDate}
                            onChange={e => setExportParams(prev => ({ ...prev, endDate: e.target.value }))}
                            className={inputClass}
                        />
                    </Field>
                </div>

                <Field label={t('exportModal.format')}>
                    <div className="grid grid-cols-2 gap-3 pt-1">
                        <label className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-bold cursor-pointer transition ${
                            exportParams.format === 'csv'
                                ? 'border-emerald-500 bg-emerald-50/80 text-emerald-800 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300 ring-1 ring-emerald-500'
                                : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                        }`}>
                            <input
                                type="radio"
                                name="exportFormat"
                                value="csv"
                                checked={exportParams.format === 'csv'}
                                onChange={() => setExportParams(prev => ({ ...prev, format: 'csv' }))}
                                className="sr-only"
                            />
                            <FileSpreadsheet size={16} className={exportParams.format === 'csv' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'} />
                            <span>Excel / CSV</span>
                        </label>
                        <label className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-bold cursor-pointer transition ${
                            exportParams.format === 'json'
                                ? 'border-cyan-500 bg-cyan-50/80 text-cyan-800 dark:border-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300 ring-1 ring-cyan-500'
                                : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                        }`}>
                            <input
                                type="radio"
                                name="exportFormat"
                                value="json"
                                checked={exportParams.format === 'json'}
                                onChange={() => setExportParams(prev => ({ ...prev, format: 'json' }))}
                                className="sr-only"
                            />
                            <Download size={16} className={exportParams.format === 'json' ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400'} />
                            <span>JSON Data</span>
                        </label>
                    </div>
                </Field>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button type="button" onClick={onClose} className={secondaryBtn}>
                        {t('claimDialog.cancel', 'Cancel')}
                    </button>
                    <button type="submit" disabled={isLoading} className={primaryBtn}>
                        <Download size={16} />
                        <span>{isLoading ? t('actions.exporting', 'Exporting...') : t('exportModal.download')}</span>
                    </button>
                </div>
            </form>
        </Modal>
    );
};

// Generic Modal Container
const Modal = ({ title, onClose, children }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="relative w-full max-w-lg rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0b1426] sm:p-7">
            <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{title}</h3>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                    <X size={18} />
                </button>
            </div>
            {children}
        </div>
    </div>
);

// UI Helper Components

const Panel = ({ id, icon: Icon, title, description, action, children }) => (
    <section id={id} className="min-w-0 scroll-mt-24 rounded-2xl border border-slate-200/70 bg-white/70 shadow-xs backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-900/60 p-4 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-150/60 dark:border-slate-800/60 pb-4">
            <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-900/50">
                    <Icon size={19} />
                </span>
                <div className="min-w-0">
                    <h2 className="truncate text-base font-extrabold text-slate-950 dark:text-white">{title}</h2>
                    {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
                </div>
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
        {children}
    </section>
);

const Field = ({ label, children, className = '' }) => (
    <label className={`block text-xs font-bold text-slate-600 dark:text-slate-300 ${className}`}>
        <span className="mb-1.5 block">{label}</span>
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
        <option value="">{t('fields.selectContract', 'Select Contract (Optional)')}</option>
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

const ClaimActions = ({ claim, t, onStatus, updating, compact = false }) => {
    const status = claim.status || 'Draft';
    const actionClass = 'rounded-lg border px-2.5 py-1.5 text-xs font-bold transition disabled:opacity-50';
    const actions = [];

    if (status === 'Draft') {
        actions.push(
            <button key="approval" type="button" onClick={() => onStatus(claim, 'Pending Approval')} disabled={updating} className={`${actionClass} border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300`}>
                {t('actions.requestApproval', { defaultValue: 'Request approval' })}
            </button>
        );
    }
    if (status === 'Approved') {
        actions.push(
            <button key="submit" type="button" onClick={() => onStatus(claim, 'Submitted')} disabled={updating} className={`${actionClass} border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 dark:border-cyan-900/50 dark:bg-cyan-950/40 dark:text-cyan-300`}>
                {t('actions.submit')}
            </button>
        );
    }
    if (['Submitted', 'Resubmitted', 'Partially Paid'].includes(status)) {
        actions.push(
            <button key="settle" type="button" onClick={() => onStatus(claim, 'Paid')} disabled={updating} className={`${actionClass} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300`}>
                {t('settlement.title', 'Settle / Pay')}
            </button>
        );
        actions.push(
            <button key="reject" type="button" onClick={() => onStatus(claim, 'Rejected')} disabled={updating} className={`${actionClass} border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300`}>
                {t('actions.reject')}
            </button>
        );
    }
    if (status === 'Rejected') {
        actions.push(
            <button key="resubmit" type="button" onClick={() => onStatus(claim, 'Resubmitted')} disabled={updating} className={`${actionClass} border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 dark:border-cyan-900/50 dark:bg-cyan-950/40 dark:text-cyan-300`}>
                {t('actions.resubmit')}
            </button>
        );
    }

    return actions.length ? (
        <div className={`flex flex-wrap items-center gap-1.5 ${compact ? 'justify-start' : 'justify-end'}`}>
            {actions}
        </div>
    ) : null;
};

const ClaimRow = ({ claim, t, currency, onStatus, updating }) => (
    <tr className="transition hover:bg-slate-50/50 dark:hover:bg-slate-850/40">
        <td className="border-b border-slate-150/60 dark:border-slate-800/60 px-4 py-3 font-semibold text-slate-900 dark:text-white">
            <div>
                <p className="font-bold">{claim.claim_number}</p>
                {claim.claim_reference_number && <p className="text-[11px] font-normal text-slate-400">Ref: {claim.claim_reference_number}</p>}
                {claim.mrn && <p className="text-[11px] font-normal text-slate-400">{claim.mrn} · {claim.invoice_number}</p>}
            </div>
        </td>
        <td className="border-b border-slate-150/60 dark:border-slate-800/60 px-4 py-3 text-slate-700 dark:text-slate-300">
            {claim.provider_name || '—'}
        </td>
        <td className="border-b border-slate-150/60 dark:border-slate-800/60 px-4 py-3">
            <StatusBadge status={claim.status} t={t} />
        </td>
        <td className="border-b border-slate-150/60 dark:border-slate-800/60 px-4 py-3 text-end font-mono font-bold text-slate-900 dark:text-white">
            {currency(claim.expected_amount)}
        </td>
        <td className="border-b border-slate-150/60 dark:border-slate-800/60 px-4 py-3 text-end font-mono font-bold text-emerald-600 dark:text-emerald-400">
            {currency(claim.received_amount)}
        </td>
        <td className="border-b border-slate-150/60 dark:border-slate-800/60 px-4 py-3 text-end font-mono font-bold text-violet-600 dark:text-violet-400">
            {claim.deduction_amount > 0 ? (
                <span title={claim.deduction_reason || 'Contractual deduction'}>
                    {currency(claim.deduction_amount)}
                </span>
            ) : (
                <span className="text-slate-400 font-normal">—</span>
            )}
        </td>
        <td className="border-b border-slate-150/60 dark:border-slate-800/60 px-4 py-3 text-end">
            <ClaimActions claim={claim} t={t} onStatus={onStatus} updating={updating} />
        </td>
    </tr>
);

const ClaimCard = ({ claim, t, currency, onStatus, updating }) => (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-2">
            <div>
                <p className="font-bold text-slate-900 dark:text-white">{claim.claim_number}</p>
                <p className="text-xs text-slate-500">{claim.provider_name || '—'}</p>
            </div>
            <StatusBadge status={claim.status} t={t} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-xs dark:border-slate-800 font-mono">
            <div>
                <span className="text-[10px] text-slate-400 block uppercase">Exp</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{currency(claim.expected_amount)}</span>
            </div>
            <div>
                <span className="text-[10px] text-slate-400 block uppercase">Rec</span>
                <span className="font-bold text-emerald-600">{currency(claim.received_amount)}</span>
            </div>
            <div>
                <span className="text-[10px] text-slate-400 block uppercase">Ded</span>
                <span className="font-bold text-violet-600">{currency(claim.deduction_amount || 0)}</span>
            </div>
        </div>
        <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <ClaimActions claim={claim} t={t} onStatus={onStatus} updating={updating} compact />
        </div>
    </div>
);

const RecordList = ({ loading, rows, emptyTitle, emptyDescription, keyFor, render }) => (
    <div className="mt-5 border-t border-slate-150/70 dark:border-slate-800/70 pt-4">
        {loading ? (
            <div className="space-y-2">
                {[0, 1, 2].map(item => <div key={item} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50" />)}
            </div>
        ) : rows.length === 0 ? (
            <EmptyState icon={FileText} title={emptyTitle} description={emptyDescription} compact />
        ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/30">
                {rows.map(row => (
                    <div key={keyFor(row)} className="p-3.5 transition hover:bg-slate-50/50 dark:hover:bg-slate-850/40">
                        {render(row)}
                    </div>
                ))}
            </div>
        )}
    </div>
);

const RecordLine = ({ title, meta, badge, badgeTone = 'slate', action }) => (
    <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-slate-800 dark:text-slate-200">{title || '—'}</p>
            {meta && <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{meta}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
            {badge && (
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    badgeTone === 'emerald' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' :
                    badgeTone === 'amber' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' :
                    badgeTone === 'rose' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' :
                    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}>
                    {badge}
                </span>
            )}
            {action}
        </div>
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
