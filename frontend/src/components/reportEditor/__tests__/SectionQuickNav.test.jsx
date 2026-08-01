import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SectionQuickNav } from '../ui';

const translate = (key) => key;

afterEach(() => vi.restoreAllMocks());

describe('SectionQuickNav', () => {
    it('resolves configured icon names to React components', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { container } = render(
            <SectionQuickNav
                sections={{
                    clinicalHistory: '',
                    technique: '',
                    findings: '',
                    impression: '',
                    recommendations: ''
                }}
                activeSection="findings"
                completion={0}
                onSelect={() => {}}
                t={translate}
            />
        );

        expect(screen.getByRole('navigation')).toBeInTheDocument();
        expect(container.querySelectorAll('svg')).toHaveLength(6);
        expect(
            container.querySelector(
                'monitor, filetext, clipboardcheck, checkcircle2'
            )
        ).not.toBeInTheDocument();
        expect(consoleError).not.toHaveBeenCalled();
    });
});
