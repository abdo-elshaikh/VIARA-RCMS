import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DisplayBoard from '../DisplayBoard';
import { announcePatientCall } from '../../utils/speechAnnouncement';

const state = vi.hoisted(() => ({ board: null, reduced: false }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }));
vi.mock('framer-motion', async () => ({ ...await vi.importActual('framer-motion'), useReducedMotion: () => state.reduced }));
vi.mock('../../store/api', () => ({ useGetDisplayBoardQuery: () => ({ data: state.board, isLoading: false, isError: false, fulfilledTimeStamp: Date.now() }) }));
vi.mock('../../utils/audioChime', () => ({ playHospitalChime: vi.fn(), isAudioSuspended: () => false, unlockAudio: vi.fn().mockResolvedValue() }));
vi.mock('../../utils/speechAnnouncement', async () => ({ ...await vi.importActual('../../utils/speechAnnouncement'), announcePatientCall: vi.fn(), cancelAnnouncement: vi.fn() }));

const board = () => ({
  center: { name: 'Test Imaging Center', nameAr: 'مركز التصوير التجريبي' },
  config: {
        patientDisplayMode: 'order_only',
        privacyMode: 'token_only',
        showTicker: false,
        muteAll: false,
        quietMode: false,
        repeatChime: false,
        announcementRate: 1,
        announcementRepeatCount: 1,
        announcementRepeatDelay: 1500,
        announcementVolume: 0.85,
        callAnnouncementMode: 'token_only',
        announcementPreset: 'default',
        announcementLanguage: 'ar',
        tokenPronunciation: 'auto',
        announcementStyle: 'formal',
        customTemplate: '',
        pronunciationDictionary: {},
        arabicVoiceURI: '',
        englishVoiceURI: '',
        rotationSpeed: 9000,
        showSummaryStats: true,
        announcementMode: 'token_only',
        boardTitle: '',
      },
  summary: { waiting: 5, inExam: 1 },
  rooms: ['MRI', 'CT'].map((modality, index) => ({
    room_id: `suite-${index}`, room_number: `0${index + 1}`, room_name: `${modality} suite`, room_status: 'Active', modality,
    machines: [{ machine_type: modality, machine_status: 'Active', current: { order_number: 'ORDER-100', queue_number: 100 }, up_next: { order_number: `ORDER-${105 + index}`, queue_number: 105 + index, patient_name: 'Private Patient' }, queue: { next: [1, 2, 3].map(n => ({ order_number: `ORDER-${110 + index * 10 + n}`, queue_number: 110 + index * 10 + n, patient_name: 'Private Patient' })) } }],
  })),
});
const mount = (url = '/display') => render(<MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><DisplayBoard /></MemoryRouter>);

describe('waiting lounge display', () => {
  it.each([['Male', 'السيد'], ['Female', 'السيدة']])('passes %s gender to speech and the visible live call', async (gender, title) => {
    state.board.config = { patientDisplayMode: 'name_and_order', callAnnouncementMode: 'token_and_name' };
    mount('/display?lang=ar');
    await act(async () => {
      window.dispatchEvent(new CustomEvent('SSE_DISPLAY_CALL', { detail: { id: `gender-${gender}`, queueNumber: 109, orderNumber: 'ORDER-109', patientName: 'Test Patient', gender, callByName: true, roomName: 'CT suite', timestamp: Date.now() } }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(`${title} Test P.`);
    expect(announcePatientCall).toHaveBeenCalledWith(expect.objectContaining({ gender, patientName: 'Test Patient', announcementMode: 'token_and_name' }));
  });
  beforeEach(() => { localStorage.clear(); state.board = board(); state.reduced = false; });
  afterEach(() => { vi.useRealTimers(); });

  it('renders the clinical layout without exposing patient names in token mode', () => {
    const { container } = mount();
    expect(screen.getByRole('heading', { name: 'Test Imaging Center' })).toBeInTheDocument();
    expect(screen.getByLabelText('Waiting queue')).toBeInTheDocument();
    expect(container.querySelector('.vb-hero-call__number')).toHaveTextContent('106');
    expect(screen.queryByText(/Private Patient/)).not.toBeInTheDocument();
    expect(container.querySelector('.vb-root')).toHaveAttribute('dir', 'ltr');
  });

  it('switches direction and theme and persists the motion preference', async () => {
    const { container } = mount('/display?lang=ar&theme=dark');
    const root = container.querySelector('.vb-root');
    expect(root).toHaveAttribute('dir', 'rtl');
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('heading', { name: 'مركز التصوير التجريبي' })).toBeInTheDocument();
    expect(screen.queryByText('A clearer view')).not.toBeInTheDocument();
    fireEvent.pointerMove(container.querySelector('.vb-header'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'تقليل الحركة' })); });
    expect(root).toHaveAttribute('data-motion', 'reduced');
    expect(localStorage.getItem('viara_tv_motion')).toBe('reduced');
  });

  it('continues rotating suites when reduced motion is enabled', () => {
    vi.useFakeTimers(); state.reduced = true;
    const { container } = mount();
    expect(container.querySelector('.vb-root')).toHaveAttribute('data-motion', 'reduced');
    fireEvent.pointerMove(container.querySelector('.vb-header'));
    expect(screen.getByRole('button', { name: 'Reduce motion' })).toBeDisabled();
    expect(container.querySelector('.vb-suite-focus')).toHaveClass('vb-suite-focus--ct');
    act(() => vi.advanceTimersByTime(9500));
    expect(container.querySelector('.vb-suite-focus')).toHaveClass('vb-suite-focus--mri');
  });

  it('shows a clear empty state without empty ticket slots when a suite has no patients', () => {
    state.board.summary = { waiting: 0, inExam: 0 };
    state.board.rooms.forEach(room => { room.machines[0] = { machine_type: room.modality, machine_status: 'Active', current: null, up_next: null, queue: { next: [] } }; });
    const { container } = mount();
    expect(screen.getByRole('heading', { name: 'No patients currently waiting' })).toBeInTheDocument();
    expect(container.querySelector('.vb-queue-steps')).toBeNull();
    expect(container.querySelector('.vb-hero-call__number')).toBeNull();
    expect(container.querySelector('.vb-card--waiting .vb-waiting-header')).toBeNull();
  });

  it('uses a modality icon when the suite photo cannot load', () => {
    const { container } = mount();
    const image = container.querySelector('.vb-suite-image__bg');
    fireEvent.error(image);
    expect(container.querySelector('.vb-suite-image__bg')).toBeNull();
    expect(container.querySelector('.vb-suite-image__icon')).toBeInTheDocument();
  });

  it('hides operator controls while idle and uses keyboard shortcuts for fullscreen and motion', async () => {
    vi.useFakeTimers();
    const { container } = mount();
    const header = container.querySelector('.vb-header');
    const tools = container.querySelector('.vb-header-tools');
    expect(tools).toHaveAttribute('hidden');
    fireEvent.pointerMove(header);
    expect(tools).not.toHaveAttribute('hidden');
    act(() => vi.advanceTimersByTime(5100));
    expect(tools).toHaveAttribute('hidden');
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }); });
  });
  it('shows a live call with the RTL route and preserves token-only privacy', async () => {
    const { container } = mount('/display?lang=ar&theme=dark');
    await act(async () => {
      window.dispatchEvent(new CustomEvent('SSE_DISPLAY_CALL', { detail: { id: 'live-call-test', queueNumber: 109, orderNumber: 'ORDER-109', patientName: 'Private Patient', roomName: 'CT suite', timestamp: Date.now() } }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('#109');
    expect(container.querySelector('.vb-call-route .lucide-arrow-left')).toBeInTheDocument();
    expect(container.querySelector('.vb-call-token')).toHaveAttribute('dir', 'ltr');
    expect(screen.queryByText(/Private Patient/)).not.toBeInTheDocument();
  });
});
