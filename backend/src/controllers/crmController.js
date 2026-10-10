const { getRequestQuery } = require('../utils/requestQuery');
const { z } = require('zod');
const { AppError } = require('../middleware/errorHandler');
const { scheduleJob, triggerEvent, triggerEventForRole } = require('../services/notificationJobService');
const { decrypt } = require('../utils/crypto');
const {
    createCrmActivitySchema, updateCrmActivitySchema, createRecallTaskSchema,
    createSegmentSchema, addSegmentMemberSchema,
    createCampaignSchema, updateCampaignStatusSchema,
    submitFeedbackSchema, updateLoyaltySchema
} = require('../schemas/crmSchema');
const {
    awardPoints,
    getLoyaltyHistory: fetchLoyaltyHistory
} = require('../services/loyaltyRewardService');

const mapPatientDetails = (row) => {
    const mapped = {
        ...row,
        patient_name: [decrypt(row.patient_first_name_enc), decrypt(row.patient_last_name_enc)]
            .filter(Boolean)
            .join(' '),
        patient_phone: decrypt(row.patient_phone_enc)
    };

    delete mapped.patient_first_name_enc;
    delete mapped.patient_last_name_enc;
    delete mapped.patient_phone_enc;
    delete mapped.first_name_enc;
    delete mapped.last_name_enc;
    delete mapped.phone_enc;
    return mapped;
};

const MARKETING_CHANNEL_CONSENT = {
    Email: 'consent_email',
    SMS: 'consent_sms',
    WhatsApp: 'consent_whatsapp'
};

const MARKETING_CHANNEL_PREF = {
    Email: 'email_enabled',
    SMS: 'sms_enabled',
    WhatsApp: 'whatsapp_enabled'
};

const getCampaignScheduleDate = (campaign) => {
    if (!campaign.start_date) return new Date();
    const start = new Date(campaign.start_date);
    if (Number.isNaN(start.getTime())) return new Date();
    return start > new Date() ? start : new Date();
};

const assertMarketingTemplate = async (db, channel) => {
    const result = await db.query(`
        SELECT template_id
        FROM notification_templates
        WHERE event_type = 'MarketingCampaign'
          AND channel = $1
          AND is_active = TRUE
        LIMIT 1
    `, [channel]);
    if (!result.rows.length) {
        throw new AppError(`No active MarketingCampaign template exists for ${channel}`, 400);
    }
};

const getMarketingAudience = async (db, campaign) => {
    const consentColumn = MARKETING_CHANNEL_CONSENT[campaign.channel];
    const prefColumn = MARKETING_CHANNEL_PREF[campaign.channel];
    if (!consentColumn || !prefColumn) throw new AppError('Unsupported campaign channel', 400);

    const values = [];
    const segmentJoin = campaign.target_segment
        ? 'JOIN patient_segment_members m ON m.patient_id = p.patient_id'
        : '';
    const segmentFilter = campaign.target_segment
        ? `AND m.segment_id = $${values.push(campaign.target_segment)}`
        : '';

    const result = await db.query(`
        SELECT DISTINCT p.patient_id, p.first_name_enc, p.last_name_enc
        FROM patients p
        ${segmentJoin}
        LEFT JOIN notification_preferences np ON np.patient_id = p.patient_id
        WHERE COALESCE(p.patient_status, 'Active') = 'Active'
          ${segmentFilter}
          AND COALESCE(p.consent_marketing, p.opt_in_marketing, FALSE) = TRUE
          AND (p.${consentColumn} = TRUE OR COALESCE(p.consent_marketing, p.opt_in_marketing, FALSE) = TRUE)
          AND COALESCE(np.notify_marketing, TRUE) = TRUE
          AND COALESCE(np.${prefColumn}, TRUE) = TRUE
        ORDER BY p.patient_id
    `, values);

    return result.rows;
};

// ─── CRM Activities ───────────────────────────────────────────────────────────

const getCrmActivities = (db) => async (req, res, next) => {
    try {
        const { patientId, assignedTo, status } = getRequestQuery(req);
        let query = `
            SELECT a.*,
                   p.first_name_enc AS patient_first_name_enc,
                   p.last_name_enc AS patient_last_name_enc,
                   p.phone_enc AS patient_phone_enc,
                   u.full_name AS assignee_name
            FROM crm_activities a
            JOIN patients p ON a.patient_id = p.patient_id
            LEFT JOIN users u ON a.assigned_to = u.user_id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (patientId) {
            query += ` AND a.patient_id = $${paramCount++}`;
            params.push(patientId);
        }
        if (assignedTo) {
            query += ` AND a.assigned_to = $${paramCount++}`;
            params.push(assignedTo);
        }
        if (status) {
            query += ` AND a.status = $${paramCount++}`;
            params.push(status);
        }

        query += ` ORDER BY COALESCE(a.due_date, a.created_at) ASC`;
        const result = await db.query(query, params);
        res.json(result.rows.map(mapPatientDetails));
    } catch (error) {
        next(error);
    }
};

const createCrmActivity = (db) => async (req, res, next) => {
    try {
        const data = createCrmActivitySchema.parse(req.body);
        const result = await db.query(`
            INSERT INTO crm_activities (patient_id, assigned_to, activity_type, due_date, notes)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [data.patientId, data.assignedTo, data.activityType, data.dueDate, data.notes]);
        const activity = result.rows[0];

        if (data.activityType === 'Patient Reminder' && data.dueDate) {
            const contextResult = await db.query(`
                SELECT p.first_name_enc, p.last_name_enc,
                       latest.order_number, latest.exam_type
                FROM patients p
                LEFT JOIN LATERAL (
                    SELECT a.order_number, et.name AS exam_type
                    FROM appointments a
                    LEFT JOIN examination_types et ON et.type_id = a.exam_type_id
                    WHERE a.patient_id = p.patient_id
                    ORDER BY a.start_time DESC
                    LIMIT 1
                ) latest ON TRUE
                WHERE p.patient_id = $1
            `, [data.patientId]);
            const patient = contextResult.rows[0];

            if (patient) {
                await triggerEvent(db, 'FollowUpReminder', {
                    patientId: data.patientId,
                    entityType: 'CrmActivity',
                    entityId: activity.activity_id,
                    channels: ['Email', 'SMS'],
                    scheduledFor: data.dueDate,
                    variables: {
                        patient_name: [decrypt(patient.first_name_enc), decrypt(patient.last_name_enc)].filter(Boolean).join(' '),
                        exam_type: patient.exam_type || 'Radiology follow-up',
                        order_number: patient.order_number || 'N/A'
                    }
                });
            }
        }

        res.status(201).json(activity);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const updateCrmActivity = (db) => async (req, res, next) => {
    let client;
    try {
        const { id } = req.params;
        const data = updateCrmActivitySchema.parse(req.body);
        client = await db.connect();
        await client.query('BEGIN');
        const existingResult = await client.query(
            'SELECT * FROM crm_activities WHERE activity_id = $1 FOR UPDATE',
            [id]
        );
        if (!existingResult.rows[0]) throw new AppError('Activity not found', 404);
        const existing = existingResult.rows[0];
        if (data.status && data.status !== existing.status) {
            const allowedTransitions = { Pending: ['Completed', 'Cancelled'] };
            if (!(allowedTransitions[existing.status] || []).includes(data.status)) {
                throw new AppError(`Invalid CRM activity transition from ${existing.status} to ${data.status}`, 409);
            }
        }
        if (data.dueDate && existing.status !== 'Pending') {
            throw new AppError('Only pending activities can be rescheduled', 409);
        }

        let query = 'UPDATE crm_activities SET updated_at = CURRENT_TIMESTAMP';
        const params = [];
        let paramCount = 1;

        if (data.status) {
            query += `, status = $${paramCount++}`;
            params.push(data.status);
            if (data.status === 'Completed') query += `, completed_at = CURRENT_TIMESTAMP`;
        }
        if (data.notes !== undefined) {
            query += `, notes = COALESCE($${paramCount++}, notes)`;
            params.push(data.notes);
        }
        if (data.dueDate) {
            query += `, due_date = $${paramCount++}`;
            params.push(data.dueDate);
        }

        query += ` WHERE activity_id = $${paramCount} RETURNING *`;
        params.push(id);

        const result = await client.query(query, params);
        if (result.rows.length === 0) return next(new AppError('Activity not found', 404));
        const activity = result.rows[0];

        if (data.status === 'Completed' || data.status === 'Cancelled') {
            await client.query(`
                UPDATE notification_jobs
                SET status = 'Cancelled', processed_at = NOW()
                WHERE entity_type = 'CrmActivity'
                  AND entity_id = $1
                  AND event_type = 'FollowUpReminder'
                  AND status = 'Pending'
            `, [activity.activity_id]);
        } else if (data.dueDate) {
            await client.query(`
                UPDATE notification_jobs
                SET scheduled_for = $1
                WHERE entity_type = 'CrmActivity'
                  AND entity_id = $2
                  AND event_type = 'FollowUpReminder'
                  AND status = 'Pending'
            `, [data.dueDate, activity.activity_id]);
        }

        await client.query('COMMIT');
        res.json(activity);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        if (client) client.release();
    }
};

// ─── Patient Segments ─────────────────────────────────────────────────────────

const getSegments = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT s.*, u.full_name as creator_name,
                   (SELECT COUNT(*) FROM patient_segment_members m WHERE m.segment_id = s.segment_id) as member_count
            FROM patient_segments s
            LEFT JOIN users u ON s.created_by = u.user_id
            ORDER BY s.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createSegment = (db) => async (req, res, next) => {
    try {
        const data = createSegmentSchema.parse(req.body);
        const userId = req.user.user_id;

        const result = await db.query(`
            INSERT INTO patient_segments (name, description, created_by)
            VALUES ($1, $2, $3) RETURNING *
        `, [data.name, data.description, userId]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const addSegmentMember = (db) => async (req, res, next) => {
    try {
        const { segmentId } = req.params;
        const { patientId } = addSegmentMemberSchema.parse(req.body);

        await db.query(`
            INSERT INTO patient_segment_members (segment_id, patient_id)
            VALUES ($1, $2) ON CONFLICT DO NOTHING
        `, [segmentId, patientId]);
        res.status(201).json({ message: 'Patient added to segment' });
    } catch (error) {
        next(error);
    }
};

// ─── Marketing Campaigns ──────────────────────────────────────────────────────

const getCampaigns = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT c.*,
                   s.name as segment_name,
                   u.full_name as creator_name,
                   COUNT(r.campaign_recipient_id)::int AS recipient_count,
                   COUNT(r.campaign_recipient_id) FILTER (WHERE r.status = 'Queued')::int AS queued_count,
                   COUNT(r.campaign_recipient_id) FILTER (WHERE r.status = 'Sent')::int AS sent_count,
                   COUNT(r.campaign_recipient_id) FILTER (WHERE r.status = 'Failed')::int AS failed_count,
                   COUNT(r.campaign_recipient_id) FILTER (WHERE r.status = 'Skipped')::int AS skipped_count
            FROM marketing_campaigns c
            LEFT JOIN patient_segments s ON c.target_segment = s.segment_id
            LEFT JOIN users u ON c.created_by = u.user_id
            LEFT JOIN marketing_campaign_recipients r ON r.campaign_id = c.campaign_id
            GROUP BY c.campaign_id, s.name, u.full_name
            ORDER BY c.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createCampaign = (db) => async (req, res, next) => {
    try {
        const data = createCampaignSchema.parse(req.body);
        const userId = req.user.user_id;

        const result = await db.query(`
            INSERT INTO marketing_campaigns (
                name, message_subject, message_body, target_segment,
                channel, budget, start_date, end_date, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
        `, [
            data.name,
            data.messageSubject?.trim() || null,
            data.messageBody.trim(),
            data.targetSegment,
            data.channel,
            data.budget || 0,
            data.startDate,
            data.endDate,
            userId
        ]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const updateCampaignStatus = (db) => async (req, res, next) => {
    const client = await db.connect();
    try {
        const { id } = req.params;
        const { status } = updateCampaignStatusSchema.parse(req.body);

        await client.query('BEGIN');

        const existingResult = await client.query('SELECT * FROM marketing_campaigns WHERE campaign_id = $1 FOR UPDATE', [id]);
        if (existingResult.rows.length === 0) throw new AppError('Campaign not found', 404);

        const existing = existingResult.rows[0];
        if (existing.status === status) {
            await client.query('COMMIT');
            return res.json({ ...existing, audience_count: 0, scheduled_count: 0, duplicate_count: 0 });
        }

        const allowedTransitions = {
            Draft: ['Active', 'Cancelled'],
            Active: ['Completed', 'Cancelled']
        };
        if (!(allowedTransitions[existing.status] || []).includes(status)) {
            throw new AppError(`Invalid campaign transition from ${existing.status} to ${status}`, 409);
        }

        if (status === 'Completed') {
            const queued = await client.query(`
                SELECT 1
                FROM marketing_campaign_recipients
                WHERE campaign_id = $1 AND status = 'Queued'
                LIMIT 1
            `, [id]);
            if (queued.rows.length) throw new AppError('A campaign with queued recipients cannot be completed', 409);
        }

        if (status === 'Active' && existing.end_date) {
            const endDate = new Date(existing.end_date);
            endDate.setHours(23, 59, 59, 999);
            if (endDate < new Date()) throw new AppError('Campaign end date has already passed', 400);
        }

        let audienceCount = 0;
        let scheduledCount = 0;
        let duplicateCount = 0;

        if (status === 'Active') {
            await assertMarketingTemplate(client, existing.channel);
            const members = await getMarketingAudience(client, existing);
            audienceCount = members.length;
            if (!audienceCount) throw new AppError('No eligible opted-in patients found for this campaign audience and channel', 400);

            const scheduledFor = getCampaignScheduleDate(existing);
            const centerResult = await client.query('SELECT center_name FROM center_settings LIMIT 1');
            const centerName = centerResult.rows[0]?.center_name || 'VIARA';

            for (const member of members) {
                const recipientResult = await client.query(`
                    INSERT INTO marketing_campaign_recipients (
                        campaign_id, patient_id, channel, status, scheduled_for
                    )
                    VALUES ($1, $2, $3, 'Queued', $4)
                    ON CONFLICT (campaign_id, patient_id, channel) DO NOTHING
                    RETURNING campaign_recipient_id
                `, [existing.campaign_id, member.patient_id, existing.channel, scheduledFor]);

                if (!recipientResult.rows.length) {
                    duplicateCount += 1;
                    continue;
                }

                const job = await scheduleJob(client, {
                    eventType: 'MarketingCampaign',
                    channel: existing.channel,
                    recipientType: 'Patient',
                    recipientId: member.patient_id,
                    entityType: 'Campaign',
                    entityId: existing.campaign_id,
                    variables: {
                        patient_name: [decrypt(member.first_name_enc), decrypt(member.last_name_enc)].filter(Boolean).join(' ') || 'Patient',
                        center_name: centerName,
                        campaign_subject: existing.message_subject || existing.name,
                        campaign_message: existing.message_body || existing.name,
                        unsubscribe_text: 'Reply STOP to unsubscribe from marketing messages.'
                    },
                    scheduledFor,
                    throwOnError: true
                });

                await client.query(`
                    UPDATE marketing_campaign_recipients
                    SET job_id = $1, updated_at = NOW()
                    WHERE campaign_recipient_id = $2
                `, [job.job_id, recipientResult.rows[0].campaign_recipient_id]);
                scheduledCount += 1;
            }
        }

        const result = await client.query(`
            UPDATE marketing_campaigns SET status = $1, updated_at = CURRENT_TIMESTAMP
            WHERE campaign_id = $2 RETURNING *
        `, [status, id]);

        if (status === 'Cancelled') {
            await client.query(`
                UPDATE notification_jobs
                SET status = 'Cancelled', processed_at = NOW(), error_message = COALESCE(error_message, 'Campaign cancelled')
                WHERE event_type = 'MarketingCampaign'
                  AND entity_type = 'Campaign'
                  AND entity_id = $1
                  AND status IN ('Pending', 'Processing')
            `, [id]);
            await client.query(`
                UPDATE marketing_campaign_recipients
                SET status = 'Cancelled', updated_at = NOW()
                WHERE campaign_id = $1
                  AND status = 'Queued'
            `, [id]);
        }

        await client.query('COMMIT');
        res.json({ ...result.rows[0], audience_count: audienceCount, scheduled_count: scheduledCount, duplicate_count: duplicateCount });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    } finally {
        client.release();
    }
};

// ─── Patient Feedback & Loyalty ───────────────────────────────────────────────

const submitFeedback = (db) => async (req, res, next) => {
    try {
        const data = submitFeedbackSchema.parse(req.body);
        if (req.user.role === 'Patient' && req.user.userId !== data.patientId) {
            return next(new AppError('Patients can only submit feedback for their own profile', 403));
        }
        const result = await db.query(`
            INSERT INTO patient_feedback (patient_id, rating, comments, source)
            VALUES ($1, $2, $3, $4) RETURNING *
        `, [data.patientId, data.rating, data.comments, data.source || 'Portal']);
        const feedback = result.rows[0];

        // 1. Negative Feedback Auto-Escalation (Rating <= 2)
        if (data.rating <= 2) {
            const staffResult = await db.query(`
                SELECT user_id FROM users
                WHERE role IN ('Receptionist', 'Admin') AND status = 'Active'
                ORDER BY (role = 'Admin') DESC, created_at ASC
                LIMIT 1
            `);
            const assigneeId = staffResult.rows[0]?.user_id || null;

            const escalationNote = `⚠️ تصعيد عاجل: تقييم سلبي (${data.rating}/5) عبر ${data.source || 'Portal'}. تعليق المريض: "${data.comments || 'لا يوجد تعليق مضاف'}". يرجى التواصل الفوري لاحتواء الشكوى.`;

            await db.query(`
                INSERT INTO crm_activities (patient_id, assigned_to, activity_type, due_date, notes, status)
                VALUES ($1, $2, 'Feedback Follow-up', NOW() + INTERVAL '2 hours', $3, 'Pending')
            `, [data.patientId, assigneeId, escalationNote]);

            // Notify Receptionists and Admins of critical feedback
            triggerEventForRole(db, 'NegativeFeedbackAlert', 'Receptionist', {
                priority: 'Critical',
                patientId: data.patientId,
                variables: {
                    rating: data.rating,
                    comments: data.comments || 'No comment provided',
                    source: data.source || 'Portal'
                }
            }).catch(() => {});

            triggerEventForRole(db, 'NegativeFeedbackAlert', 'Admin', {
                priority: 'Critical',
                patientId: data.patientId,
                variables: {
                    rating: data.rating,
                    comments: data.comments || 'No comment provided',
                    source: data.source || 'Portal'
                }
            }).catch(() => {});
        }

        // 2. High CSAT Reward (Rating === 5)
        if (data.rating === 5) {
            await awardPoints(db, {
                patientId: data.patientId,
                points: 20,
                reasonCode: 'FIVE_STAR_FEEDBACK',
                description: 'مكافأة تقييم تجربة المريض 5 نجوم (+20 نقطة)'
            });
        }

        res.status(201).json({
            ...feedback,
            escalated: data.rating <= 2,
            rewarded_points: data.rating === 5 ? 20 : 0
        });
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const getFeedback = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT f.*,
                   p.first_name_enc AS patient_first_name_enc,
                   p.last_name_enc AS patient_last_name_enc,
                   p.phone_enc AS patient_phone_enc
            FROM patient_feedback f
            JOIN patients p ON f.patient_id = p.patient_id
            ORDER BY f.created_at DESC
        `);
        res.json(result.rows.map(mapPatientDetails));
    } catch (error) {
        next(error);
    }
};

const updateLoyaltyPoints = (db) => async (req, res, next) => {
    try {
        const { patientId } = req.params;
        const data = updateLoyaltySchema.parse(req.body);

        const rewardRes = await awardPoints(db, {
            patientId,
            points: data.points,
            reasonCode: data.reasonCode || (data.points > 0 ? 'MANUAL_REWARD' : 'REDEMPTION'),
            description: data.description || (data.points > 0 ? 'مكافأة ولاء تقديرية من المركز' : 'استبدال نقاط ولاء'),
            performedBy: req.user.user_id
        });

        if (!rewardRes.success) {
            return next(new AppError(rewardRes.reason || 'Failed to update loyalty points', 400));
        }

        res.json(rewardRes);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

const getLoyaltyHistory = (db) => async (req, res, next) => {
    try {
        const { patientId } = req.params;
        const history = await fetchLoyaltyHistory(db, patientId);
        res.json(history);
    } catch (error) {
        next(error);
    }
};

const getDueRecalls = (db) => async (req, res, next) => {
    try {
        const { modality, limit = 50 } = getRequestQuery(req);
        let query = `
            WITH latest_exams AS (
                SELECT DISTINCT ON (e.patient_id)
                    e.exam_id,
                    e.patient_id,
                    e.appointment_id,
                    e.exam_type_id,
                    e.modality_id,
                    e.is_follow_up,
                    e.follow_up_reason,
                    COALESCE(e.delivered_at, e.created_at) AS last_exam_date,
                    m.name AS modality_name,
                    et.name AS exam_type_name
                FROM examinations e
                JOIN modalities m ON e.modality_id = m.modality_id
                LEFT JOIN examination_types et ON e.exam_type_id = et.type_id
                WHERE e.status = 'Completed'
                  AND (
                      m.name ILIKE '%mammo%'
                      OR m.name ILIKE '%dexa%'
                      OR m.name ILIKE '%bone%'
                      OR e.is_follow_up = TRUE
                  )
                ORDER BY e.patient_id, COALESCE(e.delivered_at, e.created_at) DESC
            )
            SELECT le.*,
                   p.mrn,
                   p.first_name_enc,
                   p.last_name_enc,
                   p.phone_enc,
                   p.loyalty_points,
                   EXTRACT(DAY FROM (NOW() - le.last_exam_date))::int AS days_since_exam,
                   CASE
                       WHEN le.modality_name ILIKE '%mammo%' AND le.is_follow_up THEN 'Mammography 6-Month Protocol (BI-RADS 3)'
                       WHEN le.modality_name ILIKE '%mammo%' THEN 'Annual Screening Mammography'
                       WHEN le.modality_name ILIKE '%dexa%' OR le.modality_name ILIKE '%bone%' THEN 'Annual DEXA Bone Density Screening'
                       ELSE 'Clinical Follow-up Protocol'
                   END AS recall_protocol,
                   CASE
                       WHEN le.modality_name ILIKE '%mammo%' AND le.is_follow_up THEN 180
                       WHEN le.modality_name ILIKE '%mammo%' THEN 365
                       WHEN le.modality_name ILIKE '%dexa%' OR le.modality_name ILIKE '%bone%' THEN 365
                       ELSE 90
                   END AS threshold_days,
                   ca.activity_id AS existing_task_id,
                   ca.status AS existing_task_status
            FROM latest_exams le
            JOIN patients p ON le.patient_id = p.patient_id
            LEFT JOIN crm_activities ca ON ca.patient_id = le.patient_id 
                                       AND ca.activity_type = 'Clinical Recall'
                                       AND ca.status = 'Pending'
            WHERE (
                (le.modality_name ILIKE '%mammo%' AND le.is_follow_up AND le.last_exam_date <= NOW() - INTERVAL '180 days')
                OR (le.modality_name ILIKE '%mammo%' AND NOT le.is_follow_up AND le.last_exam_date <= NOW() - INTERVAL '365 days')
                OR ((le.modality_name ILIKE '%dexa%' OR le.modality_name ILIKE '%bone%') AND le.last_exam_date <= NOW() - INTERVAL '365 days')
                OR (le.is_follow_up AND le.last_exam_date <= NOW() - INTERVAL '90 days')
            )
            AND NOT EXISTS (
                SELECT 1 FROM appointments a2
                WHERE a2.patient_id = le.patient_id
                  AND a2.start_time >= NOW()
                  AND a2.status NOT IN ('Cancelled', 'No-show')
            )
        `;
        const params = [];
        if (modality) {
            params.push(`%${modality}%`);
            query += ` AND le.modality_name ILIKE $${params.length}`;
        }
        query += ` ORDER BY days_since_exam DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await db.query(query, params);
        res.json(result.rows.map(mapPatientDetails));
    } catch (error) {
        next(error);
    }
};

const createRecallTask = (db) => async (req, res, next) => {
    try {
        const data = createRecallTaskSchema.parse(req.body);
        const dueDate = data.dueDate ? new Date(data.dueDate) : new Date(Date.now() + 48 * 60 * 60 * 1000);
        const modality = data.modalityName || 'الفحص الدوري';
        const notes = data.notes || `استدعاء سريري ومتابعة وقائية دورية لفحص ${modality}. المريض مستحق للمتابعة.`;

        const result = await db.query(`
            INSERT INTO crm_activities (patient_id, assigned_to, activity_type, due_date, notes)
            VALUES ($1, $2, 'Clinical Recall', $3, $4)
            RETURNING *
        `, [data.patientId, req.user.user_id, dueDate, notes]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error instanceof z.ZodError) return next(new AppError(`Validation Error: ${JSON.stringify(error.errors)}`, 400));
        next(error);
    }
};

module.exports = {
    getMarketingAudience,
    getCrmActivities, createCrmActivity, updateCrmActivity,
    getSegments, createSegment, addSegmentMember,
    getCampaigns, createCampaign, updateCampaignStatus,
    submitFeedback, getFeedback, updateLoyaltyPoints,
    getLoyaltyHistory, getDueRecalls, createRecallTask
};
