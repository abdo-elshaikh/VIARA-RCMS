/* eslint-disable no-undef */
import { isOnboardingComplete, markOnboardingComplete, COMPLETE_KEY } from '../onboardingState';

describe('onboardingState', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('reports a fresh browser as not yet onboarded', () => {
        expect(isOnboardingComplete()).toBe(false);
    });

    it('reports completion once the wizard finishes or is skipped', () => {
        markOnboardingComplete();
        expect(isOnboardingComplete()).toBe(true);
        expect(localStorage.getItem(COMPLETE_KEY)).toBe('1');
    });

    it('treats any non-"1" marker value as incomplete', () => {
        localStorage.setItem(COMPLETE_KEY, 'true');
        expect(isOnboardingComplete()).toBe(false);
    });

    it('never traps the user in the wizard when storage is unavailable', () => {
        // Private-mode / blocked-storage behaviour: reads throw, so the user
        // must fall through to the dashboard rather than loop forever.
        const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('storage blocked');
        });
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('storage blocked');
        });

        expect(isOnboardingComplete()).toBe(true);
        expect(() => markOnboardingComplete()).not.toThrow();

        getItem.mockRestore();
        setItem.mockRestore();
    });
});
