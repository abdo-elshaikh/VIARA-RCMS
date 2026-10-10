import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';
import EquipmentWorkstationMapping from '../EquipmentWorkstationMapping';

let currentUser;

const mockRooms = [
    { room_id: 'r1', name: 'غرفة الرنين 1', room_number: '101' },
    { room_id: 'r2', name: 'غرفة المقطعية 2', room_number: '102' }
];

const mockMachines = [
    { modality_id: 'm1', name: 'MRI 3T Magnetom', type: 'MRI' },
    { modality_id: 'm2', name: 'CT Somatom Force', type: 'CT' }
];

const mockCenterSettings = {
    workstation_presets: [
        { id: 'ws1', label: 'شباك 1 - الاستقبال العام', icon: '🖥️', descAr: 'استقبال شامل', descEn: 'General intake', roomIds: ['r1'], modalityIds: [], scope: 'rooms' },
        { id: 'ws2', label: 'شباك 2 - رنين ومقطعية', icon: '🧲', descAr: 'رنين ومقطعية', descEn: 'MRI & CT', roomIds: [], modalityIds: ['MRI 3T Magnetom'], scope: 'modalities' }
    ]
};

vi.mock('react-redux', () => ({
    useSelector: () => currentUser,
    useDispatch: () => vi.fn()
}));

const mockUpdateCenterSettings = vi.fn().mockReturnValue({ unwrap: () => Promise.resolve({ workstation_presets: mockCenterSettings.workstation_presets }) });

vi.mock('../../../store/api', () => ({
    useGetRoomsQuery: () => ({
        data: mockRooms,
        isLoading: false,
        isError: false,
    }),
    useGetMachinesQuery: () => ({
        data: mockMachines,
        isLoading: false,
        isError: false,
    }),
    useGetCenterSettingsQuery: () => ({
        data: mockCenterSettings,
        isLoading: false,
        isError: false,
    }),
    useUpdateCenterSettingsMutation: () => [mockUpdateCenterSettings, { isLoading: false }],
}));

describe('EquipmentWorkstationMapping Component', () => {
    beforeEach(async () => {
        currentUser = { user_id: 'admin1', fullName: 'Admin User', role: 'Admin', permissions: ['VIEW_EQUIPMENT', 'MANAGE_EQUIPMENT'] };
        mockUpdateCenterSettings.mockClear();
        await i18n.changeLanguage('ar');
    });

    it('renders workstation presets list with titles, descriptions and scopes in Arabic', () => {
        render(<EquipmentWorkstationMapping />);

        expect(screen.getByText(/تخصيص محطات الاستقبال/i)).toBeInTheDocument();
        expect(screen.getByText('شباك 1 - الاستقبال العام')).toBeInTheDocument();
        expect(screen.getByText('شباك 2 - رنين ومقطعية')).toBeInTheDocument();
    });

    it('allows admin users to open add workstation modal and prevents duplicate names', async () => {
        render(<EquipmentWorkstationMapping />);

        const addButton = screen.getByRole('button', { name: /إضافة محطة/i });
        fireEvent.click(addButton);

        expect(screen.getByRole('button', { name: /تطبيق البيانات/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /إلغاء/i })).toBeInTheDocument();

        // Type a duplicate name and try to submit
        const nameInput = screen.getByLabelText('workstation-name-input');
        fireEvent.change(nameInput, { target: { value: 'شباك 1 - الاستقبال العام' } });

        const submitButton = screen.getByRole('button', { name: /تطبيق البيانات/i });
        fireEvent.click(submitButton);

        // Expect duplicate name error
        expect(screen.getByText(/اسم المحطة مستخدم بالفعل/i)).toBeInTheDocument();
    });

    it('allows duplicating an existing workstation preset with unique name', () => {
        render(<EquipmentWorkstationMapping />);

        const duplicateButtons = screen.getAllByRole('button', { name: /نسخ/i });
        fireEvent.click(duplicateButtons[0]);

        expect(screen.getByText(/شباك 1 - الاستقبال العام \(نسخة\)/i)).toBeInTheDocument();
    });

    it('filters workstations via search bar', () => {
        render(<EquipmentWorkstationMapping />);

        const searchInput = screen.getByPlaceholderText(/بحث باسم المحطة/i);
        fireEvent.change(searchInput, { target: { value: 'رنين' } });

        expect(screen.getByText('شباك 2 - رنين ومقطعية')).toBeInTheDocument();
        expect(screen.queryByText('شباك 1 - الاستقبال العام')).not.toBeInTheDocument();
    });

    it('displays read-only guidance for users without management privileges', () => {
        currentUser = { user_id: 'tech1', fullName: 'Tech', role: 'Technician', permissions: ['VIEW_EQUIPMENT'] };
        render(<EquipmentWorkstationMapping />);

        expect(screen.getByText(/يمكنك استعراض تخصيصات محطات الاستقبال/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /إضافة محطة/i })).not.toBeInTheDocument();
    });

    it('renders cleanly in English when language is changed', async () => {
        await i18n.changeLanguage('en');
        render(<EquipmentWorkstationMapping />);

        expect(screen.getByText(/Reception Workstations & Clinical Scope Mapping/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Add Workstation/i })).toBeInTheDocument();
    });
});
