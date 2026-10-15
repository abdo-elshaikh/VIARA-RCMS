const {
  AUDIT_ACTOR_TYPE,
  AUDIT_CATEGORY,
  AUDIT_SEVERITY,
  AUDIT_OUTCOME,
  outcomeFromStatus,
  categoryFromRequest,
  familyFromEventCode,
  actionFromEventCode,
} = require('./auditTaxonomy');
const { persistAuditAlerts } = require('./auditDetectionService');
const { logSecurityEvent } = require('./securityEventService');
const logger = require('../config/logger');

const MAX_AUDIT_STRING_LENGTH = 2000;

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'currentpassword',
  'current_password',
  'newpassword',
  'new_password',
  'confirmpassword',
  'passwordconfirmation',
  'token',
  'authorization',
  'secret',
  'apikey',
  'api_key',
  'apisecret',
  'api_secret',
  'webhooksecret',
  'webhook_secret',
  'paymentreference',
  'two_factor_secret',
  'firstname',
  'first_name',
  'lastname',
  'last_name',
  'fullname',
  'full_name',
  'dateofbirth',
  'date_of_birth',
  'dob',
  'phone',
  'email',
  'contactemail',
  'address',
  'mrn',
  'patientid',
  'patient_id',
  'patientname',
  'patient_name',
  'expected_patient_id',
  'raw_patient_id',
  'raw_patient_name',
  'recipientemail',
  'recipient_email',
  'nationalid',
  'national_id',
  'passportnumber',
  'passport_number',
  'emergencycontactname',
  'emergency_contact_name',
  'emergencycontactphone',
  'emergency_contact_phone',
  'emergencycontactaddress',
  'emergency_contact_address',
  'allergies',
  'chronicdiseases',
  'chronic_diseases',
  'priorsurgeries',
  'prior_surgeries',
  'pregnancystatus',
  'pregnancy_status',
  'implantsdevices',
  'implants_devices',
  'renalfunctionnotes',
  'renal_function_notes',
  'reportcontent',
  'report_content',
  'findings',
  'impression',
  'notes',
  'clinicalnotes',
  'clinical_notes',
  'body',
  'subject',
  'reason',
  'discountreason',
  'discount_reason',
  'rejectionreason',
  'rejection_reason',
  'resubmissionnotes',
  'resubmission_notes',
  'cancellationreason',
  'cancellation_reason',
  'clinicalindication',
  'clinical_indication',
  'provisionaldiagnosis',
  'provisional_diagnosis',
  'diagnosis',
  'diagnosiscode',
  'diagnosis_code',
  'icdcode',
  'icd_code',
  'medicalhistory',
  'medical_history',
  'symptoms',
  'medications',
  'proceduredescription',
  'procedure_description',
  'preparationinstructions',
  'preparation_instructions',
]);

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const truncateString = (value) => {
  if (typeof value !== 'string') return value;
  if (value.length <= MAX_AUDIT_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_AUDIT_STRING_LENGTH)}...[TRUNCATED]`;
};

const sanitizeForAudit = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return truncateString(value);
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map(sanitizeForAudit);
  }

  return Object.entries(value).reduce((acc, [key, item]) => {
    acc[key] = SENSITIVE_KEYS.has(String(key).toLowerCase())
      ? '[REDACTED]'
      : sanitizeForAudit(item);
    return acc;
  }, {});
};

const normalizeJsonb = (value, fallback = null) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    try {
      return sanitizeForAudit(JSON.parse(value));
    } catch {
      return { message: sanitizeForAudit(value) };
    }
  }
  return sanitizeForAudit(value);
};

const jsonbParam = (value, fallback = null) => {
  const normalized = normalizeJsonb(value, fallback);
  return normalized === null || normalized === undefined ? null : JSON.stringify(normalized);
};

const getChangedFields = (previousValue, newValue) => {
  if (!isPlainObject(previousValue) || !isPlainObject(newValue)) return null;

  const keys = new Set([...Object.keys(previousValue), ...Object.keys(newValue)]);
  const changes = {};

  for (const key of keys) {
    const before = previousValue[key];
    const after = newValue[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    changes[key] = {
      from: SENSITIVE_KEYS.has(String(key).toLowerCase()) ? '[REDACTED]' : sanitizeForAudit(before),
      to: SENSITIVE_KEYS.has(String(key).toLowerCase()) ? '[REDACTED]' : sanitizeForAudit(after),
    };
  }

  return Object.keys(changes).length ? changes : null;
};

const sanitizeChangedFields = (changedFields) => {
  if (!isPlainObject(changedFields)) return sanitizeForAudit(changedFields);

  return Object.entries(changedFields).reduce((acc, [field, change]) => {
    const sensitive = SENSITIVE_KEYS.has(String(field).toLowerCase());
    if (isPlainObject(change) && ('from' in change || 'to' in change)) {
      acc[field] = {
        from: sensitive ? '[REDACTED]' : sanitizeForAudit(change.from),
        to: sensitive ? '[REDACTED]' : sanitizeForAudit(change.to),
      };
      return acc;
    }
    acc[field] = sensitive ? '[REDACTED]' : sanitizeForAudit(change);
    return acc;
  }, {});
};

const getStatusCodeFromDetails = (details) => {
  const normalized = normalizeJsonb(details, {});
  const statusCode = Number.parseInt(normalized?.statusCode, 10);
  return Number.isFinite(statusCode) ? statusCode : null;
};

const scoreRisk = ({ eventCode, outcome, severity, riskScore }) => {
  if (Number.isFinite(Number(riskScore))) {
    return Math.min(Math.max(Number(riskScore), 0), 100);
  }
  if (severity >= AUDIT_SEVERITY.CRITICAL) return 90;
  if (outcome === AUDIT_OUTCOME.DENIED) return 70;
  if (/ROLE_CHANGED|PERMISSION_|EMERGENCY_ACCESS|EXPORTED|ANONYMIZED|TOKEN_REUSED|SETTING_CHANGED|REPORT\.AMENDED/.test(String(eventCode))) {
    return 75;
  }
  if (outcome === AUDIT_OUTCOME.FAILURE) return 45;
  return 0;
};

const uuidOrNull = (value) => {
  if (!value) return null;
  const text = String(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
};

const normalizeEventInput = (input = {}) => {
  const actor = input.actor || {};
  const event = input.event || {};
  const target = input.target || {};
  const related = input.related || {};
  const context = input.context || {};
  const change = input.change || {};
  const result = input.result || {};
  const risk = input.risk || {};

  const httpMethod = input.httpMethod || input.http_method || context.method || null;
  const requestPath = input.requestPath || input.request_path || context.path || null;
  const statusCode = result.statusCode || input.statusCode || input.status_code || getStatusCodeFromDetails(input.details);
  const outcome = result.outcome || input.outcome || outcomeFromStatus(statusCode);
  const eventCode = event.code || input.eventCode || input.event_code || input.action || 'UNKNOWN';
  const eventFamily = event.family || input.eventFamily || input.event_family || familyFromEventCode(eventCode);
  const eventAction = event.action || input.eventAction || input.event_action || actionFromEventCode(eventCode, httpMethod);
  const category = event.category || input.category || categoryFromRequest(httpMethod, requestPath);
  const severity = Number(event.severity || input.severity || (outcome === AUDIT_OUTCOME.SUCCESS ? AUDIT_SEVERITY.INFO : AUDIT_SEVERITY.WARNING));
  const previousValue = change.previousValue ?? change.previous_value ?? input.previousValue ?? input.previous_value ?? null;
  const newValue = change.newValue ?? change.new_value ?? input.newValue ?? input.new_value ?? null;
  const changedFields = change.changedFields ?? change.changed_fields ?? input.changedFields ?? input.changed_fields ?? getChangedFields(previousValue, newValue);
  const details = input.details || event.details || {
    summary: event.summary || input.summary || eventCode,
    statusCode,
  };
  const riskScore = scoreRisk({
    eventCode,
    outcome,
    severity,
    riskScore: risk.score ?? input.riskScore ?? input.risk_score,
  });

  return {
    user_id: uuidOrNull(input.userId || input.user_id || actor.userId || actor.user_id),
    action: input.action || eventCode,
    resource_id: uuidOrNull(input.resourceId || input.resource_id || target.id),
    resource_table: input.resourceTable || input.resource_table || target.type || null,
    ip_address: input.ipAddress || input.ip_address || context.ipAddress || context.ip_address || null,
    details,
    category,
    severity,
    outcome,
    http_method: httpMethod,
    request_path: requestPath,
    previous_value: previousValue,
    new_value: newValue,
    actor_type: actor.type || input.actorType || input.actor_type || (actor.userId || input.userId || input.user_id ? AUDIT_ACTOR_TYPE.USER : AUDIT_ACTOR_TYPE.SYSTEM),
    actor_user_id: uuidOrNull(actor.userId || actor.user_id || input.actorUserId || input.actor_user_id || input.userId || input.user_id),
    actor_role: actor.role || input.actorRole || input.actor_role || null,
    actor_name: actor.name || input.actorName || input.actor_name || null,
    session_id: uuidOrNull(context.sessionId || context.session_id || input.sessionId || input.session_id),
    request_id: context.requestId || context.request_id || input.requestId || input.request_id || null,
    event_code: eventCode,
    event_family: eventFamily,
    event_action: eventAction,
    target_type: target.type || input.targetType || input.target_type || input.resourceTable || input.resource_table || null,
    target_id: uuidOrNull(target.id || input.targetId || input.target_id || input.resourceId || input.resource_id),
    target_label: target.label || input.targetLabel || input.target_label || null,
    patient_id: uuidOrNull(related.patientId || related.patient_id || input.patientId || input.patient_id),
    exam_id: uuidOrNull(related.examId || related.exam_id || input.examId || input.exam_id),
    invoice_id: uuidOrNull(related.invoiceId || related.invoice_id || input.invoiceId || input.invoice_id),
    report_id: uuidOrNull(related.reportId || related.report_id || input.reportId || input.report_id),
    appointment_id: uuidOrNull(related.appointmentId || related.appointment_id || input.appointmentId || input.appointment_id),
    source_system: context.sourceSystem || context.source_system || input.sourceSystem || input.source_system || 'backend-api',
    user_agent: context.userAgent || context.user_agent || input.userAgent || input.user_agent || null,
    device_fingerprint: context.deviceFingerprint || context.device_fingerprint || input.deviceFingerprint || input.device_fingerprint || null,
    status_code: statusCode,
    risk_score: riskScore,
    risk_reason: risk.reason || input.riskReason || input.risk_reason || null,
    changed_fields: changedFields,
    metadata: input.metadata || context.metadata || {},
  };
};

async function tryInsert(db, query, values) {
  const result = await db.query(query, values);
  return result?.rows?.[0]?.log_id || null;
}

async function executeLogQuery(db, rawEntry) {
  if (!db) return null;

  const entry = normalizeEventInput(rawEntry);
  const detailsParam = jsonbParam(entry.details);
  const previousValueParam = jsonbParam(entry.previous_value);
  const newValueParam = jsonbParam(entry.new_value);
  const changedFieldsParam = entry.changed_fields === null || entry.changed_fields === undefined
    ? null
    : JSON.stringify(sanitizeChangedFields(entry.changed_fields));
  const metadataParam = jsonbParam(entry.metadata, {});

  const structuredQuery = `
    INSERT INTO system_logs
      (user_id, action, resource_id, resource_table, ip_address, details,
       category, severity, outcome, http_method, request_path, previous_value, new_value,
       actor_type, actor_user_id, actor_role, actor_name, session_id, request_id,
       event_code, event_family, event_action, target_type, target_id, target_label,
       patient_id, exam_id, invoice_id, report_id, appointment_id, source_system,
       user_agent, device_fingerprint, status_code, risk_score, risk_reason,
       changed_fields, metadata)
    VALUES
      ($1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12, $13,
       $14, $15, $16, $17, $18, $19,
       $20, $21, $22, $23, $24, $25,
       $26, $27, $28, $29, $30, $31,
       $32, $33, $34, $35, $36,
       $37, $38)
    RETURNING log_id
  `;

  const structuredValues = [
    entry.user_id,
    entry.action || 'UNKNOWN',
    entry.resource_id,
    entry.resource_table,
    entry.ip_address,
    detailsParam,
    entry.category || AUDIT_CATEGORY.SECURITY,
    entry.severity || AUDIT_SEVERITY.INFO,
    entry.outcome || AUDIT_OUTCOME.SUCCESS,
    entry.http_method,
    entry.request_path,
    previousValueParam,
    newValueParam,
    entry.actor_type,
    entry.actor_user_id,
    entry.actor_role,
    entry.actor_name,
    entry.session_id,
    entry.request_id,
    entry.event_code,
    entry.event_family,
    entry.event_action,
    entry.target_type,
    entry.target_id,
    entry.target_label,
    entry.patient_id,
    entry.exam_id,
    entry.invoice_id,
    entry.report_id,
    entry.appointment_id,
    entry.source_system,
    entry.user_agent,
    entry.device_fingerprint,
    entry.status_code,
    entry.risk_score,
    entry.risk_reason,
    changedFieldsParam,
    metadataParam,
  ];

  const classifiedQuery = `
    INSERT INTO system_logs
      (user_id, action, resource_id, resource_table, ip_address, details,
       category, severity, outcome, http_method, request_path, previous_value, new_value)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING log_id
  `;

  const classifiedValues = [
    entry.user_id,
    entry.action || 'UNKNOWN',
    entry.resource_id,
    entry.resource_table,
    entry.ip_address,
    detailsParam,
    entry.category || AUDIT_CATEGORY.SECURITY,
    entry.severity || AUDIT_SEVERITY.INFO,
    entry.outcome || AUDIT_OUTCOME.SUCCESS,
    entry.http_method,
    entry.request_path,
    previousValueParam,
    newValueParam,
  ];

  const legacyQuery = `
    INSERT INTO system_logs
      (user_id, action, resource_id, resource_table, ip_address, details)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING log_id
  `;

  const legacyValues = [
    entry.user_id,
    entry.action || 'UNKNOWN',
    entry.resource_id,
    entry.resource_table,
    entry.ip_address,
    detailsParam,
  ];

  const savepointName = `audit_log_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
  let hasSavepoint = false;
  const createSavepoint = async () => {
    if (hasSavepoint) return;
    try {
      await db.query(`SAVEPOINT ${savepointName}`);
      hasSavepoint = true;
    } catch {
      hasSavepoint = false;
    }
  };
  const rollbackSavepoint = async () => {
    if (!hasSavepoint) return;
    try {
      await db.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    } catch {
      hasSavepoint = false;
    }
  };
  const releaseSavepoint = async () => {
    if (!hasSavepoint) return;
    try {
      await db.query(`RELEASE SAVEPOINT ${savepointName}`);
    } catch {
      // Releasing an audit savepoint is best-effort only.
    } finally {
      hasSavepoint = false;
    }
  };

  const runWithFallback = async (query, values, fallback, retries = 2) => {
    try {
      await createSavepoint();
      const logId = await tryInsert(db, query, values);
      await releaseSavepoint();
      return logId;
    } catch (err) {
      await rollbackSavepoint();
      if (retries > 0 && ['40P01', '40001', '55P03'].includes(err.code)) {
        await new Promise(res => setTimeout(res, 30 * (3 - retries)));
        return runWithFallback(query, values, fallback, retries - 1);
      }
      if (fallback && ['42703', '42P01'].includes(err.code)) {
        return fallback();
      }
      await releaseSavepoint();
      logger.error('AuditService: Logging failed', { error: err.message, action: entry.action });
      return null;
    }
  };

  const logId = await runWithFallback(structuredQuery, structuredValues, () => (
    runWithFallback(classifiedQuery, classifiedValues, () => (
      runWithFallback(legacyQuery, legacyValues)
    ))
  ));

  if (logId === null) {
    logger.warn('AuditService: audit entry could not be persisted', {
      action: entry.action,
      userId: entry.userId,
      resourceTable: entry.resourceTable,
      resourceId: entry.resourceId
    });

    try {
      await logSecurityEvent(db, {
        eventType: 'AUDIT_LOG_FAILURE',
        severity: 'warning',
        userId: entry.user_id || null,
        patientId: entry.patient_id || null,
        ipAddress: entry.ip_address,
        userAgent: entry.user_agent,
        details: {
          action: entry.action,
          resourceTable: entry.resource_table,
          resourceId: entry.resource_id,
          reason: 'Audit entry could not be persisted'
        }
      });
    } catch (securityLogError) {
      logger.error('AuditService: secondary security event logging failed', {
        error: securityLogError.message,
        action: entry.action,
      });
    }

    if (rawEntry.required === true) {
      const error = new Error(`Required audit entry could not be persisted for ${entry.action}`);
      error.code = 'AUDIT_LOG_REQUIRED_FAILED';
      throw error;
    }
  }

  await persistAuditAlerts(db, entry, logId);
  return logId;
}

const logAction = async (db, options = {}) => executeLogQuery(db, options);

class AuditService {
  constructor(db) {
    this.db = db;
  }

  async log(logEntry) {
    return executeLogQuery(this.db, logEntry);
  }

  async logEvent(eventEntry) {
    return executeLogQuery(this.db, eventEntry);
  }

  async logChange({ userId, resourceId, resourceTable, action, ipAddress, previousValue, newValue, httpMethod, requestPath }) {
    return this.logEvent({
      actor: { type: AUDIT_ACTOR_TYPE.USER, userId },
      event: {
        code: action,
        category: categoryFromRequest(httpMethod, requestPath),
        severity: AUDIT_SEVERITY.INFO,
      },
      target: { type: resourceTable, id: resourceId },
      context: { ipAddress, method: httpMethod, path: requestPath },
      change: { previousValue, newValue },
      result: { outcome: AUDIT_OUTCOME.SUCCESS, statusCode: 200 },
      details: { summary: action, statusCode: 200 },
    });
  }

  async logSystemAction({ eventCode, sourceSystem, target = {}, related = {}, details = {}, outcome = AUDIT_OUTCOME.SUCCESS, risk = {} }) {
    return this.logEvent({
      actor: { type: AUDIT_ACTOR_TYPE.SYSTEM },
      event: { code: eventCode, severity: outcome === AUDIT_OUTCOME.SUCCESS ? AUDIT_SEVERITY.INFO : AUDIT_SEVERITY.WARNING },
      target,
      related,
      context: { sourceSystem },
      details,
      result: { outcome },
      risk,
    });
  }
}

AuditService.logAction = logAction;
AuditService.logEvent = (db, eventEntry) => executeLogQuery(db, eventEntry);
AuditService.AuditService = AuditService;
AuditService.sanitizeForAudit = sanitizeForAudit;
AuditService.getChangedFields = getChangedFields;
AuditService.sanitizeChangedFields = sanitizeChangedFields;
AuditService.normalizeEventInput = normalizeEventInput;

module.exports = AuditService;
