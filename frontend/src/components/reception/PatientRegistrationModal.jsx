import React from 'react';
import Modal from '../ui/Modal';
import FieldError from '../ui/FieldError';
import { inputClass, labelClass, primaryBtn, secondaryBtn } from '../../utils/designTokens';
import { toLocalDateInput } from './receptionLogic';

const PatientRegistrationModal = ({
    errors,
    isLoading,
    isOpen,
    onClose,
    onDobChange,
    onInvalid,
    onSubmit,
    register,
    reset,
    submitForm,
    t
}) => (
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
            <div>
                <label htmlFor="register-full-name" className={labelClass}>{t('register.fullName')}</label>
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
            </div>

            <div>
                <label htmlFor="register-mrn" className={labelClass}>{t('register.mrn', { defaultValue: 'MRN (optional)' })}</label>
                <input
                    id="register-mrn"
                    {...register('mrn', { maxLength: { value: 50, message: t('register.errors.mrnLong', { defaultValue: 'MRN must be 50 characters or fewer.' }) } })}
                    placeholder={t('register.mrnPlaceholder', { defaultValue: 'Leave blank to auto-generate' })}
                    className={`${inputClass} ltr-embed font-mono ${errors.mrn ? 'border-rose-400 ring-2 ring-rose-100' : ''}`}
                    dir="ltr"
                    aria-invalid={Boolean(errors.mrn)}
                    aria-errormessage={errors.mrn ? 'register-mrn-error' : undefined}
                    aria-describedby={errors.mrn ? 'register-mrn-error' : undefined}
                />
                <FieldError id="register-mrn-error" error={errors.mrn} />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label htmlFor="register-dob" className={labelClass}>{t('register.dob')}</label>
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
                    <label htmlFor="register-age" className={labelClass}>{t('register.age')}</label>
                    <input
                        id="register-age"
                        type="number"
                        min="0"
                        max="150"
                        inputMode="numeric"
                        readOnly
                        placeholder={t('register.age')}
                        {...register('age', { min: 0, max: 150 })}
                        className={`${inputClass} cursor-not-allowed bg-slate-50 dark:bg-slate-900 ${errors.age ? 'border-rose-400 ring-2 ring-rose-100' : ''}`}
                        aria-invalid={Boolean(errors.age)}
                        aria-errormessage={errors.age ? 'register-age-error' : undefined}
                        aria-describedby={errors.age ? 'register-age-error' : undefined}
                    />
                    <FieldError id="register-age-error" error={errors.age} />
                </div>
            </div>

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
                    <label htmlFor="register-phone" className={labelClass}>{t('register.mobile')}</label>
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

            <div>
                <label htmlFor="register-address" className={labelClass}>{t('register.address')}</label>
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

export default PatientRegistrationModal;
