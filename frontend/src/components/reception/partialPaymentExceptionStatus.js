const getTargetStage = (exception) => exception?.target_stage || exception?.metadata?.targetStage || null;

export const getEffectivePartialPaymentExceptionStatus = (exception, now = Date.now()) => {
    if (!exception) return null;
    if (exception.status === 'Approved' && exception.expires_at
        && new Date(exception.expires_at).getTime() <= now) {
        return 'Expired';
    }
    return exception.status;
};

export const findPartialPaymentException = (
    exceptions = [],
    invoiceId,
    targetStage,
    transactionType = 'ClinicalQueueTransition'
) => {
    if (!invoiceId) return null;

    const statusPriority = (exception) => {
        if (exception.status === 'Pending') return 0;
        return getEffectivePartialPaymentExceptionStatus(exception) === 'Approved' ? 1 : 2;
    };

    return exceptions
        .filter((exception) => exception.invoice_id === invoiceId
            && exception.transaction_type === transactionType
            && (!targetStage || getTargetStage(exception) === targetStage || getEffectivePartialPaymentExceptionStatus(exception) === 'Approved'))
        .sort((left, right) => {
            const statusOrder = statusPriority(left) - statusPriority(right);
            if (statusOrder !== 0) return statusOrder;
            return new Date(right.requested_at || 0).getTime() - new Date(left.requested_at || 0).getTime();
        })[0] || null;
};

export const hasApprovedPartialPaymentException = (
    exceptions = [],
    invoiceId,
    targetStage,
    transactionType = 'ClinicalQueueTransition'
) => exceptions.some((exception) => exception.invoice_id === invoiceId
    && exception.transaction_type === transactionType
    && getEffectivePartialPaymentExceptionStatus(exception) === 'Approved');
