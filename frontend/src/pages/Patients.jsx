import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
    Activity,
    AlertTriangle,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
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

const copyText = async (value, successMsg) => {
    if (!value) return;
    try {
        await navigator.clipboard?.writeText(value);
        toast.success(successMsg || 'Copied to clipboard');
    } catch {
        toast.error('Copy failed');
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
                onClick={(e) => { e.stopPropagation(); copyText(row.mrn, t('mrnCopied', { defaultValue: 'MRN copied' })); }}
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

const PatientField = ({ label, value, onChange, type = 'text', placeholder = '', error = '' }) => (
    <div>
        <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{label}</label>
        <input
            type={type}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="h-10 w-full rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-800 outline-hidden transition focus:border-teal-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
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

const PatientModal = ({ visible, title, form, setForm, onSave, onCancel, isSaving, duplicatePatients = [] }) => {
    const { t, i18n } = useTranslation('patients');
    const isArabic = i18n.language === 'ar';
    const [activeTab, setActiveTab] = useState('demographics');
    const patch = updates => setForm(prev => ({ ...prev, ...updates }));

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
                            <p className="text-xs font-semibold text-slate-400">{isArabic ? 'إدارة السجل الطبي الشامل والبيانات السريرية' : 'Comprehensive Medical Record & Demographics'}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
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
                            <PatientField label={t('modal.fields.firstName')} value={form.firstName} onChange={v => patch({ firstName: v })} placeholder="e.g. Sarah" />
                            <PatientField label={t('modal.fields.lastName')} value={form.lastName} onChange={v => patch({ lastName: v })} placeholder="e.g. Miller" />
                            <PatientField label={t('modal.fields.dateOfBirth')} value={form.dateOfBirth} onChange={v => patch({ dateOfBirth: v })} type="date" />
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
                            <PatientField label={t('modal.fields.nationalId')} value={form.nationalId} onChange={v => patch({ nationalId: v })} placeholder="National ID / Civil No" />
                            <PatientField label={t('modal.fields.passportNumber')} value={form.passportNumber} onChange={v => patch({ passportNumber: v })} placeholder="Passport Number" />
                            <PatientField label={t('modal.fields.phone')} value={form.phone} onChange={v => patch({ phone: v })} placeholder="+20 100 000 0000" />
                            <PatientField label={t('modal.fields.email')} value={form.email} onChange={v => patch({ email: v })} type="email" placeholder="patient@example.com" />
                            <div className="sm:col-span-2">
                                <PatientField label={t('modal.fields.address')} value={form.address} onChange={v => patch({ address: v })} placeholder="Street address, City, Country" />
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
                            <PatientField label={t('modal.fields.allergies')} value={form.allergies} onChange={v => patch({ allergies: v })} placeholder="e.g. Penicillin, Iodine Contrast" />
                            <PatientField label={t('modal.fields.chronicDiseases')} value={form.chronicDiseases} onChange={v => patch({ chronicDiseases: v })} placeholder="e.g. Hypertension, Diabetes Type 2" />
                            <PatientField label={t('modal.fields.priorSurgeries')} value={form.priorSurgeries} onChange={v => patch({ priorSurgeries: v })} placeholder="e.g. Appendectomy 2018" />
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
                            <PatientField label={t('modal.fields.implantsDevices')} value={form.implantsDevices} onChange={v => patch({ implantsDevices: v })} placeholder="e.g. Pacemaker, Cochlear Implant, Metal Clip" />
                            <PatientField label={t('modal.fields.renalFunctionNotes')} value={form.renalFunctionNotes} onChange={v => patch({ renalFunctionNotes: v })} placeholder="e.g. Serum Creatinine 0.9, eGFR 95" />
                        </div>
                    )}

                    {/* TAB 3: EMERGENCY CONTACT */}
                    {activeTab === 'emergency' && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <PatientField label={t('modal.fields.name')} value={form.emergencyContactName} onChange={v => patch({ emergencyContactName: v })} placeholder="Full Name" />
                            <PatientField label={t('modal.fields.phone')} value={form.emergencyContactPhone} onChange={v => patch({ emergencyContactPhone: v })} placeholder="+20 100 000 0000" />
                            <PatientField label={t('modal.fields.relationship')} value={form.emergencyContactRelationship} onChange={v => patch({ emergencyContactRelationship: v })} placeholder="e.g. Spouse, Parent, Sibling" />
                            <PatientField label={t('modal.fields.address')} value={form.emergencyContactAddress} onChange={v => patch({ emergencyContactAddress: v })} placeholder="Emergency Contact Address" />
                        </div>
                    )}

                    {/* TAB 4: COMMUNICATION & CONSENTS */}
                    {activeTab === 'communication' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <PatientField label={t('modal.fields.preferredLanguage')} value={form.preferredLanguage} onChange={v => patch({ preferredLanguage: v })} placeholder="Arabic / English" />
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
                                <h4 className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Communication Consents</h4>
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

    const saveEdit = async () => {
        if (!editingPatient) return;
        try {
            await updatePatient({ id: editingPatient.patient_id, ...cleanPayload(editingPatient) }).unwrap();
            toast.success(t('toast.updated'));
            setEditingPatient(null);
        } catch (e) {
            toast.error(getErrorMessage(e, t('toast.updateFailed')));
        }
    };

    const saveNewPatient = async () => {
        try {
            await createPatient(cleanPayload(createForm)).unwrap();
            toast.success(t('toast.created'));
            setShowCreate(false);
            setCreateForm(emptyPatientForm);
        } catch (e) {
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

    const exportCsv = () => {
        const cols = TABLE_COLUMNS.filter(c => c.key !== 'created_at');
        const headers = cols.map(c => t(`columns.${c.key}`));
        const lines = sortedRows.map(r => cols.map(c => csvEscape(getCellValue(r, c.key))).join(','));
        const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), { href: url, download: `patients-${new Date().toISOString().slice(0, 10)}.csv` }).click();
        URL.revokeObjectURL(url);
    };

    return (
        <main className="mx-auto max-w-[1600px] space-y-6 pb-12">
            {/* Top Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-teal-600/30 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <UsersRound size={26} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <Sparkles size={11} />
                                    <span>{t('overview.eyebrow', 'Health System Master Index')}</span>
                                </span>
                            </div>
                            <h1 className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('title', 'Patient Directory & Master Index')}
                            </h1>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('subtitle', 'Manage registered patients, medical alerts, emergency contacts, and portal communication preferences.')}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <button
                            type="button"
                            onClick={() => setIsImportOpen(true)}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 text-xs font-black text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <Upload size={15} />
                            <span>{t('bulkImport', 'Bulk CSV Import')}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowCreate(true)}
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-teal-600 px-5 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 active:scale-95"
                        >
                            <Plus size={15} />
                            <span>{t('addPatient', 'Register Patient')}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Metrics Telemetry Strip */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label="Patient Statistics">
                {[
                    { label: t('overview.total', 'Total Patients'), value: stats.total, icon: UsersRound, tone: 'teal', detail: t('overview.totalDetail', 'Master registry count') },
                    { label: t('overview.active', 'Active Patients'), value: stats.active, icon: UserCheck, tone: 'emerald', detail: t('overview.activeDetail', 'Active portal records') },
                    { label: t('overview.recent', 'Recent (14 days)'), value: stats.recent, icon: Calendar, tone: 'sky', detail: t('overview.recentDetail', 'Newly registered') },
                    { label: t('overview.completeness', 'Data Quality'), value: `${stats.completeness}%`, icon: Shield, tone: 'purple', detail: t('overview.completenessDetail', 'Profile field completeness') },
                    { label: t('overview.attention', 'Attention Needed'), value: stats.missing + stats.restricted, icon: AlertTriangle, tone: 'rose', detail: t('overview.attentionDetail', 'Missing contact/restricted') },
                ].map(m => {
                    const Icon = m.icon;
                    return (
                        <div key={m.label} className="rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">{m.label}</p>
                                <span className="grid h-8 w-8 place-items-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                                    <Icon size={16} />
                                </span>
                            </div>
                            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white tabular-nums">{m.value}</p>
                            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{m.detail}</p>
                        </div>
                    );
                })}
            </section>

            {/* Filter & Search Deck */}
            <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                            <SlidersHorizontal size={17} />
                        </span>
                        <div>
                            <h2 className="text-sm font-black text-slate-900 dark:text-white">{t('filters.title', 'Search & Filters')}</h2>
                            <p className="text-xs font-semibold text-slate-400">{t('filters.description', 'Filter patient records by demographics and status')}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* View Switcher */}
                        <div className="flex items-center rounded-xl border border-slate-200/80 bg-slate-100/80 p-0.5 dark:border-slate-800 dark:bg-slate-950">
                            <button
                                type="button"
                                onClick={() => setViewMode('table')}
                                className={`grid h-8 w-8 place-items-center rounded-lg transition ${viewMode === 'table' ? 'bg-white text-teal-700 shadow-2xs dark:bg-slate-900 dark:text-teal-300' : 'text-slate-400 hover:text-slate-600'}`}
                                title="Table View"
                            >
                                <List size={16} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                className={`grid h-8 w-8 place-items-center rounded-lg transition ${viewMode === 'grid' ? 'bg-white text-teal-700 shadow-2xs dark:bg-slate-900 dark:text-teal-300' : 'text-slate-400 hover:text-slate-600'}`}
                                title="Grid View"
                            >
                                <LayoutGrid size={16} />
                            </button>
                        </div>

                        <span className="rounded-full bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-800 dark:text-teal-300">
                            {t('overview.results', { shown: stats.shown, total: stats.total, defaultValue: `${stats.shown} of ${stats.total} patients` })}
                        </span>
                        {hasActiveFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                            >
                                <FilterX size={14} />
                                <span>{t('filters.reset', 'Reset')}</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Filter Pills */}
                <div className="flex flex-wrap gap-1.5">
                    {FILTER_PILLS.map(v => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => setActiveFilter(v)}
                            className={`rounded-xl px-3.5 py-1.5 text-xs font-black transition ${
                                activeFilter === v
                                    ? 'bg-teal-600 text-white shadow-xs'
                                    : 'border border-slate-200/80 bg-slate-50/80 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400'
                            }`}
                        >
                            {t(`filters.${v}`, v)}
                        </button>
                    ))}
                </div>

                {/* Search & Dropdowns Grid */}
                <div className="grid gap-3 lg:grid-cols-[1fr_160px_160px_auto]">
                    <div className="relative">
                        <Search className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            value={searchTerm}
                            onChange={e => changeSearch(e.target.value)}
                            placeholder={t('searchPlaceholder', 'Search by name, MRN, National ID, phone, email...')}
                            className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/50 ps-10 pe-8 text-xs font-bold text-slate-800 outline-hidden transition focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => changeSearch('')}
                                className="absolute end-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700 transition"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <select
                        value={genderFilter}
                        onChange={e => setGenderFilter(e.target.value)}
                        className="h-10 rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-hidden focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                    >
                        <option value="all">{t('genderFilter.all', 'All Genders')}</option>
                        {GENDER_OPTIONS.map(g => <option key={g} value={g}>{t(`gender.${g}`, g)}</option>)}
                    </select>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="h-10 rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-bold text-slate-700 outline-hidden focus:border-teal-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                    >
                        <option value="all">{t('statusFilter.all', 'All Statuses')}</option>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{t(`status.${s}`, s)}</option>)}
                    </select>
                    <button
                        type="button"
                        onClick={exportCsv}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 text-xs font-black text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                    >
                        <Download size={15} />
                        <span>{t('export', 'Export CSV')}</span>
                    </button>
                </div>

                {/* Bulk Action Bar */}
                {selectedIds.length > 0 && (
                    <div className="flex flex-col gap-3 rounded-2xl border border-teal-500/30 bg-teal-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-600 text-[11px] font-black text-white">{selectedIds.length}</span>
                            <span className="text-xs font-bold text-teal-900 dark:text-teal-200">{t('selectedCount', { count: selectedIds.length, defaultValue: `${selectedIds.length} patients selected` })}</span>
                        </div>
                        {canRestrictPatient && (
                            <button
                                type="button"
                                onClick={deleteSelected}
                                disabled={isDeleting}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-white px-3 py-1.5 text-xs font-black text-rose-700 shadow-2xs hover:bg-rose-50 dark:bg-slate-900 dark:text-rose-400"
                            >
                                <Trash2 size={13} />
                                <span>{t('deleteSelected', 'Delete Selected')}</span>
                            </button>
                        )}
                    </div>
                )}
            </section>

            {/* Content Display (Table or Grid View) */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                {isLoading ? (
                    <div className="p-8 text-center text-xs font-bold text-slate-400">{t('loadingRecords', 'Loading patient records...')}</div>
                ) : paginatedRows.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 p-12 text-center">
                        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300">
                            <UsersRound size={24} />
                        </span>
                        <p className="text-sm font-black text-slate-800 dark:text-slate-200">{t('noRecordsFilters', 'No patient records match the selected filters')}</p>
                        {hasActiveFilters && (
                            <button type="button" onClick={clearFilters} className="rounded-xl bg-teal-50 px-4 py-2 text-xs font-bold text-teal-700 hover:bg-teal-100">
                                {t('filters.reset', 'Reset filters')}
                            </button>
                        )}
                    </div>
                ) : viewMode === 'grid' ? (
                    /* Grid Cards View */
                    <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
                        {paginatedRows.map(row => (
                            <article
                                key={row.patient_id}
                                onClick={() => navigate(`/patients/${row.patient_id}`)}
                                className="group relative flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xs transition hover:border-teal-500/40 hover:shadow-md dark:border-slate-800 dark:bg-slate-950/60 cursor-pointer"
                            >
                                <div>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xs font-black border ${
                                                row.gender === 'Female'
                                                    ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
                                                    : 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30'
                                            }`}>
                                                {initials(row.name)}
                                            </span>
                                            <div className="min-w-0">
                                                <h3 className="truncate text-sm font-black text-slate-900 group-hover:text-teal-600 dark:text-white dark:group-hover:text-teal-400">
                                                    {row.name}
                                                </h3>
                                                <span className="font-mono text-xs font-bold text-teal-600 dark:text-teal-400">{row.mrn}</span>
                                            </div>
                                        </div>
                                        <CellValue row={row} columnKey="patient_status" />
                                    </div>

                                    <div className="mt-4 space-y-1.5 text-xs font-bold text-slate-600 dark:text-slate-400">
                                        {row.phone && (
                                            <p className="flex items-center gap-2">
                                                <Phone size={13} className="text-slate-400" />
                                                <span>{row.phone}</span>
                                            </p>
                                        )}
                                        {row.email && (
                                            <p className="flex items-center gap-2 truncate">
                                                <Mail size={13} className="text-slate-400 shrink-0" />
                                                <span className="truncate">{row.email}</span>
                                            </p>
                                        )}
                                        {row.date_of_birth && (
                                            <p className="flex items-center gap-2">
                                                <Calendar size={13} className="text-slate-400" />
                                                <span>{row.date_of_birth} ({calculateAge(row.date_of_birth)} yrs)</span>
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-4 flex items-center justify-end gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); startEdit(toPatientForm(row)); }}
                                        className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                                        title={t('rowActions.edit')}
                                    >
                                        <Edit3 size={14} />
                                    </button>
                                    {canRestrictPatient && (
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); removePatient(row); }}
                                            className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
                                            title={t('rowActions.delete')}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    /* Table View */
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-start text-xs font-bold border-collapse">
                            <thead className="border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40">
                                <tr>
                                    <th className="w-10 px-5 py-3.5 text-start">
                                        <input
                                            type="checkbox"
                                            checked={allVisibleSelected}
                                            onChange={e => {
                                                if (e.target.checked) setSelectedIds(prev => Array.from(new Set([...prev, ...paginatedRows.map(r => r.patient_id)])));
                                                else setSelectedIds(prev => prev.filter(id => !paginatedRows.some(r => r.patient_id === id)));
                                            }}
                                            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 transition"
                                        />
                                    </th>
                                    {TABLE_COLUMNS.map(col => (
                                        col.sortable
                                            ? <SortTh key={col.key} columnKey={col.key} sortConfig={sortConfig} onSort={toggleSort}>{t(`columns.${col.key}`, col.key)}</SortTh>
                                            : <th key={col.key} className="px-4 py-3.5 text-start text-[10px] font-black uppercase tracking-wider text-slate-400">{t(`columns.${col.key}`, col.key)}</th>
                                    ))}
                                    <th className="w-28 px-4 py-3.5 text-end text-[10px] font-black uppercase tracking-wider text-slate-400">{t('actions', 'Actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {paginatedRows.map(row => (
                                    <tr
                                        key={row.patient_id}
                                        onClick={() => navigate(`/patients/${row.patient_id}`)}
                                        className="group cursor-pointer transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                                    >
                                        <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(row.patient_id)}
                                                onChange={e => setSelectedIds(prev => e.target.checked ? [...prev, row.patient_id] : prev.filter(id => id !== row.patient_id))}
                                                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 transition"
                                            />
                                        </td>
                                        {TABLE_COLUMNS.map(col => (
                                            <td key={col.key} className="px-4 py-3.5">
                                                <CellValue row={row} columnKey={col.key} />
                                            </td>
                                        ))}
                                        <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/patients/${row.patient_id}`)}
                                                    className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-teal-500/10 hover:text-teal-700 dark:hover:text-teal-300"
                                                    title={t('rowActions.view')}
                                                >
                                                    <Eye size={15} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => startEdit(toPatientForm(row))}
                                                    className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                                                    title={t('rowActions.edit')}
                                                >
                                                    <Edit3 size={15} />
                                                </button>
                                                {canRestrictPatient && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removePatient(row)}
                                                        className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 hover:bg-rose-500/10 hover:text-rose-700"
                                                        title={t('rowActions.delete')}
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination Controls */}
                {sortedRows.length > 0 && (
                    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-6 py-4 text-xs font-bold text-slate-500 dark:border-slate-800 sm:flex-row">
                        <div className="flex items-center gap-2">
                            <span>{isArabic ? 'عرض' : 'Showing'}</span>
                            <select
                                value={pageSize}
                                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            >
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                            <span>
                                {isArabic
                                    ? `من ${pageStart + 1} إلى ${Math.min(pageStart + pageSize, sortedRows.length)} من إجمالي ${sortedRows.length} سجل`
                                    : `of ${sortedRows.length} records`}
                            </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <ChevronLeft size={14} className={isArabic ? 'rotate-180' : ''} />
                            </button>
                            <span className="px-2 text-xs font-black text-slate-800 dark:text-slate-200">
                                {currentPage} / {pageCount}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                                disabled={currentPage === pageCount}
                                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <ChevronRight size={14} className={isArabic ? 'rotate-180' : ''} />
                            </button>
                        </div>
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
                onCancel={() => { setShowCreate(false); setCreateForm(emptyPatientForm); }}
                onSave={saveNewPatient}
                duplicatePatients={duplicatePatients}
            />

            {/* Patient Edit Modal */}
            <PatientModal
                visible={Boolean(editingPatient)}
                title={t('modal.editTitle', 'Edit Patient Record')}
                form={editingPatient || emptyPatientForm}
                setForm={setEditingPatient}
                isSaving={isUpdating}
                onCancel={() => setEditingPatient(null)}
                onSave={saveEdit}
                duplicatePatients={[]}
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
