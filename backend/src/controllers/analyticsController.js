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
        const { startDate, endDate, modalityId } = req.query;
        const service = new AnalyticsService(db);
        const data = await service.getPerformanceMetrics(startDate, endDate, modalityId);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

const getPeakHours = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate, modalityId } = req.query;
        const service = new AnalyticsService(db);
        const data = await service.getPeakHoursMetrics(startDate, endDate, modalityId);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

const getEquipmentUtilization = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        const service = new AnalyticsService(db);
        const data = await service.getEquipmentUtilization(startDate, endDate);
        res.json(data);
    } catch (error) {
        next(error);
    }
};

const getTopProcedures = (db) => async (req, res, next) => {
    try {
        const { startDate, endDate, limit } = req.query;
        const service = new AnalyticsService(db);
        const data = await service.getTopProcedures(startDate, endDate, limit ? parseInt(limit, 10) : 10);
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

const formatExportRows = (type, data) => {
    if (!Array.isArray(data)) return data;

    if (type === 'volume') {
        return data.map(r => ({
            'التصنيف / التاريخ (Category / Date)': r.label,
            'عدد الفحوصات (Study Count)': r.value
        }));
    }
    if (type === 'revenue') {
        return data.map(r => ({
            'التصنيف / التاريخ (Category / Date)': r.label,
            'صافي الإيراد بالجنيه (Net Revenue EGP)': r.value
        }));
    }
    if (type === 'equipment-utilization') {
        return data.map(r => ({
            'اسم الجهاز (Modality Name)': r.modality_name,
            'نوع الجهاز (Type)': r.modality_type,
            'عدد الفحوصات (Studies)': r.study_count,
            'ساعات التشغيل (Busy Hours)': r.busy_hours,
            'متوسط مدة الفحص (Avg Duration Min)': r.avg_duration_minutes || 0,
            'نسبة الاستخدام (Utilization %)': `${r.utilization_pct}%`,
            'إجمالي الإيراد (Total Revenue EGP)': r.total_revenue,
            'متوسط الإيراد للفحص (Revenue / Study EGP)': r.revenue_per_study
        }));
    }
    if (type === 'peak-hours') {
        return data.map(r => ({
            'الساعة (Hour)': r.hour,
            'إجمالي الفحوصات (Total Studies)': r.studies,
            'متوسط يومي (Daily Avg)': r.avgStudiesPerDay,
            'نسبة إشغال السعة (Capacity %)': `${r.capacity}%`,
            'متوسط مدة الفحص (Avg Duration Min)': r.avgDurationMinutes
        }));
    }
    if (type === 'top-procedures') {
        return data.map(r => ({
            'اسم الفحص (Procedure Name)': r.exam_name,
            'كود الفحص (Code)': r.exam_code,
            'الجهاز (Modality)': r.modality_name,
            'عدد الفحوصات (Studies)': r.study_count,
            'الحصة من الإجمالي (Volume Share %)': `${r.volume_share_pct}%`,
            'حالات الصبغة (Contrast Cases)': r.contrast_count,
            'إجمالي الإيراد (Total Revenue EGP)': r.total_revenue,
            'متوسط الإيراد للفحص (Revenue / Study EGP)': r.revenue_per_study
        }));
    }
    if (type === 'referrals') {
        return data.map(r => ({
            'اسم الطبيب المحول (Doctor Name)': r.doctorName,
            'العيادة / المستشفى (Clinic / Hospital)': r.clinicName || '-',
            'عدد الحالات المحولة (Referred Studies)': r.totalExams,
            'إجمالي الإيراد المحقق (Total Revenue EGP)': r.totalRevenue
        }));
    }
    if (type === 'performance') {
        const p = data[0] || {};
        return [{
            'متوسط زمن الإنجاز بالساعات (Avg TAT Hours)': p.averageTurnaroundTimeHours,
            'متوسط زمن الصياغة بالساعات (Draft Hours)': p.averageDraftTimeHours,
            'متوسط زمن الاعتماد بالساعات (Sign Hours)': p.averageSignTimeHours,
            'متوسط زمن الفحص بالدقائق (Scan Duration Min)': p.averageScanMinutes,
            'متوسط زمن الانتظار بالدقائق (Wait Time Min)': p.averageWaitTimeMinutes,
            'نسبة الالتزام بالطوارئ (STAT SLA %)': `${p.statSlaCompliancePct}%`,
            'نسبة الالتزام بالحالات الروتينية (Routine SLA %)': `${p.routineSlaCompliancePct}%`,
            'نسبة الإلغاء (Cancellation Rate %)': `${p.cancellationRatePercentage}%`,
            'نسبة الأمان لموانع الصبغة (Contrast Safety %)': `${p.contrastSafetyCompliancePct}%`
        }];
    }
    return data;
};

const exportAnalytics = (db) => async (req, res, next) => {
    try {
        const { type, startDate, endDate, groupBy, modalityId, limit } = req.query;
        const service = new AnalyticsService(db);
        let rawData = [];

        if (type === 'volume') {
            rawData = await service.getStudyVolume(startDate, endDate, groupBy);
        } else if (type === 'revenue') {
            rawData = await service.getRevenueMetrics(startDate, endDate, groupBy);
        } else if (type === 'performance') {
            const perf = await service.getPerformanceMetrics(startDate, endDate, modalityId);
            rawData = [perf]; // Single row for performance
        } else if (type === 'peak-hours') {
            const peak = await service.getPeakHoursMetrics(startDate, endDate, modalityId);
            rawData = peak.hourlyData;
        } else if (type === 'equipment-utilization') {
            rawData = await service.getEquipmentUtilization(startDate, endDate);
        } else if (type === 'top-procedures') {
            rawData = await service.getTopProcedures(startDate, endDate, limit ? parseInt(limit, 10) : 20);
        } else if (type === 'referrals') {
            const refData = await service.getReferralMetrics(startDate, endDate);
            rawData = refData.topDoctors;
        } else {
            return next(new AppError('Invalid export type', 400));
        }

        if (rawData.length === 0) {
            return next(new AppError('No data available for export', 404));
        }

        const formattedData = formatExportRows(type, rawData);
        const parser = new Parser();
        const csv = parser.parse(formattedData);

        res.header('Content-Type', 'text/csv; charset=utf-8');
        res.attachment(`analytics_export_${type}_${new Date().getTime()}.csv`);
        // Prefix with UTF-8 BOM so Excel opens Arabic text seamlessly
        res.send(`\uFEFF${csv}`);

    } catch (error) {
        next(error);
    }
};

module.exports = {
    getVolume,
    getRevenue,
    getPerformance,
    getPeakHours,
    getEquipmentUtilization,
    getTopProcedures,
    getReferrals,
    exportAnalytics
};
