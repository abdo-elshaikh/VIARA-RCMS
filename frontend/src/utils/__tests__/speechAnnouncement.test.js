import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANNOUNCEMENT_PRESETS, announcePatientCall, cancelAnnouncement, buildAnnouncementText, getSpokenToken } from '../speechAnnouncement';

describe('spoken patient calls', () => {
    afterEach(() => { cancelAnnouncement(); vi.useRealTimers(); vi.unstubAllGlobals(); });
    it.each([['Male', 'السيد', 'Mr.'], ['Female', 'السيدة', 'Ms.']])('speaks %s titles in both languages and repeats', (gender, arTitle, enTitle) => {
        vi.useFakeTimers();
        const spoken = [];
        vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text; } });
        vi.stubGlobal('speechSynthesis', {
            cancel: vi.fn(), getVoices: () => [{ lang: 'ar-EG', name: 'Arabic', voiceURI: 'ar' }, { lang: 'en-US', name: 'English', voiceURI: 'en' }],
            speak: utterance => { spoken.push(utterance); utterance.onend(); },
        });
        const finished = vi.fn();
        announcePatientCall({ tokenNumber: '12', patientName: 'Test Patient', roomName: 'Suite 1', gender, withChime: false, repeatCount: 2, announcementLanguage: 'ar_then_en', onAllFinished: finished });
        vi.advanceTimersByTime(2000);
        expect(spoken).toHaveLength(4);
        for (const index of [0, 2]) expect(spoken[index].text).toContain(`${arTitle} Test Patient`);
        for (const index of [1, 3]) expect(spoken[index].text).toContain(`${enTitle} Test Patient`);
        expect(finished).toHaveBeenCalledTimes(1);
    });
});

describe('getSpokenToken', () => {
    it('keeps a compact numeric suffix for traditional order references', () => {
        expect(getSpokenToken('ORD-2026-005845')).toBe('5845');
    });

    it('compacts long alphanumeric order references for public displays', () => {
        expect(getSpokenToken('ORD-20260916-C0256325BA')).toBe('6325');
    });

    it('limits references without digits to a readable public token', () => {
        expect(getSpokenToken('ORDER-ABCDEFGH')).toBe('CDEFGH');
    });
});

describe('buildAnnouncementText', () => {
    it.each([
        ['Male', true, 'السيد'], ['Female', true, 'السيدة'],
        ['ذكر', false, 'Mr.'], ['أنثى', false, 'Ms.'],
        ['أُنثى', true, 'السيدة'], ['F', true, 'السيدة'],
    ])('keeps the correct title for %s in initial and repeat calls', (gender, isArabic, title) => {
        for (const isRepeat of [false, true]) {
            const text = buildAnnouncementText({ spokenToken: '12', cleanPatient: 'Test Patient', cleanRoom: 'Suite 1', gender, isArabic, isRepeat });
            expect(text).toContain(`${title} Test Patient`);
        }
    });

    it('pronounces English ticket digits in English in clarity mode', () => {
        const text = buildAnnouncementText({ spokenToken: '106', cleanRoom: 'Suite 1', isArabic: false, tokenPronunciation: 'digits' });
        expect(text).toContain('one, zero, six');
        expect(text).not.toContain('واحد');
    });
    it('announces the token and full patient name in natural Arabic with polite honorific', () => {
        const text = buildAnnouncementText({
            spokenToken: '4',
            cleanPatient: 'ليلى فاروق أحمد',
            cleanRoom: 'جناح 501',
            floorPhrase: '',
            isArabic: true,
        });

        expect(text).toContain('صاحب الدور رقم 4');
        expect(text).toContain('المريض ليلى فاروق أحمد');
        expect(text).toContain('جناح 501');
        expect(text).not.toContain('المراجع');
    });

    it('supports gender-aware honorific when specified', () => {
        const textFemale = buildAnnouncementText({
            spokenToken: '12',
            cleanPatient: 'ليلى فاروق أحمد',
            cleanRoom: 'جناح 201',
            floorPhrase: '',
            isArabic: true,
            gender: 'female',
        });

        expect(textFemale).toContain('السيدة ليلى فاروق أحمد');
        expect(textFemale).not.toContain('المراجع');

        const textMale = buildAnnouncementText({
            spokenToken: '15',
            cleanPatient: 'أحمد محمد علي',
            cleanRoom: 'جناح 202',
            floorPhrase: '',
            isArabic: true,
            gender: 'male',
        });

        expect(textMale).toContain('السيد أحمد محمد علي');
        expect(textMale).not.toContain('المراجع');
    });

    it('uses a general patient title when gender is unknown', () => {
        const text = buildAnnouncementText({
            spokenToken: '',
            cleanPatient: 'ليلى فاروق أحمد',
            cleanRoom: 'جناح 501',
            floorPhrase: '',
            isArabic: true,
        });

        expect(text).toContain('المريض ليلى فاروق أحمد');
        expect(text).not.toContain('الدور رقم');
        expect(text).not.toContain('المراجع');
    });

    it('keeps the repeated call concise with polite honorific', () => {
        const text = buildAnnouncementText({
            spokenToken: '4',
            cleanPatient: 'Laila Farouk',
            cleanRoom: 'Suite 501',
            floorPhrase: '',
            isArabic: false,
            isRepeat: true,
        });

        expect(text).toBe('Repeating the call. Ticket number 4, Laila Farouk, please proceed to Suite 501.');
    });

    it('supports an explicit custom honorific without changing the announcement structure', () => {
        const text = buildAnnouncementText({
            spokenToken: '8',
            cleanPatient: 'Mona Ali',
            cleanRoom: 'Suite 4',
            isArabic: false,
            honorific: 'Dr.',
        });

        expect(text).toContain('Dr. Mona Ali');
        expect(text).toContain('Ticket number 8');
    });

    it('supports digit-by-digit pronunciation for high-clarity calls', () => {
        const text = buildAnnouncementText({
            spokenToken: '6325',
            cleanPatient: '',
            cleanRoom: 'جناح 3',
            isArabic: true,
            tokenPronunciation: 'digits',
        });

        expect(text).toContain('ستة، ثلاثة، اثنان، خمسة');
    });

    it('supports custom templates and the clarity preset', () => {
        const text = buildAnnouncementText({
            spokenToken: '105',
            cleanPatient: 'محمد أحمد',
            cleanRoom: 'جناح 3',
            floorPhrase: '، بالدور الأول',
            isArabic: true,
            customTemplate: '{title} {patient}، الدور {token}، توجه إلى {room} {floor}',
            honorific: 'السيد',
        });

        expect(text).toBe('السيد محمد أحمد، الدور 105، توجه إلى جناح 3 بالدور الأول');
        expect(ANNOUNCEMENT_PRESETS.clarity.tokenPronunciation).toBe('digits');
        expect(ANNOUNCEMENT_PRESETS.concise.repeatCount).toBe(1);
    });
});
