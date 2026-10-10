import { playHospitalChime } from './audioChime';

/**
 * speechAnnouncement.js – World-Class Hospital Voice Announcement System.
 *
 * Capabilities:
 *  - Distinguishes initial formal medical call vs. concise repetition call
 *  - Intelligently integrates department, suite name, and floor location
 *  - Phonetic letter-code token enhancement for Arabic pronunciation
 *  - Multi-tier voice selection favoring modern neural/natural voices (Microsoft Natural, Google, Apple)
 *  - Acoustic chime synchronization with gentle repetition chime
 *  - Chromium SpeechSynthesis auto-pause watchdog (heartbeat resume)
 *  - Safe async voice retrieval and cancellation management
 */

let activeRepeatTimer = null;
let activeWatchdogTimer = null;
let activeAnnouncementId = 0;
let activeCompletionCallback = null;

export const ANNOUNCEMENT_PRESETS = Object.freeze({
    standard: { speechRate: 1, speechPitch: 1, speechVolume: 1, repeatCount: 2, repeatDelayMs: 1500, announcementStyle: 'formal' },
    quiet: { speechRate: 0.86, speechPitch: 0.96, speechVolume: 0.7, repeatCount: 2, repeatDelayMs: 1800, announcementStyle: 'calm' },
    concise: { speechRate: 1.08, speechPitch: 1, speechVolume: 0.9, repeatCount: 1, repeatDelayMs: 1000, announcementStyle: 'short' },
    clarity: { speechRate: 0.82, speechPitch: 1.02, speechVolume: 1, repeatCount: 3, repeatDelayMs: 1800, tokenPronunciation: 'digits', announcementStyle: 'formal' },
});

const ARABIC_DIGITS = ['صفر', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];

const normalizeDictionary = (dictionary) => Object.entries(dictionary || {})
    .filter(([from, to]) => from && to != null)
    .sort(([a], [b]) => b.length - a.length);

const applyPronunciationDictionary = (value, dictionary) => normalizeDictionary(dictionary)
    .reduce((text, [from, to]) => text.replaceAll(from, String(to)), String(value || ''));

const formatTokenForMode = (token, mode = 'auto', isArabic = true) => {
    const clean = String(token || '').trim();
    if (!clean || mode === 'natural') return clean;
    if (mode === 'digits' || (mode === 'auto' && /^\d{4,}$/.test(clean))) {
        const digits = isArabic ? ARABIC_DIGITS : ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
        return clean.split('').map((digit) => /^\d$/.test(digit) ? digits[Number(digit)] : digit).join(isArabic ? '، ' : ', ');
    }
    return clean;
};

const applyAnnouncementTemplate = (template, values) => String(template || '')
    .replaceAll('{title}', values.title || '')
    .replaceAll('{patient}', values.patient || '')
    .replaceAll('{token}', values.token || '')
    .replaceAll('{room}', values.room || '')
    .replaceAll('{floor}', values.floor || '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const resolvePreset = (preset) => {
    if (!preset) return {};
    if (typeof preset === 'string') return ANNOUNCEMENT_PRESETS[preset] || {};
    return preset;
};

export const cancelAnnouncement = () => {
    activeAnnouncementId++;
    const completion = activeCompletionCallback;
    activeCompletionCallback = null;
    if (activeRepeatTimer) {
        clearTimeout(activeRepeatTimer);
        activeRepeatTimer = null;
    }
    if (activeWatchdogTimer) {
        clearInterval(activeWatchdogTimer);
        activeWatchdogTimer = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
            window.speechSynthesis.cancel();
        } catch {
            // Safe ignore
        }
    }
    completion?.();
};

/**
 * Extracts a readable spoken ticket number from arbitrary order/queue references.
 * Maintains 100% compatibility with automated tests.
 */
export const getSpokenToken = (tokenNumber) => {
    if (tokenNumber === null || tokenNumber === undefined || tokenNumber === '') return '';
    const clean = String(tokenNumber).replace(/^#/, '').trim();
    if (/^\d+$/.test(clean)) return clean;

    const letterPrefix = clean.match(/^([a-zA-Z]+)[-_/\s]*(\d+)$/);
    if (letterPrefix) {
        return `${letterPrefix[1].toUpperCase()} ${parseInt(letterPrefix[2], 10)}`;
    }

    const endDigits = clean.match(/(\d+)$/);
    if (endDigits) {
        const n = parseInt(endDigits[1], 10);
        return n > 0 ? String(n) : endDigits[1];
    }

    const segments = clean.split(/[-_/\s]+/).filter(Boolean);
    const lastSeg = segments.at(-1) || clean;
    const embeddedDigits = lastSeg.replace(/\D/g, '');
    if (embeddedDigits) {
        const chunk = embeddedDigits.slice(-4);
        const num = parseInt(chunk, 10);
        return num > 0 ? String(num) : chunk;
    }

    return lastSeg.length > 6 ? lastSeg.slice(-6) : lastSeg;
};

/**
 * Phonetically formats letter tokens (e.g., 'A 105', 'B 22') for Arabic speech synthesizers.
 */
const letterMap = {
    A: 'حرف إيه،',
    B: 'حرف بي،',
    C: 'حرف سي،',
    D: 'حرف دي،',
    E: 'حرف إي،',
    F: 'حرف إف،',
    G: 'حرف جي،',
    H: 'حرف إتش،',
    I: 'حرف آي،',
    J: 'حرف جيه،',
    K: 'حرف كيه،',
    L: 'حرف إل،',
    M: 'حرف إم،',
    N: 'حرف إن،',
    O: 'حرف أو،',
    P: 'حرف بي،',
    Q: 'حرف كيو،',
    R: 'حرف آر،',
    S: 'حرف إس،',
    T: 'حرف تي،',
    U: 'حرف يو،',
    V: 'حرف في،',
    W: 'حرف دبليو،',
    X: 'حرف إكس،',
    Y: 'حرف واي،',
    Z: 'حرف زد،',
};

const formatTokenForSpeech = (token, isArabic) => {
    if (!token) return '';
    if (!isArabic) return token;

    const match = String(token).match(/^([A-Z])\s+(\d+)$/i);
    if (match) {
        const letter = match[1].toUpperCase();
        const num = match[2];
        const spokenLetter = letterMap[letter] || letter;
        return `${spokenLetter} رقم ${num}`;
    }

    return token;
};

/**
 * Resolves the polite formal title for announcements.
 * Uses verified gender for السيد / السيدة, with a general patient title when unknown.
 */
export const resolveHonorific = (gender, isArabic = true) => {
    const g = String(gender || '').normalize('NFKC').replace(/[\u064B-\u065F\u0670]/g, '').toLowerCase().trim();
    if (['female', 'f', 'أنثى', 'انثى', 'أنثي', 'انثي'].includes(g)) return isArabic ? 'السيدة' : 'Ms.';
    if (['male', 'm', 'ذكر'].includes(g)) return isArabic ? 'السيد' : 'Mr.';
    return isArabic ? 'المريض' : 'Patient';
};

/**
 * Builds professional hospital announcement script.
 */
export const buildAnnouncementText = ({
    spokenToken,
    cleanPatient,
    cleanRoom,
    floorPhrase = '',
    isArabic,
    isRepeat = false,
    gender,
    honorific,
    announcementStyle = 'formal',
    customTemplate = '',
    tokenPronunciation = 'auto',
    pronunciationDictionary,
}) => {
    const formattedToken = formatTokenForSpeech(formatTokenForMode(spokenToken, tokenPronunciation, isArabic), isArabic);
    const title = honorific || resolveHonorific(gender, isArabic);

    if (customTemplate) {
        return applyAnnouncementTemplate(customTemplate, {
            title,
            patient: cleanPatient,
            token: formattedToken,
            room: cleanRoom,
            floor: floorPhrase.replace(/^،?\s*/, ''),
        });
    }

    const short = announcementStyle === 'short';
    const calm = announcementStyle === 'calm';

    if (isArabic) {
        if (isRepeat) {
            if (cleanPatient && formattedToken) {
                return `تكرار النداء. الدور رقم ${formattedToken}، ${title} ${cleanPatient}، يرجى التوجه إلى ${cleanRoom}.`;
            }
            if (formattedToken) {
                return `تكرار النداء. صاحب الدور رقم ${formattedToken}، يرجى التوجه إلى ${cleanRoom}.`;
            }
            if (cleanPatient) {
                return `تكرار النداء. ${title} ${cleanPatient}، يرجى التوجه إلى ${cleanRoom}.`;
            }
            return `تكرار النداء. يرجى التوجه إلى ${cleanRoom}.`;
        }

        if (cleanPatient && formattedToken) {
            return `${short ? 'الدور' : calm ? 'يرجى التكرم بالانتباه' : 'يرجى الانتباه'}. صاحب الدور رقم ${formattedToken}، ${title} ${cleanPatient}. ${short ? 'إلى' : 'يرجى التوجه الآن إلى'} ${cleanRoom}${floorPhrase}.`;
        }
        if (cleanPatient) {
            return `يرجى الانتباه. ${title} ${cleanPatient}، يرجى التوجه الآن إلى ${cleanRoom}${floorPhrase}.`;
        }
        if (formattedToken) {
            return `يرجى الانتباه. صاحب الدور رقم ${formattedToken}، يرجى التوجه الآن إلى ${cleanRoom}${floorPhrase}.`;
        }
        return `يرجى الانتباه. ${title} صاحب الدور التالي، يرجى التوجه الآن إلى ${cleanRoom}${floorPhrase}.`;
    }

    // English medical center announcements
    if (isRepeat) {
        if (cleanPatient && formattedToken) {
            return `Repeating the call. Ticket number ${formattedToken}, ${title === 'Patient' ? '' : `${title} `}${cleanPatient}, please proceed to ${cleanRoom}.`;
        }
        if (formattedToken) {
            return `Repeating announcement. Ticket number ${formattedToken}, please proceed to ${cleanRoom}.`;
        }
        if (cleanPatient) {
            const enTitle = title === 'السيد أو السيدة' || title === 'السيد' || title === 'السيدة' ? 'Patient' : title;
            return `Repeating announcement. ${enTitle} ${cleanPatient}, please proceed to ${cleanRoom}.`;
        }
        return `Repeating announcement. Please proceed to ${cleanRoom}.`;
    }

    if (cleanPatient && formattedToken) {
        const enTitle = title === 'السيد أو السيدة' || title === 'السيد' || title === 'السيدة' ? 'patient' : title;
        return `${short ? 'Ticket' : calm ? 'Please note' : 'May I have your attention'}. Ticket number ${formattedToken}, ${enTitle} ${cleanPatient}. ${short ? 'Proceed to' : 'Please proceed now to'} ${cleanRoom}${floorPhrase}.`;
    }
    if (cleanPatient) {
        const enTitle = title === 'السيد أو السيدة' || title === 'السيد' || title === 'السيدة' ? 'Patient' : title;
        return `May I have your attention. ${enTitle} ${cleanPatient}, please proceed now to ${cleanRoom}${floorPhrase}.`;
    }
    if (formattedToken) {
        return `May I have your attention. Ticket number ${formattedToken}, please proceed now to ${cleanRoom}${floorPhrase}.`;
    }
    return `Attention please. Next patient, please proceed to ${cleanRoom}${floorPhrase}.`;
};

/**
 * Scores voices to pick the most natural, human-like voice available.
 */
const scoreVoice = (voice, isArabic) => {
    const lang = voice.lang.toLowerCase();
    const name = voice.name.toLowerCase();
    let score = 0;

    if (isArabic) {
        if (!lang.startsWith('ar')) return -1000;

        // Prefer Egyptian Arabic for local deployment, then clear Gulf voices.
        if (lang.includes('eg')) score += 50;
        else if (lang.includes('sa')) score += 35;
        else if (lang.includes('ae') || lang.includes('kw') || lang.includes('qa')) score += 30;
        else score += 15;

        // Neural / Natural voices from modern Edge & Chrome
        if (name.includes('natural') || name.includes('neural')) score += 120;
        if (name.includes('online')) score += 40;
        if (!voice.localService) score += 25;

        // High-quality named personas (Salma, Zariyah, Fatima are the gold standard for healthcare announcements)
        if (/salma/i.test(name)) score += 60;
        if (/zariyah|fatima|layla/i.test(name)) score += 45;
        if (/shakir|hamed|naayf|tariq|majed/i.test(name)) score += 35;
        if (/hana|sara|mariam|hoda/i.test(name)) score += 25;

        // Penalize legacy robotic desktop SAPI voices
        if (name.includes('desktop') || name.includes('sapi')) score -= 50;
    } else {
        if (!lang.startsWith('en')) return -1000;
        if (lang.includes('us') || lang.includes('gb')) score += 20;
        if (name.includes('natural') || name.includes('neural')) score += 100;
        if (name.includes('online')) score += 40;
        if (/jenny|aria|samantha|karen|sonia|natasha|guy/i.test(name)) score += 35;
        if (name.includes('desktop')) score -= 30;
    }

    return score;
};

const selectBestVoice = (voices, isArabic) => {
    if (!voices || !voices.length) return null;
    const candidates = voices
        .filter(v => v.lang.toLowerCase().startsWith(isArabic ? 'ar' : 'en'))
        .map(v => ({ voice: v, score: scoreVoice(v, isArabic) }))
        .sort((a, b) => b.score - a.score);

    return candidates.length > 0 ? candidates[0].voice : null;
};

/**
 * Main announcement orchestrator.
 */
export const announcePatientCall = ({
    tokenNumber,
    patientName,
    roomName,
    roomFloor,
    callByName = true,
    announcementMode,
    isArabic = true,
    withChime = true,
    repeatCount = 2,
    repeatDelayMs = 1500,
    chimeBeforeRepeat = true,
    speechRate = 1,
    speechVolume = 1,
    speechPitch = 1,
    preset,
    announcementLanguage,
    tokenPronunciation = 'auto',
    announcementStyle = 'formal',
    customTemplate,
    pronunciationDictionary,
    arabicVoiceURI,
    englishVoiceURI,
    autoBestVoice = true,
    gender,
    honorific,
    onIterationEnd,
    onAllFinished
}) => {
    cancelAnnouncement();
    const currentId = ++activeAnnouncementId;
    let didFinish = false;
    const finishAll = () => {
        if (didFinish) return;
        didFinish = true;
        if (activeCompletionCallback === finishAll) activeCompletionCallback = null;
        onAllFinished?.();
    };
    activeCompletionCallback = finishAll;

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        finishAll();
        return;
    }

    try {
        const presetOptions = resolvePreset(preset);
        const effectiveRate = presetOptions.speechRate ?? speechRate;
        const effectiveVolume = presetOptions.speechVolume ?? speechVolume;
        const effectivePitch = presetOptions.speechPitch ?? speechPitch;
        const effectiveRepeatCount = presetOptions.repeatCount ?? repeatCount;
        const effectiveRepeatDelay = presetOptions.repeatDelayMs ?? repeatDelayMs;
        const effectiveStyle = presetOptions.announcementStyle ?? announcementStyle;
        const effectivePronunciation = presetOptions.tokenPronunciation ?? tokenPronunciation;
        const spokenToken = getSpokenToken(tokenNumber);
        const supportedModes = ['token_only', 'name_only', 'token_and_name'];
        const requestedMode = supportedModes.includes(announcementMode)
            ? announcementMode
            : (callByName ? 'token_and_name' : 'token_only');
        let cleanRoom = String(roomName || '')
            .replace(/\bRoom\b/gi, isArabic ? 'جناح' : 'Room')
            .replace(/جناح\s+جناح/g, 'جناح')
            .replace(/\s+/g, ' ')
            .trim();
        if (/^\d+$/.test(cleanRoom)) {
            cleanRoom = isArabic ? `جناح ${cleanRoom}` : `Suite ${cleanRoom}`;
        }

        const wantsName = requestedMode === 'name_only' || requestedMode === 'token_and_name';
        const wantsToken = requestedMode === 'token_only' || requestedMode === 'token_and_name';
        let announcementToken = wantsToken ? spokenToken : '';
        let cleanPatient = (wantsName && patientName)
            ? String(patientName).replace(/\s+/g, ' ').trim().replace(/[.,،]+$/, '')
            : '';

        // Privacy settings may withhold the name. Never produce an empty call;
        // gracefully fall back to the public ticket number instead.
        if (!cleanPatient && !announcementToken && spokenToken) announcementToken = spokenToken;
        let floorPhrase = '';
        if (roomFloor) {
            const rawFloor = String(roomFloor).trim();
            if (rawFloor) {
                if (isArabic) {
                    if (rawFloor.includes('دور') || rawFloor.includes('طابق') || rawFloor.includes('أرضي')) {
                        floorPhrase = `، في ${rawFloor}`;
                    } else {
                        floorPhrase = `، بالدور ${rawFloor}`;
                    }
                } else {
                    floorPhrase = `, on ${rawFloor}`;
                }
            }
        }

        const totalReps = Math.max(1, Math.min(effectiveRepeatCount || 2, 4));
        let iteration = 0;

        // Watchdog to prevent Chromium speech synthesis freeze
        activeWatchdogTimer = setInterval(() => {
            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.pause();
                window.speechSynthesis.resume();
            }
        }, 8000);

        const speakIteration = () => {
            if (currentId !== activeAnnouncementId) return;
            iteration++;
            const isRepeat = iteration > 1;
            const speechIsArabic = announcementLanguage === 'ar'
                ? true
                : announcementLanguage === 'en'
                    ? false
                    : isArabic;

            // Chime execution
            if (withChime) {
                if (!isRepeat) {
                    playHospitalChime('call');
                } else if (chimeBeforeRepeat) {
                    playHospitalChime('repeat');
                }
            }

            const doSpeak = () => {
                if (currentId !== activeAnnouncementId) return;

                const textArgs = {
                    spokenToken: announcementToken,
                    cleanPatient,
                    cleanRoom,
                    floorPhrase,
                    isArabic: speechIsArabic,
                    isRepeat,
                    gender,
                    honorific,
                    announcementStyle: effectiveStyle,
                    customTemplate: speechIsArabic ? customTemplate : '',
                    tokenPronunciation: effectivePronunciation,
                    pronunciationDictionary,
                };
                const primaryText = applyPronunciationDictionary(buildAnnouncementText(textArgs), pronunciationDictionary);
                const bilingual = announcementLanguage === 'ar_then_en' || announcementLanguage === 'en_then_ar';
                const languageOrder = announcementLanguage === 'en_then_ar' ? [false, true] : [true, false];
                const speechParts = bilingual
                    ? languageOrder.map((arabic) => ({
                        isArabic: arabic,
                        text: applyPronunciationDictionary(buildAnnouncementText({ ...textArgs, isArabic: arabic, customTemplate: customTemplate || '' }), pronunciationDictionary),
                    }))
                    : [{ isArabic: speechIsArabic, text: primaryText }];

                let iterationDone = false;
                const finishIteration = () => {
                    if (iterationDone) return;
                    iterationDone = true;
                    if (currentId !== activeAnnouncementId) return;

                    onIterationEnd?.(iteration, totalReps);

                    if (iteration < totalReps) {
                        activeRepeatTimer = setTimeout(speakIteration, effectiveRepeatDelay);
                    } else {
                        if (activeWatchdogTimer) {
                            clearInterval(activeWatchdogTimer);
                            activeWatchdogTimer = null;
                        }
                        finishAll();
                    }
                };

                const speakPart = (partIndex) => {
                    if (currentId !== activeAnnouncementId) return;
                    const part = speechParts[partIndex];
                    if (!part) {
                        finishIteration();
                        return;
                    }

                    const utterance = new SpeechSynthesisUtterance(part.text);
                    utterance.lang = part.isArabic ? 'ar-EG' : 'en-US';
                    const baseRate = part.isArabic ? (isRepeat ? 0.90 : 0.86) : (isRepeat ? 0.95 : 0.90);
                    const normalizedRate = Number.isFinite(Number(effectiveRate)) ? Number(effectiveRate) : 1;
                    utterance.rate = Math.min(1.15, Math.max(0.72, baseRate * normalizedRate));
                    utterance.pitch = Math.min(1.15, Math.max(0.85, Number(effectivePitch) || 1));
                    utterance.volume = Math.min(1, Math.max(0.35, Number(effectiveVolume) || 1));

                    const voices = window.speechSynthesis.getVoices();
                    if (voices && voices.length > 0) {
                        const requestedURI = part.isArabic ? arabicVoiceURI : englishVoiceURI;
                        const manual = requestedURI && voices.find((voice) => voice.voiceURI === requestedURI);
                        const best = manual || (autoBestVoice ? selectBestVoice(voices, part.isArabic) : null);
                        if (best) {
                            utterance.voice = best;
                            utterance.lang = best.lang;
                        }
                    }

                    let partDone = false;
                    const finishPart = () => {
                        if (partDone) return;
                        partDone = true;
                        clearTimeout(maxSpeechTimeout);
                        if (currentId !== activeAnnouncementId) return;
                        if (partIndex < speechParts.length - 1) speakPart(partIndex + 1);
                        else finishIteration();
                    };
                    const maxSpeechTimeout = setTimeout(finishPart, 16000);
                    utterance.onend = finishPart;
                    utterance.onerror = finishPart;
                    window.speechSynthesis.speak(utterance);
                };

                speakPart(0);
            };

            // Allow chime to resonate before voice starts speaking
            const chimeDelay = withChime
                ? (!isRepeat ? (isArabic ? 680 : 520) : (chimeBeforeRepeat ? 420 : 50))
                : 20;

            activeRepeatTimer = setTimeout(doSpeak, chimeDelay);
        };

        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
            speakIteration();
        } else {
            const onVoicesReady = () => {
                window.speechSynthesis.removeEventListener('voiceschanged', onVoicesReady);
                if (currentId === activeAnnouncementId) speakIteration();
            };
            window.speechSynthesis.addEventListener('voiceschanged', onVoicesReady);
            activeRepeatTimer = setTimeout(() => {
                window.speechSynthesis.removeEventListener('voiceschanged', onVoicesReady);
                if (currentId === activeAnnouncementId) speakIteration();
            }, 500);
        }
    } catch {
        // Never leave the display-board call queue waiting indefinitely.
        finishAll();
    }
};

export const testHospitalAnnouncement = (isArabic = true, withName = true, repeatCount = 2, announcementMode) => {
    announcePatientCall({
        tokenNumber: '6325',
        patientName: withName ? (isArabic ? 'أحمد محمد العتيبي' : 'Ahmed Al-Otiabi') : '',
        roomName: isArabic ? 'عيادة السونار والدوبلر' : 'Ultrasound & Doppler Suite',
        roomFloor: isArabic ? 'الدور الأول' : '1st Floor',
        callByName: withName,
        announcementMode: announcementMode || (withName ? 'token_and_name' : 'token_only'),
        isArabic,
        withChime: true,
        repeatCount,
        repeatDelayMs: 1500,
        chimeBeforeRepeat: true
    });
};

export default announcePatientCall;
