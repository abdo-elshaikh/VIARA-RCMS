import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Pagination from '../Pagination';

describe('Pagination', () => {
    it('uses one numbered navigation pattern and reports the selected page', () => {
        const onPageChange = vi.fn();
        render(<Pagination currentPage={5} pageCount={12} onPageChange={onPageChange} />);

        expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
        expect(screen.getByRole('button', { current: 'page' })).toHaveTextContent('5');

        fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
        expect(onPageChange).toHaveBeenCalledWith(6);
    });

    it('provides localized RTL navigation labels and disables the first-page control', () => {
        const onPageChange = vi.fn();
        render(<Pagination currentPage={1} pageCount={3} onPageChange={onPageChange} isRtl />);

        const navigation = screen.getByRole('navigation', { name: 'ترقيم الصفحات' });
        expect(navigation).toHaveAttribute('dir', 'rtl');
        expect(screen.getByRole('button', { name: 'الصفحة السابقة' })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'الصفحة التالية' }));
        expect(onPageChange).toHaveBeenCalledWith(2);
    });
});
