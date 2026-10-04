import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
    Activity,
    AlertTriangle,
    ChevronDown,
    Download,
    Edit3,
    Eye,
    FilterX,
    Mail,
    MapPin,
    Phone,
    Plus,
    Save,
    Search,
    SlidersHorizontal,
    Trash2,
    Upload,
    User,
    UsersRound,
    X,
    Shield,
    HeartPulse,
    PhoneCall,
    CheckCircle2,
    Copy,
    Sparkles,
    LayoutGrid,
    List,
    UserCheck,
    UserX,
    Calendar
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useCreatePatientMutation,
    useDeletePatientMutation,
    useGetPatientDuplicatesQuery,
    useGetPatientsQuery,
    useMergePatientsMutation,
    useUpdatePatientMutation
} from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import { hasDeveloperOrAdminRole } from '../utils/roles';
import PatientImportModal from '../components/patient/PatientImportModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import PageHeader from '../components/ui/PageHeader';
import Pagination from '../components/ui/Pagination';
import { selectCurrentUser } from '../store/authSlice';

const emptyPatientForm = {
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    phone: '',
    email: '',
    address: '',
    gender: 'Male',
    nationalId: '',
    passportNumber: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    emergencyContactAddress: '',
    allergies: '',
    chronicDiseases: '',
    priorSurgeries: '',
    pregnancyStatus: 'Unknown',
    implantsDevices: '',
    renalFunctionNotes: '',
    preferredLanguage: 'English',
    communicationPreference: 'Phone',
    consentSms: false,
    consentEmail: false,
    consentWhatsapp: false,
    consentMarketing: false,
    patientStatus: 'Active'
};

const TABLE_COLUMNS = [
    { key: 'mrn', sortable: true },
    { key: 'name', sortable: true },
    { key: 'phone', sortable: false },
    { key: 'email', sortable: false },
    { key: 'date_of_birth', sortable: true },
    { key: 'gender', sortable: false },
    { key: 'patient_status', sortable: false },
    { key: 'created_at', sortable: true },
];

const FILTER_PILLS = ['all', 'recent', 'missingContact', 'missingEmail'];
const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
const STATUS_OPTIONS = ['Active', 'Inactive', 'Deceased', 'Merged', 'Restricted'];
const PAGE_SIZES = [10, 25, 50, 100];

const cleanPayload = form => Object.fromEntries(Object.entries(form).map(([key, value]) => [
    key,
    typeof value === 'string' ? value.trim() : value,
]));

const csvEscape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
const getCellValue = (row, key) => key === 'name'
    ? `${row.first_name || ''} ${row.last_name || ''}`.trim()
    : row[key] ?? '';

const toPatientForm = p => ({
    firstName: p.first_name || '', lastName: p.last_name || '', dateOfBirth: p.date_of_birth || '',
    phone: p.phone || '', email: p.email || '', address: p.address || '', gender: p.gender || 'Male',
    nationalId: p.national_id || '', passportNumber: p.passport_number || '',
    emergencyContactName: p.emergency_contact_name || '', emergencyContactPhone: p.emergency_contact_phone || '',
    emergencyContactRelationship: p.emergency_contact_relationship || '', emergencyContactAddress: p.emergency_contact_address || '',
    allergies: p.allergies || '', chronicDiseases: p.chronic_diseases || '', priorSurgeries: p.prior_surgeries || '',
    pregnancyStatus: p.pregnancy_status || 'Unknown', implantsDevices: p.implants_devices || '',
    renalFunctionNotes: p.renal_function_notes || '', preferredLanguage: p.preferred_language || 'English',
    communicationPreference: p.communication_preference || 'Phone',
    consentSms: Boolean(p.consent_sms), consentEmail: Boolean(p.consent_email),
    consentWhatsapp: Boolean(p.consent_whatsapp), consentMarketing: Boolean(p.consent_marketing),
    patientStatus: p.patient_status || 'Active',
});

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '-';

const calculateAge = (dob) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    if (isNaN(birthDate.getTime())) return null;
    const diff = Date.now() - birthDate.getTime();
    const ageDate = new Date(diff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
};

const copyText = async (value, successMsg, errorMsg) => {
    if (!value) return;
    try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
        await navigator.clipboard.writeText(value);
        toast.success(successMsg);
    } catch {
        toast.error(errorMsg);
    }
};

const SortTh = ({ columnKey, sortConfig, onSort, children }) => {
    const active = sortConfig.key === columnKey;
    return (
        <th className="px-4 py-3.5 text-start">
            <button
                type="button"
                onClick={() => onSort(columnKey)}
                className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
                    active ? 'text-teal-700 dark:text-teal-300' : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'
                }`}
            >
                <span>{children}</span>
                <ChevronDown size={12} className={`transition-transform ${active && sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} />
            </button>
        </th>
    );
};

const CellValue = ({ row, columnKey }) => {
    const { t } = useTranslation('patients');
    const na = <span className="text-slate-400 dark:text-slate-600">-</span>;
    
    if (columnKey === 'name') {
        const age = calculateAge(row.date_of_birth);
        return (
            <div className="flex min-w-0 items-center gap-3">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-black border ${
                    row.gender === 'Female'
                        ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
                        : 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30'
                }`}>
                    {initials(row.name)}
                </span>
                <div className="min-w-0">
                    <p className="truncate font-black text-slate-900 transition group-hover:text-teal-600 dark:text-white dark:group-hover:text-teal-400">
                        {row.name || t('card.unnamed')}
                    </p>
                    <p className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
                        <span>{t(`gender.${row.gender || 'Male'}`)}</span>
                        {age !== null && <span>• {age} {t('yearsOld', { defaultValue: 'yrs' })}</span>}
                    </p>
                </div>
            </div>
        );
    }
    if (columnKey === 'phone') {
        return row.phone ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                <Phone size={11} className="text-teal-600 dark:text-teal-400" />
                {row.phone}
            </span>
        ) : na;
    }
    if (columnKey === 'email') {
        return row.email ? (
            <span className="inline-flex items-center gap-1.5 truncate text-xs font-semibold text-slate-600 dark:text-slate-400 max-w-[170px]">
                <Mail size={11} className="shrink-0 text-slate-400" />
                <span className="truncate">{row.email}</span>
            </span>
        ) : na;
    }
    if (columnKey === 'patient_status') {
        const st = row.patient_status || 'Active';
        const stClass = {
            Active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
            Inactive: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700',
            Restricted: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30',
            Merged: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30',
            Deceased: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30'
        }[st] || 'bg-slate-100 text-slate-700 border-slate-200';
        return (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10.5px] font-black ${stClass}`}>
                {st === 'Active' ? <CheckCircle2 size={11} /> : <UserX size={11} />}
                {t(`status.${st}`)}
            </span>
        );
    }
    if (columnKey === 'mrn') {
        return (
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); copyText(row.mrn, t('mrnCopied'), t('copyFailed')); }}
                className="inline-flex items-center gap-1.5 font-mono text-xs font-black text-teal-700 dark:text-teal-400 hover:underline group/mrn"
                title={t('clickToCopy', { defaultValue: 'Click to copy' })}
            >
                <span>{row.mrn}</span>
                <Copy size={11} className="opacity-0 group-hover/mrn:opacity-100 transition-opacity" />
            </button>
        );
    }
    if (columnKey === 'date_of_birth') {
        return (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400">
                <Calendar size={11} className="text-slate-400" />
                {row.date_of_birth || na}
            </span>
        );
    }
    if (columnKey === 'created_at') {
        return <span className="text-xs font-semibold text-slate-400">{row.created_at ? String(row.created_at).slice(0, 10) : na}</span>;
    }
    return <span className="text-xs text-slate-600 dark:text-slate-300">{row[columnKey] || na}</span>;
};

const PatientRecordCard = ({ row, selected, onSelect, onOpen, onEdit, onDelete, canDelete }) => {
    const { t } = useTranslation('patients');
    const age = calculateAge(row.date_of_birth);

    return (
        <article className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs transition hover:-translate-y-0.5 hover:border-teal-500/40 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/55">
            <div className="flex items-start gap-3 p-4">
                <label className="mt-1 grid h-5 w-5 shrink-0 cursor-pointer place-items-center" onClick={event => event.stopPropagation()}>
                    <span className="sr-only">{t('records.selectPatient', { name: row.name })}</span>
                    <input
                        type="checkbox"
                        checked={selected}
                        onChange={event => onSelect(event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                </label>
                <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 text-start">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border text-xs font-black ${
                        row.gender === 'Female'
                            ? 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                            : 'border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                    }`}>
                        {initials(row.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-black text-slate-950 transition group-hover:text-teal-700 dark:text-white dark:group-hover:text-teal-300">
                            {row.name || t('card.unnamed')}
                        </span>
                        <span className="mt-0.5 block font-mono text-[11px] font-black text-teal-700 dark:text-teal-400" dir="ltr">{row.mrn}</span>
                    </span>
                </button>
                <CellValue row={row} columnKey="patient_status" />
            </div>

            <button type="button" onClick={onOpen} className="grid w-full grid-cols-2 gap-px border-y border-slate-100 bg-slate-100 text-start dark:border-slate-800 dark:bg-slate-800">
                <span className="min-w-0 bg-slate-50/90 p-3 dark:bg-slate-900/80">
                    <span className="block text-[10px] font-black uppercase tracking-wide text-slate-400">{t('card.contact')}</span>
                    <span className="mt-1 flex items-center gap-1.5 truncate text-xs font-bold text-slate-700 dark:text-slate-300" dir="ltr">
                        <Phone size={12} className="shrink-0 text-teal-600" />
                        {row.phone || t('card.noPhone')}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5 truncate text-[11px] font-semibold text-slate-500" dir="ltr">
                        <Mail size={12} className="shrink-0" />
                        {row.email || t('card.noEmail')}
                    </span>
                </span>
                <span className="min-w-0 bg-slate-50/90 p-3 dark:bg-slate-900/80">
                    <span className="block text-[10px] font-black uppercase tracking-wide text-slate-400">{t('card.demographics')}</span>
                    <span className="mt-1 block truncate text-xs font-bold text-slate-700 dark:text-slate-300">
                        {t(`gender.${row.gender || 'Other'}`)}{age !== null ? ` · ${t('card.age', { count: age })}` : ''}
                    </span>
                    <span className="mt-1 block truncate text-[11px] font-semibold text-slate-500" dir="ltr">{row.date_of_birth || t('card.noDob')}</span>
                </span>
            </button>

            <div className="flex items-center justify-between gap-2 p-3">
                <span className="text-[10px] font-bold text-slate-400">
                    {t('card.registered')} · <span dir="ltr">{row.created_at ? String(row.created_at).slice(0, 10) : t('fallback.na')}</span>
                </span>
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={onOpen}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-teal-600 px-3 text-[11px] font-black text-white transition hover:bg-teal-500"
                    >
                        <Eye size={13} />
                        <span>{t('card.view')}</span>
                    </button>
                    <button type="button" onClick={onEdit} className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-teal-500/40 hover:text-teal-700 dark:border-slate-700 dark:text-slate-400" title={t('card.edit')}>
                        <Edit3 size={14} />
                    </button>
                    {canDelete && (
                        <button type="button" onClick={onDelete} className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-rose-500/30 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700 dark:hover:bg-rose-950/30" title={t('card.delete')}>
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            </div>
        </article>
    );
};

const PatientField = ({ label, value, onChange, type = 'text', placeholder = '', error = '', required = false }) => (
    <div>
        <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
            {label} {required && <span className="text-rose-500 font-black">*</span>}
        </label>
        <input
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={`h-10 w-full rounded-xl border bg-white px-3 text-xs font-bold text-slate-800 outline-hidden transition focus:border-teal-500 dark:bg-slate-900 dark:text-slate-200 ${
                error
                    ? 'border-rose-500 focus:border-rose-500 dark:border-rose-500 bg-rose-50/10'
                    : 'border-slate-200/80 dark:border-slate-800'
            }`}
        />
        {error && <p className="mt-1 text-[11px] font-bold text-rose-500">{error}</p>}
    </div>
);

const ConsentCheckbox = ({ label, checked, onChange }) => (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 text-xs font-bold text-slate-700 shadow-2xs transition hover:border-teal-500/40 hover:bg-teal-50/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <input
            type="checkbox"
            checked={Boolean(checked)}
            onChange={e => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
        />
        <span>{label}</span>
    </label>
);

const PatientModal = ({ visible, title, form, setForm, onSave, onCancel, isSaving, duplicatePatients = [], errors = {}, setErrors }) => {
    const { t } = useTranslation('patients');
    const [activeTab, setActiveTab] = useState('demographics');
    const patch = updates => {
        setForm(prev => ({ ...prev, ...updates }));
        if (setErrors) {
            setErrors(prev => {
                const next = { ...prev };
                Object.keys(updates).forEach(k => delete next[k]);
                return next;
            });
        }
    };

    if (!visible) return null;
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                            <User size={19} />
                        </span>
                        <div>
                            <h2 className="text-base font-black text-slate-900 dark:text-white">{title}</h2>
                            <p className="text-xs font-semibold text-slate-400">{t('modal.description')}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        aria-label={t('modal.close')}
                        className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 transition"
                    >
                        <X size={17} />
                    </button>
                </div>

                {/* Sub-Tabs Strip */}
                <div className="grid grid-cols-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 px-3 pt-2">
                    {[
                        { key: 'demographics', icon: User, label: t('modal.sections.identity', 'Demographics') },
                        { key: 'medical', icon: HeartPulse, label: t('modal.sections.medical', 'Medical History') },
                        { key: 'emergency', icon: PhoneCall, label: t('modal.sections.emergency', 'Emergency') },
                        { key: 'communication', icon: Mail, label: t('modal.sections.communication', 'Consents') }
                    ].map(({ key, icon: Icon, label }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setActiveTab(key)}
                            className={`flex items-center justify-center gap-2 border-b-2 py-3 px-2 text-xs font-black transition-all ${
                                activeTab === key
                                    ? 'border-teal-500 text-teal-700 dark:text-teal-300 bg-white dark:bg-slate-900 rounded-t-2xl shadow-xs'
                                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            <Icon size={14} />
                            <span className="truncate">{label}</span>
                        </button>
                    ))}
                </div>

                {/* Modal Body */}
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
                    {duplicatePatients.length > 0 && (
                        <div className="flex gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300">
                            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
                            <div>
                                <p className="font-black">{t('modal.duplicatesFound', 'Matching existing patients found:')}</p>
                                <div className="mt-1 space-y-1">
                                    {duplicatePatients.slice(0, 3).map(p => (
                                        <p key={p.patient_id} className="flex flex-wrap items-center gap-1.5 font-bold">
                                            <span className="font-mono text-teal-700 dark:text-teal-400">{p.mrn}</span>
                                            <span>• {p.first_name} {p.last_name} • {p.phone || '-'}</span>
                                        </p>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 1: DEMOGRAPHICS */}
                    {activeTab === 'demographics' && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <PatientField
                                label={t('modal.fields.firstName')}
                                value={form.firstName}
                                onChange={v => patch({ firstName: v })}
                                placeholder={t('modal.placeholders.firstName')}
                                required
                                error={errors.firstName}
                            />
                            <PatientField
                                label={t('modal.fields.lastName')}
                                value={form.lastName}
                                onChange={v => patch({ lastName: v })}
                                placeholder={t('modal.placeholders.lastName')}
                                required
                                error={errors.lastName}
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <PatientField
                                    label={t('modal.fields.dateOfBirth')}
                                    value={form.dateOfBirth}
                                    onChange={v => patch({ dateOfBirth: v })}
                                    type="date"
                                    required
                                    error={errors.dateOfBirth}
                                />
                                <div>
                                    <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{t('modal.fields.age', { defaultValue: 'Age' })}</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="150"
                                        placeholder="e.g. 35"
                                        value={calculateAge(form.dateOfBirth) ?? ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (!val) {
                                                patch({ dateOfBirth: '' });
                                                return;
                                            }
                                            const ageNum = parseInt(val, 10);
                                            if (!isNaN(ageNum) && ageNum >= 0 && ageNum <= 150) {
                                                const now = new Date();
                                                const birthYear = now.getFullYear() - ageNum;
                                                const month = String(now.getMonth() + 1).padStart(2, '0');
                                                const day = String(now.getDate()).padStart(2, '0');
                                                patch({ dateOfBirth: `${birthYear}-${month}-${day}` });
                                            }
                                        }}
                                        className="h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden transition focus:border-teal-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{t('modal.fields.gender')}</label>
                                <select
                                    value={form.gender}
                                    onChange={e => patch({ gender: e.target.value })}
                                    className="h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden focus:border-teal-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                >
                                    {GENDER_OPTIONS.map(g => <option key={g} value={g}>{t(`gender.${g}`)}</option>)}
                                </select>
                            </div>
                            <PatientField label={t('modal.fields.nationalId')} value={form.nationalId} onChange={v => patch({ nationalId: v })} placeholder={t('modal.placeholders.nationalId')} />
                            <PatientField label={t('modal.fields.passportNumber')} value={form.passportNumber} onChange={v => patch({ passportNumber: v })} placeholder={t('modal.placeholders.passportNumber')} />
                            <PatientField
                                label={t('modal.fields.phone')}
                                value={form.phone}
                                onChange={v => patch({ phone: v })}
                                placeholder={t('modal.placeholders.phone')}
                                required
                                error={errors.phone}
                            />
                            <PatientField label={t('modal.fields.email')} value={form.email} onChange={v => patch({ email: v })} type="email" placeholder={t('modal.placeholders.email')} />
                            <div className="sm:col-span-2">
                                <PatientField label={t('modal.fields.address')} value={form.address} onChange={v => patch({ address: v })} placeholder={t('modal.placeholders.address')} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{t('modal.fields.patientStatus')}</label>
                                <select
                                    value={form.patientStatus}
                                    onChange={e => patch({ patientStatus: e.target.value })}
                                    className="h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden focus:border-teal-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                >
                                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: MEDICAL HISTORY */}
                    {activeTab === 'medical' && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <PatientField label={t('modal.fields.allergies')} value={form.allergies} onChange={v => patch({ allergies: v })} placeholder={t('modal.placeholders.allergies')} />
                            <PatientField label={t('modal.fields.chronicDiseases')} value={form.chronicDiseases} onChange={v => patch({ chronicDiseases: v })} placeholder={t('modal.placeholders.chronicDiseases')} />
                            <PatientField label={t('modal.fields.priorSurgeries')} value={form.priorSurgeries} onChange={v => patch({ priorSurgeries: v })} placeholder={t('modal.placeholders.priorSurgeries')} />
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{t('modal.fields.pregnancyStatus')}</label>
                                <select
                                    value={form.pregnancyStatus}
                                    onChange={e => patch({ pregnancyStatus: e.target.value })}
                                    className="h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden focus:border-teal-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                >
                                    {['Unknown', 'Not Pregnant', 'Pregnant', 'Possibly Pregnant', 'Not Applicable'].map(s => (
                                        <option key={s} value={s}>{t(`pregnancy.${s}`)}</option>
                                    ))}
                                </select>
                            </div>
                            <PatientField label={t('modal.fields.implantsDevices')} value={form.implantsDevices} onChange={v => patch({ implantsDevices: v })} placeholder={t('modal.placeholders.implantsDevices')} />
                            <PatientField label={t('modal.fields.renalFunctionNotes')} value={form.renalFunctionNotes} onChange={v => patch({ renalFunctionNotes: v })} placeholder={t('modal.placeholders.renalFunctionNotes')} />
                        </div>
                    )}

                    {/* TAB 3: EMERGENCY CONTACT */}
                    {activeTab === 'emergency' && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <PatientField label={t('modal.fields.name')} value={form.emergencyContactName} onChange={v => patch({ emergencyContactName: v })} placeholder={t('modal.placeholders.emergencyName')} />
                            <PatientField label={t('modal.fields.phone')} value={form.emergencyContactPhone} onChange={v => patch({ emergencyContactPhone: v })} placeholder={t('modal.placeholders.phone')} />
                            <PatientField label={t('modal.fields.relationship')} value={form.emergencyContactRelationship} onChange={v => patch({ emergencyContactRelationship: v })} placeholder={t('modal.placeholders.relationship')} />
                            <PatientField label={t('modal.fields.address')} value={form.emergencyContactAddress} onChange={v => patch({ emergencyContactAddress: v })} placeholder={t('modal.placeholders.emergencyAddress')} />
                        </div>
                    )}

                    {/* TAB 4: COMMUNICATION & CONSENTS */}
                    {activeTab === 'communication' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <PatientField label={t('modal.fields.preferredLanguage')} value={form.preferredLanguage} onChange={v => patch({ preferredLanguage: v })} placeholder={t('modal.placeholders.preferredLanguage')} />
                                <div>
                                    <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{t('modal.fields.communicationPreference')}</label>
                                    <select
                                        value={form.communicationPreference}
                                        onChange={e => patch({ communicationPreference: e.target.value })}
                                        className="h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden focus:border-teal-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                    >
                                        {['Phone', 'Email', 'SMS', 'WhatsApp'].map(p => <option key={p} value={p}>{t(`commPreference.${p}`)}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                                <h4 className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">{t('modal.consentsTitle')}</h4>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <ConsentCheckbox label={t('modal.consent.sms', 'SMS Notifications')} checked={form.consentSms} onChange={v => patch({ consentSms: v })} />
                                    <ConsentCheckbox label={t('modal.consent.email', 'Email Portal Messages')} checked={form.consentEmail} onChange={v => patch({ consentEmail: v })} />
                                    <ConsentCheckbox label={t('modal.consent.whatsapp', 'WhatsApp Updates')} checked={form.consentWhatsapp} onChange={v => patch({ consentWhatsapp: v })} />
                                    <ConsentCheckbox label={t('modal.consent.marketing', 'Marketing Consents')} checked={form.consentMarketing} onChange={v => patch({ consentMarketing: v })} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex shrink-0 justify-end gap-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 px-6 py-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-xl border border-slate-200/80 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                    >
                        {t('modal.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-2 text-xs font-black text-white shadow-sm transition hover:bg-teal-500 disabled:opacity-50 active:scale-95"
                    >
                        <Save size={15} />
                        <span>{isSaving ? t('modal.saving') : t('modal.save')}</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

const Patients = () => {
    const { t, i18n } = useTranslation('patients');
    const isArabic = i18n.language === 'ar';
    const navigate = useNavigate();
    const currentUser = useSelector(selectCurrentUser);
    const canRestrictPatient = hasDeveloperOrAdminRole(currentUser?.role);
    const [searchParams, setSearchParams] = useSearchParams();
    const initialSearch = searchParams.get('search') || '';
    const skipSearchParamSync = useRef(false);

    const { data: patientsResponse, isLoading } = useGetPatientsQuery({
        limit: 500,
        search: initialSearch || undefined,
    });
    const [createPatient, { isLoading: isCreating }] = useCreatePatientMutation();
    const [updatePatient, { isLoading: isUpdating }] = useUpdatePatientMutation();
    const [deletePatient, { isLoading: isDeleting }] = useDeletePatientMutation();

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [viewMode, setViewMode] = useState('table'); // 'table' | 'grid'
    const [activeFilter, setActiveFilter] = useState('all');
    const [genderFilter, setGenderFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [selectedIds, setSelectedIds] = useState([]);
    const [editingPatient, setEditingPatient] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [createForm, setCreateForm] = useState(emptyPatientForm);
    const [deleteDraft, setDeleteDraft] = useState(null);
    const [createErrors, setCreateErrors] = useState({});
    const [editErrors, setEditErrors] = useState({});

    const patients = useMemo(() => patientsResponse?.data || [], [patientsResponse?.data]);

    const rows = useMemo(() => patients.map(p => ({
        ...p,
        name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        email: p.email || '',
    })), [patients]);

    const filteredRows = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        const twoWeeks = Date.now() - 14 * 24 * 60 * 60 * 1000;
        return rows.filter(r => {
            const searchable = [r.mrn, r.name, r.phone, r.email, r.address, r.gender, r.patient_status, r.national_id, r.passport_number, r.emergency_contact_name].join(' ').toLowerCase();
            if (q && !searchable.includes(q)) return false;
            if (genderFilter !== 'all' && r.gender !== genderFilter) return false;
            if (statusFilter !== 'all' && r.patient_status !== statusFilter) return false;
            if (activeFilter === 'recent') return new Date(r.created_at).getTime() >= twoWeeks;
            if (activeFilter === 'missingContact') return !r.phone && !r.email;
            if (activeFilter === 'missingEmail') return !r.email;
            return true;
        });
    }, [rows, searchTerm, genderFilter, statusFilter, activeFilter]);

    const sortedRows = useMemo(() => [...filteredRows].sort((a, b) => {
        const compare = String(a[sortConfig.key] || '').localeCompare(String(b[sortConfig.key] || ''), undefined, { numeric: true, sensitivity: 'base' });
        return sortConfig.direction === 'asc' ? compare : -compare;
    }), [filteredRows, sortConfig]);

    const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
    const currentPage = Math.min(page, pageCount);
    const pageStart = (currentPage - 1) * pageSize;
    const paginatedRows = useMemo(() => sortedRows.slice(pageStart, pageStart + pageSize), [sortedRows, pageStart, pageSize]);

    useEffect(() => { setPage(1); }, [activeFilter, genderFilter, searchTerm, statusFilter]);
    useEffect(() => { setPage(p => Math.min(p, pageCount)); }, [pageCount]);
    useEffect(() => {
        if (skipSearchParamSync.current) {
            skipSearchParamSync.current = false;
            return;
        }
        setSearchTerm(initialSearch);
    }, [initialSearch]);
    
    const changeSearch = (value) => {
        setSearchTerm(value);
        if (searchParams.has('search')) {
            skipSearchParamSync.current = true;
            const next = new URLSearchParams(searchParams);
            next.delete('search');
            setSearchParams(next, { replace: true });
        }
    };

    const dupParams = useMemo(() => ({
        phone: createForm.phone.trim() || undefined,
        nationalId: createForm.nationalId.trim() || undefined,
        passportNumber: createForm.passportNumber.trim() || undefined,
        firstName: createForm.firstName.trim() || undefined,
        lastName: createForm.lastName.trim() || undefined,
        dateOfBirth: createForm.dateOfBirth || undefined,
    }), [createForm]);
    const hasDupCriteria = Boolean(dupParams.phone || dupParams.nationalId || dupParams.passportNumber || (dupParams.firstName && dupParams.lastName && dupParams.dateOfBirth));
    const { data: dupResponse } = useGetPatientDuplicatesQuery(dupParams, { skip: !showCreate || !hasDupCriteria });
    const duplicatePatients = dupResponse?.data || [];

    const stats = useMemo(() => {
        const total = rows.length;
        const active = rows.filter(r => (r.patient_status || 'Active') === 'Active').length;
        const recent = rows.filter(r => Date.now() - new Date(r.created_at).getTime() <= 14 * 24 * 60 * 60 * 1000).length;
        const missing = rows.filter(r => !r.phone && !r.email).length;
        const restricted = rows.filter(r => r.patient_status === 'Restricted').length;
        const completeness = total === 0 ? 0 : Math.round(rows.reduce((acc, r) => {
            const fields = [r.first_name, r.last_name, r.date_of_birth, r.phone, r.email, r.address, Boolean(r.national_id || r.passport_number)];
            return acc + fields.filter(Boolean).length / fields.length;
        }, 0) / total * 100);
        return { total, shown: sortedRows.length, active, recent, missing, restricted, completeness };
    }, [rows, sortedRows.length]);

    const hasActiveFilters = Boolean(searchTerm || activeFilter !== 'all' || genderFilter !== 'all' || statusFilter !== 'all');
    const allVisibleSelected = paginatedRows.length > 0 && paginatedRows.every(r => selectedIds.includes(r.patient_id));
    const selectedRows = useMemo(() => rows.filter(row => selectedIds.includes(row.patient_id)), [rows, selectedIds]);
    const activeFilterCount = [searchTerm, activeFilter !== 'all', genderFilter !== 'all', statusFilter !== 'all'].filter(Boolean).length;

    const clearFilters = () => {
        changeSearch('');
        setActiveFilter('all');
        setGenderFilter('all');
        setStatusFilter('all');
    };

    const toggleSort = key => {
        setPage(1);
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const startEdit = p => {
        setEditingPatient(p);
    };

    const validatePatientData = (formValues) => {
        const errors = {};
        if (!formValues.firstName || !formValues.firstName.trim()) {
            errors.firstName = isArabic ? 'الاسم الأول مطلوب' : 'First name is required';
        }
        if (!formValues.lastName || !formValues.lastName.trim()) {
            errors.lastName = isArabic ? 'اسم العائلة مطلوب' : 'Last name is required';
        }
        if (!formValues.dateOfBirth) {
            errors.dateOfBirth = isArabic ? 'تاريخ الميلاد مطلوب' : 'Date of birth is required';
        } else {
            const dob = new Date(formValues.dateOfBirth);
            if (isNaN(dob.getTime()) || dob >= new Date()) {
                errors.dateOfBirth = isArabic ? 'تاريخ الميلاد يجب أن يكون في الماضي' : 'Date of birth must be in the past';
            }
        }
        if (!formValues.phone || !formValues.phone.trim()) {
            errors.phone = isArabic ? 'رقم الهاتف مطلوب' : 'Phone number is required';
        } else if (!/^\d{10,15}$/.test(formValues.phone.trim())) {
            errors.phone = isArabic ? 'رقم الهاتف يجب أن يتكون من 10 إلى 15 رقماً' : 'Phone must be 10-15 digits';
        }
        return errors;
    };

    const saveEdit = async () => {
        if (!editingPatient) return;
        const valErrors = validatePatientData(editingPatient);
        if (Object.keys(valErrors).length > 0) {
            setEditErrors(valErrors);
            toast.error(isArabic ? 'يرجى استكمال وتصحيح الحقول الإلزامية المطلوبة' : 'Please complete all required fields');
            return;
        }
        try {
            await updatePatient({ id: editingPatient.patient_id, ...cleanPayload(editingPatient) }).unwrap();
            toast.success(t('toast.updated'));
            setEditingPatient(null);
            setEditErrors({});
        } catch (e) {
            if (e?.data?.details && Array.isArray(e.data.details)) {
                const backendErrors = {};
                e.data.details.forEach(d => {
                    const fieldName = d.path?.[0] || d.field;
                    if (fieldName) backendErrors[fieldName] = d.message;
                });
                setEditErrors(backendErrors);
            }
            toast.error(getErrorMessage(e, t('toast.updateFailed')));
        }
    };

    const saveNewPatient = async () => {
        const valErrors = validatePatientData(createForm);
        if (Object.keys(valErrors).length > 0) {
            setCreateErrors(valErrors);
            toast.error(isArabic ? 'يرجى استكمال وتصحيح الحقول الإلزامية المطلوبة' : 'Please complete all required fields');
            return;
        }
        try {
            await createPatient(cleanPayload(createForm)).unwrap();
            toast.success(t('toast.created'));
            setShowCreate(false);
            setCreateForm(emptyPatientForm);
            setCreateErrors({});
        } catch (e) {
            if (e?.data?.details && Array.isArray(e.data.details)) {
                const backendErrors = {};
                e.data.details.forEach(d => {
                    const fieldName = d.path?.[0] || d.field;
                    if (fieldName) backendErrors[fieldName] = d.message;
                });
                setCreateErrors(backendErrors);
            }
            toast.error(getErrorMessage(e, t('toast.createFailed')));
        }
    };

    const removePatient = p => setDeleteDraft({ kind: 'single', patients: [p] });

    const deleteSelected = () => {
        const sel = rows.filter(r => selectedIds.includes(r.patient_id));
        if (sel.length) setDeleteDraft({ kind: 'bulk', patients: sel });
    };

    const confirmDelete = async () => {
        if (!deleteDraft?.patients?.length) return false;
        const results = await Promise.allSettled(deleteDraft.patients.map(patient => deletePatient(patient.patient_id).unwrap()));
        const deletedIds = deleteDraft.patients.filter((_, index) => results[index].status === 'fulfilled').map(patient => patient.patient_id);
        const failed = results.length - deletedIds.length;

        if (deletedIds.length) {
            setSelectedIds(prev => prev.filter(id => !deletedIds.includes(id)));
        }
        if (!failed) {
            toast.success(deleteDraft.kind === 'single' ? t('toast.deleted') : t('toast.selectedDeleted'));
            return true;
        }
        if (deletedIds.length) {
            toast.error(t('toast.partialDelete', { deleted: deletedIds.length, failed }));
            return true;
        }
        const rejected = results.find(result => result.status === 'rejected');
        toast.error(getErrorMessage(rejected?.reason, deleteDraft.kind === 'single' ? t('toast.deleteFailed') : t('toast.selectedDeleteFailed')));
        return false;
    };

    const exportCsv = (records = sortedRows) => {
        const cols = TABLE_COLUMNS.filter(c => c.key !== 'created_at');
        const headers = cols.map(c => t(`columns.${c.key}`));
        const lines = records.map(r => cols.map(c => csvEscape(getCellValue(r, c.key))).join(','));
        const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), { href: url, download: `patients-${new Date().toISOString().slice(0, 10)}.csv` }).click();
        URL.revokeObjectURL(url);
    };

    const togglePatientSelection = (patientId, checked) => {
        setSelectedIds(previous => checked
            ? Array.from(new Set([...previous, patientId]))
            : previous.filter(id => id !== patientId));
    };

    const metrics = [
        { key: 'total', label: t('overview.total'), value: stats.total, icon: UsersRound, tone: 'teal' },
        { key: 'active', label: t('overview.active'), value: stats.active, icon: UserCheck, tone: 'emerald' },
        { key: 'recent', label: t('overview.recent'), value: stats.recent, icon: Calendar, tone: 'sky' },
        { key: 'quality', label: t('overview.completeness'), value: `${stats.completeness}%`, icon: Shield, tone: 'violet' },
        { key: 'attention', label: t('overview.attention'), value: stats.missing + stats.restricted, icon: AlertTriangle, tone: 'amber' },
    ];

    return (
        <main className="mx-auto max-w-[1540px] space-y-4 pb-12">
            <PageHeader
                icon={UsersRound}
                eyebrowIcon={Sparkles}
                eyebrow={t('overview.eyebrow')}
                title={t('title')}
                description={t('subtitle')}
                actions={
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                        <button type="button" onClick={() => setIsImportOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 transition hover:border-teal-500/40 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                            <Upload size={15} />
                            <span>{t('bulkImport')}</span>
                        </button>
                        <button type="button" onClick={() => setShowCreate(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 active:scale-[0.98]">
                            <Plus size={16} />
                            <span>{t('addPatient')}</span>
                        </button>
                    </div>
                }
                metrics={metrics}
                metricsLabel={t('overview.metricsLabel')}
            />

            <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
                        <div className="min-w-0 flex-1">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <label htmlFor="patient-registry-search" className="text-xs font-black text-slate-700 dark:text-slate-200">{t('filters.title')}</label>
                                <span className="text-[11px] font-bold text-slate-400">{t('overview.results', { shown: stats.shown, total: stats.total })}</span>
                            </div>
                            <div className="relative">
                                <Search className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                                <input
                                    id="patient-registry-search"
                                    value={searchTerm}
                                    onChange={event => changeSearch(event.target.value)}
                                    placeholder={t('searchPlaceholder')}
                                    className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/80 ps-10 pe-10 text-xs font-bold text-slate-900 outline-hidden transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950/60 dark:text-white dark:focus:bg-slate-950"
                                />
                                {searchTerm && (
                                    <button type="button" onClick={() => changeSearch('')} className="absolute end-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800" aria-label={t('filters.clearSearch')}>
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[170px_170px_auto_auto]">
                            <select value={genderFilter} onChange={event => setGenderFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-hidden focus:border-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" aria-label={t('genderFilter.label')}>
                                <option value="all">{t('genderFilter.all')}</option>
                                {GENDER_OPTIONS.map(gender => <option key={gender} value={gender}>{t(`gender.${gender}`)}</option>)}
                            </select>
                            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-hidden focus:border-teal-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200" aria-label={t('statusFilter.label')}>
                                <option value="all">{t('statusFilter.all')}</option>
                                {STATUS_OPTIONS.map(status => <option key={status} value={status}>{t(`status.${status}`)}</option>)}
                            </select>
                            <button type="button" onClick={() => exportCsv()} disabled={!sortedRows.length} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:border-teal-500/40 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                                <Download size={15} />
                                <span>{t('export')}</span>
                            </button>
                            <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-slate-700 dark:bg-slate-950" aria-label={t('view.label')}>
                                <button type="button" onClick={() => setViewMode('table')} aria-pressed={viewMode === 'table'} className={`grid h-8 w-8 place-items-center rounded-lg transition ${viewMode === 'table' ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-800 dark:text-teal-300' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`} title={t('view.table')}><List size={16} /></button>
                                <button type="button" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} className={`grid h-8 w-8 place-items-center rounded-lg transition ${viewMode === 'grid' ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-800 dark:text-teal-300' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`} title={t('view.grid')}><LayoutGrid size={16} /></button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
                        <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-black text-slate-400"><SlidersHorizontal size={14} />{t('filters.quick')}</span>
                        {FILTER_PILLS.map(filter => (
                            <button key={filter} type="button" onClick={() => setActiveFilter(filter)} className={`shrink-0 rounded-xl px-3 py-1.5 text-[11px] font-black transition ${activeFilter === filter ? 'bg-teal-600 text-white shadow-xs' : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-teal-500/30 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400'}`}>
                                {t(`filters.${filter}`)}
                            </button>
                        ))}
                        {hasActiveFilters && (
                            <button type="button" onClick={clearFilters} className="ms-auto inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-black text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-950/30">
                                <FilterX size={13} />
                                {t('filters.reset')} ({activeFilterCount})
                            </button>
                        )}
                    </div>
                </div>

                {selectedIds.length > 0 && (
                    <div className="flex flex-col gap-3 border-b border-teal-500/20 bg-teal-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                        <div className="flex items-center gap-2 text-xs font-black text-teal-900 dark:text-teal-100">
                            <span className="grid h-6 min-w-6 place-items-center rounded-full bg-teal-600 px-1.5 text-[11px] text-white">{selectedIds.length}</span>
                            <span>{t('selectedCount', { count: selectedIds.length })}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => exportCsv(selectedRows)} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-teal-500/25 bg-white px-3 text-[11px] font-black text-teal-800 hover:bg-teal-50 dark:bg-slate-900 dark:text-teal-200"><Download size={13} />{t('selection.export')}</button>
                            <button type="button" onClick={() => setSelectedIds([])} className="inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[11px] font-black text-slate-600 hover:bg-white/70 dark:text-slate-300"><X size={13} />{t('selection.clear')}</button>
                            {canRestrictPatient && <button type="button" onClick={deleteSelected} disabled={isDeleting} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-rose-500/25 bg-white px-3 text-[11px] font-black text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:bg-slate-900 dark:text-rose-300"><Trash2 size={13} />{t('deleteSelected')}</button>}
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/55 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/25 sm:px-5">
                    <div>
                        <h2 className="text-sm font-black text-slate-950 dark:text-white">{t('records.title')}</h2>
                        <p className="mt-0.5 hidden text-[11px] font-semibold text-slate-500 sm:block">{t('records.description')}</p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{t('overview.results', { shown: stats.shown, total: stats.total })}</span>
                </div>

                {isLoading ? (
                    <div className="flex min-h-52 flex-col items-center justify-center gap-3 p-8 text-center text-xs font-bold text-slate-400"><span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600 dark:border-slate-700 dark:border-t-teal-400" />{t('loadingRecords')}</div>
                ) : paginatedRows.length === 0 ? (
                    <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
                        <span className="grid h-14 w-14 place-items-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-950"><Search size={23} /></span>
                        <div><p className="text-sm font-black text-slate-900 dark:text-white">{t('records.emptyTitle')}</p><p className="mt-1 text-xs font-semibold text-slate-500">{t('noRecordsFilters')}</p></div>
                        {hasActiveFilters && <button type="button" onClick={clearFilters} className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-black text-white hover:bg-teal-500">{t('filters.reset')}</button>}
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                        {paginatedRows.map(row => <PatientRecordCard key={row.patient_id} row={row} selected={selectedIds.includes(row.patient_id)} onSelect={checked => togglePatientSelection(row.patient_id, checked)} onOpen={() => navigate(`/patients/${row.patient_id}`)} onEdit={() => startEdit(toPatientForm(row))} onDelete={() => removePatient(row)} canDelete={canRestrictPatient} />)}
                    </div>
                ) : (
                    <>
                        <div className="grid gap-3 p-4 lg:hidden">
                            {paginatedRows.map(row => <PatientRecordCard key={row.patient_id} row={row} selected={selectedIds.includes(row.patient_id)} onSelect={checked => togglePatientSelection(row.patient_id, checked)} onOpen={() => navigate(`/patients/${row.patient_id}`)} onEdit={() => startEdit(toPatientForm(row))} onDelete={() => removePatient(row)} canDelete={canRestrictPatient} />)}
                        </div>
                        <div className="hidden overflow-x-auto lg:block">
                        <table className="min-w-full border-collapse text-start text-xs font-bold">
                            <thead className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40">
                                <tr>
                                    <th className="w-12 px-5 py-3.5 text-start">
                                        <label><span className="sr-only">{t('records.selectPage')}</span><input type="checkbox" checked={allVisibleSelected} onChange={event => { if (event.target.checked) setSelectedIds(previous => Array.from(new Set([...previous, ...paginatedRows.map(row => row.patient_id)]))); else setSelectedIds(previous => previous.filter(id => !paginatedRows.some(row => row.patient_id === id))); }} className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" /></label>
                                    </th>
                                    <SortTh columnKey="name" sortConfig={sortConfig} onSort={toggleSort}>{t('columns.name')}</SortTh>
                                    <SortTh columnKey="mrn" sortConfig={sortConfig} onSort={toggleSort}>{t('columns.mrn')}</SortTh>
                                    <th className="px-4 py-3.5 text-start text-[10px] font-black uppercase tracking-wider text-slate-400">{t('records.contact')}</th>
                                    <SortTh columnKey="date_of_birth" sortConfig={sortConfig} onSort={toggleSort}>{t('records.demographics')}</SortTh>
                                    <th className="px-4 py-3.5 text-start text-[10px] font-black uppercase tracking-wider text-slate-400">{t('records.statusAndRegistration')}</th>
                                    <th className="w-32 px-5 py-3.5 text-end text-[10px] font-black uppercase tracking-wider text-slate-400">{t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {paginatedRows.map(row => (
                                    <tr key={row.patient_id} onClick={() => navigate(`/patients/${row.patient_id}`)} className="group cursor-pointer transition hover:bg-teal-50/35 dark:hover:bg-slate-800/45">
                                        <td className="px-5 py-3.5" onClick={event => event.stopPropagation()}><label><span className="sr-only">{t('records.selectPatient', { name: row.name })}</span><input type="checkbox" checked={selectedIds.includes(row.patient_id)} onChange={event => togglePatientSelection(row.patient_id, event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" /></label></td>
                                        <td className="min-w-56 px-4 py-3.5"><CellValue row={row} columnKey="name" /></td>
                                        <td className="px-4 py-3.5"><CellValue row={row} columnKey="mrn" /></td>
                                        <td className="min-w-52 px-4 py-3.5">
                                            <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300" dir="ltr"><Phone size={12} className="text-teal-600" />{row.phone || t('card.noPhone')}</p>
                                            <p className="mt-1 flex max-w-56 items-center gap-1.5 truncate text-[11px] font-semibold text-slate-500" dir="ltr"><Mail size={12} className="shrink-0" /><span className="truncate">{row.email || t('card.noEmail')}</span></p>
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{t(`gender.${row.gender || 'Other'}`)}{calculateAge(row.date_of_birth) !== null ? ` · ${t('card.age', { count: calculateAge(row.date_of_birth) })}` : ''}</p>
                                            <p className="mt-1 text-[11px] font-semibold text-slate-400" dir="ltr">{row.date_of_birth || t('card.noDob')}</p>
                                        </td>
                                        <td className="px-4 py-3.5"><CellValue row={row} columnKey="patient_status" /><p className="mt-1.5 text-[10px] font-semibold text-slate-400">{t('card.registered')} · <span dir="ltr">{row.created_at ? String(row.created_at).slice(0, 10) : '-'}</span></p></td>
                                        <td className="px-5 py-3.5" onClick={event => event.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1">
                                                <button type="button" onClick={() => navigate(`/patients/${row.patient_id}`)} className="grid h-8 w-8 place-items-center rounded-xl text-teal-700 transition hover:bg-teal-500/10 dark:text-teal-300" title={t('rowActions.view')}><Eye size={15} /></button>
                                                <button type="button" onClick={() => startEdit(toPatientForm(row))} className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white" title={t('rowActions.edit')}><Edit3 size={15} /></button>
                                                {canRestrictPatient && <button type="button" onClick={() => removePatient(row)} className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-700" title={t('rowActions.delete')}><Trash2 size={15} /></button>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    </>
                )}

                {sortedRows.length > 0 && (
                    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/40 px-4 py-3 text-xs font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-950/20 sm:flex-row sm:px-5">
                        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                            <span>{t('records.pagination.range', { start: pageStart + 1, end: Math.min(pageStart + pageSize, sortedRows.length), total: sortedRows.length })}</span>
                            <label className="inline-flex items-center gap-1.5"><span className="sr-only">{t('records.pagination.rowsPerPage')}</span><select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-white">{PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
                        </div>
                        <Pagination
                            currentPage={currentPage}
                            pageCount={pageCount}
                            onPageChange={setPage}
                            isRtl={isArabic}
                            compact
                            previousLabel={t('records.pagination.previous')}
                            nextLabel={t('records.pagination.next')}
                        />
                    </div>
                )}
            </section>

            {/* Patient Multi-Tab Creation Modal */}
            <PatientModal
                visible={showCreate}
                title={t('modal.addTitle', 'Register New Patient')}
                form={createForm}
                setForm={setCreateForm}
                isSaving={isCreating}
                onCancel={() => { setShowCreate(false); setCreateForm(emptyPatientForm); setCreateErrors({}); }}
                onSave={saveNewPatient}
                duplicatePatients={duplicatePatients}
                errors={createErrors}
                setErrors={setCreateErrors}
            />

            {/* Patient Edit Modal */}
            <PatientModal
                visible={Boolean(editingPatient)}
                title={t('modal.editTitle', 'Edit Patient Record')}
                form={editingPatient || emptyPatientForm}
                setForm={setEditingPatient}
                isSaving={isUpdating}
                onCancel={() => { setEditingPatient(null); setEditErrors({}); }}
                onSave={saveEdit}
                duplicatePatients={[]}
                errors={editErrors}
                setErrors={setEditErrors}
            />

            {/* CSV Import & Delete Confirmation Modals */}
            <PatientImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />
            <ConfirmDialog
                isOpen={Boolean(deleteDraft)}
                onClose={() => setDeleteDraft(null)}
                onConfirm={confirmDelete}
                title={deleteDraft?.kind === 'bulk' ? t('confirm.deleteManyTitle', 'Delete Selected Patients') : t('confirm.deleteOneTitle', 'Delete Patient Record')}
                message={deleteDraft?.kind === 'bulk'
                    ? t('confirm.deleteMany', { count: deleteDraft?.patients?.length || 0, defaultValue: `Are you sure you want to delete ${deleteDraft?.patients?.length || 0} patient records?` })
                    : t('confirm.deleteOne', { name: deleteDraft?.patients?.[0]?.name || deleteDraft?.patients?.[0]?.mrn || t('confirm.patientFallback', 'this patient'), defaultValue: `Are you sure you want to delete patient ${deleteDraft?.patients?.[0]?.name}?` })}
                confirmLabel={deleteDraft?.kind === 'bulk' ? t('confirm.deleteManyAction', { count: deleteDraft?.patients?.length || 0, defaultValue: `Delete ${deleteDraft?.patients?.length || 0} Patients` }) : t('confirm.deleteOneAction', 'Delete Patient')}
                cancelLabel={t('confirm.cancel', 'Cancel')}
                isLoading={isDeleting}
                variant="danger"
            />
        </main>
    );
};

export default Patients;
