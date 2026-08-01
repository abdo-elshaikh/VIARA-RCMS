import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CashierQueueTab from '../CashierQueueTab';

const t = (key, options) => options?.defaultValue || key;
const items = [
    { exam_id: 'e1', appointment_id: 'a1', patient_name: 'Amina Hassan', mrn: 'PAT-1', priority: 'Urgent', waiting_minutes: 40, exam_type_name: 'MRI Brain' },
    { exam_id: 'e2', appointment_id: 'a2', patient_name: 'Omar Saleh', mrn: 'PAT-2', priority: 'Routine', waiting_minutes: 10, exam_type_name: 'CT Chest' },
    { exam_id: 'e3', appointment_id: 'a3', patient_name: 'Lina Ali', mrn: 'PAT-3', priority: 'Routine', waiting_minutes: 5, exam_type_name: 'X-Ray' }
];
const invoices = [
    { invoice_id: 'i2', appointment_id: 'a2', invoice_status: 'Pending', balance_amount: 200 },
    { invoice_id: 'i3', appointment_id: 'a3', invoice_status: 'Paid', balance_amount: 0 }
];

describe('CashierQueueTab', () => {
    it('shows payment readiness and filters actionable cases', () => {
        const onCreateInvoice = vi.fn();
        render(
            <CashierQueueTab
                canCloseShift={false}
                canOpenShift
                currentShift={null}
                invoices={invoices}
                isLoadingShift={false}
                items={items}
                locale="en"
                onCreateInvoice={onCreateInvoice}
                onMoveQueue={vi.fn()}
                onOpenPayment={vi.fn()}
                onShiftAction={vi.fn()}
                t={t}
            />
        );

        expect(screen.getByRole('button', { name: 'billing.collectPayment' })).toBeDisabled();
        fireEvent.change(screen.getByLabelText('cashier.readinessFilter'), { target: { value: 'MissingInvoice' } });
        expect(screen.getByText('Amina Hassan')).toBeInTheDocument();
        expect(screen.queryByText('Omar Saleh')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'table.createInvoice' }));
        expect(onCreateInvoice).toHaveBeenCalledWith(items[0]);
    });

    it('keeps both clinical routing choices available after payment', () => {
        const onMoveQueue = vi.fn();
        render(
            <CashierQueueTab
                canCloseShift
                canOpenShift={false}
                currentShift={{ shift_id: 'shift-1', collected_amount: 200, payment_count: 1, opened_at: '2026-07-06T08:00:00Z' }}
                invoices={invoices}
                isLoadingShift={false}
                items={items}
                locale="en"
                onCreateInvoice={vi.fn()}
                onMoveQueue={onMoveQueue}
                onOpenPayment={vi.fn()}
                onShiftAction={vi.fn()}
                t={t}
            />
        );

        fireEvent.change(screen.getByLabelText('cashier.readinessFilter'), { target: { value: 'Paid' } });
        fireEvent.click(screen.getByRole('button', { name: 'cashier.paidNurse' }));
        fireEvent.click(screen.getByRole('button', { name: 'cashier.paidTech' }));
        expect(onMoveQueue).toHaveBeenNthCalledWith(1, expect.objectContaining(items[2]), 'Prep Pending');
        expect(onMoveQueue).toHaveBeenNthCalledWith(2, expect.objectContaining(items[2]), 'Ready for Exam');
    });
});
