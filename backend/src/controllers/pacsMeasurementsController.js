const jwt = require('jsonwebtoken');
const { AppError } = require('../middleware/errorHandler');
const { encrypt, decrypt } = require('../utils/crypto');
const { assertStudyAccess, isValidStudyUid } = require('../services/pacsAccessPolicyService');
const { getJwtSecret } = require('../middleware/authMiddleware');
const { writeAudit } = require('../services/pacsReconcileService');

const FORMAT = 'viara-ohif-measurements-v1';
const TOOLS = new Set(['Length', 'Bidirectional', 'Angle', 'CobbAngle', 'EllipticalROI', 'CircleROI', 'RectangleROI', 'ArrowAnnotate', 'Probe']);
const authorize = async (db, req) => {
    const uid = req.params.studyInstanceUid;
    if (req.user.scope === 'pacs-viewer' && !req.user.study_instance_uids?.includes(uid)) throw new AppError('Study is outside the viewer session', 403);
    await assertStudyAccess(db, req.user, [uid]);
    return uid;
};
const readMeasurements = db => async (req, res, next) => {
    try {
        const uid = await authorize(db, req);
        const { rows } = await db.query('SELECT payload_enc, version FROM pacs_measurement_drafts WHERE user_id=$1 AND study_instance_uid=$2', [req.user.user_id, uid]);
        const payload = rows[0] ? JSON.parse(decrypt(rows[0].payload_enc)) : { format: FORMAT, measurements: [] };
        res.set('Cache-Control', 'no-store');
        res.json({ ...payload, version: rows[0]?.version || 0 });
    } catch (error) { next(error); }
};
const saveMeasurements = db => async (req, res, next) => {
    try {
        const uid = await authorize(db, req);
        const { measurements, version, format } = req.body || {};
        if (format !== FORMAT || !Array.isArray(measurements) || measurements.length > 200 || !Number.isSafeInteger(version) || version < 0) throw new AppError('Invalid measurement draft', 400);
        if (Buffer.byteLength(JSON.stringify(measurements)) > 2 * 1024 * 1024) throw new AppError('Measurement draft exceeds 2 MiB', 413);
        const seen = new Set();
        for (const item of measurements) {
            const m = item?.measurement;
            if (!m || typeof m.uid !== 'string' || m.uid.length > 128 || seen.has(m.uid)
                || !TOOLS.has(m.toolName) || m.referenceStudyUID !== uid || !isValidStudyUid(m.referenceSeriesUID) || !isValidStudyUid(m.SOPInstanceUID)
                || !Array.isArray(m.points) || !m.points.length || m.points.length > 16
                || m.points.some(point => !Array.isArray(point) || point.length !== 3 || point.some(n => !Number.isFinite(n)))
                || !Number.isSafeInteger(m.frameNumber) || m.frameNumber < 1 || m.frameNumber > 100000
                || !item.annotation?.data?.handles || item.annotation?.metadata?.toolName !== m.toolName) {
                throw new AppError('Unsupported or invalid measurement annotation', 400);
            }
            // The validated world coordinates are authoritative for the restored annotation.
            item.annotation.data.handles.points = m.points;
            item.annotation.annotationUID = m.uid;
            seen.add(m.uid);
        }
        if (measurements.length) {
            const { rows } = await db.query(`SELECT pi.sop_instance_uid,pi.series_instance_uid FROM pacs_instances pi
                JOIN pacs_series ps ON ps.series_instance_uid=pi.series_instance_uid
                WHERE ps.study_instance_uid=$1 AND pi.sop_instance_uid=ANY($2::text[])`, [uid, measurements.map(item => item.measurement.SOPInstanceUID)]);
            const allowed = new Set(rows.map(row => `${row.series_instance_uid}:${row.sop_instance_uid}`));
            if (measurements.some(item => !allowed.has(`${item.measurement.referenceSeriesUID}:${item.measurement.SOPInstanceUID}`))) throw new AppError('Reconcile this study before saving annotations', 403);
        }
        const payload = encrypt(JSON.stringify({ format: FORMAT, measurements }));
        const statement = version === 0
            ? `INSERT INTO pacs_measurement_drafts(user_id,study_instance_uid,payload_enc) VALUES($1,$2,$3)
                ON CONFLICT(user_id,study_instance_uid) DO NOTHING RETURNING version`
            : `UPDATE pacs_measurement_drafts SET payload_enc=$3,version=version+1,updated_at=NOW()
                WHERE user_id=$1 AND study_instance_uid=$2 AND version=$4 RETURNING version`;
        const params = [req.user.user_id, uid, payload, version];
        const { rows } = await db.query(statement, version === 0 ? params.slice(0, 3) : params);
        if (!rows.length) throw new AppError('Measurements changed in another window. Reload before saving.', 409);
        await writeAudit(db, { eventType: 'PACS_MEASUREMENTS_SAVED', actorUserId: req.user.user_id, studyInstanceUid: uid, detail: { count: measurements.length, personal_draft: true } });
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, version: rows[0].version });
    } catch (error) { next(error); }
};

const renewViewerSession = () => async (req, res, next) => {
    try {
        const user = req.user;
        const remaining = Number(user.parent_session_expires_at) - Math.floor(Date.now() / 1000);
        if (user.scope !== 'pacs-viewer' || !Number.isFinite(remaining) || remaining <= 0) throw new AppError('Reopen the viewer from an active staff session', 401);
        const token = jwt.sign({ user_id: user.user_id, session_id: user.session_id, role: user.role, scope: 'pacs-viewer',
            study_instance_uids: user.study_instance_uids, parent_session_expires_at: user.parent_session_expires_at }, getJwtSecret(), { expiresIn: Math.min(600, remaining) });
        res.set('Cache-Control', 'no-store');
        res.json({ viewerToken: token });
    } catch (error) { next(error); }
};

module.exports = { readMeasurements, saveMeasurements, renewViewerSession, FORMAT };
