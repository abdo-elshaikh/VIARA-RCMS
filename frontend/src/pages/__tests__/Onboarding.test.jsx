import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    authenticatedFetch: vi.fn(),
    navigate: vi.fn(),
    license: { isTrial: false, daysRemaining: null, loading: false },
}));

vi.mock('../../utils/authenticatedFetch', () => ({
    authenticatedFetch: (...args) => mocks.authenticatedFetch(...args),
}));

vi.mock('../../hooks/useLicense', () => ({
    useLicense: () => mocks.license,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mocks.navigate };
});

import Onboarding from '../Onboarding';

const okResponse = { ok: true, status: 200 };

const renderWizard = () => render(
    <MemoryRouter>
        <Onboarding />
    </MemoryRouter>
);

const clickByText = (pattern) => fireEvent.click(screen.getByText(pattern));

/** Walk the wizard to the center-info step. */
const goToCenterStep = () => {
    clickByText(/ابدأ الإعداد/);
    return screen.findByText('معلومات المركز');
};

/** Fill and submit the center name, returning once the step advances. */
const submitCenterName = async () => {
    fireEvent.change(screen.getByPlaceholderText('مركز الأشعة التخصصي'), {
        target: { value: 'مركز النور للأشعة' },
    });
    fireEvent.click(screen.getByText('التالي ←'));
    return screen.findByText('أضف أول طبيب وغرفة');
};

/** Advance from the doctor step to the appointment step. */
const goToAppointmentStep = async () => {
    fireEvent.click(screen.getByText('التالي ←'));
    await waitFor(() => expect(document.getElementById('onboarding-step4-book')).toBeTruthy());
};

describe('Onboarding wizard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        mocks.license = { isTrial: false, daysRemaining: null, loading: false };
        mocks.authenticatedFetch.mockResolvedValue(okResponse);
    });

    // ── Defect 1: the wizard wrote to an endpoint that does not exist ────

    it('saves the center profile to the real settings endpoint', async () => {
        renderWizard();
        await goToCenterStep();
        await submitCenterName();

        await waitFor(() => expect(mocks.authenticatedFetch).toHaveBeenCalled());
        const [url, options] = mocks.authenticatedFetch.mock.calls[0];
        expect(url).toContain('/settings/center');
        expect(url).not.toContain('center-info');
        expect(options.method).toBe('PUT');
        expect(JSON.parse(options.body).center_name).toBe('مركز النور للأشعة');
    });

    // ── Defect 2: fetch resolves on 4xx/5xx, so the status must be read ──

    it('surfaces a warning and stays put when the backend rejects the write', async () => {
        mocks.authenticatedFetch.mockResolvedValue({ ok: false, status: 403 });
        renderWizard();
        await goToCenterStep();

        fireEvent.change(screen.getByPlaceholderText('مركز الأشعة التخصصي'), {
            target: { value: 'مركز النور للأشعة' },
        });
        fireEvent.click(screen.getByText('التالي ←'));

        // A rejected write must not be reported as a silent success, and the
        // warning has to stay on screen long enough to be read.
        expect(await screen.findByText(/تعذّر حفظ معلومات المركز/)).toBeTruthy();
        expect(screen.getByText('معلومات المركز')).toBeTruthy();
    });

    it('never traps the installer when the save fails — continue anyway advances', async () => {
        mocks.authenticatedFetch.mockRejectedValue(new Error('offline'));
        renderWizard();
        await goToCenterStep();

        fireEvent.change(screen.getByPlaceholderText('مركز الأشعة التخصصي'), {
            target: { value: 'مركز النور للأشعة' },
        });
        fireEvent.click(screen.getByText('التالي ←'));
        await screen.findByText(/تعذّر حفظ معلومات المركز/);

        fireEvent.click(screen.getByText('متابعة على أي حال'));

        expect(await screen.findByText('أضف أول طبيب وغرفة')).toBeTruthy();
    });

    it('lets the installer retry a failed save from the same step', async () => {
        mocks.authenticatedFetch.mockResolvedValueOnce({ ok: false, status: 500 });
        renderWizard();
        await goToCenterStep();

        fireEvent.change(screen.getByPlaceholderText('مركز الأشعة التخصصي'), {
            target: { value: 'مركز النور للأشعة' },
        });
        fireEvent.click(screen.getByText('التالي ←'));
        await screen.findByText(/تعذّر حفظ معلومات المركز/);

        mocks.authenticatedFetch.mockResolvedValueOnce(okResponse);
        fireEvent.click(screen.getByText('التالي ←'));

        // Second attempt succeeds, so the wizard advances on its own.
        expect(await screen.findByText('أضف أول طبيب وغرفة')).toBeTruthy();
        const centerSaveCalls = mocks.authenticatedFetch.mock.calls.filter(c => c[0].includes('/settings/center'));
        expect(centerSaveCalls).toHaveLength(2);
    });

    // ── Defect 3: trial copy was shown to paying customers ───────────────

    it('shows unlimited-appointment wording on a paid edition', async () => {
        renderWizard();
        await goToCenterStep();
        await submitCenterName();
        await goToAppointmentStep();

        expect(screen.getByText('المواعيد غير محدودة')).toBeTruthy();
        expect(screen.queryByText('المواعيد في النسخة التجريبية')).toBeNull();
    });

    it('shows the trial quota wording on a trial edition', async () => {
        mocks.license = { isTrial: true, daysRemaining: 12, loading: false };
        renderWizard();
        await goToCenterStep();
        await submitCenterName();
        await goToAppointmentStep();

        expect(screen.getByText('المواعيد في النسخة التجريبية')).toBeTruthy();
    });

    it('never renders trial countdown copy on a paid edition', async () => {
        renderWizard();
        await goToCenterStep();
        await submitCenterName();
        await goToAppointmentStep();
        fireEvent.click(screen.getByText('تخطي'));

        expect(await screen.findByText(/جميع الميزات متاحة في اشتراكك/)).toBeTruthy();
        expect(document.getElementById('onboarding-contact-btn')).toBeTruthy();
        expect(document.getElementById('onboarding-upgrade-btn')).toBeNull();
    });

    it('shows the remaining trial days and the upgrade CTA on a trial edition', async () => {
        mocks.license = { isTrial: true, daysRemaining: 12, loading: false };
        renderWizard();
        await goToCenterStep();
        await submitCenterName();
        await goToAppointmentStep();
        fireEvent.click(screen.getByText('تخطي'));

        expect(await screen.findByText(/لديك/)).toBeTruthy();
        expect(document.getElementById('trial-days')?.textContent).toBe('12');
        expect(document.getElementById('onboarding-upgrade-btn')).toBeTruthy();
        expect(document.getElementById('onboarding-contact-btn')).toBeNull();
    });

    it('waits for the license before rendering edition-specific copy', async () => {
        mocks.license = { isTrial: true, daysRemaining: 5, loading: true };
        renderWizard();
        await goToCenterStep();
        await submitCenterName();
        fireEvent.click(screen.getByText('التالي ←'));

        // Still loading: no step body yet, so trial wording cannot flash on a
        // paid install before the license resolves.
        expect(screen.queryByText('المواعيد غير محدودة')).toBeNull();
        expect(screen.queryByText('المواعيد في النسخة التجريبية')).toBeNull();
    });

    // ── Completion marker ────────────────────────────────────────────────

    it('marks onboarding complete and returns to the dashboard on finish', async () => {
        renderWizard();
        await goToCenterStep();
        await submitCenterName();
        await goToAppointmentStep();
        fireEvent.click(screen.getByText('تخطي'));

        fireEvent.click(await screen.findByText('ابدأ الاستخدام →'));

        expect(localStorage.getItem('viara_onboarding_complete')).toBe('1');
        expect(mocks.navigate).toHaveBeenCalledWith('/dashboard');
    });

    it('asks for confirmation before discarding the wizard', async () => {
        renderWizard();
        await goToCenterStep();

        // Skipping is gated behind a confirmation so the wizard is not
        // discarded by a stray click. Drive it by id so these tests do not
        // depend on the Arabic label wording.
        fireEvent.click(document.getElementById('onboarding-skip-all'));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(localStorage.getItem('viara_onboarding_complete')).toBeNull();

        fireEvent.click(document.getElementById('skip-modal-cancel'));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(localStorage.getItem('viara_onboarding_complete')).toBeNull();
    });

    it('marks onboarding complete when the installer confirms skipping', async () => {
        renderWizard();
        await goToCenterStep();

        fireEvent.click(document.getElementById('onboarding-skip-all'));
        fireEvent.click(document.getElementById('skip-modal-confirm'));

        expect(localStorage.getItem('viara_onboarding_complete')).toBe('1');
        expect(mocks.navigate).toHaveBeenCalledWith('/dashboard');
    });

    // ── License file / paste activation in wizard ─────────────────────────

    it('activates a license key when pasted directly and auto-fills center name', async () => {
        mocks.authenticatedFetch.mockImplementation(async (url) => {
            if (url.includes('/license/activate')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        license: {
                            customerId: 'مركز الشفاء للأشعة',
                            edition: 'standard',
                            daysRemaining: 365,
                            maxUsers: 10
                        }
                    })
                };
            }
            return okResponse;
        });

        renderWizard();
        await goToCenterStep();

        // Toggle paste input
        fireEvent.click(document.getElementById('toggle-license-paste-btn'));
        const pasteInput = document.getElementById('onboarding-license-paste-input');
        expect(pasteInput).toBeInTheDocument();

        fireEvent.change(pasteInput, { target: { value: 'eyJ2IjoxLCJjdXN0b21lci...fake-key' } });
        fireEvent.click(document.getElementById('activate-pasted-license-btn'));

        // Expect success box and auto-filled center name
        await waitFor(() => expect(screen.getByText(/تم تفعيل مفتاح الترخيص بنجاح/)).toBeInTheDocument());
        expect(screen.getByDisplayValue('مركز الشفاء للأشعة')).toBeInTheDocument();
    });

    it('surfaces error message when pasted license key is rejected', async () => {
        mocks.authenticatedFetch.mockImplementation(async (url) => {
            if (url.includes('/license/activate')) {
                return {
                    ok: false,
                    status: 400,
                    json: async () => ({
                        success: false,
                        error: 'فشل التحقق من التوقيع الرقمي للترخيص'
                    })
                };
            }
            return okResponse;
        });

        renderWizard();
        await goToCenterStep();

        fireEvent.click(document.getElementById('toggle-license-paste-btn'));
        const pasteInput = document.getElementById('onboarding-license-paste-input');
        fireEvent.change(pasteInput, { target: { value: 'corrupted-key' } });
        fireEvent.click(document.getElementById('activate-pasted-license-btn'));

        await waitFor(() => expect(screen.getByText(/فشل التحقق من التوقيع الرقمي/)).toBeInTheDocument());
    });

    it('reads and activates a license from an uploaded .txt file', async () => {
        mocks.authenticatedFetch.mockImplementation(async (url) => {
            if (url.includes('/license/activate')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        license: {
                            customerId: 'مركز السلام التخصصي',
                            edition: 'trial',
                            daysRemaining: 30,
                            maxUsers: 3
                        }
                    })
                };
            }
            return okResponse;
        });

        renderWizard();
        await goToCenterStep();

        const fileInput = document.getElementById('onboarding-license-file-input');
        expect(fileInput).toBeInTheDocument();

        const file = new File(['eyJ2Ijox...valid-trial-key'], 'viara-license.txt', { type: 'text/plain' });
        fireEvent.change(fileInput, { target: { files: [file] } });

        await waitFor(() => expect(screen.getByText(/تم تفعيل مفتاح الترخيص بنجاح/)).toBeInTheDocument());
        expect(screen.getByText(/مركز السلام التخصصي/)).toBeInTheDocument();
        expect(screen.getByDisplayValue('مركز السلام التخصصي')).toBeInTheDocument();
    });

    // ── Clinical Demo Data Selection / Omission ───────────────────────────

    it('triggers demo data seed endpoint when demo option is enabled', async () => {
        renderWizard();
        await goToCenterStep();

        // Verify demo card is rendered with default "include demo" enabled
        const demoIncludeRadio = document.getElementById('onboarding-demo-include');
        expect(demoIncludeRadio).toBeInTheDocument();
        expect(demoIncludeRadio).toBeChecked();

        await submitCenterName();

        // Expect authenticatedFetch was called with /settings/demo-seed
        const demoSeedCalls = mocks.authenticatedFetch.mock.calls.filter(c => c[0].includes('/settings/demo-seed'));
        expect(demoSeedCalls).toHaveLength(1);
        expect(demoSeedCalls[0][1].method).toBe('POST');
    });

    it('omits demo data seed endpoint when installer chooses clean start', async () => {
        renderWizard();
        await goToCenterStep();

        // Select the "omit demo data / clean start" option
        const demoSkipRadio = document.getElementById('onboarding-demo-skip');
        expect(demoSkipRadio).toBeInTheDocument();
        fireEvent.click(demoSkipRadio);
        expect(demoSkipRadio).toBeChecked();

        await submitCenterName();

        // Expect /settings/demo-seed was NOT called
        const demoSeedCalls = mocks.authenticatedFetch.mock.calls.filter(c => c[0].includes('/settings/demo-seed'));
        expect(demoSeedCalls).toHaveLength(0);
    });

    it('renders clean database box on step 4 when demo data is skipped', async () => {
        renderWizard();
        await goToCenterStep();

        // Choose clean start
        fireEvent.click(document.getElementById('onboarding-demo-skip'));
        await submitCenterName();
        await goToAppointmentStep();

        // Should display clean database confirmation box
        expect(document.getElementById('onboarding-demo-clean-box')).toBeInTheDocument();
        expect(screen.getByText(/قاعدة بيانات نظيفة وجاهزة/)).toBeInTheDocument();
        expect(document.getElementById('onboarding-demo-seeded-box')).toBeNull();
    });

    it('renders demo seeded box on step 4 when demo data is included', async () => {
        renderWizard();
        await goToCenterStep();

        // Keep default include demo
        await submitCenterName();
        await goToAppointmentStep();

        // Should display seeded demo confirmation box
        expect(document.getElementById('onboarding-demo-seeded-box')).toBeInTheDocument();
        expect(screen.getByText(/تم تجهيز مرضى ومواعيد تجريبية/)).toBeInTheDocument();
        expect(document.getElementById('onboarding-demo-clean-box')).toBeNull();
    });
});

