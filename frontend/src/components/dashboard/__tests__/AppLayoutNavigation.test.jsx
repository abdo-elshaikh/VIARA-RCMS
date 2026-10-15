import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import AppLayout from '../AppLayout';

vi.mock('react-redux', () => ({
    useDispatch: () => vi.fn(),
    useSelector: () => ({ role: 'Receptionist', permissions: ['VIEW_APPOINTMENTS'] }),
}));
vi.mock('../../../store/api', () => ({
    api: { endpoints: { logout: { initiate: vi.fn() } } },
    useGetCenterSettingsQuery: () => ({ data: { center_name: 'VIARA' } }),
}));
vi.mock('../../communications/ChatBubble', () => ({ default: () => null }));
vi.mock('../Topbar', () => ({ default: ({ menuButtonRef, onMobileMenuClick }) => <button ref={menuButtonRef} onClick={onMobileMenuClick}>Open navigation</button> }));

const originalWidth = window.innerWidth;
afterEach(() => {
    window.innerWidth = originalWidth;
    localStorage.clear();
});

describe('mobile workspace navigation', () => {
    it('opens full navigation even if desktop sidebar was collapsed, and restores focus on Escape', () => {
        window.innerWidth = 390;
        localStorage.setItem('sidebar-collapsed', 'true');
        const { container } = render(<MemoryRouter initialEntries={['/reception?tab=schedule']}><AppLayout role="Receptionist"><div>Workspace content</div></AppLayout></MemoryRouter>);
        expect(container.querySelector('aside[inert]')).toHaveAttribute('aria-hidden', 'true');
        const opener = screen.getByRole('button', { name: 'Open navigation' });
        fireEvent.click(opener);
        const drawer = screen.getByRole('dialog', { name: 'Main navigation' });
        expect(drawer).toHaveStyle({ width: '280px' });
        expect(drawer).not.toHaveAttribute('inert');
        expect(screen.getByRole('link', { name: 'Schedule & operations' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(opener).toHaveFocus();
    });
});
