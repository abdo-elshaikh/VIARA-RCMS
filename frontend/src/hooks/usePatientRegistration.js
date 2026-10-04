import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useCreatePatientMutation, useGetPatientsQuery } from '../store/api';
import { buildPatientRegistrationPayload } from '../utils/patientRegistration';
import { getErrorMessage } from '../utils/getErrorMessage';

/**
 * Calculates approximate Date of Birth given an age in years.
 * @param {number|string} age 
 * @returns {string} YYYY-MM-DD
 */
export const calculateDobFromAge = (age) => {
    const numericAge = parseInt(age, 10);
    if (isNaN(numericAge) || numericAge < 0 || numericAge > 150) return '';
    const now = new Date();
    const birthYear = now.getFullYear() - numericAge;
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${birthYear}-${month}-${day}`;
};

/**
 * Calculates age in years from a Date of Birth string.
 * @param {string} dob 
 * @returns {number|string}
 */
export const calculateAgeFromDob = (dob) => {
    if (!dob) return '';
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return '';
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return Math.max(0, age);
};

/**
 * Owns the quick patient registration form used in the reception workspace.
 * Wraps react-hook-form, bidirectional DOB/age synchronization, duplicate detection, and the API submit call.
 *
 * @param {{ navigate: Function, selectedDate: string }} params
 */
export const usePatientRegistration = ({ navigate, selectedDate }) => {
    const { t } = useTranslation('reception');
    const [createPatient, { isLoading }] = useCreatePatientMutation();
    const [isOpen, setIsOpen] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        setValue,
        watch,
        formState: { errors },
    } = useForm({
        mode: 'onTouched',
        defaultValues: { gender: 'Male', fullName: '', dob: '', age: '', phone: '', address: '' },
    });

    const watchedFullName = watch('fullName') || '';
    const watchedPhone = watch('phone') || '';
    const watchedDob = watch('dob') || '';

    // Search query for duplicate / similarity checking
    const searchQuery = useMemo(() => {
        const cleanPhone = watchedPhone.replace(/\D/g, '');
        if (cleanPhone.length >= 6) return cleanPhone;
        const trimmedName = watchedFullName.trim();
        if (trimmedName.length >= 3) return trimmedName;
        return undefined;
    }, [watchedFullName, watchedPhone]);

    const { data: searchResponse } = useGetPatientsQuery(
        { search: searchQuery, limit: 5 },
        { skip: !isOpen || !searchQuery }
    );

    const similarPatients = useMemo(() => {
        const list = searchResponse?.data || [];
        if (!list.length) return [];
        const cleanPhone = watchedPhone.replace(/\D/g, '');
        const cleanName = watchedFullName.trim().toLowerCase();

        return list.filter(p => {
            const pName = `${p.first_name || ''} ${p.last_name || ''}`.trim().toLowerCase();
            const pPhone = String(p.phone || '').replace(/\D/g, '');
            const pMrn = String(p.mrn || '').toLowerCase();

            if (cleanPhone && pPhone && (pPhone.includes(cleanPhone) || cleanPhone.includes(pPhone))) return true;
            if (cleanName && pName && (pName.includes(cleanName) || cleanName.includes(pName))) return true;
            if (cleanName && pMrn && pMrn.includes(cleanName)) return true;
            return false;
        }).slice(0, 3);
    }, [searchResponse?.data, watchedFullName, watchedPhone]);

    const open = useCallback(() => setIsOpen(true), []);

    const close = useCallback(() => {
        setIsOpen(false);
        reset();
    }, [reset]);

    // Handle Date of Birth input -> auto-calculate Age
    const onDobChange = useCallback((e) => {
        const date = e?.target?.value ?? e;
        if (!date) {
            setValue('age', '', { shouldValidate: true });
            return;
        }
        const age = calculateAgeFromDob(date);
        setValue('age', age, { shouldValidate: true });
    }, [setValue]);

    // Handle Age input -> auto-calculate Date of Birth
    const onAgeChange = useCallback((e) => {
        const val = e?.target?.value ?? e;
        if (val === '' || val === undefined || val === null) {
            setValue('dob', '', { shouldValidate: true });
            return;
        }
        const dob = calculateDobFromAge(val);
        if (dob) {
            setValue('dob', dob, { shouldValidate: true });
        }
    }, [setValue]);

    const onSelectExistingPatient = useCallback((patient) => {
        if (!patient?.patient_id) return;
        toast.success(t('toast.patientSelected'));
        close();
        navigate(
            `/appointments/new?patientId=${encodeURIComponent(patient.patient_id)}&date=${encodeURIComponent(selectedDate)}`
        );
    }, [close, navigate, selectedDate, t]);

    const onSubmit = useCallback(async (data) => {
        try {
            const payload = buildPatientRegistrationPayload(data);
            const newPatient = await createPatient(payload).unwrap();
            const created = newPatient?.data || newPatient;
            if (!created?.patient_id) {
                throw new Error(t('register.invalidResponse', {
                    defaultValue: 'Patient was created but the server response was incomplete.',
                }));
            }
            toast.success(t('toast.patientRegistered'));
            toast.success(t('toast.patientSelected'));
            close();
            navigate(
                `/appointments/new?patientId=${encodeURIComponent(created.patient_id)}&date=${encodeURIComponent(selectedDate)}`
            );
        } catch (err) {
            toast.error(t('toast.registrationFailed', { error: getErrorMessage(err) }));
        }
    }, [close, createPatient, navigate, selectedDate, t]);

    const onInvalid = useCallback(() => {
        toast.error(t('register.fixErrors', { defaultValue: 'Review the highlighted patient details.' }));
    }, [t]);

    const registrationModalProps = {
        errors,
        isLoading,
        isOpen,
        onClose: close,
        onDobChange,
        onAgeChange,
        onInvalid,
        onSubmit,
        register,
        reset,
        submitForm: handleSubmit,
        similarPatients,
        onSelectExistingPatient,
        fullNameValue: watchedFullName,
        t,
    };

    return {
        register,
        submitForm: handleSubmit,
        errors,
        isLoading,
        isOpen,
        open,
        close,
        onSubmit,
        onInvalid,
        onDobChange,
        onAgeChange,
        similarPatients,
        onSelectExistingPatient,
        reset,
        registrationModalProps,
    };
};
