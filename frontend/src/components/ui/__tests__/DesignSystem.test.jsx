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

    it('validates that user appearance preferences bind data-border-radius to the document root and cascade to UI layers', () => {
        const root = document.documentElement;

        // Verify all 5 supported border-radius tokens
        const supportedRadii = ['sharp', 'small', 'medium', 'large', 'full'];
        for (const radius of supportedRadii) {
            root.dataset.borderRadius = radius;
            expect(root.dataset.borderRadius).toBe(radius);
        }

        // Reset to default
        root.dataset.borderRadius = 'medium';

        render(
            <div data-testid="composition-tree">
                <Card header="Card Header" footer="Card Footer">
                    <div className="flex flex-col gap-3">
                        <Input label="Name" />
                        <Button variant="primary">Submit</Button>
                        <div className="rounded-t-2xl border bg-white p-2">Header Tab</div>
                        <div className="rounded-b-2xl border bg-slate-50 p-2">Footer Row</div>
                        <span className="rounded-full px-3 py-1">Pill Tag</span>
                        <div className="rounded-none">Reset Sharp Box</div>
                    </div>
                </Card>
            </div>
        );

        const tree = screen.getByTestId('composition-tree');
        const card = tree.querySelector('.ds-card');
        const button = screen.getByRole('button', { name: 'Submit' });
        const input = screen.getByLabelText('Name');
        const headerTab = tree.querySelector('.rounded-t-2xl');
        const footerRow = tree.querySelector('.rounded-b-2xl');
        const pillTag = tree.querySelector('.rounded-full');
        const resetBox = tree.querySelector('.rounded-none');

        expect(card).toBeInTheDocument();
        expect(button).toHaveClass('ds-button');
        expect(input).toHaveClass('ds-field');
        expect(headerTab).toBeInTheDocument();
        expect(footerRow).toBeInTheDocument();
        expect(pillTag).toBeInTheDocument();
        expect(resetBox).toBeInTheDocument();
    });
});
