import { playHospitalChime } from './audioChime';

/**
 * speechAnnouncement.js
 * Synthesizes a natural, clear automated voice announcement using the Web Speech API,
 * prefixed by the hospital dual-tone chime.
 */

export const getSpokenToken = (tokenNumber) => {
    if (!tokenNumber) return '';
    const clean = String(tokenNumber).replace(/^#/, '').trim();
    // Transform ORD-2026-005845 -> 5845 for natural spoken Arabic/English
    const match = clean.match(/(\d+)$/);
    if (match) {
        const num = parseInt(match[1], 10);
        return num > 0 ? String(num) : match[1];
    }
    return clean;
};

export const announcePatientCall = ({
    tokenNumber,
    patientName,
    roomName,
    callByName = true,
    isArabic = true,
    withChime = true
}) => {
    if (withChime) {
        playHospitalChime();
    }

    if (!('speechSynthesis' in window)) return;

    try {
        // Cancel any pending speech to avoid overlapping queues
        window.speechSynthesis.cancel();

        const spokenToken = getSpokenToken(tokenNumber);
        const cleanRoom = String(roomName || '')
            .replace(/Room\s+/gi, isArabic ? 'جناح ' : 'Room ')
            .replace(/جناح\s+جناح/g, 'جناح');

        const cleanPatient = (callByName && patientName)
            ? String(patientName).trim().replace(/[.]+$/, '')
            : '';

        let text = '';
        if (isArabic) {
            if (cleanPatient && spokenToken) {
                text = `نداء للمريض ${cleanPatient}. دور رقم ${spokenToken}. يرجى التوجه إلى ${cleanRoom}.`;
            } else if (cleanPatient) {
                text = `نداء للمريض ${cleanPatient}. يرجى التوجه إلى ${cleanRoom}.`;
            } else if (spokenToken) {
                text = `نداء للحالة، دور رقم ${spokenToken}. يرجى التوجه إلى ${cleanRoom}.`;
            } else {
                text = `نداء للحالة التالية. يرجى التوجه إلى ${cleanRoom}.`;
            }
        } else {
            if (cleanPatient && spokenToken) {
                text = `Calling patient ${cleanPatient}, ticket number ${spokenToken}. Please proceed to ${cleanRoom}.`;
            } else if (cleanPatient) {
                text = `Calling patient ${cleanPatient}. Please proceed to ${cleanRoom}.`;
            } else if (spokenToken) {
                text = `Calling ticket number ${spokenToken}. Please proceed to ${cleanRoom}.`;
            } else {
                text = `Calling the next patient. Please proceed to ${cleanRoom}.`;
            }
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = isArabic ? 'ar-SA' : 'en-US';
        utterance.rate = 0.88; // Slightly slower for crisp acoustic clarity in waiting halls
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        // Find best matching voice in browser
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
            const targetLang = isArabic ? 'ar' : 'en';
            const matchedVoice = voices.find(v => v.lang.toLowerCase().startsWith(targetLang));
            if (matchedVoice) {
                utterance.voice = matchedVoice;
            }
        }

        // Delay speech by 520ms so the pleasant chime completes first
        setTimeout(() => {
            window.speechSynthesis.speak(utterance);
        }, withChime ? 520 : 0);
    } catch {
        // Non-fatal if speech synthesis is blocked or unavailable
    }
};

export const testHospitalAnnouncement = (isArabic = true, withName = true) => {
    announcePatientCall({
        tokenNumber: '104',
        patientName: withName ? (isArabic ? 'أحمد محمود' : 'Ahmed Mahmoud') : '',
        roomName: isArabic ? 'جناح الرنين المغناطيسي 1' : 'MRI Suite 1',
        callByName: withName,
        isArabic,
        withChime: true
    });
};

export default announcePatientCall;
