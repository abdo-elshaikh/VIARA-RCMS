import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
    Clock3,
    Search,
    Globe2,
    Check,
    X,
    Sparkles,
    ChevronDown,
    SlidersHorizontal,
    CheckCircle2,
    AlertCircle,
    RotateCcw
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isValidTimezone, getTimezoneOffsetString, getTimezoneOffsetMinutes, formatZonedTime } from '../../utils/timezone';

// ─── Curated Priority Timezones (with bilingual labels and flags) ─────────────
const CURATED_TIMEZONES = [
    // Middle East & Arab World (MENA)
    { id: 'Africa/Cairo', cityEn: 'Cairo', cityAr: 'القاهرة', countryEn: 'Egypt', countryAr: 'مصر', flag: '🇪🇬', region: 'mena' },
    { id: 'Asia/Riyadh', cityEn: 'Riyadh', cityAr: 'الرياض', countryEn: 'Saudi Arabia', countryAr: 'المملكة العربية السعودية', flag: '🇸🇦', region: 'mena' },
    { id: 'Asia/Dubai', cityEn: 'Dubai / Abu Dhabi', cityAr: 'دبي / أبوظبي', countryEn: 'United Arab Emirates', countryAr: 'الإمارات', flag: '🇦🇪', region: 'mena' },
    { id: 'Asia/Kuwait', cityEn: 'Kuwait City', cityAr: 'مدينة الكويت', countryEn: 'Kuwait', countryAr: 'الكويت', flag: '🇰🇼', region: 'mena' },
    { id: 'Asia/Qatar', cityEn: 'Doha', cityAr: 'الدوحة', countryEn: 'Qatar', countryAr: 'قطر', flag: '🇶🇦', region: 'mena' },
    { id: 'Asia/Bahrain', cityEn: 'Manama', cityAr: 'المنامة', countryEn: 'Bahrain', countryAr: 'البحرين', flag: '🇧🇭', region: 'mena' },
    { id: 'Asia/Muscat', cityEn: 'Muscat', cityAr: 'مسقط', countryEn: 'Oman', countryAr: 'سلطنة عُمان', flag: '🇴🇲', region: 'mena' },
    { id: 'Asia/Amman', cityEn: 'Amman', cityAr: 'عمّان', countryEn: 'Jordan', countryAr: 'الأردن', flag: '🇯🇴', region: 'mena' },
    { id: 'Asia/Beirut', cityEn: 'Beirut', cityAr: 'بيروت', countryEn: 'Lebanon', countryAr: 'لبنان', flag: '🇱🇧', region: 'mena' },
    { id: 'Asia/Damascus', cityEn: 'Damascus', cityAr: 'دمشق', countryEn: 'Syria', countryAr: 'سوريا', flag: '🇸🇾', region: 'mena' },
    { id: 'Asia/Baghdad', cityEn: 'Baghdad', cityAr: 'بغداد', countryEn: 'Iraq', countryAr: 'العراق', flag: '🇮🇶', region: 'mena' },
    { id: 'Asia/Jerusalem', cityEn: 'Jerusalem', cityAr: 'القدس الشريف', countryEn: 'Palestine', countryAr: 'فلسطين', flag: '🇵🇸', region: 'mena' },
    { id: 'Asia/Gaza', cityEn: 'Gaza', cityAr: 'غزة', countryEn: 'Palestine', countryAr: 'فلسطين', flag: '🇵🇸', region: 'mena' },
    { id: 'Asia/Aden', cityEn: 'Aden / Sanaa', cityAr: 'عدن / صنعاء', countryEn: 'Yemen', countryAr: 'اليمن', flag: '🇾🇪', region: 'mena' },
    { id: 'Africa/Tripoli', cityEn: 'Tripoli', cityAr: 'طرابلس', countryEn: 'Libya', countryAr: 'ليبيا', flag: '🇱🇾', region: 'mena' },
    { id: 'Africa/Khartoum', cityEn: 'Khartoum', cityAr: 'الخرطوم', countryEn: 'Sudan', countryAr: 'السودان', flag: '🇸🇩', region: 'mena' },
    { id: 'Africa/Tunis', cityEn: 'Tunis', cityAr: 'تونس', countryEn: 'Tunisia', countryAr: 'تونس', flag: '🇹🇳', region: 'mena' },
    { id: 'Africa/Algiers', cityEn: 'Algiers', cityAr: 'الجزائر', countryEn: 'Algeria', countryAr: 'الجزائر', flag: '🇩🇿', region: 'mena' },
    { id: 'Africa/Casablanca', cityEn: 'Casablanca', cityAr: 'الدار البيضاء / الرباط', countryEn: 'Morocco', countryAr: 'المغرب', flag: '🇲🇦', region: 'mena' },
    { id: 'Africa/Nouakchott', cityEn: 'Nouakchott', cityAr: 'نواكشوط', countryEn: 'Mauritania', countryAr: 'موريتانيا', flag: '🇲🇷', region: 'mena' },
    { id: 'Africa/Mogadishu', cityEn: 'Mogadishu', cityAr: 'مقديشو', countryEn: 'Somalia', countryAr: 'الصومال', flag: '🇸🇴', region: 'mena' },

    // Global Medical & Financial Hubs
    { id: 'UTC', cityEn: 'Universal Time Coordinated', cityAr: 'التوقيت العالمي المنسق', countryEn: 'Global Standard', countryAr: 'التوقيت الموحد', flag: '🌐', region: 'utc' },
    { id: 'Europe/London', cityEn: 'London', cityAr: 'لندن', countryEn: 'United Kingdom', countryAr: 'المملكة المتحدة', flag: '🇬🇧', region: 'europe' },
    { id: 'Europe/Paris', cityEn: 'Paris', cityAr: 'باريس', countryEn: 'France', countryAr: 'فرنسا', flag: '🇫🇷', region: 'europe' },
    { id: 'Europe/Berlin', cityEn: 'Berlin', cityAr: 'برلين', countryEn: 'Germany', countryAr: 'ألمانيا', flag: '🇩🇪', region: 'europe' },
    { id: 'Europe/Istanbul', cityEn: 'Istanbul', cityAr: 'إسطنبول', countryEn: 'Turkey', countryAr: 'تركيا', flag: '🇹🇷', region: 'europe' },
    { id: 'America/New_York', cityEn: 'New York (Eastern)', cityAr: 'نيويورك (الشرقي)', countryEn: 'United States', countryAr: 'الولايات المتحدة', flag: '🇺🇸', region: 'americas' },
    { id: 'America/Chicago', cityEn: 'Chicago (Central)', cityAr: 'شيكاغو (المركزي)', countryEn: 'United States', countryAr: 'الولايات المتحدة', flag: '🇺🇸', region: 'americas' },
    { id: 'America/Denver', cityEn: 'Denver (Mountain)', cityAr: 'دنفر (الجبلي)', countryEn: 'United States', countryAr: 'الولايات المتحدة', flag: '🇺🇸', region: 'americas' },
    { id: 'America/Los_Angeles', cityEn: 'Los Angeles (Pacific)', cityAr: 'لوس أنجلوس (الهادئ)', countryEn: 'United States', countryAr: 'الولايات المتحدة', flag: '🇺🇸', region: 'americas' },
    { id: 'America/Toronto', cityEn: 'Toronto', cityAr: 'تورونتو', countryEn: 'Canada', countryAr: 'كندا', flag: '🇨🇦', region: 'americas' },
    { id: 'Asia/Tokyo', cityEn: 'Tokyo', cityAr: 'طوكيو', countryEn: 'Japan', countryAr: 'اليابان', flag: '🇯🇵', region: 'asia' },
    { id: 'Asia/Shanghai', cityEn: 'Shanghai / Beijing', cityAr: 'شنغهاي / بكين', countryEn: 'China', countryAr: 'الصين', flag: '🇨🇳', region: 'asia' },
    { id: 'Asia/Kolkata', cityEn: 'New Delhi / Mumbai', cityAr: 'نيودلهي / مومباي', countryEn: 'India', countryAr: 'الهند', flag: '🇮🇳', region: 'asia' },
    { id: 'Asia/Singapore', cityEn: 'Singapore', cityAr: 'سنغافورة', countryEn: 'Singapore', countryAr: 'سنغافورة', flag: '🇸🇬', region: 'asia' },
    { id: 'Australia/Sydney', cityEn: 'Sydney', cityAr: 'سيدني', countryEn: 'Australia', countryAr: 'أستراليا', flag: '🇦🇺', region: 'pacific' }
];

// Quick Access 1-Click Chips for Primary Healthcare Markets
const QUICK_CHIPS = [
    { id: 'Africa/Cairo', label: 'القاهرة', flag: '🇪🇬' },
    { id: 'Asia/Riyadh', label: 'الرياض', flag: '🇸🇦' },
    { id: 'Asia/Dubai', label: 'دبي', flag: '🇦🇪' },
    { id: 'Asia/Kuwait', label: 'الكويت', flag: '🇰🇼' },
    { id: 'Asia/Qatar', label: 'الدوحة', flag: '🇶🇦' },
    { id: 'Asia/Amman', label: 'عمّان', flag: '🇯🇴' },
    { id: 'Africa/Casablanca', label: 'الدار البيضاء', flag: '🇲🇦' },
    { id: 'UTC', label: 'UTC', flag: '🌐' }
];

// ─── Timezone Math & Offset Utilities ─────────────────────────────────────────

// ─── Build Global All-Timezones Catalog ────────────────────────────────────────

const buildAllTimezones = () => {
    const curatedMap = new Map(CURATED_TIMEZONES.map((tz) => [tz.id, tz]));
    const list = [...CURATED_TIMEZONES];

    try {
        if (typeof Intl !== 'undefined' && Intl.supportedValuesOf) {
            const allIana = Intl.supportedValuesOf('timeZone');
            for (const iana of allIana) {
                if (!curatedMap.has(iana)) {
                    // Derive readable city and region
                    const segments = iana.split('/');
                    const regionRaw = segments[0]?.toLowerCase() || 'other';
                    const cityRaw = segments[segments.length - 1]?.replace(/_/g, ' ') || iana;

                    let mappedRegion = 'other';
                    if (regionRaw.includes('africa')) mappedRegion = 'africa';
                    else if (regionRaw.includes('asia')) mappedRegion = 'asia';
                    else if (regionRaw.includes('europe')) mappedRegion = 'europe';
                    else if (regionRaw.includes('america')) mappedRegion = 'americas';
                    else if (regionRaw.includes('pacific') || regionRaw.includes('australia')) mappedRegion = 'pacific';
                    else if (iana === 'UTC') mappedRegion = 'utc';

                    list.push({
                        id: iana,
                        cityEn: cityRaw,
                        cityAr: cityRaw,
                        countryEn: segments.length > 2 ? segments[1]?.replace(/_/g, ' ') : segments[0],
                        countryAr: segments[0],
                        flag: '🌐',
                        region: mappedRegion
                    });
                }
            }
        }
    } catch {
        // Fallback gracefully on environments lacking supportedValuesOf
    }

    return list;
};

const ALL_TIMEZONES_CATALOG = buildAllTimezones();

// ─── TimezoneSelect Component ──────────────────────────────────────────────────

export const TimezoneSelect = ({
    value = 'Africa/Cairo',
    onChange,
    disabled = false,
    className = ''
}) => {
    const { t, i18n } = useTranslation('facilitySettings');
    const isArabic = i18n.language === 'ar';

    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeRegion, setActiveRegion] = useState('all');
    const [customMode, setCustomMode] = useState(false);
    const [customValue, setCustomValue] = useState('');
    const [now, setNow] = useState(() => new Date());

    const popoverRef = useRef(null);
    const searchInputRef = useRef(null);

    // Refresh live clocks every 10 seconds
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 10000);
        return () => clearInterval(timer);
    }, []);

    // Close when clicking outside
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Focus search on open
    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            setTimeout(() => searchInputRef.current?.focus(), 80);
        }
    }, [isOpen]);

    // Active timezone metadata
    const activeMeta = useMemo(() => {
        const found = ALL_TIMEZONES_CATALOG.find((tz) => tz.id === value);
        if (found) return found;

        // Custom / fallback
        const segments = (value || '').split('/');
        const city = segments[segments.length - 1]?.replace(/_/g, ' ') || value;
        return {
            id: value || 'Africa/Cairo',
            cityEn: city,
            cityAr: city,
            countryEn: segments[0] || 'Custom',
            countryAr: segments[0] || 'مخصص',
            flag: '🌐',
            region: 'custom'
        };
    }, [value]);

    const activeOffset = useMemo(() => getTimezoneOffsetString(value, now), [value, now]);
    const activeLiveTime = useMemo(() => formatZonedTime(value, now), [value, now]);

    // Device offset calculation
    const deviceTimezone = useMemo(() => {
        try {
            return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        } catch {
            return 'UTC';
        }
    }, []);

    const deviceOffsetMinutes = useMemo(() => -now.getTimezoneOffset(), [now]);
    const activeOffsetMinutes = useMemo(() => getTimezoneOffsetMinutes(value, now), [value, now]);
    const diffMinutes = activeOffsetMinutes - deviceOffsetMinutes;
    const diffHours = Math.round(diffMinutes / 60);

    const handleDetectDevice = () => {
        if (deviceTimezone && isValidTimezone(deviceTimezone)) {
            onChange(deviceTimezone);
        }
    };

    // Filter timezones
    const filteredTimezones = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        return ALL_TIMEZONES_CATALOG.filter((tz) => {
            // Region tab filtering
            if (activeRegion !== 'all') {
                if (activeRegion === 'mena' && tz.region !== 'mena') return false;
                if (activeRegion === 'africa' && tz.region !== 'africa' && tz.region !== 'mena') return false;
                if (activeRegion === 'asia' && tz.region !== 'asia' && tz.region !== 'mena') return false;
                if (activeRegion === 'europe' && tz.region !== 'europe') return false;
                if (activeRegion === 'americas' && tz.region !== 'americas') return false;
                if (activeRegion === 'utc' && tz.region !== 'utc') return false;
            }

            // Text search
            if (!query) return true;

            const inId = tz.id.toLowerCase().includes(query);
            const inCityEn = tz.cityEn.toLowerCase().includes(query);
            const inCityAr = tz.cityAr.toLowerCase().includes(query);
            const inCountryEn = tz.countryEn.toLowerCase().includes(query);
            const inCountryAr = tz.countryAr.toLowerCase().includes(query);

            return inId || inCityEn || inCityAr || inCountryEn || inCountryAr;
        }).slice(0, 75); // Capped for fast render
    }, [searchQuery, activeRegion]);

    const handleSelect = (tzId) => {
        onChange(tzId);
        setIsOpen(false);
        setSearchQuery('');
    };

    const handleApplyCustom = (e) => {
        e.preventDefault();
        const trimmed = customValue.trim();
        if (isValidTimezone(trimmed)) {
            onChange(trimmed);
            setIsOpen(false);
            setCustomMode(false);
            setCustomValue('');
        }
    };

    return (
        <div className={`space-y-2.5 ${className}`}>
            {/* ─── Executive Selected Timezone Preview Card ─────────────────── */}
            <div className="relative overflow-hidden rounded-[var(--VIARA-radius-surface)] border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/50 to-teal-50/30 p-3.5 shadow-xs transition hover:border-teal-300 dark:border-slate-800 dark:from-slate-900 dark:via-slate-900/90 dark:to-teal-950/20">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {/* Left Info: Flag, Names, IANA Tag */}
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white text-2xl shadow-xs dark:border-slate-700 dark:bg-slate-800">
                            <span>{activeMeta.flag || '🌐'}</span>
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h4 className="text-sm font-black text-slate-900 dark:text-white truncate">
                                    {isArabic ? activeMeta.cityAr : activeMeta.cityEn}
                                </h4>
                                <span className="text-xs text-slate-500 font-semibold truncate">
                                    ({isArabic ? activeMeta.countryAr : activeMeta.countryEn})
                                </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1 rounded-[var(--VIARA-radius-control)] bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300" dir="ltr">
                                    {value}
                                </span>
                                <span className="inline-flex items-center gap-1 rounded-[var(--VIARA-radius-control)] border border-teal-500/20 bg-teal-500/10 px-2 py-0.5 font-mono text-[11px] font-black text-teal-800 dark:text-teal-300" dir="ltr">
                                    {activeOffset}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right Clock & Device Match Pill */}
                    <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                        <div className="flex items-center gap-2 rounded-[var(--VIARA-radius-control)] bg-slate-900 px-3 py-1 text-white shadow-xs dark:bg-slate-100 dark:text-slate-900">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                            <Clock3 size={13} className="opacity-80" />
                            <span className="font-mono text-xs font-black tracking-wider" dir="ltr">
                                {activeLiveTime}
                            </span>
                        </div>

                        {/* Local device time sync label */}
                        <div className="text-[10px] font-bold">
                            {diffMinutes === 0 ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                    <CheckCircle2 size={11} />
                                    <span>{t('timezone.matchesDevice', { defaultValue: 'Matches your device clock' })}</span>
                                </span>
                            ) : diffHours > 0 ? (
                                <span className="text-amber-700 dark:text-amber-400">
                                    {t('timezone.diffAhead', { count: diffHours, defaultValue: `+${diffHours}h from device` })}
                                </span>
                            ) : (
                                <span className="text-sky-700 dark:text-sky-400">
                                    {t('timezone.diffBehind', { count: Math.abs(diffHours), defaultValue: `${diffHours}h from device` })}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Action Bar */}
                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2.5 dark:border-slate-800">
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setIsOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-[var(--VIARA-radius-control)] bg-white px-3 py-1.5 text-xs font-bold text-slate-800 shadow-xs border border-slate-200 transition hover:bg-slate-50 hover:border-teal-400 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                        <Search size={13} className="text-teal-600 dark:text-teal-400" />
                        <span>{t('timezone.changeBtn', { defaultValue: 'Change or Search Timezone...' })}</span>
                        <ChevronDown size={13} className="opacity-60 ms-0.5" />
                    </button>

                    <button
                        type="button"
                        disabled={disabled || value === deviceTimezone}
                        onClick={handleDetectDevice}
                        className={`inline-flex items-center gap-1.5 rounded-[var(--VIARA-radius-control)] px-2.5 py-1 text-[11px] font-bold transition ${
                            value === deviceTimezone
                                ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-default'
                                : 'bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800 active:scale-[0.98]'
                        }`}
                        title={deviceTimezone ? `Auto-detect: ${deviceTimezone}` : undefined}
                    >
                        <Sparkles size={12} />
                        <span>{t('timezone.detectDevice', { defaultValue: 'Use Device Timezone' })} ({deviceTimezone})</span>
                    </button>
                </div>
            </div>

            {/* ─── Fast Regional 1-Click Chips ─────────────────────────────────── */}
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 me-1">
                    {t('timezone.quick', { defaultValue: 'Quick Pick:' })}
                </span>
                {QUICK_CHIPS.map((chip) => {
                    const active = value === chip.id;
                    return (
                        <button
                            key={chip.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => handleSelect(chip.id)}
                            className={`inline-flex items-center gap-1.5 rounded-[var(--VIARA-radius-control)] px-2.5 py-1 text-xs font-bold transition shadow-2xs ${
                                active
                                    ? 'bg-teal-600 text-white shadow-teal-500/20'
                                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                            }`}
                        >
                            <span>{chip.flag}</span>
                            <span>{chip.label}</span>
                            {active ? <Check size={11} strokeWidth={3} className="ms-0.5" /> : null}
                        </button>
                    );
                })}
            </div>

            {/* ─── Search & Selection Modal Dialog ────────────────────────────── */}
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
                    <div
                        ref={popoverRef}
                        className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-[var(--VIARA-radius-overlay)] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 overflow-hidden"
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-9 w-9 items-center justify-center rounded-[var(--VIARA-radius-control)] bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                                    <Globe2 size={18} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                        {t('timezone.modalTitle', { defaultValue: 'Select Facility Timezone' })}
                                    </h3>
                                    <p className="text-[11px] text-slate-400">
                                        {t('timezone.modalSubtitle', { defaultValue: 'Synchronizes patient appointment shifts and imaging audit logs.' })}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="flex h-8 w-8 items-center justify-center rounded-[var(--VIARA-radius-control)] text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Search Bar & Region Filter Tabs */}
                        <div className="p-3.5 border-b border-slate-200/80 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40 space-y-2.5 shrink-0">
                            <div className="relative">
                                <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={t('timezone.searchPlaceholder', { defaultValue: 'Search by city, country, or GMT offset (e.g. Cairo, Riyadh, Dubai)...' })}
                                    className="h-9 w-full rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white pe-3 ps-9 text-xs font-semibold text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-400/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                />
                                {searchQuery ? (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        <X size={13} />
                                    </button>
                                ) : null}
                            </div>

                            {/* Regional Filter Tabs */}
                            <div className="flex flex-wrap items-center gap-1">
                                {[
                                    { key: 'all', label: t('timezone.regions.all', { defaultValue: 'All' }) },
                                    { key: 'mena', label: t('timezone.regions.mena', { defaultValue: 'Middle East & Arab' }) },
                                    { key: 'africa', label: t('timezone.regions.africa', { defaultValue: 'Africa' }) },
                                    { key: 'asia', label: t('timezone.regions.asia', { defaultValue: 'Asia' }) },
                                    { key: 'europe', label: t('timezone.regions.europe', { defaultValue: 'Europe' }) },
                                    { key: 'americas', label: t('timezone.regions.americas', { defaultValue: 'Americas' }) },
                                    { key: 'utc', label: 'UTC' }
                                ].map((tab) => (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setActiveRegion(tab.key)}
                                        className={`rounded-[var(--VIARA-radius-control)] px-2.5 py-1 text-[11px] font-bold transition ${
                                            activeRegion === tab.key
                                                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                                : 'text-slate-600 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Timezones List */}
                        <div className="flex-1 overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/60">
                            {filteredTimezones.length === 0 ? (
                                <div className="py-12 text-center">
                                    <Globe2 size={32} className="mx-auto text-slate-300 dark:text-slate-600" />
                                    <p className="mt-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                                        {t('timezone.notFound', { defaultValue: 'No matching timezones found' })}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setCustomMode(true)}
                                        className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--VIARA-radius-control)] bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800 border border-teal-200 dark:bg-teal-950/60 dark:text-teal-300"
                                    >
                                        <SlidersHorizontal size={13} />
                                        <span>{t('timezone.enterManual', { defaultValue: 'Enter custom IANA identifier' })}</span>
                                    </button>
                                </div>
                            ) : (
                                filteredTimezones.map((tz) => {
                                    const isSelected = value === tz.id;
                                    const offset = getTimezoneOffsetString(tz.id, now);
                                    const liveTime = formatZonedTime(tz.id, now);

                                    return (
                                        <button
                                            key={tz.id}
                                            type="button"
                                            onClick={() => handleSelect(tz.id)}
                                            className={`w-full flex items-center justify-between p-2.5 rounded-[var(--VIARA-radius-control)] text-start transition ${
                                                isSelected
                                                    ? 'bg-teal-50/80 border border-teal-200 dark:bg-teal-950/40 dark:border-teal-800/80'
                                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className="text-xl shrink-0">{tz.flag || '🌐'}</span>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                                            {isArabic ? tz.cityAr : tz.cityEn}
                                                        </span>
                                                        <span className="text-[11px] text-slate-400 truncate">
                                                            · {isArabic ? tz.countryAr : tz.countryEn}
                                                        </span>
                                                    </div>
                                                    <span className="block font-mono text-[10px] text-slate-500 dark:text-slate-400" dir="ltr">
                                                        {tz.id}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2.5 shrink-0 ms-3">
                                                <div className="text-end font-mono">
                                                    <span className="block text-xs font-bold text-slate-800 dark:text-slate-200" dir="ltr">
                                                        {liveTime}
                                                    </span>
                                                    <span className="block text-[10px] font-bold text-teal-700 dark:text-teal-400" dir="ltr">
                                                        {offset}
                                                    </span>
                                                </div>
                                                <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                                                    isSelected
                                                        ? 'bg-teal-600 border-teal-600 text-white'
                                                        : 'border-slate-300 dark:border-slate-700'
                                                }`}>
                                                    {isSelected ? <Check size={11} strokeWidth={3} /> : null}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        {/* Modal Footer / Custom Mode Toggle */}
                        <div className="border-t border-slate-200 p-3 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40 shrink-0">
                            {customMode ? (
                                <form onSubmit={handleApplyCustom} className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <input
                                            type="text"
                                            value={customValue}
                                            onChange={(e) => setCustomValue(e.target.value)}
                                            placeholder="e.g. Africa/Cairo, Europe/London"
                                            className="h-8 w-full rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white px-2.5 font-mono text-xs text-slate-800 outline-none focus:border-teal-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                                            dir="ltr"
                                        />
                                        {customValue && !isValidTimezone(customValue.trim()) ? (
                                            <span className="absolute end-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-rose-500">
                                                Invalid
                                            </span>
                                        ) : null}
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={!isValidTimezone(customValue.trim())}
                                        className="h-8 rounded-[var(--VIARA-radius-control)] bg-teal-600 px-3 text-xs font-bold text-white disabled:opacity-50 hover:bg-teal-700"
                                    >
                                        Apply
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCustomMode(false)}
                                        className="h-8 rounded-[var(--VIARA-radius-control)] border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                    >
                                        Cancel
                                    </button>
                                </form>
                            ) : (
                                <div className="flex items-center justify-between text-xs">
                                    <button
                                        type="button"
                                        onClick={() => { setCustomMode(true); setCustomValue(value); }}
                                        className="text-[11px] font-bold text-teal-700 hover:underline dark:text-teal-400"
                                    >
                                        {t('timezone.enterManual', { defaultValue: 'Need an unlisted IANA timezone? Enter manually' })}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsOpen(false)}
                                        className="rounded-[var(--VIARA-radius-control)] bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                                    >
                                        {t('actions.close', { defaultValue: 'Done' })}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TimezoneSelect;
