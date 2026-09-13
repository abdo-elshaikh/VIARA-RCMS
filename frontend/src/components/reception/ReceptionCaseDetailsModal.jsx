import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/authSlice';
import {
    X,
    User,
    Calendar,
    Clock,
    CreditCard,
    AlertTriangle,
    Tag,
    FileText,
    ClipboardList,
    CheckCircle2,
    Activity,
    UsersRound,
    Stethoscope,
    ScanLine,
    UserCheck,
    Edit3,
    CalendarClock,
    Save,
    RotateCcw,
    Sparkles,
    Shield,
    Lock,
    DoorOpen,
    Phone,
    Building2,
    Info,
    AlertCircle,
    Hash,
    BadgePercent,
    SlidersHorizontal,
    BadgeCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import PriorityBadge from '../ui/PriorityBadge';
import { formatDuration } from '../../utils/dateFormat';
import { toLocalDateInput, getInvoiceCoverageCategory } from './receptionLogic';
import { getErrorMessage } from '../../utils/getErrorMessage';
import {
    useUpdateAppointmentMutation,
    useGetStaffQuery,
    useGetMachinesQuery,
    useGetExamTypesQuery,
    useGetRoomsQuery,
    useGetShiftsQuery,
    useGetAttendanceQuery
} from '../../store/api';

const STAGE_ORDER = [
    'Scheduled',
    'Arrived',
    'Payment Pending',
    'Prep Pending',
    'Ready for Exam',
    'In Exam',
    'Reporting',
    'Finalized',
    'Delivered'
];

// Stages strictly allowed before transfer to nursing
const EDITABLE_STAGES = ['Scheduled', 'Arrived', 'Payment Pending'];

const ReceptionCaseDetailsModal = ({
    isOpen,
    onClose,
    caseData,
    caseItem,
    t = (k, opts) => opts?.defaultValue || (typeof opts === 'string' ? opts : k),
    i18n,
    createAppointmentInvoice,
    canCreateInvoices,
    onOpenPayment,
    onMove,
    print,
    onUpdateAppointment,
    initialEditMode = false,
    locale: propLocale,
    workstationDesk,
    workstationScope,
    workstationRooms,
    workstationModalities
}) => {
    const activeCase = caseData || caseItem;

    const appointment = activeCase?.appointment;
    const queue = activeCase?.queue;
    const invoice = activeCase?.invoice;

    const stage = queue?.queue_stage || appointment?.queue_stage || 'Scheduled';
    const isCancelledOrCompleted = ['Cancelled', 'Completed'].includes(appointment?.status);

    // Business constraint: Editing is ONLY permitted before transfer to nursing ('Prep Pending' and beyond)
    const canEditBooking = EDITABLE_STAGES.includes(stage) && !isCancelledOrCompleted;

    const [isEditing, setIsEditing] = useState(canEditBooking && initialEditMode);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const currentUser = useSelector(selectCurrentUser);

    // Queries for editing options
    const { data: staffList = [] } = useGetStaffQuery();
    const { data: machinesData = [] } = useGetMachinesQuery();
    const { data: examTypesData = [] } = useGetExamTypesQuery();
    const { data: roomsData = [] } = useGetRoomsQuery();
    const [updateAppointmentMutation, { isLoading: isMutating }] = useUpdateAppointmentMutation();

    const machines = useMemo(() => (Array.isArray(machinesData) ? machinesData : machinesData?.data || []), [machinesData]);
    const examTypes = useMemo(() => (Array.isArray(examTypesData) ? examTypesData : examTypesData?.data || []), [examTypesData]);
    const staff = useMemo(() => (Array.isArray(staffList) ? staffList : staffList?.data || []), [staffList]);
    const rooms = useMemo(() => (Array.isArray(roomsData) ? roomsData : roomsData?.data || []), [roomsData]);

    const nurses = staff.filter((s) => s.role === 'Nurse');
    const technicians = staff.filter((s) => s.role === 'Technician');
    const radiologists = staff.filter((s) => s.role === 'Radiologist');

    const isRtl = i18n?.language?.startsWith('ar') || propLocale?.startsWith('ar');
    const locale = isRtl ? 'ar-EG' : 'en-US';

    // Workstation configuration detection
    const workstationConfig = useMemo(() => {
        if (workstationDesk || (workstationRooms && workstationRooms.length > 0) || (workstationModalities && workstationModalities.length > 0)) {
            return {
                desk: workstationDesk || '',
                scope: workstationScope || 'all',
                rooms: Array.isArray(workstationRooms) ? workstationRooms : [],
                modalities: Array.isArray(workstationModalities) ? workstationModalities : []
            };
        }
        try {
            const raw = localStorage.getItem(`viara_reception_workspace:${currentUser?.user_id || 'anonymous'}`);
            if (raw) {
                const parsed = JSON.parse(raw);
                return {
                    desk: parsed.desk || localStorage.getItem('viara_reception_desk') || '',
                    scope: parsed.scope || 'all',
                    rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
                    modalities: Array.isArray(parsed.modalities) ? parsed.modalities : []
                };
            }
        } catch {
            // Malformed persisted workstation profile: fall through to defaults.
        }
        return { desk: '', scope: 'all', rooms: [], modalities: [] };
    }, [workstationDesk, workstationScope, workstationRooms, workstationModalities, currentUser?.user_id]);

    const hasWorkstationFilter = useMemo(() => {
        return Boolean(
            (workstationConfig.rooms && workstationConfig.rooms.length > 0) ||
            (workstationConfig.modalities && workstationConfig.modalities.length > 0) ||
            (workstationConfig.desk && workstationConfig.desk !== 'Main Desk')
        );
    }, [workstationConfig]);

    const [applyWorkstationScope, setApplyWorkstationScope] = useState(true);
    const [dutyStaffOnly, setDutyStaffOnly] = useState(false);

    // Form state for editing booking
    const [editForm, setEditForm] = useState({
        date: '',
        time: '',
        roomId: '',
        modalityId: '',
        examTypeId: '',
        priority: 'Routine',
        nurseId: '',
        technicianId: '',
        radiologistId: '',
        contrastRequired: false,
        clinicalIndication: '',
        notes: '',
        assignmentReason: 'تعديل جدول وتوزيع المهام السريرية'
    });

    const appointmentDateStr = editForm.date || (appointment?.start_time ? toLocalDateInput(new Date(appointment.start_time)) : toLocalDateInput());
    const { data: shiftsData = [] } = useGetShiftsQuery({ date: appointmentDateStr }, { skip: !appointmentDateStr });
    const { data: attendanceData = [] } = useGetAttendanceQuery({ date: appointmentDateStr }, { skip: !appointmentDateStr });

    const dayShifts = useMemo(() => (Array.isArray(shiftsData) ? shiftsData : shiftsData?.data || []), [shiftsData]);
    const dayAttendance = useMemo(() => (Array.isArray(attendanceData) ? attendanceData : attendanceData?.data || []), [attendanceData]);

    useEffect(() => {
        if (canEditBooking) {
            setIsEditing(initialEditMode);
        } else {
            setIsEditing(false);
        }
    }, [initialEditMode, isOpen, canEditBooking]);

    useEffect(() => {
        if (activeCase) {
            const startStr = appointment?.start_time || queue?.start_time;
            const startDate = startStr ? new Date(startStr) : new Date();
            const dateStr = startStr ? toLocalDateInput(startDate) : toLocalDateInput();
            const timeStr = startStr && !Number.isNaN(startDate.getTime())
                ? startDate.toTimeString().slice(0, 5)
                : '09:00';

            const initialModalityId = appointment?.modality_id || queue?.modality_id || '';
            const matchedMachine = machines.find((m) => (m.modality_id || m.id) === initialModalityId);
            const initialRoomId = appointment?.room_id || queue?.room_id || matchedMachine?.room_id || '';

            setEditForm({
                date: dateStr,
                time: timeStr,
                roomId: initialRoomId,
                modalityId: initialModalityId,
                examTypeId: appointment?.exam_type_id || queue?.exam_type_id || '',
                priority: appointment?.priority || queue?.priority || 'Routine',
                nurseId: appointment?.nurse_id || queue?.nurse_id || '',
                technicianId: appointment?.technician_id || queue?.technician_id || '',
                radiologistId: appointment?.radiologist_id || appointment?.performing_radiologist_id || queue?.radiologist_id || '',
                contrastRequired: Boolean(appointment?.contrast_required ?? queue?.contrast_required),
                clinicalIndication: appointment?.clinical_indication || queue?.clinical_indication || '',
                notes: appointment?.notes || queue?.notes || '',
                assignmentReason: 'تعديل جدول وتوزيع المهام السريرية'
            });
        }
    }, [activeCase, appointment, queue, machines]);

    const selRoom = useMemo(() => {
        return rooms.find((r) => String(r.room_id || r.id) === String(editForm.roomId) || String(r.room_number) === String(editForm.roomId));
    }, [rooms, editForm.roomId]);

    const selMachine = useMemo(() => {
        return machines.find((m) => (m.modality_id || m.id) === editForm.modalityId);
    }, [machines, editForm.modalityId]);

    const displayedRooms = useMemo(() => {
        let list = rooms.filter((r) => r.status !== 'Inactive');
        if (applyWorkstationScope && workstationConfig.rooms && workstationConfig.rooms.length > 0) {
            const scoped = list.filter((r) => workstationConfig.rooms.includes(r.room_id || r.id) || workstationConfig.rooms.includes(r.room_number));
            if (scoped.length > 0) return scoped;
        }
        return list;
    }, [rooms, applyWorkstationScope, workstationConfig]);

    const displayedMachines = useMemo(() => {
        let list = machines.filter((m) => m.status !== 'Inactive');
        if (editForm.roomId) {
            const byRoom = list.filter((m) => String(m.room_id) === String(editForm.roomId) || (selRoom && String(m.room_number) === String(selRoom.room_number)));
            if (byRoom.length > 0) return byRoom;
        }
        if (applyWorkstationScope && workstationConfig.modalities && workstationConfig.modalities.length > 0) {
            const scoped = list.filter((m) => workstationConfig.modalities.includes(m.modality_id || m.id) || workstationConfig.modalities.includes(m.type || m.modality_type));
            if (scoped.length > 0) return scoped;
        }
        return list;
    }, [machines, editForm.roomId, selRoom, applyWorkstationScope, workstationConfig]);

    const getStaffDutyInfo = useCallback((staffUserId) => {
        if (!staffUserId) return null;
        const userShifts = dayShifts.filter((s) => String(s.user_id) === String(staffUserId));
        const userAtt = dayAttendance.find((a) => String(a.user_id) === String(staffUserId));

        const isPresent = Boolean(userAtt && userAtt.clock_in && !userAtt.clock_out && userAtt.status !== 'Absent');
        const isLate = userAtt?.status === 'Late';
        const hasShiftToday = userShifts.length > 0;
        const currentShift = userShifts[0] || null;
        const isRoomAssigned = Boolean(editForm.roomId && userShifts.some((s) => String(s.room_id) === String(editForm.roomId)));

        let isTimeSlotMatch = false;
        if (editForm.time && currentShift?.start_time && currentShift?.end_time) {
            try {
                const shiftStartH = new Date(currentShift.start_time).toTimeString().substring(0, 5);
                const shiftEndH = new Date(currentShift.end_time).toTimeString().substring(0, 5);
                isTimeSlotMatch = editForm.time >= shiftStartH && editForm.time <= shiftEndH;
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
    }, [dayShifts, dayAttendance, editForm.roomId, editForm.time, isRtl]);

    const classifiedTechnicians = useMemo(() => {
        return technicians
            .map((tc) => ({ ...tc, duty: getStaffDutyInfo(tc.user_id || tc.id) }))
            .sort((a, b) => (a.duty?.rank || 99) - (b.duty?.rank || 99));
    }, [technicians, getStaffDutyInfo]);

    const classifiedNurses = useMemo(() => {
        return nurses
            .map((n) => ({ ...n, duty: getStaffDutyInfo(n.user_id || n.id) }))
            .sort((a, b) => (a.duty?.rank || 99) - (b.duty?.rank || 99));
    }, [nurses, getStaffDutyInfo]);

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

    const selTechnicianDuty = useMemo(() => getStaffDutyInfo(editForm.technicianId), [editForm.technicianId, getStaffDutyInfo]);
    const selNurseDuty = useMemo(() => getStaffDutyInfo(editForm.nurseId), [editForm.nurseId, getStaffDutyInfo]);
    const currentAssignedTechDuty = useMemo(() => getStaffDutyInfo(appointment?.technician_id || queue?.technician_id), [appointment?.technician_id, queue?.technician_id, getStaffDutyInfo]);
    const currentAssignedNurseDuty = useMemo(() => getStaffDutyInfo(appointment?.nurse_id || queue?.nurse_id), [appointment?.nurse_id, queue?.nurse_id, getStaffDutyInfo]);

    if (!isOpen || !activeCase) return null;

    // Rich patient details
    const patientName = appointment?.patient_name || queue?.patient_name || t('table.patientFallback', { defaultValue: 'مريض' });
    const mrn = appointment?.mrn || queue?.mrn || '-';
    const phone = appointment?.patient_phone || appointment?.phone || queue?.patient_phone || queue?.phone;
    const gender = appointment?.patient_gender || appointment?.gender || queue?.patient_gender;
    const age = appointment?.patient_age || appointment?.age || queue?.patient_age;
    const priority = appointment?.priority || queue?.priority || 'Routine';
    const orderNumber = appointment?.order_number || queue?.order_number;

    // Rich Exam & Modality details
    const examName = appointment?.exam_type_name || queue?.exam_type_name || t('table.noExamType', { defaultValue: 'فحص' });
    const machineName = appointment?.machine_name || queue?.machine_name || queue?.modality_name || '-';
    const modalityType = appointment?.modality_type || queue?.modality_type || '';
    const roomName = appointment?.room_name || queue?.room_name || (appointment?.room_number ? `غرفة ${appointment.room_number}` : '-');
    const roomNumber = appointment?.room_number || queue?.room_number;
    const roomStatus = appointment?.room_status || 'Active';
    const machineStatus = appointment?.machine_status || 'Active';
    const bodyPart = appointment?.exam_type_body_part || appointment?.body_part;
    const contrastRequired = Boolean(appointment?.contrast_required || queue?.contrast_required || invoice?.contrast_required);
    const fastingRequired = Boolean(appointment?.fasting_required ?? queue?.fasting_required);
    const fastingHours = appointment?.fasting_hours || 6;
    const prepInstructions = appointment?.preparation_instructions || queue?.preparation_instructions;

    // Timing & Origin
    const appointmentTime = appointment?.start_time ? new Date(appointment.start_time).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '-';
    const appointmentDate = appointment?.start_time ? new Date(appointment.start_time).toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' }) : '-';
    const durationMinutes = (appointment?.start_time && appointment?.end_time)
        ? Math.max(10, Math.round((new Date(appointment.end_time) - new Date(appointment.start_time)) / 60000))
        : 30;
    const createdByName = appointment?.created_by_name;
    const appointmentSource = appointment?.appointment_source;
    const waitingMinutes = queue?.waiting_minutes || 0;
    const isOverdue = queue?.is_overdue;
    const notes = appointment?.notes || queue?.notes;
    const clinicalIndication = appointment?.clinical_indication || queue?.clinical_indication;

    // Assigned staff members
    const nurseName = appointment?.nurse_name || queue?.nurse_name;
    const technicianName = appointment?.technician_name || queue?.technician_name;
    const radiologistName = appointment?.radiologist_name || queue?.radiologist_name;
    const receptionistName = appointment?.receptionist_name || queue?.receptionist_name;
    const referringDoctorName = appointment?.referring_doctor_name || appointment?.referring_doctor;

    // Financial & Coverage Category
    const hasInvoice = Boolean(invoice);
    const coverage = getInvoiceCoverageCategory(invoice);
    const totalAmount = Number(invoice?.total_amount || 0);
    const paidAmount = Number(invoice?.paid_amount || 0);
    const balanceAmount = Number(invoice?.balance_amount || 0);

    const stageLabel = (s) => t(`queue.stages.${s}`, { defaultValue: s });
    const canCreate = canCreateInvoices !== undefined ? canCreateInvoices : Boolean(createAppointmentInvoice);

    const handlePrint = (type) => {
        if (print) {
            print(activeCase, type);
            return;
        }
        const apptId = appointment?.appointment_id || queue?.appointment_id;
        if (!apptId) return;
        if (type === 'sticker') {
            window.open(`/print/sticker/${apptId}?copies=1`, '_blank');
        } else if (type === 'slip') {
            window.open(`/print/booking-slip/${apptId}`, '_blank');
        } else {
            window.open(`/print/receipt/${apptId}`, '_blank');
        }
    };

    const handleSaveEdit = async (e) => {
        e?.preventDefault();

        // Enforce the rule: cannot edit after transfer to nursing
        if (!canEditBooking) {
            toast.error(t('details.cannotEditAfterNursing', { defaultValue: 'لا يمكن تعديل بيانات الحجز بعد تحويل الحالة للتمريض أو بدء التجهيز السريري' }));
            setIsEditing(false);
            return;
        }

        const apptId = appointment?.appointment_id || queue?.appointment_id;
        if (!apptId) {
            toast.error(t('details.editFailed', { defaultValue: 'معرف الموعد غير متوفر' }));
            return;
        }

        try {
            setIsSubmitting(true);
            const start = new Date(`${editForm.date}T${editForm.time}:00`);
            const durationMins = durationMinutes || 30;
            const end = new Date(start.getTime() + durationMins * 60000);

            const payload = {
                id: apptId,
                startTime: start.toISOString(),
                endTime: end.toISOString(),
                priority: editForm.priority,
                roomId: editForm.roomId || undefined,
                modalityId: editForm.modalityId || undefined,
                examTypeId: editForm.examTypeId || undefined,
                contrastRequired: Boolean(editForm.contrastRequired),
                clinicalIndication: editForm.clinicalIndication || undefined,
                notes: editForm.notes || undefined,
                nurseId: editForm.nurseId || null,
                technicianId: editForm.technicianId || null,
                radiologistId: editForm.radiologistId || null,
            };

            const hadPriorStaff = Boolean(appointment?.nurse_id || appointment?.technician_id || appointment?.radiologist_id);
            const staffChanged = (
                (editForm.nurseId || '') !== (appointment?.nurse_id || '') ||
                (editForm.technicianId || '') !== (appointment?.technician_id || '') ||
                (editForm.radiologistId || '') !== (appointment?.radiologist_id || '')
            );
            if (hadPriorStaff && staffChanged) {
                payload.assignmentReason = editForm.assignmentReason?.trim() || 'تعديل جدول وتوزيع المهام السريرية';
            }

            if (onUpdateAppointment) {
                await onUpdateAppointment(payload);
            } else {
                await updateAppointmentMutation(payload).unwrap();
            }

            toast.success(t('details.editSuccess', { defaultValue: 'تم تعديل بيانات الحجز بنجاح' }));
            setIsEditing(false);
        } catch (err) {
            console.error('Failed to update appointment:', err);
            toast.error(getErrorMessage(err, t('details.editFailed', { defaultValue: 'تعذر تعديل الحجز' })));
        } finally {
            setIsSubmitting(false);
        }
    };

    const currentStageIndex = STAGE_ORDER.indexOf(stage);
    const isSaving = isSubmitting || isMutating;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

            {/* Modal Dialog */}
            <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl border border-slate-200/80 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                            {isEditing ? <CalendarClock size={22} /> : <Activity size={22} />}
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    {patientName}
                                </h3>
                                {!isEditing && <PriorityBadge priority={priority} />}
                                {orderNumber && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10.5px] font-mono font-bold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800">
                                        <Hash size={10} />
                                        <span>{orderNumber}</span>
                                    </span>
                                )}
                                {isEditing && (
                                    <span className="rounded-lg bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                                        {t('details.editModalTitle', { defaultValue: 'تعديل بيانات الحجز والموعد' })}
                                    </span>
                                )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                <span className="font-mono font-bold">{mrn}</span>
                                <span>•</span>
                                <span>{appointmentDate} - {appointmentTime}</span>
                                <span>•</span>
                                <span>{durationMinutes} {t('details.minutes', { defaultValue: 'دقيقة' })}</span>
                                {roomName && roomName !== '-' && (
                                    <>
                                        <span>•</span>
                                        <span className="flex items-center gap-0.5 text-teal-600 dark:text-teal-400 font-semibold">
                                            <DoorOpen size={11} />
                                            {roomName}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Edit button vs Locked badge */}
                        {!isEditing && canEditBooking && (
                            <button
                                type="button"
                                onClick={() => setIsEditing(true)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-700 transition hover:border-teal-300 hover:bg-teal-100 dark:border-teal-900/50 dark:bg-teal-950/40 dark:text-teal-300"
                                title={t('details.editBooking', { defaultValue: 'تعديل الحجز' })}
                            >
                                <Edit3 size={13} />
                                <span className="hidden sm:inline">{t('details.editBooking', { defaultValue: 'تعديل الحجز' })}</span>
                            </button>
                        )}
                        {!isEditing && !canEditBooking && (
                            <div
                                title={t('details.cannotEditAfterNursing', { defaultValue: 'لا يمكن تعديل بيانات الحجز بعد تحويل الحالة للتمريض أو بدء التجهيز السريري' })}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500 shadow-2xs dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-400"
                            >
                                <Lock size={13} className="text-slate-400 dark:text-slate-500" />
                                <span className="hidden sm:inline">{t('details.lockedAfterNursing', { defaultValue: 'الحجز مقفل (تم التحويل للتمريض)' })}</span>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={t('details.close', { defaultValue: 'إغلاق' })}
                            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Body Content */}
                <div className="flex-1 space-y-5 overflow-y-auto p-6 scrollbar-thin">
                    {/* EDIT MODE VIEW */}
                    {isEditing ? (
                        <form id="edit-booking-form" onSubmit={handleSaveEdit} className="space-y-4">
                            {/* Notice regarding nursing lock */}
                            <div className="flex items-center gap-2 rounded-xl bg-teal-50/80 border border-teal-200/80 p-3 text-xs text-teal-800 dark:bg-teal-950/40 dark:border-teal-900/60 dark:text-teal-300">
                                <Info size={15} className="shrink-0 text-teal-600" />
                                <span className="font-semibold">
                                    {t('details.canOnlyEditBeforeNursing', { defaultValue: 'تعديل بيانات الحجز متاح فقط قبل مرحلة التحضير والتمريض. بعد النقل للتمريض سيتم قفل الحجز للحفاظ على سلامة الفحص.' })}
                                </span>
                            </div>

                            {/* 1. Date & Time Row */}
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <span className="mb-2.5 flex items-center gap-1.5 text-xs font-black text-slate-700 dark:text-slate-300">
                                    <Calendar size={14} className="text-teal-600" />
                                    {t('details.appointmentDate', { defaultValue: 'تاريخ ووقت الموعد' })}
                                </span>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-[11px] font-bold text-slate-500">
                                            {t('details.appointmentDate', { defaultValue: 'تاريخ الموعد' })}
                                        </label>
                                        <input
                                            type="date"
                                            value={editForm.date}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, date: e.target.value }))}
                                            required
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[11px] font-bold text-slate-500">
                                            {t('details.appointmentTime', { defaultValue: 'وقت الموعد' })}
                                        </label>
                                        <input
                                            type="time"
                                            value={editForm.time}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, time: e.target.value }))}
                                            required
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* 2. Modality, Exam & Priority */}
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <span className="mb-2.5 flex items-center gap-1.5 text-xs font-black text-slate-700 dark:text-slate-300">
                                    <ScanLine size={14} className="text-teal-600" />
                                    {t('details.examInfo', { defaultValue: 'بيانات الفحص والجهاز والأولوية' })}
                                </span>
                                {hasWorkstationFilter && (
                                    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200/80 bg-violet-50/70 px-3 py-2 text-[11px] font-bold text-violet-800 dark:border-violet-800/60 dark:bg-violet-950/30 dark:text-violet-300">
                                        <div className="flex items-center gap-2">
                                            <SlidersHorizontal size={13} className="text-violet-600 dark:text-violet-400 shrink-0" />
                                            <span>
                                                {isRtl
                                                    ? `تصفية نشطة حسب مكتب الاستقبال: ${workstationConfig.desk || 'المكتب النشط'}`
                                                    : `Active Reception Scope: ${workstationConfig.desk || 'Active Desk'}`}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setApplyWorkstationScope((prev) => !prev)}
                                            className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-2 py-0.5 text-[10px] font-black text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-900 dark:text-violet-200"
                                        >
                                            {applyWorkstationScope
                                                ? (isRtl ? 'عرض جميع غرف وأجهزة المركز' : 'Show All Rooms & Devices')
                                                : (isRtl ? 'تطبيق نطاق المكتب' : 'Apply Desk Scope')}
                                        </button>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    {/* Clinical Room */}
                                    <div>
                                        <label className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-500">
                                            <DoorOpen size={11} className="text-violet-600" />
                                            {isRtl ? 'الغرفة / الجناح' : 'Clinical Room'}
                                        </label>
                                        <select
                                            value={editForm.roomId}
                                            onChange={(e) => {
                                                const newRoomId = e.target.value;
                                                setEditForm((prev) => {
                                                    let nextModality = prev.modalityId;
                                                    if (newRoomId) {
                                                        const machinesInRoom = machines.filter((m) => String(m.room_id) === String(newRoomId));
                                                        if (machinesInRoom.length === 1) {
                                                            nextModality = machinesInRoom[0].modality_id || machinesInRoom[0].id;
                                                        } else if (nextModality && !machinesInRoom.some((m) => String(m.modality_id || m.id) === String(nextModality))) {
                                                            nextModality = '';
                                                        }
                                                    }
                                                    return { ...prev, roomId: newRoomId, modalityId: nextModality };
                                                });
                                            }}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                        >
                                            <option value="">{isRtl ? 'جميع الغرف / تلقائي حسب الجهاز' : 'All Rooms / Auto from Device'}</option>
                                            {displayedRooms.map((r) => (
                                                <option key={r.room_id || r.id} value={r.room_id || r.id}>
                                                    {r.room_number ? `${isRtl ? 'غرفة' : 'Room'} ${r.room_number}` : ''} {r.name ? `— ${r.name}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Modality */}
                                    <div>
                                        <label className="mb-1 block text-[11px] font-bold text-slate-500">
                                            {t('details.machine', { defaultValue: 'الجهاز / الغرفة' })}
                                        </label>
                                        <select
                                            value={editForm.modalityId}
                                            onChange={(e) => {
                                                const newMId = e.target.value;
                                                const chosenMachine = machines.find((m) => String(m.modality_id || m.id) === String(newMId));
                                                setEditForm((prev) => ({
                                                    ...prev,
                                                    modalityId: newMId,
                                                    roomId: chosenMachine?.room_id || prev.roomId
                                                }));
                                            }}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                        >
                                            <option value="">{t('common.selectModality', { defaultValue: 'اختر الجهاز...' })}</option>
                                            {displayedMachines.map((m) => (
                                                <option key={m.modality_id || m.id} value={m.modality_id || m.id}>
                                                    {m.name} ({m.type || m.modality_type}) {m.room_number ? `— ${isRtl ? 'غرفة' : 'Room'} ${m.room_number}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Exam Type */}
                                    <div>
                                        <label className="mb-1 block text-[11px] font-bold text-slate-500">
                                            {t('details.exam', { defaultValue: 'نوع الفحص' })}
                                        </label>
                                        <select
                                            value={editForm.examTypeId}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, examTypeId: e.target.value }))}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                        >
                                            <option value="">{t('common.selectExamType', { defaultValue: 'اختر الفحص...' })}</option>
                                            {examTypes.map((et) => (
                                                <option key={et.type_id || et.id} value={et.type_id || et.id}>
                                                    {et.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Priority */}
                                    <div>
                                        <label className="mb-1 block text-[11px] font-bold text-slate-500">
                                            {t('details.priority', { defaultValue: 'الأولوية' })}
                                        </label>
                                        <select
                                            value={editForm.priority}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, priority: e.target.value }))}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                        >
                                            <option value="Routine">{t('common.priority.Routine', { defaultValue: 'Routine (روتيني)' })}</option>
                                            <option value="Urgent">{t('common.priority.Urgent', { defaultValue: 'Urgent (عاجل)' })}</option>
                                            <option value="Emergency">{t('common.priority.Emergency', { defaultValue: 'Emergency (طارئ)' })}</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Contrast requirement checkbox */}
                                <div className="mt-3 flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="contrast-required"
                                        checked={editForm.contrastRequired}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, contrastRequired: e.target.checked }))}
                                        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                    />
                                    <label htmlFor="contrast-required" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                                        {t('details.contrastRequired', { defaultValue: 'الفحص يتطلب حقن صبغة (Contrast Required)' })}
                                    </label>
                                </div>
                            </div>

                            {/* 3. Clinical Staff Assignment */}
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                                    <span className="flex items-center gap-1.5 text-xs font-black text-slate-700 dark:text-slate-300">
                                        <UsersRound size={14} className="text-teal-600" />
                                        {t('details.assignedTeam', { defaultValue: 'إسناد الطاقم الطبي للفحص' })}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label={isRtl ? 'المناوبون والحاضرون فقط' : 'On-Duty & Present Only'}
                                        onClick={() => setDutyStaffOnly((prev) => !prev)}
                                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-black transition ${
                                            dutyStaffOnly
                                                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 ring-1 ring-emerald-500/20'
                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                        }`}
                                    >
                                        <span>🟢</span>
                                        <span>{isRtl ? 'المناوبون والحاضرون فقط' : 'On-Duty & Present Only'}</span>
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    {/* Nurse */}
                                    <div>
                                        <label className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-500">
                                            <Stethoscope size={11} className="text-teal-600" />
                                            {t('details.nurse', { defaultValue: 'التمريض' })}
                                        </label>
                                        <select
                                            value={editForm.nurseId}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, nurseId: e.target.value }))}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                        >
                                            <option value="">{t('details.unassigned', { defaultValue: 'غير مسند / اختياري' })}</option>
                                            {displayedNurses.map((n) => {
                                                const duty = n.duty;
                                                return (
                                                    <option key={n.user_id || n.id} value={n.user_id || n.id}>
                                                        {duty?.dot || '⚪'} {n.full_name || n.name} {duty?.badgeText ? `— ${duty.badgeText}` : ''}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                        {selNurseDuty && (
                                            <div className={`mt-1.5 flex items-center justify-between gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold ${selNurseDuty.statusClass}`}>
                                                <span className="flex items-center gap-1 truncate">
                                                    <span>{selNurseDuty.dot}</span>
                                                    <span>{selNurseDuty.badgeText}</span>
                                                </span>
                                                {selNurseDuty.shift?.start_time && selNurseDuty.shift?.end_time && (
                                                    <span className="shrink-0 text-[9px] opacity-85">
                                                        {new Date(selNurseDuty.shift.start_time).toTimeString().slice(0, 5)} - {new Date(selNurseDuty.shift.end_time).toTimeString().slice(0, 5)}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Technician */}
                                    <div>
                                        <label className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-500">
                                            <ScanLine size={11} className="text-blue-600" />
                                            {t('details.technician', { defaultValue: 'فني الأشعة' })}
                                        </label>
                                        <select
                                            value={editForm.technicianId}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, technicianId: e.target.value }))}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                        >
                                            <option value="">{t('details.unassigned', { defaultValue: 'غير مسند / اختياري' })}</option>
                                            {displayedTechnicians.map((tc) => {
                                                const duty = tc.duty;
                                                return (
                                                    <option key={tc.user_id || tc.id} value={tc.user_id || tc.id}>
                                                        {duty?.dot || '⚪'} {tc.full_name || tc.name} {duty?.badgeText ? `— ${duty.badgeText}` : ''}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                        {selTechnicianDuty && (
                                            <div className={`mt-1.5 flex items-center justify-between gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold ${selTechnicianDuty.statusClass}`}>
                                                <span className="flex items-center gap-1 truncate">
                                                    <span>{selTechnicianDuty.dot}</span>
                                                    <span>{selTechnicianDuty.badgeText}</span>
                                                </span>
                                                {selTechnicianDuty.shift?.start_time && selTechnicianDuty.shift?.end_time && (
                                                    <span className="shrink-0 text-[9px] opacity-85">
                                                        {new Date(selTechnicianDuty.shift.start_time).toTimeString().slice(0, 5)} - {new Date(selTechnicianDuty.shift.end_time).toTimeString().slice(0, 5)}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Radiologist */}
                                    <div>
                                        <label className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-500">
                                            <UserCheck size={11} className="text-purple-600" />
                                            {t('details.radiologist', { defaultValue: 'طبيب الأشعة' })}
                                        </label>
                                        <select
                                            value={editForm.radiologistId}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, radiologistId: e.target.value }))}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                        >
                                            <option value="">{t('details.unassigned', { defaultValue: 'غير مسند / اختياري' })}</option>
                                            {radiologists.map((r) => (
                                                <option key={r.user_id || r.id} value={r.user_id || r.id}>
                                                    {r.full_name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Reassignment reason */}
                                <div className="mt-3">
                                    <label className="mb-1 block text-[11px] font-bold text-slate-500">
                                        {t('details.assignmentReason', { defaultValue: 'سبب التعديل / إعادة التعيين (مطلوب عند نقل المهام)' })}
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.assignmentReason}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, assignmentReason: e.target.value }))}
                                        placeholder="مثال: تعديل جدول وتوزيع المهام السريرية"
                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                    />
                                </div>
                            </div>

                            {/* 4. Indication & Notes */}
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <span className="mb-2.5 flex items-center gap-1.5 text-xs font-black text-slate-700 dark:text-slate-300">
                                    <FileText size={14} className="text-teal-600" />
                                    {t('details.clinicalIndication', { defaultValue: 'الداعي السريري والملاحظات' })}
                                </span>
                                <div className="space-y-3">
                                    <div>
                                        <label className="mb-1 block text-[11px] font-bold text-slate-500">
                                            {t('details.clinicalIndication', { defaultValue: 'الداعي السريري (Clinical Indication)' })}
                                        </label>
                                        <input
                                            type="text"
                                            value={editForm.clinicalIndication}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, clinicalIndication: e.target.value }))}
                                            placeholder="شكوى المريض أو التشخيص المبدئي..."
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[11px] font-bold text-slate-500">
                                            {t('details.notes', { defaultValue: 'ملاحظات وتوجيهات الحالة' })}
                                        </label>
                                        <textarea
                                            rows={2}
                                            value={editForm.notes}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                                            placeholder="تعليمات التحضير أو تنبيهات خاصة..."
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                        />
                                    </div>
                                </div>
                            </div>
                        </form>
                    ) : (
                        /* VIEW MODE */
                        <>
                            {/* Stage Timeline Banner & Nursing Lock Status Indicator */}
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <div className="mb-3 flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                        {t('details.workflowStage', { defaultValue: 'مرحلة الفحص الحالية' })}
                                    </span>
                                    <span className="rounded-lg bg-teal-50 px-2.5 py-0.5 text-xs font-black text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                                        {stageLabel(stage)}
                                    </span>
                                </div>

                                {/* Progress Stepper Bar */}
                                <div className="relative flex items-center justify-between">
                                    {STAGE_ORDER.slice(0, 8).map((st, idx) => {
                                        const isPassed = idx < currentStageIndex;
                                        const isCurrent = idx === currentStageIndex;
                                        return (
                                            <div key={st} className="flex flex-col items-center">
                                                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black transition-colors ${
                                                    isCurrent
                                                        ? 'bg-teal-600 text-white ring-4 ring-teal-500/20'
                                                        : isPassed
                                                            ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300'
                                                            : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                                                }`}>
                                                    {isPassed ? '✓' : idx + 1}
                                                </div>
                                                <span className={`mt-1 hidden text-[9px] font-bold sm:block ${
                                                    isCurrent ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'
                                                }`}>
                                                    {stageLabel(st)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Nursing Lock State Banner */}
                                {canEditBooking ? (
                                    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-teal-50/80 border border-teal-200/70 px-3 py-1.5 text-xs text-teal-900 dark:bg-teal-950/30 dark:border-teal-900/50 dark:text-teal-200">
                                        <div className="flex items-center gap-1.5 font-bold">
                                            <Sparkles size={13} className="text-teal-600 shrink-0" />
                                            <span>{t('details.canOnlyEditBeforeNursing', { defaultValue: 'تعديل بيانات الحجز متاح فقط قبل مرحلة التحضير والتمريض' })}</span>
                                        </div>
                                        <span className="rounded bg-teal-100/90 px-2 py-0.5 text-[10px] font-black text-teal-800 dark:bg-teal-900/60 dark:text-teal-200">
                                            متاح للتعديل السريري
                                        </span>
                                    </div>
                                ) : (
                                    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50/80 border border-amber-200/80 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-200">
                                        <div className="flex items-center gap-1.5 font-bold">
                                            <Lock size={13} className="text-amber-600 shrink-0" />
                                            <span>{t('details.cannotEditAfterNursing', { defaultValue: 'تم تحويل الحالة للتمريض / الإجراء السريري - تعديل الحجز مقفل للحفاظ على سلامة المسار الطبي' })}</span>
                                        </div>
                                        <span className="inline-flex items-center gap-1 rounded bg-amber-100/90 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                                            <Lock size={10} />
                                            مقفل سريرياً
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Patient & Exam Grid */}
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                {/* Patient info card */}
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                    <div className="mb-2.5 flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-300">
                                            <User size={14} className="text-teal-600" />
                                            <span>{t('details.patientInfo', { defaultValue: 'بيانات المريض' })}</span>
                                        </div>
                                        {orderNumber && (
                                            <span className="text-[10.5px] font-mono font-bold text-slate-400">
                                                {t('details.orderNumber', { defaultValue: 'الدور' })}: #{orderNumber}
                                            </span>
                                        )}
                                    </div>
                                    <div className="space-y-1.5 text-xs">
                                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                                            <span>{t('details.phone', { defaultValue: 'الهاتف' })}:</span>
                                            <span className="font-mono text-slate-800 dark:text-slate-200 flex items-center gap-1">
                                                <Phone size={11} className="text-slate-400" />
                                                {phone || '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                                            <span>{t('details.genderAge', { defaultValue: 'النوع / العمر' })}:</span>
                                            <span className="text-slate-800 dark:text-slate-200 font-semibold">
                                                {gender ? (gender === 'Male' || gender === 'ذكر' ? 'ذكر' : 'أنثى') : '-'} / {age ? `${age} سنة` : '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                                            <span>{t('details.waitingTime', { defaultValue: 'مدة الانتظار' })}:</span>
                                            <span className={`font-mono font-bold ${isOverdue ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}`}>
                                                {formatDuration(waitingMinutes, locale)}
                                            </span>
                                        </div>
                                        {createdByName && (
                                            <div className="flex justify-between text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/60 text-[11px]">
                                                <span>{t('details.createdBy', { defaultValue: 'أُنشئ بواسطة' })}:</span>
                                                <span className="text-slate-700 dark:text-slate-300 font-medium">
                                                    {createdByName} {appointmentSource ? `(${appointmentSource})` : ''}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Exam info card */}
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                    <div className="mb-2.5 flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-300">
                                            <Calendar size={14} className="text-teal-600" />
                                            <span>{t('details.examInfo', { defaultValue: 'بيانات الفحص والخدمة' })}</span>
                                        </div>
                                        {bodyPart && (
                                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                {bodyPart}
                                            </span>
                                        )}
                                    </div>
                                    <div className="space-y-1.5 text-xs">
                                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                                            <span>{t('details.exam', { defaultValue: 'الفحص' })}:</span>
                                            <span className="font-bold text-slate-800 dark:text-slate-200">{examName}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                                            <span>{t('details.machine', { defaultValue: 'الجهاز / الغرفة' })}:</span>
                                            <span className="text-slate-800 dark:text-slate-200 font-medium flex items-center gap-1">
                                                {machineName}
                                                {roomNumber && <span className="text-[10px] text-teal-600 font-bold">({roomNumber})</span>}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-slate-500 dark:text-slate-400">
                                            <span>{t('details.contrast', { defaultValue: 'صبغة' })}:</span>
                                            <span className={contrastRequired ? 'font-bold text-amber-600 flex items-center gap-1' : 'text-slate-400'}>
                                                {contrastRequired ? (
                                                    <>
                                                        <AlertTriangle size={11} className="text-amber-500" />
                                                        <span>مطلوبة (حقن وريدي)</span>
                                                    </>
                                                ) : 'غير مطلوبة'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/60 text-[11px]">
                                            <span>{t('details.fasting', { defaultValue: 'الصيام' })}:</span>
                                            <span className={fastingRequired ? 'font-bold text-amber-600' : 'text-slate-600 dark:text-slate-400'}>
                                                {fastingRequired ? t('details.fastingRequired', { hours: fastingHours, defaultValue: `مطلوب صيام (${fastingHours} ساعات)` }) : t('details.fastingNotRequired', { defaultValue: 'غير مطلوب' })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ASSIGNED CLINICAL TEAM CARD */}
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <div className="mb-2.5 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-300">
                                        <UsersRound size={14} className="text-teal-600" />
                                        <span>{t('details.assignedTeam', { defaultValue: 'الطاقم المسند إليه' })}</span>
                                    </div>

                                    {/* Edit assignment button only allowed before transfer to nursing */}
                                    {canEditBooking ? (
                                        <button
                                            type="button"
                                            onClick={() => setIsEditing(true)}
                                            className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 transition"
                                        >
                                            <Edit3 size={11} />
                                            <span>{t('details.editBooking', { defaultValue: 'تعديل الإسناد' })}</span>
                                        </button>
                                    ) : (
                                        <span
                                            className="inline-flex items-center gap-1 text-[10.5px] font-bold text-slate-400"
                                            title={t('details.cannotEditAfterNursing', { defaultValue: 'لا يمكن تعديل الإسناد بعد تحويل الحالة للتمريض' })}
                                        >
                                            <Lock size={10} />
                                            <span>{t('details.lockedAfterNursing', { defaultValue: 'إسناد مقفل' })}</span>
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                                    {/* Nurse */}
                                    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/70 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-850">
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-200/50 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900/40">
                                            <Stethoscope size={14} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <span className="block text-[10px] font-bold text-slate-400">
                                                {t('details.nurse', { defaultValue: 'التمريض' })}
                                            </span>
                                            <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-200">
                                                {nurseName || <span className="italic font-normal text-slate-400">{t('details.unassigned', { defaultValue: 'غير مسند' })}</span>}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Technician */}
                                    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/70 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-850">
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-200/50 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/40">
                                            <ScanLine size={14} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <span className="block text-[10px] font-bold text-slate-400">
                                                {t('details.technician', { defaultValue: 'فني الأشعة' })}
                                            </span>
                                            <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-200">
                                                {technicianName || <span className="italic font-normal text-slate-400">{t('details.unassigned', { defaultValue: 'غير مسند' })}</span>}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Radiologist */}
                                    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/70 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-850">
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700 ring-1 ring-purple-200/50 dark:bg-purple-950/40 dark:text-purple-300 dark:ring-purple-900/40">
                                            <UserCheck size={14} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <span className="block text-[10px] font-bold text-slate-400">
                                                {t('details.radiologist', { defaultValue: 'طبيب الأشعة' })}
                                            </span>
                                            <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-200">
                                                {radiologistName || <span className="italic font-normal text-slate-400">{t('details.unassigned', { defaultValue: 'غير مسند' })}</span>}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Receptionist / Referring Doctor */}
                                    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/70 bg-white p-2.5 shadow-2xs dark:border-slate-800 dark:bg-slate-850">
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/40">
                                            <User size={14} />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <span className="block text-[10px] font-bold text-slate-400">
                                                {referringDoctorName ? t('details.referringDoctor', { defaultValue: 'المحول' }) : t('details.receptionist', { defaultValue: 'الاستقبال' })}
                                            </span>
                                            <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-200">
                                                {referringDoctorName || receptionistName || <span className="italic font-normal text-slate-400">-</span>}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Financial & Coverage Details */}
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <div className="mb-2.5 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-xs font-black text-slate-700 dark:text-slate-300">
                                        <CreditCard size={14} className="text-teal-600" />
                                        <span>{t('details.financialTitle', { defaultValue: 'الموقف المالي والفاتورة' })}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                            {isRtl ? coverage.labelAr : coverage.labelEn}
                                        </span>
                                        <span className={`rounded-lg px-2 py-0.5 text-[10.5px] font-black ${
                                            !hasInvoice
                                                ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                                : balanceAmount <= 0
                                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                        }`}>
                                            {!hasInvoice ? 'بدون فاتورة' : balanceAmount <= 0 ? 'مسدد بالكامل' : 'يوجد متبقي'}
                                        </span>
                                    </div>
                                </div>

                                {hasInvoice ? (
                                    <div className="space-y-2 border-t border-slate-100 pt-2.5 text-xs dark:border-slate-800">
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                            {invoice?.invoice_number && (
                                                <div>
                                                    <span>{t('details.invoiceNumber', { defaultValue: 'رقم الفاتورة' })}: </span>
                                                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{invoice.invoice_number}</span>
                                                </div>
                                            )}
                                            {coverage.providerName && (
                                                <div>
                                                    <span>{t('details.insuranceProvider', { defaultValue: 'الجهة' })}: </span>
                                                    <span className="font-bold text-teal-700 dark:text-teal-300">{coverage.providerName}</span>
                                                </div>
                                            )}
                                            {coverage.policyNumber && (
                                                <div>
                                                    <span>{t('details.policyNumber', { defaultValue: 'رقم البوليصة' })}: </span>
                                                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{coverage.policyNumber}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-3 gap-3 pt-1">
                                            <div>
                                                <span className="block text-[10px] text-slate-400">{t('details.total', { defaultValue: 'الإجمالي' })}</span>
                                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{totalAmount.toLocaleString()} ج.م</span>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] text-slate-400">{t('details.paid', { defaultValue: 'المدفوع' })}</span>
                                                <span className="font-mono font-bold text-emerald-600">{paidAmount.toLocaleString()} ج.م</span>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] text-slate-400">{t('details.balance', { defaultValue: 'المتبقي' })}</span>
                                                <span className={`font-mono font-bold ${balanceAmount > 0 ? 'text-amber-600' : 'text-slate-500'}`}>{balanceAmount.toLocaleString()} ج.م</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-2 text-center text-xs text-slate-400">
                                        {t('table.noInvoice', { defaultValue: 'لم تصدر فاتورة حتى الآن لهذا الموعد.' })}
                                    </div>
                                )}
                            </div>

                            {/* Contrast Clinical Alert Warning Banner */}
                            {contrastRequired && (
                                <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300/80 bg-amber-50/70 p-3.5 dark:border-amber-800/80 dark:bg-amber-950/30">
                                    <AlertTriangle size={18} className="shrink-0 text-amber-600 mt-0.5" />
                                    <div className="text-xs">
                                        <span className="block font-black text-amber-800 dark:text-amber-200">
                                            {t('details.medicalAlerts', { defaultValue: 'تنبيهات ومحاذير طبية' })}:
                                        </span>
                                        <p className="mt-0.5 text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
                                            {t('details.allergyAlert', { defaultValue: 'تنبيه سريري: الفحص يتطلب حقن صبغة وريدية - يلزم التأكد من فحص وظائف الكلى (Creatinine) وتركيب الكانيولا المناسبة' })}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Preparation Instructions if present */}
                            {prepInstructions && (
                                <div className="flex items-start gap-2.5 rounded-2xl border border-teal-200/80 bg-teal-50/50 p-3.5 dark:border-teal-900/60 dark:bg-teal-950/20">
                                    <Info size={17} className="shrink-0 text-teal-600 mt-0.5" />
                                    <div className="text-xs">
                                        <span className="block font-black text-teal-800 dark:text-teal-200">
                                            {t('details.prepInstructions', { defaultValue: 'تعليمات التحضير الخاصة' })}:
                                        </span>
                                        <p className="mt-0.5 text-teal-700 dark:text-teal-300 font-medium leading-relaxed">
                                            {prepInstructions}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Clinical Indication & Notes */}
                            {(clinicalIndication || notes) && (
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60 space-y-2">
                                    {clinicalIndication && (
                                        <div>
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                                {t('details.clinicalIndication', { defaultValue: 'الداعي السريري' })}
                                            </span>
                                            <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">{clinicalIndication}</p>
                                        </div>
                                    )}
                                    {notes && (
                                        <div>
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                                {t('details.notes', { defaultValue: 'ملاحظات وتوجيهات الحالة' })}
                                            </span>
                                            <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">{notes}</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer Action Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                    {isEditing ? (
                        <>
                            <div className="text-xs text-slate-400">
                                {t('details.editModalTitle', { defaultValue: 'تعديل بيانات الحجز والموعد' })}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsEditing(false)}
                                    disabled={isSaving}
                                    className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                >
                                    {t('details.cancelEdit', { defaultValue: 'إلغاء' })}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveEdit}
                                    disabled={isSaving}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-600 px-5 text-xs font-black text-white shadow-sm transition hover:bg-teal-700 active:scale-95 disabled:opacity-50 cursor-pointer"
                                >
                                    <Save size={14} />
                                    <span>{isSaving ? t('details.saving', { defaultValue: 'جارٍ الحفظ...' }) : t('details.saveChanges', { defaultValue: 'حفظ التعديلات' })}</span>
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Print buttons & Edit shortcut */}
                            <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => handlePrint('sticker')}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
                                >
                                    <Tag size={13} className="text-teal-600" />
                                    <span>{t('queue.sticker', { defaultValue: 'ملصق' })}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePrint('slip')}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
                                >
                                    <ClipboardList size={13} className="text-emerald-600" />
                                    <span>{t('queue.bookingSlip', { defaultValue: 'شيت الفحص' })}</span>
                                </button>
                                {hasInvoice && (
                                    <button
                                        type="button"
                                        onClick={() => handlePrint('receipt')}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
                                    >
                                        <FileText size={13} className="text-cyan-600" />
                                        <span>{t('queue.receipt', { defaultValue: 'الإيصال' })}</span>
                                    </button>
                                )}

                                {/* Edit Booking in footer if allowed */}
                                {canEditBooking ? (
                                    <button
                                        type="button"
                                        onClick={() => setIsEditing(true)}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-2.5 text-xs font-bold text-teal-700 shadow-2xs hover:bg-teal-100 dark:border-teal-900/40 dark:bg-teal-950/40 dark:text-teal-300 transition"
                                    >
                                        <CalendarClock size={13} className="text-teal-600" />
                                        <span>{t('details.editBooking', { defaultValue: 'تعديل الحجز' })}</span>
                                    </button>
                                ) : (
                                    <div
                                        title={t('details.cannotEditAfterNursing', { defaultValue: 'لا يمكن تعديل الحجز بعد تحويل الحالة للتمريض أو بدء التجهيز السريري' })}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-100/90 px-2.5 text-xs font-bold text-slate-400 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-500 cursor-not-allowed"
                                    >
                                        <Lock size={12} />
                                        <span>{t('details.lockedAfterNursing', { defaultValue: 'الحجز مقفل' })}</span>
                                    </div>
                                )}
                            </div>

                            {/* Operational action buttons */}
                            <div className="flex items-center gap-2">
                                {stage === 'Scheduled' && onMove && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onMove({ exam_id: queue?.exam_id || appointment?.exam_id, appointment_id: appointment?.appointment_id || queue?.appointment_id, queue_stage: 'Scheduled' }, 'Arrived');
                                            onClose();
                                        }}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-black text-white shadow-sm transition hover:bg-teal-700 active:scale-95"
                                    >
                                        <CheckCircle2 size={13} />
                                        <span>{t('queue.arrived', { defaultValue: 'تسجيل وصول' })}</span>
                                    </button>
                                )}

                                {!hasInvoice && canCreate && appointment && ['Scheduled', 'Arrived', 'Payment Pending', 'Prep Pending', 'Ready for Exam'].includes(stage) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            createAppointmentInvoice(appointment);
                                            onClose();
                                        }}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-xs font-black text-white shadow-sm transition hover:bg-slate-800 active:scale-95 dark:bg-slate-700 dark:hover:bg-slate-600"
                                    >
                                        <CreditCard size={13} />
                                        <span>{t('table.createInvoice', { defaultValue: 'إنشاء فاتورة' })}</span>
                                    </button>
                                )}

                                {hasInvoice && balanceAmount > 0 && onOpenPayment && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onOpenPayment(invoice);
                                            onClose();
                                        }}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
                                    >
                                        <CreditCard size={13} />
                                        <span>{t('billing.collectPayment', { defaultValue: 'تحصيل الرصيد' })}</span>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                >
                                    {t('details.close', { defaultValue: 'إغلاق' })}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReceptionCaseDetailsModal;
