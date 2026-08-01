import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import TextPromptDialog from '../TextPromptDialog';

describe('TextPromptDialog', () => {
    it('requires a value and remains open when the operation fails', async () => {
        const onClose = vi.fn();
        const onConfirm = vi.fn().mockResolvedValue(false);
        render(<TextPromptDialog isOpen onClose={onClose} onConfirm={onConfirm} title="Save template" label="Template name" confirmLabel="Save" validationMessage="Enter a name" />);

        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Enter a name');
        expect(onConfirm).not.toHaveBeenCalled();

        fireEvent.change(screen.getByRole('textbox', { name: /Template name/i }), { target: { value: 'Normal CT' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Normal CT'));
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('blocks values rejected by custom validation', async () => {
        const onConfirm = vi.fn();
        render(<TextPromptDialog isOpen onConfirm={onConfirm} title="Record payment" label="Amount" type="number" confirmLabel="Record" validate={(value) => Number(value) > 100 ? 'Amount is too high' : ''} />);

        fireEvent.change(screen.getByRole('spinbutton', { name: /Amount/i }), { target: { value: '120' } });
        fireEvent.click(screen.getByRole('button', { name: 'Record' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Amount is too high');
        expect(onConfirm).not.toHaveBeenCalled();

        fireEvent.change(screen.getByRole('spinbutton', { name: /Amount/i }), { target: { value: '80' } });
        fireEvent.click(screen.getByRole('button', { name: 'Record' }));
        await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('80'));
    });

    it('prevents duplicate submissions while confirmation is pending', async () => {
        let resolveConfirmation;
        const onConfirm = vi.fn(() => new Promise(resolve => { resolveConfirmation = resolve; }));
        render(<TextPromptDialog isOpen onConfirm={onConfirm} title="Record pickup" label="Recipient" confirmLabel="Record" initialValue="Mona Ali" />);

        const confirm = screen.getByRole('button', { name: 'Record' });
        fireEvent.click(confirm);
        fireEvent.click(confirm);
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(confirm).toBeDisabled();

        resolveConfirmation(false);
        await waitFor(() => expect(confirm).not.toBeDisabled());
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
});
