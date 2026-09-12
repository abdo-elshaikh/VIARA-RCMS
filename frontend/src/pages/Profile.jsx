import React, { useMemo, useRef, useState } from 'react';
import {
    Briefcase,
    Calendar,
    CalendarOff,
    Camera,
    CheckCircle2,
    Clock,
    KeyRound,
    Mail,
    ShieldCheck,
    UserRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import ProfileSettings from '../components/settings/ProfileSettings';
import SecuritySettings from '../components/settings/SecuritySettings';
import LeaveManager from '../components/hr/LeaveManager';
import StaffShiftSchedule from '../components/hr/attendance/StaffShiftSchedule';
import { selectCurrentUser } from '../store/authSlice';
import PageHeader from '../components/ui/PageHeader';

/* ─── Avatar ──────────────────────────────────────────────────────── */
const ProfileAvatar = ({ currentUser, initials, isRtl }) => {
    const fileRef = useRef(null);
    const [imgFailed, setImgFailed] = useState(false);
    const { t } = useTranslation(['settings', 'common']);

    return (
        <div className="relative shrink-0">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-tr from-slate-900 via-teal-900 to-emerald-950 text-2xl font-black text-white shadow-lg ring-2 ring-white dark:ring-slate-800 sm:h-24 sm:w-24">
                {currentUser?.avatarUrl && !imgFailed ? (
                    <img
                        src={currentUser.avatarUrl}
                        alt={t('settings.profilePage.avatarAlt', { defaultValue: isRtl ? 'صورة الملف الشخصي' : 'Profile picture' })}
                        className="h-full w-full object-cover"
                        onError={() => setImgFailed(true)}
                    />
                ) : (
                    initials || <UserRound size={30} aria-hidden="true" />
                )}
            </div>
            {/* Upload hint overlay */}
            <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label={t('settings.profilePage.changeAvatar', { defaultValue: isRtl ? 'تغيير الصورة الشخصية' : 'Change profile picture' })}
                className="absolute inset-0 flex items-end justify-center overflow-hidden rounded-2xl opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100"
            >
                <span className="flex w-full items-center justify-center gap-1.5 bg-slate-900/70 py-1.5 text-[10px] font-bold text-white backdrop-blur-sm">
                    <Camera size={12} aria-hidden="true" />
                    {isRtl ? 'تغيير' : 'Change'}
                </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" />
            {/* Online dot */}
            <span
                aria-hidden="true"
                className="absolute -bottom-0.5 -end-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"
            >
                <span className="h-2 w-2 rounded-full bg-white" />
            </span>
        </div>
    );
};

/* ─── Stat fact pill ──────────────────────────────────────────────── */
const ProfileFact = ({ icon: Icon, label, value, ltr = false, tone = 'default' }) => {
    const toneClasses = {
        default: 'border-slate-200/80 bg-slate-50/80 dark:border-slate-800/80 dark:bg-slate-950/40',
        emerald: 'border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-800/50 dark:bg-emerald-950/30',
        amber: 'border-amber-200/70  bg-amber-50/60  dark:border-amber-800/50  dark:bg-amber-950/30',
        blue: 'border-[rgba(var(--VIARA-accent-rgb),0.26)] bg-[var(--VIARA-accent-soft)] dark:border-[rgba(var(--VIARA-accent-rgb),0.32)] dark:bg-[rgba(var(--VIARA-accent-rgb),0.14)]',
    };
    const iconTones = {
        default: 'text-slate-400 dark:text-slate-500',
        emerald: 'text-emerald-600 dark:text-emerald-400',
        amber: 'text-amber-600 dark:text-amber-400',
        blue: 'text-[var(--VIARA-accent)] dark:text-[var(--VIARA-accent-text)]',
    };
    return (
        <div className={`min-w-0 rounded-2xl border p-3 ${toneClasses[tone] ?? toneClasses.default}`}>
            <div className={`flex items-center gap-2 text-[11px] font-bold ${iconTones[tone] ?? iconTones.default}`}>
                <Icon size={13} aria-hidden="true" />
                <span className="text-slate-500 dark:text-slate-400">{label}</span>
            </div>
            <p dir={ltr ? 'ltr' : 'auto'} className="mt-1.5 truncate text-xs font-black text-slate-900 dark:text-white">
                {value || '—'}
            </p>
        </div>
    );
};

/* ─── Section tab card ────────────────────────────────────────────── */
const SectionTab = ({ section, active, disabled, onClick }) => {
    const Icon = section.icon;
    return (
        <button
            type="button"
            onClick={() => onClick(section.id)}
            disabled={disabled}
            aria-current={active ? 'page' : undefined}
            className={`flex items-start gap-3.5 rounded-2xl border p-4 text-start transition-all disabled:cursor-not-allowed disabled:opacity-40 ${active
                    ? 'border-emerald-500 bg-emerald-50/80 text-emerald-950 shadow-sm ring-2 ring-emerald-500/20 dark:border-emerald-500/80 dark:bg-emerald-950/30 dark:text-emerald-100'
                    : 'border-slate-200/80 bg-white/90 text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-900'
                }`}
        >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${active
                    ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                }`}>
                <Icon size={19} aria-hidden="true" />
            </span>
            <span className="min-w-0">
                <span className="block text-xs font-black uppercase tracking-wider">{section.label}</span>
                <span className="mt-1 block text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
                    {section.description}
                </span>
            </span>
        </button>
    );
};

/* ─── Leave section header ────────────────────────────────────────── */
const LeaveHeader = ({ isRtl }) => {
    const { t } = useTranslation('workspace');
    return (
        <header className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-amber-50/40 p-5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:from-slate-950 dark:via-slate-900/90 dark:to-amber-950/20 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 ring-1 ring-amber-200 shadow-sm dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30">
                        <CalendarOff size={22} aria-hidden="true" />
                    </span>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                            {t('leave.eyebrow', { defaultValue: isRtl ? 'خدمة ذاتية للموظف' : 'Staff self-service' })}
                        </p>
                        <h2 className="mt-0.5 text-xl font-black tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                            {t('leave.title', { defaultValue: isRtl ? 'إجازاتي' : 'My Leave' })}
                        </h2>
                        <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400 sm:text-sm">
                            {t('leave.description', { defaultValue: isRtl ? 'قدّم طلبات الإجازة وتابع حالة الموافقة.' : 'Submit leave requests and track your approval status.' })}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/90 px-3 py-1 text-xs font-bold text-amber-800 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                        <Clock size={13} aria-hidden="true" />
                        {t('leave.meta.pending', { defaultValue: isRtl ? 'متابعة الموافقة' : 'Approval tracked' })}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                        <ShieldCheck size={13} aria-hidden="true" />
                        {t('leave.meta.controlled', { defaultValue: isRtl ? 'مراجعة الموارد البشرية' : 'Reviewed by HR' })}
                    </span>
                </div>
            </div>
        </header>
    );
};

/* ─── Main Profile page ───────────────────────────────────────────── */
const Profile = () => {
    const { t, i18n } = useTranslation(['settings', 'common']);
    const currentUser = useSelector(selectCurrentUser);
    const [searchParams, setSearchParams] = useSearchParams();
    const isRtl = i18n.dir() === 'rtl';

    const displayName = currentUser?.fullName || currentUser?.full_name || currentUser?.name
        || currentUser?.email
        || t('settings.accountFallback', { defaultValue: 'VIARA User' });
    const email = currentUser?.email || '—';
    const role = currentUser?.role || t('common:staff', { defaultValue: 'Staff' });
    const department = currentUser?.department || currentUser?.department_name || null;
    const jobTitle = currentUser?.jobTitle || currentUser?.job_title || null;
    const mustChangePassword = Boolean(currentUser?.mustChangePassword);

    const requestedSection = searchParams.get('section');
    const activeSection = mustChangePassword || requestedSection === 'security'
        ? 'security'
        : requestedSection === 'leave'
            ? 'leave'
            : requestedSection === 'shifts'
                ? 'shifts'
                : requestedSection === 'preferences'
                    ? 'preferences'
                    : 'identity';

    const initials = displayName
        .split(/\s+/).filter(Boolean).slice(0, 2)
        .map((p) => p[0]).join('').toUpperCase();

    /* ── Section definitions ──────────────────────────────────────── */
    const sections = useMemo(() => [
        {
            id: 'identity',
            icon: UserRound,
            label: t('settings.profilePage.identity', { defaultValue: isRtl ? 'بيانات الهوية والمهنة' : 'Identity & Professional Info' }),
            description: t('settings.profilePage.identityDesc', { defaultValue: isRtl ? 'الاسم، الترخيص الطبي، الصورة، القسم، والمسمى الوظيفي.' : 'Name, medical license, contact, department, job title, and staff bio.' }),
        },
        {
            id: 'shifts',
            icon: Clock,
            label: t('settings.profilePage.shifts', { defaultValue: isRtl ? 'جدول الورديات' : 'Shift Schedule' }),
            description: t('settings.profilePage.shiftsDesc', { defaultValue: isRtl ? 'عرض الورديات المخصصة، وتقديم طلبات تبديل أو تعديل مع الزملاء.' : 'View assigned shifts and request swaps or schedule modifications.' }),
        },
        {
            id: 'security',
            icon: KeyRound,
            label: t('settings.profilePage.security', { defaultValue: isRtl ? 'الأمان والحماية' : 'Security & Authentication' }),
            description: t('settings.profilePage.securityDesc', { defaultValue: isRtl ? 'تغيير كلمة المرور، التحقق الثنائي، والجلسات النشطة.' : 'Password changes, two-factor authentication, active sessions, and protection.' }),
        },
        {
            id: 'leave',
            icon: CalendarOff,
            label: t('settings.profilePage.leave', { defaultValue: isRtl ? 'إجازاتي' : 'My Leave' }),
            description: t('settings.profilePage.leaveDesc', { defaultValue: isRtl ? 'قدّم طلبات الإجازة وتابع حالة الموافقة من الموارد البشرية.' : 'Submit leave requests and track HR approval status.' }),
        },
    ], [t, isRtl]);

    const changeSection = (section) => {
        const next = new URLSearchParams(searchParams);
        if (section === 'security') next.set('section', 'security');
        else if (section === 'leave') next.set('section', 'leave');
        else if (section === 'shifts') next.set('section', 'shifts');
        else if (section === 'preferences') next.set('section', 'preferences');
        else next.delete('section');
        setSearchParams(next, { replace: true });
    };

    /* ── Active content ───────────────────────────────────────────── */
    const renderContent = () => {
        if (activeSection === 'security') return <SecuritySettings />;
        if (activeSection === 'leave') return (
            <div className="space-y-5">
                <LeaveHeader isRtl={isRtl} />
                <LeaveManager selfServiceOnly />
            </div>
        );
        if (activeSection === 'shifts') return (
            <StaffShiftSchedule selfService />
        );
        return <ProfileSettings />;
    };

    return (
        <div
            dir={isRtl ? 'rtl' : 'ltr'}
            lang={isRtl ? 'ar' : 'en'}
            className="mx-auto max-w-[1240px] space-y-6"
        >
            {/* ── Executive identity card ───────────────────────── */}
            <PageHeader
                icon={UserRound}
                eyebrow={t('settings.profilePage.eyebrow', { defaultValue: isRtl ? 'الملف الشخصي للحساب' : 'Account Profile' })}
                title={displayName}
                description={t('settings.profilePage.description', { defaultValue: isRtl ? 'أدر بيانات الهوية والأمان والإجازات من مساحة موحدة.' : 'Manage identity, security, and leave from one workspace.' })}
                metrics={[
                    { key: 'role', icon: Briefcase, label: t('settings.role', { defaultValue: isRtl ? 'الدور الوظيفي' : 'Role' }), value: role || '-', tone: 'teal' },
                    { key: 'department', icon: UserRound, label: t('settings.department', { defaultValue: isRtl ? 'القسم' : 'Department' }), value: department || '-', tone: 'blue' },
                    { key: 'email', icon: Mail, label: t('settings.email', { defaultValue: isRtl ? 'البريد الإلكتروني' : 'Email' }), value: email || '-', tone: 'slate' },
                    { key: 'section', icon: sections.find((section) => section.id === activeSection)?.icon || UserRound, label: t('settings.activeSection', { defaultValue: isRtl ? 'القسم الحالي' : 'Active section' }), value: sections.find((section) => section.id === activeSection)?.label || sections[0]?.label, tone: 'emerald' }
                ]}
                metricsLabel={isRtl ? 'مؤشرات سجل الحساب' : 'Account record indicators'}
            />
            <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70">
                {/* Decorative top band */}
                <div className="h-2 w-full bg-gradient-to-r from-teal-600 via-emerald-500 to-teal-400" />

                <div className="p-5 sm:p-6">
                    {/* Top row: avatar + name + badges */}
                    <div className="flex flex-wrap items-start gap-5">
                        <ProfileAvatar currentUser={currentUser} initials={initials} isRtl={isRtl} />

                        <div className="min-w-0 flex-1">
                            {/* Eyebrow + active badge */}
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                    {t('settings.profilePage.eyebrow', { defaultValue: isRtl ? 'الملف الشخصي للحساب' : 'Account Profile' })}
                                </p>
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800">
                                    <CheckCircle2 size={11} aria-hidden="true" />
                                    {t('settings.active', { defaultValue: isRtl ? 'حساب نشط' : 'Active Account' })}
                                </span>
                            </div>

                            {/* Full name */}
                            <h2 className="mt-1.5 truncate text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                                {displayName}
                            </h2>

                            {/* Role + department subtitle */}
                            <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                                {jobTitle
                                    ? `${jobTitle}${department ? ` · ${department}` : ''}`
                                    : department || role}
                            </p>

                            {/* Description */}
                            <p className="mt-2 max-w-2xl text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('settings.profilePage.description', {
                                    defaultValue: isRtl
                                        ? 'أدر بيانات الهوية، معلومات الاتصال، الترخيص الطبي، كلمة المرور، التحقق الثنائي، والجلسات النشطة، وطلبات الإجازة.'
                                        : 'Manage your clinical identity, contact details, medical license, password, two-factor security, active sessions, and leave requests.',
                                })}
                            </p>
                        </div>
                    </div>

                    {/* Fact strip */}
                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <ProfileFact
                            icon={Mail}
                            label={t('settings.email', { defaultValue: isRtl ? 'البريد الإلكتروني' : 'Email' })}
                            value={email}
                            ltr
                            tone="default"
                        />
                        <ProfileFact
                            icon={Briefcase}
                            label={t('settings.role', { defaultValue: isRtl ? 'الدور الوظيفي' : 'Role' })}
                            value={role}
                            tone="blue"
                        />
                        <ProfileFact
                            icon={ShieldCheck}
                            label={t('settings.status', { defaultValue: isRtl ? 'حالة الحماية' : 'Security' })}
                            value={t('settings.protected', { defaultValue: isRtl ? 'محمي وموثّق' : 'Protected' })}
                            tone="emerald"
                        />
                        <ProfileFact
                            icon={CalendarOff}
                            label={t('settings.profilePage.leaveLabel', { defaultValue: isRtl ? 'الإجازات' : 'Leave' })}
                            value={t('settings.profilePage.leaveHint', { defaultValue: isRtl ? 'انقر لعرض الطلبات' : 'View requests' })}
                            tone="amber"
                        />
                    </div>
                </div>
            </section>

            {/* ── Must-change-password alert ────────────────────── */}
            {mustChangePassword && (
                <div
                    role="alert"
                    className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
                >
                    <KeyRound size={20} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider">
                            {t('settings.passwordRequired.title', { defaultValue: isRtl ? 'أمّن حسابك المؤقت' : 'Change Password Required' })}
                        </p>
                        <p className="mt-1 text-xs font-semibold leading-relaxed text-amber-800 dark:text-amber-200">
                            {t('settings.passwordRequired.description', { defaultValue: isRtl ? 'غيّر كلمة المرور المؤقتة قبل الوصول إلى بقية إعدادات مساحة العمل.' : 'Change your temporary password before accessing the rest of your workspace.' })}
                        </p>
                    </div>
                </div>
            )}

            {/* ── Section switcher tabs ─────────────────────────── */}
            <nav
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                aria-label={t('settings.profilePage.sections', { defaultValue: isRtl ? 'أقسام الملف الشخصي' : 'Profile sections' })}
            >
                {sections.map((section) => (
                    <SectionTab
                        key={section.id}
                        section={section}
                        active={activeSection === section.id}
                        disabled={mustChangePassword && section.id !== 'security'}
                        onClick={changeSection}
                    />
                ))}
            </nav>

            {/* ── Active section content ────────────────────────── */}
            {renderContent()}
        </div>
    );
};

export default Profile;
