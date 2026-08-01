import React, { useMemo, useState } from 'react';
import {
    Bell,
    BellRing,
    Check,
    Clock3,
    Eye,
    EyeOff,
    MessageSquare,
    MonitorSmartphone,
    ShieldCheck,
    Volume2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentUser } from '../../store/authSlice';
import { selectPreferences, updateAllPreferences } from '../../store/preferencesSlice';
import { useUpdatePreferencesMutation } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { NotificationTemplates, NotificationJobs } from '../../pages/NotificationSettings';

const DEFAULTS = {
    showNotificationBadge: true,
    notificationSound: false,
    soundVolume: 0.5,
    desktopNotifications: false,
    desktopNotificationPreview: false,
    desktopSystemNotifications: true,
    desktopMessageNotifications: true,
    notificationQuietHours: false,
    notificationQuietStart: '22:00',
    notificationQuietEnd: '07:00',
    criticalNotificationBypass: true
};

const adminRoles = new Set(['Developer', 'Admin', 'Receptionist']);

const panelClass = 'rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/50 sm:p-5';

export default function NotificationSettingsPanel() {
    const { t } = useTranslation(['settings', 'common']);
    const dispatch = useDispatch();
    const currentUser = useSelector(selectCurrentUser);
    const stored = useSelector(selectPreferences);
    const preferences = useMemo(() => ({ ...DEFAULTS, ...(stored || {}) }), [stored]);
    const [permission, setPermission] = useState(
        typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
    );
    const [updatePreferences, { isLoading }] = useUpdatePreferencesMutation();

    const canAdminister = adminRoles.has(currentUser?.role);
    const permissionLabel = t(`settings.notifications.permissions.${permission}`, {
        defaultValue: permission
    });

    const enabledSummary = useMemo(() => {
        const enabled = [
            preferences.showNotificationBadge,
            preferences.notificationSound,
            preferences.desktopNotifications,
            preferences.desktopSystemNotifications,
            preferences.desktopMessageNotifications
        ].filter(Boolean).length;
        return `${enabled}/5`;
    }, [preferences]);

    const persist = async (changes) => {
        const previous = preferences;
        const next = { ...preferences, ...changes };
        dispatch(updateAllPreferences(next));
        try {
            await updatePreferences(next).unwrap();
            toast.success(t('settings.notifications.saved', { defaultValue: 'Notification settings saved.' }));
        } catch (error) {
            dispatch(updateAllPreferences(previous));
            toast.error(getErrorMessage(error, t('settings.notifications.saveFailed', { defaultValue: 'Notification settings could not be saved.' })));
        }
    };

    const requestDesktopPermission = async () => {
        if (!('Notification' in window)) {
            toast.error(t('settings.notifications.unsupported', { defaultValue: 'Desktop notifications are not supported by this browser.' }));
            return;
        }

        try {
            const result = await Notification.requestPermission();
            setPermission(result);
            if (result === 'granted') {
                await persist({ desktopNotifications: true });
                new Notification(t('settings.notifications.testTitle', { defaultValue: 'RCMS notifications enabled' }), {
                    body: t('settings.notifications.testBody', { defaultValue: 'Windows desktop alerts are ready for this workstation.' }),
                    tag: 'rcms-permission-test'
                });
            } else {
                await persist({ desktopNotifications: false });
            }
        } catch (error) {
            toast.error(getErrorMessage(error, t('settings.notifications.permissionFailed', { defaultValue: 'Could not request desktop permission.' })));
        }
    };

    const testSound = () => {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            toast.error(t('settings.notifications.soundUnavailable', { defaultValue: 'Audio is unavailable in this browser.' }));
            return;
        }

        const context = new AudioContextClass();
        const volume = Number(preferences.soundVolume) || 0.5;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 740;
        gain.gain.setValueAtTime(volume * 0.08, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.22);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.22);
        window.setTimeout(() => context.close().catch(() => {}), 350);
    };

    return (
        <div className="space-y-4">
            <section className={panelClass}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                            <BellRing size={18} />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-base font-black text-slate-950 dark:text-white">
                                {t('settings.notifications.title', { defaultValue: 'Notification Control Center' })}
                            </h2>
                            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                {t('settings.notifications.description', { defaultValue: 'Control in-app badges, sounds, Windows desktop alerts, privacy previews, and notification quiet hours.' })}
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <Fact label={t('settings.notifications.permission', { defaultValue: 'Desktop permission' })} value={permissionLabel} />
                        <Fact label={t('settings.notifications.enabledRules', { defaultValue: 'Enabled rules' })} value={enabledSummary} />
                        <Fact label={t('settings.notifications.preview', { defaultValue: 'Preview privacy' })} value={preferences.desktopNotificationPreview ? t('settings.notifications.previewOn', { defaultValue: 'On' }) : t('settings.notifications.previewPrivate', { defaultValue: 'Private' })} />
                    </div>
                </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="space-y-4">
                    <section className={panelClass}>
                        <SectionHeader
                            icon={MonitorSmartphone}
                            title={t('settings.notifications.desktopTitle', { defaultValue: 'Windows desktop alerts' })}
                            description={t('settings.notifications.desktopDesc', { defaultValue: 'Use browser notifications to show Windows system alerts while RCMS is open.' })}
                        />
                        <div className="space-y-3">
                            <SettingRow
                                icon={Bell}
                                title={t('settings.notifications.desktopMaster', { defaultValue: 'Enable desktop notifications' })}
                                description={permission === 'granted'
                                    ? t('settings.notifications.desktopGranted', { defaultValue: 'Permission granted for this browser profile.' })
                                    : t('settings.notifications.desktopNeedsPermission', { defaultValue: 'Windows alerts require browser permission first.' })}
                                checked={Boolean(preferences.desktopNotifications) && permission === 'granted'}
                                disabled={permission !== 'granted' || isLoading}
                                onChange={(checked) => persist({ desktopNotifications: checked })}
                            />
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={requestDesktopPermission}
                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white transition hover:bg-cyan-900 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-100"
                                >
                                    <MonitorSmartphone size={15} />
                                    {permission === 'granted'
                                        ? t('settings.notifications.sendTest', { defaultValue: 'Send test alert' })
                                        : t('settings.notifications.enableWindows', { defaultValue: 'Enable Windows alerts' })}
                                </button>
                            </div>
                        </div>
                    </section>

                    <section className={panelClass}>
                        <SectionHeader
                            icon={MessageSquare}
                            title={t('settings.notifications.routingTitle', { defaultValue: 'Alert routing' })}
                            description={t('settings.notifications.routingDesc', { defaultValue: 'Choose which realtime events can surface outside the app.' })}
                        />
                        <div className="space-y-3">
                            <SettingRow
                                icon={Bell}
                                title={t('settings.notifications.systemEvents', { defaultValue: 'System notifications' })}
                                description={t('settings.notifications.systemEventsDesc', { defaultValue: 'Delivery status, failed jobs, reminders, report events, and center alerts.' })}
                                checked={Boolean(preferences.desktopSystemNotifications)}
                                disabled={isLoading}
                                onChange={(checked) => persist({ desktopSystemNotifications: checked })}
                            />
                            <SettingRow
                                icon={MessageSquare}
                                title={t('settings.notifications.messageEvents', { defaultValue: 'Message notifications' })}
                                description={t('settings.notifications.messageEventsDesc', { defaultValue: 'Staff chat, patient portal messages, and doctor inquiries.' })}
                                checked={Boolean(preferences.desktopMessageNotifications)}
                                disabled={isLoading}
                                onChange={(checked) => persist({ desktopMessageNotifications: checked })}
                            />
                            <SettingRow
                                icon={preferences.desktopNotificationPreview ? Eye : EyeOff}
                                title={t('settings.notifications.showPreview', { defaultValue: 'Show message preview' })}
                                description={t('settings.notifications.showPreviewDesc', { defaultValue: 'When off, Windows alerts hide content and patient-facing text.' })}
                                checked={Boolean(preferences.desktopNotificationPreview)}
                                disabled={isLoading}
                                onChange={(checked) => persist({ desktopNotificationPreview: checked })}
                            />
                        </div>
                    </section>

                    <section className={panelClass}>
                        <SectionHeader
                            icon={Clock3}
                            title={t('settings.notifications.quietTitle', { defaultValue: 'Quiet hours' })}
                            description={t('settings.notifications.quietDesc', { defaultValue: 'Suppress non-critical desktop alerts during after-hours windows.' })}
                        />
                        <div className="space-y-3">
                            <SettingRow
                                icon={Clock3}
                                title={t('settings.notifications.quietMaster', { defaultValue: 'Enable quiet hours' })}
                                description={t('settings.notifications.quietMasterDesc', { defaultValue: 'The browser keeps in-app badges updated but does not show Windows alerts.' })}
                                checked={Boolean(preferences.notificationQuietHours)}
                                disabled={isLoading}
                                onChange={(checked) => persist({ notificationQuietHours: checked })}
                            />
                            <div className="grid gap-3 sm:grid-cols-2">
                                <TimeField
                                    label={t('settings.notifications.quietStart', { defaultValue: 'Start' })}
                                    value={preferences.notificationQuietStart || '22:00'}
                                    disabled={!preferences.notificationQuietHours || isLoading}
                                    onChange={(value) => persist({ notificationQuietStart: value })}
                                />
                                <TimeField
                                    label={t('settings.notifications.quietEnd', { defaultValue: 'End' })}
                                    value={preferences.notificationQuietEnd || '07:00'}
                                    disabled={!preferences.notificationQuietHours || isLoading}
                                    onChange={(value) => persist({ notificationQuietEnd: value })}
                                />
                            </div>
                            <SettingRow
                                icon={ShieldCheck}
                                title={t('settings.notifications.criticalBypass', { defaultValue: 'Critical alerts bypass quiet hours' })}
                                description={t('settings.notifications.criticalBypassDesc', { defaultValue: 'Failed dispatches and safety-related alerts can still appear.' })}
                                checked={Boolean(preferences.criticalNotificationBypass)}
                                disabled={isLoading}
                                onChange={(checked) => persist({ criticalNotificationBypass: checked })}
                            />
                        </div>
                    </section>
                </div>

                <div className="space-y-4">
                    <section className={panelClass}>
                        <SectionHeader
                            icon={Volume2}
                            title={t('settings.notifications.soundTitle', { defaultValue: 'Sound and badges' })}
                            description={t('settings.notifications.soundDesc', { defaultValue: 'Control the in-app notification badge and alert chime.' })}
                        />
                        <div className="space-y-3">
                            <SettingRow
                                icon={Bell}
                                title={t('settings.notifications.badge', { defaultValue: 'Unread badge counter' })}
                                description={t('settings.notifications.badgeDesc', { defaultValue: 'Show unread totals in the top bar.' })}
                                checked={Boolean(preferences.showNotificationBadge)}
                                disabled={isLoading}
                                onChange={(checked) => persist({ showNotificationBadge: checked })}
                            />
                            <SettingRow
                                icon={Volume2}
                                title={t('settings.notifications.chime', { defaultValue: 'Notification chime' })}
                                description={t('settings.notifications.chimeDesc', { defaultValue: 'Play a short tone when new unread notifications arrive.' })}
                                checked={Boolean(preferences.notificationSound)}
                                disabled={isLoading}
                                onChange={(checked) => persist({ notificationSound: checked })}
                            />
                            <label className="block rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/30">
                                <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-700 dark:text-slate-300">
                                    <span>{t('settings.notifications.volume', { defaultValue: 'Chime volume' })}: {Math.round((preferences.soundVolume || 0.5) * 100)}%</span>
                                    <button type="button" onClick={testSound} className="text-cyan-700 hover:underline dark:text-cyan-300">
                                        {t('settings.notifications.testSound', { defaultValue: 'Test' })}
                                    </button>
                                </div>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="1"
                                    step="0.05"
                                    value={preferences.soundVolume || 0.5}
                                    disabled={isLoading}
                                    onChange={(event) => persist({ soundVolume: Number(event.target.value) })}
                                    className="mt-3 w-full accent-cyan-600"
                                />
                            </label>
                        </div>
                    </section>

                    <section className={panelClass}>
                        <SectionHeader
                            icon={ShieldCheck}
                            title={t('settings.notifications.privacyTitle', { defaultValue: 'Privacy defaults' })}
                            description={t('settings.notifications.privacyDesc', { defaultValue: 'Safer defaults for shared workstations and clinical environments.' })}
                        />
                        <div className="space-y-2 text-xs leading-5 text-slate-600 dark:text-slate-400">
                            <p>{t('settings.notifications.privacyPoint1', { defaultValue: 'Desktop alerts hide message content unless previews are explicitly enabled.' })}</p>
                            <p>{t('settings.notifications.privacyPoint2', { defaultValue: 'In-app notifications keep full details inside the authenticated workspace.' })}</p>
                            <p>{t('settings.notifications.privacyPoint3', { defaultValue: 'Browser permission is per Windows user profile and browser profile.' })}</p>
                        </div>
                    </section>
                </div>
            </div>

            {canAdminister && (
                <div className="space-y-4">
                    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                        <header className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
                            <h3 className="text-sm font-black text-slate-950 dark:text-white">{t('settings.notifications.templatesTitle', { defaultValue: 'Delivery templates' })}</h3>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('settings.notifications.templatesDesc', { defaultValue: 'Manage Email, SMS, WhatsApp, and in-app copy used by notification dispatch.' })}</p>
                        </header>
                        <NotificationTemplates />
                    </section>
                    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
                        <header className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
                            <h3 className="text-sm font-black text-slate-950 dark:text-white">{t('settings.notifications.jobsTitle', { defaultValue: 'Dispatch jobs' })}</h3>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('settings.notifications.jobsDesc', { defaultValue: 'Monitor queued, failed, skipped, and sent notification jobs.' })}</p>
                        </header>
                        <NotificationJobs />
                    </section>
                </div>
            )}
        </div>
    );
}

const SectionHeader = ({ icon: Icon, title, description }) => (
    <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Icon size={16} />
        </span>
        <div>
            <h3 className="text-sm font-black text-slate-950 dark:text-white">{title}</h3>
            <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
    </div>
);

const SettingRow = ({ icon: Icon, title, description, checked, disabled, onChange }) => (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/20 dark:hover:border-slate-700">
        <span className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Icon size={16} />
            </span>
            <span className="min-w-0">
                <span className="block text-sm font-bold text-slate-900 dark:text-white">{title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</span>
            </span>
        </span>
        <Toggle checked={checked} disabled={disabled} onChange={onChange} label={title} />
    </label>
);

const Toggle = ({ checked, disabled, onChange, label }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={(event) => {
            event.preventDefault();
            onChange(!checked);
        }}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${
            checked ? 'bg-cyan-600' : 'bg-slate-200 dark:bg-slate-800'
        } disabled:cursor-not-allowed disabled:opacity-50`}
    >
        <span className={`h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
);

const TimeField = ({ label, value, disabled, onChange }) => (
    <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">{label}</span>
        <input
            type="time"
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-200 dark:disabled:bg-slate-900"
        />
    </label>
);

const Fact = ({ label, value }) => (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-950/30">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
        <p className="mt-1 truncate text-xs font-black capitalize text-slate-900 dark:text-white">{value}</p>
    </div>
);
