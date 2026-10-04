/**
 * checkFeature.js
 * ---------------
 * Express middleware factory that gates an API route behind a license feature.
 *
 * Usage (in any route file)
 * =========================
 *   const checkFeature = require('../middleware/checkFeature');
 *
 *   router.use(checkFeature('pacs'));           // block whole router
 *   router.get('/export', checkFeature('backup'), handler);
 *
 * The middleware reads the active license from app.locals.license (set by
 * server.js after loadLicense()) and rejects requests for features that are
 * not included in the current edition.
 *
 * The Developer edition bypasses all feature gates.
 */

'use strict';

const { getLicense } = require('../services/licenseService');
const logger = require('../config/logger');

const UPGRADE_URL = process.env.UPGRADE_URL || 'https://viara.net/upgrade';

/**
 * Returns an Express middleware that allows the request only when the active
 * license includes `featureName`.
 *
 * @param {string} featureName  - Feature key (must match featureFlags.js)
 * @returns {import('express').RequestHandler}
 */
function checkFeature(featureName) {
    return (req, res, next) => {
        const license = getLicense();

        // Developer edition is never gated
        if (!license || license.edition === 'developer') {
            return next();
        }

        const allowed = license.allowedModules || [];
        if (allowed.includes('*') || allowed.includes(featureName)) {
            return next();
        }

        logger.info(
            `Feature gate blocked: [${featureName}] — edition: ${license.edition}, ` +
            `user: ${req.user?.user_id}, path: ${req.originalUrl}`
        );

        return res.status(403).json({
            error: 'feature_not_licensed',
            feature: featureName,
            edition: license.edition,
            message: `هذه الميزة (${featureName}) غير متاحة في إصدارك الحالي. يرجى الترقية للاستفادة منها.`,
            upgradeUrl: UPGRADE_URL,
        });
    };
}

module.exports = checkFeature;
