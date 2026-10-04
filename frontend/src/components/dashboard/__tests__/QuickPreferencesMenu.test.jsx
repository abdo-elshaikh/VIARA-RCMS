import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuickPreferencesMenu from '../QuickPreferencesMenu';

describe('QuickPreferencesMenu', () => {
    let mockUpdatePreference;
    let mockResetDefaults;
    let mockClose;
    let mockGoTo;
    const defaultPrefs = {
        theme: 'light',
        primaryColor: 'emerald',
        density: 'comfortable',
        fontScale: 'normal',
        highContrast: false,
        motion: 'system',
        compactSidebar: false,
        timeFormat: '12h',
        notificationSound: false,
        soundVolume: 0.5,
    };

    const mockT = (key, opts) => opts?.defaultValue || key;

    beforeEach(() => {
        mockUpdatePreference = vi.fn();
        mockResetDefaults = vi.fn();
        mockClose = vi.fn();
        mockGoTo = vi.fn();
    });

    const renderMenu = (prefs = defaultPrefs, isRtl = false) => {
        return render(
            <QuickPreferencesMenu
                preferences={prefs}
                onUpdatePreference={mockUpdatePreference}
                onResetDefaults={mockResetDefaults}
                onClose={mockClose}
                onGoTo={mockGoTo}
                isRtl={isRtl}
                t={mockT}
                menuRef={null}
            />
        );
    };

    it('renders dialog with header, options, and actions', () => {
        renderMenu();

        expect(screen.getByRole('dialog', { name: /Quick Preferences/i })).toBeInTheDocument();
        expect(screen.getByText('Quick Preferences')).toBeInTheDocument();
        expect(screen.getByText('Theme Mode')).toBeInTheDocument();
        expect(screen.getByText('Accent Color')).toBeInTheDocument();
        expect(screen.getByText('Display Density')).toBeInTheDocument();
        expect(screen.getByText('Font Size')).toBeInTheDocument();
    });

    it('triggers theme mode update on selection', () => {
        renderMenu();

        const darkButton = screen.getByRole('button', { name: /Dark/i });
        fireEvent.click(darkButton);

        expect(mockUpdatePreference).toHaveBeenCalledWith({ theme: 'dark' });
    });

    it('triggers primary accent color update on color swatch click', () => {
        renderMenu();

        const amberButton = screen.getByRole('button', { name: /Amber/i });
        fireEvent.click(amberButton);

        expect(mockUpdatePreference).toHaveBeenCalledWith({ primaryColor: 'amber' });
    });

    it('triggers density update on choice click', () => {
        renderMenu();

        const compactButton = screen.getByRole('button', { name: /Compact/i });
        fireEvent.click(compactButton);

        expect(mockUpdatePreference).toHaveBeenCalledWith({ density: 'compact' });
    });

    it('triggers font scale update on scale click', () => {
        renderMenu();

        const largeButton = screen.getByRole('button', { name: /^A\+\s+Large$/i });
        fireEvent.click(largeButton);

        expect(mockUpdatePreference).toHaveBeenCalledWith({ fontScale: 'large' });
    });

    it('toggles visual comfort switches: high contrast, reduced motion, and compact sidebar', () => {
        renderMenu();

        // High contrast toggle
        const highContrastSwitch = screen.getByRole('switch', { name: /High Contrast/i });
        fireEvent.click(highContrastSwitch);
        expect(mockUpdatePreference).toHaveBeenCalledWith({ highContrast: true });

        // Reduce motion toggle
        const motionSwitch = screen.getByRole('switch', { name: /Reduce Motion/i });
        fireEvent.click(motionSwitch);
        expect(mockUpdatePreference).toHaveBeenCalledWith({ motion: 'reduced' });

        // Compact sidebar toggle
        const sidebarSwitch = screen.getByRole('switch', { name: /Compact Sidebar/i });
        fireEvent.click(sidebarSwitch);
        expect(mockUpdatePreference).toHaveBeenCalledWith({ compactSidebar: true });
    });

    it('toggles time format between 12h and 24h', () => {
        renderMenu({ ...defaultPrefs, timeFormat: '12h' });

        const timeButton = screen.getByText('12-hour').closest('button');
        fireEvent.click(timeButton);

        expect(mockUpdatePreference).toHaveBeenCalledWith({ timeFormat: '24h' });
    });

    it('toggles sound on and off', () => {
        renderMenu({ ...defaultPrefs, notificationSound: false });

        const soundButton = screen.getByText('Muted').closest('button');
        fireEvent.click(soundButton);

        expect(mockUpdatePreference).toHaveBeenCalledWith({ notificationSound: true });
    });

    it('tests audio chime safely when clicking test play button', () => {
        renderMenu();

        const testAudioButton = screen.getByRole('button', { name: /Test Sound/i });
        expect(testAudioButton).toBeInTheDocument();
        expect(() => fireEvent.click(testAudioButton)).not.toThrow();
    });

    it('calls reset defaults and close handlers', () => {
        renderMenu();

        const resetButton = screen.getByRole('button', { name: /Reset to defaults/i });
        fireEvent.click(resetButton);
        expect(mockResetDefaults).toHaveBeenCalledTimes(1);

        const closeButton = screen.getByRole('button', { name: /Close/i });
        fireEvent.click(closeButton);
        expect(mockClose).toHaveBeenCalledTimes(1);
    });

    it('navigates to settings and advanced appearance pages', () => {
        renderMenu();

        const advancedLink = screen.getByText('Advanced Appearance');
        fireEvent.click(advancedLink);
        expect(mockGoTo).toHaveBeenCalledWith('/settings?tab=appearance');

        const allSettingsBtn = screen.getByRole('button', { name: /All settings & preferences/i });
        fireEvent.click(allSettingsBtn);
        expect(mockGoTo).toHaveBeenCalledWith('/settings');
    });

    it('renders saving indicator when saveStatus is saving', () => {
        render(
            <QuickPreferencesMenu
                preferences={defaultPrefs}
                onUpdatePreference={mockUpdatePreference}
                onResetDefaults={mockResetDefaults}
                onClose={mockClose}
                onGoTo={mockGoTo}
                isRtl={false}
                t={mockT}
                menuRef={null}
                saveStatus="saving"
            />
        );

        expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    it('renders error indicator and triggers onRetrySave when clicked', () => {
        const mockRetry = vi.fn();
        render(
            <QuickPreferencesMenu
                preferences={defaultPrefs}
                onUpdatePreference={mockUpdatePreference}
                onResetDefaults={mockResetDefaults}
                onClose={mockClose}
                onGoTo={mockGoTo}
                isRtl={false}
                t={mockT}
                menuRef={null}
                saveStatus="error"
                onRetrySave={mockRetry}
            />
        );

        const retryBtn = screen.getByRole('button', { name: /Sync failed \(retry\)|إعادة محاولة الحفظ/i });
        expect(retryBtn).toBeInTheDocument();
        fireEvent.click(retryBtn);
        expect(mockRetry).toHaveBeenCalledTimes(1);
    });
});
