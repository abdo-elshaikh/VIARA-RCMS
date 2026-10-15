const { AppError } = require('../middleware/errorHandler');
const { assertStudyAccess, isValidStudyUid } = require('../services/pacsAccessPolicyService');

const getBookmarks = db => async (req, res, next) => {
    try {
        const uid = req.params.studyInstanceUid;
        await assertStudyAccess(db, req.user, [uid]);
        const { rows } = await db.query('SELECT key_images, version FROM pacs_viewer_bookmarks WHERE user_id=$1 AND study_instance_uid=$2', [req.user.user_id, uid]);
        const context = await db.query('SELECT exam_id FROM examinations WHERE study_instance_uid=$1 LIMIT 1', [uid]);
        res.set('Cache-Control', 'no-store');
        res.json({ examId: context.rows[0]?.exam_id || null, keyImages: rows[0]?.key_images || [], version: rows[0]?.version || 0 });
    } catch (error) { next(error); }
};

const saveBookmarks = db => async (req, res, next) => {
    try {
        const uid = req.params.studyInstanceUid;
        await assertStudyAccess(db, req.user, [uid]);
        const entries = req.body?.keyImages;
        const version = req.body?.version;
        if (!Array.isArray(entries) || entries.length > 500 || !Number.isSafeInteger(version) || version < 0) throw new AppError('Invalid key-image bookmark payload', 400);
        const unique = new Map();
        for (const entry of entries) {
            if (!isValidStudyUid(entry?.seriesInstanceUid) || !isValidStudyUid(entry?.sopInstanceUid) || !Number.isSafeInteger(entry?.frameNumber) || entry.frameNumber < 1 || entry.frameNumber > 100000) {
                throw new AppError('Invalid key-image reference', 400);
            }
            const value = { seriesInstanceUid: entry.seriesInstanceUid, sopInstanceUid: entry.sopInstanceUid, frameNumber: entry.frameNumber };
            unique.set(`${value.sopInstanceUid}:${value.frameNumber}`, value);
        }
        const images = [...unique.values()];
        if (images.length) {
            const { rows } = await db.query(`SELECT pi.sop_instance_uid, pi.series_instance_uid FROM pacs_instances pi
                JOIN pacs_series ps ON ps.series_instance_uid=pi.series_instance_uid
                WHERE ps.study_instance_uid=$1 AND pi.sop_instance_uid=ANY($2::text[])`, [uid, images.map(image => image.sopInstanceUid)]);
            const allowed = new Set(rows.map(row => `${row.series_instance_uid}:${row.sop_instance_uid}`));
            if (images.some(image => !allowed.has(`${image.seriesInstanceUid}:${image.sopInstanceUid}`))) throw new AppError('A key image is outside the selected study', 403);
        }
        const params = [req.user.user_id, uid, JSON.stringify(images), version];
        const statement = version === 0
            ? `INSERT INTO pacs_viewer_bookmarks(user_id,study_instance_uid,key_images) VALUES($1,$2,$3::jsonb)
                ON CONFLICT(user_id,study_instance_uid) DO NOTHING RETURNING version`
            : `UPDATE pacs_viewer_bookmarks SET key_images=$3::jsonb,version=version+1,updated_at=NOW()
                WHERE user_id=$1 AND study_instance_uid=$2 AND version=$4 RETURNING version`;
        const { rows } = await db.query(statement, version === 0 ? params.slice(0, 3) : params);
        if (!rows.length) throw new AppError('Bookmarks changed in another tab. Reload before saving.', 409);
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, version: rows[0].version });
    } catch (error) { next(error); }
};

module.exports = { getBookmarks, saveBookmarks };
