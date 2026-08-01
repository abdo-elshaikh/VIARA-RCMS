import React from 'react';
import { FileText, CheckCircle, Clock, Download } from 'lucide-react';
import { EmptyState } from '../ui/StateIndicators';
import StatusBadge from '../ui/StatusBadge';

const ReportsView = ({ cases, onReport, formatDate, t }) => cases.length === 0 ? (
    <div className="rounded-2xl border border-slate-200/50 bg-white shadow-sm dark:border-white/10 dark:bg-[#0b1426]">
        <EmptyState icon={FileText} title={t('doctor.cases.emptyTitle')} description={t('doctor.cases.emptyDescription')} />
    </div>
) : (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cases.map(item => (
            <button type="button" key={item.exam_id} onClick={() => onReport(item.exam_id)} className="rounded-2xl border border-border bg-surface/80 p-5 text-start shadow-sm backdrop-blur-md transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md">
                <div className="flex items-start justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                        <CheckCircle size={18} />
                    </span>
                    <StatusBadge status={item.report_status} t={t} />
                </div>
                <h2 className="font-display mt-5 font-semibold text-slate-950 dark:text-white">{item.exam_type_name || item.modality || t('doctor.report.titleFallback')}</h2>
                <p className="font-medium mt-1 text-[10px] text-slate-500 ltr-embed">{t('doctor.cases.mrn')}: {item.patient_mrn}</p>
                {item.patient_name && <p className="font-display mt-1 truncate text-sm font-semibold text-slate-700 dark:text-slate-300">{item.patient_name}</p>}
                <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="font-medium flex items-center gap-1.5 text-slate-400"><Clock size={12} />{formatDate(item.finalized_at || item.start_time)}</span>
                    <span className="flex items-center gap-1.5 font-bold text-primary-800 dark:text-primary-300"><Download size={12} />{t('doctor.cases.viewReport')}</span>
                </div>
            </button>
        ))}
    </div>
);

export default ReportsView;
