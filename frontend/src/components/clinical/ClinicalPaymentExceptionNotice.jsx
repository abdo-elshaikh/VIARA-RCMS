import React from 'react';
import { AlertCircle, Clock3, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react';

const STATUS_CONFIG = {
    Pending: {
        Icon: Clock3,
        ar: 'طلب الاستثناء قيد المراجعة',
        en: 'Exception request pending review',
        classes: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-200',
    },
    Approved: {
        Icon: ShieldCheck,
        ar: 'استثناء مالي معتمد: مسموح باستكمال التمريض والفحص حتى صدور التقرير، وتسليم التقرير النهائي مشروط بسداد كامل المبلغ',
        en: 'Approved financial exception: Clinical prep and examination permitted; final report delivery strictly requires full payment',
        classes: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/35 dark:text-emerald-200',
    },
    Rejected: {
        Icon: AlertCircle,
        ar: 'تم رفض طلب الاستثناء',
        en: 'Exception request rejected',
        classes: 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/35 dark:text-rose-200',
    },
    Expired: {
        Icon: Clock3,
        ar: 'انتهت صلاحية الموافقة',
        en: 'Exception approval expired',
        classes: 'border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
    },
    Used: {
        Icon: ShieldCheck,
        ar: 'تم استخدام الاستثناء في خطوة سابقة',
        en: 'Exception was used for a previous step',
        classes: 'border-cyan-300 bg-cyan-50 text-cyan-900 dark:border-cyan-800 dark:bg-cyan-950/35 dark:text-cyan-200',
    },
};

const ClinicalPaymentExceptionNotice = ({ item, targetStage, isArabic, canRequest = false, onRequest }) => {
    const balance = Number(item?.invoice_balance_amount || 0);
    const paid = Number(item?.invoice_paid_amount || 0);
    const status = item?.payment_exception_status === 'Approved'
        ? 'Approved'
        : (item?.payment_exception_target_stage === targetStage || !targetStage)
            ? item?.payment_exception_status
            : null;

    const requiresException = item?.priority !== 'Emergency'
        && Boolean(item?.invoice_id)
        && paid > 0.005
        && balance > 0.005;

    if (!requiresException && !status) return null;

    const config = STATUS_CONFIG[status];
    const Icon = config?.Icon || ShieldAlert;
    const canSubmit = requiresException
        && paid > 0.005
        && canRequest
        && (!status || ['Rejected', 'Expired', 'Used'].includes(status));

    const defaultDetail = isArabic
        ? `الفاتورة ${item?.invoice_number || '—'} · المتبقي ${balance.toLocaleString('ar-EG')} ج.م`
        : `Invoice ${item?.invoice_number || '—'} · balance EGP ${balance.toLocaleString('en-US')}`;

    const detail = status === 'Approved'
        ? (item?.payment_exception_review_notes ? `${defaultDetail} — ${item.payment_exception_review_notes}` : defaultDetail)
        : (item?.payment_exception_review_notes || item?.payment_exception_reason || defaultDetail);

    return (
        <div
            role="status"
            className={`mt-2 rounded-xl border px-3 py-2 ${config?.classes || 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-200'}`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                    <Icon size={15} className={`mt-0.5 shrink-0 ${status === 'Approved' ? 'text-emerald-700 dark:text-emerald-300' : ''}`} />
                    <div className="min-w-0">
                        <p className="text-[11px] font-black leading-snug">
                            {config
                                ? (isArabic ? config.ar : config.en)
                                : (isArabic ? 'يلزم اعتماد استثناء للانتقال للخطوة التالية' : 'Exception approval is required for the next step')}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[10px] font-semibold opacity-85" title={detail}>{detail}</p>
                    </div>
                </div>
                {canSubmit && (
                    <button
                        type="button"
                        onClick={() => onRequest?.(item)}
                        className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-lg border border-current/25 bg-white/70 px-2 text-[10px] font-black transition hover:bg-white dark:bg-slate-900/50 dark:hover:bg-slate-900"
                    >
                        {status ? <RotateCcw size={11} /> : <ShieldAlert size={11} />}
                        {status ? (isArabic ? 'إعادة الطلب' : 'Request again') : (isArabic ? 'طلب استثناء' : 'Request exception')}
                    </button>
                )}
            </div>
        </div>
    );
};

export default ClinicalPaymentExceptionNotice;
