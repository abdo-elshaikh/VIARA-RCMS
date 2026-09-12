import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReceptionWorkstationBar from '../ReceptionWorkstationBar';

describe('ReceptionWorkstationBar', () => {
    const mockRooms = [
        { room: 'Suite 101 (Main)', label: 'جناح فحص Suite 101', type: 'Imaging', machines: ['MRI-01 Siemens 3T'] },
        { room: 'Room 401', label: 'جناح فحص Room 401', type: 'Imaging', machines: ['US-01 GE Voluson'] },
    ];

    const mockModalities = [
        { id: 'm1', name: 'MRI-01 Siemens Magnetom Skyra 3T', type: 'MRI', roomNumber: 'Suite 101 (Main)' },
        { id: 'm2', name: 'CT-01 Philips iCT 256-Slice Dual Energy', type: 'CT', roomNumber: 'Suite 201 (Main)' },
        { id: 'm3', name: 'US-01 GE Voluson E10 Expert 4D/5D', type: 'Ultrasound', roomNumber: 'Room 401' },
    ];

    it('renders current workstation desk, scope tabs, and session info', () => {
        render(
            <ReceptionWorkstationBar
                activeDesk="شباك 1 - الاستقبال العام"
                counts={{ total: 15, mine: 4, unclaimed: 2, inExam: 1 }}
                availableRooms={mockRooms}
                availableModalities={mockModalities}
                currentUser={{ name: 'Ahmed Reception' }}
            />
        );

        expect(screen.getByText('شباك 1 - الاستقبال العام')).toBeInTheDocument();
        expect(screen.getByText(/كل الحالات|All Cases/)).toBeInTheDocument();
        expect(screen.getByText('15')).toBeInTheDocument();
        expect(screen.getByText(/مهامي|My Tasks/)).toBeInTheDocument();
        expect(screen.getByText('4')).toBeInTheDocument();
        expect(screen.getByText(/غير مستلمة|Unclaimed/)).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText(/فحص|Exam/)).toBeInTheDocument();
    });

    it('switches workstation desk when selecting from preset menu', () => {
        const onDeskChange = vi.fn();
        render(
            <ReceptionWorkstationBar
                activeDesk="شباك 1 - الاستقبال العام"
                onDeskChange={onDeskChange}
                availableRooms={mockRooms}
                availableModalities={mockModalities}
            />
        );

        const deskBtn = screen.getByRole('button', { name: /شباك 1 - الاستقبال العام/ });
        fireEvent.click(deskBtn);

        expect(screen.getByText('شباك 2 - رنين ومقطعية')).toBeInTheDocument();
        fireEvent.click(screen.getByText('شباك 2 - رنين ومقطعية'));

        expect(onDeskChange).toHaveBeenCalledWith('شباك 2 - رنين ومقطعية');
    });

    it('opens modality filter dropdown and toggles device selection', () => {
        const onToggleModality = vi.fn();
        render(
            <ReceptionWorkstationBar
                availableRooms={mockRooms}
                availableModalities={mockModalities}
                selectedModalities={[]}
                onToggleModality={onToggleModality}
            />
        );

        const modalityFilterBtn = screen.getByRole('button', { name: /By Device/ });
        fireEvent.click(modalityFilterBtn);

        expect(screen.getAllByText(/Devices/).length).toBeGreaterThan(0);
        expect(screen.getByText('MRI-01 Siemens Magnetom Skyra 3T')).toBeInTheDocument();
        expect(screen.getByText('CT-01 Philips iCT 256-Slice Dual Energy')).toBeInTheDocument();

        fireEvent.click(screen.getByText('MRI-01 Siemens Magnetom Skyra 3T'));
        expect(onToggleModality).toHaveBeenCalledWith('MRI-01 Siemens Magnetom Skyra 3T');
    });

    it('opens room filter dropdown and toggles room selection', () => {
        const onToggleRoom = vi.fn();
        render(
            <ReceptionWorkstationBar
                availableRooms={mockRooms}
                availableModalities={mockModalities}
                selectedRooms={[]}
                onToggleRoom={onToggleRoom}
            />
        );

        const roomFilterBtn = screen.getByRole('button', { name: /Rooms/ });
        fireEvent.click(roomFilterBtn);

        expect(screen.getAllByText(/Rooms/).length).toBeGreaterThan(0);
        expect(screen.getByText(/جناح فحص Suite 101/)).toBeInTheDocument();

        fireEvent.click(screen.getByText(/جناح فحص Suite 101/));
        expect(onToggleRoom).toHaveBeenCalledWith('Suite 101 (Main)');
    });

    it('renders active filter ribbon and supports clearing filters', () => {
        const onClearAll = vi.fn();
        render(
            <ReceptionWorkstationBar
                availableRooms={mockRooms}
                availableModalities={mockModalities}
                selectedRooms={['Suite 101 (Main)']}
                selectedModalities={['MRI-01 Siemens Magnetom Skyra 3T']}
                onClearAll={onClearAll}
            />
        );

        expect(screen.getByText(/الفلاتر النشطة|Active Filters/)).toBeInTheDocument();
        expect(screen.getByText('Suite 101 (Main)')).toBeInTheDocument();
        expect(screen.getByText('MRI-01 Siemens Magnetom Skyra 3T')).toBeInTheDocument();

        const resetBtn = screen.getByRole('button', { name: /مسح كافة الفلاتر السريرية|Reset All Filters/ });
        fireEvent.click(resetBtn);
        expect(onClearAll).toHaveBeenCalled();
    });

    it('triggers TV display board modal on click', () => {
        const onOpenDisplayBoard = vi.fn();
        render(
            <ReceptionWorkstationBar
                onOpenDisplayBoard={onOpenDisplayBoard}
            />
        );

        const tvBtn = screen.getByRole('button', { name: /شاشة الانتظار|TV Display Board/ });
        fireEvent.click(tvBtn);
        expect(onOpenDisplayBoard).toHaveBeenCalled();
    });

    it('shows the active reception shift and exposes the close action', () => {
        const onCloseShift = vi.fn();
        render(
            <ReceptionWorkstationBar
                activeDesk="شباك 1 - الاستقبال العام"
                receptionShift={{
                    session_id: 'shift-1',
                    started_at: new Date(Date.now() - 15 * 60_000).toISOString(),
                    status: 'Open',
                }}
                workstationLocked
                onCloseShift={onCloseShift}
            />
        );

        expect(screen.getByRole('button', { name: /Close shift|تقفيل الوردية/ })).toBeInTheDocument();
        const closeButton = screen.getByRole('button', { name: /Close shift|تقفيل الوردية/ });
        fireEvent.click(closeButton);
        expect(onCloseShift).toHaveBeenCalled();
    });
});
