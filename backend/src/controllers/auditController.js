const crypto = require('node:crypto');
const { logAction } = require('../services/auditService');
const {
    AUDIT_ACTOR_TYPE,
    AUDIT_CATEGORY,
    AUDIT_EVENT_CODES,
    AUDIT_OUTCOME,
    AUDIT_SEVERITY,
    VALID_ACTOR_TYPES,
    VALID_CATEGORIES,
    VALID_OUTCOMES
} = require('../services/auditTaxonomy');
const { runAuditPatternDetections } = require('../services/auditDetectionService');

const auditAdminAction = async (db, req, {
    eventCode,
    target = {},
    details = {},
    outcome = AUDIT_OUTCOME.SUCCESS,
    statusCode = 200,
    riskScore = 0,
    riskReason = null,
}) => {
    await logAction(db, {
        actor: {
            type: AUDIT_ACTOR_TYPE.USER,
            userId: req.user?.user_id,
            role: req.user?.role,
            name: req.user?.full_name || req.user?.name,
        },
        event: {
            code: eventCode,
            category: AUDIT_CATEGORY.SECURITY,
            severity: riskScore >= 50 ? AUDIT_SEVERITY.WARNING : AUDIT_SEVERITY.INFO,
        },
        target,
        context: {
            requestId: req.id || null,
            ipAddress: req.ip || req.connection?.remoteAddress || null,
            userAgent: req.get?.('user-agent') || null,
            method: req.method,
            path: req.originalUrl?.split('?')[0],
            sourceSystem: 'backend-api',
        },
        details,
        result: {
            outcome,
            statusCode,
        },
        risk: {
            score: riskScore,
            reason: riskReason,
        },
    });
};

// Build the shared WHERE clause + params for the audit queries so the list,
// count, aggregates, and export all filter identically.
const buildAuditFilters = (query) => {
    const {
        userId, action, resourceId, startDate, endDate, category, outcome, q,
        actorType, eventCode, targetType, targetId, patientId, examId, invoiceId, requestId
    } = query;
    const minSeverity = Number.parseInt(query.minSeverity, 10);
    const minRisk = Number.parseInt(query.minRisk, 10);

    const clauses = ['1=1'];
    const params = [];
    let i = 1;

    if (userId) { clauses.push(`(s.actor_user_id = $${i} OR s.user_id = $${i})`); params.push(userId); i++; }
    if (resourceId) { clauses.push(`(s.target_id = $${i} OR s.resource_id = $${i})`); params.push(resourceId); i++; }
    if (category && VALID_CATEGORIES.has(category)) { clauses.push(`s.category = $${i++}`); params.push(category); }
    if (outcome && VALID_OUTCOMES.has(outcome)) { clauses.push(`s.outcome = $${i++}`); params.push(outcome); }
    if (actorType && VALID_ACTOR_TYPES.has(actorType)) { clauses.push(`s.actor_type = $${i++}`); params.push(actorType); }
    if (eventCode) { clauses.push(`s.event_code ILIKE $${i++}`); params.push(`%${eventCode}%`); }
    if (targetType) { clauses.push(`s.target_type = $${i++}`); params.push(targetType); }
    if (targetId) { clauses.push(`s.target_id = $${i++}`); params.push(targetId); }
    if (patientId) { clauses.push(`s.patient_id = $${i++}`); params.push(patientId); }
    if (examId) { clauses.push(`s.exam_id = $${i++}`); params.push(examId); }
    if (invoiceId) { clauses.push(`s.invoice_id = $${i++}`); params.push(invoiceId); }
    if (requestId) { clauses.push(`s.request_id = $${i++}`); params.push(requestId); }
    if (Number.isFinite(minSeverity)) { clauses.push(`s.severity >= $${i++}`); params.push(minSeverity); }
    if (Number.isFinite(minRisk)) { clauses.push(`s.risk_score >= $${i++}`); params.push(minRisk); }
    if (startDate) { clauses.push(`s.timestamp >= $${i++}`); params.push(startDate); }
    if (endDate) { clauses.push(`s.timestamp <= $${i++}`); params.push(endDate); }
    if (action) { clauses.push(`(s.action ILIKE $${i} OR s.event_action ILIKE $${i})`); params.push(`%${action}%`); i++; }
    // Full-text-ish search across action, request path, and the joined user name.
    if (q) {
        clauses.push(`(
            s.action ILIKE $${i}
            OR s.event_code ILIKE $${i}
            OR s.request_path ILIKE $${i}
            OR s.target_label ILIKE $${i}
            OR s.actor_name ILIKE $${i}
            OR u.full_name ILIKE $${i}
        )`);
        params.push(`%${q}%`);
        i++;
    }

    return { where: clauses.join(' AND '), params, nextIndex: i };
};

const AUDIT_SELECT = `
    s.log_id, s.user_id, u.full_name as user_name, u.role as user_role,
    s.action, s.resource_id, s.resource_table, s.ip_address, s.details, s.timestamp,
    s.category, s.severity, s.outcome, s.http_method, s.request_path,
    s.previous_value, s.new_value, s.actor_type, s.actor_user_id, s.actor_role,
    s.actor_name, s.session_id, s.request_id, s.event_code, s.event_family,
    s.event_action, s.target_type, s.target_id, s.target_label, s.patient_id,
    s.exam_id, s.invoice_id, s.report_id, s.appointment_id, s.source_system,
    s.user_agent, s.device_fingerprint, s.status_code, s.risk_score,
    s.risk_reason, s.changed_fields, s.metadata
`;

const getAuditLogs = (db) => async (req, res, next) => {
    try {
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
        const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
        const { where, params, nextIndex } = buildAuditFilters(req.query);

        const listQuery = `
            SELECT ${AUDIT_SELECT}
            FROM system_logs s
            LEFT JOIN users u ON s.user_id = u.user_id
            WHERE ${where}
            ORDER BY s.timestamp DESC
            LIMIT $${nextIndex} OFFSET $${nextIndex + 1}
        `;
        const listResult = await db.query(listQuery, [...params, limit, offset]);

        // Total + aggregate counts over the FULL filtered set (not just this page).
        const aggQuery = `
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE s.outcome = 'failure')::int AS failures,
                COUNT(*) FILTER (WHERE s.outcome = 'denied')::int AS denied,
                COUNT(*) FILTER (WHERE s.category = 'PHI_ACCESS')::int AS phi_access,
                COUNT(*) FILTER (WHERE s.severity >= 40)::int AS elevated,
                COUNT(*) FILTER (WHERE s.risk_score >= 50)::int AS risky,
                COUNT(*) FILTER (WHERE s.actor_type = 'SYSTEM')::int AS system_events
            FROM system_logs s
            LEFT JOIN users u ON s.user_id = u.user_id
            WHERE ${where}
        `;
        const aggResult = await db.query(aggQuery, params);
        const agg = aggResult.rows[0] || {};

        res.json({
            logs: listResult.rows,
            total: agg.total || 0,
            summary: {
                total: agg.total || 0,
                failures: agg.failures || 0,
                denied: agg.denied || 0,
                phiAccess: agg.phi_access || 0,
                elevated: agg.elevated || 0,
                risky: agg.risky || 0,
                systemEvents: agg.system_events || 0,
            },
        });
    } catch (error) {
        next(error);
    }
};

// Server-side CSV export honoring the same filters (capped to keep memory bounded).
const csvCell = (value) => {
    if (value === null || value === undefined) return '';
    let str = typeof value === 'object' ? JSON.stringify(value) : String(value);
    // Guard against CSV injection.
    if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
    if (/[",\n]/.test(str)) str = `"${str.replace(/"/g, '""')}"`;
    return str;
};

const exportAuditLogs = (db) => async (req, res, next) => {
    try {
        const { where, params, nextIndex } = buildAuditFilters(req.query);
        const cap = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10000, 1), 50000);

        const result = await db.query(`
            SELECT ${AUDIT_SELECT}
            FROM system_logs s
            LEFT JOIN users u ON s.user_id = u.user_id
            WHERE ${where}
            ORDER BY s.timestamp DESC
            LIMIT $${nextIndex}
        `, [...params, cap]);

        const header = [
            'Timestamp', 'Actor Type', 'User', 'Role', 'Event Code', 'Family', 'Category',
            'Severity', 'Outcome', 'Risk Score', 'Method', 'Path', 'Target Type',
            'Target ID', 'Patient ID', 'Exam ID', 'Invoice ID', 'IP', 'Request ID', 'Details'
        ];
        const lines = [header.map(csvCell).join(',')];
        for (const row of result.rows) {
            lines.push([
                row.timestamp, row.actor_type, row.actor_name || row.user_name, row.actor_role || row.user_role,
                row.event_code || row.action, row.event_family, row.category, row.severity,
                row.outcome, row.risk_score, row.http_method, row.request_path,
                row.target_type || row.resource_table, row.target_id || row.resource_id,
                row.patient_id, row.exam_id, row.invoice_id, row.ip_address, row.request_id, row.details,
            ].map(csvCell).join(','));
        }

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`);

        await auditAdminAction(db, req, {
            eventCode: AUDIT_EVENT_CODES.AUDIT_EXPORT_CREATED,
            target: { type: 'system_logs' },
            details: {
                exportedRows: result.rows.length,
                cap,
                filters: req.query,
            },
            riskScore: 60,
            riskReason: 'Audit log export can expose sensitive operational history.',
        });

        res.send(lines.join('\r\n'));
    } catch (error) {
        next(error);
    }
};

// Verify the tamper-evident hash chain server-side. Recomputes each entry_hash
// using the SAME formula as the rcms_chain_audit_log() trigger (migration 038)
// and confirms previous_hash linkage.
const verifyAuditChain = (db) => async (req, res, next) => {
    try {
        const sha256 = (parts) => crypto.createHash('sha256')
            .update(parts.join('|')).digest('hex');
        const GENESIS = '0'.repeat(64);

        // Stream in ascending log_id order. Bounded scan for very large tables.
        const maxRows = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100000, 1), 1000000);
        const result = await db.query(`
            SELECT log_id, user_id, action, resource_id, resource_table,
                   ip_address, details, details::text AS details_text,
                   timestamp, timestamp::text AS timestamp_text, previous_hash, entry_hash,
                   audit_hash_version, actor_type, actor_user_id, actor_role,
                   session_id, request_id, event_code, event_family, event_action,
                   target_type, target_id, patient_id, exam_id, invoice_id, report_id,
                   appointment_id, source_system, user_agent, status_code, risk_score,
                   risk_reason, changed_fields::text AS changed_fields_text,
                   metadata::text AS metadata_text, previous_value::text AS previous_value_text,
                   new_value::text AS new_value_text
            FROM system_logs
            ORDER BY log_id ASC
            LIMIT $1
        `, [maxRows]);

        let priorHash = GENESIS;
        let checkedCount = 0;
        let firstBrokenLogId = null;

        for (const row of result.rows) {
            const baseParts = [
                priorHash,
                row.user_id ? String(row.user_id) : '',
                row.action,
                row.resource_id ? String(row.resource_id) : '',
                row.resource_table || '',
                row.ip_address || '',
                row.details_text || '',
                row.timestamp_text || '',
            ];
            const structuredParts = Number(row.audit_hash_version || 1) >= 2 ? [
                row.actor_type || '',
                row.actor_user_id ? String(row.actor_user_id) : '',
                row.actor_role || '',
                row.session_id ? String(row.session_id) : '',
                row.request_id || '',
                row.event_code || '',
                row.event_family || '',
                row.event_action || '',
                row.target_type || '',
                row.target_id ? String(row.target_id) : '',
                row.patient_id ? String(row.patient_id) : '',
                row.exam_id ? String(row.exam_id) : '',
                row.invoice_id ? String(row.invoice_id) : '',
                row.report_id ? String(row.report_id) : '',
                row.appointment_id ? String(row.appointment_id) : '',
                row.source_system || '',
                row.user_agent || '',
                row.status_code !== null && row.status_code !== undefined ? String(row.status_code) : '',
                row.risk_score !== null && row.risk_score !== undefined ? String(row.risk_score) : '',
                row.risk_reason || '',
                row.changed_fields_text || '',
                row.metadata_text || '',
                row.previous_value_text || '',
                row.new_value_text || '',
            ] : [];
            const computed = sha256([...baseParts, ...structuredParts]);

            if (row.previous_hash !== priorHash || row.entry_hash !== computed) {
                firstBrokenLogId = row.log_id;
                break;
            }
            priorHash = row.entry_hash;
            checkedCount += 1;
        }

        const response = {
            ok: firstBrokenLogId === null,
            checkedCount,
            firstBrokenLogId,
            verifiedAt: new Date().toISOString(),
            note: firstBrokenLogId !== null
                ? 'Hash mismatch may also indicate a timestamp/details serialization difference; investigate before assuming tampering.'
                : undefined,
        };

        await auditAdminAction(db, req, {
            eventCode: AUDIT_EVENT_CODES.AUDIT_CHAIN_VERIFIED,
            target: { type: 'system_logs' },
            details: response,
            outcome: response.ok ? AUDIT_OUTCOME.SUCCESS : AUDIT_OUTCOME.FAILURE,
            statusCode: response.ok ? 200 : 409,
            riskScore: response.ok ? 0 : 95,
            riskReason: response.ok ? null : 'Audit hash-chain verification reported a mismatch.',
        });

        res.json(response);
    } catch (error) {
        next(error);
    }
};

const getMyAuditLogs = (db) => async (req, res, next) => {
    try {
        const userId = req.user.user_id;
        const limit = 50;

        const query = `
            SELECT log_id as id, action as event, category, outcome, severity,
                   ip_address as ip, details as metadata, timestamp as time
            FROM system_logs
            WHERE user_id = $1
            ORDER BY timestamp DESC
            LIMIT $2
        `;
        const result = await db.query(query, [userId, limit]);

        const logs = result.rows.map(row => ({
            id: row.id,
            event: row.event,
            category: (row.category || 'SECURITY').toLowerCase(),
            outcome: row.outcome || 'success',
            severity: row.severity ?? 20,
            ip: row.ip || null,
            time: row.time,
            metadata: row.metadata,
        }));

        res.json({ logs });
    } catch (error) {
        next(error);
    }
};

const buildAlertFilters = (query) => {
    const clauses = ['1=1'];
    const params = [];
    let i = 1;

    if (query.status) { clauses.push(`a.status = $${i++}`); params.push(query.status); }
    if (query.severity) { clauses.push(`a.severity = $${i++}`); params.push(query.severity); }
    if (query.actorUserId) { clauses.push(`a.actor_user_id = $${i++}`); params.push(query.actorUserId); }
    if (query.patientId) { clauses.push(`a.patient_id = $${i++}`); params.push(query.patientId); }
    if (query.alertType) { clauses.push(`a.alert_type = $${i++}`); params.push(query.alertType); }

    return { where: clauses.join(' AND '), params, nextIndex: i };
};

const getAuditAlerts = (db) => async (req, res, next) => {
    try {
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
        const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
        const { where, params, nextIndex } = buildAlertFilters(req.query);

        const result = await db.query(`
            SELECT a.*, u.full_name AS actor_name, r.full_name AS reviewed_by_name,
                   s.event_code, s.action, s.timestamp AS audit_timestamp
            FROM audit_alerts a
            LEFT JOIN users u ON a.actor_user_id = u.user_id
            LEFT JOIN users r ON a.reviewed_by = r.user_id
            LEFT JOIN system_logs s ON a.audit_log_id = s.log_id
            WHERE ${where}
            ORDER BY a.created_at DESC
            LIMIT $${nextIndex} OFFSET $${nextIndex + 1}
        `, [...params, limit, offset]);

        const countResult = await db.query(`
            SELECT COUNT(*)::int AS total
            FROM audit_alerts a
            WHERE ${where}
        `, params);

        res.json({ alerts: result.rows, total: countResult.rows[0]?.total || 0 });
    } catch (error) {
        next(error);
    }
};

const reviewAuditAlert = (db) => async (req, res, next) => {
    try {
        const { status, resolutionNotes } = req.body || {};
        if (!['reviewing', 'resolved', 'dismissed'].includes(status)) {
            return res.status(400).json({ message: 'Invalid alert status' });
        }

        const result = await db.query(`
            UPDATE audit_alerts
            SET status = $1,
                reviewed_by = $2,
                reviewed_at = CURRENT_TIMESTAMP,
                resolution_notes = $3
            WHERE alert_id = $4
            RETURNING *
        `, [status, req.user?.user_id || null, resolutionNotes || null, req.params.alertId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Audit alert not found' });
        }

        await auditAdminAction(db, req, {
            eventCode: AUDIT_EVENT_CODES.AUDIT_ALERT_REVIEWED,
            target: { type: 'audit_alerts', id: req.params.alertId },
            details: {
                status,
                resolutionNotes: resolutionNotes || null,
                alertType: result.rows[0].alert_type,
                severity: result.rows[0].severity,
            },
        });

        res.json({ alert: result.rows[0] });
    } catch (error) {
        next(error);
    }
};

const runAuditDetections = (db) => async (req, res, next) => {
    try {
        const result = await runAuditPatternDetections(db, {
            failedAuthThreshold: Number.parseInt(req.body?.failedAuthThreshold, 10) || undefined,
            deniedThreshold: Number.parseInt(req.body?.deniedThreshold, 10) || undefined,
            phiAccessCountThreshold: Number.parseInt(req.body?.phiAccessCountThreshold, 10) || undefined,
            phiPatientThreshold: Number.parseInt(req.body?.phiPatientThreshold, 10) || undefined,
        });

        await auditAdminAction(db, req, {
            eventCode: AUDIT_EVENT_CODES.AUDIT_DETECTION_RUN,
            target: { type: 'audit_alerts' },
            details: {
                totalCreated: result.totalCreated || 0,
                rules: result.rules || [],
            },
            riskScore: 30,
        });

        res.json(result);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getAuditLogs,
    getMyAuditLogs,
    exportAuditLogs,
    verifyAuditChain,
    getAuditAlerts,
    reviewAuditAlert,
    runAuditDetections,
};
