import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import ConfirmDialog from '../ConfirmDialog';

describe('ConfirmDialog', () => {
    it('prevents duplicate destructive submissions and stays open when confirmation fails', async () => {
        let resolveConfirmation;
        const onConfirm = vi.fn(() => new Promise(resolve => { resolveConfirmation = resolve; }));
        const onClose = vi.fn();
        render(<ConfirmDialog isOpen onClose={onClose} onConfirm={onConfirm} title="Delete patient?" message="This cannot be undone." confirmLabel="Delete" />);

        const confirm = screen.getByRole('button', { name: 'Delete' });
        fireEvent.click(confirm);
        fireEvent.click(confirm);
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(confirm).toBeDisabled();

        resolveConfirmation(false);
        await waitFor(() => expect(confirm).not.toBeDisabled());
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
});
