import React, { useMemo } from 'react';
import { AlertCircle, Calendar, Hash, Lock, MapPin, Phone, Sparkles, User, UserCheck } from 'lucide-react';
import Modal from '../ui/Modal';
import FieldError from '../ui/FieldError';
import { inputClass, labelClass, primaryBtn, secondaryBtn } from '../../utils/designTokens';
import { toLocalDateInput } from './receptionLogic';
import { toDicomPatientName } from '../../utils/arabicTransliteration';

const PatientRegistrationModal = ({
    errors,
    isLoading,
    isOpen,
    onClose,
    onDobChange,
    onAgeChange,
    onInvalid,
    onSubmit,
    register,
    reset,
    submitForm,
    similarPatients = [],
    onSelectExistingPatient,
    fullNameValue = '',
    t
}) => {
    const dicomNamePreview = useMemo(() => {
        const trimmed = String(fullNameValue || '').trim();
        if (!trimmed || !/[\u0600-\u06FF]/.test(trimmed)) return null;
        const tokens = trimmed.split(/\s+/).filter(Boolean);
        const firstName = tokens[0] || '';
        const lastName = tokens.length > 1 ? tokens.slice(1).join(' ') : 'Unknown';
        return toDicomPatientName(lastName, firstName);
    }, [fullNameValue]);

    return (
    <Modal
        isOpen={isOpen}
        onClose={() => {
            if (!isLoading) {
                onClose();
                reset();
            }
        }}
        title={t('register.title')}
    >
        <form onSubmit={submitForm(onSubmit, onInvalid)} className="space-y-4 p-1" noValidate>
            {/* ── Potential Duplicate / Similar Patients Alert Banner ── */}
            {similarPatients && similarPatients.length > 0 && (
                <div className="rounded-2xl border border-amber-300/80 bg-amber-50/90 p-3.5 text-xs text-amber-900 shadow-xs dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-start gap-2.5">
                        <AlertCircle size={17} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <div className="min-w-0 flex-1">
                            <p className="font-black text-amber-950 dark:text-amber-100">
                                {t('register.similarPatientsFound', { defaultValue: 'Matching existing patients found' })}
                            </p>
                            <p className="mt-0.5 text-[11px] font-semibold text-amber-800/80 dark:text-amber-300/80">
                                {t('register.similarPatientsHint', { defaultValue: 'To avoid duplicate records, you can select an existing patient directly:' })}
                            </p>

                            <div className="mt-2.5 space-y-1.5">
                                {similarPatients.map((patient) => (
                                    <div
                                        key={patient.patient_id}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/80 bg-white/95 p-2.5 shadow-2xs dark:border-amber-900/60 dark:bg-slate-900"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate font-black text-slate-900 dark:text-white">
                                                {patient.first_name} {patient.last_name}
                                            </p>
                                            <p className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                                <span className="font-mono text-teal-700 dark:text-teal-300">{patient.mrn}</span>
                                                {patient.phone && <span>• {patient.phone}</span>}
                                                {patient.date_of_birth && <span>• {patient.date_of_birth}</span>}
                                            </p>
                                        </div>

                                        {onSelectExistingPatient && (
                                            <button
                                                type="button"
                                                onClick={() => onSelectExistingPatient(patient)}
                                                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-[11px] font-black text-white shadow-xs hover:bg-teal-700 transition active:scale-95"
                                            >
                                                <UserCheck size={13} />
                                                <span>{t('register.useExistingPatient', { defaultValue: 'Select Patient & Book' })}</span>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Full Name ── */}
            <div>
                <label htmlFor="register-full-name" className={labelClass}>
                    <span className="flex items-center gap-1.5">
                        <User size={13} className="text-teal-600" />
                        {t('register.fullName')} *
                    </span>
                </label>
                <input
                    id="register-full-name"
                    autoFocus
                    autoComplete="name"
                    {...register('fullName', {
                        required: t('register.errors.fullNameRequired', { defaultValue: 'Full name is required.' }),
                        validate: value => value.trim().length >= 2 || t('register.errors.fullNameShort', { defaultValue: 'Enter at least 2 characters.' }),
                        maxLength: { value: 200, message: t('register.errors.fullNameLong', { defaultValue: 'Full name is too long.' }) }
                    })}
                    placeholder={t('register.fullNamePlaceholder')}
                    className={`${inputClass} ${errors.fullName ? 'border-rose-400 ring-2 ring-rose-100' : ''}`}
                    aria-invalid={Boolean(errors.fullName)}
                    aria-errormessage={errors.fullName ? 'register-full-name-error' : undefined}
                    aria-describedby={errors.fullName ? 'register-full-name-error' : undefined}
                />
                <FieldError id="register-full-name-error" error={errors.fullName} />
                {dicomNamePreview && (
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 rounded-xl border border-teal-200/80 bg-teal-50/70 p-2 text-xs text-teal-900 shadow-2xs dark:border-teal-800/50 dark:bg-teal-950/40 dark:text-teal-200">
                        <span className="flex items-center gap-1.5">
                            <span className="font-bold text-teal-700 dark:text-teal-300">DICOM (MWL):</span>
                            <span className="font-mono font-black tracking-wide text-slate-900 dark:text-teal-100">{dicomNamePreview}</span>
                        </span>
                        <span className="rounded bg-teal-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800 dark:bg-teal-900/60 dark:text-teal-200">
                            {t('register.autoTransliterated', { defaultValue: 'Auto-transliterated for scanners' })}
                        </span>
                    </div>
                )}
            </div>

            {/* ── Auto-Generated Patient MRN (Disabled / Read-Only) ── */}
            <div>
                <div className="flex items-center justify-between mb-1">
                    <label htmlFor="register-mrn" className={labelClass}>
                        <span className="flex items-center gap-1.5">
                            <Hash size={13} className="text-teal-600" />
                            {t('register.mrn', { defaultValue: 'Patient MRN' })}
                        </span>
                    </label>
                    <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-black text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                        <Lock size={10} />
                        {t('register.autoGenerated', { defaultValue: 'Auto-generated by system' })}
                    </span>
                </div>
                <input
                    id="register-mrn"
                    readOnly
                    disabled
                    tabIndex={-1}
                    value={t('register.autoMrnPlaceholder', { defaultValue: 'PAT-YYYYMMDD-XXXXX (System Assigned)' })}
                    className={`${inputClass} cursor-not-allowed bg-slate-100/80 font-mono text-xs text-slate-400 dark:bg-slate-900/90 dark:text-slate-500`}
                    dir="ltr"
                    aria-invalid={Boolean(errors.mrn)}
                    aria-errormessage={errors.mrn ? 'register-mrn-error' : undefined}
                    aria-describedby={errors.mrn ? 'register-mrn-error' : undefined}
                />
                <FieldError id="register-mrn-error" error={errors.mrn} />
            </div>

            {/* ── Date of Birth <-> Age (Bidirectional Calculation) ── */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label htmlFor="register-dob" className={labelClass}>
                        <span className="flex items-center gap-1.5">
                            <Calendar size={13} className="text-teal-600" />
                            {t('register.dob')} *
                        </span>
                    </label>
                    <input
                        id="register-dob"
                        type="date"
                        max={toLocalDateInput()}
                        {...register('dob', {
                            required: t('register.errors.dobRequired', { defaultValue: 'Date of birth is required.' }),
                            onChange: onDobChange
                        })}
                        className={`${inputClass} ${errors.dob ? 'border-rose-400 ring-2 ring-rose-100' : ''}`}
                        aria-invalid={Boolean(errors.dob)}
                        aria-errormessage={errors.dob ? 'register-dob-error' : undefined}
                        aria-describedby={errors.dob ? 'register-dob-error' : undefined}
                    />
                    <FieldError id="register-dob-error" error={errors.dob} />
                </div>
                <div>
                    <label htmlFor="register-age" className={labelClass}>
                        <span className="flex items-center gap-1.5">
                            <Sparkles size={13} className="text-teal-600" />
                            {t('register.age')} ({t('register.yearsOld', { defaultValue: 'yrs' })})
                        </span>
                    </label>
                    <input
                        id="register-age"
                        type="number"
                        min="0"
                        max="150"
                        inputMode="numeric"
                        placeholder={t('register.age')}
                        {...register('age', {
                            min: 0,
                            max: 150,
                            onChange: onAgeChange
                        })}
                        className={`${inputClass} ${errors.age ? 'border-rose-400 ring-2 ring-rose-100' : ''}`}
                        aria-invalid={Boolean(errors.age)}
                        aria-errormessage={errors.age ? 'register-age-error' : undefined}
                        aria-describedby={errors.age ? 'register-age-error' : undefined}
                    />
                    <FieldError id="register-age-error" error={errors.age} />
                </div>
            </div>

            {/* ── Gender & Mobile ── */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label htmlFor="register-gender" className={labelClass}>{t('register.gender')}</label>
                    <select id="register-gender" {...register('gender')} className={inputClass}>
                        <option value="Male">{t('register.male')}</option>
                        <option value="Female">{t('register.female')}</option>
                        <option value="Other">{t('register.other', { defaultValue: 'Other' })}</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="register-phone" className={labelClass}>
                        <span className="flex items-center gap-1.5">
                            <Phone size={13} className="text-teal-600" />
                            {t('register.mobile')} *
                        </span>
                    </label>
                    <input
                        id="register-phone"
                        type="tel"
                        autoComplete="tel"
                        {...register('phone', {
                            required: t('register.errors.phoneRequired', { defaultValue: 'Mobile number is required.' }),
                            setValueAs: value => value?.replace(/\D/g, ''),
                            validate: value => /^\d{10,15}$/.test(value || '') || t('register.errors.phoneInvalid', { defaultValue: 'Enter a valid 10-15 digit phone number.' })
                        })}
                        placeholder={t('register.phonePlaceholder', { defaultValue: '10-15 digits' })}
                        className={`${inputClass} ltr-embed ${errors.phone ? 'border-rose-400 ring-2 ring-rose-100' : ''}`}
                        dir="ltr"
                        aria-invalid={Boolean(errors.phone)}
                        aria-errormessage={errors.phone ? 'register-phone-error' : undefined}
                        aria-describedby={errors.phone ? 'register-phone-error' : undefined}
                    />
                    <FieldError id="register-phone-error" error={errors.phone} />
                </div>
            </div>

            {/* ── Address ── */}
            <div>
                <label htmlFor="register-address" className={labelClass}>
                    <span className="flex items-center gap-1.5">
                        <MapPin size={13} className="text-teal-600" />
                        {t('register.address')}
                    </span>
                </label>
                <input
                    id="register-address"
                    autoComplete="street-address"
                    {...register('address', {
                        validate: value => !value?.trim() || value.trim().length >= 5 || t('register.errors.addressShort', { defaultValue: 'Address must be at least 5 characters.' })
                    })}
                    placeholder={t('register.addressPlaceholder')}
                    className={`${inputClass} ${errors.address ? 'border-rose-400 ring-2 ring-rose-100' : ''}`}
                    aria-invalid={Boolean(errors.address)}
                    aria-errormessage={errors.address ? 'register-address-error' : undefined}
                    aria-describedby={errors.address ? 'register-address-error' : undefined}
                />
                <FieldError id="register-address-error" error={errors.address} />
            </div>

            {/* ── Actions ── */}
            <div className="mt-4 flex justify-end gap-3 border-t border-slate-150/60 pt-4 dark:border-slate-800/60">
                <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => {
                        onClose();
                        reset();
                    }}
                    className={secondaryBtn}
                >
                    {t('register.cancel')}
                </button>
                <button type="submit" disabled={isLoading} className={primaryBtn}>
                    {isLoading ? t('register.registering') : t('register.complete')}
                </button>
            </div>
        </form>
    </Modal>
    );
};

export default PatientRegistrationModal;
