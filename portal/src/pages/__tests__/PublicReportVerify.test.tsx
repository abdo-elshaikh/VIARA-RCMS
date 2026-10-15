import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PublicReportVerify from '../PublicReportVerify';

const language = vi.hoisted(() => ({ value: 'en' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback, i18n: { language: language.value } }) }));
vi.mock('../../store/api', () => ({ useGetPublicCenterSettingsQuery: () => ({ data: {} }) }));
vi.mock('../../components/portal/layout/PortalHeader', () => ({ PortalHeader: () => null }));
vi.mock('../../components/portal/layout/PortalFooter', () => ({ PortalFooter: () => null }));
vi.mock('../../lib/portal-identity', () => ({ resolvePortalIdentity: () => ({}) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('report approval lookup', () => {
    it.each(['en', 'ar'])('describes approval records and the content verification limit in %s', async locale => {
        language.value = locale;
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ verified: true, status: 'Finalized', verificationHash: 'a'.repeat(64), examType: 'Synthetic MRI', finalizedAt: '2026-10-14T12:00:00Z', recordConfirmed: true, contentIntegrityVerified: false, cryptographicSignatureVerified: false }) }));
        render(<MemoryRouter initialEntries={['/verify?code=' + 'a'.repeat(64)]}><PublicReportVerify /></MemoryRouter>);
        await screen.findByText(locale === 'ar' ? 'يوجد سجل اعتماد لهذا التقرير' : 'Report approval record found');
        expect(screen.getByText(locale === 'ar' ? /تؤكد هذه الخدمة بيانات الاعتماد المسجلة فقط/ : /This lookup confirms recorded approval details only/)).toBeInTheDocument();
        expect(screen.queryByText(/Cryptographic signature confirmed intact|بنسبة 100%|بنـجاح 100%|مطابقة للأصل/)).not.toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: locale === 'ar' ? 'رمز التحقق من التقرير' : 'Report verification reference' })).toBeInTheDocument();
    });
});
