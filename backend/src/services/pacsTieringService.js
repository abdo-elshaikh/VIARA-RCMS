const logger = require('../config/logger');
const { writeAudit } = require('./pacsReconcileService');

// Age (days) after which a 'hot' instance becomes eligible for cold tiering.
// Set low (e.g. 0.0007 ≈ 1 min) in QA to exercise the path quickly.
const TIERING_DAYS = Number(process.env.PACS_TIERING_DAYS || 90);
// How many instances to migrate per pass so a backlog never blocks the loop.
const BATCH_SIZE = Number(process.env.PACS_TIERING_BATCH || 500);
// Where cold objects conceptually live. The real push to S3/Glacier/NAS is the
// one Orthanc-specific hook a deployment supplies; here we record the reference
// so WADO can fetch-on-demand later. Keeping this string-based preserves the
// swap-later contract (a native engine tiers the same rows the same way).
const COLD_PREFIX = process.env.PACS_COLD_PREFIX || 's3://VIARA-pacs-cold';

/**
 * Migrate a batch of aged 'hot' instances to the 'cold' tier.
 *
 * v1 performs the *bookkeeping* half of tiering: it flips storage_tier and
 * stamps file_ref so the archive location is known and WADO can resolve it on
 * demand. The physical copy-to-cold + drop-from-Orthanc-hot step is a pluggable
 * archiver injected by deployment (S3/Glacier/NAS); until one is wired, rows are
 * marked cold with a deterministic reference and left resolvable via Orthanc.
 *
 * Idempotent and bounded (LIMIT BATCH_SIZE). Returns { migrated }.
 */
const tierColdInstances = async (pool, { archiver } = {}) => {
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
            // Optional physical archive step. If a deployment supplies an
            // archiver it returns the durable reference; otherwise we synthesize
            // one and rely on Orthanc for retrieval until real tiering is wired.
            const fileRef = archiver
                ? await archiver(row)
                : `${COLD_PREFIX}/${row.study_instance_uid}/${row.sop_instance_uid}.dcm`;

            await pool.query(
                `UPDATE pacs_instances
                 SET storage_tier = 'cold', file_ref = $2
                 WHERE sop_instance_uid = $1`,
                [row.sop_instance_uid, fileRef]
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

    logger.info(`PACS tiering: migrated ${migrated} instance(s) to cold`, { threshold_days: TIERING_DAYS });
    return { migrated };
};

module.exports = { tierColdInstances, TIERING_DAYS, BATCH_SIZE, COLD_PREFIX };
