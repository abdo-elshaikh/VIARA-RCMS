import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Activity, Users } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import PageHeader from '../PageHeader';

describe('PageHeader', () => {
    it('renders record indicators inside the shared page header', () => {
        const { container } = render(
            <PageHeader
                icon={Users}
                eyebrow="Operations"
                title="Patient registry"
                description="Manage patient records"
                metricsLabel="Patient record indicators"
                metrics={[
                    { key: 'active', icon: Activity, label: 'Active patients', value: 24, tone: 'emerald' },
                    { key: 'attention', icon: Users, label: 'Needs attention', value: 3, tone: 'amber' },
                ]}
            />
        );

        expect(container.querySelector('section')).toHaveClass('app-page-header');
        expect(container.querySelector('.page-header-icon')).toBeInTheDocument();
        expect(container.querySelector('.page-header-eyebrow')).toBeInTheDocument();
        expect(container.querySelector('.page-header-metric-tone-accent')).toBeInTheDocument();
        expect(container.querySelector('.page-header-metric-tone-warning')).toBeInTheDocument();

        const indicators = screen.getByRole('group', { name: 'Patient record indicators' });
        expect(indicators).toHaveTextContent('Active patients');
        expect(indicators).toHaveTextContent('24');
        expect(indicators).toHaveTextContent('Needs attention');
    });

    it('keeps actionable indicators keyboard-accessible buttons', () => {
        const onClick = vi.fn();
        const { container } = render(
            <PageHeader
                title="Financials"
                metrics={[{ key: 'receivables', label: 'Receivables', value: 'EGP 500', onClick }]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: /EGP 500 Receivables/i }));
        expect(onClick).toHaveBeenCalledOnce();
        expect(container.querySelector('.page-header-metric-action')).toBeInTheDocument();
    });

    it('applies compact density consistently to content and indicators', () => {
        const { container } = render(
            <PageHeader
                compact
                icon={Users}
                eyebrow="Operations"
                title="Compact workspace"
                description="A concise operational summary"
                metrics={[{ key: 'loading', icon: Activity, label: 'Loading records', loading: true }]}
            />
        );

        expect(container.querySelector('.app-page-header')).toHaveClass('app-page-header--compact');
        expect(container.querySelector('.page-header-content')).toHaveClass('p-3');
        expect(container.querySelector('.page-header-icon')).toHaveClass('h-9', 'w-9', 'rounded-lg');
        expect(screen.getByRole('heading', { name: 'Compact workspace' })).toHaveClass('text-xl');
        expect(container.querySelector('.page-header-metric')).toHaveClass('py-2.5');
        expect(container.querySelector('.page-header-metric')).toHaveAttribute('aria-busy', 'true');
    });
});
