// src/components/ui/__tests__/Scheduler.test.jsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Scheduler from '../Scheduler';

const mockT = (key, fallback) => {
    if (typeof fallback === 'object' && fallback !== null) {
        return fallback.defaultValue || key;
    }
    return fallback || key;
};

const mockAppointments = [
    {
        appointment_id: 'apt-1',
        patient_name: 'Ahmed Youssef',
        mrn: 'MRN-101',
        start_time: '2026-09-03T09:00:00',
        end_time: '2026-09-03T09:45:00',
        duration: 45,
        status: 'Scheduled',
        priority: 'Routine',
        machine_name: 'MRI Room 1',
        modality_type: 'MRI',
        exam_type_name: 'Brain MRI'
    },
    {
        appointment_id: 'apt-2',
        patient_name: 'Sara Karim',
        mrn: 'MRN-102',
        start_time: '2026-09-03T10:30:00',
        end_time: '2026-09-03T11:15:00',
        duration: 45,
        status: 'Arrived',
        priority: 'Urgent',
        machine_name: 'CT Room 2',
        modality_type: 'CT',
        exam_type_name: 'Chest CT'
    }
];

describe('Scheduler Component', () => {
    it('renders empty schedule state when no appointments provided', () => {
        render(
            <Scheduler
                appointments={[]}
                currentDate={new Date('2026-09-03T00:00:00')}
                t={mockT}
            />
        );
        expect(screen.getByText(/No appointments in this range/i)).toBeInTheDocument();
    });

    it('renders standalone header with navigation buttons when integrated={false}', () => {
        const onToday = vi.fn();
        const onPrevDate = vi.fn();
        const onNextDate = vi.fn();

        render(
            <Scheduler
                appointments={mockAppointments}
                currentDate={new Date('2026-09-03T00:00:00')}
                onToday={onToday}
                onPrevDate={onPrevDate}
                onNextDate={onNextDate}
                t={mockT}
                integrated={false}
            />
        );

        const todayBtn = screen.getByRole('button', { name: /today/i });
        expect(todayBtn).toBeInTheDocument();
        fireEvent.click(todayBtn);
        expect(onToday).toHaveBeenCalled();

        const prevBtn = screen.getByRole('button', { name: /previous/i });
        fireEvent.click(prevBtn);
        expect(onPrevDate).toHaveBeenCalled();

        const nextBtn = screen.getByRole('button', { name: /next/i });
        fireEvent.click(nextBtn);
        expect(onNextDate).toHaveBeenCalled();
    });

    it('renders integrated mode without duplicate date picker buttons', () => {
        render(
            <Scheduler
                appointments={mockAppointments}
                currentDate={new Date('2026-09-03T00:00:00')}
                t={mockT}
                integrated={true}
            />
        );

        // In integrated mode, standalone today/prev/next controls are hidden
        expect(screen.queryByRole('button', { name: /^today$/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^previous$/i })).not.toBeInTheDocument();

        // But stats and legend are rendered
        expect(screen.getAllByText(/Scheduled/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Arrived/i).length).toBeGreaterThan(0);
    });

    it('renders agenda view with appointments and triggers onSelectEvent on click', () => {
        const onSelectEvent = vi.fn();

        render(
            <Scheduler
                appointments={mockAppointments}
                currentDate={new Date('2026-09-03T00:00:00')}
                viewMode="agenda"
                onSelectEvent={onSelectEvent}
                t={mockT}
                integrated={true}
            />
        );

        expect(screen.getByText('Ahmed Youssef')).toBeInTheDocument();
        expect(screen.getByText('Sara Karim')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Ahmed Youssef'));
        expect(onSelectEvent).toHaveBeenCalledWith(mockAppointments[0]);
    });
});
