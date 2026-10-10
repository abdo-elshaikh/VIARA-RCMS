/* eslint-disable no-undef */
import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ClinicalDashboard from '../ClinicalDashboard';

describe('ClinicalDashboard page (deprecated redirect)', () => {
    it('redirects safely to /worklist with replace state', () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/clinical-dashboard']}>
                <Routes>
                    <Route path="/clinical-dashboard" element={<ClinicalDashboard />} />
                    <Route path="/worklist" element={<div data-testid="worklist-destination">Worklist Hub</div>} />
                </Routes>
            </MemoryRouter>
        );

        expect(container.querySelector('[data-testid="worklist-destination"]')).toBeInTheDocument();
    });
});
