/**
 * Contract tests for logger PHI redaction and production stdout transport.
 * Backs the audit finding that winston had no redaction layer and produced
 * no stdout output in production (empty `docker logs`).
 */
const winston = require('winston');
const logger = require('../src/config/logger');

const captureViaTransport = (level, payload) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('capture timed out')), 5000);
    const probe = new winston.transports.Console({
        silent: false,
        format: winston.format.json(),
        log(info, callback) {
            clearTimeout(timeout);
            try {
                this.destroy?.();
            } catch { /* transport teardown best-effort */ }
            logger.remove(probe);
            resolve(JSON.stringify(info));
            callback?.();
        },
    });
    logger.add(probe);
    logger[level](payload);
});

describe('config/logger PHI redaction', () => {
    it('masks national-id-like digit runs in messages', async () => {
        const text = await captureViaTransport('info', 'Lookup failed for patient 29811011234567 at desk');
        expect(text).toContain('298***');
        expect(text).not.toContain('29811011234567');
    });

    it('redacts PHI keys in metadata', async () => {
        const parsed = JSON.parse(await captureViaTransport('info', {
            message: 'registration attempt',
            patient_name: 'Ahmad Ali',
            national_id: '29811011234567',
            phone: '01012345678',
            meta: { nested: { password: 'hunter2', keep: 'ok-value' } },
        }));
        expect(parsed.patient_name).not.toBe('Ahmad Ali');
        expect(parsed.national_id).not.toContain('11234567');
        expect(parsed.phone).not.toBe('01012345678');
        expect(parsed.meta.nested.password).not.toBe('hunter2');
        expect(parsed.meta.nested.keep).toBe('ok-value');
    });

    it('keeps ordinary operational metadata untouched', async () => {
        const parsed = JSON.parse(await captureViaTransport('info', {
            message: 'queue transition',
            exam_id: 'b7d4b2e0-0000-0000-0000-000000000000',
            stage: 'Reporting',
            durationMs: 1234,
        }));
        expect(parsed.stage).toBe('Reporting');
        expect(parsed.durationMs).toBe(1234);
        expect(parsed.exam_id).toContain('b7d4b2e0');
    });
});
