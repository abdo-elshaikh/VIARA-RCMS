const { AppError } = require('../middleware/errorHandler');
const { logAction } = require('../services/auditService');

const sanitizeReferringDoctor = (doc) => {
    if (!doc) return doc;
    const sanitized = { ...doc };
    delete sanitized.portal_password_hash;
    return sanitized;
};

const getReferringDoctors = (db) => async (req, res, next) => {
    try {
        const { active, limit = 200, offset = 0 } = req.query;
        const search = req.query.search || req.query.q;
        const values = [];
        let param = 1;

        let query = `
            SELECT rd.doctor_id, rd.full_name, rd.specialty, rd.clinic_hospital,
                   rd.phone, rd.email, rd.address, rd.tax_id, rd.contract_id,
                   rd.referral_source_category, rd.commission_percentage,
                   rd.preferred_contact_method, rd.is_active, rd.notes,
                   rd.created_by, rd.created_at, rd.updated_at,
                   rd.portal_is_active, rd.portal_last_login,
                   COUNT(DISTINCT a.appointment_id) as appointment_count,
                   COUNT(DISTINCT e.exam_id) as exam_count,
                   COALESCE(SUM(i.subtotal_amount - i.discount_amount), 0)
                     - COALESCE((SELECT SUM(c.net_amount)
                                 FROM credit_notes c
                                 JOIN invoices ci ON ci.invoice_id = c.invoice_id
                                 JOIN examinations ce ON ce.exam_id = ci.exam_id
                                 JOIN appointments ca ON ca.appointment_id = ce.appointment_id
                                 WHERE ca.referring_doctor_id = rd.doctor_id AND c.reversed_at IS NULL), 0) AS total_revenue,
                   (COALESCE(SUM(i.subtotal_amount - i.discount_amount), 0)
                     - COALESCE((SELECT SUM(c.net_amount)
                                 FROM credit_notes c
                                 JOIN invoices ci ON ci.invoice_id = c.invoice_id
                                 JOIN examinations ce ON ce.exam_id = ci.exam_id
                                 JOIN appointments ca ON ca.appointment_id = ce.appointment_id
                                 WHERE ca.referring_doctor_id = rd.doctor_id AND c.reversed_at IS NULL), 0))
                     * rd.commission_percentage / 100.0 AS commission_est
            FROM referring_doctors rd
            LEFT JOIN appointments a ON a.referring_doctor_id = rd.doctor_id
            LEFT JOIN examinations e ON e.appointment_id = a.appointment_id
            LEFT JOIN invoices i ON i.exam_id = e.exam_id AND i.invoice_status <> 'Voided'
            WHERE 1=1
        `;

        if (search) {
            query += ` AND (rd.full_name ILIKE $${param} OR rd.specialty ILIKE $${param} OR rd.clinic_hospital ILIKE $${param} OR rd.phone ILIKE $${param} OR rd.email ILIKE $${param})`;
            values.push(`%${search}%`);
            param++;
        }

        if (active) {
            query += ` AND rd.is_active = $${param}`;
            values.push(active === 'true');
            param++;
        }

        query += `
            GROUP BY rd.doctor_id
            ORDER BY rd.full_name ASC
            LIMIT $${param++} OFFSET $${param}
        `;
        values.push(limit, offset);

        const result = await db.query(query, values);
        res.json(result.rows.map(sanitizeReferringDoctor));
    } catch (error) {
        next(error);
    }
};

const createReferringDoctor = (db) => async (req, res, next) => {
    try {
        const data = req.body;

        const result = await db.query(`
            INSERT INTO referring_doctors (
                full_name, specialty, clinic_hospital, phone, email, address, tax_id,
                contract_id, referral_source_category, commission_percentage, preferred_contact_method, notes, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `, [
            data.fullName,
            data.specialty || null,
            data.clinicHospital || null,
            data.phone || null,
            data.email ? data.email.trim().toLowerCase() : null,
            data.address || null,
            data.taxId || null,
            data.contractId || null,
            data.referralSourceCategory || 'Doctor',
            data.commissionPercentage || 0,
            data.preferredContactMethod || 'Email',
            data.notes || null,
            req.user.user_id
        ]);

        res.status(201).json(sanitizeReferringDoctor(result.rows[0]));
    } catch (error) {
        next(error);
    }
};

const updateReferringDoctor = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const existingResult = await db.query('SELECT * FROM referring_doctors WHERE doctor_id = $1', [id]);
        if (existingResult.rows.length === 0) {
            return next(new AppError('Referring doctor not found', 404));
        }

        const existing = existingResult.rows[0];
        const nextDoctor = {
            full_name: data.fullName ?? existing.full_name,
            specialty: data.specialty !== undefined ? data.specialty : existing.specialty,
            clinic_hospital: data.clinicHospital !== undefined ? data.clinicHospital : existing.clinic_hospital,
            phone: data.phone !== undefined ? data.phone : existing.phone,
            email: data.email !== undefined ? (data.email ? data.email.trim().toLowerCase() : null) : existing.email,
            address: data.address !== undefined ? data.address : existing.address,
            tax_id: data.taxId !== undefined ? data.taxId : existing.tax_id,
            contract_id: data.contractId !== undefined ? data.contractId : existing.contract_id,
            referral_source_category: data.referralSourceCategory !== undefined ? data.referralSourceCategory : existing.referral_source_category,
            commission_percentage: data.commissionPercentage !== undefined ? data.commissionPercentage : existing.commission_percentage,
            preferred_contact_method: data.preferredContactMethod ?? existing.preferred_contact_method,
            is_active: data.isActive !== undefined ? data.isActive : existing.is_active,
            notes: data.notes !== undefined ? data.notes : existing.notes
        };

        const result = await db.query(`
            UPDATE referring_doctors
            SET full_name = $1,
                specialty = $2,
                clinic_hospital = $3,
                phone = $4,
                email = $5,
                address = $6,
                tax_id = $7,
                contract_id = $8,
                referral_source_category = $9,
                commission_percentage = $10,
                preferred_contact_method = $11,
                is_active = $12,
                notes = $13,
                updated_at = NOW()
            WHERE doctor_id = $14
            RETURNING *
        `, [
            nextDoctor.full_name,
            nextDoctor.specialty,
            nextDoctor.clinic_hospital,
            nextDoctor.phone,
            nextDoctor.email,
            nextDoctor.address,
            nextDoctor.tax_id,
            nextDoctor.contract_id,
            nextDoctor.referral_source_category,
            nextDoctor.commission_percentage,
            nextDoctor.preferred_contact_method,
            nextDoctor.is_active,
            nextDoctor.notes,
            id
        ]);

        res.json(sanitizeReferringDoctor(result.rows[0]));
    } catch (error) {
        next(error);
    }
};

const deleteReferringDoctor = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const result = await db.query(`
            UPDATE referring_doctors
            SET is_active = false,
                updated_at = NOW()
            WHERE doctor_id = $1
            RETURNING doctor_id
        `, [id]);

        if (result.rows.length === 0) {
            return next(new AppError('Referring doctor not found', 404));
        }

        await logAction(db, {
            userId: req.user.user_id,
            action: 'REFERRING_DOCTOR_DEACTIVATED',
            resourceId: id,
            resourceTable: 'referring_doctors',
            ipAddress: req.ip,
            details: { reason: 'Doctor deactivated' }
        });

        res.status(204).send();
    } catch (error) {
        next(error);
    }
};

const getReferringDoctorStats = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;

        const doctorResult = await db.query('SELECT * FROM referring_doctors WHERE doctor_id = $1', [id]);
        if (doctorResult.rows.length === 0) {
            return next(new AppError('Referring doctor not found', 404));
        }

        const statsResult = await db.query(`
            SELECT
                COUNT(DISTINCT a.appointment_id) as appointment_count,
                COUNT(DISTINCT e.exam_id) as exam_count,
                COALESCE(SUM(i.subtotal_amount - i.discount_amount), 0)
                  - COALESCE((SELECT SUM(c.net_amount)
                              FROM credit_notes c
                              JOIN invoices ci ON ci.invoice_id = c.invoice_id
                              JOIN examinations ce ON ce.exam_id = ci.exam_id
                              JOIN appointments ca ON ca.appointment_id = ce.appointment_id
                              WHERE ca.referring_doctor_id = rd.doctor_id AND c.reversed_at IS NULL), 0) AS total_revenue,
                (COALESCE(SUM(i.subtotal_amount - i.discount_amount), 0)
                  - COALESCE((SELECT SUM(c.net_amount)
                              FROM credit_notes c
                              JOIN invoices ci ON ci.invoice_id = c.invoice_id
                              JOIN examinations ce ON ce.exam_id = ci.exam_id
                              JOIN appointments ca ON ca.appointment_id = ce.appointment_id
                              WHERE ca.referring_doctor_id = rd.doctor_id AND c.reversed_at IS NULL), 0))
                  * rd.commission_percentage / 100.0 AS commission_est,
                MAX(a.start_time) as last_referral_at
            FROM referring_doctors rd
            LEFT JOIN appointments a ON a.referring_doctor_id = rd.doctor_id
            LEFT JOIN examinations e ON e.appointment_id = a.appointment_id
            LEFT JOIN invoices i ON i.exam_id = e.exam_id AND i.invoice_status <> 'Voided'
            WHERE rd.doctor_id = $1
            GROUP BY rd.doctor_id
        `, [id]);

        const recentResult = await db.query(`
            SELECT a.appointment_id, a.start_time, a.status, p.mrn, m.name as machine_name, et.name as exam_type_name
            FROM appointments a
            JOIN patients p ON a.patient_id = p.patient_id
            LEFT JOIN modalities m ON a.modality_id = m.modality_id
            LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
            WHERE a.referring_doctor_id = $1
            ORDER BY a.start_time DESC
            LIMIT 10
        `, [id]);

        res.json({
            doctor: sanitizeReferringDoctor(doctorResult.rows[0]),
            stats: statsResult.rows[0] || {},
            recentReferrals: recentResult.rows
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getReferringDoctors,
    createReferringDoctor,
    updateReferringDoctor,
    deleteReferringDoctor,
    getReferringDoctorStats
};
