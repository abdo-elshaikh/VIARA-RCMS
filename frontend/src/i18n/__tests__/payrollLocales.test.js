import { describe, expect, it } from 'vitest';
import en from '../locales/en/payroll.json';
import ar from '../locales/ar/payroll.json';

const hasArabic = (value) => /[\u0600-\u06FF]/.test(String(value || ''));

describe('payroll locale contract', () => {
    it('defines recurrence options and penalty sources in both languages', () => {
        ['OneTime', 'Recurring', 'Installment'].forEach((key) => {
            expect(en.recurrenceTypes[key]).toBeTruthy();
            expect(ar.recurrenceTypes[key]).toBeTruthy();
            expect(hasArabic(ar.recurrenceTypes[key])).toBe(true);
        });
        ['Manual', 'Attendance', 'Policy', 'Import'].forEach((key) => {
            expect(en.penaltySources[key]).toBeTruthy();
            expect(ar.penaltySources[key]).toBeTruthy();
            expect(hasArabic(ar.penaltySources[key])).toBe(true);
        });
    });

    it('localizes run, penalty, acknowledgement, and employee dispute states', () => {
        ['Draft', 'Calculated', 'Reviewed', 'Approved', 'Paid', 'Locked', 'Cancelled'].forEach((key) => {
            expect(en.payrollStatuses[key]).toBeTruthy();
            expect(ar.payrollStatuses[key]).toBeTruthy();
            expect(hasArabic(ar.payrollStatuses[key])).toBe(true);
        });
        ['Pending Approval', 'Approved', 'Rejected', 'Cancelled', 'Applied'].forEach((key) => {
            expect(en.penaltyStatuses[key]).toBeTruthy();
            expect(ar.penaltyStatuses[key]).toBeTruthy();
            expect(hasArabic(ar.penaltyStatuses[key])).toBe(true);
        });
        ['Pending', 'Acknowledged', 'Disputed', 'Resolved'].forEach((key) => {
            expect(en.acknowledgementStatuses[key]).toBeTruthy();
            expect(ar.acknowledgementStatuses[key]).toBeTruthy();
            expect(hasArabic(ar.acknowledgementStatuses[key])).toBe(true);
        });
        ['selfApprovalBlocked', 'runReservationBlocked'].forEach((key) => {
            expect(en.deductionReview[key]).toBeTruthy();
            expect(ar.deductionReview[key]).toBeTruthy();
            expect(hasArabic(ar.deductionReview[key])).toBe(true);
        });
        ['employeeName', 'grossEarnings', 'deductions', 'penalties', 'netPay', 'runStatus'].forEach((key) => {
            expect(en.exportColumns[key]).toBeTruthy();
            expect(ar.exportColumns[key]).toBeTruthy();
            expect(hasArabic(ar.exportColumns[key])).toBe(true);
        });
        ['title', 'acknowledge', 'dispute', 'disputeReason', 'submitDispute', 'disputeInReview'].forEach((key) => {
            expect(en.employee[key]).toBeTruthy();
            expect(ar.employee[key]).toBeTruthy();
            expect(hasArabic(ar.employee[key])).toBe(true);
        });
        ['cancelMessage', 'reasonRequired', 'cancelAction'].forEach((key) => {
            expect(en.penaltyReview[key]).toBeTruthy();
            expect(ar.penaltyReview[key]).toBeTruthy();
            expect(hasArabic(ar.penaltyReview[key])).toBe(true);
        });
        ['title', 'message', 'resolutionPlaceholder'].forEach((key) => {
            expect(en.disputeReview[key]).toBeTruthy();
            expect(ar.disputeReview[key]).toBeTruthy();
            expect(hasArabic(ar.disputeReview[key])).toBe(true);
        });
    });
});