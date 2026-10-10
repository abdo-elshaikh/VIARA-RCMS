import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExpenseManager from '../ExpenseManager';

const categoryId = '11111111-1111-4111-8111-111111111111';
const alternateCategoryId = '22222222-2222-4222-8222-222222222222';
const supplierId = '33333333-3333-4333-8333-333333333333';

const mocks = vi.hoisted(() => ({
    createExpense: vi.fn(() => ({ unwrap: () => Promise.resolve({}) })),
    updateExpense: vi.fn(() => ({ unwrap: () => Promise.resolve({}) })),
    deleteExpense: vi.fn(() => ({ unwrap: () => Promise.resolve({}) })),
    categoryStatus: {},
    expenses: [{
        expense_id: 'expense-1',
        category_id: '11111111-1111-4111-8111-111111111111',
        category_name: 'Supplies',
        supplier_id: null,
        amount: '100.00',
        tax_amount: '14.00',
        expense_date: '2026-10-01',
        payment_method: 'Cash',
        reference_number: 'REF-01',
        notes: 'Initial note',
        reversed_at: null,
    }],
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key) => key,
        i18n: { language: 'en', dir: () => 'ltr' },
    }),
}));

vi.mock('react-hot-toast', () => ({
    default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../store/api', () => ({
    useCreateExpenseMutation: () => [mocks.createExpense, { isLoading: false }],
    useUpdateExpenseMutation: () => [mocks.updateExpense, { isLoading: false }],
    useDeleteExpenseMutation: () => [mocks.deleteExpense, { isLoading: false }],
    useGetExpenseCategoriesQuery: () => ({ data: [
        { category_id: '11111111-1111-4111-8111-111111111111', name: 'Supplies' },
        { category_id: '22222222-2222-4222-8222-222222222222', name: 'Travel' },
    ], ...mocks.categoryStatus }),
    useGetExpensesQuery: () => ({ data: mocks.expenses, isLoading: false, isError: false }),
    useGetSuppliersQuery: () => ({ data: [{ supplier_id: '33333333-3333-4333-8333-333333333333', name: 'Northwind' }] }),
}));

describe('ExpenseManager add and edit modal', () => {
    it('retries an unchanged expense using the same idempotency key after a network failure', async () => {
        mocks.createExpense.mockReturnValueOnce({ unwrap: () => Promise.reject(new Error('Synthetic lost response')) });
        render(<ExpenseManager />);
        fireEvent.click(screen.getByRole('button', { name: 'finance.expenses.addExpense' }));
        fireEvent.change(screen.getByLabelText('finance.expenses.category'), { target: { value: categoryId } });
        fireEvent.change(screen.getByLabelText('finance.common.amount'), { target: { value: '100' } });
        fireEvent.click(screen.getByRole('button', { name: 'finance.expenses.save' }));
        await waitFor(() => expect(mocks.createExpense).toHaveBeenCalledTimes(1));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'finance.expenses.save' }));
        await waitFor(() => expect(mocks.createExpense).toHaveBeenCalledTimes(2));
        expect(mocks.createExpense.mock.calls[1][0]).toEqual(mocks.createExpense.mock.calls[0][0]);
    });
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.categoryStatus = {};
    });

    it('explains unavailable categories and disables saving without blocking cancel', async () => {
        const retry = vi.fn();
        mocks.categoryStatus = { isError: true, refetch: retry };
        render(<ExpenseManager />);
        fireEvent.click(screen.getByRole('button', { name: 'finance.expenses.addExpense' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Expense categories could not be loaded');
        expect(screen.getByRole('button', { name: 'finance.expenses.save' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'finance.common.cancel' })).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(retry).toHaveBeenCalledOnce();
    });

    it('creates a new expense from a modal', async () => {
        render(<ExpenseManager />);

        fireEvent.click(screen.getByRole('button', { name: 'finance.expenses.addExpense' }));
        expect(await screen.findByRole('dialog', { name: 'finance.expenses.newTitle' })).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('finance.expenses.category'), { target: { value: categoryId } });
        fireEvent.change(screen.getByLabelText('finance.common.amount'), { target: { value: '250' } });
        fireEvent.click(screen.getByRole('button', { name: 'finance.expenses.save' }));

        await waitFor(() => expect(mocks.createExpense).toHaveBeenCalledOnce());
        expect(mocks.createExpense.mock.calls[0][0]).toMatchObject({ categoryId, amount: 250, taxAmount: 0 });
        expect(mocks.createExpense.mock.calls[0][0].idempotencyKey).toBeTruthy();
    });

    it('edits descriptive fields while keeping posted financial values immutable', async () => {
        render(<ExpenseManager />);

        fireEvent.click(screen.getAllByRole('button', { name: 'finance.expenses.editExpense' })[0]);
        expect(await screen.findByRole('dialog', { name: 'finance.expenses.editTitle' })).toBeInTheDocument();
        expect(screen.getByLabelText('finance.common.amount')).toBeDisabled();
        expect(screen.getByLabelText('finance.expenses.includedTax')).toBeDisabled();
        expect(screen.getByLabelText('finance.expenses.expenseDate')).toBeDisabled();
        expect(screen.getByLabelText('finance.expenses.paymentMethod')).toBeDisabled();
        expect(screen.getByLabelText('finance.expenses.category')).toBeEnabled();
        expect(screen.getByLabelText('finance.expenses.supplier')).toBeEnabled();

        fireEvent.change(screen.getByLabelText('finance.expenses.category'), { target: { value: alternateCategoryId } });
        fireEvent.change(screen.getByLabelText('finance.expenses.supplier'), { target: { value: supplierId } });
        fireEvent.change(screen.getByLabelText('finance.expenses.notes'), { target: { value: 'Updated note' } });
        fireEvent.click(screen.getByRole('button', { name: 'finance.expenses.update' }));

        await waitFor(() => expect(mocks.updateExpense).toHaveBeenCalledOnce());
        expect(mocks.updateExpense).toHaveBeenCalledWith({
            id: 'expense-1',
            categoryId: alternateCategoryId,
            supplierId,
            referenceNumber: 'REF-01',
            notes: 'Updated note',
        });
    });
});
