const { AppError } = require('../middleware/errorHandler');

const getTemplates = (db) => async (req, res, next) => {
    try {
        const { modalityType, examTypeId, active = 'true' } = req.query;
        const values = [];
        let param = 1;
        let query = `
            SELECT rt.*, et.name as exam_type_name
            FROM report_templates rt
            LEFT JOIN examination_types et ON rt.exam_type_id = et.type_id
            WHERE 1=1
        `;

        if (active) {
            query += ` AND rt.is_active = $${param++}`;
            values.push(active === 'true');
        }

        if (modalityType) {
            query += ` AND (
                LOWER(REPLACE(REPLACE(rt.modality_type, '-', ''), ' ', '')) = LOWER(REPLACE(REPLACE($${param}, '-', ''), ' ', ''))
                OR rt.modality_type IS NULL
            )`;
            values.push(modalityType);
            param++;
        }

        if (examTypeId) {
            query += ` AND (rt.exam_type_id = $${param} OR rt.exam_type_id IS NULL)`;
            values.push(examTypeId);
            param++;
        }

        query += ' ORDER BY rt.is_default DESC, rt.updated_at DESC, rt.name ASC';
        const result = await db.query(query, values);
        res.json(result.rows);
    } catch (error) {
        next(error);
    }
};

const createTemplate = (db) => async (req, res, next) => {
    try {
        const data = req.body;
        const result = await db.query(`
            INSERT INTO report_templates (
                name, modality_type, exam_type_id, clinical_history, technique, findings,
                impression, recommendations, is_default, is_active, created_by, updated_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
            RETURNING *
        `, [
            data.name,
            data.modalityType || null,
            data.examTypeId || null,
            data.clinicalHistory || null,
            data.technique || null,
            data.findings || null,
            data.impression || null,
            data.recommendations || null,
            data.isDefault || false,
            data.isActive ?? true,
            req.user.user_id
        ]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const updateTemplate = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const existing = await db.query('SELECT * FROM report_templates WHERE template_id = $1', [id]);
        if (existing.rows.length === 0) {
            return next(new AppError('Report template not found', 404));
        }

        const current = existing.rows[0];
        const data = req.body;
        const result = await db.query(`
            UPDATE report_templates
            SET name = $1,
                modality_type = $2,
                exam_type_id = $3,
                clinical_history = $4,
                technique = $5,
                findings = $6,
                impression = $7,
                recommendations = $8,
                is_default = $9,
                is_active = $10,
                version = version + 1,
                updated_by = $11,
                updated_at = NOW()
            WHERE template_id = $12
            RETURNING *
        `, [
            data.name ?? current.name,
            data.modalityType ?? current.modality_type,
            data.examTypeId ?? current.exam_type_id,
            data.clinicalHistory ?? current.clinical_history,
            data.technique ?? current.technique,
            data.findings ?? current.findings,
            data.impression ?? current.impression,
            data.recommendations ?? current.recommendations,
            data.isDefault ?? current.is_default,
            data.isActive ?? current.is_active,
            req.user.user_id,
            id
        ]);

        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const deleteTemplate = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            UPDATE report_templates
            SET is_active = FALSE, updated_by = $1, updated_at = NOW()
            WHERE template_id = $2
            RETURNING *
        `, [req.user.user_id, req.params.id]);

        if (result.rows.length === 0) {
            return next(new AppError('Report template not found', 404));
        }

        res.json(result.rows[0]);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate
};
