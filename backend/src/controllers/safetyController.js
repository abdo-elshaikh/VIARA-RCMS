const { getRequestQuery } = require('../utils/requestQuery');
const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');

const getSafetyTemplates = (db) => async (req, res, next) => {
    try {
        const modalityId = req.params.modalityId || getRequestQuery(req).modalityId;
        let query = 'SELECT * FROM safety_templates WHERE is_active = TRUE';
        const values = [];
        if (modalityId) {
            query += ' AND modality_id = $1';
            values.push(modalityId);
        }
        const result = await db.query(query, values);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const evaluateSafetyContraindications = (answers = {}) => {
    let hasContraindication = false;
    const reasons = [];
    let implantRisk = false;
    let pregnancyRisk = false;
    let renalRisk = false;

    if (!answers || typeof answers !== 'object') {
        return { hasContraindication, reasons, implantRisk, pregnancyRisk, renalRisk };
    }

    const checkValue = (val) => {
        if (typeof val === 'boolean') return val;
        if (typeof val === 'string') {
            const lower = val.trim().toLowerCase();
            return lower === 'true' || lower === 'yes' || lower === 'positive';
        }
        return false;
    };

    // Pacemaker / Cardiac implants
    if (checkValue(answers.pacemaker) || checkValue(answers.cardiac_pacemaker) || checkValue(answers.q1)) {
        hasContraindication = true;
        implantRisk = true;
        reasons.push('Cardiac pacemaker or active implant detected');
    }

    // Metallic implants / shrapnel / clips
    if (checkValue(answers.metallic_implants) || checkValue(answers.metal_shrapnel) || checkValue(answers.implants) || checkValue(answers.q2)) {
        hasContraindication = true;
        implantRisk = true;
        reasons.push('Metallic implants or shrapnel detected');
    }

    // Pregnancy
    if (checkValue(answers.pregnancy) || checkValue(answers.pregnant) || checkValue(answers.is_pregnant) || checkValue(answers.q3)) {
        hasContraindication = true;
        pregnancyRisk = true;
        reasons.push('Patient pregnancy reported');
    }

    // Contrast allergy
    if (checkValue(answers.contrast_allergy) || checkValue(answers.iodine_allergy)) {
        hasContraindication = true;
        reasons.push('Contrast / Iodine allergy detected');
    }

    // eGFR low renal function (< 30 ml/min is severe contraindication for contrast)
    const egfrValue = Number(answers.egfr || answers.eGFR || (typeof answers.q2 === 'number' ? answers.q2 : null));
    if (Number.isFinite(egfrValue) && egfrValue > 0 && egfrValue < 30) {
        hasContraindication = true;
        renalRisk = true;
        reasons.push(`Severely reduced eGFR (${egfrValue} ml/min) contraindicates contrast`);
    }

    // Explicit contraindication flag
    if (checkValue(answers.contraindication) || checkValue(answers.has_contraindication) || checkValue(answers.contraindicated)) {
        hasContraindication = true;
        reasons.push('Clinical contraindication explicitly flagged');
    }

    return {
        hasContraindication,
        reasons,
        holdReason: reasons.join('; '),
        implantRisk,
        pregnancyRisk,
        renalRisk
    };
};

const submitSafetyResponse = (db) => async (req, res, next) => {
    let client;
    let committed = false;
    try {
        const { examId } = req.params;
        const { templateId, answers } = req.body;
        const userId = req.user.user_id;

        // Safety screening is a write action tied to the assigned nurse or
        // technician; emergency (break-glass) elevation is read-only by design
        // and must never unlock submitting safety responses.
        client = await db.connect();
        await client.query('BEGIN');
        const examCheck = await client.query(`
            SELECT e.status, e.queue_stage
            FROM examinations e
            JOIN appointments a ON a.appointment_id = e.appointment_id
            WHERE e.exam_id = $1
              AND (
                    ($2::text = 'Nurse' AND a.nurse_id = $3::uuid)
                    OR ($2::text = 'Technician' AND a.technician_id = $3::uuid)
              )
            FOR UPDATE OF e, a
        `, [examId, req.user.role, userId]);
        if (examCheck.rows.length === 0) throw new AppError('Exam not found', 404);

        const templateCheck = await client.query(`
            SELECT 1
            FROM safety_templates st
            JOIN examinations e ON e.modality_id = st.modality_id
            WHERE st.template_id = $1 AND e.exam_id = $2 AND st.is_active = TRUE
        `, [templateId, examId]);
        if (templateCheck.rows.length === 0) throw new AppError('Safety template is not valid for this exam', 400);

        const result = await client.query(
            `INSERT INTO exam_safety_responses (exam_id, template_id, answers_json, signed_by_user_id) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [examId, templateId, JSON.stringify(answers), userId]
        );

        // Evaluate clinical safety contraindications
        const contraindication = evaluateSafetyContraindications(answers);
        if (contraindication.hasContraindication) {
            await client.query(`
                UPDATE examinations
                SET is_on_hold = TRUE,
                    hold_started_at = COALESCE(hold_started_at, NOW()),
                    hold_reason = COALESCE(hold_reason, $1),
                    implant_safety_status = CASE WHEN $2::boolean THEN 'At Risk' ELSE implant_safety_status END,
                    pregnancy_safety_status = CASE WHEN $3::boolean THEN 'At Risk' ELSE pregnancy_safety_status END,
                    renal_safety_status = CASE WHEN $4::boolean THEN 'At Risk' ELSE renal_safety_status END
                WHERE exam_id = $5
            `, [
                contraindication.holdReason || 'Clinical contraindication detected in safety questionnaire',
                contraindication.implantRisk,
                contraindication.pregnancyRisk,
                contraindication.renalRisk,
                examId
            ]);
        }

        await logAction(client, {
            userId,
            action: 'SAFETY_RESPONSE_SUBMITTED',
            resourceId: examId,
            resourceTable: 'examinations',
            ipAddress: req.ip,
            details: {
                safety_hold: contraindication.hasContraindication,
                contraindication_reasons: contraindication.reasons,
                queue_stage: examCheck.rows[0].queue_stage
            },
            required: true
        });

        await client.query('COMMIT');
        committed = true;

        if (contraindication.hasContraindication) {
            try {
                const { triggerEventForRole } = require('../services/notificationJobService');
                const notification = await triggerEventForRole(db, 'ExamStatusChanged', 'Radiologist', {
                    priority: 'Critical',
                    entityType: 'Exam',
                    entityId: examId,
                    channels: ['InApp'],
                    variables: {
                        exam_id: examId,
                        safety_hold: true,
                        reason: contraindication.holdReason || 'Clinical contraindication detected in safety questionnaire'
                    }
                });
                if (notification?.error) {
                    console.error('[SafetyController] Safety-hold notification scheduling failed:', notification.error);
                }
            } catch (notificationError) {
                console.error('[SafetyController] Safety-hold notification scheduling failed:', notificationError.message);
            }
        }

        res.status(201).json({
            message: 'Safety form submitted successfully',
            response: result.rows[0],
            contraindicationDetected: contraindication.hasContraindication,
            isOnHold: contraindication.hasContraindication,
            holdReason: contraindication.hasContraindication ? contraindication.holdReason : null
        });
    } catch (error) {
        if (client && !committed) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('[SafetyController] Safety transaction rollback failed:', rollbackError.message);
            }
        }
        next(error);
    } finally {
        client?.release();
    }
};

const getExamSafetyResponses = (db) => async (req, res, next) => {
    try {
        const { examId } = req.params;
        const result = await db.query(`
            SELECT r.*, t.name as template_name, u.full_name as signed_by
            FROM exam_safety_responses r
            JOIN safety_templates t ON r.template_id = t.template_id
            JOIN users u ON r.signed_by_user_id = u.user_id
            JOIN examinations e ON e.exam_id = r.exam_id
            JOIN appointments a ON a.appointment_id = e.appointment_id
            WHERE r.exam_id = $1
              AND (
                    $4::boolean
                    OR ($2::text = 'Radiologist' AND e.performing_radiologist_id = $3::uuid)
                    OR ($2::text = 'Nurse' AND a.nurse_id = $3::uuid)
                    OR ($2::text = 'Technician' AND a.technician_id = $3::uuid)
              )
            ORDER BY r.created_at DESC
        `, [
            examId,
            req.user.role,
            req.user.user_id,
            Boolean(req.user.emergencyAccessId
                && Array.isArray(req.user.elevatedPermissions)
                && req.user.elevatedPermissions.includes('VIEW_EXAMS')
                && Number(req.user.breakGlassExpiry) > Date.now())
        ]);
        
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getSafetyTemplates,
    submitSafetyResponse,
    getExamSafetyResponses
};
