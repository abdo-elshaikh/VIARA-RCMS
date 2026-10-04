import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    Bell,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Clock3,
    Loader2,
    LogOut,
    Menu,
    Moon,
    Settings,
    Shield,
    ShieldAlert,
    SlidersHorizontal,
    Sun,
    User as UserIcon,
    Zap,
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { clearEmergencyAccess, selectCurrentUser, logOut } from '../../store/authSlice';
import {
    DEFAULT_PREFERENCES,
    getPersistablePreferences,
    selectPreferences,
    updateAllPreferences
} from '../../store/preferencesSlice';
import {
    useClockInMutation,
    useClockOutMutation,
    useGetAttendanceQuery,
    useGetBreakGlassStatusQuery,
    useGetMyNotificationsQuery,
    useLogoutMutation,
    useUpdatePreferencesMutation
} from '../../store/api';
import QuickPreferencesMenu from './QuickPreferencesMenu';
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

const HeaderAction = ({ label, active, tone = 'neutral', children, className, triggerRef, ...props }) => (
    <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-pressed={active === undefined ? undefined : Boolean(active)}
        data-active={active ? 'true' : undefined}
        data-tone={tone === 'danger' ? 'danger' : undefined}
        className={cx(
            'vx-icon-btn',
            tone === 'danger'
                ? 'topbar-action-danger'
                : active
                    ? 'topbar-action-active'
                    : 'topbar-action-idle',
            className
        )}
        {...props}
    >
        {children}
    </button>
);

const playNotificationTone = async (requestedVolume = 0.5) => {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        const context = new AudioContextClass();
        if (typeof context.addEventListener === 'function') {
            context.addEventListener('error', () => { });
        }

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
            window.setTimeout(() => {
                try {
                    context.close().catch(() => { });
                } catch {
                    // Ignore close issues
                }
            }, 300);
        }
    } catch {
        // Gracefully ignore audio hardware/renderer unavailability
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

/* ── Live clock ─────────────────────────────────────────────────────── */
const LiveClock = ({ isRtl, timezone, timeFormat }) => {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 10000);
        return () => clearInterval(id);
    }, []);

    const detectedTimezone = useMemo(() => {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        } catch {
            return 'UTC';
        }
    }, []);

    const activeTz = timezone && timezone !== 'auto' ? timezone : detectedTimezone;
    const is12Hour = timeFormat ? timeFormat === '12h' : true;
    const locale = isRtl ? 'ar-EG' : 'en-US';

    const { timeStr, dayStr, tzLabel } = useMemo(() => {
        try {
            return {
                timeStr: now.toLocaleTimeString(locale, { timeZone: activeTz, hour: '2-digit', minute: '2-digit', hour12: is12Hour }),
                dayStr: now.toLocaleDateString(locale, { timeZone: activeTz, weekday: 'short', day: 'numeric', month: 'short' }),
                tzLabel: activeTz.split('/').pop().replace('_', ' ')
            };
        } catch {
            return {
                timeStr: now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: is12Hour }),
                dayStr: now.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }),
                tzLabel: 'Local'
            };
        }
    }, [now, locale, activeTz, is12Hour]);

    return (
        <div className="vx-clock hidden select-none lg:flex" title={`${tzLabel} (${is12Hour ? '12h' : '24h'})`}>
            <time dateTime={now.toISOString()} className="vx-clock-time">{timeStr}</time>
            <span className="vx-clock-date">{dayStr}</span>
        </div>
    );
};

/* ── User avatar ────────────────────────────────────────────────────── */
const UserAvatar = ({ user, initials, size = 'md', label, className = '' }) => {
    const [imgFailed, setImgFailed] = useState(false);

    return (
        <span
            className={cx('vx-avatar topbar-user-avatar', className)}
            data-size={size === 'lg' ? 'lg' : undefined}
        >
            {user?.avatarUrl && !imgFailed ? (
                <img src={user.avatarUrl} alt={label || ''} className="h-full w-full object-cover" onError={() => setImgFailed(true)} />
            ) : initials ? (
                <span aria-hidden="true">{initials}</span>
            ) : (
                <UserIcon size={16} />
            )}
        </span>
    );
};

/* ── Attendance status dot ──────────────────────────────────────────── */
const AttendanceIndicator = ({ isClockedIn, isUpdating, isStale }) => {
    if (isUpdating) return <Loader2 size={14} className="animate-spin" />;

    return (
        <span className="relative flex h-2.5 w-2.5 items-center justify-center" aria-hidden="true">
            {isClockedIn && !isStale && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50 motion-reduce:animate-none" />
            )}
            <span className={cx('relative inline-flex h-2 w-2 rounded-full', isClockedIn || isStale ? 'bg-current' : 'bg-[var(--VIARA-muted)]')} />
        </span>
    );
};

/* ── Attendance presence chip ───────────────────────────────────────── */
const AttendanceButton = ({ isClockedIn, isStaleSession, isUpdating, elapsedText, isOpen, onClick, t, className = '' }) => (
    <button
        type="button"
        data-punch-trigger
        data-state={isStaleSession ? 'stale' : isClockedIn ? 'active' : 'idle'}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={onClick}
        disabled={isUpdating}
        title={isStaleSession
            ? t('topbar.staleSessionHint', { defaultValue: 'جلسة حضور معلقة لأكثر من 24 ساعة - انقر لإنهاء الوردية' })
            : isClockedIn
                ? t('topbar.clockOutHint', { defaultValue: 'إدارة جلسة الحضور والانصراف' })
                : t('topbar.clockInHint', { defaultValue: 'تسجيل الحضور السريع' })}
        className={cx('vx-presence', className)}
    >
        <AttendanceIndicator isClockedIn={isClockedIn} isUpdating={isUpdating} isStale={isStaleSession} />
        <span className="whitespace-nowrap">
            {isUpdating
                ? t('status.updating', { defaultValue: 'جارِ...' })
                : isStaleSession
                    ? t('topbar.staleSession', { defaultValue: 'معلقة >24س' })
                    : isClockedIn
                        ? t('topbar.clockedIn', { defaultValue: 'حاضر' })
                        : t('topbar.clockInHint', { defaultValue: 'حضور' })}
        </span>
        {isClockedIn && elapsedText && <span className="vx-presence-time">{elapsedText}</span>}
        <ChevronDown size={14} aria-hidden="true" className={cx('opacity-60 transition-transform duration-200', isOpen && 'rotate-180')} />
    </button>
);

/* ── Role Badge Styling Helper ──────────────────────────────────────── */
const getRoleBadgeStyle = (role) => {
    const r = String(role || '').toLowerCase();
    if (r.includes('admin') || r.includes('developer')) {
        return 'bg-indigo-50 text-indigo-700 border-indigo-200/80 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/60';
    }
    if (r.includes('radio') || r.includes('doctor') || r.includes('physician')) {
        return 'bg-sky-50 text-sky-700 border-sky-200/80 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800/60';
    }
    if (r.includes('tech')) {
        return 'bg-teal-50 text-teal-700 border-teal-200/80 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800/60';
    }
    if (r.includes('nurse')) {
        return 'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/60';
    }
    if (r.includes('reception')) {
        return 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60';
    }
    if (r.includes('cashier') || r.includes('accountant') || r.includes('finance')) {
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
};

/* ── Profile menu item ──────────────────────────────────────────────── */
const ProfileMenuItem = ({
    icon: Icon,
    children,
    subtitle,
    tone = 'neutral',
    badge,
    className,
    isRtl = false,
    ...props
}) => {
    const isDanger = tone === 'danger';
    const isWarn = tone === 'warn';

    return (
        <button
            type="button"
            role="menuitem"
            data-tone={tone === 'neutral' ? undefined : tone}
            className={cx(
                'vx-menu-item topbar-menu-item group relative flex w-full items-center gap-3 rounded-xl p-2.5 text-start transition-all duration-150',
                isDanger
                    ? 'topbar-menu-item-danger text-rose-600 hover:bg-rose-500/10 focus-visible:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/15'
                    : isWarn
                        ? 'text-amber-700 hover:bg-amber-500/10 focus-visible:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/15'
                        : 'topbar-menu-item-neutral text-slate-700 hover:bg-slate-100/90 hover:text-slate-900 focus-visible:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800/80 dark:hover:text-white',
                className
            )}
            {...props}
        >
            <span
                className={cx(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all duration-150 group-hover:scale-105 shadow-2xs',
                    isDanger
                        ? 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400'
                        : isWarn
                            ? 'border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-400'
                            : 'border-slate-200/80 bg-slate-100/90 text-slate-600 group-hover:border-primary/40 group-hover:bg-primary/10 group-hover:text-primary dark:border-slate-700/60 dark:bg-slate-800/70 dark:text-slate-300 dark:group-hover:border-primary/40 dark:group-hover:bg-primary/20 dark:group-hover:text-primary-300'
                )}
                aria-hidden="true"
            >
                <Icon size={16} />
            </span>

            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-bold leading-tight text-inherit">
                        {children}
                    </span>
                    {badge && (
                        <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                            {badge}
                        </span>
                    )}
                </div>
                {subtitle && (
                    <p className="mt-0.5 truncate text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        {subtitle}
                    </p>
                )}
            </div>

            <ChevronRight
                size={14}
                aria-hidden="true"
                className={cx(
                    'shrink-0 text-slate-400 opacity-0 transition-all duration-150 group-hover:opacity-100 dark:text-slate-500',
                    isRtl ? 'rotate-180 group-hover:-translate-x-0.5' : 'group-hover:translate-x-0.5',
                    isDanger && 'text-rose-400 dark:text-rose-500'
                )}
            />
        </button>
    );
};

/* ── Profile menu ───────────────────────────────────────────────────── */
const ProfileMenu = ({
    user,
    displayName,
    initials,
    role,
    canTrackAttendance,
    isClockedIn,
    isStaleSession,
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
        className="vx-menu topbar-profile-menu absolute end-0 top-full z-50 mt-2 w-[min(320px,calc(100vw-24px))] rounded-2xl border border-[var(--VIARA-line,#e2e8f0)] bg-white/95 p-2 shadow-2xl backdrop-blur-2xl animate-in fade-in-50 zoom-in-95 slide-in-from-top-2 duration-150 ltr:origin-top-right rtl:origin-top-left dark:border-slate-800 dark:bg-slate-900/95"
    >
        {/* User Identity & Clinical Role Header */}
        <div className="topbar-profile-summary relative overflow-hidden rounded-xl border border-[var(--VIARA-line,#e2e8f0)]/80 p-3 shadow-sm dark:border-slate-800">
            {/* Ambient lighting highlight */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -end-6 -top-6 h-24 w-24 rounded-full bg-primary/10 blur-xl dark:bg-primary/20"
            />

            <div className="relative flex items-center gap-3">
                <div className="relative shrink-0">
                    <UserAvatar
                        user={user}
                        initials={initials}
                        size="lg"
                        className="h-12 w-12 rounded-xl ring-2 ring-white/90 shadow-md dark:ring-slate-800"
                    />
                    {/* Live status dot */}
                    <span
                        className={cx(
                            'absolute -bottom-0.5 -end-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900',
                            isStaleSession
                                ? 'bg-amber-500'
                                : isClockedIn
                                    ? 'bg-emerald-500 ring-2 ring-emerald-400/40 animate-pulse'
                                    : 'bg-slate-400'
                        )}
                        title={
                            isStaleSession
                                ? 'جلسة حضور معلقة'
                                : isClockedIn
                                    ? 'متصل وعلى رأس العمل'
                                    : 'خارج الوردية'
                        }
                    />
                </div>

                <div className="min-w-0 flex-1">
                    <p className="vx-profile-name truncate text-sm font-bold text-[var(--VIARA-ink,#0f172a)] dark:text-white">
                        {displayName || t('common.user', { defaultValue: 'User' })}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                            className={cx(
                                'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold shadow-2xs',
                                getRoleBadgeStyle(role)
                            )}
                        >
                            <Shield size={10} aria-hidden="true" className="shrink-0" />
                            <span className="truncate max-w-[130px]">
                                {role
                                    ? t(`roles.${String(role).toLowerCase()}`, { defaultValue: role })
                                    : t('common.guest', { defaultValue: 'Guest' })}
                            </span>
                        </span>

                        {user?.department && (
                            <span className="truncate rounded-md bg-slate-100/90 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {user.department}
                            </span>
                        )}
                    </div>

                    {user?.email && (
                        <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {user.email}
                        </p>
                    )}
                </div>
            </div>
        </div>

        {/* Shift Attendance Quick Strip (if trackable) */}
        {canTrackAttendance && (
            <div className="mt-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 dark:border-slate-800/80 dark:bg-slate-800/40">
                <div className="mb-2 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                        {isRtl ? 'حالة الوردية والحضور' : 'Shift & Attendance'}
                    </span>
                    <span
                        className={cx(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                            isStaleSession
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                                : isClockedIn
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                                    : 'bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        )}
                    >
                        <span
                            className={cx(
                                'h-1.5 w-1.5 rounded-full',
                                isStaleSession
                                    ? 'bg-amber-500'
                                    : isClockedIn
                                        ? 'bg-emerald-500 animate-ping'
                                        : 'bg-slate-400'
                            )}
                        />
                        {isStaleSession
                            ? t('topbar.staleSession', { defaultValue: isRtl ? 'معلقة >24س' : 'Stale >24h' })
                            : isClockedIn
                                ? t('topbar.clockedIn', { defaultValue: isRtl ? 'على رأس العمل' : 'On Shift' })
                                : t('topbar.clockInHint', { defaultValue: isRtl ? 'خارج الوردية' : 'Off Shift' })}
                    </span>
                </div>

                <button
                    type="button"
                    role="menuitem"
                    data-punch-trigger
                    onClick={onAttendance}
                    disabled={isAttendanceUpdating}
                    className={cx(
                        'group flex w-full items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-bold transition-all shadow-xs active:scale-[0.98]',
                        isAttendanceUpdating && 'opacity-60 cursor-not-allowed',
                        isStaleSession
                            ? 'bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-500'
                            : isClockedIn
                                ? 'border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800/80 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/50'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
                    )}
                >
                    {isAttendanceUpdating ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : isStaleSession ? (
                        <AlertCircle size={14} />
                    ) : isClockedIn ? (
                        <LogOut size={14} />
                    ) : (
                        <Clock3 size={14} />
                    )}
                    <span>
                        {isAttendanceUpdating
                            ? t('status.updating', { defaultValue: 'جارِ التحديث...' })
                            : isStaleSession
                                ? t('topbar.staleSession', { defaultValue: isRtl ? 'إنهاء الجلسة المعلقة' : 'Resolve Stale Session' })
                                : isClockedIn
                                    ? t('topbar.clockOut', { defaultValue: 'تسجيل الانصراف' })
                                    : t('topbar.clockIn', { defaultValue: 'تسجيل الحضور' })}
                    </span>
                </button>
            </div>
        )}

        {/* Navigation Actions */}
        <div className="space-y-0.5 pt-1.5">
            <ProfileMenuItem
                icon={UserIcon}
                subtitle={isRtl ? 'بيانات الحساب والتراخيص السريرية' : 'Clinical credentials & account'}
                onClick={() => onGoTo('/profile')}
                isRtl={isRtl}
            >
                {t('common.myProfile', { defaultValue: 'My profile' })}
            </ProfileMenuItem>

            <ProfileMenuItem
                icon={SlidersHorizontal}
                subtitle={isRtl ? 'الثيم، كثافة الشاشة والتنبيهات' : 'Theme, density & display'}
                onClick={() => onGoTo('/settings?tab=preferences')}
                isRtl={isRtl}
            >
                {t('common.preferences', { defaultValue: 'Preferences & Appearance' })}
            </ProfileMenuItem>

            <ProfileMenuItem
                icon={Settings}
                subtitle={isRtl ? 'إدارة المركز وإعدادات النظام' : 'Center setup & system tools'}
                onClick={() => onGoTo('/settings')}
                isRtl={isRtl}
            >
                {t('common.settings', { defaultValue: 'Settings' })}
            </ProfileMenuItem>
        </div>

        <div className="my-1.5 h-px bg-slate-200/80 dark:bg-slate-800" role="separator" />

        <ProfileMenuItem
            icon={LogOut}
            tone="danger"
            subtitle={isRtl ? 'إنهاء جلسة محطة العمل بأمان' : 'Securely end current workstation session'}
            onClick={onLogout}
            isRtl={isRtl}
        >
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
    const [prefsOpen, setPrefsOpen] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [systemDark, setSystemDark] = useState(() =>
        typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    );

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return undefined;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (event) => setSystemDark(event.matches);
        media.addEventListener?.('change', handleChange);
        return () => media.removeEventListener?.('change', handleChange);
    }, []);

    const isDarkMode = preferences?.theme === 'dark' || (preferences?.theme === 'system' && systemDark);

    const [updatePreferences] = useUpdatePreferencesMutation();

    const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
    const pendingChangesRef = useRef({});
    const saveTimeoutRef = useRef(null);
    const isSavingRef = useRef(false);

    const flushPreferencesQueue = useCallback(async () => {
        if (isSavingRef.current) return;
        const changesToSave = { ...pendingChangesRef.current };
        if (Object.keys(changesToSave).length === 0) return;

        pendingChangesRef.current = {};
        isSavingRef.current = true;
        setSaveStatus('saving');

        try {
            if (typeof updatePreferences === 'function') {
                await updatePreferences(getPersistablePreferences(changesToSave)).unwrap();
            }
            setSaveStatus('saved');
            window.setTimeout(() => {
                setSaveStatus((current) => (current === 'saved' ? 'idle' : current));
            }, 2500);
        } catch (_) {
            setSaveStatus('error');
            toast.error(t('topbar.preferencesSaveError', {
                defaultValue: isRtl
                    ? 'تعذر حفظ بعض التفضيلات على الخادم (محفوظة محلياً)'
                    : 'Failed to save preferences to server (saved locally)'
            }));
        } finally {
            isSavingRef.current = false;
            if (Object.keys(pendingChangesRef.current).length > 0) {
                flushPreferencesQueue();
            }
        }
    }, [isRtl, t, updatePreferences]);

    const handleUpdatePreference = useCallback((changes) => {
        const next = { ...preferences, ...changes };
        dispatch(updateAllPreferences(next));
        pendingChangesRef.current = { ...pendingChangesRef.current, ...next };

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = window.setTimeout(() => {
            flushPreferencesQueue();
        }, 300);
    }, [dispatch, flushPreferencesQueue, preferences]);

    const handleRetryPreferencesSave = useCallback(() => {
        pendingChangesRef.current = { ...preferences };
        flushPreferencesQueue();
    }, [flushPreferencesQueue, preferences]);

    const toggleTheme = () => {
        handleUpdatePreference({ theme: isDarkMode ? 'light' : 'dark' });
    };

    const handleResetDisplayPreferences = useCallback(async () => {
        const resetChanges = {
            theme: DEFAULT_PREFERENCES.theme,
            primaryColor: DEFAULT_PREFERENCES.primaryColor,
            density: DEFAULT_PREFERENCES.density,
            fontScale: DEFAULT_PREFERENCES.fontScale,
            motion: DEFAULT_PREFERENCES.motion,
            highContrast: DEFAULT_PREFERENCES.highContrast,
            compactSidebar: DEFAULT_PREFERENCES.compactSidebar,
            timeFormat: DEFAULT_PREFERENCES.timeFormat,
            notificationSound: DEFAULT_PREFERENCES.notificationSound,
        };
        const next = { ...preferences, ...resetChanges };
        dispatch(updateAllPreferences(next));
        setSaveStatus('saving');
        try {
            if (typeof updatePreferences === 'function') {
                await updatePreferences(getPersistablePreferences(next))?.unwrap?.();
            }
            setSaveStatus('saved');
            window.setTimeout(() => {
                setSaveStatus((current) => (current === 'saved' ? 'idle' : current));
            }, 2500);
            toast.success(t('topbar.resetSuccess', { defaultValue: 'تمت استعادة تفضيلات العرض الافتراضية' }));
        } catch (_) {
            setSaveStatus('error');
            toast.error(t('topbar.preferencesSaveError', {
                defaultValue: isRtl
                    ? 'تعذر حفظ بعض التفضيلات على الخادم (محفوظة محلياً)'
                    : 'Failed to save preferences to server (saved locally)'
            }));
        }
    }, [dispatch, isRtl, preferences, t, updatePreferences]);

    const profileRef = useRef(null);
    const profileButtonRef = useRef(null);
    const prefsRef = useRef(null);
    const prefsButtonRef = useRef(null);
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
        skipPollingIfUnfocused: true,
        refetchOnFocus: true,
        refetchOnReconnect: true
    });

    const unreadCount = Math.max(0, Number(unreadData?.counts?.unread) || 0);

    const { data: attendanceData, isSuccess: attendanceLoaded } = useGetAttendanceQuery(
        { userId: currentUserId, activeOnly: true, limit: 1 },
        {
            skip: !canTrackAttendance || !currentUserId,
            refetchOnFocus: true,
            pollingInterval: 60000,
            skipPollingIfUnfocused: true
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
        () => attendanceRecords.find((record) => !record.clock_out &&
            Number.isFinite(new Date(record.clock_in).getTime())),
        [attendanceRecords]
    );

    const isStaleSession = Boolean(
        activeSession &&
        Number.isFinite(new Date(activeSession.clock_in).getTime()) &&
        Date.now() - new Date(activeSession.clock_in).getTime() > 24 * 60 * 60 * 1000
    );

    const isClockedIn = Boolean(activeSession);
    const needsClockIn = ['Receptionist', 'Nurse', 'Technician'].includes(role) && attendanceLoaded && !isClockedIn;
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
        const interval = setInterval(tick, 30000);
        return () => clearInterval(interval);
    }, [isClockedIn, activeSession?.clock_in]);

    const elapsedDurationText = useMemo(() => {
        if (!isClockedIn || elapsedSeconds <= 0) return '';
        const hrs = Math.floor(elapsedSeconds / 3600);
        const mins = Math.floor((elapsedSeconds % 3600) / 60);
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
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
        setPrefsOpen(false);
    }, []);

    useEffect(() => {
        if (!prefsOpen) return undefined;

        const handlePointerDown = (event) => {
            if (prefsRef.current && !prefsRef.current.contains(event.target)) {
                setPrefsOpen(false);
            }
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setPrefsOpen(false);
                prefsButtonRef.current?.focus();
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [prefsOpen]);

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
        setPrefsOpen(false);
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
            throw error;
        }
    }, [clockIn, isAttendanceUpdating, t]);

    const handleDirectClockOut = useCallback(async (payload = '') => {
        if (isAttendanceUpdating) return;
        try {
            const body = typeof payload === 'string' ? { notes: payload } : (payload || {});
            await clockOut(body).unwrap();
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
            } else if (errorCode === 'EARLY_DEPARTURE_PROHIBITED') {
                toast.error(
                    error?.data?.message || 'الانصراف المبكر يتطلب إذن موافقة إدارية مسبق أو انصراف اضطراري مسبب.',
                    { duration: 6000 }
                );
            } else {
                toast.error(
                    error?.data?.message ||
                    t('topbar.attendanceError', { defaultValue: 'تعذر تسجيل الانصراف' })
                );
            }
            throw error;
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
        setPrefsOpen(false);
        setNotificationOpen((current) => !current);
    };

    const toggleProfile = () => {
        setNotificationOpen(false);
        setPrefsOpen(false);
        setProfileOpen((current) => !current);
    };

    const togglePrefs = () => {
        setProfileOpen(false);
        setNotificationOpen(false);
        setPunchCardOpen(false);
        setPrefsOpen((current) => !current);
    };

    const goTo = (path) => {
        setProfileOpen(false);
        setPrefsOpen(false);
        navigate(path);
    };

    return (
        <header className="app-topbar viara-topbar vx-topbar sticky top-0 z-40 select-none">
            {/* Clock-In Required Emergency Notice Ribbon */}
            {needsClockIn && (
                <div className="vx-notice topbar-notice" role="status">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                            <AlertCircle size={17} className="relative text-amber-600 dark:text-amber-400" aria-hidden="true" />
                        </span>
                        <span className="text-xs font-semibold sm:text-sm">
                            {t('topbar.clockInRequired', { defaultValue: isRtl ? 'سجّل حضورك أولًا لتتمكن من تنفيذ مهام العمل.' : 'Clock in before starting work.' })}
                        </span>
                    </div>
                    <button
                        type="button"
                        data-punch-trigger
                        onClick={() => setPunchCardOpen(true)}
                        className="vx-notice-action shadow-sm"
                    >
                        {t('topbar.clockInNow', { defaultValue: isRtl ? 'تسجيل الحضور الآن' : 'Clock in now' })}
                    </button>
                </div>
            )}

            <div className="app-topbar-row viara-topbar-row flex h-16 w-full items-center gap-3 px-3 sm:gap-4 sm:px-5 lg:px-7">
                {/* Mobile Menu Trigger */}
                <HeaderAction
                    triggerRef={menuButtonRef}
                    label={t('topbar.openMenu', { defaultValue: 'Open navigation menu' })}
                    onClick={onMobileMenuClick}
                    className="lg:hidden"
                >
                    <Menu size={20} />
                </HeaderAction>

                {/* Desktop Current Workspace / Module Badge */}
                <div className="hidden min-w-0 shrink-0 items-center gap-2 lg:flex">
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-100/70 px-3 py-1.5 shadow-2xs dark:border-slate-800/80 dark:bg-slate-850/60">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                        <p className="vx-page-title max-w-[160px] truncate text-xs font-bold text-slate-800 dark:text-slate-200 xl:max-w-[220px]" title={workspaceLabel}>
                            {workspaceLabel}
                        </p>
                    </div>
                </div>

                {/* Global Search Slots */}
                <div className="topbar-mobile-search min-w-0 flex-1 md:hidden">
                    <GlobalSearch />
                </div>
                <div className="topbar-search-slot hidden w-full min-w-0 max-w-[min(42vw,560px)] flex-1 md:flex">
                    <GlobalSearch />
                </div>

                {/* Topbar Right Actions Suite */}
                <div className="topbar-actions ms-auto flex min-w-0 shrink-0 items-center justify-end gap-1 sm:gap-1.5">
                    <LiveClock
                        isRtl={isRtl}
                        timezone={preferences?.timezone}
                        timeFormat={preferences?.timeFormat}
                    />

                    <span className="vx-divider mx-1.5 hidden xl:block" aria-hidden="true" />

                    {/* Display & Accessibility Controls */}
                    <div
                        className="topbar-display-controls flex shrink-0 items-center gap-0.5"
                        role="group"
                        aria-label={t('topbar.displayControls', { defaultValue: isRtl ? 'إعدادات العرض' : 'Display controls' })}
                    >
                        <LanguageToggle variant="compact" className="topbar-language-control" />
                        
                        <HeaderAction
                            label={t('topbar.toggleTheme', { defaultValue: isDarkMode ? 'Switch to light mode' : 'Toggle theme' })}
                            onClick={toggleTheme}
                        >
                            {isDarkMode ? <Sun size={18} className="text-amber-400 transition-transform duration-300 hover:rotate-45" /> : <Moon size={18} className="text-slate-600 transition-transform duration-300 hover:-rotate-12 dark:text-slate-300" />}
                        </HeaderAction>

                        <KeyboardShortcutsHelp
                            renderTrigger={({ open, label, title }) => (
                                <HeaderAction label={label} title={title} onClick={open} className="max-sm:!hidden">
                                    <span aria-hidden="true" className="text-[15px] font-bold leading-none">?</span>
                                </HeaderAction>
                            )}
                        />

                        <div className="relative" ref={prefsRef}>
                            <HeaderAction
                                triggerRef={prefsButtonRef}
                                label={t('topbar.quickPreferences', { defaultValue: 'Quick preferences' })}
                                active={prefsOpen}
                                aria-expanded={prefsOpen}
                                aria-haspopup="dialog"
                                onClick={togglePrefs}
                            >
                                <SlidersHorizontal size={18} />
                            </HeaderAction>

                            {prefsOpen && (
                                <QuickPreferencesMenu
                                    preferences={preferences}
                                    onUpdatePreference={handleUpdatePreference}
                                    onResetDefaults={handleResetDisplayPreferences}
                                    onClose={() => setPrefsOpen(false)}
                                    onGoTo={goTo}
                                    isRtl={isRtl}
                                    t={t}
                                    menuRef={prefsRef}
                                    saveStatus={saveStatus}
                                    onRetrySave={handleRetryPreferencesSave}
                                />
                            )}
                        </div>
                    </div>

                    {/* Attendance / Shift Management Pill */}
                    {canTrackAttendance && (
                        <AttendanceButton
                            isClockedIn={isClockedIn}
                            isStaleSession={isStaleSession}
                            isUpdating={isAttendanceUpdating}
                            elapsedText={elapsedDurationText}
                            isOpen={punchCardOpen}
                            onClick={handleAttendanceToggle}
                            t={t}
                            className="ms-1.5 hidden md:inline-flex"
                        />
                    )}

                    {/* Break-Glass Emergency Access Button */}
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
                                ? <Zap size={18} className="animate-pulse text-rose-500 motion-reduce:animate-none" />
                                : <ShieldAlert size={18} />}
                        </HeaderAction>
                    )}

                    {/* Notifications Center Trigger */}
                    {canViewNotifications && (
                        <HeaderAction
                            label={unreadCount > 0
                                ? t('topbar.notificationsUnread', {
                                    defaultValue: isRtl
                                        ? `الإشعارات (${unreadCount} غير مقروء)`
                                        : `Notifications (${unreadCount} unread)`,
                                    count: unreadCount,
                                })
                                : t('common.notifications', { defaultValue: 'Notifications' })}
                            active={notificationOpen}
                            aria-expanded={notificationOpen}
                            aria-haspopup="dialog"
                            onClick={toggleNotifications}
                        >
                            <Bell size={19} className={unreadCount > 0 ? 'topbar-bell-active' : ''} strokeWidth={unreadCount > 0 ? 2.3 : 1.9} />
                            {preferences?.showNotificationBadge !== false && unreadCount > 0 && (
                                <span className="topbar-notif-badge absolute -end-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[var(--VIARA-surface)] bg-[var(--danger)] px-1 text-[10px] font-bold leading-none text-white shadow-xs">
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </span>
                            )}
                        </HeaderAction>
                    )}

                    <span className="vx-divider mx-1.5 hidden sm:block" aria-hidden="true" />

                    {/* User Profile Trigger & Menu */}
                    <div className="relative" ref={profileRef}>
                        <button
                            ref={profileButtonRef}
                            type="button"
                            aria-haspopup="menu"
                            aria-expanded={profileOpen}
                            onClick={toggleProfile}
                            className={cx(
                                'vx-profile-trigger topbar-profile-trigger group',
                                profileOpen && 'topbar-profile-trigger-active'
                            )}
                        >
                            <UserAvatar user={user} initials={userInitials} label={t('topbar.userAvatar', { defaultValue: 'User avatar' })} />
                            <span className="hidden min-w-0 xl:block">
                                <span className="vx-profile-name block max-w-[8rem] truncate font-bold">
                                    {displayUserName || t('common.user', { defaultValue: 'User' })}
                                </span>
                                <span className="vx-profile-role block max-w-[8rem] truncate text-[11px]">
                                    {role ? t(`roles.${String(role).toLowerCase()}`, { defaultValue: role }) : t('common.guest', { defaultValue: 'Guest' })}
                                </span>
                            </span>
                            <ChevronDown
                                size={14}
                                aria-hidden="true"
                                className={cx('hidden text-[var(--VIARA-muted)] transition-transform duration-200 group-hover:text-[var(--VIARA-ink)] sm:block', profileOpen && 'rotate-180')}
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
                                isStaleSession={isStaleSession}
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

            {/* Attendance Punch-in / Punch-out Card Modal */}
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

            {/* Attendance Permission Modal */}
            {canTrackAttendance && (
                <AttendancePermissionModal
                    isOpen={permissionModalOpen}
                    onClose={() => setPermissionModalOpen(false)}
                    defaultUserId={currentUserId}
                />
            )}

            {/* Notification Center Popover */}
            <NotificationCenter
                isOpen={canViewNotifications && notificationOpen}
                onClose={closeNotifications}
                unreadCount={unreadCount}
                canSendManual={canSendManualNotifications}
                preferences={preferences}
                onUpdatePreference={handleUpdatePreference}
            />

            {/* Break-Glass Emergency Modal */}
            <BreakGlassModal
                isOpen={breakGlassOpen}
                onClose={closeBreakGlass}
            />

            {/* Topbar subtle bottom accent gradient */}
            <div className="app-topbar-accent-line" aria-hidden="true" />
        </header>
    );
};

export default Topbar;