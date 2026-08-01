const { logAction } = require('./auditService');
const {
    AUDIT_ACTOR_TYPE,
    AUDIT_CATEGORY,
    AUDIT_OUTCOME,
    AUDIT_SEVERITY,
} = require('./auditTaxonomy');

const logSystemAuditEvent = async (db, {
    eventCode,
    jobName,
    sourceSystem = jobName || 'background-job',
    target = {},
    details = {},
    outcome = AUDIT_OUTCOME.SUCCESS,
    severity,
    riskScore,
    riskReason = null,
}) => {
    const resolvedSeverity = severity || (outcome === AUDIT_OUTCOME.SUCCESS
        ? AUDIT_SEVERITY.INFO
        : AUDIT_SEVERITY.WARNING);
    const resolvedRiskScore = Number.isFinite(Number(riskScore))
        ? Number(riskScore)
        : (outcome === AUDIT_OUTCOME.SUCCESS ? 0 : 80);

    return logAction(db, {
        actor: { type: AUDIT_ACTOR_TYPE.SYSTEM },
        event: {
            code: eventCode,
            category: AUDIT_CATEGORY.SECURITY,
            severity: resolvedSeverity,
        },
        target: {
            type: target.type || 'system_jobs',
            id: target.id || null,
            label: target.label || jobName || sourceSystem,
        },
        context: {
            sourceSystem,
        },
        details: {
            jobName,
            ...details,
        },
        result: {
            outcome,
            statusCode: outcome === AUDIT_OUTCOME.SUCCESS ? 200 : 500,
        },
        risk: {
            score: resolvedRiskScore,
            reason: riskReason,
        },
        metadata: {
            system: true,
        },
    });
};

module.exports = {
    logSystemAuditEvent,
};
