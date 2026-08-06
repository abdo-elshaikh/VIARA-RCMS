import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    Activity,
    AlertCircle,
    ArrowLeft,
    CalendarCheck2,
    CheckCircle2,
    Clock3,
    CreditCard,
    Search,
    ShieldCheck,
    Stethoscope,
    UserPlus,
    UserRound,
    UsersRound
} from 'lucide-react';
import {
    useCreateAppointmentMutation,
    useCreateInsuranceApprovalMutation,
    useGetAppointmentsQuery,
    useGetExamTypesQuery,
    useGetInsuranceProvidersQuery,
    useGetMachinesQuery,
    useGetPatientHistoryQuery,
    useGetPatientsQuery,
    useGetReferringDoctorsQuery,
    useGetStaffQuery
} from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import { inputClass, labelClass } from '../utils/designTokens';
import PageHeader from '../components/ui/PageHeader';

const toDateInput = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const nextTime = () => {
    const date = new Date(Date.now() + 30 * 60000);
    const remainder = date.getMinutes() % 15;
    if (remainder) date.setMinutes(date.getMinutes() + 15 - remainder);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const appointmentWindow = (date, time, minutes = 60) => {
    if (!date || !time) return { start: null, end: null };
    const start = new Date(`${date}T${time}:00`);
    if (Number.isNaN(start.getTime())) return { start: null, end: null };
    return { start, end: new Date(start.getTime() + minutes * 60000) };
};

const formatTime = (date) => date?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '--:--';
const optionalId = (value) => value || null;

const Section = ({ icon: Icon, title, description, children }) => (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm backdrop-blur-sm dark:border-slate-800/80 dark:bg-[#070e1a]">
        <header className="flex items-start gap-3 border-b border-slate-100/80 bg-gradient-to-r from-slate-50/80 to-transparent px-5 py-4 dark:border-slate-800/60 dark:from-slate-900/40">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500/15 to-teal-500/5 text-teal-600 dark:from-teal-500/25 dark:to-teal-500/10 dark:text-teal-400">
                <Icon size={18} />
            </span>
            <div className="min-w-0 flex-1">
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">{title}</h2>
                {description && <p className="mt-0.5 text-[11px] font-medium text-slate-400 leading-relaxed">{description}</p>}
            </div>
        </header>
        <div className="space-y-4 p-5">{children}</div>
    </section>
);

const BookAppointment = () => {
    const { t, i18n } = useTranslation('reception');
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [patientSearch, setPatientSearch] = useState('');
    const [referralMode, setReferralMode] = useState('directory');
    const requestedPatientId = searchParams.get('patientId') || '';
    const initialDate = searchParams.get('date') || toDateInput();
    const requestedModalityId = searchParams.get('modalityId') || '';
    const requestedExamTypeId = searchParams.get('examTypeId') || '';
    const requestedPriority = searchParams.get('priority') || 'Routine';
    const requestedNotes = searchParams.get('notes') || '';
    const [date, setDate] = useState(initialDate);
    const appointmentIdempotencyKey = useRef(crypto.randomUUID());

    const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
        mode: 'onTouched',
        defaultValues: {
            patientId: requestedPatientId,
            modalityId: requestedModalityId,
            examTypeId: requestedExamTypeId,
            priority: requestedPriority,
            notes: requestedNotes,
            time: nextTime(),
            paymentMethod: 'Cash',
            appointmentSource: 'Walk-in',
            referringDoctorId: '',
            referringDoctor: '',
            radiologistId: '',
            technicianId: '',
            nurseId: '',
            preparationStatus: 'Not Required',
            contrastRequired: false,
            pregnancySafetyStatus: 'Unknown',
            implantSafetyStatus: 'Unknown',
            renalSafetyStatus: 'Unknown',
            insuranceApprovalStatus: 'Pending',
            isFollowUp: false,
            priorExamId: '',
            followUpReason: '',
            arrived: false
        }
    });

    const patientId = watch('patientId');
    const modalityId = watch('modalityId');
    const examTypeId = watch('examTypeId');
    const time = watch('time');
    const paymentMethod = watch('paymentMethod');
    const arrived = watch('arrived');
    const isFollowUp = watch('isFollowUp');
    const referringDoctorId = watch('referringDoctorId');
    const customReferringDoctor = watch('referringDoctor');
    const radiologistId = watch('radiologistId');
    const { data: patientsResponse = [], isLoading: patientsLoading } = useGetPatientsQuery({ limit: 500 });
    const { data: patientHistory, isFetching: patientHistoryLoading } = useGetPatientHistoryQuery(patientId, { skip: !patientId });
    const { data: appointments = [] } = useGetAppointmentsQuery({ date });
    const { data: machines = [] } = useGetMachinesQuery();
    const { data: staff = [] } = useGetStaffQuery();
    const { data: examTypes = [] } = useGetExamTypesQuery(modalityId, { skip: !modalityId });
    const { data: doctors = [] } = useGetReferringDoctorsQuery({ active: 'true', limit: 500 });
    const { data: insurers = [] } = useGetInsuranceProvidersQuery();
    const [createAppointment, { isLoading: isSaving }] = useCreateAppointmentMutation();
    const [createInsuranceApproval] = useCreateInsuranceApprovalMutation();

    const patients = useMemo(
        () => Array.isArray(patientsResponse) ? patientsResponse : patientsResponse?.data || [],
        [patientsResponse]
    );
    const requestedPatient = requestedPatientId && patientHistory?.patient?.patient_id === requestedPatientId
        ? patientHistory.patient
        : null;
    const allPatientOptions = useMemo(() => {
        if (!requestedPatient || patients.some(patient => patient.patient_id === requestedPatient.patient_id)) return patients;
        return [requestedPatient, ...patients];
    }, [patients, requestedPatient]);
    const selectedPatient = allPatientOptions.find(patient => patient.patient_id === patientId);
    const patientOptions = useMemo(() => {
        const tokens = patientSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        if (tokens.length === 0) return allPatientOptions;
        const matches = allPatientOptions.filter(patient => {
            const searchable = [
                patient.first_name,
                patient.last_name,
                `${patient.first_name || ''} ${patient.last_name || ''}`,
                patient.mrn,
                patient.phone,
                patient.mobile
            ].filter(Boolean).join(' ').toLocaleLowerCase();
            return tokens.every(token => searchable.includes(token));
        });
        if (selectedPatient && !matches.some(patient => patient.patient_id === selectedPatient.patient_id)) {
            return [selectedPatient, ...matches];
        }
        return matches;
    }, [allPatientOptions, patientSearch, selectedPatient]);
    const isRtl = i18n?.dir?.() === 'rtl' || i18n?.language?.startsWith('ar');

    const formatArabicDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString(i18n?.language?.startsWith('ar') ? 'ar-EG' : 'en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };
    const activeMachines = useMemo(() => machines.filter(machine => machine.status === 'Active'), [machines]);
    const selectedMachine = activeMachines.find(machine => machine.modality_id === modalityId) || machines.find(machine => machine.modality_id === modalityId);
    const selectedExam = examTypes.find(exam => exam.type_id === examTypeId);
    const selectedReferringDoctor = doctors.find(doctor => doctor.doctor_id === referringDoctorId);
    const duration = selectedExam?.duration_minutes || 60;
    const slot = appointmentWindow(date, time, duration);
    const slotStartTime = slot.start?.getTime() || null;
    const priorExams = useMemo(() => (patientHistory?.history || []).filter(item => (
        item.exam_id
        && item.status !== 'Cancelled'
        && (!slotStartTime || new Date(item.start_time).getTime() < slotStartTime)
    )), [patientHistory?.history, slotStartTime]);
    const isPast = Boolean(slot.start && slot.start < new Date() && !arrived);
    const overlap = appointments.find(appointment => {
        if (!modalityId || !slot.start || !slot.end || appointment.status === 'Cancelled') return false;
        return appointment.modality_id === modalityId && new Date(appointment.start_time) < slot.end && new Date(appointment.end_time) > slot.start;
    });
    const roleStaff = useMemo(() => ({
        radiologists: staff.filter(member => member.role === 'Radiologist'),
        technicians: staff.filter(member => member.role === 'Technician'),
        nurses: staff.filter(member => member.role === 'Nurse')
    }), [staff]);
    const selectedRadiologist = roleStaff.radiologists.find(member => member.user_id === radiologistId);
    const referralDisplay = referralMode === 'custom'
        ? (customReferringDoctor?.trim() || t('bookingPage.customReferralPending', 'Custom referral'))
        : (selectedReferringDoctor?.full_name || t('bookingPage.walkIn', 'Walk-in'));

    useEffect(() => {
        setValue('examTypeId', '');
        setValue('paymentAmount', '');
    }, [modalityId, setValue]);

    useEffect(() => {
        setValue('isFollowUp', false);
        setValue('priorExamId', '');
        setValue('followUpReason', '');
    }, [patientId, setValue]);

    useEffect(() => {
        if (referralMode === 'directory') {
            setValue('referringDoctor', '');
        } else {
            setValue('referringDoctorId', '');
        }
    }, [referralMode, setValue]);

    useEffect(() => {
        if (!selectedExam) return;
        setValue('paymentAmount', selectedExam.price);
        setValue('bodyPart', selectedExam.body_part || '');
        setValue('contrastRequired', Boolean(selectedExam.contrast_required));
    }, [selectedExam, setValue]);

    useEffect(() => {
        if (arrived) {
            const todayStr = toDateInput();
            if (date === todayStr) {
                const now = new Date();
                const currentHrMin = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                setValue('time', currentHrMin);
            }
        }
    }, [arrived, date, setValue]);

    const submit = async data => {
        if (!slot.start || !slot.end) return toast.error(t('toast.bookingValidTime'));
        if (isPast) return toast.error(t('toast.bookingFutureTime'));
        if (overlap) return toast.error(t('toast.bookingOverlap'));
        if (data.isFollowUp && !data.priorExamId) {
            return toast.error(t('bookingPage.priorExamRequired', 'Select the prior examination for this follow-up.'));
        }
        try {
            const customDoctorName = data.referringDoctor?.trim();
            const useCustomReferrer = referralMode === 'custom';
            const payload = {
                idempotencyKey: appointmentIdempotencyKey.current,
                patientId: data.patientId,
                modalityId: data.modalityId,
                examTypeId: data.examTypeId,
                startTime: slot.start.toISOString(),
                endTime: slot.end.toISOString(),
                radiologistId: optionalId(data.radiologistId),
                technicianId: optionalId(data.technicianId),
                nurseId: optionalId(data.nurseId),
                referringDoctorId: useCustomReferrer ? null : optionalId(data.referringDoctorId),
                referringDoctor: useCustomReferrer && customDoctorName ? customDoctorName : null,
                priority: data.priority,
                clinicalIndication: data.clinicalIndication?.trim() || undefined,
                bodyPart: data.bodyPart?.trim() || undefined,
                contrastRequired: Boolean(data.contrastRequired),
                pregnancySafetyStatus: data.pregnancySafetyStatus,
                implantSafetyStatus: data.implantSafetyStatus,
                renalSafetyStatus: data.renalSafetyStatus,
                paymentMethod: data.paymentMethod,
                paymentAmount: data.paymentAmount ? Number(data.paymentAmount) : undefined,
                appointmentSource: data.appointmentSource,
                preparationStatus: data.preparationStatus,
                notes: data.notes?.trim() || undefined,
                isFollowUp: Boolean(data.isFollowUp),
                priorExamId: data.isFollowUp ? data.priorExamId : undefined,
                followUpReason: data.isFollowUp ? (data.followUpReason?.trim() || undefined) : undefined,
                arrived: Boolean(data.arrived)
            };
            const created = await createAppointment(payload).unwrap();
            if (data.paymentMethod === 'Insurance' && data.insuranceProviderId) {
                try {
                    await createInsuranceApproval({
                        patientId: data.patientId,
                        providerId: data.insuranceProviderId,
                        appointmentId: created.appointment_id,
                        examTypeId: data.examTypeId,
                        status: data.insuranceApprovalStatus,
                        approvalNumber: data.insuranceApprovalNumber?.trim() || undefined,
                        requestedAmount: data.paymentAmount ? Number(data.paymentAmount) : undefined,
                        documentUrl: data.insuranceApprovalDocumentUrl?.trim() || undefined
                    }).unwrap();
                } catch (approvalError) {
                    toast.error(t('toast.appointmentBookedApprovalFailed', {
                        reference: created.appointment_id,
                        error: getErrorMessage(approvalError)
                    }), { duration: 8000 });
                    navigate(`/appointments?patientId=${encodeURIComponent(data.patientId)}`, { replace: true });
                    return;
                }
            }
            toast.success(t('toast.appointmentBooked'));
            navigate('/reception', { replace: true });
        } catch (error) {
            toast.error(t('toast.bookingFailed', { error: getErrorMessage(error) }));
        }
    };

    return (
        <div className="space-y-5 pb-28" dir={isRtl ? 'rtl' : undefined}>
            <PageHeader
                icon={CalendarCheck2}
                eyebrowIcon={Activity}
                eyebrow={t('bookingPage.eyebrow', 'Scheduling workspace')}
                title={t('booking.title', 'Book Examination Appointment')}
                description={t('bookingPage.description', 'Select the patient, reserve an available machine slot, and assign the clinical team.')}
                meta={(
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/60 bg-slate-50/40 px-3 py-1.5 text-[11px] font-semibold text-slate-600 dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface-muted)] dark:text-[var(--rcms-muted)]">
                            <CalendarCheck2 size={12} />
                            {formatArabicDate(date)}
                        </span>
                        <Link to="/appointments" className="inline-flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white/80 px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800">
                            <ArrowLeft size={15} className="rtl-flip" />{t('bookingPage.back', 'Back to appointments')}
                        </Link>
                    </div>
                )}
                actions={(
                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100/70 p-2.5 dark:bg-slate-900">
                        {[[t('booking.start', 'Start'), formatTime(slot.start)], [t('booking.end', 'End'), formatTime(slot.end)], [t('booking.duration', 'Duration'), `${duration}m`]].map(([label, value]) => (
                            <div key={label} className="min-w-20 rounded-lg bg-white/80 dark:bg-[#0b1426] px-3 py-2 text-center shadow-sm backdrop-blur-sm">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                                <p className="mt-1 text-xs font-extrabold text-slate-900 dark:text-slate-100">{value}</p>
                            </div>
                        ))}
                    </div>
                )}
            />

            <form id="book-appointment-form" onSubmit={handleSubmit(submit)} className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,.75fr)]" dir={isRtl ? 'rtl' : undefined}>
                <div className="space-y-5">
                    <Section icon={UserRound} title={t('booking.patientAndTime', 'Patient & Appointment Window')} description={t('bookingPage.patientHint', 'Find the patient and choose the requested date and start time.')}>
                        <div>
                            <div className="flex items-center justify-between gap-3">
                                <label className={labelClass} htmlFor="patient-search">{t('bookingPage.searchPatient', 'Search patient')}</label>
                                {patientSearch && <button type="button" onClick={() => setPatientSearch('')} className="mb-1.5 text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline">{t('bookingPage.clearSearch', 'Clear')}</button>}
                            </div>
                            <div className="relative">
                                <Search className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                <input id="patient-search" value={patientSearch} onChange={event => setPatientSearch(event.target.value)} className={`${inputClass} ps-10`} placeholder={t('bookingPage.searchPlaceholder', 'Name, MRN, or mobile number')} autoComplete="off" />
                            </div>
                            <p className="mt-1.5 text-xs font-semibold text-slate-400">{t('bookingPage.searchResults', { count: patientOptions.length, defaultValue: `${patientOptions.length} matching patients` })}</p>
                        </div>
                        <div>
                            <label className={labelClass} htmlFor="patientId">{t('booking.selectedPatient', 'Selected Patient')}</label>
                            <select id="patientId" {...register('patientId', { required: t('validation.patientRequired') })} className={inputClass}>
                                <option value="">{patientsLoading ? t('bookingPage.loadingPatients', 'Loading patients...') : patientOptions.length === 0 ? t('bookingPage.noPatientsFound', 'No matching patients found') : t('booking.noPatientSelected', 'Select patient...')}</option>
                                {patientOptions.map(patient => <option key={patient.patient_id} value={patient.patient_id}>{patient.first_name} {patient.last_name} — {patient.mrn}{patient.phone ? ` — ${patient.phone}` : ''}</option>)}
                            </select>
                            {errors.patientId && <p className="mt-1 text-xs font-extrabold text-rose-600 dark:text-rose-400">{errors.patientId.message}</p>}
                        </div>
                        {selectedPatient && (
                            <div className="rounded-xl border border-teal-200/80 bg-teal-50/50 dark:border-teal-900/50 dark:bg-teal-950/20 p-3">
                                <p className="font-extrabold text-slate-900 dark:text-white text-xs">{selectedPatient.first_name} {selectedPatient.last_name}</p>
                                <p className="mt-0.5 text-xs font-semibold text-teal-700 dark:text-teal-400">{selectedPatient.mrn} — {selectedPatient.phone || t('bookingPage.noPhone', 'No phone')}</p>
                            </div>
                        )}
                        {selectedPatient && (
                            <div className={`rounded-xl border p-3.5 transition-colors ${isFollowUp ? 'border-sky-200 bg-sky-50/70 dark:border-sky-900/60 dark:bg-sky-950/20' : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-[#0b1426]'}`}>
                                <label htmlFor="is-follow-up" className="flex cursor-pointer items-start gap-3">
                                    <input id="is-follow-up" type="checkbox" {...register('isFollowUp')} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                                    <span className="min-w-0">
                                        <span className="block text-xs font-extrabold text-slate-900 dark:text-white">{t('bookingPage.followUp', 'Follow-up appointment')}</span>
                                        <span className="mt-0.5 block text-[11px] font-semibold text-slate-400">{t('bookingPage.followUpHint', 'Link this visit to the prior study being reviewed or monitored.')}</span>
                                    </span>
                                </label>
                                {isFollowUp && (
                                    <div className="mt-3 space-y-3 border-t border-sky-200/70 pt-3 dark:border-sky-900/50">
                                        <div>
                                            <label className={labelClass} htmlFor="priorExamId">{t('bookingPage.priorStudy', 'Prior study')}</label>
                                            <select
                                                id="priorExamId"
                                                {...register('priorExamId', { required: isFollowUp ? t('bookingPage.priorExamRequired', 'Select the prior examination for this follow-up.') : false })}
                                                disabled={patientHistoryLoading || priorExams.length === 0}
                                                className={inputClass}
                                            >
                                                <option value="">{patientHistoryLoading ? t('bookingPage.loadingHistory', 'Loading history...') : priorExams.length ? t('bookingPage.selectPriorStudy', 'Select prior study') : t('bookingPage.noPriorStudies', 'No eligible prior studies')}</option>
                                                {priorExams.map(item => (
                                                    <option key={item.exam_id} value={item.exam_id}>
                                                        {new Date(item.start_time).toLocaleDateString()} — {item.exam_type_name || item.machine_name || 'Exam'} — {item.order_number || item.exam_id}
                                                    </option>
                                                ))}
                                            </select>
                                            {errors.priorExamId && <p className="mt-1 text-xs font-extrabold text-rose-600 dark:text-rose-400">{errors.priorExamId.message}</p>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div><label className={labelClass}>{t('booking.appointmentDate', 'Date')}</label><input type="date" min={toDateInput()} value={date} onChange={event => setDate(event.target.value)} className={inputClass} /></div>
                            <div><label className={labelClass}>{t('booking.startTime', 'Start Time')}</label><input type="time" {...register('time', { required: t('validation.startTimeRequired') })} className={inputClass} /></div>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 dark:border-slate-800 px-3.5 py-3 text-xs font-extrabold text-slate-700 dark:text-slate-300">
                            <input type="checkbox" {...register('arrived')} id="appointment-arrived" className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                            <label htmlFor="appointment-arrived" className="cursor-pointer select-none">
                                {t('bookingPage.patientArrived', 'Patient has arrived (show in waiting list)')}
                            </label>
                        </div>
                        <div className={`flex items-start gap-2 rounded-xl border p-3 text-xs font-extrabold ${isPast || overlap ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400' : 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'}`}>
                            {isPast || overlap ? <AlertCircle size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
                            {isPast ? t('booking.futureTime', 'Appointment time cannot be in the past.') : overlap ? t('booking.machineBooked', { machine: selectedMachine?.name || t('booking.thisMachine'), start: formatTime(new Date(overlap.start_time)), end: formatTime(new Date(overlap.end_time)) }) : modalityId && time ? t('booking.noOverlap', 'Time slot is available.') : t('booking.chooseMachineTime', 'Select a room and start time.')}
                        </div>
                    </Section>

                    <Section icon={Stethoscope} title={t('booking.examDetails', 'Exam & Modality Details')} description={t('bookingPage.examHint', 'Choose the machine and examination before confirming clinical details.')}>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div><label className={labelClass}>{t('booking.machine', 'Modality Room')}</label><select {...register('modalityId', { required: t('validation.machineRequired') })} className={inputClass}><option value="">{t('booking.selectMachine', 'Select modality...')}</option>{activeMachines.map(machine => <option key={machine.modality_id} value={machine.modality_id}>{machine.name}</option>)}</select></div>
                            <div><label className={labelClass}>{t('booking.examination', 'Examination Type')}</label><select {...register('examTypeId', { required: t('validation.examRequired') })} disabled={!modalityId} className={inputClass}><option value="">{modalityId ? t('booking.selectExam', 'Select exam type...') : t('booking.selectMachineFirst', 'Select room first')}</option>{examTypes.map(exam => <option key={exam.type_id} value={exam.type_id}>{exam.name}</option>)}</select></div>
                        </div>
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/30">
                            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
                                        <UserPlus size={16} />
                                    </span>
                                    <div>
                                        <label className="block text-[10.5px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('booking.referringDoctor', 'Referring Doctor')}</label>
                                        <p className="text-[11px] font-semibold text-slate-400">{referralDisplay}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 rounded-xl bg-white p-1 shadow-2xs dark:bg-[#0b1426]">
                                    {[
                                        ['directory', t('bookingPage.directoryDoctor', 'Directory')],
                                        ['custom', t('bookingPage.customDoctor', 'Custom')]
                                    ].map(([mode, label]) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => setReferralMode(mode)}
                                            className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${referralMode === mode ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {referralMode === 'directory' ? (
                                <select {...register('referringDoctorId')} className={inputClass}>
                                    <option value="">{t('booking.selectFromDirectory', 'None / Walk-in')}</option>
                                    {doctors.map(doctor => (
                                        <option key={doctor.doctor_id} value={doctor.doctor_id}>
                                            {doctor.full_name}{doctor.specialty ? ` - ${doctor.specialty}` : ''}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    {...register('referringDoctor', {
                                        validate: value => referralMode !== 'custom' || Boolean(value?.trim()) || t('validation.referringDoctorRequired', 'Enter the referring doctor name.'),
                                        maxLength: { value: 255, message: t('validation.referringDoctorTooLong', 'Referring doctor must be less than 255 characters.') }
                                    })}
                                    className={inputClass}
                                    placeholder={t('bookingPage.customDoctorPlaceholder', 'Doctor name, clinic, or walk-in source')}
                                    autoComplete="organization"
                                />
                            )}
                            {errors.referringDoctor && <p className="mt-1.5 text-xs font-extrabold text-rose-600 dark:text-rose-400">{errors.referringDoctor.message}</p>}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div><label className={labelClass}>{t('booking.priority', 'Priority')}</label><select {...register('priority')} className={inputClass}>{['Routine', 'Urgent', 'Emergency'].map(priority => <option key={priority} value={priority}>{t(`priority.${priority}`, priority)}</option>)}</select></div>
                            <div><label className={labelClass}>{t('booking.appointmentSource', 'Appointment Source')}</label><select {...register('appointmentSource')} className={inputClass}>{['Walk-in', 'Phone', 'Website', 'Patient Portal', 'Doctor Portal', 'Call Center'].map(source => <option key={source} value={source}>{t(`appointmentSource.${source}`, source)}</option>)}</select></div>
                        </div>
                        <div><label className={labelClass}>{t('booking.clinicalIndication', 'Clinical Indication')}</label><textarea {...register('clinicalIndication')} rows="2" className={`${inputClass} h-auto py-2.5`} placeholder={t('booking.clinicalIndicationPlaceholder', 'Describe clinical indication...')} /></div>
                    </Section>
                </div>

                <aside className="space-y-5 xl:sticky xl:top-20 xl:self-start">
                    <Section icon={UsersRound} title={t('booking.careTeam', 'Assigned Staff Team')} description={t('bookingPage.careTeamHint', 'Assign staff now or leave clinical readers unassigned until triage.')}>
                        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-[#0b1426]">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <label className={labelClass}>{t('booking.radiologist', 'Radiologist')}</label>
                                <span className="mb-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:bg-slate-800 dark:text-slate-400">{t('booking.optional', 'Optional')}</span>
                            </div>
                            <select {...register('radiologistId')} className={inputClass}>
                                <option value="">{t('booking.unassignedRadiologist', 'Unassigned')}</option>
                                {roleStaff.radiologists.map(member => <option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}
                            </select>
                            <p className="mt-2 text-[11px] font-semibold text-slate-400">
                                {selectedRadiologist ? t('bookingPage.radiologistSelected', { name: selectedRadiologist.full_name, defaultValue: `${selectedRadiologist.full_name} will receive the case.` }) : t('bookingPage.radiologistDeferred', 'The appointment will be saved without creating a radiologist work item yet.')}
                            </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                            <div><label className={labelClass}>{t('booking.technician', 'Technician')}</label><select {...register('technicianId')} className={inputClass}><option value="">{t('booking.unassigned', 'Unassigned')}</option>{roleStaff.technicians.map(member => <option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}</select></div>
                            <div><label className={labelClass}>{t('booking.nurse', 'Nurse')}</label><select {...register('nurseId')} className={inputClass}><option value="">{t('booking.unassigned', 'Unassigned')}</option>{roleStaff.nurses.map(member => <option key={member.user_id} value={member.user_id}>{member.full_name}</option>)}</select></div>
                        </div>
                    </Section>
                    <Section icon={ShieldCheck} title={t('bookingPage.safety', 'Safety Screening')}>
                        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                            {[['pregnancySafetyStatus', 'pregnancySafety'], ['implantSafetyStatus', 'implantSafety'], ['renalSafetyStatus', 'renalSafety']].map(([name, key]) => (
                                <div key={name}><label className={labelClass}>{t(`booking.${key}`, key)}</label><select {...register(name)} className={inputClass}>{['Unknown', 'Cleared', 'At Risk', 'Not Applicable'].map(value => <option key={value} value={value}>{t(`safety.${value}`, value)}</option>)}</select></div>
                            ))}
                        </div>
                    </Section>
                    <Section icon={CreditCard} title={t('booking.paymentAndNotes', 'Payment & Notes')}>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                            <div><label className={labelClass}>{t('booking.paymentMethod', 'Payment Method')}</label><select {...register('paymentMethod')} className={inputClass}><option value="Cash">{t('booking.cash', 'Cash')}</option><option value="Credit Card">{t('booking.creditCard', 'Credit Card')}</option><option value="Insurance">{t('booking.insurance', 'Insurance')}</option><option value="Wallet">{t('booking.wallet', 'Wallet')}</option><option value="Bank Transfer">{t('booking.bankTransfer', 'Bank Transfer')}</option></select></div>
                            <div><label className={labelClass}>{t('booking.amount', 'Payment Amount')}</label><input type="number" min="0" step="0.01" {...register('paymentAmount')} className={inputClass} /></div>
                        </div>
                        {paymentMethod === 'Insurance' && (
                            <div className="space-y-3 rounded-xl border border-teal-200/80 dark:border-teal-900/50 bg-teal-50/50 dark:bg-teal-950/20 p-3">
                                <div><label className={labelClass}>{t('booking.insuranceProvider', 'Insurance Provider')}</label><select {...register('insuranceProviderId')} className={inputClass}><option value="">{t('booking.selectProvider', 'Select provider...')}</option>{insurers.map(provider => <option key={provider.provider_id} value={provider.provider_id}>{provider.name}</option>)}</select></div>
                                <div><label className={labelClass}>{t('booking.approvalNumber', 'Approval Number')}</label><input {...register('insuranceApprovalNumber')} className={inputClass} /></div>
                            </div>
                        )}
                        <div><label className={labelClass}>{t('bookingPage.notes', 'Operational Notes')}</label><textarea {...register('notes')} rows="2" className={`${inputClass} h-auto py-2.5`} /></div>
                    </Section>
                </aside>
            </form>

            <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/90 p-3.5 shadow-lg backdrop-blur-2xl dark:border-slate-800 dark:bg-[#070e1a] lg:ps-72">
                <div className="mx-auto flex max-w-[1500px] flex-col gap-3 px-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-slate-900 dark:text-white">{selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : t('booking.noPatientSelected', 'No patient selected')}</p>
                        <p className="flex items-center gap-1.5 truncate text-[11px] font-semibold text-slate-400">
                            <Clock3 size={13} className="text-teal-600 dark:text-teal-400" />
                            {selectedMachine?.name || t('booking.noMachine', 'No room')} - {selectedExam?.name || t('booking.noExam', 'No exam')} - {formatTime(slot.start)}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => navigate(-1)} disabled={isSaving} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-[#0b1426] dark:text-slate-300 sm:flex-none">
                            {t('booking.cancel', 'Cancel')}
                        </button>
                        <button type="submit" form="book-appointment-form" disabled={isSaving || isPast || Boolean(overlap)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-6 py-2 text-xs font-extrabold text-white shadow-md shadow-teal-600/20 transition hover:scale-[1.01] active:scale-95 disabled:opacity-40 sm:flex-none">
                            <CalendarCheck2 size={15} />
                            {isSaving ? t('booking.booking', 'Booking...') : t('booking.confirmBooking', 'Confirm Appointment')}
                        </button>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default BookAppointment;
