import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import ChatBubble from '../ChatBubble';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
        useLocation: () => ({ pathname: '/dashboard' }),
    };
});

vi.mock('../../../utils/audioChime', () => ({
    playHospitalChime: vi.fn(),
}));

vi.mock('../../../store/api', () => ({
    useGetChatUnreadSummaryQuery: () => ({ data: { total: 3 } }),
    useGetChatChannelsQuery: () => ({
        data: [
            { channel_id: 'general', name: 'general', display_name: 'General Hub', description: 'Center-wide announcements' },
            { channel_id: 'radiology', name: 'radiology', display_name: 'Radiology Desk', description: 'Technicians and radiologists' }
        ]
    }),
    useGetChatUsersQuery: () => ({
        data: [
            { user_id: 'user-2', full_name: 'Sara Reception', role: 'Receptionist', isOnline: true, unread_count: 2 },
            { user_id: 'user-3', full_name: 'Dr. Ahmed', role: 'Radiologist', isOnline: false, unread_count: 1 }
        ],
        refetch: vi.fn()
    }),
    useGetPatientConversationsQuery: () => ({ data: [], refetch: vi.fn() }),
    useGetDoctorConversationsQuery: () => ({ data: [], refetch: vi.fn() }),
    useGetChatMessagesQuery: () => ({ data: [], refetch: vi.fn() }),
    useGetPatientMessageHistoryQuery: () => ({ data: [], refetch: vi.fn() }),
    useGetDoctorMessageHistoryQuery: () => ({ data: [], refetch: vi.fn() }),
    useSendChatMessageMutation: () => [vi.fn().mockResolvedValue({}), { isLoading: false }],
    useSendPatientReplyMutation: () => [vi.fn().mockResolvedValue({}), { isLoading: false }],
    useSendDoctorReplyMutation: () => [vi.fn().mockResolvedValue({}), { isLoading: false }],
}));

const createStore = () => configureStore({
    reducer: {
        auth: (state = { user: { user_id: 'user-1', name: 'Dr. John', role: 'Admin' } }) => state,
    }
});

const renderComponent = () => {
    const store = createStore();
    return render(
        <Provider store={store}>
            <MemoryRouter>
                <ChatBubble />
            </MemoryRouter>
        </Provider>
    );
};

describe('ChatBubble Component Redesign', () => {
    beforeEach(() => {
        mockNavigate.mockClear();
    });

    it('renders the floating launcher button with unread badge count', () => {
        renderComponent();
        const launcher = screen.getByRole('button', { name: /open live chat/i });
        expect(launcher).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('opens the chat panel upon clicking the launcher and displays channels and users', () => {
        renderComponent();
        const launcher = screen.getByRole('button', { name: /open live chat/i });
        fireEvent.click(launcher);

        expect(screen.getByText(/live chat/i)).toBeInTheDocument();
        expect(screen.getByText(/General Hub/i)).toBeInTheDocument();
        expect(screen.getByText(/Sara Reception/i)).toBeInTheDocument();
    });

    it('filters channels and colleagues in real-time using search input', () => {
        renderComponent();
        const launcher = screen.getByRole('button', { name: /open live chat/i });
        fireEvent.click(launcher);

        const searchInput = screen.getByPlaceholderText(/search chats/i);
        fireEvent.change(searchInput, { target: { value: 'radiology' } });

        expect(screen.getByText(/Radiology Desk/i)).toBeInTheDocument();
        expect(screen.queryByText(/General Hub/i)).not.toBeInTheDocument();
    });

    it('closes the chat panel when close button is clicked', () => {
        renderComponent();
        const launcher = screen.getByRole('button', { name: /open live chat/i });
        fireEvent.click(launcher);

        const closeBtn = screen.getByRole('button', { name: /close chat/i });
        fireEvent.click(closeBtn);

        expect(screen.queryByText(/live chat/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /open live chat/i })).toBeInTheDocument();
    });
});
