import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BulkConfirmModal } from '../EndOfDayReview';

describe('End-of-day bulk confirmation lifecycle', () => {
    it('can open, close and reopen without changing hook order or leaking Escape listeners', () => {
        const onCancel = vi.fn(), onConfirm = vi.fn();
        const props = { count: 2, loading: false, onCancel, onConfirm };
        const { rerender, unmount } = render(<BulkConfirmModal {...props} intent={null} />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        rerender(<BulkConfirmModal {...props} intent="no_show" />);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'Escape' }); expect(onCancel).toHaveBeenCalledTimes(1);
        rerender(<BulkConfirmModal {...props} intent={null} />);
        fireEvent.keyDown(window, { key: 'Escape' }); expect(onCancel).toHaveBeenCalledTimes(1);
        rerender(<BulkConfirmModal {...props} intent="no_show" />);
        fireEvent.keyDown(window, { key: 'Escape' }); expect(onCancel).toHaveBeenCalledTimes(2);
        unmount(); fireEvent.keyDown(window, { key: 'Escape' }); expect(onCancel).toHaveBeenCalledTimes(2);
    });
    it('cannot dismiss during a pending bulk operation', () => {
        const onCancel = vi.fn();
        render(<BulkConfirmModal intent="no_show" count={2} loading onCancel={onCancel} onConfirm={vi.fn()} />);
        fireEvent.keyDown(window, { key: 'Escape' }); expect(onCancel).not.toHaveBeenCalled();
    });
});
