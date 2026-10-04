import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    User, Shield, Activity, Mail, Key, CheckCircle2,
    ArrowLeft, Save, RefreshCw, Search, Lock, ShieldAlert,
    ShieldCheck, ClipboardCheck, UsersRound, Briefcase,
    Sparkles, Calendar, Clock, AlertCircle, XCircle,
    Receipt, FileText, ArrowLeftRight, CalendarOff,
    Award, Star, Plus, Send, ChevronRight, Check
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useGetStaffQuery,
    useUpdateStaffMutation,
    useGetStaffActivityLogsQuery,
    useGetShiftsQuery,
    useGetAttendanceQuery,
    useGetPayrollDeductionsQuery,
    useGetPayrollPenaltiesQuery,
    useGetShiftRequestsQuery,
    useGetAttendancePermissionsQuery,
    useGetLeaveRequestsQuery,
    useGetLeaveBalancesQuery,
    useGetStaffEvaluationsQuery,
    useCreateStaffEvaluationMutation
} from '../store/api';
import { Button, MetricCard, Skeleton, EmptyState, PageHeader } from '../components/ui';
import Modal from '../components/ui/Modal';
import StaffShiftSchedule from '../components/hr/attendance/StaffShiftSchedule';
import { getErrorMessage } from '../utils/getErrorMessage';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../store/authSlice';

const ROLE_OPTIONS = [
    { id: 'Admin', label: 'Administrator', risk: 'critical', tone: 'violet', icon: ShieldAlert },
    { id: 'Radiologist', label: 'Radiologist (Doctor)', risk: 'sensitive', tone: 'cyan', icon: ClipboardCheck },
    { id: 'Technician', label: 'Radiology Technician', risk: 'sensitive', tone: 'amber', icon: Activity },
    { id: 'Nurse', label: 'Clinical Nurse', risk: 'standard', tone: 'emerald', icon: CheckCircle2 },
    { id: 'Receptionist', label: 'Front Desk Receptionist', risk: 'sensitive', tone: 'blue', icon: UsersRound },
    { id: 'Cashier', label: 'Billing Cashier', risk: 'sensitive', tone: 'indigo', icon: Briefcase },
    { id: 'Accountant', label: 'Finance Accountant', risk: 'critical', tone: 'indigo', icon: Briefcase },
    { id: 'Insurance_Staff', label: 'Insurance Coordinator', risk: 'sensitive', tone: 'sky', icon: ShieldCheck },
    { id: 'HR', label: 'Human Resources', risk: 'critical', tone: 'fuchsia', icon: Key },
    { id: 'Marketing', label: 'Marketing & CRM', risk: 'standard', tone: 'emerald', icon: Sparkles }
];

export default function UserDetailPage() {
    const { userId } = useParams();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['admin', 'common', 'workspace']);
    const isArabic = i18n.language.startsWith('ar');
    const isRtl = isArabic;
    const currentUser = useSelector(selectCurrentUser);

    // Tab state (7 tabs)
    const [activeTab, setActiveTab] = useState('shifts');
    const [searchTerm, setSearchTerm] = useState('');

    // Queries
    const { data: staffList = [], isLoading: isStaffLoading, refetch: refetchStaff } = useGetStaffQuery();
    const [updateStaff, { isLoading: isUpdating }] = useUpdateStaffMutation();

    const user = useMemo(() => {
        return staffList.find(u => String(u.user_id) === String(userId));
    }, [staffList, userId]);

    // Data for user
    const { data: shiftsData, refetch: refetchShifts } = useGetShiftsQuery(userId ? { userId } : undefined, { skip: !userId });
    const { data: attendanceData, refetch: refetchAttendance } = useGetAttendanceQuery(userId ? { userId, limit: 50 } : undefined, { skip: !userId });
    const { data: deductionsData, refetch: refetchDeductions } = useGetPayrollDeductionsQuery(userId ? { userId } : undefined, { skip: !userId });
    const { data: penaltiesData, refetch: refetchPenalties } = useGetPayrollPenaltiesQuery(userId ? { userId } : undefined, { skip: !userId });
    const { data: shiftRequestsData, refetch: refetchShiftRequests } = useGetShiftRequestsQuery(userId ? { userId } : undefined, { skip: !userId });
    const { data: permissionsData, refetch: refetchPermissions } = useGetAttendancePermissionsQuery(userId ? { userId } : undefined, { skip: !userId });
    const { data: leaveData, refetch: refetchLeaves } = useGetLeaveRequestsQuery(userId ? { userId } : undefined, { skip: !userId });
    const { data: balanceData, refetch: refetchBalances } = useGetLeaveBalancesQuery(userId ? { userId } : undefined, { skip: !userId });
    const { data: evaluationsData, refetch: refetchEvaluations } = useGetStaffEvaluationsQuery(userId ? { userId } : undefined, { skip: !userId });
    const [createStaffEvaluation, { isLoading: isSubmittingEval }] = useCreateStaffEvaluationMutation();

    const canViewStaffActivity = currentUser?.role === 'Developer'
        || currentUser?.role === 'Admin'
        || (currentUser?.role === 'HR' && (
            currentUser?.permissions?.includes('VIEW_AUDIT_LOGS')
            || currentUser?.elevatedPermissions?.includes('VIEW_AUDIT_LOGS')
        ));
    const { data: auditData, isLoading: isAuditLoading, refetch: refetchAudit } = useGetStaffActivityLogsQuery({
        userId: String(userId),
        limit: 100
    }, { skip: !userId || !canViewStaffActivity });

    const logs = auditData?.logs || (Array.isArray(auditData) ? auditData : []);

    // Role & Security Form State
    const [selectedRole, setSelectedRole] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [newPassword, setNewPassword] = useState('');

    // Evaluation Modal State
    const [evalModalOpen, setEvalModalOpen] = useState(false);
    const [evalForm, setEvalForm] = useState({
        evaluation_period: `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`,
        overall_score: 5.0,
        clinical_quality_score: 5,
        attendance_punctuality_score: 5,
        teamwork_score: 5,
        strengths: '',
        areas_for_improvement: '',
        general_comments: ''
    });

    React.useEffect(() => {
        if (user) {
            setSelectedRole(user.role || 'Receptionist');
            setIsActive(user.is_active ?? true);
        }
    }, [user]);

    // Computed metrics
    const shiftsList = useMemo(() => {
        const raw = shiftsData?.items || shiftsData?.shifts || (Array.isArray(shiftsData) ? shiftsData : []);
        return raw.filter(s => String(s.user_id) === String(userId));
    }, [shiftsData, userId]);

    const attendanceRecords = useMemo(() => {
        const raw = attendanceData?.items || attendanceData?.records || (Array.isArray(attendanceData) ? attendanceData : []);
        return raw.filter(r => String(r.user_id) === String(userId));
    }, [attendanceData, userId]);

    const deductionsList = useMemo(() => {
        const raw = deductionsData?.items || deductionsData?.deductions || (Array.isArray(deductionsData) ? deductionsData : []);
        return raw.filter(d => String(d.user_id) === String(userId));
    }, [deductionsData, userId]);

    const penaltiesList = useMemo(() => {
        const raw = penaltiesData?.items || penaltiesData?.penalties || (Array.isArray(penaltiesData) ? penaltiesData : []);
        return raw.filter(p => String(p.user_id) === String(userId));
    }, [penaltiesData, userId]);

    const shiftRequestsList = useMemo(() => {
        const raw = shiftRequestsData?.items || shiftRequestsData?.requests || (Array.isArray(shiftRequestsData) ? shiftRequestsData : []);
        return raw.filter(r => String(r.user_id) === String(userId));
    }, [shiftRequestsData, userId]);

    const permissionsList = useMemo(() => {
        const raw = permissionsData?.items || permissionsData?.permissions || (Array.isArray(permissionsData) ? permissionsData : []);
        return raw.filter(p => String(p.user_id) === String(userId));
    }, [permissionsData, userId]);

    const leaveRequestsList = useMemo(() => {
        const raw = leaveData?.items || leaveData?.requests || (Array.isArray(leaveData) ? leaveData : []);
        return raw.filter(l => String(l.user_id) === String(userId));
    }, [leaveData, userId]);

    const evaluationsList = useMemo(() => {
        const raw = evaluationsData?.items || evaluationsData?.evaluations || (Array.isArray(evaluationsData) ? evaluationsData : []);
        return raw.filter(e => String(e.user_id) === String(userId));
    }, [evaluationsData, userId]);

    const averageRating = useMemo(() => {
        if (!evaluationsList.length) return null;
        const total = evaluationsList.reduce((acc, curr) => acc + Number(curr.overall_score || 0), 0);
        return (total / evaluationsList.length).toFixed(1);
    }, [evaluationsList]);

    const totalDeductionsAmount = useMemo(() => {
        return deductionsList.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    }, [deductionsList]);

    const totalPenaltiesAmount = useMemo(() => {
        return penaltiesList.reduce((acc, curr) => acc + Number(curr.fine_amount || curr.amount || 0), 0);
    }, [penaltiesList]);

    const refetchAll = () => {
        refetchStaff();
        refetchShifts();
        refetchAttendance();
        refetchDeductions();
        refetchPenalties();
        refetchShiftRequests();
        refetchPermissions();
        refetchLeaves();
        refetchBalances();
        refetchEvaluations();
        refetchAudit();
    };

    if (isStaffLoading) {
        return (
            <div className="p-6 space-y-6">
                <Skeleton className="h-28 w-full rounded-2xl" />
                <Skeleton className="h-64 w-full rounded-2xl" />
            </div>
        );
    }

    if (!user) {
        return (
            <div className="p-6 text-center">
                <EmptyState
                    icon={User}
                    title={t('users.notFound', { defaultValue: 'المستخدم غير موجود' })}
                    description={t('users.notFoundDesc', { defaultValue: 'لم يتم العثور على سجل هذا الموظف في النظام.' })}
                />
                <Button className="mt-4" onClick={() => navigate('/users')}>
                    <ArrowLeft size={16} className="me-2" />
                    {t('common.back', { defaultValue: 'العودة للمستخدمين' })}
                </Button>
            </div>
        );
    }

    const filteredLogs = logs.filter(log => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            (log.action && log.action.toLowerCase().includes(term)) ||
            (log.resource_table && log.resource_table.toLowerCase().includes(term)) ||
            (log.event_code && log.event_code.toLowerCase().includes(term))
        );
    });

    const handleSaveRoleAndPermissions = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                role: selectedRole,
                isActive: isActive
            };
            if (newPassword && newPassword.length >= 6) {
                payload.password = newPassword;
            }

            await updateStaff({
                id: user.user_id,
                ...payload
            }).unwrap();

            toast.success(t('users.updateSuccess', { defaultValue: 'تم تحديث صلاحيات وأمان الحساب بنجاح' }));
            setNewPassword('');
            refetchStaff();
        } catch (error) {
            toast.error(getErrorMessage(error));
        }
    };

    const handleCreateEvaluation = async (e) => {
        e.preventDefault();
        try {
            await createStaffEvaluation({
                user_id: Number(userId),
                evaluation_period: evalForm.evaluation_period,
                overall_score: Number(evalForm.overall_score),
                clinical_quality_score: Number(evalForm.clinical_quality_score),
                attendance_punctuality_score: Number(evalForm.attendance_punctuality_score),
                teamwork_score: Number(evalForm.teamwork_score),
                strengths: evalForm.strengths,
                areas_for_improvement: evalForm.areas_for_improvement,
                general_comments: evalForm.general_comments
            }).unwrap();

            toast.success(t('staffEvaluationSavedSuccessfully'));
            setEvalModalOpen(false);
            refetchEvaluations();
        } catch (err) {
            toast.error(getErrorMessage(err, t('failedToSaveEvaluation')));
        }
    };

    const roleInfo = ROLE_OPTIONS.find(r => r.id === (user.role || selectedRole)) || ROLE_OPTIONS[0];

    const TABS = [
        { id: 'shifts', labelAr: 'الورديات', labelEn: 'Shifts', count: shiftsList.length, icon: Calendar },
        { id: 'attendance', labelAr: 'سجل الحضور', labelEn: 'Attendance', count: attendanceRecords.length, icon: CheckCircle2 },
        { id: 'financials', labelAr: 'الخصومات والجزاءات', labelEn: 'Financials', count: deductionsList.length + penaltiesList.length, icon: Receipt },
        { id: 'requests', labelAr: 'الطلبات والأذونات', labelEn: 'Requests', count: shiftRequestsList.length + permissionsList.length, icon: ArrowLeftRight },
        { id: 'leaves', labelAr: 'الإجازات', labelEn: 'Leaves', count: leaveRequestsList.length, icon: CalendarOff },
        { id: 'evaluations', labelAr: 'التقييمات', labelEn: 'Evaluations', count: evaluationsList.length, icon: Award },
        { id: 'security', labelAr: 'الأمان والحركات', labelEn: 'Security & Logs', count: logs.length, icon: Shield },
    ];

    return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8" dir={isRtl ? 'rtl' : 'ltr'}>
            <PageHeader
                icon={User}
                eyebrow={t('comprehensiveStaffDossier360')}
                title={user.full_name}
                description={`${user.email || '—'} · ${user.department || user.department_name || roleInfo.label}`}
                metrics={[
                    { key: 'shifts', icon: Calendar, label: t('shifts'), value: shiftsList.length, tone: 'teal' },
                    { key: 'attendance', icon: CheckCircle2, label: t('attendance'), value: attendanceRecords.length, tone: 'emerald' },
                    { key: 'eval', icon: Award, label: t('rating'), value: averageRating ? `★ ${averageRating}/5` : '—', tone: 'amber' },
                    { key: 'deductions', icon: Receipt, label: t('deductions'), value: `${(totalDeductionsAmount + totalPenaltiesAmount).toLocaleString()} EGP`, tone: totalDeductionsAmount + totalPenaltiesAmount > 0 ? 'rose' : 'slate' },
                    { key: 'status', icon: user.is_active ? ShieldCheck : Lock, label: t('status'), value: user.is_active ? (t('active')) : (t('disabled')), tone: user.is_active ? 'emerald' : 'rose' }
                ]}
                metricsLabel={t('staffPerformanceServiceIndicators')}
                actions={
                    <>
                        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
                            <ArrowLeft size={14} className={isRtl ? 'rotate-180 me-1.5' : 'me-1.5'} />
                            {t('back')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigate('/hr?tab=directory')}>
                            <Briefcase size={14} className="me-1.5 text-cyan-600 dark:text-cyan-400" />
                            {isArabic ? 'ملف الموارد البشرية' : 'HR Profile'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={refetchAll}>
                            <RefreshCw size={14} className="me-1.5" />
                            {t('refresh')}
                        </Button>
                        <Button size="sm" onClick={() => navigate('/communications')}>
                            <Mail size={14} className="me-1.5" />
                            {t('message')}
                        </Button>
                    </>
                }
            />

            {/* 7-Tab Navigation — responsive grid */}
            <div
                role="tablist"
                aria-label={t('staffDossierSections')}
                className="grid select-none grid-cols-4 gap-1 sm:flex sm:flex-wrap sm:gap-1.5 border-b border-slate-200/80 pb-2.5 dark:border-slate-800"
            >
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActiveTab = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            aria-selected={isActiveTab}
                            onClick={() => setActiveTab(tab.id)}
                            className={`relative flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-2 rounded-xl px-2 sm:px-3.5 py-2.5 sm:py-2 text-[10px] sm:text-xs font-black transition-all ${
                                isActiveTab
                                    ? 'bg-teal-600 text-white shadow-md shadow-teal-500/20'
                                    : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                            }`}
                        >
                            <Icon size={16} className="shrink-0" />
                            <span className="hidden sm:inline truncate">{isArabic ? tab.labelAr : tab.labelEn}</span>
                            <span className="sm:hidden text-[9px] font-bold text-center leading-tight truncate max-w-full">
                                {isArabic ? tab.labelAr.split(' ')[0] : tab.labelEn.split(' ')[0]}
                            </span>
                            {tab.count !== undefined && tab.count > 0 && (
                                <span className={`absolute -top-1 -end-1 sm:static sm:rounded-full sm:px-1.5 sm:py-0.5 flex h-4 w-4 sm:h-auto sm:w-auto items-center justify-center rounded-full text-[9px] sm:text-[10px] font-extrabold ${
                                    isActiveTab
                                        ? 'bg-white/25 text-white'
                                        : 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300'
                                }`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* TAB 1: Shifts & Schedule */}
            {activeTab === 'shifts' && (
                <StaffShiftSchedule userId={userId} selfService={false} />
            )}

            {/* TAB 2: Attendance Logs */}
            {activeTab === 'attendance' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-black text-slate-900 dark:text-white">
                                {t('detailedAttendanceLogs')}
                            </h3>
                            <p className="text-xs text-slate-500">
                                {t('clockInOutTimestampsActiveDurations')}
                            </p>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                        {attendanceRecords.length === 0 ? (
                            <div className="p-8 text-center text-slate-400">
                                <Clock size={32} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                                <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                                    {t('noAttendanceLogsRecordedForThis')}
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-start text-xs">
                                    <thead className="border-b border-slate-200/80 bg-slate-50/80 font-black text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
                                        <tr>
                                            <th className="p-3.5 text-start">{t('date')}</th>
                                            <th className="p-3.5 text-start">{t('clockIn')}</th>
                                            <th className="p-3.5 text-start">{t('clockOut')}</th>
                                            <th className="p-3.5 text-start">{t('duration')}</th>
                                            <th className="p-3.5 text-start">{t('verification')}</th>
                                            <th className="p-3.5 text-start">{t('statusX')}</th>
                                            <th className="p-3.5 text-start">{t('notes')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300">
                                        {attendanceRecords.map((rec) => {
                                            const durationMinutes = rec.clock_out && rec.clock_in
                                                ? Math.max(0, Math.floor((new Date(rec.clock_out) - new Date(rec.clock_in)) / (1000 * 60)))
                                                : null;

                                            return (
                                                <tr key={rec.attendance_id || rec.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                                                    <td className="p-3.5 font-bold whitespace-nowrap">
                                                        {rec.clock_in ? new Date(rec.clock_in).toLocaleDateString(isArabic ? 'ar-EG' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}
                                                    </td>
                                                    <td className="p-3.5 text-emerald-600 dark:text-emerald-400 font-bold whitespace-nowrap">
                                                        {rec.clock_in ? new Date(rec.clock_in).toLocaleTimeString(isArabic ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                                    </td>
                                                    <td className="p-3.5 text-rose-600 dark:text-rose-400 font-bold whitespace-nowrap">
                                                        {rec.clock_out ? new Date(rec.clock_out).toLocaleTimeString(isArabic ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : (t('activeX'))}
                                                    </td>
                                                    <td className="p-3.5 whitespace-nowrap">
                                                        {durationMinutes !== null
                                                            ? `${Math.floor(durationMinutes / 60)}س ${durationMinutes % 60}د`
                                                            : '—'}
                                                    </td>
                                                    <td className="p-3.5 whitespace-nowrap">
                                                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                                            {rec.verification_mode || 'Web UI'}
                                                        </span>
                                                    </td>
                                                    <td className="p-3.5 whitespace-nowrap">
                                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${
                                                            !rec.clock_out
                                                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                        }`}>
                                                            {!rec.clock_out ? (t('clockedIn')) : (t('completed'))}
                                                        </span>
                                                    </td>
                                                    <td className="p-3.5 max-w-xs truncate text-slate-500">
                                                        {rec.notes || '—'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 3: Financials (Deductions & Penalties) */}
            {activeTab === 'financials' && (
                <div className="space-y-6">
                    {/* Financial Summary Cards */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-rose-200/70 bg-rose-50/50 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
                            <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-400">
                                {t('totalPayrollDeductions')}
                            </span>
                            <p className="mt-1 text-2xl font-black text-rose-900 dark:text-rose-100">
                                {totalDeductionsAmount.toLocaleString()} <span className="text-xs font-bold">EGP</span>
                            </p>
                            <p className="mt-1 text-[11px] text-rose-600/80">
                                {deductionsList.length} {t('deductionRecords')}
                            </p>
                        </div>

                        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                                {t('totalDisciplinaryPenalties')}
                            </span>
                            <p className="mt-1 text-2xl font-black text-amber-900 dark:text-amber-100">
                                {totalPenaltiesAmount.toLocaleString()} <span className="text-xs font-bold">EGP</span>
                            </p>
                            <p className="mt-1 text-[11px] text-amber-600/80">
                                {penaltiesList.length} {t('penaltyRecords')}
                            </p>
                        </div>
                    </div>

                    {/* Deductions Ledger */}
                    <div className="space-y-2">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">
                            {t('payrollDeductions')}
                        </h4>
                        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                            {deductionsList.length === 0 ? (
                                <p className="p-6 text-center text-xs text-slate-400">
                                    {t('noDeductionsRecorded')}
                                </p>
                            ) : (
                                <table className="w-full text-start text-xs">
                                    <thead className="border-b border-slate-100 bg-slate-50 font-black text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
                                        <tr>
                                            <th className="p-3 text-start">{t('type')}</th>
                                            <th className="p-3 text-start">{t('amount')}</th>
                                            <th className="p-3 text-start">{t('reason')}</th>
                                            <th className="p-3 text-start">{t('statusX')}</th>
                                            <th className="p-3 text-start">{t('date')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                        {deductionsList.map((d, i) => (
                                            <tr key={d.id || i}>
                                                <td className="p-3 font-bold">{d.deduction_type || d.type || 'Standard'}</td>
                                                <td className="p-3 font-black text-rose-600">{Number(d.amount).toLocaleString()} EGP</td>
                                                <td className="p-3 text-slate-600 dark:text-slate-300">{d.reason || '—'}</td>
                                                <td className="p-3">
                                                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold dark:bg-slate-800">
                                                        {d.status || 'Active'}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-slate-400">{d.created_at ? new Date(d.created_at).toLocaleDateString() : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* Penalties Ledger */}
                    <div className="space-y-2">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">
                            {t('administrativePenalties')}
                        </h4>
                        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                            {penaltiesList.length === 0 ? (
                                <p className="p-6 text-center text-xs text-slate-400">
                                    {t('noPenaltiesRecorded')}
                                </p>
                            ) : (
                                <table className="w-full text-start text-xs">
                                    <thead className="border-b border-slate-100 bg-slate-50 font-black text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
                                        <tr>
                                            <th className="p-3 text-start">{t('infraction')}</th>
                                            <th className="p-3 text-start">{t('severity')}</th>
                                            <th className="p-3 text-start">{t('fine')}</th>
                                            <th className="p-3 text-start">{t('statusX')}</th>
                                            <th className="p-3 text-start">{t('date')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                        {penaltiesList.map((p, i) => (
                                            <tr key={p.id || i}>
                                                <td className="p-3 font-bold">{p.infraction_type || p.reason || 'Attendance policy violation'}</td>
                                                <td className="p-3">
                                                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                                        {p.severity || 'Medium'}
                                                    </span>
                                                </td>
                                                <td className="p-3 font-black text-rose-600">{Number(p.fine_amount || p.amount || 0).toLocaleString()} EGP</td>
                                                <td className="p-3">
                                                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold dark:bg-slate-800">
                                                        {p.status || 'Applied'}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-slate-400">{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 4: Requests (Shift Requests & Attendance Permissions) */}
            {activeTab === 'requests' && (
                <div className="space-y-6">
                    {/* Shift Swap / Mod Requests */}
                    <div className="space-y-2">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">
                            {t('shiftSwapModificationRequests')}
                        </h4>
                        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                            {shiftRequestsList.length === 0 ? (
                                <p className="p-6 text-center text-xs text-slate-400">
                                    {t('noShiftRequestsFiled')}
                                </p>
                            ) : (
                                <table className="w-full text-start text-xs">
                                    <thead className="border-b border-slate-100 bg-slate-50 font-black text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
                                        <tr>
                                            <th className="p-3 text-start">{t('typeX')}</th>
                                            <th className="p-3 text-start">{t('proposed')}</th>
                                            <th className="p-3 text-start">{t('reason')}</th>
                                            <th className="p-3 text-start">{t('statusX')}</th>
                                            <th className="p-3 text-start">{t('dateX')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                        {shiftRequestsList.map((r, i) => (
                                            <tr key={r.request_id || i}>
                                                <td className="p-3 font-bold">
                                                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black ${
                                                        r.request_type === 'Swap' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                                    }`}>
                                                        {r.request_type === 'Swap' ? (t('swap')) : (t('modification'))}
                                                    </span>
                                                </td>
                                                <td className="p-3 font-medium">
                                                    {r.request_type === 'Swap'
                                                        ? `${t('targetColleague')} ${r.target_user_name || r.target_user_id}`
                                                        : `${new Date(r.proposed_start_time).toLocaleTimeString()} - ${new Date(r.proposed_end_time).toLocaleTimeString()}`}
                                                </td>
                                                <td className="p-3 max-w-xs truncate text-slate-600">{r.reason || '—'}</td>
                                                <td className="p-3 font-bold">
                                                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] ${
                                                        r.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : r.status === 'Rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                                                    }`}>
                                                        {r.status}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-slate-400">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* Attendance Early Departure / Late Arrival Permissions */}
                    <div className="space-y-2">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">
                            {t('attendanceExceptionPermissions')}
                        </h4>
                        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                            {permissionsList.length === 0 ? (
                                <p className="p-6 text-center text-xs text-slate-400">
                                    {t('noPermissionsFiled')}
                                </p>
                            ) : (
                                <table className="w-full text-start text-xs">
                                    <thead className="border-b border-slate-100 bg-slate-50 font-black text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
                                        <tr>
                                            <th className="p-3 text-start">{t('permissionType')}</th>
                                            <th className="p-3 text-start">{t('minutes')}</th>
                                            <th className="p-3 text-start">{t('dateXX')}</th>
                                            <th className="p-3 text-start">{t('reason')}</th>
                                            <th className="p-3 text-start">{t('statusX')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                        {permissionsList.map((p, i) => (
                                            <tr key={p.permission_id || i}>
                                                <td className="p-3 font-bold">
                                                    <span className="rounded-md bg-teal-100 px-2 py-0.5 text-[10px] text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                                                        {p.permission_type}
                                                    </span>
                                                </td>
                                                <td className="p-3 font-bold">{p.minutes_granted || 30} دقيقة</td>
                                                <td className="p-3 text-slate-600">{p.effective_date}</td>
                                                <td className="p-3 max-w-xs truncate text-slate-600">{p.reason || '—'}</td>
                                                <td className="p-3 font-bold">
                                                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] ${
                                                        p.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : p.status === 'Rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                                                    }`}>
                                                        {p.status}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 5: Leaves & Balances */}
            {activeTab === 'leaves' && (
                <div className="space-y-4">
                    <h4 className="text-sm font-black text-slate-900 dark:text-white">
                        {t('leaveRequestsBalances')}
                    </h4>
                    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                        {leaveRequestsList.length === 0 ? (
                            <p className="p-8 text-center text-xs text-slate-400">
                                {t('noLeaveRequestsRecorded')}
                            </p>
                        ) : (
                            <table className="w-full text-start text-xs">
                                <thead className="border-b border-slate-100 bg-slate-50 font-black text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
                                    <tr>
                                        <th className="p-3 text-start">{t('leaveType')}</th>
                                        <th className="p-3 text-start">{t('startDate')}</th>
                                        <th className="p-3 text-start">{t('endDate')}</th>
                                        <th className="p-3 text-start">{t('days')}</th>
                                        <th className="p-3 text-start">{t('reason')}</th>
                                        <th className="p-3 text-start">{t('statusX')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {leaveRequestsList.map((l, i) => (
                                        <tr key={l.id || l.leave_id || i}>
                                            <td className="p-3 font-bold">{l.leave_type || 'Annual'}</td>
                                            <td className="p-3 font-medium">{l.start_date}</td>
                                            <td className="p-3 font-medium">{l.end_date}</td>
                                            <td className="p-3 font-black text-teal-600">{l.days_count || l.days || 1} {t('daysX')}</td>
                                            <td className="p-3 max-w-xs truncate text-slate-600">{l.reason || '—'}</td>
                                            <td className="p-3">
                                                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                                    l.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : l.status === 'Rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                                                }`}>
                                                    {l.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 6: Evaluations & KPIs */}
            {activeTab === 'evaluations' && (
                <div className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h3 className="text-base font-black text-slate-900 dark:text-white">
                                {t('performanceEvaluationsKpiReviews')}
                            </h3>
                            <p className="text-xs text-slate-500">
                                {t('clinicalQualityMetricsPunctualityRecordsAnd')}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setEvalModalOpen(true)}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-black text-white shadow-xs hover:bg-teal-700 active:scale-95"
                        >
                            <Plus size={15} />
                            {t('newEvaluation')}
                        </button>
                    </div>

                    {/* Overall Score Highlight */}
                    {averageRating && (
                        <div className="flex items-center gap-4 rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500 text-white font-black text-xl shadow-xs">
                                ★
                            </div>
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                                    {t('overallKpiAverage')}
                                </span>
                                <p className="text-xl font-black text-amber-900 dark:text-amber-100">
                                    {averageRating} <span className="text-sm font-semibold">/ 5.0</span>
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Reviews List */}
                    <div className="space-y-3">
                        {evaluationsList.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400 dark:border-slate-800">
                                <Award size={36} className="mx-auto text-slate-300 dark:text-slate-600" />
                                <p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                                    {t('noEvaluationsRecordedYetClickNew')}
                                </p>
                            </div>
                        ) : (
                            evaluationsList.map((ev, i) => (
                                <div key={ev.evaluation_id || i} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                                        <div className="flex items-center gap-2.5">
                                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 font-bold dark:bg-amber-950 dark:text-amber-300">
                                                ★
                                            </span>
                                            <div>
                                                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                                                    {ev.evaluation_period}
                                                </h4>
                                                <p className="text-[11px] text-slate-400">
                                                    {t('evaluator')} {ev.evaluator_name || 'HR Management'}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="rounded-xl bg-amber-50 px-3 py-1 text-xs font-black text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                            {Number(ev.overall_score).toFixed(1)} / 5.0
                                        </span>
                                    </div>

                                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                                        <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-950">
                                            <span className="text-slate-400 block text-[10px]">{t('clinicalQuality')}</span>
                                            <span className="font-bold text-slate-700 dark:text-slate-200">{ev.clinical_quality_score || '—'} / 5</span>
                                        </div>
                                        <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-950">
                                            <span className="text-slate-400 block text-[10px]">{t('punctuality')}</span>
                                            <span className="font-bold text-slate-700 dark:text-slate-200">{ev.attendance_punctuality_score || '—'} / 5</span>
                                        </div>
                                        <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-950">
                                            <span className="text-slate-400 block text-[10px]">{t('teamwork')}</span>
                                            <span className="font-bold text-slate-700 dark:text-slate-200">{ev.teamwork_score || '—'} / 5</span>
                                        </div>
                                    </div>

                                    {ev.strengths && (
                                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                                            <strong className="text-emerald-600">{t('strengths')}</strong>
                                            {ev.strengths}
                                        </p>
                                    )}
                                    {ev.areas_for_improvement && (
                                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                            <strong className="text-amber-600">{t('improvements')}</strong>
                                            {ev.areas_for_improvement}
                                        </p>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* TAB 7: Security & Audit Movements */}
            {activeTab === 'security' && (
                <div className="space-y-6">
                    {/* Role & Permissions Form */}
                    <form onSubmit={handleSaveRoleAndPermissions} className="space-y-6">
                        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{t('users.roleConfig', { defaultValue: 'الدور الوظيفي في النظام' })}</h3>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('users.roleDesc', { defaultValue: 'يحدد الدور الوظيفي الصلاحيات والشاشات والقوائم المتاحة للمستخدم.' })}</p>

                            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {ROLE_OPTIONS.map((r) => {
                                    const IconComp = r.icon;
                                    const isSelected = selectedRole === r.id;
                                    return (
                                        <div
                                            key={r.id}
                                            onClick={() => setSelectedRole(r.id)}
                                            className={`cursor-pointer rounded-xl border p-4 transition ${
                                                isSelected
                                                    ? 'border-teal-500 bg-teal-50/50 dark:border-teal-400 dark:bg-teal-950/30'
                                                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                                                        <IconComp size={16} />
                                                    </div>
                                                    <span className="text-xs font-extrabold text-slate-900 dark:text-white">{r.label}</span>
                                                </div>
                                                {isSelected && <CheckCircle2 size={18} className="text-teal-600 dark:text-teal-400" />}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{t('users.accountControl', { defaultValue: 'حالة الحساب والتحكم بالدخول' })}</h3>
                            
                            <div className="mt-4 space-y-4">
                                <div className="flex items-center justify-between rounded-xl border border-slate-200/80 p-4 dark:border-slate-800">
                                    <div>
                                        <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">{t('users.activeToggle', { defaultValue: 'تفعيل الحساب' })}</h4>
                                        <p className="text-[11px] text-slate-500">{t('users.activeToggleDesc', { defaultValue: 'تعطيل الحساب يمنع المستخدم من تسجيل الدخول فوراً وينهي الجلسات النشطة.' })}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsActive(!isActive)}
                                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                            isActive ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-700'
                                        }`}
                                    >
                                        <span
                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                isActive ? (isRtl ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
                                            }`}
                                        />
                                    </button>
                                </div>

                                <div className="space-y-2 rounded-xl border border-slate-200/80 p-4 dark:border-slate-800">
                                    <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">{t('users.resetPassword', { defaultValue: 'إعادة تعيين كلمة المرور' })}</h4>
                                    <p className="text-[11px] text-slate-500">{t('users.resetPasswordDesc', { defaultValue: 'اترك الحقل فارغاً إذا كنت لا ترغب بتغيير كلمة المرور.' })}</p>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder={t('users.newPasswordPlaceholder', { defaultValue: 'أدخل كلمة مرور جديدة (6 أحرف على الأقل)...' })}
                                        className="w-full max-w-md rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                                    />
                                </div>
                            </div>

                            <div className="mt-6 flex justify-end">
                                <Button type="submit" disabled={isUpdating}>
                                    <Save size={16} className="me-2" />
                                    {t('common.saveChanges', { defaultValue: 'حفظ التعديلات الأمنية' })}
                                </Button>
                            </div>
                        </div>
                    </form>

                    {/* Movements / Audit Log */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                            <div className="relative flex-1">
                                <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder={t('users.searchLogs', { defaultValue: 'البحث في سجل الحركات بالنشاط، الجدول، أو عنوان IP...' })}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 ps-9 pe-4 py-2 text-xs font-semibold text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                                />
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                            {isAuditLoading ? (
                                <div className="p-6 space-y-3">
                                    <Skeleton className="h-10 w-full rounded-xl" />
                                    <Skeleton className="h-10 w-full rounded-xl" />
                                </div>
                            ) : filteredLogs.length === 0 ? (
                                <div className="p-8 text-center text-slate-400">
                                    <Activity size={32} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-400">{t('users.noMovements', { defaultValue: 'لا توجد حركات مسجلة لهذا الحساب حتى الآن.' })}</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-start text-xs">
                                        <thead className="border-b border-slate-200/80 bg-slate-50/80 font-extrabold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
                                            <tr>
                                                <th className="p-3.5 text-start">{isArabic ? 'الوقت' : 'Time'}</th>
                                                <th className="p-3.5 text-start">{isArabic ? 'العملية' : 'Operation'}</th>
                                                <th className="p-3.5 text-start">{isArabic ? 'الفئة' : 'Category'}</th>
                                                <th className="p-3.5 text-start">{isArabic ? 'الهدف' : 'Target'}</th>
                                                <th className="p-3.5 text-start">{isArabic ? 'النتيجة' : 'Outcome'}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200/80 font-semibold text-slate-700 dark:divide-slate-800 dark:text-slate-300">
                                            {filteredLogs.map((log, i) => (
                                                <tr key={log.log_id || i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                                                    <td className="p-3.5 whitespace-nowrap text-[11px] font-bold text-slate-500">
                                                        {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                                                    </td>
                                                    <td className="p-3.5 whitespace-nowrap">
                                                        <span className="inline-flex rounded-md bg-teal-100 px-2 py-0.5 text-[10px] font-black uppercase text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                                                            {log.event_code || log.action}
                                                        </span>
                                                    </td>
                                                    <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-400">
                                                        {log.category || '—'}
                                                    </td>
                                                    <td className="p-3.5 whitespace-nowrap font-mono text-[11px] text-slate-500">
                                                        {log.target_type || log.resource_table || '—'}
                                                    </td>
                                                    <td className="p-3.5 text-slate-600 dark:text-slate-400">
                                                        <pre className="max-w-xs truncate font-mono text-[10px]">
                                                            {log.outcome || '—'}
                                                        </pre>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ADD EVALUATION MODAL */}
            <Modal
                isOpen={evalModalOpen}
                onClose={() => setEvalModalOpen(false)}
                title={t('addStaffPerformanceEvaluation')}
                size="default"
            >
                <form onSubmit={handleCreateEvaluation} className="space-y-4 p-1 text-slate-800 dark:text-slate-200">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                                {t('evaluationPeriod')}
                            </label>
                            <input
                                type="text"
                                value={evalForm.evaluation_period}
                                onChange={(e) => setEvalForm({ ...evalForm, evaluation_period: e.target.value })}
                                placeholder="e.g. 2026-Q3"
                                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                                {t('overallScoreOutOf5')}
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                min="1"
                                max="5"
                                value={evalForm.overall_score}
                                onChange={(e) => setEvalForm({ ...evalForm, overall_score: e.target.value })}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">{t('quality')}</label>
                            <input
                                type="number"
                                min="1"
                                max="5"
                                value={evalForm.clinical_quality_score}
                                onChange={(e) => setEvalForm({ ...evalForm, clinical_quality_score: e.target.value })}
                                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-center text-xs font-bold dark:border-slate-800 dark:bg-slate-950"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">{t('punctualityX')}</label>
                            <input
                                type="number"
                                min="1"
                                max="5"
                                value={evalForm.attendance_punctuality_score}
                                onChange={(e) => setEvalForm({ ...evalForm, attendance_punctuality_score: e.target.value })}
                                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-center text-xs font-bold dark:border-slate-800 dark:bg-slate-950"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">{t('teamwork')}</label>
                            <input
                                type="number"
                                min="1"
                                max="5"
                                value={evalForm.teamwork_score}
                                onChange={(e) => setEvalForm({ ...evalForm, teamwork_score: e.target.value })}
                                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-center text-xs font-bold dark:border-slate-800 dark:bg-slate-950"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                            {t('keyStrengths')}
                        </label>
                        <textarea
                            rows={2}
                            value={evalForm.strengths}
                            onChange={(e) => setEvalForm({ ...evalForm, strengths: e.target.value })}
                            placeholder={t('highlightNotableStrengthsAndAccomplishments')}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-black text-slate-700 dark:text-slate-300">
                            {t('areasForImprovement')}
                        </label>
                        <textarea
                            rows={2}
                            value={evalForm.areas_for_improvement}
                            onChange={(e) => setEvalForm({ ...evalForm, areas_for_improvement: e.target.value })}
                            placeholder={t('recommendedTrainingOrImprovementAreas')}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-bold outline-none focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={() => setEvalModalOpen(false)}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900"
                        >
                            {t('cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmittingEval}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-black text-white shadow-xs hover:bg-teal-700 active:scale-95 disabled:opacity-50"
                        >
                            <Save size={14} />
                            {isSubmittingEval ? (t('saving')) : (t('saveEvaluation'))}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
