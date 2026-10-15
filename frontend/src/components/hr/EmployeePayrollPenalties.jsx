import { useState, useMemo } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    ShieldCheck,
    Coins,
    FileText,
    Info,
    HelpCircle,
    Scale
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAcknowledgePayrollPenaltyMutation, useGetMyPayrollPenaltiesQuery } from '../../store/api';
import { formatFinancialDate, formatMoney } from '../../utils/financialFormat';
import TextPromptDialog from '../ui/TextPromptDialog';

const EmployeePayrollPenalties = () => {
    const { t, i18n } = useTranslation('payroll');
    const isArabic = i18n.language?.startsWith('ar');
    const { data: penalties = [], isLoading, isError, refetch } = useGetMyPayrollPenaltiesQuery();
    const [acknowledgePenalty, { isLoading: isSaving }] = useAcknowledgePayrollPenaltyMutation();
    const [disputeTarget, setDisputeTarget] = useState(null);
    const money = (value, currency) => formatMoney(value, { currency: currency || 'EGP', language: i18n.language });

    // Summary Metrics
    const metrics = useMemo(() => {
        const totalAmount = penalties.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const acknowledgedCount = penalties.filter(p => p.acknowledgement_status === 'Acknowledged').length;
        const disputedCount = penalties.filter(p => p.acknowledgement_status === 'Disputed').length;
        const resolvedCount = penalties.filter(p => p.acknowledgement_status === 'Resolved').length;
        const pendingCount = penalties.filter(p => !p.acknowledgement_status || p.acknowledgement_status === 'Pending').length;

        return {
            totalAmount,
            totalCount: penalties.length,
            acknowledgedCount,
            disputedCount,
            resolvedCount,
            pendingCount
        };
    }, [penalties]);

    const acknowledge = async (penalty) => {
        try {
            await acknowledgePenalty({ id: penalty.penalty_id, status: 'Acknowledged' }).unwrap();
            toast.success(t('employee.acknowledged'));
            refetch();
            return true;
        } catch (error) {
            toast.error(error?.data?.message || t('employee.actionFailed'));
            return false;
        }
    };

    const dispute = async (reason) => {
        if (!disputeTarget) return false;
        try {
            await acknowledgePenalty({ id: disputeTarget.penalty_id, status: 'Disputed', reason }).unwrap();
            toast.success(t('employee.disputeSubmitted'));
            setDisputeTarget(null);
            refetch();
            return true;
        } catch (error) {
            toast.error(error?.data?.message || t('employee.actionFailed'));
            return false;
        }
    };

    return (
        <section className="space-y-4" aria-labelledby="employee-payroll-penalties-title" dir={isArabic ? 'rtl' : 'ltr'}>
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <Scale size={18} className="text-rose-600 dark:text-rose-400" />
                        <p className="text-xs font-black uppercase tracking-wider text-rose-700 dark:text-rose-300">
                            {t('employee.eyebrow')}
                        </p>
                    </div>
                    <h2 id="employee-payroll-penalties-title" className="mt-1 text-lg font-black text-slate-900 dark:text-white">
                        {t('employee.title')}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                        {t('employee.description')}
                    </p>
                </div>
            </header>

            {/* Metrics Ribbon */}
            {penalties.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="rounded-2xl border border-rose-200/80 bg-rose-50/60 p-3.5 dark:border-rose-900/60 dark:bg-rose-950/20">
                        <div className="flex items-center justify-between">
                            <span className="text-[10.5px] font-bold text-rose-800 dark:text-rose-300">
                                {isArabic ? 'إجمالي مبالغ الجزاءات' : 'Total Penalties Amount'}
                            </span>
                            <Coins size={15} className="text-rose-600" />
                        </div>
                        <p className="mt-1 font-mono text-lg font-black text-rose-950 dark:text-rose-100">
                            {money(metrics.totalAmount, penalties[0]?.currency_code || 'EGP')}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-3.5 dark:border-amber-900/60 dark:bg-amber-950/20">
                        <div className="flex items-center justify-between">
                            <span className="text-[10.5px] font-bold text-amber-800 dark:text-amber-300">
                                {isArabic ? 'قيد المراجعة والطعن' : 'Disputed / In Review'}
                            </span>
                            <Clock3 size={15} className="text-amber-600" />
                        </div>
                        <p className="mt-1 font-mono text-lg font-black text-amber-950 dark:text-amber-100">
                            {metrics.disputedCount}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                        <div className="flex items-center justify-between">
                            <span className="text-[10.5px] font-bold text-emerald-800 dark:text-emerald-300">
                                {isArabic ? 'تم الاعتراف بها' : 'Acknowledged'}
                            </span>
                            <CheckCircle2 size={15} className="text-emerald-600" />
                        </div>
                        <p className="mt-1 font-mono text-lg font-black text-emerald-950 dark:text-emerald-100">
                            {metrics.acknowledgedCount}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
                        <div className="flex items-center justify-between">
                            <span className="text-[10.5px] font-bold text-slate-700 dark:text-slate-300">
                                {isArabic ? 'إجمالي السجلات' : 'Total Records'}
                            </span>
                            <FileText size={15} className="text-slate-500" />
                        </div>
                        <p className="mt-1 font-mono text-lg font-black text-slate-900 dark:text-white">
                            {metrics.totalCount}
                        </p>
                    </div>
                </div>
            )}

            {/* Transparency Rule Banner */}
            <div className="flex items-start gap-2.5 rounded-2xl border border-teal-200/80 bg-teal-50/60 p-3.5 text-xs text-teal-900 dark:border-teal-900/60 dark:bg-teal-950/20 dark:text-teal-200">
                <Info size={16} className="mt-0.5 shrink-0 text-teal-600 dark:text-teal-400" />
                <div className="leading-relaxed">
                    <span className="font-bold">
                        {isArabic ? 'ضمانات العدالة والشفافية في الرواتب: ' : 'Fairness & Transparency Guarantee: '}
                    </span>
                    <span>
                        {isArabic
                            ? 'يحق لك الاعتراف بالجزاء أو تقديم طعن وتظلم رسمي في حال وجود عذر قهري. يتم تجميد الجزاءات المتنازع عليها (Disputed) فورياً واستبعادها تلقائياً من مسير الرواتب حتى تبت فيها إدارة الموارد البشرية.'
                            : 'You have the right to acknowledge or submit a formal dispute with reasons. Disputed penalties are immediately frozen and automatically excluded from payroll deduction until resolved by HR.'}
                    </span>
                </div>
            </div>

            {isLoading ? (
                <div className="rounded-2xl border border-slate-200 p-8 text-center text-sm font-semibold text-slate-500 dark:border-slate-800">
                    {t('states.loading')}
                </div>
            ) : isError ? (
                <div role="alert" className="rounded-2xl border border-rose-200 p-6 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:text-rose-300">
                    {t('employee.loadError')}
                </div>
            ) : penalties.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                    <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500" />
                    <p>{t('employee.empty')}</p>
                    <p className="mt-1 text-xs text-slate-400">
                        {isArabic ? 'سجلك السلوكي والوظيفي نظيف تماماً بدون أي جزاءات مسجلة.' : 'Your employment record is clean with zero active penalties.'}
                    </p>
                </div>
            ) : (
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900 overflow-hidden shadow-xs">
                    {penalties.map((penalty) => {
                        const acknowledgementStatus = penalty.acknowledgement_status || 'Pending';
                        const isApproved = penalty.status === 'Approved';
                        const isDisputed = acknowledgementStatus === 'Disputed';
                        const isResolved = acknowledgementStatus === 'Resolved';

                        return (
                            <article key={penalty.penalty_id} className="space-y-3 p-4 sm:p-5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-black text-slate-900 dark:text-white">
                                                {t(`penaltyTypes.${penalty.penalty_type}`, { defaultValue: penalty.penalty_type })}
                                            </h3>
                                            <span className="rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                {t(`penaltySources.${penalty.source}`, { defaultValue: penalty.source })}
                                            </span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            <span>{t('employee.incidentDate')}: {formatFinancialDate(penalty.incident_date || penalty.created_at, i18n.language)}</span>
                                        </div>
                                    </div>
                                    <div className="text-end">
                                        <p className="font-mono text-base font-black text-rose-700 dark:text-rose-300">
                                            {money(penalty.amount, penalty.currency_code)}
                                        </p>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                            {t(`penaltyStatuses.${penalty.status}`, { defaultValue: penalty.status })}
                                        </span>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-3 text-xs leading-relaxed text-slate-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-slate-300">
                                    <span className="font-bold text-rose-900 dark:text-rose-200">
                                        {isArabic ? 'السبب وتفاصيل المخالفة: ' : 'Reason & Violation Details: '}
                                    </span>
                                    {penalty.reason}
                                </div>

                                {isDisputed ? (
                                    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs font-semibold text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                                        <Clock3 size={15} className="mt-0.5 shrink-0 text-amber-600" />
                                        <div>
                                            <span className="font-bold">
                                                {t('employee.disputeInReview')} (
                                                {isArabic ? 'المبلغ مجمد ومستبعد من الخصم حالياً' : 'Amount frozen from payroll deduction'}
                                                )
                                            </span>
                                            {penalty.dispute_reason && (
                                                <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                                                    {isArabic ? 'سبب الطعن: ' : 'Dispute grounds: '}{penalty.dispute_reason}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ) : isResolved ? (
                                    <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs font-semibold text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                                        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                                        <div>
                                            <span className="font-bold">{t('employee.disputeResolved')}</span>
                                            {penalty.dispute_resolution && (
                                                <p className="mt-0.5 text-[11px] text-emerald-800 dark:text-emerald-300">
                                                    {isArabic ? 'قرار الإدارة: ' : 'Resolution: '}{penalty.dispute_resolution}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ) : null}

                                {isApproved && !isResolved && !isDisputed && (
                                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                                        {acknowledgementStatus !== 'Acknowledged' ? (
                                            <button
                                                type="button"
                                                disabled={isSaving}
                                                onClick={() => acknowledge(penalty)}
                                                className="inline-flex min-h-8 items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-teal-700 disabled:opacity-50"
                                            >
                                                <CheckCircle2 size={13} />
                                                {t('employee.acknowledge')}
                                            </button>
                                        ) : (
                                            <span className="inline-flex min-h-8 items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                                <CheckCircle2 size={13} />
                                                {t('employee.acknowledged')}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setDisputeTarget(penalty)}
                                            className="inline-flex min-h-8 items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-amber-950/30"
                                        >
                                            <AlertTriangle size={13} />
                                            {t('employee.dispute')}
                                        </button>
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}

            <TextPromptDialog
                isOpen={Boolean(disputeTarget)}
                onClose={() => setDisputeTarget(null)}
                onConfirm={dispute}
                title={t('employee.disputeTitle')}
                message={t('employee.disputeMessage', { type: disputeTarget ? t(`penaltyTypes.${disputeTarget.penalty_type}`, { defaultValue: disputeTarget.penalty_type }) : '' })}
                label={t('employee.disputeReason')}
                placeholder={t('employee.disputePlaceholder')}
                validationMessage={t('employee.disputeReasonRequired')}
                confirmLabel={t('employee.submitDispute')}
                cancelLabel={t('actions.cancel')}
                isLoading={isSaving}
                validate={(value) => value.length < 3 ? t('employee.disputeReasonRequired') : ''}
            />
        </section>
    );
};

export default EmployeePayrollPenalties;