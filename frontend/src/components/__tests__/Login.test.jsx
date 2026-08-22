/* eslint-disable no-undef */
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '../../store/authSlice';
import Login from '../../pages/Login'; // The Login component is in pages, not components usually, wait. 
// Let's assume pages/Login.jsx exists or we test a generic component if it doesn't. 
// I will just create a generic test for an existing component if I'm not sure. But Login is a good guess.
import { api } from '../../store/api';

const store = configureStore({
    reducer: {
        auth: authReducer,
        [api.reducerPath]: api.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
});

describe('Login Component', () => {
    it('renders the login form', () => {
        render(
            <Provider store={store}>
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                    <Login />
                </BrowserRouter>
            </Provider>
        );

        expect(screen.getByPlaceholderText(/doctor@VIARA\.com/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/••••••••/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /sign in to clinical console/i })).toBeInTheDocument();
    });

    it('shows validation errors when submitting empty form', async () => {
        render(
            <Provider store={store}>
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                    <Login />
                </BrowserRouter>
            </Provider>
        );

        fireEvent.change(screen.getByLabelText(/institutional email/i), { target: { value: '' } });
        fireEvent.change(document.getElementById('staff-password'), { target: { value: '' } });
        const submitButton = screen.getByRole('button', { name: /sign in to clinical console/i });
        fireEvent.click(submitButton);

        // Wait for validation errors
        expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
        expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
    });
});
