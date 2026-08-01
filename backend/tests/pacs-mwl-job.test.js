jest.mock('../src/config/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
}));

jest.mock('../src/services/pacsMwlService', () => ({
    regenerateWorklists: jest.fn()
}));

jest.mock('../src/services/systemAuditService', () => ({
    logSystemAuditEvent: jest.fn(async () => {})
}));

const { regenerateWorklists } = require('../src/services/pacsMwlService');
const { logSystemAuditEvent } = require('../src/services/systemAuditService');
const { AUDIT_EVENT_CODES, AUDIT_OUTCOME } = require('../src/services/auditTaxonomy');
const { triggerPacsMwlRefresh } = require('../src/jobs/pacsMwlJob');

describe('PACS MWL job audit logging', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('logs a structured audit event when worklists are regenerated', async () => {
        const pool = {};
        regenerateWorklists.mockResolvedValue({ written: 2, pruned: 1 });

        await triggerPacsMwlRefresh(pool);

        expect(logSystemAuditEvent).toHaveBeenCalledWith(pool, expect.objectContaining({
            eventCode: AUDIT_EVENT_CODES.PACS_MWL_REGENERATED,
            jobName: 'pacs-mwl',
            sourceSystem: 'pacs-mwl-job',
            details: { written: 2, pruned: 1 }
        }));
    });

    it('logs a structured failure event when regeneration fails', async () => {
        const pool = {};
        regenerateWorklists.mockRejectedValue(new Error('disk full'));

        await triggerPacsMwlRefresh(pool);

        expect(logSystemAuditEvent).toHaveBeenCalledWith(pool, expect.objectContaining({
            eventCode: AUDIT_EVENT_CODES.SYSTEM_JOB_FAILED,
            jobName: 'pacs-mwl',
            sourceSystem: 'pacs-mwl-job',
            outcome: AUDIT_OUTCOME.FAILURE,
            details: { error: 'disk full' },
            riskScore: 70
        }));
    });
});
