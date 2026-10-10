/**
 * licenseRoutes.js
 * ----------------
 * Public (unauthenticated) and authenticated license info endpoints.
 *
 * Routes
 * ======
 *   GET /api/license/info
 *     Returns a sanitized summary of the active license.
 *     Safe to expose to authenticated frontend users — no private key material.
 *
 *   GET /api/license/quota
 *     Returns current usage vs quota for trial licenses.
 *     Returns {} for non-trial editions.
 */

'use strict';

const express = require('express');
const { getLicense, inspectLicenseKey, applyLicenseKey } = require('../services/licenseService');
const { getQuotaStats } = require('../services/quotaService');
const { authorizeRole } = require('../middleware/authMiddleware');
const { getFingerprint } = require('../utils/hardwareFingerprint');

module.exports = function licenseRoutes(pool, authenticateToken) {
    const router = express.Router();

    /**
     * GET /api/license/info
     * Public summary — no sensitive fields, safe for the SPA.
     */
    router.get('/info', authenticateToken, (req, res) => {
        const lic = getLicense();

        return res.json({
            edition:        lic.edition,
            customerId:     lic.customerId,
            issuedAt:       lic.issuedAt,
            expiresAt:      lic.expiresAt,
            daysRemaining:  lic.daysRemaining,
            maxUsers:       lic.maxUsers,
            allowedModules: lic.allowedModules,
            isTrial:        lic.edition === 'trial',
            fingerprint:    getFingerprint(),
        });
    });

    /**
     * GET /api/license/quota
     * Returns usage vs limit for all trial quotas.
     * Returns {} for standard/enterprise.
     */
    router.get('/quota', authenticateToken, async (req, res, next) => {
        try {
            const stats = await getQuotaStats(pool);
            return res.json(stats);
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/license/inspect
     * Pre-flight inspection/verification of a license key (e.g. from uploaded .txt file or paste).
     * Body: { key: string }
     */
    router.post('/inspect', authenticateToken, authorizeRole(['Admin']), (req, res) => {
        const { key } = req.body || {};
        if (!key || typeof key !== 'string') {
            return res.status(400).json({ valid: false, error: 'يرجى تقديم مفتاح ترخيص صالح' });
        }

        const result = inspectLicenseKey(key);
        if (!result.valid) {
            return res.status(400).json({ valid: false, error: result.reason });
        }

        return res.json({ valid: true, license: result.payload });
    });

    /**
     * POST /api/license/activate
     * Activates a license key at runtime and persists it.
     * Body: { key: string }
     */
    router.post('/activate', authenticateToken, authorizeRole(['Admin']), (req, res) => {
        const { key } = req.body || {};
        if (!key || typeof key !== 'string') {
            return res.status(400).json({ success: false, error: 'يرجى تقديم مفتاح ترخيص صالح' });
        }

        try {
            const license = applyLicenseKey(key, { persist: true });
            if (req.app?.locals) {
                req.app.locals.license = license;
            }

            return res.json({
                success: true,
                message: 'تم تفعيل مفتاح الترخيص بنجاح',
                license: {
                    edition:        license.edition,
                    customerId:     license.customerId,
                    issuedAt:       license.issuedAt,
                    expiresAt:      license.expiresAt,
                    daysRemaining:  license.daysRemaining,
                    maxUsers:       license.maxUsers,
                    allowedModules: license.allowedModules,
                    isTrial:        license.edition === 'trial',
                }
            });
        } catch (err) {
            return res.status(400).json({
                success: false,
                error: err.message || 'فشل تفعيل مفتاح الترخيص'
            });
        }
    });

    return router;
};
