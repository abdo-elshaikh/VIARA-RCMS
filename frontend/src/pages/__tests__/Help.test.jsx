import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Help from '../Help';
import i18n from '../../i18n';
import { canAccessRoute } from '../../config/routes';

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

    it('documents assigned and available clinical tasks for the radiologist role', () => {
        render(<MemoryRouter><Help /></MemoryRouter>);

        fireEvent.change(screen.getByLabelText('Search help guides'), { target: { value: 'unassigned work' } });
        expect(screen.getByRole('button', { name: /Assigned, Unassigned & Held Clinical Tasks/ })).toBeInTheDocument();
    });

    it('exposes Help to every supported role without bypassing workspace access', () => {
        expect(canAccessRoute('/help', { role: 'Developer' })).toBe(true);
        expect(canAccessRoute('/help', { role: 'Referring_Doctor' })).toBe(true);
        expect(canAccessRoute('/worklist', { role: 'Referring_Doctor' })).toBe(false);
    });

    it('points admin articles at settings sub-tabs instead of dead routes', () => {
        currentUser = { role: 'Admin' };
        render(<MemoryRouter><Help /></MemoryRouter>);

        fireEvent.change(screen.getByLabelText('Search help guides'), { target: { value: 'audit' } });
        const auditCard = screen.getByRole('button', { name: /Electronic Audit Trails/ });
        fireEvent.click(auditCard);
        const auditHref = `/settings?tab=auditLogs`;
        expect(screen.getAllByRole('link', { name: /Open Interactive Workspace/ }).map((l) => l.getAttribute('href'))).toContain(auditHref);

        fireEvent.change(screen.getByLabelText('Search help guides'), { target: { value: 'backup' } });
        const backupCard = screen.getByRole('button', { name: /Database Backup/ });
        fireEvent.click(backupCard);
        const backupHref = `/settings?tab=backups`;
        expect(screen.getAllByRole('link', { name: /Open Interactive Workspace/ }).map((l) => l.getAttribute('href'))).toContain(backupHref);
    });
});
