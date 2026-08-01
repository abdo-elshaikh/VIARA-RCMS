const logSecurityEvent = async (db, {
    eventType,
    severity = 'info',
    userId = null,
    patientId = null,
    ipAddress = null,
    userAgent = null,
    details = {}
}) => {
    try {
        await db.query(`
            INSERT INTO security_events (event_type, severity, user_id, patient_id, ip_address, user_agent, details)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [eventType, severity, userId, patientId, ipAddress, userAgent, JSON.stringify(details)]);
    } catch (err) {
        console.error('[SecurityEventService]', err.message);
    }
};

module.exports = { logSecurityEvent };
