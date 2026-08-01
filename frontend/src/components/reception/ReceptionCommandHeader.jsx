import React from 'react';
import { CalendarDays, CalendarPlus, RefreshCw, UserPlus, Wifi } from 'lucide-react';

const ReceptionCommandHeader = ({
    isRefreshing,
    onBook,
    onDateChange,
    onRefresh,
    onRegister,
    selectedDate,
    t,
    userName,
}) => (
    <header className="mx-auto w-full max-w-screen-2xl">
        <div className="rounded-none border border-slate-200/60 bg-white/70 px-4 py-4 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 sm:px-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-none border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                            <Wifi size={12} />
                            {t('command.live')}
                        </span>
                        <span className="truncate rounded-none border border-slate-200/60 bg-slate-50/40 dark:border-slate-800/60 dark:bg-slate-950/20 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            {t('command.signedIn', { name: userName })}
                        </span>
                    </div>
                    <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{t('title')}</h1>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">{t('command.description')}</p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-end">
                    <label className="flex min-h-10 items-center gap-2 rounded-none border border-slate-200/60 bg-slate-50/40 px-3 text-sm font-bold text-slate-700 dark:border-slate-800/60 dark:bg-slate-950/20 dark:text-slate-300 dark:[color-scheme:dark]" title={t('date')}>
                        <CalendarDays size={16} className="shrink-0 text-slate-450" aria-hidden="true" />
                        <span className="sr-only">{t('date')}</span>
                        <input type="date" value={selectedDate} onChange={event => onDateChange(event.target.value)} className="w-full bg-transparent outline-none sm:w-[132px]" />
                    </label>
                    <button type="button" onClick={onRefresh} disabled={isRefreshing} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-none border border-slate-200/60 bg-white/80 dark:border-slate-800/60 dark:bg-slate-900/50 px-3 text-sm font-bold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50/50 disabled:opacity-50">
                        <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                        {t('command.refresh')}
                    </button>
                    <button type="button" onClick={onRegister} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-none border border-teal-200/60 bg-teal-50/50 px-4 text-sm font-bold text-teal-800 transition hover:bg-teal-100 dark:border-teal-900/40 dark:bg-teal-950/20 dark:text-teal-300">
                        <UserPlus size={16} />
                        {t('command.addPatient', { defaultValue: 'Add patient' })}
                    </button>
                    <button type="button" onClick={onBook} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-none bg-gradient-to-b from-slate-800 to-slate-950 px-5 text-sm font-black text-white transition hover:from-slate-900 hover:to-black dark:from-slate-100 dark:to-slate-200 dark:text-slate-900 dark:hover:from-white dark:hover:to-slate-100">
                        <CalendarPlus size={16} />
                        {t('booking.title')}
                    </button>
                </div>
            </div>
        </div>
    </header>
);

export default ReceptionCommandHeader;
