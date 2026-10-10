import React, { useState, useRef } from 'react';
import {
    ShieldCheck,
    ShieldAlert,
    Key,
    Clock,
    Users,
    CheckCircle2,
    AlertTriangle,
    Copy,
    Check,
    UploadCloud,
    FileText,
    Sparkles,
    RefreshCw,
    Lock,
    Unlock,
    Layers,
    Cpu,
    Building2,
    Calendar,
    ArrowUpRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
    useGetLicenseInfoQuery,
    useGetLicenseQuotaQuery,
    useInspectLicenseMutation,
    useActivateLicenseMutation
} from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';

const EDITION_STYLES = {
    trial: {
        badgeBg: 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300',
        badgeDot: 'bg-amber-500',
        accentBg: 'from-amber-500/20 to-orange-500/20',
        label: 'نسخة تجريبية (Trial Edition)',
        tag: 'Trial',
    },
    standard: {
        badgeBg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300',
        badgeDot: 'bg-emerald-500',
        accentBg: 'from-emerald-500/20 to-teal-500/20',
        label: 'النسخة القياسية (Standard Edition)',
        tag: 'Standard',
    },
    enterprise: {
        badgeBg: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-800 dark:text-indigo-300',
        badgeDot: 'bg-indigo-500',
        accentBg: 'from-indigo-500/20 to-purple-500/20',
        label: 'نسخة المؤسسات (Enterprise Edition)',
        tag: 'Enterprise',
    },
    developer: {
        badgeBg: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-800 dark:text-cyan-300',
        badgeDot: 'bg-cyan-500',
        accentBg: 'from-cyan-500/20 to-teal-500/20',
        label: 'وضع المطور (Developer Mode)',
        tag: 'Developer',
    },
};

export default function LicenseSettings() {
    const { t, i18n } = useTranslation(['settings', 'common']);
    const isRtl = i18n.dir() === 'rtl';
    const fileInputRef = useRef(null);

    const { data: licenseInfo, isLoading: isLoadingInfo, refetch: refetchInfo } = useGetLicenseInfoQuery();
    const { data: quotaStats, isLoading: isLoadingQuota, refetch: refetchQuota } = useGetLicenseQuotaQuery();

    const [inspectLicense, { isLoading: isInspecting }] = useInspectLicenseMutation();
    const [activateLicense, { isLoading: isActivating }] = useActivateLicenseMutation();

    const [licenseKeyInput, setLicenseKeyInput] = useState('');
    const [inspectionResult, setInspectionResult] = useState(null);
    const [copiedFingerprint, setCopiedFingerprint] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);

    const editionKey = licenseInfo?.edition || 'trial';
    const editionStyle = EDITION_STYLES[editionKey] || EDITION_STYLES.trial;

    const handleCopyFingerprint = () => {
        if (!licenseInfo?.fingerprint) return;
        navigator.clipboard.writeText(licenseInfo.fingerprint);
        setCopiedFingerprint(true);
        toast.success(isRtl ? 'تم نسخ بصمة الخادم بنجاح' : 'Server hardware fingerprint copied');
        setTimeout(() => setCopiedFingerprint(false), 2500);
    };

    const handleFileSelect = (file) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result;
            if (typeof content === 'string') {
                const cleaned = content.trim();
                setLicenseKeyInput(cleaned);
                setInspectionResult(null);
                toast.success(isRtl ? 'تم قراءة ملف الترخيص' : 'License file loaded');
            }
        };
        reader.readAsText(file);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const files = e.dataTransfer.files;
        if (files && files[0]) {
            handleFileSelect(files[0]);
        }
    };

    const handleInspect = async () => {
        const key = licenseKeyInput.trim();
        if (!key) {
            toast.error(isRtl ? 'يرجى إدخال أو رفع مفتاح ترخيص أولاً' : 'Please provide a license key first');
            return;
        }

        try {
            const res = await inspectLicense({ key }).unwrap();
            setInspectionResult(res.license || res);
            toast.success(isRtl ? 'المفتاح صالح وموقّع تشفيريًا' : 'License key verified and cryptographically valid');
        } catch (err) {
            setInspectionResult(null);
            toast.error(getErrorMessage(err, isRtl ? 'مفتاح الترخيص غير صالح أو تالف' : 'Invalid or corrupt license key'));
        }
    };

    const handleActivate = async () => {
        const key = licenseKeyInput.trim();
        if (!key) {
            toast.error(isRtl ? 'يرجى إدخال مفتاح ترخيص' : 'Please provide a license key');
            return;
        }

        try {
            const res = await activateLicense({ key }).unwrap();
            toast.success(res.message || (isRtl ? 'تم تفعيل مفتاح الترخيص بنجاح!' : 'License successfully activated!'));
            setLicenseKeyInput('');
            setInspectionResult(null);
            refetchInfo();
            refetchQuota();
        } catch (err) {
            toast.error(getErrorMessage(err, isRtl ? 'فشل تفعيل مفتاح الترخيص' : 'Failed to activate license'));
        }
    };

    return (
        <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Top Overview Deck */}
            <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center min-w-0">
                        <div className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${editionStyle.accentBg} text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner`}>
                            <ShieldCheck size={32} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-black tracking-wider ${editionStyle.badgeBg}`}>
                                    <span className={`h-2 w-2 rounded-full ${editionStyle.badgeDot} animate-pulse`} />
                                    <span>{editionStyle.label}</span>
                                </span>
                                {licenseInfo?.isTrial && (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                                        <Clock size={13} />
                                        <span>
                                            {isRtl
                                                ? `متبقي ${licenseInfo?.daysRemaining ?? 0} يوماً`
                                                : `${licenseInfo?.daysRemaining ?? 0} days remaining`}
                                        </span>
                                    </span>
                                )}
                            </div>
                            <h2 className="mt-2 text-xl font-black text-slate-950 dark:text-white sm:text-2xl">
                                {isRtl ? 'ترخيص النظام وهيكل الميزات' : 'System License & Feature Entitlements'}
                            </h2>
                            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400 sm:text-sm">
                                {isRtl
                                    ? 'إدارة فئة الترخيص الحالية، متابعة حصص النسخة التجريبية، ترقية المفتاح، والربط العتادي للخادم.'
                                    : 'Manage edition entitlements, monitor trial usage quotas, activate signed keys, and review hardware bindings.'}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                        <button
                            type="button"
                            onClick={() => { refetchInfo(); refetchQuota(); }}
                            disabled={isLoadingInfo || isLoadingQuota}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-4 text-xs font-bold text-slate-700 shadow-2xs backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <RefreshCw size={14} className={isLoadingInfo || isLoadingQuota ? 'animate-spin' : ''} />
                            <span>{isRtl ? 'تحديث الحالة' : 'Refresh Status'}</span>
                        </button>
                    </div>
                </div>

                {/* Details Strip */}
                <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                            <Building2 size={16} />
                            <span className="text-xs font-bold">{isRtl ? 'اسم العميل / المركز' : 'Customer ID'}</span>
                        </div>
                        <p className="mt-2 font-mono text-sm font-black text-slate-900 dark:text-white break-words">
                            {licenseInfo?.customerId || 'DEVELOPER'}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                            <Calendar size={16} />
                            <span className="text-xs font-bold">{isRtl ? 'تاريخ الانتهاء' : 'Expires At'}</span>
                        </div>
                        <p className="mt-2 font-mono text-sm font-black text-slate-900 dark:text-white">
                            {licenseInfo?.expiresAt ? new Date(licenseInfo.expiresAt).toLocaleDateString(i18n.language) : (isRtl ? 'دائم (غير محدد)' : 'Perpetual')}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                            <Users size={16} />
                            <span className="text-xs font-bold">{isRtl ? 'المستخدمون المتاحون' : 'User Seats'}</span>
                        </div>
                        <p className="mt-2 font-mono text-sm font-black text-slate-900 dark:text-white">
                            {licenseInfo?.maxUsers && licenseInfo.maxUsers > 0 ? `${licenseInfo.maxUsers} ${isRtl ? 'مستخدمين' : 'seats'}` : (isRtl ? 'غير محدود' : 'Unlimited')}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                            <Layers size={16} />
                            <span className="text-xs font-bold">{isRtl ? 'الموديولات النشطة' : 'Active Modules'}</span>
                        </div>
                        <p className="mt-2 font-mono text-sm font-black text-slate-900 dark:text-white">
                            {licenseInfo?.allowedModules?.includes('*') ? (isRtl ? 'كافة الموديولات (شامل)' : 'All Modules (Full)') : `${licenseInfo?.allowedModules?.length || 0} ${isRtl ? 'موديول' : 'modules'}`}
                        </p>
                    </div>
                </div>
            </section>

            {/* Trial Quota HUD (Rendered when in Trial) */}
            {licenseInfo?.isTrial && (
                <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                    <header className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20 shadow-2xs">
                                <Clock size={18} />
                            </span>
                            <div>
                                <h3 className="text-sm font-bold text-slate-950 dark:text-white">
                                    {isRtl ? 'استهلاك حصص النسخة التجريبية (Trial Quotas)' : 'Trial Usage Quotas'}
                                </h3>
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                    {isRtl ? 'الحدود القصوى للبيانات في النسخة التجريبية قبل الحاجة للترقية.' : 'Operational resource limits enforced during evaluation mode.'}
                                </p>
                            </div>
                        </div>
                        <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-xs font-black text-amber-800 dark:text-amber-300">
                            {isRtl ? 'نظام الحصص المباشر' : 'Live Quotas'}
                        </span>
                    </header>

                    <div className="p-6">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {[
                                {
                                    key: 'patients',
                                    label: isRtl ? 'سجلات المرضى' : 'Registered Patients',
                                    stat: quotaStats?.patients || { current: 0, limit: 50, percent: 0 },
                                    unit: isRtl ? 'مريض' : 'patients'
                                },
                                {
                                    key: 'appointments',
                                    label: isRtl ? 'المواعيد هذا الشهر' : 'Appointments / Month',
                                    stat: quotaStats?.appointments || { current: 0, limit: 100, percent: 0 },
                                    unit: isRtl ? 'موعد' : 'appts'
                                },
                                {
                                    key: 'users',
                                    label: isRtl ? 'المستخدمون النشطون' : 'Active Staff Seats',
                                    stat: quotaStats?.users || { current: 0, limit: 3, percent: 0 },
                                    unit: isRtl ? 'مستخدم' : 'users'
                                },
                                {
                                    key: 'reports',
                                    label: isRtl ? 'التقارير اليومية' : 'Reports / Day',
                                    stat: quotaStats?.reports || { current: 0, limit: 10, percent: 0 },
                                    unit: isRtl ? 'تقرير' : 'reports'
                                },
                            ].map((item) => {
                                const pct = Math.min(100, Math.max(0, item.stat.percent || Math.round((item.stat.current / (item.stat.limit || 1)) * 100)));
                                const isWarning = pct >= 80;
                                const isExceeded = pct >= 100;
                                const barColor = isExceeded ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-teal-500';

                                return (
                                    <div key={item.key} className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-bold text-slate-700 dark:text-slate-300">{item.label}</span>
                                            <span className="font-mono font-bold text-slate-500 dark:text-slate-400">
                                                {item.stat.current} / {item.stat.limit} {item.unit}
                                            </span>
                                        </div>
                                        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                            <div
                                                className={`h-full transition-all duration-500 ${barColor}`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <div className="mt-2 flex items-center justify-between text-[11px]">
                                            <span className="text-slate-400">{pct}% {isRtl ? 'مستهلك' : 'consumed'}</span>
                                            {isExceeded && (
                                                <span className="font-bold text-red-600 dark:text-red-400">{isRtl ? 'تم بلوغ الحد' : 'Limit reached'}</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>
            )}

            {/* Hardware Binding & Machine Fingerprint */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                <header className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/20 shadow-2xs">
                            <Cpu size={18} />
                        </span>
                        <div>
                            <h3 className="text-sm font-bold text-slate-950 dark:text-white">
                                {isRtl ? 'بصمة عتاد الخادم (Hardware Fingerprint)' : 'Server Hardware Fingerprint'}
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                {isRtl
                                    ? 'بصمة مشفرة فريدة مبنية على المعالج وبطاقات الشبكة، تستخدم لقفل التراخيص على هذا الخادم.'
                                    : 'Cryptographic SHA-256 fingerprint used to lock perpetual and enterprise licenses to this physical server.'}
                            </p>
                        </div>
                    </div>
                </header>

                <div className="p-6 space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex-1 rounded-2xl border border-slate-200 bg-slate-100/80 p-3.5 font-mono text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 break-all select-all">
                            {licenseInfo?.fingerprint || (isRtl ? 'جار حساب البصمة...' : 'Calculating fingerprint...')}
                        </div>
                        <button
                            type="button"
                            onClick={handleCopyFingerprint}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 text-xs font-bold text-white shadow-sm transition hover:bg-teal-500 shrink-0"
                        >
                            {copiedFingerprint ? <Check size={16} /> : <Copy size={16} />}
                            <span>{copiedFingerprint ? (isRtl ? 'تم النسخ!' : 'Copied!') : (isRtl ? 'نسخ البصمة' : 'Copy Fingerprint')}</span>
                        </button>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        💡 {isRtl
                            ? 'عند طلب ترخيص دائم أو ترقية لمؤسسة، أرسل هذه البصمة لفريق الدعم لربط الترخيص بخادمكم حصراً.'
                            : 'Send this fingerprint to support/sales when requesting a locked on-premises license.'}
                    </p>
                </div>
            </section>

            {/* License Key Activation & Upgrade */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                <header className="flex items-center justify-between border-b border-slate-200/80 bg-slate-50/50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/20 shadow-2xs">
                            <Key size={18} />
                        </span>
                        <div>
                            <h3 className="text-sm font-bold text-slate-950 dark:text-white">
                                {isRtl ? 'تفعيل أو ترقية مفتاح الترخيص' : 'Activate or Upgrade License Key'}
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                {isRtl
                                    ? 'ارفع ملف الترخيص (.txt) أو الصق المفتاح لتفعيله فورياً في الذاكرة دون إعادة تشغيل الخادم.'
                                    : 'Upload a signed license (.txt) or paste key directly to activate instantly without restarting.'}
                            </p>
                        </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-800 dark:text-teal-300">
                        <Sparkles size={13} />
                        <span>{isRtl ? 'تفعيل حي' : 'Hot Activation'}</span>
                    </span>
                </header>

                <div className="p-6 space-y-5">
                    {/* Drag & Drop File Zone */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        accept=".txt"
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files?.[0])}
                    />
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                            isDragOver
                                ? 'border-teal-500 bg-teal-500/10'
                                : 'border-slate-300 bg-slate-50/50 hover:border-teal-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30 dark:hover:border-teal-500'
                        }`}
                    >
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                            <UploadCloud size={24} />
                        </div>
                        <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">
                            {isRtl ? 'اضغط لاختيار ملف الترخيص (.txt) أو اسحبه وأفلته هنا' : 'Click to select license file (.txt) or drag & drop here'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {isRtl ? 'الملف الصادر من VIARA مشفر وموقّع رقمياً' : 'Official signed license file issued by VIARA'}
                        </p>
                    </div>

                    {/* Textarea Key Input */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {isRtl ? 'أو الصق رمز مفتاح الترخيص المشفر (Base64)' : 'Or paste encoded license key directly (Base64)'}
                        </label>
                        <textarea
                            rows={3}
                            value={licenseKeyInput}
                            onChange={(e) => {
                                setLicenseKeyInput(e.target.value);
                                setInspectionResult(null);
                            }}
                            placeholder={isRtl ? 'الصق المفتاح المشفر هنا (يبدأ بـ eyJ...)' : 'Paste license key string here (starts with eyJ...)'}
                            className="w-full rounded-2xl border border-slate-200 bg-white p-3.5 font-mono text-xs text-slate-800 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        />
                    </div>

                    {/* Inspection Result Preview */}
                    {inspectionResult && (
                        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
                            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                                <CheckCircle2 size={18} />
                                <span>{isRtl ? 'معاينة الترخيص المعتمد — جاهز للتفعيل' : 'Valid Signed License Preview — Ready for Activation'}</span>
                            </div>
                            <div className="grid gap-3 text-xs sm:grid-cols-3">
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">{isRtl ? 'الإصدار:' : 'Edition:'}</span>
                                    <p className="font-bold text-slate-900 dark:text-white uppercase">{inspectionResult.edition}</p>
                                </div>
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">{isRtl ? 'العميل:' : 'Customer:'}</span>
                                    <p className="font-bold text-slate-900 dark:text-white font-mono">{inspectionResult.customerId}</p>
                                </div>
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">{isRtl ? 'المدة المتبقية:' : 'Days Remaining:'}</span>
                                    <p className="font-bold text-slate-900 dark:text-white">
                                        {inspectionResult.daysRemaining !== null ? `${inspectionResult.daysRemaining} ${isRtl ? 'يوم' : 'days'}` : (isRtl ? 'دائم' : 'Perpetual')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleInspect}
                            disabled={!licenseKeyInput.trim() || isInspecting}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-4 text-xs font-bold text-slate-700 shadow-2xs backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
                        >
                            <Sparkles size={14} className={isInspecting ? 'animate-spin' : 'text-teal-500'} />
                            <span>{isInspecting ? (isRtl ? 'جار التحقق...' : 'Inspecting...') : (isRtl ? 'معاينة وفحص المفتاح' : 'Inspect Key Details')}</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleActivate}
                            disabled={!licenseKeyInput.trim() || isActivating}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 text-xs font-bold text-white shadow-sm transition hover:bg-teal-500 disabled:opacity-50"
                        >
                            <Key size={14} className={isActivating ? 'animate-spin' : ''} />
                            <span>{isActivating ? (isRtl ? 'جار التفعيل والتثبيت...' : 'Activating...') : (isRtl ? 'تفعيل المفتاح الآن' : 'Activate License Now')}</span>
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
}
