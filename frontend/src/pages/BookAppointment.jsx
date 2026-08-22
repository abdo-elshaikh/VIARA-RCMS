import React, { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Activity, AlertCircle, AlertTriangle, ArrowLeft, CalendarCheck2, CheckCircle2, Check, Clock3, CreditCard, Search, ShieldCheck, Stethoscope, UserPlus, UserRound, Users } from "lucide-react";
import { useCreateAppointmentMutation, useCreateInsuranceApprovalMutation, useGetAppointmentsQuery, useGetExamTypesQuery, useGetInsuranceProvidersQuery, useGetMachinesQuery, useGetPatientHistoryQuery, useGetPatientsQuery, useGetReferringDoctorsQuery, useGetStaffQuery } from "../store/api";
import { getErrorMessage } from "../utils/getErrorMessage";
import { generateUUID } from '../utils/uuid';
import { inputClass } from "../utils/designTokens";
import PageHeader from "../components/ui/PageHeader";

const toDateInput = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const nextTime = () => { const d = new Date(Date.now() + 30 * 60000); const r = d.getMinutes() % 15; if (r) d.setMinutes(d.getMinutes() + 15 - r); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const appointmentWindow = (date, time, mins = 60) => { if (!date || !time) return { start: null, end: null }; const s = new Date(`${date}T${time}:00`); if (isNaN(s.getTime())) return { start: null, end: null }; return { start: s, end: new Date(s.getTime() + mins * 60000) }; };
const fmt = d => d?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) || "--:--";
const optId = v => v || null;
const inp = inputClass + " min-h-10 py-2 text-[12px]";
const lbl = "mb-1 block text-[9px] font-black uppercase tracking-[.11em] text-[var(--VIARA-muted)]";
const ErrMsg = ({ msg }) => msg ? React.createElement("p", { className: "mt-1 text-[10px] font-bold text-rose-600 dark:text-rose-400" }, msg) : null;
const Opt = () => React.createElement("span", { className: "rounded-full border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]" }, "opt");


/* ── Atoms ── */
const ACCENT = {
    teal: 'bg-teal-500/12 text-teal-700 ring-1 ring-teal-500/15 dark:bg-teal-400/10 dark:text-teal-300 dark:ring-teal-400/20',
    violet: 'bg-violet-500/12 text-violet-700 ring-1 ring-violet-500/15 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20',
    amber: 'bg-amber-500/12 text-amber-700 ring-1 ring-amber-500/15 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20',
    emerald: 'bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/15 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20',
    sky: 'bg-sky-500/12 text-sky-700 ring-1 ring-sky-500/15 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/20'
};
const Card = ({ children, className = '' }) => (
    <div className={`overflow-hidden rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] ${className}`}>
        {children}
    </div>
);
const CardHead = ({ icon: Icon, title, subtitle, accent = 'teal', right }) => (
    <div className="relative flex items-center justify-between gap-3 border-b border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/30 px-3.5 py-2.5 before:absolute before:inset-y-0 before:start-0 before:w-0.5 before:bg-current before:opacity-20">
        <div className="flex items-center gap-2.5">
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${ACCENT[accent] ?? ACCENT.teal}`}><Icon size={14} strokeWidth={2.3} /></span>
            <div><p className="text-[11px] font-black uppercase tracking-[.12em] text-[var(--VIARA-ink)]">{title}</p>{subtitle && <p className="mt-0.5 text-[10px] text-[var(--VIARA-muted)]">{subtitle}</p>}</div>
        </div>
        {right}
    </div>
);

const STEP_LABELS = ['Patient', 'Exam', 'Team', 'Confirm'];
const StepBar = ({ active }) => (
    <div className="flex min-w-0 items-center rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2 py-1.5">
        {STEP_LABELS.map((label, i) => {
            const done = i < active;
            const cur = i === active;
            return (
                <React.Fragment key={label}>
                    <div className="flex min-w-0 items-center gap-1.5">
                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-black ${done
                            ? 'bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-sm shadow-teal-500/20 dark:text-slate-950'
                            : cur
                                ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-sm shadow-violet-500/20'
                                : 'border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)]'
                            }`}>
                            {done ? <Check size={10} strokeWidth={3} /> : i + 1}
                        </span>
                        <span className={`hidden truncate text-[9px] font-black sm:inline ${cur ? 'text-[var(--VIARA-ink)]' : done ? 'text-teal-600 dark:text-teal-400' : 'text-[var(--VIARA-muted)]'
                            }`}>
                            {label}
                        </span>
                    </div>
                    {i < STEP_LABELS.length - 1 && (
                        <div className={`mx-2 h-px min-w-3 flex-1 ${i < active ? 'bg-gradient-to-r from-teal-400 to-emerald-400' : 'bg-[var(--VIARA-line)]'}`} />
                    )}
                </React.Fragment>
            );
        })}
    </div>
);

const SlotStatus = ({ isPast, overlap, modalityId, time, machine, t }) => {
    if (isPast) return <span className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-extrabold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400"><AlertCircle size={13} />{t('booking.futureTime', 'Past time')}</span>;
    if (overlap) return <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-extrabold text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-400"><AlertCircle size={13} />{machine || '—'} {t('booking.machineBookedShort', 'booked')}</span>;
    if (modalityId && time) return <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-extrabold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400"><CheckCircle2 size={13} />{t('booking.noOverlap', 'Slot available')}</span>;
    return <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-2 py-1 text-[10px] font-semibold text-[var(--VIARA-muted)]"><Clock3 size={13} />{t('booking.chooseMachineTime', 'Select room & time')}</span>;
};

/* ════════════════════════════════════════════════════════════
   Main component
════════════════════════════════════════════════════════════ */
const BookAppointment = () => {
    const { t, i18n } = useTranslation('reception');
    const navigate = useNavigate();
    const [sp] = useSearchParams();
    const isRtl = i18n?.dir?.() === 'rtl' || i18n?.language?.startsWith('ar');

    const reqPtId = sp.get('patientId') || '';
    const initDate = sp.get('date') || toDateInput();
    const reqMId = sp.get('modalityId') || '';
    const reqEId = sp.get('examTypeId') || '';
    const reqPri = sp.get('priority') || 'Routine';
    const reqSrc = sp.get('source') || 'Walk-in';
    const reqWId = sp.get('waitlistId') || '';
    const reqNotes = sp.get('notes') || '';

    const [ptSearch, setPtSearch] = useState('');
    const [refMode, setRefMode] = useState('directory');
    const [date, setDate] = useState(initDate);
    const idKey = useRef(generateUUID());

    const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
        mode: 'onTouched',
        defaultValues: {
            patientId: reqPtId, modalityId: reqMId, examTypeId: reqEId, priority: reqPri,
            notes: reqNotes, time: nextTime(), paymentMethod: 'Cash', appointmentSource: reqSrc,
            referringDoctorId: '', referringDoctor: '', radiologistId: '', technicianId: '', nurseId: '',
            preparationStatus: 'Not Required', contrastRequired: false,
            pregnancySafetyStatus: 'Unknown', implantSafetyStatus: 'Unknown', renalSafetyStatus: 'Unknown',
            insuranceApprovalStatus: 'Pending', isFollowUp: false, priorExamId: '', followUpReason: '', arrived: false,
        },
    });

    const patientId = watch('patientId'), modalityId = watch('modalityId'),
        examTypeId = watch('examTypeId'), time = watch('time'),
        payMethod = watch('paymentMethod'), arrived = watch('arrived'),
        isFollowUp = watch('isFollowUp'), refDocId = watch('referringDoctorId'),
        radId = watch('radiologistId');

    /* data */
    const { data: pRes = [], isLoading: ptLoading } = useGetPatientsQuery({ limit: 500 });
    const { data: ptHist, isFetching: histLoad } = useGetPatientHistoryQuery(patientId, { skip: !patientId });
    const { data: appts = [] } = useGetAppointmentsQuery({ date });
    const { data: machines = [] } = useGetMachinesQuery();
    const { data: staff = [] } = useGetStaffQuery();
    const { data: exTypes = [] } = useGetExamTypesQuery(modalityId, { skip: !modalityId });
    const { data: docs = [] } = useGetReferringDoctorsQuery({ active: 'true', limit: 500 });
    const { data: insurers = [] } = useGetInsuranceProvidersQuery();
    const [createAppt, { isLoading: isSaving }] = useCreateAppointmentMutation();
    const [createIns] = useCreateInsuranceApprovalMutation();

    const patients = useMemo(() => Array.isArray(pRes) ? pRes : (pRes?.data || []), [pRes]);
    const reqPt = reqPtId && ptHist?.patient?.patient_id === reqPtId ? ptHist.patient : null;
    const allPts = useMemo(() => { if (!reqPt || patients.some(p => p.patient_id === reqPt.patient_id)) return patients; return [reqPt, ...patients]; }, [patients, reqPt]);
    const selPt = allPts.find(p => p.patient_id === patientId) ?? null;
    const ptOpts = useMemo(() => {
        const toks = ptSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        if (!toks.length) return allPts;
        const m = allPts.filter(p => { const s = [p.first_name, p.last_name, `${p.first_name || ''} ${p.last_name || ''}`, p.mrn, p.phone, p.mobile].filter(Boolean).join(' ').toLocaleLowerCase(); return toks.every(tk => s.includes(tk)); });
        if (selPt && !m.some(p => p.patient_id === selPt.patient_id)) return [selPt, ...m];
        return m;
    }, [allPts, ptSearch, selPt]);

    const activeMachines = useMemo(() => machines.filter(m => m.status === 'Active'), [machines]);
    const selMachine = activeMachines.find(m => m.modality_id === modalityId) || machines.find(m => m.modality_id === modalityId);
    const selExam = exTypes.find(e => e.type_id === examTypeId);
    const selectedExamId = selExam?.type_id;
    const selectedExamPrice = selExam?.price;
    const selectedExamBodyPart = selExam?.body_part || '';
    const selectedExamContrastRequired = Boolean(selExam?.contrast_required);
    const selDoctor = docs.find(d => d.doctor_id === refDocId);
    const duration = selExam?.duration_minutes || 60;
    const slot = appointmentWindow(date, time, duration);
    const slotT = slot.start?.getTime() ?? null;
    const priorExams = useMemo(() => (ptHist?.history || []).filter(e => e.exam_id && e.status !== 'Cancelled' && (!slotT || new Date(e.start_time).getTime() < slotT)), [ptHist?.history, slotT]);
    const isPast = Boolean(slot.start && slot.start < new Date() && !arrived);
    const overlap = appts.find(a => { if (!modalityId || !slot.start || !slot.end || a.status === 'Cancelled') return false; return a.modality_id === modalityId && new Date(a.start_time) < slot.end && new Date(a.end_time) > slot.start; });
    const roleStaff = useMemo(() => ({ radiologists: staff.filter(s => s.role === 'Radiologist'), technicians: staff.filter(s => s.role === 'Technician'), nurses: staff.filter(s => s.role === 'Nurse') }), [staff]);
    const selRad = roleStaff.radiologists.find(m => m.user_id === radId);
    const step = !patientId ? 0 : (!modalityId || !examTypeId) ? 1 : !radId ? 2 : 3;

    useEffect(() => { setValue('examTypeId', ''); setValue('paymentAmount', ''); }, [modalityId, setValue]);
    useEffect(() => { setValue('isFollowUp', false); setValue('priorExamId', ''); setValue('followUpReason', ''); }, [patientId, setValue]);
    useEffect(() => { if (refMode === 'directory') setValue('referringDoctor', ''); else setValue('referringDoctorId', ''); }, [refMode, setValue]);
    useEffect(() => {
        if (!selectedExamId) return;
        setValue('paymentAmount', selectedExamPrice);
        setValue('bodyPart', selectedExamBodyPart);
        setValue('contrastRequired', selectedExamContrastRequired);
    }, [selectedExamBodyPart, selectedExamContrastRequired, selectedExamId, selectedExamPrice, setValue]);
    useEffect(() => { if (!arrived) return; if (date === toDateInput()) { const n = new Date(); setValue('time', `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`); } }, [arrived, date, setValue]);

    const submit = async (data) => {
        if (!slot.start || !slot.end) return toast.error(t('toast.bookingValidTime'));
        if (isPast) return toast.error(t('toast.bookingFutureTime'));
        if (overlap) return toast.error(t('toast.bookingOverlap'));
        if (data.isFollowUp && !data.priorExamId) return toast.error(t('bookingPage.priorExamRequired', 'Select the prior examination.'));
        try {
            const uc = refMode === 'custom';
            const p = { idempotencyKey: idKey.current, patientId: data.patientId, modalityId: data.modalityId, examTypeId: data.examTypeId, startTime: slot.start.toISOString(), endTime: slot.end.toISOString(), radiologistId: optId(data.radiologistId), technicianId: optId(data.technicianId), nurseId: optId(data.nurseId), referringDoctorId: uc ? null : optId(data.referringDoctorId), referringDoctor: uc && data.referringDoctor?.trim() ? data.referringDoctor.trim() : null, priority: data.priority, clinicalIndication: data.clinicalIndication?.trim() || undefined, bodyPart: data.bodyPart?.trim() || undefined, contrastRequired: Boolean(data.contrastRequired), pregnancySafetyStatus: data.pregnancySafetyStatus, implantSafetyStatus: data.implantSafetyStatus, renalSafetyStatus: data.renalSafetyStatus, paymentMethod: data.paymentMethod, paymentAmount: data.paymentAmount ? Number(data.paymentAmount) : undefined, appointmentSource: data.appointmentSource, preparationStatus: data.preparationStatus, notes: data.notes?.trim() || undefined, isFollowUp: Boolean(data.isFollowUp), priorExamId: data.isFollowUp ? data.priorExamId : undefined, followUpReason: data.isFollowUp ? (data.followUpReason?.trim() || undefined) : undefined, arrived: Boolean(data.arrived), waitlistId: reqWId || undefined };
            const created = await createAppt(p).unwrap();
            if (data.paymentMethod === 'Insurance' && data.insuranceProviderId) {
                try { await createIns({ patientId: data.patientId, providerId: data.insuranceProviderId, appointmentId: created.appointment_id, examTypeId: data.examTypeId, status: data.insuranceApprovalStatus, approvalNumber: data.insuranceApprovalNumber?.trim() || undefined, requestedAmount: data.paymentAmount ? Number(data.paymentAmount) : undefined, documentUrl: data.insuranceApprovalDocumentUrl?.trim() || undefined }).unwrap(); }
                catch (ae) { toast.error(t('toast.appointmentBookedApprovalFailed', { reference: created.appointment_id, error: getErrorMessage(ae) }), { duration: 8000 }); navigate(`/appointments?patientId=${encodeURIComponent(data.patientId)}`, { replace: true }); return; }
            }
            toast.success(t('toast.appointmentBooked'));
            navigate('/reception', { replace: true });
        } catch (err) { toast.error(t('toast.bookingFailed', { error: getErrorMessage(err) })); }
    };

    return (
        <div className="space-y-3 pb-20" dir={isRtl ? 'rtl' : undefined}>
            <PageHeader icon={CalendarCheck2} eyebrowIcon={Activity}
                eyebrow={t('bookingPage.eyebrow', 'Scheduling workspace')}
                title={t('booking.title', 'Book Examination Appointment')}
                description={t('bookingPage.description', 'Select the patient, reserve a slot, and assign the care team.')}
                meta={<div className="flex min-w-0 flex-1 items-center gap-2.5"><div className="min-w-0 flex-1"><StepBar active={step} /></div><Link to="/appointments" className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 text-[10px] font-bold text-[var(--VIARA-ink)] transition hover:bg-[var(--VIARA-surface-hover)]"><ArrowLeft size={12} className="rtl-flip" />{t('bookingPage.back', 'Back')}</Link></div>}
                actions={<div className="flex items-center gap-2 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/50 px-2.5 py-1.5">
                    <Clock3 size={12} className="text-teal-600 dark:text-teal-400" />
                    <span className="text-[9px] font-black uppercase tracking-wide text-[var(--VIARA-muted)]">{t('booking.duration', 'Duration')}</span>
                    <span className="text-[11px] font-extrabold text-[var(--VIARA-ink)]">{duration}m</span>
                </div>}
            />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                    {
                        label: t('booking.patient', 'Patient'),
                        ready: Boolean(patientId),
                        value: selPt ? `${selPt.first_name} ${selPt.last_name}` : t('bookingPage.pending', 'Pending'),
                        tone: 'teal'
                    },
                    {
                        label: t('booking.examination', 'Exam'),
                        ready: Boolean(modalityId && examTypeId),
                        value: selExam?.name || t('bookingPage.pending', 'Pending'),
                        tone: 'violet'
                    },
                    {
                        label: t('booking.startTime', 'Slot'),
                        ready: Boolean(time && modalityId && !overlap && !isPast),
                        value: overlap ? t('booking.machineBookedShort', 'Booked') : (time ? fmt(slot.start) : t('bookingPage.pending', 'Pending')),
                        tone: overlap || isPast ? 'rose' : 'sky'
                    },
                    {
                        label: t('booking.careTeam', 'Team'),
                        ready: Boolean(radId),
                        value: selRad?.full_name || t('booking.unassigned', 'Unassigned'),
                        tone: 'emerald'
                    }
                ].map((item) => (
                    <div key={item.label} className={`flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2 transition ${item.tone === 'violet' ? 'border-violet-200 bg-violet-50/60 dark:border-violet-900/40 dark:bg-violet-950/15' :
                        item.tone === 'sky' ? 'border-sky-200 bg-sky-50/60 dark:border-sky-900/40 dark:bg-sky-950/15' :
                            item.tone === 'rose' ? 'border-rose-200 bg-rose-50/70 dark:border-rose-900/40 dark:bg-rose-950/20' :
                                item.tone === 'emerald' ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/15' :
                                    'border-teal-200 bg-teal-50/60 dark:border-teal-900/40 dark:bg-teal-950/15'
                        }`}>
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${item.ready ? 'bg-emerald-500 text-white' : 'bg-white/70 text-[var(--VIARA-muted)] ring-1 ring-[var(--VIARA-line)] dark:bg-slate-900'
                            }`}>
                            {item.ready ? <Check size={11} strokeWidth={3} /> : <Clock3 size={10} />}
                        </span>
                        <div className="min-w-0">
                            <p className="text-[8px] font-black uppercase tracking-[.1em] text-[var(--VIARA-muted)]">{item.label}</p>
                            <p className="truncate text-[10px] font-extrabold text-[var(--VIARA-ink)]">{item.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <form id="book-appointment-form" onSubmit={handleSubmit(submit)} className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_310px] 2xl:grid-cols-[minmax(0,1fr)_330px]" dir={isRtl ? 'rtl' : undefined} noValidate>

                {/* ── LEFT COLUMN ── */}
                <div className="space-y-3">

                    {/* SECTION 1 — Patient & Timing */}
                    <Card>
                        <CardHead icon={UserRound} title={t('booking.patientAndTime', 'Patient & Time')} subtitle={t('bookingPage.patientHint', 'Find the patient and choose date and start time.')} accent="teal" />
                        <div className="space-y-3 p-3.5">

                            {/* combined search + select */}
                            <div className="overflow-hidden rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/35">
                                <div className="flex items-center gap-2 border-b border-[var(--VIARA-line)] px-3 py-2">
                                    <Search size={13} className="shrink-0 text-[var(--VIARA-muted)]" />
                                    <input value={ptSearch} onChange={e => setPtSearch(e.target.value)} id="patient-search" aria-label={t('bookingPage.searchPatient', 'Search patient')} placeholder={t('bookingPage.searchPlaceholder', 'Name, MRN or phone')} className="min-w-0 flex-1 bg-transparent py-0.5 text-[13px] text-[var(--VIARA-ink)] outline-none placeholder:text-[var(--VIARA-muted)]" autoComplete="off" />
                                    {ptSearch && <button type="button" onClick={() => setPtSearch('')} className="shrink-0 text-[10px] font-bold text-teal-600 dark:text-teal-400 hover:underline">{t('bookingPage.clearSearch', 'Clear')}</button>}
                                    <span className="shrink-0 rounded-full bg-[var(--VIARA-surface-muted)] px-1.5 py-0.5 text-[9px] font-black text-[var(--VIARA-muted)]">{ptOpts.length}</span>
                                </div>
                                <select id="patientId" aria-label="Selected Patient" {...register('patientId', { required: t('validation.patientRequired') })} className="w-full bg-transparent px-3 py-2 text-[13px] text-[var(--VIARA-ink)] outline-none">
                                    <option value="">{ptLoading ? t('bookingPage.loadingPatients', 'Loading...') : !ptOpts.length ? t('bookingPage.noPatientsFound', 'No patients found') : t('booking.noPatientSelected', 'Select patient...')}</option>
                                    {ptOpts.map(p => <option key={p.patient_id} value={p.patient_id}>{p.first_name} {p.last_name} — {p.mrn}{p.phone ? ` — ${p.phone}` : ''}</option>)}
                                </select>
                            </div>
                            <ErrMsg msg={errors.patientId?.message} />

                            {/* selected patient chip */}
                            {selPt && (
                                <div className="flex items-center gap-3 rounded-lg border border-teal-200/70 bg-teal-50/60 px-3 py-2.5 dark:border-teal-900/40 dark:bg-teal-950/20">
                                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400"><UserRound size={14} /></div>
                                    <div className="min-w-0"><p className="text-[12px] font-extrabold text-[var(--VIARA-ink)]">{selPt.first_name} {selPt.last_name}</p><p className="text-[10px] font-semibold text-teal-700 dark:text-teal-400">{selPt.mrn}{selPt.phone ? ` · ${selPt.phone}` : ''}</p></div>
                                    <label className="ms-auto flex cursor-pointer items-center gap-2 whitespace-nowrap"><input type="checkbox" aria-label="Follow-up appointment" {...register('isFollowUp')} className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500" /><span className="text-[10px] font-extrabold text-[var(--VIARA-muted)]">{t('bookingPage.followUp', 'Follow-up appointment')}</span></label>
                                </div>
                            )}

                            {/* follow-up prior study */}
                            {selPt && isFollowUp && (
                                <div className="rounded-lg border border-sky-200/70 bg-sky-50/60 p-3 dark:border-sky-900/40 dark:bg-sky-950/20">
                                    <label htmlFor="priorExamId" className={lbl}>{t('bookingPage.priorStudy', 'Prior study')}</label>
                                    <select id="priorExamId" aria-label="Prior study" {...register('priorExamId', { required: isFollowUp ? t('bookingPage.priorExamRequired', 'Select prior examination.') : false })} disabled={histLoad || !priorExams.length} className={inp}>
                                        <option value="">{histLoad ? t('bookingPage.loadingHistory', 'Loading...') : priorExams.length ? t('bookingPage.selectPriorStudy', 'Select prior study') : t('bookingPage.noPriorStudies', 'No eligible studies')}</option>
                                        {priorExams.map(e => <option key={e.exam_id} value={e.exam_id}>{new Date(e.start_time).toLocaleDateString()} — {e.exam_type_name || e.machine_name || 'Exam'} — {e.order_number || e.exam_id}</option>)}
                                    </select>
                                    <ErrMsg msg={errors.priorExamId?.message} />
                                </div>
                            )}
                            {/* date + time + inline slot state */}
                            <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-end">
                                <div>
                                    <label className={lbl}>{t('booking.appointmentDate', 'Date')}</label>
                                    <input type="date" min={toDateInput()} value={date} onChange={e => setDate(e.target.value)} className={inp} />
                                </div>
                                <div>
                                    <label className={lbl}>{t('booking.startTime', 'Start')}</label>
                                    <input type="time" {...register('time', { required: t('validation.startTimeRequired') })} className={inp} />
                                    <ErrMsg msg={errors.time?.message} />
                                </div>
                                <div className="flex min-h-10 flex-wrap items-center gap-2 sm:justify-end">
                                    <SlotStatus isPast={isPast} overlap={overlap} modalityId={modalityId} time={time} machine={selMachine?.name} t={t} />
                                    <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[10px] font-extrabold text-[var(--VIARA-muted)]">
                                        <input type="checkbox" {...register('arrived')} className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                                        {t('bookingPage.patientArrived', 'Arrived')}
                                    </label>
                                </div>
                            </div>
                        </div>
                    </Card>


                    {/* SECTION 2 — Exam & Modality */}
                    <Card>
                        <CardHead icon={Stethoscope} title={t('booking.examDetails', 'Exam & Modality')} subtitle={t('bookingPage.examHint', 'Choose the room and examination type.')} accent="violet" right={selExam ? <span className="rounded-full bg-violet-500/10 px-2 py-1 text-[9px] font-black text-violet-700 dark:text-violet-300">{duration} min</span> : null} />
                        <div className="space-y-3 p-3.5">

                            {/* room + exam type */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={lbl}>{t('booking.machine', 'Modality Room')}</label>
                                    <select {...register('modalityId', { required: t('validation.machineRequired') })} className={inp}>
                                        <option value="">{t('booking.selectMachine', 'Select room...')}</option>
                                        {activeMachines.map(m => <option key={m.modality_id} value={m.modality_id}>{m.name}</option>)}
                                    </select>
                                    <ErrMsg msg={errors.modalityId?.message} />
                                </div>
                                <div>
                                    <label className={lbl}>{t('booking.examination', 'Exam Type')}</label>
                                    <select {...register('examTypeId', { required: t('validation.examRequired') })} disabled={!modalityId} className={inp}>
                                        <option value="">{modalityId ? t('booking.selectExam', 'Select type...') : t('booking.selectMachineFirst', 'Select room first')}</option>
                                        {exTypes.map(e => <option key={e.type_id} value={e.type_id}>{e.name}</option>)}
                                    </select>
                                    <ErrMsg msg={errors.examTypeId?.message} />
                                </div>
                            </div>

                            {/* priority + source */}
                            <div className="grid grid-cols-2 gap-2.5">
                                <div><label className={lbl}>{t('booking.priority', 'Priority')}</label><select {...register('priority')} className={inp}>{['Routine', 'Urgent', 'Emergency'].map(v => <option key={v} value={v}>{t(`priority.${v}`, v)}</option>)}</select></div>
                                <div><label className={lbl}>{t('booking.appointmentSource', 'Source')}</label><select {...register('appointmentSource')} className={inp}>{['Walk-in', 'Phone', 'Website', 'Patient Portal', 'Doctor Portal', 'Call Center'].map(v => <option key={v} value={v}>{t(`appointmentSource.${v}`, v)}</option>)}</select></div>
                            </div>
                            {/* compact safety + preparation row */}
                            <div className="rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/30 p-2.5">
                                <div className="mb-2 flex items-center gap-2">
                                    <ShieldCheck size={12} className="text-teal-600 dark:text-teal-400" />
                                    <span className="text-[9px] font-black uppercase tracking-[.1em] text-[var(--VIARA-muted)]">{t('bookingPage.safety', 'Safety & preparation')}</span>
                                    <label className="ms-auto flex cursor-pointer items-center gap-1.5 text-[9px] font-extrabold text-[var(--VIARA-muted)]">
                                        <input type="checkbox" {...register('contrastRequired')} className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                                        {t('booking.contrastRequired', 'Contrast')}
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    <div>
                                        <label className={lbl}>{t('booking.preparation', 'Prep')}</label>
                                        <select {...register('preparationStatus')} className={inp}>{['Not Required', 'Pending', 'In Progress', 'Ready'].map(v => <option key={v} value={v}>{t(`prep.${v}`, v)}</option>)}</select>
                                    </div>
                                    {[['pregnancySafetyStatus', 'Pregnancy'], ['implantSafetyStatus', 'Implant'], ['renalSafetyStatus', 'Renal']].map(([name, label]) => (
                                        <div key={name}>
                                            <label className={lbl}>{t(`booking.${name.replace('SafetyStatus', 'Safety')}`, label)}</label>
                                            <select {...register(name)} className={inp}>{['Unknown', 'Cleared', 'At Risk', 'Not Applicable'].map(v => <option key={v} value={v}>{t(`safety.${v}`, v)}</option>)}</select>
                                        </div>
                                    ))}
                                </div>
                                {Boolean(watch('contrastRequired')) && (
                                    <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/90 p-2 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                                        <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400 animate-pulse" />
                                        <div className="min-w-0 text-[11px] leading-relaxed">
                                            <p className="font-black text-amber-900 dark:text-amber-200">
                                                {isRtl ? 'تنبيه صبغة الفحص (Contrast Agent)' : 'Contrast Study Alert'}
                                            </p>
                                            <p className="mt-0.5 text-amber-800 dark:text-amber-300">
                                                {isRtl
                                                    ? 'هذا الفحص يتطلب صبغة وريدية: يُلزم إضافة صبغة الفحص ومستلزماتها للفاتورة قبل إتمام التحصيل المالي النهائي أو ستظل الفاتورة معلقة.'
                                                    : 'This examination requires IV contrast: contrast supplies must be appended to the invoice before finalizing cashier collection.'
                                                }
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* referral */}
                            <div className="rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/35 p-3">
                                <div className="mb-2.5 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <UserPlus size={12} className="text-[var(--VIARA-muted)]" />
                                        <span className="text-[10px] font-black uppercase tracking-[.12em] text-[var(--VIARA-muted)]">{t('booking.referringDoctor', 'Referring Doctor')}</span>
                                    </div>
                                    <div className="flex rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-0.5">
                                        {[['directory', t('bookingPage.directoryDoctor', 'Directory')], ['custom', t('bookingPage.customDoctor', 'Custom')]].map(([mode, label]) => (
                                            <button key={mode} type="button" onClick={() => setRefMode(mode)} className={`rounded-lg px-2.5 py-1 text-[10px] font-extrabold transition ${refMode === mode ? 'bg-teal-600 text-white shadow-sm dark:bg-teal-500' : 'text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)]'}`}>{label}</button>
                                        ))}
                                    </div>
                                </div>
                                {refMode === 'directory'
                                    ? <select {...register('referringDoctorId')} className={inp}><option value="">{t('booking.selectFromDirectory', 'None / Walk-in')}</option>{docs.map(d => <option key={d.doctor_id} value={d.doctor_id}>{d.full_name}{d.specialty ? ` · ${d.specialty}` : ''}</option>)}</select>
                                    : <input {...register('referringDoctor', { validate: v => refMode !== 'custom' || Boolean(v?.trim()) || t('validation.referringDoctorRequired'), maxLength: { value: 255, message: t('validation.referringDoctorTooLong') } })} placeholder={t('bookingPage.customDoctorPlaceholder', 'Doctor name, clinic, or walk-in source')} className={inp} autoComplete="organization" />
                                }
                                <ErrMsg msg={errors.referringDoctor?.message} />
                            </div>

                            {/* clinical indication */}
                            <div>
                                <label className={lbl}>{t('booking.clinicalIndication', 'Clinical Indication')}</label>
                                <textarea {...register('clinicalIndication')} rows={2} placeholder={t('booking.clinicalIndicationPlaceholder', 'Describe clinical indication...')} className={`${inp} h-auto resize-none`} />
                            </div>
                        </div>
                    </Card>
                </div>

                {/* ── RIGHT SIDEBAR ── */}
                <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start">

                    {/* Care Team */}
                    <Card>
                        <CardHead icon={Users} title={t('booking.careTeam', 'Care Team')} subtitle={t('bookingPage.careTeamHint', 'Assign now or later.')} accent="sky" right={<Opt />} />
                        <div className="space-y-3 p-3.5">
                            <div>
                                <label className={lbl}>{t('booking.radiologist', 'Radiologist')}</label>
                                <select {...register('radiologistId')} className={inp}>
                                    <option value="">{t('booking.unassignedRadiologist', 'Unassigned')}</option>
                                    {roleStaff.radiologists.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
                                </select>
                                {selRad && <p className="mt-1 text-[10px] text-[var(--VIARA-muted)]">{t('bookingPage.radiologistSelected', { name: selRad.full_name, defaultValue: `${selRad.full_name} will receive the case.` })}</p>}
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                                <div><label className={lbl}>{t('booking.technician', 'Technician')}</label><select {...register('technicianId')} className={inp}><option value="">{t('booking.unassigned', 'Unassigned')}</option>{roleStaff.technicians.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></div>
                                <div><label className={lbl}>{t('booking.nurse', 'Nurse')}</label><select {...register('nurseId')} className={inp}><option value="">{t('booking.unassigned', 'Unassigned')}</option>{roleStaff.nurses.map(m => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}</select></div>
                            </div>
                        </div>
                    </Card>

                    {/* Payment */}
                    <Card>
                        <CardHead icon={CreditCard} title={t('booking.paymentAndNotes', 'Payment & Notes')} accent="emerald" right={<span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-black text-emerald-700 dark:text-emerald-300">{payMethod}</span>} />
                        <div className="space-y-3 p-3.5">
                            <div className="grid grid-cols-2 gap-2.5">
                                <div><label className={lbl}>{t('booking.paymentMethod', 'Payment Method')}</label><select {...register('paymentMethod')} className={inp}>{['Cash', 'Credit Card', 'Insurance', 'Wallet', 'Bank Transfer'].map(v => <option key={v} value={v}>{t(`booking.${v.replace(' ', '').toLowerCase()}`, v)}</option>)}</select></div>
                                <div><label className={lbl}>{t('booking.amount', 'Amount')}</label><input type="number" min="0" step="0.01" {...register('paymentAmount')} className={inp} /></div>
                            </div>
                            <div className={`grid transition-[grid-template-rows,opacity,transform] duration-300 ease-out ${payMethod === 'Insurance' ? 'grid-rows-[1fr] translate-y-0 opacity-100' : 'grid-rows-[0fr] -translate-y-1 opacity-0'}`}>
                                <div className="overflow-hidden">
                                    <div className="space-y-2.5 rounded-lg border border-teal-200/70 bg-teal-50/50 p-3 dark:border-teal-900/40 dark:bg-teal-950/20">
                                        <div><label className={lbl}>{t('booking.insuranceProvider', 'Insurance Provider')}</label><select {...register('insuranceProviderId')} className={inp}><option value="">{t('booking.selectProvider', 'Select provider...')}</option>{insurers.map(p => <option key={p.provider_id} value={p.provider_id}>{p.name}</option>)}</select></div>
                                        <div><label className={lbl}>{t('booking.approvalNumber', 'Approval #')}</label><input {...register('insuranceApprovalNumber')} className={inp} /></div>
                                    </div>
                                </div>
                            </div>
                            <div><label className={lbl}>{t('bookingPage.notes', 'Notes')}</label><textarea {...register('notes')} rows={2} className={`${inp} h-auto resize-none`} /></div>
                        </div>
                    </Card>

                    {/* Summary */}
                    <Card className="border-teal-200/70 bg-gradient-to-b from-[var(--VIARA-surface)] to-teal-50/30 dark:border-teal-900/40 dark:to-teal-950/10">
                        <CardHead icon={CalendarCheck2} title={t('bookingPage.summary', 'Appointment Summary')} accent="teal" />
                        <div className="divide-y divide-[var(--VIARA-line)]">
                            {[
                                [t('booking.selectedPatient', 'Patient'), selPt ? `${selPt.first_name} ${selPt.last_name}` : '—'],
                                [t('booking.machine', 'Room'), selMachine?.name || '—'],
                                [t('booking.examination', 'Exam'), selExam?.name || '—'],
                                [t('booking.appointmentDate', 'Date'), date || '—'],
                                [t('booking.startTime', 'Time'), `${fmt(slot.start)} → ${fmt(slot.end)}`],
                                [t('booking.paymentMethod', 'Payment'), payMethod],
                                [t('booking.priority', 'Priority'), watch('priority')],
                                [t('booking.contrast', 'Contrast'), watch('contrastRequired') ? (isRtl ? '⚠️ يتطلب صبغة (إلزامي)' : '⚠️ Contrast Required') : (isRtl ? 'بدون صبغة' : 'Non-Contrast')],
                                [t('booking.radiologist', 'Radiologist'), selRad?.full_name || t('booking.unassigned', 'Unassigned')],
                            ].map(([key, val]) => (
                                <div key={key} className="flex items-start justify-between gap-3 px-4 py-2">
                                    <span className="text-[10px] font-semibold text-[var(--VIARA-muted)] whitespace-nowrap">{key}</span>
                                    <span className="text-[11px] font-extrabold text-[var(--VIARA-ink)] text-end break-all">{val}</span>
                                </div>
                            ))}
                        </div>
                    </Card>
                </aside>
            </form>

            {/* ── Fixed footer ── */}
            <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--VIARA-line)] bg-[var(--VIARA-surface)]/96 px-3 py-2 backdrop-blur-xl lg:ps-72">
                <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                            <p className="truncate text-[11px] font-extrabold text-[var(--VIARA-ink)]">
                                {selPt ? `${selPt.first_name} ${selPt.last_name}` : t('booking.noPatientSelected', 'No patient selected')}
                            </p>
                            {selPt?.mrn && <span className="text-[9px] font-bold text-[var(--VIARA-muted)]">MRN {selPt.mrn}</span>}
                            <span className="hidden h-3 w-px bg-[var(--VIARA-line)] sm:block" />
                            <span className="text-[9px] font-bold text-[var(--VIARA-muted)]">{watch('priority')}</span>
                        </div>
                        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[9px] font-semibold">
                            <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/10 px-2 py-0.5 text-teal-700 dark:text-teal-300">
                                <Clock3 size={9} />
                                {fmt(slot.start)}–{fmt(slot.end)}
                            </span>
                            {selMachine && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-violet-700 dark:text-violet-300">{selMachine.name}</span>}
                            {selExam && <span className="max-w-48 truncate rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-700 dark:text-sky-300">{selExam.name}</span>}
                            {selRad && <span className="hidden max-w-40 truncate rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300 md:inline">{selRad.full_name}</span>}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <button type="button" onClick={() => navigate(-1)} disabled={isSaving} className="rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-4 py-2 text-[12px] font-bold text-[var(--VIARA-ink)] transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40 dark:hover:border-rose-800 dark:hover:bg-rose-950/20 dark:hover:text-rose-300">
                            {t('booking.cancel', 'Cancel')}
                        </button>
                        <button type="submit" form="book-appointment-form" disabled={isSaving || isPast || Boolean(overlap)} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 px-5 py-2 text-[12px] font-extrabold text-white shadow-md shadow-teal-600/20 transition hover:scale-[1.01] active:scale-95 disabled:opacity-40">
                            <CalendarCheck2 size={14} />
                            {isSaving ? t('booking.booking', 'Booking...') : t('booking.confirmBooking', 'Confirm Appointment')}
                        </button>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default BookAppointment;
