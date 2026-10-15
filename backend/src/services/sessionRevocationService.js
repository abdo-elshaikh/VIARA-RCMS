// Match login/refresh lock order: account first, then refresh tokens.
// An old login family must not clear the account's newer current session.
const revokeRefreshSession = async (db, tokenHash, portal) => {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(`
            SELECT user_id, patient_id, doctor_id, session_id
            FROM refresh_tokens WHERE token_hash = $1
              AND ${portal
        ? 'user_id IS NULL AND (patient_id IS NOT NULL OR doctor_id IS NOT NULL)'
        : 'user_id IS NOT NULL AND patient_id IS NULL AND doctor_id IS NULL'}
        `, [tokenHash]);
        const owner = result.rows[0];
        if (owner?.session_id) {
            const [table, column] = owner.user_id ? ['users', 'user_id']
                : owner.patient_id ? ['patients', 'patient_id'] : ['referring_doctors', 'doctor_id'];
            await client.query(`SELECT current_session_id FROM ${table} WHERE ${column} = $1 FOR UPDATE`, [owner[column]]);
            await client.query(`
                UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'logout'
                WHERE ${column} = $1 AND session_id = $2
            `, [owner[column], owner.session_id]);
            await client.query(`UPDATE ${table} SET current_session_id = NULL WHERE ${column} = $1 AND current_session_id = $2`, [owner[column], owner.session_id]);
        }
        await client.query('COMMIT');
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* retain original error */ }
        throw error;
    } finally { client.release(); }
};
module.exports = { revokeRefreshSession };
