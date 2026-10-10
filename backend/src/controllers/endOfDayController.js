const { getRequestQuery } = require('../utils/requestQuery');
/**
 * endOfDayController.js
 *
 * REST endpoints for the End-of-Shift / End-of-Day review page.
 *
 * Routes (registered in endOfDayRoutes.js):
 *   GET  /api/end-of-day/pending        List pending exams (unexamined) for a date
 *   GET  /api/end-of-day/summary        Shift/day statistics
 *   POST /api/end-of-day/resolve/:appointmentId   Resolve a single case
 *   POST /api/end-of-day/bulk-resolve   Resolve multiple cases
 */

const {
    getPendingExams,
    getDaySummary,
    resolveExam,
    bulkResolveExams,
    onShiftClose,
    getReviewLog: fetchReviewLog,
} = require('../services/endOfDayService');

const { AppError } = require('../middleware/errorHandler');
const { decrypt } = require('../utils/crypto');

const getBusinessDate = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

// ─── GET /api/end-of-day/pending ─────────────────────────────────────────────

const getPending = (db) => async (req, res, next) => {
    try {
        const date      = getRequestQuery(req).date   || getBusinessDate();
        const sessionId = getRequestQuery(req).sessionId || null;
        const limit     = Math.min(Math.max(Number(getRequestQuery(req).limit) || 100, 1), 500);
        const offset    = Math.max(Number(getRequestQuery(req).offset) || 0, 0);
        const actorUserId = req.user.user_id || req.user.id;
        const isReceptionist = req.user.role === 'Receptionist';

        const { rows, total } = await getPendingExams(db, {
            date,
            sessionId,
            limit,
            offset,
            receptionistId: isReceptionist ? actorUserId : null,
            actorRole: req.user.role,
        });

        const data = rows.map((row) => {
            const { first_name_enc, last_name_enc, ...safeRow } = row;
            return {
                ...safeRow,
                patient_name: [decrypt(first_name_enc), decrypt(last_name_enc)].filter(Boolean).join(' ')
            };
        });
        res.json({
            date,
            total,
            limit,
            offset,
            data,
        });
    } catch (err) {
        next(err);
    }
};

// ─── GET /api/end-of-day/summary ─────────────────────────────────────────────

const getSummary = (db) => async (req, res, next) => {
    try {
        const date = getRequestQuery(req).date || getBusinessDate();
        const actorUserId = req.user.user_id || req.user.id;
        const summary = await getDaySummary(db, date, {
            sessionId: getRequestQuery(req).sessionId || null,
            receptionistId: req.user.role === 'Receptionist' ? actorUserId : null,
            actorRole: req.user.role,
        });
        res.json(summary);
    } catch (err) {
        next(err);
    }
};

// ─── POST /api/end-of-day/resolve/:appointmentId ──────────────────────────────

const resolveOne = (db) => async (req, res, next) => {
    try {
        const { appointmentId } = req.params;
        const { action, newDate, newTime, notes, sessionId } = req.body;

        if (!action) throw new AppError('action is required (no_show | carry_forward | reschedule)', 400);

        const result = await resolveExam(db, {
            appointmentId,
            action,
            newDate,
            newTime,
            notes,
            sessionId,
            actorUserId : req.user.user_id || req.user.id,
            actorRole   : req.user.role,
        });

        res.json({ success: true, ...result });
    } catch (err) {
        next(err);
    }
};

// ─── POST /api/end-of-day/bulk-resolve ────────────────────────────────────────

const bulkResolve = (db) => async (req, res, next) => {
    try {
        const { items, sessionId } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            throw new AppError('items must be a non-empty array', 400);
        }
        if (items.length > 200) {
            throw new AppError('Maximum 200 items per bulk request', 400);
        }

        for (const item of items) {
            if (!item.appointmentId || !item.action) {
                throw new AppError('Each item must have appointmentId and action', 400);
            }
        }

        const result = await bulkResolveExams(db, items, {
            actorUserId : req.user.user_id || req.user.id,
            actorRole   : req.user.role,
        }, sessionId || null);

        res.json(result);
    } catch (err) {
        next(err);
    }
};

// ─── GET /api/end-of-day/review-log ───────────────────────────────────────────
// Returns audit log entries for end-of-day review actions

const getReviewLog = (db) => async (req, res, next) => {
    try {
        const date = getRequestQuery(req).date || getBusinessDate();
        const limit = Math.min(Math.max(Number(getRequestQuery(req).limit) || 50, 1), 200);
        const offset = Math.max(Number(getRequestQuery(req).offset) || 0, 0);
        const sessionId = getRequestQuery(req).sessionId || null;
        const receptionistId = getRequestQuery(req).receptionistId || null;

        // Admin sees all, Receptionist sees only their own actions
        const isPrivileged = ['Admin', 'Developer'].includes(req.user.role);
        const actorUserId = isPrivileged ? null : (req.user.user_id || req.user.id);

        const result = await fetchReviewLog(db, { 
            date, 
            limit, 
            offset, 
            actorUserId, 
            actorRole: req.user.role,
            sessionId,
            receptionistId,
        });
        if (isPrivileged) return res.json(result);

        return res.json({
            ...result,
            rows: result.rows.map(({ risk_score, risk_reason, metadata, ...entry }) => entry),
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getPending,
    getSummary,
    resolveOne,
    bulkResolve,
    getReviewLog,
};
