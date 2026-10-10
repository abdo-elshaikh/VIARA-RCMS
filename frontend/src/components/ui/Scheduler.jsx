// Scheduler.jsx - VIARA Modern Clinical Calendar & Scheduler
import React, { useMemo, useState } from 'react';
import {
    Activity, CalendarDays, ChevronLeft, ChevronRight, Clock, Clock3,
    Maximize2, Minimize2, CheckCircle2, AlertTriangle, Flame,
    MapPin, X, Eye, Layers, Zap, Radio, Sparkles
} from 'lucide-react';

const DAY_MS = 86400000;
const HOUR_HEIGHT = 76;

const defaultTranslations = {
    ar: {
        'view.day': 'اليوم',
        'view.week': 'الأسبوع',
        'view.month': 'الشهر',
        'view.agenda': 'جدول الأعمال',
        'calendar.today': 'اليوم',
        'calendar.previous': 'السابق',
        'calendar.next': 'التالي',
        'calendar.countLabel': 'المواعيد',
        'calendar.roomsLabel': 'الأجهزة / الغرف',
        'calendar.priorityLabel': 'الحالات العاجلة',
        'calendar.doneLabel': 'المكتملة',
        'calendar.time': 'الوقت',
        'calendar.empty': 'لا توجد مواعيد في هذا النطاق.',
        'calendar.hint': 'اختر موعدًا للاطلاع على تفاصيل الفحص أو إدارته.',
        'calendar.clearFilter': 'إلغاء التصفية',
        'calendar.expand': 'ملء الشاشة',
        'calendar.collapse': 'تصغير الشاشة',
        'status.Scheduled': 'مجدول',
        'status.Confirmed': 'مؤكد',
        'status.Arrived': 'وصل',
        'status.Checked-in': 'تم تسجيل الوصول',
        'status.Checked-In': 'تم تسجيل الوصول',
        'status.In Progress': 'قيد الفحص',
        'status.In-Progress': 'قيد الفحص',
        'status.Completed': 'مكتمل',
        'status.Cancelled': 'ملغي',
        'status.No-Show': 'لم يحضر',
        'priority.Emergency': 'حالة طارئة',
        'priority.Urgent': 'حالة عاجلة',
        'priority.Routine': 'عادي',
        'fallback.patient': 'مريض',
        'fallback.unassigned': 'غير محدد',
        'fallback.unspecifiedExam': 'فحص غير محدد',
        'fallback.more': '+{{count}} أخرى'
    },
    en: {
        'view.day': 'Day',
        'view.week': 'Week',
        'view.month': 'Month',
        'view.agenda': 'Agenda',
        'calendar.today': 'Today',
        'calendar.previous': 'Previous',
        'calendar.next': 'Next',
        'calendar.countLabel': 'Appointments',
        'calendar.roomsLabel': 'Rooms / Machines',
        'calendar.priorityLabel': 'Priority Cases',
        'calendar.doneLabel': 'Completed',
        'calendar.time': 'Time',
        'calendar.empty': 'No appointments in this range.',
        'calendar.hint': 'Select an appointment to inspect details.',
        'calendar.clearFilter': 'Clear Filter',
        'calendar.expand': 'Expand',
        'calendar.collapse': 'Collapse',
        'status.Scheduled': 'Scheduled',
        'status.Confirmed': 'Confirmed',
        'status.Arrived': 'Arrived',
        'status.Checked-in': 'Checked-in',
        'status.Checked-In': 'Checked-In',
        'status.In Progress': 'In Progress',
        'status.In-Progress': 'In Progress',
        'status.Completed': 'Completed',
        'status.Cancelled': 'Cancelled',
        'status.No-Show': 'No-Show',
        'priority.Emergency': 'Emergency',
        'priority.Urgent': 'Urgent',
        'priority.Routine': 'Routine',
        'fallback.patient': 'Patient',
        'fallback.unassigned': 'Unassigned',
        'fallback.unspecifiedExam': 'Unspecified exam',
        'fallback.more': '+{{count}} more'
    }
};

const createTranslator = (tProp, locale = 'en-US') => {
    const isAr = locale?.startsWith('ar');
    const lang = isAr ? 'ar' : 'en';
    const dict = defaultTranslations[lang];

    return (key, options) => {
        const defaultFromOptions = typeof options === 'string'
            ? options
            : (typeof options === 'object' && options !== null ? options.defaultValue : null);

        if (typeof tProp === 'function') {
            const res = tProp(key, options);
            if (res && res !== key && (!defaultFromOptions || res !== defaultFromOptions)) {
                return res;
            }
        }

        if (dict[key]) {
            let val = dict[key];
            if (typeof options === 'object' && options !== null && options.count !== undefined) {
                val = val.replace('{{count}}', options.count);
            }
            return val;
        }

        if (defaultFromOptions) return defaultFromOptions;
        return key;
    };
};

const eventTone = {
    Scheduled: {
        badge: 'border-slate-200 bg-slate-50/90 text-slate-800 before:bg-slate-400 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-slate-200',
        dot: 'bg-slate-400',
        accent: 'text-slate-600 dark:text-slate-300'
    },
    Confirmed: {
        badge: 'border-sky-200 bg-sky-50/90 text-sky-900 before:bg-sky-500 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-200',
        dot: 'bg-sky-500',
        accent: 'text-sky-700 dark:text-sky-300'
    },
    Arrived: {
        badge: 'border-amber-200 bg-amber-50/90 text-amber-900 before:bg-amber-500 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200',
        dot: 'bg-amber-500',
        accent: 'text-amber-700 dark:text-amber-300'
    },
    'Checked-in': {
        badge: 'border-teal-200 bg-teal-50/90 text-teal-900 before:bg-teal-500 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-200',
        dot: 'bg-teal-500',
        accent: 'text-teal-700 dark:text-teal-300'
    },
    'Checked-In': {
        badge: 'border-teal-200 bg-teal-50/90 text-teal-900 before:bg-teal-500 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-200',
        dot: 'bg-teal-500',
        accent: 'text-teal-700 dark:text-teal-300'
    },
    'In Progress': {
        badge: 'border-indigo-200 bg-indigo-50/90 text-indigo-900 before:bg-indigo-500 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-200',
        dot: 'bg-indigo-500',
        accent: 'text-indigo-700 dark:text-indigo-300'
    },
    'In-Progress': {
        badge: 'border-indigo-200 bg-indigo-50/90 text-indigo-900 before:bg-indigo-500 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-200',
        dot: 'bg-indigo-500',
        accent: 'text-indigo-700 dark:text-indigo-300'
    },
    Completed: {
        badge: 'border-emerald-200 bg-emerald-50/90 text-emerald-900 before:bg-emerald-500 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200',
        dot: 'bg-emerald-500',
        accent: 'text-emerald-700 dark:text-emerald-300'
    },
    Cancelled: {
        badge: 'border-slate-200 bg-slate-100/70 text-slate-400 before:bg-slate-300 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-500',
        dot: 'bg-slate-300 dark:bg-slate-600',
        accent: 'text-slate-400 dark:text-slate-500'
    },
    'No-Show': {
        badge: 'border-rose-200 bg-rose-50/90 text-rose-900 before:bg-rose-500 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200',
        dot: 'bg-rose-500',
        accent: 'text-rose-700 dark:text-rose-300'
    }
};

const getModalityIcon = (modality) => {
    const m = (modality || '').toUpperCase();
    if (m.includes('MR')) return <Layers size={13} className="text-teal-600 dark:text-teal-400" />;
    if (m.includes('CT')) return <Zap size={13} className="text-sky-600 dark:text-sky-400" />;
    if (m.includes('US') || m.includes('ECHO')) return <Radio size={13} className="text-violet-600 dark:text-violet-400" />;
    if (m.includes('XR') || m.includes('CR') || m.includes('DX')) return <Activity size={13} className="text-amber-600 dark:text-amber-400" />;
    return <Sparkles size={13} className="text-slate-500 dark:text-slate-400" />;
};

const parseStart = (item) => new Date(item.start_time || item.appointment_date || item.appointment_time);

const parseEnd = (item, start) => {
    const value = item.end_time ? new Date(item.end_time) : new Date(start.getTime() + Number(item.duration || 45) * 60000);
    return Number.isNaN(value.getTime()) ? new Date(start.getTime() + 45 * 60000) : value;
};

const sameDay = (left, right) => left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();

const startOfWeek = (value, locale = 'en-US', firstDayOfWeek) => {
    const date = new Date(value);
    const day = date.getDay();
    const localeDefault = locale.startsWith('ar') ? 0 : 1;
    const firstDay = [0, 1, 6].includes(Number(firstDayOfWeek)) ? Number(firstDayOfWeek) : localeDefault;
    date.setDate(date.getDate() - ((day - firstDay + 7) % 7));
    date.setHours(0, 0, 0, 0);
    return date;
};

const eventLabel = (item, fallback) => item.patient_name || item.mrn || fallback;

const getRoomName = (item, t) => item.machine_name || item.modality_type || t('fallback.unassigned', 'Unassigned');

const getStatusLabel = (item, t) => t(`status.${item.status}`, { defaultValue: item.status || 'Scheduled' });

const StatusLegend = ({ t }) => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
        {[
            ['Scheduled', 'bg-slate-400'],
            ['Confirmed', 'bg-sky-500'],
            ['Arrived', 'bg-amber-500'],
            ['In Progress', 'bg-indigo-500'],
            ['Completed', 'bg-emerald-500'],
            ['Emergency', 'bg-rose-500']
        ].map(([status, color]) => (
            <span key={status} className="inline-flex items-center gap-1.5 transition-transform hover:scale-105">
                <span className={`h-2 w-2 rounded-full shadow-2xs ${color}`} />
                <span>{t(`${status === 'Emergency' ? 'priority' : 'status'}.${status}`, { defaultValue: status })}</span>
            </span>
        ))}
    </div>
);

const CalendarStat = ({ label, value, active = false, onClick, colorClass = 'text-teal-700 dark:text-teal-400', icon: Icon }) => (
    <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-black transition-all ${
            active
                ? 'border-teal-500 bg-teal-50 text-teal-900 shadow-xs ring-2 ring-teal-500/20 dark:border-teal-500 dark:bg-teal-950/50 dark:text-teal-100'
                : 'border-slate-200/90 bg-white/90 text-slate-600 hover:border-teal-300 hover:bg-slate-50/80 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200'
        }`}
    >
        {Icon && <Icon size={13} className={active ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400 dark:text-slate-500'} />}
        <span className={`font-mono text-xs font-black ${active ? 'text-teal-700 dark:text-teal-300' : colorClass}`}>{value}</span>
        <span className="font-semibold">{label}</span>
    </button>
);

const EventCard = ({ item, style, compact = false, onSelect, t, locale }) => {
    const start = parseStart(item);
    const end = parseEnd(item, start);
    const isEmergency = item.priority === 'Emergency';
    const isUrgent = item.priority === 'Urgent';

    const toneConfig = eventTone[item.status] || eventTone.Scheduled;
    const toneClass = isEmergency
        ? 'border-rose-300/90 bg-gradient-to-br from-rose-50/95 to-rose-100/60 text-rose-950 before:bg-rose-500 dark:border-rose-700/80 dark:from-rose-950/60 dark:to-rose-900/30 dark:text-rose-100 shadow-xs ring-1 ring-rose-500/20'
        : isUrgent
            ? 'border-amber-300/90 bg-gradient-to-br from-amber-50/95 to-amber-100/60 text-amber-950 before:bg-amber-500 dark:border-amber-700/80 dark:from-amber-950/60 dark:to-amber-900/30 dark:text-amber-100 shadow-xs'
            : `${toneConfig.badge} shadow-2xs`;

    const time = Number.isNaN(start.getTime()) ? '' : start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const endTime = Number.isNaN(end.getTime()) ? '' : end.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

    return (
        <button
            type="button"
            onClick={() => onSelect?.(item)}
            style={style}
            className={`group relative w-full overflow-hidden rounded-xl border p-2 text-start transition-all hover:scale-[1.02] hover:z-20 hover:shadow-md before:absolute before:inset-y-0 before:start-0 before:w-1.5 ${toneClass} ${item.status === 'Cancelled' ? 'opacity-50' : ''}`}
        >
            <div className="flex items-center justify-between gap-1">
                <span className="block truncate text-xs font-black tracking-tight">
                    {eventLabel(item, t('fallback.patient', 'Patient'))}
                </span>
                {isEmergency ? (
                    <span className="flex items-center gap-1 rounded-full bg-rose-500 px-1.5 py-0.2 text-[9px] font-black text-white shadow-2xs animate-pulse">
                        <Flame size={9} />
                    </span>
                ) : isUrgent ? (
                    <span className="flex items-center gap-0.5 rounded-full bg-amber-500 px-1.5 py-0.2 text-[9px] font-black text-white shadow-2xs">
                        <AlertTriangle size={9} />
                    </span>
                ) : null}
            </div>

            <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold opacity-85 tabular-nums">
                <Clock size={10} className="shrink-0 opacity-70" />
                <span>{time}{endTime ? ` - ${endTime}` : ''}</span>
            </div>

            {!compact && (
                <div className="mt-1 flex items-center justify-between gap-1 border-t border-black/5 pt-1 text-[10px] font-medium opacity-90 dark:border-white/5">
                    <span className="flex items-center gap-1 truncate">
                        {getModalityIcon(item.modality_type)}
                        <span className="truncate">{item.exam_type_name || item.modality_type || t('fallback.unspecifiedExam', 'Unspecified exam')}</span>
                    </span>
                    {item.machine_name && (
                        <span className="shrink-0 rounded-md bg-black/5 px-1 py-0.2 text-[9px] font-bold dark:bg-white/10">
                            {item.machine_name}
                        </span>
                    )}
                </div>
            )}
        </button>
    );
};

const Agenda = ({ appointments, onSelect, t, locale }) => {
    const grouped = useMemo(() => appointments.reduce((result, item) => {
        const start = parseStart(item);
        if (Number.isNaN(start.getTime())) return result;
        const key = start.toISOString().slice(0, 10);
        if (!result[key]) result[key] = [];
        result[key].push(item);
        return result;
    }, {}), [appointments]);

    if (!appointments.length) return <EmptySchedule t={t} />;

    return (
        <div className="divide-y divide-slate-100 dark:divide-slate-800/60 p-2 sm:p-4">
            {Object.entries(grouped).map(([date, items]) => {
                const dateObj = new Date(`${date}T00:00:00`);
                const isToday = sameDay(dateObj, new Date());
                return (
                    <section key={date} className="grid gap-4 py-4 sm:grid-cols-[180px_1fr] sm:py-5 first:pt-2">
                        <div className={`rounded-2xl border p-4 self-start transition-all ${
                            isToday
                                ? 'border-teal-300 bg-gradient-to-br from-teal-50/80 to-teal-100/40 dark:border-teal-800/80 dark:from-teal-950/50 dark:to-teal-900/20 shadow-xs'
                                : 'border-slate-200/70 bg-slate-50/60 dark:border-slate-800/50 dark:bg-slate-900/40'
                        }`}>
                            <div className="flex items-center justify-between">
                                <p className={`text-xs font-black uppercase tracking-wider ${isToday ? 'text-teal-700 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                    {dateObj.toLocaleDateString(locale, { weekday: 'long' })}
                                </p>
                                {isToday && (
                                    <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[9px] font-black text-white uppercase shadow-2xs">
                                        {t('calendar.today', 'Today')}
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-200">
                                {dateObj.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                            <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-teal-500/10 px-2.5 py-1 text-[10px] font-black text-teal-700 dark:bg-teal-950/60 dark:text-teal-300">
                                <CalendarDays size={12} />
                                {items.length} {t('calendar.countLabel', 'appointments')}
                            </span>
                        </div>

                        <div className="space-y-2.5">
                            {items.map((item) => {
                                const start = parseStart(item);
                                const isEmergency = item.priority === 'Emergency';
                                const isUrgent = item.priority === 'Urgent';
                                const toneConfig = eventTone[item.status] || eventTone.Scheduled;

                                return (
                                    <button
                                        key={item.appointment_id}
                                        type="button"
                                        onClick={() => onSelect?.(item)}
                                        className="group relative flex w-full flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 text-start transition-all duration-200 hover:border-teal-400 hover:shadow-md hover:scale-[1.005] dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-700 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            {/* Time Box */}
                                            <div className="flex h-12 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-100/90 dark:bg-slate-800/80">
                                                <span className="text-xs font-black text-slate-800 tabular-nums dark:text-slate-200">
                                                    {start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400">
                                                    {item.duration || 45}m
                                                </span>
                                            </div>

                                            {/* Patient & Exam Info */}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate text-sm font-black text-slate-900 dark:text-white">
                                                        {eventLabel(item, t('fallback.patient', 'Patient'))}
                                                    </span>
                                                    {item.mrn && (
                                                        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                            {item.mrn}
                                                        </span>
                                                    )}
                                                    {isEmergency ? (
                                                        <span className="flex items-center gap-1 rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-black text-white shadow-2xs">
                                                            <Flame size={10} /> {t('priority.Emergency', 'Emergency')}
                                                        </span>
                                                    ) : isUrgent ? (
                                                        <span className="flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-black text-white shadow-2xs">
                                                            <AlertTriangle size={10} /> {t('priority.Urgent', 'Urgent')}
                                                        </span>
                                                    ) : null}
                                                </div>

                                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                                                    <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                                                        {getModalityIcon(item.modality_type)}
                                                        <span>{item.exam_type_name || item.modality_type || t('fallback.unspecifiedExam', 'Unspecified exam')}</span>
                                                    </span>
                                                    <span className="opacity-40">·</span>
                                                    <span className="flex items-center gap-1">
                                                        <MapPin size={11} className="text-slate-400" />
                                                        <span>{getRoomName(item, t)}</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Status & View Button */}
                                        <div className="flex items-center justify-between gap-3 sm:justify-end">
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black ${toneConfig.badge}`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${toneConfig.dot}`} />
                                                {getStatusLabel(item, t)}
                                            </span>
                                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity dark:bg-slate-800 dark:text-slate-400">
                                                <Eye size={14} />
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );
};

const EmptySchedule = ({ t }) => (
    <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-400 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
            <CalendarDays size={32} className="text-teal-600 dark:text-teal-400" />
            <span className="absolute -top-1 -end-1 h-3.5 w-3.5 rounded-full bg-teal-500 shadow-2xs" />
        </div>
        <h3 className="mt-4 text-base font-black text-slate-800 dark:text-slate-100">
            {t('calendar.empty', 'No appointments in this range.')}
        </h3>
        <p className="mt-1.5 max-w-sm text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('calendar.hint', 'Select an appointment to inspect details.')}
        </p>
    </div>
);

const TimeGrid = ({ appointments, dates, resources, onSelect, onDateChange, onViewChange, t, locale }) => {
    const valid = appointments
        .map((item) => ({ item, start: parseStart(item) }))
        .filter(({ start }) => !Number.isNaN(start.getTime()));
    const earliest = valid.length ? Math.min(...valid.map(({ start }) => start.getHours())) : 8;
    const latest = valid.length ? Math.max(...valid.map(({ item, start }) => parseEnd(item, start).getHours() + 1)) : 18;
    const startHour = Math.max(0, Math.min(8, earliest));
    const endHour = Math.min(24, Math.max(18, latest));
    const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);

    const columns = resources?.length
        ? resources.map((resource) => ({ id: resource, label: resource, date: dates[0], isResource: true }))
        : dates.map((date) => ({ id: date.toISOString(), label: date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' }), date, isResource: false }));

    const now = new Date();
    const nowTop = ((now.getHours() - startHour) + now.getMinutes() / 60) * HOUR_HEIGHT;

    const columnItems = (column) => appointments
        .filter((item) => {
            const start = parseStart(item);
            if (!sameDay(start, column.date)) return false;
            return !resources?.length || getRoomName(item, t) === column.id;
        })
        .sort((left, right) => parseStart(left) - parseStart(right));

    return (
        <div className="overflow-auto scrollbar-thin" style={{ maxHeight: '740px' }}>
            <div className="min-w-[840px]" style={{ width: columns.length > 4 ? `${columns.length * 200 + 80}px` : undefined }}>
                {/* Header Grid */}
                <div className="sticky top-0 z-30 grid border-b border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 shadow-2xs" style={{ gridTemplateColumns: `80px repeat(${columns.length}, minmax(160px, 1fr))` }}>
                    <div className="flex items-center justify-center border-e border-slate-100 p-3 text-[10.5px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800">
                        <Clock3 size={13} className="me-1" />
                        {t('calendar.time', 'Time')}
                    </div>
                    {columns.map((column) => {
                        const isToday = sameDay(column.date, now);
                        const count = columnItems(column).length;
                        return (
                            <div key={column.id} className={`border-e border-slate-100 p-3 text-center last:border-e-0 dark:border-slate-800 ${isToday ? 'bg-teal-50/30 dark:bg-teal-950/20' : ''}`}>
                                <div className="flex items-center justify-center gap-1.5">
                                    {column.isResource && getModalityIcon(column.label)}
                                    <p className={`truncate text-xs font-black ${isToday ? 'text-teal-700 dark:text-teal-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                        {column.label}
                                    </p>
                                </div>
                                <div className="mt-1 flex items-center justify-center gap-2">
                                    {column.isResource ? (
                                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                            {column.date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
                                        </span>
                                    ) : (
                                        isToday && (
                                            <span className="rounded-full bg-teal-600 px-1.5 py-0.2 text-[9px] font-black text-white">
                                                {t('calendar.today', 'Today')}
                                            </span>
                                        )
                                    )}
                                    <span className="rounded-md bg-slate-100 px-1.5 py-0.2 text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                        {count} {t('calendar.countLabel', 'appointments')}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Body Grid */}
                <div className="grid" style={{ gridTemplateColumns: `80px repeat(${columns.length}, minmax(160px, 1fr))` }}>
                    {/* Time Column */}
                    <div className="border-e border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/30">
                        {hours.map((hour) => (
                            <div key={hour} style={{ height: HOUR_HEIGHT }} className="relative border-b border-slate-100/90 dark:border-slate-800/60">
                                <span className="absolute -top-2.5 end-2 font-mono text-[10px] font-bold text-slate-400 dark:text-slate-500 select-none">
                                    {new Date(2000, 0, 1, hour).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Columns */}
                    {columns.map((column) => {
                        const isToday = sameDay(column.date, now);
                        const items = columnItems(column);

                        return (
                            <div key={column.id} className="relative border-e border-slate-100 last:border-e-0 dark:border-slate-800/60" style={{ height: hours.length * HOUR_HEIGHT }}>
                                {/* Hour Lines */}
                                {hours.map((hour) => (
                                    <div key={hour} className="border-b border-slate-100/80 after:block after:h-1/2 after:border-b after:border-dashed after:border-slate-100/60 dark:border-slate-800/40 dark:after:border-slate-800/30" style={{ height: HOUR_HEIGHT }} />
                                ))}

                                {/* Live Now Marker */}
                                {isToday && nowTop >= 0 && nowTop <= hours.length * HOUR_HEIGHT && (
                                    <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-rose-500/90 shadow-2xs" style={{ top: nowTop }}>
                                        <span className="absolute -start-1.5 -top-1.5 h-3.5 w-3.5 rounded-full bg-rose-500 shadow-md ring-2 ring-white dark:ring-slate-900 animate-pulse" />
                                    </div>
                                )}

                                {/* Events Layer */}
                                <div className="absolute inset-0 p-1.5">
                                    {items.map((item, index, list) => {
                                        const start = parseStart(item);
                                        const end = parseEnd(item, start);
                                        const top = ((start.getHours() - startHour) + start.getMinutes() / 60) * HOUR_HEIGHT;
                                        const height = Math.max(46, (end - start) / 3600000 * HOUR_HEIGHT);

                                        const overlaps = list.filter((other) => {
                                            if (other.appointment_id === item.appointment_id) return false;
                                            const otherStart = parseStart(other);
                                            const otherEnd = parseEnd(other, otherStart);
                                            return start < otherEnd && end > otherStart;
                                        });
                                        const laneCount = Math.min(3, overlaps.length + 1);
                                        const lane = laneCount === 1 ? 0 : index % laneCount;
                                        const width = laneCount === 1 ? 'calc(100% - 8px)' : `calc(${100 / laneCount}% - 6px)`;
                                        const insetStart = laneCount === 1 ? 4 : `calc(${lane * (100 / laneCount)}% + 4px)`;

                                        return (
                                            <EventCard
                                                key={item.appointment_id}
                                                item={item}
                                                onSelect={onSelect}
                                                t={t}
                                                locale={locale}
                                                compact={height < 68}
                                                style={{ position: 'absolute', top, height, insetInlineStart: insetStart, width }}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const MonthGrid = ({ appointments, currentDate, onSelect, onDateChange, onViewChange, t, locale, firstDayOfWeek }) => {
    const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const gridStart = startOfWeek(first, locale, firstDayOfWeek);
    const days = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getTime() + index * DAY_MS));

    const handleDayClick = (day) => {
        if (onDateChange) onDateChange(day);
        if (onViewChange) onViewChange('day');
    };

    return (
        <div className="overflow-x-auto scrollbar-thin">
            <div className="min-w-[720px]">
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/70">
                    {days.slice(0, 7).map((day) => (
                        <div key={day.toISOString()} className="p-3 text-center text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
                            {day.toLocaleDateString(locale, { weekday: 'short' })}
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-7">
                    {days.map((day) => {
                        const items = appointments.filter((item) => sameDay(parseStart(item), day));
                        const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                        const isToday = sameDay(day, new Date());
                        return (
                            <div
                                key={day.toISOString()}
                                onClick={() => handleDayClick(day)}
                                className={`group min-h-32 border-b border-e border-slate-100 p-2.5 transition-all cursor-pointer dark:border-slate-800/60 hover:bg-teal-50/20 dark:hover:bg-teal-950/20 ${
                                    isCurrentMonth ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/60 dark:bg-slate-950/40'
                                } ${isToday ? 'bg-teal-50/40 dark:bg-teal-950/30' : ''}`}
                            >
                                <div className="flex items-center justify-between">
                                    <span className={`flex h-7 w-7 items-center justify-center rounded-xl text-xs font-black transition-transform group-hover:scale-110 ${
                                        isToday
                                            ? 'bg-teal-600 text-white shadow-xs'
                                            : isCurrentMonth
                                                ? 'text-slate-800 group-hover:text-teal-700 dark:text-slate-200 dark:group-hover:text-teal-400'
                                                : 'text-slate-300 dark:text-slate-600'
                                    }`}>
                                        {day.getDate()}
                                    </span>
                                    {items.length > 0 && (
                                        <span className="rounded-md bg-slate-100 px-1.5 py-0.2 text-[9px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                            {items.length}
                                        </span>
                                    )}
                                </div>
                                <div className="mt-2 space-y-1">
                                    {items.slice(0, 3).map((item) => (
                                        <div key={item.appointment_id} onClick={(e) => { e.stopPropagation(); onSelect?.(item); }}>
                                            <EventCard
                                                item={item}
                                                onSelect={onSelect}
                                                t={t}
                                                locale={locale}
                                                compact
                                            />
                                        </div>
                                    ))}
                                    {items.length > 3 && (
                                        <p className="px-1 text-[10px] font-black text-teal-700 hover:underline dark:text-teal-400">
                                            {t('fallback.more', { count: items.length - 3, defaultValue: `+${items.length - 3} more` })}
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const Scheduler = ({
    appointments = [],
    currentDate = new Date(),
    viewMode = 'day',
    onViewChange,
    onDateChange,
    onPrevDate,
    onNextDate,
    onToday,
    onSelectEvent,
    t: tProp,
    locale = 'en-US',
    firstDayOfWeek,
    integrated = false
}) => {
    const t = useMemo(() => createTranslator(tProp, locale), [tProp, locale]);
    const views = ['day', 'week', 'month', 'agenda'];
    const [isExpanded, setIsExpanded] = useState(false);
    const [activeFilter, setActiveFilter] = useState(null); // null | 'rooms' | 'priority' | 'completed'

    const dates = useMemo(() => {
        if (viewMode !== 'week') return [new Date(currentDate)];
        const start = startOfWeek(currentDate, locale, firstDayOfWeek);
        return Array.from({ length: 7 }, (_, index) => new Date(start.getTime() + index * DAY_MS));
    }, [currentDate, firstDayOfWeek, locale, viewMode]);

    const resources = useMemo(() =>
        viewMode === 'day'
            ? [...new Set(appointments.map((item) => getRoomName(item, t)))]
            : null,
        [appointments, t, viewMode]
    );

    const stats = useMemo(() => {
        const rooms = new Set(appointments.map((item) => getRoomName(item, t))).size;
        const priority = appointments.filter((item) => ['Urgent', 'Emergency'].includes(item.priority)).length;
        const completed = appointments.filter((item) => item.status === 'Completed').length;
        return { total: appointments.length, rooms, priority, completed };
    }, [appointments, t]);

    const filteredAppointments = useMemo(() => {
        if (!activeFilter) return appointments;
        if (activeFilter === 'priority') {
            return appointments.filter((item) => ['Urgent', 'Emergency'].includes(item.priority));
        }
        if (activeFilter === 'completed') {
            return appointments.filter((item) => item.status === 'Completed');
        }
        return appointments;
    }, [appointments, activeFilter]);

    const title = viewMode === 'month'
        ? currentDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
        : viewMode === 'week'
            ? `${dates[0].toLocaleDateString(locale, { month: 'short', day: 'numeric' })} - ${dates[6].toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}`
            : currentDate.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    const handleStatToggle = (type) => {
        setActiveFilter((prev) => (prev === type ? null : type));
    };

    return (
        <section className={`overflow-hidden rounded-2xl bg-white transition-all duration-300 dark:bg-slate-900 ${
            isExpanded ? 'fixed inset-4 z-50 rounded-3xl border border-slate-200/90 shadow-2xl dark:border-slate-800' : ''
        }`}>
            {isExpanded && (
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs -z-10" onClick={() => setIsExpanded(false)} />
            )}

            {/* Header Layout */}
            {integrated ? (
                <header className="border-b border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <StatusLegend t={t} />
                        <div className="flex flex-wrap items-center gap-2">
                            <CalendarStat
                                label={t('calendar.countLabel', 'appointments')}
                                value={stats.total}
                                active={activeFilter === null && appointments.length > 0}
                                onClick={() => setActiveFilter(null)}
                            />
                            <CalendarStat
                                label={t('calendar.roomsLabel', 'rooms')}
                                value={stats.rooms}
                                colorClass="text-sky-700 dark:text-sky-400"
                            />
                            <CalendarStat
                                label={t('calendar.priorityLabel', 'priority')}
                                value={stats.priority}
                                active={activeFilter === 'priority'}
                                onClick={() => handleStatToggle('priority')}
                                colorClass="text-rose-700 dark:text-rose-400"
                                icon={Flame}
                            />
                            <CalendarStat
                                label={t('calendar.doneLabel', 'done')}
                                value={stats.completed}
                                active={activeFilter === 'completed'}
                                onClick={() => handleStatToggle('completed')}
                                colorClass="text-emerald-700 dark:text-emerald-400"
                                icon={CheckCircle2}
                            />
                            {activeFilter && (
                                <button
                                    type="button"
                                    onClick={() => setActiveFilter(null)}
                                    className="inline-flex items-center gap-1 rounded-xl bg-slate-200/80 px-2 py-1 text-[10px] font-black text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300"
                                >
                                    <X size={11} />
                                    {t('calendar.clearFilter', 'Clear')}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-teal-300 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition shadow-2xs"
                                title={isExpanded ? t('calendar.collapse', 'Collapse') : t('calendar.expand', 'Expand')}
                                aria-label={isExpanded ? t('calendar.collapse', 'Collapse') : t('calendar.expand', 'Expand')}
                            >
                                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </button>
                        </div>
                    </div>
                </header>
            ) : (
                <header className="border-b border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40 sm:p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        {/* Navigation & Title */}
                        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                            <button
                                type="button"
                                onClick={onToday}
                                className="min-h-9 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 shadow-2xs transition hover:border-teal-300 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                                {t('calendar.today', 'Today')}
                            </button>
                            <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs dark:border-slate-700 dark:bg-slate-800">
                                <button
                                    type="button"
                                    aria-label={t('calendar.previous', 'Previous')}
                                    onClick={onPrevDate}
                                    className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-teal-700 dark:text-slate-400 dark:hover:bg-slate-700"
                                >
                                    <ChevronLeft size={16} className="rtl:rotate-180" />
                                </button>
                                <button
                                    type="button"
                                    aria-label={t('calendar.next', 'Next')}
                                    onClick={onNextDate}
                                    className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-teal-700 dark:text-slate-400 dark:hover:bg-slate-700"
                                >
                                    <ChevronRight size={16} className="rtl:rotate-180" />
                                </button>
                            </div>
                            <h2 className="min-w-0 flex-1 truncate text-sm font-black text-slate-900 dark:text-white sm:text-base">
                                {title}
                            </h2>
                        </div>

                        {/* View Mode Switcher & Controls */}
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="grid grid-cols-4 rounded-xl bg-slate-100/90 p-0.5 dark:bg-slate-800">
                                {views.map((view) => (
                                    <button
                                        key={view}
                                        type="button"
                                        onClick={() => onViewChange?.(view)}
                                        className={`min-h-8 rounded-lg px-2.5 text-xs font-black transition ${
                                            viewMode === view
                                                ? 'bg-teal-700 text-white shadow-xs'
                                                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                                        }`}
                                    >
                                        {t(`view.${view}`, view)}
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-teal-300 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition shadow-2xs"
                                title={isExpanded ? t('calendar.collapse', 'Collapse') : t('calendar.expand', 'Expand')}
                                aria-label={isExpanded ? t('calendar.collapse', 'Collapse') : t('calendar.expand', 'Expand')}
                            >
                                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </button>
                        </div>
                    </div>

                    {/* Stats & Legend Sub-bar */}
                    <div className="mt-3.5 flex flex-col gap-3 border-t border-slate-100 pt-3 dark:border-slate-800 2xl:flex-row 2xl:items-center 2xl:justify-between">
                        <StatusLegend t={t} />
                        <div className="flex flex-wrap items-center gap-2">
                            <CalendarStat
                                label={t('calendar.countLabel', 'appointments')}
                                value={stats.total}
                                active={activeFilter === null && appointments.length > 0}
                                onClick={() => setActiveFilter(null)}
                            />
                            <CalendarStat
                                label={t('calendar.roomsLabel', 'rooms')}
                                value={stats.rooms}
                                colorClass="text-sky-700 dark:text-sky-400"
                            />
                            <CalendarStat
                                label={t('calendar.priorityLabel', 'priority')}
                                value={stats.priority}
                                active={activeFilter === 'priority'}
                                onClick={() => handleStatToggle('priority')}
                                colorClass="text-rose-700 dark:text-rose-400"
                                icon={Flame}
                            />
                            <CalendarStat
                                label={t('calendar.doneLabel', 'done')}
                                value={stats.completed}
                                active={activeFilter === 'completed'}
                                onClick={() => handleStatToggle('completed')}
                                colorClass="text-emerald-700 dark:text-emerald-400"
                                icon={CheckCircle2}
                            />
                            {activeFilter && (
                                <button
                                    type="button"
                                    onClick={() => setActiveFilter(null)}
                                    className="inline-flex items-center gap-1 rounded-xl bg-slate-200/80 px-2 py-1 text-[10px] font-black text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300"
                                >
                                    <X size={11} />
                                    {t('calendar.clearFilter', 'Clear')}
                                </button>
                            )}
                        </div>
                    </div>
                </header>
            )}

            {/* View Content Body */}
            {filteredAppointments.length === 0 ? (
                <EmptySchedule t={t} />
            ) : viewMode === 'agenda' ? (
                <Agenda appointments={filteredAppointments} onSelect={onSelectEvent} t={t} locale={locale} />
            ) : viewMode === 'month' ? (
                <MonthGrid
                    appointments={filteredAppointments}
                    currentDate={currentDate}
                    onSelect={onSelectEvent}
                    onDateChange={onDateChange}
                    onViewChange={onViewChange}
                    t={t}
                    locale={locale}
                    firstDayOfWeek={firstDayOfWeek}
                />
            ) : (
                <>
                    <div className="block lg:hidden">
                        <Agenda appointments={filteredAppointments} onSelect={onSelectEvent} t={t} locale={locale} />
                    </div>
                    <div className="hidden lg:block">
                        <TimeGrid
                            appointments={filteredAppointments}
                            dates={dates}
                            resources={resources}
                            onSelect={onSelectEvent}
                            onDateChange={onDateChange}
                            onViewChange={onViewChange}
                            t={t}
                            locale={locale}
                        />
                    </div>
                </>
            )}
        </section>
    );
};

export default Scheduler;
