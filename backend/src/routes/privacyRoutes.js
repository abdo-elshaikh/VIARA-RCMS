const express = require('express');
const {
    getPatientConsents,
    getCurrentPatientConsents,
    addPatientConsent,
    revokePatientConsent,
    getPrivacyRequests,
    createPrivacyRequest,
    resolvePrivacyRequest,
    downloadPrivacyExport
} = require('../controllers/privacyController');
const { hasPermission } = require('../middleware/rbacMiddleware');
const { AppError } = require('../middleware/errorHandler');

module.exports = (pool, authenticateToken, authorizeRole) => {
    const router = express.Router();
    const patientMatchesParam = (req, patientId) => {
        const claimPatientId = req.user?.patient_id || req.user?.userId || req.user?.user_id;
        return req.user?.role === 'Patient' && String(claimPatientId) === String(patientId);
    };
    const allowSelfOrPermission = (permission, patientParam = 'patientId') => async (req, res, next) => {
        if (patientMatchesParam(req, req.params[patientParam])) return next();
        return hasPermission(pool, permission)(req, res, next);
    };
    const allowConsentOwnerOrPermission = (permission) => async (req, res, next) => {
        try {
            if (req.user?.role === 'Patient') {
                const claimPatientId = req.user?.patient_id || req.user?.userId || req.user?.user_id;
                const result = await pool.query('SELECT patient_id FROM patient_consents WHERE consent_id = $1', [req.params.consentId]);
                if (result.rows.length === 0) return next();
                if (String(result.rows[0].patient_id) === String(claimPatientId)) return next();
                return next(new AppError('Access denied to this consent record', 403));
            }
            return hasPermission(pool, permission)(req, res, next);
        } catch (error) {
            return next(error);
        }
    };

    router.use(authenticateToken);

    // Consents
    router.get('/consents/:patientId/current', allowSelfOrPermission('MANAGE_CONSENTS'), getCurrentPatientConsents(pool));
    router.get('/consents/:patientId', allowSelfOrPermission('MANAGE_CONSENTS'), getPatientConsents(pool));
    router.post('/consents/:patientId', allowSelfOrPermission('MANAGE_CONSENTS'), addPatientConsent(pool));
    router.put('/consents/:consentId/revoke', allowConsentOwnerOrPermission('MANAGE_CONSENTS'), revokePatientConsent(pool));

    // Privacy Requests
    router.get('/requests', hasPermission(pool, 'VIEW_PRIVACY_REQUESTS'), getPrivacyRequests(pool));
    router.post('/requests', authorizeRole(['Developer', 'Admin', 'Receptionist', 'Patient']), async (req, res, next) => {
        if (req.user?.role === 'Patient') return next();
        return hasPermission(pool, 'CREATE_PRIVACY_REQUESTS')(req, res, next);
    }, createPrivacyRequest(pool));
    router.put('/requests/:requestId/resolve', hasPermission(pool, 'RESOLVE_PRIVACY_REQUESTS'), resolvePrivacyRequest(pool));
    router.get('/exports/:exportId/download', hasPermission(pool, 'EXPORT_PATIENT_DATA'), downloadPrivacyExport(pool));

    return router;
};
