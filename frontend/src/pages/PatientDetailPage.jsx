import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    Activity, AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock, History,
    ClipboardList, Contact, Copy, Database, Edit3, FileText, HeartPulse, KeyRound,
    Mail, MapPin, Phone, Plus, Receipt, RefreshCw, ShieldCheck, Stethoscope,
    UserRound, Printer, Download, Eye, EyeOff, Send, ExternalLink, Sparkles,
    Droplets, Zap, Check, MessageCircle, Share2, CheckCircle, AlertCircle, Info,
} from 'lucide-react';
import {
    useCreateInsurancePolicyMutation, useCreateInvoiceMutation,
    useGeneratePortalPasswordMutation, useGetInsurancePoliciesQuery,
    useGetInsuranceProvidersQuery, useGetPatientHistoryQuery,
    useUpdatePatientMutation, useGetCenterSettingsQuery,
} from '../store/api';
import { authenticatedFetch } from '../utils/authenticatedFetch';
import { normalizeCenterSettings } from '../utils/centerSettings';
import { selectCurrentUser } from '../store/authSlice';
import { getErrorMessage } from '../utils/getErrorMessage';
import { hasDeveloperOrAdminRole } from '../utils/roles';
import { getPatientPortalLoginUrl } from '../utils/portalUrls';
import PatientCrmTab from '../components/crm/PatientCrmTab';
import AuditTimeline from '../components/audit/AuditTimeline';
import PrivacyTab from '../components/patient/PrivacyTab';
import DocumentsTab from '../components/patient/DocumentsTab';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import CredentialHandoffDialog from '../components/CredentialHandoffDialog';

const emptyPolicy = { providerId: '', policyNumber: '', memberNumber: '', planName: '', validTo: '', isPrimary: true };

const statusStyles = {
    Active: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300',
    Inactive: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    Deceased: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
    Merged: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/50 dark:bg-cyan-950/30 dark:text-cyan-300',
    Restricted: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300',
};

const fieldClass = 'min-h-11 w-full rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-field)] px-3 text-sm text-[var(--VIARA-ink)] outline-none transition focus:border-[var(--VIARA-accent)] focus:ring-4 focus:ring-[rgba(var(--VIARA-accent-rgb),0.12)]';
const getActiveLocale = () => (
    typeof document !== 'undefined' && document.documentElement.lang?.startsWith('ar') ? 'ar-EG' : undefined
);
const formatMoney = (value, locale = getActiveLocale()) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value) || 0);
const formatDate = (value, withTime = false, locale = getActiveLocale()) => value
    ? new Intl.DateTimeFormat(locale, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(value))
    : '-';

const profileCompleteness = patient => {
    if (!patient) return 0;
    const fields = [patient.first_name, patient.last_name, patient.date_of_birth, patient.gender, patient.phone,
    patient.email, patient.address, patient.national_id || patient.passport_number, patient.emergency_contact_name,
    patient.emergency_contact_phone, patient.preferred_language, patient.communication_preference];
    return Math.round(fields.filter(Boolean).length / fields.length * 100);
};

const getInitials = patient => `${patient?.first_name?.[0] || ''}${patient?.last_name?.[0] || ''}`.toUpperCase() || 'P';

const calculateAge = value => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - date.getFullYear();
    const monthDelta = today.getMonth() - date.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < date.getDate())) age -= 1;
    return age >= 0 ? age : null;
};

const Panel = ({ title, description, icon: Icon, children, action }) => (
    <section className="overflow-hidden rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-sm">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/55 px-5 py-4">
            <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(var(--VIARA-accent-rgb),.2)] bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)]">
                    <Icon size={18} />
                </span>
                <div className="min-w-0">
                    <h2 className="text-sm font-black tracking-wide text-[var(--VIARA-ink)]">{title}</h2>
                    {description && <p className="mt-1 text-xs font-medium leading-relaxed text-[var(--VIARA-muted)]">{description}</p>}
                </div>
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </header>
        <div className="p-5">{children}</div>
    </section>
);

const InfoGrid = ({ items, empty = '-' }) => (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(([label, value, wide]) => (
            <div key={label} className={`group ${wide ? 'sm:col-span-2 xl:col-span-3' : ''}`}>
                <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--VIARA-muted)] transition-colors group-hover:text-[var(--VIARA-accent)]">{label}</dt>
                <dd className="mt-1.5 break-words text-sm font-semibold text-[var(--VIARA-ink)]">{value || empty}</dd>
            </div>
        ))}
    </dl>
);

const Metric = ({ icon: Icon, label, value, detail, tone = 'cyan' }) => {
    const tones = {
        cyan: 'text-[var(--VIARA-accent)] ring-[rgba(var(--VIARA-accent-rgb),.2)] bg-[var(--VIARA-accent-soft)]',
        emerald: 'text-emerald-700 ring-emerald-500/20 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/20',
        amber: 'text-amber-700 ring-amber-500/20 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/20',
        violet: 'text-[var(--info)] ring-[rgba(50,124,146,.2)] bg-[var(--info-bg)] dark:bg-cyan-950/20'
    };
    return (
        <article className="group rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-5 shadow-sm transition hover:border-[rgba(var(--VIARA-accent-rgb),.35)] hover:shadow-md">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--VIARA-muted)]">{label}</p>
                    <p className="mt-2 text-3xl font-black tracking-tight text-[var(--VIARA-ink)]">{value}</p>
                </div>
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ${tones[tone]}`}>
                    <Icon size={20} />
                </span>
            </div>
            <p className="mt-3 text-xs font-semibold text-[var(--VIARA-muted)]">{detail}</p>
        </article>
    );
};

const SnapshotFact = ({ label, value }) => (
    <div className="rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-4 py-3 transition-colors hover:bg-[var(--VIARA-surface-hover)]">
        <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--VIARA-muted)]">{label}</p>
        <p className="mt-1.5 truncate text-xs font-bold text-[var(--VIARA-ink)]">{value || '-'}</p>
    </div>
);

const ReadinessCard = ({ icon: Icon, label, value, detail, tone = 'slate' }) => {
    const tones = {
        emerald: 'border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300 ring-emerald-500/20',
        amber: 'border-amber-200/80 bg-amber-50/80 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300 ring-amber-500/20',
        cyan: 'border-cyan-200/80 bg-cyan-50/80 text-cyan-700 dark:border-cyan-900/50 dark:bg-cyan-950/30 dark:text-cyan-300 ring-cyan-500/20',
        slate: 'border-slate-200/80 bg-white/80 text-slate-600 dark:border-slate-800/80 dark:bg-slate-900/80 dark:text-slate-300 ring-slate-500/20'
    };

    return (
        <article className={`group relative overflow-hidden rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md ${tones[tone] || tones.slate}`}>
            <div className="flex items-start gap-4">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/90 text-current shadow-sm ring-1 ring-inset dark:bg-slate-950/50 transition-transform duration-300 group-hover:scale-110`}>
                    <Icon size={18} />
                </span>
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[.15em] opacity-70">{label}</p>
                    <p className="mt-1.5 text-sm font-black">{value}</p>
                    <p className="mt-1.5 truncate text-xs font-semibold opacity-80 leading-relaxed">{detail}</p>
                </div>
            </div>
        </article>
    );
};

const PortalAccessCard = ({ enabled, mrn, loginUrl, password, canOperate, loading, onActivate, patientPhone, patientName, t }) => {
    const [showPassword, setShowPassword] = useState(false);
    const [copiedField, setCopiedField] = useState(null);

    const copyValue = async (field, value) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopiedField(field);
            toast.success(t('page.copied', { defaultValue: 'تم النسخ' }));
            setTimeout(() => setCopiedField(null), 2000);
        } catch {
            toast.error(t('page.copyFailed', { defaultValue: 'تعذر النسخ' }));
        }
    };

    const shareOnWhatsApp = () => {
        if (!patientPhone) {
            toast.error(t('page.noPhoneForWhatsApp', { defaultValue: 'لا يوجد رقم هاتف مسجل للمريض' }));
            return;
        }
        const cleanPhone = patientPhone.replace(/[^0-9]/g, '');
        const message = `مرحباً ${patientName || ''}،
إليك بيانات الدخول إلى بوابة المرضى الخاصة بمركز طبية للأشعة والتحاليل:
🔗 رابط البوابة: ${loginUrl}
👤 اسم المستخدم (MRN): ${mrn}
🔑 كلمة المرور المؤقتة: ${password || '(تم تفعيل حسابكم مسبقاً)'}

يرجى تسجيل الدخول وتغيير كلمة المرور عند أول استخدام للحفاظ على خصوصيتك.`;

        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank');
    };

    return (
        <article className="rounded-3xl border border-[var(--VIARA-line)] bg-gradient-to-b from-[var(--VIARA-surface)] to-[var(--VIARA-surface-muted)]/50 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)] ring-1 ring-[rgba(var(--VIARA-accent-rgb),.2)]">
                        <KeyRound size={18} />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[.14em] text-[var(--VIARA-muted)]">{t('page.portalStatus')}</p>
                        <p className={`mt-0.5 text-sm font-black ${enabled ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
                            {enabled ? t('page.enabled') : t('page.notEnabled')}
                        </p>
                    </div>
                </div>
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${enabled ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500'}`} aria-hidden="true" />
            </div>

            <div className="mt-4 border-t border-[var(--VIARA-line)] pt-3.5">
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--VIARA-ink)]">{t('page.portalLoginDetails')}</h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--VIARA-muted)]">{t('page.portalLoginDetailsHint')}</p>

                <dl className="mt-3.5 space-y-2.5">
                    <PortalCredentialRow
                        label={t('page.portalLoginId')}
                        value={mrn}
                        actionLabel={t('page.copyLoginId')}
                        isCopied={copiedField === 'mrn'}
                        onCopy={() => copyValue('mrn', mrn)}
                    />
                    <PortalCredentialRow
                        label={t('page.portalLoginUrl')}
                        value={loginUrl}
                        actionLabel={t('page.copyLoginUrl')}
                        isCopied={copiedField === 'url'}
                        onCopy={() => copyValue('url', loginUrl)}
                    />
                    <div>
                        <dt className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--VIARA-muted)]">{t('page.temporaryPassword')}</dt>
                        {password ? (
                            <dd className="mt-1 flex items-center gap-1.5">
                                <code className="min-w-0 flex-1 truncate rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-1.5 font-mono text-xs font-black text-[var(--VIARA-ink)]" dir="ltr">
                                    {showPassword ? password : '\u2022'.repeat(20)}
                                </code>
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(value => !value)}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] transition hover:text-[var(--VIARA-accent)]"
                                    aria-label={showPassword ? t('page.hidePassword') : t('page.showPassword')}
                                >
                                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => copyValue('pass', password)}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] transition hover:text-[var(--VIARA-accent)]"
                                    aria-label={t('page.copyPassword')}
                                >
                                    {copiedField === 'pass' ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                </button>
                            </dd>
                        ) : (
                            <dd className="mt-1 rounded-xl border border-amber-200 bg-amber-50/80 p-2.5 text-xs font-semibold leading-relaxed text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
                                {t('page.passwordUnavailable')}
                            </dd>
                        )}
                    </div>
                </dl>

                <div className="mt-4 grid gap-2">
                    {canOperate && (
                        <Button onClick={onActivate} loading={loading} className="min-h-9 text-xs w-full justify-center">
                            <KeyRound size={14} />
                            {enabled ? t('page.resetPortalAccess') : t('page.activatePortalAccess')}
                        </Button>
                    )}
                    {password && patientPhone && (
                        <button
                            type="button"
                            onClick={shareOnWhatsApp}
                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-600 px-3 text-xs font-bold text-white transition hover:bg-emerald-700 shadow-2xs"
                        >
                            <MessageCircle size={14} />
                            <span>مشاركة البيانات عبر واتساب</span>
                        </button>
                    )}
                    <a
                        href={loginUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-xs font-bold text-[var(--VIARA-ink)] transition hover:border-[rgba(var(--VIARA-accent-rgb),.35)] hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-accent)]"
                    >
                        <span>{t('page.openPortal')}</span>
                        <ArrowRight size={13} className="rtl:rotate-180" />
                    </a>
                </div>
            </div>
        </article>
    );
};

const PortalCredentialRow = ({ label, value, actionLabel, isCopied, onCopy }) => (
    <div>
        <dt className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--VIARA-muted)]">{label}</dt>
        <dd className="mt-1 flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-1.5 font-mono text-xs font-bold text-[var(--VIARA-ink)]" dir="ltr">{value || '-'}</code>
            <button
                type="button"
                onClick={onCopy}
                disabled={!value}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] transition hover:text-[var(--VIARA-accent)] disabled:opacity-40"
                aria-label={actionLabel}
            >
                {isCopied ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Copy size={14} />}
            </button>
        </dd>
    </div>
);

const VisitSignal = ({ icon: Icon, label, value, detail }) => (
    <article className="group rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-5 shadow-sm transition hover:border-[rgba(var(--VIARA-accent-rgb),.35)] hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--VIARA-muted)] transition-colors group-hover:text-[var(--VIARA-accent)]">{label}</p>
                <p className="mt-2 text-3xl font-black tracking-tight text-[var(--VIARA-ink)]">{value}</p>
            </div>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)] ring-1 ring-[rgba(var(--VIARA-accent-rgb),.2)] shadow-sm transition-transform duration-300 group-hover:scale-110">
                <Icon size={20} />
            </span>
        </div>
        <p className="mt-3 text-xs font-semibold leading-relaxed text-[var(--VIARA-muted)]">{detail}</p>
    </article>
);

const EditPatientModal = ({ patient, isOpen, onClose }) => {
    const { t } = useTranslation(['patients', 'patientDetail']);
    const [updatePatient, { isLoading }] = useUpdatePatientMutation();
    const [form, setForm] = useState(null);
    const values = form || {
        firstName: patient.first_name || '', lastName: patient.last_name || '', phone: patient.phone || '',
        email: patient.email || '', address: patient.address || '', patientStatus: patient.patient_status || 'Active',
        allergies: patient.allergies || '', chronicDiseases: patient.chronic_diseases || '',
        implantsDevices: patient.implants_devices || '', renalFunctionNotes: patient.renal_function_notes || '',
    };
    const patch = (key, value) => setForm({ ...values, [key]: value });
    const save = async event => {
        event.preventDefault();
        try {
            await updatePatient({ id: patient.patient_id, ...values }).unwrap();
            toast.success(t('toast.updated', { ns: 'patients' }));
            setForm(null); onClose();
        } catch (error) { toast.error(getErrorMessage(error, t('toast.updateFailed', { ns: 'patients' }))); }
    };
    return <Modal isOpen={isOpen} onClose={onClose} title={t('detail.edit', { ns: 'patients' })} size="wide"><form onSubmit={save} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Input label={t('fields.fullName', { ns: 'patientDetail' })} value={values.firstName} onChange={e => patch('firstName', e.target.value)} required /><Input label={t('modal.fields.lastName', { ns: 'patients' })} value={values.lastName} onChange={e => patch('lastName', e.target.value)} required /><Input label={t('fields.phone', { ns: 'patientDetail' })} value={values.phone} onChange={e => patch('phone', e.target.value)} /><Input type="email" label={t('detail.email', { ns: 'patients' })} value={values.email} onChange={e => patch('email', e.target.value)} /><div className="sm:col-span-2"><Input label={t('fields.address', { ns: 'patientDetail' })} value={values.address} onChange={e => patch('address', e.target.value)} /></div><label className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('detail.status', { ns: 'patients' })}<select className={`${fieldClass} mt-2`} value={values.patientStatus} onChange={e => patch('patientStatus', e.target.value)}>{['Active', 'Inactive', 'Deceased', 'Restricted'].map(value => <option key={value}>{value}</option>)}</select></label><Input label={t('fields.allergies', { ns: 'patientDetail' })} value={values.allergies} onChange={e => patch('allergies', e.target.value)} /><Input label={t('fields.diseases', { ns: 'patientDetail' })} value={values.chronicDiseases} onChange={e => patch('chronicDiseases', e.target.value)} /><Input label={t('fields.implants', { ns: 'patientDetail' })} value={values.implantsDevices} onChange={e => patch('implantsDevices', e.target.value)} /><div className="sm:col-span-2"><Input label={t('fields.renal', { ns: 'patientDetail' })} value={values.renalFunctionNotes} onChange={e => patch('renalFunctionNotes', e.target.value)} /></div></div><div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800"><Button variant="ghost" onClick={onClose}>{t('actions.cancel', { ns: 'common' })}</Button><Button type="submit" loading={isLoading}>{t('actions.save', { ns: 'common' })}</Button></div></form></Modal>;
};

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const PatientDetailPage = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const user = useSelector(selectCurrentUser);
    const { t, i18n } = useTranslation(['patientDetail', 'patients', 'common']);
    const isRtl = i18n.dir() === 'rtl';
    const allowedTabKeys = ['overview', 'medical', 'visits', 'insurance', 'documents', 'crm', 'privacy', 'audit'];
    const requestedTab = searchParams.get('tab');
    const [activeTab, setActiveTab] = useState(() => allowedTabKeys.includes(requestedTab) ? requestedTab : 'overview');
    const [editing, setEditing] = useState(false);
    const [policyForm, setPolicyForm] = useState(emptyPolicy);
    const [expandedVisitId, setExpandedVisitId] = useState(null);
    const [isExportingWord, setIsExportingWord] = useState(false);
    const [credentialDialog, setCredentialDialog] = useState(null);
    const [issuedPortalPassword, setIssuedPortalPassword] = useState('');
    const [selectedVisitIds, setSelectedVisitIds] = useState(new Set());

    const { data: rawCenterSettings } = useGetCenterSettingsQuery();
    const centerSettings = normalizeCenterSettings(rawCenterSettings);
    const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-US';

    const copyReport = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(t('visitDetail.toasts.copied', 'Report copied to clipboard'));
        } catch {
            toast.error(t('visitDetail.toasts.copyFailed', 'Failed to copy report'));
        }
    };

    const normalizeSections = (item) => ({
        clinicalHistory: item.report_sections?.clinicalHistory || item.clinical_indication || '',
        technique: item.report_sections?.technique || '',
        findings: item.report_sections?.findings || '',
        impression: item.report_sections?.impression || '',
        recommendations: item.report_sections?.recommendations || ''
    });

    const openPrintableReport = async (item, autoPrint = false) => {
        try {
            const response = await authenticatedFetch(`${API_BASE}/exams/${item.exam_id}/report/pdf`);
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
            toast.error(getErrorMessage(error, t('visitDetail.toasts.printFailed', 'Failed to open printable report')));
        }
    };

    const exportWord = async (item) => {
        if (isExportingWord) return;
        setIsExportingWord(true);
        try {
            const { exportReportToWord } = await import('../utils/exportReportToWord');
            await exportReportToWord({ exam: item, sections: normalizeSections(item), t, locale, centerSettings });
            toast.success(t('visitDetail.toasts.wordExported', 'Report exported to Word successfully'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('visitDetail.toasts.wordFailed', 'Failed to export report to Word')));
        } finally {
            setIsExportingWord(false);
        }
    };

    const downloadPdf = async (item) => {
        try {
            const response = await authenticatedFetch(`${API_BASE}/exams/${item.exam_id}/report/pdf?format=pdf&disposition=attachment`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            const patientStem = String(item?.patient_name || patient?.first_name || 'Patient').replace(/[^a-zA-Z0-9_\u0600-\u06FF]+/g, '_');
            const examStem = String(item?.exam_type_name || 'Report').replace(/[^a-zA-Z0-9_\u0600-\u06FF]+/g, '_');
            const orderStem = String(item?.order_number || item?.mrn || item.exam_id).replace(/[^a-zA-Z0-9_\u0600-\u06FF]+/g, '_');
            anchor.download = `${patientStem}_${examStem}_${orderStem}.pdf`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
            toast.success(t('messages.pdfDownloaded', { defaultValue: 'PDF downloaded successfully' }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('visitDetail.toasts.downloadFailed', 'Failed to download report PDF')));
        }
    };
    const { data, isLoading, isFetching, error, refetch } = useGetPatientHistoryQuery(patientId, { skip: !patientId });
    const actualData = data?.data || data || {};
    const patient = actualData.patient || {};
    const history = actualData.history || [];
    const summary = actualData.summary || {};
    const hasSystemRole = hasDeveloperOrAdminRole(user?.role);
    const canOperate = hasSystemRole || user?.role === 'Receptionist';
    const canViewInsurance = hasSystemRole || ['Receptionist', 'Nurse'].includes(user?.role);
    const canUseCrm = hasSystemRole || ['Receptionist', 'HR', 'Marketing'].includes(user?.role);
    const { data: policies = [] } = useGetInsurancePoliciesQuery({ patientId }, { skip: !patientId || !canViewInsurance });
    const { data: providers = [] } = useGetInsuranceProvidersQuery(undefined, { skip: !canOperate });
    const [createPolicy, { isLoading: isCreatingPolicy }] = useCreateInsurancePolicyMutation();
    const [createInvoice, { isLoading: isCreatingInvoice }] = useCreateInvoiceMutation();
    const [generatePassword, { isLoading: isGeneratingPassword }] = useGeneratePortalPasswordMutation();

    const tabs = useMemo(() => [
        { key: 'overview', icon: UserRound, show: true }, { key: 'medical', icon: HeartPulse, show: true },
        { key: 'visits', icon: CalendarDays, show: true }, { key: 'insurance', icon: ShieldCheck, show: canViewInsurance },
        { key: 'documents', icon: FileText, show: true }, { key: 'crm', icon: Activity, show: canUseCrm },
        { key: 'privacy', icon: ShieldCheck, show: canOperate }, { key: 'audit', icon: ClipboardList, show: hasDeveloperOrAdminRole(user?.role) },
    ].filter(tab => tab.show), [canOperate, canUseCrm, canViewInsurance, user?.role]);

    const selectTab = key => {
        setActiveTab(key);
        const nextParams = new URLSearchParams(searchParams);
        if (key === 'overview') nextParams.delete('tab');
        else nextParams.set('tab', key);
        setSearchParams(nextParams);
    };

    // Keep deep links and browser back/forward navigation in sync with the selected patient section.
    useEffect(() => {
        const nextTab = tabs.some(tab => tab.key === requestedTab) ? requestedTab : 'overview';
        if (nextTab !== activeTab) setActiveTab(nextTab);
    }, [requestedTab, tabs, activeTab]);

    if (isLoading) return <div className="grid gap-4"><div className="h-44 animate-pulse rounded-2xl bg-[var(--VIARA-surface-muted)]" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-[var(--VIARA-surface-muted)]" />)}</div></div>;
    if (error || !patient) return <div className="rounded-2xl border border-rose-200 bg-[var(--VIARA-surface)] p-10 text-center dark:border-rose-900"><AlertTriangle className="mx-auto text-rose-500" size={34} /><h1 className="mt-4 text-xl font-black text-[var(--VIARA-ink)]">{t('page.notFound')}</h1><p className="mt-2 text-sm text-[var(--VIARA-muted)]">{getErrorMessage(error, t('page.loadError'))}</p><Button className="mt-5" onClick={() => navigate('/patients')}>{t('page.back')}</Button></div>;

    const fullName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim();
    const latestAppointment = history[0];
    const alerts = [patient.allergies && [t('fields.allergies'), patient.allergies], patient.implants_devices && [t('fields.implants'), patient.implants_devices], patient.renal_function_notes && [t('fields.renal'), patient.renal_function_notes], ['Pregnant', 'Possibly Pregnant'].includes(patient.pregnancy_status) && [t('fields.pregnancy'), patient.pregnancy_status]].filter(Boolean);
    const completion = profileCompleteness(patient);
    const age = calculateAge(patient.date_of_birth);
    const contactReady = Boolean(patient.phone || patient.email);
    const portalReady = Boolean(patient.password_hash || patient.portal_enabled);
    const portalLoginUrl = getPatientPortalLoginUrl();
    const deliveredReports = history.filter(item => item.delivered_at || item.last_result_delivery_at || String(item.latest_delivery_status || '').toLowerCase() === 'delivered').length;
    const finalizedReports = history.filter(item => item.report_content || /final|approved|signed|completed/i.test(String(item.report_status || ''))).length;
    const pendingReports = Math.max(history.length - finalizedReports, 0);
    const paidVisits = history.filter(item => Number(item.payment_amount || 0) > 0).length;
    const translateVisitStatus = value => value ? t(`visitDetail.statuses.${value}`, { defaultValue: value }) : '-';
    const translateReportStatus = value => value ? t(`visitDetail.reportStatuses.${value}`, { defaultValue: value }) : '-';
    const translatePaymentMethod = value => value ? t(`visitDetail.paymentMethods.${value}`, { defaultValue: value }) : '-';
    const translateDeliveryStatus = value => value ? t(`visitDetail.deliveryStatuses.${value}`, { defaultValue: value }) : t('visitDetail.notDelivered');

    const toggleSelectVisit = (appointmentId) => {
        setSelectedVisitIds(prev => {
            const next = new Set(prev);
            if (next.has(appointmentId)) {
                next.delete(appointmentId);
            } else {
                next.add(appointmentId);
            }
            return next;
        });
    };

    const handleSelectAllVisits = () => {
        if (selectedVisitIds.size === history.length) {
            setSelectedVisitIds(new Set());
        } else {
            setSelectedVisitIds(new Set(history.map(item => item.appointment_id)));
        }
    };

    const handlePrintSelectedVisits = () => {
        if (selectedVisitIds.size === 0) {
            toast.error(t('billing.selectVisitsFirst', { defaultValue: 'Please select at least one visit to print invoice' }));
            return;
        }
        const appointmentIds = Array.from(selectedVisitIds).join(',');
        const url = `/print/invoice/statement?patientId=${encodeURIComponent(patientId)}&appointmentIds=${encodeURIComponent(appointmentIds)}`;
        window.open(url, '_blank');
    };

    const handlePrintSingleVisitInvoice = (item) => {
        if (item.invoice_id) {
            window.open(`/print/invoice/${encodeURIComponent(item.invoice_id)}`, '_blank');
        } else {
            const url = `/print/invoice/statement?patientId=${encodeURIComponent(patientId)}&appointmentIds=${encodeURIComponent(item.appointment_id)}`;
            window.open(url, '_blank');
        }
    };

    const handleInvoice = async () => { try { await createInvoice({ patientId, appointmentId: latestAppointment?.appointment_id }).unwrap(); toast.success(t('invoiceCreated')); } catch (e) { toast.error(getErrorMessage(e, t('invoiceError'))); } };
    const handlePassword = async () => {
        try {
            const result = await generatePassword(patientId).unwrap();
            const credentials = {
                title: t('page.credentialsTitle'),
                portalLabel: t('portal'),
                subjectLabel: t('fields.fullName'),
                subjectName: fullName,
                subjectPhone: patient.phone,
                subjectEmail: patient.email,
                phone: patient.phone,
                email: patient.email,
                identifierLabel: 'MRN',
                identifier: result.mrn,
                password: result.portalPassword,
                loginUrl: portalLoginUrl,
                deliveryHint: t('page.credentialsHint'),
                recipientType: 'patient',
            };
            setIssuedPortalPassword(result.portalPassword);
            setCredentialDialog(credentials);
            refetch();
        } catch (e) {
            toast.error(getErrorMessage(e, t('policyError')));
        }
    };
    const handlePolicy = async event => { event.preventDefault(); try { await createPolicy({ patientId, ...policyForm }).unwrap(); toast.success(t('policyAdded')); setPolicyForm(emptyPolicy); } catch (e) { toast.error(getErrorMessage(e, t('policyError'))); } };

    return (
        <div className="app-page pb-12 space-y-6">
{/* 1. SHARED PAGE HEADER — identity, record indicators, and actions */}
            <PageHeader
                eyebrow={t('page.eyebrow', { defaultValue: 'ملف المريض الإلكتروني الموحد · Patient Master Record' })}
                EyebrowIcon={Activity}
                leading={
                    <div className="relative shrink-0">
                        <span className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-gradient-to-tr from-[var(--VIARA-accent)] via-teal-600 to-teal-400 text-2xl sm:text-3xl font-black text-white shadow-md ring-4 ring-white/80 dark:ring-slate-800/80">
                            {getInitials(patient)}
                        </span>
                        <span
                            className={`absolute -bottom-1 -end-1 h-5 w-5 rounded-full border-2 border-white dark:border-slate-900 ${patient.patient_status === 'Active' ? 'bg-emerald-500' : 'bg-slate-400'}`}
                            title={t(`status.${patient.patient_status || 'Active'}`)}
                        />
                    </div>
                }
                title={fullName}
                description={`${t('fields.mrn', { defaultValue: 'الرقم الطبي' })}: ${patient.mrn || '—'} ${age != null ? `· ${age} ${t('units.years', { defaultValue: 'سنة' })}` : ''} ${patient.gender ? `· ${t(`gender.${patient.gender}`, { defaultValue: patient.gender })}` : ''}`}
                meta={
                    <>
                        <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-[11px] font-black uppercase tracking-wider ${statusStyles[patient.patient_status || 'Active']}`}>
                            {t(`status.${patient.patient_status || 'Active'}`, { ns: 'patients' })}
                        </span>
                        {alerts.length > 0 ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-black text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300 shadow-2xs animate-pulse">
                                <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400" />
                                {t('page.alertCount', { count: alerts.length, defaultValue: `${alerts.length} active alerts` })}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/90 bg-emerald-50/90 px-3 py-1 text-xs font-black text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 shadow-2xs">
                                <ShieldCheck size={13} className="text-emerald-600 dark:text-emerald-400" />
                                <span>{t('page.noAlerts')}</span>
                            </span>
                        )}
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-[11px] font-bold ${
                            portalReady || issuedPortalPassword
                                ? 'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-900/60 dark:bg-teal-950/40 dark:text-teal-300'
                                : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'
                        }`}>
                            <KeyRound size={12} className={portalReady || issuedPortalPassword ? 'text-teal-600' : 'text-slate-400'} />
                            <span>{portalReady || issuedPortalPassword ? t('page.portalActive', { defaultValue: 'البوابة مفعلة' }) : t('page.portalInactive', { defaultValue: 'البوابة غير مفعلة' })}</span>
                        </span>
                    </>
                }
                metrics={[
                    {
                        key: 'visits',
                        icon: CalendarDays,
                        label: t('stats.visits'),
                        value: history.length.toLocaleString(locale),
                        tone: 'teal',
                        detail: summary.last_visit ? `${t('stats.lastVisit')}: ${formatDate(summary.last_visit)}` : t('stats.never'),
                    },
                    {
                        key: 'spent',
                        icon: Receipt,
                        label: t('stats.spent'),
                        value: `${formatMoney(summary.total_spent)} ${t('currency.egp')}`,
                        tone: 'emerald',
                        detail: `${paidVisits} ${t('page.paidVisits', { defaultValue: 'زيارات مسددة' })}`,
                    },
                    {
                        key: 'reports',
                        icon: FileText,
                        label: t('page.finalizedReports', { defaultValue: 'Finalized reports' }),
                        value: `${finalizedReports.toLocaleString(locale)} / ${history.length.toLocaleString(locale)}`,
                        tone: 'sky',
                        detail: `${deliveredReports} ${t('results.delivered')}`,
                    },
                    {
                        key: 'completeness',
                        icon: alerts.length ? AlertTriangle : ShieldCheck,
                        label: t('page.completeness'),
                        value: `${completion}%`,
                        tone: completion >= 90 ? 'emerald' : completion >= 70 ? 'violet' : 'amber',
                        detail: alerts.length
                            ? t('page.alertCount', { count: alerts.length, defaultValue: `${alerts.length} active alerts` })
                            : (completion >= 80 ? t('page.profileReady') : t('page.profileNeedsData')),
                    },
                ]}
                metricsLabel={t('page.recordIndicators', { defaultValue: 'Patient record indicators' })}
                metricsDefaultVisible={true}
                actions={
                    <>
                        <Button
                            variant="primary"
                            onClick={() => navigate(`/appointments/new?patientId=${patientId}`)}
                            className="shadow-sm hover:shadow"
                        >
                            <Plus size={15} />
                            <span>{t('book')}</span>
                        </Button>
                        {canOperate && (
                            <>
                                <Button variant="secondary" onClick={() => setEditing(true)}>
                                    <Edit3 size={15} />
                                    <span>{t('detail.edit', { ns: 'patients' })}</span>
                                </Button>
                                <Button onClick={handleInvoice} disabled={!latestAppointment} loading={isCreatingInvoice}>
                                    <Receipt size={15} />
                                    <span>{t('createInvoice')}</span>
                                </Button>
                                <Button variant="ghost" onClick={handlePassword} loading={isGeneratingPassword} title={t('page.portalAccessTooltip', { defaultValue: 'إدارة وتسليم بيانات دخول البوابة' })}>
                                    <KeyRound size={15} />
                                    <span>{t('portal', { defaultValue: 'بيانات البوابة' })}</span>
                                </Button>
                            </>
                        )}
                        <button
                            type="button"
                            onClick={refetch}
                            aria-label={t('page.refresh')}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] transition hover:border-[rgba(var(--VIARA-accent-rgb),.35)] hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-accent)]"
                            title={t('page.refresh')}
                        >
                            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
                        </button>
                    </>
                }
            />

            {/* 2. EXECUTIVE CLINICAL DEMOGRAPHICS & QUICK CONTACT STRIP */}
            <section aria-label={t('page.quickDemographics', { defaultValue: 'بيانات الاتصال والهوية السريعة' })} className="rounded-2xl border border-slate-200/80 bg-white/90 p-3.5 backdrop-blur-md shadow-2xs dark:border-slate-800/80 dark:bg-slate-900/90">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-1.5 font-mono font-black text-[var(--VIARA-ink)] shadow-2xs">
                            <ClipboardList size={14} className="text-[var(--VIARA-accent)]" />
                            <span className="text-[10px] font-bold uppercase text-[var(--VIARA-muted)]">MRN:</span>
                            <span className="tracking-wide">{patient.mrn}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-1.5 font-bold text-slate-700 dark:text-slate-300">
                            <CalendarDays size={14} className="text-[var(--VIARA-accent)]" />
                            <span>{age != null ? `${age} سنة (${formatDate(patient.date_of_birth)})` : formatDate(patient.date_of_birth)}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-1.5 font-bold text-slate-700 dark:text-slate-300">
                            <UserRound size={14} className="text-[var(--VIARA-accent)]" />
                            <span>{patient.gender ? t(`gender.${patient.gender}`) : t('fallback.unknown')}</span>
                        </span>
                        {patient.national_id && (
                            <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-2.5 py-1.5 font-mono text-slate-700 dark:text-slate-300">
                                <span className="text-[10px] font-bold text-[var(--VIARA-muted)]">الرقم القومي:</span>
                                <span>{patient.national_id}</span>
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {patient.phone && (
                            <a
                                href={`tel:${patient.phone}`}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 font-mono font-bold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                                dir="ltr"
                            >
                                <Phone size={13} className="text-emerald-600" />
                                <span>{patient.phone}</span>
                            </a>
                        )}
                        {patient.phone && (
                            <a
                                href={`https://wa.me/${patient.phone.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-1.5 font-bold text-teal-800 transition hover:bg-teal-100 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300"
                                title="مراسلة سريعة عبر واتساب"
                            >
                                <MessageCircle size={13} className="text-teal-600" />
                                <span>واتساب</span>
                            </a>
                        )}
                        {patient.email && (
                            <a
                                href={`mailto:${patient.email}`}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50/70 px-3 py-1.5 font-medium text-cyan-800 transition hover:bg-cyan-100 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-300"
                            >
                                <Mail size={13} className="text-cyan-600" />
                                <span className="max-w-[180px] truncate">{patient.email}</span>
                            </a>
                        )}
                    </div>
                </div>
            </section>

            {/* 3. STICKY MODERN TABS BAR */}
            <nav aria-label={t('page.sections')} className="sticky top-2 z-20 flex gap-1.5 overflow-x-auto rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)]/95 backdrop-blur-md p-1.5 shadow-sm scrollbar-hide">
                {tabs.map(({ key, icon: Icon }) => {
                    const isActive = activeTab === key;
                    const count = key === 'visits' ? history.length : key === 'insurance' ? policies.length : null;
                    const hasTabAlert = key === 'medical' && alerts.length > 0;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => selectTab(key)}
                            aria-label={t(`detail.tabs.${key}`, { ns: 'patients' })}
                            aria-current={isActive ? 'page' : undefined}
                            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-xs font-bold transition-all ${isActive
                                ? 'bg-[var(--VIARA-accent)] text-white shadow-sm font-black'
                                : 'text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-surface-muted)] hover:text-[var(--VIARA-ink)]'
                                }`}
                        >
                            <Icon size={16} aria-hidden="true" />
                            <span>{t(`detail.tabs.${key}`, { ns: 'patients' })}</span>
                            {count != null && (
                                <span aria-hidden="true" className={`rounded-full px-2 py-0.5 text-[10px] font-black ${isActive ? 'bg-white/20 text-white' : 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)]'
                                    }`}>
                                    {count}
                                </span>
                            )}
                            {hasTabAlert && (
                                <span aria-hidden="true" className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* 4. MAIN BENTO GRID (ACTIVE TAB CONTENT + SIDE RAIL) */}
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                {/* Main Tab Content */}
                <div className="min-w-0 space-y-6">
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            {/* Quick Clinical Glance Bento */}
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {/* Last Visit Card */}
                                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800/80 dark:bg-slate-900">
                                    <div className="flex items-center justify-between text-xs mb-2">
                                        <span className="flex items-center gap-1.5 font-black uppercase text-teal-800 dark:text-teal-400">
                                            <Clock size={13} />
                                            <span>آخر فحص مسجل</span>
                                        </span>
                                        {latestAppointment?.status && (
                                            <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                                                {latestAppointment.status}
                                            </span>
                                        )}
                                    </div>
                                    {latestAppointment ? (
                                        <div>
                                            <p className="font-black text-slate-900 dark:text-white text-sm truncate">
                                                {latestAppointment.exam_type_name || latestAppointment.machine_name || 'فحص أشعة / تحاليل'}
                                            </p>
                                            <p className="mt-1 text-xs text-slate-500 font-semibold">
                                                {formatDate(latestAppointment.start_time, true)}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => selectTab('visits')}
                                                className="mt-3 text-xs font-bold text-teal-600 hover:text-teal-800 dark:text-teal-400 inline-flex items-center gap-1"
                                            >
                                                <span>عرض تفاصيل الفحص</span>
                                                <ArrowRight size={12} className="rtl:rotate-180" />
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="mt-2 text-xs text-slate-400 font-medium">لا توجد زيارات سابقة مسجلة</p>
                                    )}
                                </div>

                                {/* Insurance Policy Quick Glance */}
                                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800/80 dark:bg-slate-900">
                                    <div className="flex items-center justify-between text-xs mb-2">
                                        <span className="flex items-center gap-1.5 font-black uppercase text-teal-800 dark:text-teal-400">
                                            <ShieldCheck size={13} />
                                            <span>التغطية التأمينية</span>
                                        </span>
                                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                            {policies.length > 0 ? `${policies.length} وثائق` : 'سداد شخصي'}
                                        </span>
                                    </div>
                                    {policies.length > 0 ? (
                                        <div>
                                            <p className="font-black text-slate-900 dark:text-white text-sm truncate">
                                                {policies[0].provider_name}
                                            </p>
                                            <p className="mt-1 font-mono text-xs font-bold text-slate-600 dark:text-slate-300">
                                                {policies[0].policy_number}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => selectTab('insurance')}
                                                className="mt-3 text-xs font-bold text-teal-600 hover:text-teal-800 dark:text-teal-400 inline-flex items-center gap-1"
                                            >
                                                <span>إدارة وثائق التأمين</span>
                                                <ArrowRight size={12} className="rtl:rotate-180" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div>
                                            <p className="font-bold text-slate-700 dark:text-slate-300 text-xs mt-1">سداد شخصي (نقدي / إلكتروني)</p>
                                            {canOperate && (
                                                <button
                                                    type="button"
                                                    onClick={() => selectTab('insurance')}
                                                    className="mt-3 text-xs font-bold text-teal-600 hover:text-teal-800 dark:text-teal-400 inline-flex items-center gap-1"
                                                >
                                                    <Plus size={12} />
                                                    <span>إضافة بوليصة تأمين</span>
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Emergency Contact Quick Card */}
                                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800/80 dark:bg-slate-900">
                                    <div className="flex items-center justify-between text-xs mb-2">
                                        <span className="flex items-center gap-1.5 font-black uppercase text-amber-800 dark:text-amber-400">
                                            <Phone size={13} />
                                            <span>جهة الطوارئ والمرافق</span>
                                        </span>
                                        {patient.emergency_contact_relationship && (
                                            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                                                {patient.emergency_contact_relationship}
                                            </span>
                                        )}
                                    </div>
                                    {patient.emergency_contact_name || patient.emergency_contact_phone ? (
                                        <div>
                                            <p className="font-black text-slate-900 dark:text-white text-sm truncate">
                                                {patient.emergency_contact_name || 'جهة اتصال مسجلة'}
                                            </p>
                                            {patient.emergency_contact_phone && (
                                                <a
                                                    href={`tel:${patient.emergency_contact_phone}`}
                                                    className="mt-1 text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 hover:underline block"
                                                    dir="ltr"
                                                >
                                                    {patient.emergency_contact_phone}
                                                </a>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="mt-2 text-xs text-slate-400 font-medium">لم يتم تسجيل مرافق طوارئ</p>
                                    )}
                                </div>
                            </div>

                            <Panel icon={UserRound} title={t('sections.personal')}>
                                <InfoGrid items={[[t('fields.fullName'), fullName], [t('fields.dob'), formatDate(patient.date_of_birth)], [t('fields.gender'), t(`gender.${patient.gender}`)], [t('fields.nationalId'), patient.national_id], [t('fields.passport'), patient.passport_number], [t('fields.status'), t(`status.${patient.patient_status || 'Active'}`)]]} />
                            </Panel>
                            <Panel icon={Contact} title={t('sections.contact')}>
                                <InfoGrid items={[[t('fields.phone'), patient.phone], [t('detail.email', { ns: 'patients' }), patient.email], [t('fields.address'), patient.address, true], [t('fields.emergencyContact'), patient.emergency_contact_name], [t('fields.emergencyPhone'), patient.emergency_contact_phone], [t('detail.relationship', { ns: 'patients' }), patient.emergency_contact_relationship]]} />
                            </Panel>
                        </div>
                    )}

                    {activeTab === 'medical' && (
                        <div className="space-y-6">
                            {/* Clinical Safety Protocol Header */}
                            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800/80 dark:bg-slate-900">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-600/20 dark:bg-teal-950 dark:text-teal-300">
                                            <Stethoscope size={22} />
                                        </span>
                                        <div>
                                            <h2 className="text-base font-black text-slate-900 dark:text-white">{t('sections.medical')}</h2>
                                            <p className="mt-1 text-xs text-slate-500 font-semibold">{t('page.medicalHelp')}</p>
                                        </div>
                                    </div>
                                    {canOperate && (
                                        <Button variant="secondary" onClick={() => setEditing(true)} className="text-xs">
                                            <Edit3 size={14} />
                                            <span>تحديث السجل الطبي</span>
                                        </Button>
                                    )}
                                </div>

                                {/* Medical Contraindications Bento Grid */}
                                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                                    {/* 1. Allergies & Contrast Safety */}
                                    <div className={`rounded-2xl border p-4 transition-all ${
                                        patient.allergies
                                            ? 'border-rose-300 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/30'
                                            : 'border-emerald-200/80 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                                    }`}>
                                        <div className="flex items-center justify-between text-xs mb-1.5">
                                            <span className="flex items-center gap-1.5 font-black uppercase text-slate-800 dark:text-slate-200">
                                                <Droplets size={14} className={patient.allergies ? 'text-rose-600' : 'text-emerald-600'} />
                                                <span>{t('fields.allergies')} وموانع الصبغة</span>
                                            </span>
                                            <span className={`text-[10px] font-black rounded-md px-2 py-0.5 ${
                                                patient.allergies ? 'bg-rose-200 text-rose-800 dark:bg-rose-900 dark:text-rose-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                                            }`}>
                                                {patient.allergies ? 'تحذير سريري' : 'آمن ومطابق'}
                                            </span>
                                        </div>
                                        <p className={`mt-2 text-sm font-bold leading-relaxed ${patient.allergies ? 'text-rose-950 dark:text-rose-100' : 'text-slate-600 dark:text-slate-300'}`}>
                                            {patient.allergies || 'لا توجد حساسيات دوائية أو تحسس لليود والصبغة مسجلة.'}
                                        </p>
                                    </div>

                                    {/* 2. Implants & MRI Safety */}
                                    <div className={`rounded-2xl border p-4 transition-all ${
                                        patient.implants_devices
                                            ? 'border-amber-300 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30'
                                            : 'border-emerald-200/80 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                                    }`}>
                                        <div className="flex items-center justify-between text-xs mb-1.5">
                                            <span className="flex items-center gap-1.5 font-black uppercase text-slate-800 dark:text-slate-200">
                                                <Zap size={14} className={patient.implants_devices ? 'text-amber-600' : 'text-emerald-600'} />
                                                <span>{t('fields.implants')} وموانع الرنين</span>
                                            </span>
                                            <span className={`text-[10px] font-black rounded-md px-2 py-0.5 ${
                                                patient.implants_devices ? 'bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                                            }`}>
                                                {patient.implants_devices ? 'يلزم فحص التوافق' : 'آمن للرنين (MRI Safe)'}
                                            </span>
                                        </div>
                                        <p className={`mt-2 text-sm font-bold leading-relaxed ${patient.implants_devices ? 'text-amber-950 dark:text-amber-100' : 'text-slate-600 dark:text-slate-300'}`}>
                                            {patient.implants_devices || 'خالٍ من أي منظم لضربات القلب أو صمامات ممغنطة أو شرائح معدنية غير متوافقة.'}
                                        </p>
                                    </div>

                                    {/* 3. Renal Function */}
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 dark:border-slate-800/80 dark:bg-slate-800/40 p-4">
                                        <div className="flex items-center justify-between text-xs mb-1.5">
                                            <span className="flex items-center gap-1.5 font-black uppercase text-slate-800 dark:text-slate-200">
                                                <Activity size={14} className="text-teal-600" />
                                                <span>{t('fields.renal')} والترشيح الكلوي</span>
                                            </span>
                                        </div>
                                        <p className="mt-2 text-sm font-bold leading-relaxed text-slate-800 dark:text-slate-200">
                                            {patient.renal_function_notes || 'وظائف الكلى ضمن النطاق الطبيعي ومؤشر الترشيح يسمح بإجراءات الصبغة.'}
                                        </p>
                                    </div>

                                    {/* 4. Pregnancy & Lactation */}
                                    <div className={`rounded-2xl border p-4 ${
                                        ['Pregnant', 'Possibly Pregnant'].includes(patient.pregnancy_status)
                                            ? 'border-rose-300 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/30'
                                            : 'border-slate-200/80 bg-slate-50/60 dark:border-slate-800/80 dark:bg-slate-800/40'
                                    }`}>
                                        <div className="flex items-center justify-between text-xs mb-1.5">
                                            <span className="flex items-center gap-1.5 font-black uppercase text-slate-800 dark:text-slate-200">
                                                <HeartPulse size={14} className={['Pregnant', 'Possibly Pregnant'].includes(patient.pregnancy_status) ? 'text-rose-600' : 'text-teal-600'} />
                                                <span>{t('fields.pregnancy')} والسلامة الإشعاعية</span>
                                            </span>
                                            {['Pregnant', 'Possibly Pregnant'].includes(patient.pregnancy_status) && (
                                                <span className="text-[10px] font-black rounded-md px-2 py-0.5 bg-rose-200 text-rose-800 dark:bg-rose-900 dark:text-rose-200">
                                                    تنبيه حمل
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-2 text-sm font-bold leading-relaxed text-slate-800 dark:text-slate-200">
                                            {patient.pregnancy_status ? t(`pregnancy.${patient.pregnancy_status}`, { defaultValue: patient.pregnancy_status }) : 'غير حامل / لا تنطبق موانع الحمل'}
                                        </p>
                                    </div>

                                    {/* 5. Chronic Diseases */}
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 dark:border-slate-800/80 dark:bg-slate-800/40 p-4">
                                        <span className="flex items-center gap-1.5 text-xs font-black uppercase text-slate-800 dark:text-slate-200 mb-1.5">
                                            <ClipboardList size={14} className="text-teal-600" />
                                            <span>{t('fields.diseases')}</span>
                                        </span>
                                        <p className="mt-2 text-sm font-bold leading-relaxed text-slate-800 dark:text-slate-200">
                                            {patient.chronic_diseases || t('fallback.none', { defaultValue: 'لا توجد أمراض مزمنة مسجلة' })}
                                        </p>
                                    </div>

                                    {/* 6. Prior Surgeries */}
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 dark:border-slate-800/80 dark:bg-slate-800/40 p-4">
                                        <span className="flex items-center gap-1.5 text-xs font-black uppercase text-slate-800 dark:text-slate-200 mb-1.5">
                                            <History size={14} className="text-teal-600" />
                                            <span>{t('fields.surgeries')}</span>
                                        </span>
                                        <p className="mt-2 text-sm font-bold leading-relaxed text-slate-800 dark:text-slate-200">
                                            {patient.prior_surgeries || t('fallback.none', { defaultValue: 'لا توجد عمليات جراحية سابقة مسجلة' })}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'visits' && (
                        <div className="space-y-4">
                            {/* Visits Command & Batch Print Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-4 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(var(--VIARA-accent-rgb),.2)] bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)]">
                                        <CalendarDays size={18} />
                                    </span>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-sm font-black text-[var(--VIARA-ink)]">
                                                {t('tabs.overview')}
                                            </h2>
                                            <span className="rounded-full bg-[var(--VIARA-accent-soft)] px-2.5 py-0.5 text-xs font-black text-[var(--VIARA-accent)]">
                                                {history.length}
                                            </span>
                                        </div>
                                        <p className="mt-0.5 text-xs font-medium text-[var(--VIARA-muted)]">
                                            {t('page.visitHelp')}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2.5">
                                    <label className="inline-flex items-center gap-2 cursor-pointer select-none rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-2 text-xs font-bold text-[var(--VIARA-ink)] transition hover:bg-[var(--VIARA-surface-hover)]">
                                        <input
                                            type="checkbox"
                                            checked={history.length > 0 && selectedVisitIds.size === history.length}
                                            onChange={handleSelectAllVisits}
                                            className="h-4 w-4 rounded border-slate-300 text-[var(--VIARA-accent)] focus:ring-[var(--VIARA-accent)] cursor-pointer"
                                        />
                                        <span>
                                            {selectedVisitIds.size === history.length
                                                ? t('billing.deselectAll', { defaultValue: 'Deselect all' })
                                                : t('billing.selectAll', { defaultValue: 'Select all' })}
                                        </span>
                                    </label>

                                    {selectedVisitIds.size > 0 && (
                                        <span className="inline-flex items-center rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-black text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
                                            {t('billing.selectedVisitsCount', { count: selectedVisitIds.size, defaultValue: `${selectedVisitIds.size} visits selected` })}
                                        </span>
                                    )}

                                    <Button
                                        type="button"
                                        onClick={handlePrintSelectedVisits}
                                        disabled={selectedVisitIds.size === 0}
                                        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[var(--VIARA-accent)] px-4 text-xs font-bold text-white shadow-sm transition hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <Printer size={15} />
                                        <span>{t('billing.printSelectedVisits', { defaultValue: 'Print Invoice for Selected Visits' })}</span>
                                    </Button>
                                </div>
                            </div>

                            {history.length === 0 ? (
                                <div className="rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-8">
                                    <EmptyState title={t('history.empty')} />
                                </div>
                            ) : (
                                <div className="relative space-y-3.5 before:absolute before:bottom-4 before:start-4 before:top-4 before:w-px before:bg-[var(--VIARA-line)]">
                                    {history.map((item, index) => {
                                        const isExpanded = expandedVisitId === item.appointment_id;
                                        const isSelected = selectedVisitIds.has(item.appointment_id);
                                        return (
                                            <article
                                                key={item.appointment_id}
                                                className={`group relative ms-10 rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${isSelected
                                                    ? 'border-[var(--VIARA-accent)] bg-[var(--VIARA-accent-soft)]/20'
                                                    : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] hover:border-[rgba(var(--VIARA-accent-rgb),.35)]'
                                                    }`}
                                            >
                                                <span className={`absolute -start-[30px] top-6 flex h-3 w-3 items-center justify-center rounded-full ring-4 ring-[var(--VIARA-canvas)] ${index === 0 ? 'bg-[var(--VIARA-accent)]' : 'bg-[var(--VIARA-line-strong)]'}`}>
                                                </span>

                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                    <div className="flex items-start gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleSelectVisit(item.appointment_id)}
                                                            aria-label={`Select visit ${item.exam_type_name || item.appointment_id}`}
                                                            className="mt-1 h-4 w-4 cursor-pointer rounded border-slate-300 text-[var(--VIARA-accent)] focus:ring-[var(--VIARA-accent)]"
                                                        />
                                                        <div>
                                                            <h3 className="text-sm font-black text-[var(--VIARA-ink)] transition-colors group-hover:text-[var(--VIARA-accent)]">
                                                                {item.exam_type_name || item.machine_name || t('detail.appointment', { ns: 'patients' })}
                                                            </h3>
                                                            <p className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-[var(--VIARA-muted)]">
                                                                <span className="rounded-md bg-[var(--VIARA-surface-muted)] px-2 py-0.5">{item.machine_name}</span>
                                                                <span aria-hidden="true" className="opacity-50">&bull;</span>
                                                                <span>{translateVisitStatus(item.status)}</span>
                                                            </p>
                                                            {item.is_follow_up && (
                                                                <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[rgba(var(--VIARA-accent-rgb),.2)] bg-[var(--VIARA-accent-soft)] px-2 py-1 text-[10px] font-black uppercase text-[var(--VIARA-accent)]">
                                                                    {t('visitDetail.followUp')} <span aria-hidden="true" className="opacity-50">&bull;</span> {item.prior_order_number || t('visitDetail.priorStudy')}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <time className="rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-1.5 text-xs font-bold text-[var(--VIARA-muted)]">{formatDate(item.start_time, true)}</time>
                                                </div>

                                                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[10px] font-bold">
                                                    <div className="flex flex-wrap gap-2">
                                                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-3 py-1.5 text-[var(--VIARA-muted)]">
                                                            {formatMoney(item.payment_amount)} {t('currency.egp')} <span aria-hidden="true" className="opacity-40">&bull;</span> {translatePaymentMethod(item.payment_method)}
                                                        </span>
                                                        {item.invoice_number && (
                                                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-teal-700 dark:border-teal-900/40 dark:bg-teal-950/20 dark:text-teal-300 font-mono">
                                                                <Receipt size={11} />
                                                                {item.invoice_number}
                                                            </span>
                                                        )}
                                                        {item.report_status && (
                                                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-1.5 text-cyan-700 dark:border-cyan-900/40 dark:bg-cyan-950/20 dark:text-cyan-300">
                                                                {t('results.report')}: {translateReportStatus(item.report_status)}
                                                            </span>
                                                        )}
                                                        {item.delivered_at && (
                                                            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                                                                {t('results.delivered')}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handlePrintSingleVisitInvoice(item)}
                                                            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-ink)] transition hover:border-[rgba(var(--VIARA-accent-rgb),.35)] hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-accent)]"
                                                            title={t('billing.printVisitInvoice', { defaultValue: 'Print visit invoice' })}
                                                        >
                                                            <Receipt size={14} className="text-slate-400 group-hover:text-teal-500" />
                                                            <span>{t('billing.invoice', { defaultValue: 'Invoice' })}</span>
                                                        </button>
                                                        {item.exam_id && (
                                                            <button
                                                                type="button"
                                                                onClick={() => navigate(`/cases/${encodeURIComponent(item.exam_id)}`, { state: { returnTo: `/patients/${encodeURIComponent(patientId)}?tab=visits` } })}
                                                                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--VIARA-accent)] px-4 text-[10px] font-black uppercase tracking-wider text-white shadow-sm transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)] focus-visible:ring-offset-2"
                                                            >
                                                                <ExternalLink size={14} />
                                                                {t('visitDetail.openCase', { defaultValue: 'Open visit details' })}
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedVisitId(isExpanded ? null : item.appointment_id)}
                                                            aria-expanded={isExpanded}
                                                            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-4 text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-ink)] transition hover:border-[rgba(var(--VIARA-accent-rgb),.35)] hover:bg-[var(--VIARA-accent-soft)] hover:text-[var(--VIARA-accent)]"
                                                        >
                                                            <FileText size={14} className={isExpanded ? "text-teal-500" : "text-slate-400 group-hover:text-teal-500"} />
                                                            {isExpanded ? t('visitDetail.hideDetails') : t('visitDetail.viewDetails')}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Expanded Details and Report Accordion */}
                                                {isExpanded && (
                                                    <div className="mt-4 space-y-4 border-t border-[var(--VIARA-line)] pt-4 animate-in slide-in-from-top-2 duration-200">
                                                        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 text-xs">
                                                            {item.is_follow_up && (
                                                                <div className="sm:col-span-2 md:col-span-3 rounded-xl border border-[rgba(var(--VIARA-accent-rgb),.2)] bg-[var(--VIARA-accent-soft)] p-3">
                                                                    <dt className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-accent)]">{t('visitDetail.followUpContext')}</dt>
                                                                    <dd className="mt-1 font-semibold text-[var(--VIARA-ink)]">
                                                                        {[item.prior_exam_type_name || t('visitDetail.priorStudy'), item.prior_order_number, item.prior_exam_time ? formatDate(item.prior_exam_time) : null].filter(Boolean).join(' · ')}
                                                                    </dd>
                                                                    {item.follow_up_reason && <dd className="mt-1.5 whitespace-pre-wrap text-[var(--VIARA-muted)]">{item.follow_up_reason}</dd>}
                                                                </div>
                                                            )}
                                                            <div>
                                                                <dt className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">{t('visitDetail.clinicalIndication')}</dt>
                                                                <dd className="mt-1 font-semibold text-[var(--VIARA-ink)]">{item.clinical_indication || '-'}</dd>
                                                            </div>
                                                            <div>
                                                                <dt className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">{t('visitDetail.provisionalDiagnosis')}</dt>
                                                                <dd className="mt-1 font-semibold text-[var(--VIARA-ink)]">{item.provisional_diagnosis || '-'}</dd>
                                                            </div>
                                                            <div>
                                                                <dt className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">{t('visitDetail.modalityBodyPart')}</dt>
                                                                <dd className="mt-1 font-semibold text-[var(--VIARA-ink)]">{(item.body_part || '-').toUpperCase()}</dd>
                                                            </div>
                                                            <div>
                                                                <dt className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">{t('visitDetail.contrastInjection')}</dt>
                                                                <dd className="mt-1 font-semibold text-[var(--VIARA-ink)]">{item.contrast_required ? t('visitDetail.contrastRequired') : t('visitDetail.nonContrast')}</dd>
                                                            </div>
                                                            <div>
                                                                <dt className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">{t('visitDetail.deliveryStatus')}</dt>
                                                                <dd className="mt-1 font-semibold text-[var(--VIARA-ink)]">
                                                                    {item.latest_delivery_status ? (
                                                                        <span>{translateDeliveryStatus(item.latest_delivery_status)}</span>
                                                                    ) : (
                                                                        t('visitDetail.notDelivered')
                                                                    )}
                                                                </dd>
                                                            </div>
                                                            {item.last_result_delivery_at && (
                                                                <div>
                                                                    <dt className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">{t('visitDetail.deliveredOn')}</dt>
                                                                    <dd className="mt-1 font-semibold text-[var(--VIARA-ink)]">{formatDate(item.last_result_delivery_at, true)}</dd>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-4">
                                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                                                                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-muted)] flex items-center gap-1.5">
                                                                    <FileText size={13} className="text-[var(--VIARA-accent)]" />
                                                                    {t('visitDetail.findingsTitle')}
                                                                </span>
                                                                {item.report_content && (
                                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                copyReport(item.report_content);
                                                                            }}
                                                                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 text-[10px] font-bold text-[var(--VIARA-ink)] shadow-sm transition-all hover:border-[rgba(var(--VIARA-accent-rgb),.35)] hover:text-[var(--VIARA-accent)] active:scale-95"
                                                                            title={t('visitDetail.copy')}
                                                                        >
                                                                            <Copy size={12} />
                                                                            <span>{t('visitDetail.copy')}</span>
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                openPrintableReport(item, false);
                                                                            }}
                                                                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 text-[10px] font-bold text-[var(--VIARA-ink)] shadow-sm transition-all hover:border-[rgba(var(--VIARA-accent-rgb),.35)] hover:text-[var(--VIARA-accent)] active:scale-95"
                                                                            title={t('visitDetail.view')}
                                                                        >
                                                                            <Eye size={12} />
                                                                            <span>{t('visitDetail.view')}</span>
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                openPrintableReport(item, true);
                                                                            }}
                                                                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 text-[10px] font-bold text-[var(--VIARA-ink)] shadow-sm transition-all hover:border-[rgba(var(--VIARA-accent-rgb),.35)] hover:text-[var(--VIARA-accent)] active:scale-95"
                                                                            title={t('visitDetail.print')}
                                                                        >
                                                                            <Printer size={12} />
                                                                            <span>{t('visitDetail.print')}</span>
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                downloadPdf(item);
                                                                            }}
                                                                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 text-[10px] font-bold text-[var(--VIARA-ink)] shadow-sm transition-all hover:border-[rgba(var(--VIARA-accent-rgb),.35)] hover:text-[var(--VIARA-accent)] active:scale-95"
                                                                            title="Download PDF"
                                                                        >
                                                                            <Download size={12} />
                                                                            <span>PDF</span>
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                exportWord(item);
                                                                            }}
                                                                            disabled={isExportingWord}
                                                                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 text-[10px] font-bold text-[var(--VIARA-ink)] shadow-sm transition-all hover:border-[rgba(var(--VIARA-accent-rgb),.35)] hover:text-[var(--VIARA-accent)] active:scale-95 disabled:opacity-50"
                                                                            title={t('visitDetail.word')}
                                                                        >
                                                                            <Download size={12} />
                                                                            <span>{t('visitDetail.word')}</span>
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {(() => {
                                                                const sections = normalizeSections(item);
                                                                const hasSections = sections.technique || sections.findings || sections.impression || sections.recommendations;
                                                                if (hasSections) {
                                                                    const blocks = [
                                                                        ['clinicalHistory', sections.clinicalHistory],
                                                                        ['technique', sections.technique],
                                                                        ['findings', sections.findings],
                                                                        ['impression', sections.impression],
                                                                        ['recommendations', sections.recommendations],
                                                                    ].filter(([, value]) => value);
                                                                    return (
                                                                        <div className="space-y-3">
                                                                            {blocks.map(([key, value]) => (
                                                                                <div key={key}>
                                                                                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--VIARA-accent)]">{t(`visitDetail.sections.${key}`)}</p>
                                                                                    <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-relaxed text-[var(--VIARA-ink)]">{value}</p>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    );
                                                                }
                                                                if (item.report_content) {
                                                                    return <div className="whitespace-pre-wrap rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-4 text-sm font-medium leading-relaxed text-[var(--VIARA-ink)]">{item.report_content}</div>;
                                                                }
                                                                return <div className="rounded-xl border border-dashed border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] py-6 text-center text-xs font-bold text-[var(--VIARA-muted)]">{t('visitDetail.noFindingsText')}</div>;
                                                            })()}
                                                        </div>
                                                    </div>
                                                )}
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'insurance' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]"><Panel icon={ShieldCheck} title={t('sections.policies')}>{policies.length === 0 ? <EmptyState title={t('policy.empty')} /> : <div className="grid gap-3 sm:grid-cols-2">{policies.map(policy => <article key={policy.policy_id} className="rounded-2xl border border-[rgba(var(--VIARA-accent-rgb),.2)] bg-[var(--VIARA-accent-soft)] p-4"><div className="flex items-start justify-between gap-2"><h3 className="font-black text-[var(--VIARA-ink)]">{policy.provider_name}</h3>{policy.is_primary && <span className="rounded-full bg-[var(--VIARA-surface)] px-2 py-1 text-[9px] font-black text-[var(--VIARA-accent)]">{t('policy.primary')}</span>}</div><p className="mt-3 font-mono text-sm font-bold text-[var(--VIARA-ink)]">{policy.policy_number}</p><p className="mt-1 text-xs text-[var(--VIARA-muted)]">{policy.plan_name || t('policy.noPlan')}</p><p className="mt-3 text-[10px] text-[var(--VIARA-muted)]">{policy.valid_to ? t('policy.validTo', { date: formatDate(policy.valid_to) }) : '-'}</p></article>)}</div>}</Panel>{canOperate && <Panel icon={Plus} title={t('sections.addPolicy')}><form onSubmit={handlePolicy} className="space-y-3"><select className={fieldClass} value={policyForm.providerId} onChange={e => setPolicyForm({ ...policyForm, providerId: e.target.value })} required><option value="">{t('policy.provider')}</option>{providers.map(provider => <option key={provider.provider_id} value={provider.provider_id}>{provider.name}</option>)}</select><Input value={policyForm.policyNumber} onChange={e => setPolicyForm({ ...policyForm, policyNumber: e.target.value })} placeholder={t('policy.number')} required /><Input value={policyForm.memberNumber} onChange={e => setPolicyForm({ ...policyForm, memberNumber: e.target.value })} placeholder={t('policy.member')} /><Input value={policyForm.planName} onChange={e => setPolicyForm({ ...policyForm, planName: e.target.value })} placeholder={t('policy.plan')} /><Input type="date" value={policyForm.validTo} onChange={e => setPolicyForm({ ...policyForm, validTo: e.target.value })} /><label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={policyForm.isPrimary} onChange={e => setPolicyForm({ ...policyForm, isPrimary: e.target.checked })} />{t('policy.primaryLabel')}</label><Button type="submit" className="w-full" loading={isCreatingPolicy}>{t('policy.add')}</Button></form></Panel>}</div>}
                    {activeTab === 'documents' && <DocumentsTab patient={patient} />}
                    {activeTab === 'crm' && <PatientCrmTab patient={patient} />}
                    {activeTab === 'privacy' && <PrivacyTab patient={patient} />}
                    {activeTab === 'audit' && <Panel icon={Database} title={t('detail.tabs.audit', { ns: 'patients' })}><AuditTimeline resourceId={patientId} resourceTable="patients" /></Panel>}
                </div>

                {/* Right Side: Dedicated Clinical & Operational Side Rail */}
                <aside className="space-y-4 ">
                    {/* Safety Status & Clinical Screening Clearance Hub */}
                    <section className={`rounded-3xl border shadow-md transition-all overflow-hidden relative backdrop-blur-xs ${alerts.length
                        ? 'border-amber-300/90 bg-gradient-to-b from-white via-slate-50/50 to-amber-50/20 dark:from-slate-900 dark:via-slate-900/90 dark:to-amber-950/20'
                        : 'border-emerald-200/90 bg-gradient-to-b from-white via-slate-50/50 to-emerald-50/20 dark:from-slate-900 dark:via-slate-900/90 dark:to-emerald-950/20'
                        }`}>
                        {/* Top Official Protocol Clearance Ribbon */}
                        <div className={`px-4 py-2 text-xs font-black flex items-center justify-between shadow-2xs ${alerts.length
                            ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white animate-pulse'
                            : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white'
                            }`}>
                            <div className="flex items-center gap-1.5">
                                {alerts.length ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}
                                <span>{alerts.length ? 'تنبيه سريري: موانع استخدام نشطة' : 'بروتوكول السلامة الإشعاعية والتصوير'}</span>
                            </div>
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold backdrop-blur-xs">
                                {alerts.length ? (
                                    <>
                                        <AlertTriangle size={10} />
                                        <span>يلزم مراجعة الطبيب</span>
                                    </>
                                ) : (
                                    <>
                                        <Check size={10} />
                                        <span>معتمد سريرياً</span>
                                    </>
                                )}
                            </span>
                        </div>

                        {/* Card Subheader: Status Verdict & Context */}
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 p-4 pb-3">
                            <div className="flex items-center gap-2.5">
                                <span className={`flex h-10 w-10 items-center justify-center rounded-2xl shadow-xs ring-4 ${alerts.length
                                    ? 'bg-amber-500/10 text-amber-600 ring-amber-500/10 dark:bg-amber-950/80 dark:text-amber-300'
                                    : 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/10 dark:bg-emerald-950/80 dark:text-emerald-300'
                                    }`}>
                                    {alerts.length ? <AlertTriangle size={20} className="animate-pulse" /> : <ShieldCheck size={20} />}
                                </span>
                                <div>
                                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                        {t('page.safetyStatus', { defaultValue: 'Safety status' })}
                                    </h3>
                                    <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                        {alerts.length ? 'تنبيهات وموانع تستوجب الانتباه قبل الفحص' : 'فحص ومطابقة موانع الرنين والصبغة'}
                                    </p>
                                </div>
                            </div>
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black shadow-2xs border ${alerts.length
                                ? 'bg-amber-100 text-amber-900 border-amber-300/80 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-800 animate-pulse'
                                : 'bg-emerald-100 text-emerald-900 border-emerald-300/80 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-800'
                                }`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${alerts.length ? 'bg-amber-600 animate-ping' : 'bg-emerald-600'}`} />
                                {alerts.length ? (
                                    <span>{alerts.length} موانع نشطة</span>
                                ) : (
                                    <span>آمن ومؤكد (CLEARED)</span>
                                )}
                            </span>
                        </div>

                        {/* Screening Checklist & Clinical Safety Matrix */}
                        <div className="p-4 space-y-2.5">
                            {alerts.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="text-[11px] font-bold text-amber-900 dark:text-amber-200 leading-snug">
                                        يرجى مراجعة موانع الاستخدام التالية قبل التصوير أو إعطاء الصبغة:
                                    </p>
                                    {alerts.map(([label, value]) => (
                                        <div key={label} className="rounded-2xl border border-amber-300/80 bg-amber-50/50 p-3 text-xs shadow-2xs dark:border-amber-700/80 dark:bg-amber-950/40">
                                            <span className="flex items-center gap-1.5 font-black text-amber-800 dark:text-amber-300 text-[10px] uppercase tracking-wider">
                                                <AlertTriangle size={12} className="text-amber-600" />
                                                <span>{label}</span>
                                            </span>
                                            <span className="font-bold text-slate-900 dark:text-slate-100 mt-1 block leading-relaxed">
                                                {value}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {/* Item 1: Contrast Media & Drug Allergies */}
                                    <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-white/90 dark:bg-slate-800/80 p-3 shadow-2xs transition hover:border-emerald-300/60">
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <span className="flex h-6 w-6 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                                                    <Droplets size={13} />
                                                </span>
                                                <span className="font-bold text-slate-800 dark:text-slate-200">حساسية الصبغة والأدوية</span>
                                            </div>
                                            <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200/50 dark:border-emerald-800/40">
                                                لا توجد موانع
                                            </span>
                                        </div>
                                        <p className="mt-1.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 ps-8">
                                            خالٍ من أي تحسس لليود أو الجادولينيوم (Iodine/Gad Safe)
                                        </p>
                                    </div>

                                    {/* Item 2: Implants / Pacemaker / MRI Safety */}
                                    <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-white/90 dark:bg-slate-800/80 p-3 shadow-2xs transition hover:border-emerald-300/60">
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <span className="flex h-6 w-6 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                                                    <Zap size={13} />
                                                </span>
                                                <span className="font-bold text-slate-800 dark:text-slate-200">الغرسات والشرائح المعدنية</span>
                                            </div>
                                            <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200/50 dark:border-emerald-800/40">
                                                آمن للرنين (MRI Safe)
                                            </span>
                                        </div>
                                        <p className="mt-1.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 ps-8">
                                            خالٍ من منظم ضربات القلب أو الشظايا الممغنطة
                                        </p>
                                    </div>

                                    {/* Item 3: Renal & Pregnancy */}
                                    <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-white/90 dark:bg-slate-800/80 p-3 shadow-2xs transition hover:border-emerald-300/60">
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <span className="flex h-6 w-6 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
                                                    <HeartPulse size={13} />
                                                </span>
                                                <span className="font-bold text-slate-800 dark:text-slate-200">وظائف الكلى والحمل</span>
                                            </div>
                                            <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200/50 dark:border-emerald-800/40">
                                                مطابق سريرياً
                                            </span>
                                        </div>
                                        <p className="mt-1.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 ps-8">
                                            معدل الترشيح الكلوي وموانع الحمل ضمن النطاق الآمن
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Jump to Medical Tab Action Button */}
                            <button
                                type="button"
                                onClick={() => selectTab('medical')}
                                className="group w-full mt-2 inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 py-2.5 px-4 text-xs font-black text-slate-700 dark:text-slate-200 hover:text-teal-600 dark:hover:text-teal-400 hover:border-teal-300 dark:hover:border-teal-700 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 transition-all duration-200 shadow-2xs"
                            >
                                <Stethoscope size={14} className="text-teal-600 dark:text-teal-400 group-hover:scale-110 transition-transform" />
                                <span>عرض أو تحديث السجل الطبي</span>
                                <ArrowRight size={13} className="rtl:rotate-180 opacity-60 group-hover:opacity-100 group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5 transition-all" />
                            </button>
                        </div>
                    </section>

                    {/* Portal Access Card */}
                    <PortalAccessCard
                        enabled={portalReady || Boolean(issuedPortalPassword)}
                        mrn={patient.mrn}
                        loginUrl={portalLoginUrl}
                        password={issuedPortalPassword}
                        canOperate={canOperate}
                        loading={isGeneratingPassword}
                        onActivate={handlePassword}
                        patientPhone={patient.phone}
                        patientName={fullName}
                        t={t}
                    />

                    {/* Communication Readiness & Preferences */}
                    <section className="rounded-3xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-5 shadow-sm">
                        <div className="flex items-center gap-2.5 mb-3">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)]">
                                <Mail size={15} />
                            </span>
                            <div>
                                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--VIARA-ink)]">{t('page.communication')}</h3>
                                <p className="text-[10px] font-semibold text-[var(--VIARA-muted)]">{contactReady ? t('page.ready') : t('page.needsData')}</p>
                            </div>
                        </div>
                        <dl className="space-y-2.5 text-xs">
                            <div className="flex items-center justify-between border-b border-[var(--VIARA-line)] pb-2">
                                <dt className="text-[10px] font-bold text-[var(--VIARA-muted)]">{t('detail.preferredLanguage', { ns: 'patients' })}</dt>
                                <dd className="font-bold text-[var(--VIARA-ink)]">{patient.preferred_language || '-'}</dd>
                            </div>
                            <div className="flex items-center justify-between border-b border-[var(--VIARA-line)] pb-2">
                                <dt className="text-[10px] font-bold text-[var(--VIARA-muted)]">{t('detail.preference', { ns: 'patients' })}</dt>
                                <dd className="font-bold text-[var(--VIARA-ink)]">{patient.communication_preference || '-'}</dd>
                            </div>
                            <div className="flex items-center justify-between">
                                <dt className="text-[10px] font-bold text-[var(--VIARA-muted)]">{t('detail.assignedManager', { ns: 'patients' })}</dt>
                                <dd className="font-bold text-[var(--VIARA-ink)]">{patient.assigned_manager_name || '-'}</dd>
                            </div>
                        </dl>
                    </section>
                </aside>
            </div>

            <EditPatientModal patient={patient} isOpen={editing} onClose={() => setEditing(false)} />
            <CredentialHandoffDialog isOpen={Boolean(credentialDialog)} credentials={credentialDialog} onClose={() => setCredentialDialog(null)} />
        </div>
    );
};

export default PatientDetailPage;
