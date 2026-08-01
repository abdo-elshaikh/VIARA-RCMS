import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PaymentCollectionModal from '../PaymentCollectionModal';

vi.mock('../../ui/Modal', () => ({
    default: ({ children, footer, isOpen, title }) => isOpen ? <section aria-label={title}>{children}{footer}</section> : null
}));

vi.mock('../../ui/StatusPill', () => ({
    default: ({ status }) => <span>{status}</span>
}));

const t = (key, options) => options?.defaultValue || key;

const baseProps = {
    adjustedBalance: 120,
    canDiscount: true,
    currentShift: { shift_id: 'shift-1' },
    discountAmount: '0',
    discountReason: '',
    invoice: {
        invoice_number: 'INV-1',
        invoice_status: 'Pending',
        patient_name: 'Test Patient',
        mrn: 'MRN-1',
        balance_amount: 120
    },
    invoiceDetail: { payments: [] },
    isLoading: false,
    isLoadingInvoiceDetail: false,
    onAmountChange: vi.fn(),
    onClose: vi.fn(),
    onDiscountAmountChange: vi.fn(),
    onDiscountReasonChange: vi.fn(),
    onMethodChange: vi.fn(),
    onReferenceChange: vi.fn(),
    onSubmit: vi.fn((event) => event.preventDefault()),
    paymentAmount: '120',
    paymentInvalid: false,
    paymentMethod: 'Cash',
    paymentReference: '',
    remainingBalance: 0,
    t
};

describe('PaymentCollectionModal', () => {
    it('renders invoice context, payment controls, and submit action', () => {
        render(<PaymentCollectionModal {...baseProps} />);

        expect(screen.getByText('INV-1')).toBeInTheDocument();
        expect(screen.getByText('Test Patient')).toBeInTheDocument();
        expect(screen.getByLabelText('Amount to pay')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Confirm Payment' })).toBeEnabled();
    });

    it('routes quick amount and method changes through callbacks', () => {
        const onAmountChange = vi.fn();
        const onMethodChange = vi.fn();
        render(<PaymentCollectionModal {...baseProps} onAmountChange={onAmountChange} onMethodChange={onMethodChange} />);

        fireEvent.click(screen.getByRole('button', { name: 'Half' }));
        expect(onAmountChange).toHaveBeenCalledWith('60.00');

        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Card' } });
        expect(onMethodChange).toHaveBeenCalledWith('Card');
    });

    it('closes when cancel is clicked', () => {
        const onClose = vi.fn();
        render(<PaymentCollectionModal {...baseProps} onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
