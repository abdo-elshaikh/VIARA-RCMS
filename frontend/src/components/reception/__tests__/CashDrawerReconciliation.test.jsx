import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import CashDrawerReconciliation from '../CashDrawerReconciliation';
import authReducer from '../../../store/authSlice';

const createMockStore = (userRole = 'Cashier', permissions = []) => {
    return configureStore({
        reducer: {
            auth: authReducer,
        },
        preloadedState: {
            auth: {
                user: {
                    id: 101,
                    name: 'Test Cashier',
                    role: userRole,
                    permissions,
                },
                token: 'mock-token',
                isAuthenticated: true,
            },
        },
    });
};

const mockT = (key, optionsOrDefault) => {
    if (typeof optionsOrDefault === 'string') return optionsOrDefault;
    if (optionsOrDefault && typeof optionsOrDefault === 'object' && optionsOrDefault.defaultValue) {
        return optionsOrDefault.defaultValue;
    }
    return key;
};

describe('CashDrawerReconciliation (True Blind Count)', () => {
    // expected = opening_balance (500) + payment_totals.Cash (750) = 1250.00
    const mockShift = {
        shift_id: 'shift-101',
        cashier_id: 101,
        status: 'Open',
        opening_balance: 500,
        payment_totals: { Cash: 750 },
        collected_amount: 750,
        transaction_count: 5,
    };

    it('enforces blind count by hiding expected and collected amounts for regular cashiers during input', () => {
        const store = createMockStore('Cashier', []);
        render(
            <Provider store={store}>
                <CashDrawerReconciliation
                    currentShift={mockShift}
                    onReconcile={vi.fn()}
                    t={mockT}
                />
            </Provider>
        );

        // Expected amount must stay masked behind the blind count lock indicator
        expect(screen.queryByText('1250.00')).not.toBeInTheDocument();
        expect(screen.getAllByText('محمي').length).toBeGreaterThanOrEqual(1);

        // Regular cashier should not see supervisor reveal toggle
        expect(screen.queryByRole('button', { name: /كشف المتوقع/ })).not.toBeInTheDocument();
    });

    it('allows supervisors to toggle visibility of expected amount', () => {
        const store = createMockStore('Admin', ['RECONCILE_SHIFTS', 'APPROVE_SHIFT_VARIANCE']);
        render(
            <Provider store={store}>
                <CashDrawerReconciliation
                    currentShift={mockShift}
                    onReconcile={vi.fn()}
                    t={mockT}
                />
            </Provider>
        );

        // Supervisor toggle button should be present
        const revealBtn = screen.getByRole('button', { name: /كشف المتوقع/ });
        expect(revealBtn).toBeInTheDocument();

        // Clicking reveal should show expected cash
        fireEvent.click(revealBtn);
        expect(screen.getAllByText('1250.00').length).toBeGreaterThanOrEqual(1);
    });

    it('transitions to review step upon entering count and reveals reconciliation details', async () => {
        const store = createMockStore('Cashier', []);
        const onReconcile = vi.fn().mockResolvedValue(true);

        render(
            <Provider store={store}>
                <CashDrawerReconciliation
                    currentShift={mockShift}
                    onReconcile={onReconcile}
                    t={mockT}
                />
            </Provider>
        );

        const input = screen.getByPlaceholderText('0.00');
        fireEvent.change(input, { target: { value: '1250' } });

        fireEvent.click(screen.getByRole('button', { name: /مراجعة ومطابقة الجرد/ }));

        // Now in review mode: expected and counted should be visible
        await waitFor(() => {
            expect(screen.getByText('الدرج متطابق')).toBeInTheDocument();
            expect(screen.getAllByText('1250.00').length).toBeGreaterThanOrEqual(1);
        });

        fireEvent.click(screen.getByRole('button', { name: /تأكيد المطابقة/ }));

        await waitFor(() => {
            expect(onReconcile).toHaveBeenCalledWith(expect.objectContaining({
                countedCash: 1250,
                expectedCash: 1250,
                variance: 0,
            }));
        });
    });

    it('detects variance and allows entering variance notes', async () => {
        const store = createMockStore('Cashier', []);
        const onReconcile = vi.fn().mockResolvedValue(true);

        render(
            <Provider store={store}>
                <CashDrawerReconciliation
                    currentShift={mockShift}
                    onReconcile={onReconcile}
                    t={mockT}
                />
            </Provider>
        );

        const input = screen.getByPlaceholderText('0.00');
        fireEvent.change(input, { target: { value: '1200' } }); // 50 deficit

        fireEvent.click(screen.getByRole('button', { name: /مراجعة ومطابقة الجرد/ }));

        await waitFor(() => {
            expect(screen.getByText('تم اكتشاف فرق')).toBeInTheDocument();
        });

        const notesField = screen.getByPlaceholderText(/اذكر سبب الفرق/);
        fireEvent.change(notesField, { target: { value: 'عجز 50 تم توثيقه' } });

        fireEvent.click(screen.getByRole('button', { name: /تأكيد المطابقة/ }));

        await waitFor(() => {
            expect(onReconcile).toHaveBeenCalledWith(expect.objectContaining({
                countedCash: 1200,
                expectedCash: 1250,
                variance: -50,
                notes: 'عجز 50 تم توثيقه',
            }));
        });
    });
});