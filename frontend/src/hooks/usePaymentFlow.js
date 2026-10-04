import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { generateUUID } from '../utils/uuid';
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
export const usePaymentFlow = ({ currentShift, queueItems = [], refreshWorkspace, canManageQueue = false }) => {
    const { t } = useTranslation('reception');

    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('Cash');
    const [paymentReference, setPaymentReference] = useState('');
    const [discountAmount, setDiscountAmount] = useState('0');
    const [discountReason, setDiscountReason] = useState('');
    const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState(() => generateUUID());
    const hasUserSelectedMethod = useRef(false);

    const [collectPayment, { isLoading: isPaying }] = useCollectInvoicePaymentMutation();
    const [transitionQueue] = useTransitionQueueMutation();

    const { data: invoiceDetail, isFetching: isLoadingInvoiceDetail, refetch: refetchInvoiceDetail } = useGetInvoiceQuery(
        selectedInvoice?.invoice_id,
        { skip: !selectedInvoice?.invoice_id }
    );

    // The detail response is authoritative because it includes newly consumed
    // exam supplies and the recalculated invoice balance.
    // Ensure activeInvoice is strictly null when selectedInvoice is cleared so modal closes even with cached query data.
    const activeInvoice = selectedInvoice
        ? ((invoiceDetail?.invoice_id === selectedInvoice?.invoice_id ? invoiceDetail : null) || selectedInvoice)
        : null;

    useEffect(() => {
        if (selectedInvoice && invoiceDetail?.invoice_id === selectedInvoice.invoice_id) {
            const serverBalance = Number(invoiceDetail.balance_amount ?? 0);
            setPaymentAmount(serverBalance.toFixed(2));
            if (!hasUserSelectedMethod.current) {
                const expectedMethod = invoiceDetail.expected_payment_method || invoiceDetail.appointment_payment_method;
                const collectionMethods = ['Cash', 'Card', 'Credit Card', 'Wallet', 'Bank Transfer'];
                if (expectedMethod && collectionMethods.includes(expectedMethod)) {
                    setPaymentMethod(expectedMethod);
                }
            }
        }
    }, [invoiceDetail, selectedInvoice]);
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
        hasUserSelectedMethod.current = false;
        setSelectedInvoice(inv);
        setPaymentAmount(String(inv.balance_amount ?? '0'));
        const expectedMethod = inv.expected_payment_method || inv.appointment_payment_method;
        const collectionMethods = ['Cash', 'Card', 'Credit Card', 'Wallet', 'Bank Transfer'];
        setPaymentMethod(collectionMethods.includes(expectedMethod) ? expectedMethod : 'Cash');
        setPaymentReference('');
        setDiscountAmount('0');
        setDiscountReason('');
        setPaymentIdempotencyKey(generateUUID());
    }, []);

    const closePayment = useCallback(() => {
        hasUserSelectedMethod.current = false;
        setSelectedInvoice(null);
        setPaymentAmount('');
        setPaymentMethod('Cash');
        setPaymentReference('');
        setDiscountAmount('0');
        setDiscountReason('');
        setPaymentIdempotencyKey(generateUUID());
    }, []);

    const changeDiscount = useCallback((val) => {
        const next = Math.max(0, Number(val || 0));
        setDiscountAmount(val);
        if (activeInvoice) {
            setPaymentAmount(calculateAdjustedBalance(activeInvoice, next).toFixed(2));
        }
    }, [activeInvoice]);

    const handleSetPaymentMethod = useCallback((method) => {
        hasUserSelectedMethod.current = true;
        setPaymentMethod(method);
    }, []);

    const handleConfirmPayment = useCallback(async (e) => {
        e.preventDefault();
        if (!activeInvoice) return;

        if (paymentInvalid) {
            toast.error(t('billing.invalidPayment', { defaultValue: 'Review the payment amount and required details.' }));
            return;
        }

        if (!currentShift && Number(paymentAmount || 0) > 0) {
            toast.error(t('billing.openShiftRequired', { defaultValue: 'Open shift required' }));
            return;
        }
        const { discount, amount } = paymentState;
        const verificationInput = e.currentTarget?.elements?.verificationChecklist?.value;
        let verificationChecklist;
        try {
            verificationChecklist = verificationInput ? JSON.parse(verificationInput) : undefined;
        } catch {
            verificationChecklist = undefined;
        }
        if (discount > 0 && discountReason.trim().length < 3) {
            toast.error(t('billing.discountReasonRequired', { defaultValue: 'Discount reason required' }));
            return;
        }
        if (amount > adjustedBalance + 0.005) {
            toast.error(t('billing.amountExceedsBalance', { defaultValue: 'Amount exceeds balance' }));
            return;
        }

        try {
            const paymentResponse = await collectPayment({
                id: activeInvoice.invoice_id,
                idempotencyKey: paymentIdempotencyKey,
                amount,
                method: paymentMethod,
                paymentReference: paymentReference.trim() || undefined,
                discountAmount: discount,
                discountReason: discountReason.trim() || undefined,
                verificationChecklist,
            }).unwrap();

            toast.success(t('billing.paymentCollected', { defaultValue: 'Payment collected successfully' }));
            closePayment();

            // The server recalculates discounts, credits, refunds, and payments.
            // Only advance when its authoritative invoice status is Paid.
            if (canManageQueue && paymentResponse?.invoice?.invoice_status === 'Paid') {
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
                        await Promise.resolve(refreshWorkspace?.()).catch(() => undefined);
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
            // A colleague may have already collected part or all of this balance.
            // Refresh the invoice so the operator sees the authoritative amount.
            if (activeInvoice?.invoice_id) {
                await refetchInvoiceDetail().catch(() => undefined);
            }
        }
    }, [
        adjustedBalance, closePayment, collectPayment, currentShift, canManageQueue, paymentInvalid,
        discountReason, paymentAmount, paymentIdempotencyKey, paymentMethod,
        activeInvoice, paymentReference, paymentState, queueItems, t, transitionQueue,
        refetchInvoiceDetail, refreshWorkspace,
    ]);
    /** Prop bundle spread directly onto PaymentCollectionModal. */
    const paymentModalProps = useMemo(() => ({
        isOpen: Boolean(selectedInvoice),
        adjustedBalance,
        canDiscount: undefined, // injected by consumer from permissions
        currentShift,
        discountAmount,
        discountReason,
        invoice: activeInvoice,
        invoiceDetail: selectedInvoice && invoiceDetail?.invoice_id === selectedInvoice?.invoice_id ? invoiceDetail : undefined,
        isLoading: isPaying,
        isLoadingInvoiceDetail: Boolean(selectedInvoice && isLoadingInvoiceDetail),
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
        paymentReference, paymentState.remainingBalance, activeInvoice, selectedInvoice, t,
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
