import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Help from '../Help';
import i18n from '../../i18n';

let currentUser = { role: 'Radiologist' };
vi.mock('react-redux', () => ({ useSelector: () => currentUser }));

describe('Help knowledge center', () => {
    beforeEach(async () => {
        currentUser = { role: 'Radiologist' };
        await i18n.changeLanguage('en');
    });

    it('shows role-relevant guidance and performs a real article search', () => {
        render(<MemoryRouter><Help /></MemoryRouter>);

        expect(screen.getAllByText('Radiology Diagnostic Report Editor').length).toBeGreaterThan(0);
        expect(screen.queryByText('Role-Based Access Control (RBAC) & Security Governance')).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Search help guides'), { target: { value: 'electronic signature' } });
        expect(screen.getAllByText('Radiology Diagnostic Report Editor').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: /Radiology Diagnostic Report Editor/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Multi-Room Appointment Scheduler/ })).not.toBeInTheDocument();
    });
});
