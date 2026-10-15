import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CashierQueueTab from '../CashierQueueTab';

vi.mock('react-redux', () => ({
    useSelector: (selector) => selector ? selector({ auth: { user: { user_id: 'user-1', role: 'Cashier', permissions: ['MANAGE_INVOICES', 'COLLECT_PAYMENTS'] } } }) : { user_id: 'user-1', role: 'Cashier' },
    useDispatch: () => vi.fn(),
}));

vi.mock('../../../store/api', () => ({
    useBroadcastPatientCallMutation: () => [vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({}) })],
}));

const t = (key, options) => options?.defaultValue || key;
const items = [
    { exam_id: 'e1', appointment_id: 'a1', patient_name: 'Amina Hassan', mrn: 'PAT-1', priority: 'Urgent', waiting_minutes: 40, exam_type_name: 'MRI Brain', queue_stage: 'Arrived' },
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

    it('shows and filters pending partial-payment exception requests without a duplicate action', () => {
        const partialItem = { ...items[0], queue_stage: 'Payment Pending' };
        const partialInvoice = {
            invoice_id: 'i1',
            appointment_id: partialItem.appointment_id,
            invoice_status: 'Partial',
            paid_amount: 100,
            balance_amount: 300,
        };

        render(
            <CashierQueueTab
                canCloseShift={false}
                canOpenShift
                currentShift={{ shift_id: 'shift-1', opened_at: '2026-07-06T08:00:00Z' }}
                invoices={[partialInvoice]}
                isLoadingShift={false}
                items={[partialItem]}
                locale="ar"
                onCreateInvoice={vi.fn()}
                onMoveQueue={vi.fn()}
                onOpenPayment={vi.fn()}
                onRequestPartialPaymentException={vi.fn()}
                onShiftAction={vi.fn()}
                partialPaymentExceptions={[{
                    exception_id: 'exception-1',
                    invoice_id: partialInvoice.invoice_id,
                    transaction_type: 'ClinicalQueueTransition',
                    status: 'Pending',
                    reason: 'Awaiting management review',
                    requested_at: '2026-07-06T08:05:00Z',
                    metadata: { targetStage: 'Ready for Exam' },
                }]}
                t={t}
            />
        );

        expect(screen.getByText('Pending review')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Request exception' })).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Filter by exception request status'), { target: { value: 'Pending' } });
        expect(screen.getByText('Amina Hassan')).toBeInTheDocument();
    });

    it('allows an approved exception to route a partially paid case from the cashier tab', () => {
        const onMoveQueue = vi.fn();
        const partialItem = { ...items[0], queue_stage: 'Payment Pending' };
        const partialInvoice = {
            invoice_id: 'i1',
            appointment_id: partialItem.appointment_id,
            invoice_status: 'Partial',
            paid_amount: 100,
            balance_amount: 300,
        };

        render(
            <CashierQueueTab
                canCloseShift={false}
                canOpenShift
                currentShift={{ shift_id: 'shift-1', opened_at: '2026-07-06T08:00:00Z' }}
                invoices={[partialInvoice]}
                isLoadingShift={false}
                items={[partialItem]}
                locale="en"
                onCreateInvoice={vi.fn()}
                onMoveQueue={onMoveQueue}
                onOpenPayment={vi.fn()}
                onRequestPartialPaymentException={vi.fn()}
                onShiftAction={vi.fn()}
                partialPaymentExceptions={[{
                    exception_id: 'exception-2',
                    invoice_id: partialInvoice.invoice_id,
                    transaction_type: 'ClinicalQueueTransition',
                    status: 'Approved',
                    requested_at: '2026-07-06T08:05:00Z',
                    expires_at: '2099-07-06T08:05:00Z',
                    metadata: { targetStage: 'Ready for Exam' },
                }]}
                t={t}
            />
        );

        expect(screen.getByText('Exception approved')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'cashier.paidTech' }));
        expect(onMoveQueue).toHaveBeenCalledWith(
            expect.objectContaining({ exam_id: partialItem.exam_id }),
            'Ready for Exam'
        );
    });

    it('renders completed payments in the shift receipts ledger sub-tab', () => {
        const mockShiftWithPayments = {
            shift_id: 'shift-1',
            collected_amount: 750,
            payment_count: 1,
            opened_at: '2026-07-06T08:00:00Z',
            payments: [
                {
                    payment_id: 'p-1',
                    amount: 750,
                    method: 'Cash',
                    invoice_number: 'INV-2026-001',
                    patient_name: 'Tariq Shafik',
                    mrn: 'MRN-789',
                    created_at: '2026-07-06T09:30:00Z'
                }
            ]
        };

        render(
            <CashierQueueTab
                canCloseShift
                canOpenShift={false}
                currentShift={mockShiftWithPayments}
                invoices={[]}
                items={[]}
                locale="ar"
                t={t}
            />
        );

        // Click ledger sub-tab
        const ledgerTabBtn = screen.getByRole('button', { name: /الإيصالات/ });
        fireEvent.click(ledgerTabBtn);

        expect(screen.getByText('Tariq Shafik')).toBeInTheDocument();
        expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
        expect(screen.getByText('MRN-789')).toBeInTheDocument();
    });

    it('switches contrast warning to collect payment once supply is consumed', () => {
        const contrastItem = {
            exam_id: 'e-contrast',
            appointment_id: 'a-contrast',
            patient_name: 'Tariq Contrast',
            requires_contrast: true,
            has_supplies: false,
            priority: 'Routine',
            waiting_minutes: 15,
            exam_type_name: 'CT Abdomen with Contrast'
        };
        const invoice = {
            invoice_id: 'inv-c',
            appointment_id: 'a-contrast',
            invoice_status: 'Pending',
            balance_amount: 500
        };

        const { rerender } = render(
            <CashierQueueTab
                canAppendSupplies
                currentShift={{ shift_id: 'shift-1', opened_at: '2026-07-06T08:00:00Z' }}
                invoices={[invoice]}
                items={[contrastItem]}
                stockMovements={[]}
                locale="ar"
                t={t}
            />
        );

        // Initially requires contrast supply
        expect(screen.getByText('إضافة الصبغة أولاً')).toBeInTheDocument();

        // Rerender with stockMovement for this exam or supplies attached
        rerender(
            <CashierQueueTab
                canAppendSupplies
                currentShift={{ shift_id: 'shift-1', opened_at: '2026-07-06T08:00:00Z' }}
                invoices={[invoice]}
                items={[{ ...contrastItem, has_supplies: true }]}
                stockMovements={[{ reference_type: 'Exam', reference_id: 'e-contrast', movement_id: 'sm-1' }]}
                locale="ar"
                t={t}
            />
        );

        expect(screen.getByText('billing.collectPayment')).toBeInTheDocument();
        expect(screen.queryByText('إضافة الصبغة أولاً')).not.toBeInTheDocument();
    });

    it('applies workstation room, device, and emergency scopes to the cashier queue', () => {
        const scopedItems = [
            { ...items[0], priority: 'Normal', room_id: 'room-1', modality_id: 'mod-1' },
            { ...items[1], room_id: 'room-2', modality_id: 'mod-2', priority: 'Routine' },
            { ...items[2], room_id: 'room-2', modality_id: 'mod-3', priority: 'Emergency' },
        ];
        const { rerender } = render(
            <CashierQueueTab
                items={scopedItems}
                invoices={[]}
                locale="en"
                receptionScope="rooms"
                selectedRooms={['room-1']}
                t={t}
            />
        );

        expect(screen.getByText('Amina Hassan')).toBeInTheDocument();
        expect(screen.queryByText('Omar Saleh')).not.toBeInTheDocument();

        rerender(
            <CashierQueueTab
                items={scopedItems}
                invoices={[]}
                locale="en"
                receptionScope="modalities"
                selectedModalities={['mod-2']}
                t={t}
            />
        );

        expect(screen.getByText('Omar Saleh')).toBeInTheDocument();
        expect(screen.queryByText('Amina Hassan')).not.toBeInTheDocument();

        rerender(
            <CashierQueueTab
                items={scopedItems}
                invoices={[]}
                locale="en"
                receptionScope="emergency"
                t={t}
            />
        );

        expect(screen.getByText('Lina Ali')).toBeInTheDocument();
        expect(screen.queryByText('Amina Hassan')).not.toBeInTheDocument();
        expect(screen.queryByText('Omar Saleh')).not.toBeInTheDocument();
    });
});
