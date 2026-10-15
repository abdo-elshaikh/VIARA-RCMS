import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import Modal from '../Modal';

const ModalHarness = () => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>Open details</button>
            <Modal isOpen={open} onClose={() => setOpen(false)} title="Patient details">
                <button type="button">First action</button>
                <button type="button">Last action</button>
            </Modal>
        </>
    );
};

describe('Modal accessibility', () => {
    it('labels the dialog, traps focus, closes with Escape, and restores focus', async () => {
        render(<ModalHarness />);
        const trigger = screen.getByRole('button', { name: 'Open details' });
        trigger.focus();
        fireEvent.click(trigger);

        const dialog = screen.getByRole('dialog', { name: 'Patient details' });
        const close = screen.getByRole('button', { name: 'Close' });
        const last = screen.getByRole('button', { name: 'Last action' });
        await waitFor(() => expect(close).toHaveFocus());

        last.focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(close).toHaveFocus();

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(dialog).not.toBeInTheDocument();
        await waitFor(() => expect(trigger).toHaveFocus());
    });

    it('skips hidden controls when choosing and trapping focus', async () => {
        render(
            <>
                <button type="button">Open hidden control test</button>
                <Modal isOpen onClose={() => {}} title="Patient details">
                    <button type="button" style={{ display: 'none' }}>Hidden action</button>
                    <button type="button">Visible action</button>
                </Modal>
            </>
        );

        const dialog = screen.getByRole('dialog', { name: 'Patient details' });
        const close = screen.getByRole('button', { name: 'Close' });
        const visible = screen.getByRole('button', { name: 'Visible action' });
        await waitFor(() => expect(close).toHaveFocus());

        visible.focus();
        fireEvent.keyDown(dialog, { key: 'Tab' });
        expect(close).toHaveFocus();
    });

    it('supports a viewport-sized workspace with a persistent footer', () => {
        render(
            <Modal isOpen onClose={() => {}} title="Book Appointment" size="full" footer={<button type="submit">Confirm Booking</button>}>
                <form>Appointment fields</form>
            </Modal>
        );

        const dialog = screen.getByRole('dialog', { name: 'Book Appointment' });
        expect(dialog).toHaveClass('h-[100dvh]', 'max-w-none', 'rounded-none');
        expect(screen.getByRole('button', { name: 'Confirm Booking' })).toBeInTheDocument();
    });

    it('closes only when the backdrop itself is pressed', () => {
        const onClose = vi.fn();
        render(
            <Modal isOpen onClose={onClose} title="Patient details">
                <button type="button">Inner action</button>
            </Modal>
        );

        fireEvent.mouseDown(screen.getByRole('button', { name: 'Inner action' }));
        expect(onClose).not.toHaveBeenCalled();

        fireEvent.mouseDown(screen.getByRole('dialog').parentElement);
        expect(onClose).toHaveBeenCalledOnce();
    });
});
