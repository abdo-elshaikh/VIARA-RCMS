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
    BadgeCheck,
    Copy,
    Check,
    Layers,
    Printer,
    ArrowRight
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
    'Images Ready',
    'Images Delivered',
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
    canViewInvoices = false,
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
    const [activeTab, setActiveTab] = useState('exam'); // 'exam' | 'team' | 'billing' | 'notes'
    const [copiedMrn, setCopiedMrn] = useState(false);

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
        imagesOnly: false,
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
                imagesOnly: Boolean(appointment?.images_only || appointment?.report_request_status === 'NotRequested' || queue?.images_only),
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

    if (!isOpen || !activeCase) return null;

    // Patient details
    const patientName = appointment?.patient_name || queue?.patient_name || t('table.patientFallback', { defaultValue: 'مريض' });
    const mrn = appointment?.mrn || queue?.mrn || '-';
    const phone = appointment?.patient_phone || appointment?.phone || queue?.patient_phone || queue?.phone;
    const gender = appointment?.patient_gender || appointment?.gender || queue?.patient_gender;
    const age = appointment?.patient_age || appointment?.age || queue?.patient_age;
    const priority = appointment?.priority || queue?.priority || 'Routine';
    const orderNumber = appointment?.order_number || queue?.order_number;

    // Exam & Modality details
    const examName = appointment?.exam_type_name || queue?.exam_type_name || t('table.noExamType', { defaultValue: 'فحص' });
    const machineName = appointment?.machine_name || queue?.machine_name || queue?.modality_name || '-';
    const modalityType = appointment?.modality_type || queue?.modality_type || '';
    const roomName = appointment?.room_name || queue?.room_name || (appointment?.room_number ? `غرفة ${appointment.room_number}` : '-');
    const roomNumber = appointment?.room_number || queue?.room_number;
    const bodyPart = appointment?.exam_type_body_part || appointment?.body_part;
    const contrastRequired = Boolean(appointment?.contrast_required || queue?.contrast_required || invoice?.contrast_required);
    const fastingRequired = Boolean(appointment?.fasting_required ?? queue?.fasting_required);
    const fastingHours = appointment?.fasting_hours || 6;
    const isImagesOnly = Boolean(
        appointment?.images_only ||
        appointment?.report_request_status === 'NotRequested' ||
        queue?.images_only ||
        ['Images Ready', 'Images Delivered'].includes(stage)
    );
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

    const handleCopyMrn = () => {
        if (mrn && mrn !== '-') {
            navigator.clipboard?.writeText(mrn);
            setCopiedMrn(true);
            toast.success(isRtl ? 'تم نسخ الرقم الطبي (MRN)' : 'MRN copied to clipboard');
            setTimeout(() => setCopiedMrn(false), 2000);
        }
    };

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
                imagesOnly: Boolean(editForm.imagesOnly),
                reportRequestStatus: editForm.imagesOnly ? 'NotRequested' : 'Requested',
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

    // Staff assigned count
    const assignedStaffCount = [nurseName, technicianName, radiologistName].filter(Boolean).length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-slate-950/70 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Modal Dialog Container */}
            <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl border border-slate-200/90 bg-white shadow-2xl overflow-hidden transition-all dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200">
                
                {/* 1. TOP HEADER: Patient Identity & Primary Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 dark:border-slate-800/80 dark:bg-slate-900/90">
                    {/* Patient identity card */}
                    <div className="flex items-center gap-3.5 min-w-0">
                        {/* Avatar initials with gradient */}
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-600 text-white font-black text-lg shadow-sm shadow-teal-500/20">
                            {patientName ? patientName.trim().charAt(0) : 'م'}
                        </div>

                        <div className="min-w-0">
                            {/* Line 1: Name, Badges, Stage */}
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">
                                    {patientName}
                                </h2>
                                
                                {gender && (
                                    <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                        {gender === 'Male' || gender === 'ذكر' ? 'ذكر' : 'أنثى'}{age ? ` • ${age} سنة` : ''}
                                    </span>
                                )}

                                {!isEditing && <PriorityBadge priority={priority} />}

                                {orderNumber && (
                                    <span className="inline-flex items-center gap-1 rounded-lg bg-teal-50 border border-teal-200 px-2 py-0.5 text-[11px] font-mono font-bold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/80">
                                        <Hash size={11} className="text-teal-600 dark:text-teal-400" />
                                        <span>{orderNumber}</span>
                                    </span>
                                )}

                                {!isEditing && (
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-bold text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 ring-1 ring-teal-500/20">
                                        <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse" />
                                        <span>{stageLabel(stage)}</span>
                                    </span>
                                )}

                                {isEditing && (
                                    <span className="rounded-lg bg-teal-600 px-2.5 py-0.5 text-[11px] font-black text-white">
                                        {t('details.editModalTitle', { defaultValue: 'وضع التعديل' })}
                                    </span>
                                )}
                            </div>

                            {/* Line 2: MRN with copy action, Date & Time, Room */}
                            <div className="mt-1 flex flex-wrap items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
                                <button
                                    type="button"
                                    onClick={handleCopyMrn}
                                    title={isRtl ? 'انقر لنسخ الرقم الطبي' : 'Click to copy MRN'}
                                    className="group inline-flex items-center gap-1 font-mono font-bold text-slate-700 hover:text-teal-600 dark:text-slate-300 dark:hover:text-teal-400 transition"
                                >
                                    <span>MRN: {mrn}</span>
                                    {copiedMrn ? <Check size={12} className="text-emerald-500" /> : <Copy size={11} className="opacity-60 group-hover:opacity-100" />}
                                </button>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                    <Clock size={12} className="text-slate-400" />
                                    <span>{appointmentDate} - {appointmentTime}</span>
                                </span>
                                <span>•</span>
                                <span className="text-slate-600 dark:text-slate-400 font-medium">
                                    {durationMinutes} {t('details.minutes', { defaultValue: 'دقيقة' })}
                                </span>
                                {roomName && roomName !== '-' && (
                                    <>
                                        <span>•</span>
                                        <span className="flex items-center gap-1 text-teal-700 dark:text-teal-400 font-bold">
                                            <DoorOpen size={12} />
                                            <span>{roomName}</span>
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Top action icons */}
                    <div className="flex items-center gap-2">
                        {!isEditing && canEditBooking && (
                            <button
                                type="button"
                                onClick={() => setIsEditing(true)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-white px-3 py-1.5 text-xs font-bold text-teal-700 shadow-2xs hover:bg-teal-50 hover:border-teal-300 dark:border-teal-900/60 dark:bg-slate-800 dark:text-teal-300 dark:hover:bg-slate-750 transition"
                                title={t('details.editBooking', { defaultValue: 'تعديل الحجز' })}
                            >
                                <Edit3 size={13} />
                                <span className="hidden sm:inline">{t('details.editBooking', { defaultValue: 'تعديل الحجز' })}</span>
                            </button>
                        )}

                        {!isEditing && !canEditBooking && (
                            <div
                                title={t('details.cannotEditAfterNursing', { defaultValue: 'لا يمكن تعديل بيانات الحجز بعد تحويل الحالة للتمريض أو بدء التجهيز السريري' })}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100/90 px-2.5 py-1.5 text-xs font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-400"
                            >
                                <Lock size={12} className="text-slate-400" />
                                <span className="hidden sm:inline">{t('details.lockedAfterNursing', { defaultValue: 'الحجز مقفل' })}</span>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={t('details.close', { defaultValue: 'إغلاق' })}
                            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white transition"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* 2. SLIM STEPPER TIMELINE (View Mode Only) */}
                {!isEditing && (
                    <div className="border-b border-slate-100 bg-slate-50/40 px-5 py-3 dark:border-slate-800/80 dark:bg-slate-900/40">
                        <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                            {STAGE_ORDER.slice(0, 8).map((st, idx) => {
                                const isPassed = idx < currentStageIndex;
                                const isCurrent = idx === currentStageIndex;

                                return (
                                    <div key={st} className="flex flex-1 items-center min-w-[70px] sm:min-w-0">
                                        <div className="flex flex-col items-center w-full">
                                            <div className="relative flex items-center justify-center w-full">
                                                {/* Connecting line on left/right */}
                                                {idx > 0 && (
                                                    <div className={`absolute start-0 w-1/2 h-[2px] -z-0 ${
                                                        idx <= currentStageIndex
                                                            ? 'bg-teal-500'
                                                            : 'bg-slate-200 dark:bg-slate-800'
                                                    }`} />
                                                )}
                                                {idx < 7 && (
                                                    <div className={`absolute end-0 w-1/2 h-[2px] -z-0 ${
                                                        idx < currentStageIndex
                                                            ? 'bg-teal-500'
                                                            : 'bg-slate-200 dark:bg-slate-800'
                                                    }`} />
                                                )}
                                                {/* Step Circle */}
                                                <div className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black transition-all ${
                                                    isCurrent
                                                        ? 'bg-teal-600 text-white ring-4 ring-teal-500/20 shadow-xs'
                                                        : isPassed
                                                            ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                                                            : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                                                }`}>
                                                    {isPassed ? <Check size={11} strokeWidth={3} /> : idx + 1}
                                                </div>
                                            </div>
                                            <span className={`mt-1 truncate text-[9.5px] font-bold text-center leading-tight ${
                                                isCurrent
                                                    ? 'text-teal-700 dark:text-teal-300 font-black'
                                                    : isPassed
                                                        ? 'text-slate-600 dark:text-slate-400'
                                                        : 'text-slate-400 dark:text-slate-500'
                                            }`}>
                                                {stageLabel(st)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* 3. SEGMENTED NAVIGATION TABS (View Mode Only) */}
                {!isEditing && (
                    <div className="flex items-center gap-1.5 border-b border-slate-100 bg-white px-5 pt-3 pb-2 dark:border-slate-800 dark:bg-slate-900 overflow-x-auto scrollbar-none">
                        {/* Tab 1: Exam & Prep */}
                        <button
                            type="button"
                            onClick={() => setActiveTab('exam')}
                            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer shrink-0 ${
                                activeTab === 'exam'
                                    ? 'bg-teal-600 text-white shadow-xs dark:bg-teal-500 dark:text-slate-950 font-black'
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                            }`}
                        >
                            <ScanLine size={14} />
                            <span>{t('details.examAndPrep', { defaultValue: 'الفحص والتحضير' })}</span>
                            {contrastRequired && (
                                <span className={`h-2 w-2 rounded-full ${activeTab === 'exam' ? 'bg-amber-300' : 'bg-amber-500'}`} />
                            )}
                        </button>

                        {/* Tab 2: Care Team */}
                        <button
                            type="button"
                            onClick={() => setActiveTab('team')}
                            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer shrink-0 ${
                                activeTab === 'team'
                                    ? 'bg-teal-600 text-white shadow-xs dark:bg-teal-500 dark:text-slate-950 font-black'
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                            }`}
                        >
                            <UsersRound size={14} />
                            <span>{t('details.careTeam', { defaultValue: 'الفريق الطبي والإسناد' })}</span>
                            <span className={`rounded-md px-1.5 py-0.2 text-[10px] font-bold ${
                                activeTab === 'team'
                                    ? 'bg-teal-700/60 text-white dark:bg-slate-900 dark:text-teal-300'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            }`}>
                                {assignedStaffCount}/3
                            </span>
                        </button>

                        {/* Tab 3: Billing (Conditional on canViewInvoices) */}
                        {canViewInvoices && (
                            <button
                                type="button"
                                onClick={() => setActiveTab('billing')}
                                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer shrink-0 ${
                                    activeTab === 'billing'
                                        ? 'bg-teal-600 text-white shadow-xs dark:bg-teal-500 dark:text-slate-950 font-black'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                                }`}
                            >
                                <CreditCard size={14} />
                                <span>{t('details.financialTitle', { defaultValue: 'المالية والفاتورة' })}</span>
                                {hasInvoice && balanceAmount > 0 && (
                                    <span className={`rounded-md px-1.5 py-0.2 text-[10px] font-bold ${
                                        activeTab === 'billing' ? 'bg-amber-400 text-slate-900' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    }`}>
                                        {balanceAmount.toLocaleString()} ج.م
                                    </span>
                                )}
                            </button>
                        )}

                        {/* Tab 4: Indication & Notes */}
                        <button
                            type="button"
                            onClick={() => setActiveTab('notes')}
                            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition cursor-pointer shrink-0 ${
                                activeTab === 'notes'
                                    ? 'bg-teal-600 text-white shadow-xs dark:bg-teal-500 dark:text-slate-950 font-black'
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                            }`}
                        >
                            <FileText size={14} />
                            <span>{t('details.notesAndIndication', { defaultValue: 'التشخيص والملاحظات' })}</span>
                            {(clinicalIndication || notes) && (
                                <span className={`h-1.5 w-1.5 rounded-full ${activeTab === 'notes' ? 'bg-teal-200' : 'bg-teal-500'}`} />
                            )}
                        </button>
                    </div>
                )}

                {/* 4. MAIN MODAL BODY */}
                <div className="flex-1 overflow-y-auto p-5 sm:p-6 scrollbar-thin">
                    
                    {/* ========== EDIT MODE VIEW ========== */}
                    {isEditing ? (
                        <form id="edit-booking-form" onSubmit={handleSaveEdit} className="space-y-4">
                            {/* Notice regarding nursing lock */}
                            <div className="flex items-center gap-2.5 rounded-2xl bg-teal-50 border border-teal-200/80 p-3.5 text-xs text-teal-800 dark:bg-teal-950/40 dark:border-teal-900/60 dark:text-teal-200">
                                <Info size={16} className="shrink-0 text-teal-600 dark:text-teal-400" />
                                <span className="font-semibold leading-relaxed">
                                    {t('details.canOnlyEditBeforeNursing', { defaultValue: 'تعديل بيانات الحجز متاح فقط قبل مرحلة التحضير والتمريض. بعد النقل للتمريض سيتم قفل الحجز للحفاظ على سلامة الفحص.' })}
                                </span>
                            </div>

                            {/* Section 1: Date & Time */}
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <div className="mb-3 flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200">
                                    <Calendar size={15} className="text-teal-600" />
                                    <span>{t('details.appointmentDate', { defaultValue: 'تاريخ ووقت الموعد' })}</span>
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
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
                                        <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
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

                            {/* Section 2: Modality, Exam & Options */}
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <div className="mb-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200">
                                        <ScanLine size={15} className="text-teal-600" />
                                        <span>{t('details.examInfo', { defaultValue: 'بيانات الفحص والجهاز والأولوية' })}</span>
                                    </div>

                                    {hasWorkstationFilter && (
                                        <button
                                            type="button"
                                            onClick={() => setApplyWorkstationScope((prev) => !prev)}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-black text-violet-700 hover:bg-violet-100 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-300"
                                        >
                                            <SlidersHorizontal size={11} />
                                            <span>
                                                {applyWorkstationScope
                                                    ? (isRtl ? 'عرض كل الغرف والأجهزة' : 'Show All Rooms')
                                                    : (isRtl ? 'تطبيق نطاق المكتب' : 'Apply Desk Scope')}
                                            </span>
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    {/* Clinical Room */}
                                    <div>
                                        <label className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                            <DoorOpen size={12} className="text-violet-600" />
                                            <span>{isRtl ? 'الغرفة / الجناح' : 'Clinical Room'}</span>
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
                                            <option value="">{isRtl ? 'جميع الغرف / تلقائي حسب الجهاز' : 'All Rooms / Auto'}</option>
                                            {displayedRooms.map((r) => (
                                                <option key={r.room_id || r.id} value={r.room_id || r.id}>
                                                    {r.room_number ? `${isRtl ? 'غرفة' : 'Room'} ${r.room_number}` : ''} {r.name ? `— ${r.name}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Modality */}
                                    <div>
                                        <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
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
                                        <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
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
                                        <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
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

                                {/* Options: Contrast & Images Only Toggles */}
                                <div className="mt-3.5 flex flex-wrap items-center gap-4 pt-3 border-t border-slate-200/60 dark:border-slate-800/60">
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={editForm.contrastRequired}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, contrastRequired: e.target.checked }))}
                                            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 dark:border-slate-600"
                                        />
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                            {t('details.contrastRequired', { defaultValue: 'الفحص يتطلب حقن صبغة (Contrast Required)' })}
                                        </span>
                                    </label>

                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={editForm.imagesOnly}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, imagesOnly: e.target.checked }))}
                                            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 dark:border-slate-600"
                                        />
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                            {isRtl ? 'تسليم أفلام فقط / دون تقرير حالياً (إرجاء التقرير)' : 'Images only (Deferred report)'}
                                        </span>
                                    </label>
                                </div>
                            </div>

                            {/* Section 3: Clinical Staff Assignment */}
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200">
                                        <UsersRound size={15} className="text-teal-600" />
                                        <span>{t('details.assignedTeam', { defaultValue: 'إسناد الطاقم الطبي للفحص' })}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setDutyStaffOnly((prev) => !prev)}
                                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
                                            dutyStaffOnly
                                                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 ring-1 ring-emerald-500/20'
                                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                        }`}
                                    >
                                        <span>🟢</span>
                                        <span>{isRtl ? 'المناوبون والحاضرون فقط' : 'On-Duty Only'}</span>
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    {/* Nurse */}
                                    <div>
                                        <label className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                            <Stethoscope size={12} className="text-teal-600" />
                                            <span>{t('details.nurse', { defaultValue: 'التمريض' })}</span>
                                        </label>
                                        <select
                                            value={editForm.nurseId}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, nurseId: e.target.value }))}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                        >
                                            <option value="">{t('details.unassigned', { defaultValue: 'غير مسند / اختياري' })}</option>
                                            {displayedNurses.map((n) => (
                                                <option key={n.user_id || n.id} value={n.user_id || n.id}>
                                                    {n.duty?.dot || '⚪'} {n.full_name || n.name} {n.duty?.badgeText ? `— ${n.duty.badgeText}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                        {selNurseDuty && (
                                            <div className={`mt-1.5 flex items-center justify-between gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold ${selNurseDuty.statusClass}`}>
                                                <span className="truncate">{selNurseDuty.dot} {selNurseDuty.badgeText}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Technician */}
                                    <div>
                                        <label className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                            <ScanLine size={12} className="text-blue-600" />
                                            <span>{t('details.technician', { defaultValue: 'فني الأشعة' })}</span>
                                        </label>
                                        <select
                                            value={editForm.technicianId}
                                            onChange={(e) => setEditForm((prev) => ({ ...prev, technicianId: e.target.value }))}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                        >
                                            <option value="">{t('details.unassigned', { defaultValue: 'غير مسند / اختياري' })}</option>
                                            {displayedTechnicians.map((tc) => (
                                                <option key={tc.user_id || tc.id} value={tc.user_id || tc.id}>
                                                    {tc.duty?.dot || '⚪'} {tc.full_name || tc.name} {tc.duty?.badgeText ? `— ${tc.duty.badgeText}` : ''}
                                                </option>
                                            ))}
                                        </select>
                                        {selTechnicianDuty && (
                                            <div className={`mt-1.5 flex items-center justify-between gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold ${selTechnicianDuty.statusClass}`}>
                                                <span className="truncate">{selTechnicianDuty.dot} {selTechnicianDuty.badgeText}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Radiologist */}
                                    <div>
                                        <label className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                            <UserCheck size={12} className="text-purple-600" />
                                            <span>{t('details.radiologist', { defaultValue: 'طبيب الأشعة' })}</span>
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

                                <div className="mt-3">
                                    <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
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

                            {/* Section 4: Clinical Indication & Notes */}
                            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                <div className="mb-3 flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200">
                                    <FileText size={15} className="text-teal-600" />
                                    <span>{t('details.clinicalIndication', { defaultValue: 'الداعي السريري والملاحظات' })}</span>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
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
                                        <label className="mb-1 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
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
                        /* ========== VIEW MODE TABS ========== */
                        <div className="space-y-4">
                            
                            {/* TAB 1: EXAM & PREPARATION */}
                            {activeTab === 'exam' && (
                                <div className="space-y-4">
                                    {/* Exam Details Card */}
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                        <div className="mb-3 flex items-center justify-between">
                                            <div className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-200">
                                                <ScanLine size={15} className="text-teal-600" />
                                                <span>{t('details.examDetails', { defaultValue: 'بيانات الفحص والخدمة' })}</span>
                                            </div>
                                            {bodyPart && (
                                                <span className="rounded-lg bg-teal-50 border border-teal-200/80 px-2 py-0.5 text-[11px] font-bold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800">
                                                    {bodyPart}
                                                </span>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                                            <div className="rounded-xl border border-slate-200/60 bg-white p-3 dark:border-slate-800 dark:bg-slate-850">
                                                <span className="text-[11px] font-bold text-slate-400 block mb-0.5">
                                                    {t('details.exam', { defaultValue: 'اسم الفحص' })}
                                                </span>
                                                <span className="font-black text-sm text-slate-900 dark:text-white">
                                                    {examName}
                                                </span>
                                            </div>

                                            <div className="rounded-xl border border-slate-200/60 bg-white p-3 dark:border-slate-800 dark:bg-slate-850">
                                                <span className="text-[11px] font-bold text-slate-400 block mb-0.5">
                                                    {t('details.machine', { defaultValue: 'الجهاز / الغرفة السريرية' })}
                                                </span>
                                                <span className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                                                    <span>{machineName}</span>
                                                    {roomNumber && (
                                                        <span className="text-xs font-bold text-teal-600 dark:text-teal-400">
                                                            (غرفة {roomNumber})
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Report Track & Modality Path */}
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                        <div className="flex items-center justify-between mb-2.5">
                                            <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                                <Layers size={15} className="text-teal-600" />
                                                <span>{isRtl ? 'مسار الفحص والتقرير' : 'Report & Imaging Track'}</span>
                                            </span>
                                            <span className={`rounded-lg px-2.5 py-0.5 text-xs font-black ${
                                                isImagesOnly
                                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                            }`}>
                                                {isImagesOnly
                                                    ? (isRtl ? 'أفلام فقط (إرجاء التقرير)' : 'Images Only')
                                                    : (isRtl ? 'تقرير تشخيصي كامل' : 'Full Diagnostic Report')}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                                            {isImagesOnly
                                                ? (isRtl
                                                    ? 'تم تحديد هذا الفحص كمسار «أفلام فقط» بناء على رغبة المريض، ويصبح الفحص منجزاً عند تسليم الصور مع إمكانية طلب تقرير تشخيصي لاحقاً.'
                                                    : 'This case is marked as Images Only track. Patient will receive films directly and can request a report later.')
                                                : (isRtl
                                                    ? 'المسار القياسي: يتطلب كتابة واعتماد تقرير تشخيصي كامل من طبيب الأشعة المختص قبل إغلاق الحالة وتسليمها.'
                                                    : 'Standard workflow: requires diagnostic reading and report finalization before release.')}
                                        </p>
                                    </div>

                                    {/* Clinical alerts: Contrast & Fasting */}
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        {/* Fasting Card */}
                                        <div className={`rounded-2xl border p-4 ${
                                            fastingRequired
                                                ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20'
                                                : 'border-slate-200/80 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/60'
                                        }`}>
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <Clock size={15} className={fastingRequired ? 'text-amber-600' : 'text-slate-400'} />
                                                <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                                                    {t('details.fasting', { defaultValue: 'تعليمات الصيام' })}
                                                </span>
                                            </div>
                                            <p className={`text-xs font-bold ${fastingRequired ? 'text-amber-800 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
                                                {fastingRequired
                                                    ? t('details.fastingRequired', { hours: fastingHours, defaultValue: `مطلوب صيام ${fastingHours} ساعات قبل موعد الفحص` })
                                                    : t('details.fastingNotRequired', { defaultValue: 'لا يتطلب هذا الفحص صياماً مسبقاً' })}
                                            </p>
                                        </div>

                                        {/* Contrast Alert Card */}
                                        <div className={`rounded-2xl border p-4 ${
                                            contrastRequired
                                                ? 'border-rose-200 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20'
                                                : 'border-slate-200/80 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/60'
                                        }`}>
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <AlertTriangle size={15} className={contrastRequired ? 'text-rose-600' : 'text-slate-400'} />
                                                <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                                                    {t('details.contrast', { defaultValue: 'حقن الصبغة الوريدية' })}
                                                </span>
                                            </div>
                                            <p className={`text-xs font-bold ${contrastRequired ? 'text-rose-800 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>
                                                {contrastRequired
                                                    ? 'يتطلب صبغة - يلزم التأكد من وظائف الكلى (Creatinine) والكانيولا'
                                                    : 'فحص عادي بدون حقن صبغة'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Preparation Instructions if present */}
                                    {prepInstructions && (
                                        <div className="rounded-2xl border border-teal-200/80 bg-teal-50/50 p-4 dark:border-teal-900/60 dark:bg-teal-950/20">
                                            <div className="flex items-center gap-2 mb-1.5 text-xs font-black text-teal-900 dark:text-teal-200">
                                                <Info size={15} className="text-teal-600" />
                                                <span>{t('details.prepInstructions', { defaultValue: 'تعليمات التحضير الخاصة' })}:</span>
                                            </div>
                                            <p className="text-xs font-medium text-teal-800 dark:text-teal-300 leading-relaxed">
                                                {prepInstructions}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 2: CARE TEAM & ASSIGNMENTS */}
                            {activeTab === 'team' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                            {t('details.teamDesc', { defaultValue: 'أعضاء الطاقم السريري ومسؤولو المتابعة للحالة' })}
                                        </p>
                                        {canEditBooking ? (
                                            <button
                                                type="button"
                                                onClick={() => setIsEditing(true)}
                                                className="inline-flex items-center gap-1 text-xs font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400"
                                            >
                                                <Edit3 size={12} />
                                                <span>{t('details.editTeam', { defaultValue: 'تعديل الإسناد' })}</span>
                                            </button>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400">
                                                <Lock size={11} />
                                                <span>{t('details.lockedAfterNursing', { defaultValue: 'الإسناد مقفل' })}</span>
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        {/* Nurse Card */}
                                        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-850 flex items-start gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                                                <Stethoscope size={18} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <span className="text-[11px] font-bold text-slate-400 block">
                                                    {t('details.nurse', { defaultValue: 'التمريض' })}
                                                </span>
                                                <span className="text-xs font-black text-slate-900 dark:text-white block truncate">
                                                    {nurseName || <span className="font-normal italic text-slate-400">{t('details.unassigned', { defaultValue: 'غير مسند' })}</span>}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Technician Card */}
                                        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-850 flex items-start gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                                                <ScanLine size={18} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <span className="text-[11px] font-bold text-slate-400 block">
                                                    {t('details.technician', { defaultValue: 'فني الأشعة' })}
                                                </span>
                                                <span className="text-xs font-black text-slate-900 dark:text-white block truncate">
                                                    {technicianName || <span className="font-normal italic text-slate-400">{t('details.unassigned', { defaultValue: 'غير مسند' })}</span>}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Radiologist Card */}
                                        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-850 flex items-start gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                                                <UserCheck size={18} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <span className="text-[11px] font-bold text-slate-400 block">
                                                    {t('details.radiologist', { defaultValue: 'طبيب الأشعة' })}
                                                </span>
                                                <span className="text-xs font-black text-slate-900 dark:text-white block truncate">
                                                    {radiologistName || <span className="font-normal italic text-slate-400">{t('details.unassigned', { defaultValue: 'غير مسند' })}</span>}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Receptionist Card */}
                                        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-850 flex items-start gap-3">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                                <User size={18} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <span className="text-[11px] font-bold text-slate-400 block">
                                                    {t('details.receptionist', { defaultValue: 'موظف الاستقبال' })}
                                                </span>
                                                <span className="text-xs font-black text-slate-900 dark:text-white block truncate">
                                                    {receptionistName || <span className="font-normal italic text-slate-400">{t('details.unassigned', { defaultValue: 'غير مسند' })}</span>}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Referring Doctor (if available) */}
                                        {referringDoctorName && (
                                            <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-850 flex items-start gap-3 sm:col-span-2">
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
                                                    <Building2 size={18} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <span className="text-[11px] font-bold text-slate-400 block">
                                                        {t('details.referringDoctor', { defaultValue: 'الطبيب المحول / الجهة الخارجية' })}
                                                    </span>
                                                    <span className="text-xs font-black text-slate-900 dark:text-white block truncate">
                                                        {referringDoctorName}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* TAB 3: BILLING & FINANCIALS */}
                            {activeTab === 'billing' && canViewInvoices && (
                                <div className="space-y-4">
                                    {/* Insurance & Coverage Banner */}
                                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <CreditCard size={16} className="text-teal-600" />
                                                <span className="text-xs font-black text-slate-900 dark:text-white">
                                                    {isRtl ? coverage.labelAr : coverage.labelEn}
                                                </span>
                                                {coverage.providerName && (
                                                    <span className="rounded-lg bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
                                                        {coverage.providerName}
                                                    </span>
                                                )}
                                            </div>
                                            {coverage.policyNumber && (
                                                <div className="mt-1 text-[11px] text-slate-400 font-mono">
                                                    {t('details.policyNumber', { defaultValue: 'رقم البوليصة' })}: {coverage.policyNumber}
                                                </div>
                                            )}
                                        </div>

                                        <span className={`rounded-xl px-3 py-1 text-xs font-black ${
                                            !hasInvoice
                                                ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                                : balanceAmount <= 0
                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                                        }`}>
                                            {!hasInvoice ? 'بدون فاتورة' : balanceAmount <= 0 ? 'مسدد بالكامل ✓' : 'يوجد متبقي للتحصيل'}
                                        </span>
                                    </div>

                                    {/* Key Financial Metric Cards */}
                                    {hasInvoice ? (
                                        <>
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-850">
                                                    <span className="text-[11px] font-bold text-slate-400 block mb-1">
                                                        {t('details.total', { defaultValue: 'إجمالي الفاتورة' })}
                                                    </span>
                                                    <span className="font-mono text-base font-black text-slate-900 dark:text-white">
                                                        {totalAmount.toLocaleString()} ج.م
                                                    </span>
                                                    {invoice?.invoice_number && (
                                                        <span className="text-[10px] text-slate-400 block mt-1 font-mono">
                                                            #{invoice.invoice_number}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-850">
                                                    <span className="text-[11px] font-bold text-slate-400 block mb-1">
                                                        {t('details.paid', { defaultValue: 'المبلغ المدفوع' })}
                                                    </span>
                                                    <span className="font-mono text-base font-black text-emerald-600 dark:text-emerald-400">
                                                        {paidAmount.toLocaleString()} ج.م
                                                    </span>
                                                </div>

                                                <div className={`rounded-2xl border p-4 shadow-2xs ${
                                                    balanceAmount > 0
                                                        ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20'
                                                        : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-850'
                                                }`}>
                                                    <span className="text-[11px] font-bold text-slate-400 block mb-1">
                                                        {t('details.balance', { defaultValue: 'المتبقي للتحصيل' })}
                                                    </span>
                                                    <span className={`font-mono text-base font-black ${
                                                        balanceAmount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                                                    }`}>
                                                        {balanceAmount.toLocaleString()} ج.م
                                                    </span>
                                                </div>
                                            </div>

                                            {balanceAmount > 0 && onOpenPayment && (
                                                <div className="flex justify-end pt-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            onOpenPayment(invoice);
                                                            onClose();
                                                        }}
                                                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-700 transition cursor-pointer"
                                                    >
                                                        <CreditCard size={14} />
                                                        <span>{t('billing.collectPayment', { defaultValue: 'تحصيل الرصيد المتبقي' })}</span>
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                                            <CreditCard size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                                            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                                {t('table.noInvoice', { defaultValue: 'لم يتم إصدار فاتورة لهذا الموعد بعد' })}
                                            </p>
                                            {canCreate && appointment && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        createAppointmentInvoice(appointment);
                                                        onClose();
                                                    }}
                                                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800 transition dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer"
                                                >
                                                    <CreditCard size={13} />
                                                    <span>{t('table.createInvoice', { defaultValue: 'إصدار فاتورة الآن' })}</span>
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 4: CLINICAL NOTES & AUDIT */}
                            {activeTab === 'notes' && (
                                <div className="space-y-4">
                                    {/* Clinical Indication */}
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                                            {t('details.clinicalIndication', { defaultValue: 'الداعي السريري (Clinical Indication)' })}
                                        </span>
                                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                                            {clinicalIndication || <span className="italic text-slate-400 font-normal">لم يتم تدوين داعٍ سريري</span>}
                                        </p>
                                    </div>

                                    {/* Case Notes */}
                                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                                            {t('details.notes', { defaultValue: 'ملاحظات وتوجيهات الحالة' })}
                                        </span>
                                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                                            {notes || <span className="italic text-slate-400 font-normal">لا توجد ملاحظات إضافية</span>}
                                        </p>
                                    </div>

                                    {/* Audit & Origin metadata */}
                                    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-850">
                                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block mb-2">
                                            {t('details.bookingInfo', { defaultValue: 'بيانات التسجيل والانتظار' })}
                                        </span>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                            <div>
                                                <span className="text-slate-400 block text-[10px]">{t('details.createdBy', { defaultValue: 'أُنشئ بواسطة' })}</span>
                                                <span className="font-bold text-slate-700 dark:text-slate-300">
                                                    {createdByName || '-'} {appointmentSource ? `(${appointmentSource})` : ''}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 block text-[10px]">{t('details.waitingTime', { defaultValue: 'مدة الانتظار الحالية' })}</span>
                                                <span className={`font-mono font-bold ${isOverdue ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>
                                                    {formatDuration(waitingMinutes, locale)}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 block text-[10px]">{t('details.phone', { defaultValue: 'رقم الهاتف' })}</span>
                                                <span className="font-mono font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                                    <Phone size={11} className="text-slate-400" />
                                                    {phone || '-'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </div>

                {/* 5. BOTTOM ACTION FOOTER */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-5 py-3.5 dark:border-slate-800 dark:bg-slate-950/60">
                    {isEditing ? (
                        <>
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {t('details.editModalTitle', { defaultValue: 'تعديل بيانات الحجز والموعد' })}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsEditing(false)}
                                    disabled={isSaving}
                                    className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                                >
                                    {t('details.cancelEdit', { defaultValue: 'إلغاء' })}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveEdit}
                                    disabled={isSaving}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-600 px-5 text-xs font-black text-white shadow-xs hover:bg-teal-700 active:scale-95 disabled:opacity-50 cursor-pointer"
                                >
                                    <Save size={14} />
                                    <span>{isSaving ? t('details.saving', { defaultValue: 'جارٍ الحفظ...' }) : t('details.saveChanges', { defaultValue: 'حفظ التعديلات' })}</span>
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Left Print & Edit Toolbar */}
                            <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => handlePrint('sticker')}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer"
                                >
                                    <Tag size={13} className="text-teal-600" />
                                    <span>{t('queue.sticker', { defaultValue: 'ملصق' })}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePrint('slip')}
                                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer"
                                >
                                    <ClipboardList size={13} className="text-emerald-600" />
                                    <span>{t('queue.bookingSlip', { defaultValue: 'شيت الفحص' })}</span>
                                </button>
                                {hasInvoice && (
                                    <button
                                        type="button"
                                        onClick={() => handlePrint('receipt')}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer"
                                    >
                                        <FileText size={13} className="text-cyan-600" />
                                        <span>{t('queue.receipt', { defaultValue: 'الإيصال' })}</span>
                                    </button>
                                )}
                            </div>

                            {/* Right Operational Stage Actions */}
                            <div className="flex items-center gap-2">
                                {stage === 'Scheduled' && onMove && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onMove({ exam_id: queue?.exam_id || appointment?.exam_id, appointment_id: appointment?.appointment_id || queue?.appointment_id, queue_stage: 'Scheduled' }, 'Arrived');
                                            onClose();
                                        }}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-black text-white shadow-xs hover:bg-teal-700 active:scale-95 transition cursor-pointer"
                                    >
                                        <CheckCircle2 size={14} />
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
                                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-4 text-xs font-black text-white shadow-xs hover:bg-slate-800 active:scale-95 dark:bg-slate-700 dark:hover:bg-slate-600 transition cursor-pointer"
                                    >
                                        <CreditCard size={14} />
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
                                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow-xs hover:bg-emerald-700 active:scale-95 transition cursor-pointer"
                                    >
                                        <CreditCard size={14} />
                                        <span>{t('billing.collectPayment', { defaultValue: 'تحصيل الرصيد' })}</span>
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition cursor-pointer"
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
