import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClinicalPaymentExceptionNotice from './ClinicalPaymentExceptionNotice';

const partialCase = {
    invoice_id: 'invoice-1',
    invoice_number: 'INV-1001',
    invoice_paid_amount: 250,
    invoice_balance_amount: 150,
    priority: 'Routine',
    is_assigned_to_me: true,
};

describe('ClinicalPaymentExceptionNotice', () => {
    it('offers a request for a partially-paid assigned case', () => {
        const onRequest = vi.fn();
        render(
            <ClinicalPaymentExceptionNotice
                item={partialCase}
                targetStage="Ready for Exam"
                isArabic={false}
                canRequest
                onRequest={onRequest}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Request exception' }));
        expect(onRequest).toHaveBeenCalledWith(partialCase);
        expect(screen.getByText(/Exception approval is required/)).toBeInTheDocument();
    });

    it('shows an approved decision without offering another request', () => {
        render(
            <ClinicalPaymentExceptionNotice
                item={{
                    ...partialCase,
                    payment_exception_id: 'exception-1',
                    payment_exception_status: 'Approved',
                    payment_exception_target_stage: 'In Exam',
                    payment_exception_review_notes: 'Approved by finance',
                }}
                targetStage="In Exam"
                isArabic={false}
                canRequest
            />
        );

        expect(screen.getByText(/Approved financial exception: Clinical prep and examination permitted/)).toBeInTheDocument();
        expect(screen.getByText(/Approved by finance/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /request/i })).not.toBeInTheDocument();
    });

    it('shows an approved decision across any subsequent clinical target stage', () => {
        render(
            <ClinicalPaymentExceptionNotice
                item={{
                    ...partialCase,
                    payment_exception_id: 'exception-1',
                    payment_exception_status: 'Approved',
                    payment_exception_target_stage: 'Prep Pending',
                    payment_exception_review_notes: 'Approved at reception',
                }}
                targetStage="Ready for Exam"
                isArabic
                canRequest
            />
        );

        expect(screen.getByText(/استثناء مالي معتمد: مسموح باستكمال التمريض والفحص/)).toBeInTheDocument();
        expect(screen.getByText(/Approved at reception/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /طلب/i })).not.toBeInTheDocument();
    });
});
