jest.mock('../src/services/pacsAccessPolicyService', () => ({
    assertStudyAccess: jest.fn(async () => ['1.2.3']),
    isValidStudyUid: value => typeof value === 'string' && /^\d+(?:\.\d+)+$/.test(value)
}));
const { assertStudyAccess } = require('../src/services/pacsAccessPolicyService');
const { getBookmarks, saveBookmarks } = require('../src/controllers/pacsBookmarksController');

describe('Persisted key images', () => {
    const image = { seriesInstanceUid: '1.2.4', sopInstanceUid: '1.2.5', frameNumber: 2 };
    const request = body => ({ params: { studyInstanceUid: '1.2.3' }, user: { user_id: 'reader-1' }, body });
    const response = () => ({ set: jest.fn(), json: jest.fn() });
    afterEach(() => jest.clearAllMocks());
    test('loads only the current reader bookmarks with stable SOP/frame references', async () => {
        const db = { query: jest.fn(async sql => ({ rows: sql.includes('pacs_viewer_bookmarks') ? [{ key_images: [image], version: 3 }] : [{ exam_id: 'exam-1' }] })) };
        const res = response();
        await getBookmarks(db)(request(), res, jest.fn());
        expect(db.query.mock.calls[0][1]).toEqual(['reader-1', '1.2.3']);
        expect(res.json).toHaveBeenCalledWith({ keyImages: [image], version: 3, examId: 'exam-1' });
    });
    test('does not read any bookmarks when study access is denied', async () => {
        assertStudyAccess.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { statusCode: 403 }));
        const db = { query: jest.fn() }, next = jest.fn();
        await getBookmarks(db)(request(), response(), next);
        expect(db.query).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0].statusCode).toBe(403);
    });
    test('rejects an image from another study before saving', async () => {
        const db = { query: jest.fn(async () => ({ rows: [] })) }, next = jest.fn();
        await saveBookmarks(db)(request({ keyImages: [image], version: 0 }), response(), next);
        expect(next.mock.calls[0][0].statusCode).toBe(403);
        expect(db.query).toHaveBeenCalledTimes(1);
    });
    test('rejects stale versions rather than overwriting another tab', async () => {
        const db = { query: jest.fn(async () => ({ rows: [] })) }, next = jest.fn();
        await saveBookmarks(db)(request({ keyImages: [], version: 2 }), response(), next);
        expect(next.mock.calls[0][0].statusCode).toBe(409);
        expect(db.query.mock.calls[0][0]).toContain('AND version=$4');
    });
    test('stores each SOP/frame once and drops untrusted additional fields', async () => {
        const db = { query: jest.fn(async sql => ({ rows: sql.startsWith('SELECT') ? [{ sop_instance_uid: image.sopInstanceUid, series_instance_uid: image.seriesInstanceUid }] : [{ version: 1 }] })) };
        const res = response(), next = jest.fn();
        await saveBookmarks(db)(request({ keyImages: [image, { ...image, patientName: 'unused' }], version: 0 }), res, next);
        expect(next).not.toHaveBeenCalled();
        expect(JSON.parse(db.query.mock.calls[1][1][2])).toEqual([image]);
        expect(res.json).toHaveBeenCalledWith({ success: true, version: 1 });
    });
});
