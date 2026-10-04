jest.mock('../src/services/pacsAccessPolicyService', () => ({ assertStudyAccess: jest.fn(async () => {}), isValidStudyUid: value => /^\d+(?:\.\d+)+$/.test(value) }));
jest.mock('../src/services/pacsReconcileService', () => ({ writeAudit: jest.fn(async () => {}) }));
jest.mock('../src/utils/crypto', () => ({ encrypt: value => 'encrypted:' + value, decrypt: value => value.slice(10) }));
const { saveMeasurements, readMeasurements, renewViewerSession, FORMAT } = require('../src/controllers/pacsMeasurementsController');
const jwt = require('jsonwebtoken');
const res = () => ({ set: jest.fn(), json: jest.fn() });
const request = body => ({ params: { studyInstanceUid: '1.2.3' }, user: { user_id: 'reader', scope: 'pacs-viewer', study_instance_uids: ['1.2.3'] }, body });
const entry = () => ({ measurement: { uid: 'annotation', toolName: 'Length', referenceStudyUID: '1.2.3', referenceSeriesUID: '1.2.4', SOPInstanceUID: '1.2.5', points: [[0, 0, 0], [1, 1, 1]], frameNumber: 1 }, annotation: { metadata: { toolName: 'Length' }, data: { handles: { points: [[99, 99, 99]] } } } });
test('encrypts a valid personal draft and uses validated coordinates', async () => {
    const db = { query: jest.fn(async sql => ({ rows: sql.startsWith('SELECT') ? [{ sop_instance_uid: '1.2.5', series_instance_uid: '1.2.4' }] : [{ version: 1 }] })) }, next = jest.fn(), response = res();
    await saveMeasurements(db)(request({ format: FORMAT, version: 0, measurements: [entry()] }), response, next);
    expect(next).not.toHaveBeenCalled();
    const payload = JSON.parse(db.query.mock.calls[1][1][2].slice(10));
    expect(payload.measurements[0].annotation.data.handles.points).toEqual([[0, 0, 0], [1, 1, 1]]);
    expect(response.json).toHaveBeenCalledWith({ success: true, version: 1 });
});
test('denies draft access outside the scoped study before querying', async () => {
    const db = { query: jest.fn() }, next = jest.fn(), req = request(); req.params.studyInstanceUid = '9.8.7';
    await readMeasurements(db)(req, res(), next);
    expect(next.mock.calls[0][0].statusCode).toBe(403); expect(db.query).not.toHaveBeenCalled();
});
test('rejects non-finite clinical coordinates and cross-study references', async () => {
    for (const invalid of [() => { const e = entry(); e.measurement.points[0][0] = Infinity; return e; }, () => { const e = entry(); e.measurement.referenceStudyUID = '9.8.7'; return e; }]) {
        const db = { query: jest.fn() }, next = jest.fn();
        await saveMeasurements(db)(request({ format: FORMAT, version: 0, measurements: [invalid()] }), res(), next);
        expect(next.mock.calls[0][0].statusCode).toBe(400); expect(db.query).not.toHaveBeenCalled();
    }
});
test('rejects stale writes without overwriting another window', async () => {
    const db = { query: jest.fn(async () => ({ rows: [] })) }, next = jest.fn();
    await saveMeasurements(db)(request({ format: FORMAT, version: 2, measurements: [] }), res(), next);
    expect(next.mock.calls[0][0].statusCode).toBe(409);
});
test('renewal cannot outlive the originating staff login', async () => {
    const req = request(); req.user.parent_session_expires_at = Math.floor(Date.now() / 1000) + 90;
    const response = res(), next = jest.fn();
    await renewViewerSession()(req, response, next);
    expect(next).not.toHaveBeenCalled();
    const token = jwt.decode(response.json.mock.calls[0][0].viewerToken);
    expect(token.exp).toBeLessThanOrEqual(req.user.parent_session_expires_at);
    expect(token.study_instance_uids).toEqual(['1.2.3']);
});
test('expired originating login cannot renew', async () => {
    const req = request(); req.user.parent_session_expires_at = 1; const next = jest.fn();
    await renewViewerSession()(req, res(), next); expect(next.mock.calls[0][0].statusCode).toBe(401);
});
