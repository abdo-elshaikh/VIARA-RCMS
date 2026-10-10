const logger = require('../config/logger');
const { writeAudit } = require('./pacsReconcileService');
const { archiveInstance } = require('./pacsColdStorageService');

// Age (days) after which a 'hot' instance becomes eligible for cold tiering.
// Set low (e.g. 0.0007 ≈ 1 min) in QA to exercise the path quickly.
const TIERING_DAYS = Number(process.env.PACS_TIERING_DAYS || 90);
// How many instances to migrate per pass so a backlog never blocks the loop.
const BATCH_SIZE = Number(process.env.PACS_TIERING_BATCH || 500);
// Physical encrypted archive location; disabled until a durable volume is configured.
const COLD_PREFIX = process.env.PACS_COLD_STORAGE_DIR ? 'local:' + process.env.PACS_COLD_STORAGE_DIR : null;

/** Copy aged instances to a verified encrypted archive. Keep the hot originals
 * and mark verified mirrors warm; never advertise disk eviction that did not occur. */
const tierColdInstances = async (pool, { archiver } = {}) => {
    if (!archiver && !process.env.PACS_COLD_STORAGE_DIR) throw new Error('Physical PACS archive is not configured; no storage tiers were changed');
    const { rows } = await pool.query(
        `SELECT pi.sop_instance_uid, pi.orthanc_id, ps.study_instance_uid
         FROM pacs_instances pi
         JOIN pacs_series ps ON ps.series_instance_uid = pi.series_instance_uid
         WHERE pi.storage_tier = 'hot'
           AND pi.created_at < (CURRENT_TIMESTAMP - ($1 || ' days')::interval)
         ORDER BY pi.created_at ASC
         LIMIT $2`,
        [TIERING_DAYS, BATCH_SIZE]
    );

    if (rows.length === 0) return { migrated: 0 };

    let migrated = 0;
    for (const row of rows) {
        try {
            const archived = archiver
                ? await archiver(row)
                : await archiveInstance(row);
            if (!archived?.fileRef || !archived?.checksum) throw new Error('Archiver must return a verified reference and checksum');

            await pool.query(
                `UPDATE pacs_instances
                 SET storage_tier = 'warm', file_ref = $2, archive_sha256 = $3,
                     file_size_bytes = COALESCE($4, file_size_bytes)
                 WHERE sop_instance_uid = $1`,
                [row.sop_instance_uid, archived.fileRef, archived.checksum, archived.bytes || null]
            );
            migrated += 1;
        } catch (error) {
            logger.error('Tiering: failed to migrate instance', {
                sop_instance_uid: row.sop_instance_uid,
                error: error.message
            });
        }
    }

    // Best-effort audit (uses pool directly; writeAudit swallows its own errors).
    await writeAudit(pool, {
        eventType: 'STUDY_EXPORTED',
        detail: { action: 'tier_to_cold', migrated, threshold_days: TIERING_DAYS }
    });

    logger.info(`PACS tiering: migrated ${migrated} instance(s) to a verified archive mirror`, { threshold_days: TIERING_DAYS });
    return { migrated };
};

module.exports = { tierColdInstances, TIERING_DAYS, BATCH_SIZE, COLD_PREFIX };
