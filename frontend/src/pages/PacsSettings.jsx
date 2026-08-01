import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    BrainCircuit,
    CheckCircle2,
    ClipboardList,
    Database,
    Edit3,
    Eye,
    Lock,
    Monitor,
    Network,
    Plus,
    PlayCircle,
    RefreshCw,
    RotateCcw,
    Save,
    Server,
    ShieldCheck,
    Trash2,
    XCircle
} from 'lucide-react';
import {
    useCreateMachineMutation,
    useDeleteMachineMutation,
    useGetPacsAiAnalysisQueueQuery,
    useGetMachinesQuery,
    useGetOrthancSystemQuery,
    useGetPacsAuditQuery,
    useGetPacsConfigQuery,
    useGetPacsDiagnosticsQuery,
    useGetPacsRequestsQuery,
    useGetPacsStorageSummaryQuery,
    useGetPacsWorklistPreviewQuery,
    usePingModalityDicomMutation,
    useProcessPacsAiAnalysisQueueMutation,
    useRefreshPacsWorklistMutation,
    useRunPacsTieringMutation,
    useSyncModalityDicomMutation,
    useUpdateMachineMutation,
    useUpdatePacsConfigMutation,
    useRetryPacsAiJobMutation,
    useCancelPacsAiJobMutation,
    useDeletePacsAiJobMutation,
    useRetryAllPacsAiJobsMutation,
    useCancelAllPacsAiJobsMutation
} from '../store/api';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';

const inputClass = 'min-h-10 w-full rounded-none border border-slate-200/70 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700/80 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:border-teal-400';
const panelClass = 'rounded-none border border-slate-200/70 bg-white/85 shadow-sm backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/70';
const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-none border border-slate-200/70 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-teal-300 hover:bg-teal-50/70 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700/80 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:border-teal-800 dark:hover:bg-teal-950/30 dark:hover:text-teal-200';
const primaryButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-none bg-teal-700 px-4 text-sm font-bold text-white shadow-sm shadow-teal-900/10 transition hover:bg-teal-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500';

const DEFAULT_PACS_FORM = {
    pacs_server_aet: '',
    pacs_server_ip: '',
    pacs_server_port: '',
    orthanc_api_url: '',
    orthanc_username: '',
    orthanc_password: ''
};

const IMAGING_TYPES = new Set([
    'mri',
    'ct',
    'x-ray',
    'xray',
    'ultrasound',
    'us',
    'mammography',
    'mammo',
    'pet',
    'pet-ct',
    'spect',
    'fluoroscopy',
    'angiography',
    'angio',
    'dexa',
    'bone densitometry',
    'nuclear medicine',
    'c-arm'
]);

const MACHINE_TYPE_OPTIONS = ['MRI', 'CT', 'X-Ray', 'Ultrasound', 'Mammography', 'Cath Lab', 'Panoramic X-Ray', 'PET-CT', 'Fluoroscopy', 'DEXA'];
const DICOM_ROLE_OPTIONS = [
    { value: 'mwl_client', label: 'MWL / storage client', description: 'Workstation queries worklist and sends studies to PACS.' },
    { value: 'destination', label: 'PACS destination', description: 'PACS must echo, push, or move studies to this device.' },
    { value: 'bidirectional', label: 'Bidirectional', description: 'Use both workstation-to-PACS and PACS-to-device workflows.' }
];

const DEFAULT_MACHINE_FORM = {
    name: '',
    type: 'CT',
    roomNumber: '',
    aet: '',
    ip_address: '',
    port: '104',
    dicom_role: 'mwl_client'
};

const PacsSettings = ({ embedded = false }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const [activeTab, setActiveTab] = useState('connections');
    const [mounted, setMounted] = useState(false);
    const isRtl = i18n.dir() === 'rtl';

    useEffect(() => {
        setMounted(true);
    }, []);

    const reveal = (delay = 0) => ({
        className: `transition-all duration-500 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'} motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none`,
        style: { transitionDelay: `${delay}ms` }
    });

    return (
        <div dir={isRtl ? 'rtl' : 'ltr'} className={embedded ? 'space-y-5 overflow-hidden' : 'mx-auto max-w-[1500px] space-y-5 pb-10'}>
            {!embedded && (
                <div {...reveal(80)}>
                    <PageHeader
                        icon={Monitor}
                        eyebrowIcon={ShieldCheck}
                        eyebrow={t('admin:modules.PACS')}
                        title={t('admin:pacsSettings.title', { defaultValue: 'PACS settings' })}
                        description={t('admin:pacsSettings.subtitle', { defaultValue: 'Manage DICOM endpoints, Orthanc connectivity, and archive health from one focused workspace.' })}
                        meta={<StatusBadge tone="teal">DICOM</StatusBadge>}
                    />
                </div>
            )}

            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between" {...reveal(140)}>
                <div className="grid w-full grid-cols-2 gap-1 rounded-none border border-slate-200/70 bg-white/85 p-1 dark:border-slate-700/80 dark:bg-slate-900/70 sm:grid-cols-3 xl:w-auto xl:grid-cols-6">
                    <TabButton
                        active={activeTab === 'connections'}
                        icon={Network}
                        label={t('admin:pacsSettings.tabs.connections', { defaultValue: 'Connections' })}
                        onClick={() => setActiveTab('connections')}
                    />
                    <TabButton
                        active={activeTab === 'archive'}
                        icon={Activity}
                        label={t('admin:pacsSettings.tabs.archive', { defaultValue: 'System' })}
                        onClick={() => setActiveTab('archive')}
                    />
                    <TabButton
                        active={activeTab === 'operations'}
                        icon={ClipboardList}
                        label={t('admin:pacsSettings.tabs.operations', { defaultValue: 'Audit & requests' })}
                        onClick={() => setActiveTab('operations')}
                    />
                    <TabButton
                        active={activeTab === 'worklist'}
                        icon={Database}
                        label={t('admin:pacsSettings.tabs.worklist', { defaultValue: 'Worklist' })}
                        onClick={() => setActiveTab('worklist')}
                    />
                    <TabButton
                        active={activeTab === 'ai'}
                        icon={BrainCircuit}
                        label={t('admin:pacsSettings.tabs.aiQueue', { defaultValue: 'AI queue' })}
                        onClick={() => setActiveTab('ai')}
                    />
                    <TabButton
                        active={activeTab === 'storage'}
                        icon={Server}
                        label={t('admin:pacsSettings.tabs.storage', { defaultValue: 'Storage' })}
                        onClick={() => setActiveTab('storage')}
                    />
                </div>
                <p className="max-w-2xl text-start text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {t('admin:pacsSettings.operatorNote', { defaultValue: 'Register only destinations that need C-MOVE or direct DICOM push. Worklist queries can remain open through the scheduled workflow.' })}
                </p>
            </div>

            {activeTab === 'connections' ? (
                <ModalityConnections reveal={reveal} />
            ) : activeTab === 'archive' ? (
                <SystemHealthDashboard reveal={reveal} />
            ) : activeTab === 'operations' ? (
                <PacsOperationsPanel reveal={reveal} />
            ) : activeTab === 'worklist' ? (
                <PacsWorklistPanel reveal={reveal} />
            ) : activeTab === 'ai' ? (
                <PacsAiQueuePanel reveal={reveal} />
            ) : (
                <PacsStoragePanel reveal={reveal} />
            )}
        </div>
    );
};

const TabButton = ({ active, icon: Icon, label, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-none px-3 text-xs font-bold transition ${
            active
                ? 'bg-slate-950 text-white shadow-sm dark:bg-teal-500 dark:text-slate-950'
                : 'text-slate-500 hover:bg-slate-100/70 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
        }`}
    >
        <Icon size={15} />
        {label}
    </button>
);

const StatusBadge = ({ tone = 'slate', children }) => {
    const tones = {
        teal: 'bg-teal-50 text-teal-700 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900/50',
        emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/50',
        amber: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/50',
        rose: 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/50',
        cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100 dark:bg-cyan-950/40 dark:text-cyan-300 dark:ring-cyan-900/50',
        slate: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
    };

    return (
        <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-none px-2.5 text-[11px] font-bold ring-1 ${tones[tone] || tones.slate}`}>
            {children}
        </span>
    );
};

const SummaryMetric = ({ icon: Icon, label, value, tone = 'slate' }) => (
    <div className={panelClass}>
        <div className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
                <p className="mt-1 truncate font-mono text-xl font-black text-slate-950 dark:text-white">{value}</p>
            </div>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-none ${toneIconClass(tone)}`}>
                <Icon size={18} />
            </span>
        </div>
    </div>
);

const toneIconClass = (tone) => {
    const tones = {
        teal: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
        emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
        amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
        rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
        slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
    };
    return tones[tone] || tones.slate;
};

const normalizePacsConfig = (config = {}) => ({
    pacs_server_aet: String(config.pacs_server_aet || '').trim(),
    pacs_server_ip: String(config.pacs_server_ip || '').trim(),
    pacs_server_port: String(config.pacs_server_port || '').trim(),
    orthanc_api_url: String(config.orthanc_api_url || '').trim(),
    orthanc_username: String(config.orthanc_username || '').trim(),
    orthanc_password: ''
});

const getDicomRoleOption = (value) => DICOM_ROLE_OPTIONS.find((option) => option.value === value) || DICOM_ROLE_OPTIONS[0];
const getDicomRoleLabel = (t, value) => {
    const option = getDicomRoleOption(value);
    return t(`admin:pacsSettings.roles.${option.value}.label`, { defaultValue: option.label });
};
const getDicomRoleDescription = (t, value) => {
    const option = getDicomRoleOption(value);
    return t(`admin:pacsSettings.roles.${option.value}.description`, { defaultValue: option.description });
};

const buildPacsPayload = (form) => {
    const normalized = normalizePacsConfig(form);
    const payload = {
        pacs_server_aet: normalized.pacs_server_aet,
        pacs_server_ip: normalized.pacs_server_ip,
        pacs_server_port: normalized.pacs_server_port,
        orthanc_api_url: normalized.orthanc_api_url,
        orthanc_username: normalized.orthanc_username
    };

    if (String(form.orthanc_password || '').length > 0) {
        payload.orthanc_password = String(form.orthanc_password);
    }

    return payload;
};

const isValidIpv4 = (value) => {
    const input = String(value || '').trim();
    if (!/^([0-9]{1,3}\.){3}[0-9]{1,3}$/.test(input)) return false;
    return input.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255);
};

const isValidHostname = (value) => {
    const input = String(value || '').trim();
    if (!input || input.length > 253) return false;
    if (input === 'localhost') return true;
    return input
        .split('.')
        .every((label) => /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label));
};

const isValidDicomHost = (value) => isValidIpv4(value) || isValidHostname(value);

const getHostFromUrl = (value) => {
    try {
        return new URL(value).hostname;
    } catch {
        return '';
    }
};

const validatePacsConfig = (form, t) => {
    const errors = {};
    const normalized = normalizePacsConfig(form);
    const port = Number(normalized.pacs_server_port);

    if (!normalized.pacs_server_aet) {
        errors.pacs_server_aet = t('admin:pacsSettings.validation.aetRequired', { defaultValue: 'Server AET is required.' });
    } else if (normalized.pacs_server_aet.length > 50) {
        errors.pacs_server_aet = t('admin:pacsSettings.validation.aetLength', { defaultValue: 'AET must be 50 characters or fewer.' });
    }

    if (!isValidDicomHost(normalized.pacs_server_ip)) {
        errors.pacs_server_ip = t('admin:pacsSettings.validation.host', { defaultValue: 'Enter a valid DICOM host or IPv4 address.' });
    }

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        errors.pacs_server_port = t('admin:pacsSettings.validation.port', { defaultValue: 'Port must be between 1 and 65535.' });
    }

    try {
        const url = new URL(normalized.orthanc_api_url);
        if (!['http:', 'https:'].includes(url.protocol)) {
            errors.orthanc_api_url = t('admin:pacsSettings.validation.urlProtocol', { defaultValue: 'Use an HTTP or HTTPS URL.' });
        }
    } catch {
        errors.orthanc_api_url = t('admin:pacsSettings.validation.url', { defaultValue: 'Enter a valid Orthanc API URL.' });
    }

    return errors;
};

const ModalityConnections = ({ reveal = () => ({}) }) => {
    const { t } = useTranslation(['admin', 'common']);
    const { data: machines = [], isLoading, refetch, isFetching } = useGetMachinesQuery();
    const [createMachine, { isLoading: isCreatingMachine }] = useCreateMachineMutation();
    const [updateMachine, { isLoading: isUpdatingMachine }] = useUpdateMachineMutation();
    const [deleteMachine, { isLoading: isDeletingMachine }] = useDeleteMachineMutation();
    const [syncModality, { isLoading: isSyncing }] = useSyncModalityDicomMutation();
    const [pingModality, { isLoading: isPinging }] = usePingModalityDicomMutation();
    const [editingMachine, setEditingMachine] = useState(null);
    const [machineEditor, setMachineEditor] = useState(null);
    const [editForm, setEditForm] = useState({ aet: '', ip_address: '', port: '', dicom_role: 'mwl_client' });
    const [machineForm, setMachineForm] = useState(DEFAULT_MACHINE_FORM);
    const [pingingId, setPingingId] = useState(null);
    const [echoResults, setEchoResults] = useState({});

    const modalities = useMemo(
        () => machines.filter((machine) => machine.type && IMAGING_TYPES.has(String(machine.type).toLowerCase())),
        [machines]
    );
    const syncedCount = modalities.filter((machine) => machine.dicom_synced).length;
    const pendingCount = Math.max(0, modalities.length - syncedCount);

    const openEdit = (machine) => {
        setEditingMachine(machine);
        setEditForm({
            aet: machine.aet || '',
            ip_address: machine.ip_address || '',
            port: machine.port || '',
            dicom_role: machine.dicom_role || 'mwl_client'
        });
    };

    const openMachineEditor = (machine = null) => {
        setMachineEditor(machine || { isNew: true });
        setMachineForm(machine ? {
            name: machine.name || '',
            type: MACHINE_TYPE_OPTIONS.includes(machine.type) ? machine.type : 'CT',
            roomNumber: machine.room_number || '',
            aet: machine.aet || '',
            ip_address: machine.ip_address || '',
            port: machine.port || '104',
            dicom_role: machine.dicom_role || 'mwl_client'
        } : DEFAULT_MACHINE_FORM);
    };

    const closeMachineEditor = () => {
        setMachineEditor(null);
        setMachineForm(DEFAULT_MACHINE_FORM);
    };

    const handleSaveMachine = async (event) => {
        event.preventDefault();
        const payload = {
            name: machineForm.name.trim(),
            type: machineForm.type,
            roomNumber: machineForm.roomNumber.trim() || undefined
        };
        const dicomPayload = {
            aet: machineForm.aet.trim(),
            ip_address: machineForm.ip_address.trim(),
            port: parseInt(machineForm.port, 10),
            dicom_role: machineForm.dicom_role || 'mwl_client'
        };

        try {
            const saved = machineEditor?.isNew
                ? await createMachine(payload).unwrap()
                : await updateMachine({ id: machineEditor.modality_id, ...payload }).unwrap();

            if (dicomPayload.aet && dicomPayload.ip_address && dicomPayload.port) {
                await syncModality({ id: saved.modality_id, ...dicomPayload }).unwrap();
            }

            toast.success(machineEditor?.isNew
                ? t('admin:pacsSettings.machineCreated', { defaultValue: 'DICOM device created' })
                : t('admin:pacsSettings.machineUpdated', { defaultValue: 'DICOM device updated' }));
            closeMachineEditor();
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.machineSaveError', { defaultValue: 'Failed to save DICOM device' }));
        }
    };

    const handleDeleteMachine = async (machine) => {
        if (!window.confirm(t('admin:pacsSettings.deleteConfirm', { defaultValue: 'Remove this DICOM device from PACS settings?' }))) return;
        try {
            await deleteMachine(machine.modality_id).unwrap();
            toast.success(t('admin:pacsSettings.machineDeleted', { defaultValue: 'DICOM device removed' }));
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.deleteError', { defaultValue: 'Could not remove device. It may be linked to procedures or appointments.' }));
        }
    };

    const handleSave = async (event) => {
        event.preventDefault();
        if (!editingMachine) return;

        try {
            await syncModality({
                id: editingMachine.modality_id,
                aet: editForm.aet.trim(),
                ip_address: editForm.ip_address.trim(),
                port: parseInt(editForm.port, 10),
                dicom_role: editForm.dicom_role || 'mwl_client'
            }).unwrap();
            toast.success(t('admin:pacsSettings.synced', { defaultValue: 'Modality connection synced to PACS' }));
            setEditingMachine(null);
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.syncError', { defaultValue: 'Failed to sync with Orthanc PACS' }));
        }
    };

    const handlePing = async (modalityId) => {
        setPingingId(modalityId);
        try {
            const response = await pingModality(modalityId).unwrap();
            setEchoResults((current) => ({ ...current, [modalityId]: response }));
            if (response.success) toast.success(response.message || t('admin:pacsSettings.echoOk', { defaultValue: 'PACS -> device echo succeeded' }));
            else toast.error(response.message || t('admin:pacsSettings.echoFailed', { defaultValue: 'PACS -> device echo failed' }));
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.pingError', { defaultValue: 'Failed to run PACS -> device C-ECHO' }));
        } finally {
            setPingingId(null);
        }
    };

    return (
        <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3" {...reveal(200)}>
                <SummaryMetric icon={Monitor} label={t('admin:pacsSettings.summary.modalities', { defaultValue: 'Imaging devices' })} value={modalities.length} />
                <SummaryMetric icon={CheckCircle2} label={t('admin:pacsSettings.summary.synced', { defaultValue: 'Synced to PACS' })} value={syncedCount} tone="emerald" />
                <SummaryMetric icon={AlertCircle} label={t('admin:pacsSettings.summary.pending', { defaultValue: 'Needs attention' })} value={pendingCount} tone={pendingCount ? 'amber' : 'teal'} />
            </div>

            <div className={panelClass} {...reveal(260)}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60">
                    <div>
                        <h2 className="text-base font-bold text-slate-950 dark:text-white">
                            {t('admin:pacsSettings.registeredModalities', { defaultValue: 'Registered modalities' })}
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {t('admin:pacsSettings.securityNote', { defaultValue: 'Register AET, IP, and port for modalities that need DICOM push or C-MOVE destinations.' })}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => openMachineEditor()} className={primaryButtonClass}>
                            <Plus size={14} />
                            {t('admin:pacsSettings.addDevice', { defaultValue: 'Add device' })}
                        </button>
                        <button type="button" onClick={() => refetch()} disabled={isFetching} className={buttonClass}>
                            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                            {t('common:actions.refresh', { defaultValue: 'Refresh' })}
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <PageState icon={Activity} spin title={t('admin:pacsSettings.loadingModalities', { defaultValue: 'Loading modalities' })} />
                ) : modalities.length === 0 ? (
                    <PageState icon={Monitor} title={t('admin:pacsSettings.noModalities', { defaultValue: 'No imaging modalities found in the equipment registry.' })} />
                ) : (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800">
                        {modalities.map((machine, index) => {
                            const configured = Boolean(machine.aet && machine.ip_address && machine.port);
                            const echoResult = echoResults[machine.modality_id];
                            const dicomRole = machine.dicom_role || 'mwl_client';
                            const allowsOutboundEcho = dicomRole !== 'mwl_client';
                            return (
                                <div key={machine.modality_id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.4fr)_1fr_auto] lg:items-center" {...reveal(300 + index * 25)}>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{machine.name}</p>
                                            <StatusBadge tone={machine.dicom_synced ? 'emerald' : configured ? 'amber' : 'slate'}>
                                                {machine.dicom_synced
                                                    ? t('admin:pacsSettings.syncedStatus', { defaultValue: 'Synced' })
                                                    : configured
                                                        ? t('admin:pacsSettings.pendingStatus', { defaultValue: 'Pending' })
                                                        : t('admin:pacsSettings.notConfigured', { defaultValue: 'Not configured' })}
                                            </StatusBadge>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {[machine.type, machine.room_number || t('admin:pacsSettings.noRoom', { defaultValue: 'No room' })].filter(Boolean).join(' / ')}
                                        </p>
                                        {echoResult && (
                                            <EchoResultSummary result={echoResult} t={t} />
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                                        <ConnectionField label={t('admin:pacsSettings.table.aet', { defaultValue: 'AET' })} value={machine.aet || '-'} />
                                        <ConnectionField label={t('admin:pacsSettings.hostIp', { defaultValue: 'Host/IP' })} value={machine.ip_address || '-'} />
                                        <ConnectionField label={t('admin:pacsSettings.port', { defaultValue: 'Port' })} value={machine.port || '-'} />
                                        <ConnectionField label={t('admin:pacsSettings.dicomRole', { defaultValue: 'Role' })} value={getDicomRoleLabel(t, dicomRole)} />
                                    </div>

                                    <div className="flex justify-end gap-2">
                                        {machine.dicom_synced && allowsOutboundEcho && (
                                            <button
                                                type="button"
                                                onClick={() => handlePing(machine.modality_id)}
                                                disabled={isPinging}
                                                className={buttonClass}
                                                title={t('admin:pacsSettings.ping', { defaultValue: 'Test PACS -> device DICOM C-ECHO destination' })}
                                            >
                                                <Activity size={14} className={pingingId === machine.modality_id ? 'animate-pulse' : ''} />
                                                {t('admin:pacsSettings.pingBtn', { defaultValue: 'Echo out' })}
                                            </button>
                                        )}
                                        <button type="button" onClick={() => openEdit(machine)} className={buttonClass}>
                                            <Edit3 size={14} />
                                            {t('admin:pacsSettings.dicom', { defaultValue: 'DICOM' })}
                                        </button>
                                        <button type="button" onClick={() => openMachineEditor(machine)} className={buttonClass}>
                                            <Edit3 size={14} />
                                            {t('common:actions.edit', { defaultValue: 'Edit' })}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeleteMachine(machine)}
                                            disabled={isDeletingMachine}
                                            className={`${buttonClass} text-rose-700 hover:text-rose-800 dark:text-rose-300`}
                                        >
                                            <Trash2 size={14} />
                                            {t('common:actions.delete', { defaultValue: 'Delete' })}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <Modal isOpen={Boolean(machineEditor)} onClose={closeMachineEditor} title={machineEditor?.isNew ? t('admin:pacsSettings.addDevice', { defaultValue: 'Add device' }) : t('admin:pacsSettings.editDevice', { defaultValue: 'Edit device' })}>
                <form onSubmit={handleSaveMachine} className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                {t('admin:pacsSettings.deviceName', { defaultValue: 'Device name' })}
                            </span>
                            <input required minLength={2} maxLength={50} value={machineForm.name} onChange={(event) => setMachineForm({ ...machineForm, name: event.target.value })} className={inputClass} placeholder="CT Room 1" />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                {t('admin:pacsSettings.deviceType', { defaultValue: 'Type' })}
                            </span>
                            <select value={machineForm.type} onChange={(event) => setMachineForm({ ...machineForm, type: event.target.value })} className={inputClass}>
                                {MACHINE_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{type}</option>)}
                            </select>
                        </label>
                    </div>

                    <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {t('admin:pacsSettings.room', { defaultValue: 'Room' })}
                        </span>
                        <input maxLength={20} value={machineForm.roomNumber} onChange={(event) => setMachineForm({ ...machineForm, roomNumber: event.target.value })} className={inputClass} placeholder="Room 01" />
                    </label>

                    <div className="rounded-none border border-slate-200/60 bg-slate-50/50 p-3 dark:border-slate-800/60 dark:bg-slate-900/30">
                        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            <Network size={14} />
                            {t('admin:pacsSettings.dicomConnection', { defaultValue: 'DICOM connection' })}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {t('admin:pacsSettings.table.aet', { defaultValue: 'AET' })}
                                </span>
                                <input maxLength={50} value={machineForm.aet} onChange={(event) => setMachineForm({ ...machineForm, aet: event.target.value })} className={inputClass} placeholder="CT_ROOM_1" />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {t('admin:pacsSettings.hostIp', { defaultValue: 'Host/IP' })}
                                </span>
                                <input value={machineForm.ip_address} onChange={(event) => setMachineForm({ ...machineForm, ip_address: event.target.value })} className={inputClass} placeholder="192.168.1.20 or ct-room-1" />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {t('admin:pacsSettings.port', { defaultValue: 'Port' })}
                                </span>
                                <input type="number" min="1" max="65535" value={machineForm.port} onChange={(event) => setMachineForm({ ...machineForm, port: event.target.value })} className={inputClass} placeholder="104" />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {t('admin:pacsSettings.dicomRole', { defaultValue: 'Role' })}
                                </span>
                                <select value={machineForm.dicom_role} onChange={(event) => setMachineForm({ ...machineForm, dicom_role: event.target.value })} className={inputClass}>
                                    {DICOM_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{getDicomRoleLabel(t, option.value)}</option>)}
                                </select>
                            </label>
                        </div>
                        <p className="mt-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                            {getDicomRoleDescription(t, machineForm.dicom_role)}
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                        <button type="button" onClick={closeMachineEditor} className={buttonClass}>
                            {t('common:actions.cancel', { defaultValue: 'Cancel' })}
                        </button>
                        <button type="submit" disabled={isCreatingMachine || isUpdatingMachine || isSyncing} className={primaryButtonClass}>
                            <Save size={16} className={(isCreatingMachine || isUpdatingMachine || isSyncing) ? 'animate-pulse' : ''} />
                            {t('common:actions.save', { defaultValue: 'Save' })}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={Boolean(editingMachine)} onClose={() => setEditingMachine(null)} title={t('admin:pacsSettings.editTitle', { defaultValue: 'Configure DICOM connection' })}>
                <form onSubmit={handleSave} className="space-y-4">
                    <div className="rounded-none border border-slate-200/60 bg-slate-50/30 p-3 dark:border-slate-800/60 dark:bg-slate-900/30">
                        <p className="text-sm font-bold text-slate-950 dark:text-white">{editingMachine?.name}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{editingMachine?.type}</p>
                    </div>

                    <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {t('admin:pacsSettings.table.aet', { defaultValue: 'Application Entity Title' })}
                        </span>
                        <input required maxLength={50} value={editForm.aet} onChange={(event) => setEditForm({ ...editForm, aet: event.target.value })} className={inputClass} placeholder="CT_ROOM_1" />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                {t('admin:pacsSettings.hostIp', { defaultValue: 'Host/IP' })}
                            </span>
                            <input required value={editForm.ip_address} onChange={(event) => setEditForm({ ...editForm, ip_address: event.target.value })} className={inputClass} placeholder="192.168.1.100 or ct-room-1" />
                        </label>
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                {t('admin:pacsSettings.port', { defaultValue: 'Port' })}
                            </span>
                            <input required type="number" min="1" max="65535" value={editForm.port} onChange={(event) => setEditForm({ ...editForm, port: event.target.value })} className={inputClass} placeholder="104" />
                        </label>
                    </div>

                    <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {t('admin:pacsSettings.dicomRole', { defaultValue: 'DICOM role' })}
                        </span>
                        <select value={editForm.dicom_role} onChange={(event) => setEditForm({ ...editForm, dicom_role: event.target.value })} className={inputClass}>
                            {DICOM_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{getDicomRoleLabel(t, option.value)}</option>)}
                        </select>
                        <p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {getDicomRoleDescription(t, editForm.dicom_role)}
                        </p>
                    </label>

                    <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                        <button type="button" onClick={() => setEditingMachine(null)} className={buttonClass}>
                            {t('common:actions.cancel', { defaultValue: 'Cancel' })}
                        </button>
                        <button type="submit" disabled={isSyncing} className={primaryButtonClass}>
                            <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                            {t('admin:pacsSettings.syncBtn', { defaultValue: 'Sync to Orthanc' })}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

const ConnectionField = ({ label, value }) => (
    <div className="rounded-none border border-slate-150/60 bg-slate-50/30 px-3 py-2 dark:border-slate-800/65 dark:bg-slate-900/40">
        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">{label}</p>
        <p className="mt-0.5 truncate font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{value}</p>
    </div>
);

const EchoResultSummary = ({ result, t }) => {
    const ok = Boolean(result?.success);
    const data = result?.data || {};
    return (
        <div className={`mt-3 rounded-none border px-3 py-2 text-xs ${
            ok
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200'
                : 'border-amber-200 bg-amber-50/80 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200'
        }`}>
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-black">
                    {ok
                        ? t('admin:pacsSettings.echoResult.ok', { defaultValue: 'PACS -> device echo OK' })
                        : t('admin:pacsSettings.echoResult.failed', { defaultValue: 'PACS -> device echo failed' })}
                </span>
                {data.endpoint && <span className="font-mono text-[11px] opacity-80">{data.endpoint}</span>}
            </div>
            <p className="mt-1 leading-5 opacity-90">
                {data.guidance || data.mwl_note || t('admin:pacsSettings.echoResult.note', {
                    defaultValue: 'This is a destination test. MWL is checked from the workstation to PACS.'
                })}
            </p>
            {data.mwl_note && (
                <p className="mt-1 leading-5 opacity-80">
                    {data.mwl_note}
                </p>
            )}
        </div>
    );
};

const fieldClass = (error) => `${inputClass} ${error ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/15 dark:border-rose-800 dark:focus:border-rose-500' : ''}`;

const FieldError = ({ message }) => (
    message ? <p className="mt-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">{message}</p> : null
);

const SystemHealthDashboard = ({ reveal = () => ({}) }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const { data: healthData, isLoading: isLoadingHealth, refetch: refetchHealth, isFetching: isFetchingHealth, isError: isHealthError } = useGetOrthancSystemQuery();
    const { data: configData, isLoading: isLoadingConfig, refetch: refetchConfig, isFetching: isFetchingConfig } = useGetPacsConfigQuery();
    const { data: diagnostics, isFetching: isFetchingDiagnostics, refetch: refetchDiagnostics } = useGetPacsDiagnosticsQuery();
    const [updateConfig, { isLoading: isUpdating }] = useUpdatePacsConfigMutation();
    const [form, setForm] = useState(DEFAULT_PACS_FORM);
    const [savedForm, setSavedForm] = useState(DEFAULT_PACS_FORM);
    const [passwordSaved, setPasswordSaved] = useState(false);

    const hasStoredPassword = passwordSaved;

    useEffect(() => {
        if (!configData?.data) return;
        const next = normalizePacsConfig(configData.data);
        setForm(next);
        setSavedForm(next);
        setPasswordSaved(Boolean(configData.data.has_orthanc_password));
    }, [configData]);

    const stats = healthData?.data || {};
    const formatNumber = (value) => new Intl.NumberFormat(i18n.language).format(value || 0);
    const validationErrors = useMemo(() => validatePacsConfig(form, t), [form, t]);
    const normalizedForm = useMemo(() => normalizePacsConfig(form), [form]);
    const dirty = useMemo(
        () => JSON.stringify({ ...normalizedForm, orthanc_password: form.orthanc_password }) !== JSON.stringify({ ...savedForm, orthanc_password: '' }),
        [form.orthanc_password, normalizedForm, savedForm]
    );
    const isFetchingSystem = isFetchingHealth || isFetchingConfig;
    const canSave = dirty && Object.keys(validationErrors).length === 0 && !isUpdating;
    const restHost = useMemo(() => getHostFromUrl(form.orthanc_api_url), [form.orthanc_api_url]);
    const suggestedDicomHost = diagnostics?.network?.suggested_dicom_host || restHost || '127.0.0.1';
    const suggestedDicomPort = String(diagnostics?.network?.configured_dicom_port || form.pacs_server_port || '4242');

    const updateField = (field) => (event) => {
        setForm((current) => ({ ...current, [field]: event.target.value }));
    };

    const handleRefreshSystem = () => {
        refetchHealth();
        refetchConfig();
        refetchDiagnostics();
    };

    const resetForm = () => {
        setForm(savedForm);
    };

    const applyRestHostEndpoint = () => {
        setForm((current) => ({
            ...current,
            pacs_server_ip: suggestedDicomHost,
            pacs_server_port: suggestedDicomPort
        }));
    };

    const handleSaveConfig = async (event) => {
        event.preventDefault();
        if (Object.keys(validationErrors).length > 0) {
            toast.error(t('admin:pacsSettings.validation.fixBeforeSave', { defaultValue: 'Fix the highlighted PACS settings before saving.' }));
            return;
        }

        try {
            const payload = buildPacsPayload(form);
            await updateConfig(payload).unwrap();
            const next = normalizePacsConfig(payload);
            setForm(next);
            setSavedForm(next);
            if (payload.orthanc_password) setPasswordSaved(true);
            toast.success(t('admin:pacsSettings.configSaved', { defaultValue: 'Global PACS configuration updated' }));
            refetchHealth();
            refetchConfig();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.configError', { defaultValue: 'Failed to update configuration' }));
        }
    };

    if (isLoadingHealth || isLoadingConfig) {
        return <PageState icon={Activity} spin title={t('admin:pacsSettings.loadingSystem', { defaultValue: 'Loading PACS system' })} />;
    }

    return (
        <div className="space-y-5">
            {isHealthError && (
                <div className="flex gap-3 rounded-none border border-rose-200 bg-rose-50 p-4 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300" {...reveal(200)}>
                    <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                    <p className="text-sm leading-6">
                        <strong>{t('admin:pacsSettings.unreachableTitle', { defaultValue: 'PACS unreachable' })}:</strong>{' '}
                        {t('admin:pacsSettings.unreachable', { defaultValue: 'RCMS could not reach the Orthanc server. Check the API URL, credentials, and container status.' })}
                    </p>
                </div>
            )}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" {...reveal(240)}>
                <SummaryMetric icon={Server} label={t('admin:pacsSettings.stats.version', { defaultValue: 'Orthanc version' })} value={stats.version || '-'} tone={isHealthError ? 'rose' : 'teal'} />
                <SummaryMetric icon={Network} label={t('admin:pacsSettings.stats.aet', { defaultValue: 'Server AET' })} value={stats.aet || '-'} tone={isHealthError ? 'rose' : 'emerald'} />
                <SummaryMetric icon={Monitor} label={t('admin:pacsSettings.stats.studies', { defaultValue: 'Studies' })} value={formatNumber(stats.countStudies)} />
                <SummaryMetric icon={Database} label={t('admin:pacsSettings.stats.disk', { defaultValue: 'Archive MB' })} value={formatNumber(stats.totalDiskSizeMB)} />
            </div>

            <PacsDiagnosticsPanel
                diagnostics={diagnostics}
                loading={isFetchingDiagnostics}
                onRefresh={refetchDiagnostics}
                reveal={reveal}
                t={t}
            />

            <form onSubmit={handleSaveConfig} className={panelClass} {...reveal(300)}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60">
                    <div>
                        <h2 className="text-base font-bold text-slate-950 dark:text-white">
                            {t('admin:pacsSettings.globalConfigTitle', { defaultValue: 'PACS configuration' })}
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {t('admin:pacsSettings.globalConfigDesc', { defaultValue: 'Settings used for DICOM networking and Orthanc REST API access.' })}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={dirty ? 'amber' : 'emerald'}>
                            {dirty
                                ? t('admin:pacsSettings.unsaved', { defaultValue: 'Unsaved changes' })
                                : t('admin:pacsSettings.saved', { defaultValue: 'Saved' })}
                        </StatusBadge>
                        <StatusBadge tone={hasStoredPassword || form.orthanc_password ? 'emerald' : 'slate'}>
                            {hasStoredPassword || form.orthanc_password
                                ? t('admin:pacsSettings.passwordSet', { defaultValue: 'Password set' })
                                : t('admin:pacsSettings.passwordMissing', { defaultValue: 'No password' })}
                        </StatusBadge>
                        <button type="button" onClick={handleRefreshSystem} disabled={isFetchingSystem} className={buttonClass}>
                            <RefreshCw size={14} className={isFetchingSystem ? 'animate-spin' : ''} />
                        {t('common:actions.refresh', { defaultValue: 'Refresh' })}
                        </button>
                    </div>
                </div>

                <div className="grid gap-6 p-4 lg:grid-cols-2">
                    <section className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                                <Network size={16} className="text-teal-700 dark:text-teal-300" />
                                {t('admin:pacsSettings.dicomProtocol', { defaultValue: 'DICOM protocol' })}
                            </div>
                            <button type="button" onClick={applyRestHostEndpoint} className={buttonClass}>
                                {t('admin:pacsSettings.useRestHost', { defaultValue: 'Use REST host' })}
                            </button>
                        </div>
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                {t('admin:pacsSettings.serverAet', { defaultValue: 'PACS server AET' })}
                            </span>
                            <input required maxLength={50} value={form.pacs_server_aet} onChange={updateField('pacs_server_aet')} className={fieldClass(validationErrors.pacs_server_aet)} placeholder="ORTHANC" autoCapitalize="characters" />
                            <FieldError message={validationErrors.pacs_server_aet} />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {t('admin:pacsSettings.serverHost', { defaultValue: 'Server host/IP' })}
                                </span>
                                <input required value={form.pacs_server_ip} onChange={updateField('pacs_server_ip')} className={fieldClass(validationErrors.pacs_server_ip)} placeholder="127.0.0.1 or orthanc" />
                                <FieldError message={validationErrors.pacs_server_ip} />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {t('admin:pacsSettings.serverPort', { defaultValue: 'DICOM port' })}
                                </span>
                                <input required type="number" min="1" max="65535" value={form.pacs_server_port} onChange={updateField('pacs_server_port')} className={fieldClass(validationErrors.pacs_server_port)} placeholder="4242" />
                                <FieldError message={validationErrors.pacs_server_port} />
                            </label>
                        </div>
                        <div className="rounded-none border border-slate-150/60 bg-slate-50/30 p-3 text-xs leading-5 text-slate-500 dark:border-slate-800/60 dark:text-slate-400">
                            {t('admin:pacsSettings.dicomHint', { defaultValue: 'Use the Orthanc REST host for local/server checks. Use the PACS LAN or VPN address when imaging machines must connect to this DICOM listener.' })}
                        </div>
                    </section>

                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                            <Lock size={16} className="text-emerald-700 dark:text-emerald-300" />
                            {t('admin:pacsSettings.orthancRestApi', { defaultValue: 'Orthanc REST API' })}
                        </div>
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                {t('admin:pacsSettings.apiUrl', { defaultValue: 'Orthanc API URL' })}
                            </span>
                            <input required type="url" value={form.orthanc_api_url} onChange={updateField('orthanc_api_url')} className={fieldClass(validationErrors.orthanc_api_url)} placeholder="http://orthanc:8042" />
                            <FieldError message={validationErrors.orthanc_api_url} />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {t('common:fields.username', { defaultValue: 'Username' })}
                                </span>
                                <input value={form.orthanc_username} onChange={updateField('orthanc_username')} className={inputClass} autoComplete="username" />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {t('common:fields.password', { defaultValue: 'Password' })}
                                </span>
                                <input type="password" value={form.orthanc_password} onChange={updateField('orthanc_password')} className={inputClass} placeholder={hasStoredPassword ? '********' : ''} autoComplete="new-password" />
                                {hasStoredPassword && (
                                    <span className="mt-1.5 block text-[11px] text-slate-500 dark:text-slate-400">
                                        {t('admin:pacsSettings.passwordSetHint', { defaultValue: 'Leave blank to keep the current password.' })}
                                    </span>
                                )}
                            </label>
                        </div>
                        <div className="rounded-none border border-slate-150/60 bg-slate-50/30 p-3 text-xs leading-5 text-slate-500 dark:border-slate-800/60 dark:text-slate-400">
                            {form.orthanc_password
                                ? t('admin:pacsSettings.passwordWillUpdate', { defaultValue: 'A new password will be stored when you save.' })
                                : hasStoredPassword
                                    ? t('admin:pacsSettings.passwordPreserved', { defaultValue: 'The stored Orthanc password will be kept unchanged.' })
                                    : t('admin:pacsSettings.passwordOptional', { defaultValue: 'Add credentials only if Orthanc requires authentication.' })}
                        </div>
                    </section>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/60 p-4 dark:border-slate-800/60">
                    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {t('admin:pacsSettings.saveHint', { defaultValue: 'Saving updates the PACS service configuration and refreshes the Orthanc health check.' })}
                    </p>
                    <div className="flex gap-2">
                        <button type="button" onClick={resetForm} disabled={!dirty || isUpdating} className={buttonClass}>
                            {t('common:actions.reset', { defaultValue: 'Reset' })}
                        </button>
                        <button type="submit" disabled={!canSave} className={primaryButtonClass}>
                        <Save size={16} className={isUpdating ? 'animate-pulse' : ''} />
                        {t('common:actions.save', { defaultValue: 'Save configuration' })}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};

const PacsDiagnosticsPanel = ({ diagnostics, loading, onRefresh, reveal, t }) => {
    const checks = diagnostics?.checks || [];
    const status = diagnostics?.status || 'warning';
    const network = diagnostics?.network;

    return (
        <section className={panelClass} {...reveal(270)}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold text-slate-950 dark:text-white">
                            {t('admin:pacsSettings.diagnostics.title', { defaultValue: 'Server diagnostics' })}
                        </h2>
                        <StatusBadge tone={status === 'ok' ? 'emerald' : status === 'warning' ? 'amber' : 'rose'}>
                            {status.toUpperCase()}
                        </StatusBadge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {t('admin:pacsSettings.diagnostics.help', { defaultValue: 'Run read-only checks for Orthanc API, DICOM listener, DICOMweb, storage, webhook security, and RIS index tables.' })}
                    </p>
                </div>
                <button type="button" onClick={onRefresh} disabled={loading} className={buttonClass}>
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    {t('admin:pacsSettings.diagnostics.run', { defaultValue: 'Run checks' })}
                </button>
            </div>

            {network && (
                <div className="grid gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60 md:grid-cols-3">
                    <ConnectionField
                        label={t('admin:pacsSettings.diagnostics.restEndpoint', { defaultValue: 'Orthanc REST' })}
                        value={network.orthanc_rest_url || '-'}
                    />
                    <ConnectionField
                        label={t('admin:pacsSettings.diagnostics.dicomEndpoint', { defaultValue: 'DICOM listener' })}
                        value={network.configured_dicom_endpoint || '-'}
                    />
                    <div className="rounded-none border border-teal-100 bg-teal-50/60 px-3 py-2 dark:border-teal-900/50 dark:bg-teal-950/25">
                        <p className="text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                            {t('admin:pacsSettings.diagnostics.recommendedEndpoint', { defaultValue: 'Recommended local check' })}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-xs font-bold text-slate-900 dark:text-white">
                            {network.suggested_dicom_endpoint || '-'}
                        </p>
                        <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                            {network.guidance || t('admin:pacsSettings.diagnostics.networkHelp', { defaultValue: 'Use LAN/VPN only when Orthanc DICOM is reachable there.' })}
                        </p>
                    </div>
                </div>
            )}

            {checks.length === 0 ? (
                <PageState icon={Activity} spin={loading} title={loading
                    ? t('admin:pacsSettings.diagnostics.running', { defaultValue: 'Running diagnostics' })
                    : t('admin:pacsSettings.diagnostics.empty', { defaultValue: 'No diagnostics available yet' })}
                />
            ) : (
                <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                    {checks.map((check) => (
                        <DiagnosticCard key={check.key} check={check} />
                    ))}
                </div>
            )}
        </section>
    );
};

const DiagnosticCard = ({ check }) => {
    const iconMap = {
        ok: CheckCircle2,
        warning: AlertTriangle,
        error: AlertCircle
    };
    const Icon = iconMap[check.status] || AlertCircle;
    const tone = check.status === 'ok' ? 'emerald' : check.status === 'warning' ? 'amber' : 'rose';

    return (
        <div className="rounded-none border border-slate-200/60 bg-slate-50/50 p-3 dark:border-slate-800/60 dark:bg-slate-950/25">
            <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-none ${toneIconClass(tone)}`}>
                    <Icon size={17} />
                </span>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{check.label}</p>
                        <StatusBadge tone={tone}>{check.status}</StatusBadge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{check.detail || '-'}</p>
                </div>
            </div>
        </div>
    );
};

const PacsOperationsPanel = ({ reveal = () => ({}) }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const { data: audit = [], isLoading: auditLoading, isFetching: auditFetching, refetch: refetchAudit } = useGetPacsAuditQuery({ limit: 80 });
    const { data: requests = [], isLoading: requestsLoading, isFetching: requestsFetching, refetch: refetchRequests } = useGetPacsRequestsQuery({ limit: 80 });
    const [expandedId, setExpandedId] = useState(null);

    const pendingRequests = requests.filter((item) => item.status === 'Pending').length;
    const failedEvents = audit.filter((item) => String(item.event_type || '').includes('FAILED') || String(item.event_type || '').includes('QUARANTINED')).length;
    const imageViews = audit.filter((item) => item.event_type === 'IMAGE_VIEW').length;
    const loading = auditLoading || requestsLoading;

    const refresh = () => {
        refetchAudit();
        refetchRequests();
    };

    return (
        <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4" {...reveal(200)}>
                <SummaryMetric icon={ClipboardList} label={t('admin:pacsSettings.ops.events', { defaultValue: 'Audit events' })} value={audit.length} tone="teal" />
                <SummaryMetric icon={AlertTriangle} label={t('admin:pacsSettings.ops.attention', { defaultValue: 'Needs attention' })} value={failedEvents} tone={failedEvents ? 'amber' : 'emerald'} />
                <SummaryMetric icon={Eye} label={t('admin:pacsSettings.ops.views', { defaultValue: 'Image views' })} value={imageViews} />
                <SummaryMetric icon={Activity} label={t('admin:pacsSettings.ops.pendingRequests', { defaultValue: 'Pending requests' })} value={pendingRequests} tone={pendingRequests ? 'amber' : 'emerald'} />
            </div>

            <section className={panelClass} {...reveal(260)}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60">
                    <div>
                        <h2 className="text-base font-bold text-slate-950 dark:text-white">
                            {t('admin:pacsSettings.ops.requestStream', { defaultValue: 'PACS request stream' })}
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {t('admin:pacsSettings.ops.requestHelp', { defaultValue: 'Recent machine receives, imports, quarantines, viewer access, and configuration checks.' })}
                        </p>
                    </div>
                    <button type="button" onClick={refresh} disabled={auditFetching || requestsFetching} className={buttonClass}>
                        <RefreshCw size={14} className={(auditFetching || requestsFetching) ? 'animate-spin' : ''} />
                        {t('common:actions.refresh', { defaultValue: 'Refresh' })}
                    </button>
                </div>

                {loading ? (
                    <PageState icon={Activity} spin title={t('admin:pacsSettings.ops.loading', { defaultValue: 'Loading PACS activity' })} />
                ) : requests.length === 0 ? (
                    <PageState icon={ClipboardList} title={t('admin:pacsSettings.ops.empty', { defaultValue: 'No PACS activity recorded yet' })} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                            <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                                <tr>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.ops.time', { defaultValue: 'Time' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.ops.type', { defaultValue: 'Type' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.order', { defaultValue: 'Order' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.ops.source', { defaultValue: 'Source' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.ops.status', { defaultValue: 'Status' })}</th>
                                    <th className="px-4 py-3 text-end font-black">{t('audit.details', { defaultValue: 'Details' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {requests.map((item) => (
                                    <PacsRequestRow
                                        key={`${item.source}-${item.id}`}
                                        item={item}
                                        locale={i18n.language}
                                        expanded={expandedId === `${item.source}-${item.id}`}
                                        onToggle={() => setExpandedId((current) => current === `${item.source}-${item.id}` ? null : `${item.source}-${item.id}`)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};

const AI_QUEUE_STATUSES = ['', 'Queued', 'Running', 'Completed', 'Failed', 'Canceled'];

const PacsAiQueuePanel = ({ reveal = () => ({}) }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const [statusFilter, setStatusFilter] = useState('');
    const { data, isLoading, isFetching, refetch } = useGetPacsAiAnalysisQueueQuery(
        { limit: 100, status: statusFilter },
        {
            pollingInterval: 5000,
            skipPollingIfUnfocused: true,
            refetchOnFocus: true,
            refetchOnReconnect: true
        }
    );
    const [processQueue, { isLoading: isProcessing }] = useProcessPacsAiAnalysisQueueMutation();
    const [retryAll, { isLoading: isRetryingAll }] = useRetryAllPacsAiJobsMutation();
    const [cancelAll, { isLoading: isCancelingAll }] = useCancelAllPacsAiJobsMutation();

    const jobs = data?.jobs || [];
    const totals = data?.totals || {};
    const processor = data?.processor || {};
    const queued = Number(totals.Queued || 0);
    const running = Number(totals.Running || 0);
    const failed = Number(totals.Failed || 0);
    const completed = Number(totals.Completed || 0);

    const handleRetryAll = async () => {
        try {
            if (confirm(t('admin:pacsSettings.aiQueue.retryAllConfirm', { defaultValue: 'Are you sure you want to re-queue all failed and canceled jobs?' }))) {
                const res = await retryAll().unwrap();
                toast.success(t('admin:pacsSettings.aiQueue.retryAllSuccess', { defaultValue: 'Successfully re-queued {{count}} jobs', count: res.count || 0 }));
                refetch();
            }
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.aiQueue.retryAllError', { defaultValue: 'Failed to re-queue jobs' }));
        }
    };

    const handleCancelAll = async () => {
        try {
            if (confirm(t('admin:pacsSettings.aiQueue.cancelAllConfirm', { defaultValue: 'Are you sure you want to stop/cancel all queued and running jobs?' }))) {
                const res = await cancelAll().unwrap();
                toast.success(t('admin:pacsSettings.aiQueue.cancelAllSuccess', { defaultValue: 'Stopped {{count}} active jobs', count: res.count || 0 }));
                refetch();
            }
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.aiQueue.cancelAllError', { defaultValue: 'Failed to stop jobs' }));
        }
    };

    const runQueue = async () => {
        try {
            const result = await processQueue(3).unwrap();
            if (result.skipped && result.reason === 'missing_worker_url') {
                toast(t('admin:pacsSettings.aiQueue.missingWorker', {
                    defaultValue: 'PACS AI is queue-only. Add a worker URL in AI settings before processing jobs.'
                }), { icon: '!' });
            } else if (result.skipped && result.reason === 'disabled') {
                toast(t('admin:pacsSettings.aiQueue.disabled', {
                    defaultValue: 'PACS image AI is disabled. Enable it in AI settings first.'
                }), { icon: '!' });
            } else {
                toast.success(t('admin:pacsSettings.aiQueue.processed', {
                    defaultValue: 'Processed {{processed}} job(s): {{completed}} completed, {{failed}} failed',
                    processed: result.processed || 0,
                    completed: result.completed || 0,
                    failed: result.failed || 0
                }));
            }
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.aiQueue.processError', { defaultValue: 'Failed to process PACS AI queue' }));
        }
    };

    return (
        <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-4" {...reveal(200)}>
                <SummaryMetric icon={BrainCircuit} label={t('admin:pacsSettings.aiQueue.queued', { defaultValue: 'Queued' })} value={queued} tone={queued ? 'amber' : 'emerald'} />
                <SummaryMetric icon={Activity} label={t('admin:pacsSettings.aiQueue.running', { defaultValue: 'Running' })} value={running} tone={running ? 'teal' : 'slate'} />
                <SummaryMetric icon={AlertTriangle} label={t('admin:pacsSettings.aiQueue.failed', { defaultValue: 'Failed' })} value={failed} tone={failed ? 'rose' : 'emerald'} />
                <SummaryMetric icon={CheckCircle2} label={t('admin:pacsSettings.aiQueue.completed', { defaultValue: 'Completed' })} value={completed} tone="emerald" />
            </div>

            <section className={panelClass} {...reveal(260)}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60">
                    <div>
                        <h2 className="text-base font-bold text-slate-950 dark:text-white">
                            {t('admin:pacsSettings.aiQueue.title', { defaultValue: 'PACS AI analysis queue' })}
                        </h2>
                        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {t('admin:pacsSettings.aiQueue.help', { defaultValue: 'Monitor image-analysis jobs created from reports, dispatch queued work to the configured worker, and review failures before radiologist use.' })}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`${inputClass} w-auto min-w-36`}>
                            {AI_QUEUE_STATUSES.map((status) => (
                                <option key={status || 'all'} value={status}>
                                    {status || t('admin:pacsSettings.aiQueue.allStatuses', { defaultValue: 'All statuses' })}
                                </option>
                            ))}
                        </select>
                        <button type="button" onClick={() => refetch()} disabled={isFetching} className={buttonClass}>
                            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                            {t('common:actions.refresh', { defaultValue: 'Refresh' })}
                        </button>
                        {(failed > 0 || totals.Canceled > 0) && (
                            <button type="button" onClick={handleRetryAll} disabled={isRetryingAll} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-none border border-teal-200 bg-white px-3 text-xs font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-50 dark:border-teal-900/60 dark:bg-slate-900 dark:text-teal-400 dark:hover:bg-teal-950/20">
                                <RotateCcw size={13} className={isRetryingAll ? 'animate-spin' : ''} />
                                <span>Retry failed ({failed + (totals.Canceled || 0)})</span>
                            </button>
                        )}
                        {(queued > 0 || running > 0) && (
                            <button type="button" onClick={handleCancelAll} disabled={isCancelingAll} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-none border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/20">
                                <XCircle size={13} className={isCancelingAll ? 'animate-spin' : ''} />
                                <span>Stop queue ({queued + running})</span>
                            </button>
                        )}
                        <button type="button" onClick={runQueue} disabled={isProcessing || (!queued && !running)} className={primaryButtonClass}>
                            <PlayCircle size={14} className={isProcessing ? 'animate-pulse' : ''} />
                            {t('admin:pacsSettings.aiQueue.processNow', { defaultValue: 'Process now' })}
                        </button>
                    </div>
                </div>

                {!isLoading && (
                    <div className={`border-b border-slate-200/60 px-4 py-3 text-xs font-semibold leading-5 dark:border-slate-800/60 ${
                        processor.status === 'ready'
                            ? 'bg-emerald-50/70 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200'
                            : processor.status === 'missing_worker_url'
                                ? 'bg-amber-50/80 text-amber-900 dark:bg-amber-950/25 dark:text-amber-200'
                                : 'bg-rose-50/70 text-rose-800 dark:bg-rose-950/20 dark:text-rose-200'
                    }`}>
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-start gap-2">
                                {processor.status === 'ready' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
                                <span>
                                    {processor.message || 'PACS AI processor state is unknown.'}
                                    {processor.status !== 'ready' && (
                                        <Link to="/settings?tab=ai" className="ms-2 font-black underline underline-offset-2">
                                            Configure AI
                                        </Link>
                                    )}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-2 font-mono text-[11px]">
                                <span>{processor.provider || 'provider:none'}</span>
                                <span>{processor.model || 'model:none'}</span>
                                <span>{processor.workerConfigured ? `worker:${processor.workerUrl}` : 'worker:none'}</span>
                            </div>
                        </div>
                    </div>
                )}

                {isLoading ? (
                    <PageState icon={Activity} spin title={t('admin:pacsSettings.aiQueue.loading', { defaultValue: 'Loading PACS AI queue' })} />
                ) : jobs.length === 0 ? (
                    <PageState icon={BrainCircuit} title={t('admin:pacsSettings.aiQueue.empty', { defaultValue: 'No PACS AI jobs match this filter' })} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                            <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                                <tr>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.order', { defaultValue: 'Order' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.aiQueue.analysis', { defaultValue: 'Analysis' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.modality', { defaultValue: 'Modality' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.ops.status', { defaultValue: 'Status' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.aiQueue.result', { defaultValue: 'Result' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.ops.time', { defaultValue: 'Time' })}</th>
                                    <th className="px-4 py-3 text-end font-black">{t('common:actions.open', { defaultValue: 'Open' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {jobs.map((job) => (
                                    <PacsAiQueueRow key={job.job_id} job={job} locale={i18n.language} processor={processor} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
};

const PacsAiQueueRow = ({ job, locale, processor }) => {
    const { t } = useTranslation(['admin', 'common']);
    const [retryJob, { isLoading: isRetrying }] = useRetryPacsAiJobMutation();
    const [cancelJob, { isLoading: isCanceling }] = useCancelPacsAiJobMutation();
    const [deleteJob, { isLoading: isDeleting }] = useDeletePacsAiJobMutation();

    const handleRetry = async () => {
        try {
            await retryJob(job.job_id).unwrap();
            toast.success(t('admin:pacsSettings.aiQueue.jobRetried', { defaultValue: 'Job re-queued successfully' }));
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.aiQueue.retryError', { defaultValue: 'Failed to retry job' }));
        }
    };

    const handleCancel = async () => {
        try {
            if (confirm(t('admin:pacsSettings.aiQueue.cancelConfirm', { defaultValue: 'Are you sure you want to cancel this analysis job?' }))) {
                await cancelJob(job.job_id).unwrap();
                toast.success(t('admin:pacsSettings.aiQueue.jobCanceled', { defaultValue: 'Job canceled' }));
            }
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.aiQueue.cancelError', { defaultValue: 'Failed to cancel job' }));
        }
    };

    const handleDelete = async () => {
        try {
            if (confirm(t('admin:pacsSettings.aiQueue.deleteConfirm', { defaultValue: 'Are you sure you want to delete this job row?' }))) {
                await deleteJob(job.job_id).unwrap();
                toast.success(t('admin:pacsSettings.aiQueue.jobDeleted', { defaultValue: 'Job deleted' }));
            }
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.aiQueue.deleteError', { defaultValue: 'Failed to delete job' }));
        }
    };

    const statusTone = job.status === 'Completed'
        ? 'emerald'
        : job.status === 'Running'
            ? 'teal'
            : job.status === 'Failed'
                ? 'rose'
                : job.status === 'Queued'
                    ? 'amber'
                    : 'slate';
    const priorityTone = job.priority === 'Emergency' ? 'rose' : job.priority === 'Urgent' ? 'amber' : 'slate';
    const createdAt = job.created_at
        ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(job.created_at))
        : '-';
    const queuedReason = job.status === 'Queued'
        ? processor?.status === 'disabled'
            ? t('admin:pacsSettings.aiQueue.waitingDisabled', { defaultValue: 'Waiting: PACS AI is disabled' })
            : processor?.status === 'missing_worker_url'
                ? t('admin:pacsSettings.aiQueue.waitingWorkerUrl', { defaultValue: 'Waiting: add PACS AI worker URL' })
                : processor?.status === 'ready'
                    ? t('admin:pacsSettings.aiQueue.waitingProcessor', { defaultValue: 'Waiting for background processor' })
                    : t('admin:pacsSettings.aiQueue.waitingStatus', { defaultValue: 'Waiting for processor status' })
        : null;
    const effectiveProvider = job.provider || processor?.provider || 'local-worker';
    const effectiveModel = job.model || processor?.model || 'worker-default';
    const effectiveModelVersion = job.model_version || processor?.modelVersion || '';

    return (
        <tr className="align-top text-slate-700 dark:text-slate-200">
            <td className="px-4 py-3">
                <p className="font-mono text-xs font-bold">{job.order_number || '-'}</p>
                <p className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">{job.mrn || '-'}</p>
            </td>
            <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={priorityTone}>
                        {t(`admin:pacsSettings.aiQueue.priority.${String(job.priority || 'Routine').toLowerCase()}`, { defaultValue: job.priority || 'Routine' })}
                    </StatusBadge>
                    <span className="font-mono text-xs font-bold">{job.analysis_type || '-'}</span>
                </div>
                <p className="mt-1 max-w-64 truncate text-xs text-slate-500 dark:text-slate-400">
                    {[effectiveProvider, effectiveModel, effectiveModelVersion].filter(Boolean).join(' / ')}
                </p>
            </td>
            <td className="px-4 py-3">
                <p className="text-xs font-bold">{job.exam_type_name || '-'}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {job.modality_type || job.modality_name || '-'} / {t('admin:pacsSettings.aiQueue.imageCount', { defaultValue: '{{count}} image(s)', count: job.image_count || 0 })}
                </p>
            </td>
            <td className="px-4 py-3">
                <StatusBadge tone={statusTone}>
                    {t(`admin:pacsSettings.aiQueue.status.${String(job.status || '').toLowerCase()}`, { defaultValue: job.status })}
                </StatusBadge>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {job.radiologist_status || t('admin:pacsSettings.aiQueue.pendingReview', { defaultValue: 'Pending review' })}
                </p>
            </td>
            <td className="px-4 py-3">
                <p className={`max-w-md text-xs leading-5 ${job.error_message ? 'text-rose-700 dark:text-rose-300' : 'text-slate-600 dark:text-slate-300'}`}>
                    {job.error_message || job.result_summary || queuedReason || t('admin:pacsSettings.aiQueue.waitingResult', { defaultValue: 'Waiting for worker result' })}
                </p>
            </td>
            <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                <p>{createdAt}</p>
                {job.completed_at && <p className="mt-1">{t('admin:pacsSettings.aiQueue.done', { defaultValue: 'Done' })}: {formatStorageDate(job.completed_at, locale, true)}</p>}
            </td>
            <td className="px-4 py-3 text-end">
                <div className="flex items-center justify-end gap-1.5">
                    <Link to={`/reports/editor/${job.exam_id}`} className="inline-flex min-h-8 items-center justify-center gap-1 rounded-none border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" title={t('admin:pacsSettings.aiQueue.openEditor', { defaultValue: 'Open in editor' })}>
                        <Eye size={13} />
                        <span className="sr-only sm:not-sr-only sm:ms-1">{t('common:actions.open', { defaultValue: 'Open' })}</span>
                    </Link>
                    {(job.status === 'Queued' || job.status === 'Running') && (
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={isCanceling}
                            className="inline-flex min-h-8 items-center justify-center gap-1 rounded-none border border-rose-200 bg-white px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/20"
                            title={t('admin:pacsSettings.aiQueue.cancelJob', { defaultValue: 'Cancel job' })}
                        >
                            <XCircle size={13} className={isCanceling ? 'animate-spin' : ''} />
                            <span className="sr-only sm:not-sr-only sm:ms-1">{t('common:actions.cancel', { defaultValue: 'Cancel' })}</span>
                        </button>
                    )}
                    {(job.status === 'Failed' || job.status === 'Canceled') && (
                        <button
                            type="button"
                            onClick={handleRetry}
                            disabled={isRetrying}
                            className="inline-flex min-h-8 items-center justify-center gap-1 rounded-none border border-teal-200 bg-white px-2.5 text-xs font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-50 dark:border-teal-900/60 dark:bg-slate-900 dark:text-teal-400 dark:hover:bg-teal-950/20"
                            title={t('admin:pacsSettings.aiQueue.retryJob', { defaultValue: 'Re-queue job' })}
                        >
                            <RotateCcw size={13} className={isRetrying ? 'animate-spin' : ''} />
                            <span className="sr-only sm:not-sr-only sm:ms-1">{t('admin:pacsSettings.aiQueue.retry', { defaultValue: 'Retry' })}</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-none border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-600 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-rose-900 dark:hover:text-rose-400"
                        title={t('admin:pacsSettings.aiQueue.deleteJob', { defaultValue: 'Delete job entry' })}
                    >
                        <Trash2 size={13} className={isDeleting ? 'animate-spin' : ''} />
                    </button>
                </div>
            </td>
        </tr>
    );
};

const PacsWorklistPanel = ({ reveal = () => ({}) }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const today = new Date().toISOString().slice(0, 10);
    const [date, setDate] = useState(today);
    const { data, isLoading, isFetching, refetch } = useGetPacsWorklistPreviewQuery({ date, includeInvalid: true });
    const [refreshWorklist, { isLoading: isRefreshing }] = useRefreshPacsWorklistMutation();
    const items = data?.items || [];

    const regenerate = async () => {
        try {
            const result = await refreshWorklist().unwrap();
            toast.success(t('admin:pacsSettings.worklist.regenerated', {
                defaultValue: `Worklist regenerated: ${result.written || 0} written, ${result.pruned || 0} pruned`,
                written: result.written || 0,
                pruned: result.pruned || 0
            }));
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.worklist.regenerateError', { defaultValue: 'Failed to regenerate modality worklist' }));
        }
    };

    return (
        <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3" {...reveal(200)}>
                <SummaryMetric icon={ClipboardList} label={t('admin:pacsSettings.worklist.total', { defaultValue: 'Scheduled items' })} value={data?.total ?? 0} tone="teal" />
                <SummaryMetric icon={CheckCircle2} label={t('admin:pacsSettings.worklist.valid', { defaultValue: 'Valid for MWL' })} value={data?.valid ?? 0} tone="emerald" />
                <SummaryMetric icon={AlertTriangle} label={t('admin:pacsSettings.worklist.warnings', { defaultValue: 'Warnings' })} value={data?.warnings ?? 0} tone={data?.warnings ? 'amber' : 'emerald'} />
            </div>

            <section className={panelClass} {...reveal(260)}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60">
                    <div>
                        <h2 className="text-base font-bold text-slate-950 dark:text-white">
                            {t('admin:pacsSettings.worklist.title', { defaultValue: 'Modality Worklist preview' })}
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {t('admin:pacsSettings.worklist.help', { defaultValue: 'Preview scheduled orders that Orthanc writes as MWL files for scanners. Accession/order number is required for reliable image matching.' })}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} />
                        <button type="button" onClick={() => refetch()} disabled={isFetching} className={buttonClass}>
                            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                            {t('common:actions.refresh', { defaultValue: 'Refresh' })}
                        </button>
                        <button type="button" onClick={regenerate} disabled={isRefreshing} className={primaryButtonClass}>
                            <Database size={14} className={isRefreshing ? 'animate-pulse' : ''} />
                            {t('admin:pacsSettings.worklist.regenerate', { defaultValue: 'Regenerate MWL' })}
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <PageState icon={Activity} spin title={t('admin:pacsSettings.worklist.loading', { defaultValue: 'Loading worklist preview' })} />
                ) : items.length === 0 ? (
                    <PageState icon={ClipboardList} title={t('admin:pacsSettings.worklist.empty', { defaultValue: 'No scheduled worklist items for this date' })} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                            <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                                <tr>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.order', { defaultValue: 'Order' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.mrn', { defaultValue: 'MRN' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.worklist.procedure', { defaultValue: 'Procedure' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.modality', { defaultValue: 'Modality' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.ops.time', { defaultValue: 'Time' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.ops.status', { defaultValue: 'Status' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {items.map((item) => (
                                    <tr key={item.exam_id} className="align-top text-slate-700 dark:text-slate-200">
                                        <td className="px-4 py-3 font-mono text-xs">{item.order_number || '-'}</td>
                                        <td className="px-4 py-3 font-mono text-xs">{item.mrn || '-'}</td>
                                        <td className="px-4 py-3">
                                            <p className="font-bold">{item.procedure_name || '-'}</p>
                                            <p className="mt-0.5 text-xs text-slate-500">{item.procedure_code || item.body_part || '-'}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="font-mono text-xs font-bold">{item.dicom_modality}</span>
                                            <p className="mt-0.5 text-xs text-slate-500">{item.modality_type || '-'}</p>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-xs">
                                            {item.scheduled_datetime ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.scheduled_datetime)) : '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge tone={item.valid ? 'emerald' : 'amber'}>
                                                {item.valid
                                                    ? t('admin:pacsSettings.worklist.validLabel', { defaultValue: 'Valid' })
                                                    : t('admin:pacsSettings.worklist.warningLabel', { defaultValue: 'Warning' })}
                                            </StatusBadge>
                                            {!item.valid && <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">{item.warnings.join(', ')}</p>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {data?.worklist_dir && (
                    <div className="border-t border-slate-200/60 px-4 py-3 text-xs text-slate-500 dark:border-slate-800/60 dark:text-slate-400">
                        {t('admin:pacsSettings.worklist.directory', { defaultValue: 'Worklist directory' })}: <span className="font-mono">{data.worklist_dir}</span>
                    </div>
                )}
            </section>
        </div>
    );
};

const formatBytes = (bytes = 0) => {
    const value = Number(bytes || 0);
    if (!value) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return `${(value / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatStorageDate = (value, locale, withTime = false) => (
    value
        ? new Intl.DateTimeFormat(locale, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(value))
        : '-'
);

const PacsStoragePanel = ({ reveal = () => ({}) }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const { data, isLoading, isFetching, refetch } = useGetPacsStorageSummaryQuery();
    const [runTiering, { isLoading: isTiering }] = useRunPacsTieringMutation();
    const tiers = data?.tiers || {};
    const index = data?.index || {};
    const orthanc = data?.orthanc || {};
    const tiering = data?.tiering || {};
    const totals = data?.totals || {};
    const totalIndexedBytes = Number(totals.indexed_bytes || 0);
    const indexedInstances = Number(totals.indexed_instances || index.instance_count || 0);
    const eligibleInstances = Number(tiering.eligible_instances || 0);
    const instanceGap = Number(totals.instance_gap || 0);
    const storageTone = data?.status === 'ok' ? 'emerald' : data?.status === 'attention' ? 'amber' : data?.status ? 'rose' : 'slate';
    const canRunTiering = Boolean(tiering.enabled) && eligibleInstances > 0 && !isTiering;

    const tierSweep = async () => {
        const confirmed = window.confirm(t('admin:pacsSettings.storage.confirmTiering', {
            defaultValue: 'Run a tiering sweep for eligible hot instances? This updates RCMS storage bookkeeping; it does not delete Orthanc files unless a deployment archiver is configured.'
        }));
        if (!confirmed) return;

        try {
            const result = await runTiering().unwrap();
            toast.success(t('admin:pacsSettings.storage.tiered', {
                defaultValue: `Tiering complete: ${result.migrated || 0} instance(s) migrated`,
                count: result.migrated || 0
            }));
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.storage.tierError', { defaultValue: 'Failed to run tiering sweep' }));
        }
    };

    return (
        <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" {...reveal(200)}>
                <SummaryMetric icon={ShieldCheck} label={t('admin:pacsSettings.storage.status', { defaultValue: 'Storage status' })} value={(data?.status || 'Loading').toUpperCase()} tone={storageTone} />
                <SummaryMetric icon={Database} label={t('admin:pacsSettings.storage.orthancDisk', { defaultValue: 'Orthanc disk' })} value={orthanc.totalDiskSizeMB != null ? `${orthanc.totalDiskSizeMB} MB` : '-'} tone={data?.orthanc_error ? 'amber' : 'teal'} />
                <SummaryMetric icon={Monitor} label={t('admin:pacsSettings.storage.indexedData', { defaultValue: 'Indexed data' })} value={formatBytes(totalIndexedBytes)} />
                <SummaryMetric icon={AlertTriangle} label={t('admin:pacsSettings.storage.eligibleCold', { defaultValue: 'Eligible for cold' })} value={eligibleInstances} tone={eligibleInstances ? 'amber' : 'emerald'} />
            </div>

            <section className={panelClass} {...reveal(260)}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60">
                    <div>
                        <h2 className="text-base font-bold text-slate-950 dark:text-white">
                            {t('admin:pacsSettings.storage.title', { defaultValue: 'Archive storage' })}
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {t('admin:pacsSettings.storage.help', { defaultValue: 'Manage Orthanc hot storage visibility, RCMS archive index health, and tiering bookkeeping for long-term retention.' })}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => refetch()} disabled={isFetching} className={buttonClass}>
                            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                            {t('common:actions.refresh', { defaultValue: 'Refresh' })}
                        </button>
                        <button type="button" onClick={tierSweep} disabled={!canRunTiering} className={primaryButtonClass}>
                            <Server size={14} className={isTiering ? 'animate-pulse' : ''} />
                            {t('admin:pacsSettings.storage.runTiering', { defaultValue: 'Run eligible sweep' })}
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <PageState icon={Activity} spin title={t('admin:pacsSettings.storage.loading', { defaultValue: 'Loading storage summary' })} />
                ) : (
                    <div className="space-y-4 p-4">
                        <div className="grid gap-3 lg:grid-cols-3">
                            <StorageInfoCard
                                icon={ClipboardList}
                                title={t('admin:pacsSettings.storage.indexHealth', { defaultValue: 'Index health' })}
                                tone={instanceGap === 0 && !index.pending_quarantine ? 'emerald' : 'amber'}
                                rows={[
                                    [t('admin:pacsSettings.storage.risInstances', { defaultValue: 'RIS instances' }), indexedInstances],
                                    [t('admin:pacsSettings.storage.orthancInstances', { defaultValue: 'Orthanc instances' }), totals.orthanc_instances ?? orthanc.instances ?? '-'],
                                    [t('admin:pacsSettings.storage.instanceGap', { defaultValue: 'Index gap' }), instanceGap],
                                    [t('admin:pacsSettings.storage.pendingQuarantine', { defaultValue: 'Pending quarantine' }), index.pending_quarantine ?? 0]
                                ]}
                            />
                            <StorageInfoCard
                                icon={Server}
                                title={t('admin:pacsSettings.storage.retentionPolicy', { defaultValue: 'Retention policy' })}
                                tone={tiering.enabled ? 'teal' : 'amber'}
                                rows={[
                                    [t('admin:pacsSettings.storage.mode', { defaultValue: 'Mode' }), tiering.physical_archiver
                                        ? t('admin:pacsSettings.storage.modeArchiver', { defaultValue: 'Archiver connected' })
                                        : t('admin:pacsSettings.storage.modeBookkeeping', { defaultValue: 'Bookkeeping only' })],
                                    [t('admin:pacsSettings.storage.threshold', { defaultValue: 'Threshold' }), `${tiering.threshold_days ?? '-'} ${t('admin:pacsSettings.storage.days', { defaultValue: 'days' })}`],
                                    [t('admin:pacsSettings.storage.batchSize', { defaultValue: 'Batch size' }), tiering.batch_size ?? '-'],
                                    [t('admin:pacsSettings.storage.coldPrefix', { defaultValue: 'Cold prefix' }), tiering.cold_prefix || '-']
                                ]}
                            />
                            <StorageInfoCard
                                icon={Activity}
                                title={t('admin:pacsSettings.storage.nextSweep', { defaultValue: 'Next sweep' })}
                                tone={eligibleInstances ? 'amber' : 'emerald'}
                                rows={[
                                    [t('admin:pacsSettings.storage.eligible', { defaultValue: 'Eligible instances' }), eligibleInstances],
                                    [t('admin:pacsSettings.storage.eligibleSize', { defaultValue: 'Eligible size' }), formatBytes(tiering.eligible_bytes)],
                                    [t('admin:pacsSettings.storage.oldestEligible', { defaultValue: 'Oldest eligible' }), formatStorageDate(tiering.oldest_eligible_at, i18n.language, true)],
                                    [t('admin:pacsSettings.storage.lastRun', { defaultValue: 'Last sweep' }), formatStorageDate(tiering.last_run_at, i18n.language, true)]
                                ]}
                            />
                        </div>

                        <div className="grid gap-3 lg:grid-cols-3">
                            {['hot', 'warm', 'cold'].map((tier) => (
                                <StorageTierCard
                                    key={tier}
                                    tier={tier}
                                    data={tiers[tier] || {}}
                                    locale={i18n.language}
                                    totalBytes={totalIndexedBytes}
                                    totalInstances={indexedInstances}
                                />
                            ))}
                        </div>

                        {(data?.orthanc_error || !tiering.enabled || instanceGap !== 0) && (
                            <div className="rounded-none border border-amber-200/70 bg-amber-50/70 p-4 text-xs leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-200">
                                {data?.orthanc_error
                                    ? t('admin:pacsSettings.storage.orthancError', {
                                        defaultValue: 'Orthanc statistics are unavailable: {{error}}',
                                        error: data.orthanc_error
                                    })
                                    : !tiering.enabled
                                        ? t('admin:pacsSettings.storage.disabledHelp', { defaultValue: 'Tiering is disabled by PACS_TIERING_ENABLED=false. Manual sweeps are blocked until it is enabled.' })
                                        : t('admin:pacsSettings.storage.gapHelp', { defaultValue: 'Orthanc and RCMS indexed instance counts differ. Review recent imports, webhooks, or reconciliation before archiving aggressively.' })}
                            </div>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
};

const StorageInfoCard = ({ icon: Icon, title, tone = 'slate', rows = [] }) => (
    <div className="rounded-none border border-slate-200/60 bg-slate-50/50 p-4 dark:border-slate-800/60 dark:bg-slate-950/25">
        <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-slate-950 dark:text-white">{title}</p>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-none ${toneIconClass(tone)}`}>
                <Icon size={16} />
            </span>
        </div>
        <div className="mt-4 space-y-2">
            {rows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">{label}</span>
                    <span className="max-w-[58%] truncate text-end font-mono font-bold text-slate-900 dark:text-slate-100">{value}</span>
                </div>
            ))}
        </div>
    </div>
);

const StorageTierCard = ({ tier, data, locale, totalBytes = 0, totalInstances = 0 }) => {
    const { t } = useTranslation(['admin', 'common']);
    const bytes = Number(data.bytes || 0);
    const instances = Number(data.instances || 0);
    const bytePercent = totalBytes > 0 ? Math.round((bytes / totalBytes) * 100) : 0;
    const instancePercent = totalInstances > 0 ? Math.round((instances / totalInstances) * 100) : 0;
    const tone = tier === 'hot' ? 'teal' : tier === 'cold' ? 'cyan' : 'slate';
    const tierLabel = t(`admin:pacsSettings.storage.tiers.${tier}`, { defaultValue: tier });

    return (
    <div className="rounded-none border border-slate-200/60 bg-white/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/40">
        <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black capitalize text-slate-950 dark:text-white">{tierLabel}</p>
                <StatusBadge tone={tone}>{instances} / {instancePercent}%</StatusBadge>
        </div>
            <p className="mt-3 font-mono text-xl font-black text-slate-900 dark:text-slate-100">{formatBytes(bytes)}</p>
            <div className="mt-3 h-2 overflow-hidden rounded-none bg-slate-100 dark:bg-slate-800">
                <div
                    className={`h-full rounded-none ${tier === 'hot' ? 'bg-teal-500' : tier === 'cold' ? 'bg-cyan-500' : 'bg-slate-400'}`}
                    style={{ width: `${Math.max(bytePercent, bytes > 0 ? 3 : 0)}%` }}
                />
            </div>
            <div className="mt-3 grid gap-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                <p>{bytePercent}% {tier === 'cold'
                    ? t('admin:pacsSettings.storage.coldArchiveReference', { defaultValue: 'cold archive reference' })
                    : t('admin:pacsSettings.storage.indexedStorageBytes', { defaultValue: 'indexed storage bytes' })}</p>
                <p>{t('admin:pacsSettings.storage.oldest', { defaultValue: 'Oldest' })}: {formatStorageDate(data.oldest_instance_at, locale)}</p>
                <p>{t('admin:pacsSettings.storage.newest', { defaultValue: 'Newest' })}: {formatStorageDate(data.newest_instance_at, locale)}</p>
            </div>
    </div>
    );
};

const PacsRequestRow = ({ item, locale, expanded, onToggle }) => {
    const { t } = useTranslation(['admin', 'common']);
    const type = item.type || item.event_type || '-';
    const tone =
        item.status === 'Pending' || String(type).includes('FAILED') || String(type).includes('MISMATCH') || String(type).includes('QUARANTINED')
            ? 'amber'
            : String(type).includes('OK') || String(type).includes('RECONCILE') || String(type).includes('IMPORTED')
                ? 'emerald'
                : 'slate';
    const fallbackStatus = item.status || (String(type).includes('FAILED') ? 'Failed' : 'Recorded');
    const statusKey = String(fallbackStatus).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const status = t(`admin:pacsSettings.requests.status.${statusKey}`, { defaultValue: fallbackStatus });

    return (
        <>
            <tr className="align-top text-slate-700 dark:text-slate-200">
                <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {item.created_at ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.created_at)) : '-'}
                </td>
                <td className="px-4 py-3">
                    <span className="font-mono text-xs font-bold">{type}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{item.accession_number || '-'}</td>
                <td className="px-4 py-3 text-xs">{item.remote_ip || item.source || '-'}</td>
                <td className="px-4 py-3"><StatusBadge tone={tone}>{status}</StatusBadge></td>
                <td className="px-4 py-3 text-end">
                    <button type="button" onClick={onToggle} className={buttonClass}>
                        {expanded
                            ? t('admin:pacsSettings.requests.hide', { defaultValue: 'Hide' })
                            : t('admin:pacsSettings.requests.view', { defaultValue: 'View' })}
                    </button>
                </td>
            </tr>
            {expanded && (
                <tr>
                    <td colSpan={6} className="bg-slate-50/70 px-4 py-3 dark:bg-slate-950/40">
                        <pre className="max-h-48 overflow-auto rounded-none bg-slate-950 p-3 text-xs leading-5 text-slate-100">
                            {JSON.stringify(item.detail || {}, null, 2)}
                        </pre>
                    </td>
                </tr>
            )}
        </>
    );
};

const PageState = ({ icon: Icon, title, spin = false }) => (
    <div className="flex min-h-40 flex-col items-center justify-center p-8 text-center text-slate-500 dark:text-slate-400">
        <Icon size={24} className={spin ? 'animate-spin' : ''} />
        <p className="mt-3 text-sm font-bold">{title}</p>
    </div>
);

export default PacsSettings;
