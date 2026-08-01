import { describe, expect, it } from 'vitest';
import {
    buildPermissionModel,
    buildScheduleSummary,
    calculateAdjustedBalance,
    canTransitionQueue,
    getNextStageAfterPayment,
    getPaymentValidation,
    getValidQueueTransitions,
    toLocalDateInput
} from '../receptionLogic';

describe('receptionLogic', () => {
    it('formats local dates without timezone drift', () => {
        expect(toLocalDateInput(new Date(2026, 6, 12))).toBe('2026-07-12');
    });

    it('builds an effective permission model from direct and elevated permissions', () => {
        const permissions = buildPermissionModel({
            role: 'Receptionist',
            permissions: ['PROCESS_PAYMENTS'],
            elevatedPermissions: ['APPLY_DISCOUNTS']
        });

        expect(permissions.canProcessPayments).toBe(true);
        expect(permissions.canDiscount).toBe(true);
        expect(permissions.canOpenCashierShift).toBe(false);
    });

    it('calculates adjusted balances with discount, tax, insurance, and refunds', () => {
        expect(calculateAdjustedBalance({
            subtotal_amount: 100,
            discount_amount: 10,
            tax_rate: 10,
            insurance_covered_amount: 20,
            paid_amount: 30,
            refunded_amount: 5
        }, 5)).toBe(48.5);
    });

    it('subtracts credit notes when calculating remaining patient balance', () => {
        expect(calculateAdjustedBalance({
            subtotal_amount: 100,
            discount_amount: 0,
            tax_rate: 0,
            insurance_covered_amount: 0,
            paid_amount: 40,
            refunded_amount: 10,
            credited_amount: 15
        })).toBe(55);
    });

    it('rounds adjusted balances to two decimals for display validation', () => {
        expect(calculateAdjustedBalance({
            subtotal_amount: 0.1,
            discount_amount: 0,
            tax_rate: 0,
            insurance_covered_amount: 0,
            paid_amount: 0,
            refunded_amount: 0
        }, 0.2)).toBe(0);
    });

    it('validates payment edge cases', () => {
        expect(getPaymentValidation({
            adjustedBalance: 100,
            discountAmount: 10,
            discountReason: 'VIP approval',
            paymentAmount: 90,
            paymentMethod: 'Card'
        })).toMatchObject({ invalid: false, referenceRequired: true, remainingBalance: 10 });

        expect(getPaymentValidation({
            adjustedBalance: 100,
            discountAmount: 10,
            discountReason: '',
            paymentAmount: 90,
            paymentMethod: 'Cash'
        }).invalid).toBe(true);
    });

    it('summarizes schedule and decides the queue stage after payment', () => {
        expect(buildScheduleSummary([
            { status: 'Confirmed', priority: 'Routine' },
            { status: 'Cancelled', priority: 'Emergency' }
        ], [{ exam_id: '1' }])).toEqual({ booked: 2, ready: 1, urgent: 1, activeQueue: 1 });

        expect(getNextStageAfterPayment({ nurse_id: 'nurse-1' })).toBe('Prep Pending');
        expect(getNextStageAfterPayment({})).toBe('Ready for Exam');
    });

    it('keeps queue transitions aligned with the backend workflow', () => {
        expect(getValidQueueTransitions('Delivered')).toEqual([]);
        expect(canTransitionQueue('Delivered', 'Arrived')).toBe(false);
        expect(canTransitionQueue('Finalized', 'Delivered')).toBe(true);
        expect(canTransitionQueue('Ready for Exam', 'Prep Pending')).toBe(false);
    });
});
