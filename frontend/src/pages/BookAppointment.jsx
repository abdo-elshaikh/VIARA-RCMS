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
    Calendar,
    CalendarCheck2,
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
    RotateCcw,
    Search,
    ShieldAlert,
    ShieldCheck,
    Sparkles,
    Stethoscope,
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
    useGetAttendanceQuery,
    useGetEquipmentDowntimeQuery
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

const inp = inputClass + " min-h-10 rounded-xl px-3 py-2 text-[13px] font-semibold bg-[var(--VIARA-surface)] border-[var(--VIARA-line)] shadow-[0_1px_2px_rgba(15,23,42,.025)] transition-all duration-200 hover:border-teal-300/70 focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 disabled:cursor-not-allowed disabled:opacity-55";
const lbl = "mb-1.5 flex items-center gap-1.5 text-[10.5px] font-extrabold text-[var(--VIARA-muted)]";

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

/* ── Compact Card Wrapper ── */
const StepCard = ({ children, className = '', highlight = false }) => (
    <div className={`overflow-hidden rounded-[18px] border border-[var(--VIARA-line)]/90 bg-[var(--VIARA-surface)] shadow-[0_10px_34px_-26px_rgba(15,23,42,.45)] transition-all duration-300 ${highlight ? 'ring-1 ring-teal-500/20 shadow-[0_18px_50px_-30px_rgba(13,148,136,.35)]' : ''} ${className}`}>
        {children}
    </div>
);

const CardHead = ({ icon: Icon, title, subtitle, stepNumber, right, accentClass = 'from-teal-500 to-cyan-600' }) => (
    <div className="relative flex min-h-[58px] items-center justify-between gap-3 border-b border-[var(--VIARA-line)] bg-gradient-to-r from-[var(--VIARA-surface-muted)]/45 via-[var(--VIARA-surface)] to-[var(--VIARA-surface)] px-4 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
            <span className={`grid h-8.5 w-8.5 shrink-0 place-items-center rounded-[11px] bg-gradient-to-br ${accentClass} text-white shadow-sm`}>
                <Icon size={16} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                    {stepNumber && (
                        <span className="rounded-md border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-1.5 py-0.5 text-[9px] font-black text-[var(--VIARA-muted)]">
                            {stepNumber}
                        </span>
                    )}
                    <h3 className="truncate text-[13px] font-black text-[var(--VIARA-ink)] sm:text-sm">{title}</h3>
                </div>
                {subtitle && <p className="mt-0.5 truncate text-[10px] font-medium text-[var(--VIARA-muted)]">{subtitle}</p>}
            </div>
        </div>
        {right}
    </div>
);

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
    const [bookedAppointment, setBookedAppointment] = useState(null);
    const [timePeriodFilter, setTimePeriodFilter] = useState('all');
    const [showUnavailableSlots, setShowUnavailableSlots] = useState(false);
    const [patientPickerOpen, setPatientPickerOpen] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [advancedTab, setAdvancedTab] = useState('safety');
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
    const { data: downtimeRes = [] } = useGetEquipmentDowntimeQuery(undefined, { pollingInterval: 30000 });
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
    const activeDowntimes = useMemo(() => {
        return (Array.isArray(downtimeRes) ? downtimeRes : []).filter(r => r.status !== 'Resolved');
    }, [downtimeRes]);
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
    const selectedMachineDowntime = useMemo(() => {
        if (!modalityId) return null;
        return activeDowntimes.find((d) => String(d.modality_id) === String(modalityId));
    }, [activeDowntimes, modalityId]);
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

    const bookingReady = sectionComplete.every(Boolean);
    const bookingChecklist = useMemo(() => [
        { key: 'patient', done: Boolean(patientId && date), label: isRtl ? 'المريض والتاريخ' : 'Patient & date', target: 0 },
        { key: 'exam', done: Boolean(modalityId && examTypeId), label: isRtl ? 'الجهاز والفحص' : 'Device & exam', target: 1 },
        { key: 'slot', done: Boolean(hasValidSlot), label: isRtl ? 'وقت متاح' : 'Available time', target: 2 },
        { key: 'payment', done: Boolean(payMethod), label: isRtl ? 'طريقة الدفع' : 'Payment', target: 3 },
    ], [patientId, date, modalityId, examTypeId, hasValidSlot, payMethod, isRtl]);
    const missingChecklist = useMemo(() => bookingChecklist.filter((item) => !item.done), [bookingChecklist]);

    const visibleTimeOptions = useMemo(() => {
        if (showUnavailableSlots) return quickTimeOptions;
        return quickTimeOptions.filter((option) => option.available || option.value === time);
    }, [quickTimeOptions, showUnavailableSlots, time]);
    const availableSlotCount = useMemo(() => quickTimeOptions.filter((option) => option.available).length, [quickTimeOptions]);

    const nextAvailableSlot = useMemo(
        () => quickTimeOptions.find((option) => option.available) || null,
        [quickTimeOptions]
    );
    const useMachineCards = displayedMachines.length > 0 && displayedMachines.length <= 6;
    const useExamCards = exTypes.length > 0 && exTypes.length <= 8;
    const paymentMethods = ['Cash', 'Card', 'Credit Card', 'Insurance', 'Wallet', 'Bank Transfer'];

    const selectedExamPrice = selExam?.price ?? null;
    const selectedExamBodyPart = selExam?.body_part || null;
    const paymentMethodLabel = payMethod === 'Insurance'
        ? t('booking.insurance', 'Insurance')
        : t(`billing.methods.${payMethod}`, { defaultValue: payMethod || '—' });
    const displayDate = useMemo(() => {
        if (!date) return '—';
        const parsed = new Date(`${date}T12:00:00`);
        if (Number.isNaN(parsed.getTime())) return date;
        return parsed.toLocaleDateString(isRtl ? 'ar-EG' : undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    }, [date, isRtl]);

    const goToSection = (index) => {
        sectionRefs[index]?.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
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
                        patientId: values.patientId,
                        appointmentId: createdId,
                        examTypeId: values.examTypeId,
                        providerId: values.insuranceProviderId,
                        approvalNumber: values.insuranceApprovalNumber?.trim() || undefined,
                        // Booking can request authorization, but only an insurance
                        // reviewer may approve it from the authorization workspace.
                        requestedAmount: Number(selectedExamPrice ?? values.paymentAmount ?? 0)
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
        <div className="relative mx-auto max-w-[1500px] space-y-3 pb-28 xl:pb-7" dir={isRtl ? 'rtl' : undefined}>
            <div className="pointer-events-none absolute -top-24 start-1/2 -z-10 h-72 w-[80%] -translate-x-1/2 rounded-full bg-teal-500/[0.05] blur-3xl dark:bg-teal-400/[0.03]" />

            {/* ── Clean page heading: one title, live booking progress strip ── */}
            <PageHeader
                icon={CalendarCheck2}
                eyebrow={t('bookingPage.eyebrow', 'Scheduling Workspace')}
                eyebrowIcon={Sparkles}
                title={t('bookingPage.title', 'Book Appointment')}
                description={isRtl
                    ? 'حجز سريع وآمن مع التحقق التلقائي من التعارض وإظهار التفاصيل عند الحاجة فقط'
                    : 'Fast, safe scheduling with automatic conflict checks and details only when needed'}
                metrics={[
                    {
                        key: 'progress',
                        icon: CheckCircle2,
                        label: t('bookingPage.metricProgress', 'Booking progress'),
                        value: `${bookingProgress}%`,
                        tone: bookingReady ? 'emerald' : 'amber',
                        detail: t('bookingPage.metricProgressDetail', 'Sections completed'),
                    },
                    {
                        key: 'patient',
                        icon: Users,
                        label: t('bookingPage.metricPatient', 'Patient'),
                        value: selPt ? String(selPt.first_name + ' ' + (selPt.last_name || '')).trim() : '—',
                        tone: 'teal',
                        detail: selPt?.mrn,
                    },
                    {
                        key: 'room',
                        icon: DoorOpen,
                        label: t('bookingPage.metricRoom', 'Room & machine'),
                        value: selRoom?.room_number || selRoom?.name || '—',
                        tone: 'teal',
                        detail: selMachine?.name,
                    },
                    {
                        key: 'exam',
                        icon: Calendar,
                        label: t('bookingPage.metricExam', 'Exam'),
                        value: selExam?.name || '—',
                        tone: 'teal',
                        detail: selExam?.duration_minutes ? `${selExam.duration_minutes} min` : undefined,
                    },
                    {
                        key: 'price',
                        icon: DollarSign,
                        label: t('bookingPage.metricPrice', 'Price'),
                        value: selExam?.price != null ? Number(selExam.price).toLocaleString() : '—',
                        tone: 'teal',
                    },
                ]}
                metricsLabel={t('bookingPage.metricsLabel', 'Booking progress indicators')}
                actions={
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="inline-flex h-9.5 items-center justify-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-xs font-bold text-[var(--VIARA-muted)] shadow-sm transition hover:border-teal-300 hover:bg-teal-50/50 hover:text-teal-700 dark:hover:bg-teal-950/20"
                    >
                        <ArrowLeft size={15} className="rtl:rotate-180" />
                        <span>{isRtl ? 'العودة إلى المواعيد' : t('bookingPage.back', 'Back to appointments')}</span>
                    </button>
                }
            />

            {/* Context banners are shown only when they matter */}
            {reqWId && (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-teal-200/80 bg-teal-500/[0.07] px-3.5 py-2.5 text-xs text-teal-900 dark:border-teal-800 dark:text-teal-200">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-teal-600 text-white">
                            <Users size={14} />
                        </span>
                        <div className="min-w-0">
                            <p className="truncate font-black">{t('bookingPage.waitlistLinkedTitle', 'Booking from Waiting List')}</p>
                            <p className="truncate text-[10.5px] opacity-80">{t('bookingPage.waitlistLinkedHint', 'Confirming this appointment will automatically complete the waitlist entry.')}</p>
                        </div>
                    </div>
                    <span className="shrink-0 rounded-lg border border-teal-300/40 bg-teal-100/70 px-2 py-0.5 font-mono text-[10px] font-bold text-teal-800 dark:bg-teal-900/60 dark:text-teal-200">WL #{reqWId.slice(0, 8)}</span>
                </div>
            )}

            {isSubmitted && errorCount > 0 && (
                <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs text-rose-900 shadow-sm dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                    <AlertCircle size={17} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
                    <div>
                        <p className="font-black">{t('bookingPage.incompleteBooking', 'Complete the required booking information')}</p>
                        <p className="mt-0.5 text-[10.5px] opacity-90">{t('bookingPage.incompleteBookingHint', 'Review the highlighted fields before confirming the appointment.')}</p>
                    </div>
                </div>
            )}

            <form
                id="book-appointment-form"
                onSubmit={handleSubmit(submit)}
                className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_330px] 2xl:grid-cols-[minmax(0,1fr)_350px]"
                noValidate
            >
                {/* ═══════════════════════════════════════════════════════
                    MAIN WORKSPACE — essential booking flow only
                ═══════════════════════════════════════════════════════ */}
                <div className="min-w-0 space-y-3">
                    {/* 1. Patient + examination essentials */}
                    <div ref={sectionRefs[0]}>
                        <StepCard className="border-[var(--VIARA-line)]">
                            <CardHead
                                icon={UserRound}
                                title={isRtl ? 'بيانات الحجز الأساسية' : 'Booking essentials'}
                                subtitle={isRtl ? 'المريض، التاريخ، الجهاز والفحص في مكان واحد' : 'Patient, date, modality and exam in one place'}
                                accentClass="from-teal-500 to-cyan-600"
                                right={
                                    <button
                                        type="button"
                                        onClick={() => setShowQuickPatientModal(true)}
                                        className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-teal-300/80 bg-teal-50 px-2.5 text-[10.5px] font-black text-teal-800 transition hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
                                    >
                                        <UserPlus size={12} />
                                        <span>{isRtl ? 'مريض جديد' : t('bookingPage.newPatient', 'New Patient')}</span>
                                    </button>
                                }
                            />

                            <div className="space-y-4 p-3.5 sm:p-4">
                                <input type="hidden" {...register('patientId', { required: t('validation.patientRequired', 'Please select a patient') })} />

                                {/* Smart patient picker: search first, no duplicated select field */}
                                <div
                                    className="relative"
                                    onBlur={() => window.setTimeout(() => setPatientPickerOpen(false), 120)}
                                >
                                    <div className="mb-1.5 flex items-center justify-between gap-2">
                                        <label htmlFor="patient-search" className={lbl}>
                                            <Search size={11} className="text-teal-600" />
                                            {t('bookingPage.searchPatient', 'Search patient')} *
                                        </label>
                                        {!selPt && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-black text-amber-700 dark:text-amber-300">{isRtl ? 'مطلوب' : 'Required'}</span>}
                                    </div>

                                    {selPt && !patientPickerOpen ? (
                                        <div className="flex min-h-[58px] flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200/80 bg-gradient-to-r from-teal-500/[0.07] via-[var(--VIARA-surface)] to-emerald-500/[0.04] px-3 py-2 dark:border-teal-900/60">
                                            <div className="flex min-w-0 items-center gap-2.5">
                                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-gradient-to-br from-teal-500 to-emerald-600 text-xs font-black text-white shadow-sm">
                                                    {selPt.first_name?.[0] || 'P'}
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="truncate text-[12px] font-black text-[var(--VIARA-ink)]">{selPt.first_name} {selPt.last_name}</p>
                                                        <span className="rounded-md border border-teal-200/60 bg-white/70 px-1.5 py-0.5 font-mono text-[9px] font-bold text-teal-700 dark:border-teal-900/60 dark:bg-slate-900/50 dark:text-teal-300">{selPt.mrn || '—'}</span>
                                                    </div>
                                                    {selPt.phone && <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--VIARA-muted)]"><Phone size={9.5} />{selPt.phone}</p>}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1.5">
                                                <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2 text-[10px] font-bold text-[var(--VIARA-ink)]">
                                                    <input type="checkbox" {...register('isFollowUp')} className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                                                    <RotateCcw size={10.5} className="text-teal-600" />
                                                    <span>{isRtl ? 'متابعة' : t('bookingPage.followUp', 'Follow-up')}</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setPtSearch('');
                                                        setPatientPickerOpen(true);
                                                    }}
                                                    className="min-h-8 rounded-lg border border-teal-200 bg-teal-50 px-2.5 text-[10px] font-black text-teal-700 transition hover:bg-teal-100 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-300"
                                                >
                                                    {isRtl ? 'تغيير' : 'Change'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 shadow-sm transition focus-within:border-teal-500 focus-within:ring-4 focus-within:ring-teal-500/10">
                                                <Search size={15} className="shrink-0 text-teal-600" />
                                                <input
                                                    id="patient-search"
                                                    value={ptSearch}
                                                    onFocus={() => setPatientPickerOpen(true)}
                                                    onChange={(e) => {
                                                        setPtSearch(e.target.value);
                                                        setPatientPickerOpen(true);
                                                    }}
                                                    placeholder={isRtl ? 'اكتب الاسم أو الرقم الطبي أو رقم الهاتف...' : t('bookingPage.searchPlaceholder', 'Name, MRN or phone')}
                                                    className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-[var(--VIARA-ink)] outline-none placeholder:text-[var(--VIARA-muted)]"
                                                    autoComplete="off"
                                                />
                                                {ptSearch && (
                                                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setPtSearch('')} className="grid h-7 w-7 place-items-center rounded-lg text-[var(--VIARA-muted)] transition hover:bg-[var(--VIARA-surface-muted)] hover:text-[var(--VIARA-ink)]">
                                                        <X size={13} />
                                                    </button>
                                                )}
                                                <span className="shrink-0 rounded-lg bg-[var(--VIARA-surface-muted)] px-2 py-1 text-[9px] font-black tabular-nums text-[var(--VIARA-muted)]">{ptOpts.length}</span>
                                            </div>

                                            {patientPickerOpen && (
                                                <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-[0_18px_45px_-18px_rgba(15,23,42,.45)]">
                                                    <div className="flex items-center justify-between border-b border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/45 px-3 py-2 text-[9.5px] font-bold text-[var(--VIARA-muted)]">
                                                        <span>{ptSearch.trim() ? (isRtl ? 'نتائج البحث' : 'Search results') : (isRtl ? 'المرضى المتاحون' : 'Available patients')}</span>
                                                        <span>{Math.min(ptOpts.length, 8)} / {ptOpts.length}</span>
                                                    </div>
                                                    <div className="max-h-72 overflow-y-auto p-1.5">
                                                        {ptLoading ? (
                                                            <div className="p-4 text-center text-xs font-semibold text-[var(--VIARA-muted)]">{t('bookingPage.loadingPatients', 'Loading...')}</div>
                                                        ) : ptOpts.length ? (
                                                            ptOpts.slice(0, 8).map((p) => (
                                                                <button
                                                                    key={p.patient_id}
                                                                    type="button"
                                                                    onMouseDown={(e) => e.preventDefault()}
                                                                    onClick={() => {
                                                                        setValue('patientId', p.patient_id, { shouldValidate: true, shouldDirty: true });
                                                                        clearErrors('patientId');
                                                                        setPtSearch('');
                                                                        setPatientPickerOpen(false);
                                                                    }}
                                                                    className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-start transition hover:bg-teal-500/[0.07] focus:bg-teal-500/[0.07]"
                                                                >
                                                                    <div className="min-w-0">
                                                                        <p className="truncate text-[11.5px] font-black text-[var(--VIARA-ink)]">{p.first_name} {p.last_name}</p>
                                                                        <p className="mt-0.5 truncate text-[9.5px] font-semibold text-[var(--VIARA-muted)]">
                                                                            <span className="font-mono text-teal-700 dark:text-teal-300">{p.mrn || '—'}</span>{p.phone ? ` · ${p.phone}` : ''}
                                                                        </p>
                                                                    </div>
                                                                    <UserCheck size={13} className="shrink-0 text-teal-600" />
                                                                </button>
                                                            ))
                                                        ) : (
                                                            <div className="p-4 text-center">
                                                                <p className="text-xs font-black text-[var(--VIARA-ink)]">{isRtl ? 'لا توجد نتائج مطابقة' : t('bookingPage.noPatientsFound', 'No patients found')}</p>
                                                                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowQuickPatientModal(true)} className="mt-2 text-[10px] font-black text-teal-700 hover:underline dark:text-teal-300">{isRtl ? 'تسجيل مريض جديد' : 'Register new patient'}</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    <ErrMsg msg={errors.patientId?.message} />
                                </div>

                                {selPt && isFollowUp && (
                                    <div className="grid gap-2 rounded-xl border border-sky-200/80 bg-sky-50/55 p-3 dark:border-sky-900/60 dark:bg-sky-950/20 sm:grid-cols-[minmax(0,1fr)_minmax(220px,.8fr)]">
                                        <div>
                                            <label htmlFor="prior-exam-id" className={lbl}>{t('bookingPage.priorStudy', 'Prior study')} *</label>
                                            <select
                                                id="prior-exam-id"
                                                {...register('priorExamId', { required: isFollowUp ? t('bookingPage.priorExamRequired', 'Select the prior examination.') : false })}
                                                disabled={histLoad || !priorExams.length}
                                                className={inp}
                                            >
                                                <option value="">{histLoad ? t('bookingPage.loadingHistory', 'Loading...') : priorExams.length ? t('bookingPage.selectPriorStudy', 'Select prior study') : t('bookingPage.noPriorStudies', 'No eligible studies')}</option>
                                                {priorExams.map((e) => (
                                                    <option key={e.exam_id} value={e.exam_id}>
                                                        {new Date(e.start_time).toLocaleDateString()} — {e.exam_type_name || e.machine_name || 'Exam'}
                                                    </option>
                                                ))}
                                            </select>
                                            <ErrMsg msg={errors.priorExamId?.message} />
                                        </div>
                                        <div>
                                            <label htmlFor="follow-up-reason" className={lbl}>{t('bookingPage.followUpReason', 'Reason for Follow-up')}</label>
                                            <input id="follow-up-reason" {...register('followUpReason')} placeholder={t('bookingPage.followUpReasonHint', 'Reason for follow-up')} className={inp} />
                                        </div>
                                    </div>
                                )}

                                <div className="border-t border-[var(--VIARA-line)] pt-4" ref={sectionRefs[1]}>
                                    <div className="grid gap-3 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start">
                                        {/* Date stays compact and always visible */}
                                        <div className="rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/20 p-2.5">
                                            <label htmlFor="appointment-date" className={lbl}>
                                                <Calendar size={11} className="text-teal-600" />
                                                {t('booking.appointmentDate', 'Date')} *
                                            </label>
                                            <input id="appointment-date" type="date" min={toDateInput()} value={date} onChange={(e) => setDate(e.target.value)} className={inp} />
                                            <div className="mt-1.5 grid grid-cols-3 gap-1">
                                                {[
                                                    { label: t('bookingPage.today', 'Today'), value: dateAfter(0) },
                                                    { label: t('bookingPage.tomorrow', 'Tomorrow'), value: dateAfter(1) },
                                                    { label: t('bookingPage.inTwoDays', '+2 Days'), value: dateAfter(2) },
                                                ].map((item) => (
                                                    <button key={item.value} type="button" onClick={() => setDate(item.value)} className={`min-h-7 rounded-lg border px-1.5 text-[9px] font-black transition ${date === item.value ? 'border-teal-600 bg-teal-600 text-white shadow-sm' : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] hover:border-teal-300 hover:text-teal-700'}`}>
                                                        {item.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            {/* Device selection: card chooser for small inventories, select fallback for larger centres */}
                                            <div>
                                                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                                                    <label className={lbl}>
                                                        <Layers size={11} className="text-teal-600" />
                                                        {t('booking.machine', 'Modality / Device')} *
                                                    </label>
                                                    <div className="flex items-center gap-1.5">
                                                        {workstationConfig.hasScopeFilter && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setApplyWorkstationScope(!applyWorkstationScope)}
                                                                className={`rounded-lg border px-2 py-1 text-[8.5px] font-black transition ${applyWorkstationScope ? 'border-teal-200 bg-teal-500/10 text-teal-700 dark:border-teal-900/60 dark:text-teal-300' : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)]'}`}
                                                            >
                                                                {applyWorkstationScope ? (isRtl ? 'نطاق الشباك' : 'Desk scope') : (isRtl ? 'كل الأجهزة' : 'All devices')}
                                                            </button>
                                                        )}
                                                        <select
                                                            aria-label={isRtl ? 'الغرفة' : 'Room'}
                                                            {...register('roomId')}
                                                            value={roomId || ''}
                                                            onChange={(e) => {
                                                                const newRoomId = e.target.value;
                                                                setValue('roomId', newRoomId, { shouldDirty: true });
                                                                if (newRoomId) {
                                                                    const machinesInNewRoom = activeMachines.filter(m => String(m.room_id) === String(newRoomId));
                                                                    if (machinesInNewRoom.length === 1) {
                                                                        setValue('modalityId', machinesInNewRoom[0].modality_id, { shouldDirty: true, shouldValidate: true });
                                                                        setValue('examTypeId', '', { shouldDirty: true });
                                                                    }
                                                                }
                                                            }}
                                                            className="min-h-8 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2 text-[9.5px] font-bold text-[var(--VIARA-muted)] outline-none focus:border-teal-500"
                                                        >
                                                            <option value="">{isRtl ? 'الغرفة: تلقائي' : 'Room: auto'}</option>
                                                            {displayedRooms.map((r) => (
                                                                <option key={r.room_id || r.id} value={r.room_id || r.id}>
                                                                    {r.room_number ? `${isRtl ? 'غرفة' : 'Room'} ${r.room_number}` : r.name || '—'}{r.name && r.room_number ? ` — ${r.name}` : ''}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                <input type="hidden" {...register('modalityId', { required: t('validation.machineRequired') })} />
                                                {useMachineCards ? (
                                                    <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                                                        {displayedMachines.map((m) => {
                                                            const selected = String(modalityId) === String(m.modality_id);
                                                            return (
                                                                <button
                                                                    key={m.modality_id}
                                                                    type="button"
                                                                    aria-pressed={selected}
                                                                    onClick={() => {
                                                                        setValue('modalityId', m.modality_id, { shouldDirty: true, shouldValidate: true });
                                                                        setValue('examTypeId', '', { shouldDirty: true });
                                                                        if (m.room_id) setValue('roomId', m.room_id, { shouldDirty: true });
                                                                    }}
                                                                    className={`group flex min-h-[54px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-start transition-all ${selected ? 'border-teal-500 bg-teal-500/[0.08] ring-2 ring-teal-500/10 shadow-sm' : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] hover:border-teal-300 hover:bg-teal-500/[0.03]'}`}
                                                                >
                                                                    <div className="min-w-0">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <p className={`truncate text-[11px] font-black ${selected ? 'text-teal-800 dark:text-teal-200' : 'text-[var(--VIARA-ink)]'}`}>{m.name}</p>
                                                                            {activeDowntimes.some(d => String(d.modality_id) === String(m.modality_id)) && (
                                                                                <span className="rounded-md bg-amber-500/15 px-1 py-0.5 text-[8px] font-black text-amber-700 dark:text-amber-400">
                                                                                    {isRtl ? 'صيانة' : 'Maint'}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <p className="mt-0.5 truncate text-[8.5px] font-semibold text-[var(--VIARA-muted)]">{m.room_number || m.room_name ? `${isRtl ? 'غرفة' : 'Room'} ${m.room_number || m.room_name}` : (isRtl ? 'تحديد الغرفة تلقائيًا' : 'Room assigned automatically')}</p>
                                                                    </div>
                                                                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border ${selected ? 'border-teal-500 bg-teal-600 text-white' : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)]'}`}>
                                                                        {selected ? <CheckCircle2 size={12} /> : <Layers size={11} />}
                                                                    </span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <select
                                                        id="appointment-modality-select"
                                                        value={modalityId || ''}
                                                        onChange={(e) => {
                                                            const newMId = e.target.value;
                                                            setValue('modalityId', newMId, { shouldDirty: true, shouldValidate: true });
                                                            setValue('examTypeId', '', { shouldDirty: true });
                                                            const chosenMachine = activeMachines.find(m => String(m.modality_id) === String(newMId));
                                                            if (chosenMachine?.room_id) setValue('roomId', chosenMachine.room_id, { shouldDirty: true });
                                                        }}
                                                        className={inp}
                                                    >
                                                        <option value="">{t('booking.selectMachine', 'Select device...')}</option>
                                                        {displayedMachines.map((m) => <option key={m.modality_id} value={m.modality_id}>{m.name}{activeDowntimes.some(d => String(d.modality_id) === String(m.modality_id)) ? ` ⚠️ (${isRtl ? 'صيانة' : 'Maintenance'})` : ''}{m.room_number || m.room_name ? ` — ${isRtl ? 'غرفة' : 'Room'} ${m.room_number || m.room_name}` : ''}</option>)}
                                                    </select>
                                                )}
                                                <ErrMsg msg={errors.modalityId?.message} />
                                                {selectedMachineDowntime && (
                                                    <div className="mt-2 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50/90 p-2.5 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                                                        <AlertTriangle size={15} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                                                        <div className="min-w-0">
                                                            <p className="font-black">
                                                                {isRtl ? 'تنبيه: هذا الجهاز متوقف أو تحت الصيانة حالياً' : 'Notice: Machine currently under maintenance'}
                                                            </p>
                                                            <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                                                                {isRtl
                                                                    ? `السبب: ${selectedMachineDowntime.reason || 'صيانة دورية أو طارئة'}. يرجى التحقق من توفر الجهاز أو اختيار جهاز بديل لتجنب تعارض المواعيد.`
                                                                    : `Reason: ${selectedMachineDowntime.reason || 'Scheduled/Emergency maintenance'}. Please verify device readiness or choose another machine.`}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Exam selection uses quick choices when the list is short */}
                                            <div>
                                                <label className={lbl}>
                                                    <Stethoscope size={11} className="text-teal-600" />
                                                    {t('booking.examination', 'Exam Type')} *
                                                </label>
                                                <input type="hidden" {...register('examTypeId', { required: t('validation.examRequired') })} />
                                                {!modalityId ? (
                                                    <div className="flex min-h-10 items-center rounded-xl border border-dashed border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/25 px-3 text-[10px] font-bold text-[var(--VIARA-muted)]">
                                                        {isRtl ? 'اختر الجهاز أولًا لعرض الفحوص المتاحة' : 'Choose a device to see available examinations'}
                                                    </div>
                                                ) : useExamCards ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {exTypes.map((e) => {
                                                            const selected = String(examTypeId) === String(e.type_id);
                                                            return (
                                                                <button
                                                                    key={e.type_id}
                                                                    type="button"
                                                                    aria-pressed={selected}
                                                                    onClick={() => setValue('examTypeId', e.type_id, { shouldDirty: true, shouldValidate: true })}
                                                                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-black transition ${selected ? 'border-teal-500 bg-teal-600 text-white shadow-sm' : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-ink)] hover:border-teal-300 hover:text-teal-700'}`}
                                                                >
                                                                    {selected && <CheckCircle2 size={11} />}
                                                                    <span>{e.name}</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <select id="appointment-exam-select" value={examTypeId || ''} onChange={(e) => setValue('examTypeId', e.target.value, { shouldDirty: true, shouldValidate: true })} className={inp}>
                                                        <option value="">{t('booking.selectExam', 'Select type...')}</option>
                                                        {exTypes.map((e) => <option key={e.type_id} value={e.type_id}>{e.name}</option>)}
                                                    </select>
                                                )}
                                                <ErrMsg msg={errors.examTypeId?.message} />
                                            </div>
                                        </div>
                                    </div>

                                    {selExam && (
                                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-200/70 bg-teal-500/[0.035] px-3 py-2 dark:border-teal-900/60">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <BadgeCheck size={14} className="shrink-0 text-teal-600" />
                                                <span className="truncate text-xs font-black text-[var(--VIARA-ink)]">{selExam.name}</span>
                                                {selectedExamBodyPart && <span className="hidden text-[10px] font-semibold text-[var(--VIARA-muted)] sm:inline">• {selectedExamBodyPart}</span>}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[9.5px] font-black text-[var(--VIARA-muted)]">
                                                <span className="rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2 py-1">{duration} {t('bookingPage.minutesShort', 'min')}</span>
                                                {selectedExamPrice != null && <span className="rounded-lg border border-emerald-200/70 bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:border-emerald-900/50 dark:text-emerald-300">{Number(selectedExamPrice).toLocaleString(isRtl ? 'ar-EG' : 'en-US')} {isRtl ? 'ج.م' : t('bookingPage.currency', 'EGP')}</span>}
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                                        <div className="min-w-[260px] flex-1">
                                            <label className={lbl}><Flame size={11} className="text-amber-600" />{t('booking.priority', 'Priority')}</label>
                                            <input type="hidden" {...register('priority')} />
                                            <div className="grid grid-cols-3 gap-1 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/50 p-1">
                                                {['Routine', 'Urgent', 'Emergency'].map((value) => {
                                                    const isSel = priority === value;
                                                    return (
                                                        <button key={value} type="button" onClick={() => setValue('priority', value, { shouldDirty: true })} aria-pressed={isSel} className={`min-h-8 rounded-lg px-2 text-[11px] font-black transition-all ${isSel ? PRIORITY_TONES[value] : 'border border-transparent text-[var(--VIARA-muted)] hover:bg-[var(--VIARA-surface)] hover:text-[var(--VIARA-ink)]'}`}>
                                                            {t(`priority.${value}`, value)}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </StepCard>
                    </div>

                    {/* 2. Time slot — availability first; unavailable slots stay hidden by default */}
                    <div ref={sectionRefs[2]}>
                        <StepCard>
                            <CardHead
                                icon={Clock3}
                                title={isRtl ? 'اختيار وقت الموعد' : 'Choose appointment time'}
                                subtitle={isRtl ? 'نعرض الأوقات المتاحة أولًا ونخفي المزدحم لتقليل التشتيت' : 'Available slots are shown first; busy slots stay out of the way'}
                                accentClass="from-sky-500 to-cyan-600"
                                right={<SlotStatus isPast={isPast} overlap={overlap} modalityId={modalityId} time={time} machine={selMachine?.name} t={t} />}
                            />

                            <div className="space-y-3 p-3.5 sm:p-4">
                                <div className="flex flex-wrap items-end justify-between gap-2.5">
                                    <div className="min-w-[300px] flex-1">
                                        <div className="mb-1.5 flex items-center justify-between gap-2">
                                            <span className={lbl}>{isRtl ? 'الفترة المناسبة' : 'Preferred period'}</span>
                                            <span className="text-[9px] font-black text-emerald-700 dark:text-emerald-300">{availableSlotCount} {isRtl ? 'متاح' : 'available'}</span>
                                        </div>
                                        <div className="grid grid-cols-4 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/40 p-1">
                                            {[
                                                { id: 'all', label: isRtl ? 'الكل' : t('bookingPage.allTimes', 'All') },
                                                { id: 'morning', label: isRtl ? 'صباحًا' : t('bookingPage.morning', 'Morning') },
                                                { id: 'afternoon', label: isRtl ? 'ظهرًا' : t('bookingPage.afternoon', 'Afternoon') },
                                                { id: 'evening', label: isRtl ? 'مساءً' : t('bookingPage.evening', 'Evening') },
                                            ].map((period) => (
                                                <button key={period.id} type="button" onClick={() => setTimePeriodFilter(period.id)} className={`min-h-8 rounded-lg px-2 text-[10px] font-black transition ${timePeriodFilter === period.id ? 'bg-[var(--VIARA-surface)] text-sky-700 shadow-sm ring-1 ring-sky-500/15 dark:text-sky-300' : 'text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)]'}`}>
                                                    {period.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-end gap-1.5">
                                        {nextAvailableSlot && (
                                            <button
                                                type="button"
                                                onClick={() => setValue('time', nextAvailableSlot.value, { shouldDirty: true, shouldValidate: true })}
                                                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-300/80 bg-emerald-50 px-3 text-[10px] font-black text-emerald-800 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                                            >
                                                <Sparkles size={12} />
                                                <span>{isRtl ? 'أقرب وقت' : 'Earliest'}</span>
                                                <span dir="ltr" className="font-mono">{nextAvailableSlot.value}</span>
                                            </button>
                                        )}

                                        <div className="w-[132px]">
                                            <label htmlFor="appointment-time" className="mb-1 block text-[8.5px] font-black text-[var(--VIARA-muted)]">{isRtl ? 'وقت مخصص' : 'Custom time'}</label>
                                            <input
                                                id="appointment-time"
                                                type="time"
                                                value={time || ''}
                                                {...register('time', { required: t('validation.startTimeRequired') })}
                                                onChange={(e) => setValue('time', e.target.value, { shouldDirty: true, shouldValidate: true })}
                                                className={`${inp} min-h-10 py-1.5`}
                                            />
                                        </div>

                                        <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 text-[9.5px] font-bold text-[var(--VIARA-ink)] shadow-sm">
                                            <input type="checkbox" {...register('arrived')} className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                                            <UserCheck size={12} className="text-teal-600" />
                                            <span>{isRtl ? 'وصل' : t('bookingPage.patientArrived', 'Arrived')}</span>
                                        </label>
                                    </div>
                                </div>
                                <ErrMsg msg={errors.time?.message} />

                                <div className="rounded-xl border border-sky-200/70 bg-gradient-to-br from-sky-500/[0.045] to-transparent p-2.5 dark:border-sky-900/60">
                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--VIARA-muted)]">
                                            <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{isRtl ? 'متاح' : 'Available'}</span>
                                            {showUnavailableSlots && <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-amber-500" />{isRtl ? 'محجوز' : 'Booked'}</span>}
                                        </div>
                                        <button type="button" onClick={() => setShowUnavailableSlots((v) => !v)} className="rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 py-1 text-[9.5px] font-black text-[var(--VIARA-muted)] transition hover:text-[var(--VIARA-ink)]">
                                            {showUnavailableSlots ? (isRtl ? 'إخفاء غير المتاح' : 'Hide unavailable') : (isRtl ? 'عرض كل الأوقات' : 'Show all slots')}
                                        </button>
                                    </div>

                                    {!modalityId ? (
                                        <div className="flex min-h-20 items-center justify-center gap-2 rounded-lg border border-dashed border-sky-200 bg-[var(--VIARA-surface)]/60 px-3 text-center text-[10.5px] font-bold text-[var(--VIARA-muted)] dark:border-sky-900/60">
                                            <Layers size={13} className="text-sky-600" />
                                            <span>{isRtl ? 'اختر الجهاز أولًا لعرض الأوقات المتاحة الفعلية.' : 'Choose a device first to see real availability.'}</span>
                                        </div>
                                    ) : visibleTimeOptions.length ? (
                                        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-7 2xl:grid-cols-8" dir="ltr">
                                            {visibleTimeOptions.map((option) => {
                                                const selected = time === option.value;
                                                const blocked = option.isPast || Boolean(option.overlap);
                                                return (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        disabled={blocked}
                                                        onClick={() => setValue('time', option.value, { shouldDirty: true, shouldValidate: true })}
                                                        title={option.overlap ? (isRtl ? 'محجوز' : 'Booked') : option.isPast ? (isRtl ? 'وقت سابق' : 'Past') : (isRtl ? 'متاح' : 'Available')}
                                                        className={`relative min-h-9 rounded-lg border px-1.5 font-mono text-[10.5px] font-black transition-all ${selected
                                                            ? 'border-teal-600 bg-teal-600 text-white shadow-md shadow-teal-600/15 ring-2 ring-teal-500/15'
                                                            : option.available
                                                                ? 'border-emerald-200/90 bg-[var(--VIARA-surface)] text-emerald-700 hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-sm dark:border-emerald-900/60 dark:text-emerald-300'
                                                                : 'cursor-not-allowed border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/65 text-[var(--VIARA-muted)] opacity-45'}`}
                                                    >
                                                        {option.value}
                                                        <span className={`absolute end-1 top-1 h-1.5 w-1.5 rounded-full ${option.available ? 'bg-emerald-500' : option.overlap ? 'bg-amber-500' : 'bg-slate-400'}`} />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="flex min-h-20 items-center justify-center rounded-lg border border-dashed border-amber-200 bg-amber-50/40 px-3 text-center text-[10.5px] font-bold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
                                            {isRtl ? 'لا توجد أوقات متاحة في هذه الفترة. جرّب فترة أخرى أو يومًا آخر.' : 'No available slots in this period. Try another period or date.'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </StepCard>
                    </div>

                    {/* 3. Payment — visible because it belongs to front-desk workflow */}
                    <div ref={sectionRefs[3]}>
                        <StepCard className="border-[var(--VIARA-line)]">
                            <CardHead
                                icon={CreditCard}
                                title={isRtl ? 'الدفع والملاحظات' : 'Payment & notes'}
                                subtitle={isRtl ? 'السعر يُملأ من الفحص ويمكن تعديله عند الحاجة' : 'Price is filled from the exam and can be adjusted when needed'}
                                accentClass="from-emerald-500 to-teal-600"
                                right={<span className="rounded-full border border-emerald-300/60 bg-emerald-500/10 px-2 py-0.5 text-[9.5px] font-black text-emerald-700 dark:text-emerald-300">{paymentMethodLabel}</span>}
                            />

                            <div className="space-y-3 p-3.5 sm:p-4">
                                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-end">
                                    <div>
                                        <label className={lbl}>{t('booking.paymentMethod', { defaultValue: isRtl ? 'جهة ووسيلة السداد المتوقعة' : 'Expected payer and payment method' })}</label>
                                        <input type="hidden" {...register('paymentMethod')} />
                                        <div className="flex flex-wrap gap-1.5">
                                            {paymentMethods.map((v) => {
                                                const selected = payMethod === v;
                                                return (
                                                    <button
                                                        key={v}
                                                        type="button"
                                                        aria-pressed={selected}
                                                        onClick={() => setValue('paymentMethod', v, { shouldDirty: true })}
                                                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-black transition ${selected ? 'border-emerald-500 bg-emerald-600 text-white shadow-sm' : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] hover:border-emerald-300 hover:text-emerald-700'}`}
                                                    >
                                                        {selected && <CheckCircle2 size={11} />}
                                                        {v === 'Insurance' ? t('booking.insurance', 'Insurance / payer') : t(`billing.methods.${v}`, { defaultValue: v })}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <p className="mt-1.5 text-[10px] font-medium text-[var(--VIARA-muted)]">
                                            {t('booking.collectionNotRecorded', { defaultValue: isRtl ? 'هذا يحدد جهة ووسيلة السداد المتوقعة فقط؛ تسجيل المقبوضات يتم من مساحة التحصيل.' : 'This records the expected payer/tender only. Actual receipts are recorded in the cashier workspace.' })}
                                        </p>
                                    </div>
                                    <div>
                                        <label className={lbl}>{t('booking.amount', 'Amount')}</label>
                                        <div className="relative">
                                            <input type="number" min="0" step="0.01" {...register('paymentAmount')} className={`${inp} pe-12 text-[14px] font-black`} />
                                            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-[var(--VIARA-muted)]">{isRtl ? 'ج.م' : t('bookingPage.currency', 'EGP')}</span>
                                        </div>
                                    </div>
                                </div>

                                {payMethod === 'Insurance' && (
                                    <div className="grid gap-2.5 rounded-xl border border-teal-200/80 bg-teal-50/45 p-3 dark:border-teal-900/50 dark:bg-teal-950/20 sm:grid-cols-2">
                                        <div>
                                            <label className={lbl}>{t('booking.insuranceProvider', 'Insurance Provider')} *</label>
                                            <select {...register('insuranceProviderId')} className={inp} required>
                                                <option value="">{t('booking.selectProvider', 'Select provider...')}</option>
                                                {insurers.map((p) => <option key={p.provider_id} value={p.provider_id}>{p.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={lbl}>{t('booking.approvalNumber', 'Approval #')}</label>
                                            <input {...register('insuranceApprovalNumber')} placeholder={t('booking.approvalNumberPlaceholder', 'Insurance approval reference')} className={inp} />
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className={lbl}>{t('bookingPage.notes', 'Notes')} <Opt label={isRtl ? 'اختياري' : t('bookingPage.optional', 'Optional')} /></label>
                                    <textarea {...register('notes')} rows={1} placeholder={t('booking.notesPlaceholder', 'Additional instructions or preparation reminders...')} className={`${inp} h-auto resize-none`} />
                                </div>
                            </div>
                        </StepCard>
                    </div>

                    {/* Progressive disclosure: one compact advanced panel with tabs */}
                    <div className="overflow-hidden rounded-[18px] border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-[0_10px_34px_-28px_rgba(15,23,42,.4)]">
                        <button
                            type="button"
                            onClick={() => setAdvancedOpen((v) => !v)}
                            aria-expanded={advancedOpen}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start transition hover:bg-[var(--VIARA-surface-muted)]/35"
                        >
                            <div className="flex min-w-0 items-center gap-2.5">
                                <span className="grid h-8.5 w-8.5 shrink-0 place-items-center rounded-[11px] bg-teal-500/10 text-teal-700 dark:text-teal-300">
                                    <SlidersHorizontal size={16} />
                                </span>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-[13px] font-black text-[var(--VIARA-ink)]">{isRtl ? 'تفاصيل إضافية' : 'Additional details'}</h3>
                                        <span className="rounded-full border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/55 px-2 py-0.5 text-[9px] font-black text-[var(--VIARA-muted)]">{isRtl ? 'حسب الحاجة' : 'As needed'}</span>
                                        {contrastRequired && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-black text-amber-700 dark:text-amber-300">{isRtl ? 'السلامة تحتاج مراجعة' : 'Safety review needed'}</span>}
                                    </div>
                                    <p className="mt-0.5 truncate text-[10px] font-medium text-[var(--VIARA-muted)]">{isRtl ? 'السلامة والإحالة وفريق الرعاية — افتح فقط ما تحتاجه' : 'Safety, referral and care team — open only what you need'}</p>
                                </div>
                            </div>
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[13px] font-black text-[var(--VIARA-muted)]">{advancedOpen ? '−' : '+'}</span>
                        </button>

                        {advancedOpen && (
                            <div className="border-t border-[var(--VIARA-line)]">
                                <div className="flex gap-1 overflow-x-auto border-b border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/30 p-2.5">
                                    {[
                                        { id: 'safety', icon: ShieldCheck, label: isRtl ? 'السلامة والتحضير' : 'Safety & prep', alert: contrastRequired },
                                        { id: 'referral', icon: UserPlus, label: isRtl ? 'الإحالة والمصدر' : 'Referral & source' },
                                        { id: 'team', icon: Users, label: isRtl ? 'فريق الرعاية' : 'Care team' },
                                    ].map(({ id, icon: Icon, label, alert }) => (
                                        <button
                                            key={id}
                                            type="button"
                                            onClick={() => setAdvancedTab(id)}
                                            className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[10px] font-black transition ${advancedTab === id ? 'bg-[var(--VIARA-surface)] text-teal-700 shadow-sm ring-1 ring-teal-500/15 dark:text-teal-300' : 'text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)]'}`}
                                        >
                                            <Icon size={12} />
                                            <span>{label}</span>
                                            {alert && <i className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                                        </button>
                                    ))}
                                </div>

                                <div className="p-3.5 sm:p-4">
                                    {advancedTab === 'safety' && (
                                        <section className="space-y-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/25 px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                    <ShieldCheck size={14} className="text-teal-600" />
                                                    <div>
                                                        <p className="text-[11px] font-black text-[var(--VIARA-ink)]">{isRtl ? 'التحقق السريري قبل الفحص' : 'Pre-exam clinical clearance'}</p>
                                                        <p className="text-[9px] font-medium text-[var(--VIARA-muted)]">{isRtl ? 'حدّث فقط البنود ذات الصلة بنوع الفحص.' : 'Update only the items relevant to this study.'}</p>
                                                    </div>
                                                </div>
                                                <label className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-black ${contrastRequired ? 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300' : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)]'}`}>
                                                    <input type="checkbox" {...register('contrastRequired')} className="h-3.5 w-3.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
                                                    <AlertTriangle size={11} />
                                                    {isRtl ? 'يتطلب صبغة' : t('booking.contrastRequired', 'Contrast')}
                                                </label>
                                            </div>

                                            {contrastRequired && (
                                                <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/90 p-2.5 text-[10.5px] font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-200">
                                                    <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                                                    <span>{isRtl ? 'هذا الفحص يتطلب مراجعة متطلبات الصبغة وسلامة وظائف الكلى قبل التنفيذ.' : t('bookingPage.contrastAlertMsg', 'This examination requires IV contrast supplies.')}</span>
                                                </div>
                                            )}

                                            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                                                <div>
                                                    <label className={lbl}>{isRtl ? 'التحضير' : t('booking.preparation', 'Preparation')}</label>
                                                    <select {...register('preparationStatus')} className={inp}>{['Not Required', 'Pending', 'In Progress', 'Ready'].map((v) => <option key={v} value={v}>{t(`prepStatus.${v}`, v)}</option>)}</select>
                                                </div>
                                                {[
                                                    ['pregnancySafetyStatus', isRtl ? 'سلامة الحمل' : 'Pregnancy'],
                                                    ['implantSafetyStatus', isRtl ? 'الزرعات والأجهزة' : 'Implants'],
                                                    ['renalSafetyStatus', isRtl ? 'وظائف الكلى' : 'Renal'],
                                                ].map(([name, label]) => (
                                                    <div key={name}>
                                                        <label className={lbl}>{label}</label>
                                                        <select {...register(name)} className={inp}>{['Unknown', 'Cleared', 'At Risk', 'Not Applicable'].map((v) => <option key={v} value={v}>{t(`safety.${v}`, v)}</option>)}</select>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    )}

                                    {advancedTab === 'referral' && (
                                        <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                                            <div>
                                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                                    <label className={lbl}>{isRtl ? 'الطبيب المُحيل' : t('booking.referringDoctor', 'Referring Doctor')}</label>
                                                    <div className="flex rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/45 p-0.5">
                                                        {[
                                                            ['directory', isRtl ? 'الدليل' : t('bookingPage.directoryDoctor', 'Directory')],
                                                            ['custom', isRtl ? 'يدوي' : t('bookingPage.customDoctor', 'Custom')],
                                                        ].map(([mode, label]) => (
                                                            <button key={mode} type="button" onClick={() => setRefMode(mode)} className={`rounded-md px-2 py-0.5 text-[9px] font-black transition ${refMode === mode ? 'bg-[var(--VIARA-surface)] text-teal-700 shadow-sm dark:text-teal-300' : 'text-[var(--VIARA-muted)]'}`}>{label}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                {refMode === 'directory' ? (
                                                    <select {...register('referringDoctorId')} className={inp}>
                                                        <option value="">{isRtl ? 'بدون إحالة / حضور مباشر' : t('booking.selectFromDirectory', 'None / Walk-in')}</option>
                                                        {docs.map((d) => <option key={d.doctor_id} value={d.doctor_id}>{d.full_name}{d.specialty ? ` · ${d.specialty}` : ''}</option>)}
                                                    </select>
                                                ) : (
                                                    <input {...register('referringDoctor', { validate: (v) => refMode !== 'custom' || Boolean(v?.trim()) || t('validation.referringDoctorRequired'), maxLength: { value: 255, message: t('validation.referringDoctorTooLong') } })} placeholder={isRtl ? 'اسم الطبيب أو العيادة' : t('bookingPage.customDoctorPlaceholder', 'Doctor name or clinic')} className={inp} />
                                                )}
                                                <ErrMsg msg={errors.referringDoctor?.message} />
                                            </div>
                                            <div>
                                                <label className={lbl}>{isRtl ? 'مصدر الحجز' : t('booking.appointmentSource', 'Booking Source')}</label>
                                                <select {...register('appointmentSource')} className={inp}>
                                                    {['Walk-in', 'Phone', 'Website', 'Patient Portal', 'Doctor Portal', 'Call Center'].map((v) => <option key={v} value={v}>{t(`appointmentSources.${v}`, v)}</option>)}
                                                </select>
                                            </div>
                                        </section>
                                    )}

                                    {advancedTab === 'team' && (
                                        <section className="space-y-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <p className="text-[11px] font-black text-[var(--VIARA-ink)]">{isRtl ? 'تعيين فريق الرعاية' : t('booking.careTeam', 'Care Team')}</p>
                                                    <p className="mt-0.5 text-[9px] font-medium text-[var(--VIARA-muted)]">{isRtl ? 'اختياري أثناء الحجز ويمكن استكماله لاحقًا.' : 'Optional at booking time and can be completed later.'}</p>
                                                </div>
                                                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 py-1.5 text-[9.5px] font-bold text-[var(--VIARA-muted)]">
                                                    <input type="checkbox" checked={dutyStaffOnly} onChange={(e) => setDutyStaffOnly(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                                                    {isRtl ? 'المناوبون اليوم فقط' : 'On-duty only'}
                                                </label>
                                            </div>

                                            <div className="grid gap-2.5 sm:grid-cols-3">
                                                <div>
                                                    <label className={lbl}>{isRtl ? 'طبيب الأشعة' : t('booking.radiologist', 'Radiologist')}</label>
                                                    <select {...register('radiologistId')} className={inp}>
                                                        <option value="">{isRtl ? 'غير معيّن' : t('booking.unassignedRadiologist', 'Unassigned')}</option>
                                                        {roleStaff.radiologists.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className={lbl}>{isRtl ? 'الفني' : t('booking.technician', 'Technician')}</label>
                                                    <select {...register('technicianId')} className={inp}>
                                                        <option value="">{isRtl ? 'غير معيّن' : t('booking.unassigned', 'Unassigned')}</option>
                                                        {displayedTechnicians.map((m) => <option key={m.user_id} value={m.user_id}>{m.duty?.dot || ''} {m.full_name}{m.duty?.hasShiftToday ? ` — ${isRtl ? 'مناوب' : 'On duty'}` : ''}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className={lbl}>{isRtl ? 'التمريض' : t('booking.nurse', 'Nurse')}</label>
                                                    <select {...register('nurseId')} className={inp}>
                                                        <option value="">{isRtl ? 'غير معيّن' : t('booking.unassigned', 'Unassigned')}</option>
                                                        {displayedNurses.map((m) => <option key={m.user_id} value={m.user_id}>{m.duty?.dot || ''} {m.full_name}{m.duty?.hasShiftToday ? ` — ${isRtl ? 'مناوب' : 'On duty'}` : ''}</option>)}
                                                    </select>
                                                </div>
                                            </div>

                                            {(selTechnicianDuty?.badgeText || selNurseDuty?.badgeText) && (
                                                <div className="flex flex-wrap gap-1.5 text-[9px] font-bold text-[var(--VIARA-muted)]">
                                                    {selTechnicianDuty?.badgeText && <span className={`rounded-lg border px-2 py-1 ${selTechnicianDuty.statusClass}`}>{isRtl ? 'الفني: ' : 'Technician: '}{selTechnicianDuty.badgeText}</span>}
                                                    {selNurseDuty?.badgeText && <span className={`rounded-lg border px-2 py-1 ${selNurseDuty.statusClass}`}>{isRtl ? 'التمريض: ' : 'Nurse: '}{selNurseDuty.badgeText}</span>}
                                                </div>
                                            )}
                                        </section>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════
                    STICKY SUMMARY — one summary, one primary action
                ═══════════════════════════════════════════════════════ */}
                <aside className="space-y-2.5 xl:sticky xl:top-3 xl:self-start">
                    <StepCard className="shadow-[0_18px_55px_-34px_rgba(15,23,42,.55)]">
                        <div className="border-b border-[var(--VIARA-line)] bg-gradient-to-br from-teal-500/[0.075] via-[var(--VIARA-surface)] to-emerald-500/[0.025] p-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <span className="grid h-8.5 w-8.5 shrink-0 place-items-center rounded-[11px] bg-teal-600 text-white shadow-sm"><CalendarCheck2 size={16} /></span>
                                    <div className="min-w-0">
                                        <h3 className="text-[12.5px] font-black text-[var(--VIARA-ink)]">{isRtl ? 'ملخص الحجز' : t('booking.summary', 'Appointment summary')}</h3>
                                        <p className="mt-0.5 text-[9px] font-semibold text-[var(--VIARA-muted)]">{bookingReady ? (isRtl ? 'البيانات الأساسية مكتملة وجاهزة للتأكيد' : 'Essentials complete and ready to confirm') : (isRtl ? 'أكمل البنود المطلوبة أدناه' : 'Complete the required items below')}</p>
                                    </div>
                                </div>
                                <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black ${bookingReady ? 'border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-amber-300 bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>
                                    {bookingReady ? (isRtl ? 'جاهز' : 'Ready') : `${sectionComplete.filter(Boolean).length}/4`}
                                </span>
                            </div>

                            <div className="mt-2.5 flex items-center gap-2">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--VIARA-surface-muted)]">
                                    <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-[width] duration-300" style={{ width: `${bookingProgress}%` }} />
                                </div>
                                <span className="text-[9px] font-black tabular-nums text-[var(--VIARA-muted)]">{bookingProgress}%</span>
                            </div>
                        </div>

                        {!bookingReady && (
                            <div className="border-b border-[var(--VIARA-line)] bg-amber-500/[0.035] p-2.5">
                                <p className="mb-1.5 text-[9px] font-black text-amber-800 dark:text-amber-300">{isRtl ? 'المطلوب قبل التأكيد' : 'Required before confirmation'}</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {missingChecklist.map((item) => (
                                        <button key={item.key} type="button" onClick={() => goToSection(item.target)} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-[var(--VIARA-surface)] px-2 py-1 text-[9px] font-black text-amber-800 transition hover:border-amber-400 dark:border-amber-900/60 dark:text-amber-300">
                                            <AlertCircle size={10} />
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="space-y-2 p-2.5">
                            <div className="grid grid-cols-2 gap-1.5">
                                <button type="button" onClick={() => goToSection(0)} className={`min-w-0 rounded-xl border p-2.5 text-start transition ${selPt ? 'border-teal-200/80 bg-teal-500/[0.04] dark:border-teal-900/60' : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/25 hover:border-teal-300'}`}>
                                    <div className="flex items-center justify-between gap-1"><span className="flex items-center gap-1 text-[8.5px] font-bold text-[var(--VIARA-muted)]"><User size={10} />{isRtl ? 'المريض' : 'Patient'}</span>{selPt && <CheckCircle2 size={10} className="text-emerald-600" />}</div>
                                    <p className={`mt-1 truncate text-[10.5px] font-black ${selPt ? 'text-[var(--VIARA-ink)]' : 'text-[var(--VIARA-muted)]'}`}>{selPt ? `${selPt.first_name} ${selPt.last_name}` : (isRtl ? 'غير محدد' : 'Not selected')}</p>
                                    <p className="mt-0.5 truncate font-mono text-[8.5px] font-bold text-teal-700 dark:text-teal-300">{selPt?.mrn || '—'}</p>
                                </button>

                                <button type="button" onClick={() => goToSection(1)} className={`min-w-0 rounded-xl border p-2.5 text-start transition ${selExam ? 'border-sky-200/80 bg-sky-500/[0.035] dark:border-sky-900/60' : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/25 hover:border-sky-300'}`}>
                                    <div className="flex items-center justify-between gap-1"><span className="flex items-center gap-1 text-[8.5px] font-bold text-[var(--VIARA-muted)]"><Stethoscope size={10} />{isRtl ? 'الفحص' : 'Exam'}</span>{selExam && <CheckCircle2 size={10} className="text-emerald-600" />}</div>
                                    <p className={`mt-1 truncate text-[10.5px] font-black ${selExam ? 'text-[var(--VIARA-ink)]' : 'text-[var(--VIARA-muted)]'}`}>{selExam?.name || (isRtl ? 'غير محدد' : 'Not selected')}</p>
                                    <p className="mt-0.5 truncate text-[8.5px] font-semibold text-[var(--VIARA-muted)]">{selMachine?.name || '—'}</p>
                                </button>

                                <button type="button" onClick={() => goToSection(2)} className={`min-w-0 rounded-xl border p-2.5 text-start transition ${hasValidSlot ? 'border-emerald-200/80 bg-emerald-500/[0.04] dark:border-emerald-900/60' : isPast || overlap ? 'border-amber-300 bg-amber-50/55 dark:border-amber-900/60 dark:bg-amber-950/20' : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/25 hover:border-emerald-300'}`}>
                                    <div className="flex items-center justify-between gap-1"><span className="flex items-center gap-1 text-[8.5px] font-bold text-[var(--VIARA-muted)]"><Calendar size={10} />{isRtl ? 'الموعد' : 'Appointment'}</span>{hasValidSlot && <CheckCircle2 size={10} className="text-emerald-600" />}</div>
                                    <p className="mt-1 truncate text-[10px] font-black text-[var(--VIARA-ink)]">{displayDate}</p>
                                    <p dir="ltr" className={`mt-0.5 truncate font-mono text-[8.5px] font-black ${hasValidSlot ? 'text-teal-700 dark:text-teal-300' : 'text-[var(--VIARA-muted)]'}`}>{slot.start ? `${fmt(slot.start)} – ${fmt(slot.end)}` : '—'}</p>
                                </button>

                                <button type="button" onClick={() => goToSection(3)} className="min-w-0 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/20 p-2.5 text-start transition hover:border-emerald-300">
                                    <div className="flex items-center justify-between gap-1"><span className="flex items-center gap-1 text-[8.5px] font-bold text-[var(--VIARA-muted)]"><CreditCard size={10} />{isRtl ? 'الدفع' : 'Payment'}</span><span className={`rounded px-1.5 py-0.5 text-[8px] font-black ${priority === 'Emergency' ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300' : priority === 'Urgent' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'}`}>{t(`priority.${priority}`, priority)}</span></div>
                                    <p className="mt-1 truncate text-[10.5px] font-black text-[var(--VIARA-ink)]">{paymentMethodLabel}</p>
                                    <p className="mt-0.5 truncate text-[8.5px] font-semibold text-[var(--VIARA-muted)]">{selRoom ? `${isRtl ? 'غرفة' : 'Room'} ${selRoom.room_number || selRoom.name || '—'}` : (isRtl ? 'الغرفة تلقائيًا' : 'Room automatic')}</p>
                                </button>
                            </div>

                            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200/70 bg-emerald-500/[0.05] px-3 py-2.5 dark:border-emerald-900/60">
                                <div>
                                    <p className="text-[8.5px] font-bold text-[var(--VIARA-muted)]">{isRtl ? 'المبلغ المتوقع' : t('booking.amount', 'Amount')}</p>
                                    <p className="mt-0.5 text-[13px] font-black text-emerald-700 dark:text-emerald-300">
                                        {(paymentAmount !== undefined && paymentAmount !== '' ? Number(paymentAmount) : selectedExamPrice != null ? Number(selectedExamPrice) : null) != null
                                            ? `${Number(paymentAmount !== undefined && paymentAmount !== '' ? paymentAmount : selectedExamPrice).toLocaleString(isRtl ? 'ar-EG' : 'en-US')} ${isRtl ? 'ج.م' : t('bookingPage.currency', 'EGP')}`
                                            : '—'}
                                    </p>
                                </div>
                                <div className="text-end">
                                    <p className="text-[8.5px] font-bold text-[var(--VIARA-muted)]">{isRtl ? 'مدة الفحص' : 'Exam duration'}</p>
                                    <p className="mt-0.5 text-[11px] font-black text-[var(--VIARA-ink)]">{selExam ? `${duration} ${isRtl ? 'دقيقة' : 'min'}` : '—'}</p>
                                </div>
                            </div>
                        </div>

                        {(isPast || overlap) && (
                            <div className="mx-2.5 mb-2.5 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-[10px] font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-200">
                                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                                <span>{overlap ? (isRtl ? 'هذا الوقت محجوز. اختر وقتًا آخر.' : 'This slot is already booked. Choose another time.') : (isRtl ? 'هذا الوقت أصبح في الماضي.' : 'This time is now in the past.')}</span>
                            </div>
                        )}

                        <div className="space-y-1.5 border-t border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)]/20 p-2.5">
                            <button
                                type="submit"
                                title={isRtl ? 'اختصار لوحة المفاتيح: Ctrl + Enter' : 'Keyboard shortcut: Ctrl + Enter'}
                                disabled={isSaving || !bookingReady}
                                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 text-[12.5px] font-black text-white shadow-md shadow-teal-600/15 transition-all hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                            >
                                {isSaving ? <Activity size={15} className="animate-spin" /> : <CalendarCheck2 size={15} />}
                                <span>{isSaving ? t('booking.booking', 'Booking...') : (isRtl ? 'تأكيد الحجز' : t('booking.confirmBooking', 'Confirm Appointment'))}</span>
                            </button>
                            <button type="button" onClick={() => navigate(-1)} disabled={isSaving} className="min-h-8 w-full rounded-lg px-2.5 text-[10px] font-bold text-[var(--VIARA-muted)] transition hover:bg-rose-50/60 hover:text-rose-600 dark:hover:bg-rose-950/20">
                                {isRtl ? 'إلغاء' : t('booking.cancel', 'Cancel')}
                            </button>
                        </div>
                    </StepCard>
                </aside>
            </form>

            {/* Mobile / tablet primary action stays reachable without duplicating the whole summary */}
            <div className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)]/95 p-2.5 shadow-2xl backdrop-blur-xl xl:hidden">
                <div className="min-w-0 flex-1 ps-1">
                    <p className="truncate text-[10px] font-bold text-[var(--VIARA-muted)]">{selExam?.name || (isRtl ? 'اختر الفحص والموعد' : 'Choose exam and time')}</p>
                    <p className="text-xs font-black text-[var(--VIARA-ink)]">{slot.start ? <><span>{displayDate}</span><span dir="ltr" className="ms-1">· {fmt(slot.start)}</span></> : (isRtl ? 'الحجز غير مكتمل' : 'Booking incomplete')}</p>
                </div>
                <button
                    type="submit"
                    form="book-appointment-form"
                    disabled={isSaving || !bookingReady}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 text-xs font-black text-white shadow-md disabled:opacity-40"
                >
                    <CalendarCheck2 size={14} />
                    <span>{isSaving ? t('booking.booking', 'Booking...') : t('booking.confirmBooking', 'Confirm')}</span>
                </button>
            </div>

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
