/* eslint-disable no-undef */
import { fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import i18n from '../../i18n';
import Worklist from '../Worklist';

const mocks = vi.hoisted(() => ({
    navigate: vi.fn(),
    transitionQueue: vi.fn(),
    claimTask: vi.fn(),
    releaseTask: vi.fn(),
    queueItems: [
        {
            exam_id: 'exam-101',
            appointment_id: 'apt-101',
            patient_name: 'John Doe',
            mrn: 'MRN-101',
            order_number: 'ORD-101',
            exam_type_name: 'Chest X-Ray PA',
            modality_name: 'X-Ray',
            modality_type: 'CR',
            queue_stage: 'Reporting',
            priority: 'Emergency',
            waiting_minutes: 45,
            is_overdue: true,
            is_on_hold: false,
            images_available: true,
            image_count: 2,
            pacs_status: 'Available',
            pregnancy_safety_status: 'Clear',
            implant_safety_status: 'Clear',
            renal_safety_status: 'Clear',
            critical_result: true,
            assignment_status: 'Assigned',
            is_assigned_to_me: true
        },
        {
            exam_id: 'exam-102',
            appointment_id: 'apt-102',
            patient_name: 'Jane Smith',
            mrn: 'MRN-102',
            order_number: 'ORD-102',
            exam_type_name: 'Brain MRI with Contrast',
            modality_name: 'MRI',
            modality_type: 'MR',
            queue_stage: 'Ready for Exam',
            priority: 'Routine',
            waiting_minutes: 15,
            is_overdue: false,
            is_on_hold: false,
            images_available: false,
            pregnancy_safety_status: 'Clear',
            implant_safety_status: 'At Risk',
            renal_safety_status: 'Clear',
            assignment_status: 'Unassigned',
            is_assigned_to_me: false
        }
    ]
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mocks.navigate
    };
});

vi.mock('react-redux', () => ({
    useSelector: () => ({ user_id: 'user-doc-1', role: 'Radiologist' }),
    useDispatch: () => vi.fn()
}));

vi.mock('../../store/authSlice', () => ({
    selectCurrentUser: () => ({ user_id: 'user-doc-1', role: 'Radiologist' })
}));

vi.mock('../../store/api', () => ({
    useGetAppointmentsQuery: () => ({
        data: [],
        isLoading: false,
        isError: false,
        refetch: vi.fn()
    }),
    useGetQueueQuery: () => ({
        data: {
            data: mocks.queueItems,
            kpis: {
                assignedToMe: 1,
                pending: 1,
                inProgress: 1,
                available: 1
            }
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn()
    }),
    useTransitionQueueMutation: () => [mocks.transitionQueue, { isLoading: false }],
    useClaimQueueTaskMutation: () => [mocks.claimTask, { isLoading: false }],
    useReleaseQueueTaskAssignmentMutation: () => [mocks.releaseTask, { isLoading: false }]
}));

const renderWorklist = () => render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Worklist />
    </BrowserRouter>
);

describe('Worklist Hub and Keyboard Speed Controls', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en');
        mocks.navigate.mockReset();
        mocks.transitionQueue.mockReset();
        mocks.claimTask.mockReset();
        mocks.releaseTask.mockReset();
    });

    it('renders the telemetry HUD, queue rows, and keyboard shortcut legend bar', () => {
        renderWorklist();

        // Telemetry HUD items & Queue rows
        expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Chest X-Ray PA').length).toBeGreaterThan(0);

        // Keyboard speed control legend
        expect(screen.getByText('Keyboard controls')).toBeInTheDocument();
        expect(screen.getByText('PACS DICOM')).toBeInTheDocument();
        expect(screen.getByText('Case File')).toBeInTheDocument();
    });

    it('displays safety summary and DICOM action button for ready images', () => {
        renderWorklist();

        // Safety summary on John Doe (Clear)
        expect(screen.getAllByText(/Safety clear/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Critical result requiring acknowledgement/i).length).toBeGreaterThan(0);

        // 1-Click DICOM launcher
        const dicomBtns = screen.getAllByRole('button', { name: /dicom/i });
        expect(dicomBtns.length).toBeGreaterThan(0);
        fireEvent.click(dicomBtns[0]);
        expect(mocks.navigate).toHaveBeenCalledWith('/pacs/viewer?examId=exam-101');
    });

    it('supports keyboard navigation via ArrowDown and launching via Enter key', () => {
        renderWorklist();

        // Press ArrowDown to select row 0
        fireEvent.keyDown(window, { key: 'ArrowDown' });

        // Press Enter on the focused row: for Radiologist in Reporting stage, navigates to report editor
        fireEvent.keyDown(window, { key: 'Enter' });
        expect(mocks.navigate).toHaveBeenCalledWith(
            '/reports/editor/exam-101',
            expect.objectContaining({
                state: expect.objectContaining({
                    exam: expect.objectContaining({ exam_id: 'exam-101' })
                })
            })
        );
    });

    it('supports D key to directly open DICOM viewer for focused row', () => {
        renderWorklist();

        // Select first row and press D
        fireEvent.keyDown(window, { key: 'ArrowDown' });
        fireEvent.keyDown(window, { key: 'd' });

        expect(mocks.navigate).toHaveBeenCalledWith('/pacs/viewer?examId=exam-101');
    });

    it('supports Space key to open appointment detail slide-over drawer for focused row', () => {
        renderWorklist();

        // Select first row and press Space key
        fireEvent.keyDown(window, { key: 'ArrowDown' });
        fireEvent.keyDown(window, { key: ' ' });

        // Details drawer should now be open
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
});
