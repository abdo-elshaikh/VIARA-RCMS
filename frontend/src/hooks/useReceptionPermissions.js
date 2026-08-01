import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../store/authSlice';
import { buildPermissionModel } from '../components/reception/receptionLogic';

/**
 * Returns a stable permission model for the currently signed-in user.
 * Memoized on `user` identity so re-renders elsewhere don't cause recalculation.
 *
 * @returns {{
 *   has: (permission: string) => boolean,
 *   canProcessPayments: boolean,
 *   canReconcileShifts: boolean,
 *   canOpenCashierShift: boolean,
 *   canCloseCashierShift: boolean,
 *   canDiscount: boolean
 *   canAppendSupplies: boolean,
 *   canManageQueue: boolean,
 *   canDeliverResults: boolean
 * }}
 */
export const useReceptionPermissions = () => {
    const user = useSelector(selectCurrentUser);
    return useMemo(() => buildPermissionModel(user), [user]);
};
