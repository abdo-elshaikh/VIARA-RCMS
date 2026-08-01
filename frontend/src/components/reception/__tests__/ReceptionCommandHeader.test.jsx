import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReceptionCommandHeader from '../ReceptionCommandHeader';

const t = (key, options) => options?.defaultValue || (typeof options === 'string' ? options : key);

describe('ReceptionCommandHeader', () => {
    it('exposes clear primary actions and date controls', () => {
        const onBook = vi.fn();
        const onDateChange = vi.fn();
        const onRefresh = vi.fn();
        const onRegister = vi.fn();
        render(
            <ReceptionCommandHeader
                isRefreshing={false}
                onBook={onBook}
                onDateChange={onDateChange}
                onRefresh={onRefresh}
                onRegister={onRegister}
                selectedDate="2026-07-06"
                t={t}
                userName="Front Desk"
            />
        );

        fireEvent.change(screen.getByLabelText('date'), { target: { value: '2026-07-07' } });
        fireEvent.click(screen.getByRole('button', { name: 'command.refresh' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add patient' }));
        fireEvent.click(screen.getByRole('button', { name: 'booking.title' }));
        expect(onDateChange).toHaveBeenCalledWith('2026-07-07');
        expect(onRefresh).toHaveBeenCalledOnce();
        expect(onRegister).toHaveBeenCalledOnce();
        expect(onBook).toHaveBeenCalledOnce();
    });
});
