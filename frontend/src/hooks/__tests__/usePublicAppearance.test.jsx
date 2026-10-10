/* eslint-disable no-undef */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import preferencesReducer, { DEFAULT_PREFERENCES, setTheme } from '../../store/preferencesSlice';
import usePublicAppearance from '../usePublicAppearance';

function Preview() {
    const { dark, reduceMotion } = usePublicAppearance();
    return <output>{`${dark ? 'dark' : 'light'} ${reduceMotion ? 'reduced' : 'normal'}`}</output>;
}

it('follows live system changes while preserving explicit theme and motion choices', () => {
    const media = new Map();
    vi.stubGlobal('matchMedia', vi.fn(query => {
        if (!media.has(query)) {
            const listeners = new Set();
            media.set(query, { matches: query.includes('color-scheme'), addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn), update(value) { this.matches = value; listeners.forEach(fn => fn()); }, listeners });
        }
        return media.get(query);
    }));
    const store = configureStore({ reducer: { preferences: preferencesReducer }, preloadedState: { preferences: { ...DEFAULT_PREFERENCES, theme: 'system', motion: 'reduced' } } });
    const view = render(<Provider store={store}><Preview /></Provider>);
    expect(screen.getByRole('status')).toHaveTextContent('dark reduced');
    act(() => media.get('(prefers-color-scheme: dark)').update(false));
    expect(screen.getByRole('status')).toHaveTextContent('light reduced');
    act(() => store.dispatch(setTheme('dark')));
    act(() => media.get('(prefers-color-scheme: dark)').update(false));
    expect(screen.getByRole('status')).toHaveTextContent('dark reduced');
    view.unmount();
    expect([...media.values()].every(value => value.listeners.size === 0)).toBe(true);
    vi.unstubAllGlobals();
});
