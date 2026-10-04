import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    ShieldCheck, Users, UserCheck, Plus, Pencil, Trash2, Search,
    CheckCircle2, XCircle, AlertCircle, Wallet, Calendar,
    Building2, Award, RefreshCw, ArrowRight, ArrowLeft
} from 'lucide-react';
import { selectCurrentUser } from '../../store/authSlice';
import { getEffectivePermissions } from '../../utils/effectivePermissions';
import { getErrorMessage } from '../../utils/getErrorMessage';
import {
    useGetStaffQuery,
    useGetStaffSupervisorAssignmentsQuery,
    useCreateStaffSupervisorAssignmentMutation,
    useUpdateStaffSupervisorAssignmentMutation,
    useRevokeStaffSupervisorAssignmentMutation,
    useGetSupervisorRecommendationsQuery,
    useReviewSupervisorRecommendationMutation,
} from '../../store/api';
import Modal from '../ui/Modal';

/* ─── Department & Role Configuration ───────────────────────────────── */
const DEPARTMENT_ROLES = [
    { role: 'Receptionist', labelAr: 'الاستقبال والخدمات', labelEn: 'Reception', color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800' },
    { role: 'Nurse', labelAr: 'التمريض والرعاية', labelEn: 'Nursing', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
    { role: 'Technician', labelAr: 'فنيو الأشعة', labelEn: 'Radiology Techs', color: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800' },
    { role: 'Radiologist', labelAr: 'أطباء الأشعة', labelEn: 'Radiologists', color: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800' },
    { role: 'Cashier', labelAr: 'الخزينة والفوترة', labelEn: 'Cashier & Billing', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800' },
    { role: 'Accountant', labelAr: 'الحسابات والمالية', labelEn: 'Accounting & Finance', color: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800' },
    { role: 'Insurance_Staff', labelAr: 'التأمين الطبي', labelEn: 'Medical Insurance', color: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800' },
    { role: 'Marketing', labelAr: 'التسويق وعلاقات المرضى', labelEn: 'Marketing & Relations', color: 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-800' },
    { role: 'HR', labelAr: 'الموارد البشرية', labelEn: 'Human Resources', color: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800' },
    { role: 'Admin', labelAr: 'إدارة المنظومة', labelEn: 'Administration', color: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800' },
];

const ALLOWED_SUPERVISION_MAP = {
    Radiologist: ['Radiologist', 'Technician'],
    Technician: ['Technician'],
    Nurse: ['Nurse'],
    Receptionist: ['Receptionist', 'Cashier'],
    Cashier: ['Cashier'],
    Accountant: ['Accountant', 'Cashier'],
    Insurance_Staff: ['Insurance_Staff'],
    Marketing: ['Marketing'],
    HR: ['Receptionist', 'Nurse', 'Technician', 'Radiologist', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing'],
    Admin: ['Receptionist', 'Nurse', 'Technician', 'Radiologist', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing'],
    Developer: ['Receptionist', 'Nurse', 'Technician', 'Radiologist', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing'],
};

const initialForm = {
    supervisorId: '',
    employeeId: '',
    employeeIds: [],
    canApproveLeave: true,
    canApproveAttendance: true,
    canApproveShifts: true,
    canRecommendAdjustments: true,
    endsAt: '',
};

const toLocalDateTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

/* ─── General Supervisor Management Component ────────────────────────── */
const ReceptionSupervisorManager = () => {
    const { i18n } = useTranslation();
    const ar = i18n.language.startsWith('ar');
    const say = (arabic, english) => (ar ? arabic : english);

    const currentUser = useSelector(selectCurrentUser);
    const canReviewPayroll = currentUser?.role === 'Developer' || currentUser?.role === 'Admin' || getEffectivePermissions(currentUser).has('APPROVE_PAYROLL');

    // Sub-tab: 'assignments' | 'recommendations' | 'matrix'
    const [subTab, setSubTab] = useState('assignments');

    // Search and Filters
    const [search, setSearch] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState('ALL');
    const [capabilityFilter, setCapabilityFilter] = useState('ALL');

    // Queries
    const { data: staff = [], isLoading: staffLoading } = useGetStaffQuery();
    const { data: assignments = [], isLoading: loadingAssignments, isError, refetch: refetchAssignments } = useGetStaffSupervisorAssignmentsQuery();
    const { data: recommendations = [], isLoading: loadingRecs, refetch: refetchRecommendations } = useGetSupervisorRecommendationsQuery();

    // Mutations
    const [createAssignment, { isLoading: creating }] = useCreateStaffSupervisorAssignmentMutation();
    const [updateAssignment, { isLoading: updating }] = useUpdateStaffSupervisorAssignmentMutation();
    const [revokeAssignment, { isLoading: revoking }] = useRevokeStaffSupervisorAssignmentMutation();
    const [reviewRecommendation, { isLoading: reviewing }] = useReviewSupervisorRecommendationMutation();

    // Modals
    const [modalOpen, setModalOpen] = useState(false);
    const [editingAssignment, setEditingAssignment] = useState(null);
    const [form, setForm] = useState(initialForm);
    const [modalEmployeeSearch, setModalEmployeeSearch] = useState('');

    const [revokeTarget, setRevokeTarget] = useState(null);

    const [decisionModal, setDecisionModal] = useState(null); // { item, status: 'Approved' | 'Rejected' }
    const [decisionNotes, setDecisionNotes] = useState('');

    const busy = creating || updating || revoking || reviewing;

    // Eligible Staff List (active staff with operational or supervisory roles)
    const eligibleStaff = useMemo(() => {
        return (Array.isArray(staff) ? staff : [])
            .filter((person) => person.is_active !== false)
            .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), ar ? 'ar' : 'en'));
    }, [staff, ar]);

    // Compatible Target Employees for Selected Supervisor
    const selectedSupervisor = eligibleStaff.find((s) => s.user_id === form.supervisorId);
    const compatibleEmployees = useMemo(() => {
        if (!selectedSupervisor) return [];
        const allowedRoles = ALLOWED_SUPERVISION_MAP[selectedSupervisor.role] || [selectedSupervisor.role];
        return eligibleStaff.filter((emp) =>
            emp.user_id !== form.supervisorId && allowedRoles.includes(emp.role)
        );
    }, [selectedSupervisor, eligibleStaff, form.supervisorId]);

    // Filtered compatible employees based on search query in modal
    const filteredModalEmployees = useMemo(() => {
        if (!form.supervisorId) return [];
        if (!modalEmployeeSearch.trim()) return compatibleEmployees;
        const term = modalEmployeeSearch.trim().toLowerCase();
        return compatibleEmployees.filter((emp) => {
            const name = (emp.full_name || '').toLowerCase();
            const role = (emp.role || '').toLowerCase();
            const dept = DEPARTMENT_ROLES.find((d) => d.role === emp.role);
            const deptAr = (dept?.labelAr || '').toLowerCase();
            const deptEn = (dept?.labelEn || '').toLowerCase();
            return name.includes(term) || role.includes(term) || deptAr.includes(term) || deptEn.includes(term);
        });
    }, [compatibleEmployees, form.supervisorId, modalEmployeeSearch]);

    // Multi-Select Handlers
    const handleToggleEmployee = (id) => {
        setForm((f) => {
            const current = Array.isArray(f.employeeIds) ? f.employeeIds : [];
            const next = current.includes(id)
                ? current.filter((item) => item !== id)
                : [...current, id];
            return {
                ...f,
                employeeIds: next,
                employeeId: next[0] || '',
            };
        });
    };

    const handleSelectAllEmployees = () => {
        const allFilteredIds = filteredModalEmployees.map((e) => e.user_id);
        setForm((f) => {
            const combined = Array.from(new Set([...(f.employeeIds || []), ...allFilteredIds]));
            return {
                ...f,
                employeeIds: combined,
                employeeId: combined[0] || '',
            };
        });
    };

    const handleDeselectAllEmployees = () => {
        const filteredSet = new Set(filteredModalEmployees.map((e) => e.user_id));
        setForm((f) => {
            const remaining = (f.employeeIds || []).filter((id) => !filteredSet.has(id));
            return {
                ...f,
                employeeIds: remaining,
                employeeId: remaining[0] || '',
            };
        });
    };

    // Active Assignments List
    const activeAssignments = useMemo(() => {
        const now = new Date();
        return (Array.isArray(assignments) ? assignments : []).filter((item) => {
            const notRevoked = !item.revoked_at;
            const notExpired = !item.ends_at || new Date(item.ends_at) > now;
            return notRevoked && notExpired;
        });
    }, [assignments]);

    // Filtered Assignments for Display
    const filteredAssignments = useMemo(() => {
        return activeAssignments.filter((item) => {
            if (departmentFilter !== 'ALL' && item.department_role !== departmentFilter) {
                return false;
            }
            if (capabilityFilter !== 'ALL') {
                if (capabilityFilter === 'leave' && !item.can_approve_leave) return false;
                if (capabilityFilter === 'attendance' && !item.can_approve_attendance) return false;
                if (capabilityFilter === 'shifts' && !item.can_approve_shifts) return false;
                if (capabilityFilter === 'adjustments' && !item.can_recommend_adjustments) return false;
            }
            if (search.trim()) {
                const term = search.trim().toLowerCase();
                const sup = (item.supervisor_name || '').toLowerCase();
                const emp = (item.employee_name || '').toLowerCase();
                const role = (item.department_role || '').toLowerCase();
                if (!sup.includes(term) && !emp.includes(term) && !role.includes(term)) {
                    return false;
                }
            }
            return true;
        });
    }, [activeAssignments, departmentFilter, capabilityFilter, search]);

    // Metrics
    const metrics = useMemo(() => {
        const uniqueSupervisors = new Set(activeAssignments.map((a) => a.supervisor_id));
        const uniqueEmployees = new Set(activeAssignments.map((a) => a.employee_id));
        const departmentsCovered = new Set(activeAssignments.map((a) => a.department_role));
        const pendingRecs = (Array.isArray(recommendations) ? recommendations : []).filter((r) => r.status === 'Pending');

        return {
            supervisorsCount: uniqueSupervisors.size,
            employeesCount: uniqueEmployees.size,
            departmentsCount: departmentsCovered.size,
            pendingRecsCount: pendingRecs.length,
        };
    }, [activeAssignments, recommendations]);

    // Open Create Modal
    const handleStartCreate = () => {
        setEditingAssignment(null);
        setForm(initialForm);
        setModalEmployeeSearch('');
        setModalOpen(true);
    };

    // Open Edit Modal
    const handleStartEdit = (assignment) => {
        setEditingAssignment(assignment);
        setForm({
            supervisorId: assignment.supervisor_id,
            employeeId: assignment.employee_id,
            employeeIds: [assignment.employee_id],
            canApproveLeave: Boolean(assignment.can_approve_leave),
            canApproveAttendance: Boolean(assignment.can_approve_attendance),
            canApproveShifts: Boolean(assignment.can_approve_shifts),
            canRecommendAdjustments: Boolean(assignment.can_recommend_adjustments),
            endsAt: toLocalDateTime(assignment.ends_at),
        });
        setModalEmployeeSearch('');
        setModalOpen(true);
    };

    // Save Assignment (Create or Edit)
    const handleSaveAssignment = async (e) => {
        e.preventDefault();

        if (editingAssignment) {
            if (!form.supervisorId || !form.employeeId || form.supervisorId === form.employeeId) {
                toast.error(say('يرجى اختيار مشرف وموظف مختلفين.', 'Please select two different staff members.'));
                return;
            }
        } else {
            if (!form.supervisorId) {
                toast.error(say('يرجى اختيار المشرف المفوض أولاً.', 'Please select a supervisor first.'));
                return;
            }
            const selectedIds = (form.employeeIds || []).filter(Boolean);
            if (selectedIds.length === 0) {
                toast.error(say('يرجى اختيار موظف واحد على الأقل للخضوع للإشراف.', 'Please select at least one employee to supervise.'));
                return;
            }
            if (selectedIds.includes(form.supervisorId)) {
                toast.error(say('لا يمكن للمشرف الإشراف على نفسه.', 'Supervisor cannot supervise themselves.'));
                return;
            }
        }

        if (form.endsAt && new Date(form.endsAt) <= new Date()) {
            toast.error(say('تاريخ انتهاء التكليف يجب أن يكون في المستقبل.', 'Assignment end date must be in the future.'));
            return;
        }

        const payload = {
            canApproveLeave: form.canApproveLeave,
            canApproveAttendance: form.canApproveAttendance,
            canApproveShifts: form.canApproveShifts,
            canRecommendAdjustments: form.canRecommendAdjustments,
            endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        };

        try {
            if (editingAssignment) {
                await updateAssignment({
                    id: editingAssignment.assignment_id,
                    ...payload,
                }).unwrap();
                toast.success(say('تم تحديث صلاحيات التكليف الإشرافي بنجاح.', 'Supervisory assignment updated successfully.'));
            } else {
                const res = await createAssignment({
                    supervisorId: form.supervisorId,
                    employeeIds: form.employeeIds,
                    ...payload,
                    endsAt: payload.endsAt || undefined,
                }).unwrap();

                const count = res?.count || form.employeeIds.length;
                toast.success(
                    say(
                        `تم إسناد التكليف الإشرافي لـ (${count}) موظف بنجاح.`,
                        `Supervisory assignments created for (${count}) staff members successfully.`
                    )
                );
            }
            setModalOpen(false);
            refetchAssignments();
        } catch (error) {
            toast.error(getErrorMessage(error, say('تعذر حفظ التكليف الإشرافي.', 'Could not save supervisory assignment.')));
        }
    };

    // Confirm Revocation
    const handleConfirmRevoke = async () => {
        if (!revokeTarget) return;
        try {
            await revokeAssignment(revokeTarget.assignment_id).unwrap();
            toast.success(say('تم إلغاء وسحب التكليف الإشرافي فوراً.', 'Supervisory assignment revoked immediately.'));
            setRevokeTarget(null);
            refetchAssignments();
        } catch (error) {
            toast.error(getErrorMessage(error, say('تعذر إلغاء التكليف.', 'Could not revoke assignment.')));
        }
    };

    // Confirm Recommendation Review
    const handleConfirmReview = async () => {
        if (!decisionModal) return;
        if (decisionModal.status === 'Rejected' && decisionNotes.trim().length < 3) {
            toast.error(say('يرجى كتابة سبب الرفض بوضوح (3 أحرف على الأقل).', 'Please enter a rejection reason (min 3 chars).'));
            return;
        }

        try {
            await reviewRecommendation({
                id: decisionModal.item.recommendation_id,
                status: decisionModal.status,
                notes: decisionNotes.trim() || undefined,
            }).unwrap();

            toast.success(
                decisionModal.status === 'Approved'
                    ? say('تم اعتماد التوصية المالية من الإدارة.', 'Recommendation approved by management.')
                    : say('تم تسجيل رفض التوصية مع توضيح السبب.', 'Recommendation rejected with reason recorded.')
            );
            setDecisionModal(null);
            setDecisionNotes('');
            refetchRecommendations();
        } catch (error) {
            toast.error(getErrorMessage(error, say('تعذر تسجيل قرار الإدارة.', 'Could not record management decision.')));
        }
    };

    const inputClasses = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-teal-400';

    return (
        <section className="space-y-6" aria-label={say('إدارة المشرفين وتكليفات الإشراف العامة', 'General Supervisor Management')}>
            {/* ── 1. EXECUTIVE HEADER BANNER ────────────────────────────── */}
            <div className="relative overflow-hidden rounded-3xl border border-teal-200/80 bg-gradient-to-br from-teal-50/70 via-emerald-50/30 to-white p-6 shadow-sm backdrop-blur dark:border-teal-900/60 dark:from-slate-900 dark:via-teal-950/20 dark:to-slate-900 sm:p-7">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-md shadow-teal-600/20 dark:bg-teal-500">
                            <ShieldCheck size={32} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-xl font-black tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                                    {say('إدارة المشرفين وتكليفات الإشراف العامة', 'General Supervisors & Hierarchy Management')}
                                </h2>
                                <span className="inline-flex items-center gap-1 rounded-full border border-teal-300 bg-teal-100/80 px-2.5 py-0.5 text-xs font-bold text-teal-800 dark:border-teal-800 dark:bg-teal-900/40 dark:text-teal-300">
                                    {say('كافة الأقسام', 'All Departments')}
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 sm:text-sm">
                                {say(
                                    'تعيين وتفويض المشرفين لكافة الأقسام التشغيلية (الاستقبال، التمريض، الأشعة، الخزينة، الحسابات، التأمين، التسويق)، وضبط صلاحيات اتخاذ القرار والورديات، ومراجعة التوصيات المالية.',
                                    'Appoint and delegate supervisors across all departments (Reception, Nursing, Radiology, Cashier, Finance, Insurance, Marketing), configure operational authority, and audit financial recommendations.'
                                )}
                            </p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                refetchAssignments();
                                refetchRecommendations();
                                toast.success(say('تم تحديث البيانات الإشرافية.', 'Supervisory data refreshed.'));
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                            <RefreshCw size={14} className={loadingAssignments || loadingRecs ? 'animate-spin' : ''} />
                            {say('تحديث', 'Refresh')}
                        </button>

                        <button
                            type="button"
                            onClick={handleStartCreate}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-teal-700 active:scale-95 dark:bg-teal-500"
                        >
                            <Plus size={16} />
                            {say('إسناد تكليف إشرافي جديد', 'New Supervisory Assignment')}
                        </button>
                    </div>
                </div>

                {/* ── KPI Strip ──────────────────────────────────────────────── */}
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                    <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>{say('المشرفون المعتمدون', 'Active Supervisors')}</span>
                            <ShieldCheck size={16} className="text-teal-600 dark:text-teal-400" />
                        </div>
                        <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
                            {metrics.supervisorsCount}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                            {say('مشرفاً مكلفاً رسمياً', 'Assigned supervisors')}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>{say('الموظفون الخاضعون للإشراف', 'Supervised Staff')}</span>
                            <Users size={16} className="text-teal-600 dark:text-teal-400" />
                        </div>
                        <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
                            {metrics.employeesCount}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                            {say('موظفاً بفرق العمل', 'Team members supervised')}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-teal-100 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>{say('الأقسام المغطاة', 'Departments Covered')}</span>
                            <Building2 size={16} className="text-teal-600 dark:text-teal-400" />
                        </div>
                        <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
                            {metrics.departmentsCount}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                            {say('قطاعاً تشغيلياً نشطاً', 'Active departments')}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-purple-200/80 bg-purple-50/50 p-4 shadow-sm backdrop-blur dark:border-purple-900/40 dark:bg-purple-950/20">
                        <div className="flex items-center justify-between text-xs text-purple-800 dark:text-purple-300">
                            <span>{say('توصيات مالية قيد المراجعة', 'Pending Recommendations')}</span>
                            <Wallet size={16} className="text-purple-600 dark:text-purple-400" />
                        </div>
                        <p className="mt-2 text-2xl font-black text-purple-900 dark:text-purple-100">
                            {metrics.pendingRecsCount}
                        </p>
                        <p className="mt-1 text-[11px] text-purple-700/80 dark:text-purple-300/80">
                            {say('بانتظار قرار الإدارة العليا', 'Awaiting management review')}
                        </p>
                    </div>
                </div>
            </div>

            {/* ── 2. SUB-TABS NAVIGATION ─────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
                <button
                    type="button"
                    onClick={() => setSubTab('assignments')}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                        subTab === 'assignments'
                            ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20 dark:bg-teal-500'
                            : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                >
                    <ShieldCheck size={16} />
                    <span>{say('سجل التكليفات الإشرافية النشطة', 'Active Supervisory Assignments')}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {filteredAssignments.length}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setSubTab('recommendations')}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                        subTab === 'recommendations'
                            ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20 dark:bg-teal-500'
                            : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                >
                    <Wallet size={16} />
                    <span>{say('توصيات المشرفين للإدارة (حوافز / خصومات)', 'Supervisor Recommendations & Audit')}</span>
                    {metrics.pendingRecsCount > 0 && (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-black text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                            {metrics.pendingRecsCount}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setSubTab('matrix')}
                    className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                        subTab === 'matrix'
                            ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20 dark:bg-teal-500'
                            : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                >
                    <Award size={16} />
                    <span>{say('دليل مصفوفة الإشراف المعتمدة', 'Approved Supervision Hierarchy Matrix')}</span>
                </button>
            </div>

            {/* ── 3. SUB-TAB 1: ASSIGNMENTS DIRECTORY ─────────────────────── */}
            {subTab === 'assignments' && (
                <div className="space-y-4">
                    {/* Search & Filters Toolbar */}
                    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-1 flex-wrap items-center gap-3">
                            {/* Search */}
                            <div className="relative min-w-[220px] flex-1">
                                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 rtl:left-auto rtl:right-3" />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder={say('ابحث عن مشرف أو موظف أو دور...', 'Search supervisor or employee...')}
                                    className={`${inputClasses} pl-9 rtl:pl-3 rtl:pr-9`}
                                />
                            </div>

                            {/* Department Filter */}
                            <select
                                value={departmentFilter}
                                onChange={(e) => setDepartmentFilter(e.target.value)}
                                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            >
                                <option value="ALL">{say('كافة الأقسام التشغيلية', 'All Departments')}</option>
                                {DEPARTMENT_ROLES.map((d) => (
                                    <option key={d.role} value={d.role}>
                                        {say(d.labelAr, d.labelEn)}
                                    </option>
                                ))}
                            </select>

                            {/* Capability Filter */}
                            <select
                                value={capabilityFilter}
                                onChange={(e) => setCapabilityFilter(e.target.value)}
                                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            >
                                <option value="ALL">{say('كافة الصلاحيات المفوضة', 'All Capabilities')}</option>
                                <option value="leave">{say('اعتماد الإجازات والغياب', 'Leave Approvals')}</option>
                                <option value="attendance">{say('أذونات الحضور والانصراف', 'Attendance Permissions')}</option>
                                <option value="shifts">{say('إدارة وتبديل الورديات', 'Shift Management')}</option>
                                <option value="adjustments">{say('توصيات الحوافز والخصومات', 'Financial Adjustments')}</option>
                            </select>
                        </div>

                        <span className="text-xs font-semibold text-slate-500">
                            {say(`إجمالي التكليفات: ${filteredAssignments.length}`, `${filteredAssignments.length} assignments found`)}
                        </span>
                    </div>

                    {/* States */}
                    {(loadingAssignments || staffLoading) && (
                        <div className="flex items-center justify-center p-12 text-slate-500">
                            <RefreshCw className="mr-2 h-5 w-5 animate-spin text-teal-600" />
                            <span className="text-sm font-semibold">{say('جارٍ تحميل التكليفات الإشرافية...', 'Loading supervisory assignments...')}</span>
                        </div>
                    )}

                    {isError && (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                            <div className="flex items-center gap-3">
                                <AlertCircle size={20} className="shrink-0" />
                                <div className="text-sm font-bold">
                                    {say('تعذر تحميل سجل التكليفات.', 'Failed to load supervisory assignments.')}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={refetchAssignments}
                                className="mt-3 rounded-lg bg-rose-700 px-4 py-1.5 text-xs font-bold text-white shadow hover:bg-rose-800"
                            >
                                {say('إعادة المحاولة', 'Retry')}
                            </button>
                        </div>
                    )}

                    {!loadingAssignments && !isError && filteredAssignments.length === 0 && (
                        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
                            <Users size={32} className="text-slate-400" />
                            <h4 className="mt-4 text-base font-black text-slate-900 dark:text-white">
                                {say('لا توجد تكليفات إشرافية مطابقة', 'No matching supervisory assignments found')}
                            </h4>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {say('يمكنك إضافة تكليف جديد لتفويض مشرف على موظف أو قسم محدد.', 'You can create a new assignment to delegate supervisory authority to an employee.')}
                            </p>
                            <button
                                type="button"
                                onClick={handleStartCreate}
                                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-black text-white hover:bg-teal-700"
                            >
                                <Plus size={15} />
                                {say('إضافة تكليف جديد الآن', 'Create Assignment Now')}
                            </button>
                        </div>
                    )}

                    {/* Assignments Grid */}
                    <div className="grid gap-4 lg:grid-cols-2">
                        {filteredAssignments.map((item) => {
                            const deptMeta = DEPARTMENT_ROLES.find((d) => d.role === item.department_role) || {
                                labelAr: item.department_role,
                                labelEn: item.department_role,
                                color: 'bg-slate-100 text-slate-700',
                            };

                            return (
                                <article
                                    key={item.assignment_id}
                                    className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-700"
                                >
                                    <div>
                                        {/* Header: Supervisor -> Employee */}
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="rounded-md border px-2 py-0.5 text-xs font-bold text-teal-800 bg-teal-50 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800">
                                                        {say('مشرف معتمد', 'Supervisor')}
                                                    </span>
                                                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                                                        {item.supervisor_name}
                                                    </h3>
                                                </div>

                                                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                                    <span className="text-teal-600 font-bold">
                                                        {say('يشرف على:', 'Supervises:')}
                                                    </span>
                                                    <span className="font-bold text-slate-900 dark:text-white">
                                                        {item.employee_name}
                                                    </span>
                                                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${deptMeta.color}`}>
                                                        {say(deptMeta.labelAr, deptMeta.labelEn)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Edit & Revoke Actions */}
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleStartEdit(item)}
                                                    className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                                    title={say('تعديل الصلاحيات', 'Edit capabilities')}
                                                >
                                                    <Pencil size={15} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setRevokeTarget(item)}
                                                    className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                                    title={say('إلغاء التكليف', 'Revoke assignment')}
                                                >
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Capabilities Badges */}
                                        <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                                            <p className="text-[11px] font-bold text-slate-400">
                                                {say('الصلاحيات الإشرافية المفوضة للمشرف:', 'Delegated Supervisory Powers:')}
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {[
                                                    [item.can_approve_leave, say('اعتماد الإجازات', 'Leave')],
                                                    [item.can_approve_attendance, say('أذونات الحضور والانصراف', 'Attendance')],
                                                    [item.can_approve_shifts, say('إدارة وجدول الورديات', 'Shifts')],
                                                    [item.can_recommend_adjustments, say('رفع التوصيات المالية', 'Adjustments')],
                                                ].map(([granted, label]) => (
                                                    <span
                                                        key={label}
                                                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                                                            granted
                                                                ? 'bg-teal-50 text-teal-800 border border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800'
                                                                : 'bg-slate-100 text-slate-400 line-through dark:bg-slate-800 dark:text-slate-600'
                                                        }`}
                                                    >
                                                        {label}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer Dates */}
                                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-400 dark:border-slate-800">
                                        <span>
                                            {say('بدأ التكليف:', 'Started:')} {new Date(item.starts_at || item.created_at).toLocaleDateString(ar ? 'ar-EG' : 'en-GB')}
                                        </span>
                                        <span>
                                            {item.ends_at
                                                ? `${say('ينتهي في:', 'Ends:')} ${new Date(item.ends_at).toLocaleDateString(ar ? 'ar-EG' : 'en-GB')}`
                                                : say('تكليف دائم حتى الإلغاء', 'Indefinite')}
                                        </span>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── 4. SUB-TAB 2: RECOMMENDATIONS REVIEW ───────────────────── */}
            {subTab === 'recommendations' && (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    {say('توصيات المشرفين المالية المرفوعة للإدارة العليا', 'Supervisor Financial Recommendations Submitted for Management Review')}
                                </h3>
                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {say('استعراض طلبات الحوافز والخصومات والجزاءات المقدمة من المشرفين واتخاذ القرار الرسمي بشأنها.', 'Audit and review bonuses, deductions, and penalties recommended by team supervisors.')}
                                </p>
                            </div>
                            <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-black text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                                {recommendations.length} {say('توصية مسجلة', 'Recommendations')}
                            </span>
                        </div>
                    </div>

                    {loadingRecs && (
                        <p className="p-8 text-center text-xs text-slate-500">{say('جارٍ تحميل التوصيات...', 'Loading recommendations...')}</p>
                    )}

                    {!loadingRecs && recommendations.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500 dark:border-slate-800">
                            {say('لا توجد توصيات مالية مرفوعة من المشرفين حالياً.', 'No financial recommendations recorded yet.')}
                        </div>
                    )}

                    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                        {recommendations.map((rec) => {
                            const isPending = rec.status === 'Pending';
                            const isApproved = rec.status === 'Approved';
                            const isRejected = rec.status === 'Rejected';

                            return (
                                <div key={rec.recommendation_id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="space-y-1.5">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-bold text-slate-900 dark:text-white">
                                                {rec.employee_name}
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                ({say('بناءً على توصية المشرف:', 'Recommended by:')} <strong>{rec.supervisor_name}</strong>)
                                            </span>
                                            <span className={`rounded px-2 py-0.5 text-xs font-bold ${
                                                rec.recommendation_type === 'Incentive'
                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                            }`}>
                                                {rec.recommendation_type === 'Incentive' ? say('حافز تميز', 'Incentive') : say('خصم / جزاء', 'Deduction/Penalty')}
                                            </span>
                                            <span className="font-black text-purple-700 dark:text-purple-300 text-xs">
                                                {rec.amount} {say('ج.م', 'EGP')}
                                            </span>
                                        </div>

                                        <p className="text-xs text-slate-600 dark:text-slate-300">
                                            <strong>{say('المبررات:', 'Reason:')}</strong> {rec.reason}
                                        </p>

                                        {rec.review_notes && (
                                            <p className="text-xs text-amber-700 dark:text-amber-300">
                                                <strong>{say('ملاحظات قرار الإدارة:', 'Management Review Notes:')}</strong> {rec.review_notes}
                                            </p>
                                        )}

                                        <p className="text-[10px] text-slate-400">
                                            {new Date(rec.created_at).toLocaleDateString(ar ? 'ar-EG' : 'en-GB')}
                                        </p>
                                    </div>

                                    {/* Action or Status Badge */}
                                    <div className="flex items-center gap-2 self-end sm:self-center">
                                        {isPending && canReviewPayroll ? (
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDecisionModal({ item: rec, status: 'Approved' });
                                                        setDecisionNotes('');
                                                    }}
                                                    className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-black text-white hover:bg-emerald-700"
                                                >
                                                    {say('اعتماد التوصية', 'Approve')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDecisionModal({ item: rec, status: 'Rejected' });
                                                        setDecisionNotes('');
                                                    }}
                                                    className="rounded-xl border border-rose-300 px-3.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-900"
                                                >
                                                    {say('رفض التوصية', 'Reject')}
                                                </button>
                                            </div>
                                        ) : (
                                            <div>
                                                {isApproved && (
                                                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                                        {say('معتمدة رسمياً', 'Approved')}
                                                    </span>
                                                )}
                                                {isRejected && (
                                                    <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                                        {say('مرفوضة من الإدارة', 'Rejected')}
                                                    </span>
                                                )}
                                                {isPending && !canReviewPayroll && (
                                                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                                        {say('قيد المراجعة', 'Pending Review')}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── 5. SUB-TAB 3: SUPERVISORY MATRIX ───────────────────────── */}
            {subTab === 'matrix' && (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <h3 className="text-base font-black text-slate-900 dark:text-white">
                            {say('مصفوفة العلاقات وصلاحيات الإشراف المعتمدة بالمنظومة', 'Supervisory Authority Matrix')}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {say('تحدد هذه المصفوفة الهرم الإشرافي المسموح به بين الأقسام والأدوار الوظيفية المختلفة وفق معايير الحوكمة.', 'Defines authorized supervisory relationships across operational roles based on clinical governance.')}
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {Object.entries(ALLOWED_SUPERVISION_MAP).map(([supervisorRole, allowedTargets]) => {
                            const supMeta = DEPARTMENT_ROLES.find((d) => d.role === supervisorRole) || {
                                labelAr: supervisorRole,
                                labelEn: supervisorRole,
                                color: 'bg-teal-50 text-teal-800',
                            };

                            return (
                                <div key={supervisorRole} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                                    <div className="flex items-center gap-2">
                                        <span className={`rounded-md px-2 py-0.5 text-xs font-black ${supMeta.color}`}>
                                            {say(supMeta.labelAr, supMeta.labelEn)}
                                        </span>
                                        <span className="text-xs font-bold text-slate-400">
                                            {say('يمكنه الإشراف على:', 'Can supervise:')}
                                        </span>
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                        {allowedTargets.map((target) => {
                                            const targetMeta = DEPARTMENT_ROLES.find((d) => d.role === target) || {
                                                labelAr: target,
                                                labelEn: target,
                                                color: 'bg-slate-100 text-slate-700',
                                            };
                                            return (
                                                <span key={target} className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${targetMeta.color}`}>
                                                    {say(targetMeta.labelAr, targetMeta.labelEn)}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── 6. CREATE / EDIT ASSIGNMENT MODAL ───────────────────────── */}
            <Modal
                isOpen={modalOpen}
                onClose={() => !busy && setModalOpen(false)}
                title={
                    editingAssignment
                        ? say('تعديل صلاحيات التكليف الإشرافي', 'Edit Supervisory Assignment')
                        : say('إسناد وتكليف مشرف جديد', 'New Supervisory Assignment')
                }
            >
                <form onSubmit={handleSaveAssignment} className="space-y-4 p-5">
                    {/* Supervisor */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                            {say('المشرف المفوض', 'Supervising Staff Member')} <span className="text-rose-500">*</span>
                        </label>
                        <select
                            required
                            disabled={Boolean(editingAssignment)}
                            value={form.supervisorId}
                            onChange={(e) => {
                                const supId = e.target.value;
                                setForm((f) => ({ ...f, supervisorId: supId, employeeId: '', employeeIds: [] }));
                                setModalEmployeeSearch('');
                            }}
                            className={`mt-1.5 ${inputClasses} disabled:bg-slate-100 dark:disabled:bg-slate-800`}
                        >
                            <option value="">{say('اختر المشرف من القائمة...', 'Choose supervisor...')}</option>
                            {eligibleStaff.map((person) => {
                                const roleMeta = DEPARTMENT_ROLES.find((d) => d.role === person.role);
                                return (
                                    <option key={person.user_id} value={person.user_id}>
                                        {person.full_name} ({say(roleMeta?.labelAr || person.role, roleMeta?.labelEn || person.role)})
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    {/* Employee Selection: Single in Edit Mode, Multi-Select Checklist in Create Mode */}
                    {editingAssignment ? (
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                {say('الموظف الخاضع للإشراف', 'Supervised Employee')}
                            </label>
                            <div className="mt-1.5 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-800/80">
                                <span className="text-sm font-bold text-slate-900 dark:text-white">
                                    {editingAssignment.employee_name}
                                </span>
                                <span className="rounded bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-800 dark:bg-teal-900/40 dark:text-teal-300">
                                    {editingAssignment.department_role}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                    {say('الموظفون الخاضعون للإشراف (اختيار متعدد)', 'Supervised Staff Members (Multi-Select)')} <span className="text-rose-500">*</span>
                                </label>
                                {form.supervisorId && compatibleEmployees.length > 0 && (
                                    <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[11px] font-black text-teal-800 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                                        {say(
                                            `تم تحديد ${form.employeeIds?.length || 0} من ${compatibleEmployees.length}`,
                                            `${form.employeeIds?.length || 0} of ${compatibleEmployees.length} selected`
                                        )}
                                    </span>
                                )}
                            </div>

                            {!form.supervisorId ? (
                                <div className="mt-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                                    <Users className="mx-auto mb-1 h-5 w-5 text-slate-400" />
                                    {say('يرجى اختيار المشرف أولاً لعرض قائمة الموظفين المتوافقين مع تخصصه.', 'Select supervisor first to view compatible employees.')}
                                </div>
                            ) : compatibleEmployees.length === 0 ? (
                                <div className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-center text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                                    <AlertCircle className="mx-auto mb-1 h-5 w-5 text-amber-500" />
                                    {say('لا يوجد موظفون متاحون متوافقون مع تخصص هذا المشرف حالياً.', 'No compatible employees found for this supervisor.')}
                                </div>
                            ) : (
                                <div className="mt-1.5 space-y-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                                    {/* Search & Bulk Select Controls */}
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="relative min-w-[170px] flex-1">
                                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 rtl:left-auto rtl:right-2.5" />
                                            <input
                                                type="search"
                                                value={modalEmployeeSearch}
                                                onChange={(e) => setModalEmployeeSearch(e.target.value)}
                                                placeholder={say('بحث باسم الموظف أو الدور...', 'Search employee or role...')}
                                                className="w-full rounded-xl border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-800 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white rtl:pl-3 rtl:pr-8"
                                            />
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={handleSelectAllEmployees}
                                                className="rounded-lg border border-teal-200 bg-white px-2.5 py-1 text-[11px] font-bold text-teal-700 hover:bg-teal-50 dark:border-teal-900 dark:bg-slate-800 dark:text-teal-300 dark:hover:bg-slate-700"
                                            >
                                                {say('تحديد الكل', 'Select All')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleDeselectAllEmployees}
                                                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                            >
                                                {say('إلغاء التحديد', 'Deselect All')}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Scrollable Checkbox List */}
                                    <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                                        {filteredModalEmployees.map((person) => {
                                            const isSelected = Boolean(form.employeeIds?.includes(person.user_id));
                                            const roleMeta = DEPARTMENT_ROLES.find((d) => d.role === person.role) || {
                                                labelAr: person.role,
                                                labelEn: person.role,
                                                color: 'bg-slate-100 text-slate-700',
                                            };

                                            return (
                                                <label
                                                    key={person.user_id}
                                                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-2.5 transition ${
                                                        isSelected
                                                            ? 'border-teal-300 bg-teal-50/80 shadow-xs dark:border-teal-700 dark:bg-teal-950/40'
                                                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-800 dark:hover:bg-slate-700/50'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => handleToggleEmployee(person.user_id)}
                                                            className="h-4 w-4 rounded border-slate-300 text-teal-600 accent-teal-600 focus:ring-teal-500"
                                                        />
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-900 dark:text-white">
                                                                {person.full_name}
                                                            </p>
                                                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                                                {person.national_id ? `ID: ${person.national_id}` : person.phone_number || ''}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${roleMeta.color}`}>
                                                        {say(roleMeta.labelAr, roleMeta.labelEn)}
                                                    </span>
                                                </label>
                                            );
                                        })}

                                        {filteredModalEmployees.length === 0 && modalEmployeeSearch && (
                                            <p className="p-3 text-center text-xs text-slate-500">
                                                {say('لا توجد نتائج مطابقة لبحثك.', 'No employees match your search.')}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Capabilities Checkboxes */}
                    <fieldset className="space-y-2 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                        <legend className="px-2 text-xs font-black text-slate-800 dark:text-white">
                            {say('الصلاحيات الإشرافية الممنوحة', 'Granted Supervisory Capabilities')}
                        </legend>

                        {[
                            ['canApproveLeave', say('اعتماد طلبات الإجازات والغياب', 'Approve leave & absence requests')],
                            ['canApproveAttendance', say('اعتماد أذونات الانصراف المبكر والتأخر والحضور', 'Approve early leave & attendance permissions')],
                            ['canApproveShifts', say('إدارة وجدولة وتبديل الورديات والمناوبات', 'Manage shifts schedule and swap requests')],
                            ['canRecommendAdjustments', say('رفع توصيات الحوافز والخصومات والجزاءات للإدارة', 'Recommend financial incentives, deductions & penalties')],
                        ].map(([key, label]) => (
                            <label key={key} className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={Boolean(form[key])}
                                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                                    className="h-4 w-4 rounded accent-teal-600"
                                />
                                {label}
                            </label>
                        ))}
                    </fieldset>

                    {/* Expiry Date */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                            {say('تاريخ انتهاء التكليف (اختياري - اتركه فارغاً لتكليف دائم)', 'Assignment Expiry (Optional)')}
                        </label>
                        <input
                            type="datetime-local"
                            value={form.endsAt}
                            onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
                            className={`mt-1.5 ${inputClasses}`}
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => setModalOpen(false)}
                            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                        >
                            {say('إلغاء', 'Cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={busy}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-xs font-black text-white hover:bg-teal-700 disabled:opacity-50"
                        >
                            {busy && <RefreshCw size={14} className="animate-spin" />}
                            {editingAssignment ? say('حفظ التعديلات', 'Save Changes') : say('حفظ وإسناد التكليف', 'Create Assignment')}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* ── 7. REVOKE CONFIRMATION MODAL ───────────────────────────── */}
            <Modal
                isOpen={Boolean(revokeTarget)}
                onClose={() => !busy && setRevokeTarget(null)}
                title={say('تأكيد إلغاء التكليف الإشرافي', 'Confirm Supervision Revocation')}
            >
                <div className="space-y-4 p-5">
                    <p className="text-sm text-slate-700 dark:text-slate-300">
                        {say(
                            `هل أنت متأكد من رغبتك في إلغاء إشراف ${revokeTarget?.supervisor_name || ''} على ${revokeTarget?.employee_name || ''} فوراً؟ سيفقد المشرف صلاحية مراجعة طلبات هذا الموظف.`,
                            `Are you sure you want to revoke ${revokeTarget?.supervisor_name || ''}'s supervision of ${revokeTarget?.employee_name || ''}? The supervisor will immediately lose access to review their requests.`
                        )}
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => setRevokeTarget(null)}
                            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                        >
                            {say('تراجع', 'Cancel')}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={handleConfirmRevoke}
                            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50"
                        >
                            {busy && <RefreshCw size={14} className="animate-spin" />}
                            {say('تأكيد الإلغاء والسحب', 'Confirm Revoke')}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* ── 8. RECOMMENDATION AUDIT DECISION MODAL ─────────────────── */}
            <Modal
                isOpen={Boolean(decisionModal)}
                onClose={() => !busy && setDecisionModal(null)}
                title={
                    decisionModal?.status === 'Approved'
                        ? say('اعتماد توصية المشرف', 'Approve Supervisor Recommendation')
                        : say('رفض توصية المشرف مع السبب', 'Reject Supervisor Recommendation')
                }
            >
                <div className="space-y-4 p-5">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
                        <div className="flex items-center justify-between">
                            <span className="font-black text-slate-900 dark:text-white">
                                {decisionModal?.item?.employee_name}
                            </span>
                            <span className="font-black text-purple-700 dark:text-purple-300 text-xs">
                                {decisionModal?.item?.amount} {say('ج.م', 'EGP')}
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                            {say('المشرف مقدم التوصية:', 'Supervisor:')} {decisionModal?.item?.supervisor_name}
                        </p>
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                            <strong>{say('المبررات:', 'Reason:')}</strong> {decisionModal?.item?.reason}
                        </p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                            {decisionModal?.status === 'Rejected' ? (
                                <span className="text-rose-600 dark:text-rose-400">
                                    {say('سبب الرفض (إلزامي للتوثيق والشفافية)', 'Rejection Reason (Required)')} *
                                </span>
                            ) : (
                                <span>{say('ملاحظات وتوجيهات الإدارة (اختياري)', 'Management Notes (Optional)')}</span>
                            )}
                        </label>
                        <textarea
                            rows={3}
                            maxLength={1000}
                            placeholder={
                                decisionModal?.status === 'Rejected'
                                    ? say('يرجى توضيح سبب رفض هذه التوصية للمشرف...', 'Explain reason for rejection...')
                                    : say('أضف أي ملاحظات أو توجيهات إدارية...', 'Optional management notes...')
                            }
                            value={decisionNotes}
                            onChange={(e) => setDecisionNotes(e.target.value)}
                            className={`mt-1.5 ${inputClasses}`}
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => setDecisionModal(null)}
                            className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                        >
                            {say('إلغاء', 'Cancel')}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={handleConfirmReview}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-black text-white shadow-sm disabled:opacity-50 ${
                                decisionModal?.status === 'Approved'
                                    ? 'bg-emerald-600 hover:bg-emerald-700'
                                    : 'bg-rose-600 hover:bg-rose-700'
                            }`}
                        >
                            {busy && <RefreshCw size={14} className="animate-spin" />}
                            {decisionModal?.status === 'Approved' ? say('تأكيد الاعتماد', 'Confirm Approval') : say('تأكيد الرفض', 'Confirm Rejection')}
                        </button>
                    </div>
                </div>
            </Modal>
        </section>
    );
};

export default ReceptionSupervisorManager;
