import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClinicalTaskScope, { AssignmentBadge } from './ClinicalTaskScope';

const t = (key) => ({
    'taskScope.label': 'Task visibility',
    'taskScope.all': 'All visible tasks',
    'taskScope.mine': 'My tasks',
    'taskScope.available': 'Available tasks',
    'taskScope.status.Unassigned': 'Unassigned',
    'taskScope.status.Assigned': 'Assigned to you',
}[key] || key);

describe('ClinicalTaskScope', () => {
    it('shows all visible work by default and can switch to the shared pool', () => {
        const onChange = vi.fn();
        render(
            <ClinicalTaskScope
                value="all"
                onChange={onChange}
                assignedCount={4}
                availableCount={3}
                t={t}
            />
        );

        expect(screen.getByRole('tab', { name: /All visible tasks 7/i })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: /My tasks 4/i })).toHaveAttribute('aria-selected', 'false');
        expect(screen.getByRole('tab', { name: /Available tasks 3/i })).toHaveAttribute('aria-selected', 'false');

        fireEvent.click(screen.getByRole('tab', { name: /Available tasks 3/i }));
        expect(onChange).toHaveBeenCalledWith('available');
    });

    it('renders assignment state with text and not color alone', () => {
        render(<AssignmentBadge status="Unassigned" t={t} />);

        const badge = screen.getByText('Unassigned');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveClass('border-amber-300');
    });
});
