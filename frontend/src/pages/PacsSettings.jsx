import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

import ConfirmDialog from '../components/ui/ConfirmDialog';

import {
    Activity,
    AlertCircle,
    AlertTriangle,
    BrainCircuit,
    Check,
    CheckCircle2,
    ClipboardList,
    Cloud,
    Copy,
    Database,
    Edit3,
    Eye,
    EyeOff,
    FolderSync,
    Globe,
    HardDrive,
    Key,
    Layers,
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

const DEFAULT_CONFIG = {
    pacs_server_aet: '',
    pacs_server_ip: '',
    pacs_server_port: '4242',
    orthanc_api_url: '',
    orthanc_username: '',
    orthanc_password: '',
    is_pacs_enabled: false,
    auto_import_dicom: true,
    pacs_storage_mode: 'local',
    pacs_local_storage_path: '/var/lib/orthanc/db',
    pacs_cloud_provider: 's3',
    pacs_s3_bucket: '',
    pacs_s3_region: 'eu-central-1',
    pacs_s3_endpoint: '',
    pacs_s3_access_key: '',
    pacs_s3_secret_key: '',
    pacs_s3_storage_class: 'STANDARD',
    pacs_azure_container: '',
    pacs_peer_url: '',
    pacs_peer_aet: '',
    pacs_peer_username: '',
    pacs_peer_password: '',
    pacs_auto_sync_enabled: false,
    pacs_tiering_days: '90',
    pacs_cold_prefix: '',
    pacs_external_viewer_url: ''
};

const DEFAULT_MACHINE = {
    name: '',
    type: 'CT',
    roomNumber: '',
    serialNumber: '',
    manufacturer: '',
    model: '',
    location: '',
    status: 'Active',
    aet: '',
    ip_address: '',
    port: '',
    dicom_role: 'mwl_client'
};

const MODALITY_OPTIONS = ['MRI', 'CT', 'X-Ray', 'Ultrasound', 'Mammography', 'Cath Lab', 'Panoramic X-Ray', 'PET-CT', 'Fluoroscopy', 'DEXA'];
const MACHINE_STATUS_OPTIONS = ['Active', 'Out of Service', 'Under Maintenance'];
const DICOM_ROLE_OPTIONS = [
    {
        value: 'mwl_client',
        labelKey: 'admin:pacsSettings.modalities.roles.mwlClient',
        defaultLabel: 'MWL / Storage client',
        helpKey: 'admin:pacsSettings.modalities.roles.mwlClientHelp',
        defaultHelp: 'Scanner queries worklist and sends studies to PACS.'
    },
    {
        value: 'destination',
        labelKey: 'admin:pacsSettings.modalities.roles.destination',
        defaultLabel: 'PACS destination',
        helpKey: 'admin:pacsSettings.modalities.roles.destinationHelp',
        defaultHelp: 'Orthanc can echo, move, or push studies back to this node.'
    },
    {
        value: 'bidirectional',
        labelKey: 'admin:pacsSettings.modalities.roles.bidirectional',
        defaultLabel: 'Bidirectional',
        helpKey: 'admin:pacsSettings.modalities.roles.bidirectionalHelp',
        defaultHelp: 'Use when both workstation and PACS initiate DICOM traffic.'
    }
];

const panelClass = 'settings-section';
const inputClass = 'input-field';
const buttonClass = 'ds-btn-secondary';
const primaryButtonClass = 'ds-btn-primary';

const fieldClass = (error) => `${inputClass} ${error ? '[border-color:var(--VIARA-danger)] focus:[border-color:var(--VIARA-danger)] focus:[box-shadow:0_0_0_3px_rgba(var(--VIARA-danger-rgb),.15)]' : ''}`;

const trimValue = (value) => String(value ?? '').trim();

const getMachineId = (machine = {}) => machine.modality_id || machine.machine_id || machine.id;

const machineStatusTone = (status) => {
    if (status === 'Active') return 'emerald';
    if (status === 'Under Maintenance') return 'amber';
    if (status === 'Out of Service') return 'rose';
    return 'slate';
};

const hasAnyDicomDetails = (source = {}) => Boolean(
    trimValue(source.aet)
    || trimValue(source.ip_address)
    || trimValue(source.port)
);

const hasCompleteDicomDetails = (source = {}) => Boolean(
    trimValue(source.aet)
    && trimValue(source.ip_address)
    && trimValue(source.port)
);

const isArabicLocale = (language = '') => String(language || '').toLowerCase().startsWith('ar');

const localizedDefault = (language, english, arabic) => (isArabicLocale(language) ? arabic : english);

const translateCheckStatus = (status, language) => {
    const normalized = String(status || '').toLowerCase();
    if (!isArabicLocale(language)) return status || '-';
    if (normalized === 'ok') return 'سليم';
    if (normalized === 'warning') return 'تحذير';
    if (normalized === 'error') return 'خطأ';
    return status || '-';
};

const translateDiagnosticLabel = (check = {}, language) => {
    if (!isArabicLocale(language)) return check.label || check.name || '-';
    const labels = {
        server_identity: 'هوية خادم PACS',
        network_mode: 'وضع الشبكة',
        orthanc_api: 'Orthanc REST API',
        aet_alignment: 'مطابقة AET',
        storage: 'تخزين الأرشيف',
        dicomweb: 'DICOMweb QIDO',
        dicom_listener: 'مستمع DICOM',
        orthanc_dicom_endpoint: 'نقطة DICOM الداخلية',
        webhook_secret: 'سر Webhook',
        ris_index: 'فهرس صور RIS'
    };
    return labels[check.key] || check.label || check.name || '-';
};

const translateNetworkError = (detail = '', language = 'en') => {
    const text = String(detail || '').trim();
    if (!text) return '-';
    if (!isArabicLocale(language)) return text;

    const timeout = text.match(/Timed out after\s+(\d+)ms/i);
    if (timeout) return `انتهت مهلة الاتصال بعد ${timeout[1]} مللي ثانية.`;
    const http = text.match(/HTTP\s+(\d+)/i);
    if (http) return `استجاب الخادم برمز HTTP ${http[1]}.`;
    if (/fetch failed/i.test(text)) return 'فشل اتصال الشبكة بالخدمة.';
    if (/connection refused|ECONNREFUSED/i.test(text)) return 'رفضت الخدمة الاتصال. تأكد أنها تعمل وتستمع على المنفذ الصحيح.';
    if (/ENOTFOUND|getaddrinfo/i.test(text)) return 'تعذر العثور على اسم المضيف. تحقق من اسم الخدمة أو إعدادات DNS.';

    return text
        .replace(/Backend could not reach/i, 'تعذر على backend الوصول إلى')
        .replace(/Could not read Orthanc statistics:/i, 'تعذرت قراءة إحصاءات Orthanc:')
        .replace(/If this is local development, set PACS Server IP to/i, 'للتطوير المحلي اضبط عنوان خادم PACS على')
        .replace(/if scanners must connect from LAN, expose Orthanc DICOM on the server LAN IP\/VPN/i, 'وإذا كانت الأجهزة ستتصل عبر الشبكة، اكشف Orthanc DICOM على عنوان LAN/VPN للخادم')
        .replace(/accepts TCP connections from the backend/i, 'تقبل اتصالات TCP من backend')
        .replace(/Backend can reach/i, 'backend يستطيع الوصول إلى');
};

const translateDiagnosticDetail = (check = {}, language) => {
    const detail = check.detail || '';
    if (!isArabicLocale(language)) return detail || '-';
    const meta = check.meta || {};
    switch (check.key) {
        case 'server_identity':
            return meta.aet && meta.host && meta.port
                ? `${meta.aet} على ${meta.host}:${meta.port}`
                : 'بيانات AET أو مضيف LAN أو منفذ DICOM غير مكتملة.';
        case 'network_mode':
            if (!meta.configured_dicom_host) return 'لم يتم ضبط مضيف DICOM بعد.';
            if (detail.includes('REST is configured')) {
                return `REST مضبوط على ${meta.orthanc_rest_host || 'مضيف Orthanc'}، بينما DICOM مضبوط على ${meta.configured_dicom_host}. أبقِ هذا الوضع فقط إذا كان Orthanc DICOM مكشوفًا على عنوان LAN/VPN.`;
            }
            return 'REST وDICOM يبدوان موجّهين إلى نفس المضيف؛ هذا مناسب للتشغيل المحلي أو الخادم الواحد.';
        case 'orthanc_api':
            return check.status === 'ok' ? `Orthanc ${detail.replace(/^Orthanc\s*/i, '') || 'متاح'}` : `تعذر الوصول إلى Orthanc REST: ${translateNetworkError(detail, language)}`;
        case 'aet_alignment':
            return `VIARA مضبوط كـ ${meta.configured_aet || '-'}، بينما Orthanc يعلن ${meta.orthanc_aet || '-'}. يجب أن تستخدم الأجهزة قيمة Orthanc الفعلية.`;
        case 'storage':
            return check.status === 'ok'
                ? `تمت قراءة إحصاءات الأرشيف: ${meta.totalDiskSizeMB ?? 0} MB مفهرسة.`
                : `تعذرت قراءة إحصاءات Orthanc: ${translateNetworkError(detail.replace(/^Could not read Orthanc statistics:\s*/i, ''), language)}`;
        case 'dicomweb':
            return check.status === 'ok'
                ? 'إضافة DICOMweb استجابت لاستعلام دراسة.'
                : `تعذر استعلام DICOMweb: ${translateNetworkError(detail, language)}`;
        case 'dicom_listener':
            return check.status === 'ok'
                ? `النقطة ${meta.host || '-'}:${meta.port || '-'} تقبل اتصالات TCP من backend.`
                : `تعذر الوصول إلى مستمع DICOM على ${meta.host || '-'}:${meta.port || '-'}: ${translateNetworkError(detail, language)}`;
        case 'orthanc_dicom_endpoint':
            return check.status === 'ok'
                ? `backend يستطيع الوصول إلى Orthanc DICOM على ${meta.host || '-'}:${meta.port || '-'}.`
                : `backend لا يستطيع الوصول إلى Orthanc DICOM على ${meta.host || '-'}:${meta.port || '-'}: ${translateNetworkError(detail, language)}`;
        case 'webhook_secret':
            return check.status === 'ok'
                ? 'مصادقة Webhook للأجهزة مفعلة.'
                : 'متغير PACS_WEBHOOK_SECRET غير مضبوط.';
        case 'ris_index':
            return check.status === 'ok'
                ? 'جداول فهرس صور PACS داخل RIS قابلة للوصول.'
                : `تعذر الوصول إلى فهرس صور RIS: ${detail}`;
        default:
            return detail || '-';
    }
};

const slugifyAet = (value) => String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);

const toneIconClass = (tone = 'slate') => {
    switch (tone) {
        case 'emerald':
            return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400';
        case 'amber':
            return 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400';
        case 'rose':
            return 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400';
        case 'teal':
            return 'bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400';
        case 'cyan':
            return 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400';
        default:
            return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
    }
};

const SummaryMetric = ({ icon: Icon, label, value, tone = 'slate' }) => (
    <div className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50/50 p-3.5 dark:border-slate-800/60 dark:bg-slate-950/30">
        <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{value}</p>
        </div>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneIconClass(tone)}`}>
            <Icon size={18} />
        </span>
    </div>
);

const FieldError = ({ message }) => (
    message ? <p className="mt-1 text-xs font-medium text-rose-600 dark:text-rose-400">{message}</p> : null
);

const StatusBadge = ({ tone = 'slate', children }) => {
    const tones = {
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400',
        amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-400',
        rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-400',
        teal: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-400',
        cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-400',
        slate: 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300'
    };
    return (
        <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-xs font-semibold ${tones[tone] || tones.slate}`}>
            {children}
        </span>
    );
};

const formatNumber = (value) => (
    typeof value === 'number' && !Number.isNaN(value)
        ? new Intl.NumberFormat().format(value)
        : value || '0'
);

const PacsDiagnosticsPanel = ({ diagnostics = {}, loading = false, onRefresh = () => {}, reveal = () => ({}), t = (key) => key, language = 'en' }) => {
    const checks = diagnostics.checks || [];
    const okChecks = checks.filter((c) => c.status === 'ok').length;
    const warningChecks = checks.filter((c) => c.status === 'warning').length;
    const errorChecks = checks.filter((c) => c.status === 'error').length;
    const summaryTone = errorChecks > 0 ? 'rose' : warningChecks > 0 ? 'amber' : 'emerald';

    return (
        <section className={panelClass} {...reveal(220)}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60">
                <div>
                    <h2 className="text-base font-bold text-slate-950 dark:text-white">
                        {t('admin:pacsSettings.diagnostics.title', { defaultValue: 'System diagnostics & health' })}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                        {t('admin:pacsSettings.diagnostics.help', { defaultValue: 'Real-time connectivity and configuration checks for DICOM server, REST API, storage, and worker queues.' })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <StatusBadge tone={summaryTone}>
                        {errorChecks > 0
                            ? t('admin:pacsSettings.diagnostics.errorsFound', { defaultValue: localizedDefault(language, '{{count}} issue(s)', '{{count}} مشكلة'), count: errorChecks })
                            : warningChecks > 0
                                ? t('admin:pacsSettings.diagnostics.warningsFound', { defaultValue: localizedDefault(language, '{{count}} warning(s)', '{{count}} تحذير'), count: warningChecks })
                                : t('admin:pacsSettings.diagnostics.allOk', { defaultValue: localizedDefault(language, 'All checks passed', 'كل الفحوصات سليمة') })}
                    </StatusBadge>
                    <button type="button" onClick={onRefresh} disabled={loading} className={buttonClass}>
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        {t('common:actions.refresh', { defaultValue: 'Refresh' })}
                    </button>
                </div>
            </div>

            {loading ? (
                <PageState icon={Activity} spin title={t('admin:pacsSettings.diagnostics.loading', { defaultValue: 'Running system diagnostics...' })} />
            ) : checks.length === 0 ? (
                <PageState icon={ShieldCheck} title={t('admin:pacsSettings.diagnostics.empty', { defaultValue: 'No diagnostic checks available' })} />
            ) : (
                <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                    {checks.map((check, index) => (
                        <DiagnosticCheckCard key={check.id || check.key || check.name || `${check.status || 'check'}-${index}`} check={check} language={language} />
                    ))}
                </div>
            )}
        </section>
    );
};

const DiagnosticCheckCard = ({ check, language }) => {
    const tone = check.status === 'ok' ? 'emerald' : check.status === 'warning' ? 'amber' : 'rose';
    const Icon = check.status === 'ok' ? CheckCircle2 : check.status === 'warning' ? AlertTriangle : AlertCircle;

    return (
        <div className="rounded-xl border border-slate-200/60 bg-slate-50/40 p-3.5 dark:border-slate-800/60 dark:bg-slate-950/20">
            <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${toneIconClass(tone)}`}>
                    <Icon size={15} />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{translateDiagnosticLabel(check, language)}</p>
                        <StatusBadge tone={tone}>{translateCheckStatus(check.status, language)}</StatusBadge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{translateDiagnosticDetail(check, language)}</p>
                </div>
            </div>
        </div>
    );
};

const PacsConfigPanel = ({ reveal = () => ({}) }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const { data: configData = DEFAULT_CONFIG, isLoading: isConfigLoading, refetch: refetchConfig } = useGetPacsConfigQuery();
    const { data: stats = {}, isError: isHealthError, isFetching: isFetchingSystem, refetch: refetchSystem } = useGetOrthancSystemQuery();
    const { data: diagnostics = {}, isFetching: isFetchingDiagnostics, refetch: refetchDiagnostics } = useGetPacsDiagnosticsQuery();
    const [updatePacsConfig, { isLoading: isSaving }] = useUpdatePacsConfigMutation();

    const [form, setForm] = useState(DEFAULT_CONFIG);
    const [validationErrors, setValidationErrors] = useState({});

    useEffect(() => {
        if (configData) {
            setForm({
                pacs_server_aet: configData.pacs_server_aet || '',
                pacs_server_ip: configData.pacs_server_ip || '',
                pacs_server_port: configData.pacs_server_port != null ? String(configData.pacs_server_port) : '4242',
                orthanc_api_url: configData.orthanc_api_url || '',
                orthanc_username: configData.orthanc_username || '',
                orthanc_password: '',
                pacs_external_viewer_url: configData.pacs_external_viewer_url || '',
                is_pacs_enabled: Boolean(configData.is_pacs_enabled),
                auto_import_dicom: configData.auto_import_dicom ?? true
            });
            setValidationErrors({});
        }
    }, [configData]);

    const hasStoredPassword = Boolean(configData?.has_orthanc_password);
    const pacsUnreachable = isHealthError || stats?.status === 'unreachable';
    const language = i18n.resolvedLanguage || i18n.language;
    const copy = (key, english, arabic, values = {}) => t(key, {
        defaultValue: localizedDefault(language, english, arabic),
        ...values
    });

    const dirty = useMemo(() => {
        if (!configData) return false;
        return (
            form.pacs_server_aet !== (configData.pacs_server_aet || '') ||
            form.pacs_server_ip !== (configData.pacs_server_ip || '') ||
            form.pacs_server_port !== (configData.pacs_server_port != null ? String(configData.pacs_server_port) : '4242') ||
            form.orthanc_api_url !== (configData.orthanc_api_url || '') ||
            form.orthanc_username !== (configData.orthanc_username || '') ||
            Boolean(form.orthanc_password) ||
            form.pacs_external_viewer_url !== (configData.pacs_external_viewer_url || '') ||
            form.is_pacs_enabled !== Boolean(configData.is_pacs_enabled) ||
            form.auto_import_dicom !== (configData.auto_import_dicom ?? true)
        );
    }, [form, configData]);

    const updateField = (field) => (event) => {
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        setForm((prev) => ({ ...prev, [field]: value }));
        if (validationErrors[field]) {
            setValidationErrors((prev) => ({ ...prev, [field]: null }));
        }
    };

    const validateForm = () => {
        const errors = {};
        if (form.is_pacs_enabled) {
            if (!form.pacs_server_aet.trim()) errors.pacs_server_aet = copy('admin:pacsSettings.validation.aetRequired', 'AET title is required', 'عنوان AET مطلوب');
            if (!form.pacs_server_ip.trim()) errors.pacs_server_ip = copy('admin:pacsSettings.validation.ipRequired', 'Server host/IP is required', 'مضيف أو عنوان الخادم مطلوب');
            const port = Number(form.pacs_server_port);
            if (!port || port < 1 || port > 65535) errors.pacs_server_port = copy('admin:pacsSettings.validation.portInvalid', 'Valid port (1-65535) required', 'أدخل منفذًا صحيحًا بين 1 و65535');
        }
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSaveConfig = async (event) => {
        event.preventDefault();
        if (!validateForm()) return;

        try {
            const payload = {
                ...form,
                pacs_server_port: Number(form.pacs_server_port) || 4242
            };
            if (!payload.orthanc_password) {
                delete payload.orthanc_password;
            }
            await updatePacsConfig(payload).unwrap();
            toast.success(copy('admin:pacsSettings.configSaved', 'PACS configuration saved successfully', 'تم حفظ إعدادات PACS بنجاح'));
            refetchConfig();
            refetchSystem();
            refetchDiagnostics();
        } catch (error) {
            toast.error(error?.data?.message || copy('admin:pacsSettings.configSaveError', 'Failed to save PACS configuration', 'تعذر حفظ إعدادات PACS'));
        }
    };

    const handleRefreshSystem = () => {
        refetchSystem();
        refetchDiagnostics();
    };

    const applyRestHostEndpoint = () => {
        try {
            if (!form.orthanc_api_url) return;
            const parsed = new URL(form.orthanc_api_url);
            setForm((prev) => ({ ...prev, pacs_server_ip: parsed.hostname }));
        } catch {
            toast.error(copy('admin:pacsSettings.invalidUrl', 'Invalid REST API URL format', 'رابط REST API غير صحيح'));
        }
    };

    if (isConfigLoading) {
        return <PageState icon={Activity} spin title={copy('admin:pacsSettings.loadingConfig', 'Loading PACS configuration...', 'جاري تحميل إعدادات PACS...')} />;
    }

    return (
        <div className="space-y-5">
            {pacsUnreachable && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/90 p-4 text-xs font-semibold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={16} className="shrink-0" />
                        <p>
                            {pacsUnreachable
                                ? copy('admin:pacsSettings.unreachable', 'PACS is currently unreachable. Check Orthanc service, REST URL, credentials, host networking, and firewall rules.', 'لا يمكن الوصول إلى خادم PACS حاليًا. تحقق من خدمة Orthanc ورابط REST وبيانات الدخول والشبكة والجدار الناري.')
                                : copy('admin:pacsSettings.healthWarning', 'Orthanc server health check failing. Check REST URL, credentials, or DICOM service status.', 'فحص صحة Orthanc يفشل. تحقق من رابط REST أو بيانات الدخول أو حالة خدمة DICOM.')}
                        </p>
                    </div>
                </div>
            )}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" {...reveal(240)}>
                <SummaryMetric icon={Server} label={copy('admin:pacsSettings.stats.version', 'Orthanc version', 'إصدار Orthanc')} value={stats.version || '-'} tone={pacsUnreachable ? 'rose' : 'teal'} />
                <SummaryMetric icon={Network} label={copy('admin:pacsSettings.stats.aet', 'Server AET', 'AET الخادم')} value={stats.aet || '-'} tone={pacsUnreachable ? 'rose' : 'emerald'} />
                <SummaryMetric icon={Monitor} label={copy('admin:pacsSettings.stats.studies', 'Studies', 'الدراسات')} value={formatNumber(stats.countStudies)} />
                <SummaryMetric icon={Database} label={copy('admin:pacsSettings.stats.disk', 'Archive MB', 'الأرشيف MB')} value={formatNumber(stats.totalDiskSizeMB)} />
            </div>

            <PacsDiagnosticsPanel
                diagnostics={diagnostics}
                loading={isFetchingDiagnostics}
                onRefresh={refetchDiagnostics}
                reveal={reveal}
                t={t}
                language={language}
            />

            <form onSubmit={handleSaveConfig} className={panelClass} {...reveal(300)}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 p-4 dark:border-slate-800/60">
                    <div>
                        <h2 className="text-base font-bold text-slate-950 dark:text-white">
                            {copy('admin:pacsSettings.globalConfigTitle', 'PACS configuration', 'إعدادات PACS')}
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {copy('admin:pacsSettings.globalConfigDesc', 'Settings used for DICOM networking and Orthanc REST API access.', 'تُستخدم هذه القيم لشبكة DICOM والوصول إلى Orthanc REST API.')}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={dirty ? 'amber' : 'emerald'}>
                            {dirty
                                ? copy('admin:pacsSettings.unsaved', 'Unsaved changes', 'تغييرات غير محفوظة')
                                : copy('admin:pacsSettings.saved', 'Saved', 'محفوظ')}
                        </StatusBadge>
                        <StatusBadge tone={hasStoredPassword || form.orthanc_password ? 'emerald' : 'slate'}>
                            {hasStoredPassword || form.orthanc_password
                                ? copy('admin:pacsSettings.passwordSet', 'Password set', 'كلمة المرور محفوظة')
                                : copy('admin:pacsSettings.passwordMissing', 'No password', 'لا توجد كلمة مرور')}
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
                                {copy('admin:pacsSettings.dicomProtocol', 'DICOM protocol', 'بروتوكول DICOM')}
                            </div>
                            <button type="button" onClick={applyRestHostEndpoint} className={buttonClass}>
                                {copy('admin:pacsSettings.useRestHost', 'Use REST host', 'استخدام مضيف REST')}
                            </button>
                        </div>
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                {copy('admin:pacsSettings.serverAet', 'PACS server AET', 'AET خادم PACS')}
                            </span>
                            <input required maxLength={50} value={form.pacs_server_aet} onChange={updateField('pacs_server_aet')} className={fieldClass(validationErrors.pacs_server_aet)} placeholder="ORTHANC" autoCapitalize="characters" />
                            <FieldError message={validationErrors.pacs_server_aet} />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {copy('admin:pacsSettings.serverHost', 'Server host/IP', 'مضيف/عنوان الخادم')}
                                </span>
                                <input required value={form.pacs_server_ip} onChange={updateField('pacs_server_ip')} className={fieldClass(validationErrors.pacs_server_ip)} placeholder="127.0.0.1 or orthanc" />
                                <FieldError message={validationErrors.pacs_server_ip} />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {copy('admin:pacsSettings.serverPort', 'DICOM port', 'منفذ DICOM')}
                                </span>
                                <input required type="number" min={1} max={65535} value={form.pacs_server_port} onChange={updateField('pacs_server_port')} className={fieldClass(validationErrors.pacs_server_port)} placeholder="4242" />
                                <FieldError message={validationErrors.pacs_server_port} />
                            </label>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                            <Server size={16} className="text-teal-700 dark:text-teal-300" />
                            {copy('admin:pacsSettings.restApiConfig', 'Orthanc REST API', 'Orthanc REST API')}
                        </div>
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                {copy('admin:pacsSettings.apiUrl', 'REST API base URL', 'رابط REST API الأساسي')}
                            </span>
                            <input value={form.orthanc_api_url} onChange={updateField('orthanc_api_url')} className={fieldClass(validationErrors.orthanc_api_url)} placeholder="http://127.0.0.1:8042" />
                            <FieldError message={validationErrors.orthanc_api_url} />
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {copy('admin:pacsSettings.username', 'Username', 'اسم المستخدم')}
                                </span>
                                <input value={form.orthanc_username} onChange={updateField('orthanc_username')} className={inputClass} placeholder="orthanc" />
                            </label>
                            <label className="block">
                                <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    {copy('admin:pacsSettings.password', 'Password', 'كلمة المرور')}
                                </span>
                                <input
                                    type="password"
                                    value={form.orthanc_password}
                                    onChange={updateField('orthanc_password')}
                                    className={inputClass}
                                    placeholder={hasStoredPassword
                                        ? localizedDefault(language, '•••••••• (unchanged)', '•••••••• (بدون تغيير)')
                                        : localizedDefault(language, 'Enter password', 'أدخل كلمة المرور')}
                                />
                            </label>
                        </div>
                    </section>
                </div>

                <div className="grid gap-4 border-t border-slate-200/60 p-4 dark:border-slate-800/60 md:grid-cols-2">
                    <label className="flex items-start gap-3 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 dark:border-slate-800/60 dark:bg-slate-950/20">
                        <input type="checkbox" checked={form.is_pacs_enabled} onChange={updateField('is_pacs_enabled')} className="ds-checkbox mt-0.5" />
                        <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{copy('admin:pacsSettings.enablePacs', 'Enable PACS integration', 'تفعيل تكامل PACS')}</p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{copy('admin:pacsSettings.enablePacsHelp', 'Activates DICOM routing and modality worklist querying.', 'يفعّل توجيه DICOM واستعلام قائمة عمل أجهزة التصوير.')}</p>
                        </div>
                    </label>

                    <label className="flex items-start gap-3 rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 dark:border-slate-800/60 dark:bg-slate-950/20">
                        <input type="checkbox" checked={form.auto_import_dicom} onChange={updateField('auto_import_dicom')} className="ds-checkbox mt-0.5" />
                        <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{copy('admin:pacsSettings.autoImport', 'Auto-import DICOM instances', 'استيراد صور DICOM تلقائيًا')}</p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{copy('admin:pacsSettings.autoImportHelp', 'Automatically index new instances into VIARA studies and reports.', 'يفهرس الصور الجديدة تلقائيًا داخل دراسات وتقارير VIARA.')}</p>
                        </div>
                    </label>
                </div>

                <div className="border-t border-slate-200/60 p-4 dark:border-slate-800/60">
                    <label className="block">
                        <div className="flex items-center gap-2 mb-1.5">
                            <Monitor size={15} className="text-teal-700 dark:text-teal-300" />
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                {copy('admin:pacsSettings.externalViewerUrl', 'Custom External Viewer URL Template (Optional)', 'قالب رابط عارض الصور الخارجي المخصص (اختياري)')}
                            </span>
                        </div>
                        <input
                            value={form.pacs_external_viewer_url || ''}
                            onChange={updateField('pacs_external_viewer_url')}
                            className={inputClass}
                            placeholder="https://viewerhub.example.org/display/auth?viewer=WEASIS&studyUID={studyUid}&archive=viara"
                        />
                        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                            {copy(
                                'admin:pacsSettings.externalViewerUrlHelp',
                                'For Weasis ViewerHub use its authenticated launch endpoint, e.g. /display/auth?viewer=WEASIS&studyUID={studyUid}&archive=viara. Configure its DICOMweb gateway and OIDC separately; never put access tokens in this URL. Supported variables: {studyUid}, {accession}, {patientId}.',
                                'لتكامل Weasis ViewerHub استخدم نقطة التشغيل الموثّقة، مثل /display/auth?viewer=WEASIS&studyUID={studyUid}&archive=viara. اضبط بوابة DICOMweb وOIDC بشكل منفصل؛ لا تضع رموز الوصول في الرابط. المتغيرات المدعومة: {studyUid} و{accession} و{patientId}.'
                            )}
                        </p>
                    </label>
                </div>

                <div className="flex items-center justify-end border-t border-slate-200/60 p-4 dark:border-slate-800/60">
                    <button type="submit" disabled={isSaving || !dirty} className={primaryButtonClass}>
                        <Save size={14} className={isSaving ? 'animate-spin' : ''} />
                        {copy('common:actions.save', 'Save configuration', 'حفظ الإعدادات')}
                    </button>
                </div>
            </form>
        </div>
    );
};

const PacsModalitiesPanel = ({ reveal = () => ({}) }) => {
    const { t } = useTranslation(['admin', 'common']);
    const { data: machines = [], isLoading, isFetching, refetch } = useGetMachinesQuery();
    const [createMachine, { isLoading: isCreating }] = useCreateMachineMutation();
    const [updateMachine, { isLoading: isUpdating }] = useUpdateMachineMutation();
    const [deleteMachine, { isLoading: isDeleting }] = useDeleteMachineMutation();
    const [pingModality, { isLoading: isPinging }] = usePingModalityDicomMutation();
    const [syncModality, { isLoading: isSyncing }] = useSyncModalityDicomMutation();

    const [editingMachine, setEditingMachine] = useState(null);
    const [form, setForm] = useState(DEFAULT_MACHINE);
    const [validationErrors, setValidationErrors] = useState({});
    const [showModal, setShowModal] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);

    const openCreateModal = () => {
        setEditingMachine(null);
        setForm({ ...DEFAULT_MACHINE });
        setValidationErrors({});
        setShowModal(true);
    };

    const openEditModal = (machine) => {
        setEditingMachine(machine);
        setForm({
            name: machine.name || '',
            type: machine.type || 'CT',
            roomNumber: machine.room_number || machine.roomNumber || '',
            serialNumber: machine.serial_number || machine.serialNumber || '',
            manufacturer: machine.manufacturer || '',
            model: machine.model || '',
            location: machine.location || '',
            status: MACHINE_STATUS_OPTIONS.includes(machine.status) ? machine.status : 'Active',
            aet: machine.aet || machine.aet_title || '',
            ip_address: machine.ip_address || '',
            port: machine.port || '',
            dicom_role: machine.dicom_role || 'mwl_client'
        });
        setValidationErrors({});
        setShowModal(true);
    };

    const updateForm = (field) => (event) => {
        setForm((prev) => ({ ...prev, [field]: event.target.value }));
        if (validationErrors[field]) {
            setValidationErrors((prev) => ({ ...prev, [field]: null }));
        }
    };

    const validateForm = () => {
        const errors = {};
        const name = trimValue(form.name);
        if (name.length < 2) {
            errors.name = t('admin:pacsSettings.modalities.validation.name', { defaultValue: 'Name must be at least 2 characters.' });
        }
        if (!MODALITY_OPTIONS.includes(form.type)) {
            errors.type = t('admin:pacsSettings.modalities.validation.type', { defaultValue: 'Select a supported modality type.' });
        }
        if (!MACHINE_STATUS_OPTIONS.includes(form.status)) {
            errors.status = t('admin:pacsSettings.modalities.validation.status', { defaultValue: 'Select a valid machine status.' });
        }
        if (hasAnyDicomDetails(form)) {
            if (!trimValue(form.aet)) {
                errors.aet = t('admin:pacsSettings.modalities.validation.aet', { defaultValue: 'AET is required when DICOM connection details are used.' });
            } else if (trimValue(form.aet).length > 50) {
                errors.aet = t('admin:pacsSettings.modalities.validation.aetLength', { defaultValue: 'AET must be 50 characters or fewer.' });
            }
            if (!trimValue(form.ip_address)) {
                errors.ip_address = t('admin:pacsSettings.modalities.validation.host', { defaultValue: 'Host/IP is required when DICOM connection details are used.' });
            }
            const port = Number(form.port);
            if (!Number.isInteger(port) || port < 1 || port > 65535) {
                errors.port = t('admin:pacsSettings.modalities.validation.port', { defaultValue: 'Port must be a number between 1 and 65535.' });
            }
        }
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const buildMachinePayload = () => ({
        name: trimValue(form.name),
        type: form.type,
        roomNumber: trimValue(form.roomNumber),
        serialNumber: trimValue(form.serialNumber),
        manufacturer: trimValue(form.manufacturer),
        model: trimValue(form.model),
        location: trimValue(form.location),
        status: form.status
    });

    const buildDicomPayload = (id, source = form) => ({
        id,
        aet: trimValue(source.aet),
        ip_address: trimValue(source.ip_address),
        port: Number(source.port),
        dicom_role: source.dicom_role || 'mwl_client'
    });

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!validateForm()) return;
        try {
            const machineData = buildMachinePayload();
            const needsDicomSync = hasCompleteDicomDetails(form);
            let syncFailed = false;
            if (editingMachine) {
                const id = getMachineId(editingMachine);
                await updateMachine({ id, ...machineData }).unwrap();
                if (needsDicomSync) {
                    try {
                        await syncModality(buildDicomPayload(id)).unwrap();
                    } catch (error) {
                        syncFailed = true;
                        toast.error(error?.data?.message || t('admin:pacsSettings.syncError', { defaultValue: 'Connection details saved, but Orthanc sync failed' }));
                    }
                }
                if (!syncFailed) {
                    toast.success(needsDicomSync
                        ? t('admin:pacsSettings.modalityUpdatedSynced', { defaultValue: 'Modality updated and synced successfully' })
                        : t('admin:pacsSettings.modalityUpdated', { defaultValue: 'Modality updated successfully' }));
                }
            } else {
                const created = await createMachine(machineData).unwrap();
                const id = getMachineId(created);
                if (needsDicomSync && id) {
                    try {
                        await syncModality(buildDicomPayload(id)).unwrap();
                    } catch (error) {
                        syncFailed = true;
                        toast.error(error?.data?.message || t('admin:pacsSettings.syncError', { defaultValue: 'Connection details saved, but Orthanc sync failed' }));
                    }
                }
                if (!syncFailed) {
                    toast.success(needsDicomSync
                        ? t('admin:pacsSettings.modalityCreatedSynced', { defaultValue: 'Modality added and synced successfully' })
                        : t('admin:pacsSettings.modalityCreated', { defaultValue: 'Modality added successfully' }));
                }
            }
            setShowModal(false);
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.modalitySaveError', { defaultValue: 'Failed to save modality' }));
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await deleteMachine(deleteTarget).unwrap();
            toast.success(t('admin:pacsSettings.modalityDeleted', { defaultValue: 'Modality removed' }));
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.modalityDeleteError', { defaultValue: 'Failed to remove modality' }));
        } finally {
            setDeleteTarget(null);
        }
    };

    const handlePing = async (machine) => {
        try {
            const res = await pingModality(getMachineId(machine)).unwrap();
            if (res.skipped) {
                toast(res.message || t('admin:pacsSettings.pingSkipped', { defaultValue: 'Outbound echo is not required for this modality role' }), { icon: 'ℹ️' });
            } else if (res.success || res.status === 'ok') {
                toast.success(t('admin:pacsSettings.pingSuccess', { defaultValue: 'Echo successful ({{rtt}}ms)', rtt: res.rtt || 0 }));
            } else {
                toast.error(res.message || t('admin:pacsSettings.pingFailed', { defaultValue: 'DICOM C-ECHO failed' }));
            }
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.pingFailed', { defaultValue: 'DICOM C-ECHO failed' }));
        }
    };

    const handleSync = async (machine) => {
        if (!hasCompleteDicomDetails(machine)) {
            toast.error(t('admin:pacsSettings.modalities.syncNeedsDetails', { defaultValue: 'Add AET, host/IP, and port before syncing this modality.' }));
            openEditModal(machine);
            return;
        }
        try {
            await syncModality(buildDicomPayload(getMachineId(machine), machine)).unwrap();
            toast.success(t('admin:pacsSettings.syncedWithOrthanc', { defaultValue: 'Synced modality with Orthanc' }));
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.syncError', { defaultValue: 'Failed to sync with Orthanc' }));
        }
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3" {...reveal(200)}>
                <div>
                    <h2 className="text-lg font-bold text-slate-950 dark:text-white">
                        {t('admin:pacsSettings.modalitiesTitle', { defaultValue: 'DICOM Modalities & Machines' })}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t('admin:pacsSettings.modalitiesDesc', { defaultValue: 'Configure scanner AE titles and remote DICOM nodes for PACS routing.' })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => refetch()} disabled={isFetching} className={buttonClass}>
                        <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                        {t('common:actions.refresh', { defaultValue: 'Refresh' })}
                    </button>
                    <button type="button" onClick={openCreateModal} className={primaryButtonClass}>
                        <Plus size={14} />
                        {t('admin:pacsSettings.addModality', { defaultValue: 'Add modality' })}
                    </button>
                </div>
            </div>

            <section className={panelClass} {...reveal(260)}>
                {isLoading ? (
                    <PageState icon={Activity} spin title={t('admin:pacsSettings.loadingModalities', { defaultValue: 'Loading DICOM modalities...' })} />
                ) : machines.length === 0 ? (
                    <PageState icon={Network} title={t('admin:pacsSettings.noModalities', { defaultValue: 'No DICOM modalities registered yet' })} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                            <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                                <tr>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.aet', { defaultValue: 'AET Title' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.name', { defaultValue: 'Name' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.modality', { defaultValue: 'Modality' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.endpoint', { defaultValue: 'Host:Port' })}</th>
                                    <th className="px-4 py-3 text-start font-black">{t('admin:pacsSettings.table.status', { defaultValue: 'Status' })}</th>
                                    <th className="px-4 py-3 text-end font-black">{t('common:actions.actions', { defaultValue: 'Actions' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {machines.map((machine) => {
                                    const id = getMachineId(machine);
                                    const endpoint = hasCompleteDicomDetails(machine) ? `${machine.ip_address}:${machine.port}` : '—';
                                    return (
                                    <tr key={id} className="align-top text-slate-700 dark:text-slate-200">
                                        <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900 dark:text-white">
                                            {machine.aet || '—'}
                                            {machine.dicom_synced && (
                                                <span className="ms-2 inline-flex align-middle text-emerald-600 dark:text-emerald-400" title={t('admin:pacsSettings.modalities.synced', { defaultValue: 'Synced with PACS' })}>
                                                    <CheckCircle2 size={13} />
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-bold">{machine.name}</td>
                                        <td className="px-4 py-3">
                                            <StatusBadge tone="teal">{machine.type}</StatusBadge>
                                            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                                {(() => {
                                                    const role = DICOM_ROLE_OPTIONS.find((option) => option.value === machine.dicom_role);
                                                    return role ? t(role.labelKey, { defaultValue: role.defaultLabel }) : (machine.dicom_role || '—');
                                                })()}
                                            </p>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs">
                                            {endpoint}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadge tone={machineStatusTone(machine.status)}>
                                                {t(`admin:pacsSettings.modalities.statuses.${String(machine.status || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, { defaultValue: machine.status || '-' })}
                                            </StatusBadge>
                                        </td>
                                        <td className="px-4 py-3 text-end">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button type="button" onClick={() => handlePing(machine)} disabled={isPinging || !machine.dicom_synced} className={buttonClass} title={t('admin:pacsSettings.modalities.echoTitle', { defaultValue: 'Ping DICOM C-ECHO' })}>
                                                    <Activity size={13} />
                                                    <span className="sr-only sm:not-sr-only sm:ms-1">{t('admin:pacsSettings.modalities.echo', { defaultValue: 'Echo' })}</span>
                                                </button>
                                                <button type="button" onClick={() => handleSync(machine)} disabled={isSyncing} className={buttonClass} title={t('admin:pacsSettings.modalities.syncTitle', { defaultValue: 'Sync with Orthanc' })}>
                                                    <RefreshCw size={13} />
                                                    <span className="sr-only sm:not-sr-only sm:ms-1">{t('admin:pacsSettings.modalities.sync', { defaultValue: 'Sync' })}</span>
                                                </button>
                                                <button type="button" onClick={() => openEditModal(machine)} className={buttonClass} title={t('admin:pacsSettings.modalities.editTitle', { defaultValue: 'Edit modality' })}>
                                                    <Edit3 size={13} />
                                                </button>
                                                <button type="button" onClick={() => setDeleteTarget(id)} disabled={isDeleting} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-600 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-rose-900 dark:hover:text-rose-400" title={t('admin:pacsSettings.modalities.deleteTitle', { defaultValue: 'Delete modality' })}>
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
                    <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between border-b border-slate-200/60 pb-4 dark:border-slate-800/60">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                    {editingMachine ? t('admin:pacsSettings.editModality', { defaultValue: 'Edit DICOM modality' }) : t('admin:pacsSettings.addModality', { defaultValue: 'Add DICOM modality' })}
                                </h3>
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    {editingMachine ? t('admin:pacsSettings.modalities.editHelp', { defaultValue: 'Update modality details and DICOM connection.' }) : t('admin:pacsSettings.modalities.addHelp', { defaultValue: 'Register a new imaging modality or PACS destination.' })}
                                </p>
                            </div>
                            <button type="button" onClick={() => setShowModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200">
                                <XCircle size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">{t('admin:pacsSettings.modalities.name', { defaultValue: 'Display Name' })}</span>
                                    <input required maxLength={50} value={form.name} onChange={updateForm('name')} className={fieldClass(validationErrors.name)} placeholder="CT Room 1" />
                                    <FieldError message={validationErrors.name} />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">{t('admin:pacsSettings.modalities.type', { defaultValue: 'Modality Type' })}</span>
                                    <select required value={form.type} onChange={updateForm('type')} className={fieldClass(validationErrors.type)}>
                                        {MODALITY_OPTIONS.map((opt) => (
                                            <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                    <FieldError message={validationErrors.type} />
                                </label>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">{t('admin:pacsSettings.modalities.location', { defaultValue: 'Location' })}</span>
                                    <input value={form.location} onChange={updateForm('location')} className={inputClass} placeholder="Building A, Room 102" />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">{t('admin:pacsSettings.modalities.manufacturer', { defaultValue: 'Manufacturer' })}</span>
                                    <input value={form.manufacturer} onChange={updateForm('manufacturer')} className={inputClass} placeholder="Siemens Healthineers" />
                                </label>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-3">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">{t('admin:pacsSettings.modalities.roomNumber', { defaultValue: 'Room' })}</span>
                                    <input value={form.roomNumber} onChange={updateForm('roomNumber')} className={inputClass} placeholder="102" />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">{t('admin:pacsSettings.modalities.model', { defaultValue: 'Model' })}</span>
                                    <input value={form.model} onChange={updateForm('model')} className={inputClass} placeholder="SOMATOM" />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">{t('admin:pacsSettings.modalities.serialNumber', { defaultValue: 'Serial number' })}</span>
                                    <input value={form.serialNumber} onChange={updateForm('serialNumber')} className={inputClass} placeholder="SN-001" />
                                </label>
                            </div>

                            <label className="block">
                                <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">{t('admin:pacsSettings.modalities.status', { defaultValue: 'Status' })}</span>
                                <select required value={form.status} onChange={updateForm('status')} className={fieldClass(validationErrors.status)}>
                                    {MACHINE_STATUS_OPTIONS.map((status) => (
                                        <option key={status} value={status}>
                                            {t(`admin:pacsSettings.modalities.statuses.${status.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, { defaultValue: status })}
                                        </option>
                                    ))}
                                </select>
                                <FieldError message={validationErrors.status} />
                            </label>

                            <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4 dark:border-slate-800/70 dark:bg-slate-950/25">
                                <div className="mb-3 flex items-center justify-between">
                                    <div className="flex items-start gap-2">
                                        <Network size={16} className="mt-0.5 text-[var(--VIARA-accent)]" />
                                        <div>
                                            <p className="text-xs font-black text-slate-900 dark:text-white">
                                                {t('admin:pacsSettings.modalities.dicomConnection', { defaultValue: 'DICOM connection details' })}
                                            </p>
                                            <p className="mt-0.5 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                                                {t('admin:pacsSettings.modalities.dicomConnectionHelp', { defaultValue: 'Optional for inventory, required for Orthanc sync and echo tests.' })}
                                            </p>
                                        </div>
                                    </div>
                                    {hasCompleteDicomDetails(form) && (
                                        <button
                                            type="button"
                                            onClick={() => handlePing({ ...form, modality_id: editingMachine ? getMachineId(editingMachine) : 'new' })}
                                            disabled={isPinging}
                                            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--VIARA-accent)]/30 bg-[var(--VIARA-accent-soft)] px-2.5 text-[11px] font-bold text-[var(--VIARA-accent)] hover:border-[var(--VIARA-accent)]/50 disabled:opacity-50"
                                        >
                                            <Activity size={12} className={isPinging ? 'animate-pulse' : ''} />
                                            {t('admin:pacsSettings.modalities.testConnection', { defaultValue: 'Test' })}
                                        </button>
                                    )}
                                </div>
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <label className="block sm:col-span-2">
                                        <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">{t('admin:pacsSettings.modalities.aet', { defaultValue: 'AET title' })}</span>
                                        <div className="flex gap-2">
                                            <input maxLength={50} value={form.aet} onChange={updateForm('aet')} className={`${fieldClass(validationErrors.aet)} flex-1`} placeholder="CT_ROOM_1" autoCapitalize="characters" />
                                            <button
                                                type="button"
                                                onClick={() => setForm((prev) => ({ ...prev, aet: slugifyAet(prev.name || prev.aet) }))}
                                                disabled={!form.name}
                                                className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                                title={t('admin:pacsSettings.modalities.generateAet', { defaultValue: 'Generate from name' })}
                                            >
                                                <RefreshCw size={12} />
                                                <span className="hidden sm:inline">{t('admin:pacsSettings.modalities.generate', { defaultValue: 'Auto' })}</span>
                                            </button>
                                        </div>
                                        <FieldError message={validationErrors.aet} />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">{t('admin:pacsSettings.modalities.host', { defaultValue: 'Host / IP' })}</span>
                                        <input value={form.ip_address} onChange={updateForm('ip_address')} className={fieldClass(validationErrors.ip_address)} placeholder="192.168.1.20" />
                                        <FieldError message={validationErrors.ip_address} />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">{t('admin:pacsSettings.modalities.port', { defaultValue: 'Port' })}</span>
                                        <input type="number" min="1" max="65535" value={form.port} onChange={updateForm('port')} className={fieldClass(validationErrors.port)} placeholder="104" />
                                        <FieldError message={validationErrors.port} />
                                    </label>
                                </div>
                                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                    {DICOM_ROLE_OPTIONS.map((role) => {
                                        const active = form.dicom_role === role.value;
                                        return (
                                            <label
                                                key={role.value}
                                                className={`cursor-pointer rounded-xl border p-3 transition ${
                                                    active
                                                        ? 'border-[var(--VIARA-accent)] bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent-strong)]'
                                                        : 'border-slate-200 bg-white text-slate-600 hover:border-[var(--VIARA-accent)]/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                                                }`}
                                            >
                                                <input type="radio" name="dicom_role" value={role.value} checked={active} onChange={updateForm('dicom_role')} className="sr-only" />
                                                <span className="block text-xs font-black">{t(role.labelKey, { defaultValue: role.defaultLabel })}</span>
                                                <span className="mt-1 block text-[11px] leading-4 opacity-80">{t(role.helpKey, { defaultValue: role.defaultHelp })}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex items-center justify-between border-t border-slate-200/60 pt-4 dark:border-slate-800/60">
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                    {hasCompleteDicomDetails(form) ? (
                                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                            <CheckCircle2 size={12} />
                                            {t('admin:pacsSettings.modalities.dicomReady', { defaultValue: 'DICOM connection details' })}
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1">
                                            <AlertCircle size={12} />
                                            {t('admin:pacsSettings.modalities.dicomOptional', { defaultValue: 'DICOM details optional for inventory only' })}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => setShowModal(false)} className={buttonClass}>
                                        {t('common:actions.cancel', { defaultValue: 'Cancel' })}
                                    </button>
                                    <button type="submit" disabled={isCreating || isUpdating} className={primaryButtonClass}>
                                        <Save size={14} className={(isCreating || isUpdating) ? 'animate-spin' : ''} />
                                        {t('common:actions.save', { defaultValue: 'Save' })}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={Boolean(deleteTarget)}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                title={t('admin:pacsSettings.modalities.deleteModality', { defaultValue: 'Delete modality' })}
                message={t('admin:pacsSettings.modalities.confirmDelete', { defaultValue: 'Are you sure you want to remove this DICOM modality?' })}
                confirmText={t('common:actions.delete', { defaultValue: 'Delete' })}
                variant="danger"
                isLoading={isDeleting}
            />
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
    const [confirmRetryAll, setConfirmRetryAll] = useState(false);
    const [confirmCancelAll, setConfirmCancelAll] = useState(false);

    const jobs = data?.jobs || [];
    const totals = data?.totals || {};
    const processor = data?.processor || {};
    const queued = Number(totals.Queued || 0);
    const running = Number(totals.Running || 0);
    const failed = Number(totals.Failed || 0);
    const completed = Number(totals.Completed || 0);

    const handleRetryAll = async () => {
        try {
            const res = await retryAll().unwrap();
            toast.success(t('admin:pacsSettings.aiQueue.retryAllSuccess', { defaultValue: 'Successfully re-queued {{count}} jobs', count: res.count || 0 }));
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.aiQueue.retryAllError', { defaultValue: 'Failed to re-queue jobs' }));
            return false;
        }
        return true;
    };

    const handleCancelAll = async () => {
        try {
            const res = await cancelAll().unwrap();
            toast.success(t('admin:pacsSettings.aiQueue.cancelAllSuccess', { defaultValue: 'Stopped {{count}} active jobs', count: res.count || 0 }));
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.aiQueue.cancelAllError', { defaultValue: 'Failed to stop jobs' }));
            return false;
        }
        return true;
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
                            <button type="button" onClick={() => setConfirmRetryAll(true)} disabled={isRetryingAll} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-slate-900 dark:text-emerald-400 dark:hover:bg-emerald-950/20">
                                <RotateCcw size={13} className={isRetryingAll ? 'animate-spin' : ''} />
                                <span>
                                    {t('admin:pacsSettings.aiQueue.retryFailedButton', {
                                        defaultValue: 'Retry failed ({{count}})',
                                        count: failed + (totals.Canceled || 0)
                                    })}
                                </span>
                            </button>
                        )}
                        {(queued > 0 || running > 0) && (
                            <button type="button" onClick={() => setConfirmCancelAll(true)} disabled={isCancelingAll} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/20">
                                <XCircle size={13} className={isCancelingAll ? 'animate-spin' : ''} />
                                <span>
                                    {t('admin:pacsSettings.aiQueue.stopQueueButton', {
                                        defaultValue: 'Stop queue ({{count}})',
                                        count: queued + running
                                    })}
                                </span>
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
                                    {processor.message || t('admin:pacsSettings.aiQueue.processorUnknown', { defaultValue: 'PACS AI processor state is unknown.' })}
                                    {processor.status !== 'ready' && (
                                        <Link to="/settings?tab=ai" className="ms-2 font-black underline underline-offset-2">
                                            {t('admin:pacsSettings.aiQueue.configureAi', { defaultValue: 'Configure AI' })}
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

            <ConfirmDialog
                isOpen={confirmRetryAll}
                onClose={() => setConfirmRetryAll(false)}
                onConfirm={handleRetryAll}
                title={t('admin:pacsSettings.aiQueue.retryAllTitle', { defaultValue: 'Retry all failed jobs' })}
                message={t('admin:pacsSettings.aiQueue.retryAllConfirm', { defaultValue: 'Are you sure you want to re-queue all failed and canceled jobs?' })}
                confirmText={t('admin:pacsSettings.aiQueue.retryAll', { defaultValue: 'Retry all' })}
                variant="warning"
                isLoading={isRetryingAll}
            />
            <ConfirmDialog
                isOpen={confirmCancelAll}
                onClose={() => setConfirmCancelAll(false)}
                onConfirm={handleCancelAll}
                title={t('admin:pacsSettings.aiQueue.cancelAllTitle', { defaultValue: 'Cancel all jobs' })}
                message={t('admin:pacsSettings.aiQueue.cancelAllConfirm', { defaultValue: 'Are you sure you want to stop/cancel all queued and running jobs?' })}
                confirmText={t('common:actions.stop', { defaultValue: 'Stop all' })}
                variant="danger"
                isLoading={isCancelingAll}
            />
        </div>
    );
};

const PacsAiQueueRow = ({ job, locale, processor }) => {
    const { t } = useTranslation(['admin', 'common']);
    const [retryJob, { isLoading: isRetrying }] = useRetryPacsAiJobMutation();
    const [cancelJob, { isLoading: isCanceling }] = useCancelPacsAiJobMutation();
    const [deleteJob, { isLoading: isDeleting }] = useDeletePacsAiJobMutation();
    const [pendingAction, setPendingAction] = useState(null);

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
            await cancelJob(job.job_id).unwrap();
            toast.success(t('admin:pacsSettings.aiQueue.jobCanceled', { defaultValue: 'Job canceled' }));
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.aiQueue.cancelError', { defaultValue: 'Failed to cancel job' }));
            return false;
        }
        return true;
    };

    const handleDelete = async () => {
        try {
            await deleteJob(job.job_id).unwrap();
            toast.success(t('admin:pacsSettings.aiQueue.jobDeleted', { defaultValue: 'Job deleted' }));
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.aiQueue.deleteError', { defaultValue: 'Failed to delete job' }));
            return false;
        }
        return true;
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
        <>
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
                    <Link to={`/reports/editor/${job.exam_id}`} className="inline-flex min-h-8 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" title={t('admin:pacsSettings.aiQueue.openEditor', { defaultValue: 'Open in editor' })}>
                        <Eye size={13} />
                        <span className="sr-only sm:not-sr-only sm:ms-1">{t('common:actions.open', { defaultValue: 'Open' })}</span>
                    </Link>
                    {(job.status === 'Queued' || job.status === 'Running') && (
                        <button
                            type="button"
                            onClick={() => setPendingAction('cancel')}
                            disabled={isCanceling}
                            className="inline-flex min-h-8 items-center justify-center gap-1 rounded-xl border border-rose-200 bg-white px-2.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-950/20"
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
                            className="inline-flex min-h-8 items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-white px-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-slate-900 dark:text-emerald-400 dark:hover:bg-emerald-950/20"
                            title={t('admin:pacsSettings.aiQueue.retryJob', { defaultValue: 'Re-queue job' })}
                        >
                            <RotateCcw size={13} className={isRetrying ? 'animate-spin' : ''} />
                            <span className="sr-only sm:not-sr-only sm:ms-1">{t('admin:pacsSettings.aiQueue.retry', { defaultValue: 'Retry' })}</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setPendingAction('delete')}
                        disabled={isDeleting}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-rose-200 hover:text-rose-600 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-rose-900 dark:hover:text-rose-400"
                        title={t('admin:pacsSettings.aiQueue.deleteJob', { defaultValue: 'Delete job entry' })}
                    >
                        <Trash2 size={13} className={isDeleting ? 'animate-spin' : ''} />
                    </button>
                </div>
            </td>
        </tr>
        <ConfirmDialog
            isOpen={pendingAction === 'cancel'}
            onClose={() => setPendingAction(null)}
            onConfirm={handleCancel}
            title={t('admin:pacsSettings.aiQueue.cancelJob', { defaultValue: 'Cancel job' })}
            message={t('admin:pacsSettings.aiQueue.cancelConfirm', { defaultValue: 'Are you sure you want to cancel this analysis job?' })}
            confirmText={t('common:actions.cancel', { defaultValue: 'Cancel' })}
            variant="warning"
            isLoading={isCanceling}
        />
        <ConfirmDialog
            isOpen={pendingAction === 'delete'}
            onClose={() => setPendingAction(null)}
            onConfirm={handleDelete}
            title={t('admin:pacsSettings.aiQueue.deleteJob', { defaultValue: 'Delete job entry' })}
            message={t('admin:pacsSettings.aiQueue.deleteConfirm', { defaultValue: 'Are you sure you want to delete this job row?' })}
            confirmText={t('common:actions.delete', { defaultValue: 'Delete' })}
            variant="danger"
            isLoading={isDeleting}
        />
        </>
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

const PacsStorageArchitectureConfig = ({ reveal = () => ({}), onSaved = () => {} }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const { data: configData = DEFAULT_CONFIG, isLoading, refetch } = useGetPacsConfigQuery();
    const [updatePacsConfig, { isLoading: isSaving }] = useUpdatePacsConfigMutation();

    const [form, setForm] = useState(DEFAULT_CONFIG);
    const [showS3Secret, setShowS3Secret] = useState(false);
    const [showPeerSecret, setShowPeerSecret] = useState(false);
    const [showSnippet, setShowSnippet] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (configData) {
            setForm((prev) => ({
                ...prev,
                pacs_storage_mode: configData.pacs_storage_mode || 'local',
                pacs_local_storage_path: configData.pacs_local_storage_path || '/var/lib/orthanc/db',
                pacs_cloud_provider: configData.pacs_cloud_provider || 's3',
                pacs_s3_bucket: configData.pacs_s3_bucket || '',
                pacs_s3_region: configData.pacs_s3_region || 'eu-central-1',
                pacs_s3_endpoint: configData.pacs_s3_endpoint || '',
                pacs_s3_access_key: configData.pacs_s3_access_key || '',
                pacs_s3_secret_key: '',
                pacs_s3_storage_class: configData.pacs_s3_storage_class || 'STANDARD',
                pacs_azure_container: configData.pacs_azure_container || '',
                pacs_peer_url: configData.pacs_peer_url || '',
                pacs_peer_aet: configData.pacs_peer_aet || '',
                pacs_peer_username: configData.pacs_peer_username || '',
                pacs_peer_password: '',
                pacs_auto_sync_enabled: Boolean(configData.pacs_auto_sync_enabled),
                pacs_tiering_days: configData.pacs_tiering_days ? String(configData.pacs_tiering_days) : '90',
                pacs_cold_prefix: configData.pacs_cold_prefix || ''
            }));
        }
    }, [configData]);

    const language = i18n.resolvedLanguage || i18n.language;
    const copy = (key, english, arabic, values = {}) => t(key, {
        defaultValue: localizedDefault(language, english, arabic),
        ...values
    });

    const hasStoredS3Secret = Boolean(configData?.has_s3_secret);
    const hasStoredPeerPassword = Boolean(configData?.has_peer_password);

    const updateField = (field) => (event) => {
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        setForm((prev) => ({ ...prev, [field]: value }));
    };

    const handleSave = async (e) => {
        e?.preventDefault();
        try {
            const payload = {
                pacs_storage_mode: form.pacs_storage_mode,
                pacs_local_storage_path: form.pacs_local_storage_path,
                pacs_cloud_provider: form.pacs_cloud_provider,
                pacs_s3_bucket: form.pacs_s3_bucket,
                pacs_s3_region: form.pacs_s3_region,
                pacs_s3_endpoint: form.pacs_s3_endpoint,
                pacs_s3_access_key: form.pacs_s3_access_key,
                pacs_s3_storage_class: form.pacs_s3_storage_class,
                pacs_azure_container: form.pacs_azure_container,
                pacs_peer_url: form.pacs_peer_url,
                pacs_peer_aet: form.pacs_peer_aet,
                pacs_peer_username: form.pacs_peer_username,
                pacs_auto_sync_enabled: form.pacs_auto_sync_enabled,
                pacs_tiering_days: form.pacs_tiering_days,
                pacs_cold_prefix: form.pacs_cold_prefix
            };
            if (form.pacs_s3_secret_key) {
                payload.pacs_s3_secret_key = form.pacs_s3_secret_key;
            }
            if (form.pacs_peer_password) {
                payload.pacs_peer_password = form.pacs_peer_password;
            }

            await updatePacsConfig(payload).unwrap();
            toast.success(copy('admin:pacsSettings.storageArch.saved', 'Storage architecture configuration saved successfully', 'تم حفظ إعدادات معمارية التخزين بنجاح'));
            refetch();
            onSaved();
        } catch (error) {
            toast.error(error?.data?.message || copy('admin:pacsSettings.storageArch.saveError', 'Failed to save storage configuration', 'تعذر حفظ إعدادات التخزين'));
        }
    };

    const generateSnippet = () => {
        if (form.pacs_storage_mode === 'local') {
            return JSON.stringify({
                "StorageDirectory": form.pacs_local_storage_path || "/var/lib/orthanc/db",
                "IndexDirectory": form.pacs_local_storage_path || "/var/lib/orthanc/db",
                "ConcurrentJobs": 4
            }, null, 2);
        }
        if (form.pacs_storage_mode === 'cloud') {
            return JSON.stringify({
                "StorageDirectory": "/var/lib/orthanc/db",
                "IndexDirectory": "/var/lib/orthanc/db",
                "AwsS3Storage": {
                    "BucketName": form.pacs_s3_bucket || "hospital-pacs-archive",
                    "Region": form.pacs_s3_region || "eu-central-1",
                    "Endpoint": form.pacs_s3_endpoint || undefined,
                    "AccessKey": form.pacs_s3_access_key || "YOUR_ACCESS_KEY",
                    "SecretKey": form.pacs_s3_secret_key || (hasStoredS3Secret ? "********" : "YOUR_SECRET_KEY"),
                    "StorageClass": form.pacs_s3_storage_class || "STANDARD",
                    "VirtualAddressing": form.pacs_cloud_provider === 's3'
                }
            }, null, 2);
        }
        return JSON.stringify({
            "StorageDirectory": "/var/lib/orthanc/db",
            "IndexDirectory": "/var/lib/orthanc/db",
            "OrthancPeers": form.pacs_peer_url ? {
                [form.pacs_peer_aet || "central"]: {
                    "Url": form.pacs_peer_url,
                    "Username": form.pacs_peer_username || "orthanc",
                    "Password": form.pacs_peer_password || (hasStoredPeerPassword ? "********" : "password")
                }
            } : {}
        }, null, 2);
    };

    const copySnippetToClipboard = () => {
        navigator.clipboard?.writeText(generateSnippet());
        setCopied(true);
        toast.success(copy('admin:pacsSettings.storageArch.copied', 'Orthanc configuration snippet copied to clipboard', 'تم نسخ كود إعدادات Orthanc إلى الحافظة'));
        setTimeout(() => setCopied(false), 2000);
    };

    const modes = [
        {
            id: 'local',
            title: copy('admin:pacsSettings.storageArch.modes.local.title', 'Local Storage', 'تخزين محلي مباشر'),
            subtitle: copy('admin:pacsSettings.storageArch.modes.local.sub', 'Direct Server NVMe / RAID Storage', 'أقراص الخادم السريعة وRAID المحلية'),
            description: copy('admin:pacsSettings.storageArch.modes.local.desc', 'Best for ultra-fast hospital LAN speeds, zero bandwidth fees, and instant workstation rendering.', 'الخيار الأفضل للسرعة القصوى على شبكة المستشفى الداخلية، بدون تكاليف تدفق بيانات، وزمن استجابة فوري للأجهزة.'),
            icon: HardDrive,
            badge: copy('admin:pacsSettings.storageArch.modes.local.badge', 'On-Premise', 'محلي')
        },
        {
            id: 'cloud',
            title: copy('admin:pacsSettings.storageArch.modes.cloud.title', 'Cloud Object Storage', 'تخزين سحابي مباشر'),
            subtitle: copy('admin:pacsSettings.storageArch.modes.cloud.sub', 'S3 / Wasabi / MinIO / Azure Blob', 'سحابة S3 و Wasabi و MinIO و Azure'),
            description: copy('admin:pacsSettings.storageArch.modes.cloud.desc', 'Stores DICOM instances directly in elastic cloud storage. Perfect for multi-clinic networks and off-site DR.', 'حفظ ملفات DICOM مباشرة في وحدات التخزين السحابي بسعات غير محدودة، ومثالي لربط الفروع والتعافي من الكوارث.'),
            icon: Cloud,
            badge: copy('admin:pacsSettings.storageArch.modes.cloud.badge', 'Elastic Cloud', 'سحابي مرن')
        },
        {
            id: 'hybrid',
            title: copy('admin:pacsSettings.storageArch.modes.hybrid.title', 'Hybrid Sync & Tiering', 'تخزين هجين وتزامن ذكي'),
            subtitle: copy('admin:pacsSettings.storageArch.modes.hybrid.sub', 'Local Hot Cache + Central/Cold Sync', 'كاش محلي ساخن + أرشفة سحابية باردة'),
            description: copy('admin:pacsSettings.storageArch.modes.hybrid.desc', 'Instant local reading for recent studies (30-90 days), with automatic background sync and cold tiering.', 'سرعة محلية فائقة للحالات الحديثة، مع ترحيل ومزامنة ذكية للحالات الأقدم إلى الخادم المركزي أو الأرشيف البارد.'),
            icon: FolderSync,
            badge: copy('admin:pacsSettings.storageArch.modes.hybrid.badge', 'High Availability', 'تزامن ذكي')
        }
    ];

    if (isLoading) {
        return null;
    }

    return (
        <section className={panelClass} {...reveal(180)}>
            <div className="border-b border-slate-200/60 p-4 sm:p-5 dark:border-slate-800/60">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400">
                            <Database size={20} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-950 dark:text-white">
                                {copy('admin:pacsSettings.storageArch.title', 'Archive & DICOM Storage Architecture', 'معمارية تخزين الأرشيف وصور DICOM')}
                            </h2>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                {copy('admin:pacsSettings.storageArch.subtitle', 'Configure where DICOM studies are physically stored: on-premise local disk, direct S3/Azure cloud bucket, or hybrid multi-site sync.', 'حدد مكان حفظ دراسات DICOM فعلياً: محلياً على أقراص الخادم، أو سحابياً على S3/Azure، أو بنظام هجين يجمع السرعة والأرشفة.')}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowSnippet(!showSnippet)}
                            className={buttonClass}
                        >
                            <Layers size={14} />
                            <span>{showSnippet ? copy('admin:pacsSettings.storageArch.hideSnippet', 'Hide Config Code', 'إخفاء كود Orthanc') : copy('admin:pacsSettings.storageArch.viewSnippet', 'Orthanc Config Snippet', 'معاينة كود Orthanc')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={isSaving}
                            className={primaryButtonClass}
                        >
                            {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                            <span>{language.startsWith('ar') ? 'حفظ مسودة إعداد النشر' : 'Save deployment configuration draft'}</span>
                        </button>
                    </div>
                </div>

                {/* Storage Mode Selector Cards */}
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {modes.map((mode) => {
                        const Icon = mode.icon;
                        const isSelected = form.pacs_storage_mode === mode.id;
                        return (
                            <button
                                key={mode.id}
                                type="button"
                                onClick={() => setForm((prev) => ({ ...prev, pacs_storage_mode: mode.id }))}
                                className={`relative flex flex-col text-start rounded-2xl p-4 transition-all duration-200 border ${
                                    isSelected
                                        ? 'border-teal-500 bg-teal-500/10 shadow-sm ring-2 ring-teal-500/30 dark:border-teal-400 dark:bg-teal-950/30'
                                        : 'border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className={`grid h-8 w-8 place-items-center rounded-lg ${isSelected ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                                        <Icon size={16} />
                                    </div>
                                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                        isSelected
                                            ? 'bg-teal-500/20 text-teal-800 dark:text-teal-200'
                                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                    }`}>
                                        {mode.badge}
                                    </span>
                                </div>
                                <h3 className="mt-3 text-sm font-black text-slate-950 dark:text-white">
                                    {mode.title}
                                </h3>
                                <p className="text-[11px] font-semibold text-teal-700 dark:text-teal-400">
                                    {mode.subtitle}
                                </p>
                                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                    {mode.description}
                                </p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Mode-Specific Settings Form */}
            <div className="p-4 sm:p-5 space-y-5">
                {form.pacs_storage_mode === 'local' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                            <HardDrive size={15} />
                            <span>{copy('admin:pacsSettings.storageArch.localTitle', 'Local Filesystem & Disk Mounts', 'إعدادات القرص المحلي والمجلدات')}</span>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                                    {copy('admin:pacsSettings.storageArch.localPath', 'Storage Directory Path', 'مسار مجلد التخزين المحلي')}
                                </label>
                                <input
                                    type="text"
                                    value={form.pacs_local_storage_path}
                                    onChange={updateField('pacs_local_storage_path')}
                                    placeholder="/var/lib/orthanc/db"
                                    className={inputClass}
                                />
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {copy('admin:pacsSettings.storageArch.localPathHelp', 'Linux path (e.g. /var/lib/orthanc/db) or Windows drive path (e.g. D:\\VIARA\\orthanc-storage).', 'مسار المجلد على خادم Linux مثل /var/lib/orthanc/db أو مسار القرص في Windows مثل D:\\VIARA\\orthanc-storage.')}
                                </p>
                            </div>

                            <div className="rounded-xl border border-teal-200/60 bg-teal-50/50 p-4 text-xs dark:border-teal-900/40 dark:bg-teal-950/20">
                                <div className="flex items-center gap-2 font-bold text-teal-900 dark:text-teal-200">
                                    <ShieldCheck size={16} className="shrink-0 text-teal-600 dark:text-teal-400" />
                                    <span>{copy('admin:pacsSettings.storageArch.localTipsTitle', 'Best Practice for Local Storage', 'إرشادات الأداء للتخزين المحلي')}</span>
                                </div>
                                <ul className="mt-2 list-disc space-y-1 ps-4 leading-5 text-teal-800/90 dark:text-teal-300/80">
                                    <li>{copy('admin:pacsSettings.storageArch.localTip1', 'Mount on high-speed NVMe or SSD RAID-10 for instantaneous study opening.', 'استخدم وحدات NVMe أو SSD بتقنية RAID-10 لفتح الدراسات فوريًا.')}</li>
                                    <li>{copy('admin:pacsSettings.storageArch.localTip2', 'Ensure regular automated snapshots of the storage partition.', 'احرص على أخذ نسخ احتياطية دورية أو Snapshots لمسار التخزين.')}</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {form.pacs_storage_mode === 'cloud' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                            <Cloud size={15} />
                            <span>{copy('admin:pacsSettings.storageArch.cloudTitle', 'Cloud Object Store Configuration (S3 / Wasabi / Azure)', 'إعدادات التخزين السحابي (S3 / Wasabi / MinIO / Azure)')}</span>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <div>
                                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                                    {copy('admin:pacsSettings.storageArch.cloudProvider', 'Cloud Provider', 'مزود السحابة')}
                                </label>
                                <select
                                    value={form.pacs_cloud_provider}
                                    onChange={updateField('pacs_cloud_provider')}
                                    className={inputClass}
                                >
                                    <option value="s3">Amazon S3 (AWS)</option>
                                    <option value="wasabi">Wasabi Hot Cloud Storage</option>
                                    <option value="minio">MinIO / Ceph (Local Object Storage)</option>
                                    <option value="r2">Cloudflare R2</option>
                                    <option value="azure">Microsoft Azure Blob Storage</option>
                                </select>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                                    {copy('admin:pacsSettings.storageArch.s3Bucket', 'S3 Bucket Name', 'اسم الحاوية (Bucket Name)')}
                                </label>
                                <input
                                    type="text"
                                    value={form.pacs_s3_bucket}
                                    onChange={updateField('pacs_s3_bucket')}
                                    placeholder="hospital-pacs-archive"
                                    className={inputClass}
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                                    {copy('admin:pacsSettings.storageArch.s3Region', 'Region', 'المنطقة (Region)')}
                                </label>
                                <input
                                    type="text"
                                    value={form.pacs_s3_region}
                                    onChange={updateField('pacs_s3_region')}
                                    placeholder="eu-central-1"
                                    className={inputClass}
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                                    {copy('admin:pacsSettings.storageArch.s3Endpoint', 'Custom Endpoint URL', 'عنوان Endpoint مخصص')}
                                </label>
                                <input
                                    type="text"
                                    value={form.pacs_s3_endpoint}
                                    onChange={updateField('pacs_s3_endpoint')}
                                    placeholder="https://s3.wasabisys.com or http://minio:9000"
                                    className={inputClass}
                                />
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {copy('admin:pacsSettings.storageArch.s3EndpointHelp', 'Leave empty for standard AWS S3. Required for Wasabi, MinIO, or private S3 stores.', 'اتركه فارغاً لـ AWS S3 القياسي. مطلوب لـ Wasabi و MinIO والتخزين الداخلي.')}
                                </p>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                                    {copy('admin:pacsSettings.storageArch.s3AccessKey', 'Access Key ID', 'مفتاح الوصول (Access Key)')}
                                </label>
                                <input
                                    type="text"
                                    value={form.pacs_s3_access_key}
                                    onChange={updateField('pacs_s3_access_key')}
                                    placeholder="AKIAIOSFODNN7EXAMPLE"
                                    className={inputClass}
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                                        {copy('admin:pacsSettings.storageArch.s3SecretKey', 'Secret Access Key', 'المفتاح السري (Secret Key)')}
                                    </label>
                                    {hasStoredS3Secret && (
                                        <span className="inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                                            <Lock size={10} />
                                            {copy('admin:pacsSettings.storageArch.secretStored', 'Key stored', 'المفتاح محفوظ')}
                                        </span>
                                    )}
                                </div>
                                <div className="relative">
                                    <input
                                        type={showS3Secret ? 'text' : 'password'}
                                        value={form.pacs_s3_secret_key}
                                        onChange={updateField('pacs_s3_secret_key')}
                                        placeholder={hasStoredS3Secret ? '••••••••••••••••' : 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'}
                                        className={inputClass}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowS3Secret(!showS3Secret)}
                                        className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    >
                                        {showS3Secret ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                                    {copy('admin:pacsSettings.storageArch.s3StorageClass', 'S3 Storage Class', 'فئة التخزين (Storage Class)')}
                                </label>
                                <select
                                    value={form.pacs_s3_storage_class}
                                    onChange={updateField('pacs_s3_storage_class')}
                                    className={inputClass}
                                >
                                    <option value="STANDARD">STANDARD (Hot / Fast Access)</option>
                                    <option value="INTELLIGENT_TIERING">INTELLIGENT_TIERING (Auto Cost Optimization)</option>
                                    <option value="STANDARD_IA">STANDARD_IA (Infrequent Access)</option>
                                    <option value="GLACIER_IR">GLACIER_IR (Instant Retrieval Archive)</option>
                                </select>
                            </div>

                            {form.pacs_cloud_provider === 'azure' && (
                                <div>
                                    <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                                        {copy('admin:pacsSettings.storageArch.azureContainer', 'Azure Blob Container Name', 'اسم حاوية Azure Blob')}
                                    </label>
                                    <input
                                        type="text"
                                        value={form.pacs_azure_container}
                                        onChange={updateField('pacs_azure_container')}
                                        placeholder="pacs-blob-container"
                                        className={inputClass}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {form.pacs_storage_mode === 'hybrid' && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                            <FolderSync size={15} />
                            <span>{copy('admin:pacsSettings.storageArch.hybridTitle', 'Hybrid Multi-Site Sync & Hot/Cold Tiering', 'التزامن الهجين بين المواقع والأرشفة الذكية')}</span>
                        </div>

                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/30">
                            <label className="flex cursor-pointer items-start gap-3">
                                <input
                                    type="checkbox"
                                    checked={form.pacs_auto_sync_enabled}
                                    onChange={updateField('pacs_auto_sync_enabled')}
                                    className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                />
                                <div>
                                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                                        {copy('admin:pacsSettings.storageArch.autoSync', 'Enable Automatic Peer Synchronization', 'تفعيل التزامن التلقائي مع الخادم المركزي')}
                                    </span>
                                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                        {copy('admin:pacsSettings.storageArch.autoSyncHelp', 'Automatically forward incoming DICOM studies to a secondary central PACS or cloud disaster-recovery peer.', 'إرسال أي دراسة DICOM جديدة تصل للأجهزة تلقائيًا إلى خادم PACS مركزي أو موقع بديل للتعافي من الكوارث.')}
                                    </p>
                                </div>
                            </label>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <div>
                                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                                    {copy('admin:pacsSettings.storageArch.peerUrl', 'Remote PACS Peer REST URL', 'رابط الخادم البعيد (Peer REST URL)')}
                                </label>
                                <input
                                    type="text"
                                    value={form.pacs_peer_url}
                                    onChange={updateField('pacs_peer_url')}
                                    placeholder="https://central-pacs.hospital.org:8042"
                                    className={inputClass}
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                                    {copy('admin:pacsSettings.storageArch.peerAet', 'Remote Peer AET', 'عنوان AET للخادم البعيد')}
                                </label>
                                <input
                                    type="text"
                                    value={form.pacs_peer_aet}
                                    onChange={updateField('pacs_peer_aet')}
                                    placeholder="CENTRAL_PACS"
                                    className={inputClass}
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                                    {copy('admin:pacsSettings.storageArch.peerUsername', 'Peer Username', 'اسم مستخدم الخادم البعيد')}
                                </label>
                                <input
                                    type="text"
                                    value={form.pacs_peer_username}
                                    onChange={updateField('pacs_peer_username')}
                                    placeholder="orthanc"
                                    className={inputClass}
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                                        {copy('admin:pacsSettings.storageArch.peerPassword', 'Peer Password', 'كلمة سر الخادم البعيد')}
                                    </label>
                                    {hasStoredPeerPassword && (
                                        <span className="inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                                            <Lock size={10} />
                                            {copy('admin:pacsSettings.storageArch.secretStored', 'Key stored', 'محفوظة')}
                                        </span>
                                    )}
                                </div>
                                <div className="relative">
                                    <input
                                        type={showPeerSecret ? 'text' : 'password'}
                                        value={form.pacs_peer_password}
                                        onChange={updateField('pacs_peer_password')}
                                        placeholder={hasStoredPeerPassword ? '••••••••••••••••' : 'password'}
                                        className={inputClass}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPeerSecret(!showPeerSecret)}
                                        className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    >
                                        {showPeerSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                                    {copy('admin:pacsSettings.storageArch.tieringDays', 'Hot Retention Window (Days)', 'فترة البقاء في التخزين السريع (أيام)')}
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="3650"
                                    value={form.pacs_tiering_days}
                                    onChange={updateField('pacs_tiering_days')}
                                    placeholder="90"
                                    className={inputClass}
                                />
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {copy('admin:pacsSettings.storageArch.tieringDaysHelp', 'Studies older than this number of days will be flagged for cold archive tiering.', 'الدراسات الأقدم من هذه الأيام تصبح مؤهلة للأرشفة الباردة.')}
                                </p>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-200">
                                    {copy('admin:pacsSettings.storageArch.coldPrefix', 'Cold Archive Destination URI', 'مسار الأرشيف البارد (Cold URI)')}
                                </label>
                                <input
                                    type="text"
                                    value={form.pacs_cold_prefix}
                                    onChange={updateField('pacs_cold_prefix')}
                                    placeholder="s3://viara-cold-archive/studies"
                                    className={inputClass}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Configuration Code Preview Snippet Drawer */}
                {showSnippet && (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs font-mono shadow-inner space-y-3">
                        <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
                            <span className="font-bold text-teal-400">orthanc.json / config snippet</span>
                            <button
                                type="button"
                                onClick={copySnippetToClipboard}
                                className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700 transition"
                            >
                                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                                <span>{copied ? copy('common:actions.copied', 'Copied', 'تم النسخ') : copy('common:actions.copy', 'Copy', 'نسخ')}</span>
                            </button>
                        </div>
                        <pre className="overflow-x-auto text-teal-300 leading-5">
                            {generateSnippet()}
                        </pre>
                    </div>
                )}
            </div>
        </section>
    );
};

const PacsStoragePanel = ({ reveal = () => ({}) }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const { data, isLoading, isFetching, refetch } = useGetPacsStorageSummaryQuery();
    const [runTiering, { isLoading: isTiering }] = useRunPacsTieringMutation();
    const [confirmTiering, setConfirmTiering] = useState(false);
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
    const canRunTiering = Boolean(tiering.enabled && tiering.physical_archiver) && eligibleInstances > 0 && !isTiering;

    const tierSweep = async () => {
        try {
            const result = await runTiering().unwrap();
            toast.success(t('admin:pacsSettings.storage.tiered', { defaultValue: 'Data tiering completed: {{count}} items migrated', count: result.migrated || 0 }));
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || t('admin:pacsSettings.storage.tierError', { defaultValue: 'Failed to start data tiering' }));
        }
    };

    return (
        <div className="space-y-5">
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {i18n.language.startsWith('ar')
                    ? 'إعدادات المعمارية التالية مسودة للنشر. حفظها لا ينقل الصور ولا يفعّل S3 أو المزامنة بين المواقع. حالة التشغيل الفعلية تظهر أدناه؛ الأرشفة الحالية تنشئ نسخة محلية مشفّرة ومتحققًا منها وتحتفظ بالأصل.'
                    : 'The architecture settings below are deployment drafts. Saving does not move images or activate S3 or site synchronization. The live status appears below; archiving creates verified encrypted local copies and keeps the originals.'}
            </p>
            <PacsStorageArchitectureConfig reveal={reveal} onSaved={() => refetch()} />

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
                            {t('admin:pacsSettings.storage.help', { defaultValue: 'Manage Orthanc hot storage visibility, VIARA archive index health, and tiering bookkeeping for long-term retention.' })}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => refetch()} disabled={isFetching} className={buttonClass}>
                            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                            {t('common:actions.refresh', { defaultValue: 'Refresh' })}
                        </button>
                        <button type="button" onClick={() => setConfirmTiering(true)} disabled={!canRunTiering} className={primaryButtonClass}>
                            <Database size={14} className={isTiering ? 'animate-pulse' : ''} />
                            {t('admin:pacsSettings.storage.runTiering', { defaultValue: 'Run tiering sweep' })}
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <PageState icon={Activity} spin title={t('admin:pacsSettings.storage.loading', { defaultValue: 'Loading PACS storage state' })} />
                ) : (
                    <div className="space-y-6 p-4">
                        {instanceGap !== 0 && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                                <div className="flex items-center gap-2 font-bold">
                                    <AlertTriangle size={15} className="shrink-0" />
                                    <span>{t('admin:pacsSettings.storage.gapTitle', { defaultValue: 'Storage indexing gap detected' })}</span>
                                </div>
                                <p className="mt-1 leading-5">
                                    {t('admin:pacsSettings.storage.gapHelp', {
                                        defaultValue: 'Orthanc reports {{orthanc}} DICOM instances, but VIARA archive index tracks {{indexed}}. New arrivals might still be indexing.',
                                        orthanc: orthanc.instances || 0,
                                        indexed: indexedInstances
                                    })}
                                </p>
                            </div>
                        )}

                        <div>
                            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {t('admin:pacsSettings.storage.retentionTiers', { defaultValue: 'Retention tiers' })}
                            </h3>
                            <div className="grid gap-4 md:grid-cols-3">
                                <StorageTierCard tier="hot" data={tiers.hot || {}} locale={i18n.language} totalBytes={totalIndexedBytes} totalInstances={indexedInstances} />
                                <StorageTierCard tier="warm" data={tiers.warm || {}} locale={i18n.language} totalBytes={totalIndexedBytes} totalInstances={indexedInstances} />
                                <StorageTierCard tier="cold" data={tiers.cold || {}} locale={i18n.language} totalBytes={totalIndexedBytes} totalInstances={indexedInstances} />
                            </div>
                        </div>

                        <div>
                            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {t('admin:pacsSettings.storage.healthMetrics', { defaultValue: 'Health & subsystem details' })}
                            </h3>
                            <div className="grid gap-4 md:grid-cols-3">
                                <StorageInfoCard
                                    icon={Server}
                                    title={t('admin:pacsSettings.storage.orthancServer', { defaultValue: 'Orthanc server' })}
                                    tone={data?.orthanc_error ? 'rose' : 'teal'}
                                    rows={[
                                        [t('admin:pacsSettings.storage.diskMb', { defaultValue: 'Total disk MB' }), formatNumber(orthanc.totalDiskSizeMB)],
                                        [t('admin:pacsSettings.storage.studiesCount', { defaultValue: 'Studies' }), formatNumber(orthanc.studies)],
                                        [t('admin:pacsSettings.storage.seriesCount', { defaultValue: 'Series' }), formatNumber(orthanc.series)],
                                        [t('admin:pacsSettings.storage.instancesCount', { defaultValue: 'Instances' }), formatNumber(orthanc.instances)]
                                    ]}
                                />
                                <StorageInfoCard
                                    icon={Monitor}
                                    title={t('admin:pacsSettings.storage.viaraIndex', { defaultValue: 'VIARA archive index' })}
                                    tone="emerald"
                                    rows={[
                                        [t('admin:pacsSettings.storage.indexedStudies', { defaultValue: 'Indexed studies' }), formatNumber(index.study_count)],
                                        [t('admin:pacsSettings.storage.indexedSeries', { defaultValue: 'Indexed series' }), formatNumber(index.series_count)],
                                        [t('admin:pacsSettings.storage.indexedInstances', { defaultValue: 'Indexed instances' }), formatNumber(indexedInstances)],
                                        [t('admin:pacsSettings.storage.indexedVolume', { defaultValue: 'Indexed volume' }), formatBytes(totalIndexedBytes)]
                                    ]}
                                />
                                <StorageInfoCard
                                    icon={ShieldCheck}
                                    title={t('admin:pacsSettings.storage.tieringConfig', { defaultValue: 'Tiering policy' })}
                                    tone={tiering.enabled ? 'amber' : 'slate'}
                                    rows={[
                                        [t('admin:pacsSettings.storage.policyState', { defaultValue: 'Policy state' }), tiering.enabled ? t('common:status.enabled', { defaultValue: 'Enabled' }) : t('common:status.disabled', { defaultValue: 'Disabled' })],
                                        [t('admin:pacsSettings.storage.thresholdDays', { defaultValue: 'Cold threshold' }), `${tiering.threshold_days ?? 90} days`],
                                        [t('admin:pacsSettings.storage.eligibleInstances', { defaultValue: 'Eligible instances' }), formatNumber(eligibleInstances)],
                                        [t('admin:pacsSettings.storage.eligibleVolume', { defaultValue: 'Eligible volume' }), formatBytes(tiering.eligible_bytes)]
                                    ]}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </section>

            <ConfirmDialog
                isOpen={confirmTiering}
                onClose={() => setConfirmTiering(false)}
                onConfirm={tierSweep}
                title={t('admin:pacsSettings.storage.tiering.title', { defaultValue: 'Run data tiering' })}
                message={t('admin:pacsSettings.storage.confirmTiering', {
                    defaultValue: 'Create verified encrypted copies of eligible images? The originals remain in Orthanc.'
                })}
                confirmText={t('admin:pacsSettings.storage.runTiering', { defaultValue: 'Run tiering' })}
                variant="warning"
                isLoading={isTiering}
            />
        </div>
    );
};

const StorageInfoCard = ({ icon: Icon, title, tone = 'slate', rows = [] }) => (
    <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-4 dark:border-slate-800/60 dark:bg-slate-950/25">
        <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-slate-950 dark:text-white">{title}</p>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneIconClass(tone)}`}>
                <Icon size={16} />
            </span>
        </div>
        <div className="mt-4 space-y-2">
            {rows.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3 text-xs">
                    <span className="break-words text-slate-500 dark:text-slate-400">{label}</span>
                    <span className="break-all text-end font-mono font-bold text-slate-900 dark:text-slate-100">{value}</span>
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
    const tierLabel = tier === 'warm'
        ? (locale.startsWith('ar') ? 'نسخة أرشيف مشفّرة ومتحقق منها' : 'Verified encrypted archive mirror')
        : t(`admin:pacsSettings.storage.tiers.${tier}`, { defaultValue: tier });

    return (
        <div className="rounded-xl border border-slate-200/60 bg-white/70 p-4 dark:border-slate-800/60 dark:bg-slate-900/40">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black capitalize text-slate-950 dark:text-white">{tierLabel}</p>
                <StatusBadge tone={tone}>{instances} / {instancePercent}%</StatusBadge>
            </div>
            <p className="mt-3 font-mono text-xl font-black text-slate-900 dark:text-slate-100">{formatBytes(bytes)}</p>
            {Number(data.unknown_size_instances || 0) > 0 && <p className="mt-1 text-xs text-amber-600">{locale.startsWith('ar') ? 'الحجم جزئي؛ صور بلا حجم مفهرس:' : 'Partial size; images without indexed size:'} {data.unknown_size_instances}</p>}
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                    className={`h-full rounded-full ${tier === 'hot' ? 'bg-teal-500' : tier === 'cold' ? 'bg-cyan-500' : 'bg-slate-400'}`}
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
                        <pre className="max-h-48 overflow-auto rounded-xl bg-slate-950 p-3 text-xs leading-5 text-slate-100">
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

const PacsSettings = ({ embedded = false }) => {
    const { t, i18n } = useTranslation(['admin', 'common']);
    const [activeTab, setActiveTab] = useState('overview');
    const language = i18n.resolvedLanguage || i18n.language;
    const copy = (key, english, arabic) => t(key, {
        defaultValue: localizedDefault(language, english, arabic)
    });

    const tabs = [
        { id: 'overview', label: copy('admin:pacsSettings.tabs.overview', 'Overview & Config', 'النظرة العامة والإعداد'), icon: Server },
        { id: 'modalities', label: copy('admin:pacsSettings.tabs.modalities', 'DICOM Modalities', 'أجهزة DICOM'), icon: Network },
        { id: 'aiQueue', label: copy('admin:pacsSettings.tabs.aiQueue', 'PACS AI Queue', 'طابور ذكاء PACS'), icon: BrainCircuit },
        { id: 'worklist', label: copy('admin:pacsSettings.tabs.worklist', 'Modality Worklist', 'قائمة عمل الأجهزة'), icon: ClipboardList },
        { id: 'storage', label: copy('admin:pacsSettings.tabs.storage', 'Archive Storage', 'تخزين الأرشيف'), icon: Database },
        { id: 'operations', label: copy('admin:pacsSettings.tabs.operations', 'Activity & Audit', 'النشاط والتدقيق'), icon: Activity }
    ];

    const reveal = (delay = 0) => ({
        style: {
            animation: `fadeIn 0.3s ease-out ${delay}ms both`
        }
    });

    return (
        <div className={embedded ? 'space-y-5 pb-0' : 'space-y-6'}>
            {/* VIARA Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8 space-y-6">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center min-w-0">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <Server size={26} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                <Network size={11} />
                                <span>{copy('admin:pacsSettings.eyebrow', 'DICOM Engine & Imaging Archive', 'محرك DICOM وأرشيف الصور')}</span>
                            </span>
                            <h1 className="mt-1 break-words text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {copy('admin:pacsSettings.title', 'PACS & DICOM Server Network', 'إعدادات PACS وشبكة DICOM')}
                            </h1>
                            <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
                                {copy('admin:pacsSettings.subtitle', 'Orthanc server endpoints, scanner AET nodes, AI analysis queue, Modality Worklist, storage tiering, and DICOM audit logs.', 'إدارة نقاط Orthanc، وأجهزة AET، وطابور تحليل الصور، وقائمة العمل، والتخزين، وسجلات تدقيق DICOM من مكان واحد.')}
                            </p>
                        </div>
                    </div>
                </div>

                <nav className="flex flex-wrap items-center gap-2 p-1.5 rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/40 w-fit">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex min-h-9 shrink-0 items-center gap-2 rounded-xl px-4 text-xs font-bold transition-all ${
                                    isActive
                                        ? 'bg-teal-600 text-white shadow-sm'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                                }`}
                            >
                                <Icon size={14} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </nav>
            </div>

            <main className="mt-6">
                {activeTab === 'overview' && <PacsConfigPanel reveal={reveal} />}
                {activeTab === 'modalities' && <PacsModalitiesPanel reveal={reveal} />}
                {activeTab === 'aiQueue' && <PacsAiQueuePanel reveal={reveal} />}
                {activeTab === 'worklist' && <PacsWorklistPanel reveal={reveal} />}
                {activeTab === 'storage' && <PacsStoragePanel reveal={reveal} />}
                {activeTab === 'operations' && <PacsOperationsPanel reveal={reveal} />}
            </main>
        </div>
    );
};

export default PacsSettings;
