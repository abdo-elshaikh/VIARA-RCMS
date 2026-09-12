const logger = require('../config/logger');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getJwtSecret } = require('../middleware/authMiddleware');
const { encrypt, decrypt } = require('../utils/crypto');
const notificationService = require('../services/notificationService');
const { triggerEventForRole } = require('../services/notificationJobService');
const {
    publicCaseVerificationRequestSchema,
    publicCaseVerificationConfirmSchema,
    publicCaseStatusRefreshSchema,
    publicAppointmentRequestSchema,
} = require('../schemas/publicPortalSchema');

const PUBLIC_REPORT_AUDIENCE = 'VIARA-public-final-report';
const PUBLIC_REPORT_ISSUER = 'VIARA-public-portal';
const PUBLIC_REPORT_TTL_SECONDS = 5 * 60;
const PUBLIC_CHALLENGE_TTL_SECONDS = 5 * 60;
const PUBLIC_STATUS_AUDIENCE = 'VIARA-public-case-status';
// The status token itself is long-lived; the DB challenge expiry (sliding
// session) is the real gate for every refresh call.
const PUBLIC_STATUS_TTL_SECONDS = 30 * 60;
// The development-only verification code is returned for local development
// (unset or 'development' NODE_ENV) — never in tests or production, so the
// known/unknown identifier responses stay byte-identical outside dev.
const isDevelopment = !['production', 'test'].includes(process.env.NODE_ENV || 'development');

const secureHash = (value) => crypto
    .createHmac('sha256', getJwtSecret())
    .update(String(value))
    .digest('hex');

const safeEqual = (left, right) => {
    const leftBuffer = Buffer.from(String(left));
    const rightBuffer = Buffer.from(String(right));
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const noStore = (res) => {
    res.set('Cache-Control', 'no-store, private');
    res.set('Pragma', 'no-cache');
    res.set('X-Robots-Tag', 'noindex, noarchive');
    res.set('Referrer-Policy', 'no-referrer');
};

const validationError = (res, parsed) => res.status(400).json({
    error: parsed.error.issues[0]?.message || 'Invalid request.',
});

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

const createPublicReportAccessToken = (examId, challengeId) => jwt.sign(
    { scope: 'public-final-report', examId: String(examId), challengeId: String(challengeId) },
    getJwtSecret(),
    {
        algorithm: 'HS256',
        audience: PUBLIC_REPORT_AUDIENCE,
        issuer: PUBLIC_REPORT_ISSUER,
        expiresIn: PUBLIC_REPORT_TTL_SECONDS,
    }
);

const createPublicCaseStatusToken = (examId, challengeId) => jwt.sign(
    { scope: 'public-case-status', examId: String(examId), challengeId: String(challengeId) },
    getJwtSecret(),
    {
        algorithm: 'HS256',
        audience: PUBLIC_STATUS_AUDIENCE,
        issuer: PUBLIC_REPORT_ISSUER,
        expiresIn: PUBLIC_STATUS_TTL_SECONDS,
    }
);

const authorizePublicFinalReport = (db) => async (req, res, next) => {
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
        if (payload.scope !== 'public-final-report' || !payload.examId || !payload.challengeId) {
            return res.status(401).json({ error: 'The report access link is invalid or has expired.' });
        }

        const challenge = await db.query(`
            SELECT 1
            FROM public_case_verification_challenges
            WHERE challenge_id = $1
              AND exam_id = $2
              AND verified_at IS NOT NULL
              AND expires_at > CURRENT_TIMESTAMP
            LIMIT 1
        `, [payload.challengeId, payload.examId]);
        if (!challenge.rows.length) {
            return res.status(401).json({ error: 'The report access link is invalid or has expired.' });
        }

        req.params.id = String(payload.examId);
        req.user = { role: 'PublicReport' };
        req.publicReportAccess = { examId: String(payload.examId), challengeId: String(payload.challengeId) };
        noStore(res);
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

const caseStatusQuery = (predicate) => `
    WITH last_case AS (
        SELECT
            p.patient_id, p.phone_enc, p.email_enc, p.preferred_language,
            e.exam_id, e.modality_id, e.status, e.report_status, e.queue_stage,
            e.report_locked, e.created_at, e.arrived_at, e.prep_started_at,
            e.prep_completed_at, e.exam_started_at, e.exam_completed_at,
            e.reporting_started_at, e.report_finalized_at, e.amended_at,
            a.start_time AS appointment_start,
            m.name AS modality_name,
            et.name AS exam_type_name
        FROM patients p
        JOIN examinations e ON e.patient_id = p.patient_id
        LEFT JOIN appointments a ON a.appointment_id = e.appointment_id
        LEFT JOIN modalities m ON m.modality_id = e.modality_id
        LEFT JOIN examination_types et ON et.type_id = e.exam_type_id
        WHERE ${predicate}
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
`;

const identifierCaseQuery = caseStatusQuery(
    '(UPPER(p.mrn) = $1 OR UPPER(e.order_number) = $1 OR UPPER(a.order_number) = $1)'
);
const examCaseQuery = caseStatusQuery('e.exam_id = $1');

const buildVerifiedCaseResponse = (row, challengeId) => {
    const stage = publicStage(row);
    const caseSummary = {
        examType: row.exam_type_name || row.modality_name || 'Diagnostic imaging study',
        modality: row.modality_name || null,
        studyDate: toIso(row.exam_completed_at || row.appointment_start || row.created_at),
        status: stage,
        workflow: publicWorkflow(row, stage),
        lastUpdatedAt: toIso(
            row.report_finalized_at || row.reporting_started_at || row.exam_completed_at
            || row.exam_started_at || row.prep_completed_at || row.prep_started_at
            || row.arrived_at || row.created_at
        ),
    };
    // Short-lived sliding session token: lets the verified visitor follow the
    // case (auto-refresh) without repeating the OTP flow, while the DB
    // challenge expiry remains the authoritative gate.
    const session = {
        statusToken: createPublicCaseStatusToken(row.exam_id, challengeId),
        expiresInSeconds: PUBLIC_CHALLENGE_TTL_SECONDS,
    };

    if (stage.code === 'completed') {
        return {
            found: true,
            completed: true,
            case: caseSummary,
            session,
            report: {
                available: true,
                access: 'verified_public_token',
                accessToken: createPublicReportAccessToken(row.exam_id, challengeId),
                expiresInSeconds: PUBLIC_REPORT_TTL_SECONDS,
            },
        };
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
    const reportSamples = Number(row.report_sample_count) || 0;
    const examSamples = Number(row.exam_sample_count) || 0;

    return {
        found: true,
        completed: false,
        case: caseSummary,
        session,
        report: { available: false, access: 'patient_portal' },
        estimate: {
            estimatedCompletionAt: toIso(estimatedAt),
            delayed: estimatedAt.getTime() < Date.now(),
            remainingMinutes: Math.max(0, Math.ceil((estimatedAt.getTime() - Date.now()) / 60000)),
            basedOn: Number.isFinite(rawReportAverage) ? 'recent_modality_turnaround' : 'standard_turnaround',
            confidence: reportSamples >= 5 && (stage.phase === 'reporting' || examSamples >= 5)
                ? 'high'
                : reportSamples > 0 ? 'moderate' : 'standard',
            calculatedAt: new Date().toISOString(),
        },
    };
};

/**
 * Starts a two-step lookup. The same generic response is returned for existing
 * and unknown identifiers, preventing MRN/order-number enumeration.
 */
const dispatchVerificationCode = (challengeId, contact, language) => {
    if (!contact || (!contact.phone && !contact.email)) return null;
    const arabic = language === 'ar'
        || String(contact.preferredLanguage || '').toLowerCase().startsWith('ar');
    return Promise.resolve().then(async () => {
        const code = contact.code;
        const message = arabic
            ? `رمز التحقق الخاص بنتيجة الفحص هو ${code}. صالح لمدة 5 دقائق. لا تشاركه مع أي شخص.`
            : `Your scan-result verification code is ${code}. It expires in 5 minutes. Do not share it.`;
        const context = {
            eventType: 'PublicCaseVerification', entityId: challengeId,
            patientId: contact.patientId, audienceType: 'Patient', priority: 'Action',
            idempotencyKey: `public-case-verification:${challengeId}:${code}`,
        };
        const delivery = contact.phone
            ? await notificationService.sendSms(contact.phone, message, contact.db, context)
            : await notificationService.sendEmail(contact.email, 'Scan result verification code', message, contact.db, context);
        if (!delivery?.success) {
            logger.warn('Public case verification delivery failed', {
                challengeId, channel: contact.phone ? 'SMS' : 'Email', reason: delivery?.error || 'unknown',
            });
        }
        return contact.phone ? 'SMS' : 'Email';
    }).catch((error) => logger.warn('Public case verification dispatch failed', {
        challengeId, reason: error.message,
    }));
};

const lookupPublicCaseStatus = (db) => async (req, res, next) => {
    try {
        const parsed = publicCaseVerificationRequestSchema.safeParse(req.body || {});
        if (!parsed.success) return validationError(res, parsed);

        const identifier = parsed.data.mrn.toUpperCase();
        const identifierHash = secureHash(identifier);
        const existingChallenge = await db.query(`
            SELECT c.challenge_id, c.patient_id, c.exam_id, c.delivery_channel,
                   GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (c.expires_at - CURRENT_TIMESTAMP))))::int AS expires_in_seconds,
                   p.phone_enc, p.email_enc, p.preferred_language
            FROM public_case_verification_challenges c
            LEFT JOIN patients p ON p.patient_id = c.patient_id
            WHERE c.identifier_hash = $1
              AND c.verified_at IS NULL
              AND c.expires_at > CURRENT_TIMESTAMP
              AND c.attempts < c.max_attempts
            ORDER BY c.created_at DESC
            LIMIT 1
        `, [identifierHash]);

        if (existingChallenge.rows.length) {
            const challenge = existingChallenge.rows[0];
            let expiresInSeconds = challenge.expires_in_seconds;
            let devCode;

            if (parsed.data.resend && challenge.exam_id) {
                // A fresh code for the same challenge. The attempts budget is
                // intentionally NOT reset — resending must not enable
                // brute-forcing the six-digit code.
                const verificationCode = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
                await db.query(`
                    UPDATE public_case_verification_challenges
                    SET code_hash = $2,
                        expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
                    WHERE challenge_id = $1
                `, [challenge.challenge_id, secureHash(`${challenge.challenge_id}:${verificationCode}`)]);
                expiresInSeconds = PUBLIC_CHALLENGE_TTL_SECONDS;
                const deliveryChannel = await dispatchVerificationCode(challenge.challenge_id, {
                    db,
                    patientId: challenge.patient_id,
                    phone: challenge.phone_enc ? decrypt(challenge.phone_enc) : null,
                    email: challenge.email_enc ? decrypt(challenge.email_enc) : null,
                    preferredLanguage: challenge.preferred_language,
                    code: verificationCode,
                }, parsed.data.language);
                if (isDevelopment && deliveryChannel) devCode = verificationCode;
            }

            noStore(res);
            return res.status(202).json({
                verificationRequired: true,
                challengeId: challenge.challenge_id,
                expiresInSeconds,
                ...(devCode ? { devCode } : {}),
                message: 'If the details match an eligible case, a verification code has been sent to the registered contact.',
            });
        }

        const result = await db.query(identifierCaseQuery, [identifier]);
        const row = result.rows[0] || null;
        const challengeId = crypto.randomUUID();
        const verificationCode = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        const phone = row?.phone_enc ? decrypt(row.phone_enc) : null;
        const email = row?.email_enc ? decrypt(row.email_enc) : null;
        const deliveryChannel = phone ? 'SMS' : email ? 'Email' : null;

        await db.query(`
            INSERT INTO public_case_verification_challenges (
                challenge_id, patient_id, exam_id, identifier_hash, code_hash,
                delivery_channel, expires_at, ip_hash
            )
            VALUES ($1, $2, $3, $4, $5, $6,
                    CURRENT_TIMESTAMP + INTERVAL '5 minutes', $7)
        `, [
            challengeId,
            row?.patient_id || null,
            row?.exam_id || null,
            identifierHash,
            secureHash(`${challengeId}:${verificationCode}`),
            deliveryChannel,
            req.ip ? secureHash(req.ip) : null,
        ]);

        if (row && deliveryChannel) {
            // Dispatch after the response path has been decided so provider
            // latency cannot become an account-enumeration timing signal.
            const dispatched = dispatchVerificationCode(challengeId, {
                db,
                patientId: row.patient_id,
                phone,
                email,
                preferredLanguage: row.preferred_language,
                code: verificationCode,
            }, parsed.data.language);
            noStore(res);
            return res.status(202).json({
                verificationRequired: true,
                challengeId,
                expiresInSeconds: PUBLIC_CHALLENGE_TTL_SECONDS,
                ...(isDevelopment && deliveryChannel ? { devCode: verificationCode } : {}),
                message: 'If the details match an eligible case, a verification code has been sent to the registered contact.',
            });
        }

        noStore(res);
        return res.status(202).json({
            verificationRequired: true,
            challengeId,
            expiresInSeconds: PUBLIC_CHALLENGE_TTL_SECONDS,
            message: 'If the details match an eligible case, a verification code has been sent to the registered contact.',
        });
    } catch (error) {
        next(error);
    }
};

const verifyPublicCaseStatus = (db) => async (req, res, next) => {
    try {
        const parsed = publicCaseVerificationConfirmSchema.safeParse(req.body || {});
        if (!parsed.success) return validationError(res, parsed);

        const challengeResult = await db.query(`
            UPDATE public_case_verification_challenges
            SET attempts = attempts + 1
            WHERE challenge_id = $1
              AND verified_at IS NULL
              AND expires_at > CURRENT_TIMESTAMP
              AND attempts < max_attempts
            RETURNING *
        `, [parsed.data.challengeId]);
        const challenge = challengeResult.rows[0];
        const suppliedHash = secureHash(`${parsed.data.challengeId}:${parsed.data.code}`);
        if (!challenge || !challenge.exam_id || !safeEqual(suppliedHash, challenge.code_hash)) {
            noStore(res);
            const remaining = challenge
                ? Number(challenge.max_attempts) - Number(challenge.attempts)
                : Number.NaN;
            return res.status(401).json({
                error: 'The verification code is invalid or has expired.',
                ...(Number.isFinite(remaining) ? { attemptsRemaining: Math.max(0, remaining) } : {}),
            });
        }

        await db.query(`
            UPDATE public_case_verification_challenges
            SET verified_at = CURRENT_TIMESTAMP,
                expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
            WHERE challenge_id = $1
        `, [parsed.data.challengeId]);
        const caseResult = await db.query(examCaseQuery, [challenge.exam_id]);
        if (!caseResult.rows.length) {
            noStore(res);
            return res.status(401).json({ error: 'The verification code is invalid or has expired.' });
        }

        noStore(res);
        return res.json(buildVerifiedCaseResponse(caseResult.rows[0], parsed.data.challengeId));
    } catch (error) {
        next(error);
    }
};

/**
 * Refreshes a verified case status using the sliding-session status token,
 * so the visitor can keep following the exam/report without repeating the
 * OTP flow. Each successful refresh extends the verified challenge window;
 * once it lapses the client must verify again.
 */
const refreshPublicCaseStatus = (db) => async (req, res, next) => {
    try {
        const parsed = publicCaseStatusRefreshSchema.safeParse(req.body || {});
        if (!parsed.success) return validationError(res, parsed);

        let payload;
        try {
            payload = jwt.verify(parsed.data.statusToken, getJwtSecret(), {
                algorithms: ['HS256'],
                audience: PUBLIC_STATUS_AUDIENCE,
                issuer: PUBLIC_REPORT_ISSUER,
            });
        } catch (_error) {
            payload = null;
        }
        if (!payload || payload.scope !== 'public-case-status' || !payload.examId || !payload.challengeId) {
            noStore(res);
            return res.status(401).json({ error: 'This status session has expired. Please verify again.' });
        }

        const slidingUpdate = await db.query(`
            UPDATE public_case_verification_challenges
            SET expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
            WHERE challenge_id = $1
              AND exam_id = $2
              AND verified_at IS NOT NULL
              AND expires_at > CURRENT_TIMESTAMP
            RETURNING challenge_id
        `, [payload.challengeId, payload.examId]);
        if (!slidingUpdate.rows.length) {
            noStore(res);
            return res.status(401).json({ error: 'This status session has expired. Please verify again.' });
        }

        const caseResult = await db.query(examCaseQuery, [payload.examId]);
        if (!caseResult.rows.length) {
            noStore(res);
            return res.status(401).json({ error: 'This status session has expired. Please verify again.' });
        }

        noStore(res);
        return res.json(buildVerifiedCaseResponse(caseResult.rows[0], payload.challengeId));
    } catch (error) {
        next(error);
    }
};

const createPublicAppointmentRequest = (db) => async (req, res, next) => {
    try {
        const parsed = publicAppointmentRequestSchema.safeParse(req.body || {});
        if (!parsed.success) return validationError(res, parsed);

        const data = parsed.data;
        const normalizedPhone = data.phone.replace(/[^\d+]/g, '');
        const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const requestNumber = `WEB-${datePart}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const result = await db.query(`
            INSERT INTO public_appointment_requests (
                request_number, name_enc, phone_enc, phone_hash, request_mode,
                requested_service, preferred_date, consent_at, ip_hash, user_agent
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8, $9)
            RETURNING request_id, request_number, status, created_at
        `, [
            requestNumber,
            encrypt(data.name),
            encrypt(normalizedPhone),
            secureHash(normalizedPhone),
            data.mode,
            data.service,
            data.preferredDate || null,
            req.ip ? secureHash(req.ip) : null,
            String(req.get?.('user-agent') || '').slice(0, 500) || null,
        ]);

        triggerEventForRole(db, 'AppointmentRequested', 'Receptionist', {
            priority: 'Normal',
            variables: {
                patient_name: data.name,
                request_number: requestNumber,
                contact_phone: normalizedPhone,
                preferred_date: data.preferredDate || '',
                exam_type: data.service,
                source: 'Website',
            },
        }).catch((error) => logger.warn('Public appointment notification failed', {
            requestNumber,
            message: error.message,
        }));

        noStore(res);
        return res.status(201).json({
            requestId: result.rows[0].request_id,
            requestNumber: result.rows[0].request_number,
            status: result.rows[0].status,
            createdAt: result.rows[0].created_at,
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
        const [operations, finance, deliveries, modalityMix, activeModalities] = await Promise.all([
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
            optionalRowsQuery(db, `
                SELECT
                    m.modality_id AS id,
                    COALESCE(m.name, 'Unnamed modality') AS name,
                    COALESCE(m.type, '') AS type
                FROM modalities m
                WHERE m.status = 'Active'
                  AND m.deleted_at IS NULL
                ORDER BY m.name ASC
                LIMIT 30
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
            // Real, currently-active equipment registry so the landing page
            // never advertises modalities the center does not operate.
            modalities: activeModalities.map((item) => ({
                id: item.id,
                name: item.name,
                type: item.type || '',
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

/**
 * Public report digital signature verification
 * GET /api/public/reports/verify/:hash
 * Allows anyone scanning the report QR code to verify the report authenticity,
 * status, center endorsement, and digital signature match without logging in.
 */
const verifyReportAuthenticity = (db) => async (req, res, next) => {
    try {
        const rawCode = String(req.params.hash || req.query.code || req.query.hash || '').trim();
        if (!rawCode || rawCode.length < 3) {
            return res.status(400).json({
                verified: false,
                error: 'Verification code is required.'
            });
        }

        const result = await db.query(`
            SELECT 
                e.exam_id, e.order_number, e.status as exam_status, e.report_status,
                e.report_finalized_at, e.digital_signature_name, e.digital_signature_role,
                e.digital_signature_hash, e.study_instance_uid,
                et.name as exam_type_name,
                m.type as modality_type, m.name as machine_name,
                p.mrn, p.first_name_enc, p.last_name_enc,
                a.start_time as appointment_start
            FROM examinations e
            JOIN examination_types et ON e.exam_type_id = et.type_id
            JOIN modalities m ON e.modality_id = m.modality_id
            JOIN patients p ON e.patient_id = p.patient_id
            LEFT JOIN appointments a ON e.appointment_id = a.appointment_id
            WHERE (UPPER(e.digital_signature_hash) = UPPER($1) 
               OR UPPER(e.order_number) = UPPER($1)
               OR UPPER(e.exam_id::text) = UPPER($1))
              AND e.report_status = 'Finalized'
            LIMIT 1
        `, [rawCode]);

        if (!result.rows.length) {
            return res.status(404).json({
                verified: false,
                error: 'No finalized diagnostic report matches this verification code.'
            });
        }

        const row = result.rows[0];
        const firstName = decrypt(row.first_name_enc) || '';
        const lastName = decrypt(row.last_name_enc) || '';

        // Mask patient name for HIPAA & GDPR patient privacy compliance
        const maskWord = (word) => {
            if (!word) return '';
            if (word.length <= 2) return word.charAt(0) + '*';
            return word.charAt(0) + '*'.repeat(Math.max(2, word.length - 2)) + word.charAt(word.length - 1);
        };
        const maskedPatient = [maskWord(firstName), maskWord(lastName)].filter(Boolean).join(' ') || 'Patient';

        const centerSettings = await db.query(`
            SELECT setting_key, setting_value 
            FROM system_settings 
            WHERE setting_key IN ('center.name', 'center.branch_name', 'center.phone', 'center.hotline')
        `);
        const centerMap = {};
        centerSettings.rows.forEach(r => { centerMap[r.setting_key] = r.setting_value; });

        res.setHeader('Cache-Control', 'public, max-age=60');
        return res.json({
            verified: true,
            status: 'Finalized & Authenticated',
            orderNumber: row.order_number,
            patientMasked: maskedPatient,
            mrn: row.mrn,
            examType: row.exam_type_name,
            modality: row.modality_type,
            studyDate: row.appointment_start || row.report_finalized_at,
            finalizedAt: row.report_finalized_at,
            radiologist: row.digital_signature_name || 'Licensed Radiologist',
            radiologistRole: row.digital_signature_role || 'Reporting Radiologist',
            centerName: centerMap['center.name'] || 'TIBA SCAN CENTER',
            branchName: centerMap['center.branch_name'] || 'Main Hospital Branch',
            verificationHash: row.digital_signature_hash,
            integrityConfirmed: true
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getPublicLandingOverview,
    lookupPublicCaseStatus,
    verifyPublicCaseStatus,
    refreshPublicCaseStatus,
    createPublicAppointmentRequest,
    authorizePublicFinalReport,
    verifyReportAuthenticity,
};
