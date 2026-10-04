import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import Unauthorized from '../Unauthorized';
import authReducer from '../../store/authSlice';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

const createTestStore = (initialAuthState = {}) => configureStore({
    reducer: {
        auth: authReducer,
    },
    preloadedState: {
        auth: {
            user: null,
            token: null,
            isAuthenticated: false,
            ...initialAuthState,
        },
    },
});

describe('Unauthorized Page - Workspace & Role Separation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        sessionStorage.clear();
    });

    it('renders normal staff unauthorized state when a staff role encounters a restricted page', () => {
        const store = createTestStore({
            user: { id: 'u1', role: 'Nurse', full_name: 'Sarah Nurse' },
            isAuthenticated: true,
        });

        render(
            <Provider store={store}>
                <MemoryRouter>
                    <Unauthorized />
                </MemoryRouter>
            </Provider>
        );

        expect(screen.getByText('Nurse')).toBeInTheDocument();
        expect(screen.getByText('Sarah Nurse')).toBeInTheDocument();
    });

    it('renders dedicated workspace separation state when a Patient portal user is detected', () => {
        const store = createTestStore({
            user: { id: 'pat-1', role: 'Patient', name: 'Mohamed El-Sharkawy' },
            isAuthenticated: true,
        });

        render(
            <Provider store={store}>
                <MemoryRouter>
                    <Unauthorized />
                </MemoryRouter>
            </Provider>
        );

        expect(screen.getByText('Patient')).toBeInTheDocument();
        expect(screen.getByText('Mohamed El-Sharkawy')).toBeInTheDocument();

        // Check for portal link
        const portalLink = screen.getByRole('link', { name: /بوابة المرضى|Patient Portal/i });
        expect(portalLink).toBeInTheDocument();
        expect(portalLink.getAttribute('href')).toContain('/patient');

        // Check for switch to staff account button
        const switchBtn = screen.getByRole('button', { name: /حساب موظف|Staff Account/i });
        expect(switchBtn).toBeInTheDocument();

        // Clicking switch to staff account logs out and navigates to /login
        fireEvent.click(switchBtn);
        expect(store.getState().auth.isAuthenticated).toBe(false);
        expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
    });
});
