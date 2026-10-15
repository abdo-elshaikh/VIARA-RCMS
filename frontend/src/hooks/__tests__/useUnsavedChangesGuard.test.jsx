import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useUnsavedChangesGuard from '../useUnsavedChangesGuard';
import { confirmNavigation } from '../../utils/navigationGuard';

describe('useUnsavedChangesGuard', () => {
    it('blocks internal navigation when isDirty is true and user declines', () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const { unmount } = renderHook(({ dirty }) => useUnsavedChangesGuard(dirty, 'Discard changes?'), {
            initialProps: { dirty: true },
        });

        expect(confirmNavigation()).toBe(false);
        expect(confirmSpy).toHaveBeenCalledWith('Discard changes?');

        confirmSpy.mockRestore();
        unmount();
    });

    it('allows internal navigation when isDirty is true and user confirms', () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const { unmount } = renderHook(({ dirty }) => useUnsavedChangesGuard(dirty, 'Discard changes?'), {
            initialProps: { dirty: true },
        });

        expect(confirmNavigation()).toBe(true);

        confirmSpy.mockRestore();
        unmount();
    });

    it('allows internal navigation freely when isDirty is false', () => {
        const confirmSpy = vi.spyOn(window, 'confirm');
        const { unmount } = renderHook(({ dirty }) => useUnsavedChangesGuard(dirty), {
            initialProps: { dirty: false },
        });

        expect(confirmNavigation()).toBe(true);
        expect(confirmSpy).not.toHaveBeenCalled();

        unmount();
    });
});
