const { getWaitingList, createWaitingListEntry, updateWaitingListEntry, getWaitlistMatches } = require('../src/controllers/waitingListController');

const makeResponse = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
});

describe('waiting-list lifecycle', () => {
    test('creation serializes duplicate detection and records an event', async () => {
        const client = {
            query: jest.fn().mockImplementation(async (sql) => {
                const text = String(sql);
                if (text.includes('SELECT waitlist_id') && text.includes("status IN ('Waiting', 'Contacted', 'Offered')")) return { rows: [] };
                if (text.includes('INSERT INTO waiting_list (')) return { rows: [{ waitlist_id: 'wait-1', status: 'Waiting' }] };
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const res = makeResponse();
        const next = jest.fn();

        await createWaitingListEntry(db)({
            body: { patientId: 'patient-1', priority: 'Routine', source: 'Phone' },
            user: { user_id: 'user-1' }
        }, res, next);

        const queries = client.query.mock.calls.map(([sql]) => String(sql));
        expect(queries.some(query => query.includes('pg_advisory_xact_lock'))).toBe(true);
        expect(queries.some(query => query.includes('INSERT INTO waiting_list_events'))).toBe(true);
        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(client.release).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
    });

    test('getWaitingList applies date and active status filter', async () => {
        const db = {
            query: jest.fn().mockResolvedValue({
                rows: [
                    { waitlist_id: 'w-1', patient_id: 'p-1', priority: 'Routine', status: 'Waiting' }
                ]
            })
        };
        const res = makeResponse();
        const next = jest.fn();

        await getWaitingList(db)({
            query: { active: 'true', date: '2026-08-25' }
        }, res, next);

        expect(db.query).toHaveBeenCalled();
        const [sql, values] = db.query.mock.calls[0];
        expect(sql).toContain("wl.status IN ('Waiting', 'Contacted', 'Offered')");
        expect(sql).toContain('wl.preferred_date = $');
        expect(values).toContain('2026-08-25');
        expect(res.json).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ waitlist_id: 'w-1' })
        ]));
    });

    test('generic updates allow transitioning to Offered or Declined', async () => {
        const client = {
            query: jest.fn().mockImplementation(async (sql) => {
                const text = String(sql);
                if (text.includes('SELECT * FROM waiting_list')) {
                    return { rows: [{ waitlist_id: 'wait-1', status: 'Waiting', patient_id: 'p-1' }] };
                }
                if (text.includes('UPDATE waiting_list')) {
                    return { rows: [{ waitlist_id: 'wait-1', status: 'Offered' }] };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const res = makeResponse();
        const next = jest.fn();

        await updateWaitingListEntry(db)({
            params: { id: 'wait-1' },
            body: { status: 'Offered' },
            user: { user_id: 'user-1' }
        }, res, next);

        expect(client.query).toHaveBeenCalledWith('COMMIT');
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'Offered' }));
    });

    test('generic updates cannot mark an entry scheduled', async () => {
        const db = { connect: jest.fn() };
        const next = jest.fn();

        await updateWaitingListEntry(db)({
            params: { id: 'wait-1' },
            body: { status: 'Scheduled' },
            user: { user_id: 'user-1' }
        }, makeResponse(), next);

        expect(db.connect).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
    });

    test('terminal entries cannot be reopened or modified', async () => {
        const client = {
            query: jest.fn().mockImplementation(async (sql) => {
                if (String(sql).includes('SELECT * FROM waiting_list')) {
                    return { rows: [{ waitlist_id: 'wait-1', status: 'Scheduled' }] };
                }
                return { rows: [] };
            }),
            release: jest.fn()
        };
        const db = { connect: jest.fn().mockResolvedValue(client) };
        const next = jest.fn();

        await updateWaitingListEntry(db)({
            params: { id: 'wait-1' },
            body: { notes: 'Changed' },
            user: { user_id: 'user-1' }
        }, makeResponse(), next);

        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.release).toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
    });
});
