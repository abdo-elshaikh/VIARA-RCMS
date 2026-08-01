import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    Activity, AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, CheckCircle2,
    ClipboardList, Contact, Copy, Database, Edit3, FileText, HeartPulse, KeyRound,
    Mail, MapPin, Phone, Plus, Receipt, RefreshCw, ShieldCheck, Stethoscope,
    UserRound, Printer, Download, Eye,
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
    Merged: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300',
    Restricted: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300',
};

const fieldClass = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-600 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';
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
    <section className="relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:border-slate-800/60 dark:bg-slate-900/50">
        <header className="relative flex items-start justify-between gap-4 overflow-hidden border-b border-slate-100/50 bg-slate-50/50 px-6 py-5 dark:border-slate-800/50 dark:bg-slate-900/30">
            {/* Subtle background glow that flips logically in RTL */}
            <div className="absolute -top-10 -start-10 h-32 w-32 rounded-full bg-cyan-500/10 blur-3xl dark:bg-cyan-500/5"></div>
            <div className="relative flex items-start gap-4 z-10">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/20 to-teal-500/20 text-cyan-700 shadow-inner ring-1 ring-cyan-200/50 dark:text-cyan-400">
                    <Icon size={18} />
                </span>
                <div>
                    <h2 className="text-sm font-black tracking-wide text-slate-900 dark:text-white">{title}</h2>
                    {description && <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>}
                </div>
            </div>
            {action && <div className="relative z-10">{action}</div>}
        </header>
        <div className="p-6 relative z-10">{children}</div>
    </section>
);

const InfoGrid = ({ items, empty = '-' }) => (
    <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(([label, value, wide]) => (
            <div key={label} className={`group ${wide ? 'sm:col-span-2 xl:col-span-3' : ''}`}>
                <dt className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400 transition-colors group-hover:text-cyan-600 dark:group-hover:text-cyan-400">{label}</dt>
                <dd className="mt-2 break-words text-sm font-bold text-slate-800 dark:text-slate-200">{value || empty}</dd>
            </div>
        ))}
    </dl>
);

const Metric = ({ icon: Icon, label, value, detail, tone = 'cyan' }) => {
    const tones = {
        cyan: 'from-cyan-500/10 to-transparent text-cyan-700 dark:from-cyan-500/20 dark:text-cyan-300 ring-cyan-500/20 bg-cyan-50/50 dark:bg-cyan-950/20',
        emerald: 'from-emerald-500/10 to-transparent text-emerald-700 dark:from-emerald-500/20 dark:text-emerald-300 ring-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20',
        amber: 'from-amber-500/10 to-transparent text-amber-700 dark:from-amber-500/20 dark:text-amber-300 ring-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20',
        violet: 'from-violet-500/10 to-transparent text-violet-700 dark:from-violet-500/20 dark:text-violet-300 ring-violet-500/20 bg-indigo-50/50 dark:bg-indigo-950/20'
    };
    return (
        <article className="group relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white/70 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:border-slate-800/60 dark:bg-slate-900/50">
            <div className={`absolute inset-0 bg-gradient-to-br ${tones[tone]} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}></div>
            <div className="relative flex items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400">{label}</p>
                    <p className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">{value}</p>
                </div>
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-1 transition-transform duration-300 group-hover:scale-110 ltr:group-hover:rotate-3 rtl:group-hover:-rotate-3 ${tones[tone]}`}>
                    <Icon size={20} />
                </span>
            </div>
            <p className="relative mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">{detail}</p>
        </article>
    );
};

const SnapshotFact = ({ label, value }) => (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 shadow-inner dark:border-slate-800/80 dark:bg-slate-950/30 transition-all hover:bg-white dark:hover:bg-slate-900">
        <p className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400">{label}</p>
        <p className="mt-1.5 truncate text-xs font-bold text-slate-800 dark:text-slate-200">{value || '-'}</p>
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
        <article className={`group relative overflow-hidden rounded-3xl border p-5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] backdrop-blur-xl transition-all duration-300 hover:shadow-md ${tones[tone] || tones.slate}`}>
            <div className="absolute -start-4 -top-4 h-16 w-16 rounded-full bg-white/40 blur-2xl dark:bg-black/20 group-hover:bg-white/60 dark:group-hover:bg-black/40 transition-colors"></div>
            <div className="relative flex items-start gap-4">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/90 text-current shadow-sm ring-1 ring-inset dark:bg-slate-950/50 transition-transform duration-300 group-hover:scale-110 ltr:group-hover:rotate-3 rtl:group-hover:-rotate-3`}>
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

const VisitSignal = ({ icon: Icon, label, value, detail }) => (
    <article className="group relative rounded-3xl border border-slate-200/60 bg-white/70 p-5 shadow-sm backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-teal-200/80 dark:border-slate-800/60 dark:bg-slate-900/50 dark:hover:border-teal-800/80">
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">{label}</p>
                <p className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white">{value}</p>
            </div>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-teal-100 shadow-inner transition-transform duration-300 group-hover:scale-110 group-hover:bg-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900/60 dark:group-hover:bg-teal-900/60">
                <Icon size={20} />
            </span>
        </div>
        <p className="mt-3 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">{detail}</p>
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

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const PatientDetailPage = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const user = useSelector(selectCurrentUser);
    const { t, i18n } = useTranslation(['patientDetail', 'patients', 'common']);
    const isRtl = i18n.dir() === 'rtl';
    const [activeTab, setActiveTab] = useState('overview');
    const [editing, setEditing] = useState(false);
    const [policyForm, setPolicyForm] = useState(emptyPolicy);
    const [expandedVisitId, setExpandedVisitId] = useState(null);
    const [isExportingWord, setIsExportingWord] = useState(false);
    const [credentialDialog, setCredentialDialog] = useState(null);

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

    if (isLoading) return <div className="grid gap-4"><div className="h-56 animate-pulse rounded-3xl bg-slate-200 dark:bg-slate-800" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />)}</div></div>;
    if (error || !patient) return <div className="rounded-3xl border border-red-200 bg-white p-10 text-center dark:border-red-900 dark:bg-slate-900"><AlertTriangle className="mx-auto text-red-500" size={34} /><h1 className="mt-4 text-xl font-black text-slate-900 dark:text-white">{t('page.notFound')}</h1><p className="mt-2 text-sm text-slate-500">{getErrorMessage(error, t('page.loadError'))}</p><Button className="mt-5" onClick={() => navigate('/patients')}>{t('page.back')}</Button></div>;

    const fullName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim();
    const latestAppointment = history[0];
    const alerts = [patient.allergies && [t('fields.allergies'), patient.allergies], patient.implants_devices && [t('fields.implants'), patient.implants_devices], patient.renal_function_notes && [t('fields.renal'), patient.renal_function_notes], ['Pregnant', 'Possibly Pregnant'].includes(patient.pregnancy_status) && [t('fields.pregnancy'), patient.pregnancy_status]].filter(Boolean);
    const completion = profileCompleteness(patient);
    const age = calculateAge(patient.date_of_birth);
    const contactReady = Boolean(patient.phone || patient.email);
    const portalReady = Boolean(patient.password_hash || patient.portal_enabled);
    const deliveredReports = history.filter(item => item.delivered_at || item.last_result_delivery_at || String(item.latest_delivery_status || '').toLowerCase() === 'delivered').length;
    const finalizedReports = history.filter(item => item.report_content || /final|approved|signed|completed/i.test(String(item.report_status || ''))).length;
    const pendingReports = Math.max(history.length - finalizedReports, 0);
    const paidVisits = history.filter(item => Number(item.payment_amount || 0) > 0).length;
    const translateVisitStatus = value => value ? t(`visitDetail.statuses.${value}`, { defaultValue: value }) : '-';
    const translateReportStatus = value => value ? t(`visitDetail.reportStatuses.${value}`, { defaultValue: value }) : '-';
    const translatePaymentMethod = value => value ? t(`visitDetail.paymentMethods.${value}`, { defaultValue: value }) : '-';
    const translateDeliveryStatus = value => value ? t(`visitDetail.deliveryStatuses.${value}`, { defaultValue: value }) : t('visitDetail.notDelivered');

    const handleInvoice = async () => { try { await createInvoice({ patientId, appointmentId: latestAppointment?.appointment_id }).unwrap(); toast.success(t('invoiceCreated')); } catch (e) { toast.error(getErrorMessage(e, t('invoiceError'))); } };
    const handlePassword = async () => {
        try {
            const result = await generatePassword(patientId).unwrap();
            setCredentialDialog({
                title: t('page.credentialsTitle'),
                portalLabel: t('portal'),
                subjectLabel: t('fields.fullName'),
                subjectName: fullName,
                identifierLabel: 'MRN',
                identifier: result.mrn,
                password: result.portalPassword,
                loginUrl: getPatientPortalLoginUrl(),
                deliveryHint: t('page.credentialsHint')
            });
        } catch (e) {
            toast.error(getErrorMessage(e, t('policyError')));
        }
    };
    const handlePolicy = async event => { event.preventDefault(); try { await createPolicy({ patientId, ...policyForm }).unwrap(); toast.success(t('policyAdded')); setPolicyForm(emptyPolicy); } catch (e) { toast.error(getErrorMessage(e, t('policyError'))); } };

    return <div className="app-page pb-10">
        
        <PageHeader
            icon={UserRound}
            eyebrow={t('page.record')}
            title={fullName}
            description={`${t('detail.registered', { ns: 'patients' })} ${formatDate(patient.created_at)}`}
            meta={(
                <>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-300 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/20">{getInitials(patient)}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusStyles[patient.patient_status || 'Active']}`}>{t(`status.${patient.patient_status || 'Active'}`)}</span>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-mono font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">{patient.mrn}</span>
                    {patient.phone && <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><Phone size={13} />{patient.phone}</span>}
                    {patient.email && <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><Mail size={13} />{patient.email}</span>}
                    {patient.address && <span className="inline-flex max-w-sm items-center gap-1.5 truncate rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><MapPin size={13} />{patient.address}</span>}
                </>
            )}
            actions={(
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:justify-end">
                    <Button variant="secondary" onClick={() => navigate(`/appointments/new?patientId=${patientId}`)}><Plus size={15} />{t('book')}</Button>
                    {canOperate && <>
                        <Button variant="secondary" onClick={() => setEditing(true)}><Edit3 size={15} />{t('detail.edit', { ns: 'patients' })}</Button>
                        <Button variant="secondary" onClick={handlePassword} loading={isGeneratingPassword}><KeyRound size={15} />{t('page.portal')}</Button>
                        <Button onClick={handleInvoice} disabled={!latestAppointment} loading={isCreatingInvoice}><Receipt size={15} />{t('createInvoice')}</Button>
                    </>}
                    <button type="button" onClick={refetch} aria-label={t('page.refresh')} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-teal-300"><RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} /></button>
                </div>
            )}
        />

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white/70 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl dark:border-slate-800/60 dark:bg-slate-900/50">
                <div className="absolute -top-20 -end-20 h-64 w-64 rounded-full bg-gradient-to-br from-teal-500/10 to-cyan-500/10 blur-3xl dark:from-teal-500/5 dark:to-cyan-500/5"></div>
                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between z-10">
                    <div className="flex min-w-0 items-start gap-5">
                        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-teal-500 to-cyan-500 text-2xl font-black text-white shadow-xl shadow-teal-500/20 ring-1 ring-white/20 transition-transform hover:scale-105">
                            {getInitials(patient)}
                        </span>
                        <div className="min-w-0 pt-1">
                            <div className="flex flex-wrap items-center gap-3">
                                <h2 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">{t('page.recordSnapshot', { defaultValue: 'Patient record snapshot' })}</h2>
                                <span className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider shadow-sm ${statusStyles[patient.patient_status || 'Active']}`}>{t(`status.${patient.patient_status || 'Active'}`, { ns: 'patients' })}</span>
                            </div>
                            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500 dark:text-slate-400">
                                {t('page.snapshotHelp', { defaultValue: 'Operational identity, contact readiness, safety flags, and latest activity before opening detailed tabs.' })}
                            </p>
                            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                <SnapshotFact label="MRN" value={patient.mrn} />
                                <SnapshotFact label={t('fields.dob')} value={age == null ? formatDate(patient.date_of_birth) : t('page.ageWithDob', { age, dob: formatDate(patient.date_of_birth), defaultValue: '{{age}} years · {{dob}}' })} />
                                <SnapshotFact label={t('fields.gender')} value={patient.gender ? t(`gender.${patient.gender}`) : t('fallback.unknown')} />
                                <SnapshotFact label={t('stats.lastVisit')} value={summary.last_visit ? formatDate(summary.last_visit, true) : t('stats.never')} />
                            </div>
                        </div>
                    </div>
                    <div className="relative min-w-[240px] shrink-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-slate-50/80 p-5 shadow-inner dark:border-slate-800/80 dark:bg-slate-950/30 transition-all hover:bg-white dark:hover:bg-slate-900">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-black uppercase tracking-[.15em] text-slate-400">{t('page.completeness')}</p>
                            <p className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">{completion}%</p>
                        </div>
                        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200/80 shadow-inner dark:bg-slate-800/80">
                            <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 shadow-sm transition-all duration-1000" style={{ width: `${Math.min(100, Math.max(0, completion))}%` }} />
                        </div>
                        <p className="mt-4 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">{completion >= 80 ? t('page.profileReady') : t('page.profileNeedsData')}</p>
                    </div>
                </div>
            </div>

            <aside className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <ReadinessCard
                    icon={contactReady ? CheckCircle2 : Phone}
                    label={t('page.contactReadiness', { defaultValue: 'Contact readiness' })}
                    value={contactReady ? t('page.ready', { defaultValue: 'Ready' }) : t('page.needsData', { defaultValue: 'Needs data' })}
                    detail={patient.phone || patient.email || t('page.noContactRoute', { defaultValue: 'No phone or email recorded' })}
                    tone={contactReady ? 'emerald' : 'amber'}
                />
                <ReadinessCard
                    icon={alerts.length ? AlertTriangle : ShieldCheck}
                    label={t('page.safetyStatus', { defaultValue: 'Safety status' })}
                    value={alerts.length ? t('page.reviewAlerts') : t('page.noAlerts')}
                    detail={alerts.length ? t('page.alertCount', { count: alerts.length, defaultValue: '{{count}} active alerts' }) : t('page.clearForScheduling', { defaultValue: 'No safety blockers recorded' })}
                    tone={alerts.length ? 'amber' : 'emerald'}
                />
                <ReadinessCard
                    icon={KeyRound}
                    label={t('page.portalStatus', { defaultValue: 'Portal status' })}
                    value={portalReady ? t('page.enabled', { defaultValue: 'Enabled' }) : t('page.notEnabled', { defaultValue: 'Not enabled' })}
                    detail={portalReady ? t('page.portalReady', { defaultValue: 'Patient can use portal credentials' }) : t('page.generatePortalHint', { defaultValue: 'Generate credentials when needed' })}
                    tone={portalReady ? 'cyan' : 'slate'}
                />
            </aside>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={CalendarDays} label={t('stats.visits')} value={summary.visit_count || 0} detail={summary.last_visit ? `${t('stats.lastVisit')}: ${formatDate(summary.last_visit)}` : t('stats.never')} /><Metric icon={Receipt} tone="emerald" label={t('stats.spent')} value={`${formatMoney(summary.total_spent)} ${t('currency.egp')}`} detail={t('page.financialSummary')} /><Metric icon={CheckCircle2} tone="violet" label={t('page.completeness')} value={`${completion}%`} detail={completion >= 80 ? t('page.profileReady') : t('page.profileNeedsData')} /><Metric icon={AlertTriangle} tone="amber" label={t('page.alerts')} value={alerts.length} detail={alerts.length ? t('page.reviewAlerts') : t('page.noAlerts')} /></section>

        <nav aria-label={t('page.sections')} className="sticky top-2 z-20 flex gap-2 overflow-x-auto rounded-3xl border border-slate-200/60 bg-white/70 p-2 shadow-[0_4px_20px_rgb(0,0,0,0.03)] backdrop-blur-2xl dark:border-slate-800/60 dark:bg-slate-900/50 scrollbar-hide">
            {tabs.map(({ key, icon: Icon }) => (
                <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={`relative inline-flex h-10 shrink-0 items-center gap-2.5 rounded-2xl px-5 text-xs font-black transition-all duration-300 ${
                        activeTab === key
                            ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-lg shadow-cyan-500/25 ring-1 ring-white/20'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                    }`}
                >
                    <Icon size={16} className={activeTab === key ? 'animate-pulse' : 'transition-transform group-hover:scale-110'} />
                    {t(`detail.tabs.${key}`, { ns: 'patients' })}
                </button>
            ))}
        </nav>

        {activeTab === 'overview' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]"><div className="space-y-5"><Panel icon={UserRound} title={t('sections.personal')}><InfoGrid items={[[t('fields.fullName'), fullName], [t('fields.dob'), formatDate(patient.date_of_birth)], [t('fields.gender'), t(`gender.${patient.gender}`)], [t('fields.nationalId'), patient.national_id], [t('fields.passport'), patient.passport_number], [t('fields.status'), t(`status.${patient.patient_status || 'Active'}`)]]} /></Panel><Panel icon={Contact} title={t('sections.contact')}><InfoGrid items={[[t('fields.phone'), patient.phone], [t('detail.email', { ns: 'patients' }), patient.email], [t('fields.address'), patient.address, true], [t('fields.emergencyContact'), patient.emergency_contact_name], [t('fields.emergencyPhone'), patient.emergency_contact_phone], [t('detail.relationship', { ns: 'patients' }), patient.emergency_contact_relationship]]} /></Panel></div><div className="space-y-5"><Panel icon={AlertTriangle} title={t('page.clinicalAlerts')} description={t('page.clinicalAlertsHelp')}>{alerts.length ? <div className="space-y-2">{alerts.map(([label, value]) => <div key={label} className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-400/10"><p className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">{label}</p><p className="mt-1 text-sm font-semibold text-amber-950 dark:text-amber-100">{value}</p></div>)}</div> : <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300"><CheckCircle2 size={20} /><p className="text-sm font-bold">{t('page.noAlerts')}</p></div>}</Panel><Panel icon={Mail} title={t('page.communication')}><InfoGrid items={[[t('detail.preferredLanguage', { ns: 'patients' }), patient.preferred_language], [t('detail.preference', { ns: 'patients' }), patient.communication_preference], [t('detail.assignedManager', { ns: 'patients' }), patient.assigned_manager_name]]} /></Panel></div></div>}

        {activeTab === 'medical' && <Panel icon={Stethoscope} title={t('sections.medical')} description={t('page.medicalHelp')}><InfoGrid empty={t('fallback.none')} items={[[t('fields.allergies'), patient.allergies], [t('fields.diseases'), patient.chronic_diseases], [t('fields.surgeries'), patient.prior_surgeries], [t('fields.pregnancy'), patient.pregnancy_status], [t('fields.implants'), patient.implants_devices], [t('fields.renal'), patient.renal_function_notes]]} /></Panel>}

        {activeTab === 'visits' && (
            <Panel icon={CalendarDays} title={t('tabs.overview')} description={t('page.visitHelp')}>
                {history.length === 0 ? (
                    <EmptyState title={t('history.empty')} />
                ) : (
                    <div className="space-y-5">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <VisitSignal icon={CalendarDays} label={t('stats.visits')} value={history.length.toLocaleString(locale)} detail={t('page.visitSignalTotal', { defaultValue: 'Appointments in this record' })} />
                            <VisitSignal icon={FileText} label={t('page.finalizedReports', { defaultValue: 'Finalized reports' })} value={finalizedReports.toLocaleString(locale)} detail={t('page.pendingReports', { count: pendingReports, defaultValue: '{{count}} pending or undocumented' })} />
                            <VisitSignal icon={CheckCircle2} label={t('results.delivered')} value={deliveredReports.toLocaleString(locale)} detail={t('page.deliveredReportsHint', { defaultValue: 'Reports delivered to patient or partner' })} />
                            <VisitSignal icon={Receipt} label={t('page.paidVisits', { defaultValue: 'Paid visits' })} value={paidVisits.toLocaleString(locale)} detail={t('page.paidVisitsHint', { defaultValue: 'Visits with recorded patient payment' })} />
                        </div>

                        <div className="relative space-y-4 before:absolute before:bottom-4 before:start-4 before:top-4 before:w-px before:bg-slate-200/80 dark:before:bg-slate-800/80">
                            {history.map((item, index) => {
                                const isExpanded = expandedVisitId === item.appointment_id;
                                return (
                                    <article
                                        key={item.appointment_id}
                                        className="group relative ms-10 rounded-3xl border border-slate-200/60 bg-white/70 p-5 shadow-[0_4px_20px_rgb(0,0,0,0.02)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-teal-200/80 dark:border-slate-800/60 dark:bg-slate-900/50 dark:hover:border-teal-800/80"
                                    >
                                    <span className={`absolute -start-[30px] top-6 flex h-3 w-3 items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-950 ${index === 0 ? 'bg-gradient-to-br from-teal-400 to-cyan-500 shadow-sm' : 'bg-slate-200 dark:bg-slate-700'}`}>
                                        {index === 0 && <span className="absolute h-full w-full animate-ping rounded-full bg-teal-400/50"></span>}
                                    </span>

                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <h3 className="text-sm font-black text-slate-900 transition-colors group-hover:text-teal-700 dark:text-white dark:group-hover:text-teal-400">
                                                {item.exam_type_name || item.machine_name || t('detail.appointment', { ns: 'patients' })}
                                            </h3>
                                             <p className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-slate-500">
                                                 <span className="rounded-md bg-slate-100 px-2 py-0.5 dark:bg-slate-800">{item.machine_name}</span>
                                                 <span aria-hidden="true" className="opacity-50">&bull;</span>
                                                 <span className="text-slate-600 dark:text-slate-300">{translateVisitStatus(item.status)}</span>
                                             </p>
                                             {item.is_follow_up && (
                                                 <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-sky-100 bg-sky-50 px-2 py-1 text-[10px] font-black uppercase text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-400">
                                                     {t('visitDetail.followUp')} <span aria-hidden="true" className="opacity-50">&bull;</span> {item.prior_order_number || t('visitDetail.priorStudy')}
                                                 </p>
                                             )}
                                        </div>
                                        <time className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-1.5 text-xs font-bold text-slate-500 shadow-inner dark:border-slate-800 dark:bg-slate-950/50">{formatDate(item.start_time, true)}</time>
                                    </div>

                                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-[10px] font-bold">
                                        <div className="flex flex-wrap gap-2">
                                            <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                {formatMoney(item.payment_amount)} {t('currency.egp')} <span aria-hidden="true" className="opacity-40">&bull;</span> {translatePaymentMethod(item.payment_method)}
                                            </span>
                                            {item.report_status && (
                                                <span className="inline-flex items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 py-1.5 text-blue-700 shadow-sm dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
                                                    {t('results.report')}: {translateReportStatus(item.report_status)}
                                                </span>
                                            )}
                                            {item.delivered_at && (
                                                <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-emerald-700 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                                                    {t('results.delivered')}
                                                </span>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setExpandedVisitId(isExpanded ? null : item.appointment_id)}
                                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-700 shadow-sm transition-all hover:border-teal-200 hover:text-teal-700 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-teal-800 dark:hover:text-teal-400"
                                        >
                                            <FileText size={14} className={isExpanded ? "text-teal-500" : "text-slate-400 group-hover:text-teal-500"} />
                                            {isExpanded ? t('visitDetail.hideDetails') : t('visitDetail.viewDetails')}
                                        </button>
                                    </div>

                                    {/* Expanded Details and Report Accordion */}
                                    {isExpanded && (
                                        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4 animate-in slide-in-from-top-2 duration-200 dark:border-slate-800">
                                            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 text-xs">
                                                {item.is_follow_up && (
                                                    <div className="sm:col-span-2 md:col-span-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900/60 dark:bg-sky-950/20">
                                                        <dt className="text-[10px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-300">{t('visitDetail.followUpContext')}</dt>
                                                        <dd className="mt-1 font-semibold text-slate-700 dark:text-slate-300">
                                                            {[item.prior_exam_type_name || t('visitDetail.priorStudy'), item.prior_order_number, item.prior_exam_time ? formatDate(item.prior_exam_time) : null].filter(Boolean).join(' · ')}
                                                        </dd>
                                                        {item.follow_up_reason && <dd className="mt-1.5 whitespace-pre-wrap text-slate-500 dark:text-slate-400">{item.follow_up_reason}</dd>}
                                                    </div>
                                                )}
                                                <div>
                                                    <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('visitDetail.clinicalIndication')}</dt>
                                                    <dd className="mt-1 font-semibold text-slate-700 dark:text-slate-300">{item.clinical_indication || '-'}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('visitDetail.provisionalDiagnosis')}</dt>
                                                    <dd className="mt-1 font-semibold text-slate-700 dark:text-slate-300">{item.provisional_diagnosis || '-'}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('visitDetail.modalityBodyPart')}</dt>
                                                    <dd className="mt-1 font-semibold text-slate-700 dark:text-slate-300">{(item.body_part || '-').toUpperCase()}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('visitDetail.contrastInjection')}</dt>
                                                    <dd className="mt-1 font-semibold text-slate-700 dark:text-slate-300">{item.contrast_required ? t('visitDetail.contrastRequired') : t('visitDetail.nonContrast')}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('visitDetail.deliveryStatus')}</dt>
                                                    <dd className="mt-1 font-semibold text-slate-700 dark:text-slate-300">
                                                        {item.latest_delivery_status ? (
                                                            <span>{translateDeliveryStatus(item.latest_delivery_status)}</span>
                                                        ) : (
                                                            t('visitDetail.notDelivered')
                                                        )}
                                                    </dd>
                                                </div>
                                                {item.last_result_delivery_at && (
                                                    <div>
                                                        <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{t('visitDetail.deliveredOn')}</dt>
                                                        <dd className="mt-1 font-semibold text-slate-700 dark:text-slate-300">{formatDate(item.last_result_delivery_at, true)}</dd>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="rounded-xl border border-slate-200/60 dark:border-slate-800 bg-white/50 dark:bg-[#060b13] p-4">
                                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                                        <FileText size={13} className="text-teal-600 dark:text-teal-400" />
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
                                                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-700 shadow-sm transition-all hover:border-teal-200 hover:text-teal-600 active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-900/50 dark:hover:text-teal-400"
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
                                                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-700 shadow-sm transition-all hover:border-teal-200 hover:text-teal-600 active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-900/50 dark:hover:text-teal-400"
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
                                                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-700 shadow-sm transition-all hover:border-teal-200 hover:text-teal-600 active:scale-95 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-900/50 dark:hover:text-teal-400"
                                                                title={t('visitDetail.print')}
                                                            >
                                                                <Printer size={12} />
                                                                <span>{t('visitDetail.print')}</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    exportWord(item);
                                                                }}
                                                                disabled={isExportingWord}
                                                                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-700 shadow-sm transition-all hover:border-teal-200 hover:text-teal-600 active:scale-95 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-900/50 dark:hover:text-teal-400"
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
                                                                        <p className="text-[10px] font-black uppercase tracking-wider text-teal-600 dark:text-teal-400">{t(`visitDetail.sections.${key}`)}</p>
                                                                        <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-250">{value}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        );
                                                    }
                                                    if (item.report_content) {
                                                        return <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium leading-relaxed text-slate-700 dark:border-slate-800/80 dark:bg-slate-900/30 dark:text-slate-200">{item.report_content}</div>;
                                                    }
                                                    return <div className="rounded-xl border border-dashed border-slate-200 bg-white py-6 text-center text-xs font-bold text-slate-400 dark:border-slate-800 dark:bg-slate-900/10">{t('visitDetail.noFindingsText')}</div>;
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                )}
            </Panel>
        )}

        {activeTab === 'insurance' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]"><Panel icon={ShieldCheck} title={t('sections.policies')}>{policies.length === 0 ? <EmptyState title={t('policy.empty')} /> : <div className="grid gap-3 sm:grid-cols-2">{policies.map(policy => <article key={policy.policy_id} className="rounded-2xl border border-cyan-100 bg-cyan-50/50 p-4 dark:border-cyan-900 dark:bg-cyan-400/10"><div className="flex items-start justify-between gap-2"><h3 className="font-black text-cyan-950 dark:text-cyan-100">{policy.provider_name}</h3>{policy.is_primary && <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-cyan-700 dark:bg-slate-900 dark:text-cyan-300">{t('policy.primary')}</span>}</div><p className="mt-3 font-mono text-sm font-bold text-cyan-900 dark:text-cyan-200">{policy.policy_number}</p><p className="mt-1 text-xs text-cyan-700 dark:text-cyan-300">{policy.plan_name || t('policy.noPlan')}</p><p className="mt-3 text-[10px] text-slate-500">{policy.valid_to ? t('policy.validTo', { date: formatDate(policy.valid_to) }) : '-'}</p></article>)}</div>}</Panel>{canOperate && <Panel icon={Plus} title={t('sections.addPolicy')}><form onSubmit={handlePolicy} className="space-y-3"><select className={fieldClass} value={policyForm.providerId} onChange={e => setPolicyForm({ ...policyForm, providerId: e.target.value })} required><option value="">{t('policy.provider')}</option>{providers.map(provider => <option key={provider.provider_id} value={provider.provider_id}>{provider.name}</option>)}</select><Input value={policyForm.policyNumber} onChange={e => setPolicyForm({ ...policyForm, policyNumber: e.target.value })} placeholder={t('policy.number')} required /><Input value={policyForm.memberNumber} onChange={e => setPolicyForm({ ...policyForm, memberNumber: e.target.value })} placeholder={t('policy.member')} /><Input value={policyForm.planName} onChange={e => setPolicyForm({ ...policyForm, planName: e.target.value })} placeholder={t('policy.plan')} /><Input type="date" value={policyForm.validTo} onChange={e => setPolicyForm({ ...policyForm, validTo: e.target.value })} /><label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300"><input type="checkbox" checked={policyForm.isPrimary} onChange={e => setPolicyForm({ ...policyForm, isPrimary: e.target.checked })} />{t('policy.primaryLabel')}</label><Button type="submit" className="w-full" loading={isCreatingPolicy}>{t('policy.add')}</Button></form></Panel>}</div>}
        {activeTab === 'documents' && <DocumentsTab patient={patient} />}
        {activeTab === 'crm' && <PatientCrmTab patient={patient} />}
        {activeTab === 'privacy' && <PrivacyTab patient={patient} />}
        {activeTab === 'audit' && <Panel icon={Database} title={t('detail.tabs.audit', { ns: 'patients' })}><AuditTimeline resourceId={patientId} resourceTable="patients" /></Panel>}
        <EditPatientModal patient={patient} isOpen={editing} onClose={() => setEditing(false)} />
        <CredentialHandoffDialog isOpen={Boolean(credentialDialog)} credentials={credentialDialog} onClose={() => setCredentialDialog(null)} />
    </div>;
};

export default PatientDetailPage;
