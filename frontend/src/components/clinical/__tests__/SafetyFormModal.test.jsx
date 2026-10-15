import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SafetyFormModal from '../SafetyFormModal';

const mockSubmitSafetyResponse = vi.fn();

vi.mock('../../../store/api', () => ({
    useSubmitSafetyResponseMutation: () => [mockSubmitSafetyResponse, { isLoading: false }],
}));

describe('SafetyFormModal', () => {
    beforeEach(() => {
        mockSubmitSafetyResponse.mockReset();
    });

    const template = {
        template_id: 'tpl-1',
        name: 'MRI Safety Checklist',
        schema_json: [
            { id: 'pacemaker', question: 'Any implanted pacemaker?', type: 'boolean', required: true },
        ],
    };

    it('does not continue to the queue transition when the safety response puts the case on hold', async () => {
        const onClose = vi.fn();
        const onComplete = vi.fn();
        mockSubmitSafetyResponse.mockReturnValue({
            unwrap: vi.fn().mockResolvedValue({
                isOnHold: true,
                contraindicationDetected: true,
            }),
        });

        render(
            <SafetyFormModal
                isOpen={true}
                onClose={onClose}
                examId="exam-1"
                template={template}
                onComplete={onComplete}
            />
        );

        expect(screen.getByRole('dialog', { name: template.name })).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Yes'));
        fireEvent.click(screen.getByRole('button', { name: /Sign & Authorize Exam/i }));

        await waitFor(() => {
            expect(mockSubmitSafetyResponse).toHaveBeenCalledTimes(1);
        });

        expect(onComplete).not.toHaveBeenCalled();
    });

    it('continues to the exam transition when the safety response is cleared', async () => {
        const onComplete = vi.fn();
        mockSubmitSafetyResponse.mockReturnValue({
            unwrap: vi.fn().mockResolvedValue({
                isOnHold: false,
                contraindicationDetected: false,
            }),
        });

        render(
            <SafetyFormModal
                isOpen={true}
                onClose={() => {}}
                examId="exam-1"
                template={template}
                onComplete={onComplete}
            />
        );

        fireEvent.click(screen.getByLabelText('No'));
        fireEvent.click(screen.getByRole('button', { name: /Sign & Authorize Exam/i }));

        await waitFor(() => {
            expect(onComplete).toHaveBeenCalledTimes(1);
        });
    });
});
