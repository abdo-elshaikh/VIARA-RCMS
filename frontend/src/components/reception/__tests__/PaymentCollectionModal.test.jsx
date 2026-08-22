import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PaymentCollectionModal from '../PaymentCollectionModal';

let language = 'en';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ i18n: { language, resolvedLanguage: language } })
}));

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
    beforeEach(() => {
        language = 'en';
    });

    it('renders invoice context, payment controls, and submit action', () => {
        render(<PaymentCollectionModal {...baseProps} />);

        expect(screen.getByText('INV-1')).toBeInTheDocument();
        expect(screen.getByText('Test Patient')).toBeInTheDocument();
        expect(screen.getByLabelText('Amount to pay')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Confirm Payment' })).toBeEnabled();
        expect(screen.getByText(/EGP\s+120\.00/)).toBeInTheDocument();
        expect(screen.getByLabelText('Amount to pay')).toHaveValue(120);
    });

    it('formats visible amounts and input currency for the invoice currency', () => {
        render(<PaymentCollectionModal
            {...baseProps}
            adjustedBalance={1234.5}
            invoice={{ ...baseProps.invoice, currency_code: 'USD' }}
            paymentAmount="1234.5"
            remainingBalance={34.5}
        />);

        expect(screen.getByText('$1,234.50')).toBeInTheDocument();
        expect(screen.getByText('Remaining: $34.50')).toBeInTheDocument();
        expect(screen.getByText('USD')).toBeInTheDocument();
        expect(screen.getByLabelText('Amount to pay')).toHaveValue(1234.5);
    });

    it('uses Arabic currency formatting for balances and payment history', () => {
        language = 'ar';
        render(<PaymentCollectionModal
            {...baseProps}
            invoiceDetail={{ payments: [{ payment_id: 'payment-1', amount: 20, method: 'Cash', created_at: '2026-08-04T10:00:00Z' }] }}
        />);

        fireEvent.click(screen.getByRole('button', { name: 'Previous Payments' }));

        expect(screen.getByText(/١٢٠٫٠٠/)).toBeInTheDocument();
        expect(screen.getByText((content, element) => element?.tagName === 'P' && /٢٠٫٠٠/.test(content))).toBeInTheDocument();
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

    it('does not auto-attest insurance verification requirements', () => {
        const { container } = render(<PaymentCollectionModal
            {...baseProps}
            invoice={{
                ...baseProps.invoice,
                insurance_covered_amount: 80,
                patient_payable_amount: 40,
                provider_name: 'Health Plan',
                policy_number: 'POL-1',
                member_number: 'MEM-1'
            }}
        />);

        expect(JSON.parse(container.querySelector('input[name="verificationChecklist"]').value)).toEqual({});
    });

    it('closes when cancel is clicked', () => {
        const onClose = vi.fn();
        render(<PaymentCollectionModal {...baseProps} onClose={onClose} />);

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not render when isOpen is false', () => {
        render(<PaymentCollectionModal {...baseProps} isOpen={false} />);

        expect(screen.queryByText('INV-1')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Confirm Payment' })).not.toBeInTheDocument();
    });

    it('does not render when invoice is null', () => {
        render(<PaymentCollectionModal {...baseProps} invoice={null} isOpen={false} />);

        expect(screen.queryByText('INV-1')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Confirm Payment' })).not.toBeInTheDocument();
    });
});
