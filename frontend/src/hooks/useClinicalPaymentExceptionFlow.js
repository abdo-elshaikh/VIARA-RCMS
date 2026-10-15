import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useRequestPartialPaymentExceptionMutation } from '../store/api';
import { getErrorMessage } from '../utils/getErrorMessage';

const getExceptionErrorCode = (error) => error?.data?.code || error?.data?.details?.code;

const useClinicalPaymentExceptionFlow = ({ items = [], targetStage, isArabic, refetch }) => {
    const [requestTarget, setRequestTarget] = useState(null);
    const [requestExceptionMutation, { isLoading }] = useRequestPartialPaymentExceptionMutation();
    const alertedApprovals = useRef(new Set());

    useEffect(() => {
        const newlyApproved = items.filter((item) => item.payment_exception_status === 'Approved'
            && item.payment_exception_id
            && !alertedApprovals.current.has(item.payment_exception_id));
        if (!newlyApproved.length) return;
        newlyApproved.forEach((item) => alertedApprovals.current.add(item.payment_exception_id));
        const first = newlyApproved[0];
        toast.success(isArabic
            ? `تم اعتماد استثناء ${first.patient_name || 'الحالة'}${newlyApproved.length > 1 ? ` و${newlyApproved.length - 1} حالة أخرى` : ''} — مسموح بمتابعة الفحص الطبي حتى صدور التقرير`
            : `Exception approved for ${first.patient_name || 'patient'}${newlyApproved.length > 1 ? ` and ${newlyApproved.length - 1} more` : ''} — clinical workflow can proceed`, {
            duration: 6500,
            icon: '✅',
        });
    }, [isArabic, items]);

    const requestException = useCallback((item) => setRequestTarget(item), []);

    const submitException = useCallback(async (reason) => {
        if (!requestTarget?.invoice_id) return false;
        try {
            await requestExceptionMutation({
                invoiceId: requestTarget.invoice_id,
                transactionType: 'ClinicalQueueTransition',
                targetStage,
                reason,
            }).unwrap();
            toast.success(isArabic ? 'تم إرسال طلب الاستثناء للاعتماد' : 'Exception request sent for approval');
            setRequestTarget(null);
            await refetch?.();
            return true;
        } catch (error) {
            if (getExceptionErrorCode(error) === 'PARTIAL_PAYMENT_EXCEPTION_PENDING'
                || String(error?.data?.message || '').includes('pending exception already exists')) {
                toast(isArabic ? 'يوجد طلب استثناء قيد المراجعة بالفعل' : 'An exception request is already pending review', { icon: '⏳' });
                setRequestTarget(null);
                await refetch?.();
                return true;
            }
            toast.error(getErrorMessage(error, isArabic ? 'تعذر إرسال طلب الاستثناء' : 'Could not submit exception request'));
            return false;
        }
    }, [isArabic, refetch, requestExceptionMutation, requestTarget, targetStage]);

    return {
        requestTarget,
        requestException,
        closeRequest: () => setRequestTarget(null),
        submitException,
        isRequesting: isLoading,
    };
};

export default useClinicalPaymentExceptionFlow;
