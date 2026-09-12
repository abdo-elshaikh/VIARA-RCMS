/**
 * audioChime.js
 * Synthesizes a pleasant dual-tone hospital / airport chime using Web Audio API.
 * No external mp3 files required; works offline and across all modern browsers.
 */
export const playHospitalChime = () => {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        const playTone = (freq, start, duration) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + start);

            gain.gain.setValueAtTime(0.001, ctx.currentTime + start);
            gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime + start);
            osc.stop(ctx.currentTime + start + duration);
        };

        // Two-tone chime: D5 (587.33 Hz) -> A5 (880 Hz)
        playTone(587.33, 0.0, 0.45);
        playTone(880.00, 0.35, 0.7);
    } catch {
        // Non-fatal if audio context is blocked by browser autoplay policy
    }
};

export default playHospitalChime;
