const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const seedPassword = process.env.TEST_USER_PASSWORD;
if (!seedPassword) {
    console.error('❌ TEST_USER_PASSWORD is not set. Aborting to avoid seeding with a known weak password.');
    process.exit(1);
}

// Use the central encryption utilities so data is written in v2 (AES-GCM) format
const { encrypt } = require('./src/utils/crypto');

// Database connection
const connectionString = process.env.DATABASE_URL || 'postgresql://***REMOVED***/rcms';
const pool = new Pool({ connectionString });

// Egyptian names database
const firstNames = {
    male: ['Ahmed', 'Mohamed', 'Mahmoud', 'Ali', 'Omar', 'Youssef', 'Hassan', 'Khaled', 'Amr', 'Tamer', 'Sherif', 'Karim', 'Hany', 'Essam', 'Rami'],
    female: ['Fatma', 'Mona', 'Heba', 'Nour', 'Sara', 'Mai', 'Dina', 'Rana', 'Mariam', 'Yasmin', 'Aya', 'Salma', 'Noha', 'Laila', 'Hania']
};
const lastNames = ['Ibrahim', 'Hassan', 'Ali', 'Mohamed', 'Mahmoud', 'Khalil', 'Shafik', 'Farouk', 'Naguib', 'Saad', 'Mansour', 'Fouad', 'Amin', 'Kamal', 'Zaki'];

// Utility functions
const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
const randomPhone = () => `01${randomElement(['0', '1', '2', '5'])}${String(randomInt(10000000, 99999999))}`;
const randomAddress = () => {
    const streets = ['El-Tahrir St', 'Ramses St', 'Salah Salem St', 'El-Haram St', 'Kornish El-Nile'];
    const districts = ['Nasr City', 'Heliopolis', 'Maadi', 'Dokki', 'Zamalek', 'New Cairo', '6th October'];
    return `${randomInt(1, 200)} ${randomElement(streets)}, ${randomElement(districts)}, Cairo, Egypt`;
};
const toIsoDate = (value) => value.toISOString().split('T')[0];
const randomFutureDate = (daysAhead = 365) => new Date(Date.now() + randomInt(1, daysAhead) * 24 * 60 * 60 * 1000);
const randomPastDate = (daysBack = 365) => new Date(Date.now() - randomInt(1, daysBack) * 24 * 60 * 60 * 1000);
const makeDicomUid = () => `2.25.${BigInt(`0x${crypto.randomBytes(16).toString('hex')}`).toString()}`;
const slugCode = (value) => String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

const reportFindingsByModality = {
    MRI: [
        'No acute intracranial abnormality.',
        'Mild degenerative changes are noted without nerve root compression.',
        'Meniscal signal change is seen without definite tear.',
    ],
    CT: [
        'No focal consolidation or pleural effusion is identified.',
        'Mild sinus mucosal thickening is present.',
        'No acute intra-abdominal pathology is detected.',
    ],
    'X-Ray': [
        'Cardiomediastinal silhouette is within normal size limits.',
        'No acute osseous abnormality is seen on this exam.',
        'Mild spondylotic change is present.',
    ],
    Ultrasound: [
        'No focal lesion is identified in the examined organ.',
        'Mild fatty change is suggested by increased echogenicity.',
        'Normal flow pattern is preserved on Doppler evaluation.',
    ],
    PET: [
        'No abnormal hypermetabolic focus is detected.',
        'Physiologic tracer distribution is seen without suspicious uptake.',
        'Mild nonspecific uptake is present in the imaged region.',
    ],
    Mammography: [
        'No suspicious microcalcifications are identified.',
        'Benign appearing fibroglandular tissue is seen.',
        'No interval architectural distortion is demonstrated.',
    ],
};

const reportImpressionsByModality = {
    MRI: [
        'Normal MRI study.',
        'Degenerative changes without acute abnormality.',
        'No evidence of a focal lesion.',
    ],
    CT: [
        'No acute CT abnormality.',
        'Mild inflammatory change only.',
        'Essentially unremarkable CT findings.',
    ],
    'X-Ray': [
        'No acute radiographic abnormality.',
        'Mild chronic degenerative change.',
        'Stable plain film appearance.',
    ],
    Ultrasound: [
        'Unremarkable ultrasound study.',
        'Mild diffuse parenchymal change.',
        'No sonographic correlate for symptoms.',
    ],
    PET: [
        'No abnormal metabolic activity.',
        'Negative PET-CT for suspicious uptake.',
        'No focal hypermetabolic lesion.',
    ],
    Mammography: [
        'Benign mammographic appearance.',
        'No suspicious mammographic lesion.',
        'Stable screening mammogram.',
    ],
};

const buildReportSections = (modalityType, examName) => ({
    findings: randomElement(reportFindingsByModality[modalityType] || ['No acute abnormality is identified.']),
    impression: randomElement(reportImpressionsByModality[modalityType] || ['Unremarkable exam.']),
    technique: `Standard ${examName} protocol was performed with multiplanar reformats where applicable.`,
});

async function clearDatabase() {
    console.log('🗑️  Clearing existing data...');
    const tables = [
        'system_logs', 'report_versions', 'result_deliveries', 'insurance_claims',
        'insurance_approvals', 'insurance_coverage_rules', 'patient_insurance_policies',
        'refunds', 'payments', 'cashier_closures', 'cashier_shifts', 'invoice_items',
        'invoices', 'examinations', 'appointments', 'equipment_downtime',
        'equipment_maintenance', 'service_contracts', 'patients', 'contracts',
        'insurance_providers', 'referring_doctors', 'report_templates',
        'examination_types', 'modalities', 'inventory', 'staff', 'users'
    ];

    for (const table of tables) {
        try {
            await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
            console.log(`   ✓ Cleared ${table}`);
        } catch (err) {
            console.log(`   ⚠ Table ${table} may not exist: ${err.message}`);
        }
    }
}

async function seedUsers() {
    console.log('\n👥 Seeding Users...');
    const password = await bcrypt.hash(seedPassword, 10);

    const users = [
        { name: 'Dr. Administrator', email: 'admin@rcms.com', role: 'Admin' },
        { name: 'John Accountant', email: 'accountant@rcms.com', role: 'Accountant' },
        { name: 'Mona Cashier', email: 'cashier@rcms.com', role: 'Cashier' },
        { name: 'Sarah Receptionist', email: 'reception@rcms.com', role: 'Receptionist' },
        { name: 'HR Manager', email: 'hr@rcms.com', role: 'HR' },
        { name: 'Salma Insurance', email: 'insurance@rcms.com', role: 'Insurance_Staff' },
        { name: 'Dr. Ahmed Hassan', email: 'ahmed.hassan@rcms.com', role: 'Radiologist' },
        { name: 'Dr. Mona Ibrahim', email: 'mona.ibrahim@rcms.com', role: 'Radiologist' },
        { name: 'Dr. Omar Khalil', email: 'omar.khalil@rcms.com', role: 'Radiologist' },
        { name: 'Dr. Fatma Saad', email: 'fatma.saad@rcms.com', role: 'Radiologist' },
        { name: 'Tech. Mohamed Ali', email: 'mohamed.tech@rcms.com', role: 'Technician' },
        { name: 'Tech. Sara Mahmoud', email: 'sara.tech@rcms.com', role: 'Technician' },
        { name: 'Nurse Heba Fouad', email: 'heba.nurse@rcms.com', role: 'Nurse' },
        { name: 'Nurse Dina Kamal', email: 'dina.nurse@rcms.com', role: 'Nurse' },
        { name: 'Dr. Hossam Referring', email: 'hossam.ref@rcms.com', role: 'Referring_Doctor' },
        { name: 'Marketing Lead', email: 'marketing@rcms.com', role: 'Marketing' },
    ];

    const userIds = [];
    for (const user of users) {
        const result = await pool.query(
            `INSERT INTO users (full_name, email, password_hash, role, is_active) 
             VALUES ($1, $2, $3, $4, TRUE) RETURNING user_id`,
            [user.name, user.email, password, user.role]
        );
        userIds.push({ ...user, id: result.rows[0].user_id });
        console.log(`   ✓ Created ${user.role}: ${user.name}`);
    }
    return userIds;
}

async function seedModalities() {
    console.log('\n🏥 Seeding Modalities...');
    const modalities = [
        { name: 'MRI-01 Siemens Skyra', type: 'MRI', room: 'Room 101', status: 'Active', serial: 'MRI-SKY-001', manufacturer: 'Siemens Healthineers', model: 'MAGNETOM Skyra 3T', installationDate: '2021-02-10', location: 'Imaging Wing A', aet: 'RCMS_MRI_01', ipAddress: '127.0.0.11', port: 11112, dicomSynced: true },
        { name: 'MRI-02 GE Signa', type: 'MRI', room: 'Room 102', status: 'Active', serial: 'MRI-GE-002', manufacturer: 'GE HealthCare', model: 'SIGNA Architect', installationDate: '2022-01-18', location: 'Imaging Wing A', aet: 'RCMS_MRI_02', ipAddress: '127.0.0.12', port: 11113, dicomSynced: true },
        { name: 'CT-01 Philips iCT', type: 'CT', room: 'Room 201', status: 'Active', serial: 'CT-PH-001', manufacturer: 'Philips', model: 'iCT 256', installationDate: '2021-09-01', location: 'Imaging Wing B', aet: 'RCMS_CT_01', ipAddress: '127.0.0.21', port: 11114, dicomSynced: true },
        { name: 'CT-02 GE Revolution', type: 'CT', room: 'Room 202', status: 'Active', serial: 'CT-GE-002', manufacturer: 'GE HealthCare', model: 'Revolution EVO', installationDate: '2022-04-20', location: 'Imaging Wing B', aet: 'RCMS_CT_02', ipAddress: '127.0.0.22', port: 11115, dicomSynced: true },
        { name: 'X-Ray-01 Main', type: 'X-Ray', room: 'Room 301', status: 'Active', serial: 'XR-MAIN-001', manufacturer: 'Carestream', model: 'DRX-Evolution', installationDate: '2020-07-12', location: 'Radiography Hall', aet: 'RCMS_XRAY_01', ipAddress: '127.0.0.31', port: 11116, dicomSynced: true },
        { name: 'X-Ray-02 Portable', type: 'X-Ray', room: 'Room 302', status: 'Active', serial: 'XR-PORT-002', manufacturer: 'Shimadzu', model: 'MobileDaRt Evolution', installationDate: '2023-03-11', location: 'Radiography Hall', aet: 'RCMS_XRAY_02', ipAddress: '127.0.0.32', port: 11117, dicomSynced: true },
        { name: 'US-01 GE Voluson', type: 'Ultrasound', room: 'Room 401', status: 'Active', serial: 'US-GE-001', manufacturer: 'GE HealthCare', model: 'Voluson E10', installationDate: '2021-05-22', location: 'Ultrasound Suite', aet: 'RCMS_US_01', ipAddress: '127.0.0.41', port: 11118, dicomSynced: true },
        { name: 'US-02 Philips EPIQ', type: 'Ultrasound', room: 'Room 402', status: 'Active', serial: 'US-PH-002', manufacturer: 'Philips', model: 'EPIQ Elite', installationDate: '2022-08-09', location: 'Ultrasound Suite', aet: 'RCMS_US_02', ipAddress: '127.0.0.42', port: 11119, dicomSynced: true },
        { name: 'PET-CT-01 Siemens', type: 'PET-CT', room: 'Room 501', status: 'Active', serial: 'PET-001', manufacturer: 'Siemens Healthineers', model: 'Biograph Vision', installationDate: '2023-06-15', location: 'Nuclear Medicine', aet: 'RCMS_PET_01', ipAddress: '127.0.0.51', port: 11120, dicomSynced: true },
        { name: 'Mammo-01 Hologic', type: 'Mammography', room: 'Room 601', status: 'Active', serial: 'MAMMO-001', manufacturer: 'Hologic', model: 'Selenia Dimensions', installationDate: '2020-11-05', location: 'Breast Imaging', aet: 'RCMS_MAMMO_01', ipAddress: '127.0.0.61', port: 11121, dicomSynced: true },
        { name: 'Cath Lab-01', type: 'Cath Lab', room: 'Room 701', status: 'Active', serial: 'CATH-001', manufacturer: 'Philips', model: 'Azurion 7', installationDate: '2023-01-10', location: 'Cardiac Suite', aet: 'RCMS_CATH_01', ipAddress: '127.0.0.71', port: 11122, dicomSynced: true },
        { name: 'Fluoro-01', type: 'Fluoroscopy', room: 'Room 801', status: 'Active', serial: 'FLUO-001', manufacturer: 'Siemens Healthineers', model: 'Luminos Agile', installationDate: '2021-12-07', location: 'Procedures Room', aet: 'RCMS_FLUO_01', ipAddress: '127.0.0.81', port: 11123, dicomSynced: true },
        { name: 'DEXA-01', type: 'DEXA', room: 'Room 901', status: 'Active', serial: 'DEXA-001', manufacturer: 'Hologic', model: 'Horizon W', installationDate: '2022-10-24', location: 'Bone Density', aet: 'RCMS_DEXA_01', ipAddress: '127.0.0.91', port: 11124, dicomSynced: true },
        { name: 'Panoramic-01', type: 'Panoramic X-Ray', room: 'Room 1001', status: 'Active', serial: 'PANO-001', manufacturer: 'Carestream', model: 'CS 8100 3D', installationDate: '2024-02-19', location: 'Dental Imaging', aet: 'RCMS_PANO_01', ipAddress: '127.0.0.101', port: 11125, dicomSynced: true },
        { name: 'CT-03 Siemens SOMATOM', type: 'CT', room: 'Room 203', status: 'Active', serial: 'CT-SI-003', manufacturer: 'Siemens Healthineers', model: 'SOMATOM Edge', installationDate: '2023-08-14', location: 'Imaging Wing B', aet: 'RCMS_CT_03', ipAddress: '127.0.0.23', port: 11126, dicomSynced: true },
        { name: 'MRI-03 Canon Vidor', type: 'MRI', room: 'Room 103', status: 'Active', serial: 'MRI-CA-003', manufacturer: 'Canon Medical', model: 'Vantage Oria 1.5T', installationDate: '2022-11-30', location: 'Imaging Wing A', aet: 'RCMS_MRI_03', ipAddress: '127.0.0.13', port: 11127, dicomSynced: true },
        { name: 'X-Ray-03 Digital', type: 'X-Ray', room: 'Room 303', status: 'Active', serial: 'XR-DIG-003', manufacturer: 'Fujifilm', model: 'CR IR Comfort', installationDate: '2021-06-18', location: 'Radiography Hall', aet: 'RCMS_XRAY_03', ipAddress: '127.0.0.33', port: 11128, dicomSynced: true },
        { name: 'US-03 Point of Care', type: 'Ultrasound', room: 'Room 403', status: 'Active', serial: 'US-POC-003', manufacturer: 'Philips', model: 'Lumify', installationDate: '2023-05-22', location: 'Ultrasound Suite', aet: 'RCMS_US_03', ipAddress: '127.0.0.43', port: 11129, dicomSynced: true },
        { name: 'PET-CT-02 GE', type: 'PET-CT', room: 'Room 502', status: 'Active', serial: 'PET-GE-002', manufacturer: 'GE HealthCare', model: 'Discovery MI DR', installationDate: '2024-03-10', location: 'Nuclear Medicine', aet: 'RCMS_PET_02', ipAddress: '127.0.0.52', port: 11130, dicomSynced: true },
        { name: 'Mammo-02 Siemens', type: 'Mammography', room: 'Room 602', status: 'Active', serial: 'MAMMO-002', manufacturer: 'Siemens Healthineers', model: 'MAMMOMTOmat DBT', installationDate: '2022-09-15', location: 'Breast Imaging', aet: 'RCMS_MAMMO_02', ipAddress: '127.0.0.62', port: 11131, dicomSynced: true },
        { name: 'DEXA-02', type: 'DEXA', room: 'Room 902', status: 'Under Maintenance', serial: 'DEXA-002', manufacturer: 'GE Healthcare', model: 'Lunar iDXA', installationDate: '2021-04-08', location: 'Bone Density', aet: 'RCMS_DEXA_02', ipAddress: '127.0.0.92', port: 11132, dicomSynced: false },
    ];

    const modalityIds = [];
    for (const mod of modalities) {
        const result = await pool.query(
            `INSERT INTO modalities (
                name, type, room_number, status, maintenance_schedule, aet, ip_address, port,
                dicom_synced, serial_number, manufacturer, model, installation_date, location
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING modality_id`,
            [
                mod.name,
                mod.type,
                mod.room,
                mod.status,
                JSON.stringify({ next_service_due: toIsoDate(randomFutureDate(120)), quarterly_calibration: toIsoDate(randomFutureDate(90)) }),
                mod.aet,
                mod.ipAddress,
                mod.port,
                mod.dicomSynced,
                mod.serial,
                mod.manufacturer,
                mod.model,
                mod.installationDate,
                mod.location,
            ]
        );
        modalityIds.push({ ...mod, id: result.rows[0].modality_id });
    }
    console.log(`   ✓ Created ${modalities.length} modalities`);
    return modalityIds;
}

async function seedExaminationTypes(modalityIds) {
    console.log('\n🔬 Seeding Examination Types...');

    // Create examination_types table if it doesn't exist
    await pool.query(`
        CREATE TABLE IF NOT EXISTS examination_types (
            type_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(100) NOT NULL,
            modality_id UUID REFERENCES modalities(modality_id),
            price DECIMAL(10, 2),
            duration_minutes INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const examTypes = [
        // MRI
        { name: 'Brain MRI', code: 'MRI-BRAIN', modalityType: 'MRI', price: 3500, duration: 45, bodyPart: 'Brain', preparation: 'Remove all metal objects before the scan.', contrast: true },
        { name: 'Spine MRI', code: 'MRI-SPINE', modalityType: 'MRI', price: 3200, duration: 40, bodyPart: 'Spine', preparation: 'Wear comfortable clothing with no metal.', contrast: false },
        { name: 'Knee MRI', code: 'MRI-KNEE', modalityType: 'MRI', price: 2800, duration: 35, bodyPart: 'Knee', preparation: 'Avoid lotions and metallic objects.', contrast: false },
        { name: 'Abdomen MRI', code: 'MRI-ABDOMEN', modalityType: 'MRI', price: 4000, duration: 50, bodyPart: 'Abdomen', preparation: 'Fasting for 4 hours may be requested.', contrast: true },
        // CT
        { name: 'Brain CT', code: 'CT-BRAIN', modalityType: 'CT', price: 1500, duration: 20, bodyPart: 'Brain', preparation: 'Remove metal accessories before the exam.', contrast: false },
        { name: 'Chest CT', code: 'CT-CHEST', modalityType: 'CT', price: 1800, duration: 25, bodyPart: 'Chest', preparation: 'Fasting is not required unless contrast is used.', contrast: true },
        { name: 'Abdomen CT', code: 'CT-ABDOMEN', modalityType: 'CT', price: 2000, duration: 30, bodyPart: 'Abdomen', preparation: 'Fasting for 4 hours may be requested.', contrast: true },
        { name: 'CT Angiography', code: 'CT-ANGIO', modalityType: 'CT', price: 2500, duration: 35, bodyPart: 'Vascular', preparation: 'IV access is required for contrast injection.', contrast: true },
        // X-Ray
        { name: 'Chest X-Ray', code: 'XR-CHEST', modalityType: 'X-Ray', price: 300, duration: 10, bodyPart: 'Chest', preparation: 'Remove all jewelry and metal items.', contrast: false },
        { name: 'Spine X-Ray', code: 'XR-SPINE', modalityType: 'X-Ray', price: 400, duration: 15, bodyPart: 'Spine', preparation: 'Wear loose clothing and remove metal.', contrast: false },
        { name: 'Extremity X-Ray', code: 'XR-EXTREMITY', modalityType: 'X-Ray', price: 350, duration: 10, bodyPart: 'Extremity', preparation: 'Remove rings, watches, and bracelets.', contrast: false },
        { name: 'Dental Panoramic X-Ray', code: 'XR-PANO', modalityType: 'Panoramic X-Ray', price: 450, duration: 12, bodyPart: 'Jaws', preparation: 'Remove earrings, dentures, and glasses.', contrast: false },
        // Ultrasound
        { name: 'Abdominal Ultrasound', code: 'US-ABDOMEN', modalityType: 'Ultrasound', price: 600, duration: 30, bodyPart: 'Abdomen', preparation: 'Fasting for 6 hours is preferred.', contrast: false },
        { name: 'Pelvic Ultrasound', code: 'US-PELVIS', modalityType: 'Ultrasound', price: 650, duration: 25, bodyPart: 'Pelvis', preparation: 'Drink water and avoid urinating before the exam.', contrast: false },
        { name: 'Cardiac Echo', code: 'US-ECHO', modalityType: 'Ultrasound', price: 800, duration: 40, bodyPart: 'Heart', preparation: 'No special preparation required.', contrast: false },
        // PET
        { name: 'Whole Body PET-CT', code: 'PET-WHOLE', modalityType: 'PET', price: 8000, duration: 90, bodyPart: 'Whole body', preparation: 'Fasting is required before tracer injection.', contrast: true },
        { name: 'Oncology PET-CT', code: 'PET-ONC', modalityType: 'PET-CT', price: 8500, duration: 95, bodyPart: 'Whole body', preparation: 'Hydrate well after the tracer is administered.', contrast: true },
        // Mammography
        { name: 'Screening Mammogram', code: 'MAMMO-SCREEN', modalityType: 'Mammography', price: 700, duration: 20, bodyPart: 'Breast', preparation: 'Avoid deodorant and powders on the day of the exam.', contrast: false },
        { name: 'Diagnostic Mammogram', code: 'MAMMO-DIAG', modalityType: 'Mammography', price: 900, duration: 25, bodyPart: 'Breast', preparation: 'Bring prior breast imaging if available.', contrast: false },
        // Specialized
        { name: 'Coronary Angiography', code: 'CATH-ANGIO', modalityType: 'Cath Lab', price: 12000, duration: 120, bodyPart: 'Heart', preparation: 'Consent and pre-procedure labs are required.', contrast: true },
        { name: 'Barium Swallow', code: 'FLUO-BARIUM', modalityType: 'Fluoroscopy', price: 1800, duration: 30, bodyPart: 'Esophagus', preparation: 'Do not eat or drink for 6 hours before the exam.', contrast: true },
        { name: 'Bone Density DEXA', code: 'DEXA-BONE', modalityType: 'DEXA', price: 1000, duration: 15, bodyPart: 'Spine/Hip', preparation: 'Avoid calcium supplements for 24 hours.', contrast: false },
        { name: 'Cardiac CT Angiography', code: 'CT-CARD-ANGIO', modalityType: 'CT', price: 2800, duration: 35, bodyPart: 'Heart', preparation: 'Beta-blocker premedication may be required.', contrast: true },
        { name: 'CT Chest/Abdomen/Pelvis', code: 'CT-CAP', modalityType: 'CT', price: 3500, duration: 45, bodyPart: 'Chest/Abdomen/Pelvis', preparation: 'Fasting for 4 hours and IV contrast administration.', contrast: true },
        { name: 'CT Colonography', code: 'CT-COLORECTAL', modalityType: 'CT', price: 3000, duration: 40, bodyPart: 'Colon', preparation: 'Full bowel prep required 24 hours prior.', contrast: true },
        { name: 'Brain MRI with Contrast', code: 'MRI-BRAIN-CONTRAST', modalityType: 'MRI', price: 4200, duration: 50, bodyPart: 'Brain', preparation: 'Remove all metal objects. Gadolinium contrast will be administered.', contrast: true },
        { name: 'MR Angiography', code: 'MRI-ANGIO', modalityType: 'MRI', price: 4500, duration: 55, bodyPart: 'Vascular', preparation: 'Fasting for 2 hours. Contrast may be used.', contrast: true },
        { name: 'Liver MRI', code: 'MRI-LIVER', modalityType: 'MRI', price: 4000, duration: 50, bodyPart: 'Liver', preparation: 'Fasting for 6 hours before contrast administration.', contrast: true },
        { name: 'Joint MRI (Shoulder)', code: 'MRI-SHOULDER', modalityType: 'MRI', price: 3000, duration: 35, bodyPart: 'Shoulder', preparation: 'Remove all metal accessories.', contrast: false },
        { name: 'CT Head with Contrast', code: 'CT-HEAD-CONTRAST', modalityType: 'CT', price: 2000, duration: 25, bodyPart: 'Brain', preparation: 'Remove metal objects. IV contrast administered.', contrast: true },
        { name: 'Abdominal CT with Oral Contrast', code: 'CT-ABDOMEN-ORAL', modalityType: 'CT', price: 2200, duration: 35, bodyPart: 'Abdomen', preparation: 'Drink oral contrast solution 45 minutes prior to exam.', contrast: true },
        { name: 'Lower Extremity X-Ray', code: 'XR-LOWER-EXTREMITIES', modalityType: 'X-Ray', price: 400, duration: 15, bodyPart: 'Legs/Feet', preparation: 'Remove jewelry and metal items.', contrast: false },
        { name: 'Upper Extremity X-Ray', code: 'XR-UPPER-EXTREMITIES', modalityType: 'X-Ray', price: 350, duration: 10, bodyPart: 'Arms/Hands', preparation: 'Remove jewelry and metal items.', contrast: false },
        { name: 'Abdominal Ultrasound with Doppler', code: 'US-ABDOMEN-DOPPLER', modalityType: 'Ultrasound', price: 700, duration: 35, bodyPart: 'Abdomen', preparation: 'Fasting for 6-8 hours before the exam.', contrast: false },
        { name: 'Gynecological Ultrasound', code: 'US-GYN', modalityType: 'Ultrasound', price: 650, duration: 25, bodyPart: 'Pelvis', preparation: 'Full bladder required. Drink water 1 hour prior.', contrast: false },
        { name: 'Echocardiogram with Doppler', code: 'US-ECHO-DOPPLER', modalityType: 'Ultrasound', price: 950, duration: 45, bodyPart: 'Heart', preparation: 'No special preparation required.', contrast: false },
        { name: 'Vascular Duplex Ultrasound', code: 'US-VASCULAR', modalityType: 'Ultrasound', price: 800, duration: 40, bodyPart: 'Arms/Legs', preparation: 'No preparation needed unless otherwise directed.', contrast: false },
        { name: 'PET-CT for Oncology Follow-up', code: 'PET-ONCO-FOLLOWUP', modalityType: 'PET-CT', price: 8500, duration: 95, bodyPart: 'Whole body', preparation: 'Fasting for 6 hours. Hydration recommended post-injection.', contrast: true },
        { name: 'Diagnostic Mammogram with Ultrasound', code: 'MAMMO-US-COMBO', modalityType: 'Mammography', price: 1200, duration: 40, bodyPart: 'Breast', preparation: 'Avoid deodorant, lotions, and powders.', contrast: false },
        { name: 'Breast MRI', code: 'MRI-BREAST', modalityType: 'MRI', price: 4800, duration: 60, bodyPart: 'Breast', preparation: 'Remove all metal. Gadolinium contrast administered.', contrast: true },
        { name: 'DEXA Spine and Hip', code: 'DEXA-SPINE-HIP', modalityType: 'DEXA', price: 1200, duration: 20, bodyPart: 'Spine/Hip', preparation: 'Avoid calcium supplements 24 hours prior.', contrast: false },
    ];

    const typeIds = [];
    for (const exam of examTypes) {
        const modality = modalityIds.find(m => m.type === exam.modalityType);
        if (modality) {
            const result = await pool.query(
                `INSERT INTO examination_types (
                    code, name, modality_id, price, duration_minutes, body_part,
                    preparation_instructions, contrast_required
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING type_id`,
                [exam.code || slugCode(exam.name), exam.name, modality.id, exam.price, exam.duration, exam.bodyPart || null, exam.preparation || null, Boolean(exam.contrast)]
            );
            typeIds.push({ ...exam, id: result.rows[0].type_id, modalityId: modality.id });
        }
    }
    console.log(`   ✓ Created ${typeIds.length} examination types`);
    return typeIds;
}

async function seedReferringDoctors(userIds) {
    console.log('\n🩺 Seeding Referring Doctors...');
    const admin = userIds.find(user => user.role === 'Admin');
    const doctors = [
        { name: 'Dr. Hossam Refaat', specialty: 'Internal Medicine', hospital: 'Cairo Medical Center' },
        { name: 'Dr. Nadia Khalil', specialty: 'Orthopedics', hospital: 'Heliopolis Orthopedic Clinic' },
        { name: 'Dr. Tarek Mostafa', specialty: 'Cardiology', hospital: 'Royal Heart Clinic' },
        { name: 'Dr. Rania Fathy', specialty: 'Neurology', hospital: 'Nile Neuro Center' },
        { name: 'Dr. Karim Youssef', specialty: 'Gastroenterology', hospital: 'Delta Specialty Hospital' },
        { name: 'Dr. Mona ElSayed', specialty: 'Ob/Gyn', hospital: 'Women Care Clinic' },
        { name: 'Dr. Ahmed Aboulela', specialty: 'Oncology', hospital: 'Hope Oncology Center' },
        { name: 'Dr. Laila Mounir', specialty: 'Family Medicine', hospital: 'Green Valley Clinic' },
    ];

    const referringDoctorIds = [];
    for (const doctor of doctors) {
        const result = await pool.query(
            `INSERT INTO referring_doctors (
                full_name, specialty, clinic_hospital, phone, email, address,
                tax_id, referral_source_category, commission_percentage,
                preferred_contact_method, is_active, notes, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Doctor', $8, 'Email', TRUE, $9, $10)
            RETURNING doctor_id`,
            [
                doctor.name,
                doctor.specialty,
                doctor.hospital,
                randomPhone(),
                `${doctor.name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/\.+$/, '')}@example.com`,
                randomAddress(),
                `TAX-${randomInt(100000, 999999)}`,
                randomInt(5, 12),
                `Referral partner for ${doctor.specialty.toLowerCase()} cases.`,
                admin?.id || null,
            ]
        );
        referringDoctorIds.push({ ...doctor, id: result.rows[0].doctor_id });
    }
    console.log(`   ✓ Created ${referringDoctorIds.length} referring doctors`);
    return referringDoctorIds;
}

async function seedPatients(count = 150) {
    console.log(`\n🧑‍⚕️  Seeding ${count} Patients...`);
    const patientIds = [];

    for (let i = 0; i < count; i++) {
        const gender = randomElement(['Male', 'Female']);
        const firstName = randomElement(firstNames[gender.toLowerCase()]);
        const lastName = randomElement(lastNames);
        const dob = randomDate(new Date(1940, 0, 1), new Date(2010, 0, 1));
        const phone = randomPhone();
        const address = randomAddress();
        const mrn = `PAT-${String(i + 1).padStart(6, '0')}`;

        const result = await pool.query(
            `INSERT INTO patients (
                mrn, first_name_enc, last_name_enc, date_of_birth_enc, 
                phone_enc, address_enc, gender
            ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING patient_id`,
            [
                mrn,
                encrypt(firstName),
                encrypt(lastName),
                encrypt(dob.toISOString().split('T')[0]),
                encrypt(phone),
                encrypt(address),
                gender
            ]
        );

        patientIds.push(result.rows[0].patient_id);

        if ((i + 1) % 50 === 0) {
            console.log(`   ✓ Created ${i + 1}/${count} patients`);
        }
    }
    console.log(`   ✅ Completed ${count} patients`);
    return patientIds;
}

async function seedAppointmentsAndExams(patientIds, modalityIds, examTypes, userIds, referringDoctors = []) {
    console.log('\n📅 Seeding Appointments and Examinations...');

    const radiologists = userIds.filter(u => u.role === 'Radiologist');
    const technicians = userIds.filter(u => u.role === 'Technician');
    const nurses = userIds.filter(u => u.role === 'Nurse');
    const receptionists = userIds.filter(u => u.role === 'Receptionist');
    const finalizingRadiologists = radiologists.length ? radiologists : userIds.filter(u => u.role === 'Admin');

    // Generate appointments for the last 90 days
    const appointmentCount = 600;
    const now = new Date();
    const startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days ago

    let appointmentsCreated = 0;
    let examsCreated = 0;
    const finalizedExams = [];

    for (let i = 0; i < appointmentCount; i++) {
        const examType = randomElement(examTypes);
        const modality = modalityIds.find(m => m.id === examType.modalityId);
        const patient = randomElement(patientIds);
        const radiologist = randomElement(finalizingRadiologists);
        const technician = randomElement(technicians);
        const nurse = randomElement(nurses);
        const createdBy = randomElement(receptionists);
        const referringDoctor = referringDoctors.length && Math.random() > 0.35 ? randomElement(referringDoctors) : null;

        // Random appointment time in the past 90 days
        const appointmentDate = randomDate(startDate, now);
        const startTime = new Date(appointmentDate);
        startTime.setHours(randomInt(8, 17), randomInt(0, 3) * 15, 0); // 8am-5pm, 15-min intervals
        const endTime = new Date(startTime.getTime() + examType.duration * 60000);

        // Determine status based on time
        const isInPast = startTime < now;
        const appointmentStatus = isInPast ? randomElement(['Confirmed', 'Confirmed', 'Confirmed', 'Cancelled']) : 'Confirmed';
        const appointmentSource = randomElement(['Walk-in', 'Phone', 'Website', 'Patient Portal', 'Doctor Portal', 'Call Center']);
        const priority = randomElement(['Routine', 'Routine', 'Urgent', 'Emergency']);
        const orderNumber = `ORD-${String(i + 1).padStart(6, '0')}`;
        const clinicalIndication = randomElement([
            'Persistent headache and dizziness',
            'Chronic low back pain',
            'Follow-up for known mass',
            'Chest pain and shortness of breath',
            'Abdominal pain and bloating',
            'Pre-operative workup',
            'Knee pain after sports injury',
            'Evaluation of abnormal laboratory results',
        ]);
        const provisionalDiagnosis = randomElement([
            'Rule out inflammatory process',
            'Assessment of degenerative disease',
            'Suspected soft tissue injury',
            'Possible metabolic abnormality',
            'Routine diagnostic follow-up',
            'Pre-treatment baseline imaging',
        ]);
        const preparationStatus = examType.contrast ? randomElement(['Pending', 'Completed']) : 'Not Required';

        try {
            // Insert appointment - using only core columns from schema
            const apptResult = await pool.query(
                `INSERT INTO appointments (
                    patient_id, modality_id, exam_type_id, start_time, end_time,
                    status, order_number, priority, clinical_indication, provisional_diagnosis,
                    body_part, contrast_required, created_by, referring_doctor_id, referring_doctor,
                    technician_id, nurse_id, radiologist_id, payment_method, payment_amount,
                    appointment_source, preparation_status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::order_priority, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
                RETURNING appointment_id`,
                [
                    patient, modality.id, examType.id, startTime, endTime,
                    appointmentStatus, orderNumber, priority, clinicalIndication, provisionalDiagnosis,
                    examType.bodyPart || null, Boolean(examType.contrast), createdBy.id,
                    referringDoctor?.id || null, referringDoctor?.name || null,
                    technician.id, nurse.id, radiologist.id, randomElement(['Cash', 'Card', 'Insurance']), examType.price,
                    appointmentSource, preparationStatus
                ]
            );
            appointmentsCreated++;

            // Create examination if appointment is confirmed
            if (appointmentStatus === 'Confirmed' && isInPast) {
                const examStatuses = ['Scheduled', 'Checked-in', 'Scanning', 'Reporting', 'Finalized'];
                const examStatus = randomElement(examStatuses);
                const finalizedAt = examStatus === 'Finalized'
                    ? new Date(endTime.getTime() + randomInt(0, 48) * 60 * 60 * 1000) // 0-48 hours after scan
                    : null;
                const reportSections = buildReportSections(modality.type, examType.name);
                const internalRadiologists = userIds.filter(u => u.role === 'Radiologist');
                const internalReferringDoctor = randomElement(internalRadiologists);
                const examResult = await pool.query(
                    `INSERT INTO examinations (
                        appointment_id, patient_id, modality_id, exam_type_id,
                        performing_radiologist_id, referring_doctor_id, external_referring_doctor_id, study_instance_uid,
                        status, order_number, priority, clinical_indication, provisional_diagnosis,
                        body_part, contrast_required, queue_stage, current_station, arrived_at,
                        exam_started_at, exam_completed_at, reporting_started_at, report_content,
                        report_sections, report_status, report_finalized_at, digital_signature_name,
                        digital_signature_role, digital_signature_hash
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8,
                        $9::exam_status, $10, $11::order_priority, $12, $13,
                        $14, $15, $16, $17, $18,
                        $19, $20, $21, $22,
                        $23::jsonb, $24, $25, $26, $27, $28
                    ) RETURNING exam_id`,
                    [
                        apptResult.rows[0].appointment_id, patient, modality.id, examType.id,
                        radiologist.id,
                        referringDoctor ? null : internalReferringDoctor.id,
                        referringDoctor ? referringDoctor.id : null,
                        makeDicomUid(),
                        examStatus, orderNumber, priority, clinicalIndication, provisionalDiagnosis,
                        examType.bodyPart || null, Boolean(examType.contrast),
                        examStatus === 'Finalized' ? 'Finalized' : examStatus === 'Reporting' ? 'Reporting' : 'Scheduled',
                        examStatus === 'Scheduled' ? 'Reception' : examStatus === 'Checked-in' ? 'Nurse' : examStatus === 'Scanning' ? 'Modality' : 'Radiologist',
                        isInPast ? startTime : null,
                        examStatus !== 'Scheduled' ? new Date(startTime.getTime() + 30 * 60000) : null,
                        examStatus === 'Finalized' ? new Date(endTime.getTime()) : null,
                        examStatus === 'Reporting' || examStatus === 'Finalized' ? new Date(endTime.getTime() + 15 * 60000) : null,
                        `<h3>${examType.name}</h3><p>${reportSections.technique}</p><p>${reportSections.findings}</p><p>${reportSections.impression}</p>`,
                        JSON.stringify(reportSections),
                        examStatus === 'Finalized' ? 'Finalized' : examStatus === 'Reporting' ? 'Reviewed' : 'Draft',
                        finalizedAt,
                        examStatus === 'Finalized' ? radiologist.name : null,
                        examStatus === 'Finalized' ? 'Radiologist' : null,
                        examStatus === 'Finalized'
                            ? crypto.createHash('sha256').update(`${orderNumber}:${patient}:${examType.name}`).digest('hex')
                            : null,
                    ]
                );

                examsCreated++;

                // Create invoice and payment for finalized exams
                if (examStatus === 'Finalized') {
                    const examId = examResult.rows[0].exam_id;
                    const invoiceResult = await pool.query(
                        `INSERT INTO invoices (
                            appointment_id, exam_id, patient_id, invoice_status, subtotal_amount,
                            total_amount, insurance_covered_amount, patient_payable_amount, status,
                            due_date, notes
                        ) VALUES (
                            $1, $2, $3, 'Paid', $4, $5, 0, $6, 'Paid', $7, $8
                        ) RETURNING invoice_id`,
                        [
                            apptResult.rows[0].appointment_id,
                            examId,
                            patient,
                            examType.price,
                            examType.price,
                            examType.price,
                            toIsoDate(randomFutureDate(30)),
                            `Auto-generated invoice for ${examType.name}`,
                        ]
                    );

                    await pool.query(
                        `INSERT INTO invoice_items (
                            invoice_id, exam_id, exam_type_id, description, quantity, unit_price,
                            discount_amount, tax_amount, total_amount
                        ) VALUES ($1, $2, $3, $4, 1, $5, 0, 0, $5)`,
                        [invoiceResult.rows[0].invoice_id, examId, examType.id, examType.name, examType.price]
                    );

                    await pool.query(
                        `INSERT INTO payments (
                            invoice_id, amount, method, processed_by, transaction_date, payment_reference
                        ) VALUES ($1, $2, $3, $4, $5)`,
                        [
                            invoiceResult.rows[0].invoice_id, examType.price,
                            randomElement(['Cash', 'Card', 'Insurance']),
                            createdBy.id, finalizedAt,
                            `PAY-${String(i + 1).padStart(6, '0')}`
                        ]
                    );

                    finalizedExams.push({
                        examId,
                        appointmentId: apptResult.rows[0].appointment_id,
                        patientId: patient,
                        modalityId: modality.id,
                        examTypeId: examType.id,
                        examTypeName: examType.name,
                        amount: examType.price,
                        invoiceId: invoiceResult.rows[0].invoice_id,
                        createdById: createdBy.id,
                        radiologistId: radiologist.id,
                        referringDoctorId: referringDoctor?.id || null,
                    });
                }
            }

            if ((i + 1) % 100 === 0) {
                console.log(`   ✓ Created ${i + 1}/${appointmentCount} appointments, ${examsCreated} examinations`);
            }
        } catch (err) {
            // Skip if time conflict (exclusion constraint)
            if (err.code !== '23P01') {
                console.error(`   ⚠ Error at appointment ${i}: ${err.message}`);
            }
        }
    }

    console.log(`   ✅ Completed ${appointmentsCreated} appointments, ${examsCreated} examinations`);
    return finalizedExams;
}

async function seedServiceContracts(modalityIds) {
    console.log('\n🧰 Seeding Service Contracts...');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS service_contracts (
            contract_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            modality_id UUID REFERENCES modalities(modality_id) ON DELETE CASCADE,
            provider_name VARCHAR(255) NOT NULL,
            contact_info VARCHAR(255),
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            cost DECIMAL(12, 2),
            status VARCHAR(50) DEFAULT 'Active',
            notes TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const providers = [
        'Siemens Healthineers',
        'GE HealthCare',
        'Philips Healthcare',
        'Carestream Service',
        'Hologic Support',
        'Canon Medical Care',
    ];

    for (const modality of modalityIds) {
        await pool.query(
            `INSERT INTO service_contracts (
                modality_id, provider_name, contact_info, start_date, end_date, cost, status, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                modality.id,
                randomElement(providers),
                `${randomPhone()} / service@${modality.type.toLowerCase().replace(/[^a-z0-9]+/g, '')}.example.com`,
                toIsoDate(randomPastDate(400)),
                toIsoDate(randomFutureDate(540)),
                randomInt(12000, 48000),
                randomElement(['Active', 'Active', 'Active', 'Expired']),
                `${modality.type} maintenance and support agreement.`,
            ]
        );
    }
    console.log(`   ✓ Created ${modalityIds.length} service contracts`);
}

async function seedEquipmentRecords(modalityIds, userIds) {
    console.log('\n🛠️ Seeding Maintenance and Downtime...');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS equipment_maintenance (
            maintenance_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            modality_id UUID REFERENCES modalities(modality_id) ON DELETE CASCADE,
            maintenance_type VARCHAR(100) NOT NULL,
            scheduled_date DATE NOT NULL,
            completed_date DATE,
            performed_by VARCHAR(255),
            cost DECIMAL(12, 2),
            status VARCHAR(50) DEFAULT 'Scheduled',
            notes TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS equipment_downtime (
            downtime_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            modality_id UUID REFERENCES modalities(modality_id) ON DELETE CASCADE,
            start_time TIMESTAMP WITH TIME ZONE NOT NULL,
            end_time TIMESTAMP WITH TIME ZONE NOT NULL,
            reason VARCHAR(255) NOT NULL,
            status VARCHAR(50) DEFAULT 'Planned',
            resolution_notes TEXT,
            created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const technicians = userIds.filter(user => user.role === 'Technician');
    const admins = userIds.filter(user => user.role === 'Admin');
    const maintenanceTypes = ['Routine', 'Repair', 'Calibration', 'Inspection'];

    for (const modality of modalityIds) {
        const scheduledDate = toIsoDate(randomFutureDate(180));
        const completedDate = randomElement([true, false]) ? toIsoDate(randomFutureDate(200)) : null;
        await pool.query(
            `INSERT INTO equipment_maintenance (
                modality_id, maintenance_type, scheduled_date, completed_date, performed_by, cost, status, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                modality.id,
                randomElement(maintenanceTypes),
                scheduledDate,
                completedDate,
                randomElement(technicians).name,
                randomInt(2500, 18000),
                completedDate ? 'Completed' : 'Scheduled',
                `Preventive maintenance for ${modality.name}.`,
            ]
        );

        if (Math.random() > 0.5) {
            const startTime = randomPastDate(60);
            const endTime = new Date(startTime.getTime() + randomInt(4, 36) * 60 * 60 * 1000);
            await pool.query(
                `INSERT INTO equipment_downtime (
                    modality_id, start_time, end_time, reason, status, resolution_notes, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    modality.id,
                    startTime,
                    endTime,
                    randomElement([
                        'Tube replacement',
                        'Detector calibration',
                        'System firmware update',
                        'Power supply inspection',
                        'Cooling system maintenance',
                    ]),
                    randomElement(['Planned', 'Unplanned', 'Resolved']),
                    'Service restored and quality checks completed.',
                    randomElement(admins).id,
                ]
            );
        }
    }

    console.log(`   ✓ Created ${modalityIds.length} maintenance rows and downtime entries`);
}

async function seedInsuranceNetwork(patientIds, examTypes, userIds, finalizedExams) {
    console.log('\n🛡️ Seeding Insurance Network...');

    const insuranceStaff = userIds.find(user => user.role === 'Insurance_Staff') || userIds.find(user => user.role === 'Accountant');
    const admin = userIds.find(user => user.role === 'Admin');
    const providers = [
        { name: 'Nile Health Insurance', payer: 'NHI', phone: '0222221111', email: 'claims@nilehealth.example.com' },
        { name: 'Cairo Medical Assurance', payer: 'CMA', phone: '0222222222', email: 'coverage@cma.example.com' },
        { name: 'Delta Care Payer', payer: 'DCP', phone: '0222223333', email: 'support@deltacare.example.com' },
        { name: 'MediShield Egypt', payer: 'MSE', phone: '0222224444', email: 'operations@medishield.example.com' },
        { name: 'Unity Corporate Benefits', payer: 'UCB', phone: '0222225555', email: 'benefits@unity.example.com' },
    ];

    const providerRows = [];
    for (const provider of providers) {
        const result = await pool.query(
            `INSERT INTO insurance_providers (name, payer_code, phone, email, address, contact_info, is_active, notes)
             VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7) RETURNING provider_id`,
            [
                provider.name,
                provider.payer,
                provider.phone,
                provider.email,
                randomAddress(),
                JSON.stringify({ phone: provider.phone, email: provider.email }),
                `${provider.name} preferred network provider.`,
            ]
        );
        providerRows.push({ ...provider, id: result.rows[0].provider_id });
    }

    for (const provider of providerRows) {
        await pool.query(
            `INSERT INTO contracts (
                provider_id, entity_name, entity_type, contract_number, commission_percentage,
                start_date, end_date, is_active, coverage_notes
            ) VALUES ($1, $2, 'Insurance', $3, $4, $5, $6, TRUE, $7)`,
            [
                provider.id,
                provider.name,
                `CTR-${provider.payer}-${randomInt(1000, 9999)}`,
                randomInt(5, 18),
                toIsoDate(randomPastDate(720)),
                toIsoDate(randomFutureDate(720)),
                `Primary insurance contract for ${provider.name}.`,
            ]
        );
    }

    for (const provider of providerRows) {
        for (const examType of examTypes.filter((exam, index) => index % providerRows.length === providerRows.indexOf(provider) % providerRows.length || Math.random() > 0.7).slice(0, 3)) {
            await pool.query(
                `INSERT INTO insurance_coverage_rules (
                    provider_id, exam_type_id, modality_type, coverage_percentage, coverage_ceiling,
                    copay_amount, preauthorization_required, effective_from, effective_to, is_active, notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10)`,
                [
                    provider.id,
                    examType.id,
                    examType.modalityType,
                    randomInt(50, 90),
                    examType.price * randomInt(1, 3),
                    randomInt(0, 500),
                    Boolean(examType.contrast),
                    toIsoDate(randomPastDate(365)),
                    toIsoDate(randomFutureDate(365)),
                    `${examType.name} coverage for ${provider.name}.`,
                ]
            );
        }
    }

    const policyRows = [];
    const patientsWithCoverage = patientIds.slice(0, 30);
    patientsWithCoverage.forEach((patientId, index) => {
        const provider = providerRows[index % providerRows.length];
        policyRows.push({ patientId, providerId: provider.id });
    });

    const policyMap = new Map();
    for (const [index, policySeed] of policyRows.entries()) {
        const result = await pool.query(
            `INSERT INTO patient_insurance_policies (
                patient_id, provider_id, policy_number, member_number, plan_name, holder_name,
                relationship_to_holder, valid_from, valid_to, is_primary, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10) RETURNING policy_id`,
            [
                policySeed.patientId,
                policySeed.providerId,
                `POL-${String(index + 1).padStart(6, '0')}`,
                `MEM-${String(index + 1).padStart(6, '0')}`,
                randomElement(['Gold', 'Silver', 'Platinum', 'Corporate Plus']),
                'Primary Holder',
                'Self',
                toIsoDate(randomPastDate(730)),
                toIsoDate(randomFutureDate(730)),
                'Seeded coverage policy.',
            ]
        );
        policyMap.set(policySeed.patientId, { id: result.rows[0].policy_id, providerId: policySeed.providerId });
    }

    const approvedExams = finalizedExams.slice(0, Math.min(finalizedExams.length, 12));
    const approvalMap = new Map();
    for (const [index, exam] of approvedExams.entries()) {
        const policy = policyMap.get(exam.patientId);
        if (!policy) continue;
        const status = index % 3 === 0 ? 'Pending' : index % 3 === 1 ? 'Approved' : 'Rejected';
        const requestedAmount = exam.amount;
        const approvedAmount = status === 'Approved' ? Math.round(exam.amount * randomInt(50, 90) / 100) : 0;
        const result = await pool.query(
            `INSERT INTO insurance_approvals (
                patient_id, policy_id, provider_id, appointment_id, exam_id, exam_type_id,
                status, approval_number, requested_amount, approved_amount, rejection_reason,
                expires_at, requested_by, decided_by, decided_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING approval_id`,
            [
                exam.patientId,
                policy.id,
                policy.providerId,
                exam.appointmentId,
                exam.examId,
                exam.examTypeId,
                status,
                status === 'Approved' ? `APR-${String(index + 1).padStart(6, '0')}` : null,
                requestedAmount,
                approvedAmount,
                status === 'Rejected' ? 'Coverage limit exceeded for this benefit.' : null,
                toIsoDate(randomFutureDate(180)),
                insuranceStaff?.id || admin?.id || null,
                status === 'Pending' ? null : admin?.id || null,
                status === 'Pending' ? null : new Date(),
            ]
        );
        approvalMap.set(exam.examId, { id: result.rows[0].approval_id, status, policyId: policy.id, providerId: policy.providerId });
    }

    const claimCandidates = approvedExams.filter((exam) => approvalMap.get(exam.examId)?.status === 'Approved').slice(0, 8);
    for (const [index, exam] of claimCandidates.entries()) {
        const approval = approvalMap.get(exam.examId);
        const policy = policyMap.get(exam.patientId);
        await pool.query(
            `INSERT INTO insurance_claims (
                invoice_id, patient_id, provider_id, policy_id, approval_id,
                claim_reference_number, status, expected_amount, received_amount,
                submitted_at, paid_at, created_by, updated_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
            [
                exam.invoiceId,
                exam.patientId,
                policy.providerId,
                approval.policyId,
                approval.id,
                `REF-${String(index + 1).padStart(6, '0')}`,
                randomElement(['Submitted', 'Paid', 'Partially Paid']),
                exam.amount,
                randomInt(0, exam.amount),
                randomPastDate(60),
                randomPastDate(30),
                insuranceStaff?.id || admin?.id || null,
                insuranceStaff?.id || admin?.id || null,
            ]
        );
    }

    console.log(`   ✓ Created ${providerRows.length} providers, ${policyRows.length} policies, and seeded insurance workflow data`);
}

async function seedInventory() {
    console.log('\n📦 Seeding Inventory...');

    // Check if inventory table exists
    await pool.query(`
        CREATE TABLE IF NOT EXISTS inventory (
            item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(100) NOT NULL,
            category VARCHAR(50),
            quantity INTEGER DEFAULT 0,
            unit VARCHAR(20),
            reorder_level INTEGER,
            unit_price DECIMAL(10, 2),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const items = [
        { name: 'MRI Contrast (Gadolinium)', category: 'Contrast Agent', qty: 150, unit: 'vials', reorder: 50, price: 120 },
        { name: 'CT Contrast (Iodine)', category: 'Contrast Agent', qty: 200, unit: 'bottles', reorder: 75, price: 85 },
        { name: 'Syringes 10ml', category: 'Medical Supply', qty: 1000, unit: 'pieces', reorder: 300, price: 2.5 },
        { name: 'Disposable Gloves', category: 'PPE', qty: 5000, unit: 'pairs', reorder: 1000, price: 0.5 },
        { name: 'Face Masks', category: 'PPE', qty: 3000, unit: 'pieces', reorder: 800, price: 1 },
        { name: 'X-Ray Film', category: 'Imaging Supply', qty: 500, unit: 'sheets', reorder: 150, price: 15 },
        { name: 'Ultrasound Gel', category: 'Imaging Supply', qty: 80, unit: 'bottles', reorder: 30, price: 25 },
        { name: 'Disinfectant Solution', category: 'Cleaning', qty: 100, unit: 'liters', reorder: 40, price: 12 },
    ];

    for (const item of items) {
        await pool.query(
            `INSERT INTO inventory (name, category, quantity, unit, reorder_level, unit_price) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [item.name, item.category, item.qty, item.unit, item.reorder, item.price]
        );
    }
    console.log(`   ✓ Created ${items.length} inventory items`);
}

async function seedStaff(userIds) {
    console.log('\n👨‍⚕️ Seeding Staff Records...');

    await pool.query(`
        CREATE TABLE IF NOT EXISTS staff (
            staff_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID REFERENCES users(user_id),
            department VARCHAR(50),
            specialization VARCHAR(100),
            license_number VARCHAR(50),
            hire_date DATE,
            salary DECIMAL(10, 2),
            status VARCHAR(20) DEFAULT 'Active',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const departments = { 'Radiologist': 'Radiology', 'Technician': 'Imaging', 'Nurse': 'Patient Care' };
    const specializations = {
        'Radiologist': ['Neuroradiology', 'Musculoskeletal', 'Abdominal', 'Interventional'],
        'Technician': ['MRI Specialist', 'CT Specialist', 'X-Ray Technician', 'US Technician'],
        'Nurse': ['Radiology Nurse', 'Patient Care', 'Contrast Management']
    };

    for (const user of userIds.filter(u => ['Radiologist', 'Technician', 'Nurse'].includes(u.role))) {
        await pool.query(
            `INSERT INTO staff (user_id, department, specialization, license_number, hire_date, salary, status) 
             VALUES ($1, $2, $3, $4, $5, $6, 'Active')`,
            [
                user.id,
                departments[user.role],
                randomElement(specializations[user.role]),
                `LIC-${randomInt(100000, 999999)}`,
                randomDate(new Date(2020, 0, 1), new Date(2024, 0, 1)),
                randomInt(8000, 20000)
            ]
        );
    }
    console.log(`   ✓ Created staff records`);
}

async function main() {
    console.log('🚀 Starting RCMS Database Seeding...\n');
    console.log('⚙️  Database:', connectionString.split('@')[1]);

    try {
        await clearDatabase();

        const userIds = await seedUsers();
        const modalityIds = await seedModalities();
        const examTypes = await seedExaminationTypes(modalityIds);
        const referringDoctors = await seedReferringDoctors(userIds);
        const patientIds = await seedPatients(150);
        const finalizedExams = await seedAppointmentsAndExams(patientIds, modalityIds, examTypes, userIds, referringDoctors);
        await seedServiceContracts(modalityIds);
        await seedEquipmentRecords(modalityIds, userIds);
        await seedInsuranceNetwork(patientIds, examTypes, userIds, finalizedExams);
        await seedInventory();
        await seedStaff(userIds);

        console.log('\n✅ Database seeding completed successfully!');
        console.log('\n📊 Summary:');
        console.log(`   • ${userIds.length} users`);
        console.log(`   • ${referringDoctors.length} referring doctors`);
        console.log(`   • ${patientIds.length} patients`);
        console.log(`   • ${modalityIds.length} modalities`);
        console.log(`   • ${examTypes.length} examination types`);
        console.log(`   • ~600 appointments and examinations`);
        console.log(`   • ${finalizedExams.length} finalized invoices, claims, and approvals seeded`);
        console.log('\n🔑 Login credentials are set by deployment and are not displayed here.');

    } catch (error) {
        console.error('\n❌ Seeding failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
