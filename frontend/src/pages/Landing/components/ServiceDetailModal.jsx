import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, RefreshCw, X } from 'lucide-react';
import { formatDataFreshness, getServiceLiveStatus } from '../liveData';

export const ServiceDetailModal = ({
    service,
    t,
    isRtl,
    close,
    operationalData,
    generatedAt,
    isLoading,
    isFetching,
    isError,
    onRefresh,
}) => {
    const dialogRef = useRef(null);
    const closeButtonRef = useRef(null);
    const Icon = service.icon;
    const title = t(`managementLanding.modules.${service.key}.title`, {
        defaultValue: isRtl ? service.arTitle : service.enTitle,
    });
    const description = t(`managementLanding.modules.${service.key}.description`, {
        defaultValue: isRtl ? service.arDescription : service.enDescription,
    });
    const liveStatus = getServiceLiveStatus({
        serviceKey: service.key,
        operationalData,
        generatedAt,
        isRtl,
        isLoading,
        isError,
    });

    useEffect(() => {
        const previouslyFocused = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeButtonRef.current?.focus();

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
                return;
            }
            if (event.key !== 'Tab') return;

            const focusable = dialogRef.current?.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ) || [];
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            previouslyFocused?.focus?.();
        };
    }, [close]);

    return (
        <div
            className="command-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={close}
            role="dialog"
            aria-modal="true"
            aria-labelledby="service-detail-title"
            aria-describedby="service-detail-description"
        >
            <div
                ref={dialogRef}
                className="command-modal relative w-full max-w-lg rounded-sm border border-slate-200 bg-white p-6 shadow-2xl sm:p-8 dark:border-slate-800 dark:bg-slate-950 animate-in zoom-in-95 duration-300"
                onClick={(event) => event.stopPropagation()}
            >
                <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={close}
                    aria-label={isRtl ? 'إغلاق' : 'Close modal'}
                    className="absolute end-4 top-4 flex h-8 w-8 items-center justify-center rounded-sm bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                >
                    <X size={16} />
                </button>

                <div className="flex items-center gap-4 pe-9">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
                        <Icon size={28} strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                        <h3 id="service-detail-title" className="text-xl font-black text-slate-900 dark:text-white">{title}</h3>
                    </div>
                </div>

                <p id="service-detail-description" className="mt-5 text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-400">{description}</p>

                <div className={`mt-6 border p-4 ${isError ? 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/30 dark:bg-emerald-900/10'}`}>
                    <div className="flex items-start gap-3">
                        <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center ${isError ? 'bg-slate-200 text-slate-500 dark:bg-slate-800' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                            <Activity size={16} aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <small className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {isRtl ? 'بيانات تشغيلية مباشرة' : 'Live operational data'}
                            </small>
                            <strong className="mt-1 block text-sm font-black text-slate-900 dark:text-white">{liveStatus}</strong>
                            <time className="mt-1 block text-[11px] font-semibold text-slate-500" dateTime={generatedAt || undefined}>
                                {formatDataFreshness(generatedAt, isRtl)}
                            </time>
                        </div>
                    </div>
                </div>

                <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={isFetching}
                        className="inline-flex items-center gap-2 rounded-sm border border-brand-200 bg-brand-50 px-4 py-2.5 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-100 disabled:cursor-wait disabled:opacity-50 dark:border-brand-900/50 dark:bg-brand-900/20 dark:text-brand-300 dark:hover:bg-brand-900/40"
                    >
                        <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
                        {isFetching ? (isRtl ? 'يتم التحديث' : 'Refreshing') : (isRtl ? 'تحديث البيانات' : 'Refresh data')}
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={close}
                            className="rounded-sm px-4 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                        >
                            {isRtl ? 'إغلاق' : 'Close'}
                        </button>
                        <Link
                            to="/login"
                            className="inline-flex items-center gap-1.5 rounded-sm bg-brand-500 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-brand-600 hover:shadow-md"
                        >
                            <span>{isRtl ? 'فتح مساحة العمل' : 'Open workspace'}</span>
                            <ArrowRight size={14} className={isRtl ? 'rotate-180' : ''} />
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
