import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Bell,
    CheckCircle2,
    ChevronDown,
    Clock3,
    Command,
    Loader2,
    LogOut,
    Menu,
    Moon,
    Settings,
    ShieldAlert,
    Sun,
    User as UserIcon,
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { selectCurrentUser, logOut } from '../../store/authSlice';
import { selectPreferences, setTheme } from '../../store/preferencesSlice';
import {
    useClockInMutation,
    useClockOutMutation,
    useGetAttendanceQuery,
    useGetNotificationUnreadCountQuery,
    useLogoutMutation
} from '../../store/api';
import NotificationCenter from '../NotificationCenter';
import BreakGlassModal from '../auth/BreakGlassModal';
import LanguageToggle from '../ui/LanguageToggle';
import KeyboardShortcutsHelp from '../ui/KeyboardShortcutsHelp';
import GlobalSearch from './GlobalSearch';

const NOTIFICATION_ROLES = new Set(['Developer', 'Admin', 'Receptionist', 'HR', 'Marketing']);
const MANUAL_NOTIFICATION_ROLES = new Set(['Developer', 'Admin', 'Receptionist', 'Marketing']);
const ATTENDANCE_ROLES = new Set(['Admin', 'Receptionist', 'HR', 'Radiologist', 'Technician', 'Nurse', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing']);
const BREAK_GLASS_ROLES = new Set(['Radiologist', 'Technician', 'Nurse']);

const cx = (...classes) => classes.filter(Boolean).join(' ');

const actionBase = [
    'relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-200',
    'active:scale-95 disabled:cursor-not-allowed disabled:opacity-50',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950'
].join(' ');

const HeaderAction = ({ label, active, tone = 'neutral', children, className, triggerRef, ...props }) => {
    const tones = {
        neutral: active
            ? 'border-teal-500/40 bg-gradient-to-r from-teal-500/15 to-cyan-500/15 text-teal-800 shadow-sm shadow-teal-500/10 dark:border-teal-400/40 dark:from-teal-500/25 dark:to-cyan-500/20 dark:text-teal-300'
            : 'border-slate-200/80 bg-white/80 text-slate-600 shadow-xs backdrop-blur-sm hover:border-slate-300 hover:bg-slate-100/70 hover:text-slate-900 dark:border-slate-800/80 dark:bg-slate-900/60 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800/80 dark:hover:text-white',
        danger: 'border-rose-300/80 bg-gradient-to-r from-rose-50 to-red-50 text-rose-600 shadow-sm hover:border-rose-400 hover:bg-rose-100/80 dark:border-rose-900/60 dark:from-rose-950/40 dark:to-red-950/30 dark:text-rose-300 dark:hover:border-rose-800 dark:hover:bg-rose-900/50'
    };

    return (
        <button
            ref={triggerRef}
            type="button"
            aria-label={label}
            title={label}
            className={cx(actionBase, tones[tone], className)}
            {...props}
        >
            {children}
        </button>
    );
};

const playNotificationTone = async () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();

    try {
        if (context.state === 'suspended') await context.resume();

        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(660, context.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.12);
        gain.gain.setValueAtTime(0.04, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.2);

        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.2);
    } finally {
        window.setTimeout(() => context.close().catch(() => {}), 300);
    }
};

const getInitials = (name) => {
    const trimmed = name?.trim();
    if (!trimmed) return '';

    return trimmed
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join('')
        .toUpperCase();
};

const UserAvatar = ({ user, initials, size = 'md', label }) => {
    const [imgFailed, setImgFailed] = useState(false);
    const sizeClass = size === 'lg' ? 'h-10 w-10 text-sm' : 'h-9 w-9 text-xs';

    return (
        <span className={cx(
            'relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-tr from-cyan-600 via-teal-600 to-emerald-500 font-extrabold text-white shadow-xs ring-2 ring-white/80 dark:ring-slate-800',
            sizeClass
        )}>
            {user?.avatarUrl && !imgFailed ? (
                <img
                    src={user.avatarUrl}
                    alt={label || ''}
                    className="h-full w-full object-cover"
                    onError={() => setImgFailed(true)}
                />
            ) : initials ? (
                <span aria-hidden="true">{initials}</span>
            ) : (
                <UserIcon size={17} />
            )}
        </span>
    );
};

const AttendanceIndicator = ({ isClockedIn, isUpdating }) => {
    if (isUpdating) return <Loader2 size={14} className="animate-spin" />;

    return (
        <span className="relative flex h-2.5 w-2.5 items-center justify-center">
            {isClockedIn && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />}
            <span className={cx('relative inline-flex h-2 w-2 rounded-full', isClockedIn ? 'bg-white' : 'bg-slate-400 dark:bg-slate-500')} />
        </span>
    );
};

const AttendanceButton = ({ isClockedIn, isUpdating, onClick, t, className = '' }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={isUpdating}
        title={isClockedIn
            ? t('topbar.clockOutHint', { defaultValue: 'Clock out' })
            : t('topbar.clockInHint', { defaultValue: 'Clock in' })}
        className={cx(
            'inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-[11px] font-extrabold uppercase tracking-wider transition-all active:scale-95 shadow-xs',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-950',
            isClockedIn
                ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 text-white shadow-md shadow-emerald-500/20 ring-1 ring-emerald-400/30 hover:brightness-110'
                : 'bg-gradient-to-b from-slate-800 to-slate-950 text-slate-100 shadow-sm ring-1 ring-slate-700/50 hover:from-slate-700 hover:to-slate-900 dark:from-slate-800 dark:to-slate-900 dark:text-white dark:ring-slate-700',
            className
        )}
    >
        <AttendanceIndicator isClockedIn={isClockedIn} isUpdating={isUpdating} />
        {isUpdating
            ? t('status.updating', { defaultValue: 'Updating...' })
            : isClockedIn
                ? t('topbar.clockedIn', { defaultValue: 'Clocked In' })
                : t('topbar.clockInHint', { defaultValue: 'Clock In' })}
    </button>
);

const ProfileMenuItem = ({ icon: Icon, children, tone = 'neutral', className, ...props }) => (
    <button
        type="button"
        role="menuitem"
        className={cx(
            'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold transition active:scale-98',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500',
            tone === 'danger'
                ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
            className
        )}
        {...props}
    >
        <Icon size={16} />
        {children}
    </button>
);

const ProfileMenu = ({
    user,
    initials,
    role,
    canTrackAttendance,
    isClockedIn,
    isAttendanceUpdating,
    onAttendance,
    onGoTo,
    onLogout,
    isRtl,
    t
}) => (
    <div
        role="menu"
        dir={isRtl ? 'rtl' : 'ltr'}
        className={cx(
            'absolute top-full mt-2 w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150 dark:border-slate-800 dark:bg-slate-900/95 z-50',
            'end-0 rtl:origin-top-left ltr:origin-top-right'
        )}
    >
        <div className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/70 p-3 dark:from-slate-950 dark:to-slate-900/80">
            <div className="flex items-center gap-3">
                <UserAvatar user={user} initials={initials} size="lg" />
                <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                        {user?.name || t('common.user', { defaultValue: 'User' })}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] font-extrabold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                        {role ? t(`roles.${String(role).toLowerCase()}`, { defaultValue: role }) : t('common.guest', { defaultValue: 'Guest' })}
                    </p>
                </div>
            </div>
        </div>

        {canTrackAttendance && (
            <ProfileMenuItem icon={isAttendanceUpdating ? Loader2 : isClockedIn ? CheckCircle2 : Clock3} onClick={onAttendance} disabled={isAttendanceUpdating} className={cx('mt-1 md:hidden', isAttendanceUpdating && '[&_svg]:animate-spin')}>
                {isAttendanceUpdating
                    ? t('status.updating', { defaultValue: 'Updating...' })
                    : isClockedIn
                        ? t('topbar.clockOut', { defaultValue: 'Clock out' })
                        : t('topbar.clockIn', { defaultValue: 'Clock in' })}
            </ProfileMenuItem>
        )}

        <ProfileMenuItem icon={UserIcon} onClick={() => onGoTo('/profile')} className="mt-1">
            {t('common.myProfile', { defaultValue: 'My profile' })}
        </ProfileMenuItem>
        <ProfileMenuItem icon={Settings} onClick={() => onGoTo('/settings')}>
            {t('common.settings', { defaultValue: 'Settings' })}
        </ProfileMenuItem>

        <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />

        <ProfileMenuItem icon={LogOut} tone="danger" onClick={onLogout}>
            {t('actions.signOut', { defaultValue: 'Sign out' })}
        </ProfileMenuItem>
    </div>
);

const Topbar = ({ onMobileMenuClick, menuButtonRef }) => {
    const user = useSelector(selectCurrentUser);
    const preferences = useSelector(selectPreferences);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['common', 'navigation']);
    const isRtl = i18n.dir() === 'rtl';

    const [notificationOpen, setNotificationOpen] = useState(false);
    const [breakGlassOpen, setBreakGlassOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);

    const isDarkMode = preferences?.theme === 'dark' || (preferences?.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const toggleTheme = () => {
        dispatch(setTheme(isDarkMode ? 'light' : 'dark'));
    };

    const profileRef = useRef(null);
    const profileButtonRef = useRef(null);
    const previousUnreadRef = useRef(0);
    const unreadInitializedRef = useRef(false);

    const role = user?.role;
    const currentUserId = user?.id || user?.user_id || user?.userId;
    const canViewNotifications = NOTIFICATION_ROLES.has(role);
    const canSendManualNotifications = MANUAL_NOTIFICATION_ROLES.has(role);
    const canTrackAttendance = ATTENDANCE_ROLES.has(role);
    const canUseBreakGlass = BREAK_GLASS_ROLES.has(role);

    const { data: unreadData } = useGetNotificationUnreadCountQuery(undefined, {
        skip: !canViewNotifications,
        pollingInterval: canViewNotifications ? 60000 : 0,
        refetchOnFocus: true,
        refetchOnReconnect: true
    });

    const unreadCount = Math.max(0, Number(unreadData?.unreadCount) || 0);

    const { data: attendanceData } = useGetAttendanceQuery(
        { userId: currentUserId, activeOnly: true, limit: 1 },
        {
            skip: !canTrackAttendance || !currentUserId,
            refetchOnFocus: true
        }
    );

    const [clockIn, { isLoading: isClockingIn }] = useClockInMutation();
    const [clockOut, { isLoading: isClockingOut }] = useClockOutMutation();
    const [logout] = useLogoutMutation();

    const attendanceRecords = useMemo(() => {
        if (Array.isArray(attendanceData)) return attendanceData;
        if (Array.isArray(attendanceData?.items)) return attendanceData.items;
        if (Array.isArray(attendanceData?.records)) return attendanceData.records;
        return [];
    }, [attendanceData]);

    const activeSession = useMemo(
        () => attendanceRecords.find((record) => !record.clock_out),
        [attendanceRecords]
    );

    const isClockedIn = Boolean(activeSession);
    const isAttendanceUpdating = isClockingIn || isClockingOut;
    const userInitials = useMemo(() => getInitials(user?.name), [user?.name]);

    useEffect(() => {
        if (!profileOpen) return undefined;

        const handlePointerDown = (event) => {
            if (profileRef.current && !profileRef.current.contains(event.target)) {
                setProfileOpen(false);
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setProfileOpen(false);
                profileButtonRef.current?.focus();
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [profileOpen]);

    useEffect(() => {
        if (!canViewNotifications) {
            unreadInitializedRef.current = false;
            previousUnreadRef.current = 0;
            return;
        }

        if (!unreadInitializedRef.current) {
            unreadInitializedRef.current = true;
            previousUnreadRef.current = unreadCount;
            return;
        }

        if (preferences?.notificationSound && unreadCount > previousUnreadRef.current) {
            playNotificationTone().catch(() => {
                // Audio is optional and may be blocked by browser autoplay policies.
            });
        }

        previousUnreadRef.current = unreadCount;
    }, [canViewNotifications, preferences?.notificationSound, unreadCount]);

    const closeTransientMenus = useCallback(() => {
        setProfileOpen(false);
        setNotificationOpen(false);
    }, []);

    const handleLogout = useCallback(async () => {
        closeTransientMenus();
        try {
            await logout().unwrap();
        } catch {
            // Clear local credentials even when the server session is already unavailable.
        }
        dispatch(logOut());
        navigate('/login', { replace: true });
    }, [closeTransientMenus, dispatch, logout, navigate]);

    const handleAttendance = useCallback(async () => {
        if (isAttendanceUpdating) return;

        try {
            if (isClockedIn) {
                await clockOut({ notes: '' }).unwrap();
                toast.success(t('topbar.clockedOutSuccess', { defaultValue: 'Clocked out successfully' }));
            } else {
                await clockIn({ notes: '' }).unwrap();
                toast.success(t('topbar.clockedInSuccess', { defaultValue: 'Clocked in successfully' }));
            }
        } catch (error) {
            toast.error(
                error?.data?.message ||
                t('topbar.attendanceError', { defaultValue: 'Could not update attendance' })
            );
        }
    }, [clockIn, clockOut, isAttendanceUpdating, isClockedIn, t]);

    const closeNotifications = useCallback(() => {
        setNotificationOpen(false);
    }, []);

    const closeBreakGlass = useCallback(() => {
        setBreakGlassOpen(false);
    }, []);

    const toggleNotifications = () => {
        setProfileOpen(false);
        setNotificationOpen((current) => !current);
    };

    const toggleProfile = () => {
        setNotificationOpen(false);
        setProfileOpen((current) => !current);
    };

    const goTo = (path) => {
        setProfileOpen(false);
        navigate(path);
    };

    return (
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 shadow-xs backdrop-blur-2xl dark:border-slate-800/80 dark:bg-[#070e1b]/85 select-none">
            <div className="grid h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">
                <HeaderAction
                    triggerRef={menuButtonRef}
                    label={t('topbar.openMenu', { defaultValue: 'Open navigation menu' })}
                    onClick={onMobileMenuClick}
                    className="lg:hidden"
                >
                    <Menu size={18} />
                </HeaderAction>

                <div className="min-w-0 md:hidden">
                    <GlobalSearch />
                </div>

                <div className="hidden min-w-0 md:block md:max-w-2xl">
                    <GlobalSearch />
                </div>

                <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
                    {/* Language toggle (Responsive compact / group) */}
                    <div>
                        <LanguageToggle variant="compact" />
                    </div>

                    <KeyboardShortcutsHelp
                        renderTrigger={({ open, label, title }) => (
                            <HeaderAction
                                label={label}
                                title={title}
                                onClick={open}
                                className="hidden sm:inline-flex"
                            >
                                <Command size={18} />
                            </HeaderAction>
                        )}
                    />

                    <HeaderAction
                        label={isDarkMode ? t('topbar.lightMode', { defaultValue: 'Light mode' }) : t('topbar.darkMode', { defaultValue: 'Dark mode' })}
                        onClick={toggleTheme}
                    >
                        {isDarkMode ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} className="text-slate-600" />}
                    </HeaderAction>

                    {canTrackAttendance && (
                        <AttendanceButton
                            isClockedIn={isClockedIn}
                            isUpdating={isAttendanceUpdating}
                            onClick={handleAttendance}
                            t={t}
                            className="hidden md:inline-flex"
                        />
                    )}

                    {canUseBreakGlass && (
                        <HeaderAction
                            label={t('topbar.emergencyAccess', { defaultValue: 'Emergency access' })}
                            tone="danger"
                            onClick={() => {
                                closeTransientMenus();
                                setBreakGlassOpen(true);
                            }}
                        >
                            <ShieldAlert size={18} />
                        </HeaderAction>
                    )}

                    {canViewNotifications && (
                        <HeaderAction
                            label={t('common.notifications', { defaultValue: 'Notifications' })}
                            active={notificationOpen}
                            aria-expanded={notificationOpen}
                            aria-haspopup="dialog"
                            onClick={toggleNotifications}
                        >
                            <Bell size={18} />
                            {preferences?.showNotificationBadge !== false && unreadCount > 0 && (
                                <span className="absolute -end-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[9px] font-bold leading-none text-white dark:border-slate-950 animate-in zoom-in-50 duration-150">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            )}
                        </HeaderAction>
                    )}

                    <div className="ms-0.5 hidden h-7 w-px bg-slate-200 dark:bg-slate-800 sm:block" aria-hidden="true" />

                    <div className="relative" ref={profileRef}>
                        <button
                            ref={profileButtonRef}
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={profileOpen}
                            onClick={toggleProfile}
                            className={cx(
                                'group flex h-11 items-center gap-2 rounded-xl border border-transparent px-2 text-start transition-all duration-200 active:scale-98',
                                'hover:border-slate-200/80 hover:bg-slate-100/70 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:hover:border-slate-800 dark:hover:bg-slate-800/60',
                                profileOpen && 'border-slate-200/80 bg-slate-100/70 shadow-xs dark:border-slate-800 dark:bg-slate-800/60'
                            )}
                        >
                            <span className="hidden min-w-0 xl:block">
                                <span className="block max-w-36 truncate text-xs font-bold text-slate-900 dark:text-white">
                                    {user?.name || t('common.user', { defaultValue: 'User' })}
                                </span>
                                <span className="mt-0.5 block max-w-36 truncate text-[9px] font-extrabold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                                    {role ? t(`roles.${String(role).toLowerCase()}`, { defaultValue: role }) : t('common.guest', { defaultValue: 'Guest' })}
                                </span>
                            </span>

                            <UserAvatar user={user} initials={userInitials} label={t('topbar.userAvatar', { defaultValue: 'User avatar' })} />

                            <ChevronDown
                                size={14}
                                className={cx('hidden text-slate-400 transition-transform duration-200 sm:block', profileOpen && 'rotate-180')}
                            />
                        </button>

                        {profileOpen && (
                            <ProfileMenu
                                user={user}
                                initials={userInitials}
                                role={role}
                                canTrackAttendance={canTrackAttendance}
                                isClockedIn={isClockedIn}
                                isAttendanceUpdating={isAttendanceUpdating}
                                onAttendance={handleAttendance}
                                onGoTo={goTo}
                                onLogout={handleLogout}
                                isRtl={isRtl}
                                t={t}
                            />
                        )}
                    </div>
                </div>
            </div>

            <NotificationCenter
                isOpen={canViewNotifications && notificationOpen}
                onClose={closeNotifications}
                unreadCount={unreadCount}
                canSendManual={canSendManualNotifications}
            />

            <BreakGlassModal
                isOpen={breakGlassOpen}
                onClose={closeBreakGlass}
                t={t}
            />
        </header>
    );
};

export default Topbar;
