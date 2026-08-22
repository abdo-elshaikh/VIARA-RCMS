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
  'passwordhash',
  'password_hash',
  'token',
  'authorization',
  'secret',
  'apikey',
  'api_key',
  'apisecret',
  'api_secret',
  'firstname',
  'lastname',
  'dateofbirth',
  'dob',
  'phone',
  'address',
  'mrn',
  'patientname',
  'recipientemail',
  'nationalid',
  'passportnumber',
  'emergencycontactname',
  'emergencycontactphone',
  'emergencycontactaddress',
  'allergies',
  'chronicdiseases',
  'priorsurgeries',
  'pregnancystatus',
  'implantsdevices',
  'renalfunctionnotes',
  'reportcontent',
  'findings',
  'impression',
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
  'cancellationreason',
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
  'preparation_instructions'
]);

const sanitizeForAudit = (value) => {
  if (!value || typeof value !== 'object') return value;

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

const getResourceTable = (originalUrl) => {
  const parts = originalUrl.split('?')[0].split('/api/');
  const resource = parts[1] || '';
  const cleanResource = resource.replace(/^v1\//, '');
  return cleanResource ? cleanResource.split('/')[0] : 'unknown';
};

const extractIdFromObj = (obj) => {
  if (!obj || typeof obj !== 'object') return null;
  return obj.id || obj.patient_id || obj.patientId || obj.exam_id || obj.examId
    || obj.invoice_id || obj.invoiceId || obj.appointment_id || obj.appointmentId
    || obj.user_id || obj.userId || obj.report_id || obj.reportId || null;
};

const extractRelatedFromAny = (req, resBody) => {
  const body = req.body || {};
  const params = req.params || {};
  const resData = resBody && typeof resBody === 'object' ? resBody : {};
  const dataNested = resData.data && typeof resData.data === 'object' ? resData.data : {};

  const patientId = params.patientId || params.patient_id || body.patient_id || body.patientId
    || resData.patient_id || resData.patientId || dataNested.patient_id || dataNested.patientId || null;

  const examId = params.examId || params.exam_id || body.exam_id || body.examId
    || resData.exam_id || resData.examId || dataNested.exam_id || dataNested.examId || null;

  const invoiceId = params.invoiceId || params.invoice_id || body.invoice_id || body.invoiceId
    || resData.invoice_id || resData.invoiceId || dataNested.invoice_id || dataNested.invoiceId || null;

  const appointmentId = params.appointmentId || params.appointment_id || body.appointment_id || body.appointmentId
    || resData.appointment_id || resData.appointmentId || dataNested.appointment_id || dataNested.appointmentId || null;

  const reportId = params.reportId || params.report_id || body.report_id || body.reportId
    || resData.report_id || resData.reportId || dataNested.report_id || dataNested.reportId || null;

  return { patientId, examId, invoiceId, appointmentId, reportId };
};

const auditLogger = (auditService) => (req, res, next) => {
  const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (!writeMethods.includes(req.method)) {
    return next();
  }

  // Intercept res.json to capture response payload for target ID resolution
  let capturedResponse = null;
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    capturedResponse = body;
    return originalJson(body);
  };

  res.on('finish', async () => {
    try {
      const userId = req.user ? req.user.user_id || null : null;
      const requestPath = req.originalUrl.split('?')[0];
      const action = `${req.method} ${requestPath}`;
      const ipAddress = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || null;

      const resourceTable = getResourceTable(req.originalUrl);
      
      // Resolve Target Resource ID from params, body, or response
      let resourceId = req.params?.id || req.params?.patientId || req.params?.examId || req.params?.invoiceId || req.params?.appointmentId || null;
      if (!resourceId && capturedResponse) {
        resourceId = extractIdFromObj(capturedResponse) || extractIdFromObj(capturedResponse.data);
      }
      if (!resourceId && req.body) {
        resourceId = extractIdFromObj(req.body);
      }

      const related = extractRelatedFromAny(req, capturedResponse);

      const outcome = outcomeFromStatus(res.statusCode);
      const category = categoryFromRequest(req.method, requestPath);
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
          related,
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

  next();
};

module.exports = auditLogger;
