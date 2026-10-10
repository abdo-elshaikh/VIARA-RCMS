import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePaymentFlow } from '../usePaymentFlow';

const mocks = vi.hoisted(() => ({
    collectPayment: vi.fn(),
    collectPaymentUnwrap: vi.fn(),
    getInvoice: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    transitionQueue: vi.fn(),
    transitionQueueUnwrap: vi.fn(),
}));

vi.mock('../../store/api', () => ({
    useCollectInvoicePaymentMutation: () => [
        mocks.collectPayment,
        { isLoading: false },
    ],
    useGetInvoiceQuery: (...args) => mocks.getInvoice(...args),
    useTransitionQueueMutation: () => [mocks.transitionQueue],
}));

vi.mock('react-hot-toast', () => ({
    default: {
        error: mocks.toastError,
        success: mocks.toastSuccess,
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, options = {}) => options.defaultValue || key,
    }),
}));

describe('usePaymentFlow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        let uuidSequence = 0;
        Object.defineProperty(globalThis, 'crypto', {
            configurable: true,
            value: {
                ...(globalThis.crypto || {}),
                randomUUID: vi.fn(() => `payment-test-${uuidSequence += 1}`),
            },
        });
        mocks.collectPayment.mockReturnValue({ unwrap: mocks.collectPaymentUnwrap });
        mocks.collectPaymentUnwrap.mockResolvedValue({ invoice: { invoice_status: 'Paid' } });
        mocks.getInvoice.mockReturnValue({ data: undefined, isFetching: false });
        mocks.transitionQueue.mockReturnValue({ unwrap: mocks.transitionQueueUnwrap });
        mocks.transitionQueueUnwrap.mockRejectedValue(new Error('Queue transition failed'));
    });

    it('closes the payment modal after payment succeeds even when queue movement fails', async () => {
        const invoice = {
            appointment_id: 'appt-1',
            balance_amount: 100,
            discount_amount: 0,
            exam_id: 'exam-1',
            insurance_covered_amount: 0,
            invoice_id: 'invoice-1',
            paid_amount: 0,
            refunded_amount: 0,
            subtotal_amount: 100,
            tax_rate: 0,
        };
        const queueItems = [{
            appointment_id: 'appt-1',
            exam_id: 'exam-1',
            queue_stage: 'Payment Pending',
        }];
        const { result } = renderHook(() => usePaymentFlow({
            currentShift: { shift_id: 'shift-1' },
            queueItems,
            canManageQueue: true,
        }));

        act(() => {
            result.current.openPayment(invoice);
        });
        await waitFor(() => {
            expect(result.current.selectedInvoice).toEqual(invoice);
        });

        await act(async () => {
            await result.current.handleConfirmPayment({ preventDefault: vi.fn() });
        });

        expect(mocks.collectPayment).toHaveBeenCalledWith(expect.objectContaining({
            amount: 100,
            id: 'invoice-1',
            method: 'Cash',
        }));
        expect(mocks.transitionQueue).toHaveBeenCalledWith({
            examId: 'exam-1',
            toStage: 'Ready for Exam',
        });
        expect(result.current.selectedInvoice).toBeNull();
        expect(result.current.paymentModalProps.invoice).toBeNull();
        expect(result.current.paymentModalProps.isOpen).toBe(false);
        expect(mocks.toastError).toHaveBeenCalledWith(
            'Payment collected, but queue movement failed. Please move the patient manually. Queue transition failed'
        );
    });

    it('clears activeInvoice and modal isOpen when closePayment is invoked even if query cache persists', async () => {
        const invoice = {
            invoice_id: 'invoice-1',
            balance_amount: 250,
        };
        // Mock query retaining cached data when skipped
        mocks.getInvoice.mockReturnValue({
            data: { invoice_id: 'invoice-1', balance_amount: 250, items: [] },
            isFetching: false,
        });

        const { result } = renderHook(() => usePaymentFlow({
            currentShift: { shift_id: 'shift-1' },
            queueItems: [],
            canManageQueue: true,
        }));

        act(() => {
            result.current.openPayment(invoice);
        });

        expect(result.current.selectedInvoice).toEqual(invoice);
        expect(result.current.paymentModalProps.isOpen).toBe(true);
        expect(result.current.paymentModalProps.invoice).toBeDefined();

        act(() => {
            result.current.closePayment();
        });

        expect(result.current.selectedInvoice).toBeNull();
        expect(result.current.paymentModalProps.isOpen).toBe(false);
        expect(result.current.paymentModalProps.invoice).toBeNull();
        expect(result.current.paymentAmount).toBe('');
    });

    it('does not advance the queue when the server reports a partial invoice', async () => {
        mocks.collectPaymentUnwrap.mockResolvedValue({ invoice: { invoice_status: 'Partial' } });
        const invoice = {
            appointment_id: 'appt-1',
            balance_amount: 100,
            exam_id: 'exam-1',
            invoice_id: 'invoice-1',
            subtotal_amount: 100,
            tax_rate: 0,
        };
        const { result } = renderHook(() => usePaymentFlow({
            currentShift: { shift_id: 'shift-1' },
            queueItems: [{ appointment_id: 'appt-1', exam_id: 'exam-1', queue_stage: 'Payment Pending' }],
            canManageQueue: true,
        }));

        act(() => result.current.openPayment(invoice));
        await act(async () => {
            await result.current.handleConfirmPayment({ preventDefault: vi.fn() });
        });

        expect(mocks.transitionQueue).not.toHaveBeenCalled();
        expect(result.current.selectedInvoice).toBeNull();
    });
});
