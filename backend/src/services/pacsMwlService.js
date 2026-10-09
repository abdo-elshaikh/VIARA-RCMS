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

const scheduledParts = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new Error('Invalid scheduled examination date');
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: process.env.PACS_TIMEZONE || 'Africa/Cairo',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return { date: value.year + value.month + value.day, time: value.hour + value.minute + value.second };
};
const toDicomTime = date => scheduledParts(date).time;

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

const { toDicomPatientName } = require('../utils/arabicTransliteration');

// DICOM PN: "Family^Given". Transliterates Arabic names to clean Latin characters to prevent
// modality console Mojibake/reversals and allow technician search with standard English keyboards.
const buildPatientName = (last, first) => {
    return toDicomPatientName(last, first, { dualGroup: true, nativeFirst: true });
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
    const autoProvision = Boolean(options.autoProvision);

    // Auto-create missing examination rows for scheduled appointments (only when generating/syncing)
    if (autoProvision) {
        await pool.query(`
                INSERT INTO examinations (
                    appointment_id, patient_id, modality_id, exam_type_id,
                    status, queue_stage, order_number, priority, clinical_indication
                )
                SELECT a.appointment_id, a.patient_id, a.modality_id, a.exam_type_id,
                       CASE WHEN a.status = 'Arrived' THEN 'Checked-in'::exam_status ELSE 'Scheduled'::exam_status END,
                       CASE WHEN a.status = 'Arrived' THEN 'Arrived' ELSE 'Scheduled' END,
                       COALESCE(a.order_number, 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(a.appointment_id::text, 1, 6)),
                       COALESCE(a.priority, 'Routine'),
                       a.clinical_indication
                FROM appointments a
                WHERE a.status::text IN ('Scheduled', 'Confirmed', 'Arrived', 'In-Progress', 'Checked-in')
                  AND NOT EXISTS (
                      SELECT 1 FROM examinations e WHERE e.appointment_id = a.appointment_id
                  )
            `);
    }

    const values = [];
    const filters = ["e.status::text IN ('Scheduled', 'Checked-in', 'Scanning')"];

    if (!includeInvalid) filters.push('e.order_number IS NOT NULL');
    if (date) {
        values.push(date);
        filters.push(`COALESCE(a.start_time, e.created_at)::date = $${values.length}::date`);
    } else {
        filters.push('COALESCE(a.start_time, e.created_at)::date >= CURRENT_DATE - 2');
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
    const stationAet = String(row.scheduled_station_aet || serverAet || '').trim();
    if (!stationAet || stationAet.length > 16 || /[\\\x00-\x1f\x7f]/.test(stationAet)) throw new Error('Scheduled station AET must contain 1-16 valid characters');
    const modality = toDicomModality(row.modality_type);
    const sopInstanceUid = DicomMetaDictionary.uid();

    const naturalDataset = {
        SpecificCharacterSet: 'ISO_IR 192',
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
            ScheduledStationAETitle: stationAet,
            ScheduledProcedureStepStartDate: scheduledParts(scheduled).date,
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
        '00020013': { vr: 'SH', Value: ['VIARA_MWL_1'] }
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
    const serverAet = await settingsService.get('pacs_server_aet', process.env.ORTHANC_AET || 'MiPACS2');
    const rows = await fetchScheduledWorklist(pool, { autoProvision: true });
    const entries = rows.map((row) => {
        const orderNumber = String(row.order_number || '').trim();
        if (!orderNumber) throw new Error('MWL row is missing its accession/order number');
        const validation = validateWorklistRow(row);
        if (!validation.valid) {
            throw new Error(`MWL row is invalid: ${validation.warnings.join('; ')}`);
        }
        const fileName = `${orderNumber.replace(/[^A-Za-z0-9_-]/g, '_')}.wl`;
        return { fileName, buffer: buildWorklistBuffer(row, serverAet), orderNumber };
    });
    const expected = new Set(entries.map(({ fileName }) => fileName));
    if (expected.size !== entries.length) throw new Error('MWL rows contain duplicate accession numbers');

    fs.mkdirSync(WORKLIST_DIR, { recursive: true });
    for (const { fileName, buffer, orderNumber } of entries) {
        const target = path.join(WORKLIST_DIR, fileName);
        const temporary = target + '.' + require('crypto').randomUUID() + '.tmp';
        try {
            fs.writeFileSync(temporary, buffer, { flag: 'wx', mode: 0o600 });
            fs.renameSync(temporary, target);
        } catch (error) {
            logger.error('Failed to write worklist entry; stale entries were retained', {
                order_number: orderNumber,
                error: error.message
            });
            throw error;
        } finally {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
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

    logger.info(`MWL regenerated: ${entries.length} scheduled, ${pruned} pruned`, { dir: WORKLIST_DIR });
    return { written: entries.length, pruned };
};

let mwlRegenTimeout = null;
let mwlRegenRunning = false;
let mwlPendingRegen = false;

/**
 * Debounced trigger for asynchronous MWL regeneration.
 * Bundles rapid appointment or examination scheduling events into a single regeneration run.
 *
 * @param {object} pool - PostgreSQL pool or client
 * @param {number} [delayMs=2000] - Debounce delay in milliseconds
 */
const triggerMwlRegeneration = (pool, delayMs = 2000) => {
    if (!pool) return;
    if (mwlRegenTimeout) {
        clearTimeout(mwlRegenTimeout);
    }
    mwlRegenTimeout = setTimeout(async () => {
        mwlRegenTimeout = null;
        if (mwlRegenRunning) {
            mwlPendingRegen = true;
            return;
        }
        mwlRegenRunning = true;
        try {
            await regenerateWorklists(pool);
        } catch (err) {
            logger.error('Debounced MWL regeneration failed', { error: err.message });
        } finally {
            mwlRegenRunning = false;
            if (mwlPendingRegen) {
                mwlPendingRegen = false;
                triggerMwlRegeneration(pool, 500);
            }
        }
    }, delayMs);
    mwlRegenTimeout.unref?.();
};

module.exports = {
    regenerateWorklists,
    triggerMwlRegeneration,
    // exported for unit tests
    buildWorklistBuffer,
    fetchScheduledWorklist,
    validateWorklistRow,
    toDicomModality,
    toDicomDate,
    toDicomSex,
    WORKLIST_DIR
};
