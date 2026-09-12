import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Button from '../Button';
import Card from '../Card';
import Input from '../Input';
import Select from '../Select';

describe('shared design-system contracts', () => {
    it('routes controls through the shared density, radius, color, and focus classes', () => {
        render(
            <>
                <Button variant="danger">Delete</Button>
                <Input label="Patient name" helperText="Use the legal name" />
                <Select label="Status" options={[{ value: 'active', label: 'Active' }]} />
            </>
        );

        expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('ds-button', 'ds-button-danger', 'ds-button-md');
        expect(screen.getByLabelText('Patient name')).toHaveClass('ds-field');
        expect(screen.getByLabelText('Status')).toHaveClass('ds-field');
        expect(screen.getByText('Use the legal name')).toHaveClass('ds-field-help');
    });

    it.each(['Enter', ' '])('makes clickable cards operable with the %s key', (key) => {
        const onClick = vi.fn();
        render(<Card onClick={onClick}>Open patient</Card>);
        const card = screen.getByRole('button', { name: 'Open patient' });

        fireEvent.keyDown(card, { key });

        expect(onClick).toHaveBeenCalledOnce();
        expect(card).toHaveClass('ds-card', 'ds-card-interactive');
    });
});
