const fs = require('fs');
const path = require('path');
const dcmjs = require('dcmjs');
const { decrypt } = require('../utils/crypto');
const logger = require('../config/logger');
const settingsService = require('./settingsService');

const { DicomDict, DicomMetaDictionary } = dcmjs.data;

// Explicit VR Little Endian — the transfer syntax Orthanc's worklist plugin reads.
const TRANSFER_SYNTAX = '1.2.840.10008.1.2.1';
const MWL_FIND_SOP_CLASS_UID = '1.2.840.10008.5.1.4.31';
const IMPLEMENTATION_CLASS_UID = '1.2.826.0.1.3680043.10.54321.1';

const WORKLIST_DIR = process.env.PACS_WORKLIST_DIR || path.resolve(__dirname, '../../../pacs-worklists');
const XRAY_MWL_MODALITY = process.env.PACS_MWL_XRAY_MODALITY || 'DX';

// RIS free-text modality label -> DICOM Modality CS code (0008,0060).
const MODALITY_CODE_MAP = {
    MRI: 'MR',
    MR: 'MR',
    CT: 'CT',
    'X-RAY': XRAY_MWL_MODALITY,
    XRAY: XRAY_MWL_MODALITY,
    DR: XRAY_MWL_MODALITY,
    DX: 'DX',
    CR: 'CR',
    US: 'US',
    ULTRASOUND: 'US',
    MG: 'MG',
    MAMMOGRAPHY: 'MG',
    PET: 'PT',
    NM: 'NM'
};

const toDicomModality = (type) => {
    if (!type) return 'OT';
    return MODALITY_CODE_MAP[String(type).toUpperCase().trim()] || 'OT';
};

// "1990-05-21" / Date -> "19900521"; empty on failure (DOB is optional in MWL).
const toDicomDate = (value) => {
    if (!value) return '';
    const str = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
    const match = str.match(/(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}${match[2]}${match[3]}` : '';
};

const toDicomTime = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

const toDicomSex = (gender) => {
    const g = String(gender || '').toUpperCase();
    if (g.startsWith('M')) return 'M';
    if (g.startsWith('F')) return 'F';
    return 'O';
};

const safeDecrypt = (value) => {
    if (!value) return '';
    try {
        return decrypt(value);
    } catch {
        return '';
    }
};

// DICOM PN: "Family^Given". Strip the caret from source fields to avoid corrupting components.
const buildPatientName = (last, first) => {
    const clean = (s) => String(s || '').replace(/\^/g, ' ').trim();
    return `${clean(last)}^${clean(first)}`;
};

/**
 * Fetch scheduled examinations that a modality should see on its worklist.
 * Uses the examinations row (the RIS study) joined to its appointment, patient,
 * exam type, and modality. Accession number is examinations.order_number.
 */
const fetchScheduledWorklist = async (pool, options = {}) => {
    const date = options.date || null;
    const modalityId = options.modalityId || null;
    const includeInvalid = Boolean(options.includeInvalid);
    const values = [];
    const filters = ["e.status IN ('Scheduled', 'Checked-in')"];

    if (!includeInvalid) filters.push('e.order_number IS NOT NULL');
    if (date) {
        values.push(date);
        filters.push(`COALESCE(a.start_time, e.created_at)::date = $${values.length}::date`);
    } else {
        filters.push('COALESCE(a.start_time, e.created_at)::date = CURRENT_DATE');
    }
    if (modalityId) {
        values.push(modalityId);
        filters.push(`e.modality_id = $${values.length}`);
    }

    const { rows } = await pool.query(`
        SELECT
            e.exam_id,
            e.order_number,
            COALESCE(e.study_instance_uid, '') AS study_instance_uid,
            e.clinical_indication,
            COALESCE(a.start_time, e.created_at) AS scheduled_datetime,
            et.name AS procedure_name,
            et.code AS procedure_code,
            COALESCE(e.body_part, et.body_part) AS body_part,
            m.type AS modality_type,
            m.aet AS scheduled_station_aet,
            p.mrn,
            p.gender,
            p.first_name_enc,
            p.last_name_enc,
            p.date_of_birth_enc
        FROM examinations e
        JOIN patients p ON e.patient_id = p.patient_id
        LEFT JOIN appointments a ON e.appointment_id = a.appointment_id
        LEFT JOIN examination_types et ON e.exam_type_id = et.type_id
        LEFT JOIN modalities m ON e.modality_id = m.modality_id
        WHERE ${filters.join(' AND ')}
        ORDER BY scheduled_datetime ASC
    `, values);
    return rows;
};

const validateWorklistRow = (row) => {
    const warnings = [];
    if (!row.order_number) warnings.push('Missing accession/order number');
    if (!row.mrn) warnings.push('Missing patient MRN');
    if (!row.modality_type) warnings.push('Missing modality type');
    if (!row.procedure_name && !row.procedure_code) warnings.push('Missing procedure description/code');
    if (!row.scheduled_datetime) warnings.push('Missing scheduled date/time');
    return {
        valid: warnings.length === 0,
        warnings,
        dicom_modality: toDicomModality(row.modality_type)
    };
};

/**
 * Build a single Modality Worklist part-10 buffer for one scheduled exam.
 */
const buildWorklistBuffer = (row, serverAet) => {
    const scheduled = row.scheduled_datetime instanceof Date
        ? row.scheduled_datetime
        : new Date(row.scheduled_datetime);
    const modality = toDicomModality(row.modality_type);
    const sopInstanceUid = DicomMetaDictionary.uid();

    const naturalDataset = {
        SOPClassUID: MWL_FIND_SOP_CLASS_UID,
        SOPInstanceUID: sopInstanceUid,

        // Patient identification
        PatientName: buildPatientName(safeDecrypt(row.last_name_enc), safeDecrypt(row.first_name_enc)),
        PatientID: row.mrn,
        PatientBirthDate: toDicomDate(safeDecrypt(row.date_of_birth_enc)),
        PatientSex: toDicomSex(row.gender),

        // Study / order identification
        AccessionNumber: row.order_number,
        StudyInstanceUID: row.study_instance_uid || undefined,
        RequestedProcedureID: row.order_number,
        RequestedProcedureDescription: row.procedure_name || 'Imaging Procedure',
        Modality: modality,

        // Scheduled Procedure Step Sequence (0040,0100)
        ScheduledProcedureStepSequence: [{
            Modality: modality,
            ScheduledStationAETitle: row.scheduled_station_aet || serverAet,
            ScheduledProcedureStepStartDate: toDicomDate(scheduled),
            ScheduledProcedureStepStartTime: toDicomTime(scheduled),
            ScheduledProcedureStepDescription: row.procedure_name || 'Imaging Procedure',
            ScheduledProcedureStepID: row.order_number,
            ScheduledProcedureStepStatus: 'SCHEDULED',
            ScheduledPerformingPhysicianName: ''
        }]
    };

    // dcmjs wants no undefined values in the natural dataset.
    Object.keys(naturalDataset).forEach((k) => naturalDataset[k] === undefined && delete naturalDataset[k]);

    const dict = new DicomDict({
        '00020001': { vr: 'OB', Value: [new Uint8Array([0, 1]).buffer] },
        '00020002': { vr: 'UI', Value: [MWL_FIND_SOP_CLASS_UID] },
        '00020003': { vr: 'UI', Value: [sopInstanceUid] },
        '00020010': { vr: 'UI', Value: [TRANSFER_SYNTAX] },
        '00020012': { vr: 'UI', Value: [IMPLEMENTATION_CLASS_UID] },
        '00020013': { vr: 'SH', Value: ['RCMS_MWL_1'] }
    });
    dict.dict = DicomMetaDictionary.denaturalizeDataset(naturalDataset);
    return Buffer.from(dict.write());
};

/**
 * Regenerate the entire worklist directory from the current RIS schedule.
 * Writes one <accession>.wl per scheduled exam and removes files for exams that
 * are no longer scheduled (completed, cancelled, or past). Idempotent.
 *
 * This is the swappable MWL contract: a future native DIMSE C-FIND-MWL SCP can
 * replace the Orthanc worklist plugin without changing this producer.
 */
const regenerateWorklists = async (pool) => {
    fs.mkdirSync(WORKLIST_DIR, { recursive: true });

    const serverAet = await settingsService.get('pacs_server_aet', process.env.ORTHANC_AET || 'MiPACS2');
    const rows = await fetchScheduledWorklist(pool);
    const expected = new Set();
    let written = 0;

    for (const row of rows) {
        // Accession numbers are filesystem-safe (alphanumeric order numbers), but sanitize defensively.
        const fileName = `${String(row.order_number).replace(/[^A-Za-z0-9_-]/g, '_')}.wl`;
        expected.add(fileName);
        try {
            const buffer = buildWorklistBuffer(row, serverAet);
            fs.writeFileSync(path.join(WORKLIST_DIR, fileName), buffer);
            written += 1;
        } catch (err) {
            logger.error('Failed to write worklist entry', {
                order_number: row.order_number,
                error: err.message
            });
        }
    }

    // Prune stale .wl files so modalities never see cancelled/finished orders.
    let pruned = 0;
    for (const file of fs.readdirSync(WORKLIST_DIR)) {
        if (file.endsWith('.wl') && !expected.has(file)) {
            fs.unlinkSync(path.join(WORKLIST_DIR, file));
            pruned += 1;
        }
    }

    logger.info(`MWL regenerated: ${written} scheduled, ${pruned} pruned`, { dir: WORKLIST_DIR });
    return { written, pruned };
};

module.exports = {
    regenerateWorklists,
    // exported for unit tests
    buildWorklistBuffer,
    fetchScheduledWorklist,
    validateWorklistRow,
    toDicomModality,
    toDicomDate,
    toDicomSex,
    WORKLIST_DIR
};
