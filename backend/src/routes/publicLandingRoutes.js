const express = require('express');
const {
    getPublicLandingOverview, lookupPublicCaseStatus, verifyPublicCaseStatus,
    refreshPublicCaseStatus, createPublicAppointmentRequest,
    authorizePublicFinalReport, verifyReportAuthenticity
} = require('../controllers/publicLandingController');
const { getReportPdf } = require('../controllers/examController');
const { publicCaseStatusLimiter } = require('../middleware/rateLimiters');

module.exports = (pool) => {
    const router = express.Router();
    router.get('/landing-overview', getPublicLandingOverview(pool));
    router.post('/case-status', publicCaseStatusLimiter, lookupPublicCaseStatus(pool));
    router.post('/case-status/verify', publicCaseStatusLimiter, verifyPublicCaseStatus(pool));
    router.post('/case-status/status', publicCaseStatusLimiter, refreshPublicCaseStatus(pool));
    router.post('/appointment-requests', publicCaseStatusLimiter, createPublicAppointmentRequest(pool));
    router.post('/final-report', publicCaseStatusLimiter, authorizePublicFinalReport(pool), getReportPdf(pool));
    router.get('/final-report/:accessToken', publicCaseStatusLimiter, authorizePublicFinalReport(pool), (req, _res, next) => {
        req.publicReportFormat = 'pdf';
        req.publicReportDisposition = 'inline';
        next();
    }, getReportPdf(pool));
    router.get('/reports/verify/:hash', publicCaseStatusLimiter, verifyReportAuthenticity(pool));
    return router;
};
