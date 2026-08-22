const logger = require('../config/logger');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../middleware/authMiddleware');

const PUBLIC_REPORT_AUDIENCE = 'VIARA-public-final-report';
const PUBLIC_REPORT_ISSUER = 'VIARA-public-portal';
const PUBLIC_REPORT_TTL_SECONDS = 10 * 60;

const numberOrNull = (value) => {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const optionalQuery = async (db, query) => {
    try {
        const result = await db.query(query);
        return result.rows[0] || {};
    } catch (error) {
        logger.warn('Optional public landing metric is unavailable', { message: error.message });
        return {};
    }
};

const optionalRowsQuery = async (db, query) => {
    try {
        const result = await db.query(query);
        return result.rows || [];
    } catch (error) {
        logger.warn('Optional public landing feed is unavailable', { message: error.message });
        return [];
    }
};

const toIso = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const finalReportAvailable = (row) => Boolean(
    row.report_finalized_at
    || row.report_locked
    || ['Finalized', 'Amended'].includes(row.report_status)
    || row.status === 'Finalized'
);

const createPublicReportAccessToken = (examId) => jwt.sign(
    { scope: 'public-final-report', examId: String(examId) },
    getJwtSecret(),
    {
        algorithm: 'HS256',
        audience: PUBLIC_REPORT_AUDIENCE,
        issuer: PUBLIC_REPORT_ISSUER,
        expiresIn: PUBLIC_REPORT_TTL_SECONDS,
    }
);

const authorizePublicFinalReport = (req, res, next) => {
    try {
        const accessToken = String(req.body?.accessToken || req.params?.accessToken || '');
        if (!accessToken || accessToken.length > 4096) {
            return res.status(401).json({ error: 'The report access link is invalid or has expired.' });
        }

        const payload = jwt.verify(accessToken, getJwtSecret(), {
            algorithms: ['HS256'],
            audience: PUBLIC_REPORT_AUDIENCE,
            issuer: PUBLIC_REPORT_ISSUER,
        });
        if (payload.scope !== 'public-final-report' || !payload.examId) {
            return res.status(401).json({ error: 'The report access link is invalid or has expired.' });
        }

        req.params.id = String(payload.examId);
        req.user = { role: 'PublicReport' };
        req.publicReportAccess = { examId: String(payload.examId) };
        return next();
    } catch (_error) {
        return res.status(401).json({ error: 'The report access link is invalid or has expired.' });
    }
};

const publicStage = (row) => {
    if (finalReportAvailable(row)) {
        return { code: 'completed', phase: 'completed', label: 'Final report ready', progress: 100 };
    }

    const reportStatus = String(row.report_status || '').toLowerCase();
    if (reportStatus === 'approved') return { code: 'approval', phase: 'reporting', label: 'Report awaiting final signature', progress: 94 };
    if (reportStatus === 'reviewed') return { code: 'review', phase: 'reporting', label: 'Report under final review', progress: 88 };
    if (reportStatus === 'typed') return { code: 'typing', phase: 'reporting', label: 'Report prepared for review', progress: 80 };

    const queueStage = String(row.queue_stage || '').toLowerCase();
    const examStatus = String(row.status || '').toLowerCase();
    if (row.reporting_started_at || queueStage === 'reporting' || examStatus === 'reporting') {
        return { code: 'reporting', phase: 'reporting', label: 'Report in progress', progress: 72 };
    }
    if (row.exam_completed_at) {
        return { code: 'awaiting_report', phase: 'reporting', label: 'Imaging complete, awaiting report', progress: 62 };
    }
    if (row.exam_started_at || queueStage === 'in exam' || examStatus === 'scanning') {
        return { code: 'imaging', phase: 'imaging', label: 'Imaging in progress', progress: 46 };
    }
    if (row.prep_started_at || ['prep pending', 'ready for exam'].includes(queueStage)) {
        return { code: 'preparation', phase: 'preparation', label: 'Preparing for imaging', progress: queueStage === 'ready for exam' ? 36 : 30 };
    }
    if (row.arrived_at || queueStage === 'arrived' || examStatus === 'checked-in') {
        return { code: 'arrived', phase: 'preparation', label: 'Visit checked in', progress: 20 };
    }
    return { code: 'scheduled', phase: 'scheduled', label: 'Appointment scheduled', progress: 10 };
};

const publicWorkflow = (row, stage) => {
    const phaseRank = { scheduled: 0, preparation: 1, imaging: 2, reporting: 3, completed: 4 };
    const currentRank = phaseRank[stage.phase] ?? 0;
    const steps = [
        { code: 'scheduled', at: row.appointment_start || row.created_at },
        { code: 'preparation', at: row.arrived_at || row.prep_started_at },
        { code: 'imaging', at: row.exam_started_at },
        { code: 'reporting', at: row.reporting_started_at || row.exam_completed_at },
        { code: 'completed', at: row.report_finalized_at || row.amended_at },
    ];

    return steps.map((step, index) => ({
        code: step.code,
        state: index < currentRank ? 'completed' : index === currentRank ? 'current' : 'pending',
        at: toIso(step.at),
    }));
};

/**
 * Public last-case lookup. The response is status-only: report narratives,
 * signer identity, images, and patient identity never leave this endpoint.
 * Confidential/restricted records are never eligible for this workflow.
 */
const lookupPublicCaseStatus = (db) => async (req, res, next) => {
    try {
        const mrn = String(req.body?.mrn || '').trim().toUpperCase();
        if (!/^[A-Z0-9][A-Z0-9._/-]{2,49}$/.test(mrn)) {
            return res.status(400).json({ error: 'Enter a valid medical record number or order number.' });
        }

        const result = await db.query(`
            WITH last_case AS (
                SELECT
                    e.exam_id,
                    e.modality_id,
                    e.status,
                    e.report_status,
                    e.queue_stage,
                    e.report_locked,
                    e.created_at,
                    e.arrived_at,
                    e.prep_started_at,
                    e.prep_completed_at,
                    e.exam_started_at,
                    e.exam_completed_at,
                    e.reporting_started_at,
                    e.report_finalized_at,
                    e.amended_at,
                    a.start_time AS appointment_start,
                    m.name AS modality_name,
                    et.name AS exam_type_name
                FROM patients p
                JOIN examinations e ON e.patient_id = p.patient_id
                LEFT JOIN appointments a ON a.appointment_id = e.appointment_id
                LEFT JOIN modalities m ON m.modality_id = e.modality_id
                LEFT JOIN examination_types et ON et.type_id = e.exam_type_id
                WHERE (UPPER(p.mrn) = $1 OR UPPER(e.order_number) = $1 OR UPPER(a.order_number) = $1)
                  AND COALESCE(p.is_confidential, FALSE) = FALSE
                  AND COALESCE(p.patient_status, 'Active') = 'Active'
                ORDER BY COALESCE(a.start_time, e.exam_completed_at, e.created_at) DESC NULLS LAST,
                         e.created_at DESC
                LIMIT 1
            ), turnaround AS (
                SELECT
                    AVG(EXTRACT(EPOCH FROM (historical.exam_completed_at - historical.exam_started_at)))
                        FILTER (WHERE historical.exam_started_at IS NOT NULL
                            AND historical.exam_completed_at > historical.exam_started_at) AS average_exam_seconds,
                    COUNT(*) FILTER (WHERE historical.exam_started_at IS NOT NULL
                            AND historical.exam_completed_at > historical.exam_started_at)::int AS exam_sample_count,
                    AVG(EXTRACT(EPOCH FROM (
                        historical.report_finalized_at
                        - COALESCE(historical.reporting_started_at, historical.exam_completed_at)
                    ))) FILTER (WHERE historical.report_finalized_at IS NOT NULL
                        AND COALESCE(historical.reporting_started_at, historical.exam_completed_at) IS NOT NULL
                        AND historical.report_finalized_at > COALESCE(historical.reporting_started_at, historical.exam_completed_at)) AS average_report_seconds,
                    COUNT(*) FILTER (WHERE historical.report_finalized_at IS NOT NULL
                        AND COALESCE(historical.reporting_started_at, historical.exam_completed_at) IS NOT NULL
                        AND historical.report_finalized_at > COALESCE(historical.reporting_started_at, historical.exam_completed_at))::int AS report_sample_count
                FROM examinations historical
                JOIN last_case latest ON latest.modality_id = historical.modality_id
                WHERE historical.created_at >= CURRENT_TIMESTAMP - INTERVAL '180 days'
            )
            SELECT last_case.*,
                   turnaround.average_exam_seconds,
                   turnaround.exam_sample_count,
                   turnaround.average_report_seconds,
                   turnaround.report_sample_count
            FROM last_case
            CROSS JOIN turnaround
        `, [mrn]);

        res.set('Cache-Control', 'no-store, private');
        res.set('Pragma', 'no-cache');

        if (!result.rows.length) {
            return res.json({ found: false });
        }

        const row = result.rows[0];
        const stage = publicStage(row);
        const caseSummary = {
            examType: row.exam_type_name || row.modality_name || 'Diagnostic imaging study',
            modality: row.modality_name || null,
            studyDate: toIso(row.exam_completed_at || row.appointment_start || row.created_at),
            status: stage,
            workflow: publicWorkflow(row, stage),
            lastUpdatedAt: toIso(
                row.report_finalized_at
                || row.reporting_started_at
                || row.exam_completed_at
                || row.exam_started_at
                || row.prep_completed_at
                || row.prep_started_at
                || row.arrived_at
                || row.created_at
            ),
        };

        if (stage.code === 'completed') {
            return res.json({
                found: true,
                completed: true,
                case: caseSummary,
                report: {
                    available: true,
                    access: 'public_token',
                    accessToken: createPublicReportAccessToken(row.exam_id),
                    expiresInSeconds: PUBLIC_REPORT_TTL_SECONDS,
                },
            });
        }

        const rawReportAverage = Number(row.average_report_seconds);
        const rawExamAverage = Number(row.average_exam_seconds);
        const reportSeconds = Number.isFinite(rawReportAverage)
            ? Math.min(Math.max(rawReportAverage, 15 * 60), 72 * 60 * 60)
            : 24 * 60 * 60;
        const examSeconds = Number.isFinite(rawExamAverage)
            ? Math.min(Math.max(rawExamAverage, 5 * 60), 4 * 60 * 60)
            : 30 * 60;

        let baseValue = row.reporting_started_at || row.exam_completed_at;
        let remainingStageSeconds = reportSeconds;
        if (!baseValue && row.exam_started_at) {
            baseValue = row.exam_started_at;
            remainingStageSeconds = examSeconds + reportSeconds;
        }
        if (!baseValue) {
            baseValue = row.appointment_start || row.created_at;
            remainingStageSeconds = examSeconds + reportSeconds;
        }
        const baseDate = baseValue ? new Date(baseValue) : new Date();
        const estimatedAt = new Date(baseDate.getTime() + remainingStageSeconds * 1000);
        const remainingMinutes = Math.max(0, Math.ceil((estimatedAt.getTime() - Date.now()) / 60000));
        const reportSamples = Number(row.report_sample_count) || 0;
        const examSamples = Number(row.exam_sample_count) || 0;

        return res.json({
            found: true,
            completed: false,
            case: caseSummary,
            report: { available: false, access: 'patient_portal' },
            estimate: {
                estimatedCompletionAt: toIso(estimatedAt),
                delayed: estimatedAt.getTime() < Date.now(),
                remainingMinutes,
                basedOn: Number.isFinite(rawReportAverage) ? 'recent_modality_turnaround' : 'standard_turnaround',
                confidence: reportSamples >= 5 && (stage.phase === 'reporting' || examSamples >= 5) ? 'high' : reportSamples > 0 ? 'moderate' : 'standard',
                calculatedAt: new Date().toISOString(),
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Public, privacy-safe operational summary for the landing page.
 * Only aggregate counts and durations are returned; no patient, staff,
 * financial amount, identifier, or clinical detail leaves this endpoint.
 */
const getPublicLandingOverview = (db) => async (req, res, next) => {
    try {
        const [operations, finance, deliveries, modalityMix] = await Promise.all([
            db.query(`
                SELECT
                    COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int AS studies_today,
                    COUNT(*) FILTER (
                        WHERE status != 'Finalized'
                          AND (report_status IS NULL OR report_status NOT IN ('Finalized', 'Amended'))
                    )::int AS pending_reports,
                    COUNT(*) FILTER (
                        WHERE created_at::date = CURRENT_DATE
                          AND status IN ('Scheduled', 'Checked-in')
                    )::int AS waiting_today,
                    COUNT(*) FILTER (
                        WHERE created_at::date = CURRENT_DATE
                          AND queue_stage IN ('Ready for Exam', 'In Exam')
                    )::int AS imaging_queue,
                    COUNT(*) FILTER (
                        WHERE created_at::date = CURRENT_DATE
                          AND queue_stage = 'Reporting'
                    )::int AS reporting_queue,
                    COUNT(*) FILTER (
                        WHERE created_at::date = CURRENT_DATE
                          AND priority IN ('Urgent', 'Emergency')
                    )::int AS priority_today,
                    COUNT(*) FILTER (
                        WHERE created_at::date = CURRENT_DATE
                          AND (status = 'Finalized' OR report_status IN ('Finalized', 'Amended'))
                    )::int AS completed_today,
                    COUNT(*) FILTER (
                        WHERE status != 'Finalized'
                          AND (report_status IS NULL OR report_status NOT IN ('Finalized', 'Amended'))
                          AND created_at < CURRENT_TIMESTAMP - INTERVAL '24 hours'
                    )::int AS delayed_reports,
                    COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE))::int AS studies_this_week,
                    ROUND(AVG(EXTRACT(EPOCH FROM (prep_started_at - arrived_at)) / 60)
                        FILTER (WHERE arrived_at IS NOT NULL AND prep_started_at >= arrived_at
                            AND created_at >= CURRENT_DATE - INTERVAL '30 days')::numeric, 0) AS registration_minutes,
                    ROUND(AVG(EXTRACT(EPOCH FROM (exam_completed_at - exam_started_at)) / 60)
                        FILTER (WHERE exam_started_at IS NOT NULL AND exam_completed_at >= exam_started_at
                            AND created_at >= CURRENT_DATE - INTERVAL '30 days')::numeric, 0) AS imaging_minutes,
                    ROUND(AVG(EXTRACT(EPOCH FROM (report_finalized_at - reporting_started_at)) / 60)
                        FILTER (WHERE reporting_started_at IS NOT NULL AND report_finalized_at >= reporting_started_at
                            AND created_at >= CURRENT_DATE - INTERVAL '30 days')::numeric, 0) AS reporting_minutes,
                    ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - report_finalized_at)) / 60)
                        FILTER (WHERE report_finalized_at IS NOT NULL AND delivered_at >= report_finalized_at
                            AND created_at >= CURRENT_DATE - INTERVAL '30 days')::numeric, 0) AS delivery_minutes,
                    (
                        SELECT COUNT(*)::int
                        FROM modalities
                        WHERE status = 'Active'
                    ) AS active_modalities
                FROM examinations
            `),
            optionalQuery(db, `
                SELECT COUNT(*)::int AS open_claims
                FROM insurance_claims
                WHERE status NOT IN ('Paid', 'Rejected', 'Written Off')
            `),
            optionalQuery(db, `
                SELECT COUNT(*)::int AS delivered_today
                FROM result_deliveries
                WHERE COALESCE(delivered_at, created_at)::date = CURRENT_DATE
                  AND delivery_status IN ('Delivered', 'Sent')
            `),
            optionalRowsQuery(db, `
                SELECT
                    COALESCE(m.name, e.body_part, 'Other') AS label,
                    COUNT(*)::int AS count
                FROM examinations e
                LEFT JOIN modalities m ON m.modality_id = e.modality_id
                WHERE e.created_at::date = CURRENT_DATE
                GROUP BY COALESCE(m.name, e.body_part, 'Other')
                ORDER BY COUNT(*) DESC, label ASC
                LIMIT 5
            `),
        ]);

        const row = operations.rows[0] || {};
        const studiesToday = numberOrNull(row.studies_today);
        const completedToday = numberOrNull(row.completed_today);
        const completionRate = studiesToday === null || completedToday === null
            ? null
            : (studiesToday === 0 ? 0 : Math.round((completedToday / studiesToday) * 100));

        res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=45');
        res.json({
            generatedAt: new Date().toISOString(),
            period: {
                operationalDay: 'today',
                workflowWindowDays: 30,
            },
            metrics: {
                studiesToday,
                pendingReports: numberOrNull(row.pending_reports),
                activeModalities: numberOrNull(row.active_modalities),
                completionRate,
            },
            services: {
                waitingToday: numberOrNull(row.waiting_today),
                pendingReports: numberOrNull(row.pending_reports),
                activeModalities: numberOrNull(row.active_modalities),
                openClaims: numberOrNull(finance.open_claims),
                studiesThisWeek: numberOrNull(row.studies_this_week),
                deliveredToday: numberOrNull(deliveries.delivered_today),
                imagingQueue: numberOrNull(row.imaging_queue),
                reportingQueue: numberOrNull(row.reporting_queue),
                priorityToday: numberOrNull(row.priority_today),
                delayedReports: numberOrNull(row.delayed_reports),
            },
            workflow: {
                registrationMinutes: numberOrNull(row.registration_minutes),
                imagingMinutes: numberOrNull(row.imaging_minutes),
                reportingMinutes: numberOrNull(row.reporting_minutes),
                deliveryMinutes: numberOrNull(row.delivery_minutes),
            },
            pipeline: [
                { code: 'waiting', count: numberOrNull(row.waiting_today) },
                { code: 'imaging', count: numberOrNull(row.imaging_queue) },
                { code: 'reporting', count: numberOrNull(row.reporting_queue) },
                { code: 'delivered', count: numberOrNull(deliveries.delivered_today) },
            ],
            modalityMix: modalityMix.map((item) => ({
                label: item.label || 'Other',
                count: numberOrNull(item.count),
            })),
            workload: {
                priorityToday: numberOrNull(row.priority_today),
                delayedReports: numberOrNull(row.delayed_reports),
                pressureScore: (() => {
                    const waiting = numberOrNull(row.waiting_today) || 0;
                    const pending = numberOrNull(row.pending_reports) || 0;
                    const delayed = numberOrNull(row.delayed_reports) || 0;
                    const priority = numberOrNull(row.priority_today) || 0;
                    return Math.min(100, Math.round((waiting * 2) + pending + (delayed * 3) + (priority * 4)));
                })(),
            },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getPublicLandingOverview, lookupPublicCaseStatus, authorizePublicFinalReport };
