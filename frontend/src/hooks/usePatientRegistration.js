import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useCreatePatientMutation } from '../store/api';
import { buildPatientRegistrationPayload } from '../utils/patientRegistration';
import { getErrorMessage } from '../utils/getErrorMessage';

/**
 * Owns the quick patient registration form used in the reception workspace.
 * Wraps react-hook-form, DOB/age synchronization helpers, and the API submit call.
 *
 * @param {{ navigate: Function, selectedDate: string }} params
 * @returns {{
 *   register: UseFormRegister,
 *   submitForm: UseFormHandleSubmit,
 *   errors: object,
 *   isLoading: boolean,
 *   isOpen: boolean,
 *   open: () => void,
 *   close: () => void,
 *   onSubmit: (data: object) => Promise<void>,
 *   onInvalid: () => void,
 *   onDobChange: (e: React.ChangeEvent) => void,
 *   onAgeChange: (e: React.ChangeEvent) => void,
 *   reset: () => void,
 *   registrationModalProps: object,
 * }}
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
        formState: { errors },
    } = useForm({
        mode: 'onTouched',
        defaultValues: { gender: 'Male', fullName: '', dob: '', phone: '' },
    });

    const open = useCallback(() => setIsOpen(true), []);

    const close = useCallback(() => {
        setIsOpen(false);
        reset();
    }, [reset]);

    const onDobChange = useCallback((e) => {
        const date = e.target.value;
        if (!date) return;
        const birth = new Date(date);
        const now = new Date();
        let age = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
        setValue('age', age);
    }, [setValue]);

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
    /** Prop bundle spread directly onto PaymentCollectionModal. */
    const registrationModalProps = {
        errors,
        isLoading,
        isOpen,
        onClose: close,
        onDobChange,
        onInvalid,
        onSubmit,
        register,
        reset,
        submitForm: handleSubmit,
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
        reset,
        registrationModalProps,
    };
};
