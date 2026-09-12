// Scheduler.jsx
import React, { useMemo, useState } from 'react';
import {
    Activity, CalendarDays, ChevronLeft, ChevronRight, Clock3,
    Maximize2, Minimize2
} from 'lucide-react';

const DAY_MS = 86400000;
const HOUR_HEIGHT = 72;

const eventTone = {
    Scheduled: 'border-slate-200 bg-slate-50/90 text-slate-800 before:bg-slate-400 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 shadow-2xs',
    Confirmed: 'border-teal-200 bg-teal-50/90 text-teal-900 before:bg-teal-500 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-200 shadow-2xs',
    Arrived: 'border-amber-200 bg-amber-50/90 text-amber-900 before:bg-amber-500 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200 shadow-2xs',
    'Checked-in': 'border-teal-200 bg-teal-50/90 text-teal-900 before:bg-teal-500 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-200 shadow-2xs',
    'Checked-In': 'border-teal-200 bg-teal-50/90 text-teal-900 before:bg-teal-500 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-200 shadow-2xs',
    'In Progress': 'border-indigo-200 bg-indigo-50/90 text-indigo-900 before:bg-indigo-500 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-200 shadow-2xs',
    'In-Progress': 'border-indigo-200 bg-indigo-50/90 text-indigo-900 before:bg-indigo-500 dark:border-indigo-800/60 dark:bg-indigo-950/40 dark:text-indigo-200 shadow-2xs',
    Completed: 'border-emerald-200 bg-emerald-50/90 text-emerald-900 before:bg-emerald-500 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-200 shadow-2xs',
    Cancelled: 'border-slate-200 bg-slate-100/80 text-slate-400 before:bg-slate-300 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-500 shadow-none',
    'No-Show': 'border-rose-200 bg-rose-50/90 text-rose-900 before:bg-rose-500 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-200 shadow-2xs'
};

const parseStart = (item) => new Date(item.start_time || item.appointment_date || item.appointment_time);

const parseEnd = (item, start) => {
    const value = item.end_time ? new Date(item.end_time) : new Date(start.getTime() + Number(item.duration || 45) * 60000);
    return Number.isNaN(value.getTime()) ? new Date(start.getTime() + 45 * 60000) : value;
};

const sameDay = (left, right) => left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();

const startOfWeek = (value, locale = 'en-US') => {
    const date = new Date(value);
    const day = date.getDay();
    const isArabic = locale.startsWith('ar');
    date.setDate(date.getDate() + (isArabic ? -day : day === 0 ? -6 : 1 - day));
    date.setHours(0, 0, 0, 0);
    return date;
};

const eventLabel = (item, fallback) => item.patient_name || item.mrn || fallback;

const getRoomName = (item, t) => item.machine_name || item.modality_type || t('fallback.unassigned', 'Unassigned');

const getStatusLabel = (item, t) => t(`status.${item.status}`, { defaultValue: item.status || 'Scheduled' });

const StatusLegend = ({ t }) => (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
        {[
            ['Scheduled', 'bg-slate-400'],
            ['Confirmed', 'bg-teal-500'],
            ['Arrived', 'bg-amber-500'],
            ['Completed', 'bg-emerald-500'],
            ['Emergency', 'bg-rose-500']
        ].map(([status, color]) => (
            <span key={status} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${color}`} />
                {t(`${status === 'Emergency' ? 'priority' : 'status'}.${status}`, { defaultValue: status })}
            </span>
        ))}
    </div>
);

const CalendarStat = ({ label, value }) => (
    <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400 shadow-2xs">
        <span className="font-mono text-xs font-black text-teal-700 dark:text-teal-400">{value}</span>
        <span>{label}</span>
    </span>
);

const EventCard = ({ item, style, compact = false, onSelect, t, locale }) => {
    const start = parseStart(item);
    const end = parseEnd(item, start);
    const isEmergency = item.priority === 'Emergency';
    const isUrgent = item.priority === 'Urgent';
    const tone = isEmergency
        ? 'border-rose-300 bg-rose-50/95 text-rose-900 before:bg-rose-500 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200 shadow-xs'
        : isUrgent
            ? 'border-amber-300 bg-amber-50/95 text-amber-900 before:bg-amber-500 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200 shadow-xs'
            : eventTone[item.status] || eventTone.Scheduled;
    const time = Number.isNaN(start.getTime()) ? '' : start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const endTime = Number.isNaN(end.getTime()) ? '' : end.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

    return (
        <button
            type="button"
            onClick={() => onSelect?.(item)}
            style={style}
            className={`group relative w-full overflow-hidden rounded-xl border p-2 text-start transition-all hover:scale-[1.01] hover:shadow-md before:absolute before:inset-y-0 before:start-0 before:w-1.5 ${tone} ${item.status === 'Cancelled' ? 'opacity-60' : ''}`}
        >
            <div className="flex items-center justify-between gap-1">
                <span className="block truncate text-xs font-black">{eventLabel(item, t('fallback.patient', 'Patient'))}</span>
                {item.priority && item.priority !== 'Routine' && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80" />
                )}
            </div>
            <span className="mt-0.5 block truncate text-[10px] font-bold opacity-80">{time}{endTime ? ` - ${endTime}` : ''}</span>
            {!compact && (
                <span className="mt-1 flex items-center gap-1 truncate text-[10px] font-medium opacity-85">
                    <Activity size={10} className="shrink-0" /> {item.exam_type_name || item.modality_type || t('fallback.unspecifiedExam', 'Unspecified exam')}
                </span>
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
        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {Object.entries(grouped).map(([date, items]) => (
                <section key={date} className="grid gap-3 p-4 sm:grid-cols-[160px_1fr] sm:p-5">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800/40 dark:bg-slate-900/40 self-start">
                        <p className="text-xs font-black uppercase tracking-wider text-teal-700 dark:text-teal-400">
                            {new Date(`${date}T00:00:00`).toLocaleDateString(locale, { weekday: 'long' })}
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                            {new Date(`${date}T00:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        <span className="mt-2 inline-block rounded-full bg-teal-500/10 px-2 py-0.5 text-[9px] font-black text-teal-700 dark:text-teal-300">
                            {items.length} {t('calendar.countLabel', 'appointments')}
                        </span>
                    </div>
                    <div className="space-y-2">
                        {items.map((item) => {
                            const start = parseStart(item);
                            return (
                                <button
                                    key={item.appointment_id}
                                    type="button"
                                    onClick={() => onSelect?.(item)}
                                    className="flex w-full flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 text-start transition hover:border-teal-300 hover:shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-800 sm:flex-row sm:items-center sm:gap-3"
                                >
                                    <span className="w-20 shrink-0 text-xs font-black text-slate-700 tabular-nums dark:text-slate-300">
                                        {start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-black text-slate-900 dark:text-white">
                                            {eventLabel(item, t('fallback.patient', 'Patient'))}
                                        </span>
                                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                                            {item.exam_type_name || t('fallback.unspecifiedExam', 'Unspecified exam')} · {getRoomName(item, t)}
                                        </span>
                                    </span>
                                    <span className="inline-flex w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                        {getStatusLabel(item, t)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </section>
            ))}
        </div>
    );
};

const EmptySchedule = ({ t }) => (
    <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50 text-slate-400 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <CalendarDays size={28} className="opacity-60 text-teal-600 dark:text-teal-400" />
        </span>
        <p className="mt-4 text-sm font-black text-slate-800 dark:text-slate-200">{t('calendar.empty', 'No appointments in this range.')}</p>
        <p className="mt-1 text-xs font-medium text-slate-400 dark:text-slate-500">{t('calendar.hint', 'Select an appointment to inspect details.')}</p>
    </div>
);

const TimeGrid = ({ appointments, dates, resources, onSelect, t, locale }) => {
    const valid = appointments
        .map((item) => ({ item, start: parseStart(item) }))
        .filter(({ start }) => !Number.isNaN(start.getTime()));
    const earliest = valid.length ? Math.min(...valid.map(({ start }) => start.getHours())) : 8;
    const latest = valid.length ? Math.max(...valid.map(({ item, start }) => parseEnd(item, start).getHours() + 1)) : 18;
    const startHour = Math.max(0, Math.min(8, earliest));
    const endHour = Math.min(24, Math.max(18, latest));
    const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
    const columns = resources?.length
        ? resources.map((resource) => ({ id: resource, label: resource, date: dates[0] }))
        : dates.map((date) => ({ id: date.toISOString(), label: date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' }), date }));
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
        <div className="overflow-auto scrollbar-thin" style={{ maxHeight: '720px' }}>
            <div className="min-w-[840px]" style={{ width: columns.length > 5 ? `${columns.length * 180 + 76}px` : undefined }}>
                <div className="sticky top-0 z-30 grid border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95" style={{ gridTemplateColumns: `76px repeat(${columns.length}, minmax(150px, 1fr))` }}>
                    <div className="border-e border-slate-100 p-3 text-center text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800">
                        {t('calendar.time', 'Time')}
                    </div>
                    {columns.map((column) => (
                        <div key={column.id} className="border-e border-slate-100 p-3 text-center last:border-e-0 dark:border-slate-800">
                            <p className="truncate text-xs font-black text-slate-800 dark:text-slate-200">{column.label}</p>
                            {resources?.length && (
                                <p className="mt-0.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                                    {column.date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
                <div className="grid" style={{ gridTemplateColumns: `76px repeat(${columns.length}, minmax(150px, 1fr))` }}>
                    <div className="border-e border-slate-100 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-950/20">
                        {hours.map((hour) => (
                            <div key={hour} style={{ height: HOUR_HEIGHT }} className="relative border-b border-slate-100 dark:border-slate-800/60">
                                <span className="absolute -top-2.5 end-2 font-mono text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                    {new Date(2000, 0, 1, hour).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        ))}
                    </div>
                    {columns.map((column) => (
                        <div key={column.id} className="relative border-e border-slate-100 last:border-e-0 dark:border-slate-800/60" style={{ height: hours.length * HOUR_HEIGHT }}>
                            {hours.map((hour) => (
                                <div key={hour} className="border-b border-slate-100/80 after:block after:h-1/2 after:border-b after:border-dashed after:border-slate-100/80 dark:border-slate-800/40 dark:after:border-slate-800/40" style={{ height: HOUR_HEIGHT }} />
                            ))}
                            {sameDay(column.date, now) && nowTop >= 0 && nowTop <= hours.length * HOUR_HEIGHT && (
                                <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-rose-500" style={{ top: nowTop }}>
                                    <span className="absolute -start-1 -top-1.5 h-3 w-3 rounded-full bg-rose-500 shadow-xs animate-pulse" />
                                </div>
                            )}
                            <div className="absolute inset-0 p-1.5">
                                {columnItems(column).map((item, index, list) => {
                                    const start = parseStart(item);
                                    const end = parseEnd(item, start);
                                    const top = ((start.getHours() - startHour) + start.getMinutes() / 60) * HOUR_HEIGHT;
                                    const height = Math.max(42, (end - start) / 3600000 * HOUR_HEIGHT);
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
                                            compact={height < 65}
                                            style={{ position: 'absolute', top, height, insetInlineStart: insetStart, width }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const MonthGrid = ({ appointments, currentDate, onSelect, t, locale }) => {
    const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const gridStart = startOfWeek(first, locale);
    const days = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getTime() + index * DAY_MS));

    return (
        <div className="overflow-x-auto scrollbar-thin">
            <div className="min-w-[700px]">
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/60">
                    {days.slice(0, 7).map((day) => (
                        <div key={day.toISOString()} className="p-3 text-center text-[10.5px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400">
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
                                className={`min-h-32 border-b border-e border-slate-100 p-2 transition-colors dark:border-slate-800/60 ${isCurrentMonth ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/60 dark:bg-slate-950/40'
                                    } ${isToday ? 'bg-teal-50/30 dark:bg-teal-950/20' : ''}`}
                            >
                                <span className={`flex h-7 w-7 items-center justify-center rounded-xl text-xs font-black ${isToday
                                    ? 'bg-teal-600 text-white shadow-xs'
                                    : isCurrentMonth
                                        ? 'text-slate-800 dark:text-slate-200'
                                        : 'text-slate-300 dark:text-slate-600'
                                    }`}>
                                    {day.getDate()}
                                </span>
                                <div className="mt-1.5 space-y-1">
                                    {items.slice(0, 3).map((item) => (
                                        <EventCard
                                            key={item.appointment_id}
                                            item={item}
                                            onSelect={onSelect}
                                            t={t}
                                            locale={locale}
                                            compact
                                        />
                                    ))}
                                    {items.length > 3 && (
                                        <p className="px-1 text-[10px] font-black text-teal-700 dark:text-teal-400">
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
    onPrevDate,
    onNextDate,
    onToday,
    onSelectEvent,
    t,
    locale = 'en-US',
    integrated = false
}) => {
    const views = ['day', 'week', 'month'];
    const [isExpanded, setIsExpanded] = useState(false);

    const dates = useMemo(() => {
        if (viewMode !== 'week') return [new Date(currentDate)];
        const start = startOfWeek(currentDate, locale);
        return Array.from({ length: 7 }, (_, index) => new Date(start.getTime() + index * DAY_MS));
    }, [currentDate, locale, viewMode]);

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

    const title = viewMode === 'month'
        ? currentDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
        : viewMode === 'week'
            ? `${dates[0].toLocaleDateString(locale, { month: 'short', day: 'numeric' })} - ${dates[6].toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}`
            : currentDate.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    return (
        <section className={`overflow-hidden rounded-2xl bg-white dark:bg-slate-900 transition-all duration-300 ${isExpanded ? 'fixed inset-4 z-50 rounded-3xl border border-slate-200/90 shadow-2xl dark:border-slate-800' : ''}`}>
            {isExpanded && (
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs -z-10" onClick={() => setIsExpanded(false)} />
            )}

            {/* If integrated, show compact auxiliary bar without repeating date controls */}
            {integrated ? (
                <header className="border-b border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <StatusLegend t={t} />
                        <div className="flex flex-wrap items-center gap-2">
                            <CalendarStat label={t('calendar.countLabel', 'appointments')} value={stats.total} />
                            <CalendarStat label={t('calendar.roomsLabel', 'rooms')} value={stats.rooms} />
                            <CalendarStat label={t('calendar.priorityLabel', 'priority')} value={stats.priority} />
                            <CalendarStat label={t('calendar.doneLabel', 'done')} value={stats.completed} />
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
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={onToday}
                                className="min-h-9 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 transition hover:border-teal-300 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                                {t('calendar.today', 'Today')}
                            </button>
                            <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
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
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800">
                                {views.map((view) => (
                                    <button
                                        key={view}
                                        type="button"
                                        onClick={() => onViewChange?.(view)}
                                        className={`min-h-8 rounded-lg px-2.5 text-xs font-black capitalize transition ${viewMode === view
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
                    <div className="mt-3.5 flex flex-col gap-3 border-t border-slate-100 pt-3 dark:border-slate-800 2xl:flex-row 2xl:items-center 2xl:justify-between">
                        <StatusLegend t={t} />
                        <div className="flex flex-wrap items-center gap-2">
                            <CalendarStat label={t('calendar.countLabel', 'appointments')} value={stats.total} />
                            <CalendarStat label={t('calendar.roomsLabel', 'rooms')} value={stats.rooms} />
                            <CalendarStat label={t('calendar.priorityLabel', 'priority')} value={stats.priority} />
                            <CalendarStat label={t('calendar.doneLabel', 'done')} value={stats.completed} />
                        </div>
                    </div>
                </header>
            )}

            {appointments.length === 0 ? (
                <EmptySchedule t={t} />
            ) : viewMode === 'agenda' ? (
                <Agenda appointments={appointments} onSelect={onSelectEvent} t={t} locale={locale} />
            ) : viewMode === 'month' ? (
                <MonthGrid appointments={appointments} currentDate={currentDate} onSelect={onSelectEvent} t={t} locale={locale} />
            ) : (
                <>
                    <div className="block lg:hidden">
                        <Agenda appointments={appointments} onSelect={onSelectEvent} t={t} locale={locale} />
                    </div>
                    <div className="hidden lg:block">
                        <TimeGrid appointments={appointments} dates={dates} resources={resources} onSelect={onSelectEvent} t={t} locale={locale} />
                    </div>
                </>
            )}
        </section>
    );
};

export default Scheduler;
