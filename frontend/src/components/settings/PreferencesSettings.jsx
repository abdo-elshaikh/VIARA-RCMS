import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
    AlertTriangle,
    Bell,
    BellRing,
    Check,
    CheckCircle2,
    Clock3,
    DownloadCloud,
    FileJson,
    Globe2,
    Mail,
    MonitorSmartphone,
    RotateCcw,
    ShieldCheck,
    Volume2,
    VolumeX,
    CalendarDays,
    Home,
    Lock,
    UploadCloud
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { DEFAULT_PREFERENCES, normalizePreferences, selectPreferences, updateAllPreferences } from '../../store/preferencesSlice';
import { useExportPersonalDataMutation, useUpdatePreferencesMutation } from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';

const DEFAULTS = DEFAULT_PREFERENCES;

const TIMEZONES = ['auto', 'Africa/Cairo', 'Asia/Riyadh', 'UTC', 'Europe/London', 'America/New_York', 'Asia/Dubai'];
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const TIME_FORMATS = ['12h', '24h'];
const LANGUAGES = [
    { id: 'en', name: 'English (US)', mark: 'EN', dir: 'LTR' },
    { id: 'ar', name: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629 (\u0645\u0635\u0631)', mark: 'AR', dir: 'RTL' }
];
const START_PAGES = [
    { id: '/dashboard', labelKey: 'dashboard', roles: ['*'] },
    { id: '/patients', labelKey: 'patients', roles: ['Admin', 'Developer', 'Receptionist', 'Radiologist'] },
    { id: '/appointments', labelKey: 'appointments', roles: ['Admin', 'Developer', 'Receptionist'] },
    { id: '/worklist', labelKey: 'worklist', roles: ['Admin', 'Developer', 'Radiologist', 'Technician'] },
    { id: '/communications', labelKey: 'messages', roles: ['Admin', 'Developer', 'Receptionist', 'Radiologist'] }
];
const CALENDAR_VIEWS = [
    { id: 'day', labelKey: 'day' },
    { id: 'week', labelKey: 'week' },
    { id: 'month', labelKey: 'month' }
];
const TIMEOUTS = [
    { id: 5, labelKey: 'fiveMinutes' },
    { id: 15, labelKey: 'fifteenMinutes' },
    { id: 30, labelKey: 'thirtyMinutes' },
    { id: 0, labelKey: 'neverLock' }
];
const DAYS_OF_WEEK = [
    { id: 0, labelKey: 'sunday' },
    { id: 1, labelKey: 'monday' },
    { id: 6, labelKey: 'saturday' }
];

const panelClass = 'rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90';

const PreferencesSettings = () => {
    const { t, i18n } = useTranslation('settings');
    const dispatch = useDispatch();
    const stored = useSelector(selectPreferences) || {};
    const currentUser = useSelector((state) => state.auth?.user);
    const userRole = currentUser?.role || 'Developer';
    const preferences = { ...DEFAULTS, ...stored };
    const [updatePreferences, { isLoading: isSaving }] = useUpdatePreferencesMutation();
    const [exportPersonalData, { isLoading: isExporting }] = useExportPersonalDataMutation();

    const [liveTime, setLiveTime] = useState(new Date());
    const importInputRef = useRef(null);
    const [pushPermission, setPushPermission] = useState(
        typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
    );

    const availableStartPages = useMemo(() => {
        return START_PAGES.filter((page) => {
            if (page.roles.includes('*')) return true;
            return page.roles.includes(userRole);
        });
    }, [userRole]);

    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const activeTimezone = preferences.timezone === 'auto' ? detectedTimezone : preferences.timezone;
    const selectedLanguage = LANGUAGES.find(l => l.id === preferences.language) || LANGUAGES[0];
    useEffect(() => {
        const timer = setInterval(() => setLiveTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const formattedTimeStr = useMemo(() => {
        try {
            return new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
                dateStyle: 'full',
                timeStyle: 'medium',
                timeZone: activeTimezone,
                hour12: preferences.timeFormat === '12h'
            }).format(liveTime);
        } catch {
            return liveTime.toLocaleString();
        }
    }, [activeTimezone, liveTime, i18n.language, preferences.timeFormat]);

    const persist = async (changes, languageChanged = false) => {
        const previous = preferences;
        const next = { ...preferences, ...changes };
        dispatch(updateAllPreferences(next));
        if (languageChanged) await i18n.changeLanguage(next.language);

        try {
            await updatePreferences(next).unwrap();
            toast.success(t('settings.preferences.saved', { defaultValue: 'Preferences updated successfully.' }));
        } catch (error) {
            dispatch(updateAllPreferences(previous));
            if (languageChanged) await i18n.changeLanguage(previous.language);
            toast.error(getErrorMessage(error, t('settings.preferences.saveFailed', { defaultValue: 'Failed to save preferences.' })));
        }
    };

    const resetPreferences = () => persist({
        language: i18n.resolvedLanguage || 'en',
        timezone: 'auto',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '12h',
        firstDayOfWeek: 0,
        startPage: '/dashboard',
        sessionTimeout: 15,
        calendarView: 'week',
        showNotificationBadge: true,
        notificationSound: false,
        soundVolume: 0.5,
        desktopNotificationPreview: false,
        notificationQuietHours: false,
        notificationQuietStart: '22:00',
        notificationQuietEnd: '07:00',
        criticalNotificationBypass: true,
        emailNotifications: DEFAULTS.emailNotifications
    });

    const resetAllPreferences = () => persist({ ...DEFAULTS, language: i18n.resolvedLanguage || DEFAULTS.language }, true);

    const testSound = () => {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) {
                toast.error(t('settings.preferences.soundUnavailable', { defaultValue: 'Audio Web API unavailable' }));
                return;
            }
            const context = new AudioContext();
            const volume = Number(preferences.soundVolume) || 0.5;

            // Dual tone medical chime
            const playChime = (freq, startTime, duration) => {
                const osc = context.createOscillator();
                const gain = context.createGain();
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(volume * 0.1, startTime);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                osc.connect(gain).connect(context.destination);
                osc.start(startTime);
                osc.stop(startTime + duration);
            };

            playChime(587.33, context.currentTime, 0.15); // D5
            playChime(880, context.currentTime + 0.15, 0.25); // A5

            setTimeout(() => context.close(), 500);
            toast.success(t('settings.preferences.soundTested', { defaultValue: 'Tested chime audio.' }));
        } catch {
            toast.error(t('settings.preferences.soundUnavailable', { defaultValue: 'Audio Web API unavailable' }));
        }
    };

    const requestPushPermission = async () => {
        if (!('Notification' in window)) {
            toast.error(t('settings.preferences.pushUnsupported', { defaultValue: 'Web Push notifications are not supported by this browser.' }));
            return;
        }
        try {
            const result = await Notification.requestPermission();
            setPushPermission(result);
            if (result === 'granted') {
                toast.success(t('settings.preferences.pushGranted', { defaultValue: 'Desktop notification permission granted.' }));
            } else {
                toast.error(t('settings.preferences.pushRejected', { defaultValue: 'Notification permission rejected.' }));
            }
        } catch {
            toast.error(t('settings.preferences.pushPermissionFailed', { defaultValue: 'Could not request notification permission.' }));
        }
    };

    const handleExport = async () => {
        try {
            const archive = await exportPersonalData().unwrap();
            const url = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' }));
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `VIARA-personal-data-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            toast.success(t('settings.preferences.exportReady', { defaultValue: 'Personal data archive downloaded.' }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('settings.preferences.exportFailed', { defaultValue: 'Failed to export personal data.' })));
        }
    };

    const handleExportPreferences = () => {
        const archive = {
            type: 'VIARA.preferences',
            version: 1,
            exportedAt: new Date().toISOString(),
            preferences: normalizePreferences(preferences)
        };
        const url = URL.createObjectURL(new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `VIARA-preferences-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        toast.success(t('settings.preferences.preferencesExported', { defaultValue: 'Workspace preferences exported.' }));
    };

    const handleImportPreferences = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const parsed = JSON.parse(String(reader.result || '{}'));
                const imported = parsed.preferences && typeof parsed.preferences === 'object' ? parsed.preferences : parsed;
                const allowed = Object.keys(DEFAULTS).reduce((acc, key) => {
                    if (Object.prototype.hasOwnProperty.call(imported, key)) acc[key] = imported[key];
                    return acc;
                }, {});
                const next = normalizePreferences({ ...preferences, ...allowed });
                await persist(next, next.language !== preferences.language);
                toast.success(t('settings.preferences.preferencesImported', { defaultValue: 'Workspace preferences imported.' }));
            } catch {
                toast.error(t('settings.preferences.invalidPreferencesFile', { defaultValue: 'Choose a valid VIARA preferences JSON file.' }));
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="space-y-6">
            {/* Top Localization & Preferences Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <Globe2 size={26} aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                <Clock3 size={11} />
                                <span>Regional & Workstation Config</span>
                            </span>
                            <h1 className="mt-1 break-words text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('settings.preferencesTab', { defaultValue: 'Workstation Preferences & Localization' })}
                            </h1>
                            <p className="mt-1 break-words text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('settings.preferencesDesc', { defaultValue: 'Configure workspace languages, timezones, date formatting, notification chimes, and personal data exports.' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={resetPreferences}
                            disabled={isSaving}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3.5 text-xs font-bold text-slate-700 shadow-xs backdrop-blur-md transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                            <RotateCcw size={14} aria-hidden="true" />
                            <span>{t('settings.preferences.reset', { defaultValue: 'Reset Preferences' })}</span>
                        </button>
                    </div>
                </div>

                <div className="mt-6 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                    <Fact label={t('settings.language', { defaultValue: 'Language' })} value={t(`settings.preferences.languages.${selectedLanguage.id}.name`, { defaultValue: selectedLanguage.name })} />
                    <Fact label={t('settings.timezone', { defaultValue: 'Timezone' })} value={preferences.timezone === 'auto' ? t('settings.preferences.autoDetectedTimezone', { timezone: detectedTimezone, defaultValue: `Auto (${detectedTimezone})` }) : activeTimezone} />
                    <Fact label={t('settings.notifications', { defaultValue: 'Badge Alerts' })} value={preferences.showNotificationBadge ? t('settings.preferences.enabled', { defaultValue: 'Enabled' }) : t('settings.preferences.disabled', { defaultValue: 'Disabled' })} />
                    <Fact label={t('settings.preferences.soundTitle', { defaultValue: 'Notification Chime' })} value={preferences.notificationSound ? t('settings.preferences.soundOnWithVolume', { volume: Math.round((preferences.soundVolume || 0.5) * 100), defaultValue: `Sound on (${Math.round((preferences.soundVolume || 0.5) * 100)}%)` }) : t('settings.preferences.soundOff', { defaultValue: 'Muted' })} />
                </div>
            </div>

            <div className="grid min-w-0 gap-6">
                <div className="space-y-6">
                    {/* Language & Regional Localization */}
                    <Panel icon={Globe2} title={t('settings.language', { defaultValue: 'Language & Locale' })} description={t('settings.preferences.languageDescription', { defaultValue: 'Select active workstation language and direction.' })}>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {LANGUAGES.map(lang => (
                                <ChoiceButton
                                    key={lang.id}
                                    selected={preferences.language === lang.id}
                                    disabled={isSaving}
                                    onClick={() => persist({ language: lang.id }, true)}
                                >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xs font-black text-white dark:bg-slate-800">
                                        {lang.mark}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-xs font-extrabold text-slate-900 dark:text-white">{lang.name}</span>
                                        <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                                            {t(`settings.preferences.languages.${lang.id}.direction`, { defaultValue: `${lang.dir} layout` })}
                                        </span>
                                    </span>
                                </ChoiceButton>
                            ))}
                        </div>
                    </Panel>

                    {/* Timezone & Clock Display Settings */}
                    <Panel icon={Clock3} title={t('settings.timezone', { defaultValue: 'Timezone & Date Formatting' })} description={t('settings.preferences.timezoneDescription', { defaultValue: 'Configure regional time offset and timestamp presentation.' })}>
                        <div className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t('settings.preferences.timezoneOffset', { defaultValue: 'Timezone offset' })}</label>
                                    <select
                                        value={preferences.timezone}
                                        disabled={isSaving}
                                        onChange={e => persist({ timezone: e.target.value })}
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                    >
                                        {TIMEZONES.map(zone => (
                                            <option key={zone} value={zone}>
                                                {zone === 'auto' ? t('settings.preferences.automaticTimezone', { timezone: detectedTimezone, defaultValue: `Automatic (${detectedTimezone})` }) : zone}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t('settings.preferences.dateDisplay', { defaultValue: 'Date display' })}</label>
                                    <select
                                        value={preferences.dateFormat || 'DD/MM/YYYY'}
                                        disabled={isSaving}
                                        onChange={e => persist({ dateFormat: e.target.value })}
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                    >
                                        {DATE_FORMATS.map(fmt => (
                                            <option key={fmt} value={fmt}>{fmt}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t('settings.preferences.timeDisplay', { defaultValue: 'Time display' })}</label>
                                    <select
                                        value={preferences.timeFormat || '12h'}
                                        disabled={isSaving}
                                        onChange={e => persist({ timeFormat: e.target.value })}
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                    >
                                        {TIME_FORMATS.map(tf => (
                                            <option key={tf} value={tf}>{t(`settings.preferences.timeFormats.${tf}`, { defaultValue: tf === '12h' ? '12-hour (AM/PM)' : '24-hour' })}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                        <CalendarDays size={12} className="text-slate-400" />
                                        {t('settings.preferences.firstDayOfWeek', { defaultValue: 'First day of week' })}
                                    </label>
                                    <select
                                        value={preferences.firstDayOfWeek}
                                        disabled={isSaving}
                                        onChange={e => persist({ firstDayOfWeek: Number(e.target.value) })}
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                    >
                                        {DAYS_OF_WEEK.map(day => (
                                            <option key={day.id} value={day.id}>{t(`settings.preferences.days.${day.labelKey}`, { defaultValue: day.labelKey })}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Live Clock Card */}
                            <div className="flex items-center justify-between rounded-xl border border-cyan-100 bg-cyan-50/70 p-3 text-xs text-cyan-900 dark:border-cyan-900/50 dark:bg-cyan-950/30 dark:text-cyan-300">
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-800 dark:text-cyan-400">{t('settings.preferences.liveClock', { defaultValue: 'Live formatted clock' })}</span>
                                    <p className="mt-0.5 font-mono text-sm font-black">{formattedTimeStr}</p>
                                </div>
                                <span className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-cyan-700 shadow-sm dark:bg-slate-900 dark:text-cyan-300">
                                    {activeTimezone}
                                </span>
                            </div>
                        </div>
                    </Panel>

                    {/* Personal Data Archive Export */}
                    <Panel icon={DownloadCloud} title={t('settings.preferences.exportTitle', { defaultValue: 'Personal Data Archive' })} description={t('settings.preferences.exportDescription', { defaultValue: 'Download a complete JSON backup of your account settings, history, and preferences.' })}>
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-xs font-extrabold text-slate-900 dark:text-white">{t('settings.preferences.exportPersonalSettings', { defaultValue: 'Export personal settings and history' })}</p>
                                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{t('settings.preferences.exportPersonalHint', { defaultValue: 'Generate structured JSON data archive for compliance' })}</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleExport}
                                disabled={isExporting}
                                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-cyan-900 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-100"
                            >
                                <DownloadCloud size={14} />
                                {isExporting ? t('settings.preferences.exportingJson', { defaultValue: 'Exporting...' }) : t('settings.preferences.downloadJson', { defaultValue: 'Download JSON' })}
                            </button>
                        </div>
                    </Panel>

                    <Panel icon={FileJson} title={t('settings.preferences.portabilityTitle', { defaultValue: 'Preference portability' })} description={t('settings.preferences.portabilityDescription', { defaultValue: 'Move only workspace preferences between trusted browsers without exporting profile or audit history.' })}>
                        <input
                            ref={importInputRef}
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={handleImportPreferences}
                        />
                        <div className="grid gap-2 sm:grid-cols-3">
                            <button
                                type="button"
                                onClick={handleExportPreferences}
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                            >
                                <DownloadCloud size={14} />
                                {t('settings.preferences.exportPrefs', { defaultValue: 'Export prefs' })}
                            </button>
                            <button
                                type="button"
                                onClick={() => importInputRef.current?.click()}
                                disabled={isSaving}
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                            >
                                <UploadCloud size={14} />
                                {t('settings.preferences.importPrefs', { defaultValue: 'Import prefs' })}
                            </button>
                            <button
                                type="button"
                                onClick={resetAllPreferences}
                                disabled={isSaving}
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
                            >
                                <RotateCcw size={14} />
                                {t('settings.preferences.resetAll', { defaultValue: 'Reset all' })}
                            </button>
                        </div>
                    </Panel>
                </div>

                <div className="space-y-4">
                    {/* Workflow & Startup Settings */}
                    <Panel icon={Home} title={t('settings.preferences.workflowTitle', { defaultValue: 'Workflow & Startup' })} description={t('settings.preferences.workflowDescription', { defaultValue: 'Configure default startup views and auto-lock security timeouts.' })}>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t('settings.preferences.defaultStartupPage', { defaultValue: 'Default startup page' })}</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {availableStartPages.map(page => (
                                        <ChoiceButton
                                            key={page.id}
                                            selected={preferences.startPage === page.id}
                                            disabled={isSaving}
                                            onClick={() => persist({ startPage: page.id })}
                                            center
                                        >
                                            <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{t(`settings.preferences.startPages.${page.labelKey}`, { defaultValue: page.labelKey })}</span>
                                        </ChoiceButton>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                    <CalendarDays size={12} className="text-slate-400" />
                                    {t('settings.preferences.defaultCalendarView', { defaultValue: 'Default calendar view' })}
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {CALENDAR_VIEWS.map(view => (
                                        <ChoiceButton
                                            key={view.id}
                                            selected={(preferences.calendarView || 'week') === view.id}
                                            disabled={isSaving}
                                            onClick={() => persist({ calendarView: view.id })}
                                            center
                                        >
                                            <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{t(`settings.preferences.calendarViews.${view.labelKey}`, { defaultValue: view.labelKey })}</span>
                                        </ChoiceButton>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                    <Lock size={12} className="text-slate-400" />
                                    {t('settings.preferences.autoLockTimeout', { defaultValue: 'Auto-lock timeout' })}
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {TIMEOUTS.map(timeout => (
                                        <ChoiceButton
                                            key={timeout.id}
                                            selected={preferences.sessionTimeout === timeout.id}
                                            disabled={isSaving}
                                            onClick={() => persist({ sessionTimeout: timeout.id })}
                                            center
                                        >
                                            <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">{t(`settings.preferences.timeouts.${timeout.labelKey}`, { defaultValue: timeout.labelKey })}</span>
                                        </ChoiceButton>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </Panel>

                    {/* Notification Chime Audio Controls */}
                    <Panel icon={Bell} title={t('settings.preferences.notificationsTitle', { defaultValue: 'Audio Chimes & Notification Rules' })} description={t('settings.preferences.notificationsDescription', { defaultValue: 'Configure audible alert tones and desktop push permissions.' })}>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-xs font-extrabold text-slate-900 dark:text-white">Notification Sound Chime</p>
                                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Play web audio chime on new patient alerts or results</p>
                                </div>
                                <Toggle
                                    label="Sound Chime"
                                    checked={Boolean(preferences.notificationSound)}
                                    disabled={isSaving}
                                    onChange={checked => persist({ notificationSound: checked })}
                                />
                            </div>

                            {preferences.notificationSound && (
                                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-2 dark:border-slate-800 dark:bg-slate-950/50">
                                    <div className="flex justify-between items-center text-xs font-bold text-slate-700 dark:text-slate-300">
                                        <span>Audio Volume ({Math.round((preferences.soundVolume || 0.5) * 100)}%)</span>
                                        <button
                                            type="button"
                                            onClick={testSound}
                                            className="inline-flex items-center gap-1 text-[11px] font-extrabold text-cyan-700 hover:underline dark:text-cyan-300"
                                        >
                                            <Volume2 size={13} /> Test Sound
                                        </button>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="1.0"
                                        step="0.05"
                                        value={preferences.soundVolume || 0.5}
                                        onChange={e => persist({ soundVolume: Number(e.target.value) })}
                                        className="w-full accent-cyan-600 cursor-pointer"
                                    />
                                </div>
                            )}

                            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                                <div>
                                    <p className="text-xs font-extrabold text-slate-900 dark:text-white">Badge Indicator Counter</p>
                                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Show unread count badges in navigation header</p>
                                </div>
                                <Toggle
                                    label="Show Badge"
                                    checked={Boolean(preferences.showNotificationBadge)}
                                    disabled={isSaving}
                                    onChange={checked => persist({ showNotificationBadge: checked })}
                                />
                            </div>

                            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                                <div>
                                    <p className="text-xs font-extrabold text-slate-900 dark:text-white">Desktop Push Permission</p>
                                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Browser push status: <strong className="capitalize text-slate-800 dark:text-slate-200">{pushPermission}</strong></p>
                                </div>
                                <button
                                    type="button"
                                    onClick={requestPushPermission}
                                    className="inline-flex h-8 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                >
                                    Enable Push
                                </button>
                            </div>

                            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                                <div>
                                    <p className="text-xs font-extrabold text-slate-900 dark:text-white">Private Desktop Preview</p>
                                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Hide message and patient details from Windows alerts on shared devices</p>
                                </div>
                                <Toggle
                                    label="Private Desktop Preview"
                                    checked={!preferences.desktopNotificationPreview}
                                    disabled={isSaving}
                                    onChange={checked => persist({ desktopNotificationPreview: !checked })}
                                />
                            </div>

                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-3 dark:border-slate-800 dark:bg-slate-950/50">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-extrabold text-slate-900 dark:text-white">Quiet Hours</p>
                                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Pause non-critical desktop alerts during protected hours</p>
                                    </div>
                                    <Toggle
                                        label="Quiet Hours"
                                        checked={Boolean(preferences.notificationQuietHours)}
                                        disabled={isSaving}
                                        onChange={checked => persist({ notificationQuietHours: checked })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <input
                                        type="time"
                                        value={preferences.notificationQuietStart || '22:00'}
                                        disabled={!preferences.notificationQuietHours || isSaving}
                                        onChange={event => persist({ notificationQuietStart: event.target.value })}
                                        className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                    />
                                    <input
                                        type="time"
                                        value={preferences.notificationQuietEnd || '07:00'}
                                        disabled={!preferences.notificationQuietHours || isSaving}
                                        onChange={event => persist({ notificationQuietEnd: event.target.value })}
                                        className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                    />
                                </div>
                                <label className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                                    <span>
                                        <span className="block text-xs font-extrabold text-slate-900 dark:text-white">Critical Bypass</span>
                                        <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">Allow safety and failed-dispatch alerts through quiet hours</span>
                                    </span>
                                    <Toggle
                                        label="Critical Bypass"
                                        checked={Boolean(preferences.criticalNotificationBypass)}
                                        disabled={isSaving}
                                        onChange={checked => persist({ criticalNotificationBypass: checked })}
                                    />
                                </label>
                            </div>
                        </div>
                    </Panel>

                    <Panel icon={Mail} title={t('settings.preferences.emailTitle', { defaultValue: 'Email digest rules' })} description={t('settings.preferences.emailDescription', { defaultValue: 'Choose which account-level emails VIARA can send to this user.' })}>
                        <div className="space-y-3">
                            <EmailToggle
                                title={t('settings.preferences.notifications.dailySummary', { defaultValue: 'Daily operational summary' })}
                                description="Receive a daily digest of appointments, reports, and queue events."
                                checked={Boolean(preferences.emailNotifications?.dailySummary)}
                                disabled={isSaving}
                                onChange={checked => persist({ emailNotifications: { ...preferences.emailNotifications, dailySummary: checked } })}
                            />
                            <EmailToggle
                                title={t('settings.preferences.notifications.systemAlerts', { defaultValue: 'Security and system alerts' })}
                                description="Receive important account, security, and system health notices."
                                checked={Boolean(preferences.emailNotifications?.systemAlerts)}
                                disabled={isSaving}
                                onChange={checked => persist({ emailNotifications: { ...preferences.emailNotifications, systemAlerts: checked } })}
                            />
                            <EmailToggle
                                title={t('settings.preferences.notifications.promotionalUpdates', { defaultValue: 'Product and promotional updates' })}
                                description="Receive optional feature announcements and marketing messages."
                                checked={Boolean(preferences.emailNotifications?.promotionalUpdates)}
                                disabled={isSaving}
                                onChange={checked => persist({ emailNotifications: { ...preferences.emailNotifications, promotionalUpdates: checked } })}
                            />
                        </div>
                    </Panel>
                </div>
            </div>
        </div>
    );
};

const Panel = ({ icon: Icon, title, description, children }) => (
    <section className={`${panelClass} p-4 sm:p-5`}>
        <div className="mb-4 flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Icon size={16} aria-hidden="true" />
            </span>
            <div>
                <h3 className="text-sm font-black text-slate-950 dark:text-white">{title}</h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
            </div>
        </div>
        {children}
    </section>
);

const ChoiceButton = ({ selected, disabled, onClick, center, children }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`relative flex ${center ? 'items-center justify-center text-center' : 'items-center text-start'} gap-3 rounded-2xl border p-3.5 transition-all ${selected
                ? 'border-cyan-500 bg-cyan-50/50 shadow-md ring-2 ring-cyan-500/20 dark:border-cyan-500 dark:bg-cyan-950/40'
                : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-800/50'
            } disabled:opacity-50`}
    >
        {children}
        {selected && (
            <span className="absolute end-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-600 text-white shadow-sm dark:bg-cyan-500">
                <Check size={12} strokeWidth={3} />
            </span>
        )}
    </button>
);

const Fact = ({ label, value }) => (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 dark:border-slate-800 dark:bg-slate-950/50">
        <span className="text-[10px] font-bold uppercase text-slate-400">{label}</span>
        <p className="mt-0.5 break-words text-xs font-black leading-5 text-slate-900 dark:text-white">{value}</p>
    </div>
);

const Toggle = ({ label, checked, disabled, onChange }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${checked ? 'bg-cyan-600' : 'bg-slate-200 dark:bg-slate-800'
            } disabled:opacity-50`}
    >
        <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'
                }`}
        />
    </button>
);

const EmailToggle = ({ title, description, checked, disabled, onChange }) => (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/30">
        <div>
            <p className="text-xs font-extrabold text-slate-900 dark:text-white">{title}</p>
            <p className="mt-0.5 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <Toggle label={title} checked={checked} disabled={disabled} onChange={onChange} />
    </div>
);

export default PreferencesSettings;
