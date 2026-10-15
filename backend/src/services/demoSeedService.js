'use strict';

/**
 * demoSeedService.js
 * ------------------
 * Provides safe, idempotent clinical demo dataset seeding and clearing for VIARA RCMS.
 * Creates diagnostic rooms, imaging modalities, examination types, referring doctors,
 * encrypted sample patients, and clinical workflow appointments/examinations.
 *
 * Compliant with trial quotas and AES-GCM PII encryption standards.
 */

const { encrypt, hash } = require('../utils/crypto');
const logger = require('../config/logger');
const { assertQuota } = require('./quotaService');

const buildNameDobHash = (firstName, lastName, dateOfBirth) => {
    if (!firstName || !lastName || !dateOfBirth) return null;
    return hash(`${firstName.trim()}|${lastName.trim()}|${dateOfBirth}`);
};

/**
 * Check if demo data is currently seeded in the database.
 */
async function getDemoStatus(pool) {
    try {
        const [patientsRes, apptsRes, modsRes] = await Promise.all([
            pool.query("SELECT COUNT(*)::int AS count FROM patients WHERE mrn LIKE 'DEMO-%' AND patient_status != 'Merged'"),
            pool.query("SELECT COUNT(*)::int AS count FROM appointments WHERE order_number LIKE 'DEMO-%'"),
            pool.query("SELECT COUNT(*)::int AS count FROM modalities WHERE room_number LIKE 'R-%' AND (name LIKE '%Magnetom%' OR name LIKE '%Revolution%' OR name LIKE '%DigitalDiagnost%' OR name LIKE '%Aplio%')")
        ]);

        const patientCount = patientsRes.rows[0]?.count || 0;
        const appointmentCount = apptsRes.rows[0]?.count || 0;
        const modalityCount = modsRes.rows[0]?.count || 0;

        return {
            isDemoSeeded: patientCount > 0 || appointmentCount > 0 || modalityCount > 0,
            patientCount,
            appointmentCount,
            modalityCount
        };
    } catch (error) {
        logger.error('Failed to query demo status', { error: error.message });
        return { isDemoSeeded: false, patientCount: 0, appointmentCount: 0, modalityCount: 0 };
    }
}

/**
 * Seed a compact, realistic clinical radiology dataset.
 */
async function seedDemoData(pool, { actorId = null } = {}) {
    const status = await getDemoStatus(pool);
    if (status.isDemoSeeded) {
        return {
            alreadySeeded: true,
            message: 'البيانات التجريبية موجودة بالفعل في النظام.',
            summary: {
                patients: status.patientCount,
                appointments: status.appointmentCount,
                modalities: status.modalityCount
            }
        };
    }

    // Assert quotas before seeding so trial licenses are never exceeded
    await assertQuota(pool, 'patients');
    await assertQuota(pool, 'appointments');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Rooms
        const roomDefs = [
            { room_number: 'R-MRI', name: 'غرفة الرنين المغناطيسي 1', type: 'Imaging', floor: 'الطابق الأرضي', notes: 'غرفة فحص تجريبية DEMO' },
            { room_number: 'R-CT',  name: 'غرفة الأشعة المقطعية 1',   type: 'Imaging', floor: 'الطابق الأرضي', notes: 'غرفة فحص تجريبية DEMO' },
            { room_number: 'R-XR',  name: 'غرفة الأشعة السينية (X-Ray)', type: 'Imaging', floor: 'الطابق الأول', notes: 'غرفة فحص تجريبية DEMO' },
            { room_number: 'R-US',  name: 'عيادة السونار والموجات الصوتية', type: 'Imaging', floor: 'الطابق الأول', notes: 'غرفة فحص تجريبية DEMO' }
        ];

        const rooms = {};
        for (const r of roomDefs) {
            const res = await client.query(`
                INSERT INTO rooms (name, room_number, type, floor, status, notes)
                VALUES ($1, $2, $3, $4, 'Active', $5)
                ON CONFLICT (room_number) DO UPDATE SET name = EXCLUDED.name, notes = EXCLUDED.notes
                RETURNING room_id, room_number
            `, [r.name, r.room_number, r.type, r.floor, r.notes]);
            rooms[r.room_number] = res.rows[0];
        }

        // 2. Modalities
        const modDefs = [
            { name: 'Siemens Magnetom 1.5T', type: 'MRI', room_number: 'R-MRI', room_id: rooms['R-MRI']?.room_id, aet: 'VIARA_MRI', port: 104 },
            { name: 'GE Revolution CT 128',  type: 'CT',  room_number: 'R-CT',  room_id: rooms['R-CT']?.room_id,  aet: 'VIARA_CT',  port: 105 },
            { name: 'Philips DigitalDiagnost', type: 'X-Ray', room_number: 'R-XR', room_id: rooms['R-XR']?.room_id, aet: 'VIARA_XR',  port: 106 },
            { name: 'Canon Aplio i800',      type: 'Ultrasound', room_number: 'R-US', room_id: rooms['R-US']?.room_id, aet: 'VIARA_US', port: 107 }
        ];

        const modalities = {};
        for (const m of modDefs) {
            const res = await client.query(`
                INSERT INTO modalities (name, type, status, room_number, room_id, aet, port)
                VALUES ($1, $2, 'Active', $3, $4, $5, $6)
                RETURNING modality_id, type, name
            `, [m.name, m.type, m.room_number, m.room_id, m.aet, m.port]);
            modalities[m.type] = res.rows[0];
        }

        // 3. Examination Types
        const examTypeDefs = [
            { type: 'MRI', name: 'أشعة رنين مغناطيسي على المخ (Brain MRI)', code: 'DEMO-MRI-BRAIN', price: 1200, duration: 30, body_part: 'Head', contrast: false },
            { type: 'MRI', name: 'أشعة رنين مغناطيسي على الفقرات القطنية (Lumbar Spine MRI)', code: 'DEMO-MRI-LSPINE', price: 1100, duration: 30, body_part: 'Spine', contrast: false },
            { type: 'CT',  name: 'أشعة مقطعية على الصدر بالصبغة (Chest CT with Contrast)', code: 'DEMO-CT-CHEST', price: 850, duration: 20, body_part: 'Chest', contrast: true },
            { type: 'CT',  name: 'أشعة مقطعية على المخ بدون صبغة (Brain CT without Contrast)', code: 'DEMO-CT-BRAIN', price: 700, duration: 15, body_part: 'Head', contrast: false },
            { type: 'X-Ray', name: 'أشعة سينية على الصدر أمامي وخلفي (Chest X-Ray PA)', code: 'DEMO-XR-CHEST', price: 250, duration: 10, body_part: 'Chest', contrast: false },
            { type: 'X-Ray', name: 'أشعة سينية على مفصل الركبة (Knee X-Ray AP/Lat)', code: 'DEMO-XR-KNEE', price: 220, duration: 10, body_part: 'Knee', contrast: false },
            { type: 'Ultrasound', name: 'موجات صوتية على البطن والحوض (Abdominal Pelvic Ultrasound)', code: 'DEMO-US-ABDOMEN', price: 400, duration: 20, body_part: 'Abdomen', contrast: false },
            { type: 'Ultrasound', name: 'موجات صوتية على الغدة الدرقية (Thyroid Ultrasound)', code: 'DEMO-US-THYROID', price: 350, duration: 15, body_part: 'Neck', contrast: false }
        ];

        const examTypes = {};
        for (const et of examTypeDefs) {
            const mod = modalities[et.type];
            const res = await client.query(`
                INSERT INTO examination_types (modality_id, code, name, price, duration_minutes, body_part, contrast_required, is_active)
                VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
                ON CONFLICT (modality_id, name) DO UPDATE SET price = EXCLUDED.price, is_active = TRUE
                RETURNING type_id, code, name, modality_id, price
            `, [mod.modality_id, et.code, et.name, et.price, et.duration, et.body_part, et.contrast]);
            examTypes[et.code] = res.rows[0];
        }

        // 4. Referring Doctors
        const refDocDefs = [
            { full_name: 'د. طارق الزيات', specialty: 'Orthopedics', clinic: 'عيادات النخبة التخصصية', phone: '01012345671', email: 'tariq.zayat@example.com' },
            { full_name: 'د. منى عبد الرحمن', specialty: 'Internal Medicine', clinic: 'مستشفى الشروق الطبي', phone: '01012345672', email: 'mona.abdelrahman@example.com' }
        ];

        const referringDocs = [];
        for (const doc of refDocDefs) {
            const res = await client.query(`
                INSERT INTO referring_doctors (full_name, specialty, clinic_hospital, phone, email, commission_percentage, is_active, notes)
                VALUES ($1, $2, $3, $4, $5, 10, TRUE, 'طبيب محول تجريبي DEMO')
                RETURNING doctor_id, full_name
            `, [doc.full_name, doc.specialty, doc.clinic, doc.phone, doc.email]);
            referringDocs.push(res.rows[0]);
        }

        // 5. Sample Patients (AES-GCM Encrypted with blind index hashes)
        const patientDefs = [
            { mrn: 'DEMO-PAT-001', first: 'أحمد', last: 'محمود إبراهيم', dob: '1985-04-12', phone: '01098765431', gender: 'Male', email: 'demo.ahmed@example.invalid', address: '12 شارع التحرير، الدقي، الجيزة' },
            { mrn: 'DEMO-PAT-002', first: 'سارة', last: 'علي حسن',       dob: '1992-08-23', phone: '01198765432', gender: 'Female', email: 'demo.sara@example.invalid', address: '45 شارع النصر، المعادي، القاهرة' },
            { mrn: 'DEMO-PAT-003', first: 'عمر',  last: 'خالد الشافعي',   dob: '1978-11-15', phone: '01298765433', gender: 'Male', email: 'demo.omar@example.invalid', address: '8 شارع الهرم، الجيزة' },
            { mrn: 'DEMO-PAT-004', first: 'مريم', last: 'يوسف خليل',      dob: '1968-02-05', phone: '01598765434', gender: 'Female', email: 'demo.mariam@example.invalid', address: '22 شارع الثورة، مصر الجديدة، القاهرة' },
            { mrn: 'DEMO-PAT-005', first: 'هاني', last: 'كمال فؤاد',      dob: '1995-06-30', phone: '01098765435', gender: 'Male', email: 'demo.hany@example.invalid', address: '15 طريق النصر، مدينة نصر، القاهرة' }
        ];

        const patients = [];
        for (const p of patientDefs) {
            const firstEnc = encrypt(p.first);
            const lastEnc = encrypt(p.last);
            const dobEnc = encrypt(p.dob);
            const phoneEnc = encrypt(p.phone);
            const addrEnc = encrypt(p.address);
            const emailEnc = encrypt(p.email);

            const firstHash = hash(p.first.toLowerCase());
            const lastHash = hash(p.last.toLowerCase());
            const phoneHash = hash(p.phone);
            const dobHash = hash(p.dob);
            const nameDobHash = buildNameDobHash(p.first, p.last, p.dob);

            const res = await client.query(`
                INSERT INTO patients (
                    mrn, first_name_enc, last_name_enc, date_of_birth_enc, phone_enc, address_enc,
                    gender, email, email_enc, patient_status, preferred_language, communication_preference,
                    first_name_hash, last_name_hash, phone_hash, date_of_birth_hash, name_dob_hash,
                    allergies_enc, chronic_diseases_enc
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7, $8, $9, 'Active', 'Arabic', 'Phone',
                    $10, $11, $12, $13, $14,
                    $15, $16
                )
                ON CONFLICT (mrn) DO UPDATE SET first_name_enc = EXCLUDED.first_name_enc
                RETURNING patient_id, mrn
            `, [
                p.mrn, firstEnc, lastEnc, dobEnc, phoneEnc, addrEnc,
                p.gender, p.email, emailEnc,
                firstHash, lastHash, phoneHash, dobHash, nameDobHash,
                encrypt('لا توجد حساسية مسجلة — عينة تجريبية'),
                encrypt('لا توجد أمراض مزمنة — عينة تجريبية')
            ]);
            patients.push({ ...p, patient_id: res.rows[0].patient_id });
        }

        // 6. Appointments & Clinical Examinations
        const now = new Date();
        const todayAt = (h, m = 0) => {
            const d = new Date(now);
            d.setHours(h, m, 0, 0);
            return d;
        };
        const tomorrowAt = (h, m = 0) => {
            const d = new Date(now.getTime() + 86400000);
            d.setHours(h, m, 0, 0);
            return d;
        };

        const cases = [
            // Case 1: Completed & Finalized with diagnostic report (Brain MRI)
            {
                patient: patients[0],
                modality: modalities['MRI'],
                examType: examTypes['DEMO-MRI-BRAIN'],
                start: todayAt(9, 0),
                end: todayAt(9, 30),
                orderNumber: 'DEMO-ORD-001',
                status: 'Confirmed',
                examStatus: 'Finalized',
                queueStage: 'Finalized',
                station: 'Delivery',
                indication: 'الصداع النصفي المزمن لاستبعاد أي آفة داخل القحف',
                referringDoctorId: referringDocs[0]?.doctor_id,
                report: {
                    content: 'DEMO REPORT: Normal brain MRI examination. No acute intracranial hemorrhage or territorial infarction identified. Normal ventricles and sulci.',
                    finalized: true
                }
            },
            // Case 2: In Exam / Scanning (Chest CT with Contrast)
            {
                patient: patients[1],
                modality: modalities['CT'],
                examType: examTypes['DEMO-CT-CHEST'],
                start: todayAt(11, 0),
                end: todayAt(11, 20),
                orderNumber: 'DEMO-ORD-002',
                status: 'Confirmed',
                examStatus: 'Scanning',
                queueStage: 'In Exam',
                station: 'Modality',
                indication: 'متابعة كحة مستمرة وألم في الصدر',
                referringDoctorId: referringDocs[1]?.doctor_id,
                report: null
            },
            // Case 3: Arrived / Waiting in Reception (Chest X-Ray)
            {
                patient: patients[2],
                modality: modalities['X-Ray'],
                examType: examTypes['DEMO-XR-CHEST'],
                start: todayAt(13, 0),
                end: todayAt(13, 10),
                orderNumber: 'DEMO-ORD-003',
                status: 'Confirmed',
                examStatus: 'Checked-in',
                queueStage: 'Arrived',
                station: 'Reception',
                indication: 'فحص دوري قبل التوظيف',
                referringDoctorId: null,
                report: null
            },
            // Case 4: Scheduled for today afternoon (Abdominal Ultrasound)
            {
                patient: patients[3],
                modality: modalities['Ultrasound'],
                examType: examTypes['DEMO-US-ABDOMEN'],
                start: todayAt(16, 30),
                end: todayAt(16, 50),
                orderNumber: 'DEMO-ORD-004',
                status: 'Confirmed',
                examStatus: 'Scheduled',
                queueStage: 'Scheduled',
                station: 'Reception',
                indication: 'ألم في الجانب الأيمن العلوي للبطن',
                referringDoctorId: referringDocs[1]?.doctor_id,
                report: null
            },
            // Case 5: Scheduled for tomorrow (Lumbar Spine MRI)
            {
                patient: patients[4],
                modality: modalities['MRI'],
                examType: examTypes['DEMO-MRI-LSPINE'],
                start: tomorrowAt(10, 0),
                end: tomorrowAt(10, 30),
                orderNumber: 'DEMO-ORD-005',
                status: 'Confirmed',
                examStatus: 'Scheduled',
                queueStage: 'Scheduled',
                station: 'Reception',
                indication: 'ألم أسفل الظهر يمتد إلى الطرف السفلي الأيمن',
                referringDoctorId: referringDocs[0]?.doctor_id,
                report: null
            }
        ];

        for (const c of cases) {
            const apptRes = await client.query(`
                INSERT INTO appointments (
                    patient_id, modality_id, exam_type_id, start_time, end_time,
                    status, order_number, priority, clinical_indication, notes,
                    created_by, payment_method, payment_amount
                )
                VALUES (
                    $1, $2, $3, $4, $5,
                    $6, $7, 'Routine', $8, 'موعد تجريبي DEMO',
                    $9, 'Cash', $10
                )
                ON CONFLICT (order_number) DO NOTHING
                RETURNING appointment_id
            `, [
                c.patient.patient_id, c.modality.modality_id, c.examType.type_id, c.start, c.end,
                c.status, c.orderNumber, c.indication,
                actorId, c.examType.price
            ]);

            const apptId = apptRes.rows[0]?.appointment_id;
            if (!apptId) continue;

            await client.query(`
                INSERT INTO examinations (
                    appointment_id, patient_id, modality_id, exam_type_id,
                    order_number, status, queue_stage, current_station,
                    clinical_indication, external_referring_doctor_id,
                    report_content, report_status, report_finalized_at,
                    arrived_at, exam_started_at, exam_completed_at
                )
                VALUES (
                    $1, $2, $3, $4,
                    $5, $6, $7, $8,
                    $9, $10,
                    $11, $12, $13,
                    $14, $15, $16
                )
            `, [
                apptId, c.patient.patient_id, c.modality.modality_id, c.examType.type_id,
                c.orderNumber, c.examStatus, c.queueStage, c.station,
                c.indication, c.referringDoctorId || null,
                c.report?.content || null,
                c.report?.finalized ? 'Finalized' : 'Draft',
                c.report?.finalized ? c.end : null,
                ['Arrived', 'In Exam', 'Finalized'].includes(c.queueStage) ? c.start : null,
                ['In Exam', 'Finalized'].includes(c.queueStage) ? c.start : null,
                c.queueStage === 'Finalized' ? c.end : null
            ]);
        }

        await client.query('COMMIT');

        logger.info('Demo clinical dataset successfully seeded into database', {
            roomsCount: Object.keys(rooms).length,
            modalitiesCount: Object.keys(modalities).length,
            examTypesCount: Object.keys(examTypes).length,
            patientsCount: patients.length,
            appointmentsCount: cases.length
        });

        return {
            seeded: true,
            message: 'تم إضافة البيانات السريرية التجريبية بنجاح.',
            summary: {
                rooms: Object.keys(rooms).length,
                modalities: Object.keys(modalities).length,
                examTypes: Object.keys(examTypes).length,
                referringDoctors: referringDocs.length,
                patients: patients.length,
                appointments: cases.length
            }
        };
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Failed to seed demo data', { error: err.message });
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Safely remove all demo records from the database.
 */
async function clearDemoData(pool) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Delete examinations linked to demo appointments
        await client.query("DELETE FROM examinations WHERE order_number LIKE 'DEMO-%'");

        // Delete demo appointments
        const apptRes = await client.query("DELETE FROM appointments WHERE order_number LIKE 'DEMO-%' RETURNING appointment_id");

        // Delete demo patients
        const patRes = await client.query("DELETE FROM patients WHERE mrn LIKE 'DEMO-%' RETURNING patient_id");

        // Delete demo examination types
        await client.query("DELETE FROM examination_types WHERE code LIKE 'DEMO-%'");

        // Delete demo modalities
        const modRes = await client.query(`
            DELETE FROM modalities
            WHERE room_number LIKE 'R-%'
              AND (name IN ('Siemens Magnetom 1.5T', 'GE Revolution CT 128', 'Philips DigitalDiagnost', 'Canon Aplio i800')
                   OR aet LIKE 'VIARA_%')
            RETURNING modality_id
        `);

        // Delete demo rooms
        const roomRes = await client.query("DELETE FROM rooms WHERE room_number LIKE 'R-%' AND notes LIKE '%DEMO%' RETURNING room_id");

        // Delete demo referring doctors
        await client.query("DELETE FROM referring_doctors WHERE notes LIKE '%DEMO%' OR email LIKE '%@example.com'");

        await client.query('COMMIT');

        logger.info('Demo data cleared from database', {
            deletedAppointments: apptRes.rowCount,
            deletedPatients: patRes.rowCount,
            deletedModalities: modRes.rowCount,
            deletedRooms: roomRes.rowCount
        });

        return {
            cleared: true,
            message: 'تم حذف البيانات التجريبية بنجاح والعودة لقاعدة بيانات نظيفة.',
            deleted: {
                appointments: apptRes.rowCount,
                patients: patRes.rowCount,
                modalities: modRes.rowCount,
                rooms: roomRes.rowCount
            }
        };
    } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Failed to clear demo data', { error: err.message });
        throw err;
    } finally {
        client.release();
    }
}

module.exports = {
    getDemoStatus,
    seedDemoData,
    clearDemoData
};
