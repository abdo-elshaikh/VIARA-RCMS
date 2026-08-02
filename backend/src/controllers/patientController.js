const { encrypt, decrypt, hash } = require('../utils/crypto');
const { AppError } = require('../middleware/errorHandler');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { generateSecurePassword } = require('../utils/passwordGenerator');
const { logAction } = require('../services/auditService');

const stripSensitivePatientFields = (patient) => {
    const {
        first_name_enc,
        last_name_enc,
        date_of_birth_enc,
        phone_enc,
        address_enc,
        national_id_enc,
        national_id_hash,
        passport_number_enc,
        passport_number_hash,
        date_of_birth_hash,
        name_dob_hash,
        emergency_contact_name_enc,
        emergency_contact_phone_enc,
        emergency_contact_address_enc,
        allergies_enc,
        chronic_diseases_enc,
        prior_surgeries_enc,
        implants_devices_enc,
        renal_function_notes_enc,
        first_name_hash,
        last_name_hash,
        phone_hash,
        password_hash,
        email_enc,
        email_hash,
        ...safePatient
    } = patient;

    return safePatient;
};

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const encryptOptional = (value) => value ? encrypt(value) : null;
const decryptOptional = (value) => value ? decrypt(value) : '';
const buildNameDobHash = (firstName, lastName, dateOfBirth) => {
    if (!firstName || !lastName || !dateOfBirth) return null;
    return hash(`${firstName.trim()}|${lastName.trim()}|${dateOfBirth}`);
};

const clinicalPatientScope = (role, patientAlias, parameter) => {
    if (role === 'Radiologist') {
        return `EXISTS (SELECT 1 FROM examinations scope_exam
                        WHERE scope_exam.patient_id = ${patientAlias}.patient_id
                          AND (scope_exam.performing_radiologist_id = ${parameter} OR scope_exam.performing_radiologist_id IS NULL))`;
    }
    if (role === 'Technician') {
        return `EXISTS (SELECT 1 FROM appointments scope_appt
                        WHERE scope_appt.patient_id = ${patientAlias}.patient_id
                          AND (scope_appt.technician_id = ${parameter} OR scope_appt.technician_id IS NULL))`;
    }
    if (role === 'Nurse') {
        return `EXISTS (SELECT 1 FROM appointments scope_appt
                        WHERE scope_appt.patient_id = ${patientAlias}.patient_id
                          AND (scope_appt.nurse_id = ${parameter} OR scope_appt.nurse_id IS NULL))`;
    }
    return null;
};

const decryptPatientRow = (patient) => {
    try {
        if (!patient || (!patient.first_name_enc && !patient.last_name_enc)) {
            return stripSensitivePatientFields(patient);
        }

        const first_name = decrypt(patient.first_name_enc);
        const last_name = decrypt(patient.last_name_enc);
        const name = [first_name, last_name].filter(Boolean).join(' ');

        return {
            ...stripSensitivePatientFields(patient),
            first_name,
            last_name,
            name,
            patient_name: name,
            email: decryptOptional(patient.email_enc),
            date_of_birth: decrypt(patient.date_of_birth_enc),
            phone: decryptOptional(patient.phone_enc),
            address: decryptOptional(patient.address_enc),
            national_id: decryptOptional(patient.national_id_enc),
            passport_number: decryptOptional(patient.passport_number_enc),
            emergency_contact_name: decryptOptional(patient.emergency_contact_name_enc),
            emergency_contact_phone: decryptOptional(patient.emergency_contact_phone_enc),
            emergency_contact_address: decryptOptional(patient.emergency_contact_address_enc),
            allergies: decryptOptional(patient.allergies_enc),
            chronic_diseases: decryptOptional(patient.chronic_diseases_enc),
            prior_surgeries: decryptOptional(patient.prior_surgeries_enc),
            implants_devices: decryptOptional(patient.implants_devices_enc),
            renal_function_notes: decryptOptional(patient.renal_function_notes_enc)
        };
    } catch (e) {
        console.error('DECRYPTION_FAILURE', { patientId: patient.patient_id, mrn: patient.mrn, error: e.message });
        throw new AppError('Patient record unreadable due to decryption failure', 500);
    }
};

const createPatient = (db) => async (req, res, next) => {
    try {
        const validatedData = req.body;

        // Auto-generate MRN if not provided
        let patientMrn = validatedData.mrn;
        if (!patientMrn) {
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const randomSuffix = crypto.randomBytes(5).toString('hex').toUpperCase();
            patientMrn = `PAT-${dateStr}-${randomSuffix}`;
        }

        // Encryption of PII
        const firstNameEnc = encrypt(validatedData.firstName);
        const lastNameEnc = encrypt(validatedData.lastName);
        const dobEnc = encrypt(validatedData.dateOfBirth);
        const phoneEnc = validatedData.phone ? encrypt(validatedData.phone) : null;
        const addressEnc = validatedData.address ? encrypt(validatedData.address) : null;
        const email = validatedData.email?.trim().toLowerCase() || null;
        const emailEnc = encryptOptional(email);
        const emailHash = email ? hash(email) : null;
        const nationalIdEnc = encryptOptional(validatedData.nationalId);
        const passportNumberEnc = encryptOptional(validatedData.passportNumber);
        const emergencyContactNameEnc = encryptOptional(validatedData.emergencyContactName);
        const emergencyContactPhoneEnc = encryptOptional(validatedData.emergencyContactPhone);
        const emergencyContactAddressEnc = encryptOptional(validatedData.emergencyContactAddress);
        const allergiesEnc = encryptOptional(validatedData.allergies);
        const chronicDiseasesEnc = encryptOptional(validatedData.chronicDiseases);
        const priorSurgeriesEnc = encryptOptional(validatedData.priorSurgeries);
        const implantsDevicesEnc = encryptOptional(validatedData.implantsDevices);
        const renalFunctionNotesEnc = encryptOptional(validatedData.renalFunctionNotes);

        // Hashes for blind indexing
        const firstNameHash = hash(validatedData.firstName);
        const lastNameHash = hash(validatedData.lastName);
        const phoneHash = validatedData.phone ? hash(validatedData.phone) : null;
        const dateOfBirthHash = hash(validatedData.dateOfBirth);
        const nationalIdHash = validatedData.nationalId ? hash(validatedData.nationalId) : null;
        const passportNumberHash = validatedData.passportNumber ? hash(validatedData.passportNumber) : null;
        const nameDobHash = buildNameDobHash(validatedData.firstName, validatedData.lastName, validatedData.dateOfBirth);

        // Generate portal password
        const generatedPassword = generateSecurePassword();
        const passwordHash = await bcrypt.hash(generatedPassword, 10);

        const query = `
      INSERT INTO patients (
        mrn, 
        first_name_enc, 
        last_name_enc, 
        date_of_birth_enc, 
        phone_enc, 
        address_enc, 
        national_id_enc,
        national_id_hash,
        passport_number_enc,
        passport_number_hash,
        date_of_birth_hash,
        name_dob_hash,
        emergency_contact_name_enc,
        emergency_contact_phone_enc,
        emergency_contact_relationship,
        emergency_contact_address_enc,
        allergies_enc,
        chronic_diseases_enc,
        prior_surgeries_enc,
        pregnancy_status,
        implants_devices_enc,
        renal_function_notes_enc,
        preferred_language,
        communication_preference,
        consent_sms,
        consent_email,
        consent_whatsapp,
        consent_marketing,
        patient_status,
        email,
        assigned_manager_id,
        lead_status,
        planned_activity,
        gender,
        first_name_hash,
        last_name_hash,
        phone_hash,
        password_hash,
        email_enc,
        email_hash
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35, $36, $37, $38, $39, $40
      )
      RETURNING patient_id, mrn, created_at
    `;

        const values = [
            patientMrn,
            firstNameEnc,
            lastNameEnc,
            dobEnc,
            phoneEnc,
            addressEnc,
            nationalIdEnc,
            nationalIdHash,
            passportNumberEnc,
            passportNumberHash,
            dateOfBirthHash,
            nameDobHash,
            emergencyContactNameEnc,
            emergencyContactPhoneEnc,
            validatedData.emergencyContactRelationship || null,
            emergencyContactAddressEnc,
            allergiesEnc,
            chronicDiseasesEnc,
            priorSurgeriesEnc,
            validatedData.pregnancyStatus || null,
            implantsDevicesEnc,
            renalFunctionNotesEnc,
            validatedData.preferredLanguage || 'English',
            validatedData.communicationPreference || 'Phone',
            validatedData.consentSms || false,
            validatedData.consentEmail || false,
            validatedData.consentWhatsapp || false,
            validatedData.consentMarketing || false,
            validatedData.patientStatus || 'Active',
            email,
            validatedData.assignedManagerId || null,
            validatedData.leadStatus || 'New',
            validatedData.plannedActivity || null,
            validatedData.gender,
            firstNameHash,
            lastNameHash,
            phoneHash,
            passwordHash,
            emailEnc,
            emailHash
        ];

        const result = await db.query(query, values);

        res.status(201).json({
            message: 'Patient created successfully',
            data: result.rows[0],
            portalPassword: generatedPassword
        });

    } catch (error) {
        if (error.code === '23505') {
            return next(new AppError('MRN or Email already exists', 409));
        }
        next(error);
    }
};

const getPatients = (db) => async (req, res, next) => {
    try {
        const { page = 1, limit = 20, offset: offsetQuery, status } = req.query;
        const search = req.query.search || req.query.q;
        const offset = (page - 1) * limit;
        const resolvedOffset = offsetQuery ?? offset;

        let query = `
            SELECT p.*, manager.full_name as assigned_manager_name
            FROM patients p
            LEFT JOIN users manager ON p.assigned_manager_id = manager.user_id
        `;
        const values = [];
        const where = [];
        const scope = clinicalPatientScope(req.user.role, 'p', `$${values.length + 1}`);
        if (scope) {
            where.push(scope);
            values.push(req.user.user_id);
        }

        if (search) {
            if (search.toUpperCase().includes('PAT-')) {
                where.push(`(p.mrn ILIKE $${values.length + 1})`);
                values.push(`%${search}%`);
            } else {
                // Search by hash (exact match on blind index)
                const searchHash = hash(search);
                where.push(`(
                    p.first_name_hash = $${values.length + 1}
                    OR p.last_name_hash = $${values.length + 1}
                    OR p.phone_hash = $${values.length + 1}
                    OR p.national_id_hash = $${values.length + 1}
                    OR p.passport_number_hash = $${values.length + 1}
                    OR p.email_hash = $${values.length + 1}
                )`);
                values.push(searchHash);
            }
        }

        if (status) {
            where.push(`p.patient_status = $${values.length + 1}`);
            values.push(status);
        }

        if (where.length > 0) {
            query += ` WHERE ${where.join(' AND ')}`;
        }

        query += ` ORDER BY p.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
        values.push(limit, resolvedOffset);

        const result = await db.query(query, values);

        let decryptedPatients = result.rows.map(decryptPatientRow);

        // Also fetch total count for pagination metadata
        let countQuery = `SELECT COUNT(*) FROM patients p`;
        const countValues = [];
        const countWhere = [];
        const countScope = clinicalPatientScope(req.user.role, 'p', `$${countValues.length + 1}`);
        if (countScope) {
            countWhere.push(countScope);
            countValues.push(req.user.user_id);
        }
        if (search) {
             if (search.toUpperCase().includes('PAT-')) {
                 countWhere.push(`(mrn ILIKE $${countValues.length + 1})`);
                 countValues.push(`%${search}%`);
             } else {
                 const searchHash = hash(search);
                 countWhere.push(`(
                    first_name_hash = $${countValues.length + 1}
                    OR last_name_hash = $${countValues.length + 1}
                    OR phone_hash = $${countValues.length + 1}
                    OR national_id_hash = $${countValues.length + 1}
                    OR passport_number_hash = $${countValues.length + 1}
                    OR email_hash = $${countValues.length + 1}
                 )`);
                 countValues.push(searchHash);
             }
        }
        if (status) {
            countWhere.push(`patient_status = $${countValues.length + 1}`);
            countValues.push(status);
        }
        if (countWhere.length > 0) {
            countQuery += ` WHERE ${countWhere.join(' AND ')}`;
        }
        const countResult = await db.query(countQuery, countValues);
        const total = parseInt(countResult.rows[0].count, 10);

        res.json({
            data: decryptedPatients,
            meta: {
                total,
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        next(error);
    }
};

const getPatientHistory = (db) => async (req, res, next) => {
    try {
        const { id } = req.params;

        // 1. Fetch Basic Patient Info
        const patientQuery = `
            SELECT p.*, manager.full_name as assigned_manager_name
            FROM patients p
            LEFT JOIN users manager ON p.assigned_manager_id = manager.user_id
            WHERE p.patient_id = $1
              AND ($2::uuid IS NULL OR EXISTS (
                    SELECT 1 FROM examinations assigned_exam
                    WHERE assigned_exam.patient_id = p.patient_id
                      AND (assigned_exam.performing_radiologist_id = $2 OR assigned_exam.performing_radiologist_id IS NULL)
              ))
        `;
        const patientResult = await db.query(patientQuery, [
            id,
            req.user.role === 'Radiologist' ? req.user.user_id : null
        ]);

        if (patientResult.rows.length === 0) {
            return next(new AppError('Patient not found', 404));
        }

        const p = patientResult.rows[0];
        const decryptedPatient = decryptPatientRow(p);

        // 2. Fetch Appointments & Exams
        const apptQuery = `
            SELECT a.*, m.name as machine_name, et.name as exam_type_name,
                   e.exam_id, e.report_status, e.report_finalized_at, e.delivered_at,
                   e.report_content, e.clinical_indication, e.provisional_diagnosis, e.priority as exam_priority, e.body_part, e.contrast_required, e.report_sections,
                   prior_e.order_number AS prior_order_number,
                   prior_e.report_status AS prior_report_status,
                   COALESCE(prior_a.start_time, prior_e.created_at) AS prior_exam_time,
                   prior_et.name AS prior_exam_type_name,
                   COALESCE(SUM(rd.print_copy_count), 0)::int as print_copy_count,
                   MAX(rd.delivered_at) as last_result_delivery_at,
                   MAX(rd.delivery_status) as latest_delivery_status
            FROM appointments a
            LEFT JOIN modalities m ON a.modality_id = m.modality_id
            LEFT JOIN examination_types et ON a.exam_type_id = et.type_id
            LEFT JOIN examinations e ON e.appointment_id = a.appointment_id
            LEFT JOIN examinations prior_e ON prior_e.exam_id = a.prior_exam_id
            LEFT JOIN appointments prior_a ON prior_a.appointment_id = prior_e.appointment_id
            LEFT JOIN examination_types prior_et ON prior_et.type_id = prior_e.exam_type_id
            LEFT JOIN result_deliveries rd ON rd.exam_id = e.exam_id
            WHERE a.patient_id = $1
            GROUP BY a.appointment_id, m.name, et.name, e.exam_id, e.report_status, e.report_finalized_at, e.delivered_at,
                     e.report_content, e.clinical_indication, e.provisional_diagnosis, e.priority, e.body_part, e.contrast_required, e.report_sections,
                     prior_e.order_number, prior_e.report_status, prior_a.start_time, prior_e.created_at, prior_et.name
            ORDER BY a.start_time DESC
        `;
        const apptResult = await db.query(apptQuery, [id]);

        // 3. Calculate Financials
        const totalSpent = apptResult.rows
            .filter(a => a.status !== 'Cancelled')
            .reduce((sum, a) => sum + (parseFloat(a.payment_amount) || 0), 0);

        const lastVisit = apptResult.rows.length > 0 ? apptResult.rows[0].start_time : null;

        const response = {
            patient: decryptedPatient,
            history: apptResult.rows,
            summary: {
                total_spent: totalSpent,
                visit_count: apptResult.rows.length,
                last_visit: lastVisit
            }
        };

        // Audit Log for sensitive patient view
        await logAction(db, {
            userId: req.user?.user_id,
            action: 'RECORD_VIEW',
            resourceId: id,
            resourceTable: 'patients',
            ipAddress: req.ip,
            details: { reason: 'Viewed patient history' }
        });

        res.json(response);

    } catch (error) {
        next(error);
    }
};

const updatePatient = (db, auditService) => async (req, res, next) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const existingResult = await db.query('SELECT * FROM patients WHERE patient_id = $1', [id]);
        if (existingResult.rows.length === 0) {
            return next(new AppError('Patient not found', 404));
        }

        const existing = existingResult.rows[0];
        const firstName = data.firstName ?? decrypt(existing.first_name_enc);
        const lastName = data.lastName ?? decrypt(existing.last_name_enc);
        const dateOfBirth = data.dateOfBirth ?? decrypt(existing.date_of_birth_enc);
        const phone = data.phone ?? (existing.phone_enc ? decrypt(existing.phone_enc) : '');
        const nationalId = hasOwn(data, 'nationalId')
            ? data.nationalId
            : decryptOptional(existing.national_id_enc);
        const passportNumber = hasOwn(data, 'passportNumber')
            ? data.passportNumber
            : decryptOptional(existing.passport_number_enc);

        const encryptedValue = (fieldName, columnName) => {
            if (!hasOwn(data, fieldName)) return existing[columnName];
            return encryptOptional(data[fieldName]);
        };

        const values = [
            data.mrn !== undefined ? data.mrn : existing.mrn,
            data.firstName ? encrypt(data.firstName) : existing.first_name_enc,
            data.lastName ? encrypt(data.lastName) : existing.last_name_enc,
            data.dateOfBirth ? encrypt(data.dateOfBirth) : existing.date_of_birth_enc,
            data.phone !== undefined ? encrypt(data.phone) : existing.phone_enc,
            data.address !== undefined ? (data.address ? encrypt(data.address) : null) : existing.address_enc,
            encryptedValue('nationalId', 'national_id_enc'),
            nationalId ? hash(nationalId) : null,
            encryptedValue('passportNumber', 'passport_number_enc'),
            passportNumber ? hash(passportNumber) : null,
            hash(dateOfBirth),
            buildNameDobHash(firstName, lastName, dateOfBirth),
            encryptedValue('emergencyContactName', 'emergency_contact_name_enc'),
            encryptedValue('emergencyContactPhone', 'emergency_contact_phone_enc'),
            data.emergencyContactRelationship !== undefined ? data.emergencyContactRelationship : existing.emergency_contact_relationship,
            encryptedValue('emergencyContactAddress', 'emergency_contact_address_enc'),
            encryptedValue('allergies', 'allergies_enc'),
            encryptedValue('chronicDiseases', 'chronic_diseases_enc'),
            encryptedValue('priorSurgeries', 'prior_surgeries_enc'),
            data.pregnancyStatus !== undefined ? data.pregnancyStatus : existing.pregnancy_status,
            encryptedValue('implantsDevices', 'implants_devices_enc'),
            encryptedValue('renalFunctionNotes', 'renal_function_notes_enc'),
            data.preferredLanguage !== undefined ? data.preferredLanguage : existing.preferred_language,
            data.communicationPreference !== undefined ? data.communicationPreference : existing.communication_preference,
            data.consentSms !== undefined ? data.consentSms : existing.consent_sms,
            data.consentEmail !== undefined ? data.consentEmail : existing.consent_email,
            data.consentWhatsapp !== undefined ? data.consentWhatsapp : existing.consent_whatsapp,
            data.consentMarketing !== undefined ? data.consentMarketing : existing.consent_marketing,
            data.patientStatus !== undefined ? data.patientStatus : existing.patient_status,
            data.email !== undefined ? (data.email ? encrypt(data.email.trim().toLowerCase()) : null) : existing.email_enc,
            data.gender !== undefined ? data.gender : existing.gender,
            data.assignedManagerId !== undefined ? data.assignedManagerId : existing.assigned_manager_id,
            data.leadStatus !== undefined ? data.leadStatus : existing.lead_status,
            data.plannedActivity !== undefined ? data.plannedActivity : existing.planned_activity,
            hash(firstName),
            hash(lastName),
            phone ? hash(phone) : null,
            id,
            data.email !== undefined ? (data.email ? hash(data.email.trim().toLowerCase()) : null) : existing.email_hash
        ];

        const result = await db.query(`
            UPDATE patients
            SET mrn = $1,
                first_name_enc = $2,
                last_name_enc = $3,
                date_of_birth_enc = $4,
                phone_enc = $5,
                address_enc = $6,
                national_id_enc = $7,
                national_id_hash = $8,
                passport_number_enc = $9,
                passport_number_hash = $10,
                date_of_birth_hash = $11,
                name_dob_hash = $12,
                emergency_contact_name_enc = $13,
                emergency_contact_phone_enc = $14,
                emergency_contact_relationship = $15,
                emergency_contact_address_enc = $16,
                allergies_enc = $17,
                chronic_diseases_enc = $18,
                prior_surgeries_enc = $19,
                pregnancy_status = $20,
                implants_devices_enc = $21,
                renal_function_notes_enc = $22,
                preferred_language = $23,
                communication_preference = $24,
                consent_sms = $25,
                consent_email = $26,
                consent_whatsapp = $27,
                consent_marketing = $28,
                patient_status = $29,
                email_enc = $30,
                gender = $31,
                assigned_manager_id = $32,
                lead_status = $33,
                planned_activity = $34,
                first_name_hash = $35,
                last_name_hash = $36,
                phone_hash = $37,
                email_hash = $39
            WHERE patient_id = $38
            RETURNING *
        `, values);

        await auditService.logChange({
            userId: req.user.user_id,
            resourceId: id,
            resourceTable: 'patients',
            action: 'UPDATE patients',
            ipAddress: req.ip,
            previousValue: existingResult.rows[0],
            newValue: result.rows[0],
            httpMethod: 'PUT',
            requestPath: req.originalUrl.split('?')[0],
        });

        res.json({ data: decryptPatientRow(result.rows[0]) });
    } catch (error) {
        if (error.code === '23505') {
            return next(new AppError('MRN or Email already exists', 409));
        }
        next(error);
    }
};

const getDuplicatePatients = (db) => async (req, res, next) => {
    try {
        const {
            mrn,
            nationalId,
            passportNumber,
            phone,
            firstName,
            lastName,
            dateOfBirth
        } = req.query;

        const conditions = [];
        const values = [];
        const addCondition = (condition, value) => {
            values.push(value);
            conditions.push(condition.replace('?', `$${values.length}`));
        };

        if (mrn) addCondition('p.mrn ILIKE ?', `%${mrn}%`);
        if (nationalId) addCondition('p.national_id_hash = ?', hash(nationalId));
        if (passportNumber) addCondition('p.passport_number_hash = ?', hash(passportNumber));
        if (phone) addCondition('p.phone_hash = ?', hash(phone));
        if (dateOfBirth) addCondition('p.date_of_birth_hash = ?', hash(dateOfBirth));
        if (firstName && lastName && dateOfBirth) {
            addCondition('p.name_dob_hash = ?', buildNameDobHash(firstName, lastName, dateOfBirth));
        }

        if (conditions.length === 0) {
            return next(new AppError('Provide MRN, national ID, passport, phone, date of birth, or full name/date of birth for duplicate matching', 400));
        }

        const query = `
            SELECT p.*, manager.full_name as assigned_manager_name
            FROM patients p
            LEFT JOIN users manager ON p.assigned_manager_id = manager.user_id
            WHERE ${conditions.join(' OR ')}
            ORDER BY p.created_at DESC
            LIMIT 20
        `;

        const result = await db.query(query, values);
        res.json({ data: result.rows.map(decryptPatientRow) });
    } catch (error) {
        next(error);
    }
};

const mergePatients = (db) => async (req, res, next) => {
    let client;

    try {
        const { id: targetPatientId } = req.params;
        const { sourcePatientId, reason } = req.body;

        if (targetPatientId === sourcePatientId) {
            return next(new AppError('Source and target patient must be different records', 400));
        }

        client = await db.connect();
        await client.query('BEGIN');

        const locked = await client.query(`
            SELECT patient_id, patient_status
            FROM patients
            WHERE patient_id IN ($1, $2)
            ORDER BY patient_id
            FOR UPDATE
        `, [targetPatientId, sourcePatientId]);
        const target = locked.rows.find(row => row.patient_id === targetPatientId);
        const source = locked.rows.find(row => row.patient_id === sourcePatientId);

        if (!target || !source) {
            throw new AppError('Source or target patient not found', 404);
        }
        if (source.patient_status === 'Merged' || target.patient_status === 'Merged') {
            throw new AppError('A previously merged record cannot be merged again', 409);
        }

        await client.query('UPDATE appointments SET patient_id = $1 WHERE patient_id = $2', [targetPatientId, sourcePatientId]);
        await client.query('UPDATE examinations SET patient_id = $1 WHERE patient_id = $2', [targetPatientId, sourcePatientId]);
        await client.query('UPDATE invoices SET patient_id = $1 WHERE patient_id = $2', [targetPatientId, sourcePatientId]);
        await client.query('UPDATE documents SET patient_id = $1 WHERE patient_id = $2', [targetPatientId, sourcePatientId]);
        await client.query('UPDATE insurance_claims SET patient_id = $1 WHERE patient_id = $2', [targetPatientId, sourcePatientId]);
        await client.query('UPDATE result_deliveries SET patient_id = $1 WHERE patient_id = $2', [targetPatientId, sourcePatientId]);
        await client.query(`
            UPDATE refresh_tokens
            SET revoked = TRUE, revoked_at = NOW(), revoked_reason = 'patient_record_merged'
            WHERE patient_id = $1 AND revoked = FALSE
        `, [sourcePatientId]);
        await client.query(`
            UPDATE patients
            SET patient_status = 'Merged',
                merged_into_patient_id = $1,
                merged_at = NOW(),
                merged_by = $2,
                merge_reason = $3,
                password_hash = NULL,
                consent_sms = FALSE,
                consent_email = FALSE,
                consent_whatsapp = FALSE,
                consent_marketing = FALSE
            WHERE patient_id = $4
        `, [targetPatientId, req.user.user_id, reason, sourcePatientId]);
        await logAction(client, {
            userId: req.user.user_id,
            action: 'PATIENT_RECORDS_MERGED',
            resourceId: targetPatientId,
            resourceTable: 'patients',
            ipAddress: req.ip,
            details: { sourcePatientId, reason },
            required: true
        });

        await client.query('COMMIT');
        res.json({
            message: 'Patient records merged successfully',
            targetPatientId,
            sourcePatientId
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const deletePatient = (db) => async (req, res, next) => {
    let client;

    try {
        const { id } = req.params;
        client = await db.connect();
        await client.query('BEGIN');

        const existing = await client.query(
            'SELECT patient_id, patient_status FROM patients WHERE patient_id = $1 FOR UPDATE',
            [id]
        );
        if (existing.rows.length === 0) {
            await client.query('ROLLBACK');
            return next(new AppError('Patient not found', 404));
        }

        await client.query(`
            UPDATE patients
            SET patient_status = 'Restricted',
                consent_sms = FALSE,
                consent_email = FALSE,
                consent_whatsapp = FALSE,
                consent_marketing = FALSE,
                password_hash = NULL
            WHERE patient_id = $1
        `, [id]);
        await client.query(`
            UPDATE refresh_tokens
            SET revoked = TRUE,
                revoked_at = NOW(),
                revoked_reason = 'patient_record_restricted'
            WHERE patient_id = $1 AND revoked = FALSE
        `, [id]);
        await logAction(client, {
            userId: req.user.user_id,
            action: 'PATIENT_RESTRICTED',
            resourceId: id,
            resourceTable: 'patients',
            ipAddress: req.ip,
            details: { previousStatus: existing.rows[0].patient_status },
            required: true
        });

        await client.query('COMMIT');
        res.json({ message: 'Patient record restricted; clinical and financial history was preserved' });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        next(error);
    } finally {
        if (client) client.release();
    }
};

const generatePortalPassword = (db) => async (req, res, next) => {
    try {
        const patientId = req.params.id;
        const generatedPassword = generateSecurePassword();
        const passwordHash = await bcrypt.hash(generatedPassword, 10);

        const result = await db.query(
            "UPDATE patients SET password_hash = $1 WHERE patient_id = $2 RETURNING mrn",
            [passwordHash, patientId]
        );

        if (result.rows.length === 0) {
            return next(new AppError('Patient not found', 404));
        }

        await logAction(db, {
            userId: req.user.user_id,
            action: 'UPDATE_PORTAL_PASSWORD',
            resourceId: patientId,
            resourceTable: 'patients',
            ipAddress: req.ip,
            details: { reason: 'Requested by staff' },
            required: true
        });

        res.json({
            message: 'Portal password generated successfully',
            portalPassword: generatedPassword,
            mrn: result.rows[0].mrn
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createPatient,
    getPatients,
    getPatientHistory,
    updatePatient,
    getDuplicatePatients,
    mergePatients,
    deletePatient,
    generatePortalPassword
};
