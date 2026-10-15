import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import QueueStageTracker from '../QueueStageTracker';

describe('QueueStageTracker', () => {
    it('renders all 9 stages properly including In Exam and Reporting', () => {
        const { container, rerender } = render(
            <QueueStageTracker stage="In Exam" t={(key, opts) => opts?.defaultValue || key} />
        );

        expect(screen.getByLabelText('In Exam')).toBeDefined();
        const dots = container.querySelectorAll('span[title]');
        expect(dots.length).toBe(9);

        // Stage 5 is In Exam (0-indexed: Scheduled=0, Arrived=1, Payment Pending=2, Prep Pending=3, Ready for Exam=4, In Exam=5)
        expect(dots[5].className).toContain('w-4'); // active stage has expanded width
        expect(dots[4].className).toContain('bg-teal-300'); // previous stages are done

        rerender(<QueueStageTracker stage="Reporting" t={(key, opts) => opts?.defaultValue || key} />);
        expect(screen.getByLabelText('Reporting')).toBeDefined();
        const updatedDots = container.querySelectorAll('span[title]');
        expect(updatedDots[6].className).toContain('w-4'); // Reporting is active
    });
});
