import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DisplayBoardControl from '../DisplayBoardControl';

const mockUpdateConfig = vi.fn();
const mockCreateAnnouncement = vi.fn();
const mockUpdateAnnouncement = vi.fn();
const mockDeleteAnnouncement = vi.fn();

const sampleConfig = {
    config: {
        patientDisplayMode: 'name_and_order',
        callAnnouncementMode: 'token_and_name',
        showTicker: true,
        boardTitle: 'مركز فيارا التخصصي',
        privacyMode: 'full',
        muteAll: false,
        quietMode: false,
        repeatChime: true,
        theme: 'light',
        displayLanguage: 'ar',
        motionMode: 'full',
        rotationSpeed: 9000,
        showSummaryStats: false,
        announcementRate: 1,
        announcementRepeatCount: 2,
        announcementRepeatDelay: 1500,
        announcementVolume: 1,
        announcementMode: null,
        announcementPreset: 'standard',
        announcementLanguage: 'ar',
        tokenPronunciation: 'auto',
        announcementStyle: 'formal',
        customTemplate: '',
        pronunciationDictionary: '',
        arabicVoiceURI: '',
        englishVoiceURI: '',
    },
    announcements: [
        { id: 'ann-1', title: 'تنبيه الفحص', message: 'يرجى إزالة الساعات والمعادن قبل الفحص', tone: 'warning', isActive: true, displayOrder: 1 },
        { id: 'ann-2', title: 'البوابة الرقمية', message: 'استلم تقريرك إلكترونياً عبر مسح الرمز', tone: 'info', isActive: false, displayOrder: 2 },
    ],
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k, opts) => opts?.defaultValue || (typeof opts === 'string' ? opts : k),
        i18n: { language: 'ar', changeLanguage: vi.fn() },
    }),
}));

vi.mock('../../store/api', () => ({
    useGetDisplayConfigQuery: () => ({
        data: sampleConfig,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
    }),
    useGetCenterSettingsQuery: () => ({
        data: { logo_url: '/logo.png' },
    }),
    useUpdateDisplayConfigMutation: () => [mockUpdateConfig, { isLoading: false }],
    useCreateDisplayAnnouncementMutation: () => [mockCreateAnnouncement, { isLoading: false }],
    useUpdateDisplayAnnouncementMutation: () => [mockUpdateAnnouncement, { isLoading: false }],
    useDeleteDisplayAnnouncementMutation: () => [mockDeleteAnnouncement, { isLoading: false }],
}));

vi.mock('../../utils/speechAnnouncement', () => ({
    announcePatientCall: vi.fn(),
    ANNOUNCEMENT_PRESETS: {},
}));

const renderControl = () => render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DisplayBoardControl />
    </MemoryRouter>
);

describe('DisplayBoardControl page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdateConfig.mockReturnValue({ unwrap: () => Promise.resolve({ ok: true }) });
        mockCreateAnnouncement.mockReturnValue({ unwrap: () => Promise.resolve({ ok: true }) });
        mockUpdateAnnouncement.mockReturnValue({ unwrap: () => Promise.resolve({ ok: true }) });
        mockDeleteAnnouncement.mockReturnValue({ unwrap: () => Promise.resolve({ ok: true }) });
    });

    it('renders the header with management title and direct board link', () => {
        renderControl();
        expect(screen.getByRole('heading', { name: 'إدارة شاشة عرض الحالات' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'فتح الشاشة المباشرة' })).toHaveAttribute('href', '/display');
        expect(screen.getByText('إعلانات شاشة الانتظار')).toBeInTheDocument();
    });

    it('loads and displays existing announcements and allows toggling status', async () => {
        renderControl();
        expect(screen.getByText('تنبيه الفحص')).toBeInTheDocument();
        expect(screen.getByText('يرجى إزالة الساعات والمعادن قبل الفحص')).toBeInTheDocument();
        expect(screen.getByText('البوابة الرقمية')).toBeInTheDocument();

        const pauseButtons = screen.getAllByTitle(/إيقاف العرض/i);
        expect(pauseButtons.length).toBeGreaterThan(0);
        await act(async () => {
            fireEvent.click(pauseButtons[0]);
        });
        expect(mockUpdateAnnouncement).toHaveBeenCalledWith(expect.objectContaining({
            id: 'ann-1',
            isActive: false,
        }));
    });

    it('allows editing settings and saving them to the backend', async () => {
        renderControl();

        const quietPreset = screen.getAllByRole('button', { name: /^هادئ$/i })[0];
        fireEvent.click(quietPreset);

        const saveButton = screen.getByRole('button', { name: /حفظ الإعدادات/i });
        expect(saveButton).not.toBeDisabled();

        await act(async () => {
            fireEvent.click(saveButton);
        });

        expect(mockUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({
            announcementPreset: 'quiet',
            announcementVolume: 0.7,
        }));
    });

    it('switches patient display mode to order_only and forces voice mode to token_only', async () => {
        renderControl();

        const orderOnlyOption = screen.getAllByRole('button', { name: /رقم الدور فقط/i })[0];
        fireEvent.click(orderOnlyOption);

        const saveButton = screen.getByRole('button', { name: /حفظ الإعدادات/i });
        await act(async () => {
            fireEvent.click(saveButton);
        });

        expect(mockUpdateConfig).toHaveBeenCalledWith(expect.objectContaining({
            patientDisplayMode: 'order_only',
            callAnnouncementMode: 'token_only',
        }));
    });

    it('opens create announcement modal, validates and submits', async () => {
        renderControl();

        const addBtn = screen.getByRole('button', { name: /إضافة إعلان/i });
        fireEvent.click(addBtn);

        expect(screen.getByRole('dialog')).toBeInTheDocument();

        const titleInput = screen.getByLabelText(/عنوان الإعلان/i);
        const msgInput = screen.getByLabelText(/نص الإعلان/i);

        fireEvent.change(titleInput, { target: { value: 'إعلان تجريبي جديد' } });
        fireEvent.change(msgInput, { target: { value: 'هذا نص إعلان تجريبي لشاشة الانتظار' } });

        const submitBtn = screen.getByRole('button', { name: 'إضافة الإعلان' });
        await act(async () => {
            fireEvent.click(submitBtn);
        });

        expect(mockCreateAnnouncement).toHaveBeenCalledWith(expect.objectContaining({
            title: 'إعلان تجريبي جديد',
            message: 'هذا نص إعلان تجريبي لشاشة الانتظار',
        }));
    });
});
