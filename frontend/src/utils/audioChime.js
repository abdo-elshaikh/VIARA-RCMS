/**
 * audioChime.js
 * High-fidelity hospital / clinic announcement chime synthesized using Web Audio API.
 * Uses harmonic overtones (octave + 3rd harmonic) and smooth acoustic decay envelopes
 * to simulate a physical hospital chime bar / crystal bell without any external audio files.
 */

let sharedAudioCtx = null;

export const getAudioContext = () => {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
            sharedAudioCtx = new AudioCtx();
            if (typeof sharedAudioCtx.addEventListener === 'function') {
                sharedAudioCtx.addEventListener('error', () => { });
            }
        }
        if (sharedAudioCtx.state === 'suspended') {
            sharedAudioCtx.resume().catch(() => {});
        }
        return sharedAudioCtx;
    } catch {
        return null;
    }
};

export const isAudioSuspended = () => {
    try {
        if (!sharedAudioCtx) return false;
        return sharedAudioCtx.state === 'suspended';
    } catch {
        return false;
    }
};

export const unlockAudio = async () => {
    try {
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
            await ctx.resume();
        }
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            try { window.speechSynthesis.resume?.(); } catch (_) {
                // Ignore speech synthesis autoplay restrictions
            }
        }
        return ctx?.state === 'running';
    } catch (_) {
        return false;
    }
};

/**
 * Plays a warm, resonant hospital chime tone with subtle harmonic overtones.
 * @param {'call'|'repeat'|'alert'} variant - The style of chime to play.
 */
export const playHospitalChime = (variant = 'call') => {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;

        const playChimeNote = (freq, startOffset, duration, peakVolume = 0.24) => {
            const startTime = now + startOffset;
            const stopTime = startTime + duration;

            // Master note gain
            const noteGain = ctx.createGain();
            noteGain.gain.setValueAtTime(0.0001, startTime);
            // Crisp soft attack (18ms)
            noteGain.gain.linearRampToValueAtTime(peakVolume, startTime + 0.018);
            // Smooth bell exponential decay
            noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);
            noteGain.connect(ctx.destination);

            // Fundamental tone (Sine)
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);
            osc.connect(noteGain);
            osc.start(startTime);
            osc.stop(stopTime);

            // 2nd Harmonic overtone (Octave higher, subtle shimmer - 20% gain)
            const overtone = ctx.createOscillator();
            const overtoneGain = ctx.createGain();
            overtone.type = 'sine';
            overtone.frequency.setValueAtTime(freq * 2, startTime);
            overtoneGain.gain.setValueAtTime(0.0001, startTime);
            overtoneGain.gain.linearRampToValueAtTime(peakVolume * 0.18, startTime + 0.012);
            overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + (duration * 0.6));
            overtone.connect(overtoneGain);
            overtoneGain.connect(ctx.destination);
            overtone.start(startTime);
            overtone.stop(stopTime);
        };

        if (variant === 'repeat') {
            // Gentle single reminder chime note: A5 (880.00 Hz)
            playChimeNote(880.00, 0.0, 0.75, 0.20);
        } else if (variant === 'alert') {
            // Urgent tri-tone alert: F5 -> A5 -> C6
            playChimeNote(698.46, 0.00, 0.35, 0.22);
            playChimeNote(880.00, 0.20, 0.40, 0.24);
            playChimeNote(1046.50, 0.42, 0.75, 0.26);
        } else {
            // Classic hospital dual-tone chime: D5 (587.33 Hz) -> A5 (880.00 Hz)
            playChimeNote(587.33, 0.00, 0.48, 0.24);
            playChimeNote(880.00, 0.32, 0.85, 0.28);
        }
    } catch {
        // Safe failover if browser policy blocks autoplay before interaction
    }
};

export default playHospitalChime;
