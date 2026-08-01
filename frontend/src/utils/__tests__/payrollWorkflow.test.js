import { describe, expect, it, beforeEach } from 'vitest';
import {
    clearStoredPayrollPaymentKey,
    formatDateInput,
    getPayrollPermissions,
    getStoredPayrollPaymentKey,
    payrollQueueActionForStatus,
} from '../payrollWorkflow';

describe('payrollWorkflow', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('formats date inputs from local date parts without UTC shifting', () => {
        expect(formatDateInput(new Date(2026, 6, 1))).toBe('2026-07-01');
        expect(formatDateInput(new Date(2026, 6, 31))).toBe('2026-07-31');
    });

    it('builds payroll permissions from elevated roles and explicit permissions', () => {
        expect(getPayrollPermissions({ role: 'Admin', permissions: [] }).pay).toBe(true);
        expect(getPayrollPermissions({ role: 'HR', permissions: ['VIEW_PAYROLL', 'REVIEW_PAYROLL'] })).toMatchObject({
            view: true,
            review: true,
            approve: false,
        });
    });

    it('maps run statuses to the next allowed inbox action', () => {
        const permissions = {
            review: true,
            approve: true,
            pay: true,
            lock: true,
            cancel: false,
        };

        expect(payrollQueueActionForStatus('Calculated', permissions)).toMatchObject({
            actionStatus: 'Reviewed',
            rejectDisabled: true,
        });
        expect(payrollQueueActionForStatus('Reviewed', permissions)).toMatchObject({
            actionStatus: 'Approved',
            needsApprovalNotes: true,
        });
        expect(payrollQueueActionForStatus('Approved', permissions)).toMatchObject({
            actionStatus: 'Paid',
            requiresPayment: true,
        });
        expect(payrollQueueActionForStatus('Paid', permissions)).toMatchObject({
            actionStatus: 'Locked',
        });
    });

    it('reuses payment idempotency keys until cleared', () => {
        const first = getStoredPayrollPaymentKey('run-1');
        const second = getStoredPayrollPaymentKey('run-1');

        expect(second).toBe(first);

        clearStoredPayrollPaymentKey('run-1');
        expect(getStoredPayrollPaymentKey('run-1')).not.toBe(first);
    });
});
