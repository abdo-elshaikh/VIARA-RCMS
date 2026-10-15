const REPORT_WORKFLOW = ['Draft', 'Typed', 'Reviewed', 'Approved', 'Finalized'];

const getReportTransitionError = (currentStatus = 'Draft', nextStatus, { finalizing = false } = {}) => {
    const current = currentStatus || 'Draft';
    if (!nextStatus || current === nextStatus) return null;

    const currentIndex = REPORT_WORKFLOW.indexOf(current);
    const nextIndex = REPORT_WORKFLOW.indexOf(nextStatus);
    if (currentIndex < 0 || nextIndex < 0) {
        return 'Unknown report workflow status';
    }

    // Finalization is a real workflow transition, not an escape hatch.
    if (finalizing && nextStatus === 'Finalized' && current !== 'Approved') {
        return 'Report must be Approved before it can be Finalized';
    }
    if (nextIndex < currentIndex) {
        return `Report status cannot move backward from ${current} to ${nextStatus}`;
    }
    if (nextIndex > currentIndex + 1) {
        return `Complete the ${REPORT_WORKFLOW[currentIndex + 1]} stage before ${nextStatus}`;
    }

    return null;
};

const getReportStatusForSave = (currentStatus = 'Draft') =>
    currentStatus === 'Draft' ? 'Typed' : currentStatus;

module.exports = {
    REPORT_WORKFLOW,
    getReportStatusForSave,
    getReportTransitionError
};
