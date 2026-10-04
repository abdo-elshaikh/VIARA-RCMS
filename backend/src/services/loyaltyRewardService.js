const { decrypt } = require('../utils/crypto');

let tableInitialized = false;

const ensureLoyaltyLedgerTable = async (db) => {
    if (tableInitialized) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS patient_loyalty_ledger (
                ledger_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                patient_id UUID NOT NULL REFERENCES patients(patient_id) ON DELETE CASCADE,
                points_change INTEGER NOT NULL,
                balance_after INTEGER NOT NULL,
                reason_code VARCHAR(50) NOT NULL,
                description TEXT,
                appointment_id UUID REFERENCES appointments(appointment_id) ON DELETE SET NULL,
                performed_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_patient ON patient_loyalty_ledger(patient_id);
            CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_created_at ON patient_loyalty_ledger(created_at DESC);
        `);
        tableInitialized = true;
    } catch (err) {
        console.error('Failed to ensure patient_loyalty_ledger table:', err);
    }
};

const getTierForPoints = (pts = 0) => {
    if (pts >= 1500) return { key: 'Platinum', nameAr: 'الفئة البلاتينية', nameEn: 'Platinum' };
    if (pts >= 800) return { key: 'Gold', nameAr: 'الفئة الذهبية', nameEn: 'Gold' };
    if (pts >= 300) return { key: 'Silver', nameAr: 'الفئة الفضية', nameEn: 'Silver' };
    return { key: 'Bronze', nameAr: 'الفئة البرونزية', nameEn: 'Bronze' };
};

/**
 * Atomically awards or deducts loyalty points and records the transaction in the ledger.
 */
const awardPoints = async (db, {
    patientId,
    points,
    reasonCode = 'MANUAL_REWARD',
    description = '',
    appointmentId = null,
    performedBy = null,
    client = null
}) => {
    const executor = client || db;
    await ensureLoyaltyLedgerTable(executor);

    // Fetch current points for tier change detection
    const currentRes = await executor.query(
        'SELECT loyalty_points FROM patients WHERE patient_id = $1 FOR UPDATE',
        [patientId]
    );
    if (!currentRes.rows.length) {
        return { success: false, reason: 'Patient not found' };
    }

    const currentPoints = Number(currentRes.rows[0].loyalty_points || 0);
    const newBalance = Math.max(0, currentPoints + points);

    // Update patient balance
    const updateRes = await executor.query(`
        UPDATE patients
        SET loyalty_points = $1
        WHERE patient_id = $2
        RETURNING patient_id, first_name_enc, last_name_enc, phone_enc, loyalty_points
    `, [newBalance, patientId]);

    const oldTier = getTierForPoints(currentPoints);
    const newTier = getTierForPoints(newBalance);
    const tierUpgraded = newBalance > currentPoints && newTier.key !== oldTier.key;

    // Record in ledger
    let ledgerEntry = null;
    try {
        const ledgerRes = await executor.query(`
            INSERT INTO patient_loyalty_ledger (
                patient_id, points_change, balance_after, reason_code, description, appointment_id, performed_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            patientId,
            points,
            newBalance,
            reasonCode,
            description,
            appointmentId,
            performedBy
        ]);
        ledgerEntry = ledgerRes.rows[0];
    } catch (e) {
        console.warn('Failed to insert into patient_loyalty_ledger:', e.message);
    }

    const patientRow = updateRes.rows[0];
    return {
        success: true,
        pointsAwarded: points,
        balanceAfter: newBalance,
        oldTier: oldTier.key,
        newTier: newTier.key,
        tierUpgraded,
        ledgerEntry,
        patient: {
            patient_id: patientRow.patient_id,
            loyalty_points: patientRow.loyalty_points,
            first_name: decrypt(patientRow.first_name_enc),
            last_name: decrypt(patientRow.last_name_enc)
        }
    };
};

/**
 * Gets loyalty transaction history for a specific patient.
 */
const getLoyaltyHistory = async (db, patientId) => {
    await ensureLoyaltyLedgerTable(db);
    const result = await db.query(`
        SELECT l.*, u.full_name AS performed_by_name
        FROM patient_loyalty_ledger l
        LEFT JOIN users u ON l.performed_by = u.user_id
        WHERE l.patient_id = $1
        ORDER BY l.created_at DESC
        LIMIT 50
    `, [patientId]);
    return result.rows;
};

/**
 * Awards instant reward for on-time arrival (+15 points).
 * Idempotent per appointment.
 */
const handleOnTimeArrivalReward = async (db, { patientId, appointmentId, client = null }) => {
    if (!patientId || !appointmentId) return null;
    const executor = client || db;
    await ensureLoyaltyLedgerTable(executor);

    // Check if already awarded for this appointment
    const existing = await executor.query(`
        SELECT 1 FROM patient_loyalty_ledger
        WHERE appointment_id = $1 AND reason_code = 'ON_TIME_ARRIVAL'
        LIMIT 1
    `, [appointmentId]);
    if (existing.rows.length > 0) return null;

    // Check appointment start time
    const apptRes = await executor.query(`
        SELECT start_time FROM appointments WHERE appointment_id = $1
    `, [appointmentId]);
    if (!apptRes.rows.length) return null;

    const startTime = new Date(apptRes.rows[0].start_time);
    const now = new Date();
    // Allow up to 10 minutes past start_time as on-time arrival
    const gracePeriodMs = 10 * 60 * 1000;
    if (now.getTime() <= startTime.getTime() + gracePeriodMs) {
        return awardPoints(executor, {
            patientId,
            points: 15,
            reasonCode: 'ON_TIME_ARRIVAL',
            description: 'مكافأة الالتزام بالموعد والحضور في الوقت المحدد (+15 نقطة)',
            appointmentId,
            client
        });
    }
    return null;
};

/**
 * Awards instant reward for repeat visits & milestone scan completions.
 * Idempotent per appointment.
 */
const handleVisitCompletionReward = async (db, { patientId, appointmentId, isFollowUp = false, client = null }) => {
    if (!patientId || !appointmentId) return null;
    const executor = client || db;
    await ensureLoyaltyLedgerTable(executor);

    // Check if already awarded visit reward for this appointment
    const existing = await executor.query(`
        SELECT 1 FROM patient_loyalty_ledger
        WHERE appointment_id = $1 AND reason_code IN ('WELCOME_BONUS', 'REPEAT_VISIT', 'CLINICAL_RECALL_COMPLETED')
        LIMIT 1
    `, [appointmentId]);
    if (existing.rows.length > 0) return null;

    if (isFollowUp) {
        return awardPoints(executor, {
            patientId,
            points: 50,
            reasonCode: 'CLINICAL_RECALL_COMPLETED',
            description: 'مكافأة إتمام الفحص الوقائي / الاستدعاء الدوري (+50 نقطة)',
            appointmentId,
            client
        });
    }

    // Count past completed appointments for this patient (excluding current one)
    const countRes = await executor.query(`
        SELECT COUNT(*)::int AS count
        FROM appointments
        WHERE patient_id = $1
          AND appointment_id <> $2
          AND status = 'Completed'
    `, [patientId, appointmentId]);
    const priorCount = countRes.rows[0]?.count || 0;

    let points = 25;
    let reasonCode = 'REPEAT_VISIT';
    let description = 'مكافأة إتمام الفحص والزيارة (+25 نقطة)';

    if (priorCount === 0) {
        points = 50;
        reasonCode = 'WELCOME_BONUS';
        description = 'مكافأة الترحيب بإتمام أول فحص في المركز (+50 نقطة)';
    } else if (priorCount === 1) {
        points = 30;
        reasonCode = 'REPEAT_VISIT';
        description = 'مكافأة الزيارة المتكررة الثانية (+30 نقطة)';
    } else if (priorCount === 2) {
        points = 40;
        reasonCode = 'REPEAT_VISIT';
        description = 'مكافأة العميل الدائم - الزيارة الثالثة (+40 نقطة)';
    } else if (priorCount === 4) {
        points = 100;
        reasonCode = 'REPEAT_VISIT';
        description = 'مكافأة محطة التميز VIP - الزيارة الخامسة (+100 نقطة)';
    }

    return awardPoints(executor, {
        patientId,
        points,
        reasonCode,
        description,
        appointmentId,
        client
    });
};

module.exports = {
    ensureLoyaltyLedgerTable,
    getTierForPoints,
    awardPoints,
    getLoyaltyHistory,
    handleOnTimeArrivalReward,
    handleVisitCompletionReward
};
