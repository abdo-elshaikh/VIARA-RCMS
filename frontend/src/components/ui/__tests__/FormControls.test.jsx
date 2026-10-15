import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../../../i18n';
import Input from '../Input';
import Select from '../Select';

describe('form controls accessibility', () => {
    it('connects generated input labels and validation messages', () => {
        render(<Input label="Patient name" error="Name is required" required />);
        const input = screen.getByRole('textbox', { name: /Patient name/i });
        const error = screen.getByRole('alert');

        expect(input).toBeRequired();
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(input).toHaveAttribute('aria-errormessage', error.id);
        expect(input).toHaveAttribute('aria-describedby', error.id);
    });

    it('connects select validation messages with aria-errormessage', () => {
        render(<Select label="Modality" error="Modality is required" options={[]} />);
        const select = screen.getByRole('combobox', { name: 'Modality' });
        const error = screen.getByRole('alert');

        expect(select).toHaveAttribute('aria-invalid', 'true');
        expect(select).toHaveAttribute('aria-errormessage', error.id);
    });

    it('connects select labels and helper text without a supplied id', () => {
        render(<Select label="Modality" helperText="Choose the acquisition device" options={[{ value: 'ct', label: 'CT' }]} />);
        const select = screen.getByRole('combobox', { name: 'Modality' });
        const helper = screen.getByText('Choose the acquisition device');

        expect(select).toHaveAttribute('aria-describedby', helper.id);
    });
});
