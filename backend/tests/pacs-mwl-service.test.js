const fs = require('fs');
const os = require('os');
const path = require('path');

const previousWorklistDir = process.env.PACS_WORKLIST_DIR;
const worklistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viara-mwl-test-'));
process.env.PACS_WORKLIST_DIR = worklistDir;

jest.mock('../src/config/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));
jest.mock('../src/services/settingsService', () => ({
    get: jest.fn(async (_key, fallback) => fallback)
}));

const { regenerateWorklists } = require('../src/services/pacsMwlService');

const validRow = (overrides = {}) => ({
    order_number: 'ACC-1',
    mrn: 'MRN-1',
    modality_type: 'CT',
    procedure_name: 'Chest CT',
    scheduled_datetime: new Date('2026-01-01T10:00:00Z'),
    scheduled_station_aet: 'CT_ROOM_1',
    ...overrides
});

describe('PACS modality worklist generation', () => {
    afterEach(() => {
        fs.rmSync(worklistDir, { recursive: true, force: true });
        fs.mkdirSync(worklistDir, { recursive: true });
    });

    afterAll(() => {
        fs.rmSync(worklistDir, { recursive: true, force: true });
        if (previousWorklistDir === undefined) delete process.env.PACS_WORKLIST_DIR;
        else process.env.PACS_WORKLIST_DIR = previousWorklistDir;
    });

    it('surfaces auto-provisioning database failures', async () => {
        const pool = { query: jest.fn().mockRejectedValue(new Error('database unavailable')) };
        await expect(regenerateWorklists(pool)).rejects.toThrow('database unavailable');
    });

    it('does not prune existing worklists when any scheduled row is invalid', async () => {
        const staleFile = path.join(worklistDir, 'still-valid.wl');
        fs.writeFileSync(staleFile, 'existing worklist');
        const pool = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [validRow({ scheduled_datetime: 'invalid date' })] })
        };

        await expect(regenerateWorklists(pool)).rejects.toThrow('Invalid scheduled examination date');
        expect(fs.readFileSync(staleFile, 'utf8')).toBe('existing worklist');
        expect(fs.existsSync(path.join(worklistDir, 'ACC-1.wl'))).toBe(false);
    });

    it('writes valid worklists and prunes stale entries after generation succeeds', async () => {
        fs.writeFileSync(path.join(worklistDir, 'old-order.wl'), 'stale');
        const pool = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [validRow()] })
        };

        await expect(regenerateWorklists(pool)).resolves.toEqual({ written: 1, pruned: 1 });
        expect(fs.statSync(path.join(worklistDir, 'ACC-1.wl')).size).toBeGreaterThan(0);
        expect(fs.existsSync(path.join(worklistDir, 'old-order.wl'))).toBe(false);
    });
});
