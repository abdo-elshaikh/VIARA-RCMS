import { CalendarOff, Clock, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LeaveManager from '../components/hr/LeaveManager';
import PageHeader from '../components/ui/PageHeader';

const Leave = () => {
    const { t } = useTranslation('workspace');

    return (
        <main className="app-page">
            <div className="mx-auto max-w-screen-2xl space-y-6 pb-12">
                <PageHeader
                    icon={CalendarOff}
                    eyebrow={t('leave.eyebrow', { defaultValue: 'Staff self-service' })}
                    title={t('leave.title', { defaultValue: 'My leave' })}
                    description={t('leave.description', { defaultValue: 'Submit leave requests and track your approval status.' })}
                    className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-amber-50/40 p-6 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:from-slate-950 dark:via-slate-900/90 dark:to-amber-950/20 dark:shadow-none"
                    meta={
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/90 px-3 py-1 text-xs font-bold text-amber-800 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                                <Clock size={13} />
                                {t('leave.meta.pending', { defaultValue: 'Approval tracked' })}
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                                <ShieldCheck size={13} />
                                {t('leave.meta.controlled', { defaultValue: 'Reviewed by HR' })}
                            </span>
                        </div>
                    }
                />
                <LeaveManager selfServiceOnly />
            </div>
        </main>
    );
};

export default Leave;
