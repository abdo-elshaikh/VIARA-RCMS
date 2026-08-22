import { useCallback, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
    useOpenCashierShiftMutation,
    useCloseCashierShiftMutation,
    useGetCashierReconciliationQuery,
} from '../store/api';
import { getCurrentUserId } from '../components/reception/receptionLogic';
import { getErrorMessage } from '../utils/getErrorMessage';
import { selectCurrentUser } from '../store/authSlice';

const INITIAL_STATE = {
    shiftAction: null,
    openingBalance: '0',
    countedCash: '',
    shiftNotes: '',
};

const SHIFT_LIFECYCLE_STAGES = ['Open', 'Active', 'PendingReview', 'Reconciled', 'Closed'];

export const useShiftFlow = ({ skip = false, includeAllForReview = false } = {}) => {
    const { t } = useTranslation('reception');
    const user = useSelector(selectCurrentUser);
    const currentUserId = getCurrentUserId(user);

    const [openCashierShift, { isLoading: isOpening }] = useOpenCashierShiftMutation();
    const [closeCashierShift, { isLoading: isClosing }] = useCloseCashierShiftMutation();

    const { data: cashierData, isFetching: isLoadingShift } = useGetCashierReconciliationQuery(
        { cashierId: currentUserId },
        { skip: skip || !currentUserId }
    );
    const { data: supervisorData, isFetching: isLoadingSupervisorShifts } = useGetCashierReconciliationQuery(
        {},
        { skip: !includeAllForReview }
    );

    const currentShift = useMemo(
        () => cashierData?.data?.find((shift) => ['Open', 'Active'].includes(shift.status)),
        [cashierData]
    );

    const pendingReviewShift = useMemo(
        () => ((includeAllForReview ? supervisorData?.data : cashierData?.data) || [])
            .find((shift) => shift.review_status === 'Requires Review'
                && (!includeAllForReview || shift.cashier_id !== currentUserId)),
        [cashierData, currentUserId, includeAllForReview, supervisorData]
    );

    const openShifts = useMemo(
        () => (cashierData?.data || []).filter((shift) => shift.status === 'Open' || shift.status === 'Active'),
        [cashierData]
    );

    const closedShifts = useMemo(
        () => (cashierData?.data || []).filter((shift) => ['Closed', 'Reconciled', 'PendingReview'].includes(shift.status)),
        [cashierData]
    );

    const [state, setState] = useState(INITIAL_STATE);

    const openShiftDialog = useCallback((action) => {
        setState({ shiftAction: action, openingBalance: '0', countedCash: '', shiftNotes: '' });
    }, []);

    const closeShiftDialog = useCallback(() => {
        setState(INITIAL_STATE);
    }, []);

    const setOpeningBalance = useCallback((val) => setState((s) => ({ ...s, openingBalance: val })), []);
    const setCountedCash = useCallback((val) => setState((s) => ({ ...s, countedCash: val })), []);
    const setShiftNotes = useCallback((val) => setState((s) => ({ ...s, shiftNotes: val })), []);

    const handleShiftAction = useCallback(async (e) => {
        e.preventDefault();
        const { shiftAction, openingBalance, countedCash, shiftNotes } = state;
        try {
            if (shiftAction === 'open') {
                await openCashierShift({
                    openingBalance: Number(openingBalance || 0),
                    notes: shiftNotes.trim() || undefined,
                }).unwrap();
                toast.success(t('billing.shiftOpened', { defaultValue: 'Shift opened successfully' }));
            } else if (shiftAction === 'close' && currentShift) {
                await closeCashierShift({
                    id: currentShift.shift_id,
                    countedCash: Number(countedCash),
                    varianceReason: shiftNotes.trim() || undefined,
                    notes: shiftNotes.trim() || undefined,
                }).unwrap();
                toast.success(t('billing.shiftClosed', { defaultValue: 'Shift closed successfully' }));
            }
            closeShiftDialog();
        } catch (err) {
            toast.error(getErrorMessage(err, t('billing.shiftActionFailed', { defaultValue: 'Action failed' })));
        }
    }, [closeCashierShift, closeShiftDialog, currentShift, openCashierShift, state, t]);

    const handleReconciliation = useCallback(async ({ countedCash, notes }) => {
        if (!currentShift) return false;

        try {
            await closeCashierShift({
                id: currentShift.shift_id,
                countedCash: Number(countedCash),
                varianceReason: notes?.trim() || undefined,
                notes: notes?.trim() || undefined,
            }).unwrap();
            toast.success(t('cashier.reconciled', { defaultValue: 'Drawer reconciled successfully' }));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('billing.shiftActionFailed', { defaultValue: 'Action failed' })));
            return false;
        }
    }, [closeCashierShift, currentShift, t]);

    const shiftModalProps = useMemo(() => ({
        action: state.shiftAction,
        countedCash: state.countedCash,
        isBusy: isOpening || isClosing,
        onClose: closeShiftDialog,
        onCountedCashChange: setCountedCash,
        onNotesChange: setShiftNotes,
        onOpeningBalanceChange: setOpeningBalance,
        onSubmit: handleShiftAction,
        openingBalance: state.openingBalance,
        shiftNotes: state.shiftNotes,
        t,
    }), [
        closeShiftDialog, handleShiftAction, isClosing, isOpening,
        setCountedCash, setShiftNotes, setOpeningBalance, state, t,
    ]);

    return {
        currentShift,
        pendingReviewShift,
        openShifts,
        closedShifts,
        isLoadingShift: isLoadingShift || isLoadingSupervisorShifts,
        isBusy: isOpening || isClosing,
        openShiftDialog,
        closeShiftDialog,
        setOpeningBalance,
        setCountedCash,
        setShiftNotes,
        handleShiftAction,
        handleReconciliation,
        shiftModalProps,
        ...state,
    };
};
