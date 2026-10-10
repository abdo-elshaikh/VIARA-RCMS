import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PrintReceipt from '../PrintReceipt';

vi.mock('../../../store/api', () => ({
    useGetAppointmentByIdQuery: vi.fn(),
    useGetCenterSettingsQuery: vi.fn(),
}));

// The trial watermark hook reads the edition via useLicense, which is
// redux-connected. store/api is mocked above so no Provider is required, so
// the licence lookup has to be stubbed too. An empty session cache plus a
// non-trial edition resolves to no watermark.
vi.mock('../../../hooks/useLicense', () => ({
    useLicense: () => ({ edition: 'developer', isTrial: false, loading: false }),
}));

vi.mock('react-i18next', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useTranslation: () => ({
            t: (key, opts) => opts?.defaultValue || key,
            i18n: { language: 'ar', changeLanguage: vi.fn() }
        })
    };
});

vi.mock('../../../utils/printDocument', () => ({
    getSheetPreviewVariables: () => ({}),
    printWhenReady: vi.fn()
}));

vi.mock('../../../utils/portalUrls', () => ({
    getPatientPortalLoginUrl: () => 'https://portal.viara-health.com/login'
}));

vi.mock('qrcode.react', async () => {
    const React = await import('react');
    return {
        QRCodeSVG: ({ value }) => React.createElement('svg', { 'data-testid': 'receipt-qr', 'data-value': value })
    };
});

vi.mock('../../ui/LanguageToggle', () => ({
    default: () => <div data-testid="language-toggle" />
}));

import { useGetAppointmentByIdQuery, useGetCenterSettingsQuery } from '../../../store/api';

describe('PrintReceipt Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockAppointment = {
        appointment_id: 'appt-123',
        order_number: 'ORD-2026-9901',
        patient_name: 'أحمد محمود علي',
        mrn: 'MRN-88219',
        date_of_birth: '1988-06-15',
        gender: 'Male',
        exam_type_name: 'MRI Brain with Contrast',
        modality_type: 'MRI',
        machine_name: 'Siemens Magnetom 1.5T',
        room_name: 'جناح الرنين 1',
        room_number: '101',
        start_time: '2026-09-26T10:30:00Z',
        referring_doctor_name: 'د. طارق مصطفى',
        receptionist_name: 'سارة إبراهيم',
        exam_type_contrast_required: true,
        payment: {
            amount: '1850.00',
            method: 'Card / POS',
            payment_reference: 'AUTH-TX-449102',
            invoice_number: 'INV-2026-1029',
        }
    };

    const mockSettings = {
        center_name: 'مركز فيارا التخصصي للأشعة',
        branch_name: 'الفرع الرئيسي - المعادي',
        phone: '19200',
        print_settings: {
            receiptWidth: '80mm',
            themeColor: '#087F5B',
            fontFamily: 'Inter',
            showQR: true
        }
    };

    it('renders loading state when data is being fetched', () => {
        useGetAppointmentByIdQuery.mockReturnValue({ isLoading: true });
        useGetCenterSettingsQuery.mockReturnValue({ isLoading: true });

        render(
            <MemoryRouter>
                <PrintReceipt />
            </MemoryRouter>
        );

        expect(document.querySelector('.animate-spin')).toBeTruthy();
    });

    it('renders error state when appointment fails to load', () => {
        useGetAppointmentByIdQuery.mockReturnValue({ isLoading: false, isError: true, data: null });
        useGetCenterSettingsQuery.mockReturnValue({ isLoading: false, data: mockSettings });

        render(
            <MemoryRouter>
                <PrintReceipt />
            </MemoryRouter>
        );

        expect(screen.getByText('Failed to load details')).toBeTruthy();
    });

    it('renders all modern receipt sections and executive branding', () => {
        useGetAppointmentByIdQuery.mockReturnValue({ isLoading: false, data: mockAppointment });
        useGetCenterSettingsQuery.mockReturnValue({ isLoading: false, data: mockSettings });

        render(
            <MemoryRouter>
                <PrintReceipt />
            </MemoryRouter>
        );

        // Center Branding
        expect(screen.getByText('مركز فيارا التخصصي للأشعة')).toBeTruthy();

        // Patient Identity
        expect(screen.getByText('أحمد محمود علي')).toBeTruthy();
        expect(screen.getAllByText(/MRN-88219/).length).toBeGreaterThan(0);
        expect(screen.getByText('د. طارق مصطفى')).toBeTruthy();

        // Examination Details
        expect(screen.getByText('MRI Brain with Contrast')).toBeTruthy();
        expect(screen.getByText('MRI')).toBeTruthy();

        // Financial Payment Details
        expect(screen.getByText(/\+1,850.00 EGP/)).toBeTruthy();
        expect(screen.getByText('INV-2026-1029')).toBeTruthy();
        expect(screen.getByText('AUTH-TX-449102')).toBeTruthy();

        // Scannable Barcode & QR Code
        expect(document.querySelector('svg[aria-label="Barcode: ORD-2026-9901"]')).toBeTruthy();
        expect(document.querySelector('svg.w-full')).toBeTruthy();
        const receiptQrUrl = new URL(screen.getByTestId('receipt-qr').getAttribute('data-value'));
        expect(receiptQrUrl.searchParams.get('mrn')).toBe('MRN-88219');
        expect(receiptQrUrl.searchParams.get('orderNumber')).toBe('ORD-2026-9901');

        // Contrast Alert
        expect(screen.getByText(/صبغة وريدية/)).toBeTruthy();

        // Tear-off cut line
        expect(screen.getByText('خط القص')).toBeTruthy();
    });

    it('renders multi-item invoice, payment history ledger, and concurrent appointments', () => {
        const multiItemAppt = {
            ...mockAppointment,
            items: [
                { item_id: 'item-1', description: 'MRI Brain with Contrast', quantity: 1, unit_price: '1850.00', total_price: '1850.00' },
                { item_id: 'item-2', description: 'MRI Cervical Spine', quantity: 1, unit_price: '1600.00', total_price: '1600.00' }
            ],
            payments: [
                { payment_id: 'pay-1', amount: '1000.00', method: 'Cash', payment_reference: 'CSH-001', transaction_date: '2026-09-26T10:00:00Z', cashier_name: 'أحمد أمين' },
                { payment_id: 'pay-2', amount: '1450.00', method: 'Card / POS', payment_reference: 'POS-002', transaction_date: '2026-09-26T10:30:00Z', cashier_name: 'سارة إبراهيم' }
            ],
            invoice: {
                invoice_id: 'inv-99',
                invoice_number: 'INV-2026-MULT-01',
                total_amount: '3450.00',
                patient_payable_amount: '3450.00',
                insurance_covered_amount: '0.00',
                invoice_status: 'partial'
            },
            related_appointments: [
                {
                    appointment_id: 'appt-999',
                    order_number: 'ORD-2026-9902',
                    start_time: '2026-09-26T11:30:00Z',
                    exam_type_name: 'Chest X-Ray PA',
                    modality_type: 'X-RAY',
                    machine_name: 'Digital Rad 2',
                    room_name: 'غرفة الأشعة 2'
                }
            ]
        };

        useGetAppointmentByIdQuery.mockReturnValue({ isLoading: false, data: multiItemAppt });
        useGetCenterSettingsQuery.mockReturnValue({ isLoading: false, data: mockSettings });

        render(
            <MemoryRouter>
                <PrintReceipt />
            </MemoryRouter>
        );

        // Multi-Item Procedures
        expect(screen.getByText('MRI Cervical Spine')).toBeTruthy();
        expect(screen.getByText(/الفحوصات والخدمات المشمولة بالإيصال/)).toBeTruthy();

        // Related Appointments
        expect(screen.getByText('Chest X-Ray PA')).toBeTruthy();
        expect(screen.getByText(/مواعيد وفحوصات أخرى للمريض اليوم/)).toBeTruthy();

        // Payment History Ledger
        expect(screen.getAllByText(/سجل الدفعات والتحصيل/).length).toBeGreaterThan(0);
        expect(screen.getByText(/\+1,000.00 EGP/)).toBeTruthy();
        expect(screen.getByText(/\+1,450.00 EGP/)).toBeTruthy();
        expect(screen.getByText(/\+2,450.00 EGP/)).toBeTruthy();
        expect(screen.getAllByText(/1,000.00 EGP/).length).toBe(2); // One in payment ledger, one in remaining balance
        expect(screen.getByText('سداد جزئي')).toBeTruthy();
    });
});
