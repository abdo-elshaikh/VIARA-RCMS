import { describe, expect, it } from 'vitest';
import {
    buildPermissionModel,
    buildScheduleSummary,
    calculateAdjustedBalance,
    canTransitionQueue,
    getInvoiceCoverageCategory,
    getNextStageAfterPayment,
    getPaymentValidation,
    getValidQueueTransitions,
    isActionableCashierItem,
    shiftLocalDateInput,
    toLocalDateInput
} from '../receptionLogic';

describe('receptionLogic', () => {
    it('formats local dates without timezone drift', () => {
        expect(toLocalDateInput(new Date(2026, 6, 12))).toBe('2026-07-12');
    });

    it('shifts local date inputs without converting through UTC', () => {
        expect(shiftLocalDateInput('2026-08-20', 1)).toBe('2026-08-21');
        expect(shiftLocalDateInput('2026-08-20', -1)).toBe('2026-08-19');
    });

    it('builds an effective permission model from direct and elevated permissions', () => {
        const permissions = buildPermissionModel({
            role: 'Receptionist',
            permissions: ['PROCESS_PAYMENTS'],
            emergencyAccessId: '1a19df4f-c08a-47e3-ae6d-b0a2ea9ef9ac',
            elevatedPermissions: ['APPLY_DISCOUNTS'],
            breakGlassExpiry: Date.now() + 60_000
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

    it('preserves an explicit zero patient payable for fully insured invoices', () => {
        const category = getInvoiceCoverageCategory({
            total_amount: 250,
            insurance_covered_amount: 250,
            patient_payable_amount: 0,
            provider_name: 'Health Plan'
        });
        expect(category.patientPayable).toBe(0);
        expect(category.totalAmount).toBe(250);
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
        ], [
            { exam_id: '1', queue_stage: 'Arrived' },
            { exam_id: '2', queue_stage: 'Delivered' },
            { exam_id: '3', queue_stage: 'Cancelled' }
        ])).toEqual({ booked: 2, ready: 1, urgent: 1, activeQueue: 1 });

        expect(getNextStageAfterPayment({ nurse_id: 'nurse-1' })).toBe('Prep Pending');
        expect(getNextStageAfterPayment({ nurseName: 'Sarah Nurse' })).toBe('Prep Pending');
        expect(getNextStageAfterPayment({})).toBe('Ready for Exam');
    });

    it('keeps queue transitions aligned with the backend workflow', () => {
        expect(getValidQueueTransitions('Delivered')).toEqual([]);
        expect(canTransitionQueue('Delivered', 'Arrived')).toBe(false);
        expect(canTransitionQueue('Finalized', 'Delivered')).toBe(true);
        expect(canTransitionQueue('Ready for Exam', 'Prep Pending')).toBe(false);
        expect(canTransitionQueue('In Exam', 'Reporting')).toBe(false);
    });

    it('identifies actionable cashier items when supplies are added during later workflow stages', () => {
        // Missing invoice in Payment Pending
        expect(isActionableCashierItem({ queue_stage: 'Payment Pending' }, null)).toBe(true);

        // Paid invoice in In Exam (0 balance)
        expect(isActionableCashierItem({ queue_stage: 'In Exam' }, { invoice_status: 'Paid', balance_amount: 0 })).toBe(false);

        // In Exam after adding new supplies (balance > 0) -> REAPPEARS in Cashier!
        expect(isActionableCashierItem({ queue_stage: 'In Exam' }, { invoice_status: 'Partial', balance_amount: 250 })).toBe(true);

        // Prep Pending with outstanding contrast supply balance
        expect(isActionableCashierItem({ queue_stage: 'Prep Pending' }, { invoice_status: 'Partial', balance_amount: 120 })).toBe(true);

        // Voided invoice is never actionable
        expect(isActionableCashierItem({ queue_stage: 'In Exam' }, { invoice_status: 'Voided', balance_amount: 250 })).toBe(false);
    });
});
