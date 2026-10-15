import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import WorkspaceSectionBoundary from '../WorkspaceSectionBoundary';

const state = vi.hoisted(() => ({ user: {}, visited: [] }));
vi.mock('react-redux', () => ({ useSelector: () => state.user }));
const Page = () => {
    const location = useLocation();
    state.visited.push(location.search);
    return <div data-testid="page">{location.search}</div>;
};
const HistoryControls = () => {
    const navigate = useNavigate();
    return <><button onClick={() => navigate('/reception?tab=patients')}>Patients section</button><button onClick={() => navigate(-1)}>Back</button><button onClick={() => navigate(1)}>Forward</button></>;
};
const renderWorkspace = (path) => render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <HistoryControls />
        <Routes>
            <Route path="/unauthorized" element={<div>Access denied</div>} />
            <Route path="/profile" element={<div>Profile destination</div>} />
            <Route path="*" element={<WorkspaceSectionBoundary><Page /></WorkspaceSectionBoundary>} />
        </Routes>
    </MemoryRouter>
);

describe('workspace URL boundary', () => {
    beforeEach(() => {
        state.user = { role: 'Receptionist', permissions: ['VIEW_APPOINTMENTS', 'VIEW_PATIENTS'] };
        state.visited = [];
    });

    it('does not mount a forbidden section before redirecting to an allowed one', () => {
        renderWorkspace('/reception?tab=cashier&invoiceId=123');
        expect(screen.getByTestId('page')).toHaveTextContent('?tab=schedule&invoiceId=123');
        expect(state.visited.every((search) => !search.includes('tab=cashier'))).toBe(true);
        expect(screen.getByRole('heading', { name: 'Schedule & operations' })).toBeInTheDocument();
    });

    it('denies a workspace with no accessible sections without mounting its queries', () => {
        state.user = { role: 'Receptionist', permissions: [] };
        renderWorkspace('/reception?tab=schedule');
        expect(screen.getByText('Access denied')).toBeInTheDocument();
        expect(state.visited).toEqual([]);
    });

    it('supports section changes, browser back and forward', () => {
        renderWorkspace('/reception?tab=schedule');
        fireEvent.click(screen.getByRole('button', { name: 'Patients section' }));
        expect(screen.getByTestId('page')).toHaveTextContent('?tab=patients');
        fireEvent.click(screen.getByRole('button', { name: 'Back' }));
        expect(screen.getByTestId('page')).toHaveTextContent('?tab=schedule');
        fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
        expect(screen.getByTestId('page')).toHaveTextContent('?tab=patients');
    });

    it.each(['profile', 'security'])('preserves the legacy settings %s redirect', (tab) => {
        renderWorkspace(`/settings?tab=${tab}`);
        expect(screen.getByText('Profile destination')).toBeInTheDocument();
        expect(state.visited).toEqual([]);
    });

    it('leaves context-specific patient tabs untouched', () => {
        renderWorkspace('/patients/123?tab=history');
        expect(screen.getByTestId('page')).toHaveTextContent('?tab=history');
    });
});
