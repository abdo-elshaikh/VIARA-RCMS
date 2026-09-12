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
    Zap,
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { clearEmergencyAccess, selectCurrentUser, logOut } from '../../store/authSlice';
import { selectPreferences, setTheme } from '../../store/preferencesSlice';
import {
    useClockInMutation,
    useClockOutMutation,
    useGetAttendanceQuery,
    useGetBreakGlassStatusQuery,
    useGetMyNotificationsQuery,
    useLogoutMutation
} from '../../store/api';
import NotificationCenter from '../NotificationCenter';
import BreakGlassModal from '../auth/BreakGlassModal';
import AttendanceQuickPunchCard from './AttendanceQuickPunchCard';
import AttendancePermissionModal from '../hr/attendance/AttendancePermissionModal';
import LanguageToggle from '../ui/LanguageToggle';
import KeyboardShortcutsHelp from '../ui/KeyboardShortcutsHelp';
import GlobalSearch from './GlobalSearch';
import { getLocalizedDemoUserName } from '../../utils/localizedDemoData';
import { isEmergencyAccessActive } from '../../utils/effectivePermissions';
import { getNavigationRoutes } from '../../config/routes';

const NOTIFICATION_ROLES = new Set(['Developer', 'Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing']);
const MANUAL_NOTIFICATION_ROLES = new Set(['Developer', 'Admin', 'Receptionist', 'Marketing']);
const ATTENDANCE_ROLES = new Set(['Admin', 'Receptionist', 'HR', 'Radiologist', 'Technician', 'Nurse', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing']);
const BREAK_GLASS_ROLES = new Set(['Radiologist', 'Technician', 'Nurse']);

const cx = (...classes) => classes.filter(Boolean).join(' ');

const getWorkspaceLabel = (pathname, routes, t) => {
    const route = routes
        .filter((item) => pathname === item.to || (item.to !== '/dashboard' && pathname.startsWith(`${item.to}/`)))
        .sort((a, b) => b.to.length - a.to.length)[0];
    return route ? t(`items.${route.key}`, { ns: 'navigation', defaultValue: route.key }) : t('app.name', { ns: 'common', defaultValue: 'VIARA' });
};

const actionBase = [
    'topbar-action relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all duration-200',
    'active:scale-95 disabled:cursor-not-allowed disabled:opacity-50',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
].join(' ');

const HeaderAction = ({ label, active, tone = 'neutral', children, className, triggerRef, ...props }) => {
    const tones = {
        neutral: active
            ? 'topbar-action-active'
            : 'topbar-action-idle',
        danger: 'topbar-action-danger'
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

const playNotificationTone = async (requestedVolume = 0.5) => {
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
        const volume = Math.min(1, Math.max(0.1, Number(requestedVolume) || 0.5));
        gain.gain.setValueAtTime(volume * 0.08, context.currentTime);
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

const isWithinQuietHours = (preferences) => {
    if (!preferences?.notificationQuietHours) return false;
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    const toMinutes = (value, fallback) => {
        const [hours, minutes] = String(value || fallback).split(':').map(Number);
        return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0;
    };
    const start = toMinutes(preferences.notificationQuietStart, '22:00');
    const end = toMinutes(preferences.notificationQuietEnd, '07:00');
    if (start === end) return true;
    return start < end ? current >= start && current < end : current >= start || current < end;
};

/* ── Live Digital Clock ─────────────────────────────────────────────── */
const LiveClock = ({ isRtl }) => {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    const locale = isRtl ? 'ar-EG' : 'en-US';
    const timeStr = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: true });
    const dayStr  = now.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });

    return (
        <div className="hidden lg:flex flex-col items-center leading-none select-none">
            <span className="topbar-clock-time font-mono text-[13px] font-black tracking-tight">{timeStr}</span>
            <span className="topbar-clock-date text-[9px] font-bold uppercase tracking-widest opacity-60 mt-px">{dayStr}</span>
        </div>
    );
};

/* ── User Avatar ────────────────────────────────────────────────────── */
const UserAvatar = ({ user, initials, size = 'md', label }) => {
    const [imgFailed, setImgFailed] = useState(false);
    const sizeClass = size === 'lg' ? 'h-10 w-10 text-sm' : 'h-8 w-8 text-xs';

    return (
        <span className={cx(
            'topbar-user-avatar relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl font-extrabold shadow-md ring-2',
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
                <UserIcon size={15} />
            )}
        </span>
    );
};

/* ── Attendance Status Dot ──────────────────────────────────────────── */
const AttendanceIndicator = ({ isClockedIn, isUpdating }) => {
    if (isUpdating) return <Loader2 size={13} className="animate-spin" />;

    return (
        <span className="relative flex h-2.5 w-2.5 items-center justify-center">
            {isClockedIn && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />}
            <span className={cx('relative inline-flex h-2 w-2 rounded-full', isClockedIn ? 'bg-current' : 'bg-[var(--VIARA-muted)]')} />
        </span>
    );
};

/* ── Attendance Pill Button ─────────────────────────────────────────── */
const AttendanceButton = ({ isClockedIn, isUpdating, elapsedText, isOpen, onClick, t, className = '' }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={isUpdating}
        title={isClockedIn
            ? t('topbar.clockOutHint', { defaultValue: 'إدارة جلسة الحضور والانصراف' })
            : t('topbar.clockInHint', { defaultValue: 'تسجيل الحضور السريع' })}
        className={cx(
            'group relative inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[11px] font-extrabold tracking-wide transition-all active:scale-95 shadow-sm',
            'topbar-attendance focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
            isClockedIn
                ? 'topbar-attendance-active'
                : 'topbar-attendance-idle',
            isOpen && 'ring-2 ring-teal-500/40 shadow-md scale-[0.98]',
            className
        )}
    >
        <AttendanceIndicator isClockedIn={isClockedIn} isUpdating={isUpdating} />
        <span className="font-bold whitespace-nowrap">
            {isUpdating
                ? t('status.updating', { defaultValue: 'جارِ...' })
                : isClockedIn
                    ? t('topbar.clockedIn', { defaultValue: 'حاضر' })
                    : t('topbar.clockInHint', { defaultValue: 'حضور' })}
        </span>
        {isClockedIn && elapsedText && (
            <span className="inline-flex items-center rounded-md bg-white/20 px-1.5 py-0.5 font-mono text-[9px] font-black tracking-tight">
                {elapsedText}
            </span>
        )}
        <ChevronDown size={11} className={cx('opacity-70 transition-transform duration-200', isOpen && 'rotate-180')} />
    </button>
);

/* ── Profile Drop-down Menu Item ────────────────────────────────────── */
const ProfileMenuItem = ({ icon: Icon, children, tone = 'neutral', className, ...props }) => (
    <button
        type="button"
        role="menuitem"
        className={cx(
            'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold transition active:scale-98',
            'topbar-menu-item focus-visible:outline-none focus-visible:ring-2',
            tone === 'danger'
                ? 'topbar-menu-item-danger'
                : 'topbar-menu-item-neutral',
            className
        )}
        {...props}
    >
        <Icon size={15} />
        {children}
    </button>
);

/* ── Profile Drop-down Menu ─────────────────────────────────────────── */
const ProfileMenu = ({
    user,
    displayName,
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
            'topbar-profile-menu absolute top-full z-50 mt-2 w-[min(310px,calc(100vw-24px))] overflow-hidden rounded-2xl border p-1.5 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150',
            'end-0 rtl:origin-top-left ltr:origin-top-right'
        )}
    >
        {/* User summary header */}
        <div className="topbar-profile-summary rounded-xl p-3.5 mb-1">
            <div className="flex items-center gap-3">
                <UserAvatar user={user} initials={initials} size="lg" />
                <div className="min-w-0 flex-1">
                    <p className="topbar-primary-copy truncate text-sm font-bold leading-tight">
                        {displayName || t('common.user', { defaultValue: 'User' })}
                    </p>
                    <p className="topbar-accent-copy mt-1 truncate text-[10px] font-extrabold uppercase tracking-wider">
                        {role ? t(`roles.${String(role).toLowerCase()}`, { defaultValue: role }) : t('common.guest', { defaultValue: 'Guest' })}
                    </p>
                </div>
                {/* Online indicator */}
                <span className="flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                    <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
            </div>
        </div>

        {canTrackAttendance && (
            <ProfileMenuItem
                icon={isAttendanceUpdating ? Loader2 : isClockedIn ? CheckCircle2 : Clock3}
                onClick={onAttendance}
                disabled={isAttendanceUpdating}
                className={cx('md:hidden', isAttendanceUpdating && '[&_svg]:animate-spin')}
            >
                {isAttendanceUpdating
                    ? t('status.updating', { defaultValue: 'Updating...' })
                    : isClockedIn
                        ? t('topbar.clockOut', { defaultValue: 'Clock out' })
                        : t('topbar.clockIn', { defaultValue: 'Clock in' })}
            </ProfileMenuItem>
        )}

        <ProfileMenuItem icon={UserIcon} onClick={() => onGoTo('/profile')}>
            {t('common.myProfile', { defaultValue: 'My profile' })}
        </ProfileMenuItem>
        <ProfileMenuItem icon={Settings} onClick={() => onGoTo('/settings')}>
            {t('common.settings', { defaultValue: 'Settings' })}
        </ProfileMenuItem>

        <div className="topbar-divider my-1.5 h-px" />

        <ProfileMenuItem icon={LogOut} tone="danger" onClick={onLogout}>
            {t('actions.signOut', { defaultValue: 'Sign out' })}
        </ProfileMenuItem>
    </div>
);

/* ══════════════════════════════════════════════════════════════════════
   Main Topbar Component
   ══════════════════════════════════════════════════════════════════════ */
const Topbar = ({ onMobileMenuClick, menuButtonRef }) => {
    const user = useSelector(selectCurrentUser);
    const preferences = useSelector(selectPreferences);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const { t, i18n } = useTranslation(['common', 'navigation']);
    const isRtl = i18n.dir() === 'rtl';
    const workspaceLabel = useMemo(() => getWorkspaceLabel(location.pathname, getNavigationRoutes(), t), [location.pathname, t]);

    const [notificationOpen, setNotificationOpen] = useState(false);
    const [breakGlassOpen, setBreakGlassOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [punchCardOpen, setPunchCardOpen] = useState(false);
    const [permissionModalOpen, setPermissionModalOpen] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

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
    const emergencyAccessActive = isEmergencyAccessActive(user);
    const { data: emergencyStatus } = useGetBreakGlassStatusQuery(undefined, {
        skip: !canUseBreakGlass || !emergencyAccessActive,
        pollingInterval: emergencyAccessActive ? 30000 : 0,
        refetchOnFocus: true,
        refetchOnReconnect: true,
    });

    useEffect(() => {
        if (emergencyStatus && !emergencyStatus.active && emergencyAccessActive) {
            dispatch(clearEmergencyAccess());
        }
    }, [dispatch, emergencyAccessActive, emergencyStatus]);

    useEffect(() => {
        if (!emergencyAccessActive) return undefined;
        const remaining = Number(user?.breakGlassExpiry) - Date.now();
        if (remaining <= 0) {
            dispatch(clearEmergencyAccess());
            return undefined;
        }
        const timeoutId = window.setTimeout(() => dispatch(clearEmergencyAccess()), remaining);
        return () => window.clearTimeout(timeoutId);
    }, [dispatch, emergencyAccessActive, user?.breakGlassExpiry]);

    const { data: unreadData } = useGetMyNotificationsQuery({ limit: 1, offset: 0 }, {
        skip: !canViewNotifications,
        pollingInterval: canViewNotifications ? 60000 : 0,
        refetchOnFocus: true,
        refetchOnReconnect: true
    });

    const unreadCount = Math.max(0, Number(unreadData?.counts?.unread) || 0);

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
    const displayUserName = getLocalizedDemoUserName(user?.name, t);
    const userInitials = useMemo(() => getInitials(displayUserName), [displayUserName]);

    // Live active session duration ticker
    useEffect(() => {
        if (!isClockedIn || !activeSession?.clock_in) {
            setElapsedSeconds(0);
            return undefined;
        }
        const startTime = new Date(activeSession.clock_in).getTime();
        const tick = () => {
            const diff = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
            setElapsedSeconds(diff);
        };
        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [isClockedIn, activeSession?.clock_in]);

    const elapsedDurationText = useMemo(() => {
        if (!isClockedIn || elapsedSeconds <= 0) return '';
        const hrs = Math.floor(elapsedSeconds / 3600);
        const mins = Math.floor((elapsedSeconds % 3600) / 60);
        const secs = elapsedSeconds % 60;
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }, [isClockedIn, elapsedSeconds]);

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

        if (preferences?.notificationSound && !isWithinQuietHours(preferences) && unreadCount > previousUnreadRef.current) {
            playNotificationTone(preferences?.soundVolume).catch(() => {
                // Audio is optional and may be blocked by browser autoplay policies.
            });
        }

        previousUnreadRef.current = unreadCount;
    }, [canViewNotifications, preferences, unreadCount]);

    const closeTransientMenus = useCallback(() => {
        setProfileOpen(false);
        setNotificationOpen(false);
        setPunchCardOpen(false);
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

    const handleAttendanceToggle = useCallback(() => {
        setProfileOpen(false);
        setNotificationOpen(false);
        setPunchCardOpen((current) => !current);
    }, []);

    const handleDirectClockIn = useCallback(async (notes = '') => {
        if (isAttendanceUpdating) return;
        try {
            await clockIn({ notes: notes || '' }).unwrap();
            toast.success(t('topbar.clockedInSuccess', { defaultValue: 'تم تسجيل الحضور بنجاح' }));
        } catch (error) {
            toast.error(
                error?.data?.message ||
                t('topbar.attendanceError', { defaultValue: 'تعذر تسجيل الحضور' })
            );
        }
    }, [clockIn, isAttendanceUpdating, t]);

    const handleDirectClockOut = useCallback(async (notes = '') => {
        if (isAttendanceUpdating) return;
        try {
            await clockOut({ notes: notes || '' }).unwrap();
            toast.success(t('topbar.clockedOutSuccess', { defaultValue: 'تم تسجيل الانصراف بنجاح' }));
        } catch (error) {
            const errorCode = error?.data?.code;
            if (errorCode === 'OPEN_CASHIER_SHIFT') {
                toast.error(
                    t('topbar.openCashierShiftError', {
                        defaultValue: error?.data?.message || 'يجب إغلاق وردية الخزينة وجرد الدرج أولاً قبل تسجيل الانصراف.'
                    }),
                    { duration: 5000 }
                );
            } else if (errorCode === 'OPEN_RECEPTION_SHIFT') {
                toast.error(
                    t('topbar.openReceptionShiftError', {
                        defaultValue: error?.data?.message || 'يجب تسليم أو إنهاء مهام الاستقبال وإغلاق وردية الشباك أولاً قبل تسجيل الانصراف.'
                    }),
                    { duration: 5000 }
                );
            } else {
                toast.error(
                    error?.data?.message ||
                    t('topbar.attendanceError', { defaultValue: 'تعذر تسجيل الانصراف' })
                );
            }
        }
    }, [clockOut, isAttendanceUpdating, t]);

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
        <header className="app-topbar sticky top-0 z-40 select-none">
            {/* Gradient accent line at the bottom */}
            <div className="app-topbar-accent-line" aria-hidden="true" />

            {/* Main topbar row */}
            <div className="app-topbar-row grid h-[3.5rem] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-5">

                {/* ── Left: Hamburger (mobile) ─────────────────────────── */}
                <HeaderAction
                    triggerRef={menuButtonRef}
                    label={t('topbar.openMenu', { defaultValue: 'Open navigation menu' })}
                    onClick={onMobileMenuClick}
                    className="lg:hidden"
                >
                    <Menu size={17} />
                </HeaderAction>

                {/* ── Centre: Search ───────────────────────────────────── */}
                {/* Mobile: icon-only trigger rendered inside GlobalSearch */}
                <div className="min-w-0 md:hidden">
                    <GlobalSearch />
                </div>
                {/* Desktop: full search bar */}
                <div className="topbar-search-slot hidden min-w-0 items-center gap-3 md:flex md:max-w-3xl lg:max-w-[52rem]">
                    <GlobalSearch />
                    <div className="topbar-workspace-context hidden min-w-0 items-center gap-2 lg:flex" aria-label={t('topbar.currentWorkspace', { defaultValue: 'Current workspace' })}>
                        <span className="topbar-workspace-dot" aria-hidden="true" />
                        <span className="truncate text-xs font-black text-[var(--VIARA-ink)]">{workspaceLabel}</span>
                    </div>
                </div>

                {/* ── Right: Actions cluster ───────────────────────────── */}
                <div className="topbar-actions flex min-w-0 items-center justify-end gap-1 sm:gap-1.5">

                    {/* Live clock (lg+) */}
                    <LiveClock isRtl={isRtl} />

                    {/* Vertical divider */}
                    <div className="topbar-divider mx-1 hidden h-6 w-px lg:block" aria-hidden="true" />

                    {/* Language toggle */}
                    <div>
                        <LanguageToggle variant={isDarkMode ? 'dark' : 'compact'} />
                    </div>

                    {/* Keyboard shortcuts (sm+) */}
                    <KeyboardShortcutsHelp
                        renderTrigger={({ open, label, title }) => (
                            <HeaderAction
                                label={label}
                                title={title}
                                onClick={open}
                                className="hidden sm:inline-flex"
                            >
                                <Command size={16} />
                            </HeaderAction>
                        )}
                    />

                    {/* Theme toggle */}
                    <HeaderAction
                        label={isDarkMode ? t('topbar.lightMode', { defaultValue: 'Light mode' }) : t('topbar.darkMode', { defaultValue: 'Dark mode' })}
                        onClick={toggleTheme}
                    >
                        {isDarkMode
                            ? <Sun size={16} className="topbar-theme-icon" />
                            : <Moon size={16} className="topbar-theme-icon" />}
                    </HeaderAction>

                    {/* Attendance pill (sm+) */}
                    {canTrackAttendance && (
                        <AttendanceButton
                            isClockedIn={isClockedIn}
                            isUpdating={isAttendanceUpdating}
                            elapsedText={elapsedDurationText}
                            isOpen={punchCardOpen}
                            onClick={handleAttendanceToggle}
                            t={t}
                            className="hidden sm:inline-flex"
                        />
                    )}

                    {/* Break-glass emergency button */}
                    {canUseBreakGlass && (
                        <HeaderAction
                            label={emergencyAccessActive
                                ? t('topbar.emergencyAccessActive', { defaultValue: 'Emergency access active' })
                                : t('topbar.emergencyAccess', { defaultValue: 'Emergency access' })}
                            tone="danger"
                            active={emergencyAccessActive || breakGlassOpen}
                            aria-pressed={emergencyAccessActive}
                            onClick={() => {
                                closeTransientMenus();
                                setBreakGlassOpen(true);
                            }}
                        >
                            {emergencyAccessActive
                                ? <Zap size={16} className="animate-pulse" />
                                : <ShieldAlert size={16} />}
                        </HeaderAction>
                    )}

                    {/* Notifications */}
                    {canViewNotifications && (
                        <HeaderAction
                            label={t('common.notifications', { defaultValue: 'Notifications' })}
                            active={notificationOpen}
                            aria-expanded={notificationOpen}
                            aria-haspopup="dialog"
                            onClick={toggleNotifications}
                        >
                            <Bell size={16} className={unreadCount > 0 ? 'topbar-bell-active' : ''} />
                            {preferences?.showNotificationBadge !== false && unreadCount > 0 && (
                                <span className="topbar-notif-badge absolute -end-1.5 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-[var(--VIARA-surface)] bg-[var(--danger)] px-1 text-[9px] font-black leading-none text-white dark:border-[var(--VIARA-canvas)] animate-in zoom-in-50 duration-150">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            )}
                        </HeaderAction>
                    )}

                    {/* Divider before profile */}
                    <div className="topbar-divider ms-0.5 hidden h-6 w-px sm:block" aria-hidden="true" />

                    {/* Profile button */}
                    <div className="relative" ref={profileRef}>
                        <button
                            ref={profileButtonRef}
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={profileOpen}
                            onClick={toggleProfile}
                            className={cx(
                                'topbar-profile-trigger group flex h-9 items-center gap-2 rounded-xl border px-1.5 sm:px-2 text-start transition-all duration-200 active:scale-[0.97]',
                                'focus-visible:outline-none focus-visible:ring-2',
                                profileOpen && 'topbar-profile-trigger-active'
                            )}
                        >
                            {/* Name + role (lg+) */}
                            <span className="hidden min-w-0 lg:block">
                                <span className="topbar-primary-copy block max-w-[7.5rem] truncate text-[11px] font-bold leading-tight">
                                    {displayUserName || t('common.user', { defaultValue: 'User' })}
                                </span>
                                <span className="topbar-accent-copy mt-0.5 block max-w-[7.5rem] truncate text-[9px] font-extrabold uppercase tracking-wider">
                                    {role ? t(`roles.${String(role).toLowerCase()}`, { defaultValue: role }) : t('common.guest', { defaultValue: 'Guest' })}
                                </span>
                            </span>

                            <UserAvatar user={user} initials={userInitials} label={t('topbar.userAvatar', { defaultValue: 'User avatar' })} />

                            <ChevronDown
                                size={12}
                                className={cx('topbar-muted-copy hidden transition-transform duration-200 sm:block', profileOpen && 'rotate-180')}
                            />
                        </button>

                        {profileOpen && (
                            <ProfileMenu
                                user={user}
                                displayName={displayUserName}
                                initials={userInitials}
                                role={role}
                                canTrackAttendance={canTrackAttendance}
                                isClockedIn={isClockedIn}
                                isAttendanceUpdating={isAttendanceUpdating}
                                onAttendance={handleAttendanceToggle}
                                onGoTo={goTo}
                                onLogout={handleLogout}
                                isRtl={isRtl}
                                t={t}
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Punch card panel */}
            {canTrackAttendance && (
                <AttendanceQuickPunchCard
                    isOpen={punchCardOpen}
                    onClose={() => setPunchCardOpen(false)}
                    isClockedIn={isClockedIn}
                    activeSession={activeSession}
                    onClockIn={handleDirectClockIn}
                    onClockOut={handleDirectClockOut}
                    onRequestPermission={() => {
                        setPunchCardOpen(false);
                        setPermissionModalOpen(true);
                    }}
                    onNavigateShifts={() => {
                        setPunchCardOpen(false);
                        navigate('/profile?section=shifts');
                    }}
                    isUpdating={isAttendanceUpdating}
                    user={user}
                    isRtl={isRtl}
                />
            )}

            {canTrackAttendance && (
                <AttendancePermissionModal
                    isOpen={permissionModalOpen}
                    onClose={() => setPermissionModalOpen(false)}
                    defaultUserId={currentUserId}
                />
            )}

            <NotificationCenter
                isOpen={canViewNotifications && notificationOpen}
                onClose={closeNotifications}
                unreadCount={unreadCount}
                canSendManual={canSendManualNotifications}
            />

            <BreakGlassModal
                isOpen={breakGlassOpen}
                onClose={closeBreakGlass}
            />
        </header>
    );
};

export default Topbar;
