import React from 'react';
import { CalendarDays, FileText, UserRound, ArrowRight, Activity, AlertCircle } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';

interface CaseCardProps {
    item: any;
    selected: boolean;
    onSelect: () => void;
    onReport: (examId: string) => void;
    formatDate: (date: any) => string;
    t: any;
}

const CaseCard: React.FC<CaseCardProps> = ({ item, selected, onSelect, onReport, formatDate, t }) => {
    const isStat = ['Urgent', 'Emergency', 'STAT'].includes(item.priority);

    return (
        <article
            className={`group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 ${
                selected
                    ? 'border-primary-600 bg-gradient-to-br from-primary-500/5 via-white to-white shadow-lg shadow-primary-900/10 ring-1 ring-primary-500/30 dark:border-primary-400 dark:from-[#07111f] dark:via-slate-900 dark:to-slate-900'
                    : 'border-border bg-surface/90 shadow-sm hover:border-primary-300 hover:shadow-md backdrop-blur-md'
            }`}
        >
            {isStat && (
                <div className="absolute top-0 end-0 h-1.5 w-24 bg-gradient-to-r from-rose-500 to-amber-500 rounded-bl-full" />
            )}

            <button type="button" onClick={onSelect} className="w-full text-start outline-none">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-black uppercase tracking-wider text-slate-400">
                                {item.order_number ? t('doctor.cases.order', { number: item.order_number }) : t('doctor.cases.patient', { defaultValue: 'Patient' })}
                            </span>
                            {isStat && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-[10px] font-black uppercase text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
                                    <AlertCircle className="h-3 w-3" />
                                    STAT
                                </span>
                            )}
                        </div>
                        <h2 className="truncate text-base font-extrabold text-foreground transition-colors group-hover:text-primary-700 dark:group-hover:text-primary-300">
                            {item.patient_name || item.patient_mrn || '-'}
                        </h2>
                        <p className="font-mono text-xs font-bold text-primary-700 dark:text-primary-300" dir="ltr">
                            MRN {item.patient_mrn || '-'}
                        </p>
                    </div>
                    <StatusBadge status={item.appointment_status || item.exam_status} t={t} />
                </div>

                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-900/50 space-y-2">
                    <p className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
                        {item.exam_type_name || item.modality || t('doctor.report.titleFallback', { defaultValue: 'Diagnostic Study' })}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        <CalendarDays className="h-3.5 w-3.5 text-primary-600 dark:text-primary-300" />
                        <span>{formatDate(item.start_time)}</span>
                        {item.modality && (
                            <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                {item.modality}
                            </span>
                        )}
                    </div>
                    {item.clinical_indication && (
                        <p className="line-clamp-2 text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-300">
                            {item.clinical_indication}
                        </p>
                    )}
                </div>
            </button>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                <StatusBadge status={item.report_status || t('common.pending', { defaultValue: 'Pending' })} t={t} />
                {item.report_status === 'Finalized' && item.exam_id ? (
                    <button
                        type="button"
                        onClick={() => onReport(item.exam_id)}
                        className="group/btn inline-flex items-center gap-1.5 text-xs font-bold text-primary-700 transition hover:text-primary-900 dark:text-primary-300"
                    >
                        <FileText className="h-4 w-4" />
                        <span>{t('doctor.cases.viewReport', { defaultValue: 'View Report' })}</span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5 rtl:group-hover/btn:-translate-x-0.5 rtl:-scale-x-100" />
                    </button>
                ) : null}
            </div>
        </article>
    );
};

export default CaseCard;
