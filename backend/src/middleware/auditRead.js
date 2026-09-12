// auditRead — PHI/read-access auditing middleware.
//
// The automatic auditLogger only records write methods (POST/PUT/PATCH/DELETE).
// For compliance we also need a record of WHO READ sensitive resources
// (patient records, reports/results, portal documents, PACS/DICOM retrieval).
//
// This middleware is applied EXPLICITLY on a per-route basis (an allow-list),
// never globally — read auditing everywhere would flood the log and risk
// capturing PHI. It records metadata ONLY: never the response body, so no
// protected health information is copied into the audit trail itself.
//
// Usage:
//   router.get('/records', authenticateToken, auditRead(pool, { resourceTable: 'patient_records' }), handler);

const { AUDIT_ACTOR_TYPE, AUDIT_CATEGORY, AUDIT_SEVERITY, AUDIT_OUTCOME, outcomeFromStatus } = require('../services/auditTaxonomy');

const auditRead = (auditService, { resourceTable = null, resourceIdParam = 'id' } = {}) => (req, res, next) => {
  res.on('finish', async () => {
    try {
      if (!auditService) return;
      // Only audit successful or denied reads; skip 404/validation noise below 400
      // except explicit authorization denials.
      const outcome = outcomeFromStatus(res.statusCode);
      if (res.statusCode >= 400 && outcome !== AUDIT_OUTCOME.DENIED) return;

      const userId = req.user ? req.user.user_id || null : null;
      const requestPath = req.originalUrl.split('?')[0];
      const resourceId = req.params?.[resourceIdParam] || null;
      const ipAddress = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || null;

      // Metadata only — no response body, no query values that could carry PHI.
      const details = JSON.stringify({
        statusCode: res.statusCode,
        method: req.method,
        emergencyAccessId: (req.emergencyAccess || req.emergencyAccessVerified)?.grantId || null,
      });

      const severity = outcome === AUDIT_OUTCOME.DENIED ? AUDIT_SEVERITY.WARNING : AUDIT_SEVERITY.NOTICE;

      await auditService.logEvent({
        actor: {
          type: req.user?.role === 'Patient'
            ? AUDIT_ACTOR_TYPE.PATIENT
            : userId ? AUDIT_ACTOR_TYPE.USER : AUDIT_ACTOR_TYPE.SYSTEM,
          userId,
          role: req.user?.role || null,
          name: req.user?.full_name || req.user?.name || null,
        },
        event: {
          code: `READ ${requestPath}`,
          category: AUDIT_CATEGORY.PHI_ACCESS,
          severity,
        },
        target: {
          type: resourceTable,
          id: resourceId,
        },
        related: {
          patientId: ['patients', 'patient_records'].includes(resourceTable) ? resourceId : null,
          examId: resourceTable === 'examinations' ? resourceId : null,
          invoiceId: resourceTable === 'invoices' ? resourceId : null,
        },
        context: {
          requestId: req.id || null,
          ipAddress,
          userAgent: req.get('user-agent') || null,
          method: 'GET',
          path: requestPath,
          sourceSystem: 'backend-api',
          metadata: (req.emergencyAccess || req.emergencyAccessVerified) ? {
            emergencyAccessId: (req.emergencyAccess || req.emergencyAccessVerified).grantId,
            emergencyPermissions: (req.emergencyAccess || req.emergencyAccessVerified).permissions,
          } : {},
        },
        details,
        result: {
          outcome,
          statusCode: res.statusCode,
        },
      });

    } catch (err) {
      console.error('Read Audit Logging Failed:', err);
    }
  });

  next();
};

module.exports = auditRead;
