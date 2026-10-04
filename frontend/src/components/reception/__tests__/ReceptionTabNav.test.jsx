import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReceptionTabNav from '../ReceptionTabNav';

const t = (key) => key;

describe('ReceptionTabNav', () => {
    it('exposes tab semantics, selection state, and cashier count', () => {
        const onTabChange = vi.fn();
        const tabs = [
            { id: 'schedule', label: 'Schedule' },
            { id: 'cashier', label: 'Cashier' },
        ];

        render(
            <ReceptionTabNav
                activeTab="schedule"
                cashierPending={3}
                onTabChange={onTabChange}
                tabs={tabs}
                t={t}
            />
        );

        expect(screen.getByRole('tablist')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Schedule' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: /Cashier 3/ })).toHaveAttribute('aria-selected', 'false');
        expect(screen.getByRole('tab', { name: /Cashier 3/ })).toHaveAttribute('aria-controls', 'reception-panel-cashier');

        fireEvent.click(screen.getByRole('tab', { name: /Cashier 3/ }));
        expect(onTabChange).toHaveBeenCalledWith('cashier');
    });

    it('renders scheduleCount badge when provided', () => {
        const tabs = [
            { id: 'schedule', label: 'Schedule' },
        ];

        render(
            <ReceptionTabNav
                activeTab="schedule"
                scheduleCount={8}
                onTabChange={vi.fn()}
                tabs={tabs}
                t={t}
            />
        );

        expect(screen.getByRole('tab', { name: /Schedule 8/ })).toBeInTheDocument();
    });

    it('moves selection with arrow keys and keeps only the active tab in the tab order', () => {
        const onTabChange = vi.fn();
        const tabs = [
            { id: 'schedule', label: 'Schedule' },
            { id: 'patients', label: 'Patients' },
            { id: 'cashier', label: 'Cashier' },
        ];

        render(
            <ReceptionTabNav
                activeTab="schedule"
                cashierPending={0}
                onTabChange={onTabChange}
                tabs={tabs}
                t={t}
            />
        );

        const schedule = screen.getByRole('tab', { name: 'Schedule' });
        const patients = screen.getByRole('tab', { name: 'Patients' });
        expect(schedule).toHaveAttribute('tabindex', '0');
        expect(patients).toHaveAttribute('tabindex', '-1');

        schedule.focus();
        fireEvent.keyDown(schedule, { key: 'ArrowRight' });
        expect(patients).toHaveFocus();
        expect(onTabChange).toHaveBeenCalledWith('patients');
    });
});
