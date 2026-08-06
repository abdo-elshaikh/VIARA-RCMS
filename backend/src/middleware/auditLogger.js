const {
  AUDIT_ACTOR_TYPE,
  AUDIT_SEVERITY,
  AUDIT_OUTCOME,
  outcomeFromStatus,
  categoryFromRequest,
} = require('../services/auditTaxonomy');
const logger = require('../config/logger');

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'authorization',
  'firstName',
  'lastName',
  'dateOfBirth',
  'dob',
  'phone',
  'address',
  'mrn',
  'patientName',
  'recipientEmail',
  'nationalId',
  'passportNumber',
  'emergencyContactName',
  'emergencyContactPhone',
  'emergencyContactAddress',
  'allergies',
  'chronicDiseases',
  'priorSurgeries',
  'pregnancyStatus',
  'implantsDevices',
  'renalFunctionNotes',
  'reportContent',
  'findings',
  'impression',
  'apikey',
  'api_key',
  'apisecret',
  'api_secret',
  'paymentreference',
  'two_factor_secret',
  'email',
  'contactemail',
  'notes',
  'clinicalnotes',
  'body',
  'subject',
  'reason',
  'discountreason',
  'rejectionreason',
  'resubmissionnotes',
  'cancellationreason'
]);

const sanitizeForAudit = (value) => {
  if (!value || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map(sanitizeForAudit);
  }

  return Object.entries(value).reduce((acc, [key, item]) => {
    acc[key] = SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(key.toLowerCase())
      ? '[REDACTED]'
      : sanitizeForAudit(item);
    return acc;
  }, {});
};

const getResourceTable = (originalUrl) => {
  const [, resource] = originalUrl.split('?')[0].split('/api/');
  return resource ? resource.split('/')[0] : 'unknown';
};

const auditLogger = (auditService) => async (req, res, next) => {
  const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (writeMethods.includes(req.method)) {
    res.on('finish', async () => {
      try {        const userId = req.user ? req.user.user_id || null : null;
        const requestPath = req.originalUrl.split('?')[0];
        const action = `${req.method} ${requestPath}`;
        const ipAddress = req.ip || req.connection.remoteAddress;

        let resourceId = req.params?.id || null;
        const resourceTable = getResourceTable(req.originalUrl);

        const outcome = outcomeFromStatus(res.statusCode);
        const category = categoryFromRequest(req.method, requestPath);
        // Elevate severity for anything that did not succeed.
        const severity = outcome === AUDIT_OUTCOME.SUCCESS ? AUDIT_SEVERITY.INFO : AUDIT_SEVERITY.WARNING;

        if (auditService) {
          await auditService.logEvent({
            actor: {
              type: userId ? AUDIT_ACTOR_TYPE.USER : AUDIT_ACTOR_TYPE.SYSTEM,
              userId,
              role: req.user?.role || null,
              name: req.user?.full_name || req.user?.name || null,
            },
            event: {
              code: action || 'UNKNOWN_ACTION',
              category,
              severity,
            },
            target: {
              type: resourceTable || null,
              id: resourceId,
            },
            context: {
              requestId: req.id || null,
              ipAddress,
              userAgent: req.get('user-agent') || null,
              method: req.method,
              path: requestPath,
              sourceSystem: 'backend-api',
            },
            details: {
              body: sanitizeForAudit(req.body),
              statusCode: res.statusCode,
            },
            result: {
              outcome,
              statusCode: res.statusCode,
            },
          });
        }
      } catch (err) {
        logger.error('Audit Logging Failed:', err.message);
      }
    });
  }

  next();
};

module.exports = auditLogger;
