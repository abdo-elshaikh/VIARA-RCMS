import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    AlertCircle,
    BadgePercent,
    Check,
    ChevronDown,
    History,
    LockKeyhole,
    UserRound,
    Wallet
} from 'lucide-react';
import Modal from '../ui/Modal';
import StatusPill from '../ui/StatusPill';
import { inputClass, labelClass, primaryBtn, secondaryBtn } from '../../utils/designTokens';
import { formatMoney } from '../../utils/financialFormat';

const PAYMENT_METHODS = ['Cash', 'Card', 'Credit Card', 'Wallet', 'Bank Transfer', 'Installment', 'Insurance'];
const FORM_ID = 'collect-payment-form';

const PaymentCollectionModal = ({
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
    const [showDiscount, setShowDiscount] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const currency = invoice?.currency_code || 'EGP';
    const money = (value) => formatMoney(value, { currency, language: i18n.resolvedLanguage || i18n.language });

    // Reset internal state when a new invoice is loaded or closed
    useEffect(() => {
        if (!invoice) {
            setShowDiscount(false);
            setShowHistory(false);
        }
    }, [invoice]);

    const handleClose = () => {
        if (!isLoading && onClose) {
            onClose();
        }
    };

    return (
        <Modal
            isOpen={Boolean(invoice)}
            onClose={handleClose}
            title={t('billing.paymentTitle', { defaultValue: 'Collect Payment' })}
            size="default" // Medium size layout
        >
            {invoice && (
                <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-6">
                    
                    {/* Header: Amount and Patient Details */}
                    <div className="flex flex-col items-center justify-center text-center">
                        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-none bg-teal-50 text-teal-600 shadow-sm dark:bg-teal-500/10 dark:text-teal-400">
                            <Wallet size={28} />
                        </div>
                        <h3 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                            {money(adjustedBalance)}
                        </h3>
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm font-medium text-slate-500">
                            <UserRound size={15} />
                            <span className="text-slate-700 dark:text-slate-300">{invoice.patient_name || t('billing.unnamedPatient', { defaultValue: 'Unnamed patient' })}</span>
                            <span className="text-slate-300 dark:text-slate-700">/</span>
                            <span className="font-mono text-xs">{invoice.invoice_number}</span>
                            {invoice.mrn && (
                                <>
                                    <span className="text-slate-300 dark:text-slate-700">/</span>
                                    <span className="font-mono text-xs">{invoice.mrn}</span>
                                </>
                            )}
                            <StatusPill status={invoice.invoice_status} />
                        </div>
                    </div>

                    {!currentShift && (
                        <div role="alert" className="flex items-start gap-3 rounded-none border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                            <LockKeyhole size={17} className="mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-sm font-bold">{t('billing.openShiftRequired', { defaultValue: 'Open cashier shift required' })}</p>
                                <p className="mt-0.5 text-xs font-medium opacity-80">{t('billing.openShiftBeforePayment', { defaultValue: 'Open an active shift before recording a payment.' })}</p>
                            </div>
                        </div>
                    )}

                    {/* Primary Payment Inputs */}
                    <div className="space-y-5 rounded-none bg-slate-50/50 p-1 dark:bg-slate-900/20">
                        <div>
                            <div className="mb-2 flex items-center justify-between px-1">
                                <label htmlFor="payment-amount" className={labelClass}>{t('billing.amount', { defaultValue: 'Amount to pay' })}</label>
                                <span className="font-mono text-[11px] font-bold text-slate-400">
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
                                    className="h-14 w-full rounded-none border-2 border-slate-200 bg-white ps-14 pe-4 text-left font-mono text-2xl font-black text-slate-900 outline-none transition focus:border-teal-500 dark:border-slate-800 dark:bg-[#0b1426] dark:text-white dark:focus:border-teal-500"
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

                        <div className="grid grid-cols-2 gap-3 px-1 pb-1">
                            <div>
                                <label htmlFor="payment-method" className={labelClass}>{t('billing.paymentMethod', { defaultValue: 'Payment method' })}</label>
                                <select id="payment-method" value={paymentMethod} onChange={(event) => onMethodChange(event.target.value)} className={`${inputClass} h-11 !rounded-none font-medium`}>
                                    {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{t(`billing.methods.${method}`, { defaultValue: method })}</option>)}
                                </select>
                            </div>
                            {paymentMethod !== 'Cash' && (
                                <div className="animate-in fade-in zoom-in-95 duration-200">
                                    <label htmlFor="payment-reference" className={labelClass}>
                                        {paymentMethod === 'Insurance' ? t('billing.insurancePolicy', { defaultValue: 'Policy No.' }) : t('billing.paymentReference', { defaultValue: 'Reference' })}
                                    </label>
                                    <input
                                        id="payment-reference"
                                        type="text"
                                        maxLength={150}
                                        required={paymentMethod !== 'Cash'}
                                        value={paymentReference}
                                        onChange={(event) => onReferenceChange(event.target.value)}
                                        placeholder={t('billing.paymentReferencePlaceholder', { defaultValue: 'Required' })}
                                        className={`${inputClass} h-11 !rounded-none`}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Collapsible Options (Discounts & History) */}
                    <div className="space-y-1 border-t border-slate-100 pt-3 dark:border-slate-800/60">
                        <button type="button" onClick={() => setShowDiscount(!showDiscount)} className="flex w-full items-center justify-between rounded-none px-2 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900/50">
                            <span className="flex items-center gap-2.5"><BadgePercent size={18} className="text-teal-500" /> {t('billing.discountTitle', { defaultValue: 'Apply Discount' })}</span>
                            <ChevronDown size={18} className={`text-slate-400 transition-transform ${showDiscount ? 'rotate-180' : ''}`} />
                        </button>
                        {showDiscount && (
                            <div className="animate-in fade-in slide-in-from-top-1 px-2 pb-3">
                                {canDiscount ? (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label htmlFor="discount-amount" className={labelClass}>{t('billing.additionalDiscount', { defaultValue: 'Discount Amount' })}</label>
                                            <input id="discount-amount" type="number" min="0" step="0.01" max={invoice.balance_amount} value={discountAmount} onChange={(event) => onDiscountAmountChange(event.target.value)} className={`${inputClass} !rounded-none`} dir="ltr" />
                                        </div>
                                        <div>
                                            <label htmlFor="discount-reason" className={labelClass}>{t('billing.discountReason', { defaultValue: 'Reason' })}</label>
                                            <input id="discount-reason" type="text" maxLength={1000} required={Number(discountAmount) > 0} value={discountReason} onChange={(event) => onDiscountReasonChange(event.target.value)} placeholder={t('billing.discountReasonPlaceholder', { defaultValue: 'Required for discount' })} className={`${inputClass} !rounded-none`} />
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs font-semibold text-slate-500"><LockKeyhole size={14} className="inline mr-1.5 align-text-bottom" />{t('billing.discountRestricted', { defaultValue: 'Discounting is restricted for your role.' })}</p>
                                )}
                            </div>
                        )}

                        {invoiceDetail?.payments?.length > 0 && (
                            <>
                                <button type="button" onClick={() => setShowHistory(!showHistory)} className="flex w-full items-center justify-between rounded-none px-2 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900/50">
                                    <span className="flex items-center gap-2.5"><History size={18} className="text-teal-500" /> {t('billing.paymentHistory', { defaultValue: 'Previous Payments' })}</span>
                                    <ChevronDown size={18} className={`text-slate-400 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                                </button>
                                {showHistory && (
                                    <div className="animate-in fade-in slide-in-from-top-1 space-y-2 px-2 pb-3">
                                        {isLoadingInvoiceDetail ? (
                                            <p className="animate-pulse py-2 text-center text-xs font-semibold text-slate-400">{t('billing.loadingHistory', { defaultValue: 'Loading...' })}</p>
                                        ) : (
                                            invoiceDetail.payments.map((payment) => (
                                                <div key={payment.payment_id} className="flex items-center justify-between rounded-none border border-slate-200/60 bg-slate-50/50 px-4 py-3 dark:border-slate-800/60 dark:bg-slate-900/30">
                                                    <div>
                                                        <p className="text-xs font-black text-slate-800 dark:text-slate-200">{t(`billing.methods.${payment.method}`, { defaultValue: payment.method })}</p>
                                                        <p className="mt-0.5 text-[10px] font-medium text-slate-400">{new Date(payment.created_at || payment.transaction_date).toLocaleString()}</p>
                                                        {payment.payment_reference && <p className="mt-1 font-mono text-[10px] text-slate-500">REF: {payment.payment_reference}</p>}
                                                    </div>
                                                    <p className="font-mono text-sm font-black text-slate-800 dark:text-slate-200">{money(payment.amount)}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Submit Actions */}
                    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                        <button type="button" onClick={handleClose} disabled={isLoading} className={`${secondaryBtn} min-h-12 w-full !rounded-none sm:w-auto`}>
                            {t('cancel', { defaultValue: 'Cancel' })}
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading || paymentInvalid || (Number(paymentAmount || 0) > 0 && !currentShift)}
                            className={`${primaryBtn} min-h-12 w-full !rounded-none text-base sm:min-w-44 ${paymentMethod === 'Insurance' ? 'bg-teal-700 shadow-teal-900/10 hover:bg-teal-800' : ''}`}
                        >
                            {isLoading ? <span className="h-4 w-4 animate-spin rounded-none border-2 border-white/30 border-t-white" /> : <Check size={18} />}
                            {isLoading ? t('billing.processing', { defaultValue: 'Processing...' }) : paymentMethod === 'Insurance' ? t('billing.settleInsurance', { defaultValue: 'Approve & Release' }) : t('billing.confirmPayment', { defaultValue: 'Confirm Payment' })}
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    );
};

const QuickAmount = ({ label, onClick, active }) => (
    <button type="button" onClick={onClick} className={`flex-1 rounded-none border py-2 text-xs font-black transition ${active ? 'border-teal-500/50 bg-teal-50 text-teal-700 shadow-sm dark:border-teal-500/30 dark:bg-teal-900/20 dark:text-teal-400' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#0b1426] dark:text-slate-400 dark:hover:bg-slate-900/50'}`}>
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
