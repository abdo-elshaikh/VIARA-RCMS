const logger = require('../utils/logger');

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

const REPORT_SECTION_LABELS = {
    clinicalHistory: 'Clinical history',
    technique: 'Technique',
    findings: 'Findings',
    impression: 'Impression',
    recommendations: 'Recommendations',
};

const stripReportMarkup = (value) => String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();

const normalizeReportSections = (rawSections) => {
    let sections = rawSections;
    if (typeof sections === 'string') {
        try { sections = JSON.parse(sections); } catch (_) { sections = {}; }
    }
    if (!sections || typeof sections !== 'object' || Array.isArray(sections)) return [];
    return Object.entries(REPORT_SECTION_LABELS)
        .map(([key, label]) => ({ key, label, content: stripReportMarkup(sections[key]) }))
        .filter((section) => section.content);
};

const toIso = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const publicStage = (row) => {
    if (['Finalized', 'Amended'].includes(row.report_status) || row.status === 'Finalized') {
        return { code: 'completed', label: 'Report completed', progress: 100 };
    }
    if (row.report_status && row.report_status !== 'Draft') {
        return { code: 'reporting', label: 'Report under clinical review', progress: 82 };
    }
    const stage = String(row.queue_stage || row.status || '').toLowerCase();
    if (stage.includes('report')) return { code: 'reporting', label: 'Report in progress', progress: 72 };
    if (stage.includes('exam') || stage.includes('scan')) return { code: 'imaging', label: 'Imaging in progress', progress: 48 };
    if (stage.includes('ready') || stage.includes('prep')) return { code: 'preparation', label: 'Preparing for imaging', progress: 32 };
    if (stage.includes('arriv') || stage.includes('check')) return { code: 'arrived', label: 'Visit checked in', progress: 22 };
    return { code: 'scheduled', label: 'Appointment scheduled', progress: 12 };
};

/**
 * Public last-case lookup. The response deliberately excludes patient names,
 * contact data, order/accession identifiers, images, and all non-final drafts.
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
                    e.report_content,
                    e.report_sections,
                    e.queue_stage,
                    e.created_at,
                    e.exam_started_at,
                    e.exam_completed_at,
                    e.reporting_started_at,
                    e.report_finalized_at,
                    e.amended_at,
                    e.digital_signature_name,
                    e.digital_signature_role,
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
                SELECT AVG(EXTRACT(EPOCH FROM (
                    historical.report_finalized_at
                    - COALESCE(historical.exam_completed_at, historical.reporting_started_at, historical.created_at)
                ))) AS average_report_seconds
                FROM examinations historical
                JOIN last_case latest ON latest.modality_id = historical.modality_id
                WHERE historical.report_finalized_at IS NOT NULL
                  AND historical.report_finalized_at > COALESCE(historical.exam_completed_at, historical.reporting_started_at, historical.created_at)
                  AND historical.created_at >= CURRENT_TIMESTAMP - INTERVAL '180 days'
            )
            SELECT last_case.*, turnaround.average_report_seconds
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
            lastUpdatedAt: toIso(row.report_finalized_at || row.reporting_started_at || row.exam_completed_at || row.exam_started_at || row.created_at),
        };

        if (stage.code === 'completed') {
            const sections = normalizeReportSections(row.report_sections);
            const plainText = sections.length ? '' : stripReportMarkup(row.report_content);
            return res.json({
                found: true,
                completed: true,
                case: caseSummary,
                report: {
                    status: row.report_status === 'Amended' ? 'Amended' : 'Finalized',
                    finalizedAt: toIso(row.amended_at || row.report_finalized_at),
                    signedBy: row.digital_signature_name || null,
                    signerRole: row.digital_signature_role || null,
                    sections,
                    plainText,
                },
            });
        }

        const rawAverage = Number(row.average_report_seconds);
        const averageSeconds = Number.isFinite(rawAverage)
            ? Math.min(Math.max(rawAverage, 60 * 60), 72 * 60 * 60)
            : 24 * 60 * 60;
        const baseValue = row.reporting_started_at || row.exam_completed_at || row.appointment_start || row.created_at;
        const baseDate = baseValue ? new Date(baseValue) : new Date();
        const estimatedAt = new Date(baseDate.getTime() + averageSeconds * 1000);

        return res.json({
            found: true,
            completed: false,
            case: caseSummary,
            estimate: {
                estimatedCompletionAt: toIso(estimatedAt),
                delayed: estimatedAt.getTime() < Date.now(),
                basedOn: Number.isFinite(rawAverage) ? 'recent_modality_turnaround' : 'standard_turnaround',
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
        const [operations, finance, deliveries] = await Promise.all([
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
                          AND (status = 'Finalized' OR report_status IN ('Finalized', 'Amended'))
                    )::int AS completed_today,
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
                        WHERE status = 'Active' AND deleted_at IS NULL
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
            },
            workflow: {
                registrationMinutes: numberOrNull(row.registration_minutes),
                imagingMinutes: numberOrNull(row.imaging_minutes),
                reportingMinutes: numberOrNull(row.reporting_minutes),
                deliveryMinutes: numberOrNull(row.delivery_minutes),
            },
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { getPublicLandingOverview, lookupPublicCaseStatus };
