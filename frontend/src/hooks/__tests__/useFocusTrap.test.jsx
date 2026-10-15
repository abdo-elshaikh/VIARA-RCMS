import React, { useRef } from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useFocusTrap, { getFocusableElements } from '../useFocusTrap';

const TrapTester = ({ isActive = true, onEscape }) => {
    const containerRef = useRef(null);
    useFocusTrap({
        containerRef,
        isActive,
        onEscape,
        lockScroll: true,
    });

    return (
        <div>
            <button type="button" data-testid="outside-before">Outside Before</button>
            <div ref={containerRef} tabIndex={-1} data-testid="trap-container">
                <button type="button" data-testid="first-inside">First</button>
                <input data-testid="second-inside" defaultValue="text" />
                <button type="button" data-testid="last-inside">Last</button>
            </div>
            <button type="button" data-testid="outside-after">Outside After</button>
        </div>
    );
};

describe('useFocusTrap', () => {
    it('includes a disclosure summary but skips its collapsed controls', () => {
        const { container, getByText } = render(<div><button>Close</button><details><summary>Administration</summary><button>Copy command</button></details></div>);
        expect(getFocusableElements(container)).toEqual([getByText('Close'), getByText('Administration')]);
        container.querySelector('details').open = true;
        expect(getFocusableElements(container)).toEqual([getByText('Close'), getByText('Administration'), getByText('Copy command')]);
    });

    it('traps tab focus cycling within container boundaries', () => {
        const { getByTestId } = render(<TrapTester isActive={true} />);
        const first = getByTestId('first-inside');
        const last = getByTestId('last-inside');

        // Focus last inside, press Tab -> should wrap to first
        last.focus();
        expect(document.activeElement).toBe(last);
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
        expect(document.activeElement).toBe(first);

        // Focus first inside, press Shift+Tab -> should wrap to last
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(document.activeElement).toBe(last);
    });

    it('invokes onEscape when Escape key is pressed', () => {
        const handleEscape = vi.fn();
        render(<TrapTester isActive={true} onEscape={handleEscape} />);

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(handleEscape).toHaveBeenCalledTimes(1);
    });
});
