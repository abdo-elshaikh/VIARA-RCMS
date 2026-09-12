import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectCurrentUser } from "../store/authSlice";
import toast from "react-hot-toast";
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    Calendar,
    CalendarCheck2,
    Check,
    CheckCircle2,
    Clock3,
    CreditCard,
    DollarSign,
    DoorOpen,
    SlidersHorizontal,
    BadgeCheck,
    FileSpreadsheet,
    FileText,
    Flame,
    Info,
    Layers,
    Phone,
    Printer,
    RotateCcw,
    Search,
    Shield,
    ShieldAlert,
    ShieldCheck,
    Sparkles,
    Stethoscope,
    Sun,
    Sunrise,
    Sunset,
    Tag,
    User,
    UserCheck,
    UserPlus,
    UserRound,
    Users,
    X
} from "lucide-react";
import {
    useCreateAppointmentMutation,
    useCreateInsuranceApprovalMutation,
    useCreatePatientMutation,
    useGetAppointmentsQuery,
    useGetExamTypesQuery,
    useGetInsuranceProvidersQuery,
    useGetMachinesQuery,
    useGetPatientHistoryQuery,
    useGetPatientsQuery,
    useGetReferringDoctorsQuery,
    useGetStaffQuery,
    useGetRoomsQuery,
    useGetShiftsQuery,
    useGetAttendanceQuery
} from "../store/api";
import { getErrorMessage } from "../utils/getErrorMessage";
import { generateUUID } from '../utils/uuid';
import { inputClass } from "../utils/designTokens";
import PageHeader from '../components/ui/PageHeader';

/* ── Date & Time Utilities ── */
const toDateInput = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const dateAfter = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return toDateInput(d);
};

const nextTime = () => {
    const d = new Date(Date.now() + 30 * 60000);
    const r = d.getMinutes() % 15;
    if (r) d.setMinutes(d.getMinutes() + 15 - r);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const appointmentWindow = (date, time, mins = 60) => {
    if (!date || !time) return { start: null, end: null };
    const s = new Date(`${date}T${time}:00`);
    if (isNaN(s.getTime())) return { start: null, end: null };
    return { start: s, end: new Date(s.getTime() + mins * 60000) };
};

const fmt = (d) => d?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) || "--:--";
const optId = (v) => v || null;

const ALL_TIME_SLOTS = [
    '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
    '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
    '20:00', '20:30', '21:00', '21:30'
];

const PRIORITY_TONES = {
    Routine: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300 shadow-sm ring-1 ring-sky-400/20',
    Urgent: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 shadow-sm ring-1 ring-amber-400/20',
    Emergency: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300 shadow-sm ring-1 ring-rose-400/20 animate-pulse',
};

const inp = inputClass + " min-h-10 rounded-xl px-3 py-2 text-[13px] font-semibold bg-[var(--VIARA-surface)] border-[var(--VIARA-line)] shadow-sm shadow-slate-950/[0.02] transition-all duration-200 hover:border-[var(--VIARA-line-strong)] focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 disabled:cursor-not-allowed disabled:opacity-55";
const lbl = "mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.08em] text-[var(--VIARA-muted)] uppercase";

const ErrMsg = ({ msg }) =>
    msg ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400" role="alert">
            <AlertCircle size={12} className="shrink-0" />
            <span>{msg}</span>
        </p>
    ) : null;

const Opt = ({ label = 'Optional' }) => (
    <span className="rounded-full border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2 py-0.5 text-[9px] font-bold text-[var(--VIARA-muted)]">
        {label}
    </span>
);

/* ── Brand-consistent Step Palettes ── */
const STEP_COLORS = {
    0: {
        theme: 'teal',
        accent: 'from-teal-500 to-cyan-500',
        card: 'border-teal-200/70 bg-[var(--VIARA-surface)] dark:border-teal-900/45',
        iconBg: 'bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm shadow-teal-500/20',
        button: 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white shadow-md shadow-teal-600/15',
    },
    1: {
        theme: 'teal',
        accent: 'from-teal-500 to-cyan-500',
        card: 'border-teal-200/70 bg-[var(--VIARA-surface)] dark:border-teal-900/45',
        iconBg: 'bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm shadow-teal-500/20',
        button: 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white shadow-md shadow-teal-600/15',
    },
    2: {
        theme: 'teal',
        accent: 'from-teal-500 to-cyan-500',
        card: 'border-teal-200/70 bg-[var(--VIARA-surface)] dark:border-teal-900/45',
        iconBg: 'bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm shadow-teal-500/20',
        button: 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white shadow-md shadow-teal-600/15',
    },
    3: {
        theme: 'emerald',
        accent: 'from-emerald-500 to-teal-500',
        card: 'border-emerald-200/70 bg-[var(--VIARA-surface)] dark:border-emerald-900/45',
        iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/20',
        button: 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-md shadow-emerald-600/15',
    }
};

/* ── Compact Card Wrapper ── */
const StepCard = ({ children, className = '', highlight = false }) => (
    <div className={`overflow-hidden rounded-[22px] border bg-[var(--VIARA-surface)] shadow-[0_16px_48px_-28px_rgba(15,23,42,.35)] transition-all duration-300 ${highlight ? 'ring-1 ring-teal-500/25 shadow-[0_22px_60px_-30px_rgba(13,148,136,.35)]' : ''} ${className}`}>
        {children}
    </div>
);

const CardHead = ({ icon: Icon, title, subtitle, stepNumber, right, accentClass = 'from-teal-500 to-cyan-600' }) => (
    <div className="relative flex items-center justify-between gap-2.5 border-b border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
            <span className={`grid h-8.5 w-8.5 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${accentClass} text-white shadow-sm`}>
                <Icon size={16} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                    {stepNumber && (
                        <span className="rounded bg-[var(--VIARA-surface)] px-1.5 py-0.5 text-[9px] font-black text-[var(--VIARA-muted)] border border-[var(--VIARA-line)]">
                            {stepNumber}
                        </span>
                    )}
                    <h3 className="text-xs sm:text-sm font-black text-[var(--VIARA-ink)] truncate">{title}</h3>
                </div>
                {subtitle && <p className="text-[10px] text-[var(--VIARA-muted)] truncate">{subtitle}</p>}
            </div>
        </div>
        {right}
    </div>
);

/* ── Interactive Stepper Navigator ── */
const BookingNavigator = ({ active, complete, progress, onSelect, t, isRtl }) => {
    const steps = [
        {
            icon: UserRound,
            title: isRtl ? 'المريض' : t('booking.patient', 'Patient'),
            hint: isRtl ? 'البحث عن المريض وتحديد تاريخ الزيارة' : t('bookingPage.step1Hint', 'Patient & visit')
        },
        {
            icon: Stethoscope,
            title: isRtl ? 'الفحص' : t('booking.examination', 'Examination'),
            hint: isRtl ? 'اختيار غرفة الجهاز ونوع الفحص والأولوية' : t('bookingPage.step2Hint', 'Study & room')
        },
        {
            icon: Clock3,
            title: isRtl ? 'الموعد والسلامة' : t('bookingPage.detailsStep', 'Time & Safety'),
            hint: isRtl ? 'تحديد وقت الفحص وإجراءات السلامة والصبغة' : t('bookingPage.step3Hint', 'Slot & clearance')
        },
        {
            icon: CalendarCheck2,
            title: isRtl ? 'فريق الرعاية والدفع' : t('bookingPage.reviewStep', 'Review'),
            hint: isRtl ? 'تعيين الأطباء وتأكيد طريقة السداد والملاحظات' : t('bookingPage.step4Hint', 'Team & billing')
        },
    ];

    return (
        <section className="sticky top-2 z-30 rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)]/95 p-2.5 shadow-lg shadow-slate-950/5 backdrop-blur-xl sm:p-3">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-teal-600 dark:text-teal-400">
                        {t('bookingPage.workflow', 'Appointment workflow')}
                    </p>
                    <p className="truncate text-[10px] font-semibold text-[var(--VIARA-muted)]">
                        {t('bookingPage.workflowHint', 'Complete the four sections to confirm the visit')}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[10px] font-black tabular-nums text-[var(--VIARA-muted)]">{progress}%</span>
                    <div
                        role="progressbar"
                        aria-label={t('bookingPage.bookingCompletion', 'Booking completion')}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress}
                        className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--VIARA-surface-muted)] sm:w-28"
                    >
                        <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-[width] duration-500" style={{ width: `${progress}%` }} />
                    </div>
                </div>
            </div>

            <nav aria-label={t('bookingPage.bookingSections', 'Booking sections')} className="relative grid grid-cols-4 gap-1.5 sm:gap-2">
                <span className="pointer-events-none absolute start-[7%] end-[7%] top-[18px] hidden h-px bg-[var(--VIARA-line)] sm:block" />
                {steps.map(({ icon: Icon, title, hint }, index) => {
                    const isActive = active === index;
                    const isComplete = Boolean(complete[index]);
                    return (
                        <button
                            key={title}
                            type="button"
                            onClick={() => onSelect(index)}
                            aria-current={isActive ? 'step' : undefined}
                            className={`group relative z-10 flex min-w-0 flex-col items-center rounded-xl px-1.5 py-1.5 text-center transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 sm:flex-row sm:text-start ${isActive
                                ? 'bg-teal-500/10 text-[var(--VIARA-ink)] ring-1 ring-teal-500/20 shadow-xs'
                                : 'text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-surface-muted)]/60 hover:text-[var(--VIARA-ink)]'
                                }`}
                        >
                            <span className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition-all ${isActive
                                ? 'border-teal-500 bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md shadow-teal-500/25 ring-2 ring-teal-500/30'
                                : isComplete
                                    ? 'border-emerald-500 bg-emerald-500 text-white shadow-xs'
                                    : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)]'
                                }`}>
                                {isComplete && !isActive ? <Check size={14} strokeWidth={3} /> : <Icon size={15} strokeWidth={isActive ? 2.5 : 2} />}
                                <span className="absolute -end-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-0.5 text-[8px] font-black text-[var(--VIARA-ink)]">
                                    {index + 1}
                                </span>
                            </span>
                            <span className="mt-1 min-w-0 sm:ms-2 sm:mt-0">
                                <span className={`block truncate text-[9.5px] font-black sm:text-[11px] ${isActive ? 'text-teal-800 dark:text-teal-200' : ''}`}>{title}</span>
                                <span className="hidden truncate text-[8.5px] font-medium text-[var(--VIARA-muted)] md:block">{hint}</span>
                            </span>
                        </button>
                    );
                })}
            </nav>
        </section>
    );
};

/* ── Live Slot Status Indicator ── */
const SlotStatus = ({ isPast, overlap, modalityId, time, machine, t }) => {
    if (isPast) {
        return (
            <span className="inline-flex min-h-6.5 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-black text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                <AlertCircle size={12} />
                {t('booking.futureTimeShort', 'Past time')}
            </span>
        );
    }
    if (overlap) {
        return (
            <span className="inline-flex min-h-6.5 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300 animate-pulse">
                <AlertTriangle size={12} />
                {machine || '—'} {t('booking.machineBookedShort', 'booked')}
            </span>
        );
    }
    if (modalityId && time) {
        return (
            <span className="inline-flex min-h-6.5 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                <CheckCircle2 size={12} />
                {t('booking.noOverlapShort', 'Slot available')}
            </span>
        );
    }
    return (
        <span className="inline-flex min-h-6.5 items-center gap-1 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-2 py-0.5 text-[10px] font-semibold text-[var(--VIARA-muted)]">
            <Clock3 size={12} />
            {t('booking.chooseMachineTime', 'Select room & time')}
        </span>
    );
};

/* ════════════════════════════════════════════════════════════
   Main Booking Component
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
    const [activeSection, setActiveSection] = useState(0);
    const [maxVisitedSection, setMaxVisitedSection] = useState(0);
    const [bookedAppointment, setBookedAppointment] = useState(null);
    const [timePeriodFilter, setTimePeriodFilter] = useState('all');
    const [showQuickPatientModal, setShowQuickPatientModal] = useState(false);
    const [quickPtForm, setQuickPtForm] = useState({ firstName: '', lastName: '', phone: '', gender: 'Male', dateOfBirth: '' });

    const idKey = useRef(generateUUID());
    const sectionRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

    const [createPatientMutation, { isLoading: isCreatingPatient }] = useCreatePatientMutation();

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        trigger,
        clearErrors,
        formState: { errors, isSubmitted }
    } = useForm({
        mode: 'onTouched',
        defaultValues: {
            patientId: reqPtId,
            roomId: sp.get('roomId') || '',
            modalityId: reqMId,
            examTypeId: reqEId,
            priority: reqPri,
            notes: reqNotes,
            time: nextTime(),
            paymentMethod: 'Cash',
            appointmentSource: reqSrc,
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
            arrived: false,
        },
    });

    const patientId = watch('patientId');
    const roomId = watch('roomId');
    const modalityId = watch('modalityId');
    const techId = watch('technicianId');
    const nurseId = watch('nurseId');
    const [dutyStaffOnly, setDutyStaffOnly] = useState(false);
    const [applyWorkstationScope, setApplyWorkstationScope] = useState(true);
    const examTypeId = watch('examTypeId');
    const time = watch('time');
    const priority = watch('priority');
    const payMethod = watch('paymentMethod');
    const isFollowUp = watch('isFollowUp');
    const contrastRequired = watch('contrastRequired');
    const paymentAmount = watch('paymentAmount');
    const radId = watch('radiologistId');

    /* ── Queries ── */
    const { data: pRes = [], isLoading: ptLoading } = useGetPatientsQuery({ limit: 500 });
    const { data: pHist, isLoading: histLoad } = useGetPatientHistoryQuery(patientId, { skip: !patientId });
    const user = useSelector(selectCurrentUser);
    const { data: rRes = [], isLoading: roomsLoading } = useGetRoomsQuery();
    const shiftStart = date ? `${date}T00:00:00.000Z` : undefined;
    const shiftEnd = date ? `${date}T23:59:59.999Z` : undefined;
    const { data: shiftsRes = [] } = useGetShiftsQuery({ startDate: shiftStart, endDate: shiftEnd }, { skip: !date });
    const { data: attRes = [] } = useGetAttendanceQuery({ startDate: date }, { skip: !date });
    const { data: mRes = [] } = useGetMachinesQuery();
    const { data: eRes = [] } = useGetExamTypesQuery({ modalityId }, { skip: !modalityId });
    const { data: docRes = [] } = useGetReferringDoctorsQuery({ limit: 200 });
    const { data: sRes = [] } = useGetStaffQuery();
    const { data: insRes = [] } = useGetInsuranceProvidersQuery();
    const { data: dayAppts = [] } = useGetAppointmentsQuery({ date }, { skip: !date });

    const [createAppt, { isLoading: isSaving }] = useCreateAppointmentMutation();
    const [createInsuranceApproval] = useCreateInsuranceApprovalMutation();

    /* ── Normalization ── */
    const patients = useMemo(() => Array.isArray(pRes) ? pRes : pRes.data || [], [pRes]);
    const rooms = useMemo(() => Array.isArray(rRes) ? rRes : rRes.data || [], [rRes]);
    const activeRooms = useMemo(() => rooms.filter((r) => r.status === 'Active' || !r.status), [rooms]);
    const dayShifts = useMemo(() => Array.isArray(shiftsRes) ? shiftsRes : shiftsRes.data || [], [shiftsRes]);
    const dayAttendance = useMemo(() => Array.isArray(attRes) ? attRes : attRes.data || [], [attRes]);
    const machines = useMemo(() => Array.isArray(mRes) ? mRes : mRes.data || [], [mRes]);
    const activeMachines = useMemo(() => machines.filter((m) => m.status === 'Active' || !m.status), [machines]);
    const examTypes = useMemo(() => Array.isArray(eRes) ? eRes : eRes.data || [], [eRes]);
    const docs = useMemo(() => Array.isArray(docRes) ? docRes : docRes.data || [], [docRes]);
    const staff = useMemo(() => Array.isArray(sRes) ? sRes : sRes.data || [], [sRes]);
    const insurers = useMemo(() => Array.isArray(insRes) ? insRes : insRes.data || [], [insRes]);

    /* When a patientId is supplied in the URL but is not in the current page
     * of results, hydrate the patient from the patient history endpoint so the
     * select can render the correct option and the form validation succeeds. */
    const resolvedPatients = useMemo(() => {
        if (!reqPtId || !pHist?.patient) return patients;
        const inList = patients.some((p) => String(p.patient_id) === String(reqPtId));
        if (inList) return patients;
        return [pHist.patient, ...patients];
    }, [patients, pHist, reqPtId]);

    const roleStaff = useMemo(() => ({
        radiologists: staff.filter((s) => s.role === 'Radiologist'),
        technicians: staff.filter((s) => s.role === 'Technician'),
        nurses: staff.filter((s) => s.role === 'Nurse'),
    }), [staff]);

    const priorExams = useMemo(() => {
        const h = pHist?.history || [];
        return h.filter((e) => ['Completed', 'Reported', 'Finalized'].includes(e.status) || e.report_status === 'Finalized');
    }, [pHist]);

    const selPt = useMemo(() => resolvedPatients.find((p) => String(p.patient_id) === String(patientId)), [resolvedPatients, patientId]);

    const ptOpts = useMemo(() => {
        const q = ptSearch.trim().toLowerCase();
        let list = resolvedPatients;
        if (q) {
            const queryTokens = q.split(/\s+/).filter(Boolean);
            list = resolvedPatients.filter((p) => {
                const searchable = [p.first_name, p.last_name, p.mrn, p.phone, p.national_id]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                return queryTokens.every((token) => searchable.includes(token));
            });
        }
        if (selPt && !list.some((p) => String(p.patient_id) === String(selPt.patient_id))) {
            return [selPt, ...list];
        }
        return list;
    }, [resolvedPatients, ptSearch, selPt]);

    /* Auto sync URL query patientId and clear any errors once valid */
    useEffect(() => {
        if (reqPtId && String(patientId || '') !== String(reqPtId)) {
            setValue('patientId', reqPtId, { shouldDirty: false, shouldValidate: true });
            clearErrors('patientId');
        }
    }, [reqPtId, patientId, setValue, clearErrors]);

    useEffect(() => {
        if (reqPtId && resolvedPatients.length > 0) {
            const matched = resolvedPatients.find(p => String(p.patient_id) === String(reqPtId));
            if (matched && String(patientId || '') !== String(matched.patient_id)) {
                setValue('patientId', matched.patient_id, { shouldDirty: false, shouldValidate: true });
                clearErrors('patientId');
            }
        }
    }, [reqPtId, patientId, resolvedPatients, setValue, clearErrors]);

    useEffect(() => {
        if (patientId) {
            clearErrors('patientId');
        }
    }, [patientId, clearErrors]);

    const quickPtMatches = useMemo(() => {
        if (!showQuickPatientModal) return [];
        const cleanPhone = (quickPtForm.phone || '').replace(/\D/g, '');
        const cleanFirst = (quickPtForm.firstName || '').trim().toLowerCase();
        const cleanLast = (quickPtForm.lastName || '').trim().toLowerCase();
        if (cleanPhone.length < 5 && cleanFirst.length < 2) return [];

        return patients.filter((p) => {
            const pPhone = String(p.phone || '').replace(/\D/g, '');
            const pFirst = String(p.first_name || '').toLowerCase();
            const pLast = String(p.last_name || '').toLowerCase();
            if (cleanPhone && pPhone && (pPhone.includes(cleanPhone) || cleanPhone.includes(pPhone))) return true;
            if (cleanFirst && cleanLast && pFirst === cleanFirst && pLast === cleanLast) return true;
            if (cleanFirst.length >= 3 && `${pFirst} ${pLast}`.includes(cleanFirst)) return true;
            return false;
        }).slice(0, 3);
    }, [patients, quickPtForm.firstName, quickPtForm.lastName, quickPtForm.phone, showQuickPatientModal]);

    const workstationConfig = useMemo(() => {
        try {
            const raw = localStorage.getItem(`viara_reception_workspace:${user?.user_id || 'anonymous'}`);
            const saved = raw ? JSON.parse(raw) : {};
            const desk = saved.desk || localStorage.getItem('viara_reception_desk') || '';
            const scope = saved.scope || 'all';
            const wsRooms = Array.isArray(saved.rooms) ? saved.rooms : [];
            const wsModalities = Array.isArray(saved.modalities) ? saved.modalities : [];
            const hasScopeFilter = wsRooms.length > 0 || wsModalities.length > 0 || (scope && scope !== 'all');
            return { desk, scope, rooms: wsRooms, modalities: wsModalities, hasScopeFilter };
        } catch {
            return { desk: '', scope: 'all', rooms: [], modalities: [], hasScopeFilter: false };
        }
    }, [user?.user_id]);

    const selRoom = useMemo(() => rooms.find((r) => String(r.room_id) === String(roomId) || String(r.room_number) === String(roomId)), [rooms, roomId]);
    const selMachine = useMemo(() => machines.find((m) => m.modality_id === modalityId), [machines, modalityId]);
    const selExam = useMemo(() => examTypes.find((e) => e.type_id === examTypeId), [examTypes, examTypeId]);
    const selRad = useMemo(() => staff.find((s) => s.user_id === radId), [staff, radId]);
    const selTech = useMemo(() => staff.find((s) => s.user_id === techId), [staff, techId]);
    const selNurse = useMemo(() => staff.find((s) => s.user_id === nurseId), [staff, nurseId]);

    // Filter displayed rooms and machines based on workstation scope & selection
    const displayedRooms = useMemo(() => {
        let list = activeRooms;
        if (applyWorkstationScope && workstationConfig.hasScopeFilter) {
            if (workstationConfig.rooms.length > 0) {
                const filtered = list.filter((r) => 
                    workstationConfig.rooms.includes(String(r.room_id)) ||
                    workstationConfig.rooms.includes(String(r.room_number)) ||
                    workstationConfig.rooms.includes(String(r.name))
                );
                if (filtered.length > 0) list = filtered;
            } else if (workstationConfig.modalities.length > 0) {
                const filtered = list.filter((r) => {
                    const roomMachines = activeMachines.filter(m => String(m.room_id) === String(r.room_id) || String(m.room_number) === String(r.room_number));
                    return roomMachines.some(m => workstationConfig.modalities.includes(String(m.modality_id)) || workstationConfig.modalities.includes(String(m.name)) || workstationConfig.modalities.includes(String(m.type)));
                });
                if (filtered.length > 0) list = filtered;
            }
        }
        return list;
    }, [activeRooms, applyWorkstationScope, workstationConfig, activeMachines]);

    const displayedMachines = useMemo(() => {
        let list = activeMachines;
        if (roomId) {
            const byRoom = list.filter((m) => String(m.room_id) === String(roomId) || (selRoom && String(m.room_number) === String(selRoom.room_number)));
            if (byRoom.length > 0) list = byRoom;
        } else if (applyWorkstationScope && workstationConfig.hasScopeFilter) {
            if (workstationConfig.modalities.length > 0) {
                const filtered = list.filter((m) => 
                    workstationConfig.modalities.includes(String(m.modality_id)) ||
                    workstationConfig.modalities.includes(String(m.name)) ||
                    workstationConfig.modalities.includes(String(m.type))
                );
                if (filtered.length > 0) list = filtered;
            } else if (workstationConfig.rooms.length > 0) {
                const filtered = list.filter((m) =>
                    workstationConfig.rooms.includes(String(m.room_id)) ||
                    workstationConfig.rooms.includes(String(m.room_number))
                );
                if (filtered.length > 0) list = filtered;
            }
        }
        return list;
    }, [activeMachines, roomId, selRoom, applyWorkstationScope, workstationConfig]);

    // Sync Room when Machine changes
    useEffect(() => {
        if (selMachine?.room_id && (!roomId || roomId !== selMachine.room_id)) {
            setValue('roomId', selMachine.room_id, { shouldDirty: true });
        }
    }, [selMachine, roomId, setValue]);

    // Calculate staff duty and attendance classification
    const getStaffDutyInfo = useCallback((staffUserId) => {
        if (!staffUserId) return null;
        const userShifts = dayShifts.filter((s) => String(s.user_id) === String(staffUserId));
        const userAtt = dayAttendance.find((a) => String(a.user_id) === String(staffUserId));
        
        const isPresent = Boolean(userAtt && userAtt.clock_in && !userAtt.clock_out && userAtt.status !== 'Absent');
        const isLate = userAtt?.status === 'Late';
        const hasShiftToday = userShifts.length > 0;
        const currentShift = userShifts[0] || null;
        const isRoomAssigned = Boolean(roomId && userShifts.some((s) => String(s.room_id) === String(roomId)));
        
        let isTimeSlotMatch = false;
        if (time && currentShift?.start_time && currentShift?.end_time) {
            try {
                const shiftStartH = new Date(currentShift.start_time).toTimeString().substring(0, 5);
                const shiftEndH = new Date(currentShift.end_time).toTimeString().substring(0, 5);
                isTimeSlotMatch = time >= shiftStartH && time <= shiftEndH;
            } catch {
                isTimeSlotMatch = false;
            }
        }

        let rank = 8;
        let badgeTextAr = 'غير مجدول اليوم';
        let badgeTextEn = 'Off-Duty Today';
        let dot = '⚪';
        let tone = 'slate';
        let statusClass = 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400';

        if (isPresent && isRoomAssigned) {
            rank = 1;
            badgeTextAr = 'حاضر ومخصص للغرفة 🟢📍';
            badgeTextEn = 'Present & Room Assigned 🟢📍';
            dot = '🟢';
            tone = 'emerald';
            statusClass = 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 ring-1 ring-emerald-500/20';
        } else if (isPresent && (isTimeSlotMatch || hasShiftToday)) {
            rank = 2;
            badgeTextAr = isTimeSlotMatch ? 'حاضر في الوردية الحالية 🟢' : 'حاضر ومناوب اليوم 🟢';
            badgeTextEn = isTimeSlotMatch ? 'Present on Active Shift 🟢' : 'Present on Shift Today 🟢';
            dot = '🟢';
            tone = 'emerald';
            statusClass = 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
        } else if (isPresent) {
            rank = 4;
            badgeTextAr = 'مسجل حضور الآن 🟢';
            badgeTextEn = 'Clocked-In Now 🟢';
            dot = '🟢';
            tone = 'teal';
            statusClass = 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300';
        } else if (isRoomAssigned) {
            rank = 5;
            badgeTextAr = 'مجدول وردية لهذه الغرفة 📍';
            badgeTextEn = 'Shift Assigned to Room 📍';
            dot = '📍';
            tone = 'sky';
            statusClass = 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300';
        } else if (hasShiftToday) {
            rank = 7;
            badgeTextAr = 'مجدول في وردية اليوم 🟡';
            badgeTextEn = 'Scheduled Shift Today 🟡';
            dot = '🟡';
            tone = 'amber';
            statusClass = 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
        }

        return {
            rank,
            isPresent,
            isLate,
            hasShiftToday,
            isRoomAssigned,
            isTimeSlotMatch,
            badgeText: isRtl ? badgeTextAr : badgeTextEn,
            dot,
            tone,
            statusClass,
            shift: currentShift,
            attendance: userAtt
        };
    }, [dayShifts, dayAttendance, roomId, time, isRtl]);

    const classifiedTechnicians = useMemo(() => {
        return roleStaff.technicians
            .map((m) => ({ ...m, duty: getStaffDutyInfo(m.user_id) }))
            .sort((a, b) => (a.duty?.rank || 99) - (b.duty?.rank || 99));
    }, [roleStaff.technicians, getStaffDutyInfo]);

    const classifiedNurses = useMemo(() => {
        return roleStaff.nurses
            .map((m) => ({ ...m, duty: getStaffDutyInfo(m.user_id) }))
            .sort((a, b) => (a.duty?.rank || 99) - (b.duty?.rank || 99));
    }, [roleStaff.nurses, getStaffDutyInfo]);

    const displayedTechnicians = useMemo(() => {
        if (!dutyStaffOnly) return classifiedTechnicians;
        const dutyOnly = classifiedTechnicians.filter((t) => (t.duty?.rank || 99) <= 7);
        return dutyOnly.length > 0 ? dutyOnly : classifiedTechnicians;
    }, [classifiedTechnicians, dutyStaffOnly]);

    const displayedNurses = useMemo(() => {
        if (!dutyStaffOnly) return classifiedNurses;
        const dutyOnly = classifiedNurses.filter((n) => (n.duty?.rank || 99) <= 7);
        return dutyOnly.length > 0 ? dutyOnly : classifiedNurses;
    }, [classifiedNurses, dutyStaffOnly]);

    const selTechnicianDuty = useMemo(() => getStaffDutyInfo(techId), [techId, getStaffDutyInfo]);
    const selNurseDuty = useMemo(() => getStaffDutyInfo(nurseId), [nurseId, getStaffDutyInfo]);

    const exTypes = useMemo(() => {
        if (!selMachine) return [];
        return examTypes.filter((e) => !e.modality_id || e.modality_id === selMachine.modality_id);
    }, [examTypes, selMachine]);

    /* Auto sync exam duration & contrast */
    useEffect(() => {
        if (selExam) {
            if (selExam.contrast_required !== undefined) {
                const requiresContrast = Boolean(selExam.contrast_required);
                if (contrastRequired !== requiresContrast) {
                    setValue('contrastRequired', requiresContrast, { shouldDirty: true });
                }
            }
            if (selExam.price != null && String(paymentAmount ?? '') !== String(selExam.price)) {
                setValue('paymentAmount', selExam.price, { shouldDirty: true });
            }
        }
    }, [selExam, contrastRequired, paymentAmount, setValue]);

    const duration = selExam?.duration_minutes || 30;
    const slot = useMemo(() => appointmentWindow(date, time, duration), [date, time, duration]);

    /* Overlap & Slot Collision Detection */
    const overlap = useMemo(() => {
        if (!modalityId || !slot.start || !slot.end) return null;
        return dayAppts.find((a) => {
            if (a.modality_id !== modalityId || ['Cancelled', 'No-Show'].includes(a.status)) return false;
            const as = new Date(a.start_time);
            const ae = new Date(a.end_time);
            return slot.start < ae && slot.end > as;
        });
    }, [dayAppts, modalityId, slot.start, slot.end]);

    const isPast = useMemo(() => {
        if (!slot.start) return false;
        const now = new Date();
        now.setMinutes(now.getMinutes() - 10);
        return slot.start < now;
    }, [slot.start]);

    const hasValidSlot = Boolean(modalityId && date && time && !isPast && !overlap);

    /* Filtered quick time slots based on period */
    const quickTimes = useMemo(() => {
        return ALL_TIME_SLOTS.filter((tStr) => {
            const hour = parseInt(tStr.split(':')[0], 10);
            if (timePeriodFilter === 'morning') return hour >= 8 && hour < 12;
            if (timePeriodFilter === 'afternoon') return hour >= 12 && hour < 16;
            if (timePeriodFilter === 'evening') return hour >= 16 && hour <= 22;
            return true;
        });
    }, [timePeriodFilter]);

    /* Rich availability state for suggested slots */
    const quickTimeOptions = useMemo(() => quickTimes.map((candidate) => {
        const candidateWindow = appointmentWindow(date, candidate, duration);
        const candidatePast = Boolean(candidateWindow.start && candidateWindow.start < new Date(Date.now() - 10 * 60000));
        const candidateOverlap = modalityId && candidateWindow.start && candidateWindow.end
            ? dayAppts.find((a) => {
                if (a.modality_id !== modalityId || ['Cancelled', 'No-Show'].includes(a.status)) return false;
                const as = new Date(a.start_time);
                const ae = new Date(a.end_time);
                return candidateWindow.start < ae && candidateWindow.end > as;
            })
            : null;
        return {
            value: candidate,
            isPast: candidatePast,
            overlap: candidateOverlap,
            available: Boolean(modalityId && !candidatePast && !candidateOverlap)
        };
    }), [quickTimes, date, duration, modalityId, dayAppts]);

    /* Section Completion Matrix */
    const sectionComplete = useMemo(() => [
        Boolean(patientId && date),
        Boolean(modalityId && examTypeId),
        Boolean(hasValidSlot),
        Boolean(payMethod)
    ], [patientId, date, modalityId, examTypeId, hasValidSlot, payMethod]);

    const bookingProgress = useMemo(() => {
        const completedCount = sectionComplete.filter(Boolean).length;
        return Math.round((completedCount / 4) * 100);
    }, [sectionComplete]);

    const selectedExamPrice = selExam?.price ?? null;
    const selectedExamBodyPart = selExam?.body_part || null;

    const goToSection = (index) => {
        setActiveSection(index);
        setMaxVisitedSection((prev) => Math.max(prev, index));
        sectionRefs[index]?.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };


    const advanceToSection = async (target) => {
        const current = activeSection;
        let valid = true;

        if (current === 0) {
            if (!patientId) {
                valid = await trigger(['patientId']);
                if (!valid) {
                    toast.error(t('validation.patientRequired', 'Please select a patient'));
                }
            } else {
                clearErrors('patientId');
                valid = true;
            }
            if (!date) {
                toast.error(t('validation.appointmentDateRequired', 'Choose an appointment date'));
                valid = false;
            }
        } else if (current === 1) {
            valid = await trigger(['modalityId', 'examTypeId']);
        } else if (current === 2) {
            valid = await trigger(['time', 'referringDoctor']);
            if (!hasValidSlot) {
                toast.error(overlap
                    ? t('booking.machineBookedShort', 'Selected slot is already booked')
                    : isPast
                        ? t('booking.futureTimeShort', 'Choose a future time')
                        : t('booking.chooseMachineTime', 'Select an available room and time'));
                valid = false;
            }
        }

        if (!valid) return;
        goToSection(target);
    };

    /* Keyboard shortcut: Ctrl + Enter to submit */
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('book-appointment-form')?.requestSubmit();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    /* Quick Register Patient handler */
    const handleQuickRegisterPatient = async (e) => {
        e.preventDefault();
        if (!quickPtForm.firstName.trim() || !quickPtForm.lastName.trim()) {
            toast.error(t('validation.patientRequired', 'Patient name is required'));
            return;
        }
        try {
            const res = await createPatientMutation({
                first_name: quickPtForm.firstName.trim(),
                last_name: quickPtForm.lastName.trim(),
                phone: quickPtForm.phone.trim() || undefined,
                gender: quickPtForm.gender,
                date_of_birth: quickPtForm.dateOfBirth || undefined
            }).unwrap();

            const newPatientId = res?.patient_id || res?.data?.patient_id;
            if (newPatientId) {
                setValue('patientId', newPatientId, { shouldDirty: true, shouldValidate: true });
            }
            toast.success(t('toast.patientCreated', 'Patient registered successfully!'));
            setShowQuickPatientModal(false);
            setQuickPtForm({ firstName: '', lastName: '', phone: '', gender: 'Male', dateOfBirth: '' });
        } catch (err) {
            toast.error(getErrorMessage(err, t('toast.createFailed', 'Failed to register patient')));
        }
    };

    /* Form Submit handler */
    const submit = async (values) => {
        const resolvedPatientId = values.patientId || patientId;
        if (!resolvedPatientId) {
            toast.error(t('validation.patientRequired', 'Please select a patient'));
            goToSection(0);
            return;
        }

        if (!values.modalityId || !values.examTypeId) {
            toast.error(isRtl ? 'يرجى اختيار جهاز الأشعة ونوع الفحص' : t('validation.examRequired', 'Please select a machine and examination type'));
            goToSection(1);
            return;
        }

        if (!slot.start || !slot.end) {
            toast.error(t('validation.startTimeRequired'));
            goToSection(2);
            return;
        }
        if (isPast) {
            toast.error(t('booking.futureTime'));
            goToSection(2);
            return;
        }
        if (overlap) {
            toast.error(t('booking.machineBooked', {
                machine: selMachine?.name || t('booking.thisMachine'),
                start: fmt(new Date(overlap.start_time)),
                end: fmt(new Date(overlap.end_time)),
            }));
            goToSection(2);
            return;
        }

        const payload = {
            idempotencyKey: idKey.current,
            patientId: resolvedPatientId,
            modalityId: values.modalityId,
            roomId: optId(values.roomId) || selMachine?.room_id || null,
            examTypeId: values.examTypeId,
            startTime: slot.start.toISOString(),
            endTime: slot.end.toISOString(),
            priority: values.priority || 'Routine',
            notes: values.notes?.trim() || null,
            paymentMethod: values.paymentMethod || 'Cash',
            paymentAmount: values.paymentAmount ? Number(values.paymentAmount) : (selectedExamPrice != null ? Number(selectedExamPrice) : null),
            appointmentSource: values.appointmentSource || 'Walk-in',
            referringDoctorId: refMode === 'directory' ? optId(values.referringDoctorId) : null,
            referringDoctor: refMode === 'custom' ? values.referringDoctor?.trim() || null : null,
            radiologistId: optId(values.radiologistId),
            technicianId: optId(values.technicianId),
            nurseId: optId(values.nurseId),
            preparationStatus: values.preparationStatus || 'Not Required',
            contrastRequired: Boolean(values.contrastRequired),
            pregnancySafetyStatus: values.pregnancySafetyStatus || 'Unknown',
            implantSafetyStatus: values.implantSafetyStatus || 'Unknown',
            renalSafetyStatus: values.renalSafetyStatus || 'Unknown',
            isFollowUp: Boolean(values.isFollowUp),
            priorExamId: values.isFollowUp ? optId(values.priorExamId) : null,
            followUpReason: values.isFollowUp ? values.followUpReason?.trim() || null : null,
            arrived: Boolean(values.arrived),
            waitlistId: reqWId || undefined
        };

        try {
            const res = await createAppt(payload).unwrap();
            const createdId = res?.appointment_id || res?.data?.appointment_id;

            if (values.paymentMethod === 'Insurance' && values.insuranceProviderId && createdId) {
                try {
                    await createInsuranceApproval({
                        appointmentId: createdId,
                        providerId: values.insuranceProviderId,
                        approvalNumber: values.insuranceApprovalNumber?.trim() || undefined,
                        status: values.insuranceApprovalStatus || 'Pending',
                        coveragePercentage: 100,
                        patientCopay: 0
                    }).unwrap();
                } catch (insErr) {
                    toast.error(t('toast.appointmentBookedApprovalFailed', 'Appointment booked, but insurance approval filing failed. Complete it from reception.'), { duration: 8000 });
                    navigate(`/appointments?patientId=${values.patientId}`, { replace: true });
                    return;
                }
            }

            toast.success(t('toast.appointmentBooked', 'Appointment confirmed successfully!'));
            setBookedAppointment(res?.data || res || { appointment_id: createdId, patient_name: selPt ? `${selPt.first_name} ${selPt.last_name}` : '' });
        } catch (e) {
            toast.error(getErrorMessage(e, t('toast.bookFailed', 'Failed to book appointment')));
        }
    };

    const errorCount = Object.keys(errors).length;

    return (
        <div className="relative mx-auto max-w-[1440px] space-y-3 pb-28 lg:pb-8" dir={isRtl ? 'rtl' : undefined}>
            <div className="pointer-events-none absolute -top-24 start-1/2 -z-10 h-72 w-[80%] -translate-x-1/2 rounded-full bg-teal-500/[0.05] blur-3xl dark:bg-teal-400/[0.03]" />

            {/* ── Workspace heading ── */}
            <PageHeader
                icon={CalendarCheck2}
                eyebrow={t('bookingPage.eyebrow', 'Scheduling Workspace')}
                eyebrowIcon={Sparkles}
                title={t('bookingPage.title', 'Book Appointment')}
                description={t('bookingPage.subtitle', 'Create a safe, conflict-free radiology appointment in four guided steps')}
                actions={
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-teal-300 hover:text-teal-700 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] dark:text-slate-300"
                        >
                            <ArrowLeft size={16} className="rtl:rotate-180" />
                            <span>{t('bookingPage.back', 'Back')}</span>
                        </button>
                        <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-600 shadow-sm md:flex dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)] dark:text-slate-300">
                            <CalendarCheck2 size={13} className="text-teal-600" />
                            <span>{t('bookingPage.shortcutHint', 'Confirm with')}</span>
                            <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-black text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">Ctrl ↵</kbd>
                        </div>
                    </div>
                }
                metrics={[
                    { key: 'step1', tone: activeSection === 0 ? 'teal' : 'slate', label: t('bookingPage.step1Title', 'Patient & Date'), value: selPt ? (isRtl ? 'تم التحديد' : 'Selected') : (isRtl ? 'مطلوب' : 'Required') },
                    { key: 'step2', tone: activeSection === 1 ? 'cyan' : 'slate', label: t('bookingPage.step2Title', 'Exam & Modality'), value: selExam ? (isRtl ? 'تم التحديد' : 'Selected') : (isRtl ? 'مطلوب' : 'Required') },
                    { key: 'step3', tone: activeSection === 2 ? 'amber' : 'slate', label: t('bookingPage.step3Title', 'Timing & Safety'), value: time || (isRtl ? 'مطلوب' : 'Required') },
                    { key: 'step4', tone: activeSection === 3 ? 'emerald' : 'slate', label: t('bookingPage.step4Title', 'Care & Payment'), value: selRad ? (isRtl ? 'معيّن' : 'Assigned') : (isRtl ? 'اختياري' : 'Optional') },
                ]}
                metricsLabel={t('bookingPage.workflow', 'Booking Stages')}
            />

            {/* ── Top Compact Stepper Navigation ── */}
            <BookingNavigator
                active={activeSection}
                complete={sectionComplete}
                progress={bookingProgress}
                onSelect={goToSection}
                t={t}
                isRtl={isRtl}
            />

            {/* Error Notification Alert Banner */}
            {isSubmitted && errorCount > 0 && (
                <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 p-2.5 text-xs text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200 shadow-sm"
                >
                    <AlertCircle size={17} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
                    <div>
                        <p className="font-black">{t('bookingPage.incompleteBooking', 'Complete the required booking information')}</p>
                        <p className="mt-0.5 text-[10.5px] opacity-90">{t('bookingPage.incompleteBookingHint', 'Review the highlighted fields before confirming the appointment.')}</p>
                    </div>
                </div>
            )}

            {/* Waitlist Linking Banner */}
            {reqWId && (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-500/10 via-cyan-500/10 to-teal-500/5 p-3 text-xs text-teal-900 dark:border-teal-800 dark:text-teal-200">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-teal-600 text-white shadow-xs">
                            <Users size={14} />
                        </span>
                        <div className="min-w-0">
                            <p className="font-black truncate">
                                {t('bookingPage.waitlistLinkedTitle', 'Booking from Waiting List')}
                            </p>
                            <p className="text-[11px] text-teal-700/90 dark:text-teal-300/80 truncate">
                                {t('bookingPage.waitlistLinkedHint', 'Confirming this appointment will automatically complete the waitlist entry.')}
                            </p>
                        </div>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] font-bold rounded-lg bg-teal-100/80 px-2 py-0.5 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200 border border-teal-300/40">
                        WL #{reqWId.slice(0, 8)}
                    </span>
                </div>
            )}

            {/* ── Main Form Layout: Active Step on Left, Pinned Summary Card on Right ── */}
            <form
                id="book-appointment-form"
                onSubmit={handleSubmit(submit)}
                className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]"
                dir={isRtl ? 'rtl' : undefined}
                noValidate
            >
                {/* ── LEFT COLUMN: Only Active Step Visible with Smooth Transition ── */}
                <div className="min-w-0">

                    {/* ══════════════════════════════════════════════════
                        STEP 1: Patient Identity & Visit Date
                    ══════════════════════════════════════════════════ */}
                    <div
                        ref={sectionRefs[0]}
                        className={activeSection === 0 ? "block animate-in fade-in-50 duration-200" : "hidden"}
                    >
                        <StepCard className={STEP_COLORS[0].card} highlight={activeSection === 0}>
                            <CardHead
                                icon={UserRound}
                                stepNumber={isRtl ? '١ / ٤' : '1 of 4'}
                                title={t('bookingPage.step1Title', 'Patient & Visit Date')}
                                subtitle={t('bookingPage.step1Hint', 'Find patient and choose visit date')}
                                accentClass={STEP_COLORS[0].accent}
                                right={
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setShowQuickPatientModal(true)}
                                            className="inline-flex items-center gap-1 rounded-lg border border-teal-300 bg-teal-50 px-2 py-0.5 text-[9.5px] font-black text-teal-800 hover:bg-teal-100 dark:border-teal-700 dark:bg-teal-950/50 dark:text-teal-300 transition"
                                        >
                                            <UserPlus size={11} />
                                            <span>{t('bookingPage.newPatient', '+ New Patient')}</span>
                                        </button>
                                        {selPt ? (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/15 border border-teal-300/60 dark:border-teal-700/60 px-2 py-0.5 text-[9.5px] font-black text-teal-800 dark:text-teal-200">
                                                <UserCheck size={11} />
                                                {t('booking.patientSelected', 'Selected')}
                                            </span>
                                        ) : (
                                            <span className="rounded-full bg-amber-500/15 border border-amber-300/60 dark:border-amber-700/60 px-2 py-0.5 text-[9.5px] font-black text-amber-800 dark:text-amber-300">
                                                {t('validation.patientRequired', 'Required')}
                                            </span>
                                        )}
                                    </div>
                                }
                            />

                            <div className="space-y-3.5 p-3.5 sm:p-4">
                                {/* Search & Select Patient Combined Control */}
                                <div>
                                    <label htmlFor="patient-search" className={lbl}>
                                        <Search size={11} className="text-teal-600 dark:text-teal-400" />
                                        {t('bookingPage.searchPatient', 'Search patient')}
                                    </label>
                                    <div className="overflow-hidden rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-inner transition-all focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20">
                                        <div className="flex min-h-9 items-center gap-2 border-b border-[var(--VIARA-line)] px-2.5 py-1 bg-[var(--VIARA-surface-muted)]/30">
                                            <Search size={14} className="shrink-0 text-teal-600 dark:text-teal-400" />
                                            <input
                                                id="patient-search"
                                                value={ptSearch}
                                                onChange={(e) => setPtSearch(e.target.value)}
                                                aria-label={t('bookingPage.searchPatient', 'Search patient')}
                                                aria-controls="patient-select"
                                                aria-autocomplete="list"
                                                placeholder={t('bookingPage.searchPlaceholder', 'Name, MRN or phone')}
                                                className="min-w-0 flex-1 bg-transparent py-0.5 text-xs font-semibold text-[var(--VIARA-ink)] outline-none placeholder:text-[var(--VIARA-muted)]"
                                                autoComplete="off"
                                            />
                                            {ptSearch && (
                                                <button
                                                    type="button"
                                                    onClick={() => setPtSearch('')}
                                                    aria-label="Clear search"
                                                    className="shrink-0 rounded-lg bg-teal-500/10 px-2 py-0.5 text-[10px] font-black text-teal-700 hover:bg-teal-500/20 dark:text-teal-300 transition"
                                                >
                                                    {isRtl ? 'مسح' : t('bookingPage.clearSearch', 'Clear')}
                                                </button>
                                            )}
                                            <span
                                                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:text-slate-300"
                                                aria-live="polite"
                                                title={isRtl ? 'عدد المرضى المتاحين' : 'Available patients'}
                                            >
                                                {ptSearch.trim()
                                                    ? `${ptOpts.length}/${resolvedPatients.length}`
                                                    : `${resolvedPatients.length}`}
                                            </span>
                                        </div>

                                        <select
                                            id="patient-select"
                                            aria-label={t('bookingPage.selectedPatientLabel', 'Selected Patient')}
                                            value={patientId || ''}
                                            disabled={ptLoading}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setValue('patientId', val, { shouldValidate: true, shouldDirty: true });
                                                if (val) {
                                                    clearErrors('patientId');
                                                }
                                            }}
                                            className="min-h-9 w-full bg-transparent px-2.5 py-1.5 text-xs font-bold text-[var(--VIARA-ink)] outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            <option value="">
                                                {ptLoading
                                                    ? t('bookingPage.loadingPatients', 'Loading...')
                                                    : !resolvedPatients.length
                                                        ? t('bookingPage.noPatientsFound', 'No patients found')
                                                        : ptSearch.trim() && !ptOpts.length
                                                            ? `${t('bookingPage.noMatchesFor', 'No matches for')} "${ptSearch.trim()}"`
                                                            : t('booking.noPatientSelected', 'Select patient...')}
                                            </option>
                                            {ptOpts.map((p) => (
                                                <option
                                                    key={p.patient_id}
                                                    value={p.patient_id}
                                                >
                                                    {p.first_name} {p.last_name} — {p.mrn}{p.phone ? ` — ${p.phone}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {!patientId && <ErrMsg msg={errors.patientId?.message} />}
                                </div>

                                {/* Active Patient Visual Card */}
                                {selPt && (
                                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200/90 bg-gradient-to-r from-teal-500/10 via-emerald-500/10 to-teal-500/5 p-2.5 dark:border-teal-800/60 dark:from-teal-950/40 dark:to-emerald-950/30 animate-in fade-in duration-150">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white font-black text-[11px] shadow-sm">
                                                {selPt.first_name?.[0] || 'P'}
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-xs font-black text-[var(--VIARA-ink)] truncate">
                                                    {selPt.first_name} {selPt.last_name}
                                                </h4>
                                                <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-semibold text-teal-800 dark:text-teal-300">
                                                    <span className="rounded bg-white/70 dark:bg-slate-900/60 px-1 py-0.2 font-mono text-[9.5px] font-bold border border-teal-200/50 dark:border-teal-800/50">
                                                        {selPt.mrn}
                                                    </span>
                                                    {selPt.phone && (
                                                        <span className="inline-flex items-center gap-0.5 opacity-90">
                                                            <Phone size={9.5} /> {selPt.phone}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {/* Follow-up toggle */}
                                            <label className="flex min-h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-teal-200/80 bg-white/95 px-2.5 py-1 text-xs shadow-2xs hover:border-teal-400 dark:border-teal-800 dark:bg-slate-900 transition">
                                                <input
                                                    type="checkbox"
                                                    aria-label={isRtl ? 'موعد متابعة' : t('bookingPage.followUp', 'Follow-up appointment')}
                                                    {...register('isFollowUp')}
                                                    className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                                />
                                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                                                    {isRtl ? 'موعد متابعة' : t('bookingPage.followUp', 'Follow-up appointment')}
                                                </span>
                                            </label>

                                            {/* Change patient button */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setValue('patientId', '', { shouldValidate: true, shouldDirty: true });
                                                    setPtSearch('');
                                                }}
                                                className="inline-flex min-h-8 items-center justify-center rounded-xl border border-teal-300/80 bg-white px-3 py-1 text-xs font-black text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:bg-slate-900 dark:text-teal-300 transition shadow-2xs active:scale-95"
                                            >
                                                {isRtl ? 'تغيير المريض' : t('bookingPage.changePatient', 'Change')}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Follow-up Prior Study Selector */}
                                {selPt && isFollowUp && (
                                    <div className="rounded-xl border border-sky-200/90 bg-sky-50/60 p-2.5 dark:border-sky-800/60 dark:bg-sky-950/30 space-y-2">
                                        <div className="flex items-center gap-1.5 text-xs font-black text-sky-900 dark:text-sky-200">
                                            <RotateCcw size={13} className="text-sky-600" />
                                            <span>{t('bookingPage.priorStudy', 'Prior study')}</span>
                                        </div>
                                        <select
                                            id="priorExamId"
                                            aria-label="Prior study"
                                            {...register('priorExamId', {
                                                required: isFollowUp ? t('bookingPage.priorExamRequired', 'Select the prior examination.') : false
                                            })}
                                            disabled={histLoad || !priorExams.length}
                                            className={inp}
                                        >
                                            <option value="">
                                                {histLoad
                                                    ? t('bookingPage.loadingHistory', 'Loading...')
                                                    : priorExams.length
                                                        ? t('bookingPage.selectPriorStudy', 'Select prior study')
                                                        : t('bookingPage.noPriorStudies', 'No eligible studies')}
                                            </option>
                                            {priorExams.map((e) => (
                                                <option key={e.exam_id} value={e.exam_id}>
                                                    {new Date(e.start_time).toLocaleDateString()} — {e.exam_type_name || e.machine_name || 'Exam'} — {e.order_number || e.exam_id}
                                                </option>
                                            ))}
                                        </select>
                                        <ErrMsg msg={errors.priorExamId?.message} />

                                        <div>
                                            <label htmlFor="followUpReason" className={lbl}>
                                                {t('bookingPage.followUpReason', 'Reason for Follow-up')}
                                            </label>
                                            <input
                                                id="followUpReason"
                                                {...register('followUpReason')}
                                                placeholder={t('bookingPage.followUpReasonHint', 'e.g. Post-therapy evaluation or comparative re-scan')}
                                                className={inp}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Date Selector with Quick Preset Pills */}
                                <div>
                                    <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                                        <label htmlFor="appointment-date" className={lbl}>
                                            <Calendar size={11} className="text-teal-600 dark:text-teal-400" />
                                            {t('booking.appointmentDate', 'Date')}
                                        </label>
                                        <div className="flex flex-wrap items-center gap-1">
                                            {[
                                                { label: t('bookingPage.today', 'Today'), value: dateAfter(0) },
                                                { label: t('bookingPage.tomorrow', 'Tomorrow'), value: dateAfter(1) },
                                                { label: t('bookingPage.inTwoDays', '+2 Days'), value: dateAfter(2) },
                                                { label: t('bookingPage.inOneWeek', '+1 Week'), value: dateAfter(7) },
                                            ].map((item) => (
                                                <button
                                                    key={item.value}
                                                    type="button"
                                                    onClick={() => setDate(item.value)}
                                                    className={`rounded-lg px-2 py-0.5 text-[10.5px] font-black transition ${date === item.value
                                                        ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm'
                                                        : 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)] hover:bg-[var(--VIARA-surface)] border border-[var(--VIARA-line)]'
                                                        }`}
                                                >
                                                    {item.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <input
                                        id="appointment-date"
                                        type="date"
                                        min={toDateInput()}
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        className={inp}
                                    />
                                </div>

                                {/* Step Navigation Action Footer */}
                                <div className="flex items-center justify-between border-t border-[var(--VIARA-line)] pt-2.5">
                                    <span className="text-[10px] font-semibold text-[var(--VIARA-muted)]">
                                        {t('bookingPage.stepProgress1', 'Step 1 of 4')}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => advanceToSection(1)}
                                        className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-black transition-all ${STEP_COLORS[0].button} active:scale-[.98]`}
                                    >
                                        <span>{t('bookingPage.nextExam', 'Next: Examination')}</span>
                                        <ArrowRight size={13} className="rtl:rotate-180" />
                                    </button>
                                </div>
                            </div>
                        </StepCard>
                    </div>

                    {/* ══════════════════════════════════════════════════
                        STEP 2: Modality Room, Exam Type & Priority
                    ══════════════════════════════════════════════════ */}
                    <div
                        ref={sectionRefs[1]}
                        className={activeSection === 1 ? "block animate-in fade-in-50 duration-200" : "hidden"}
                    >
                        <StepCard className={STEP_COLORS[1].card} highlight={activeSection === 1}>
                            <CardHead
                                icon={Stethoscope}
                                stepNumber={isRtl ? '٢ / ٤' : '2 of 4'}
                                title={t('bookingPage.step2Title', 'Exam & Modality Room')}
                                subtitle={t('bookingPage.step2Hint', 'Select room, study type and priority')}
                                accentClass={STEP_COLORS[1].accent}
                                right={
                                    selExam ? (
                                        <span className="rounded-full bg-violet-500/15 border border-violet-300/60 dark:border-violet-700/60 px-2 py-0.5 text-[9.5px] font-black text-violet-800 dark:text-violet-200">
                                            ⏱ {duration} {t('bookingPage.minutesShort', 'min')}
                                        </span>
                                    ) : null
                                }
                            />

                            <div className="space-y-3.5 p-3.5 sm:p-4">
                                {/* Optional Reception Workstation Filter Notice */}
                                {workstationConfig.hasScopeFilter && (
                                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200/80 bg-gradient-to-r from-teal-500/10 via-cyan-500/10 to-transparent p-2.5 text-xs dark:border-teal-800/60 dark:from-teal-950/30">
                                        <div className="flex items-center gap-2">
                                            <span className="grid h-6 w-6 place-items-center rounded-lg bg-teal-600 text-white text-xs shadow-sm">
                                                🖥️
                                            </span>
                                            <div>
                                                <span className="font-black text-teal-900 dark:text-teal-200">
                                                    {isRtl ? 'حسب تهيئة الاستقبال النشطة:' : 'Active Reception Desk Filter:'} {workstationConfig.desk || (isRtl ? 'شباك مخصص' : 'Custom Workstation')}
                                                </span>
                                                <span className="ms-1.5 text-[10px] text-teal-700 dark:text-teal-300 font-semibold">
                                                    {applyWorkstationScope ? (isRtl ? '(تمت تصفية الغرف والأجهزة تلقائياً)' : '(Filtered by desk scope)') : (isRtl ? '(عرض الكل)' : '(Showing all)')}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setApplyWorkstationScope(!applyWorkstationScope)}
                                            className="rounded-lg border border-teal-300/80 bg-[var(--VIARA-surface)] px-2.5 py-1 text-[10.5px] font-black text-teal-800 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-200 shadow-xs"
                                        >
                                            {applyWorkstationScope ? (isRtl ? 'عرض كل الغرف والأجهزة' : 'Show All Rooms & Devices') : (isRtl ? 'إعادة تطبيق تصفية الشباك' : 'Reapply Desk Filter')}
                                        </button>
                                    </div>
                                )}

                                {/* Modality Room + Machine + Exam Type Selectors */}
                                <div className="grid gap-2.5 sm:grid-cols-3">
                                    {/* 1. Room Selector */}
                                    <div>
                                        <label className={lbl} htmlFor="appointment-room-select">
                                            <DoorOpen size={11} className="text-violet-600 dark:text-violet-400" />
                                            {isRtl ? 'الغرفة / الجناح' : 'Clinical Room'}
                                        </label>
                                        <select
                                            id="appointment-room-select"
                                            aria-label={isRtl ? 'الغرفة / الجناح' : 'Clinical Room'}
                                            {...register('roomId')}
                                            value={roomId || ''}
                                            onChange={(e) => {
                                                const newRoomId = e.target.value;
                                                setValue('roomId', newRoomId, { shouldDirty: true });
                                                if (newRoomId) {
                                                    const machinesInNewRoom = activeMachines.filter(m => String(m.room_id) === String(newRoomId));
                                                    if (machinesInNewRoom.length === 1) {
                                                        setValue('modalityId', machinesInNewRoom[0].modality_id, { shouldDirty: true, shouldValidate: true });
                                                    } else if (modalityId && !machinesInNewRoom.some(m => String(m.modality_id) === String(modalityId))) {
                                                        setValue('modalityId', '', { shouldDirty: true });
                                                        setValue('examTypeId', '', { shouldDirty: true });
                                                    }
                                                }
                                            }}
                                            className={inp}
                                        >
                                            <option value="">{isRtl ? 'جميع الغرف / تلقائي حسب الجهاز' : 'All Rooms / Auto from Device'}</option>
                                            {displayedRooms.map((r) => (
                                                <option key={r.room_id || r.id} value={r.room_id || r.id}>
                                                    {r.room_number ? `${isRtl ? 'غرفة' : 'Room'} ${r.room_number}` : ''} {r.name ? `— ${r.name}` : ''} {r.floor ? `(${r.floor})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 2. Modality / Device Selector */}
                                    <div>
                                        <label className={lbl} htmlFor="appointment-modality-select">
                                            <Layers size={11} className="text-violet-600 dark:text-violet-400" />
                                            {t('booking.machine', 'Modality / Device')} *
                                        </label>
                                        <select
                                            id="appointment-modality-select"
                                            aria-label={t('booking.machine', 'Modality / Device')}
                                            {...register('modalityId', { required: t('validation.machineRequired') })}
                                            value={modalityId || ''}
                                            onChange={(e) => {
                                                const newMId = e.target.value;
                                                setValue('modalityId', newMId, { shouldDirty: true, shouldValidate: true });
                                                setValue('examTypeId', '', { shouldDirty: true });
                                                const chosenMachine = activeMachines.find(m => String(m.modality_id) === String(newMId));
                                                if (chosenMachine?.room_id) {
                                                    setValue('roomId', chosenMachine.room_id, { shouldDirty: true });
                                                }
                                            }}
                                            className={inp}
                                        >
                                            <option value="">{t('booking.selectMachine', 'Select device...')}</option>
                                            {displayedMachines.map((m) => (
                                                <option key={m.modality_id} value={m.modality_id}>
                                                    {m.name} {m.room_number || m.room_name ? `(${isRtl ? 'غرفة' : 'Room'} ${m.room_number || m.room_name})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                        <ErrMsg msg={errors.modalityId?.message} />
                                    </div>

                                    {/* 3. Exam Type Selector */}
                                    <div>
                                        <label className={lbl} htmlFor="appointment-exam-select">
                                            <Stethoscope size={11} className="text-violet-600 dark:text-violet-400" />
                                            {t('booking.examination', 'Exam Type')} *
                                        </label>
                                        <select
                                            id="appointment-exam-select"
                                            aria-label={t('booking.examination', 'Exam Type')}
                                            {...register('examTypeId', { required: t('validation.examRequired') })}
                                            disabled={!modalityId}
                                            className={inp}
                                        >
                                            <option value="">
                                                {modalityId
                                                    ? t('booking.selectExam', 'Select type...')
                                                    : (isRtl ? 'اختر الجهاز أولاً' : 'Select device first')}
                                            </option>
                                            {exTypes.map((e) => (
                                                <option key={e.type_id} value={e.type_id}>
                                                    {e.name}
                                                </option>
                                            ))}
                                        </select>
                                        <ErrMsg msg={errors.examTypeId?.message} />
                                    </div>
                                </div>

                                {/* Rich Selected Exam Preview Grid */}
                                {selExam && (
                                    <div className="rounded-xl border border-violet-200/90 bg-gradient-to-r from-violet-500/10 via-fuchsia-500/10 to-indigo-500/5 p-2.5 dark:border-violet-800/60 dark:from-violet-950/40 dark:to-indigo-950/30">
                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                            {[
                                                { label: t('bookingPage.selectedStudy', 'Selected study'), val: selExam.name, tone: 'text-violet-700 dark:text-violet-300' },
                                                { label: t('booking.duration', 'Duration'), val: `${duration} ${t('bookingPage.minutesShort', 'min')}`, tone: 'text-sky-700 dark:text-sky-300' },
                                                { label: t('bookingPage.bodyPart', 'Body part'), val: selectedExamBodyPart || '—', tone: 'text-emerald-700 dark:text-emerald-300' },
                                                {
                                                    label: t('bookingPage.estimatedPrice', 'Estimated price'),
                                                    val: selectedExamPrice != null ? `${Number(selectedExamPrice).toLocaleString(isRtl ? 'ar-EG' : 'en-US')} ${t('bookingPage.currency', 'EGP')}` : '—',
                                                    tone: 'text-amber-700 dark:text-amber-300'
                                                },
                                            ].map(({ label, val, tone }) => (
                                                <div key={label} className="rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)]/80 p-1.5 backdrop-blur-sm">
                                                    <p className="text-[8.5px] font-black uppercase tracking-wider text-[var(--VIARA-muted)]">{label}</p>
                                                    <p className={`mt-0.5 text-[10.5px] font-black truncate ${tone}`}>{val}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Case Priority + Booking Source */}
                                <div className="grid gap-2.5 sm:grid-cols-2">
                                    <div>
                                        <label className={lbl}>
                                            <Flame size={11} className="text-amber-600 dark:text-amber-400" />
                                            {t('booking.priority', 'Priority')} *
                                        </label>
                                        <input type="hidden" {...register('priority')} />
                                        <div
                                            role="group"
                                            aria-label={t('booking.priority', 'Priority')}
                                            className="grid grid-cols-3 gap-1 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/50 p-1"
                                        >
                                            {['Routine', 'Urgent', 'Emergency'].map((value) => {
                                                const isSel = priority === value;
                                                return (
                                                    <button
                                                        key={value}
                                                        type="button"
                                                        onClick={() => setValue('priority', value, { shouldDirty: true })}
                                                        aria-pressed={isSel}
                                                        className={`min-h-7.5 rounded-lg px-2 text-xs font-black transition-all ${isSel
                                                            ? PRIORITY_TONES[value]
                                                            : 'text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)] hover:bg-[var(--VIARA-surface)] border border-transparent'
                                                            }`}
                                                    >
                                                        {t(`priority.${value}`, value)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div>
                                        <label className={lbl}>
                                            <Info size={11} className="text-violet-600 dark:text-violet-400" />
                                            {t('booking.appointmentSource', 'Source')}
                                        </label>
                                        <select {...register('appointmentSource')} className={inp}>
                                            {['Walk-in', 'Phone', 'Website', 'Patient Portal', 'Doctor Portal', 'Call Center'].map((v) => (
                                                <option key={v} value={v}>
                                                    {t(`appointmentSources.${v}`, v)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Step Navigation Action Footer */}
                                <div className="flex items-center justify-between border-t border-[var(--VIARA-line)] pt-2.5">
                                    <button
                                        type="button"
                                        onClick={() => goToSection(0)}
                                        className="inline-flex min-h-8.5 items-center justify-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-xs font-black text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)] transition"
                                    >
                                        <ArrowLeft size={13} className="rtl:rotate-180" />
                                        <span>{t('bookingPage.prevPatient', 'Previous: Patient')}</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => advanceToSection(2)}
                                        className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-black transition-all ${STEP_COLORS[1].button} active:scale-[.98]`}
                                    >
                                        <span>{t('bookingPage.nextDetails', 'Next: Care Details')}</span>
                                        <ArrowRight size={13} className="rtl:rotate-180" />
                                    </button>
                                </div>
                            </div>
                        </StepCard>
                    </div>

                    {/* ══════════════════════════════════════════════════
                        STEP 3: Timing, Slot Conflict & Clinical Safety
                    ══════════════════════════════════════════════════ */}
                    <div
                        ref={sectionRefs[2]}
                        className={activeSection === 2 ? "block animate-in fade-in-50 duration-200" : "hidden"}
                    >
                        <StepCard className={STEP_COLORS[2].card} highlight={activeSection === 2}>
                            <CardHead
                                icon={Clock3}
                                stepNumber={isRtl ? '٣ / ٤' : '3 of 4'}
                                title={t('bookingPage.step3Title', 'Start Time & Clinical Safety')}
                                subtitle={t('bookingPage.step3Hint', 'Specify start time and safety clearances')}
                                accentClass={STEP_COLORS[2].accent}
                                right={<SlotStatus isPast={isPast} overlap={overlap} modalityId={modalityId} time={time} machine={selMachine?.name} t={t} />}
                            />

                            <div className="space-y-3.5 p-3.5 sm:p-4">
                                {/* Time Picker + Arrival Toggle */}
                                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[150px_minmax(0,1fr)] lg:items-end">
                                    <div>
                                        <label htmlFor="appointment-time" className={lbl}>
                                            <Clock3 size={11} className="text-sky-600 dark:text-sky-400" />
                                            {t('booking.startTime', 'Start')} *
                                        </label>
                                        <input
                                            id="appointment-time"
                                            aria-label={t('booking.startTime', 'Start')}
                                            type="time"
                                            value={time || ''}
                                            {...register('time', { required: t('validation.startTimeRequired') })}
                                            onChange={(e) => setValue('time', e.target.value, { shouldDirty: true, shouldValidate: true })}
                                            className={inp}
                                        />
                                        <ErrMsg msg={errors.time?.message} />
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <label className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/50 px-2.5 py-1 text-xs font-extrabold text-teal-900 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-200 shadow-sm transition">
                                            <input
                                                type="checkbox"
                                                {...register('arrived')}
                                                className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                            />
                                            <UserCheck size={13} className="text-teal-600" />
                                            <span>{t('bookingPage.patientArrived', 'Arrived')}</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Suggested Quick Time Slots with Period Filter Tabs */}
                                <div className="rounded-xl border border-sky-200/80 bg-gradient-to-r from-sky-500/10 via-cyan-500/5 to-transparent p-2.5 dark:border-sky-800/60 dark:from-sky-950/30">
                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-1.5">
                                        <div className="flex items-center gap-1 text-xs font-black text-sky-900 dark:text-sky-200">
                                            <Clock3 size={12} className="text-sky-600" />
                                            <span>{t('bookingPage.suggestedTimes', 'Suggested times')}</span>
                                        </div>

                                        {/* Period Filter Tabs */}
                                        <div className="flex rounded-lg border border-sky-200 bg-white/70 p-0.5 dark:border-sky-800 dark:bg-slate-900/60">
                                            {[
                                                { id: 'all', label: t('bookingPage.allTimes', 'All') },
                                                { id: 'morning', label: t('bookingPage.morning', 'Morning') },
                                                { id: 'afternoon', label: t('bookingPage.afternoon', 'Afternoon') },
                                                { id: 'evening', label: t('bookingPage.evening', 'Evening') }
                                            ].map((period) => (
                                                <button
                                                    key={period.id}
                                                    type="button"
                                                    onClick={() => setTimePeriodFilter(period.id)}
                                                    className={`rounded-md px-1.5 py-0.5 text-[9.5px] font-bold transition ${timePeriodFilter === period.id
                                                        ? 'bg-sky-600 text-white shadow-xs'
                                                        : 'text-slate-600 hover:text-sky-900 dark:text-slate-400'
                                                        }`}
                                                >
                                                    {period.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1">
                                        {quickTimeOptions.length ? (
                                            quickTimeOptions.map((option) => {
                                                const selected = time === option.value;
                                                const blocked = option.isPast || Boolean(option.overlap) || !modalityId;
                                                return (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        disabled={blocked}
                                                        onClick={() => setValue('time', option.value, { shouldDirty: true, shouldValidate: true })}
                                                        aria-pressed={selected}
                                                        title={option.isPast
                                                            ? t('booking.futureTimeShort', 'Past time')
                                                            : option.overlap
                                                                ? t('booking.machineBookedShort', 'Booked')
                                                                : !modalityId
                                                                    ? t('booking.selectMachineFirst', 'Select room first')
                                                                    : t('booking.noOverlapShort', 'Available')}
                                                        className={`group relative min-h-9 min-w-[62px] rounded-xl border px-2 font-mono text-[11px] font-black transition-all ${selected
                                                            ? 'border-teal-600 bg-teal-600 text-white shadow-md shadow-teal-600/20 ring-2 ring-teal-500/15'
                                                            : option.available
                                                                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-300'
                                                                : 'cursor-not-allowed border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/55 text-[var(--VIARA-muted)] opacity-55'
                                                            }`}
                                                    >
                                                        <span>{option.value}</span>
                                                        <span className={`absolute end-1 top-1 h-1.5 w-1.5 rounded-full ${option.available ? 'bg-emerald-500' : option.overlap ? 'bg-amber-500' : 'bg-slate-400'}`} />
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            <span className="text-xs text-[var(--VIARA-muted)]">
                                                {t('bookingPage.noSuggestedTimes', 'Choose another day for suggested times')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-sky-200/70 pt-2 text-[9px] font-bold text-[var(--VIARA-muted)] dark:border-sky-900/50">
                                        <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{t('booking.noOverlapShort', 'Available')}</span>
                                        <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-amber-500" />{t('booking.machineBookedShort', 'Booked')}</span>
                                        <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-slate-400" />{t('booking.futureTimeShort', 'Past time')}</span>
                                    </div>
                                </div>

                                {/* Clinical Safety Matrix & Contrast Warning Hub */}
                                <div className="rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-3 space-y-2.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--VIARA-line)] pb-2">
                                        <div className="flex items-center gap-1.5">
                                            <ShieldCheck size={14} className="text-teal-600 dark:text-teal-400" />
                                            <h4 className="text-xs font-black text-[var(--VIARA-ink)]">
                                                {t('bookingPage.safety', 'Safety & preparation')}
                                            </h4>
                                        </div>

                                        {/* IV Contrast Toggle */}
                                        <label className={`flex min-h-7.5 cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-0.5 text-xs font-black transition ${contrastRequired
                                            ? 'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 shadow-sm'
                                            : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)]'
                                            }`}>
                                            <input
                                                type="checkbox"
                                                {...register('contrastRequired')}
                                                className="h-3.5 w-3.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                            />
                                            <AlertTriangle size={12} className={contrastRequired ? 'text-amber-600' : 'text-slate-400'} />
                                            <span>{t('booking.contrastRequired', 'Contrast')}</span>
                                        </label>
                                    </div>

                                    {/* Prominent Contrast Alert Banner */}
                                    {contrastRequired && (
                                        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/95 p-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                                            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400 animate-pulse" />
                                            <div className="min-w-0 leading-relaxed text-[10.5px]">
                                                <p className="font-black text-amber-900 dark:text-amber-100">
                                                    {t('bookingPage.contrastAlertTitle', '⚠️ Contrast Study Alert:')}
                                                </p>
                                                <p className="mt-0.5 text-amber-800 dark:text-amber-300">
                                                    {t('bookingPage.contrastAlertMsg', 'This examination requires IV contrast supplies.')}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Safety Clearance Selectors */}
                                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                        <div>
                                            <label className={lbl}>{t('booking.preparation', 'Prep')}</label>
                                            <select {...register('preparationStatus')} className={inp}>
                                                {['Not Required', 'Pending', 'In Progress', 'Ready'].map((v) => (
                                                    <option key={v} value={v}>
                                                        {t(`prepStatus.${v}`, v)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {[
                                            ['pregnancySafetyStatus', 'Pregnancy'],
                                            ['implantSafetyStatus', 'Implant'],
                                            ['renalSafetyStatus', 'Renal']
                                        ].map(([name, label]) => (
                                            <div key={name}>
                                                <label className={lbl}>{t(`booking.${name.replace('SafetyStatus', 'Safety')}`, label)}</label>
                                                <select {...register(name)} className={inp}>
                                                    {['Unknown', 'Cleared', 'At Risk', 'Not Applicable'].map((v) => (
                                                        <option key={v} value={v}>
                                                            {t(`safety.${v}`, v)}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Referring Doctor Section */}
                                <div className="rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-3 space-y-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5">
                                            <UserPlus size={13} className="text-teal-600" />
                                            <span className="text-xs font-black text-[var(--VIARA-ink)]">
                                                {t('booking.referringDoctor', 'Referring Doctor')}
                                            </span>
                                        </div>
                                        <div className="flex rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-0.5">
                                            {[
                                                ['directory', t('bookingPage.directoryDoctor', 'Directory')],
                                                ['custom', t('bookingPage.customDoctor', 'Custom')]
                                            ].map(([mode, label]) => (
                                                <button
                                                    key={mode}
                                                    type="button"
                                                    onClick={() => setRefMode(mode)}
                                                    className={`rounded-md px-2 py-0.5 text-[10.5px] font-extrabold transition ${refMode === mode
                                                        ? 'bg-teal-600 text-white shadow-sm'
                                                        : 'text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)]'
                                                        }`}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {refMode === 'directory' ? (
                                        <select {...register('referringDoctorId')} className={inp}>
                                            <option value="">{t('booking.selectFromDirectory', 'None / Walk-in')}</option>
                                            {docs.map((d) => (
                                                <option key={d.doctor_id} value={d.doctor_id}>
                                                    {d.full_name} {d.specialty ? `· ${d.specialty}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    ) : (
                                        <input
                                            {...register('referringDoctor', {
                                                validate: (v) => refMode !== 'custom' || Boolean(v?.trim()) || t('validation.referringDoctorRequired'),
                                                maxLength: { value: 255, message: t('validation.referringDoctorTooLong') }
                                            })}
                                            placeholder={t('bookingPage.customDoctorPlaceholder', 'Doctor name, clinic, or walk-in source')}
                                            className={inp}
                                            autoComplete="organization"
                                        />
                                    )}
                                    <ErrMsg msg={errors.referringDoctor?.message} />
                                </div>

                                {/* Clinical Indication */}
                                <div>
                                    <label className={lbl}>
                                        <FileText size={11} className="text-sky-600" />
                                        {t('booking.clinicalIndication', 'Clinical Indication')}
                                    </label>
                                    <textarea
                                        {...register('clinicalIndication')}
                                        rows={2}
                                        placeholder={t('booking.clinicalIndicationPlaceholder', 'Describe clinical indication...')}
                                        className={`${inp} h-auto resize-none`}
                                    />
                                </div>

                                {/* Step Navigation Action Footer */}
                                <div className="flex items-center justify-between border-t border-[var(--VIARA-line)] pt-2.5">
                                    <button
                                        type="button"
                                        onClick={() => goToSection(1)}
                                        className="inline-flex min-h-8.5 items-center justify-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-xs font-black text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)] transition"
                                    >
                                        <ArrowLeft size={13} className="rtl:rotate-180" />
                                        <span>{t('bookingPage.prevExam', 'Previous: Examination')}</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => advanceToSection(3)}
                                        className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-black transition-all ${STEP_COLORS[2].button} active:scale-[.98]`}
                                    >
                                        <span>{t('bookingPage.nextReview', 'Next: Team & Billing')}</span>
                                        <ArrowRight size={13} className="rtl:rotate-180" />
                                    </button>
                                </div>
                            </div>
                        </StepCard>
                    </div>

                    {/* ══════════════════════════════════════════════════
                        STEP 4: Care Team, Payment & Final Review
                    ══════════════════════════════════════════════════ */}
                    <div
                        ref={sectionRefs[3]}
                        className={activeSection === 3 ? "block animate-in fade-in-50 duration-200" : "hidden"}
                    >
                        <StepCard className={STEP_COLORS[3].card} highlight={activeSection === 3}>
                            <CardHead
                                icon={CalendarCheck2}
                                stepNumber={isRtl ? '٤ / ٤' : '4 of 4'}
                                title={t('bookingPage.step4Title', 'Care Team & Billing Review')}
                                subtitle={t('bookingPage.step4Hint', 'Assign team, payment and confirm')}
                                accentClass={STEP_COLORS[3].accent}
                                right={<Opt label={t('bookingPage.optional', 'Optional')} />}
                            />

                            <div className="space-y-3.5 p-3.5 sm:p-4">
                                {/* Care Team Assignments */}
                                <div className="rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-3 space-y-2.5">
                                    <div className="flex items-center gap-1.5 border-b border-[var(--VIARA-line)] pb-2">
                                        <Users size={14} className="text-emerald-600" />
                                        <h4 className="text-xs font-black text-[var(--VIARA-ink)]">
                                            {t('booking.careTeam', 'Care Team')}
                                        </h4>
                                    </div>

                                    <div className="grid gap-2.5 sm:grid-cols-3">
                                        <div>
                                            <label className={lbl}>{t('booking.radiologist', 'Radiologist')}</label>
                                            <select {...register('radiologistId')} className={inp}>
                                                <option value="">{t('booking.unassignedRadiologist', 'Unassigned')}</option>
                                                {roleStaff.radiologists.map((m) => (
                                                    <option key={m.user_id} value={m.user_id}>
                                                        {m.full_name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className={lbl}>{t('booking.technician', 'Technician')}</label>
                                            <select {...register('technicianId')} className={inp}>
                                                <option value="">{t('booking.unassigned', 'Unassigned')}</option>
                                                {roleStaff.technicians.map((m) => (
                                                    <option key={m.user_id} value={m.user_id}>
                                                        {m.full_name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className={lbl}>{t('booking.nurse', 'Nurse')}</label>
                                            <select {...register('nurseId')} className={inp}>
                                                <option value="">{t('booking.unassigned', 'Unassigned')}</option>
                                                {roleStaff.nurses.map((m) => (
                                                    <option key={m.user_id} value={m.user_id}>
                                                        {m.full_name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Payment & Financial Method */}
                                <div className="rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-3 space-y-2.5">
                                    <div className="flex items-center justify-between border-b border-[var(--VIARA-line)] pb-2">
                                        <div className="flex items-center gap-1.5">
                                            <CreditCard size={14} className="text-emerald-600" />
                                            <h4 className="text-xs font-black text-[var(--VIARA-ink)]">
                                                {t('booking.paymentAndNotes', 'Payment & Notes')}
                                            </h4>
                                        </div>
                                        <span className="rounded-full bg-emerald-500/15 border border-emerald-300/60 dark:border-emerald-700/60 px-2 py-0.5 text-[9.5px] font-black text-emerald-800 dark:text-emerald-300">
                                            {payMethod}
                                        </span>
                                    </div>

                                    <div className="grid gap-2.5 sm:grid-cols-2">
                                        <div>
                                            <label className={lbl}>{t('booking.paymentMethod', 'Payment Method')}</label>
                                            <select {...register('paymentMethod')} className={inp}>
                                                {['Cash', 'Credit Card', 'Insurance', 'Wallet', 'Bank Transfer'].map((v) => (
                                                    <option key={v} value={v}>
                                                        {t(`booking.${v.replace(/\s+/g, '').toLowerCase()}`, v)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className={lbl}>{t('booking.amount', 'Amount')}</label>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                {...register('paymentAmount')}
                                                className={inp}
                                            />
                                        </div>
                                    </div>

                                    {/* Expandable Insurance Fields */}
                                    <div
                                        className={`grid transition-all duration-200 ${payMethod === 'Insurance'
                                            ? 'grid-rows-[1fr] opacity-100'
                                            : 'grid-rows-[0fr] opacity-0 overflow-hidden'
                                            }`}
                                    >
                                        <div className="overflow-hidden space-y-2 rounded-xl border border-teal-200/80 bg-teal-50/50 p-2.5 dark:border-teal-900/50 dark:bg-teal-950/20">
                                            <div>
                                                <label className={lbl}>{t('booking.insuranceProvider', 'Insurance Provider')}</label>
                                                <select {...register('insuranceProviderId')} className={inp}>
                                                    <option value="">{t('booking.selectProvider', 'Select provider...')}</option>
                                                    {insurers.map((p) => (
                                                        <option key={p.provider_id} value={p.provider_id}>
                                                            {p.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div>
                                                <label className={lbl}>{t('booking.approvalNumber', 'Approval #')}</label>
                                                <input
                                                    {...register('insuranceApprovalNumber')}
                                                    placeholder={t('booking.approvalNumberPlaceholder', 'Insurance approval reference')}
                                                    className={inp}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className={lbl}>{t('bookingPage.notes', 'Notes')}</label>
                                        <textarea
                                            {...register('notes')}
                                            rows={2}
                                            placeholder={t('booking.notesPlaceholder', 'Additional instructions, escort notes, or preparation reminders...')}
                                            className={`${inp} h-auto resize-none`}
                                        />
                                    </div>
                                </div>

                                {/* Step Navigation Action Footer */}
                                <div className="flex items-center justify-between border-t border-[var(--VIARA-line)] pt-2.5">
                                    <button
                                        type="button"
                                        onClick={() => goToSection(2)}
                                        className="inline-flex min-h-8.5 items-center justify-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-xs font-black text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)] transition"
                                    >
                                        <ArrowLeft size={13} className="rtl:rotate-180" />
                                        <span>{t('bookingPage.prevTiming', 'Previous: Time & Safety')}</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => goToSection(0)}
                                        className="inline-flex min-h-8.5 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 text-xs font-black text-white shadow-sm transition hover:brightness-105 active:scale-[.98]"
                                    >
                                        <CheckCircle2 size={13} />
                                        <span>{t('bookingPage.reviewFromStart', 'Review from Start')}</span>
                                    </button>
                                </div>
                            </div>
                        </StepCard>
                    </div>
                </div>

                {/* ══════════════════════════════════════════════════
                    ── RIGHT COLUMN: Pinned / Sticky Live Summary ──
                ══════════════════════════════════════════════════ */}
                <aside className="space-y-2.5 xl:sticky xl:top-[116px] xl:self-start">
                    <StepCard className="border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-[0_22px_60px_-34px_rgba(15,23,42,.45)]">
                        {/* Summary Header */}
                        <div className="border-b border-[var(--VIARA-line)] bg-gradient-to-br from-teal-500/[0.08] via-[var(--VIARA-surface)] to-cyan-500/[0.04] p-3.5 sm:p-4">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="grid h-7.5 w-7.5 place-items-center rounded-lg bg-teal-500/15 text-teal-700 dark:text-teal-300">
                                        <CalendarCheck2 size={15} strokeWidth={2.2} />
                                    </span>
                                    <div>
                                        <h3 className="text-xs font-black text-[var(--VIARA-ink)]">
                                            {t('booking.summary', 'Appointment Summary')}
                                        </h3>
                                        <p className="text-[8.5px] text-[var(--VIARA-muted)]">
                                            {t('bookingPage.liveSummary', 'Live Examination Overview')}
                                        </p>
                                    </div>
                                </div>

                                <span
                                    className={`rounded-full px-2 py-0.5 text-[8.5px] font-black border ${sectionComplete[3]
                                        ? 'border-emerald-300 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                        : 'border-amber-300 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                        }`}
                                >
                                    {sectionComplete[3]
                                        ? t('bookingPage.readyToBook', 'Ready')
                                        : t('bookingPage.needsDetails', 'Needs details')}
                                </span>
                            </div>

                            {/* Mini Step Quick Jump Indicators */}
                            <div className="mt-2.5 grid grid-cols-4 gap-1.5 border-t border-[var(--VIARA-line)] pt-2.5">
                                {[
                                    { label: isRtl ? 'المريض' : 'Patient', step: '١', ready: Boolean(patientId), target: 0 },
                                    { label: isRtl ? 'الفحص' : 'Exam', step: '٢', ready: Boolean(modalityId && examTypeId), target: 1 },
                                    { label: isRtl ? 'الموعد' : 'Slot', step: '٣', ready: hasValidSlot, target: 2 },
                                    { label: isRtl ? 'الدفع' : 'Pay', step: '٤', ready: Boolean(payMethod), target: 3 },
                                ].map((item, i) => (
                                    <button
                                        key={item.label}
                                        type="button"
                                        onClick={() => goToSection(item.target)}
                                        className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border py-1.5 px-1 text-center transition-all ${activeSection === i
                                            ? 'border-teal-500 bg-teal-500/10 text-teal-800 dark:text-teal-300 ring-2 ring-teal-500/20'
                                            : item.ready
                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] opacity-70 hover:opacity-100'
                                            }`}
                                    >
                                        <div className="flex items-center gap-1">
                                            <span className="font-mono text-[9px] font-black opacity-60">#{i + 1}</span>
                                            {item.ready ? <CheckCircle2 size={11} className="text-emerald-600 dark:text-emerald-400" /> : <AlertCircle size={11} />}
                                        </div>
                                        <span className="truncate text-[10px] font-black">{item.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Summary Detail Items with 1-Click Jump to Step */}
                        <div className="divide-y divide-[var(--VIARA-line)] text-[11px]">
                            {/* Patient */}
                            <div
                                onClick={() => goToSection(0)}
                                className="flex items-start justify-between gap-2 p-2 sm:px-3.5 hover:bg-teal-50/40 dark:hover:bg-teal-950/20 cursor-pointer transition"
                            >
                                <span className="font-semibold text-[var(--VIARA-muted)] flex items-center gap-1">
                                    <User size={11} />
                                    {t('booking.selectedPatient', 'Patient')}
                                </span>
                                <span className="font-black text-end text-[var(--VIARA-ink)] break-words">
                                    {selPt ? `${selPt.first_name} ${selPt.last_name}` : '—'}
                                </span>
                            </div>

                            {/* Room */}
                            <div
                                onClick={() => goToSection(1)}
                                className="flex items-start justify-between gap-2 p-2 sm:px-3.5 hover:bg-violet-50/40 dark:hover:bg-violet-950/20 cursor-pointer transition"
                            >
                                <span className="font-semibold text-[var(--VIARA-muted)] flex items-center gap-1">
                                    <DoorOpen size={11} />
                                    {isRtl ? 'الغرفة' : 'Room'}
                                </span>
                                <span className="font-black text-end text-[var(--VIARA-ink)]">
                                    {selRoom ? (selRoom.room_number ? `${isRtl ? 'غرفة' : 'Room'} ${selRoom.room_number} ${selRoom.name ? `(${selRoom.name})` : ''}` : selRoom.name) : (selMachine?.room_number ? `${isRtl ? 'غرفة' : 'Room'} ${selMachine.room_number}` : '—')}
                                </span>
                            </div>

                            {/* Modality Device */}
                            <div
                                onClick={() => goToSection(1)}
                                className="flex items-start justify-between gap-2 p-2 sm:px-3.5 hover:bg-violet-50/40 dark:hover:bg-violet-950/20 cursor-pointer transition"
                            >
                                <span className="font-semibold text-[var(--VIARA-muted)] flex items-center gap-1">
                                    <Layers size={11} />
                                    {t('booking.machine', 'Device')}
                                </span>
                                <span className="font-black text-end text-[var(--VIARA-ink)]">
                                    {selMachine?.name || '—'}
                                </span>
                            </div>

                            {/* Exam Type */}
                            <div
                                onClick={() => goToSection(1)}
                                className="flex items-start justify-between gap-2 p-2 sm:px-3.5 hover:bg-violet-50/40 dark:hover:bg-violet-950/20 cursor-pointer transition"
                            >
                                <span className="font-semibold text-[var(--VIARA-muted)] flex items-center gap-1">
                                    <Stethoscope size={11} />
                                    {t('booking.examination', 'Exam')}
                                </span>
                                <span className="font-black text-end text-violet-700 dark:text-violet-300 break-words">
                                    {selExam?.name || '—'}
                                </span>
                            </div>

                            {/* Date */}
                            <div
                                onClick={() => goToSection(0)}
                                className="flex items-start justify-between gap-2 p-2 sm:px-3.5 hover:bg-teal-50/40 dark:hover:bg-teal-950/20 cursor-pointer transition"
                            >
                                <span className="font-semibold text-[var(--VIARA-muted)] flex items-center gap-1">
                                    <Calendar size={11} />
                                    {t('booking.appointmentDate', 'Date')}
                                </span>
                                <span className="font-black text-end text-[var(--VIARA-ink)]">{date || '—'}</span>
                            </div>

                            {/* Time Window */}
                            <div
                                onClick={() => goToSection(2)}
                                className="flex items-start justify-between gap-2 p-2 sm:px-3.5 hover:bg-sky-50/40 dark:hover:bg-sky-950/20 cursor-pointer transition"
                            >
                                <span className="font-semibold text-[var(--VIARA-muted)] flex items-center gap-1">
                                    <Clock3 size={11} />
                                    {t('booking.startTime', 'Time')}
                                </span>
                                <span className="font-black text-end text-teal-700 dark:text-teal-300 font-mono">
                                    {fmt(slot.start)} → {fmt(slot.end)}
                                </span>
                            </div>

                            {/* Priority */}
                            <div
                                onClick={() => goToSection(1)}
                                className="flex items-start justify-between gap-2 p-2 sm:px-3.5 hover:bg-amber-50/40 dark:hover:bg-amber-950/20 cursor-pointer transition"
                            >
                                <span className="font-semibold text-[var(--VIARA-muted)] flex items-center gap-1">
                                    <Flame size={11} />
                                    {t('booking.priority', 'Priority')}
                                </span>
                                <span className="font-black text-end">
                                    <span className={`inline-block rounded px-1.5 py-0.2 text-[8.5px] font-black ${priority === 'Emergency' ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300' :
                                        priority === 'Urgent' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' :
                                            'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                        }`}>
                                        {t(`priority.${priority}`, priority)}
                                    </span>
                                </span>
                            </div>

                            {/* IV Contrast */}
                            <div
                                onClick={() => goToSection(2)}
                                className="flex items-start justify-between gap-2 p-2 sm:px-3.5 hover:bg-amber-50/40 dark:hover:bg-amber-950/20 cursor-pointer transition"
                            >
                                <span className="font-semibold text-[var(--VIARA-muted)] flex items-center gap-1">
                                    <Shield size={11} />
                                    {t('booking.contrast', 'Contrast')}
                                </span>
                                <span className="font-black text-end">
                                    {contrastRequired ? (
                                        <span className="text-amber-600 font-black">
                                            {t('bookingPage.contrastRequiredTag', '⚠️ Contrast Required')}
                                        </span>
                                    ) : (
                                        <span className="text-[var(--VIARA-muted)]">
                                            {t('bookingPage.contrastNone', 'Non-Contrast')}
                                        </span>
                                    )}
                                </span>
                            </div>

                            {/* Estimated Amount / Pricing */}
                            <div
                                onClick={() => goToSection(3)}
                                className="flex items-start justify-between gap-2 p-2 sm:px-3.5 bg-[var(--VIARA-surface-muted)]/20 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 cursor-pointer transition"
                            >
                                <span className="font-black text-[var(--VIARA-ink)] flex items-center gap-1">
                                    <DollarSign size={12} className="text-emerald-600" />
                                    {t('booking.amount', 'Amount')}
                                </span>
                                <span className="font-black text-end text-xs text-emerald-700 dark:text-emerald-300">
                                    {selectedExamPrice != null
                                        ? `${Number(selectedExamPrice).toLocaleString(isRtl ? 'ar-EG' : 'en-US')} ${t('bookingPage.currency', 'EGP')}`
                                        : '—'}
                                </span>
                            </div>

                            {/* Radiologist */}
                            <div
                                onClick={() => goToSection(3)}
                                className="flex items-start justify-between gap-2 p-2 sm:px-3.5 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 cursor-pointer transition"
                            >
                                <span className="font-semibold text-[var(--VIARA-muted)] flex items-center gap-1">
                                    <UserCheck size={11} />
                                    {t('booking.radiologist', 'Radiologist')}
                                </span>
                                <span className="font-black text-end text-[var(--VIARA-ink)] truncate max-w-36">
                                    {selRad?.full_name || t('booking.unassignedRadiologist', 'Unassigned')}
                                </span>
                            </div>

                            {/* Technician */}
                            <div
                                onClick={() => goToSection(3)}
                                className="flex items-start justify-between gap-2 p-2 sm:px-3.5 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 cursor-pointer transition"
                            >
                                <span className="font-semibold text-[var(--VIARA-muted)] flex items-center gap-1">
                                    <Users size={11} />
                                    {t('booking.technician', 'Technician')}
                                </span>
                                <span className="font-black text-end text-[var(--VIARA-ink)] truncate max-w-36">
                                    {selTech ? `${selTech.full_name} ${selTechnicianDuty?.dot || ''}` : t('booking.unassigned', 'Unassigned')}
                                </span>
                            </div>

                            {/* Nurse */}
                            <div
                                onClick={() => goToSection(3)}
                                className="flex items-start justify-between gap-2 p-2 sm:px-3.5 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 cursor-pointer transition"
                            >
                                <span className="font-semibold text-[var(--VIARA-muted)] flex items-center gap-1">
                                    <User size={11} />
                                    {t('booking.nurse', 'Nurse')}
                                </span>
                                <span className="font-black text-end text-[var(--VIARA-ink)] truncate max-w-36">
                                    {selNurse ? `${selNurse.full_name} ${selNurseDuty?.dot || ''}` : t('booking.unassigned', 'Unassigned')}
                                </span>
                            </div>
                        </div>

                        {/* Direct Submit Action Button Inside Sticky Card */}
                        <div className="p-3 border-t border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] space-y-1.5">
                            <button
                                type="submit"
                                form="book-appointment-form"
                                disabled={isSaving || isPast || Boolean(overlap)}
                                className="w-full min-h-11 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 text-[13px] font-black text-white shadow-lg shadow-teal-600/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-teal-600/20 active:translate-y-0 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                            >
                                <CalendarCheck2 size={14} />
                                <span>{isSaving ? t('booking.booking', 'Booking...') : t('booking.confirmBooking', 'Confirm Appointment')}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                disabled={isSaving}
                                className="w-full min-h-7.5 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 text-[10.5px] font-bold text-[var(--VIARA-muted)] hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50/50 transition dark:hover:bg-rose-950/20"
                            >
                                {t('booking.cancel', 'Cancel')}
                            </button>
                        </div>
                    </StepCard>
                </aside>
            </form>

            {/* ── Quick Patient Registration Inline Modal ── */}
            {showQuickPatientModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="w-full max-w-md rounded-[24px] border border-white/20 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
                            <div className="flex items-center gap-2">
                                <span className="grid h-8 w-8 place-items-center rounded-xl bg-teal-500/15 text-teal-700 dark:text-teal-300">
                                    <UserPlus size={16} />
                                </span>
                                <div>
                                    <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white">
                                        {t('bookingPage.registerPatient', 'Register New Patient')}
                                    </h3>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                        {t('bookingPage.quickRegisterHint', 'Directly register a new patient without navigating away')}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowQuickPatientModal(false)}
                                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        {quickPtMatches.length > 0 && (
                            <div className="rounded-xl border border-amber-300/80 bg-amber-50/90 p-3 text-xs text-amber-900 shadow-2xs dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
                                <div className="flex items-start gap-2">
                                    <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                                    <div className="min-w-0 flex-1">
                                        <p className="font-black text-amber-950 dark:text-amber-100">
                                            {t('register.similarPatientsFound', 'Matching existing patients found:')}
                                        </p>
                                        <div className="mt-1.5 space-y-1.5">
                                            {quickPtMatches.map((p) => (
                                                <div
                                                    key={p.patient_id}
                                                    className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white/95 p-2 shadow-2xs dark:border-amber-900/60 dark:bg-slate-900"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="truncate font-black text-slate-900 dark:text-white">
                                                            {p.first_name} {p.last_name}
                                                        </p>
                                                        <p className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                                                            <span className="font-mono text-teal-700 dark:text-teal-300">{p.mrn}</span>
                                                            {p.phone && <span>• {p.phone}</span>}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setValue('patientId', p.patient_id, { shouldDirty: true, shouldValidate: true });
                                                            setShowQuickPatientModal(false);
                                                            toast.success(t('toast.patientSelected', 'Existing patient selected!'));
                                                        }}
                                                        className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-2 py-1 text-[10px] font-black text-white shadow-xs hover:bg-teal-700"
                                                    >
                                                        <UserCheck size={11} />
                                                        <span>{t('register.useExistingPatient', 'Select')}</span>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <form onSubmit={handleQuickRegisterPatient} className="space-y-2.5">
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className={lbl}>{t('register.firstName', 'First Name')} *</label>
                                    <input
                                        required
                                        value={quickPtForm.firstName}
                                        onChange={(e) => setQuickPtForm({ ...quickPtForm, firstName: e.target.value })}
                                        placeholder={t('register.firstNamePlaceholder', 'First name')}
                                        className={inp}
                                    />
                                </div>
                                <div>
                                    <label className={lbl}>{t('register.lastName', 'Last Name')} *</label>
                                    <input
                                        required
                                        value={quickPtForm.lastName}
                                        onChange={(e) => setQuickPtForm({ ...quickPtForm, lastName: e.target.value })}
                                        placeholder={t('register.lastNamePlaceholder', 'Last name')}
                                        className={inp}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className={lbl}>{t('register.mobile', 'Phone Number')}</label>
                                    <input
                                        type="tel"
                                        value={quickPtForm.phone}
                                        onChange={(e) => setQuickPtForm({ ...quickPtForm, phone: e.target.value })}
                                        placeholder={t('register.phonePlaceholder', '01xxxxxxxxx')}
                                        className={inp}
                                    />
                                </div>
                                <div>
                                    <label className={lbl}>{t('register.gender', 'Gender')}</label>
                                    <select
                                        value={quickPtForm.gender}
                                        onChange={(e) => setQuickPtForm({ ...quickPtForm, gender: e.target.value })}
                                        className={inp}
                                    >
                                        <option value="Male">{t('register.male', 'Male')}</option>
                                        <option value="Female">{t('register.female', 'Female')}</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className={lbl}>{t('register.dob', 'Date of Birth')}</label>
                                    <input
                                        type="date"
                                        max={toDateInput()}
                                        value={quickPtForm.dateOfBirth}
                                        onChange={(e) => {
                                            const dob = e.target.value;
                                            setQuickPtForm(cur => ({ ...cur, dateOfBirth: dob }));
                                        }}
                                        className={inp}
                                    />
                                </div>
                                <div>
                                    <label className={lbl}>{t('register.age', 'Age')}</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="150"
                                        placeholder="e.g. 30"
                                        value={(() => {
                                            if (!quickPtForm.dateOfBirth) return '';
                                            const birth = new Date(quickPtForm.dateOfBirth);
                                            if (isNaN(birth.getTime())) return '';
                                            const now = new Date();
                                            let age = now.getFullYear() - birth.getFullYear();
                                            const m = now.getMonth() - birth.getMonth();
                                            if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
                                            return Math.max(0, age);
                                        })()}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (!val) {
                                                setQuickPtForm(cur => ({ ...cur, dateOfBirth: '' }));
                                                return;
                                            }
                                            const ageNum = parseInt(val, 10);
                                            if (!isNaN(ageNum) && ageNum >= 0 && ageNum <= 150) {
                                                const now = new Date();
                                                const birthYear = now.getFullYear() - ageNum;
                                                const month = String(now.getMonth() + 1).padStart(2, '0');
                                                const day = String(now.getDate()).padStart(2, '0');
                                                setQuickPtForm(cur => ({ ...cur, dateOfBirth: `${birthYear}-${month}-${day}` }));
                                            }
                                        }}
                                        className={inp}
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setShowQuickPatientModal(false)}
                                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                                >
                                    {t('booking.cancel', 'Cancel')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={isCreatingPatient}
                                    className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-1.5 text-xs font-black text-white shadow-sm hover:brightness-105"
                                >
                                    {isCreatingPatient ? t('booking.booking', 'Saving...') : t('bookingPage.registerPatient', 'Save & Select')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Post-Booking Success & Document Printing Modal ── */}
            {bookedAppointment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="w-full max-w-lg rounded-[24px] border border-white/20 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 space-y-4">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 size={24} />
                            </span>
                            <div>
                                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                    {t('bookingPage.bookingSuccess', 'Appointment Confirmed Successfully!')}
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {t('bookingPage.bookingSuccessHint', 'You can now print the patient routing sheet, clinical handover notes, receipt, or return to reception.')}
                                </p>
                            </div>
                        </div>

                        {/* Quick print document buttons */}
                        <div className="grid gap-2 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => window.open(`/print/booking-slip/${bookedAppointment.appointment_id}`, '_blank')}
                                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 p-3 text-xs font-black text-white shadow-md shadow-teal-600/20 hover:brightness-105 transition active:scale-95"
                            >
                                <FileSpreadsheet size={16} />
                                <span>{t('bookingPage.printSlip', 'Print Patient Sheet')}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => window.open(`/print/receipt/${bookedAppointment.appointment_id}`, '_blank')}
                                className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-black text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 transition active:scale-95"
                            >
                                <FileText size={16} className="text-cyan-600" />
                                <span>{t('bookingPage.printReceipt', 'Print Receipt')}</span>
                            </button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => {
                                    setBookedAppointment(null);
                                    setValue('modalityId', '');
                                    setValue('examTypeId', '');
                                    goToSection(1);
                                }}
                                className="text-xs font-bold text-teal-700 hover:text-teal-900 dark:text-teal-300 flex items-center gap-1"
                            >
                                <UserCheck size={13} />
                                <span>{t('bookingPage.bookSamePatient', 'Book Another Exam for this Patient')}</span>
                            </button>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setBookedAppointment(null);
                                        navigate('/appointments/new', { replace: true });
                                        window.location.reload();
                                    }}
                                    className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                                >
                                    {t('bookingPage.bookAnother', 'Book Another')}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => navigate('/reception', { replace: true })}
                                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 transition active:scale-95"
                                >
                                    {t('bookingPage.returnToReception', 'Return to Reception')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BookAppointment;
