const { AppError } = require('../middleware/errorHandler');
const AnalyticsService = require('../services/analyticsService');
const { Parser } = require('json2csv');

const getVolume = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate, groupBy } = req.query;
        const service = new AnalyticsService(db);
        const data = await service.getStudyVolume(startDate, endDate, groupBy);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

const getRevenue = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate, groupBy } = req.query;
        const service = new AnalyticsService(db);
        const data = await service.getRevenueMetrics(startDate, endDate, groupBy);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

const getPerformance = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const service = new AnalyticsService(db);
        const data = await service.getPerformanceMetrics(startDate, endDate);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

const getReferrals = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const service = new AnalyticsService(db);
        const data = await service.getReferralMetrics(startDate, endDate);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

const exportAnalytics = (db) => async (req, res, next) => {
    try {
        const { type, startDate, endDate, groupBy } = req.query;
        const service = new AnalyticsService(db);
        let data = [];

        if (type === 'volume') {
            data = await service.getStudyVolume(startDate, endDate, groupBy);
        } else if (type === 'revenue') {
            data = await service.getRevenueMetrics(startDate, endDate, groupBy);
        } else if (type === 'performance') {
            const perf = await service.getPerformanceMetrics(startDate, endDate);
            data = [perf]; // Single row for performance
        } else if (type === 'referrals') {
            const refData = await service.getReferralMetrics(startDate, endDate);
            // Export doctor revenue list
            data = refData.topDoctors;
        } else {
            return next(new AppError('Invalid export type', 400));
        }

        if (data.length === 0) {
            return next(new AppError('No data available for export', 404));
        }

        const parser = new Parser();
        const csv = parser.parse(data);

        res.header('Content-Type', 'text/csv');
        res.attachment(`analytics_export_${type}_${new Date().getTime()}.csv`);
        res.send(csv);

    } catch (error) {
        next(error);
    }
};

module.exports = {
    getVolume,
    getRevenue,
    getPerformance,
    getReferrals,
    exportAnalytics
};
