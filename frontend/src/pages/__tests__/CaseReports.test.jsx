/* eslint-disable no-undef */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import i18n from '../../i18n';
import CaseReports from '../CaseReports';

const mocks = vi.hoisted(() => ({
    deliver: vi.fn(),
    improve: vi.fn(),
    lookup: vi.fn(),
    reportData: {
        items: [{
            exam_id: 'exam-1',
            patient_name: 'Sam Patient',
            patient_email: 'sam@example.com',
            patient_phone: '+15551234567',
            mrn: 'MRN-1',
            order_number: 'ORD-1',
            exam_type_name: 'CT Brain',
            modality_name: 'CT',
            report_status: 'Finalized',
            report_content: 'No acute intracranial abnormality is identified.',
        }],
        total: 1,
    },
}));

vi.mock('react-redux', () => ({
    useSelector: () => ({ role: 'Developer' }),
}));

vi.mock('../../store/api', () => ({
    useDeliverResultMutation: () => [mocks.deliver, { isLoading: false }],
    useGetCaseReportsQuery: () => ({
        data: mocks.reportData,
        isLoading: false,
        isFetching: false,
        isError: false,
        refetch: vi.fn(),
    }),
    useGetCenterSettingsQuery: () => ({ data: {} }),
    useGetReportTemplatesQuery: () => ({ data: [], isFetching: false }),
    useImproveReportFormatMutation: () => [mocks.improve, { isLoading: false }],
    useLazyLookupCaseReportQuery: () => [mocks.lookup, { isFetching: false }],
}));

const renderPage = () => render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CaseReports />
    </BrowserRouter>
);

describe('CaseReports dialogs', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        mocks.deliver.mockReset();
        mocks.improve.mockReset();
        mocks.lookup.mockReset();
        mocks.deliver.mockReturnValue({ unwrap: () => Promise.resolve({}) });
        mocks.improve.mockReturnValue({ unwrap: () => Promise.resolve({ improved: 'Improved report text' }) });
        mocks.lookup.mockReturnValue({ unwrap: () => Promise.resolve({ items: [] }) });
    });

    it('inherits Escape closing and focus restoration for the scanner', async () => {
        renderPage();
        const trigger = screen.getByRole('button', { name: 'Scan receipt QR' });
        trigger.focus();
        fireEvent.click(trigger);

        expect(screen.getByRole('dialog', { name: 'Find report by receipt QR' })).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(screen.queryByRole('dialog', { name: 'Find report by receipt QR' })).not.toBeInTheDocument();
        await waitFor(() => expect(trigger).toHaveFocus());
    });

    it('stops an active scanner camera when the shared Modal closes', async () => {
        const stop = vi.fn();
        const stream = { getTracks: () => [{ stop }] };
        vi.stubGlobal('BarcodeDetector', class BarcodeDetector {
            detect() { return Promise.resolve([]); }
        });
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
        });
        vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Scan receipt QR' }));
        fireEvent.click(screen.getByRole('button', { name: 'Use Camera' }));
        await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce());
        fireEvent.keyDown(document, { key: 'Escape' });

        await waitFor(() => expect(stop).toHaveBeenCalledOnce());
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('keeps delivery fields and submits through the Modal footer action', async () => {
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'Deliver Report to Patient' }));
        const dialog = screen.getByRole('dialog', { name: 'Deliver Case Report' });

        fireEvent.change(within(dialog).getByLabelText('Delivery Method'), { target: { value: 'Email' } });
        fireEvent.change(within(dialog).getByLabelText('Delivery Notes'), { target: { value: 'Patient requested email' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Record Delivery' }));

        await waitFor(() => expect(mocks.deliver).toHaveBeenCalledWith(expect.objectContaining({
            examId: 'exam-1',
            deliveryMethod: 'Email',
            recipientContact: 'sam@example.com',
            notes: 'Patient requested email',
        })));
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Deliver Case Report' })).not.toBeInTheDocument());
    });

    it('keeps improve generation and footer actions in the shared Modal', async () => {
        renderPage();
        fireEvent.click(screen.getByRole('button', { name: 'AI Format & Polish Report' }));
        const dialog = screen.getByRole('dialog', { name: 'AI Clinical Report Polishing' });

        await waitFor(() => expect(mocks.improve).toHaveBeenCalledWith(expect.objectContaining({
            examId: 'exam-1',
            language: 'en',
        })));
        await waitFor(() => expect(within(dialog).getByRole('textbox')).toHaveValue('Improved report text'));
        expect(within(dialog).getByRole('button', { name: 'Regenerate' })).toBeEnabled();
        expect(within(dialog).getByRole('button', { name: 'Copy & Apply' })).toBeEnabled();
    });
});
