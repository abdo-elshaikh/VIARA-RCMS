import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SalarySimulatorModal } from '../SalarySimulatorModal';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, options) => {
            if (options?.defaultValue) return options.defaultValue;
            return key;
        },
        i18n: {
            language: 'ar',
            dir: () => 'rtl'
        }
    })
}));

describe('SalarySimulatorModal', () => {
    const mockStaff = [
        { user_id: 'usr-1', full_name: 'Dr. Sarah Ahmed', role: 'Radiologist' },
        { user_id: 'usr-2', full_name: 'Ahmed Youssef', role: 'Technician' }
    ];

    const mockComp = [
        { user_id: 'usr-1', salary_type: 'Monthly', base_salary: 20000, standard_days_per_period: 22, standard_hours_per_day: 8 },
        { user_id: 'usr-2', salary_type: 'Hourly', hourly_rate: 100, standard_days_per_period: 22, standard_hours_per_day: 8 }
    ];

    it('does not render when isOpen is false', () => {
        const { container } = render(
            <SalarySimulatorModal
                isOpen={false}
                onClose={vi.fn()}
                staff={mockStaff}
                compensationProfiles={mockComp}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders and simulates calculations when open', () => {
        render(
            <SalarySimulatorModal
                isOpen={true}
                onClose={vi.fn()}
                staff={mockStaff}
                compensationProfiles={mockComp}
                currency="EGP"
            />
        );

        expect(screen.getByText(/حاسبة ومحاكي الرواتب/i)).toBeDefined();
        expect(screen.getByDisplayValue('15000')).toBeDefined();
    });

    it('updates base salary when staff member is selected', () => {
        render(
            <SalarySimulatorModal
                isOpen={true}
                onClose={vi.fn()}
                staff={mockStaff}
                compensationProfiles={mockComp}
                currency="EGP"
            />
        );

        const select = screen.getAllByRole('combobox')[0];
        fireEvent.change(select, { target: { value: 'usr-1' } });

        expect(screen.getByDisplayValue('20000')).toBeDefined();
    });
});
