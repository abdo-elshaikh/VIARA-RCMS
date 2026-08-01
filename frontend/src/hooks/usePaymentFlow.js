import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    useGetInvoiceQuery,
    useCollectInvoicePaymentMutation,
    useTransitionQueueMutation,
} from '../store/api';
import {
    calculateAdjustedBalance,
    getNextStageAfterPayment,
    getPaymentValidation,
} from '../components/reception/receptionLogic';
import { getErrorMessage } from '../utils/getErrorMessage';

/**
 * Owns the full payment collection workflow:
 * - Invoice selection, amount, method, reference, discount, idempotency key
 * - Derived balance/validation state
 * - Submit handler (with optional queue auto-advance)
 *
 * @param {{ currentShift: object | undefined, queueItems: array }} params
 * @returns {{
 *   selectedInvoice: object | null,
 *   invoiceDetail: object | undefined,
 *   isLoadingInvoiceDetail: boolean,
 *   paymentAmount: string,
 *   paymentMethod: string,
 *   paymentReference: string,
 *   discountAmount: string,
 *   discountReason: string,
 *   adjustedBalance: number,
 *   remainingBalance: number,
 *   paymentInvalid: boolean,
 *   isPaying: boolean,
 *   openPayment: (invoice: object) => void,
 *   closePayment: () => void,
 *   changeDiscount: (val: string) => void,
 *   handleConfirmPayment: (e: React.FormEvent) => Promise<void>,
 *   setPaymentAmount: (val: string) => void,
 *   setPaymentMethod: (val: string) => void,
 *   setPaymentReference: (val: string) => void,
 *   setDiscountReason: (val: string) => void,
 *   paymentModalProps: object,
 * }}
 */
export const usePaymentFlow = ({ currentShift, queueItems = [] }) => {
    const { t } = useTranslation('reception');

    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [paymentReference, setPaymentReference] = useState('');
    const [discountAmount, setDiscountAmount] = useState('0');
    const [discountReason, setDiscountReason] = useState('');
    const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState(() => crypto.randomUUID());

    const [collectPayment, { isLoading: isPaying }] = useCollectInvoicePaymentMutation();
    const [transitionQueue] = useTransitionQueueMutation();

    const { data: invoiceDetail, isFetching: isLoadingInvoiceDetail } = useGetInvoiceQuery(
        selectedInvoice?.invoice_id,
        { skip: !selectedInvoice?.invoice_id }
    );

    // The detail response is authoritative because it includes newly consumed
    // exam supplies and the recalculated invoice balance.
    const activeInvoice = invoiceDetail || selectedInvoice;
    // Derived state
    const adjustedBalance = useMemo(
        () => activeInvoice ? calculateAdjustedBalance(activeInvoice, Number(discountAmount || 0)) : 0,
        [activeInvoice, discountAmount]
    );

    const paymentState = useMemo(() => getPaymentValidation({
        adjustedBalance,
        discountAmount,
        discountReason,
        paymentAmount,
        paymentMethod,
    }), [adjustedBalance, discountAmount, discountReason, paymentAmount, paymentMethod]);

    const paymentInvalid = useMemo(
        () => paymentState.invalid || (paymentState.referenceRequired && paymentReference.trim().length < 3),
        [paymentReference, paymentState.invalid, paymentState.referenceRequired]
    );
    // Handlers
    const openPayment = useCallback((inv) => {
        setSelectedInvoice(inv);
        setPaymentAmount(String(inv.balance_amount || '0'));
        setPaymentMethod('Cash');
        setPaymentReference('');
        setDiscountAmount('0');
        setDiscountReason('');
        setPaymentIdempotencyKey(crypto.randomUUID());
    }, []);

    const closePayment = useCallback(() => {
        setSelectedInvoice(null);
        setPaymentAmount('');
        setPaymentMethod('Cash');
        setPaymentReference('');
        setDiscountAmount('0');
        setDiscountReason('');
        setPaymentIdempotencyKey(crypto.randomUUID());
    }, []);

    const changeDiscount = useCallback((val) => {
        const next = Math.max(0, Number(val || 0));
        setDiscountAmount(val);
        if (activeInvoice) {
            setPaymentAmount(calculateAdjustedBalance(activeInvoice, next).toFixed(2));
        }
    }, [activeInvoice]);

    const handleSetPaymentMethod = useCallback((method) => {
        setPaymentMethod(method);
        if (method === 'Insurance') setPaymentAmount(adjustedBalance.toFixed(2));
    }, [adjustedBalance]);

    const handleConfirmPayment = useCallback(async (e) => {
        e.preventDefault();
        if (!activeInvoice) return;

        if (!currentShift && Number(paymentAmount || 0) > 0) {
            toast.error(t('billing.openShiftRequired', { defaultValue: 'Open shift required' }));
            return;
        }
        const { discount, amount } = paymentState;
        if (discount > 0 && discountReason.trim().length < 3) {
            toast.error(t('billing.discountReasonRequired', { defaultValue: 'Discount reason required' }));
            return;
        }
        if (amount > adjustedBalance + 0.005) {
            toast.error(t('billing.amountExceedsBalance', { defaultValue: 'Amount exceeds balance' }));
            return;
        }

        try {
            await collectPayment({
                id: activeInvoice.invoice_id,
                idempotencyKey: paymentIdempotencyKey,
                amount,
                method: paymentMethod,
                paymentReference: paymentReference.trim() || undefined,
                discountAmount: discount,
                discountReason: discountReason.trim() || undefined,
            }).unwrap();

            toast.success(t('billing.paymentCollected', { defaultValue: 'Payment collected successfully' }));
            closePayment();

            // Auto-advance queue if fully paid
            if (paymentState.remainingBalance <= 0) {
                const match = queueItems.find(
                    (qi) => qi.appointment_id === activeInvoice.appointment_id
                        || qi.exam_id === activeInvoice.exam_id
                );
                // Only auto-advance if the patient is currently waiting on payment or just arrived
                if (match && ['Payment Pending', 'Arrived'].includes(match.queue_stage)) {
                    const nextStage = getNextStageAfterPayment(match);
                    try {
                        await transitionQueue({ examId: match.exam_id, toStage: nextStage }).unwrap();
                        toast.success(t('toast.queueMoved', {
                            stage: t(`queue.stages.${nextStage}`, { defaultValue: nextStage }),
                        }));
                    } catch (queueError) {
                        const manualMoveMessage = t('toast.queueMoveAfterPaymentFailed', {
                            defaultValue: 'Payment collected, but queue movement failed. Please move the patient manually.',
                        });
                        const queueErrorDetail = getErrorMessage(queueError, '');
                        toast.error(
                            queueErrorDetail
                                ? `${manualMoveMessage} ${queueErrorDetail}`
                                : manualMoveMessage
                        );
                    }
                }
            }
        } catch (err) {
            toast.error(getErrorMessage(err, t('billing.paymentFailed', { defaultValue: 'Payment failed' })));
        }
    }, [
        adjustedBalance, closePayment, collectPayment, currentShift,
        discountReason, paymentAmount, paymentIdempotencyKey, paymentMethod,
        activeInvoice, paymentReference, paymentState, queueItems, t, transitionQueue,
    ]);
    /** Prop bundle spread directly onto PaymentCollectionModal. */
    const paymentModalProps = useMemo(() => ({
        adjustedBalance,
        canDiscount: undefined, // injected by consumer from permissions
        currentShift,
        discountAmount,
        discountReason,
        invoice: activeInvoice,
        invoiceDetail,
        isLoading: isPaying,
        isLoadingInvoiceDetail,
        onAmountChange: setPaymentAmount,
        onClose: closePayment,
        onDiscountAmountChange: changeDiscount,
        onDiscountReasonChange: setDiscountReason,
        onMethodChange: handleSetPaymentMethod,
        onReferenceChange: setPaymentReference,
        onSubmit: handleConfirmPayment,
        paymentAmount,
        paymentInvalid,
        paymentMethod,
        paymentReference,
        remainingBalance: paymentState.remainingBalance,
        t,
    }), [
        adjustedBalance, changeDiscount, closePayment, currentShift, discountAmount,
        discountReason, handleConfirmPayment, handleSetPaymentMethod, invoiceDetail,
        isPaying, isLoadingInvoiceDetail, paymentAmount, paymentInvalid, paymentMethod,
        paymentReference, paymentState.remainingBalance, activeInvoice, t,
    ]);

    return {
        selectedInvoice,
        invoiceDetail,
        isLoadingInvoiceDetail,
        paymentAmount,
        paymentMethod,
        paymentReference,
        discountAmount,
        discountReason,
        adjustedBalance,
        remainingBalance: paymentState.remainingBalance,
        paymentInvalid,
        isPaying,
        openPayment,
        closePayment,
        changeDiscount,
        handleConfirmPayment,
        setPaymentAmount,
        setPaymentMethod: handleSetPaymentMethod,
        setPaymentReference,
        setDiscountReason,
        paymentModalProps,
    };
};
