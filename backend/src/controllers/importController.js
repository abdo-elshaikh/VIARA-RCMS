const { AppError } = require('../middleware/errorHandler');
const { encrypt, hash } = require('../utils/crypto');
const csv = require('csv-parser');
const fs = require('fs');
const crypto = require('crypto');

const encryptOptional = (value) => value ? encrypt(value) : null;

const buildNameDobHash = (firstName, lastName, dob) => {
    if (!firstName || !lastName || !dob) return null;
    return hash(`${firstName.trim()}|${lastName.trim()}|${dob}`);
};

const generateMrn = () => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `PAT-${dateStr}-${randomSuffix}`;
};

const parseCsvFile = (filePath) => new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => rows.push(row))
        .on('end', () => resolve(rows))
        .on('error', reject);
});

const findDuplicatePatient = async (db, { phoneHash, nameDobHash, nationalIdHash, email }) => {
    if (email) {
        const byEmail = await db.query('SELECT patient_id, mrn FROM patients WHERE email = $1 LIMIT 1', [email]);
        if (byEmail.rows.length) return { reason: 'email', patient: byEmail.rows[0] };
    }
    if (phoneHash) {
        const byPhone = await db.query('SELECT patient_id, mrn FROM patients WHERE phone_hash = $1 LIMIT 1', [phoneHash]);
        if (byPhone.rows.length) return { reason: 'phone', patient: byPhone.rows[0] };
    }
    if (nameDobHash) {
        const byNameDob = await db.query('SELECT patient_id, mrn FROM patients WHERE name_dob_hash = $1 LIMIT 1', [nameDobHash]);
        if (byNameDob.rows.length) return { reason: 'name_dob', patient: byNameDob.rows[0] };
    }
    if (nationalIdHash) {
        const byNationalId = await db.query('SELECT patient_id, mrn FROM patients WHERE national_id_hash = $1 LIMIT 1', [nationalIdHash]);
        if (byNationalId.rows.length) return { reason: 'national_id', patient: byNationalId.rows[0] };
    }
    return null;
};

const insertEncryptedPatient = async (db, row) => {
    const firstName = (row.firstName || '').trim();
    const lastName = (row.lastName || '').trim();
    const dob = (row.dob || '').trim();
    const gender = row.gender || null;
    const phone = row.phone ? String(row.phone).trim() : null;
    const email = row.email ? String(row.email).trim().toLowerCase() : null;
    const nationalId = row.nationalId ? String(row.nationalId).trim() : null;

    const phoneHash = phone ? hash(phone) : null;
    const nameDobHash = buildNameDobHash(firstName, lastName, dob);
    const nationalIdHash = nationalId ? hash(nationalId) : null;

    const duplicate = await findDuplicatePatient(db, { phoneHash, nameDobHash, nationalIdHash, email });
    if (duplicate) {
        return { status: 'duplicate', duplicate };
    }

    const result = await db.query(`
        INSERT INTO patients (
            mrn, first_name_enc, last_name_enc, date_of_birth_enc, phone_enc,
            national_id_enc, national_id_hash, date_of_birth_hash, name_dob_hash,
            first_name_hash, last_name_hash, phone_hash, email, gender, patient_status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Active')
        RETURNING patient_id, mrn
    `, [
        generateMrn(),
        encrypt(firstName),
        encrypt(lastName),
        encrypt(dob),
        phone ? encrypt(phone) : null,
        encryptOptional(nationalId),
        nationalIdHash,
        hash(dob),
        nameDobHash,
        hash(firstName),
        hash(lastName),
        phoneHash,
        email,
        gender
    ]);

    return { status: 'created', patient: result.rows[0] };
};

const mapPatientRow = (raw, rowNum) => {
    const firstName = raw.FirstName || raw.first_name || raw.firstName;
    const lastName = raw.LastName || raw.last_name || raw.lastName;
    const dob = raw.DOB || raw.dob || raw.DateOfBirth;
    const errors = [];
    if (!firstName) errors.push('missing first name');
    if (!lastName) errors.push('missing last name');
    if (!dob) errors.push('missing date of birth');
    return {
        rowNum,
        data: {
            firstName,
            lastName,
            dob,
            gender: raw.Gender || raw.gender || null,
            phone: raw.Phone || raw.phone || null,
            email: raw.Email || raw.email || null,
            nationalId: raw.NationalID || raw.national_id || raw.NationalId || null
        },
        errors
    };
};

const importPatients = (db) => async (req, res, next) => {
    if (!req.file) return next(new AppError('No CSV file uploaded', 400));

    try {
        const rows = await parseCsvFile(req.file.path);
        const report = {
            totalRows: rows.length,
            successCount: 0,
            failCount: 0,
            duplicateCount: 0,
            rows: []
        };

        for (let i = 0; i < rows.length; i++) {
            const mapped = mapPatientRow(rows[i], i + 2);
            if (mapped.errors.length) {
                report.failCount++;
                report.rows.push({ row: mapped.rowNum, status: 'invalid', errors: mapped.errors });
                continue;
            }

            try {
                const outcome = await insertEncryptedPatient(db, mapped.data);
                if (outcome.status === 'duplicate') {
                    report.duplicateCount++;
                    report.rows.push({
                        row: mapped.rowNum,
                        status: 'duplicate',
                        reason: outcome.duplicate.reason,
                        existingMrn: outcome.duplicate.patient.mrn
                    });
                } else {
                    report.successCount++;
                    report.rows.push({
                        row: mapped.rowNum,
                        status: 'created',
                        mrn: outcome.patient.mrn
                    });
                }
            } catch (err) {
                report.failCount++;
                report.rows.push({ row: mapped.rowNum, status: 'error', errors: [err.message] });
            }
        }

        fs.unlinkSync(req.file.path);
        res.json({
            message: 'Import completed',
            ...report,
            validationReport: report.rows
        });
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        next(error);
    }
};

const importInsuranceContracts = (db) => async (req, res, next) => {
    if (!req.file) return next(new AppError('No CSV file uploaded', 400));

    try {
        const rows = await parseCsvFile(req.file.path);
        const report = { totalRows: rows.length, successCount: 0, failCount: 0, rows: [] };

        for (let i = 0; i < rows.length; i++) {
            const raw = rows[i];
            const providerName = raw.ProviderName || raw.provider_name;
            const entityName = raw.EntityName || raw.entity_name || raw.ContractName;
            const commission = parseFloat(raw.CommissionPct || raw.commission_percentage || 0);
            const startDate = raw.StartDate || raw.start_date;
            const entityType = raw.EntityType || raw.entity_type || 'Company';

            if (!providerName || !entityName || !startDate) {
                report.failCount++;
                report.rows.push({ row: i + 2, status: 'invalid', errors: ['missing provider, entity name, or start date'] });
                continue;
            }

            try {
                let provider = await db.query('SELECT provider_id FROM insurance_providers WHERE name = $1', [providerName]);
                if (!provider.rows.length) {
                    provider = await db.query(
                        'INSERT INTO insurance_providers (name) VALUES ($1) RETURNING provider_id',
                        [providerName]
                    );
                }
                const providerId = provider.rows[0].provider_id;

                await db.query(`
                    INSERT INTO contracts (entity_name, entity_type, commission_percentage, start_date, provider_id)
                    VALUES ($1, $2, $3, $4, $5)
                `, [entityName, entityType, commission, startDate, providerId]);

                report.successCount++;
                report.rows.push({ row: i + 2, status: 'created', provider: providerName, entity: entityName });
            } catch (err) {
                report.failCount++;
                report.rows.push({ row: i + 2, status: 'error', errors: [err.message] });
            }
        }

        fs.unlinkSync(req.file.path);
        res.json({ message: 'Insurance contract import completed', ...report, validationReport: report.rows });
    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        next(error);
    }
};

const findImportDuplicates = (db) => async (req, res, next) => {
    try {
        const result = await db.query(`
            SELECT name_dob_hash, COUNT(*) AS cnt,
                   array_agg(json_build_object('patient_id', patient_id, 'mrn', mrn)) AS patients
            FROM patients
            WHERE name_dob_hash IS NOT NULL
            GROUP BY name_dob_hash
            HAVING COUNT(*) > 1
            ORDER BY cnt DESC
            LIMIT 100
        `);
        res.json({
            duplicateGroups: result.rows.length,
            groups: result.rows
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    importPatients,
    importInsuranceContracts,
    findImportDuplicates
};
