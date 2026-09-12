import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
    Bell,
    Clock3,
    DownloadCloud,
    FileJson,
    Globe2,
    Mail,
    RotateCcw,
    Volume2,
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
import { canAccessRoute } from '../../config/routes';
import ConfirmDialog from '../ui/ConfirmDialog';
import {
    SettingsChoice as ChoiceButton,
    SettingsFact as Fact,
    SettingsPanel as Panel,
    SettingsRow,
    SettingsSwitch as Toggle,
    SettingsSyncStatus,
    settingsPanelClass,
} from './SettingsControls';

const DEFAULTS = DEFAULT_PREFERENCES;

const TIMEZONES = ['auto', 'Africa/Cairo', 'Asia/Riyadh', 'UTC', 'Europe/London', 'America/New_York', 'Asia/Dubai'];
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const TIME_FORMATS = ['12h', '24h'];
const LANGUAGES = [
    { id: 'en', name: 'English (US)', mark: 'EN', dir: 'LTR' },
    { id: 'ar', name: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629 (\u0645\u0635\u0631)', mark: 'AR', dir: 'RTL' }
];
const START_PAGES = [
    { id: '/dashboard', labelKey: 'dashboard' },
    { id: '/patients', labelKey: 'patients' },
    { id: '/appointments', labelKey: 'appointments' },
    { id: '/worklist', labelKey: 'worklist' },
    { id: '/communications', labelKey: 'messages' }
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

const PreferencesSettings = () => {
    const { t, i18n } = useTranslation('settings');
    const dispatch = useDispatch();
    const stored = useSelector(selectPreferences) || {};
    const currentUser = useSelector((state) => state.auth?.user);
    const preferences = { ...DEFAULTS, ...stored };
    const [updatePreferences, { isLoading: isSaving }] = useUpdatePreferencesMutation();
    const [exportPersonalData, { isLoading: isExporting }] = useExportPersonalDataMutation();

    const [liveTime, setLiveTime] = useState(new Date());
    const importInputRef = useRef(null);
    const [pushPermission, setPushPermission] = useState(
        typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
    );
    const [confirmResetAll, setConfirmResetAll] = useState(false);
    const [soundVolumeDraft, setSoundVolumeDraft] = useState(Number(preferences.soundVolume) || 0.5);

    useEffect(() => {
        setSoundVolumeDraft(Number(preferences.soundVolume) || 0.5);
    }, [preferences.soundVolume]);

    const availableStartPages = useMemo(() => {
        return START_PAGES.filter((page) => canAccessRoute(page.id, currentUser));
    }, [currentUser]);
    const startPageIsAvailable = availableStartPages.some((page) => page.id === preferences.startPage);

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
            return true;
        } catch (error) {
            dispatch(updateAllPreferences(previous));
            if (languageChanged) await i18n.changeLanguage(previous.language);
            toast.error(getErrorMessage(error, t('settings.preferences.saveFailed', { defaultValue: 'Failed to save preferences.' })));
            return false;
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

    const commitSoundVolume = () => {
        const nextVolume = Math.min(1, Math.max(0.1, Number(soundVolumeDraft) || 0.5));
        if (nextVolume !== preferences.soundVolume) persist({ soundVolume: nextVolume });
    };

    const testSound = () => {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) {
                toast.error(t('settings.preferences.soundUnavailable', { defaultValue: 'Audio Web API unavailable' }));
                return;
            }
            const context = new AudioContext();
            const volume = Number(soundVolumeDraft) || 0.5;

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
        if (file.size > 256 * 1024) {
            toast.error(t('settings.preferences.preferencesFileTooLarge', { defaultValue: 'The preferences file must be smaller than 256 KB.' }));
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const parsed = JSON.parse(String(reader.result || '{}'));
                if ((parsed.type && parsed.type !== 'VIARA.preferences') || (parsed.version && Number(parsed.version) > 1)) {
                    throw new Error('Unsupported preferences archive');
                }
                const imported = parsed.preferences && typeof parsed.preferences === 'object' ? parsed.preferences : parsed;
                if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
                    throw new Error('Invalid preferences payload');
                }
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
            <div className={`${settingsPanelClass} relative overflow-hidden p-5 sm:p-7`}>
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
                                <span>{t('settings.preferences.eyebrow', { defaultValue: 'Regional and workstation configuration' })}</span>
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
                        <SettingsSyncStatus
                            loading={isSaving}
                            label={t('settings.preferences.synced', { defaultValue: 'Preferences synchronized' })}
                            loadingLabel={t('settings.preferences.saving', { defaultValue: 'Saving preferences...' })}
                        />
                        <button
                            type="button"
                            onClick={resetPreferences}
                            disabled={isSaving}
                            className="ds-button ds-button-secondary ds-button-sm"
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

            <nav className="flex flex-wrap gap-2" aria-label={t('settings.preferences.sectionsLabel', { defaultValue: 'Preference setting sections' })}>
                {[
                    ['preferences-region', Globe2, t('settings.language', { defaultValue: 'Region' })],
                    ['preferences-workflow', Home, t('settings.preferences.workflowTitle', { defaultValue: 'Workflow' })],
                    ['preferences-notifications', Bell, t('settings.notifications', { defaultValue: 'Notifications' })],
                    ['preferences-portability', FileJson, t('settings.preferences.portabilityTitle', { defaultValue: 'Portability' })],
                ].map(([id, Icon, label]) => (
                    <a key={id} href={`#${id}`} className="settings-jump-link inline-flex min-h-9 items-center gap-2 px-3 text-xs font-bold">
                        <Icon size={14} aria-hidden="true" />
                        {label}
                    </a>
                ))}
            </nav>

            <div className="grid min-w-0 gap-6 xl:grid-cols-2 xl:items-start">
                <div className="space-y-6">
                    {/* Language & Regional Localization */}
                    <Panel id="preferences-region" icon={Globe2} title={t('settings.language', { defaultValue: 'Language & Locale' })} description={t('settings.preferences.languageDescription', { defaultValue: 'Select active workstation language and direction.' })}>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {LANGUAGES.map(lang => (
                                <ChoiceButton
                                    key={lang.id}
                                    selected={preferences.language === lang.id}
                                    disabled={isSaving}
                                    onClick={() => persist({ language: lang.id }, true)}
                                    compact
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
                                    <label htmlFor="preferences-timezone" className="mb-1.5 block text-xs font-bold text-[var(--VIARA-ink)]">{t('settings.preferences.timezoneOffset', { defaultValue: 'Timezone offset' })}</label>
                                    <select
                                        id="preferences-timezone"
                                        value={preferences.timezone}
                                        disabled={isSaving}
                                        onChange={e => persist({ timezone: e.target.value })}
                                        className="ds-field text-xs font-bold"
                                    >
                                        {TIMEZONES.map(zone => (
                                            <option key={zone} value={zone}>
                                                {zone === 'auto' ? t('settings.preferences.automaticTimezone', { timezone: detectedTimezone, defaultValue: `Automatic (${detectedTimezone})` }) : zone}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="preferences-date-format" className="mb-1.5 block text-xs font-bold text-[var(--VIARA-ink)]">{t('settings.preferences.dateDisplay', { defaultValue: 'Date display' })}</label>
                                    <select
                                        id="preferences-date-format"
                                        value={preferences.dateFormat || 'DD/MM/YYYY'}
                                        disabled={isSaving}
                                        onChange={e => persist({ dateFormat: e.target.value })}
                                        className="ds-field text-xs font-bold"
                                    >
                                        {DATE_FORMATS.map(fmt => (
                                            <option key={fmt} value={fmt}>{fmt}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="preferences-time-format" className="mb-1.5 block text-xs font-bold text-[var(--VIARA-ink)]">{t('settings.preferences.timeDisplay', { defaultValue: 'Time display' })}</label>
                                    <select
                                        id="preferences-time-format"
                                        value={preferences.timeFormat || '12h'}
                                        disabled={isSaving}
                                        onChange={e => persist({ timeFormat: e.target.value })}
                                        className="ds-field text-xs font-bold"
                                    >
                                        {TIME_FORMATS.map(tf => (
                                            <option key={tf} value={tf}>{t(`settings.preferences.timeFormats.${tf}`, { defaultValue: tf === '12h' ? '12-hour (AM/PM)' : '24-hour' })}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label htmlFor="preferences-first-day" className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--VIARA-ink)]">
                                        <CalendarDays size={12} className="text-slate-400" />
                                        {t('settings.preferences.firstDayOfWeek', { defaultValue: 'First day of week' })}
                                    </label>
                                    <select
                                        id="preferences-first-day"
                                        value={preferences.firstDayOfWeek}
                                        disabled={isSaving}
                                        onChange={e => persist({ firstDayOfWeek: Number(e.target.value) })}
                                        className="ds-field text-xs font-bold"
                                    >
                                        {DAYS_OF_WEEK.map(day => (
                                            <option key={day.id} value={day.id}>{t(`settings.preferences.days.${day.labelKey}`, { defaultValue: day.labelKey })}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Live Clock Card */}
                            <div className="ds-status-accent flex items-center justify-between rounded-xl border p-3 text-xs">
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider">{t('settings.preferences.liveClock', { defaultValue: 'Live formatted clock' })}</span>
                                    <p className="mt-0.5 font-mono text-sm font-black">{formattedTimeStr}</p>
                                </div>
                                <span className="rounded-lg bg-[var(--VIARA-surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--VIARA-accent-text)] shadow-sm">
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
                                className="ds-button ds-button-primary ds-button-sm"
                            >
                                <DownloadCloud size={14} />
                                {isExporting ? t('settings.preferences.exportingJson', { defaultValue: 'Exporting...' }) : t('settings.preferences.downloadJson', { defaultValue: 'Download JSON' })}
                            </button>
                        </div>
                    </Panel>

                    <Panel id="preferences-portability" icon={FileJson} title={t('settings.preferences.portabilityTitle', { defaultValue: 'Preference portability' })} description={t('settings.preferences.portabilityDescription', { defaultValue: 'Move only workspace preferences between trusted browsers without exporting profile or audit history.' })}>
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
                                className="ds-button ds-button-secondary ds-button-sm"
                            >
                                <DownloadCloud size={14} />
                                {t('settings.preferences.exportPrefs', { defaultValue: 'Export prefs' })}
                            </button>
                            <button
                                type="button"
                                onClick={() => importInputRef.current?.click()}
                                disabled={isSaving}
                                className="ds-button ds-button-secondary ds-button-sm"
                            >
                                <UploadCloud size={14} />
                                {t('settings.preferences.importPrefs', { defaultValue: 'Import prefs' })}
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmResetAll(true)}
                                disabled={isSaving}
                                className="ds-button ds-button-sm ds-status-danger"
                            >
                                <RotateCcw size={14} />
                                {t('settings.preferences.resetAll', { defaultValue: 'Reset all' })}
                            </button>
                        </div>
                    </Panel>
                </div>

                <div className="space-y-4">
                    {/* Workflow & Startup Settings */}
                    <Panel id="preferences-workflow" icon={Home} title={t('settings.preferences.workflowTitle', { defaultValue: 'Workflow & Startup' })} description={t('settings.preferences.workflowDescription', { defaultValue: 'Configure default startup views and auto-lock security timeouts.' })}>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t('settings.preferences.defaultStartupPage', { defaultValue: 'Default startup page' })}</label>
                                {!startPageIsAvailable && (
                                    <div className="ds-status ds-status-warning mb-3 flex items-center justify-between gap-3 border px-3 py-2 text-[11px] font-semibold" role="status">
                                        <span>{t('settings.preferences.startPageUnavailable', { defaultValue: 'Your previous start page is no longer available for this role.' })}</span>
                                        <button type="button" className="font-black underline" onClick={() => persist({ startPage: '/dashboard' })} disabled={isSaving}>
                                            {t('settings.preferences.useDashboard', { defaultValue: 'Use dashboard' })}
                                        </button>
                                    </div>
                                )}
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
                    <Panel id="preferences-notifications" icon={Bell} title={t('settings.preferences.notificationsTitle', { defaultValue: 'Audio Chimes & Notification Rules' })} description={t('settings.preferences.notificationsDescription', { defaultValue: 'Configure audible alert tones and desktop push permissions.' })}>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-xs font-extrabold text-[var(--VIARA-ink)]">{t('settings.preferences.notificationSoundTitle', { defaultValue: 'Notification sound chime' })}</p>
                                    <p className="mt-0.5 text-[11px] text-[var(--VIARA-muted)]">{t('settings.preferences.notificationSoundHelp', { defaultValue: 'Play a web audio chime for new patient alerts or results.' })}</p>
                                </div>
                                <Toggle
                                    label={t('settings.preferences.notificationSoundTitle', { defaultValue: 'Notification sound chime' })}
                                    checked={Boolean(preferences.notificationSound)}
                                    disabled={isSaving}
                                    onChange={checked => persist({ notificationSound: checked })}
                                />
                            </div>

                            {preferences.notificationSound && (
                                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-2 dark:border-slate-800 dark:bg-slate-950/50">
                                    <div className="flex justify-between items-center text-xs font-bold text-slate-700 dark:text-slate-300">
                                        <span>{t('settings.preferences.audioVolume', { volume: Math.round(soundVolumeDraft * 100), defaultValue: `Audio volume (${Math.round(soundVolumeDraft * 100)}%)` })}</span>
                                        <button
                                            type="button"
                                            onClick={testSound}
                                            className="inline-flex items-center gap-1 text-[11px] font-extrabold text-cyan-700 hover:underline dark:text-cyan-300"
                                        >
                                            <Volume2 size={13} aria-hidden="true" /> {t('settings.preferences.testSound', { defaultValue: 'Test sound' })}
                                        </button>
                                    </div>
                                    <input
                                        type="range"
                                        min="0.1"
                                        max="1.0"
                                        step="0.05"
                                        value={soundVolumeDraft}
                                        onChange={e => setSoundVolumeDraft(Number(e.target.value))}
                                        onPointerUp={commitSoundVolume}
                                        onKeyUp={commitSoundVolume}
                                        onBlur={commitSoundVolume}
                                        aria-label={t('settings.preferences.audioVolumeLabel', { defaultValue: 'Notification sound volume' })}
                                        className="w-full cursor-pointer accent-[var(--VIARA-accent)]"
                                    />
                                </div>
                            )}

                            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                                <div>
                                    <p className="text-xs font-extrabold text-[var(--VIARA-ink)]">{t('settings.preferences.badgeTitle', { defaultValue: 'Unread-count badge' })}</p>
                                    <p className="mt-0.5 text-[11px] text-[var(--VIARA-muted)]">{t('settings.preferences.badgeDescription', { defaultValue: 'Show unread counts in the navigation header.' })}</p>
                                </div>
                                <Toggle
                                    label={t('settings.preferences.badgeTitle', { defaultValue: 'Unread-count badge' })}
                                    checked={Boolean(preferences.showNotificationBadge)}
                                    disabled={isSaving}
                                    onChange={checked => persist({ showNotificationBadge: checked })}
                                />
                            </div>

                            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                                <div>
                                    <p className="text-xs font-extrabold text-[var(--VIARA-ink)]">{t('settings.preferences.desktopPushTitle', { defaultValue: 'Desktop push permission' })}</p>
                                    <p className="mt-0.5 text-[11px] text-[var(--VIARA-muted)]">{t('settings.preferences.desktopPushStatus', { status: pushPermission, defaultValue: `Browser push status: ${pushPermission}` })}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={requestPushPermission}
                                    disabled={pushPermission === 'granted'}
                                    className="ds-button ds-button-secondary ds-button-sm"
                                >
                                    {pushPermission === 'granted'
                                        ? t('settings.preferences.pushEnabled', { defaultValue: 'Enabled' })
                                        : t('settings.preferences.enablePush', { defaultValue: 'Enable push' })}
                                </button>
                            </div>

                            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                                <div>
                                    <p className="text-xs font-extrabold text-[var(--VIARA-ink)]">{t('settings.preferences.privatePreviewTitle', { defaultValue: 'Private desktop preview' })}</p>
                                    <p className="mt-0.5 text-[11px] text-[var(--VIARA-muted)]">{t('settings.preferences.privatePreviewHelp', { defaultValue: 'Hide message and patient details from desktop alerts on shared devices.' })}</p>
                                </div>
                                <Toggle
                                    label={t('settings.preferences.privatePreviewTitle', { defaultValue: 'Private desktop preview' })}
                                    checked={!preferences.desktopNotificationPreview}
                                    disabled={isSaving}
                                    onChange={checked => persist({ desktopNotificationPreview: !checked })}
                                />
                            </div>

                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-3 dark:border-slate-800 dark:bg-slate-950/50">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-extrabold text-[var(--VIARA-ink)]">{t('settings.preferences.quietHoursTitle', { defaultValue: 'Quiet hours' })}</p>
                                        <p className="mt-0.5 text-[11px] text-[var(--VIARA-muted)]">{t('settings.preferences.quietHoursHelp', { defaultValue: 'Pause non-critical desktop alerts during protected hours.' })}</p>
                                    </div>
                                    <Toggle
                                        label={t('settings.preferences.quietHoursTitle', { defaultValue: 'Quiet hours' })}
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
                                        aria-label={t('settings.preferences.quietHoursStart', { defaultValue: 'Quiet hours start' })}
                                        className="ds-field min-h-9 py-1 text-xs font-bold"
                                    />
                                    <input
                                        type="time"
                                        value={preferences.notificationQuietEnd || '07:00'}
                                        disabled={!preferences.notificationQuietHours || isSaving}
                                        onChange={event => persist({ notificationQuietEnd: event.target.value })}
                                        aria-label={t('settings.preferences.quietHoursEnd', { defaultValue: 'Quiet hours end' })}
                                        className="ds-field min-h-9 py-1 text-xs font-bold"
                                    />
                                </div>
                                <label className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                                    <span>
                                        <span className="block text-xs font-extrabold text-[var(--VIARA-ink)]">{t('settings.preferences.criticalBypassTitle', { defaultValue: 'Critical bypass' })}</span>
                                        <span className="mt-0.5 block text-[11px] text-[var(--VIARA-muted)]">{t('settings.preferences.criticalBypassHelp', { defaultValue: 'Allow safety and failed-dispatch alerts through quiet hours.' })}</span>
                                    </span>
                                    <Toggle
                                        label={t('settings.preferences.criticalBypassTitle', { defaultValue: 'Critical bypass' })}
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
                                description={t('settings.preferences.dailySummaryHelp', { defaultValue: 'Receive a daily digest of appointments, reports, and queue events.' })}
                                checked={Boolean(preferences.emailNotifications?.dailySummary)}
                                disabled={isSaving}
                                onChange={checked => persist({ emailNotifications: { ...preferences.emailNotifications, dailySummary: checked } })}
                            />
                            <EmailToggle
                                title={t('settings.preferences.notifications.systemAlerts', { defaultValue: 'Security and system alerts' })}
                                description={t('settings.preferences.systemAlertsHelp', { defaultValue: 'Receive important account, security, and system health notices.' })}
                                checked={Boolean(preferences.emailNotifications?.systemAlerts)}
                                disabled={isSaving}
                                onChange={checked => persist({ emailNotifications: { ...preferences.emailNotifications, systemAlerts: checked } })}
                            />
                            <EmailToggle
                                title={t('settings.preferences.notifications.promotionalUpdates', { defaultValue: 'Product and promotional updates' })}
                                description={t('settings.preferences.promotionalUpdatesHelp', { defaultValue: 'Receive optional feature announcements and marketing messages.' })}
                                checked={Boolean(preferences.emailNotifications?.promotionalUpdates)}
                                disabled={isSaving}
                                onChange={checked => persist({ emailNotifications: { ...preferences.emailNotifications, promotionalUpdates: checked } })}
                            />
                        </div>
                    </Panel>
                </div>
            </div>

            <ConfirmDialog
                isOpen={confirmResetAll}
                onClose={() => setConfirmResetAll(false)}
                onConfirm={resetAllPreferences}
                title={t('settings.preferences.resetAllTitle', { defaultValue: 'Reset all preferences?' })}
                message={t('settings.preferences.resetAllMessage', { defaultValue: 'This restores appearance, language, workflow, and notification preferences to their defaults.' })}
                confirmLabel={t('settings.preferences.resetAllConfirm', { defaultValue: 'Reset everything' })}
                cancelLabel={t('settings.preferences.cancel', { defaultValue: 'Cancel' })}
                variant="warning"
            />
        </div>
    );
};

const EmailToggle = ({ title, description, checked, disabled, onChange }) => (
    <SettingsRow title={title} description={description}>
        <Toggle label={title} checked={checked} disabled={disabled} onChange={onChange} />
    </SettingsRow>
);

export default PreferencesSettings;
