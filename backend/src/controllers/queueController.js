const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');
const { assertInvoiceFullyPaid, assertInvoiceTransactionAllowed } = require('../services/partialPaymentExceptionService');
const { assertInsuranceAuthorization } = require('../services/insuranceAuthorizationService');
const { triggerEvent, triggerEventForRole } = require('../services/notificationJobService');
const { validateEnum, validateUUID, VALID_QUEUE_STAGES, VALID_STATIONS, VALID_PRIORITIES } = require('../utils/queryValidator');
const { decrypt } = require('../utils/crypto');
const { getPagination } = require('../utils/pagination');
const realtimeService = require('../services/realtimeService');
const { completeReceptionTask } = require('../services/receptionTaskService');
const {
    ROLE_CONFIG,
    roleForStation,
    assignmentFromRow,
    markTaskStarted,
    markTaskAvailable,
    completeTask,
    claimTask,
    assignTask,
    releaseTask
} = require('../services/clinicalTaskAssignmentService');
const { handleOnTimeArrivalReward, handleVisitCompletionReward } = require('../services/loyaltyRewardService');

const QUEUE_STAGES = [
    'Registered',
    'Scheduled',
    'Arrived',
    'Payment Pending',
    'Prep Pending',
    'Ready for Exam',
    'In Exam',
    'Images Ready',
    'Images Delivered',
    'Reporting',
    'Finalized',
    'Delivered',
    'Cancelled'
];

const VALID_TRANSITIONS = {
    Registered: ['Scheduled', 'Cancelled'],
    Scheduled: ['Arrived', 'Cancelled'],
    Arrived: ['Payment Pending', 'Prep Pending', 'Ready for Exam', 'Cancelled'],
    'Payment Pending': ['Prep Pending', 'Ready for Exam', 'Cancelled'],
    'Prep Pending': ['Ready for Exam', 'Cancelled'],
    'Ready for Exam': ['In Exam', 'Cancelled'],
    'In Exam': ['Cancelled'],
    'Images Ready': [],
    'Images Delivered': [],
    Reporting: ['Cancelled'],
    Finalized: ['Delivered'],
    Delivered: [],
    Cancelled: []
};

const ROLE_STAGE_PERMISSIONS = {
    Developer: QUEUE_STAGES,
    Admin: QUEUE_STAGES,
    Receptionist: ['Registered', 'Scheduled', 'Arrived', 'Payment Pending', 'Prep Pending', 'Ready for Exam', 'Images Ready', 'Images Delivered', 'Cancelled'],
    Accountant: ['Payment Pending', 'Prep Pending', 'Ready for Exam', 'Cancelled'],
    Nurse: ['Prep Pending', 'Ready for Exam'],
    Technician: ['In Exam', 'Reporting'],
    Radiologist: ['Reporting', 'Finalized']
};

const STAGE_STATION = {
    Registered: 'Reception',
    Scheduled: 'Reception',
    Arrived: 'Reception',
    'Payment Pending': 'Cashier',
    'Prep Pending': 'Nurse',
    'Ready for Exam': 'Modality',
    'In Exam': 'Modality',
    'Images Ready': 'Delivery',
    'Images Delivered': 'Delivery',
    Reporting: 'Radiologist',
    Finalized: 'Delivery',
    Delivered: 'Delivery'
};

const STAGE_EXAM_STATUS = {
    Registered: 'Scheduled',
    Scheduled: 'Scheduled',
    Arrived: 'Checked-in',
    'Payment Pending': 'Checked-in',
    'Prep Pending': 'Checked-in',
    'Ready for Exam': 'Checked-in',
    'In Exam': 'Scanning',
    'Images Ready': 'Completed',
    'Images Delivered': 'Completed',
    Reporting: 'Reporting',
    Finalized: 'Finalized',
    Delivered: 'Finalized',
    Cancelled: 'Scheduled'
};

const OVERDUE_MINUTES = {
    Registered: 15,
    Scheduled: 60,
    Arrived: 20,
    'Payment Pending': 15,
    'Prep Pending': 30,
    'Ready for Exam': 20,
    'In Exam': 60,
    'Images Ready': 60,
    'Images Delivered': 0,
    Reporting: 120,
    Finalized: 60,
    Delivered: 0,
    Cancelled: 0
};

const timestampAssignments = (stage) => {
    const assignments = [];

    if (stage === 'Arrived') assignments.push('arrived_at = COALESCE(arrived_at, NOW())');
    if (stage === 'Prep Pending') assignments.push('prep_started_at = COALESCE(prep_started_at, NOW())');
    if (stage === 'Ready for Exam') assignments.push('prep_completed_at = COALESCE(prep_completed_at, NOW())');
    if (stage === 'In Exam') assignments.push('exam_started_at = COALESCE(exam_started_at, NOW())');
    if (stage === 'Reporting') {
        assignments.push('exam_completed_at = COALESCE(exam_completed_at, NOW())');
        assignments.push('reporting_started_at = COALESCE(reporting_started_at, NOW())');
    }
    if (stage === 'Finalized') assignments.push('report_finalized_at = COALESCE(report_finalized_at, NOW())');
    if (stage === 'Delivered') assignments.push('delivered_at = COALESCE(delivered_at, NOW())');

    return assignments;
};

const canRoleTransition = (role, toStage) => {
    if (role === 'Developer' || role === 'Admin') return true;
    const allowed = ROLE_STAGE_PERMISSIONS[role] || [];
    return allowed.includes(toStage);
};

const hasEmergencyTaskVisibility = (user = {}) => Boolean(
    user.emergencyAccessId
    && Array.isArray(user.elevatedPermissions)
    && user.elevatedPermissions.includes('VIEW_EXAMS')
    && Number(user.breakGlassExpiry) > Date.now()
);

const publishTaskAssignment = (event, assignment) => {
    // Claim/assign/release/complete all mutate queue state: drop memoized KPIs.
    invalidateQueueKpiCache();
    const payload = {
        exam_id: assignment.exam_id,
        task_role: assignment.task_role,
        assignment_status: assignment.assignment_status,
        assignment_version: Number(assignment.assignment_version || 0)
    };
    realtimeService.sendToRole(assignment.task_role, event, payload);
    if (assignment.previous_user_id) realtimeService.sendToUser(assignment.previous_user_id, event, payload);
    if (assignment.assigned_user_id) realtimeService.sendToUser(assignment.assigned_user_id, event, payload);
};

const publishQueueTaskChange = (row, event = 'CLINICAL_TASK_UPDATED') => {
    // Every mutation that reaches this publish point changed queue state, so
    // memoized KPI aggregates must not be served stale.
    invalidateQueueKpiCache();
    const taskRole = roleForStation(row.current_station);
    const assignment = taskRole ? assignmentFromRow(row, taskRole) : null;
    const payload = {
        exam_id: row.exam_id,
        appointment_id: row.appointment_id,
        task_role: taskRole,
        assignment_status: !assignment?.assignedUserId
            ? 'Unassigned'
            : row.is_on_hold
                ? 'On Hold'
                : assignment?.startedAt
                    ? 'In Progress'
                    : 'Assigned',
        assignment_version: assignment?.version || 0,
        queue_stage: row.queue_stage,
        current_station: row.current_station
    };
    if (taskRole) realtimeService.sendToRole(taskRole, event, payload);
    if (assignment?.assignedUserId) realtimeService.sendToUser(assignment.assignedUserId, event, payload);
    realtimeService.sendToRole('Receptionist', 'QUEUE_UPDATED', payload);
    realtimeService.sendToRole('Cashier', 'QUEUE_UPDATED', payload);
    realtimeService.sendToRole('Admin', 'QUEUE_UPDATED', payload);
    realtimeService.sendToRole('Developer', 'QUEUE_UPDATED', payload);
};

const notifyClinicalTask = (db, role, assigneeId, payload) => {
    if (assigneeId) {
        return triggerEvent(db, 'ExamStatusChanged', {
            ...payload,
            staffId: assigneeId,
            staffRole: role
        });
    }
    return triggerEventForRole(db, 'ExamStatusChanged', role, payload);
};

// Short-lived memoization of the queue KPI aggregate (the statement re-runs the
// full filtered queue query). Invalidated on every queue mutation; bounded TTL
// guards against clock-skew edge cases.
const QUEUE_KPI_CACHE_TTL_MS = 10_000;
const queueKpiCache = new Map();

const getQueueKpiAggregate = async (db, kpiQuery, kpiValues) => {
    const cacheKey = JSON.stringify(kpiValues);
    const cached = queueKpiCache.get(cacheKey);
    if (cached && Date.now() - cached.at < QUEUE_KPI_CACHE_TTL_MS) {
        return cached.value;
    }
    const kpiResult = await db.query(kpiQuery, kpiValues);
    const value = kpiResult.rows[0] || {};
    if (queueKpiCache.size >= 300) {
        queueKpiCache.clear();
    }
    queueKpiCache.set(cacheKey, { at: Date.now(), value });
    return value;
};

const QUEUE_LIST_CACHE_TTL_MS = 2500;
const queueListCache = new Map();

const invalidateQueueKpiCache = () => {
    queueKpiCache.clear();
    queueListCache.clear();
};

const getQueue = (db) => async (req, res, next) => {
    try {
        const {
            stage,
            station,
            priority,
            date,
            includeDelivered = 'false',
            scope = 'all'
        } = req.query;
        const { limit, offset } = getPagination(req.query, { defaultLimit: 200, maxLimit: 500 });

        let canViewFinancialData = req.user?.role === 'Developer'
            || (Array.isArray(req.user?.elevatedPermissions)
                && req.user.elevatedPermissions.includes('VIEW_INVOICES'));
        if (!canViewFinancialData) {
            const permissionResult = await db.query(`
                SELECT 1
                FROM role_permissions rp
                JOIN permissions p ON p.permission_id = rp.permission_id
                WHERE rp.role_name = $1 AND p.name = 'VIEW_INVOICES'
                LIMIT 1
            `, [req.user?.role]);
            canViewFinancialData = permissionResult.rows.length > 0;
        }

        const cacheKey = `${req.user?.user_id || ''}:${req.user?.role || ''}:${canViewFinancialData ? 'finance' : 'no-finance'}:${stage || ''}:${station || ''}:${priority || ''}:${date || ''}:${includeDelivered}:${scope}:${limit}:${offset}`;
        if (process.env.NODE_ENV !== 'test') {
            const cached = queueListCache.get(cacheKey);
            if (cached && (Date.now() - cached.at < QUEUE_LIST_CACHE_TTL_MS)) {
                return res.json(cached.value);
            }
        }

        // Input validation to prevent SQL injection
        validateEnum(stage, VALID_QUEUE_STAGES, 'stage');
        validateEnum(station, VALID_STATIONS, 'station');
        validateEnum(priority, VALID_PRIORITIES, 'priority');

        const values = [];
        let param = 1;
        let query = `
            WITH last_event AS (
                SELECT DISTINCT ON (exam_id)
                    exam_id,
                    created_at as last_event_at
                FROM queue_events
                WHERE event_type = 'Transition'
                  AND from_stage IS DISTINCT FROM to_stage
                ORDER BY exam_id, created_at DESC
            ),
            hold_totals AS (
                SELECT exam_id, queue_stage,
                       COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(released_at, NOW()) - started_at))), 0) AS hold_seconds
                FROM clinical_task_hold_intervals
                GROUP BY exam_id, queue_stage
            )
            SELECT e.exam_id, e.appointment_id, e.modality_id, e.status, e.queue_stage, e.current_station,
                   e.arrived_at, e.prep_started_at, e.prep_completed_at, e.exam_started_at,
                   e.exam_completed_at, e.reporting_started_at, e.report_finalized_at, e.delivered_at,
                   e.is_on_hold, e.hold_started_at, e.hold_released_at, e.hold_reason,
                   e.order_number, e.priority, e.clinical_indication, e.body_part, e.contrast_required,
                   e.report_request_status, e.report_requested_at, e.report_requested_by,
                   e.report_request_source, e.images_ready_at, e.images_delivered_at,
                   e.pregnancy_safety_status, e.implant_safety_status, e.renal_safety_status,
                    e.is_follow_up, e.prior_exam_id, e.follow_up_reason,
                    e.report_status,
                    e.created_at,
                    a.start_time, a.end_time, a.preparation_status,
                    a.nurse_id, a.nurse_assigned_at, a.nurse_task_available_at, a.nurse_assignment_version,
                    a.technician_id, a.technician_assigned_at, a.technician_task_available_at, a.technician_assignment_version,
                    e.performing_radiologist_id, e.radiologist_assigned_at, e.radiologist_task_available_at, e.radiologist_assignment_version,
                    CASE e.current_station
                        WHEN 'Nurse' THEN a.nurse_id
                        WHEN 'Modality' THEN a.technician_id
                        WHEN 'Radiologist' THEN e.performing_radiologist_id
                        ELSE NULL
                    END AS task_assignee_id,
                    CASE e.current_station
                        WHEN 'Nurse' THEN a.nurse_assigned_at
                        WHEN 'Modality' THEN a.technician_assigned_at
                        WHEN 'Radiologist' THEN e.radiologist_assigned_at
                        ELSE NULL
                    END AS task_assigned_at,
                    CASE e.current_station
                        WHEN 'Nurse' THEN a.nurse_task_available_at
                        WHEN 'Modality' THEN a.technician_task_available_at
                        WHEN 'Radiologist' THEN e.radiologist_task_available_at
                        ELSE NULL
                    END AS task_available_at,
                    CASE e.current_station
                        WHEN 'Nurse' THEN a.nurse_task_started_at
                        WHEN 'Modality' THEN a.technician_task_started_at
                        WHEN 'Radiologist' THEN e.radiologist_task_started_at
                        ELSE NULL
                    END AS task_started_at,
                    CASE e.current_station
                        WHEN 'Nurse' THEN a.nurse_assignment_version
                        WHEN 'Modality' THEN a.technician_assignment_version
                        WHEN 'Radiologist' THEN e.radiologist_assignment_version
                        ELSE 0
                    END AS task_assignment_version,
                    CASE e.current_station
                        WHEN 'Nurse' THEN 'Nurse'
                        WHEN 'Modality' THEN 'Technician'
                        WHEN 'Radiologist' THEN 'Radiologist'
                        ELSE NULL
                    END AS task_role,
                    p.mrn, p.gender, p.first_name_enc, p.last_name_enc,
                    m.name as modality_name, m.type as modality_type,
                    m.room_number as room_number, m.status as machine_status,
                    rec.full_name as receptionist_name, a.receptionist_id, a.receptionist_desk,
                    a.receptionist_assigned_at, a.receptionist_assignment_version,
                    et.name as exam_type_name, et.preparation_instructions,
                   tech.full_name as technician_name,
                   nurse.full_name as nurse_name,
                    rad.full_name as radiologist_name,
                    li.invoice_id,
                    li.invoice_number,
                    li.invoice_status,
                    COALESCE(ip.paid_amount, 0) AS invoice_paid_amount,
                    GREATEST(
                        COALESCE(li.patient_payable_amount, 0)
                        - COALESCE(ip.credited_amount, 0)
                        - COALESCE(ip.paid_amount, 0)
                        + COALESCE(ip.refunded_amount, 0),
                        0
                    ) AS invoice_balance_amount,
                    ppe.exception_id AS payment_exception_id,
                    CASE
                        WHEN ppe.status = 'Approved' AND ppe.expires_at IS NOT NULL AND ppe.expires_at <= NOW() THEN 'Expired'
                        ELSE ppe.status
                    END AS payment_exception_status,
                    ppe.reason AS payment_exception_reason,
                    ppe.review_notes AS payment_exception_review_notes,
                    ppe.requested_at AS payment_exception_requested_at,
                    ppe.reviewed_at AS payment_exception_reviewed_at,
                    ppe.expires_at AS payment_exception_expires_at,
                    ppe.metadata->>'targetStage' AS payment_exception_target_stage,
                    exception_requester.full_name AS payment_exception_requested_by_name,
                    exception_reviewer.full_name AS payment_exception_reviewed_by_name,
                    CASE
                        WHEN e.queue_stage = 'Scheduled' THEN a.start_time
                        ELSE COALESCE(le.last_event_at, e.arrived_at, e.created_at)
                    END as stage_started_at,
                    CASE
                        WHEN e.queue_stage IN ('Images Delivered', 'Delivered', 'Cancelled') THEN 0
                        ELSE GREATEST(0, ROUND(EXTRACT(EPOCH FROM (NOW() - CASE
                            WHEN e.queue_stage = 'Scheduled' THEN a.start_time
                            ELSE COALESCE(le.last_event_at, e.arrived_at, e.created_at)
                        END)) / 60))
                    END as stage_elapsed_minutes,
                    CASE
                        WHEN e.queue_stage IN ('Images Delivered', 'Delivered', 'Cancelled') THEN 0
                        ELSE GREATEST(0, ROUND((EXTRACT(EPOCH FROM (NOW() - CASE
                            WHEN e.queue_stage = 'Scheduled' THEN a.start_time
                            ELSE COALESCE(le.last_event_at, e.arrived_at, e.created_at)
                        END)) - COALESCE(ht.hold_seconds, 0)) / 60))
                    END as active_stage_minutes,
                    CASE
                        WHEN e.queue_stage IN ('Images Delivered', 'Delivered', 'Cancelled') THEN 0
                        ELSE GREATEST(0, ROUND((EXTRACT(EPOCH FROM (NOW() - CASE
                            WHEN e.queue_stage = 'Scheduled' THEN a.start_time
                            ELSE COALESCE(le.last_event_at, e.arrived_at, e.created_at)
                        END)) - COALESCE(ht.hold_seconds, 0)) / 60))
                    END as waiting_minutes,
                    CASE
                        WHEN e.delivered_at IS NULL AND e.report_finalized_at IS NULL THEN NULL
                        WHEN COALESCE(e.delivered_at, e.report_finalized_at) < e.created_at THEN NULL
                        ELSE GREATEST(0, ROUND(EXTRACT(EPOCH FROM (COALESCE(e.delivered_at, e.report_finalized_at) - e.created_at)) / 60))
                    END as turnaround_minutes,
                    GREATEST(0, ROUND(COALESCE(ht.hold_seconds, 0) / 60)) AS paused_minutes,
                   prior_e.order_number AS prior_order_number,
                   prior_e.report_status AS prior_report_status,
                   COALESCE(prior_a.start_time, prior_e.created_at) AS prior_exam_time,
                   prior_et.name AS prior_exam_type_name
            FROM examinations e
            JOIN appointments a ON e.appointment_id = a.appointment_id
            JOIN patients p ON e.patient_id = p.patient_id
            JOIN modalities m ON e.modality_id = m.modality_id
            LEFT JOIN examination_types et ON e.exam_type_id = et.type_id
            LEFT JOIN users tech ON a.technician_id = tech.user_id
            LEFT JOIN users nurse ON a.nurse_id = nurse.user_id
            LEFT JOIN users rad ON e.performing_radiologist_id = rad.user_id
            LEFT JOIN users rec ON a.receptionist_id = rec.user_id
            LEFT JOIN LATERAL (
                SELECT i.invoice_id, i.invoice_number, i.invoice_status, i.patient_payable_amount
                FROM invoices i
                WHERE i.invoice_status <> 'Voided'
                  AND (i.exam_id = e.exam_id OR i.appointment_id = e.appointment_id)
                ORDER BY i.generated_at DESC
                LIMIT 1
            ) li ON TRUE
            LEFT JOIN LATERAL (
                SELECT
                    COALESCE(SUM(payment.amount) FILTER (WHERE payment.payment_status = 'Completed'), 0) AS paid_amount,
                    COALESCE((SELECT SUM(refund.amount) FROM refunds refund
                              WHERE refund.invoice_id = li.invoice_id AND refund.status = 'Processed'), 0) AS refunded_amount,
                    COALESCE((SELECT SUM(note.patient_amount) FROM credit_notes note
                              WHERE note.invoice_id = li.invoice_id AND note.reversed_at IS NULL), 0) AS credited_amount
                FROM payments payment
                WHERE payment.invoice_id = li.invoice_id
            ) ip ON li.invoice_id IS NOT NULL
            LEFT JOIN LATERAL (
                SELECT exception.*
                FROM partial_payment_exceptions exception
                WHERE exception.invoice_id = li.invoice_id
                  AND exception.transaction_type = 'ClinicalQueueTransition'
                ORDER BY
                    CASE
                        WHEN exception.status = 'Pending' THEN 0
                        WHEN exception.status = 'Approved'
                             AND (exception.expires_at IS NULL OR exception.expires_at > NOW()) THEN 1
                        ELSE 2
                    END,
                    exception.requested_at DESC
                LIMIT 1
            ) ppe ON TRUE
            LEFT JOIN users exception_requester ON exception_requester.user_id = ppe.requested_by
            LEFT JOIN users exception_reviewer ON exception_reviewer.user_id = ppe.reviewed_by
             LEFT JOIN last_event le ON le.exam_id = e.exam_id
             LEFT JOIN hold_totals ht ON ht.exam_id = e.exam_id AND ht.queue_stage = e.queue_stage
            LEFT JOIN examinations prior_e ON prior_e.exam_id = e.prior_exam_id
            LEFT JOIN appointments prior_a ON prior_a.appointment_id = prior_e.appointment_id
            LEFT JOIN examination_types prior_et ON prior_et.type_id = prior_e.exam_type_id
            WHERE 1=1
        `;

        // Filter clauses are accumulated ONCE and appended to both the display
        // query and the lightweight KPI query — guarantees tab counts always
        // match the visible list and cannot drift apart.
        let filterClauses = '';

        if (stage) {
            filterClauses += ` AND e.queue_stage = $${param++}`;
            values.push(stage);
        } else {
            filterClauses += ` AND a.status != 'Cancelled' AND e.queue_stage != 'Cancelled'`;
        }

        if (station) {
            filterClauses += ` AND e.current_station = $${param++}`;
            values.push(station);
        }

        if (priority) {
            filterClauses += ` AND e.priority = $${param++}`;
            values.push(priority);
        }

        if (date) {
            filterClauses += ` AND a.start_time >= $${param}::date AND a.start_time < ($${param}::date + '1 day'::interval)`;
            values.push(date);
            param++;
        }

        if (includeDelivered !== 'true') {
            filterClauses += ` AND e.queue_stage NOT IN ('Images Delivered', 'Delivered')`;
        }

        const clinicalTaskConfig = ROLE_CONFIG[req.user.role];
        const isQueryingOwnStation = !station || (clinicalTaskConfig && station === clinicalTaskConfig.station);

        if (clinicalTaskConfig && isQueryingOwnStation) {
            if (!station) {
                filterClauses += ` AND e.current_station = $${param++}`;
                values.push(clinicalTaskConfig.station);
            }
            if (!stage && Array.isArray(clinicalTaskConfig.stages) && clinicalTaskConfig.stages.length > 0) {
                filterClauses += ` AND e.queue_stage = ANY($${param++}::text[])`;
                values.push(clinicalTaskConfig.stages);
            }

            const assignmentColumn = clinicalTaskConfig.table === 'appointments'
                ? `a.${clinicalTaskConfig.assigneeColumn}`
                : `e.${clinicalTaskConfig.assigneeColumn}`;
            const emergencyVisibility = hasEmergencyTaskVisibility(req.user);

            if (scope === 'mine') {
                filterClauses += ` AND ${assignmentColumn} = $${param++}`;
                values.push(req.user.user_id);
            } else if (scope === 'available') {
                filterClauses += ` AND ${assignmentColumn} IS NULL`;
            } else if (!emergencyVisibility) {
                filterClauses += ` AND (${assignmentColumn} = $${param++} OR ${assignmentColumn} IS NULL)`;
                values.push(req.user.user_id);
            }
        } else if (['Receptionist', 'Cashier', 'Admin', 'Developer'].includes(req.user.role) || (clinicalTaskConfig && !isQueryingOwnStation)) {
            // Receptionists, Cashiers, Admins, and clinical staff reviewing other stations can view cases across stations for holistic tracking
            if (scope === 'mine' && req.user.role === 'Receptionist') {
                filterClauses += ` AND a.receptionist_id = $${param++}`;
                values.push(req.user.user_id);
            }
        } else {
            if (scope !== 'all') {
                return next(new AppError('Personal clinical task scopes are not available for this role', 403, true, 'ROLE_NOT_ELIGIBLE'));
            }
            // Non-clinical operational views may see the shared pool, but not a
            // private task already owned by a clinical user.
            filterClauses += ` AND (
                e.current_station NOT IN ('Nurse', 'Modality', 'Radiologist')
                OR (e.current_station = 'Nurse' AND a.nurse_id IS NULL)
                OR (e.current_station = 'Modality' AND a.technician_id IS NULL)
                OR (e.current_station = 'Radiologist' AND e.performing_radiologist_id IS NULL)
            )`;
        }

        // Append the shared filters to the display query.
        query += filterClauses;
        const filteredQuery = query;
        const filterValues = [...values];
        const kpiValues = [...filterValues, req.user.user_id];
        const currentUserParam = `$${kpiValues.length}`;
        // Lightweight KPI statement: identical filter tree (so tab counts always
        // match the visible list) but WITHOUT display columns — no decrypted
        // patient names, no financial LATERALs, no staff/user joins. Only the
        // columns the aggregates below actually read.
        const kpiQuery = `
            WITH last_event AS (
                SELECT DISTINCT ON (exam_id)
                    exam_id, created_at as last_event_at
                FROM queue_events
                WHERE event_type = 'Transition'
                  AND from_stage IS DISTINCT FROM to_stage
                ORDER BY exam_id, created_at DESC
            ),
            hold_totals AS (
                SELECT exam_id, queue_stage,
                       COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(released_at, NOW()) - started_at))), 0) AS hold_seconds
                FROM clinical_task_hold_intervals
                GROUP BY exam_id, queue_stage
            ),
            filtered_queue AS (
                SELECT
                    e.queue_stage,
                    e.current_station,
                    e.is_on_hold,
                    e.priority,
                    e.delivered_at, e.report_finalized_at, e.created_at,
                    e.arrived_at,
                    CASE e.current_station
                        WHEN 'Nurse' THEN a.nurse_id
                        WHEN 'Modality' THEN a.technician_id
                        WHEN 'Radiologist' THEN e.performing_radiologist_id
                        ELSE NULL
                    END AS task_assignee_id,
                    CASE e.current_station
                        WHEN 'Nurse' THEN a.nurse_task_started_at
                        WHEN 'Modality' THEN a.technician_task_started_at
                        WHEN 'Radiologist' THEN e.radiologist_task_started_at
                        ELSE NULL
                    END AS task_started_at,
                    CASE
                        WHEN e.queue_stage IN ('Images Delivered', 'Delivered', 'Cancelled') THEN 0
                        ELSE GREATEST(0, ROUND((EXTRACT(EPOCH FROM (NOW() - CASE
                            WHEN e.queue_stage = 'Scheduled' THEN a.start_time
                            ELSE COALESCE(le.last_event_at, e.arrived_at, e.created_at)
                        END)) - COALESCE(ht.hold_seconds, 0)) / 60))
                    END AS waiting_minutes,
                    CASE
                        WHEN e.delivered_at IS NULL AND e.report_finalized_at IS NULL THEN NULL
                        WHEN COALESCE(e.delivered_at, e.report_finalized_at) < e.created_at THEN NULL
                        ELSE GREATEST(0, ROUND(EXTRACT(EPOCH FROM (COALESCE(e.delivered_at, e.report_finalized_at) - e.created_at)) / 60))
                    END AS turnaround_minutes,
                    a.status AS appointment_status,
                    a.receptionist_id,
                    a.nurse_id, a.technician_id,
                    e.exam_id, e.appointment_id
                FROM examinations e
                JOIN appointments a ON e.appointment_id = a.appointment_id
                JOIN patients p ON e.patient_id = p.patient_id
                JOIN modalities m ON e.modality_id = m.modality_id
                 LEFT JOIN last_event le ON le.exam_id = e.exam_id
                 LEFT JOIN hold_totals ht ON ht.exam_id = e.exam_id AND ht.queue_stage = e.queue_stage
                WHERE 1=1
                ${filterClauses}
            ),
            stage_counts AS (
                SELECT queue_stage, COUNT(*)::integer AS stage_count
                FROM filtered_queue
                GROUP BY queue_stage
            )
            SELECT
                COUNT(*)::integer AS total,
                COUNT(*) FILTER (WHERE task_assignee_id = ${currentUserParam}::uuid)::integer AS assigned_to_me,
                COUNT(*) FILTER (WHERE task_assignee_id IS NULL)::integer AS available,
                COUNT(*) FILTER (
                    WHERE task_assignee_id = ${currentUserParam}::uuid
                      AND NOT is_on_hold
                      AND task_started_at IS NULL
                )::integer AS pending,
                COUNT(*) FILTER (
                    WHERE task_assignee_id = ${currentUserParam}::uuid
                      AND NOT is_on_hold
                      AND task_started_at IS NOT NULL
                )::integer AS in_progress,
                COUNT(*) FILTER (
                    WHERE task_assignee_id = ${currentUserParam}::uuid AND is_on_hold
                )::integer AS on_hold,
                COUNT(*) FILTER (
                    WHERE queue_stage NOT IN ('Images Delivered', 'Delivered', 'Cancelled')
                      AND NOT is_on_hold
                      AND COALESCE(waiting_minutes, 0) > CASE queue_stage
                        WHEN 'Registered' THEN 15
                        WHEN 'Scheduled' THEN 60
                        WHEN 'Arrived' THEN 20
                        WHEN 'Payment Pending' THEN 15
                        WHEN 'Prep Pending' THEN 30
                        WHEN 'Ready for Exam' THEN 20
                        WHEN 'In Exam' THEN 60
                        WHEN 'Reporting' THEN 120
                        WHEN 'Finalized' THEN 60
                        ELSE 60
                    END
                )::integer AS overdue,
                COALESCE(ROUND(AVG(COALESCE(waiting_minutes, 0)) FILTER (
                    WHERE queue_stage NOT IN ('Images Delivered', 'Delivered', 'Cancelled')
                )), 0)::integer AS average_waiting_minutes,
                COALESCE(ROUND(AVG(turnaround_minutes) FILTER (WHERE turnaround_minutes IS NOT NULL)), 0)::integer AS average_turnaround_minutes,
                COALESCE(
                    (SELECT jsonb_object_agg(queue_stage, stage_count) FROM stage_counts),
                    '{}'::jsonb
                ) AS by_stage
            FROM filtered_queue
        `;

        query += `
            ORDER BY
                CASE e.priority WHEN 'Emergency' THEN 1 WHEN 'Urgent' THEN 2 ELSE 3 END,
                e.is_on_hold ASC,
                COALESCE(le.last_event_at, e.arrived_at, e.created_at) ASC
            LIMIT $${param++} OFFSET $${param}
        `;
        values.push(limit, offset);

        // The KPI statement re-runs the full filtered queue query. Every
        // workstation polls this endpoint frequently, so short-lived memoized
        // KPIs (invalidated by any queue mutation) halve the hottest database
        // path in the system while keeping tab counters effectively live.
        const [result, kpiAggregate] = await Promise.all([
            db.query(query, values),
            getQueueKpiAggregate(db, kpiQuery, kpiValues)
        ]);
        const rows = result.rows.map(row => {
            const mapped = {
                ...row,
                assignment_status: !row.task_assignee_id
                    ? 'Unassigned'
                    : row.is_on_hold
                        ? 'On Hold'
                        : row.task_started_at
                            ? 'In Progress'
                            : 'Assigned',
                is_assigned_to_me: String(row.task_assignee_id || '') === String(req.user.user_id),
                is_overdue: !['Images Delivered', 'Delivered', 'Cancelled'].includes(row.queue_stage)
                    && !row.is_on_hold
                    && Number(row.waiting_minutes || 0) > (OVERDUE_MINUTES[row.queue_stage] ?? 60),
                sla_threshold_minutes: OVERDUE_MINUTES[row.queue_stage] ?? 60,
                timing_basis: 'active_stage'
            };
            if (row.first_name_enc || row.last_name_enc) {
                try {
                    mapped.patient_name = [
                        row.first_name_enc ? decrypt(row.first_name_enc) : null,
                        row.last_name_enc ? decrypt(row.last_name_enc) : null
                    ]
                        .filter(Boolean)
                        .join(' ');
                } catch {
                    mapped.patient_name = row.mrn ? `Patient (${row.mrn})` : 'Patient';
                }
            }
            delete mapped.first_name_enc;
            delete mapped.last_name_enc;
            if (!canViewFinancialData) {
                [
                    'invoice_id',
                    'invoice_number',
                    'invoice_status',
                    'invoice_paid_amount',
                    'invoice_balance_amount',
                    'payment_exception_id',
                    'payment_exception_status',
                    'payment_exception_reason',
                    'payment_exception_review_notes',
                    'payment_exception_requested_at',
                    'payment_exception_reviewed_at',
                    'payment_exception_expires_at',
                    'payment_exception_target_stage',
                    'payment_exception_requested_by_name',
                    'payment_exception_reviewed_by_name'
                ].forEach((field) => delete mapped[field]);
            }
            return mapped;
        });

        const aggregate = kpiAggregate || {};
        const kpis = {
            total: Number(aggregate.total || 0),
            assignedToMe: Number(aggregate.assigned_to_me || 0),
            available: Number(aggregate.available || 0),
            pending: Number(aggregate.pending || 0),
            inProgress: Number(aggregate.in_progress || 0),
            onHold: Number(aggregate.on_hold || 0),
            overdue: Number(aggregate.overdue || 0),
            averageWaitingMinutes: Number(aggregate.average_waiting_minutes || 0),
            averageTurnaroundMinutes: Number(aggregate.average_turnaround_minutes || 0),
            byStage: aggregate.by_stage || {}
        };

        const responseData = { data: rows, kpis };
        queueListCache.set(cacheKey, { at: Date.now(), value: responseData });
        if (queueListCache.size >= 300) {
            const oldest = queueListCache.keys().next().value;
            queueListCache.delete(oldest);
        }
        res.json(responseData);
    } catch (error) {
        next(error);
    }
};

const transitionQueue = (db) => async (req, res, next) => {
    let client;

    try {
        const { examId } = req.params;
        const { toStage, action, reason, notes } = req.body;

        if (!examId) {
            return next(new AppError('Examination ID is required', 400));
        }
        validateUUID(examId, 'examId');

        client = await db.connect();
        await client.query('BEGIN');

        const existingResult = await client.query(`
            SELECT e.*,
                   a.technician_id, a.technician_assigned_at, a.technician_task_available_at,
                   a.technician_task_started_at, a.technician_assignment_version,
                   a.nurse_id, a.nurse_assigned_at, a.nurse_task_available_at,
                   a.nurse_task_started_at, a.nurse_assignment_version,
                                     a.receptionist_id, a.receptionist_desk, a.receptionist_assignment_version,
                   p.first_name_enc, p.last_name_enc
            FROM examinations e
            JOIN appointments a ON e.appointment_id = a.appointment_id
            JOIN patients p ON e.patient_id = p.patient_id
            WHERE e.exam_id = $1
            FOR UPDATE OF e, a
        `, [examId]);

        if (existingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Queue item not found', 404));
        }

        const existing = existingResult.rows[0];

        // Authorization: check the target stage before any session/shift lookups.
        if (toStage && !canRoleTransition(req.user.role, toStage)) {
            await client.query('ROLLBACK');
            return next(new AppError('Your role cannot move an item to this queue stage', 403));
        }

        // Reception work is single-owner: every reception-stage action must
        // come from the receptionist who claimed the appointment.
        const isReceptionStage = existing.current_station === 'Reception';
        if (req.user.role === 'Receptionist') {
            const openShift = await client.query(`
                SELECT session_id, desk_identifier, scope, room_ids, modality_ids
                FROM reception_shift_sessions
                WHERE user_id = $1 AND status = 'Open'
                LIMIT 1
            `, [req.user.user_id]);
            if (!openShift.rows.length) {
                await client.query('ROLLBACK');
                return next(new AppError(
                    'Start your reception shift and set its workstation scope before managing queue stages. | يجب فتح وردية الاستقبال وتحديد محطة العمل قبل معالجة وتغيير مراحل المرضى في قائمة الانتظار.',
                    409,
                    true,
                    'RECEPTION_SHIFT_REQUIRED'
                ));
            }
        }

        if (isReceptionStage && existing.receptionist_id
            && String(existing.receptionist_id) !== String(req.user.user_id)
            && !['Admin', 'Developer'].includes(req.user.role)) {
            await client.query('ROLLBACK');
            return next(new AppError('Queue item is assigned to another receptionist', 409, true, 'TASK_ALREADY_CLAIMED', {
                claimedBy: existing.receptionist_id,
                desk: existing.receptionist_desk,
                version: existing.receptionist_assignment_version
            }));
        }
        if (isReceptionStage && !existing.receptionist_id) {
            // Auto-assign to the acting receptionist if unassigned to prevent workflow blockage
            const newVersion = (existing.receptionist_assignment_version || 0) + 1;
            const actorDesk = req.headers['x-workstation-desk'] || req.body?.desk || 'الاستقبال';
            await client.query(`
                UPDATE appointments
                SET receptionist_id = $1,
                    receptionist_assigned_at = CURRENT_TIMESTAMP,
                    receptionist_desk = COALESCE(receptionist_desk, $2),
                    receptionist_assignment_version = $3
                WHERE appointment_id = $4
            `, [req.user.user_id, actorDesk, newVersion, existing.appointment_id]);
            existing.receptionist_id = req.user.user_id;
            existing.receptionist_desk = actorDesk;
            existing.receptionist_assignment_version = newVersion;
        }


        const activeTaskRole = roleForStation(existing.current_station);
        const activeAssignment = activeTaskRole ? assignmentFromRow(existing, activeTaskRole) : null;
        if (activeTaskRole && activeAssignment?.assignedUserId
            && (req.user.role !== activeTaskRole
                || String(activeAssignment.assignedUserId) !== String(req.user.user_id))) {
            await client.query('ROLLBACK');
            return next(new AppError('Queue item not found or assigned to another user', 404));
        }
        if (activeTaskRole && !activeAssignment?.assignedUserId) {
            await client.query('ROLLBACK');
            return next(new AppError('Accept this task before taking action', 409, true, 'TASK_NOT_ASSIGNED'));
        }

        const startsClinicalTask = activeTaskRole === 'Technician' && toStage === 'In Exam';
        if (startsClinicalTask) {
            const taskStartedAt = await markTaskStarted(client, existing, activeTaskRole);
            existing[ROLE_CONFIG[activeTaskRole].startedAtColumn] = taskStartedAt;
        }

        if (action === 'start_task') {
            if (!activeTaskRole || !activeAssignment?.assignedUserId) {
                await client.query('ROLLBACK');
                return next(new AppError('Accept this task before starting work', 409, true, 'TASK_NOT_ASSIGNED'));
            }
            if (activeAssignment.startedAt) {
                await client.query('ROLLBACK');
                return next(new AppError('Clinical task has already started', 409, true, 'TASK_ALREADY_STARTED'));
            }

            const taskStartedAt = await markTaskStarted(client, existing, activeTaskRole);
            existing[ROLE_CONFIG[activeTaskRole].startedAtColumn] = taskStartedAt;
            await client.query(`
                INSERT INTO queue_events (
                    exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
                    event_type, notes, changed_by
                ) VALUES ($1, $2, $3, $3, $4, $4, 'Start_Task', $5, $6)
            `, [
                examId,
                existing.appointment_id,
                existing.queue_stage,
                existing.current_station,
                `${activeTaskRole} task started`,
                req.user.user_id
            ]);
            await client.query('COMMIT');
            publishQueueTaskChange(existing);
            await logAction(client, {
                userId: req.user.user_id,
                action: 'CLINICAL_TASK_STARTED',
                resourceId: examId,
                resourceTable: 'examinations',
                ipAddress: req.ip,
                details: {
                    taskRole: activeTaskRole,
                    queueStage: existing.queue_stage,
                    taskStartedAt
                }
            });
            return res.json({
                ...existing,
                task_started_at: taskStartedAt,
                assignment_status: 'In Progress'
            });
        }

        if (action === 'update_complaint') {
            if (!['Developer', 'Admin', 'Nurse', 'Radiologist', 'Technician'].includes(req.user.role)) {
                await client.query('ROLLBACK');
                return next(new AppError('You are not allowed to update the clinical complaint', 403));
            }

            const result = await client.query(`
                UPDATE examinations SET clinical_indication = $1 WHERE exam_id = $2 RETURNING *
            `, [req.body.complaint || null, examId]);

            await client.query(`
                UPDATE appointments SET clinical_indication = $1 WHERE appointment_id = $2
            `, [req.body.complaint || null, existing.appointment_id]);

            await client.query(`
                INSERT INTO queue_events (
                    exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
                    event_type, notes, changed_by
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                examId,
                existing.appointment_id,
                existing.queue_stage,
                existing.queue_stage,
                existing.current_station,
                existing.current_station,
                'Update_Complaint',
                'Clinical complaint updated',
                req.user.user_id
            ]);

            await client.query('COMMIT');
            publishQueueTaskChange({ ...existing, ...result.rows[0] });
            await logAction(client, {
                userId: req.user.user_id,
                action: 'QUEUE_COMPLAINT_UPDATED',
                resourceId: examId,
                resourceTable: 'examinations',
                ipAddress: req.ip,
                details: { complaint: req.body.complaint || null, appointmentId: existing.appointment_id }
            });
            return res.json(result.rows[0]);
        }

        if (action === 'update_safety') {
            if (!['Developer', 'Admin', 'Nurse', 'Radiologist', 'Technician'].includes(req.user.role)) {
                await client.query('ROLLBACK');
                return next(new AppError('You are not allowed to update safety checklists', 403));
            }

            const { pregnancySafetyStatus, implantSafetyStatus, renalSafetyStatus } = req.body;
            const fields = [];
            const values = [];
            let paramIdx = 1;

            if (pregnancySafetyStatus) {
                fields.push(`pregnancy_safety_status = $${paramIdx++}`);
                values.push(pregnancySafetyStatus);
            }
            if (implantSafetyStatus) {
                fields.push(`implant_safety_status = $${paramIdx++}`);
                values.push(implantSafetyStatus);
            }
            if (renalSafetyStatus) {
                fields.push(`renal_safety_status = $${paramIdx++}`);
                values.push(renalSafetyStatus);
            }

            let resultRow = existing;
            if (fields.length > 0) {
                const examValues = [...values, examId];
                const updateRes = await client.query(`
                    UPDATE examinations SET ${fields.join(', ')} WHERE exam_id = $${paramIdx} RETURNING *
                `, examValues);
                resultRow = updateRes.rows[0];

                const appointmentValues = [...values, existing.appointment_id];
                await client.query(`
                    UPDATE appointments SET ${fields.join(', ')} WHERE appointment_id = $${paramIdx}
                `, appointmentValues);
            }

            await client.query(`
                INSERT INTO queue_events (
                    exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
                    event_type, notes, changed_by
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                examId,
                existing.appointment_id,
                existing.queue_stage,
                existing.queue_stage,
                existing.current_station,
                existing.current_station,
                'Update_Safety',
                'Clinical safety checklist updated',
                req.user.user_id
            ]);

            await client.query('COMMIT');
            publishQueueTaskChange({ ...existing, ...resultRow });
            await logAction(client, {
                userId: req.user.user_id,
                action: 'QUEUE_SAFETY_UPDATED',
                resourceId: examId,
                resourceTable: 'examinations',
                ipAddress: req.ip,
                details: {
                    pregnancySafetyStatus,
                    implantSafetyStatus,
                    renalSafetyStatus,
                    appointmentId: existing.appointment_id
                }
            });
            return res.json(resultRow);
        }

        if (action === 'hold' || action === 'release') {
            if (!['Developer', 'Admin', 'Receptionist', 'Accountant', 'Nurse', 'Technician', 'Radiologist'].includes(req.user.role)) {
                await client.query('ROLLBACK');
                return next(new AppError('You are not allowed to hold or release this queue item', 403));
            }

            const isHold = action === 'hold';
            if (isHold && existing.is_on_hold) {
                await client.query('ROLLBACK');
                return next(new AppError('Queue item is already on hold', 409));
            }
            if (!isHold && !existing.is_on_hold) {
                await client.query('ROLLBACK');
                return next(new AppError('Queue item is not on hold', 409));
            }
            const result = await client.query(`
                UPDATE examinations
                SET is_on_hold = $1,
                    hold_started_at = CASE WHEN $1::boolean = true THEN NOW() ELSE hold_started_at END,
                    hold_released_at = CASE WHEN $1::boolean = false THEN NOW() ELSE hold_released_at END,
                    hold_reason = CASE WHEN $1::boolean = true THEN $2 ELSE hold_reason END
                WHERE exam_id = $3
                RETURNING *
            `, [isHold, reason || null, examId]);

            if (isHold) {
                await client.query(`
                    INSERT INTO clinical_task_hold_intervals (
                        exam_id, task_role, queue_stage, started_at, reason, created_by
                    ) VALUES ($1, $2, $3, NOW(), $4, $5)
                `, [examId, activeTaskRole || null, existing.queue_stage, reason || null, req.user.user_id]);
            } else {
                await client.query(`
                    UPDATE clinical_task_hold_intervals
                    SET released_at = NOW()
                    WHERE hold_id = (
                        SELECT hold_id
                        FROM clinical_task_hold_intervals
                        WHERE exam_id = $1 AND released_at IS NULL
                        ORDER BY started_at DESC
                        LIMIT 1
                    )
                `, [examId]);
            }

            await client.query(`
                INSERT INTO queue_events (
                    exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
                    event_type, reason, notes, changed_by
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
                examId,
                existing.appointment_id,
                existing.queue_stage,
                existing.queue_stage,
                existing.current_station,
                existing.current_station,
                isHold ? 'Hold' : 'Release',
                reason || null,
                notes || null,
                req.user.user_id
            ]);

            await client.query('COMMIT');
            publishQueueTaskChange({ ...existing, ...result.rows[0] });
            await logAction(client, {
                userId: req.user.user_id,
                action: isHold ? 'QUEUE_ITEM_HELD' : 'QUEUE_ITEM_RELEASED',
                resourceId: examId,
                resourceTable: 'examinations',
                ipAddress: req.ip,
                details: { reason: reason || null, holdStartedAt: isHold, appointmentId: existing.appointment_id }
            });
            return res.json(result.rows[0]);
        }

        if (!toStage) {
            await client.query('ROLLBACK');
            return next(new AppError('Target queue stage is required', 400));
        }

        if (existing.is_on_hold && toStage !== 'Cancelled') {
            await client.query('ROLLBACK');
            return next(new AppError('Release this queue item before moving it forward', 409));
        }

        if (toStage === 'Finalized') {
            await client.query('ROLLBACK');
            return next(new AppError(
                'Finalize the diagnostic report from the report editor after approval; the queue cannot finalize reports.',
                409,
                true,
                'REPORT_FINALIZATION_REQUIRED'
            ));
        }
        if (['Images Ready', 'Images Delivered'].includes(toStage)) {
            await client.query('ROLLBACK');
            return next(new AppError(
                'Use the acquisition completion or image delivery action for this stage.',
                409,
                true,
                'DEDICATED_WORKFLOW_REQUIRED'
            ));
        }
        if (existing.queue_stage === 'In Exam' && toStage === 'Reporting') {
            await client.query('ROLLBACK');
            return next(new AppError(
                'Use the acquisition completion action and choose whether a report is required.',
                409,
                true,
                'ACQUISITION_COMPLETION_REQUIRED'
            ));
        }

        const allowedNextStages = VALID_TRANSITIONS[existing.queue_stage] || [];
        if (!allowedNextStages.includes(toStage) && !['Developer', 'Admin'].includes(req.user.role)) {
            await client.query('ROLLBACK');
            return next(new AppError(`Invalid queue transition from ${existing.queue_stage} to ${toStage}`, 409));
        }

        const enteringClinical = ['Prep Pending', 'Ready for Exam', 'In Exam'].includes(toStage);
        if (enteringClinical && existing.priority !== 'Emergency') {
            const invoiceResult = await client.query(`
                WITH latest_invoice AS (
                    SELECT i.invoice_id, i.invoice_status, i.patient_payable_amount, i.insurance_covered_amount
                    FROM invoices i
                    WHERE i.invoice_status <> 'Voided'
                      AND (i.exam_id = $1 OR i.appointment_id = $2)
                    ORDER BY i.generated_at DESC
                    LIMIT 1
                ),
                paid_totals AS (
                    SELECT
                        COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'Completed'), 0) AS paid_amount,
                        COALESCE((SELECT SUM(r.amount) FROM refunds r
                                  WHERE r.invoice_id = li.invoice_id AND r.status = 'Processed'), 0) AS refunded_amount,
                        COALESCE((SELECT SUM(cn.patient_amount) FROM credit_notes cn
                                  WHERE cn.invoice_id = li.invoice_id AND cn.reversed_at IS NULL), 0) AS credited_amount
                    FROM latest_invoice li
                    LEFT JOIN payments p ON p.invoice_id = li.invoice_id
                    GROUP BY li.invoice_id
                )
                SELECT li.invoice_id,
                       li.invoice_status,
                       li.patient_payable_amount,
                       li.insurance_covered_amount,
                       COALESCE(pt.paid_amount, 0) AS paid_amount,
                       COALESCE(pt.refunded_amount, 0) AS refunded_amount,
                       COALESCE(pt.credited_amount, 0) AS credited_amount
                FROM latest_invoice li
                LEFT JOIN paid_totals pt ON TRUE
            `, [examId, existing.appointment_id]);

            if (invoiceResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return next(new AppError('Create an invoice before moving this exam to clinical stages', 409));
            }

            const invoice = invoiceResult.rows[0];
            try {
                await assertInvoiceTransactionAllowed(client, {
                    invoiceId: invoice.invoice_id,
                    transactionType: 'ClinicalQueueTransition',
                    targetStage: toStage,
                    transactionLabel: 'moving this exam forward'
                });
                if (Number(invoice.insurance_covered_amount || 0) > 0) {
                    await assertInsuranceAuthorization(client, invoice.invoice_id);
                }
            } catch (error) {
                await client.query('ROLLBACK');
                return next(error);
            }
        }

        // Safety checklist check when entering exam.  A missing/Unknown value
        // is not a clearance; each domain must be explicitly resolved.
        if (toStage === 'In Exam' && existing.priority !== 'Emergency') {
            const blockedSafetyDomains = [
                ['pregnancy', existing.pregnancy_safety_status],
                ['implant', existing.implant_safety_status],
                ['renal', existing.renal_safety_status]
            ].filter(([, value]) => !['Cleared', 'Not Applicable'].includes(value));

            if (blockedSafetyDomains.length > 0) {
                await client.query('ROLLBACK');
                const domains = blockedSafetyDomains.map(([name]) => name).join(', ');
                return next(new AppError(`Complete and clear the following safety checks before starting the exam: ${domains}`, 409));
            }
        }

        if (toStage === 'Cancelled') {
            await client.query('ROLLBACK');
            return next(new AppError('Use the dedicated appointment cancellation workflow', 409));
        }

        // Backward-compatible explicit pregnancy guard (the comprehensive
        // check above handles this path first).
        if (toStage === 'In Exam' && existing.pregnancy_safety_status === 'At Risk' && existing.priority !== 'Emergency') {
            await client.query('ROLLBACK');
            return next(new AppError('Safety guard: the exam cannot start while the pregnancy safety status is At Risk and has not been clinically reviewed. | تحذير أمان: لا يمكن بدء الفحص وحالة أمان الحمل (At Risk) لم يتم اعتمادها أو فحصها سريرياً.', 409, true, 'PREGNANCY_SAFETY_AT_RISK'));
        }

        // Mandatory contrast check before reporting or finalizing contrast exams
        if (['Reporting', 'Finalized'].includes(toStage) && existing.contrast_required) {
            const contrastLogged = await client.query(`
                SELECT (
                    EXISTS (
                        SELECT 1
                        FROM stock_movements sm
                        JOIN inventory_items inventory_item ON inventory_item.item_id = sm.item_id
                        WHERE sm.reference_type = 'Exam'
                          AND sm.reference_id = $1
                          AND sm.movement_type = 'Consume'
                          AND sm.quantity_change < 0
                          AND (
                              inventory_item.is_contrast_agent = true
                              OR LOWER(TRIM(COALESCE(inventory_item.category, ''))) IN ('contrast', 'contrast agent')
                              OR inventory_item.name ILIKE '%صبغة%'
                              OR inventory_item.name ILIKE '%contrast%'
                          )
                    )
                    OR EXISTS (
                        SELECT 1
                        FROM invoice_items ii
                        JOIN invoices inv ON inv.invoice_id = ii.invoice_id
                        WHERE (inv.exam_id = $1 OR inv.appointment_id = (SELECT appointment_id FROM examinations WHERE exam_id = $1))
                          AND (
                              ii.description ILIKE '%صبغة%'
                              OR ii.description ILIKE '%contrast%'
                              OR ii.description ILIKE '%dye%'
                          )
                    )
                ) AS has_verified_contrast
            `, [examId]);

            if (contrastLogged.rows.length > 0 && !contrastLogged.rows[0].has_verified_contrast) {
                await client.query('ROLLBACK');
                return next(new AppError(
                    'This exam requires IV contrast. Register and dispense the contrast and exam consumables before completing the exam and writing the report. | هذا الفحص يتطلب صبغة وريدية. يجب تسجيل وصرف صبغة ومستلزمات الفحص قبل إنهاء الفحص وكتابة التقرير.',
                    400,
                    true,
                    'CONTRAST_REQUIRED',
                    { action: 'dispense_contrast_consumables', examId }
                ));
            }
        }

        if (toStage === 'Delivered') {
            const invoiceResult = await client.query(`
                SELECT invoice_id
                FROM invoices
                WHERE invoice_status <> 'Voided'
                  AND (exam_id = $1 OR appointment_id = $2)
                ORDER BY generated_at DESC
                LIMIT 1
            `, [examId, existing.appointment_id]);

            if (invoiceResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return next(new AppError('Create and settle an invoice before final delivery', 409));
            }

            try {
                await assertInvoiceFullyPaid(client, {
                    invoiceId: invoiceResult.rows[0].invoice_id,
                    transactionType: 'QueueFinalDelivery',
                    transactionLabel: 'final delivery'
                });
                await client.query(`
                    UPDATE partial_payment_exceptions
                    SET status = 'Used',
                        metadata = metadata || jsonb_build_object('usedAt', NOW(), 'deliveredAt', NOW(), 'deliveryChannel', 'QueueFinalDelivery')
                    WHERE invoice_id = $1 AND status = 'Approved'
                `, [invoiceResult.rows[0].invoice_id]);
            } catch (error) {
                await client.query('ROLLBACK');
                return next(error);
            }
        }

        const toStation = STAGE_STATION[toStage];
        const examStatus = STAGE_EXAM_STATUS[toStage];
        const assignments = [
            'queue_stage = $1',
            'current_station = $2',
            'status = $3',
            ...timestampAssignments(toStage)
        ];

        const updateResult = await client.query(`
            UPDATE examinations
            SET ${assignments.join(', ')}
            WHERE exam_id = $4
            RETURNING *
        `, [toStage, toStation, examStatus, examId]);

        if (toStage === 'Arrived') {
            await client.query(`
                UPDATE appointments
                SET status = 'Checked-in'
                WHERE appointment_id = $1
            `, [existing.appointment_id]);

            // Instant Loyalty Reward: On-Time Arrival (+15 pts)
            handleOnTimeArrivalReward(client, {
                patientId: existing.patient_id,
                appointmentId: existing.appointment_id,
                client
            }).catch(err => console.warn('Failed to award on-time reward:', err.message));
        } else if (['Finalized', 'Delivered'].includes(toStage)) {
            await client.query(`
                UPDATE appointments
                SET status = 'Completed'
                WHERE appointment_id = $1
            `, [existing.appointment_id]);

            // Instant Loyalty Reward: Visit Completion / Milestones / Recall (+25 to +100 pts)
            handleVisitCompletionReward(client, {
                patientId: existing.patient_id,
                appointmentId: existing.appointment_id,
                isFollowUp: existing.is_follow_up,
                client
            }).catch(err => console.warn('Failed to award visit completion reward:', err.message));
        } else if (toStage === 'Cancelled') {
            await client.query(`
                UPDATE appointments
                SET status = 'Cancelled',
                    cancellation_reason = COALESCE($2, cancellation_reason, 'Cancelled from queue'),
                    cancelled_by = $3,
                    cancelled_at = NOW()
                WHERE appointment_id = $1
            `, [existing.appointment_id, reason || notes || null, req.user.user_id]);
        }

        await client.query(`
            INSERT INTO queue_events (
                exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
                event_type, reason, notes, changed_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'Transition', $7, $8, $9)
        `, [
            examId,
            existing.appointment_id,
            existing.queue_stage,
            toStage,
            existing.current_station,
            toStation,
            reason || null,
            notes || null,
            req.user.user_id
        ]);

        let completedTask = null;
        if (activeTaskRole && toStation !== existing.current_station) {
            completedTask = await completeTask(client, existing, activeTaskRole, req.user.user_id);
        }

        let completedReceptionTask = null;
        if (existing.current_station === 'Reception' && toStation !== existing.current_station) {
            completedReceptionTask = await completeReceptionTask(client, {
                appointmentId: existing.appointment_id,
                userId: req.user.user_id
            });
        }

        const nextTaskRole = roleForStation(toStation);
        let nextTaskAvailability = null;
        if (nextTaskRole && toStation !== existing.current_station) {
            nextTaskAvailability = await markTaskAvailable(client, existing, nextTaskRole);
        }

        await client.query(`
            INSERT INTO order_status_history (
                appointment_id, exam_id, old_status, new_status, event_type, notes, changed_by
            )
            VALUES ($1, $2, $3, $4, 'QueueTransition', $5, $6)
        `, [
            existing.appointment_id,
            examId,
            existing.queue_stage,
            toStage,
            notes || reason || null,
            req.user.user_id
        ]);

        await client.query('COMMIT');
        const publishedRow = { ...existing, ...updateResult.rows[0] };
        if (nextTaskRole && nextTaskAvailability) {
            const nextConfig = ROLE_CONFIG[nextTaskRole];
            publishedRow[nextConfig.availableAtColumn] = nextTaskAvailability.task_available_at;
            publishedRow[nextConfig.startedAtColumn] = null;
            publishedRow[nextConfig.versionColumn] = nextTaskAvailability.assignment_version;
        }
        publishQueueTaskChange(publishedRow);
        if (completedTask) publishTaskAssignment('CLINICAL_TASK_COMPLETED', completedTask);
        if (completedReceptionTask) {
            realtimeService.sendToRole('Receptionist', 'RECEPTION_TASK_RELEASED', completedReceptionTask);
            realtimeService.sendToRole('Admin', 'RECEPTION_TASK_RELEASED', completedReceptionTask);
            realtimeService.sendToRole('Developer', 'RECEPTION_TASK_RELEASED', completedReceptionTask);
        }

        // Fire role-based notifications outside transaction
        const patientName = existing.first_name_enc || existing.last_name_enc
            ? [decrypt(existing.first_name_enc), decrypt(existing.last_name_enc)].filter(Boolean).join(' ')
            : (existing.order_number || '');

        const notificationPayload = {
            entityType: 'Exam',
            entityId: examId,
            channels: ['InApp'],
            priority: action === 'hold' ? 'Warning' : 'Normal',
            variables: {
                order_number: existing.order_number || '',
                patient_name: patientName,
                from_stage: existing.queue_stage,
                to_stage: toStage || existing.queue_stage,
                station: toStation || existing.current_station,
                reason: reason || notes || ''
            }
        };

        if (action === 'hold') {
            triggerEventForRole(db, 'ExamStatusChanged', 'Admin', notificationPayload).catch(() => {});
            triggerEventForRole(db, 'ExamStatusChanged', 'Radiologist', notificationPayload).catch(() => {});
            triggerEventForRole(db, 'ExamStatusChanged', 'Nurse', notificationPayload).catch(() => {});
        } else if (action === 'release') {
            triggerEventForRole(db, 'ExamStatusChanged', 'Technician', notificationPayload).catch(() => {});
            triggerEventForRole(db, 'ExamStatusChanged', 'Nurse', notificationPayload).catch(() => {});
        } else {
            if (toStage === 'Arrived') {
                triggerEventForRole(db, 'ExamStatusChanged', 'Accountant', notificationPayload).catch(() => {});
                triggerEventForRole(db, 'ExamStatusChanged', 'Nurse', notificationPayload).catch(() => {});
            } else if (toStage === 'Payment Pending') {
                triggerEventForRole(db, 'ExamStatusChanged', 'Accountant', notificationPayload).catch(() => {});
            } else if (toStage === 'Prep Pending') {
                notifyClinicalTask(db, 'Nurse', existing.nurse_id, notificationPayload).catch(() => {});
            } else if (toStage === 'Ready for Exam') {
                notifyClinicalTask(db, 'Technician', existing.technician_id, notificationPayload).catch(() => {});
            } else if (toStage === 'Reporting') {
                notifyClinicalTask(db, 'Radiologist', existing.performing_radiologist_id, notificationPayload).catch(() => {});
            } else if (toStage === 'Finalized') {
                triggerEventForRole(db, 'ExamStatusChanged', 'Receptionist', notificationPayload).catch(() => {});
            }
        }

        await logAction(db, {
            userId: req.user.user_id,
            action: 'QUEUE_TRANSITION',
            resourceId: examId,
            resourceTable: 'examinations',
            ipAddress: req.ip,
            details: {
                fromStage: existing.queue_stage,
                toStage,
                fromStation: existing.current_station,
                toStation,
                action: action || null,
                reason: reason || null,
                appointmentId: existing.appointment_id
            }
        });

        publishQueueTaskChange(updateResult.rows[0], 'QUEUE_TRANSITION');

        res.json(updateResult.rows[0]);
    } catch (error) {
        if (client) {
            try { await client.query('ROLLBACK'); } catch (rbErr) { /* ignore */ }
        }
        next(error);
    } finally {
        if (client) client.release();
    }
};

const assertAcquisitionContrastRecorded = async (client, exam) => {
    if (!exam.contrast_required) return;

    const contrastLogged = await client.query(`
        SELECT (
            EXISTS (
                SELECT 1
                FROM stock_movements sm
                JOIN inventory_items item ON item.item_id = sm.item_id
                WHERE sm.reference_type = 'Exam'
                  AND sm.reference_id = $1
                  AND sm.movement_type = 'Consume'
                  AND sm.quantity_change < 0
                  AND (
                      item.is_contrast_agent = TRUE
                      OR LOWER(TRIM(COALESCE(item.category, ''))) IN ('contrast', 'contrast agent')
                      OR item.name ILIKE '%contrast%'
                      OR item.name ILIKE '%صبغة%'
                  )
            )
            OR EXISTS (
                SELECT 1
                FROM invoice_items ii
                JOIN invoices inv ON inv.invoice_id = ii.invoice_id
                WHERE (inv.exam_id = $1 OR inv.appointment_id = $2)
                  AND (ii.description ILIKE '%contrast%' OR ii.description ILIKE '%dye%' OR ii.description ILIKE '%صبغة%')
            )
        ) AS has_verified_contrast
    `, [exam.exam_id, exam.appointment_id]);

    if (!contrastLogged.rows[0]?.has_verified_contrast) {
        throw new AppError(
            'Register and dispense the required contrast and consumables before completing this examination.',
            400,
            true,
            'CONTRAST_REQUIRED',
            { action: 'dispense_contrast_consumables', examId: exam.exam_id }
        );
    }
};

const completeAcquisition = (db) => async (req, res, next) => {
    let client;
    let committed = false;
    try {
        validateUUID(req.params.examId, 'examId');
        const { resultMode, notes } = req.body;
        const imagesOnly = resultMode === 'ImagesOnly';
        const toStage = imagesOnly ? 'Images Ready' : 'Reporting';
        const toStation = imagesOnly ? 'Delivery' : 'Radiologist';
        const nextStatus = imagesOnly ? 'Completed' : 'Reporting';

        client = await db.connect();
        await client.query('BEGIN');
        const existingResult = await client.query(`
            SELECT e.*,
                   a.technician_id, a.technician_assigned_at, a.technician_task_available_at,
                   a.technician_task_started_at, a.technician_assignment_version,
                   a.nurse_id, a.nurse_assigned_at, a.nurse_task_available_at,
                   a.nurse_task_started_at, a.nurse_assignment_version
            FROM examinations e
            JOIN appointments a ON a.appointment_id = e.appointment_id
            WHERE e.exam_id = $1
            FOR UPDATE OF e, a
        `, [req.params.examId]);
        const existing = existingResult.rows[0];
        if (!existing) throw new AppError('Examination not found', 404);

        if (existing.queue_stage === toStage) {
            await client.query('COMMIT');
            committed = true;
            return res.json(existing);
        }
        if (existing.queue_stage !== 'In Exam') {
            throw new AppError('Only an examination currently in progress can be completed', 409, true, 'INVALID_QUEUE_TRANSITION');
        }
        if (req.user.role === 'Technician'
            && String(existing.technician_id || '') !== String(req.user.user_id || '')) {
            throw new AppError('Examination is assigned to another technician', 404);
        }

        await assertAcquisitionContrastRecorded(client, existing);

        const updateResult = await client.query(`
            UPDATE examinations
            SET status = $2::exam_status,
                queue_stage = $3,
                current_station = $4,
                exam_completed_at = COALESCE(exam_completed_at, NOW()),
                images_ready_at = COALESCE(images_ready_at, NOW()),
                report_request_status = $5,
                report_requested_at = CASE WHEN $6::boolean THEN NULL ELSE COALESCE(report_requested_at, NOW()) END,
                report_requested_by = CASE WHEN $6::boolean THEN NULL ELSE report_requested_by END,
                report_request_source = CASE WHEN $6::boolean THEN 'Patient' ELSE report_request_source END,
                reporting_started_at = CASE WHEN $6::boolean THEN reporting_started_at ELSE COALESCE(reporting_started_at, NOW()) END
            WHERE exam_id = $1
            RETURNING *
        `, [
            existing.exam_id,
            nextStatus,
            toStage,
            toStation,
            imagesOnly ? 'NotRequested' : 'Requested',
            imagesOnly
        ]);

        await client.query(`
            UPDATE appointments
            SET status = 'Completed'
            WHERE appointment_id = $1
        `, [existing.appointment_id]);

        await client.query(`
            INSERT INTO queue_events (
                exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
                event_type, reason, notes, changed_by
            ) VALUES ($1, $2, $3, $4, $5, $6, 'AcquisitionCompleted', $7, $8, $9)
        `, [
            existing.exam_id,
            existing.appointment_id,
            existing.queue_stage,
            toStage,
            existing.current_station,
            toStation,
            imagesOnly ? 'Images requested without report' : 'Report requested after acquisition',
            notes || null,
            req.user.user_id
        ]);

        await client.query(`
            INSERT INTO order_status_history (
                appointment_id, exam_id, old_status, new_status, event_type, notes, changed_by
            ) VALUES ($1, $2, $3, $4, 'AcquisitionCompleted', $5, $6)
        `, [existing.appointment_id, existing.exam_id, existing.status, nextStatus, notes || resultMode, req.user.user_id]);

        if (imagesOnly || existing.report_request_status !== 'Requested') {
            await client.query(`
                INSERT INTO report_request_events (
                    exam_id, old_status, new_status, source, reason, changed_by
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                existing.exam_id,
                existing.report_request_status || 'Requested',
                imagesOnly ? 'NotRequested' : 'Requested',
                imagesOnly ? 'Patient' : 'Automatic',
                notes || null,
                req.user.user_id
            ]);
        }

        await completeTask(client, existing, 'Technician', req.user.user_id);
        if (!imagesOnly) await markTaskAvailable(client, existing, 'Radiologist');

        await logAction(client, {
            userId: req.user.user_id,
            action: 'ACQUISITION_COMPLETED',
            resourceId: existing.exam_id,
            resourceTable: 'examinations',
            ipAddress: req.ip,
            details: { resultMode, fromStage: existing.queue_stage, toStage, notes: notes || null }
        });

        await client.query('COMMIT');
        committed = true;
        const updated = updateResult.rows[0];
        publishQueueTaskChange(updated, 'ACQUISITION_COMPLETED');

        const payload = {
            entityType: 'Exam',
            entityId: existing.exam_id,
            channels: ['InApp'],
            priority: 'Normal',
            variables: {
                order_number: existing.order_number || '',
                from_stage: existing.queue_stage,
                to_stage: toStage,
                station: toStation
            }
        };
        if (imagesOnly) {
            triggerEventForRole(db, 'ExamStatusChanged', 'Receptionist', payload).catch(() => {});
        } else {
            notifyClinicalTask(db, 'Radiologist', existing.performing_radiologist_id, payload).catch(() => {});
        }
        return res.json(updated);
    } catch (error) {
        if (client && !committed) {
            try { await client.query('ROLLBACK'); } catch (_) { /* preserve original error */ }
        }
        return next(error);
    } finally {
        client?.release();
    }
};

const requestDeferredReport = (db) => async (req, res, next) => {
    let client;
    let committed = false;
    try {
        validateUUID(req.params.examId, 'examId');
        const { source = 'Reception', reason } = req.body;
        client = await db.connect();
        await client.query('BEGIN');
        const existingResult = await client.query(`
            SELECT e.*
            FROM examinations e
            WHERE e.exam_id = $1
            FOR UPDATE
        `, [req.params.examId]);
        const existing = existingResult.rows[0];
        if (!existing) throw new AppError('Examination not found', 404);

        if (['Finalized', 'Amended'].includes(existing.report_status) || existing.report_locked) {
            throw new AppError('The report is already finalized', 409, true, 'REPORT_ALREADY_FINALIZED');
        }
        if (existing.report_request_status === 'Requested' && existing.queue_stage === 'Reporting') {
            await client.query('COMMIT');
            committed = true;
            return res.json(existing);
        }
        if (!['Images Ready', 'Images Delivered'].includes(existing.queue_stage) || existing.status !== 'Completed') {
            throw new AppError('A deferred report can only be requested after an images-only examination is completed', 409, true, 'REPORT_REQUEST_NOT_AVAILABLE');
        }

        const updateResult = await client.query(`
            UPDATE examinations
            SET status = 'Reporting'::exam_status,
                queue_stage = 'Reporting',
                current_station = 'Radiologist',
                report_request_status = 'Requested',
                report_requested_at = NOW(),
                report_requested_by = $2,
                report_request_source = $3,
                reporting_started_at = NOW()
            WHERE exam_id = $1
            RETURNING *
        `, [existing.exam_id, req.user.user_id, source]);

        await client.query(`
            INSERT INTO report_request_events (
                exam_id, old_status, new_status, source, reason, changed_by
            ) VALUES ($1, $2, 'Requested', $3, $4, $5)
        `, [existing.exam_id, existing.report_request_status, source, reason || null, req.user.user_id]);
        await client.query(`
            INSERT INTO queue_events (
                exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
                event_type, reason, changed_by
            ) VALUES ($1, $2, $3, 'Reporting', $4, 'Radiologist', 'ReportRequested', $5, $6)
        `, [
            existing.exam_id,
            existing.appointment_id,
            existing.queue_stage,
            existing.current_station,
            reason || 'Deferred report requested',
            req.user.user_id
        ]);

        await markTaskAvailable(client, existing, 'Radiologist');
        await logAction(client, {
            userId: req.user.user_id,
            action: 'DEFERRED_REPORT_REQUESTED',
            resourceId: existing.exam_id,
            resourceTable: 'examinations',
            ipAddress: req.ip,
            details: { source, reason: reason || null, imagesDeliveredAt: existing.images_delivered_at || null }
        });
        await client.query('COMMIT');
        committed = true;

        const updated = updateResult.rows[0];
        publishQueueTaskChange(updated, 'REPORT_REQUESTED');
        notifyClinicalTask(db, 'Radiologist', existing.performing_radiologist_id, {
            entityType: 'Exam',
            entityId: existing.exam_id,
            channels: ['InApp'],
            priority: 'Normal',
            variables: {
                order_number: existing.order_number || '',
                from_stage: existing.queue_stage,
                to_stage: 'Reporting',
                station: 'Radiologist'
            }
        }).catch(() => {});
        return res.json(updated);
    } catch (error) {
        if (client && !committed) {
            try { await client.query('ROLLBACK'); } catch (_) { /* preserve original error */ }
        }
        return next(error);
    } finally {
        client?.release();
    }
};

const deferReportForImages = (db) => async (req, res, next) => {
    let client;
    let committed = false;
    try {
        validateUUID(req.params.examId, 'examId');
        const { reason = 'Patient requested images only without waiting for report' } = req.body || {};
        client = await db.connect();
        await client.query('BEGIN');
        const existingResult = await client.query(`
            SELECT e.*
            FROM examinations e
            WHERE e.exam_id = $1
            FOR UPDATE
        `, [req.params.examId]);
        const existing = existingResult.rows[0];
        if (!existing) throw new AppError('Examination not found', 404);

        if (['Finalized', 'Amended'].includes(existing.report_status) || existing.report_locked) {
            throw new AppError('The report is already finalized', 409, true, 'REPORT_ALREADY_FINALIZED');
        }
        if (existing.report_request_status === 'NotRequested' && existing.queue_stage === 'Images Ready') {
            await client.query('COMMIT');
            committed = true;
            return res.json(existing);
        }

        const updateResult = await client.query(`
            UPDATE examinations
            SET status = 'Completed'::exam_status,
                queue_stage = 'Images Ready',
                current_station = 'Delivery',
                report_request_status = 'NotRequested',
                report_requested_at = NULL,
                report_requested_by = NULL,
                report_request_source = 'Patient',
                images_ready_at = COALESCE(images_ready_at, NOW())
            WHERE exam_id = $1
            RETURNING *
        `, [existing.exam_id]);

        await client.query(`
            INSERT INTO report_request_events (
                exam_id, old_status, new_status, source, reason, changed_by
            ) VALUES ($1, $2, 'NotRequested', 'Patient', $3, $4)
        `, [existing.exam_id, existing.report_request_status, reason, req.user.user_id]);

        await client.query(`
            INSERT INTO queue_events (
                exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
                event_type, reason, changed_by
            ) VALUES ($1, $2, $3, 'Images Ready', $4, 'Delivery', 'ReportDeferred', $5, $6)
        `, [existing.exam_id, existing.appointment_id, existing.queue_stage, existing.current_station, reason, req.user.user_id]);

        await logAction(client, {
            userId: req.user.user_id,
            action: 'REPORT_DEFERRED_FOR_IMAGES',
            resourceId: existing.exam_id,
            resourceTable: 'examinations',
            ipAddress: req.ip,
            details: { reason, previousStage: existing.queue_stage }
        });
        await client.query('COMMIT');
        committed = true;
        const updated = updateResult.rows[0];
        publishQueueTaskChange(updated, 'REPORT_DEFERRED_FOR_IMAGES');
        return res.json(updated);
    } catch (error) {
        if (client && !committed) {
            try { await client.query('ROLLBACK'); } catch (_) {}
        }
        return next(error);
    } finally {
        client?.release();
    }
};

const rollbackQuietly = async (client) => {
    if (!client) return;
    try {
        await client.query('ROLLBACK');
    } catch {
        // Preserve the original operational error.
    }
};

const claimQueueTask = (db) => async (req, res, next) => {
    let client;
    try {
        validateUUID(req.params.examId, 'examId');
        client = await db.connect();
        await client.query('BEGIN');

        const assignment = await claimTask(client, {
            examId: req.params.examId,
            user: req.user
        });
        await logAction(client, {
            userId: req.user.user_id,
            action: 'CLINICAL_TASK_CLAIMED',
            resourceId: req.params.examId,
            resourceTable: 'examinations',
            ipAddress: req.ip,
            details: {
                taskRole: assignment.task_role,
                assignmentVersion: assignment.assignment_version
            }
        });
        await client.query('COMMIT');

        publishTaskAssignment('CLINICAL_TASK_CLAIMED', assignment);
        res.json(assignment);
    } catch (error) {
        await rollbackQuietly(client);
        next(error);
    } finally {
        client?.release();
    }
};

const assignQueueTask = (db) => async (req, res, next) => {
    let client;
    try {
        validateUUID(req.params.examId, 'examId');
        client = await db.connect();
        await client.query('BEGIN');

        const assignment = await assignTask(client, {
            examId: req.params.examId,
            targetUserId: req.body.userId,
            actor: req.user,
            reason: req.body.reason
        });
        await logAction(client, {
            userId: req.user.user_id,
            action: assignment.previous_user_id ? 'CLINICAL_TASK_TRANSFERRED' : 'CLINICAL_TASK_ASSIGNED',
            resourceId: req.params.examId,
            resourceTable: 'examinations',
            ipAddress: req.ip,
            details: {
                taskRole: assignment.task_role,
                previousUserId: assignment.previous_user_id || null,
                newUserId: assignment.assigned_user_id,
                reason: req.body.reason || null,
                assignmentVersion: assignment.assignment_version
            }
        });
        await client.query('COMMIT');

        publishTaskAssignment('CLINICAL_TASK_ASSIGNED', assignment);
        res.json(assignment);
    } catch (error) {
        await rollbackQuietly(client);
        next(error);
    } finally {
        client?.release();
    }
};

const releaseQueueTaskAssignment = (db) => async (req, res, next) => {
    let client;
    try {
        validateUUID(req.params.examId, 'examId');
        client = await db.connect();
        await client.query('BEGIN');

        const assignment = await releaseTask(client, {
            examId: req.params.examId,
            actor: req.user,
            reason: req.body.reason
        });
        await logAction(client, {
            userId: req.user.user_id,
            action: 'CLINICAL_TASK_RELEASED',
            resourceId: req.params.examId,
            resourceTable: 'examinations',
            ipAddress: req.ip,
            details: {
                taskRole: assignment.task_role,
                previousUserId: assignment.previous_user_id,
                reason: req.body.reason,
                assignmentVersion: assignment.assignment_version
            }
        });
        await client.query('COMMIT');

        publishTaskAssignment('CLINICAL_TASK_RELEASED', assignment);
        res.json(assignment);
    } catch (error) {
        await rollbackQuietly(client);
        next(error);
    } finally {
        client?.release();
    }
};

module.exports = {
    getQueue,
    transitionQueue,
    completeAcquisition,
    requestDeferredReport,
    deferReportForImages,
    claimQueueTask,
    assignQueueTask,
    releaseQueueTaskAssignment
};
