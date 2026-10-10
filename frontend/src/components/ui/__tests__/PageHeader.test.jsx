import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { Activity, Users } from 'lucide-react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import PageHeader from '../PageHeader';

const testI18n = createInstance();
testI18n.init({
    lng: 'en',
    fallbackLng: 'en',
    initImmediate: false,
    resources: {
        en: {
            common: {
                pageHeader: {
                    showMetrics: 'Show statistics',
                    hideMetrics: 'Hide statistics'
                }
            }
        }
    }
});

const renderPageHeader = (header) => render(
    <I18nextProvider i18n={testI18n}>{header}</I18nextProvider>
);

describe('PageHeader', () => {
    it('supports collapsed metrics with a separate storage preference', () => {
        localStorage.removeItem('financial-review-metrics');
        const prior = localStorage.getItem('viara_show_header_metrics');
        renderPageHeader(<PageHeader title="Finance" metricsDefaultVisible={false} metricsStorageKey="financial-review-metrics" metrics={[{ label: 'Revenue', value: '123' }]} />);
        expect(screen.queryByText('123')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Show statistics/ }));
        expect(screen.getByText('123')).toBeInTheDocument();
        expect(localStorage.getItem('financial-review-metrics')).toBe('true');
        expect(localStorage.getItem('viara_show_header_metrics')).toBe(prior);
        localStorage.removeItem('financial-review-metrics');
    });
    it('renders record indicators inside the shared page header', () => {
        const { container } = renderPageHeader(
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

    it('lets users show and hide the statistics', () => {
        renderPageHeader(
            <PageHeader
                title="Patient registry"
                metricsLabel="Patient record indicators"
                metrics={[{ key: 'active', label: 'Active patients', value: 24 }]}
            />
        );

        expect(screen.getByRole('group', { name: 'Patient record indicators' })).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Hide statistics' }));
        expect(screen.queryByRole('group', { name: 'Patient record indicators' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Show statistics' }));
        expect(screen.getByRole('group', { name: 'Patient record indicators' })).toBeVisible();
    });

    it('keeps actionable indicators keyboard-accessible buttons', () => {
        const onClick = vi.fn();
        const { container } = renderPageHeader(
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
        const { container } = renderPageHeader(
            <PageHeader
                compact
                icon={Users}
                eyebrow="Operations"
                title="Compact workspace"
                description="A concise operational summary"
                actions={<button type="button">Refresh</button>}
                metrics={[{ key: 'loading', icon: Activity, label: 'Loading records', loading: true }]}
            />
        );

        expect(container.querySelector('.app-page-header')).toHaveClass('app-page-header--compact');
        expect(container.querySelector('.page-header-content')).toHaveClass('p-3');
        expect(container.querySelector('.page-header-icon')).toHaveClass('h-9', 'w-9', 'rounded-lg');
        expect(container.querySelector('.page-header-actions')).toHaveClass('gap-1.5');
        expect(screen.getByRole('heading', { name: 'Compact workspace' })).toHaveClass('text-xl');
        expect(container.querySelector('.page-header-metric')).toHaveClass('py-2');
        expect(container.querySelector('.page-header-metric')).toHaveAttribute('aria-busy', 'true');
    });

    it('automatically transitions to a dedicated action toolbar strip when action count > 2', () => {
        const { container } = renderPageHeader(
            <PageHeader
                title="Management"
                description="Control center"
                actions={(
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button">Action 1</button>
                        <button type="button">Action 2</button>
                        <button type="button">Action 3</button>
                        <button type="button">Action 4</button>
                    </div>
                )}
            />
        );

        // Dedicated actions bar is rendered
        const actionsBar = container.querySelector('.page-header-actions-bar');
        expect(actionsBar).toBeInTheDocument();
        expect(actionsBar.querySelector('.page-header-actions')).toBeInTheDocument();
        expect(screen.getByText('Action 1')).toBeInTheDocument();
        expect(screen.getByText('Action 4')).toBeInTheDocument();

        // The title container has full width (w-full) instead of being squished
        const titleLead = container.querySelector('.page-header-content .flex-col > .items-start');
        expect(titleLead).toHaveClass('w-full');
    });

    it('honors explicit actionsLayout="toolbar" even for a single action', () => {
        const { container } = renderPageHeader(
            <PageHeader
                title="Solo Action"
                actionsLayout="toolbar"
                actions={<button type="button">Single Toolbar Action</button>}
            />
        );

        expect(container.querySelector('.page-header-actions-bar')).toBeInTheDocument();
        expect(screen.getByText('Single Toolbar Action')).toBeInTheDocument();
    });

    it('honors explicit actionsLayout="inline" even with multiple actions', () => {
        const { container } = renderPageHeader(
            <PageHeader
                title="Inline Force"
                actionsLayout="inline"
                actions={(
                    <>
                        <button type="button">A1</button>
                        <button type="button">A2</button>
                        <button type="button">A3</button>
                    </>
                )}
            />
        );

        // Dedicated toolbar bar should NOT be rendered
        expect(container.querySelector('.page-header-actions-bar')).not.toBeInTheDocument();
        // Actions are rendered inline
        expect(container.querySelector('.page-header-actions')).toBeInTheDocument();
        expect(screen.getByText('A1')).toBeInTheDocument();
    });

    it('applies actionsAlign correctly', () => {
        const { container } = renderPageHeader(
            <PageHeader
                title="Alignment Test"
                actionsLayout="toolbar"
                actionsAlign="end"
                actions={<button type="button">End Button</button>}
            />
        );

        const actionsContainer = container.querySelector('.page-header-actions');
        expect(actionsContainer).toHaveClass('justify-end');
    });

    it('renders frosted dock container and actionsLeading slot in toolbar mode', () => {
        const { container } = renderPageHeader(
            <PageHeader
                title="Cockpit Console"
                actionsLayout="toolbar"
                actionsVariant="docked"
                actionsLeading={<input type="text" placeholder="Search..." />}
                actions={<button type="button">Execute</button>}
            />
        );

        const dock = container.querySelector('.page-header-dock');
        expect(dock).toBeInTheDocument();
        expect(dock).toHaveClass('backdrop-blur-md', 'rounded-2xl');

        const leadingSlot = container.querySelector('.page-header-actions-leading');
        expect(leadingSlot).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();

        const actionsContainer = container.querySelector('.page-header-actions');
        expect(actionsContainer).toHaveClass('no-scrollbar', 'scroll-smooth');
    });
});
