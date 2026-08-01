import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
