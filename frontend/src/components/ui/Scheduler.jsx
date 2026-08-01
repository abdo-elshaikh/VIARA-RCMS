// Scheduler.jsx
import React, { useMemo, useState } from 'react';
import {
    Activity, CalendarDays, ChevronLeft, ChevronRight, Clock3,
    Maximize2, Minimize2
} from 'lucide-react';

const DAY_MS = 86400000;
const HOUR_HEIGHT = 72;

const eventTone = {
    Scheduled: 'border-teal-200 bg-gradient-to-br from-teal-50/95 to-white text-teal-900 before:bg-teal-500 shadow-sm shadow-teal-500/10',
    Confirmed: 'border-cyan-200 bg-gradient-to-br from-cyan-50/95 to-white text-cyan-900 before:bg-cyan-500 shadow-sm shadow-cyan-500/10',
    Arrived: 'border-amber-200 bg-gradient-to-br from-amber-50/95 to-white text-amber-900 before:bg-amber-500 shadow-sm shadow-amber-500/10',
    'Checked-in': 'border-cyan-200 bg-gradient-to-br from-cyan-50/95 to-white text-cyan-900 before:bg-cyan-500 shadow-sm shadow-cyan-500/10',
    'Checked-In': 'border-cyan-200 bg-gradient-to-br from-cyan-50/95 to-white text-cyan-900 before:bg-cyan-500 shadow-sm shadow-cyan-500/10',
    'In Progress': 'border-teal-200 bg-gradient-to-br from-teal-50/95 to-white text-teal-900 before:bg-teal-600 shadow-sm shadow-teal-500/10',
    'In-Progress': 'border-teal-200 bg-gradient-to-br from-teal-50/95 to-white text-teal-900 before:bg-teal-600 shadow-sm shadow-teal-500/10',
    Completed: 'border-emerald-200 bg-gradient-to-br from-emerald-50/95 to-white text-emerald-900 before:bg-emerald-500 shadow-sm shadow-emerald-500/10',
    Cancelled: 'border-slate-200 bg-gradient-to-br from-slate-100/95 to-white text-slate-500 before:bg-slate-400 shadow-sm shadow-slate-500/5',
    'No-Show': 'border-rose-200 bg-gradient-to-br from-rose-50/95 to-white text-rose-900 before:bg-rose-500 shadow-sm shadow-rose-500/10'
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        {[
            ['Scheduled', 'bg-teal-500'],
            ['Confirmed', 'bg-cyan-500'],
            ['Completed', 'bg-emerald-500'],
            ['Emergency', 'bg-rose-500']
        ].map(([status, color]) => (
            <span key={status} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-none ${color}`} />
                {t(`${status === 'Emergency' ? 'priority' : 'status'}.${status}`, { defaultValue: status })}
            </span>
        ))}
    </div>
);

const CalendarStat = ({ label, value }) => (
    <span className="inline-flex items-center gap-1.5 border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[.08em] text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
        <span className="font-mono text-xs text-teal-700 dark:text-teal-300">{value}</span>
        {label}
    </span>
);

const EventCard = ({ item, style, compact = false, onSelect, t, locale }) => {
    const start = parseStart(item);
    const end = parseEnd(item, start);
    const tone = item.priority === 'Emergency'
        ? 'border-rose-300 bg-rose-50 text-rose-900 before:bg-rose-500 shadow-sm shadow-rose-500/10'
        : eventTone[item.status] || eventTone.Scheduled;
    const time = Number.isNaN(start.getTime()) ? '' : start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const endTime = Number.isNaN(end.getTime()) ? '' : end.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

    return (
        <button
            type="button"
            onClick={() => onSelect?.(item)}
            style={style}
            className={`group relative w-full overflow-hidden rounded-none border p-2.5 text-start shadow-sm transition hover:-translate-y-0.5 hover:shadow-md before:absolute before:inset-y-0 before:start-0 before:w-1 dark:bg-[#0b1220] dark:text-slate-100 ${tone} ${item.status === 'Cancelled' ? 'opacity-70' : ''}`}
        >
            <span className="block truncate text-xs font-extrabold">{eventLabel(item, t('fallback.patient', 'Patient'))}</span>
            <span className="mt-0.5 block truncate text-[10px] font-semibold opacity-75">{time}{endTime ? ` - ${endTime}` : ''}</span>
            {!compact && (
                <span className="mt-1 flex items-center gap-1 truncate text-[10px] font-semibold opacity-80">
                    <Activity size={10} /> {item.exam_type_name || item.modality_type || t('fallback.unspecifiedExam', 'Unspecified exam')}
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
        <div className="divide-y divide-slate-100 dark:divide-white/5">
            {Object.entries(grouped).map(([date, items]) => (
                <section key={date} className="grid gap-3 p-4 sm:grid-cols-[150px_1fr] sm:p-5">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.12em] text-teal-700 dark:text-teal-400">
                            {new Date(`${date}T00:00:00`).toLocaleDateString(locale, { weekday: 'long' })}
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-200">
                            {new Date(`${date}T00:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                    </div>
                    <div className="space-y-2">
                        {items.map((item) => {
                            const start = parseStart(item);
                            return (
                                <button
                                    key={item.appointment_id}
                                    type="button"
                                    onClick={() => onSelect?.(item)}
                                    className="flex w-full flex-col gap-3 rounded-none border border-slate-200 bg-white p-3 text-start transition hover:border-teal-300 hover:shadow-sm dark:border-white/10 dark:bg-[#0b1220] dark:hover:border-teal-800 sm:flex-row sm:items-center"
                                >
                                    <span className="w-20 shrink-0 text-xs font-black text-slate-700 tabular-nums dark:text-slate-300">
                                        {start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-extrabold text-slate-900 dark:text-white">
                                            {eventLabel(item, t('fallback.patient', 'Patient'))}
                                        </span>
                                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                                            {item.exam_type_name || t('fallback.unspecifiedExam', 'Unspecified exam')} / {getRoomName(item, t)}
                                        </span>
                                    </span>
                                    <span className="inline-flex w-fit rounded-none bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-600 dark:bg-white/5 dark:text-slate-400">
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
    <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-none border border-slate-200/60 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-400 shadow-inner dark:from-white/5 dark:to-white/[0.02]">
            <CalendarDays size={28} className="opacity-50" />
        </span>
        <p className="mt-5 text-sm font-black text-slate-700 dark:text-slate-300">{t('calendar.empty', 'No appointments in this range.')}</p>
        <p className="mt-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500">{t('calendar.hint', 'Select an appointment to inspect details.')}</p>
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
        <div className="overflow-auto" style={{ maxHeight: '720px' }}>
            <div className="min-w-[840px]" style={{ width: columns.length > 5 ? `${columns.length * 180 + 64}px` : undefined }}>
                <div className="sticky top-0 z-30 grid border-b border-slate-200 bg-white/95 backdrop-blur dark:border-white/5 dark:bg-[#0b1220]/95" style={{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(150px, 1fr))` }}>
                    <div className="border-e border-slate-100 p-3 text-center text-[10px] font-black uppercase tracking-wider text-slate-400 dark:border-white/5">
                        {t('calendar.time', 'Time')}
                    </div>
                    {columns.map((column) => (
                        <div key={column.id} className="border-e border-slate-100 p-3 text-center last:border-e-0 dark:border-white/5">
                            <p className="truncate text-xs font-extrabold text-slate-800 dark:text-slate-200">{column.label}</p>
                            {resources?.length && (
                                <p className="mt-0.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                                    {column.date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
                <div className="grid" style={{ gridTemplateColumns: `64px repeat(${columns.length}, minmax(150px, 1fr))` }}>
                    <div className="border-e border-slate-100 bg-slate-50/40 dark:border-white/5 dark:bg-white/[0.02]">
                        {hours.map((hour) => (
                            <div key={hour} style={{ height: HOUR_HEIGHT }} className="relative border-b border-slate-100 dark:border-white/5">
                                <span className="absolute -top-2.5 end-3 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                    {new Date(2000, 0, 1, hour).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        ))}
                    </div>
                    {columns.map((column) => (
                        <div key={column.id} className="relative border-e border-slate-100 last:border-e-0 dark:border-white/5" style={{ height: hours.length * HOUR_HEIGHT }}>
                            {hours.map((hour) => (
                                <div key={hour} className="border-b border-slate-100 after:block after:h-1/2 after:border-b after:border-dashed after:border-slate-100 dark:border-white/5" style={{ height: HOUR_HEIGHT }} />
                            ))}
                            {sameDay(column.date, now) && nowTop >= 0 && nowTop <= hours.length * HOUR_HEIGHT && (
                                <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-rose-400" style={{ top: nowTop }}>
                                    <span className="absolute -start-1 -top-1.5 h-3 w-3 rounded-none bg-rose-500" />
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
        <div className="overflow-x-auto">
            <div className="min-w-[760px]">
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70 dark:border-white/5 dark:bg-white/[0.02]">
                    {days.slice(0, 7).map((day) => (
                        <div key={day.toISOString()} className="p-3 text-center text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
                                className={`min-h-32 border-b border-e border-slate-100 p-2 transition-colors dark:border-white/5 ${isCurrentMonth ? 'bg-white dark:bg-[#0b1220]' : 'bg-slate-50/60 dark:bg-white/[0.02]'
                                    } ${isToday ? 'border-teal-300 dark:border-teal-800' : ''}`}
                            >
                                <span className={`flex h-7 w-7 items-center justify-center rounded-none text-xs font-bold ${isToday
                                    ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-lg shadow-teal-600/25'
                                    : isCurrentMonth
                                        ? 'text-slate-700 dark:text-slate-300'
                                        : 'text-slate-300 dark:text-slate-600'
                                    }`}>
                                    {day.getDate()}
                                </span>
                                <div className="mt-1.5 space-y-1">
                                    {items.slice(0, 4).map((item) => (
                                        <EventCard
                                            key={item.appointment_id}
                                            item={item}
                                            onSelect={onSelect}
                                            t={t}
                                            locale={locale}
                                            compact
                                        />
                                    ))}
                                    {items.length > 4 && (
                                        <p className="px-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                            {t('fallback.more', { count: items.length - 4, defaultValue: `+${items.length - 4} more` })}
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
    locale = 'en-US'
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
        <section className={`overflow-hidden rounded-none bg-white dark:bg-[#0b1220] transition-all duration-300 ${isExpanded ? 'fixed inset-4 z-50 border border-slate-200 shadow-2xl dark:border-white/10' : ''}`}>
            <header className="border-b border-slate-200 bg-slate-50/70 p-4 dark:border-white/5 dark:bg-white/[0.025] sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={onToday}
                            className="min-h-10 rounded-none border border-slate-200 bg-white px-4 text-xs font-extrabold text-slate-700 transition hover:border-teal-300 hover:text-teal-700 dark:border-white/10 dark:bg-[#0b1220] dark:text-slate-300 dark:hover:border-teal-800"
                        >
                            {t('calendar.today', 'Today')}
                        </button>
                        <div className="flex rounded-none border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-[#0b1220]">
                            <button
                                type="button"
                                aria-label={t('calendar.previous', 'Previous')}
                                onClick={onPrevDate}
                                className="rounded-none p-2 text-slate-500 transition hover:bg-teal-50 hover:text-teal-700 dark:text-slate-400 dark:hover:bg-white/10"
                            >
                                <ChevronLeft size={17} className="rtl-flip" />
                            </button>
                            <button
                                type="button"
                                aria-label={t('calendar.next', 'Next')}
                                onClick={onNextDate}
                                className="rounded-none p-2 text-slate-500 transition hover:bg-teal-50 hover:text-teal-700 dark:text-slate-400 dark:hover:bg-white/10"
                            >
                                <ChevronRight size={17} className="rtl-flip" />
                            </button>
                        </div>
                        <h2 className="min-w-0 flex-1 truncate text-sm font-black text-slate-900 dark:text-white sm:text-base">
                            {title}
                        </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="grid grid-cols-3 rounded-none bg-slate-100 p-1 dark:bg-white/5">
                            {views.map((view) => (
                                <button
                                    key={view}
                                    type="button"
                                    onClick={() => onViewChange?.(view)}
                                    className={`min-h-9 rounded-none px-3 text-xs font-extrabold capitalize transition ${viewMode === view
                                        ? 'bg-teal-700 text-white shadow-sm'
                                        : 'text-slate-500 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200'
                                        }`}
                                >
                                    {t(`view.${view}`, view)}
                                </button>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="rounded-none p-2 text-slate-400 transition hover:bg-slate-100 hover:text-teal-700 dark:hover:bg-white/10"
                            title={isExpanded ? t('calendar.collapse', 'Collapse') : t('calendar.expand', 'Expand')}
                            aria-label={isExpanded ? t('calendar.collapse', 'Collapse') : t('calendar.expand', 'Expand')}
                        >
                            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        </button>
                    </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-white/5 2xl:flex-row 2xl:items-center 2xl:justify-between">
                    <StatusLegend t={t} />
                    <div className="flex flex-wrap items-center gap-2">
                        <CalendarStat label={t('calendar.countLabel', 'appointments')} value={stats.total} />
                        <CalendarStat label={t('calendar.roomsLabel', 'rooms')} value={stats.rooms} />
                        <CalendarStat label={t('calendar.priorityLabel', 'priority')} value={stats.priority} />
                        <CalendarStat label={t('calendar.doneLabel', 'done')} value={stats.completed} />
                    </div>
                    <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                        <Clock3 size={13} />
                        {t('calendar.hint', 'Select an appointment to inspect details.')}
                    </p>
                </div>
            </header>

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
