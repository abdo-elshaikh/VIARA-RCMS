import React, { useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    Briefcase,
    Building2,
    CalendarOff,
    Camera,
    CheckCircle2,
    Clock,
    KeyRound,
    Mail,
    Shield,
    ShieldCheck,
    Sparkles,
    UserRound,
    Receipt,
} from 'lucide-react';
import ProfileSettings from '../components/settings/ProfileSettings';
import PageHeader from '../components/ui/PageHeader';
import SecuritySettings from '../components/settings/SecuritySettings';
import LeaveManager from '../components/hr/LeaveManager';
import StaffShiftSchedule from '../components/hr/attendance/StaffShiftSchedule';
import ReceptionSupervisionProfile from '../components/hr/ReceptionSupervisionProfile';
import StaffSupervisionProfile from '../components/hr/StaffSupervisionProfile';
import EmployeePayrollPenalties from '../components/hr/EmployeePayrollPenalties';
import { selectCurrentUser, updateCurrentUser } from '../store/authSlice';
import { useUpdateProfileMutation, useGetReceptionSupervisorAssignmentsQuery, useGetStaffSupervisorAssignmentsQuery } from '../store/api';

/* ─── Role Tone Map ─────────────────────────────────────────────────── */
const ROLE_THEMES = {
    Receptionist: {
        badge: 'bg-teal-50 text-teal-700 border-teal-200/80 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800',
        ring: 'ring-teal-500/20',
        gradient: 'from-teal-600 to-cyan-700',
    },
    Nurse: {
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
        ring: 'ring-emerald-500/20',
        gradient: 'from-emerald-600 to-teal-700',
    },
    Technician: {
        badge: 'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
        ring: 'ring-blue-500/20',
        gradient: 'from-blue-600 to-indigo-700',
    },
    Radiologist: {
        badge: 'bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
        ring: 'ring-purple-500/20',
        gradient: 'from-purple-600 to-violet-700',
    },
    Admin: {
        badge: 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
        ring: 'ring-rose-500/20',
        gradient: 'from-rose-600 to-red-700',
    },
    HR: {
        badge: 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
        ring: 'ring-amber-500/20',
        gradient: 'from-amber-600 to-orange-700',
    },
    Default: {
        badge: 'bg-slate-100 text-slate-700 border-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        ring: 'ring-slate-500/20',
        gradient: 'from-slate-700 to-slate-900',
    },
};

/* ─── Modern Interactive Profile Avatar ──────────────────────────────── */
const ModernProfileAvatar = ({ currentUser, initials, onAvatarChange, isRtl }) => {
    const fileRef = useRef(null);
    const [imgFailed, setImgFailed] = useState(false);
    const theme = ROLE_THEMES[currentUser?.role] || ROLE_THEMES.Default;

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error(isRtl ? 'يرجى اختيار ملف صورة صالح' : 'Please select a valid image file');
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
            if (event.target?.result && onAvatarChange) {
                onAvatarChange(event.target.result);
            }
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="relative shrink-0 group">
            <div className={`relative flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br ${theme.gradient} text-2xl sm:text-3xl font-black text-white shadow-xl ring-4 ring-white/90 dark:ring-slate-800/90 transition-transform duration-300 group-hover:scale-[1.02]`}>
                {currentUser?.avatarUrl && !imgFailed ? (
                    <img
                        src={currentUser.avatarUrl}
                        alt={currentUser?.fullName || 'Avatar'}
                        className="h-full w-full object-cover"
                        onError={() => setImgFailed(true)}
                    />
                ) : (
                    <span>{initials || <UserRound size={36} />}</span>
                )}

                {/* Hover Camera Overlay */}
                <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    aria-label={isRtl ? 'تغيير الصورة الشخصية' : 'Change profile picture'}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer text-white backdrop-blur-[2px]"
                >
                    <Camera size={20} className="mb-1" />
                    <span className="text-[10px] font-bold">
                        {isRtl ? 'تغيير الصورة' : 'Change'}
                    </span>
                </button>
            </div>

            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
            />

            {/* Online Status Indicator */}
            <span
                className="absolute -bottom-1 -end-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 ring-4 ring-white dark:ring-slate-900 shadow-sm"
                title={isRtl ? 'الحساب متصل ونشط' : 'Online & Active'}
            >
                <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
            </span>
        </div>
    );
};

/* ─── Profile Component ─────────────────────────────────────────────── */
const Profile = () => {
    const { t, i18n } = useTranslation(['settings', 'common', 'workspace']);
    const currentUser = useSelector(selectCurrentUser);
    const dispatch = useDispatch();
    const [searchParams, setSearchParams] = useSearchParams();
    const isRtl = i18n.dir() === 'rtl';
    const [updateProfile] = useUpdateProfileMutation();

    const isReceptionist = currentUser?.role === 'Receptionist';

    // Query supervisor assignments ONLY for roles eligible for reception supervision
    const { data: supervisorAssignments = [] } = useGetReceptionSupervisorAssignmentsQuery(undefined, {
        skip: !isReceptionist,
    });
    const eligibleForDepartmentSupervision = ['Receptionist', 'Nurse', 'Technician', 'Radiologist', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing', 'HR', 'Admin', 'Developer'].includes(currentUser?.role);
    const { data: departmentAssignments = [] } = useGetStaffSupervisorAssignmentsQuery(undefined, {
        skip: !eligibleForDepartmentSupervision,
    });
    const isDepartmentSupervisor = Array.isArray(departmentAssignments) && departmentAssignments.some((item) =>
        new Date(item.starts_at) <= new Date() && (!item.ends_at || new Date(item.ends_at) > new Date()));

    // Check whether current user is an active supervisor
    const isSupervisor = useMemo(() => {
        if (!isReceptionist) return false;
        return Array.isArray(supervisorAssignments) && supervisorAssignments.length > 0;
    }, [isReceptionist, supervisorAssignments]);

    const displayName = currentUser?.fullName || currentUser?.full_name || currentUser?.name
        || currentUser?.email
        || (isRtl ? 'مستخدم المنظومة' : 'VIARA User');
    const email = currentUser?.email || '—';
    const role = currentUser?.role || 'Staff';
    const department = currentUser?.department || currentUser?.department_name || null;
    const jobTitle = currentUser?.jobTitle || currentUser?.job_title || null;
    const mustChangePassword = Boolean(currentUser?.mustChangePassword);

    const theme = ROLE_THEMES[role] || ROLE_THEMES.Default;

    // Build available sections, omitting supervision completely if the user is not a supervisor
    const sections = useMemo(() => {
        const list = [
            {
                id: 'identity',
                icon: UserRound,
                label: isRtl ? 'الهوية والمهنة' : 'Identity & Profession',
                badgeText: isRtl ? 'البيانات الشخصية' : 'Personal Details',
                description: isRtl
                    ? 'الاسم، الصورة الشخصية، بيانات الاتصال، القسم، والترخيص الطبي'
                    : 'Name, avatar, contact details, department, and medical license',
            },
            {
                id: 'shifts',
                icon: Clock,
                label: isRtl ? 'جدول الورديات' : 'Shift Schedule',
                badgeText: isRtl ? 'المناوبات' : 'Rotations',
                description: isRtl
                    ? 'استعراض مواعيد الورديات المجدولة وتقديم طلبات التبديل'
                    : 'View scheduled shifts and submit shift swap requests',
            },
        ];

        // "وقائمة الاشراف لاتظهر لغير المشرفين": ONLY show if user is verified supervisor
        if (isSupervisor || isDepartmentSupervisor) {
            list.push({
                id: 'supervision',
                icon: ShieldCheck,
                label: isRtl ? 'الإشراف الإداري' : 'My Supervision',
                badgeText: isRtl ? 'مهام إشرافية' : 'Supervisory',
                description: isRtl
                    ? 'إدارة الفريق، تسليمات الوردية، وتوزيع المهام الإشرافية'
                    : 'Team oversight, shift handovers, and supervisory assignments',
            });
        }

        list.push({
            id: 'security',
            icon: KeyRound,
            label: isRtl ? 'الأمان والحساب' : 'Security & Access',
            badgeText: isRtl ? 'الحماية والتوثيق' : 'Authentication',
            description: isRtl
                ? 'تغيير كلمة المرور، التحقق الثنائي، والجلسات النشطة'
                : 'Password changes, two-factor authentication, and active sessions',
        });

        list.push({
            id: 'leave',
            icon: CalendarOff,
            label: isRtl ? 'الإجازات والغياب' : 'Leave & Absence',
            badgeText: isRtl ? 'الرصيد والطلبات' : 'Self-Service',
            description: isRtl
                ? 'تقديم طلبات الإجازة ومتابعة اعتماد الموارد البشرية'
                : 'Submit leave requests and track HR approvals',
        });

        if (currentUser?.user_id && currentUser?.role !== 'Developer') {
            list.push({
                id: 'payroll',
                icon: Receipt,
                label: isRtl ? 'جزاءاتي' : 'My penalties',
                badgeText: isRtl ? 'الرواتب' : 'Payroll',
                description: isRtl
                    ? 'عرض الجزاءات المعتمدة والإقرار بها أو إرسال اعتراض مسبب.'
                    : 'View approved penalties, acknowledge them, or submit a reasoned dispute.',
            });
        }

        return list;
    }, [currentUser?.role, currentUser?.user_id, isRtl, isSupervisor, isDepartmentSupervisor]);

    // Active Section resolution with fallback
    const requestedSection = searchParams.get('section');
    const activeSection = useMemo(() => {
        if (mustChangePassword) return 'security';
        const found = sections.find((s) => s.id === requestedSection);
        return found ? found.id : 'identity';
    }, [mustChangePassword, requestedSection, sections]);

    const initials = displayName
        .split(/\s+/).filter(Boolean).slice(0, 2)
        .map((p) => p[0]).join('').toUpperCase();

    const changeSection = (sectionId) => {
        const next = new URLSearchParams(searchParams);
        if (sectionId === 'identity') {
            next.delete('section');
        } else {
            next.set('section', sectionId);
        }
        setSearchParams(next, { replace: true });
    };

    const handleAvatarUpload = async (dataUrl) => {
        try {
            const result = await updateProfile({ avatarUrl: dataUrl }).unwrap();
            dispatch(updateCurrentUser({ avatarUrl: result?.avatarUrl || dataUrl }));
            toast.success(isRtl ? 'تم تحديث الصورة الشخصية بنجاح' : 'Profile picture updated successfully');
        } catch {
            toast.error(isRtl ? 'تعذر تحديث الصورة الشخصية' : 'Failed to update profile picture');
        }
    };

    /* ── Render Content View ────────────────────────────────────────── */
    const renderContent = () => {
        if (activeSection === 'security') return <SecuritySettings />;
        if (activeSection === 'leave') return <LeaveManager selfServiceOnly />;
        if (activeSection === 'payroll') return <EmployeePayrollPenalties />;
        if (activeSection === 'shifts') return <StaffShiftSchedule selfService />;
        if (activeSection === 'supervision' && (isSupervisor || isDepartmentSupervisor)) return <div className="space-y-6">
            {isSupervisor && <ReceptionSupervisionProfile />}
            {isDepartmentSupervisor && <StaffSupervisionProfile />}
        </div>;
        return <ProfileSettings />;
    };

    return (
        <div
            dir={isRtl ? 'rtl' : 'ltr'}
            lang={isRtl ? 'ar' : 'en'}
            className="mx-auto max-w-[1240px] space-y-6 pb-12"
        >
            {/* ── UNIFIED EXECUTIVE PROFILE HEADER ──────────────────────── */}
            <PageHeader
                leading={(
                    <ModernProfileAvatar
                        currentUser={currentUser}
                        initials={initials}
                        onAvatarChange={handleAvatarUpload}
                        isRtl={isRtl}
                    />
                )}
                eyebrow={isRtl ? 'الملف الشخصي' : 'Staff Profile'}
                eyebrowIcon={Sparkles}
                title={displayName}
                description={jobTitle
                    ? `${jobTitle}${department ? ` · ${department}` : ''}`
                    : department || (isRtl ? 'القسم الطبي والإداري' : 'Clinical & Administrative Staff')}
                meta={(
                    <>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-black shadow-2xs ${theme.badge}`}>
                            <Briefcase size={12} aria-hidden="true" />
                            <span>{role}</span>
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                            <CheckCircle2 size={12} aria-hidden="true" />
                            <span>{isRtl ? 'حساب نشط وموثق' : 'Active & Verified'}</span>
                        </span>
                        {isSupervisor && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-0.5 text-xs font-black text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300">
                                <Sparkles size={11} aria-hidden="true" />
                                <span>{isRtl ? 'مشرف معتمد' : 'Authorized Supervisor'}</span>
                            </span>
                        )}
                    </>
                )}
                metrics={[
                    {
                        key: 'email',
                        icon: Mail,
                        label: isRtl ? 'البريد الإلكتروني' : 'Email Address',
                        value: email,
                        tone: 'teal',
                    },
                    {
                        key: 'department',
                        icon: Building2,
                        label: isRtl ? 'القسم' : 'Department',
                        value: department || (isRtl ? 'الاستقبال والعمليات' : 'Operations'),
                        tone: 'teal',
                    },
                    {
                        key: 'access',
                        icon: Shield,
                        label: isRtl ? 'مستوى الوصول' : 'Access Level',
                        value: role,
                        tone: 'slate',
                    },
                    {
                        key: 'security',
                        icon: ShieldCheck,
                        label: isRtl ? 'حالة الحماية' : 'Security',
                        value: isRtl ? 'محمي بكلمة مرور' : 'Protected',
                        tone: mustChangePassword ? 'amber' : 'emerald',
                    },
                ]}
                metricsLabel={isRtl ? 'مؤشرات الملف الشخصي' : 'Profile record indicators'}
            >
                <p className="hidden max-w-xl text-xs font-medium text-slate-400 sm:block dark:text-slate-500">
                    {isRtl
                        ? 'أدر بيانات الهوية المهنية، تراخيص المزاولة، أمان الحساب، ومناوبات العمل من لوحة تحكم واحدة محكمة.'
                        : 'Manage your professional identity, clinical credentials, security preferences, and shifts from a centralized dashboard.'}
                </p>
            </PageHeader>

            {/* ── MUST CHANGE PASSWORD ALERT ──────────────────────────── */}
            {mustChangePassword && (
                <div
                    role="alert"
                    className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100 shadow-sm"
                >
                    <KeyRound size={20} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider">
                            {isRtl ? 'مطلوب تعيين كلمة مرور جديدة' : 'Password Change Required'}
                        </p>
                        <p className="mt-1 text-xs font-semibold leading-relaxed text-amber-800 dark:text-amber-200">
                            {isRtl
                                ? 'يجب تحديث كلمة المرور المؤقتة قبل التمكن من الوصول إلى أقسام المنظومة الأخرى.'
                                : 'Please update your temporary password before accessing other system features.'}
                        </p>
                    </div>
                </div>
            )}

            {/* ── MODERN TAB NAVIGATION BAR ────────────────────────────── */}
            <nav
                className={`grid gap-2.5 ${sections.length === 5 ? 'sm:grid-cols-2 lg:grid-cols-5' : 'sm:grid-cols-2 lg:grid-cols-4'}`}
                aria-label={isRtl ? 'أقسام الملف الشخصي' : 'Profile Sections'}
            >
                {sections.map((section) => {
                    const Icon = section.icon;
                    const isActive = activeSection === section.id;
                    const isDisabled = mustChangePassword && section.id !== 'security';

                    return (
                        <button
                            key={section.id}
                            type="button"
                            onClick={() => changeSection(section.id)}
                            disabled={isDisabled}
                            aria-current={isActive ? 'page' : undefined}
                            className={`group relative flex flex-col justify-between rounded-2xl border p-4 text-start transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer ${
                                isActive
                                    ? 'border-teal-500/80 bg-white text-slate-900 shadow-md ring-2 ring-teal-500/20 dark:border-teal-400 dark:bg-slate-900 dark:text-white'
                                    : 'border-slate-200/80 bg-white/70 text-slate-600 hover:border-slate-300 hover:bg-white dark:border-slate-800/80 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:bg-slate-900'
                            }`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                                    isActive
                                        ? 'bg-gradient-to-br from-teal-600 to-emerald-600 text-white shadow-sm shadow-teal-600/30'
                                        : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-slate-700'
                                }`}>
                                    <Icon size={18} />
                                </span>
                                <span className={`text-[10px] font-bold rounded-md px-2 py-0.5 ${
                                    isActive
                                        ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300'
                                        : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                                }`}>
                                    {section.badgeText}
                                </span>
                            </div>

                            <div className="mt-3 min-w-0">
                                <h3 className={`text-xs sm:text-sm font-black transition-colors ${
                                    isActive ? 'text-teal-900 dark:text-teal-200' : 'text-slate-800 dark:text-slate-200'
                                }`}>
                                    {section.label}
                                </h3>
                                <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
                                    {section.description}
                                </p>
                            </div>

                            {isActive && (
                                <span className="absolute bottom-0 inset-x-6 h-0.5 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500" />
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* ── ACTIVE SECTION CONTENT ───────────────────────────────── */}
            <main className="animate-in fade-in-50 duration-200">
                {renderContent()}
            </main>
        </div>
    );
};

export default Profile;
