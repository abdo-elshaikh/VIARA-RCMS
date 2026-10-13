import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TimezoneSelect, { isValidTimezone, getTimezoneOffsetString } from '../TimezoneSelect';
import i18n from '../../../i18n';

describe('TimezoneSelect Component', () => {
    let mockOnChange;

    beforeEach(async () => {
        mockOnChange = vi.fn();
        await i18n.changeLanguage('ar');
    });

    it('identifies valid and invalid IANA timezones correctly', () => {
        expect(isValidTimezone('Africa/Cairo')).toBe(true);
        expect(isValidTimezone('Asia/Riyadh')).toBe(true);
        expect(isValidTimezone('UTC')).toBe(true);
        expect(isValidTimezone('Invalid/Nowhere')).toBe(false);
        expect(isValidTimezone('')).toBe(false);
        expect(isValidTimezone(null)).toBe(false);
    });

    it('formats timezone offset string accurately', () => {
        const offset = getTimezoneOffsetString('Africa/Cairo');
        expect(offset).toMatch(/^GMT[+-]\d{2}:\d{2}$/);
    });

    it('renders current selected timezone identifier and preview card in Arabic', () => {
        render(<TimezoneSelect value="Africa/Cairo" onChange={mockOnChange} />);

        expect(screen.getByText('Africa/Cairo')).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 4, name: /القاهرة/ })).toBeInTheDocument();
        expect(screen.getByText('(مصر)')).toBeInTheDocument();
    });

    it('calls onChange when clicking a quick-pick chip', () => {
        render(<TimezoneSelect value="Africa/Cairo" onChange={mockOnChange} />);

        // Click Riyadh quick chip
        const riyadhChip = screen.getByRole('button', { name: /الرياض/i });
        fireEvent.click(riyadhChip);

        expect(mockOnChange).toHaveBeenCalledWith('Asia/Riyadh');
    });

    it('opens search dialog and allows selecting a timezone from search results', () => {
        render(<TimezoneSelect value="Africa/Cairo" onChange={mockOnChange} />);

        // Open modal
        const searchBtn = screen.getByRole('button', { name: /تغيير أو بحث عن منطقة زمنية/i });
        fireEvent.click(searchBtn);

        // Search input should be visible
        const searchInput = screen.getByPlaceholderText(/ابحث باسم المدينة/i);
        expect(searchInput).toBeInTheDocument();

        // Type "Dubai"
        fireEvent.change(searchInput, { target: { value: 'Dubai' } });

        // Click the Dubai option
        const dubaiOption = screen.getByRole('button', { name: /Asia\/Dubai/i });
        fireEvent.click(dubaiOption);

        expect(mockOnChange).toHaveBeenCalledWith('Asia/Dubai');
    });

    it('filters timezones by regional tabs', () => {
        render(<TimezoneSelect value="Africa/Cairo" onChange={mockOnChange} />);

        // Open modal
        fireEvent.click(screen.getByRole('button', { name: /تغيير أو بحث عن منطقة زمنية/i }));

        // Click Europe tab
        const europeTab = screen.getByRole('button', { name: 'أوروبا' });
        fireEvent.click(europeTab);

        expect(screen.getByText('Europe/London')).toBeInTheDocument();
    });

    it('renders in English when language is changed', async () => {
        await i18n.changeLanguage('en');
        render(<TimezoneSelect value="Africa/Cairo" onChange={mockOnChange} />);
        expect(screen.getByRole('heading', { level: 4, name: /Cairo/ })).toBeInTheDocument();
        expect(screen.getByText('(Egypt)')).toBeInTheDocument();
    });
});
