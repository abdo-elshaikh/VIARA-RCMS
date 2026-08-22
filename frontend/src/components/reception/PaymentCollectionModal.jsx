import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    AlertCircle,
    AlertTriangle,
    BadgePercent,
    Building2,
    Check,
    CheckCircle2,
    ChevronDown,
    ClipboardCheck,
    FileCheck2,
    FileText,
    History,
    LockKeyhole,
    PackagePlus,
    Shield,
    ShieldCheck,
    Square,
    CheckSquare,
    User,
    UserRound,
    Wallet
} from 'lucide-react';
import Modal from '../ui/Modal';
import StatusPill from '../ui/StatusPill';
import ConsumeItemModal from '../inventory/ConsumeItemModal';
import { inputClass, labelClass, primaryBtn, secondaryBtn } from '../../utils/designTokens';
import { formatMoney } from '../../utils/financialFormat';
import { getInvoiceCoverageCategory, getContractRequirementsChecklist } from './receptionLogic';

const PAYMENT_METHODS = ['Cash', 'Card', 'Credit Card', 'Wallet', 'Bank Transfer', 'Installment', 'Insurance'];
const FORM_ID = 'collect-payment-form';

const PaymentCollectionModal = ({
    isOpen,
    adjustedBalance,
    canDiscount,
    currentShift,
    discountAmount,
    discountReason,
    invoice,
    invoiceDetail,
    isLoading,
    isLoadingInvoiceDetail,
    onAmountChange,
    onClose,
    onDiscountAmountChange,
    onDiscountReasonChange,
    onMethodChange,
    onReferenceChange,
    onSubmit,
    paymentAmount,
    paymentInvalid,
    paymentMethod,
    paymentReference,
    remainingBalance,
    t
}) => {
    const { i18n } = useTranslation();
    const isAr = i18n.language?.startsWith('ar');
    const [showDiscount, setShowDiscount] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showRequirements, setShowRequirements] = useState(true);
    const [checkedItems, setCheckedItems] = useState({});
    const [supplyExamId, setSupplyExamId] = useState(null);

    const isModalOpen = isOpen !== undefined ? Boolean(isOpen && invoice) : Boolean(invoice);
    const currency = invoice?.currency_code || 'EGP';
    const money = (value) => formatMoney(value, { currency, language: i18n.resolvedLanguage || i18n.language });

    // Extract coverage info from active invoice or full detail
    const activeInv = useMemo(
        () => invoiceDetail?.invoice_id === invoice?.invoice_id ? { ...invoice, ...invoiceDetail } : invoice,
        [invoice, invoiceDetail]
    );
    const coverageCategory = useMemo(() => getInvoiceCoverageCategory(activeInv), [activeInv]);
    const checklist = useMemo(() => getContractRequirementsChecklist(coverageCategory, isAr), [coverageCategory, isAr]);

    const isContrastRequired = Boolean(
        activeInv?.contrast_required ||
        activeInv?.requires_contrast ||
        activeInv?.exam_type_contrast_required ||
        (activeInv?.exam_type_name && /صبغة|contrast/i.test(activeInv.exam_type_name))
    );

    const hasContrastItem = (activeInv?.items || []).some(item =>
        /صبغة|contrast|dye/i.test(item.description || item.name || '')
    );

    const needsContrastWarning = isContrastRequired && !hasContrastItem;

    // Reset internal state when a new invoice is loaded or closed
    useEffect(() => {
        if (!isModalOpen || !invoice) {
            setShowDiscount(false);
            setShowHistory(false);
            setCheckedItems({});
            setSupplyExamId(null);
        } else {
            // Verification is an operator attestation. Policy metadata proves
            // that a policy exists, not that the physical documents/signature
            // were checked for this collection attempt.
            setCheckedItems({});
        }
    }, [isModalOpen, invoice, activeInv?.member_number, activeInv?.policy_number]);

    const toggleCheckItem = (id) => {
        setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleClose = () => {
        if (onClose) {
            onClose();
        }
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        if (needsContrastWarning) {
            toast.error(
                isAr
                    ? 'عفواً، لا يمكن تحصيل الدفع قبل إضافة صبغة ومستلزمات الفحص للفاتورة.'
                    : 'Payment blocked: You must add the required contrast supplies to the invoice before collecting payment.',
                { duration: 5000 }
            );
            if (activeInv?.exam_id) {
                setSupplyExamId(activeInv.exam_id);
            }
            return;
        }
        if (coverageCategory.type !== 'self_pay') {
            const requiredItems = checklist.filter((item) => item.required);
            if (requiredItems.some((item) => !checkedItems[item.id])) {
                toast.error(isAr ? 'يجب استكمال قائمة التحقق قبل التحصيل.' : 'Complete the required verification checklist before collecting payment.');
                return;
            }
        }
        if (onSubmit) {
            onSubmit(e);
        }
    };

    return (
        <Modal
            isOpen={isModalOpen}
            onClose={handleClose}
            title={
                <div className="flex items-center gap-2">
                    <Wallet size={18} className="text-teal-600 dark:text-teal-400" />
                    <span>{t('billing.paymentTitle', { defaultValue: 'Collect Payment' })}</span>
                </div>
            }
            size="large"
        >
            {invoice && (
                <form id={FORM_ID} onSubmit={handleFormSubmit} className="flex flex-col gap-5">
                    <input type="hidden" name="verificationChecklist" value={JSON.stringify(checkedItems)} />
                    
                    {/* Header: Amount and Case Type Classification */}
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-center dark:border-slate-800 dark:bg-slate-900/40">
                        {/* Case Type Badge */}
                        <div className="mb-2 flex items-center justify-center">
                            {coverageCategory.type === 'insurance' && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-black text-teal-700 dark:text-teal-300">
                                    <Shield size={14} />
                                    <span>{isAr ? 'حالة تأمين صحي' : 'Health Insurance Case'}</span>
                                    {coverageCategory.providerName && <span className="opacity-75">· {coverageCategory.providerName}</span>}
                                </span>
                            )}
                            {coverageCategory.type === 'contract' && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-black text-indigo-700 dark:text-indigo-300">
                                    <Building2 size={14} />
                                    <span>{isAr ? 'حالة تعاقد جهة / نقابة' : 'Corporate / Entity Contract'}</span>
                                    {coverageCategory.providerName && <span className="opacity-75">· {coverageCategory.providerName}</span>}
                                </span>
                            )}
                            {coverageCategory.type === 'self_pay' && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-200/60 px-3 py-1 text-xs font-black text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                    <User size={14} />
                                    <span>{isAr ? 'حساب خاص (نقدي / سداد مباشر)' : 'Self-Pay / Private Patient'}</span>
                                </span>
                            )}
                        </div>

                        <h3 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                            {money(adjustedBalance)}
                        </h3>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                            {isAr ? 'المبلغ المستحق للتحصيل من المريض حالياً' : 'Current patient balance payable'}
                        </p>

                        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-slate-500">
                            <UserRound size={14} />
                            <span className="font-bold text-slate-800 dark:text-slate-200">{invoice.patient_name || t('billing.unnamedPatient', { defaultValue: 'Unnamed patient' })}</span>
                            <span className="text-slate-300 dark:text-slate-700">/</span>
                            <span className="font-mono">{invoice.invoice_number}</span>
                            {invoice.mrn && (
                                <>
                                    <span className="text-slate-300 dark:text-slate-700">/</span>
                                    <span className="font-mono">MRN: {invoice.mrn}</span>
                                </>
                            )}
                            <StatusPill status={invoice.invoice_status} />
                        </div>
                    </div>

                    {/* Contrast Requirement Alert & Quick Action */}
                    {needsContrastWarning && (
                        <div className="rounded-2xl border border-amber-300 bg-amber-50/95 p-4 text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-2.5 min-w-0">
                                    <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                                    <div className="min-w-0 text-xs">
                                        <p className="font-black uppercase tracking-wider text-amber-900 dark:text-amber-200">
                                            {isAr ? 'تنبيه إلزامي: هذا الفحص يتطلب صبغة وريدية' : 'Mandatory Notice: Contrast Agent Required'}
                                        </p>
                                        <p className="mt-0.5 font-semibold text-amber-800 dark:text-amber-300">
                                            {isAr
                                                ? 'لم يتم تسجيل أو إضافة مستلزم الصبغة إلى بنود الفاتورة حتى الآن. يُلزم إضافة سعر الصبغة قبل إتمام التحصيل حتى لا تظل الفاتورة ناقصة البنود.'
                                                : 'Contrast agent supply has not been added to the invoice items yet. Please add the contrast supply before full collection.'}
                                        </p>
                                    </div>
                                </div>
                                {activeInv?.exam_id && (
                                    <button
                                        type="button"
                                        onClick={() => setSupplyExamId(activeInv.exam_id)}
                                        className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3.5 text-xs font-black text-white shadow-sm transition hover:bg-amber-700 active:scale-95 dark:bg-amber-500 dark:hover:bg-amber-600"
                                    >
                                        <PackagePlus size={14} />
                                        <span>{isAr ? 'إضافة الصبغة الآن' : 'Add Contrast Now'}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Insurance / Contract Verification Panel */}
                    {coverageCategory.type !== 'self_pay' && (
                        <div className="overflow-hidden rounded-2xl border border-teal-500/30 bg-teal-500/5 dark:border-teal-500/20 dark:bg-teal-950/20">
                            <div className="flex items-center justify-between border-b border-teal-500/20 px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                    <ClipboardCheck size={16} className="text-teal-600 dark:text-teal-400" />
                                    <span className="text-xs font-black text-teal-950 dark:text-teal-200">
                                        {isAr ? 'مراجعة وتدقيق متطلبات التأمين والتعاقد' : 'Insurance & Contract Verification Checklist'}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowRequirements(!showRequirements)}
                                    className="text-xs font-bold text-teal-700 hover:underline dark:text-teal-300"
                                >
                                    {showRequirements ? (isAr ? 'إخفاء التفاصيل' : 'Hide') : (isAr ? 'عرض التفاصيل' : 'Show')}
                                </button>
                            </div>

                            {showRequirements && (
                                <div className="space-y-3 p-4 text-xs">
                                    {/* 3-Cell Financial Breakdown */}
                                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/80 p-3 shadow-xs dark:bg-slate-900/80">
                                        <div className="text-center">
                                            <p className="text-[10px] font-bold uppercase text-slate-400">{isAr ? 'إجمالي الفحص' : 'Total Amount'}</p>
                                            <p className="mt-0.5 font-mono text-xs font-black text-slate-900 dark:text-white">
                                                {money(coverageCategory.totalAmount)}
                                            </p>
                                        </div>
                                        <div className="text-center border-x border-slate-200 dark:border-slate-800">
                                            <p className="text-[10px] font-bold uppercase text-teal-600 dark:text-teal-400">{isAr ? 'تغطية التأمين/الجهة' : 'Insurance Covered'}</p>
                                            <p className="mt-0.5 font-mono text-xs font-black text-teal-700 dark:text-teal-300">
                                                {money(coverageCategory.insuranceCovered)}
                                            </p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">{isAr ? 'تحمل المريض (Copay)' : 'Patient Copay'}</p>
                                            <p className="mt-0.5 font-mono text-xs font-black text-amber-700 dark:text-amber-300">
                                                {money(coverageCategory.patientPayable)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Policy Context Details */}
                                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                                        {coverageCategory.policyNumber && (
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-bold text-slate-700 dark:text-slate-300">{isAr ? 'رقم الوثيقة / البوليصة:' : 'Policy #:'}</span>
                                                <span className="font-mono font-bold text-slate-900 dark:text-white">{coverageCategory.policyNumber}</span>
                                            </div>
                                        )}
                                        {coverageCategory.memberNumber && (
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-bold text-slate-700 dark:text-slate-300">{isAr ? 'رقم الكارنيه / العضوية:' : 'Member / Card #:'}</span>
                                                <span className="font-mono font-bold text-slate-900 dark:text-white">{coverageCategory.memberNumber}</span>
                                            </div>
                                        )}
                                        {coverageCategory.planName && (
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-bold text-slate-700 dark:text-slate-300">{isAr ? 'الفئة / الخطة:' : 'Plan / Tier:'}</span>
                                                <span className="font-bold text-slate-900 dark:text-white">{coverageCategory.planName}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Verification Checklist */}
                                    <div className="space-y-2 border-t border-teal-500/20 pt-2.5">
                                        <p className="text-[10px] font-black uppercase tracking-wider text-teal-800 dark:text-teal-300">
                                            {isAr ? 'قائمة التحقق المطلوبة قبل إصدار الإيصال' : 'Required Verification Before Receipt Issuance'}
                                        </p>
                                        <div className="grid gap-1.5 sm:grid-cols-2">
                                            {checklist.map((item) => (
                                                <label
                                                    key={item.id}
                                                    onClick={() => toggleCheckItem(item.id)}
                                                    className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2 transition ${
                                                        checkedItems[item.id]
                                                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-200'
                                                            : 'border-slate-200 bg-white/60 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300'
                                                    }`}
                                                >
                                                    <span className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400">
                                                        {checkedItems[item.id] ? <CheckSquare size={15} /> : <Square size={15} className="text-slate-400" />}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold leading-snug">
                                                            {isAr ? item.labelAr : item.labelEn}
                                                        </p>
                                                        <p className="text-[10px] opacity-75">
                                                            {isAr ? item.hintAr : item.hintEn}
                                                        </p>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {!currentShift && (
                        <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                            <LockKeyhole size={17} className="mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-sm font-bold">{t('billing.openShiftRequired', { defaultValue: 'Open cashier shift required' })}</p>
                                <p className="mt-0.5 text-xs font-medium opacity-80">{t('billing.openShiftBeforePayment', { defaultValue: 'Open an active shift before recording a payment.' })}</p>
                            </div>
                        </div>
                    )}

                    {/* Primary Payment Inputs */}
                    <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <label htmlFor="payment-amount" className={labelClass}>
                                    {isAr ? 'المبلغ المطلوب تحصيله الآن' : t('billing.amount', { defaultValue: 'Amount to pay' })}
                                </label>
                                <span className="font-mono text-xs font-bold text-slate-400">
                                    {t('billing.remaining', { defaultValue: 'Remaining' })}: {money(remainingBalance)}
                                </span>
                            </div>
                            <div className="relative">
                                <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center font-mono text-sm font-bold text-slate-400">{currency}</span>
                                <input
                                    id="payment-amount"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    max={adjustedBalance}
                                    required
                                    value={paymentAmount}
                                    onChange={(event) => onAmountChange(event.target.value)}
                                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 ps-14 pe-4 text-left font-mono text-xl font-black text-slate-900 outline-none transition focus:border-teal-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:focus:border-teal-500"
                                    dir="ltr"
                                />
                            </div>
                            <div className="mt-2 flex gap-2">
                                <QuickAmount label={t('billing.payFullBalance', { defaultValue: 'Full Balance' })} onClick={() => onAmountChange(adjustedBalance.toFixed(2))} active={Number(paymentAmount) === adjustedBalance} />
                                <QuickAmount label={t('billing.payHalf', { defaultValue: 'Half' })} onClick={() => onAmountChange((adjustedBalance / 2).toFixed(2))} active={Number(paymentAmount) === adjustedBalance / 2} />
                                <QuickAmount label={money(0)} onClick={() => onAmountChange('0.00')} active={Number(paymentAmount) === 0} />
                            </div>
                            {Number(paymentAmount || 0) > adjustedBalance + 0.005 && <ValidationMessage>{t('billing.amountExceedsBalance', { defaultValue: 'Payment cannot exceed the outstanding balance.' })}</ValidationMessage>}
                            {Number(paymentAmount || 0) <= 0 && Number(discountAmount || 0) <= 0 && <ValidationMessage>{t('billing.amountRequired', { defaultValue: 'Enter an amount greater than zero.' })}</ValidationMessage>}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="payment-method" className={labelClass}>{t('billing.paymentMethod', { defaultValue: 'Payment method' })}</label>
                                <select id="payment-method" value={paymentMethod} onChange={(event) => onMethodChange(event.target.value)} className={`${inputClass} h-10 rounded-xl font-medium`}>
                                    {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{t(`billing.methods.${method}`, { defaultValue: method })}</option>)}
                                </select>
                            </div>
                            {paymentMethod !== 'Cash' && (
                                <div className="animate-in fade-in zoom-in-95 duration-200">
                                    <label htmlFor="payment-reference" className={labelClass}>
                                        {paymentMethod === 'Insurance' ? (isAr ? 'رقم الموافقة / البوليصة' : 'Policy / Approval #') : t('billing.paymentReference', { defaultValue: 'Reference' })}
                                    </label>
                                    <input
                                        id="payment-reference"
                                        type="text"
                                        maxLength={150}
                                        required={paymentMethod !== 'Cash'}
                                        value={paymentReference}
                                        onChange={(event) => onReferenceChange(event.target.value)}
                                        placeholder={paymentMethod === 'Insurance' ? (coverageCategory.policyNumber || 'Approval Code') : (isAr ? 'رقم الإيصال / المعاملة' : 'Transaction Ref')}
                                        className={`${inputClass} h-10 rounded-xl`}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Collapsible Options (Discounts & History) */}
                    <div className="space-y-2 border-t border-slate-100 pt-2 dark:border-slate-800/60">
                        <button type="button" onClick={() => setShowDiscount(!showDiscount)} className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900/50">
                            <span className="flex items-center gap-2"><BadgePercent size={16} className="text-teal-500" /> {t('billing.discountTitle', { defaultValue: 'Apply Discount' })}</span>
                            <ChevronDown size={16} className={`text-slate-400 transition-transform ${showDiscount ? 'rotate-180' : ''}`} />
                        </button>
                        {showDiscount && (
                            <div className="animate-in fade-in slide-in-from-top-1 px-2 pb-2">
                                {canDiscount ? (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label htmlFor="discount-amount" className={labelClass}>{t('billing.additionalDiscount', { defaultValue: 'Discount Amount' })}</label>
                                            <input id="discount-amount" type="number" min="0" step="0.01" max={invoice.balance_amount} value={discountAmount} onChange={(event) => onDiscountAmountChange(event.target.value)} className={`${inputClass} rounded-xl`} dir="ltr" />
                                        </div>
                                        <div>
                                            <label htmlFor="discount-reason" className={labelClass}>{t('billing.discountReason', { defaultValue: 'Reason' })}</label>
                                            <input id="discount-reason" type="text" maxLength={1000} required={Number(discountAmount) > 0} value={discountReason} onChange={(event) => onDiscountReasonChange(event.target.value)} placeholder={t('billing.discountReasonPlaceholder', { defaultValue: 'Required for discount' })} className={`${inputClass} rounded-xl`} />
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs font-semibold text-slate-500"><LockKeyhole size={14} className="inline mr-1.5 align-text-bottom" />{t('billing.discountRestricted', { defaultValue: 'Discounting is restricted for your role.' })}</p>
                                )}
                            </div>
                        )}

                        {invoiceDetail?.payments?.length > 0 && (
                            <>
                                <button type="button" onClick={() => setShowHistory(!showHistory)} className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900/50">
                                    <span className="flex items-center gap-2"><History size={16} className="text-teal-500" /> {t('billing.paymentHistory', { defaultValue: 'Previous Payments' })}</span>
                                    <ChevronDown size={16} className={`text-slate-400 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                                </button>
                                {showHistory && (
                                    <div className="animate-in fade-in slide-in-from-top-1 space-y-2 px-2 pb-2">
                                        {isLoadingInvoiceDetail ? (
                                            <p className="animate-pulse py-2 text-center text-xs font-semibold text-slate-400">{t('billing.loadingHistory', { defaultValue: 'Loading...' })}</p>
                                        ) : (
                                            invoiceDetail.payments.map((payment) => (
                                                <div key={payment.payment_id} className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50/50 px-3.5 py-2.5 dark:border-slate-800/60 dark:bg-slate-900/30">
                                                    <div>
                                                        <p className="text-xs font-black text-slate-800 dark:text-slate-200">{t(`billing.methods.${payment.method}`, { defaultValue: payment.method })}</p>
                                                        <p className="mt-0.5 text-[10px] font-medium text-slate-400">{new Date(payment.created_at || payment.transaction_date).toLocaleString()}</p>
                                                        {payment.payment_reference && <p className="mt-0.5 font-mono text-[10px] text-slate-500">REF: {payment.payment_reference}</p>}
                                                    </div>
                                                    <p className="font-mono text-xs font-black text-slate-800 dark:text-slate-200">{money(payment.amount)}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Submit Actions */}
                    <div className="space-y-2 pt-2">
                        {needsContrastWarning && (
                            <div className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50/80 p-2 text-xs font-black text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300 text-center">
                                <AlertTriangle size={15} className="shrink-0 text-amber-600 animate-pulse" />
                                <span>{isAr ? 'يجب إضافة صبغة الفحص أولاً لتفعيل زر التحصيل وإصدار الإيصال' : 'You must add the required contrast supplies before collecting payment.'}</span>
                            </div>
                        )}
                        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                            <button type="button" onClick={handleClose} disabled={isLoading} className={`${secondaryBtn} min-h-10 w-full rounded-xl sm:w-auto`}>
                                {t('cancel', { defaultValue: 'Cancel' })}
                            </button>
                            {needsContrastWarning && activeInv?.exam_id ? (
                                <button
                                    type="button"
                                    onClick={() => setSupplyExamId(activeInv.exam_id)}
                                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 text-xs font-black text-white shadow-sm shadow-amber-600/20 hover:bg-amber-700 active:scale-95 sm:w-auto"
                                >
                                    <PackagePlus size={16} />
                                    <span>{isAr ? 'إضافة صبغة الفحص للمتابعة' : 'Add Contrast Supply to Proceed'}</span>
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={isLoading || isLoadingInvoiceDetail || paymentInvalid || needsContrastWarning || (Number(paymentAmount || 0) > 0 && !currentShift)}
                                    className={`${primaryBtn} min-h-10 w-full rounded-xl text-xs font-black sm:min-w-48 ${paymentMethod === 'Insurance' ? 'bg-teal-700 shadow-teal-900/10 hover:bg-teal-800' : ''}`}
                                >
                                    {isLoading || isLoadingInvoiceDetail ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Check size={16} />}
                                    <span>
                                        {isLoading ? t('billing.processing', { defaultValue: 'Processing...' }) : paymentMethod === 'Insurance' ? (isAr ? 'اعتماد مطالبة التأمين وإصدار الإيصال' : 'Approve & Issue Receipt') : (isAr ? 'تأكيد التحصيل وطباعة الإيصال' : t('billing.confirmPayment', { defaultValue: 'Confirm Payment' }))}
                                    </span>
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            )}

            {/* In-Modal Contrast / Supply Consumption Action */}
            {supplyExamId && (
                <ConsumeItemModal
                    examId={supplyExamId}
                    onClose={() => setSupplyExamId(null)}
                />
            )}
        </Modal>
    );
};

const QuickAmount = ({ label, onClick, active }) => (
    <button type="button" onClick={onClick} className={`flex-1 rounded-xl border py-1.5 text-xs font-black transition ${active ? 'border-teal-500/50 bg-teal-50 text-teal-700 shadow-xs dark:border-teal-500/30 dark:bg-teal-900/20 dark:text-teal-400' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'}`}>
        {label}
    </button>
);

const ValidationMessage = ({ children }) => (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-rose-500">
        <AlertCircle size={14} />
        {children}
    </p>
);

export default PaymentCollectionModal;
