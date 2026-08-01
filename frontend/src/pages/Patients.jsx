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
    GitMerge,
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
    CheckCircle2
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
import { PageHeader, MetricCard } from '../components/ui';
import { selectCurrentUser } from '../store/authSlice';
import { inputClass, secondaryBtn } from '../utils/designTokens';

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
const PAGE_SIZES = [25, 50, 100];

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

const SortTh = ({ columnKey, sortConfig, onSort, children }) => {
    const active = sortConfig.key === columnKey;
    return (
        <th className="px-4 py-3.5 text-start">
            <button
                type="button"
                onClick={() => onSort(columnKey)}
                className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest transition-colors ${active ? 'text-teal-700 dark:text-teal-400' : 'text-slate-400 hover:text-slate-700 dark:hover:text-white'}`}
            >
                {children}
                <ChevronDown size={12} className={`transition-transform ${active && sortConfig.direction === 'asc' ? 'rotate-180' : ''}`} />
            </button>
        </th>
    );
};

const RowActions = ({ editing, isSaving, onView, onEdit, onSave, onCancel, onDelete }) => {
    const { t } = useTranslation('patients');
    return (
        <div className="flex items-center justify-end gap-1">
            {editing ? (
                <>
                    <ActionBtn variant="success" onClick={onSave} disabled={isSaving} icon={<Save size={12} />} label={t('rowActions.save')} />
                    <ActionBtn variant="ghost" onClick={onCancel} icon={<X size={12} />} label={t('rowActions.cancel')} />
                </>
            ) : (
                <>
                    <ActionBtn variant="blue" onClick={onView} icon={<Eye size={12} />} label={t('rowActions.view')} />
                    <ActionBtn variant="violet" onClick={onEdit} icon={<Edit3 size={12} />} label={t('rowActions.edit')} />
                    {onDelete && <ActionBtn variant="red" onClick={onDelete} icon={<Trash2 size={12} />} label={t('rowActions.delete')} iconOnly />}
                </>
            )}
        </div>
    );
};

const ACTION_VARIANTS = {
    success: 'bg-emerald-50/80 border-emerald-200 text-emerald-700 hover:bg-emerald-100/80 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300',
    ghost: 'bg-slate-50/80 border-slate-200 text-slate-600 hover:bg-slate-100/80 dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-350',
    blue: 'bg-blue-50/80 border-blue-200 text-blue-700 hover:bg-blue-100/80 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-300',
    violet: 'bg-indigo-50/80 border-indigo-200 text-indigo-700 hover:bg-indigo-100/80 dark:bg-indigo-500/10 dark:border-indigo-500/20 dark:text-indigo-300',
    red: 'bg-rose-50/80 border-rose-200 text-rose-700 hover:bg-rose-100/80 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-300',
};

const ActionBtn = ({ variant, onClick, disabled, icon, label, iconOnly = false }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={label}
        className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[10px] font-medium transition-all hover:-translate-y-0.5 disabled:opacity-50 ${ACTION_VARIANTS[variant]}`}
    >
        {icon}{!iconOnly && label}
    </button>
);

const editableColumnKeys = ['name', 'phone', 'email', 'gender', 'date_of_birth', 'address'];

const CellValue = ({ row, columnKey }) => {
    const { t } = useTranslation('patients');
    const na = <span className="text-slate-400">{t('fallback.na')}</span>;
    if (columnKey === 'name') return (
        <div className="min-w-[160px]">
            <p className="font-medium text-slate-900 dark:text-white">{row.name || t('fallback.unnamed')}</p>
            {row.address && (
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400 max-w-[160px] truncate">
                    <MapPin size={9} className="shrink-0 text-teal-500" />{row.address}
                </p>
            )}
        </div>
    );
    if (columnKey === 'created_at') return <span className="whitespace-nowrap text-slate-500 text-xs">{new Date(row.created_at).toLocaleDateString()}</span>;
    if (columnKey === 'date_of_birth') return <span className="whitespace-nowrap text-xs">{row.date_of_birth || na}</span>;
    if (columnKey === 'email') return <span className="block max-w-[175px] truncate text-xs text-slate-600 dark:text-slate-300">{row.email || na}</span>;
    if (columnKey === 'phone') return <span className="whitespace-nowrap text-xs font-mono text-slate-700 dark:text-slate-300">{row.phone || na}</span>;
    if (columnKey === 'gender') return <span className="text-xs text-slate-600 dark:text-slate-300">{row.gender ? t(`gender.${row.gender}`) : na}</span>;
    if (columnKey === 'patient_status') {
        const st = row.patient_status || 'Active';
        const stClass = st === 'Active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
        return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${stClass}`}>{t(`status.${st}`)}</span>;
    }
    if (columnKey === 'mrn') return <span className="font-mono text-xs font-bold text-teal-700 dark:text-teal-400">{row.mrn}</span>;
    return <span className="text-xs text-slate-600 dark:text-slate-300">{row[columnKey] || na}</span>;
};

const InlineEditor = ({ columnKey, form, setForm }) => {
    const { t } = useTranslation('patients');
    const patch = updates => setForm(prev => ({ ...prev, ...updates }));

    if (columnKey === 'name') return (
        <div className="grid grid-cols-2 gap-1 min-w-[210px]">
            <input value={form.firstName} onChange={e => patch({ firstName: e.target.value })} className={inputClass} placeholder={t('modal.fields.firstName')} />
            <input value={form.lastName} onChange={e => patch({ lastName: e.target.value })} className={inputClass} placeholder={t('modal.fields.lastName')} />
        </div>
    );
    if (columnKey === 'gender') return (
        <select value={form.gender} onChange={e => patch({ gender: e.target.value })} className={inputClass}>
            {GENDER_OPTIONS.map(g => <option key={g} value={g}>{t(`gender.${g}`)}</option>)}
        </select>
    );
    const fieldMap = { phone: 'phone', email: 'email', date_of_birth: 'dateOfBirth', address: 'address' };
    return (
        <input
            type={columnKey === 'date_of_birth' ? 'date' : columnKey === 'email' ? 'email' : 'text'}
            value={form[fieldMap[columnKey]] || ''}
            onChange={e => patch({ [fieldMap[columnKey]]: e.target.value })}
            className={inputClass}
        />
    );
};

const MobilePatientCard = ({ patient, selected, active, onSelect, onView, onEdit, onDelete }) => {
    const { t } = useTranslation('patients');
    return (
        <article className={`relative p-4 transition-colors ${active ? 'bg-teal-50/40 dark:bg-teal-500/5' : 'hover:bg-white/60 dark:hover:bg-slate-800/40'}`}>
            <div className="flex items-start gap-3 ps-2">
                <input type="checkbox" checked={selected} onChange={e => onSelect(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-350 bg-white/80 dark:bg-slate-900 text-teal-600 focus:ring-teal-500" />
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <p className="font-black text-slate-900 dark:text-white">{patient.name || t('card.unnamed')}</p>
                            <div className="mt-1 flex items-center gap-2">
                                <span className="font-mono text-[10px] font-bold text-teal-600 dark:text-teal-400">{patient.mrn}</span>
                                <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-400">{t(`status.${patient.patient_status || 'Active'}`)}</span>
                            </div>
                        </div>
                        <div className="flex shrink-0 gap-1 opacity-60 transition-opacity hover:opacity-100">
                            <button type="button" onClick={onEdit} className="flex h-8 w-8 items-center justify-center rounded-lg text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition"><Edit3 size={14} /></button>
                            {onDelete && <button type="button" onClick={onDelete} className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-700 dark:hover:text-rose-300 transition"><Trash2 size={14} /></button>}
                        </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {patient.phone && <span className="flex items-center gap-1.5"><Phone size={11} />{patient.phone}</span>}
                        {patient.email && <span className="flex items-center gap-1.5 max-w-[180px] truncate"><Mail size={11} />{patient.email}</span>}
                    </div>
                </div>
            </div>
            <div className="mt-3 flex justify-end ps-2">
                <button type="button" onClick={onView}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 px-4 py-2 text-[11px] font-bold text-slate-700 dark:text-slate-300 transition active:scale-95">
                    <Eye size={14} /> {t('card.view')}
                </button>
            </div>
        </article>
    );
};

const PatientField = ({ label, value, onChange, type = 'text', placeholder = '' }) => (
    <div>
        <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{label}</label>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={inputClass} />
    </div>
);

const ConsentCheckbox = ({ label, checked, onChange }) => (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1426] px-3.5 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 transition hover:border-teal-300 hover:bg-teal-50/40 dark:hover:bg-teal-900/20">
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${checked ? 'border-teal-600 bg-teal-600' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0b1426]'}`}>
            {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </span>
        <input type="checkbox" checked={Boolean(checked)} onChange={e => onChange(e.target.checked)} className="sr-only" />
        {label}
    </label>
);

const PatientModal = ({ visible, title, form, setForm, onSave, onCancel, isSaving, duplicatePatients = [] }) => {
    const { t } = useTranslation('patients');
    const [activeTab, setActiveTab] = useState('demographics'); // 'demographics' | 'medical' | 'emergency' | 'communication'
    const patch = updates => setForm(prev => ({ ...prev, ...updates }));

    if (!visible) return null;
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white dark:bg-[#0b1426] shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between border-b border-slate-100/80 dark:border-slate-800 px-6 py-4">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md shadow-teal-500/20"><User size={18} /></span>
                        <h2 className="text-base font-extrabold text-slate-900 dark:text-white">{title}</h2>
                    </div>
                    <button type="button" onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 transition active:scale-95"><X size={17} /></button>
                </div>

                {/* Tab Navigation */}
                <div className="grid grid-cols-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#08101e] px-4 pt-2">
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
                            className={`flex flex-col sm:flex-row items-center justify-center gap-2 border-b-2 py-3 px-2 text-xs font-extrabold transition-all ${
                                activeTab === key
                                    ? 'border-teal-500 text-teal-600 dark:text-teal-400 bg-white dark:bg-[#0b1426] rounded-t-xl shadow-xs'
                                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            <Icon size={15} />
                            <span>{label}</span>
                        </button>
                    ))}
                </div>

                {/* Tab Body */}
                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 scrollbar-thin">
                    {duplicatePatients.length > 0 && (
                        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-4 text-xs text-amber-900 dark:text-amber-200">
                            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
                            <div>
                                <p className="font-extrabold">{t('modal.duplicatesFound', 'Matching existing patients found:')}</p>
                                <div className="mt-1 space-y-0.5">
                                    {duplicatePatients.slice(0, 3).map(p => (
                                        <p key={p.patient_id} className="flex flex-wrap items-center gap-1.5 font-semibold">
                                            <span className="font-mono text-teal-600 dark:text-teal-400">{p.mrn}</span>
                                            <span>• {p.first_name} {p.last_name} • {p.phone || t('fallback.na')}</span>
                                        </p>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 1: DEMOGRAPHICS */}
                    {activeTab === 'demographics' && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <PatientField label={t('modal.fields.firstName')} value={form.firstName} onChange={v => patch({ firstName: v })} />
                            <PatientField label={t('modal.fields.lastName')} value={form.lastName} onChange={v => patch({ lastName: v })} />
                            <PatientField label={t('modal.fields.dateOfBirth')} value={form.dateOfBirth} onChange={v => patch({ dateOfBirth: v })} type="date" />
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{t('modal.fields.gender')}</label>
                                <select value={form.gender} onChange={e => patch({ gender: e.target.value })} className={inputClass}>
                                    {GENDER_OPTIONS.map(g => <option key={g} value={g}>{t(`gender.${g}`)}</option>)}
                                </select>
                            </div>
                            <PatientField label={t('modal.fields.nationalId')} value={form.nationalId} onChange={v => patch({ nationalId: v })} />
                            <PatientField label={t('modal.fields.passportNumber')} value={form.passportNumber} onChange={v => patch({ passportNumber: v })} />
                            <PatientField label={t('modal.fields.phone')} value={form.phone} onChange={v => patch({ phone: v })} />
                            <PatientField label={t('modal.fields.email')} value={form.email} onChange={v => patch({ email: v })} type="email" />
                            <div className="sm:col-span-2">
                                <PatientField label={t('modal.fields.address')} value={form.address} onChange={v => patch({ address: v })} />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{t('modal.fields.patientStatus')}</label>
                                <select value={form.patientStatus} onChange={e => patch({ patientStatus: e.target.value })} className={inputClass}>
                                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: MEDICAL HISTORY */}
                    {activeTab === 'medical' && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <PatientField label={t('modal.fields.allergies')} value={form.allergies} onChange={v => patch({ allergies: v })} placeholder="e.g. Penicillin, Iodine" />
                            <PatientField label={t('modal.fields.chronicDiseases')} value={form.chronicDiseases} onChange={v => patch({ chronicDiseases: v })} placeholder="e.g. Hypertension, Diabetes" />
                            <PatientField label={t('modal.fields.priorSurgeries')} value={form.priorSurgeries} onChange={v => patch({ priorSurgeries: v })} />
                            <div>
                                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{t('modal.fields.pregnancyStatus')}</label>
                                <select value={form.pregnancyStatus} onChange={e => patch({ pregnancyStatus: e.target.value })} className={inputClass}>
                                    {['Unknown', 'Not Pregnant', 'Pregnant', 'Possibly Pregnant', 'Not Applicable'].map(s => (
                                        <option key={s} value={s}>{t(`pregnancy.${s}`)}</option>
                                    ))}
                                </select>
                            </div>
                            <PatientField label={t('modal.fields.implantsDevices')} value={form.implantsDevices} onChange={v => patch({ implantsDevices: v })} placeholder="e.g. Pacemaker, Stent" />
                            <PatientField label={t('modal.fields.renalFunctionNotes')} value={form.renalFunctionNotes} onChange={v => patch({ renalFunctionNotes: v })} placeholder="e.g. GFR, Creatinine level" />
                        </div>
                    )}

                    {/* TAB 3: EMERGENCY CONTACT */}
                    {activeTab === 'emergency' && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <PatientField label={t('modal.fields.name')} value={form.emergencyContactName} onChange={v => patch({ emergencyContactName: v })} />
                            <PatientField label={t('modal.fields.phone')} value={form.emergencyContactPhone} onChange={v => patch({ emergencyContactPhone: v })} />
                            <PatientField label={t('modal.fields.relationship')} value={form.emergencyContactRelationship} onChange={v => patch({ emergencyContactRelationship: v })} placeholder="e.g. Spouse, Parent, Child" />
                            <PatientField label={t('modal.fields.address')} value={form.emergencyContactAddress} onChange={v => patch({ emergencyContactAddress: v })} />
                        </div>
                    )}

                    {/* TAB 4: COMMUNICATION & CONSENTS */}
                    {activeTab === 'communication' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <PatientField label={t('modal.fields.preferredLanguage')} value={form.preferredLanguage} onChange={v => patch({ preferredLanguage: v })} />
                                <div>
                                    <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">{t('modal.fields.communicationPreference')}</label>
                                    <select value={form.communicationPreference} onChange={e => patch({ communicationPreference: e.target.value })} className={inputClass}>
                                        {['Phone', 'Email', 'SMS', 'WhatsApp'].map(p => <option key={p} value={p}>{t(`commPreference.${p}`)}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                                <h4 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-slate-400">Communication Consents</h4>
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
                <div className="flex shrink-0 justify-end gap-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-[#08101e] px-6 py-4">
                    <button type="button" onClick={onCancel} className={secondaryBtn}>{t('modal.cancel')}</button>
                    <button type="button" onClick={onSave} disabled={isSaving}
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-6 py-2.5 text-xs font-black text-white shadow-lg shadow-teal-600/20 transition hover:-translate-y-0.5 disabled:opacity-50 active:scale-95">
                        <Save size={16} /> {isSaving ? t('modal.saving') : t('modal.save')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

const Patients = () => {
    const { t } = useTranslation('patients');
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
    const [mergePatients, { isLoading: isMerging }] = useMergePatientsMutation();

    const [searchTerm, setSearchTerm] = useState(initialSearch);
    const [activeFilter, setActiveFilter] = useState('all');
    const [genderFilter, setGenderFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [selectedIds, setSelectedIds] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editingForm, setEditingForm] = useState(emptyPatientForm);
    const [showCreate, setShowCreate] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [createForm, setCreateForm] = useState(emptyPatientForm);
    const [mergeDraft, setMergeDraft] = useState(null);
    const [mergeReason, setMergeReason] = useState('');
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

    const startEdit = p => { setEditingId(p.patient_id); setEditingForm(toPatientForm(p)); };
    const cancelEdit = () => { setEditingId(null); setEditingForm(emptyPatientForm); };

    const saveEdit = async id => {
        try { await updatePatient({ id, ...cleanPayload(editingForm) }).unwrap(); toast.success(t('toast.updated')); cancelEdit(); }
        catch (e) { toast.error(getErrorMessage(e, t('toast.updateFailed'))); }
    };

    const saveNewPatient = async () => {
        try { await createPatient(cleanPayload(createForm)).unwrap(); toast.success(t('toast.created')); setShowCreate(false); setCreateForm(emptyPatientForm); }
        catch (e) { toast.error(getErrorMessage(e, t('toast.createFailed'))); }
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
        <div className="space-y-5">
            <PageHeader
                icon={UsersRound}
                eyebrowIcon={Activity}
                eyebrow={t('overview.eyebrow', 'Health System Registry')}
                title={t('title', 'Patient Directory & Master Index')}
                description={t('subtitle', 'Manage registered patients, medical alerts, emergency contacts, and portal communication preferences.')}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setIsImportOpen(true)}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-4 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            <Upload size={15} /> {t('bulkImport', 'Bulk CSV Import')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowCreate(true)}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-5 text-xs font-extrabold text-white shadow-md shadow-teal-600/20 transition hover:scale-[1.02] active:scale-95"
                        >
                            <Plus size={16} /> {t('addPatient', 'Register Patient')}
                        </button>
                    </div>
                }
            />

            {/* Summary Metrics Cards */}
            <section className="grid grid-cols-2 gap-3.5 md:grid-cols-5">
                <MetricCard tone="cyan" label={t('overview.total', 'Total Patients')} value={stats.total} detail={t('overview.totalDetail', 'Master registry count')} />
                <MetricCard tone="emerald" label={t('overview.active', 'Active Patients')} value={stats.active} detail={t('overview.activeDetail', 'Active portal records')} />
                <MetricCard tone="blue" label={t('overview.recent', 'Recent (14 days)')} value={stats.recent} detail={t('overview.recentDetail', 'Newly registered')} />
                <MetricCard tone="violet" label={t('overview.completeness', 'Data Quality')} value={`${stats.completeness}%`} detail={t('overview.completenessDetail', 'Profile field completeness')} />
                <MetricCard tone="rose" label={t('overview.attention', 'Attention Needed')} value={stats.missing + stats.restricted} detail={t('overview.attentionDetail', 'Missing contact/restricted')} />
            </section>

            {/* Filters Bar */}
            <section className="sticky top-4 z-20 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-2xl dark:border-slate-800/80 dark:bg-[#070e1a]">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 px-5 py-3.5">
                    <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400">
                            <SlidersHorizontal size={17} />
                        </span>
                        <div>
                            <p className="text-sm font-extrabold text-slate-900 dark:text-white">{t('filters.title', 'Search & Filters')}</p>
                            <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{t('filters.description', 'Filter patient records by demographics and status')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-[11px] font-extrabold text-slate-600 dark:text-slate-300">
                            {t('overview.results', { shown: stats.shown, total: stats.total, defaultValue: `${stats.shown} of ${stats.total} patients` })}
                        </span>
                        {hasActiveFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-extrabold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition active:scale-95"
                            >
                                <FilterX size={14} />{t('filters.reset', 'Reset filters')}
                            </button>
                        )}
                    </div>
                </div>
                <div className="space-y-3.5 px-5 py-3.5">
                    <div className="flex flex-wrap gap-2">
                        {FILTER_PILLS.map(v => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => setActiveFilter(v)}
                                className={`rounded-xl px-4 py-2 text-[11px] font-extrabold tracking-wide transition-all active:scale-95 ${
                                    activeFilter === v
                                        ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-xs'
                                        : 'bg-slate-100 dark:bg-slate-800/60 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                            >
                                {t(`filters.${v}`, v)}
                            </button>
                        ))}
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
                        <div className="relative">
                            <Search className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                value={searchTerm}
                                onChange={e => changeSearch(e.target.value)}
                                placeholder={t('searchPlaceholder', 'Search by name, MRN, National ID, phone, email...')}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white/80 ps-10 pe-8 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-[#0b1426] dark:text-slate-100"
                            />
                            {searchTerm && (
                                <button type="button" onClick={() => changeSearch('')} className="absolute end-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700 transition">
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <select
                            value={genderFilter}
                            onChange={e => setGenderFilter(e.target.value)}
                            className="h-10 rounded-xl border border-slate-200 bg-white/80 px-3.5 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 dark:border-slate-800 dark:bg-[#0b1426] dark:text-slate-300 min-w-[120px]"
                        >
                            <option value="all">{t('genderFilter.all', 'All Genders')}</option>
                            {GENDER_OPTIONS.map(g => <option key={g} value={g}>{t(`gender.${g}`, g)}</option>)}
                        </select>
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            className="h-10 rounded-xl border border-slate-200 bg-white/80 px-3.5 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 dark:border-slate-800 dark:bg-[#0b1426] dark:text-slate-300 min-w-[130px]"
                        >
                            <option value="all">{t('statusFilter.all', 'All Statuses')}</option>
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{t(`status.${s}`, s)}</option>)}
                        </select>
                        <button
                            type="button"
                            onClick={exportCsv}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white/80 px-4 text-xs font-bold text-slate-700 shadow-2xs transition hover:bg-slate-50 dark:border-slate-800 dark:bg-[#0b1426] dark:text-slate-300 hover:text-teal-600 whitespace-nowrap"
                        >
                            <Download size={15} /> {t('export', 'Export CSV')}
                        </button>
                    </div>
                </div>
                {selectedIds.length > 0 && (
                    <div className="flex flex-col gap-3 border-t border-teal-100 bg-teal-50/50 px-5 py-3 dark:border-teal-900/30 dark:bg-teal-950/20 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-600 text-[11px] font-extrabold text-white">{selectedIds.length}</span>
                            <span className="text-xs font-bold text-teal-900 dark:text-teal-300">{t('selectedCount', { count: selectedIds.length, defaultValue: `${selectedIds.length} patients selected` })}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {canRestrictPatient && (
                                <button type="button" onClick={deleteSelected} disabled={isDeleting} className={secondaryBtn}>
                                    <Trash2 size={14} /> {t('deleteSelected', 'Delete Selected')}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </section>

            {/* Patients Table Section */}
            <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-2xl dark:border-slate-800/80 dark:bg-[#070e1a]">
                <div className="flex items-center justify-between border-b border-slate-100/80 dark:border-slate-800 px-5 py-3.5">
                    <div>
                        <p className="text-sm font-extrabold text-slate-900 dark:text-white">{t('records.title', 'Patient Master Registry')}</p>
                        <p className="text-[11px] font-semibold text-slate-400">{t('records.description', 'List of registered health records and patient demographics')}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-[11px] font-extrabold text-slate-600 dark:text-slate-300">{stats.shown}</span>
                </div>
                <div className="hidden overflow-x-auto lg:block pb-1">
                    <table className="min-w-full text-left text-sm border-collapse">
                        <thead className="sticky top-0 z-10 bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200/80 dark:border-slate-800">
                            <tr>
                                <th className="w-10 px-5 py-4 text-start">
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
                                <th className="w-11 px-2 py-4" />
                                {TABLE_COLUMNS.map(col => (
                                    col.sortable
                                        ? <SortTh key={col.key} columnKey={col.key} sortConfig={sortConfig} onSort={toggleSort}>{t(`columns.${col.key}`, col.key)}</SortTh>
                                        : <th key={col.key} className="px-4 py-4 text-start text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{t(`columns.${col.key}`, col.key)}</th>
                                ))}
                                <th className="w-32 px-4 py-4 text-end text-[10px] font-extrabold uppercase tracking-widest text-slate-400">{t('actions', 'Actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-[#070e1a]">
                            {isLoading ? (
                                Array.from({ length: 7 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-5 py-3.5"><div className="h-4 w-4 rounded bg-slate-100" /></td>
                                        <td className="px-2 py-3.5"><div className="h-9 w-9 rounded-xl bg-slate-100" /></td>
                                        {TABLE_COLUMNS.map(c => (
                                            <td key={c.key} className="px-4 py-3.5">
                                                <div className={`h-3 rounded bg-slate-100 ${c.key === 'name' ? 'w-36' : 'w-20'}`} />
                                            </td>
                                        ))}
                                        <td className="px-4 py-3.5"><div className="ms-auto h-3 w-20 rounded bg-slate-100" /></td>
                                    </tr>
                                ))
                            ) : paginatedRows.length === 0 ? (
                                <tr>
                                    <td colSpan={TABLE_COLUMNS.length + 3} className="px-4 py-16 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400"><UsersRound size={22} /></span>
                                            <p className="text-sm font-semibold text-slate-500">{t('noRecordsFilters', 'No patient records match the selected filters')}</p>
                                            {hasActiveFilters && (
                                                <button type="button" onClick={clearFilters} className="rounded-lg bg-teal-50 px-4 py-2 text-xs font-bold text-teal-700 hover:bg-teal-100">
                                                    {t('filters.reset', 'Reset filters')}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedRows.map((row, i) => {
                                const isZebra = i % 2 !== 0;
                                return (
                                    <tr
                                        key={row.patient_id}
                                        onClick={() => navigate(`/patients/${row.patient_id}`)}
                                        className={`group cursor-pointer transition-colors ${isZebra ? 'bg-slate-50/40 dark:bg-slate-900/20 hover:bg-slate-100/60 dark:hover:bg-slate-800/60' : 'bg-white dark:bg-[#070e1a] hover:bg-slate-100/60 dark:hover:bg-slate-800/60'}`}
                                    >
                                        <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(row.patient_id)}
                                                onChange={e => setSelectedIds(prev => e.target.checked ? [...prev, row.patient_id] : prev.filter(id => id !== row.patient_id))}
                                                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 transition"
                                            />
                                        </td>
                                        <td className="px-2 py-3.5" />
                                        {TABLE_COLUMNS.map(col => (
                                            <td key={col.key} className="px-4 py-3.5">
                                                {editingId === row.patient_id && editableColumnKeys.includes(col.key)
                                                    ? <InlineEditor columnKey={col.key} form={editingForm} setForm={setEditingForm} />
                                                    : <CellValue row={row} columnKey={col.key} />}
                                            </td>
                                        ))}
                                        <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                                            <div className="opacity-0 transition-opacity group-hover:opacity-100">
                                                <RowActions
                                                    editing={editingId === row.patient_id}
                                                    isSaving={isUpdating}
                                                    onView={() => navigate(`/patients/${row.patient_id}`)}
                                                    onEdit={() => startEdit(row)}
                                                    onSave={() => saveEdit(row.patient_id)}
                                                    onCancel={cancelEdit}
                                                    onDelete={canRestrictPatient ? () => removePatient(row) : undefined}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Mobile View */}
                <div className="divide-y divide-slate-100 lg:hidden">
                    {isLoading ? (
                        <p className="p-6 text-center text-sm text-slate-400">{t('loadingRecords', 'Loading patient records...')}</p>
                    ) : paginatedRows.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 p-10 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400"><UsersRound size={20} /></span>
                            <p className="text-xs text-slate-400">{t('noRecordsMobile', 'No patient records found')}</p>
                        </div>
                    ) : paginatedRows.map(row => (
                        <MobilePatientCard
                            key={row.patient_id}
                            patient={row}
                            selected={selectedIds.includes(row.patient_id)}
                            onSelect={checked => setSelectedIds(prev => checked ? [...prev, row.patient_id] : prev.filter(id => id !== row.patient_id))}
                            onView={() => navigate(`/patients/${row.patient_id}`)}
                            onEdit={() => startEdit(row)}
                            onDelete={canRestrictPatient ? () => removePatient(row) : undefined}
                        />
                    ))}
                </div>

                {/* Pagination Controls */}
                {sortedRows.length > 0 && (
                    <div className="flex flex-col gap-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-[#08101e] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-[11px] font-bold text-slate-400">
                            {t('records.pagination.range', { start: pageStart + 1, end: Math.min(pageStart + pageSize, sortedRows.length), total: sortedRows.length, defaultValue: `Showing ${pageStart + 1} to ${Math.min(pageStart + pageSize, sortedRows.length)} of ${sortedRows.length} records` })}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500">
                                {t('records.pagination.rowsPerPage', 'Rows per page')}
                                <select
                                    value={pageSize}
                                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1426] px-2 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-teal-500"
                                >
                                    {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </label>
                            <span className="min-w-16 text-center text-[11px] font-bold text-slate-500">
                                {t('records.pagination.page', { page: currentPage, pages: pageCount, defaultValue: `Page ${currentPage} of ${pageCount}` })}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1426] text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setPage(p => Math.min(pageCount, p + 1))}
                                disabled={currentPage === pageCount}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1426] text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <ChevronRight size={14} />
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

            {/* CSV Import & Delete Modals */}
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
        </div>
    );
};

export default Patients;
