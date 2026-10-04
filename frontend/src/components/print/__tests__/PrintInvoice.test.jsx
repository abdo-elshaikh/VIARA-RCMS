import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import PrintInvoice from '../PrintInvoice';

vi.mock('../../../components/ui/LanguageToggle', () => ({
    default: () => <div data-testid="language-toggle" />
}));

const mockCenterSettings = {
    facility_name: 'VIARA Medical Imaging',
    facility_name_ar: 'مركز فيارا التخصصي للأشعة',
    phone: '0123456789',
    tax_number: '123-456-789',
    address: '123 Medical St, Cairo',
    print_settings: {
        themeColor: '#087F5B',
        fontFamily: 'Inter',
        headerLayout: 'classic',
        showWatermark: true,
    }
};

const mockInvoice = {
    invoice_id: 'inv-123',
    invoice_number: 'INV-2026-0001',
    patient_name: 'Ali Mostafa',
    mrn: 'PAT-8812',
    invoice_status: 'Paid',
    total_amount: 1500,
    paid_amount: 1500,
    balance_amount: 0,
    generated_at: '2026-09-26T12:00:00.000Z',
    items: [
        { item_id: 'item-1', name: 'MRI Brain with Contrast', unit_price: 1500, quantity: 1, total_amount: 1500 }
    ],
    payments: [
        { payment_id: 'p-1', amount: 1500, method: 'Cash', transaction_date: '2026-09-26T12:00:00.000Z', payment_reference: 'REC-001' }
    ]
};

const mockStatement = {
    is_statement: true,
    statement_title: 'كشف حساب وزيارات / فاتورة مجمعة',
    selected_visits_count: 2,
    invoice_number: 'STMT-PAT-8812-9901',
    patient_name: 'Ali Mostafa',
    mrn: 'PAT-8812',
    invoice_status: 'Partial',
    total_amount: 2500,
    discount_amount: 0,
    insurance_covered_amount: 500,
    patient_payable_amount: 2000,
    paid_amount: 1500,
    balance_amount: 500,
    generated_at: '2026-09-26T12:00:00.000Z',
    items: [
        { item_id: 'visit-1', name: 'MRI Brain (Visit 1)', unit_price: 1500, quantity: 1, total_amount: 1500 },
        { item_id: 'visit-2', name: 'CT Chest (Visit 2)', unit_price: 1000, quantity: 1, total_amount: 1000 }
    ],
    payments: [
        { payment_id: 'p-1', amount: 1500, method: 'Cash', transaction_date: '2026-09-26T12:00:00.000Z' }
    ]
};

vi.mock('../../../store/api', () => ({
    useGetCenterSettingsQuery: () => ({ data: mockCenterSettings, isLoading: false }),
    useGetInvoiceQuery: (id) => ({
        data: id === 'inv-123' ? mockInvoice : null,
        isLoading: false,
        isError: false,
    }),
    useGetVisitsStatementQuery: ({ patientId, appointmentIds }) => ({
        data: patientId === 'pat-1' ? mockStatement : null,
        isLoading: false,
        isError: false,
    }),
}));

// The trial watermark hook reads the edition via useLicense, which is
// redux-connected. store/api is mocked above so no Provider is required, so
// the licence lookup has to be stubbed too. An empty session cache plus a
// non-trial edition resolves to no watermark.
vi.mock('../../../hooks/useLicense', () => ({
    useLicense: () => ({ edition: 'developer', isTrial: false, loading: false }),
}));

describe('PrintInvoice Component', () => {
    it('renders a standard single invoice properly', () => {
        render(
            <MemoryRouter initialEntries={['/print/invoice/inv-123']}>
                <Routes>
                    <Route path="/print/invoice/:id" element={<PrintInvoice />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('INV-2026-0001')).toBeInTheDocument();
        expect(screen.getByText('Ali Mostafa')).toBeInTheDocument();
        expect(screen.getByText('MRI Brain with Contrast')).toBeInTheDocument();
        expect(screen.getAllByText(/1,?500\.00/).length).toBeGreaterThan(0);
    });

    it('renders a consolidated visits billing statement when id is statement', () => {
        render(
            <MemoryRouter initialEntries={['/print/invoice/statement?patientId=pat-1&appointmentIds=appt-1,appt-2']}>
                <Routes>
                    <Route path="/print/invoice/:id" element={<PrintInvoice />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('STMT-PAT-8812-9901')).toBeInTheDocument();
        expect(screen.getByText(/كشف حساب فواتير|Billing Statement/i)).toBeInTheDocument();
        expect(screen.getByText(/Selected visits:\s*2/i)).toBeInTheDocument();
        expect(screen.getByText('MRI Brain (Visit 1)')).toBeInTheDocument();
        expect(screen.getByText('CT Chest (Visit 2)')).toBeInTheDocument();
        expect(screen.getAllByText(/2,?500\.00/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/500\.00/).length).toBeGreaterThan(0);
    });
});
