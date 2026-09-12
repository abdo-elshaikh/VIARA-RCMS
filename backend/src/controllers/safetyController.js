const { AppError } = require('../middleware/errorHandler');

const getSafetyTemplates = (db) => async (req, res, next) => {
    try {
        const { modalityId } = req.params;
        const result = await db.query(
            'SELECT * FROM safety_templates WHERE modality_id = $1 AND is_active = TRUE',
            [modalityId]
        );
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const submitSafetyResponse = (db) => async (req, res, next) => {
    try {
        const { examId } = req.params;
        const { templateId, answers } = req.body;
        const userId = req.user.user_id;

        // Safety screening is a write action tied to the assigned nurse or
        // technician; emergency (break-glass) elevation is read-only by design
        // and must never unlock submitting safety responses.
        const examCheck = await db.query(`
            SELECT e.status
            FROM examinations e
            JOIN appointments a ON a.appointment_id = e.appointment_id
            WHERE e.exam_id = $1
              AND (
                    ($2::text = 'Nurse' AND a.nurse_id = $3::uuid)
                    OR ($2::text = 'Technician' AND a.technician_id = $3::uuid)
              )
        `, [examId, req.user.role, userId]);
        if (examCheck.rows.length === 0) return next(new AppError('Exam not found', 404));

        const templateCheck = await db.query(`
            SELECT 1
            FROM safety_templates st
            JOIN examinations e ON e.modality_id = st.modality_id
            WHERE st.template_id = $1 AND e.exam_id = $2 AND st.is_active = TRUE
        `, [templateId, examId]);
        if (templateCheck.rows.length === 0) {
            return next(new AppError('Safety template is not valid for this exam', 400));
        }

        // Insert safety response
        const result = await db.query(
            `INSERT INTO exam_safety_responses (exam_id, template_id, answers_json, signed_by_user_id) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [examId, templateId, JSON.stringify(answers), userId]
        );

        res.status(201).json({ message: 'Safety form submitted successfully', response: result.rows[0] });
    } catch (error) {
        next(error);
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
