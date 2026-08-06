const { AUDIT_SEVERITY, AUDIT_OUTCOME, HIGH_RISK_EVENT_CODES } = require('./auditTaxonomy');

const severityNameFromScore = (score) => {
    if (score >= 85) return 'critical';
    if (score >= 50) return 'warning';
    return 'info';
};

const buildAuditAlerts = (entry, logId) => {
    const alerts = [];
    const riskScore = Number(entry.risk_score || 0);
    const eventCode = entry.event_code || entry.action;

    if (riskScore >= 50) {
        alerts.push({
            auditLogId: logId,
            alertType: 'HIGH_RISK_AUDIT_EVENT',
            severity: severityNameFromScore(riskScore),
            reason: entry.risk_reason || `Audit event scored ${riskScore}/100 risk`,
        });
    }

    if (HIGH_RISK_EVENT_CODES.has(eventCode)) {
        alerts.push({
            auditLogId: logId,
            alertType: 'SENSITIVE_ACTION',
            severity: riskScore >= 85 ? 'critical' : 'warning',
            reason: `Sensitive action recorded: ${eventCode}`,
        });
    }

    if (entry.outcome === AUDIT_OUTCOME.DENIED || entry.severity >= AUDIT_SEVERITY.CRITICAL) {
        alerts.push({
            auditLogId: logId,
            alertType: entry.outcome === AUDIT_OUTCOME.DENIED ? 'ACCESS_DENIED' : 'CRITICAL_AUDIT_EVENT',
            severity: entry.severity >= AUDIT_SEVERITY.CRITICAL ? 'critical' : 'warning',
            reason: entry.outcome === AUDIT_OUTCOME.DENIED
                ? `Denied access: ${eventCode}`
                : `Critical audit event: ${eventCode}`,
        });
    }

    return alerts;
};

const persistAuditAlerts = async (db, entry, logId) => {
    if (!db || !logId) return;

    const alerts = buildAuditAlerts(entry, logId);
    if (alerts.length === 0) return;

    const values = [];
    const sqlParts = [];
    const baseEvidence = JSON.stringify({
        eventCode: entry.event_code || entry.action,
        outcome: entry.outcome,
        severity: entry.severity,
        riskScore: entry.risk_score || 0,
        requestId: entry.request_id || null,
    });

    alerts.forEach((alert, i) => {
        const offset = i * 9;
        sqlParts.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`);
        values.push(
            alert.auditLogId,
            alert.alertType,
            alert.severity,
            entry.actor_user_id || entry.user_id || null,
            entry.patient_id || null,
            entry.target_type || entry.resource_table || null,
            entry.target_id || entry.resource_id || null,
            alert.reason,
            baseEvidence
        );
    });

    try {
        await db.query(`
            INSERT INTO audit_alerts (
                audit_log_id, alert_type, severity, actor_user_id, patient_id,
                target_type, target_id, reason, evidence
            ) VALUES ${sqlParts.join(', ')}
        `, values);
    } catch (err) {
        if (err.code !== '42P01' && err.code !== '42703') {
            const logger = require('../config/logger');
            logger.error('AuditDetectionService: Alert logging failed', { error: err.message });
        }
    }
};

const runRule = async (db, name, sql, params = []) => {
    try {
        const result = await db.query(sql, params);
        return { rule: name, created: result.rowCount || 0 };
    } catch (err) {
        if (err.code === '42P01' || err.code === '42703') {
            return { rule: name, created: 0, skipped: true, reason: err.message };
        }
        throw err;
    }
};

const runAuditPatternDetections = async (db, {
    failedAuthThreshold = 5,
    deniedThreshold = 5,
    phiAccessCountThreshold = 50,
    phiPatientThreshold = 25,
} = {}) => {
    if (!db) return { rules: [], totalCreated: 0 };

    const rules = [];

    rules.push(await runRule(db, 'AUTH_FAILURE_BURST', `
        WITH bursts AS (
            SELECT
                COALESCE(actor_user_id, user_id) AS actor_user_id,
                ip_address,
                COUNT(*)::int AS event_count,
                MAX(log_id) AS audit_log_id,
                MIN(timestamp) AS first_seen,
                MAX(timestamp) AS last_seen
            FROM system_logs
            WHERE timestamp >= NOW() - INTERVAL '15 minutes'
              AND (
                outcome = 'failure'
                OR event_code ILIKE 'AUTH.LOGIN_FAILED'
                OR action ILIKE '%LOGIN_FAILED%'
              )
              AND (category = 'AUTH' OR event_family = 'AUTH' OR action ILIKE '%login%')
            GROUP BY COALESCE(actor_user_id, user_id), ip_address
            HAVING COUNT(*) >= $1
        )
        INSERT INTO audit_alerts (
            audit_log_id, alert_type, severity, actor_user_id, target_type,
            reason, evidence
        )
        SELECT
            b.audit_log_id,
            'AUTH_FAILURE_BURST',
            CASE WHEN b.event_count >= ($1 * 2) THEN 'critical' ELSE 'warning' END,
            b.actor_user_id,
            'auth',
            'Multiple failed authentication events from the same user or IP',
            jsonb_build_object(
                'eventCount', b.event_count,
                'ipAddress', b.ip_address,
                'firstSeen', b.first_seen,
                'lastSeen', b.last_seen,
                'threshold', $1
            )
        FROM bursts b
        WHERE NOT EXISTS (
            SELECT 1 FROM audit_alerts a
            WHERE a.alert_type = 'AUTH_FAILURE_BURST'
              AND COALESCE(a.actor_user_id::text, '') = COALESCE(b.actor_user_id::text, '')
              AND COALESCE(a.evidence->>'ipAddress', '') = COALESCE(b.ip_address, '')
              AND a.created_at >= NOW() - INTERVAL '30 minutes'
        )
    `, [failedAuthThreshold]));

    rules.push(await runRule(db, 'DENIED_ACCESS_BURST', `
        WITH bursts AS (
            SELECT
                COALESCE(actor_user_id, user_id) AS actor_user_id,
                ip_address,
                COUNT(*)::int AS event_count,
                MAX(log_id) AS audit_log_id,
                MIN(timestamp) AS first_seen,
                MAX(timestamp) AS last_seen
            FROM system_logs
            WHERE timestamp >= NOW() - INTERVAL '15 minutes'
              AND outcome = 'denied'
            GROUP BY COALESCE(actor_user_id, user_id), ip_address
            HAVING COUNT(*) >= $1
        )
        INSERT INTO audit_alerts (
            audit_log_id, alert_type, severity, actor_user_id, target_type,
            reason, evidence
        )
        SELECT
            b.audit_log_id,
            'DENIED_ACCESS_BURST',
            CASE WHEN b.event_count >= ($1 * 2) THEN 'critical' ELSE 'warning' END,
            b.actor_user_id,
            'access-control',
            'Repeated denied access attempts detected',
            jsonb_build_object(
                'eventCount', b.event_count,
                'ipAddress', b.ip_address,
                'firstSeen', b.first_seen,
                'lastSeen', b.last_seen,
                'threshold', $1
            )
        FROM bursts b
        WHERE NOT EXISTS (
            SELECT 1 FROM audit_alerts a
            WHERE a.alert_type = 'DENIED_ACCESS_BURST'
              AND COALESCE(a.actor_user_id::text, '') = COALESCE(b.actor_user_id::text, '')
              AND COALESCE(a.evidence->>'ipAddress', '') = COALESCE(b.ip_address, '')
              AND a.created_at >= NOW() - INTERVAL '30 minutes'
        )
    `, [deniedThreshold]));

    rules.push(await runRule(db, 'MASS_PHI_ACCESS', `
        WITH access AS (
            SELECT
                COALESCE(actor_user_id, user_id) AS actor_user_id,
                COUNT(*)::int AS event_count,
                COUNT(DISTINCT patient_id)::int AS patient_count,
                MAX(log_id) AS audit_log_id,
                MIN(timestamp) AS first_seen,
                MAX(timestamp) AS last_seen
            FROM system_logs
            WHERE timestamp >= NOW() - INTERVAL '60 minutes'
              AND category = 'PHI_ACCESS'
              AND outcome = 'success'
              AND COALESCE(actor_user_id, user_id) IS NOT NULL
            GROUP BY COALESCE(actor_user_id, user_id)
            HAVING COUNT(*) >= $1 OR COUNT(DISTINCT patient_id) >= $2
        )
        INSERT INTO audit_alerts (
            audit_log_id, alert_type, severity, actor_user_id, target_type,
            reason, evidence
        )
        SELECT
            a.audit_log_id,
            'MASS_PHI_ACCESS',
            CASE WHEN a.event_count >= ($1 * 2) OR a.patient_count >= ($2 * 2) THEN 'critical' ELSE 'warning' END,
            a.actor_user_id,
            'patients',
            'High-volume protected health information access detected',
            jsonb_build_object(
                'eventCount', a.event_count,
                'patientCount', a.patient_count,
                'firstSeen', a.first_seen,
                'lastSeen', a.last_seen,
                'eventThreshold', $1,
                'patientThreshold', $2
            )
        FROM access a
        WHERE NOT EXISTS (
            SELECT 1 FROM audit_alerts existing
            WHERE existing.alert_type = 'MASS_PHI_ACCESS'
              AND existing.actor_user_id = a.actor_user_id
              AND existing.created_at >= NOW() - INTERVAL '2 hours'
        )
    `, [phiAccessCountThreshold, phiPatientThreshold]));

    rules.push(await runRule(db, 'SYSTEM_FAILURE', `
        WITH failures AS (
            SELECT
                log_id AS audit_log_id,
                event_code,
                action,
                target_type,
                target_id,
                risk_score,
                timestamp
            FROM system_logs
            WHERE timestamp >= NOW() - INTERVAL '60 minutes'
              AND actor_type = 'SYSTEM'
              AND (outcome = 'failure' OR severity >= 40)
        )
        INSERT INTO audit_alerts (
            audit_log_id, alert_type, severity, target_type, target_id,
            reason, evidence
        )
        SELECT
            f.audit_log_id,
            'SYSTEM_FAILURE',
            CASE WHEN f.risk_score >= 85 THEN 'critical' ELSE 'warning' END,
            f.target_type,
            f.target_id,
            'System/background action failed or emitted elevated severity',
            jsonb_build_object(
                'eventCode', COALESCE(f.event_code, f.action),
                'riskScore', f.risk_score,
                'timestamp', f.timestamp
            )
        FROM failures f
        WHERE NOT EXISTS (
            SELECT 1 FROM audit_alerts a
            WHERE a.alert_type = 'SYSTEM_FAILURE'
              AND a.audit_log_id = f.audit_log_id
        )
    `));

    const totalCreated = rules.reduce((sum, rule) => sum + Number(rule.created || 0), 0);
    return {
        rules,
        totalCreated,
        checkedAt: new Date().toISOString(),
    };
};

module.exports = {
    buildAuditAlerts,
    persistAuditAlerts,
    runAuditPatternDetections,
};
