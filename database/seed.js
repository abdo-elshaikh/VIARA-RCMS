/**
 * VIARA Comprehensive Enterprise Database Seeder
 * Populates all clinical, operational, financial, PACS, AI, HR, CRM,
 * and communications modules with rich, authentic data.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');

const localBackendPackage = path.join(__dirname, '../backend/package.json');
const runtimePackage = path.join(process.cwd(), 'package.json');
const backendRequire = createRequire(fs.existsSync(localBackendPackage) ? localBackendPackage : runtimePackage);

const { Pool } = backendRequire('pg');
const bcrypt = backendRequire('bcrypt');

const rootEnvPath = path.join(__dirname, '../.env');
const backendEnvPath = path.join(__dirname, '../backend/.env');
const envPath = fs.existsSync(rootEnvPath) ? rootEnvPath : backendEnvPath;
backendRequire('dotenv').config({ path: envPath });

// DB Connection resolution
if (!process.env.DATABASE_URL && process.env.POSTGRES_USER && process.env.POSTGRES_PASSWORD) {
    const user = encodeURIComponent(process.env.POSTGRES_USER || 'rcms');
    const password = encodeURIComponent(process.env.POSTGRES_PASSWORD);
    const database = encodeURIComponent(process.env.POSTGRES_DB || 'rcms');
    const port = process.env.POSTGRES_PORT || '15432';
    process.env.DATABASE_URL = `postgresql://${user}:${password}@127.0.0.1:${port}/${database}`;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('[seed] DATABASE_URL is required. Refusing to fall back to a committed default credential.');
    process.exit(1);
}
const pool = new Pool({ connectionString });

const seedPassword = process.env.TEST_USER_PASSWORD;
if (!seedPassword) {
    console.error('[seed] TEST_USER_PASSWORD is required. Refusing to fall back to a committed default password.');
    process.exit(1);
}

// Encryption utilities
const GCM_IV_LENGTH = 12;
function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(GCM_IV_LENGTH);
    const keyHex = process.env.ENCRYPTION_KEY;
    if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
        throw new Error('[seed] ENCRYPTION_KEY must be set to a 64-char hex key (no committed fallback).');
    }
    const key = Buffer.from(keyHex, 'hex');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(String(text), 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `v2:default:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function hashBlind(text) {
    if (!text) return null;
    const blindIndexKey = process.env.BLIND_INDEX_KEY;
    if (!blindIndexKey || blindIndexKey.length < 32) {
        throw new Error('[seed] BLIND_INDEX_KEY must be set (>= 32 chars, no committed fallback).');
    }
    const key = /^[0-9a-fA-F]{64}$/.test(blindIndexKey)
        ? Buffer.from(blindIndexKey, 'hex')
        : Buffer.from(blindIndexKey, 'utf8');
    return crypto.createHmac('sha256', key)
        .update(String(text).toLowerCase())
        .digest('hex');
}

// Helpers
const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
const randomPhone = () => `01${randomElement(['0', '1', '2', '5'])}${String(randomInt(10000000, 99999999))}`;

async function getTableColumns(tableName) {
    const result = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = $1
         ORDER BY ordinal_position`,
        [tableName]
    );
    return new Set(result.rows.map(row => row.column_name));
}

const randomNationalId = (gender, birthYear) => {
    const century = birthYear >= 2000 ? '3' : '2';
    const yy = String(birthYear).slice(2);
    const mm = String(randomInt(1, 12)).padStart(2, '0');
    const dd = String(randomInt(1, 28)).padStart(2, '0');
    const gov = String(randomInt(1, 27)).padStart(2, '0');
    const seq = String(randomInt(100, 999));
    const gDigit = gender === 'Male' ? String(randomInt(1, 5) * 2 - 1) : String(randomInt(1, 4) * 2);
    const check = String(randomInt(1, 9));
    return `${century}${yy}${mm}${dd}${gov}${seq}${gDigit}${check}`;
};

const firstNames = {
    male: ['Ahmed', 'Mohamed', 'Mahmoud', 'Ali', 'Omar', 'Youssef', 'Hassan', 'Khaled', 'Amr', 'Tamer', 'Sherif', 'Karim', 'Hany', 'Essam', 'Rami', 'Tarek', 'Hisham', 'Yasser', 'Wael', 'Ashraf', 'Ziad', 'Mostafa', 'Ibrahim', 'Sayed', 'Hamza'],
    female: ['Fatma', 'Mona', 'Heba', 'Nour', 'Sara', 'Mai', 'Dina', 'Rana', 'Mariam', 'Yasmin', 'Aya', 'Salma', 'Noha', 'Laila', 'Hania', 'Rania', 'Sherine', 'Amira', 'Nerveen', 'Ghada', 'Farida', 'Jana', 'Reem', 'Habiba', 'Malak']
};
const lastNames = ['Ibrahim', 'Hassan', 'Ali', 'Mohamed', 'Mahmoud', 'Khalil', 'Shafik', 'Farouk', 'Naguib', 'Saad', 'Mansour', 'Fouad', 'Amin', 'Kamal', 'Zaki', 'El-Sayed', 'Soliman', 'Radwan', 'El-Sharkawy', 'Abdel-Rahman', 'Kandil', 'Ghoneim', 'El-Gohary', 'Abaza', 'Shalaby'];

const randomAddress = () => {
    const streets = ['El-Tahrir St', 'Ramses St', 'Salah Salem St', 'El-Haram St', 'Kornish El-Nile', '9th St', 'Abbas El-Akkad St', 'Makram Ebeid St', 'Mosaddak St', 'Shehab St', 'Gezirat El-Arab St'];
    const districts = ['Nasr City', 'Heliopolis', 'Maadi', 'Dokki', 'Zamalek', 'New Cairo', '6th of October', 'Sheikh Zayed', 'Mohandessin', 'Shubra', 'Agouza'];
    return `${randomInt(1, 200)} ${randomElement(streets)}, ${randomElement(districts)}, Cairo, Egypt`;
};

async function clearDatabase() {
    console.log('🗑️  Clearing existing data (preserving base schema)...');
    const tables = [
        'notification_reads', 'marketing_campaign_recipients', 'notification_jobs',
        'notifications', 'notification_preferences',
        'pacs_reconciliation_queue', 'pacs_quarantine_studies', 'pacs_audit',
        'commission_payables', 'financial_closures', 'financial_periods',
        'clinical_task_hold_intervals', 'clinical_task_assignment_events', 'critical_result_acknowledgements',
        'result_deliveries', 'report_versions', 'patient_portal_documents', 'documents',
        'privacy_export_artifacts', 'data_privacy_requests', 'patient_consents',
        'patient_profile_update_requests', 'patient_appointment_requests',
        'integration_logs',
        'cashier_closures', 'cashier_shifts', 'credit_notes', 'refunds',
        'payroll_payments', 'payroll_line_items', 'payroll_employee_items', 'payroll_runs',
        'payroll_periods', 'employee_compensation_profiles', 'payroll_audit_log',
        'stock_movements', 'inventory_batches', 'purchase_order_items', 'purchase_orders',
        'expenses', 'expense_categories', 'equipment_downtime', 'equipment_maintenance', 'service_contracts',
        'audit_alerts', 'system_logs', 'security_events', 'patient_portal_messages', 'staff_messages',
        'crm_activities', 'marketing_campaign_recipients', 'marketing_campaigns', 'patient_segment_members', 'patient_segments', 'patient_feedback',
        'waiting_list_events', 'waiting_list', 'report_ai_drafts', 'pacs_ai_analysis_jobs', 'pacs_instances', 'pacs_series',
        'reception_work_items', 'reception_shift_sessions', 'display_call_events',
        'payroll_line_items', 'payroll_employee_items', 'payroll_runs', 'payroll_periods', 'employee_compensation_profiles',
        'leave_requests', 'attendance_logs', 'staff_shifts', 'employee_profiles',
        'claim_receipts', 'credit_notes', 'insurance_claims', 'insurance_approvals', 'patient_insurance_policies',
        'payments', 'invoices', 'examinations', 'appointments', 'referring_doctors',
        'patients', 'contracts', 'insurance_providers', 'report_templates', 'examination_types',
        'modalities', 'inventory_items', 'suppliers', 'financial_branches'
    ];

    for (const table of tables) {
        try {
            await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
        } catch (err) {
            if (err.code !== '42P01') throw err;
        }
    }
    console.log('   ✓ Database cleared');
}

async function seedBranchesAndSettings() {
    console.log('\n🏢 Seeding Financial Branches & Center Settings...');
    const branches = [
        { id: '00000000-0000-4000-8000-000000000001', code: 'MAIN', name: 'Cairo Central Diagnostic Hub', tz: 'Africa/Cairo' },
        { id: '00000000-0000-4000-8000-000000000002', code: 'MAADI', name: 'Maadi Specialized Imaging Center', tz: 'Africa/Cairo' },
        { id: '00000000-0000-4000-8000-000000000003', code: 'OCTOBER', name: '6th of October Diagnostic Branch', tz: 'Africa/Cairo' },
        { id: '00000000-0000-4000-8000-000000000004', code: 'ALEX', name: 'Alexandria Smouha Center', tz: 'Africa/Cairo' },
    ];

    for (const b of branches) {
        await pool.query(
            `INSERT INTO financial_branches (branch_id, code, name, timezone, currency_code, is_active)
             VALUES ($1, $2, $3, $4, 'EGP', TRUE)
             ON CONFLICT (branch_id) DO UPDATE SET name = EXCLUDED.name`,
            [b.id, b.code, b.name, b.tz]
        );
    }

    const settings = [
        ['center_name', 'VIARA Advanced Radiology & Imaging Systems'],
        ['center_name_ar', 'فيارا للأشعة التشخيصية المتقدمة والتصوير الطبي'],
        ['center_phone', '+20 2 2795 8000'],
        ['center_email', 'info@VIARA.health'],
        ['center_address', '45 Tahrir Square, Downtown, Cairo, Egypt'],
        ['center.name', 'VIARA Advanced Radiology & Imaging Systems'],
        ['center.name_ar', 'فيارا للأشعة التشخيصية المتقدمة والتصوير الطبي'],
        ['center.phone', '+20 2 2795 8000'],
        ['center.email', 'info@VIARA.health'],
        ['center.support_email', 'support@VIARA.health'],
        ['center.address', '45 Tahrir Square, Downtown, Cairo, Egypt'],
        ['center.address_ar', '45 ميدان التحرير، وسط البلد، القاهرة'],
        ['center_tax_id', 'EG-984-219-874'],
        ['pacs_server_aet', 'MiPACS2'],
        ['pacs_server_ip', '127.0.0.1'],
        ['pacs_server_port', '4242'],
        ['orthanc_api_url', 'http://127.0.0.1:8042'],
        ['ai_auto_analyze_xray', 'true'],
        ['ai_finding_threshold', '0.65'],
        ['working_hours_start', '08:00'],
        ['working_hours_end', '22:00']
    ];

    for (const [k, v] of settings) {
        await pool.query(
            `INSERT INTO system_settings (setting_key, setting_value)
             VALUES ($1, $2)
             ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
            [k, v]
        );
    }
    console.log(`   ✓ Configured 4 branches and system center profile`);
    return branches;
}

async function seedUsers() {
    console.log('\n👥 Seeding Users Across All 12 Roles...');
    const password = await bcrypt.hash(seedPassword, 12);

    const users = [
        { name: 'Dr. Administrator (Medical Director)', email: 'admin@VIARA.com', role: 'Admin' },
        { name: 'Eng. Dev Admin', email: 'developer@VIARA.com', role: 'Developer' },
        { name: 'Hossam Accountant (CFO)', email: 'accountant@VIARA.com', role: 'Accountant' },
        { name: 'Sarah Receptionist (Lead Desk)', email: 'reception@VIARA.com', role: 'Receptionist' },
        { name: 'Nour Cashier (Main Cashier)', email: 'cashier@VIARA.com', role: 'Cashier' },
        { name: 'Mervat HR Manager', email: 'hr@VIARA.com', role: 'HR' },
        { name: 'Tarek Insurance Specialist', email: 'insurance@VIARA.com', role: 'Insurance_Staff' },
        { name: 'Dr. Ahmed Hassan (Consultant Radiologist)', email: 'ahmed.hassan@VIARA.com', role: 'Radiologist' },
        { name: 'Dr. Mona Ibrahim (Neuro/MSK Radiologist)', email: 'mona.ibrahim@VIARA.com', role: 'Radiologist' },
        { name: 'Dr. Omar Khalil (Cardiothoracic Radiologist)', email: 'omar.khalil@VIARA.com', role: 'Radiologist' },
        { name: 'Dr. Fatma Saad (Women & Breast Imaging)', email: 'fatma.saad@VIARA.com', role: 'Radiologist' },
        { name: 'Tech. Mohamed Ali (Senior MRI Tech)', email: 'mohamed.tech@VIARA.com', role: 'Technician' },
        { name: 'Tech. Sara Mahmoud (Senior CT Tech)', email: 'sara.tech@VIARA.com', role: 'Technician' },
        { name: 'Nurse Heba Fouad (Contrast/IV Lead)', email: 'heba.nurse@VIARA.com', role: 'Nurse' },
        { name: 'Nurse Dina Kamal (Patient Prep Nurse)', email: 'dina.nurse@VIARA.com', role: 'Nurse' },
        { name: 'Mariam Marketing Manager', email: 'marketing@VIARA.com', role: 'Marketing' },
        { name: 'Dr. Portal Referrer', email: 'doctor.portal@VIARA.com', role: 'Referring_Doctor' },
    ];

    const userIds = [];
    for (const user of users) {
        const result = await pool.query(
            `INSERT INTO users (full_name, email, password_hash, role, is_active) 
             VALUES ($1, $2, $3, $4, TRUE)
             ON CONFLICT (email) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                password_hash = EXCLUDED.password_hash,
                role = EXCLUDED.role,
                is_active = TRUE
             RETURNING user_id`,
            [user.name, user.email, password, user.role]
        );
        userIds.push({ ...user, id: result.rows[0].user_id });
        console.log(`   ✓ Created ${user.role}: ${user.name}`);
    }
    return userIds;
}

async function seedReferringDoctors(userIds) {
    console.log('\n🩺 Seeding Referring Physicians...');
    const admin = userIds.find(u => u.role === 'Admin') || userIds[0];

    const doctors = [
        { name: 'Dr. Tarek El-Sayed', specialty: 'Orthopedic Surgery', hospital: 'Cairo Medical Center', commission: 12.0 },
        { name: 'Dr. Khaled Mansour', specialty: 'Neurology & Stroke', hospital: 'Nile Hospital', commission: 15.0 },
        { name: 'Dr. Rania Naguib', specialty: 'Interventional Cardiology', hospital: 'Dar Al Fouad', commission: 10.0 },
        { name: 'Dr. Hisham Farouk', specialty: 'Clinical Oncology', hospital: 'As-Salam International', commission: 12.5 },
        { name: 'Dr. Yasser Zaki', specialty: 'Internal Medicine & Nephrology', hospital: 'Giza Specialized Hospital', commission: 8.0 },
        { name: 'Dr. Wael Soliman', specialty: 'Neurosurgery & Spine', hospital: 'Cleopatra Hospital', commission: 15.0 },
        { name: 'Dr. Ashraf Radwan', specialty: 'Chest & Pulmonology', hospital: 'Saudi German Hospital', commission: 10.0 },
        { name: 'Dr. Sherine El-Sharkawy', specialty: 'Pediatric Surgery', hospital: 'Children Cancer Hospital 57357', commission: 5.0 },
        { name: 'Dr. Amira Abdel-Rahman', specialty: 'Obstetrics & Gynecology', hospital: 'Women Health Center', commission: 10.0 },
        { name: 'Dr. Nerveen Shafik', specialty: 'Urology & Kidney Transplant', hospital: 'Cairo Kidney Center', commission: 12.0 },
        { name: 'Dr. Ghada Amin', specialty: 'General & Laparoscopic Surgery', hospital: 'El-Galaa Military Hospital', commission: 10.0 },
        { name: 'Dr. Karim Fouad', specialty: 'ENT & Head/Neck Surgery', hospital: 'Specialized ENT Clinic', commission: 8.0 },
        { name: 'Dr. Hany Zaki', specialty: 'Vascular & Endovascular Surgery', hospital: 'Vascular Care Center', commission: 12.0 },
        { name: 'Dr. Essam Saad', specialty: 'Gastroenterology & Hepatology', hospital: 'GI Health Institute', commission: 10.0 },
        { name: 'Dr. Rami Mansour', specialty: 'Rheumatology & Autoimmune', hospital: 'Maadi Armed Forces Hospital', commission: 8.0 },
    ];

    const doctorIds = [];
    for (const doc of doctors) {
        const phone = randomPhone();
        const email = doc.name.toLowerCase().replace(/[^a-z]/g, '.') + '@hospital.org';
        const result = await pool.query(
            `INSERT INTO referring_doctors (
                full_name, specialty, clinic_hospital, phone, email, address,
                commission_percentage, preferred_contact_method, is_active, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9) RETURNING doctor_id`,
            [
                doc.name, doc.specialty, doc.hospital, phone, email,
                randomAddress(), doc.commission, randomElement(['Email', 'Phone', 'WhatsApp']), admin.id
            ]
        );
        doctorIds.push({ ...doc, id: result.rows[0].doctor_id });
    }
    console.log(`   ✓ Created ${doctorIds.length} referring doctors`);
    return doctorIds;
}

async function seedInsuranceProvidersAndPolicies(patientIds) {
    console.log('\n🛡️ Seeding Insurance Payers & Policies...');

    const providers = [
        { name: 'AXA Egypt Health Care', code: 'AXA-EGY', phone: '19777', email: 'medical.claims@axa.eg' },
        { name: 'Bupa Global Middle East', code: 'BUPA-ME', phone: '19888', email: 'approvals@bupa.com' },
        { name: 'MetLife Alico Egypt', code: 'MET-EGY', phone: '19999', email: 'claims@metlife.eg' },
        { name: 'Allianz Care Egypt', code: 'ALLZ-EGY', phone: '19111', email: 'health@allianz.eg' },
        { name: 'Misr Health Insurance (MISR-INS)', code: 'MISR-INS', phone: '19222', email: 'support@misrins.com' },
        { name: 'GlobeMed Egypt TPA', code: 'GLOBE-EGY', phone: '19333', email: 'approvals@globemedegypt.com' },
        { name: 'Blue Cross Shield International', code: 'BCS-INT', phone: '19001', email: 'claims@bluecross.eg' },
        { name: 'Universal Health Insurance (UHIA)', code: 'UHIA-GOV', phone: '19444', email: 'claims@uhia.gov.eg' },
    ];

    const providerIds = [];
    for (const p of providers) {
        const result = await pool.query(
            `INSERT INTO insurance_providers (name, payer_code, phone, email, is_active)
             VALUES ($1, $2, $3, $4, TRUE) RETURNING provider_id`,
            [p.name, p.code, p.phone, p.email]
        );
        providerIds.push({ ...p, id: result.rows[0].provider_id });
    }

    const policyMap = new Map();
    for (let i = 0; i < Math.min(350, patientIds.length); i++) {
        const patientId = patientIds[i];
        const provider = randomElement(providerIds);
        const policyNumber = `POL-${randomInt(100000, 999999)}`;
        const memberNumber = `MEM-${randomInt(1000000, 9999999)}`;
        const planName = randomElement(['Gold VIP 100%', 'Silver Choice 80%', 'Platinum Executive 90%', 'Corporate Standard 85%']);

        try {
            const result = await pool.query(
                `INSERT INTO patient_insurance_policies (
                    patient_id, provider_id, policy_number, member_number, plan_name,
                    valid_from, valid_to, is_primary
                ) VALUES ($1, $2, $3, $4, $5, '2025-01-01', '2027-12-31', TRUE)
                RETURNING policy_id`,
                [patientId, provider.id, policyNumber, memberNumber, planName]
            );
            policyMap.set(patientId, { policyId: result.rows[0].policy_id, providerId: provider.id });
        } catch (e) {}
    }
    console.log(`   ✓ Created ${providerIds.length} insurance payers and ${policyMap.size} patient policies`);
    return { providerIds, policyMap };
}

async function seedModalities() {
    console.log('\n🏥 Seeding Modalities (Imaging Equipment)...');
    const modalities = [
        { name: 'MRI-01 Siemens Magnetom Skyra 3T', type: 'MRI', room: 'Suite 101 (Main)', status: 'Active' },
        { name: 'MRI-02 GE Signa Artist 1.5T', type: 'MRI', room: 'Suite 102 (Maadi)', status: 'Active' },
        { name: 'MRI-03 Canon Vantage Galan 3T', type: 'MRI', room: 'Suite 103 (6th Oct)', status: 'Active' },
        { name: 'CT-01 Philips iCT 256-Slice Dual Energy', type: 'CT', room: 'Suite 201 (Main)', status: 'Active' },
        { name: 'CT-02 GE Revolution 128-Slice', type: 'CT', room: 'Suite 202 (Maadi)', status: 'Active' },
        { name: 'CT-03 Siemens SOMATOM Force Ultra-Fast', type: 'CT', room: 'Suite 203 (Main)', status: 'Active' },
        { name: 'X-Ray-01 Siemens Ysio Max Ceiling DR', type: 'X-Ray', room: 'Room 301', status: 'Active' },
        { name: 'X-Ray-02 Shimadzu MobileDaRt Wireless', type: 'X-Ray', room: 'Room 302', status: 'Active' },
        { name: 'X-Ray-03 Carestream DRX-Evolution', type: 'X-Ray', room: 'Room 303', status: 'Active' },
        { name: 'US-01 GE Voluson E10 Expert 4D/5D', type: 'Ultrasound', room: 'Room 401', status: 'Active' },
        { name: 'US-02 Philips EPIQ 7 Elite Vascular', type: 'Ultrasound', room: 'Room 402', status: 'Active' },
        { name: 'US-03 Canon Aplio i800 Matrix', type: 'Ultrasound', room: 'Room 403', status: 'Active' },
        { name: 'PET-CT-01 Siemens Biograph Vision 600', type: 'PET', room: 'Nuclear Suite 501', status: 'Active' },
        { name: 'Mammo-01 Hologic 3D Dimensions Tomosynthesis', type: 'Mammography', room: 'Women Center 601', status: 'Active' },
        { name: 'DEXA-01 Hologic Horizon Wi Bone Density', type: 'DEXA', room: 'Room 602', status: 'Active' },
        { name: 'Fluoroscopy Siemens Artis zee Multi-purpose', type: 'Fluoroscopy', room: 'Room 701', status: 'Active' },
    ];

    const modalityIds = [];
    for (const mod of modalities) {
        const result = await pool.query(
            `INSERT INTO modalities (name, type, room_number, status)
             VALUES ($1, $2, $3, $4) RETURNING modality_id`,
            [mod.name, mod.type, mod.room, mod.status]
        );
        modalityIds.push({ ...mod, id: result.rows[0].modality_id });
    }
    console.log(`   ✓ Created ${modalities.length} modalities`);
    return modalityIds;
}

async function seedExaminationTypes(modalityIds) {
    console.log('\n🔬 Seeding Examination Types & Procedures...');

    const examTypes = [
        // MRI
        { name: 'Brain MRI with IV Contrast', modalityType: 'MRI', price: 3800, duration: 45 },
        { name: 'Brain MRI Plain (Non-contrast)', modalityType: 'MRI', price: 3200, duration: 35 },
        { name: 'Lumbar Spine MRI with Contrast', modalityType: 'MRI', price: 3500, duration: 40 },
        { name: 'Cervical Spine MRI Plain', modalityType: 'MRI', price: 3400, duration: 40 },
        { name: 'Knee Joint MRI (High Resolution)', modalityType: 'MRI', price: 3000, duration: 35 },
        { name: 'Cardiac MRI with Perfusion & Viability', modalityType: 'MRI', price: 5500, duration: 60 },
        { name: 'Multiparametric Prostate MRI (PI-RADS)', modalityType: 'MRI', price: 4800, duration: 45 },
        { name: 'Abdomen & Pelvis Dynamic MRI (MRCP)', modalityType: 'MRI', price: 4600, duration: 50 },
        // CT
        { name: 'Brain CT Scan Non-contrast', modalityType: 'CT', price: 1600, duration: 15 },
        { name: 'Chest HRCT (High-Resolution Lung)', modalityType: 'CT', price: 2200, duration: 20 },
        { name: 'Abdomen & Pelvis Triphasic CT with Contrast', modalityType: 'CT', price: 2800, duration: 25 },
        { name: 'Coronary CT Angiography (CCTA)', modalityType: 'CT', price: 4200, duration: 30 },
        { name: 'CT Pulmonary Angiography (PE Protocol)', modalityType: 'CT', price: 3500, duration: 25 },
        { name: 'Cervical & Lumbar Spine 3D CT', modalityType: 'CT', price: 1900, duration: 20 },
        { name: 'Paranasal Sinuses CT (PNS Coronal/Axial)', modalityType: 'CT', price: 1750, duration: 15 },
        // X-Ray
        { name: 'Chest X-Ray PA & Lateral Views', modalityType: 'X-Ray', price: 350, duration: 10 },
        { name: 'Lumbar Spine X-Ray AP & Lateral', modalityType: 'X-Ray', price: 450, duration: 15 },
        { name: 'Knee Joint X-Ray Standing (AP & Lat)', modalityType: 'X-Ray', price: 380, duration: 10 },
        { name: 'Pelvis & Both Hips AP X-Ray', modalityType: 'X-Ray', price: 400, duration: 10 },
        { name: 'Abdomen Plain Erect & Supine (KUB)', modalityType: 'X-Ray', price: 350, duration: 10 },
        // Ultrasound & Doppler
        { name: 'Abdominal & Pelvic Ultrasound Full Survey', modalityType: 'Ultrasound', price: 700, duration: 25 },
        { name: 'Thyroid & Neck Ultrasound with Elastography', modalityType: 'Ultrasound', price: 600, duration: 20 },
        { name: 'Carotid & Vertebral Duplex Doppler', modalityType: 'Ultrasound', price: 1200, duration: 30 },
        { name: 'Lower Limb Arterial & Venous Duplex Doppler', modalityType: 'Ultrasound', price: 1400, duration: 35 },
        { name: 'Transthoracic Echocardiogram (Color Echo)', modalityType: 'Ultrasound', price: 1100, duration: 30 },
        { name: 'Obstetric 4D Anomaly Ultrasound Scan', modalityType: 'Ultrasound', price: 1300, duration: 30 },
        // PET & Nuclear
        { name: 'Whole Body 18F-FDG PET-CT Oncology Staging', modalityType: 'PET', price: 9500, duration: 90 },
        { name: 'Brain PET-CT Metabolic Mapping', modalityType: 'PET', price: 7500, duration: 60 },
        // Mammography & DEXA & Fluoroscopy
        { name: 'Bilateral 3D Digital Mammography & Tomosynthesis', modalityType: 'Mammography', price: 1200, duration: 25 },
        { name: 'DEXA Total Body Bone Mineral Density Scan', modalityType: 'DEXA', price: 850, duration: 20 },
        { name: 'Barium Swallow & Meal Fluoroscopy', modalityType: 'Fluoroscopy', price: 1500, duration: 30 },
    ];

    const typeIds = [];
    for (const exam of examTypes) {
        const modality = modalityIds.find(m => m.type === exam.modalityType) || modalityIds[0];
        const result = await pool.query(
            `INSERT INTO examination_types (name, modality_id, price, duration_minutes) 
             VALUES ($1, $2, $3, $4) RETURNING type_id`,
            [exam.name, modality.id, exam.price, exam.duration]
        );
        typeIds.push({ ...exam, id: result.rows[0].type_id, modalityId: modality.id });
    }
    console.log(`   ✓ Created ${typeIds.length} examination types`);
    return typeIds;
}

async function seedReportTemplates(userIds, examTypes) {
    console.log('\n📝 Seeding Diagnostic Report Templates & Structured Macros...');
    const admin = userIds.find(u => u.role === 'Admin') || userIds[0];

    const templates = [
        {
            name: 'Brain MRI Standard Protocol (Normal)',
            modality: 'MRI',
            clinicalHistory: 'Patient presents with recurrent headaches and dizziness. Rule out intracranial space-occupying lesion.',
            technique: 'Multiplanar, multisequence MRI of the brain was performed on a 3.0T scanner including Axial T1, T2, FLAIR, Diffusion Weighted Imaging (DWI/ADC), and Coronal/Sagittal T2 before and after IV Gadolinium contrast injection.',
            findings: 'No evidence of acute intracranial hemorrhage or territorial cortical infarction on DWI. Cerebral hemispheres demonstrate normal gray-white matter differentiation. Ventricular system, basal cisterns, and cortical sulci are within normal limits for age. No midline shift or mass effect. Major intracranial flow voids are preserved. Cerebellar tonsils lie in normal anatomical position.',
            impression: 'Unremarkable MRI examination of the brain. No acute infarct, mass lesion, or abnormal intracranial enhancement.',
            recommendations: 'Clinical follow-up as indicated.'
        },
        {
            name: 'Lumbar Spine MRI (Disc Herniation Protocol)',
            modality: 'MRI',
            clinicalHistory: 'Low back pain radiating to the left lower extremity along L5-S1 dermatome. Suspected radiculopathy.',
            technique: 'Sagittal T1, T2, STIR and Axial T2 weighted MR images of the lumbosacral spine.',
            findings: 'Normal lumbar lordosis is preserved. Vertebral body heights and alignment are intact. At L4-L5 level: Mild broad-based disc bulge causing mild indentation of the anterior thecal sac without significant canal stenosis. At L5-S1 level: Posterior-left paracentral disc extrusion measuring 6mm, causing moderate compression of the traversing left S1 nerve root with moderate neural foraminal narrowing. Conus medullaris terminates normally at L1 level.',
            impression: 'L5-S1 left paracentral disc extrusion with impingement on the traversing left S1 nerve root. Correlates with clinical left S1 radiculopathy.',
            recommendations: 'Neurosurgical / Spine consultation recommended.'
        },
        {
            name: 'Chest HRCT (Infectious & Interstitial Protocol)',
            modality: 'CT',
            clinicalHistory: 'Fever, persistent cough, dyspnea, and decreased oxygen saturation for 5 days.',
            technique: 'Volumetric High-Resolution Computed Tomography (HRCT) of the chest was performed without intravenous contrast from lung apices to adrenal glands in inspiratory apnea.',
            findings: 'Bilateral, predominantly peripheral and subpleural ground-glass opacities (GGO) and patchy alveolar consolidations noted involving both lower lobes and right middle lobe. No pleural effusion or pneumothorax. Mediastinal and hilar lymph nodes are not significantly enlarged. Tracheobronchial tree is patent. Visualized upper abdominal organs are unremarkable.',
            impression: 'Bilateral multifocal ground-glass opacities and consolidations consistent with atypical viral / bacterial bronchopneumonia. Severity score: Moderate (14/25).',
            recommendations: 'Clinical correlation with inflammatory markers and follow-up HRCT after antibiotic therapy.'
        },
        {
            name: 'Chest X-Ray PA View (Normal)',
            modality: 'X-Ray',
            clinicalHistory: 'Pre-operative routine cardiothoracic clearance.',
            technique: 'Standard digital posteroanterior (PA) chest radiograph in full inspiration.',
            findings: 'The lungs are clear and well-expanded without focal consolidation, pneumothorax, or pleural effusion. The cardiothoracic ratio is within normal limits (< 0.5). Normal mediastinal and hilar contours. Both costophrenic and cardiophrenic angles are sharp. Visualized bony thorax and soft tissues are unremarkable.',
            impression: 'Normal posteroanterior chest radiograph. No acute cardiopulmonary disease.',
            recommendations: 'Cardiopulmonary clearance for elective procedure.'
        },
        {
            name: 'Abdominal & Pelvic Ultrasound Survey',
            modality: 'Ultrasound',
            clinicalHistory: 'Right upper quadrant abdominal pain and dyspepsia.',
            technique: 'High-resolution transabdominal ultrasound using convex 3.5MHz transducer.',
            findings: 'Liver is normal in size and demonstrates mildly increased parenchymal echogenicity consistent with Grade I fatty liver (steatosis). No focal hepatic mass lesion. Gallbladder is well-distended with clear lumen; no gallstones or wall thickening. Common bile duct (CBD) measures 4mm (normal). Spleen, pancreas, and both kidneys demonstrate normal size, shape, and cortical thickness without hydronephrosis or stones. Urinary bladder is well-distended with normal wall thickness.',
            impression: '1. Mild diffuse hepatic steatosis (Fatty liver Grade I).\n2. Otherwise normal abdominal and pelvic ultrasound survey.',
            recommendations: 'Lipid profile and lifestyle dietary modifications.'
        },
        {
            name: 'Bilateral Digital Mammography (BI-RADS 1 / 2)',
            modality: 'Mammography',
            clinicalHistory: 'Annual screening mammogram in an asymptomatic female.',
            technique: 'Standard bilateral Craniocaudal (CC) and Mediolateral Oblique (MLO) 3D digital mammography views.',
            findings: 'The breasts demonstrate scattered fibroglandular densities (ACR Type B). No suspicious dominant masses, architectural distortion, or clustered pleomorphic microcalcifications seen in either breast. Benign-appearing scattered punctate calcifications noted bilaterally. Normal skin and nipple-areolar complexes. No suspicious axillary lymphadenopathy.',
            impression: 'BI-RADS Category 1: Negative (Normal bilateral screening mammogram).',
            recommendations: 'Routine annual screening mammography in 12 months.'
        }
    ];

    for (const t of templates) {
        const examType = examTypes.find(e => e.modalityType === t.modality) || examTypes[0];
        await pool.query(
            `INSERT INTO report_templates (
                name, modality_type, exam_type_id, clinical_history, technique,
                findings, impression, recommendations, is_default, is_active, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, TRUE, $9)`,
            [
                t.name, t.modality, examType.id, t.clinicalHistory, t.technique,
                t.findings, t.impression, t.recommendations, admin.id
            ]
        );
    }
    console.log(`   ✓ Created ${templates.length} report templates`);
}

async function seedSafetyTemplates(modalityIds) {
    console.log('\n🛡️ Seeding Clinical Safety Templates...');
    const templates = [
        {
            modality: modalityIds.find(item => item.type === 'MRI'),
            name: 'MRI Implant Safety Questionnaire',
            schema: [
                { id: 'pacemaker', question: 'Cardiac pacemaker or implanted electronic device?', type: 'boolean', required: true },
                { id: 'metal', question: 'Metallic implant, clip, or foreign body?', type: 'boolean', required: true },
                { id: 'claustrophobia', question: 'Severe claustrophobia?', type: 'boolean', required: false }
            ]
        },
        {
            modality: modalityIds.find(item => item.type === 'CT'),
            name: 'CT Contrast & eGFR Screening',
            schema: [
                { id: 'contrast_allergy', question: 'Iodine or contrast allergy?', type: 'boolean', required: true },
                { id: 'egfr', question: 'Latest eGFR value', type: 'number', required: true },
                { id: 'pregnancy', question: 'Pregnant or possibly pregnant?', type: 'boolean', required: true }
            ]
        }
    ].filter(item => item.modality);
    for (const template of templates) {
        await pool.query(
            `INSERT INTO safety_templates (modality_id, name, schema_json, is_active)
             VALUES ($1, $2, $3, TRUE)`,
            [template.modality.id, template.name, JSON.stringify(template.schema)]
        );
    }
    console.log(`   ✓ Seeded ${templates.length} active safety templates`);
}

async function seedPatients(count = 600) {
    console.log(`\n🧑‍⚕️  Seeding ${count} Patients with Encrypted Demographics & Blind Indexes...`);
    const patientIds = [];

    for (let i = 0; i < count; i++) {
        const gender = i % 2 === 0 ? 'Male' : 'Female';
        const firstName = randomElement(firstNames[gender.toLowerCase()]);
        const lastName = randomElement(lastNames);
        const birthYear = randomInt(1945, 2018);
        const dob = randomDate(new Date(birthYear, 0, 1), new Date(birthYear, 11, 28));
        const phone = randomPhone();
        const address = randomAddress();
        const mrn = `PAT-${String(i + 1).padStart(6, '0')}`;
        const nationalId = randomNationalId(gender, birthYear);
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${i + 1}@patient.example.com`;

        const result = await pool.query(
            `INSERT INTO patients (
                mrn, first_name_enc, last_name_enc, date_of_birth_enc, 
                phone_enc, address_enc, gender, national_id_enc, email,
                first_name_hash, last_name_hash, phone_hash, loyalty_points, opt_in_marketing
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE) RETURNING patient_id`,
            [
                mrn,
                encrypt(firstName),
                encrypt(lastName),
                encrypt(dob.toISOString().split('T')[0]),
                encrypt(phone),
                encrypt(address),
                gender,
                encrypt(nationalId),
                email,
                hashBlind(firstName),
                hashBlind(lastName),
                hashBlind(phone),
                randomInt(50, 600)
            ]
        );

        patientIds.push(result.rows[0].patient_id);
        if ((i + 1) % 150 === 0) {
            console.log(`   ✓ Created ${i + 1}/${count} patients`);
        }
    }
    console.log(`   ✅ Completed ${count} patients with HMAC blind indexing`);
    return patientIds;
}

async function seedAppointmentsExamsAndPACS(patientIds, modalityIds, examTypes, userIds, doctorIds, policyMap, branches) {
    console.log('\n📅 Seeding Non-Overlapping Appointments, Examinations, PACS Imaging, AI Jobs & Invoices...');

    const radiologists = userIds.filter(u => u.role === 'Radiologist');
    const technicians = userIds.filter(u => u.role === 'Technician');
    const nurses = userIds.filter(u => u.role === 'Nurse');
    const receptionists = userIds.filter(u => u.role === 'Receptionist');
    const admin = userIds.find(u => u.role === 'Admin') || userIds[0];

    const now = new Date();
    let apptsCreated = 0;
    let examsCreated = 0;
    let pacsSeriesCreated = 0;
    let aiJobsCreated = 0;

    // Generate non-overlapping time slots per modality across 180 days past and 14 days future
    const days = [];
    for (let d = -180; d <= 14; d++) {
        days.push(d);
    }

    const slotHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

    for (const d of days) {
        const isFuture = d > 0;
        const dayDate = new Date(now.getTime() + d * 86400000);

        for (const modality of modalityIds) {
            // Sample 1 to 2 appointments per modality per day to keep clean schedule
            const slotsForModality = randomElement([[8, 11], [9, 14], [10, 16], [12, 18], [13, 19], [9, 15]]);

            for (const hour of slotsForModality) {
                const startTime = new Date(dayDate);
                startTime.setHours(hour, 0, 0, 0);

                const matchingExamTypes = examTypes.filter(e => e.modalityId === modality.id);
                const examType = matchingExamTypes.length ? randomElement(matchingExamTypes) : randomElement(examTypes);

                const endTime = new Date(startTime.getTime() + Math.min(50, examType.duration) * 60000);
                const patient = randomElement(patientIds);
                const radiologist = randomElement(radiologists);
                const technician = randomElement(technicians);
                const nurse = randomElement(nurses);
                const createdBy = randomElement(receptionists);
                const referringDoctor = randomElement(doctorIds);
                const branch = randomElement(branches);

                const status = isFuture ? 'Confirmed' : randomElement(['Confirmed', 'Confirmed', 'Confirmed', 'Cancelled']);
                const workflow = isFuture
                    ? { examStatus: 'Scheduled', queueStage: 'Scheduled', station: 'Reception' }
                    : d < -2
                        ? { examStatus: 'Finalized', queueStage: 'Delivered', station: 'Delivery' }
                        : randomElement([
                            { examStatus: 'Checked-in', queueStage: 'Arrived', station: 'Reception' },
                            { examStatus: 'Checked-in', queueStage: 'Payment Pending', station: 'Cashier' },
                            { examStatus: 'Checked-in', queueStage: 'Prep Pending', station: 'Nurse' },
                            { examStatus: 'Checked-in', queueStage: 'Ready for Exam', station: 'Modality' },
                            { examStatus: 'Scanning', queueStage: 'In Exam', station: 'Modality' },
                            { examStatus: 'Reporting', queueStage: 'Reporting', station: 'Radiologist' },
                            { examStatus: 'Finalized', queueStage: 'Finalized', station: 'Delivery' }
                        ]);
                const leaveCurrentTaskUnassigned = !isFuture
                    && !['Finalized', 'Delivered'].includes(workflow.queueStage)
                    && Math.random() < 0.35;
                const assignedNurseId = workflow.station === 'Nurse' && leaveCurrentTaskUnassigned ? null : nurse.id;
                const assignedTechnicianId = workflow.station === 'Modality' && leaveCurrentTaskUnassigned ? null : technician.id;
                const assignedRadiologistId = workflow.station === 'Radiologist' && leaveCurrentTaskUnassigned ? null : radiologist.id;
                const isInsurance = policyMap.has(patient) && Math.random() > 0.45;
                const paymentMethod = isInsurance ? 'Insurance' : randomElement(['Cash', 'Card', 'Cash', 'Card']);

                try {
                    const apptResult = await pool.query(
                        `INSERT INTO appointments (
                            patient_id, modality_id, exam_type_id, start_time, end_time,
                            status, created_by, technician_id, nurse_id, radiologist_id,
                            referring_doctor_id, payment_method, payment_amount
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                        RETURNING appointment_id`,
                        [
                            patient, modality.id, examType.id, startTime, endTime,
                            status, createdBy.id, assignedTechnicianId, assignedNurseId, radiologist.id,
                            referringDoctor.id, paymentMethod, examType.price
                        ]
                    );
                    apptsCreated++;

                    if (status === 'Confirmed') {
                        const examStatus = workflow.examStatus;

                        const finalizedAt = examStatus === 'Finalized'
                            ? new Date(endTime.getTime() + randomInt(1, 24) * 3600000)
                            : null;

                        const studyUid = `1.2.826.0.1.3680043.8.498.${randomInt(1000000, 9999999)}.${randomInt(100000, 999999)}`;
                        const orderNum = `ORD-${startTime.getFullYear()}-${String(apptsCreated).padStart(6, '0')}`;

                        const reportSections = examStatus === 'Finalized' ? {
                            clinicalHistory: `Patient presented with clinical symptoms requiring ${examType.name}. Referred by ${referringDoctor.name}.`,
                            technique: `Standard imaging acquisition performed on ${modality.name}. Multiplanar diagnostic slices obtained.`,
                            findings: `Normal organ morphology and tissue margins. No acute hemorrhage, mass effect, or pathological focal lesions detected.`,
                            impression: `Unremarkable examination. Findings are within normal physiological baseline.`,
                            recommendations: `Routine clinical correlation and follow-up as indicated.`
                        } : {};

                        const examResult = await pool.query(
                            `INSERT INTO examinations (
                                appointment_id, patient_id, modality_id, exam_type_id,
                                performing_radiologist_id, status, report_status, report_sections,
                                study_instance_uid, order_number, report_locked, report_locked_at,
                                report_finalized_at, digital_signature_name,
                                digital_signature_role, images_available, image_count, created_at,
                                queue_stage, current_station
                            ) VALUES ($1, $2, $3, $4, $5, $6::exam_status, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                            RETURNING exam_id`,
                            [
                                apptResult.rows[0].appointment_id, patient, modality.id, examType.id,
                                assignedRadiologistId, examStatus,
                                examStatus === 'Finalized' ? 'Finalized' : (examStatus === 'Reporting' ? 'Typed' : 'Draft'),
                                JSON.stringify(reportSections),
                                studyUid, orderNum,
                                examStatus === 'Finalized', finalizedAt, finalizedAt,
                                examStatus === 'Finalized' ? radiologist.name : null,
                                examStatus === 'Finalized' ? 'Consultant Radiologist' : null,
                                ['Finalized', 'Reporting'].includes(examStatus),
                                ['Finalized', 'Reporting'].includes(examStatus) ? randomInt(25, 450) : 0,
                                startTime, workflow.queueStage, workflow.station
                            ]
                        );
                        examsCreated++;

                        const examId = examResult.rows[0].exam_id;

                        // PACS series & instances
                        if (['Finalized', 'Reporting'].includes(examStatus)) {
                            const seriesUid1 = `${studyUid}.1`;
                            const seriesUid2 = `${studyUid}.2`;

                            await pool.query(
                                `INSERT INTO pacs_series (series_instance_uid, study_instance_uid, series_number, modality, series_description, body_part_examined)
                                 VALUES ($1, $2, 1, $3, 'Axial High-Resolution T2', 'REGION')
                                 ON CONFLICT (series_instance_uid) DO NOTHING`,
                                [seriesUid1, studyUid, modality.type]
                            );

                            await pool.query(
                                `INSERT INTO pacs_series (series_instance_uid, study_instance_uid, series_number, modality, series_description, body_part_examined)
                                 VALUES ($1, $2, 2, $3, 'Coronal T1 Dynamic Sequence', 'REGION')
                                 ON CONFLICT (series_instance_uid) DO NOTHING`,
                                [seriesUid2, studyUid, modality.type]
                            );

                            const sopUid1 = `${seriesUid1}.101`;
                            await pool.query(
                                `INSERT INTO pacs_instances (sop_instance_uid, series_instance_uid, instance_number, file_size_bytes, storage_tier)
                                 VALUES ($1, $2, 1, 524288, 'hot')
                                 ON CONFLICT (sop_instance_uid) DO NOTHING`,
                                [sopUid1, seriesUid1]
                            );
                            pacsSeriesCreated += 2;

                            // AI Analysis Job
                            if (modality.type === 'X-Ray' || modality.type === 'CT') {
                                await pool.query(
                                    `INSERT INTO pacs_ai_analysis_jobs (
                                        exam_id, study_instance_uid, analysis_type, status, provider,
                                        model, result_summary, radiologist_status, completed_at
                                    ) VALUES ($1, $2, 'TorchXRayVision Pathology Screen', 'Completed', 'torchxrayvision',
                                              'DenseNet121-Res224', 'No acute cardiopulmonary findings detected (Cardiomegaly: 0.12, Consolidation: 0.04, Effusion: 0.02)',
                                              'Accepted', $3)`,
                                    [examId, studyUid, finalizedAt || now]
                                );
                                aiJobsCreated++;
                            }
                        }

                        // Financial Invoices
                        if (!isFuture) {
                            const totalAmt = Number(examType.price);
                            const insuranceCovered = isInsurance ? Math.round(totalAmt * 0.8) : 0;
                            const patientPayable = totalAmt - insuranceCovered;

                            const invoiceResult = await pool.query(
                                `INSERT INTO invoices (
                                    exam_id, appointment_id, patient_id, branch_id, subtotal_amount, total_amount,
                                    insurance_covered_amount, insurance_policy_id, patient_payable_amount,
                                    invoice_status, status, business_date
                                ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, 'Paid', 'Paid'::payment_status, $9)
                                RETURNING invoice_id`,
                                [examId, apptResult.rows[0].appointment_id, patient, branch.id, totalAmt, insuranceCovered, policyMap.get(patient)?.policyId || null, patientPayable, startTime.toISOString().split('T')[0]]
                            );

                            await pool.query(
                                `INSERT INTO invoice_items (
                                    invoice_id, exam_id, exam_type_id, description, quantity,
                                    unit_price, discount_amount, tax_amount, total_amount
                                 ) VALUES ($1, $2, $3, $4, 1, $5, 0, 0, $5)`,
                                [invoiceResult.rows[0].invoice_id, examId, examType.id, examType.name, totalAmt]
                            );

                            await pool.query(
                                `INSERT INTO payments (
                                    invoice_id, amount, method, processed_by, transaction_date
                                ) VALUES ($1, $2, $3, $4, $5)`,
                                [
                                    invoiceResult.rows[0].invoice_id,
                                    patientPayable > 0 ? patientPayable : totalAmt,
                                    paymentMethod, createdBy.id, finalizedAt || startTime
                                ]
                            );

                            if (isInsurance && insuranceCovered > 0) {
                                const policyInfo = policyMap.get(patient);
                                if (policyInfo) {
                                    const claimStatus = randomElement(['Paid', 'Paid', 'Approved', 'Submitted', 'Partially Paid']);
                                    const receivedAmt = claimStatus === 'Paid' ? insuranceCovered : (claimStatus === 'Partially Paid' ? Math.round(insuranceCovered * 0.75) : 0);

                                    await pool.query(
                                        `INSERT INTO insurance_claims (
                                            invoice_id, patient_id, provider_id, policy_id, status,
                                            expected_amount, received_amount, submitted_at, paid_at, created_by
                                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                                        [
                                            invoiceResult.rows[0].invoice_id, patient, policyInfo.providerId, policyInfo.policyId,
                                            claimStatus, insuranceCovered, receivedAmt, startTime,
                                            claimStatus.includes('Paid') ? finalizedAt : null, admin.id
                                        ]
                                    );
                                }
                            }
                        }
                    }
                } catch (err) {
                    // Skip if any unexpected slot edge case
                }
            }
        }
    }

    console.log(`   ✅ Finished ${apptsCreated} appointments, ${examsCreated} clinical exams, ${pacsSeriesCreated} PACS series, ${aiJobsCreated} AI jobs, and full invoice/claim streams`);
}

async function seedClinicalWorkflowHistory(userIds) {
    console.log('\n🔄 Seeding Queue Timelines, Assignments, Holds & Safety Responses...');
    const admin = userIds.find(user => user.role === 'Admin') || userIds[0];
    const nurse = userIds.find(user => user.role === 'Nurse') || admin;

    await pool.query(`
        UPDATE examinations
        SET arrived_at = CASE WHEN queue_stage <> 'Scheduled' THEN created_at + INTERVAL '10 minutes' END,
            prep_started_at = CASE WHEN queue_stage IN ('Prep Pending','Ready for Exam','In Exam','Reporting','Finalized','Delivered') THEN created_at + INTERVAL '20 minutes' END,
            prep_completed_at = CASE WHEN queue_stage IN ('Ready for Exam','In Exam','Reporting','Finalized','Delivered') THEN created_at + INTERVAL '35 minutes' END,
            exam_started_at = CASE WHEN queue_stage IN ('In Exam','Reporting','Finalized','Delivered') THEN created_at + INTERVAL '45 minutes' END,
            exam_completed_at = CASE WHEN queue_stage IN ('Reporting','Finalized','Delivered') THEN created_at + INTERVAL '75 minutes' END,
            reporting_started_at = CASE WHEN queue_stage IN ('Reporting','Finalized','Delivered') THEN created_at + INTERVAL '80 minutes' END,
            delivered_at = CASE WHEN queue_stage = 'Delivered' THEN created_at + INTERVAL '130 minutes' END
    `);
    await pool.query(`
        UPDATE appointments a
        SET nurse_task_available_at = CASE WHEN e.current_station = 'Nurse' THEN COALESCE(e.arrived_at, e.created_at) END,
            nurse_task_started_at = CASE WHEN e.current_station = 'Nurse' AND a.nurse_id IS NOT NULL AND e.queue_stage IN ('Prep Pending','Ready for Exam') THEN e.prep_started_at END,
            technician_task_available_at = CASE WHEN e.current_station = 'Modality' THEN COALESCE(e.prep_completed_at, e.created_at) END,
            technician_task_started_at = CASE WHEN e.current_station = 'Modality' AND a.technician_id IS NOT NULL AND e.queue_stage = 'In Exam' THEN e.exam_started_at END
        FROM examinations e
        WHERE e.appointment_id = a.appointment_id
    `);
    await pool.query(`
        UPDATE examinations
        SET radiologist_task_available_at = CASE WHEN current_station = 'Radiologist' THEN COALESCE(exam_completed_at, created_at) END,
            radiologist_task_started_at = CASE WHEN current_station = 'Radiologist' AND performing_radiologist_id IS NOT NULL AND queue_stage = 'Reporting' THEN reporting_started_at END
    `);

    await pool.query(`
        INSERT INTO queue_events (
            exam_id, appointment_id, from_stage, to_stage, from_station, to_station,
            event_type, notes, changed_by, created_at
        )
        SELECT exam_id, appointment_id, 'Scheduled', queue_stage, 'Reception', current_station,
               'Transition', 'Demo workflow transition', $1, COALESCE(arrived_at, created_at)
        FROM examinations
        WHERE queue_stage <> 'Scheduled'
    `, [admin.id]);
    await pool.query(`
        INSERT INTO order_status_history (
            appointment_id, exam_id, old_status, new_status, event_type, notes, changed_by, created_at
        )
        SELECT appointment_id, exam_id, 'Scheduled', status::text, 'SeedWorkflow',
               'Demo order lifecycle history', $1, created_at
        FROM examinations
    `, [admin.id]);
    await pool.query(`
        INSERT INTO clinical_task_assignment_events (
            exam_id, appointment_id, task_role, action, new_user_id, performed_by,
            reason, available_at, assignment_version, created_at
        )
        SELECT e.exam_id, e.appointment_id,
               CASE e.current_station WHEN 'Nurse' THEN 'Nurse' WHEN 'Modality' THEN 'Technician' ELSE 'Radiologist' END,
               'Assign',
               CASE e.current_station WHEN 'Nurse' THEN a.nurse_id WHEN 'Modality' THEN a.technician_id ELSE e.performing_radiologist_id END,
               $1, 'Initial demo task assignment',
               CASE e.current_station WHEN 'Nurse' THEN a.nurse_task_available_at WHEN 'Modality' THEN a.technician_task_available_at ELSE e.radiologist_task_available_at END,
               GREATEST(CASE e.current_station WHEN 'Nurse' THEN a.nurse_assignment_version WHEN 'Modality' THEN a.technician_assignment_version ELSE e.radiologist_assignment_version END, 1),
               e.created_at
        FROM examinations e
        JOIN appointments a ON a.appointment_id = e.appointment_id
        WHERE e.current_station IN ('Nurse','Modality','Radiologist')
          AND CASE e.current_station WHEN 'Nurse' THEN a.nurse_id WHEN 'Modality' THEN a.technician_id ELSE e.performing_radiologist_id END IS NOT NULL
        LIMIT 240
    `, [admin.id]);

    await pool.query(`
        WITH selected AS (
            SELECT exam_id, queue_stage, current_station, created_at
            FROM examinations
            WHERE queue_stage IN ('Prep Pending','Ready for Exam','In Exam','Reporting')
            ORDER BY created_at DESC
            LIMIT 8
        ), updated AS (
            UPDATE examinations e
            SET is_on_hold = TRUE,
                hold_started_at = NOW() - INTERVAL '25 minutes',
                hold_reason = 'Awaiting prior report and safety verification'
            FROM selected s
            WHERE e.exam_id = s.exam_id
            RETURNING e.exam_id, e.queue_stage, e.current_station
        )
        INSERT INTO clinical_task_hold_intervals (
            exam_id, task_role, queue_stage, started_at, reason, created_by
        )
        SELECT exam_id,
               CASE current_station WHEN 'Nurse' THEN 'Nurse' WHEN 'Modality' THEN 'Technician' WHEN 'Radiologist' THEN 'Radiologist' END,
               queue_stage, NOW() - INTERVAL '25 minutes', 'Awaiting prior report and safety verification', $1
        FROM updated
    `, [admin.id]);

    const safetyTemplates = (await pool.query('SELECT template_id, modality_id, name FROM safety_templates ORDER BY template_id')).rows;
    for (const template of safetyTemplates) {
        const exams = (await pool.query(
            `SELECT exam_id FROM examinations WHERE modality_id = $1 ORDER BY created_at DESC LIMIT 4`,
            [template.modality_id]
        )).rows;
        for (const [index, exam] of exams.entries()) {
            const answers = template.name.startsWith('MRI')
                ? { pacemaker: false, metal: index === 0, claustrophobia: index === 1 }
                : { contrast_allergy: index === 0, egfr: index === 2 ? 42 : 86, pregnancy: false };
            await pool.query(
                `INSERT INTO exam_safety_responses (exam_id, template_id, answers_json, signed_by_user_id)
                 VALUES ($1, $2, $3, $4)`,
                [exam.exam_id, template.template_id, JSON.stringify(answers), nurse.id]
            );
        }
    }
    console.log('   ✓ Seeded queue events/history, task assignments, 8 holds, and safety responses');
}

async function seedHRAndPayroll(userIds) {
    console.log('\n👔 Seeding HR Shift Rosters, Biometric Attendance, Leaves & Payroll...');

    const staffUsers = userIds.filter(u => ['Radiologist', 'Technician', 'Nurse', 'Receptionist', 'Cashier', 'Accountant'].includes(u.role));
    const employeeProfileColumns = await getTableColumns('employee_profiles');

    // 1. Employee Profiles & Compensation
    const compensationProfiles = new Map();
    for (const u of userIds) {
        const salary = u.role === 'Radiologist' ? 32000 : (u.role === 'Admin' ? 28000 : (['Technician', 'Accountant'].includes(u.role) ? 14000 : 9500));
        const profileInsertFields = ['user_id', 'employee_id', 'department', 'job_title', 'hire_date', 'employment_status'];
        const profileInsertValues = [u.id, `EMP-${u.role.slice(0, 3).toUpperCase()}-${randomInt(100, 999)}`, u.role, u.role, '2023-01-15', 'Full-Time'];

        if (employeeProfileColumns.has('salary')) {
            profileInsertFields.push('salary');
            profileInsertValues.push(salary);
        }

        const profileQuery = `
            INSERT INTO employee_profiles (${profileInsertFields.join(', ')})
            VALUES (${profileInsertFields.map((_, index) => `$${index + 1}`).join(', ')})
            ON CONFLICT (user_id) DO UPDATE SET ${employeeProfileColumns.has('salary') ? 'salary = EXCLUDED.salary' : 'updated_at = CURRENT_TIMESTAMP'}
        `;

        await pool.query(profileQuery, profileInsertValues);

        const profile = await pool.query(
            `INSERT INTO employee_compensation_profiles (
                user_id, salary_type, base_salary, effective_from, is_active, notes, created_by
             ) VALUES ($1, 'Monthly', $2, CURRENT_DATE - INTERVAL '1 year', TRUE, $3, $4)
             RETURNING profile_id`,
            [u.id, salary, `Demo monthly compensation for ${u.role}`, userIds.find(item => item.role === 'HR')?.id || u.id]
        );
        compensationProfiles.set(u.id, { profileId: profile.rows[0].profile_id, salary });
    }

    // 2. Staff Shifts (Past 14 days + Next 14 days)
    const now = new Date();
    for (let dayOffset = -14; dayOffset <= 14; dayOffset++) {
        const shiftDay = new Date(now.getTime() + dayOffset * 86400000);
        const morningStart = new Date(shiftDay); morningStart.setHours(8, 0, 0);
        const morningEnd = new Date(shiftDay); morningEnd.setHours(16, 0, 0);
        const eveningStart = new Date(shiftDay); eveningStart.setHours(14, 0, 0);
        const eveningEnd = new Date(shiftDay); eveningEnd.setHours(22, 0, 0);

        for (const user of staffUsers) {
            const isMorning = Math.random() > 0.5;
            await pool.query(
                `INSERT INTO staff_shifts (user_id, start_time, end_time, notes)
                 VALUES ($1, $2, $3, $4)`,
                [user.id, isMorning ? morningStart : eveningStart, isMorning ? morningEnd : eveningEnd, isMorning ? 'Morning Duty' : 'Evening Duty']
            );

            // Attendance for past shifts
            if (dayOffset < 0) {
                const clockIn = new Date(isMorning ? morningStart : eveningStart);
                clockIn.setMinutes(randomInt(0, 15)); // On time or slight variation
                const clockOut = new Date(isMorning ? morningEnd : eveningEnd);
                clockOut.setMinutes(randomInt(0, 30));

                await pool.query(
                    `INSERT INTO attendance_logs (user_id, clock_in, clock_out, status, notes)
                     VALUES ($1, $2, $3, $4, 'Biometric biometric reader verified')`,
                    [user.id, clockIn, clockOut, 'Present']
                );
            }
        }
    }

    // 3. Leave Requests
    const leaveReasons = [
        { type: 'Vacation', reason: 'Annual family summer vacation', status: 'Approved' },
        { type: 'Sick', reason: 'Seasonal flu and acute bronchitis', status: 'Approved' },
        { type: 'Personal', reason: 'Attending European Congress of Radiology (ECR)', status: 'Approved' },
        { type: 'Vacation', reason: 'Personal family emergency leave', status: 'Pending' }
    ];

    const admin = userIds.find(u => u.role === 'Admin') || userIds[0];
    for (const user of staffUsers.slice(0, 6)) {
        const item = randomElement(leaveReasons);
        await pool.query(
            `INSERT INTO leave_requests (user_id, start_date, end_date, leave_type, reason, status, approved_by)
             VALUES ($1, '2026-09-01', '2026-09-07', $2, $3, $4, $5)`,
            [user.id, item.type, item.reason, item.status, item.status === 'Approved' ? admin.id : null]
        );
    }

    // 4. Payroll lifecycle: a locked prior period plus a calculated current period.
    const payrollActors = {
        hr: userIds.find(u => u.role === 'HR') || admin,
        accountant: userIds.find(u => u.role === 'Accountant') || admin
    };
    for (const [monthsAgo, status] of [[1, 'Locked'], [0, 'Calculated']]) {
        const periodStart = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
        const periodEnd = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0);
        const period = await pool.query(
            `INSERT INTO payroll_periods (
                name, start_date, end_date, status, created_by, reviewed_by, approved_by,
                paid_by, locked_by, reviewed_at, approved_at, paid_at, locked_at, notes
             ) VALUES ($1, $2::date, $3::date, $4::varchar, $5, $5, $6, $6, $5,
                       CASE WHEN $4::varchar = 'Locked' THEN NOW() - INTERVAL '20 days' END,
                       CASE WHEN $4::varchar = 'Locked' THEN NOW() - INTERVAL '18 days' END,
                       CASE WHEN $4::varchar = 'Locked' THEN NOW() - INTERVAL '15 days' END,
                       CASE WHEN $4::varchar = 'Locked' THEN NOW() - INTERVAL '12 days' END,
                       $7)
             RETURNING period_id`,
            [
                `Payroll ${periodStart.toLocaleString('en', { month: 'long', year: 'numeric' })}`,
                periodStart.toISOString().slice(0, 10), periodEnd.toISOString().slice(0, 10), status,
                payrollActors.hr.id, payrollActors.accountant.id,
                status === 'Locked' ? 'Approved, paid, and locked demo payroll period' : 'Current calculated payroll awaiting review'
            ]
        );
        const run = await pool.query(
            `INSERT INTO payroll_runs (
                period_id, status, employee_count, calculated_by, reviewed_by, approved_by,
                paid_by, locked_by, calculated_at, reviewed_at, approved_at, paid_at, locked_at
             ) VALUES ($1, $2::varchar, $3, $4, $4, $5, $5, $4, NOW() - INTERVAL '2 days',
                       CASE WHEN $2::varchar = 'Locked' THEN NOW() - INTERVAL '20 days' END,
                       CASE WHEN $2::varchar = 'Locked' THEN NOW() - INTERVAL '18 days' END,
                       CASE WHEN $2::varchar = 'Locked' THEN NOW() - INTERVAL '15 days' END,
                       CASE WHEN $2::varchar = 'Locked' THEN NOW() - INTERVAL '12 days' END)
             RETURNING run_id`,
            [period.rows[0].period_id, status, userIds.length, payrollActors.hr.id, payrollActors.accountant.id]
        );

        let totalGross = 0;
        let totalDeductions = 0;
        let totalNet = 0;
        for (const user of userIds) {
            const compensation = compensationProfiles.get(user.id);
            const gross = Number(compensation.salary);
            const deductions = Math.round(gross * 0.11);
            const net = gross - deductions;
            totalGross += gross;
            totalDeductions += deductions;
            totalNet += net;
            const employeeItem = await pool.query(
                `INSERT INTO payroll_employee_items (
                    run_id, user_id, compensation_profile_id, gross_earnings, total_deductions,
                    net_pay, attendance_snapshot, calculation_snapshot, status
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING item_id`,
                [
                    run.rows[0].run_id, user.id, compensation.profileId, gross, deductions, net,
                    JSON.stringify({ presentDays: 21, lateMinutes: randomInt(0, 90), absentDays: randomInt(0, 1) }),
                    JSON.stringify({ baseSalary: gross, statutoryDeductions: deductions }),
                    status === 'Locked' ? 'Paid' : 'Calculated'
                ]
            );
            await pool.query(
                `INSERT INTO payroll_line_items (
                    run_id, payroll_employee_item_id, user_id, item_type, source_type, description, amount, taxable
                 ) VALUES
                    ($1, $2, $3, 'Earning', 'BaseSalary', 'Monthly base salary', $4, TRUE),
                    ($1, $2, $3, 'Deduction', 'Statutory', 'Insurance and statutory deductions', $5, FALSE)`,
                [run.rows[0].run_id, employeeItem.rows[0].item_id, user.id, gross, deductions]
            );
        }
        await pool.query(
            `UPDATE payroll_runs
             SET total_gross = $2, total_deductions = $3, total_net = $4
             WHERE run_id = $1`,
            [run.rows[0].run_id, totalGross, totalDeductions, totalNet]
        );
        await pool.query(
            `UPDATE payroll_periods
             SET total_gross = $2, total_deductions = $3, total_net = $4
             WHERE period_id = $1`,
            [period.rows[0].period_id, totalGross, totalDeductions, totalNet]
        );
        if (status === 'Locked') {
            await pool.query(
                `INSERT INTO payroll_payments (
                    run_id, payment_method, reference_number, paid_amount, paid_by, paid_at, notes
                 ) VALUES ($1, 'BankTransfer', $2, $3, $4, NOW() - INTERVAL '15 days', $5)`,
                [run.rows[0].run_id, `PAYROLL-${periodStart.toISOString().slice(0, 7)}`, totalNet, payrollActors.accountant.id, 'Demo payroll bank settlement']
            );
        }
    }

    console.log(`   ✓ Seeded HR profiles, compensation, shifts, attendance, leaves, and 2 payroll lifecycles`);
}

async function seedCRMMarketingAndFeedback(userIds, patientIds) {
    console.log('\n📣 Seeding CRM Marketing Campaigns, Patient Segments & Feedback...');
    const admin = userIds.find(u => u.role === 'Admin') || userIds[0];

    const segments = [
        { name: 'VIP Executive Checkup', desc: 'High-value executive and corporate patients' },
        { name: 'Oncology & Chronic Follow-up', desc: 'Patients undergoing regular 3-month/6-month imaging surveillance' },
        { name: 'Orthopedic & Spine Care', desc: 'Patients with previous MRI spine and joint examinations' },
        { name: 'Women Wellness Screening', desc: 'Eligible female patients for annual mammogram & bone density' }
    ];

    const segmentIds = [];
    for (const seg of segments) {
        const res = await pool.query(
            `INSERT INTO patient_segments (name, description, created_by)
             VALUES ($1, $2, $3) RETURNING segment_id`,
            [seg.name, seg.desc, admin.id]
        );
        segmentIds.push(res.rows[0].segment_id);

        // Attach random 50 patients to each segment
        for (let i = 0; i < 50; i++) {
            const pId = randomElement(patientIds);
            await pool.query(
                `INSERT INTO patient_segment_members (segment_id, patient_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [res.rows[0].segment_id, pId]
            );
        }
    }

    const campaigns = [
        { name: 'Pink October Breast Cancer Early Detection', segment: segmentIds[3], channel: 'WhatsApp', status: 'Active', budget: 15000 },
        { name: 'Comprehensive Spine & Joint Health Month', segment: segmentIds[2], channel: 'SMS', status: 'Active', budget: 12000 },
        { name: 'Annual Executive Full-Body Health Checkup', segment: segmentIds[0], channel: 'Email', status: 'Active', budget: 25000 },
    ];

    for (const c of campaigns) {
        await pool.query(
            `INSERT INTO marketing_campaigns (name, target_segment, channel, status, budget, start_date, end_date, created_by)
             VALUES ($1, $2, $3, $4, $5, '2026-08-01', '2026-10-31', $6)`,
            [c.name, c.segment, c.channel, c.status, c.budget, admin.id]
        );
    }

    // Patient Feedback & Ratings (5-star ratings & Arabic/English reviews)
    const feedbackSamples = [
        { rating: 5, comment: 'خدمة ممتازة وفريق عمل محترف جداً، جهاز الرنين المغناطيسي مريح والتقرير صدر في نفس اليوم.' },
        { rating: 5, comment: 'Exceptional service! The radiologist Dr. Ahmed took time to explain findings. Highly recommended.' },
        { rating: 4, comment: 'تنظيم رائع ودقة في المواعيد، شكراً لطاقم الاستقبال والتمريض على حسن المعاملة.' },
        { rating: 5, comment: 'Very clean facility, state-of-the-art 3T MRI, and prompt delivery on the patient portal.' },
        { rating: 4, comment: 'تجربة مريحة وسريعة في فحص الأشعة المقطعية، والمكان مجهز بأحدث التقنيات.' }
    ];

    for (let i = 0; i < 60; i++) {
        const sample = randomElement(feedbackSamples);
        const pId = randomElement(patientIds);
        await pool.query(
            `INSERT INTO patient_feedback (patient_id, rating, comments, source, reviewed)
             VALUES ($1, $2, $3, $4, TRUE)`,
            [pId, sample.rating, sample.comment, randomElement(['Portal', 'Kiosk', 'Survey'])]
        );
    }
    console.log(`   ✓ Seeded CRM segments, active campaigns, and 60 authenticated patient reviews`);
}

async function seedRealtimeCommunications(userIds, patientIds) {
    console.log('\n💬 Seeding Real-time Staff Chat Channels & Patient Support Tickets...');

    const staffUsers = userIds.filter(u => ['Admin', 'Radiologist', 'Technician', 'Nurse', 'Receptionist'].includes(u.role));
    const admin = userIds.find(u => u.role === 'Admin') || staffUsers[0];
    const drAhmed = userIds.find(u => u.email === 'ahmed.hassan@VIARA.com') || staffUsers[0];
    const techMohamed = userIds.find(u => u.email === 'mohamed.tech@VIARA.com') || staffUsers[0];
    const receptionSarah = userIds.find(u => u.email === 'reception@VIARA.com') || staffUsers[0];

    const channelMessages = [
        { sender: admin.id, channel: 'general', body: 'Welcome team to the VIARA Diagnostic Hub morning briefing. All 3T MRI and 256-Slice CT slots are operating at full capacity.' },
        { sender: drAhmed.id, channel: 'radiology', body: 'Emergency stroke CT Angiography from Nile Hospital has been priority-reported and approved. Please alert the neurology team.' },
        { sender: techMohamed.id, channel: 'radiology', body: 'MRI Suite 101 contrast protocol calibration completed successfully.' },
        { sender: receptionSarah.id, channel: 'reception', body: 'All morning insurance approval batches from AXA and Bupa have been confirmed.' }
    ];

    for (const msg of channelMessages) {
        await pool.query(
            `INSERT INTO staff_messages (sender_id, channel_name, body, is_read, created_at)
             VALUES ($1, $2, $3, TRUE, CURRENT_TIMESTAMP - INTERVAL '2 hours')`,
            [msg.sender, msg.channel, msg.body]
        );
    }

    // Patient Portal Inquiries
    for (let i = 0; i < 20; i++) {
        const patientId = patientIds[i];
        await pool.query(
            `INSERT INTO patient_portal_messages (patient_id, sender_role, staff_user_id, subject, body, is_read)
             VALUES ($1, 'Patient', NULL, 'Question regarding MRI Fasting Preparation', 'Hello, do I need to fast before my Abdominal MRI with contrast appointment tomorrow morning?', TRUE)`,
            [patientId]
        );
        await pool.query(
            `INSERT INTO patient_portal_messages (patient_id, sender_role, staff_user_id, subject, body, is_read)
             VALUES ($1, 'Staff', $2, 'Re: Question regarding MRI Fasting Preparation', 'Dear patient, yes please fast for 4 hours prior to your contrast MRI examination. You may drink plain water.', TRUE)`,
            [patientId, receptionSarah.id]
        );
    }
    console.log(`   ✓ Seeded internal staff channels and patient portal support dialogues`);
}

async function seedInventorySupplies(userIds, modalityIds, branches) {
    console.log('\n📦 Seeding Suppliers, Purchasing, Inventory Movements, Equipment & Expenses...');

    const items = [
        { name: 'MRI Contrast Gadoterate Meglumine (Dotarem 15ml)', category: 'Pharmaceuticals', qty: 350, unit: 'vials', reorder: 60 },
        { name: 'CT Non-Ionic Contrast Iohexol (Omnipaque 350mg 100ml)', category: 'Pharmaceuticals', qty: 420, unit: 'bottles', reorder: 100 },
        { name: 'Barium Sulfate HD Suspension 450ml', category: 'Pharmaceuticals', qty: 150, unit: 'bottles', reorder: 40 },
        { name: 'Dual Head Automatic Power Injector Syringe Kit', category: 'Consumables', qty: 650, unit: 'kits', reorder: 120 },
        { name: 'Safety IV Cannula 20G with Injection Port', category: 'Consumables', qty: 2500, unit: 'pieces', reorder: 500 },
        { name: 'High-Pressure Extension Tube (150cm 1200 PSI)', category: 'Consumables', qty: 900, unit: 'pieces', reorder: 200 },
        { name: 'Powder-Free Sterile Nitrile Gloves (Medium)', category: 'Consumables', qty: 15000, unit: 'pairs', reorder: 3000 },
        { name: 'Powder-Free Sterile Nitrile Gloves (Large)', category: 'Consumables', qty: 12000, unit: 'pairs', reorder: 2500 },
        { name: 'N95 Level 3 Surgical Respirator Masks', category: 'PPE', qty: 5000, unit: 'pieces', reorder: 1000 },
        { name: 'Lead Radiation Protection Aprons (0.5mm Pb)', category: 'PPE', qty: 35, unit: 'units', reorder: 10 },
        { name: 'Medical Ultrasound Acoustic Transmission Gel (5L Container)', category: 'Consumables', qty: 160, unit: 'containers', reorder: 40 },
        { name: 'High-Density Thermal Printing Paper (Sony Type V)', category: 'Consumables', qty: 300, unit: 'rolls', reorder: 60 },
        { name: 'Hospital Grade Surface Disinfectant Wipes (CaviWipes)', category: 'Cleaning', qty: 450, unit: 'canisters', reorder: 100 },
        { name: '0.9% Normal Saline Flush Syringes 10ml', category: 'Consumables', qty: 3500, unit: 'syringes', reorder: 800 },
    ];

    const itemIds = [];
    for (const item of items) {
        const isContrast = /contrast/i.test(item.category || '') || /صبغة|contrast/i.test(item.name || '');
        const result = await pool.query(
            `INSERT INTO inventory_items (name, category, quantity, unit, min_level, is_contrast_agent)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING item_id`,
            [item.name, item.category, item.qty, item.unit, item.reorder, isContrast]
        );
        itemIds.push({ id: result.rows[0].item_id, ...item });
    }

    const suppliers = [
        ['MedSupply Egypt', 'Nadia Fathy', 'procurement@medsupply.example', '+20 2 2400 1100', 'Cairo Medical District', 'EG-TAX-1001'],
        ['Radiology Consumables Co.', 'Karim Adel', 'orders@radconsumables.example', '+20 2 2400 1200', 'Nasr City, Cairo', 'EG-TAX-1002'],
        ['Imaging Systems Service', 'Salma Nabil', 'service@imagingsystems.example', '+20 3 5400 3300', 'Smouha, Alexandria', 'EG-TAX-1003']
    ];
    const supplierIds = [];
    for (const supplier of suppliers) {
        const result = await pool.query(
            `INSERT INTO suppliers (name, contact_name, email, phone, address, tax_id, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'Active') RETURNING supplier_id`, supplier
        );
        supplierIds.push(result.rows[0].supplier_id);
    }

    const admin = userIds.find(u => u.role === 'Admin') || userIds[0];
    for (let poIndex = 0; poIndex < 3; poIndex++) {
        const poStatus = ['Completed', 'Partially Received', 'Sent'][poIndex];
        const po = await pool.query(
            `INSERT INTO purchase_orders (
                po_number, supplier_id, status, order_date, expected_date, total_amount, notes, created_by
             ) VALUES ($1, $2, $3, CURRENT_DATE - $4::integer, CURRENT_DATE + $5::integer, 0, $6, $7)
             RETURNING po_id`,
            [`PO-DEMO-${String(poIndex + 1).padStart(4, '0')}`, supplierIds[poIndex], poStatus, 30 - poIndex * 9, poIndex * 4, `Demo ${poStatus.toLowerCase()} purchase order`, admin.id]
        );
        let total = 0;
        for (const item of itemIds.slice(poIndex * 3, poIndex * 3 + 4)) {
            const ordered = randomInt(40, 180);
            const received = poStatus === 'Completed' ? ordered : poStatus === 'Partially Received' ? Math.floor(ordered * 0.55) : 0;
            const unitPrice = randomInt(20, 950);
            total += ordered * unitPrice;
            await pool.query(
                `INSERT INTO purchase_order_items (po_id, item_id, ordered_quantity, received_quantity, unit_price, total_price)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [po.rows[0].po_id, item.id, ordered, received, unitPrice, ordered * unitPrice]
            );
            if (received > 0) {
                const batch = await pool.query(
                    `INSERT INTO inventory_batches (item_id, po_id, lot_number, expiry_date, quantity, received_date)
                     VALUES ($1, $2, $3, CURRENT_DATE + INTERVAL '18 months', $4, CURRENT_DATE - INTERVAL '5 days')
                     RETURNING batch_id`,
                    [item.id, po.rows[0].po_id, `LOT-${poIndex + 1}-${itemIds.indexOf(item) + 1}`, received]
                );
                await pool.query(
                    `INSERT INTO stock_movements (
                        item_id, batch_id, movement_type, quantity_change, reference_type,
                        reference_id, notes, created_by, unit_price, total_amount
                     ) VALUES ($1, $2, 'Receive', $3, 'PurchaseOrder', $4, $5, $6, $7, $8)`,
                    [item.id, batch.rows[0].batch_id, received, po.rows[0].po_id, 'Demo stock receipt', admin.id, unitPrice, received * unitPrice]
                );
            }
        }
        await pool.query('UPDATE purchase_orders SET total_amount = $2 WHERE po_id = $1', [po.rows[0].po_id, total]);
    }

    for (const modality of modalityIds.slice(0, 8)) {
        await pool.query(
            `INSERT INTO service_contracts (
                modality_id, provider_name, contact_info, start_date, end_date, cost, status, notes
             ) VALUES ($1, $2, $3, CURRENT_DATE - INTERVAL '6 months', CURRENT_DATE + INTERVAL '6 months', $4, 'Active', $5)`,
            [modality.id, 'Imaging Systems Service', 'service@imagingsystems.example', randomInt(18000, 85000), 'Preventive maintenance and emergency response SLA']
        );
        await pool.query(
            `INSERT INTO equipment_maintenance (
                modality_id, maintenance_type, scheduled_date, completed_date, performed_by, cost, status, notes
             ) VALUES ($1, 'Preventive', CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '30 days', $2, $3, 'Completed', $4),
                      ($1, 'Calibration', CURRENT_DATE + INTERVAL '14 days', NULL, $2, $3, 'Scheduled', $5)`,
            [modality.id, 'Imaging Systems Service', randomInt(2500, 9000), 'Completed preventive inspection', 'Upcoming image quality calibration']
        );
    }
    for (const modality of modalityIds.slice(0, 3)) {
        await pool.query(
            `INSERT INTO equipment_downtime (
                modality_id, start_time, end_time, reason, status, resolution_notes, created_by
             ) VALUES ($1, NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days' + INTERVAL '3 hours',
                       'Scheduled preventive service window', 'Resolved', 'Returned to service after verification', $2)`,
            [modality.id, admin.id]
        );
    }

    const expenseCategories = [
        ['Equipment Maintenance', 'Preventive and corrective equipment servicing'],
        ['Medical Supplies', 'Clinical consumables and contrast agents'],
        ['Utilities', 'Electricity, network, and facility utilities'],
        ['Training', 'Clinical and operational staff training']
    ];
    for (const [index, category] of expenseCategories.entries()) {
        const result = await pool.query(
            `INSERT INTO expense_categories (name, description) VALUES ($1, $2) RETURNING category_id`, category
        );
        await pool.query(
            `INSERT INTO expenses (
                category_id, supplier_id, amount, tax_amount, expense_date, payment_method,
                reference_number, notes, logged_by, branch_id
             ) VALUES ($1, $2, $3, $4, CURRENT_DATE - $5::integer, 'Bank Transfer', $6, $7, $8, $9)`,
            [result.rows[0].category_id, supplierIds[index % supplierIds.length], randomInt(5000, 28000), randomInt(500, 2500), index * 7, `EXP-DEMO-${index + 1}`, category[1], admin.id, branches[index % branches.length].id]
        );
    }

    console.log(`   ✓ Seeded ${items.length} items, 3 suppliers/POs, stock batches, equipment service, and expenses`);
}

async function seedPortalGovernanceDeliveryAndIntegrations(userIds, patientIds, examTypes) {
    console.log('\n🔐 Seeding Patient Portal, Privacy, Result Delivery & Integration Operations...');
    const admin = userIds.find(u => u.role === 'Admin') || userIds[0];
    const receptionist = userIds.find(u => u.role === 'Receptionist') || admin;
    const samplePatients = patientIds.slice(0, 24);
    const examRows = (await pool.query(`
        SELECT e.exam_id, e.appointment_id, e.patient_id, a.referring_doctor_id
        FROM examinations e
        JOIN appointments a ON a.appointment_id = e.appointment_id
        WHERE e.status IN ('Finalized', 'Reporting')
        ORDER BY e.created_at DESC
        LIMIT 30
    `)).rows;

    for (const [index, patientId] of samplePatients.entries()) {
        await pool.query(
            `INSERT INTO patient_consents (patient_id, type, status, signed_by, source, metadata)
             VALUES ($1, $2, 'Active', $3, $4, $5)`,
            [patientId, index % 2 === 0 ? 'Diagnostic Imaging Consent' : 'Electronic Communications Consent', receptionist.id, index % 3 === 0 ? 'Portal' : 'Staff', JSON.stringify({ demo: true, language: index % 2 === 0 ? 'ar' : 'en' })]
        );
        if (index < 10) {
            await pool.query(
                `INSERT INTO patient_appointment_requests (
                    patient_id, preferred_date, preferred_time_window, modality_type, exam_type_id,
                    clinical_notes, contact_phone, contact_email, status, staff_notes, reviewed_by, reviewed_at
                 ) VALUES ($1, CURRENT_DATE + $2::integer, $3, $4, $5, $6, $7, $8, $9::varchar, $10, $11,
                           CASE WHEN $9::varchar = 'Pending' THEN NULL ELSE NOW() END)`,
                [
                    patientId, index + 1, index % 2 === 0 ? 'Morning' : 'Evening',
                    examTypes[index % examTypes.length].name.split(' ')[0], examTypes[index % examTypes.length].id,
                    'Demo portal appointment request for follow-up imaging', `010${String(10000000 + index).padStart(8, '0')}`,
                    `patient${index + 1}@demo.viara.local`, index < 4 ? 'Pending' : index < 7 ? 'Reviewed' : 'Scheduled',
                    index < 4 ? null : 'Reviewed by reception demo workflow', index < 4 ? null : receptionist.id
                ]
            );
        }
        if (index < 8) {
            await pool.query(
                `INSERT INTO patient_profile_update_requests (
                    patient_id, requested_changes, status, staff_notes, reviewed_by, reviewed_at
                 ) VALUES ($1, $2, $3::varchar, $4, $5, CASE WHEN $3::varchar = 'Pending' THEN NULL ELSE NOW() END)`,
                [patientId, JSON.stringify({ phone: `011${String(20000000 + index).padStart(8, '0')}`, address: 'Updated demo address, Cairo' }), index < 3 ? 'Pending' : 'Applied', index < 3 ? null : 'Identity verified and profile updated', index < 3 ? null : receptionist.id]
            );
        }
    }

    for (const [index, patientId] of samplePatients.slice(0, 6).entries()) {
        await pool.query(
            `INSERT INTO data_privacy_requests (
                patient_id, request_type, status, notes, requested_by, resolved_by,
                resolved_at, completed_at, resolution_notes, metadata
             ) VALUES ($1, $2, $3::varchar, $4, $5, $6,
                       CASE WHEN $3::varchar IN ('Completed', 'Resolved') THEN NOW() - INTERVAL '2 days' END,
                       CASE WHEN $3::varchar = 'Completed' THEN NOW() - INTERVAL '2 days' END,
                       $7, $8)`,
            [patientId, index % 2 === 0 ? 'Data Export' : 'Record Correction', index < 2 ? 'Pending' : index < 4 ? 'InReview' : 'Completed', 'Demo privacy-center request', admin.id, index < 4 ? null : admin.id, index < 4 ? null : 'Completed after identity and scope verification', JSON.stringify({ demo: true, channel: 'PatientPortal' })]
        );
    }

    for (const [index, exam] of examRows.entries()) {
        const deliveryStatus = index % 4 === 0 ? 'Acknowledged' : index % 4 === 1 ? 'Delivered' : index % 4 === 2 ? 'Sent' : 'Printed';
        const method = ['Patient Portal', 'WhatsApp Link', 'Email', 'Printed'][index % 4];
        await pool.query(
            `INSERT INTO result_deliveries (
                exam_id, appointment_id, patient_id, referring_doctor_id, delivery_method,
                recipient_name, recipient_contact, delivery_status, delivered_by, delivered_at,
                print_copy_count, acknowledged_at, acknowledged_by_name, notes, access_ip, user_agent
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::varchar, $9, NOW() - ($10::integer * INTERVAL '1 hour'),
                       $11, CASE WHEN $8::varchar = 'Acknowledged' THEN NOW() - INTERVAL '1 hour' END,
                       CASE WHEN $8::varchar = 'Acknowledged' THEN $6::varchar END, $12, '127.0.0.1', 'VIARA Demo Seeder')`,
            [exam.exam_id, exam.appointment_id, exam.patient_id, exam.referring_doctor_id, method, `Demo Recipient ${index + 1}`, `patient${index + 1}@demo.viara.local`, deliveryStatus, receptionist.id, index + 1, method === 'Printed' ? 1 : 0, 'Seeded end-to-end result delivery record']
        );
        if (index < 12) {
            await pool.query(
                `INSERT INTO documents (
                    patient_id, appointment_id, exam_id, uploaded_by, type, file_name,
                    file_path, mime_type, size_bytes, notes
                 ) VALUES ($1, $2, $3, $4, 'Radiology Report', $5, $6, 'application/pdf', $7, $8)`,
                [exam.patient_id, exam.appointment_id, exam.exam_id, receptionist.id, `demo-report-${exam.exam_id}.pdf`, `/demo/documents/${exam.exam_id}.pdf`, randomInt(120000, 900000), 'Demo clinical document metadata']
            );
            await pool.query(
                `INSERT INTO patient_portal_documents (
                    patient_id, appointment_id, exam_id, title, document_type, file_url,
                    is_patient_visible, uploaded_by, notes
                 ) VALUES ($1, $2, $3, $4, 'Report', $5, TRUE, $6, $7)`,
                [exam.patient_id, exam.appointment_id, exam.exam_id, `Radiology Result ${index + 1}`, `/portal/documents/${exam.exam_id}.pdf`, receptionist.id, 'Demo portal-visible report']
            );
        }
    }

    const integrations = (await pool.query(`SELECT integration_id, provider_name FROM integrations ORDER BY provider_name`)).rows;
    for (const [index, integration] of integrations.entries()) {
        const isFailure = index % 3 === 2;
        await pool.query(
            `UPDATE integrations
             SET health_status = $2::varchar, last_checked_at = NOW(),
                 last_success_at = CASE WHEN $2::varchar = 'Healthy' THEN NOW() - INTERVAL '15 minutes' END,
                 last_error_code = CASE WHEN $2::varchar <> 'Healthy' THEN 'DEMO_PROVIDER_TIMEOUT' END,
                 last_error_message = CASE WHEN $2::varchar <> 'Healthy' THEN 'Seeded transient provider timeout' END,
                 updated_by = $3
             WHERE integration_id = $1`,
            [integration.integration_id, isFailure ? 'Degraded' : 'Healthy', admin.id]
        );
        await pool.query(
            `INSERT INTO integration_logs (
                integration_id, event_type, payload, status, error_message, retry_count,
                idempotency_key, webhook_id, delivery_attempt, max_retries,
                next_retry_at, completed_at, provider_response
             ) VALUES ($1, $2, $3, $4::varchar, $5, $6, $7, $8, 1, 3,
                       CASE WHEN $4::varchar = 'Failed' THEN NOW() + INTERVAL '10 minutes' END,
                       CASE WHEN $4::varchar = 'Success' THEN NOW() END, $9)`,
            [integration.integration_id, 'DemoHealthProbe', JSON.stringify({ provider: integration.provider_name, demo: true }), isFailure ? 'Failed' : 'Success', isFailure ? 'Provider timeout during demo health check' : null, isFailure ? 1 : 0, `demo-health-${integration.integration_id}`, `wh_demo_${index + 1}`, JSON.stringify({ accepted: !isFailure, code: isFailure ? 504 : 200 })]
        );
    }

    console.log(`   ✓ Seeded portal requests/consents, privacy workflows, ${examRows.length} result deliveries, documents, and integration health logs`);
}

async function seedInsuranceFinanceNotificationsAndPACS(userIds, patientIds, providerIds, policyMap, examTypes, doctorIds, branches) {
    console.log('\n💼 Seeding Insurance Governance, Finance, Notifications & PACS Exceptions...');
    const admin = userIds.find(user => user.role === 'Admin') || userIds[0];
    const accountant = userIds.find(user => user.role === 'Accountant') || admin;
    const insuranceStaff = userIds.find(user => user.role === 'Insurance_Staff') || admin;
    const marketing = userIds.find(user => user.role === 'Marketing') || admin;
    const clinicalRows = (await pool.query(`
        SELECT e.exam_id, e.appointment_id, e.patient_id, e.exam_type_id, e.study_instance_uid,
               i.invoice_id, i.total_amount, i.branch_id, a.referring_doctor_id
        FROM examinations e
        JOIN appointments a ON a.appointment_id = e.appointment_id
        LEFT JOIN invoices i ON i.exam_id = e.exam_id
        WHERE i.invoice_id IS NOT NULL
        ORDER BY e.created_at DESC
        LIMIT 30
    `)).rows;

    for (const [index, provider] of providerIds.slice(0, 4).entries()) {
        await pool.query(
            `INSERT INTO insurance_coverage_rules (
                provider_id, exam_type_id, modality_type, coverage_percentage,
                coverage_ceiling, copay_amount, preauthorization_required,
                effective_from, effective_to, is_active, notes
             ) VALUES ($1, $2, $3, $4, $5, $6, $7,
                       CURRENT_DATE - INTERVAL '1 year', CURRENT_DATE + INTERVAL '1 year', TRUE, $8)`,
            [provider.id, examTypes[index].id, examTypes[index].name.split(' ')[0], 70 + index * 5, 5000 + index * 1500, 150 + index * 50, index % 2 === 0, 'Demo payer coverage rule']
        );
    }
    for (const [index, row] of clinicalRows.slice(0, 6).entries()) {
        const policy = policyMap.get(row.patient_id);
        if (!policy) continue;
        const status = ['Approved', 'Pending', 'Rejected'][index % 3];
        await pool.query(
            `INSERT INTO insurance_approvals (
                patient_id, policy_id, provider_id, appointment_id, exam_id, exam_type_id,
                status, approval_number, requested_amount, approved_amount, rejection_reason,
                expires_at, requested_by, decided_by, decided_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7::varchar, $8, $9,
                       CASE WHEN $7::varchar = 'Approved' THEN $9::numeric * 0.8 ELSE 0 END,
                       CASE WHEN $7::varchar = 'Rejected' THEN 'Clinical indication requires additional documentation' END,
                       CURRENT_DATE + INTERVAL '45 days', $10,
                       CASE WHEN $7::varchar = 'Pending' THEN NULL ELSE $10::uuid END,
                       CASE WHEN $7::varchar = 'Pending' THEN NULL ELSE NOW() END)`,
            [row.patient_id, policy.policyId, policy.providerId, row.appointment_id, row.exam_id, row.exam_type_id, status, status === 'Approved' ? `AUTH-DEMO-${index + 1}` : null, row.total_amount, insuranceStaff.id]
        );
    }

    const claims = (await pool.query(`
        SELECT claim_id, invoice_id, received_amount, branch_id, currency_code
        FROM insurance_claims
        WHERE received_amount > 0
        ORDER BY created_at DESC
        LIMIT 8
    `)).rows;
    for (const [index, claim] of claims.entries()) {
        await pool.query(
            `INSERT INTO claim_receipts (
                claim_id, invoice_id, amount, business_date, branch_id, currency_code,
                reference_number, cumulative_amount, received_by, idempotency_key
             ) VALUES ($1, $2, $3, CURRENT_DATE - $4::integer,
                       COALESCE($5::uuid, $6::uuid), COALESCE($7::char(3), 'EGP'::char(3)),
                       $8, $3, $9, $10)`,
            [claim.claim_id, claim.invoice_id, claim.received_amount, index, claim.branch_id, branches[0].id, claim.currency_code, `REMIT-DEMO-${index + 1}`, accountant.id, crypto.randomUUID()]
        );
    }

    const priorMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 10);
    const priorMonthEnd = new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().slice(0, 10);
    await pool.query(
        `INSERT INTO financial_periods (
            period_type, start_date, end_date, branch_id, status, totals_snapshot,
            source_counts, snapshot_checksum, closed_by, approved_by, closed_at
         ) VALUES ('Monthly', $1, $2, $3, 'Finalized', $4, $5, $6, $7, $7, NOW() - INTERVAL '5 days')`,
        [priorMonthStart, priorMonthEnd, branches[0].id, JSON.stringify({ revenue: 1250000, expenses: 240000, net: 1010000 }), JSON.stringify({ invoices: 980, payments: 972, expenses: 34 }), crypto.createHash('sha256').update(`period:${priorMonthStart}`).digest('hex'), accountant.id]
    );
    await pool.query(
        `INSERT INTO financial_closures (
            closure_date, total_revenue, total_expenses, net_profit, status, closed_by, branch_id
         ) VALUES (CURRENT_DATE - INTERVAL '1 day', 184500, 31200, 153300, 'Finalized', $1, $2)`,
        [accountant.id, branches[0].id]
    );
    for (const [index, row] of clinicalRows.slice(0, 6).entries()) {
        await pool.query(
            `INSERT INTO commission_payables (
                doctor_id, exam_id, amount, status, paid_date, transaction_ref, paid_by, branch_id
             ) VALUES ($1, $2, $3, $4::varchar,
                       CASE WHEN $4::varchar = 'Paid' THEN NOW() - INTERVAL '3 days' END,
                       CASE WHEN $4::varchar = 'Paid' THEN $5::varchar END,
                       CASE WHEN $4::varchar = 'Paid' THEN $6::uuid END, $7)`,
            [doctorIds[index % doctorIds.length].id, row.exam_id, Math.round(Number(row.total_amount) * 0.1), index < 3 ? 'Paid' : 'Pending', `COMM-DEMO-${index + 1}`, accountant.id, row.branch_id || branches[0].id]
        );
    }

    for (const patientId of patientIds.slice(0, 6)) {
        await pool.query(
            `INSERT INTO notification_preferences (
                patient_id, email_enabled, sms_enabled, whatsapp_enabled,
                notify_appointment_reminder, notify_report_ready, notify_marketing, time_zone
             ) VALUES ($1, TRUE, TRUE, $2, TRUE, TRUE, $3, 'Africa/Cairo')`,
            [patientId, Math.random() > 0.5, Math.random() > 0.5]
        );
    }
    for (const staff of [admin, accountant, insuranceStaff, marketing]) {
        await pool.query(
            `INSERT INTO notification_preferences (
                staff_user_id, role, email_enabled, sms_enabled, inapp_enabled,
                notify_security_event, notify_order_events, notify_claim_update, time_zone
             ) VALUES ($1, $2, TRUE, FALSE, TRUE, TRUE, TRUE, TRUE, 'Africa/Cairo')`,
            [staff.id, staff.role]
        );
    }
    for (const [index, row] of clinicalRows.slice(0, 8).entries()) {
        const recipientUser = index % 2 === 0 ? admin : insuranceStaff;
        const eventType = index % 2 === 0 ? 'ReportReady' : 'ClaimStatusChanged';
        const priority = index === 0 ? 'Critical' : index % 3 === 0 ? 'Warning' : 'Normal';
        const jobStatus = ['Sent', 'Sent', 'Pending', 'Failed', 'Skipped'][index % 5];
        const notificationStatus = jobStatus === 'Failed' ? 'Failed' : jobStatus === 'Pending' ? 'Pending' : 'Delivered';
        const notification = await pool.query(
            `INSERT INTO notifications (
                recipient, type, subject, content, status, channel, event_type, entity_id,
                patient_id, sent_at, audience_type, audience_role, recipient_user_id, priority, is_read
             ) VALUES ($1, 'InApp', $2, $3, $12::varchar, 'InApp', $4, $5, $6,
                       CASE WHEN $12::varchar IN ('Delivered', 'Sent') THEN NOW() - ($7::integer * INTERVAL '1 hour') END,
                       'Staff', $8, $9, $10, $11)
             RETURNING notification_id`,
            [recipientUser.email, `Demo ${eventType}`, `Operational notification for seeded exam ${row.exam_id}`, eventType, row.exam_id, row.patient_id, index + 1, recipientUser.role, recipientUser.id, priority, index % 3 === 0, notificationStatus]
        );
        await pool.query(
            `INSERT INTO notification_jobs (
                event_type, channel, recipient_type, recipient_id, entity_type, entity_id,
                variables, status, scheduled_for, processed_at, notification_id,
                error_message, retry_count, max_retries, idempotency_key, next_retry_at, priority
             ) VALUES ($1, 'InApp', 'Staff', $2, 'Exam', $3, $4, $8::varchar,
                       NOW() + CASE WHEN $8::varchar = 'Pending' THEN INTERVAL '6 hours' ELSE INTERVAL '-2 hours' END,
                       CASE WHEN $8::varchar IN ('Sent', 'Skipped') THEN NOW() - INTERVAL '1 hour' END,
                       $5, CASE WHEN $8::varchar = 'Failed' THEN 'Seeded provider timeout' END,
                       CASE WHEN $8::varchar = 'Failed' THEN 2 ELSE 0 END, 2, $6,
                       CASE WHEN $8::varchar = 'Failed' THEN NOW() + INTERVAL '12 hours' END, $7)`,
            [eventType, recipientUser.id, row.exam_id, JSON.stringify({ order_number: row.exam_id, demo: true }), notification.rows[0].notification_id, `demo-notification-${index + 1}`, priority, jobStatus]
        );
    }

    const pacsRows = clinicalRows.filter(row => row.study_instance_uid).slice(0, 2);
    if (pacsRows[0]) {
        await pool.query(
            `INSERT INTO pacs_quarantine_studies (
                study_instance_uid, orthanc_study_id, raw_patient_id, raw_patient_name,
                raw_accession_number, modality, quarantine_reason, status
             ) VALUES ($1, 'orthanc-demo-pending', 'UNKNOWN-001', 'Unmatched Demo Patient',
                       'ACC-DEMO-404', 'CT', 'Accession number not found', 'Pending')`,
            [`${pacsRows[0].study_instance_uid}.quarantine`]
        );
    }
    if (pacsRows[1]) {
        await pool.query(
            `INSERT INTO pacs_quarantine_studies (
                study_instance_uid, orthanc_study_id, raw_patient_id, raw_patient_name,
                raw_accession_number, modality, quarantine_reason, status,
                resolved_by, resolved_at, resolved_exam_id
             ) VALUES ($1, 'orthanc-demo-reconciled', 'DEMO-MISMATCH', 'Reconciled Demo Patient',
                       'ACC-DEMO-200', 'MRI', 'Patient identifier mismatch', 'Reconciled', $2, NOW(), $3)`,
            [`${pacsRows[1].study_instance_uid}.reconciled`, admin.id, pacsRows[1].exam_id]
        );
    }
    await pool.query(
        `INSERT INTO pacs_reconciliation_queue (
            orthanc_instance_id, study_instance_uid, accession_number, payload, status, attempts, error, result, processed_at
         ) VALUES
            ('orthanc-inst-pending', '1.2.826.demo.pending', 'ACC-DEMO-PENDING', '{"demo":true}'::jsonb, 'pending', 0, NULL, NULL, NULL),
            ('orthanc-inst-complete', '1.2.826.demo.complete', 'ACC-DEMO-COMPLETE', '{"demo":true}'::jsonb, 'completed', 1, NULL, '{"matched":true}'::jsonb, NOW()),
            ('orthanc-inst-failed', '1.2.826.demo.failed', 'ACC-DEMO-FAILED', '{"demo":true}'::jsonb, 'failed', 3, 'Accession mapping failed', NULL, NOW())`
    );
    await pool.query(
        `INSERT INTO pacs_audit (event_type, actor_user_id, accession_number, study_instance_uid, remote_ip, detail)
         VALUES
            ('STUDY_QUARANTINED', $1, 'ACC-DEMO-404', '1.2.826.demo.pending', '127.0.0.1', '{"demo":true}'::jsonb),
            ('STUDY_RECONCILED', $1, 'ACC-DEMO-200', '1.2.826.demo.complete', '127.0.0.1', '{"demo":true}'::jsonb),
            ('IMAGE_VIEW', $1, 'ACC-DEMO-VIEW', '1.2.826.demo.view', '127.0.0.1', '{"demo":true}'::jsonb)`,
        [admin.id]
    );
    console.log('   ✓ Seeded insurance approvals/receipts, finance periods/commissions, notifications, and PACS exceptions');
}

async function validateSeedCoverage() {
    console.log('\n🔎 Validating comprehensive demo coverage...');
    const checks = [
        ['users', 17], ['patients', 500], ['appointments', 100], ['examinations', 100],
        ['invoice_items', 100], ['queue_events', 10], ['clinical_task_assignment_events', 10],
        ['exam_safety_responses', 2], ['result_deliveries', 10], ['patient_appointment_requests', 5],
        ['data_privacy_requests', 3], ['purchase_orders', 2], ['stock_movements', 2],
        ['equipment_maintenance', 5], ['payroll_runs', 2], ['payroll_employee_items', 10],
        ['insurance_approvals', 2], ['claim_receipts', 1], ['notification_jobs', 5],
        ['notifications', 5], ['integration_logs', 3], ['pacs_quarantine_studies', 1]
    ];
    for (const [table, minimum] of checks) {
        const result = await pool.query(`SELECT COUNT(*)::integer AS count FROM ${table}`);
        const count = Number(result.rows[0].count);
        if (count < minimum) throw new Error(`Coverage validation failed: ${table} has ${count}, expected at least ${minimum}`);
        console.log(`   ✓ ${table}: ${count}`);
    }
    const roles = await pool.query('SELECT COUNT(DISTINCT role)::integer AS count FROM users WHERE is_active = TRUE');
    if (Number(roles.rows[0].count) < 12) throw new Error(`Coverage validation failed: only ${roles.rows[0].count} active roles represented`);
    const stages = await pool.query("SELECT COUNT(DISTINCT queue_stage)::integer AS count FROM examinations WHERE queue_stage <> 'Cancelled'");
    if (Number(stages.rows[0].count) < 7) throw new Error(`Coverage validation failed: only ${stages.rows[0].count} queue stages represented`);
    const unassigned = await pool.query(`
        SELECT COUNT(*)::integer AS count
        FROM examinations e
        JOIN appointments a ON a.appointment_id = e.appointment_id
        WHERE (e.current_station = 'Nurse' AND a.nurse_id IS NULL)
           OR (e.current_station = 'Modality' AND a.technician_id IS NULL)
           OR (e.current_station = 'Radiologist' AND e.performing_radiologist_id IS NULL)
    `);
    if (Number(unassigned.rows[0].count) < 10) throw new Error('Coverage validation failed: insufficient unassigned clinical tasks');
    console.log(`   ✓ Active roles: ${roles.rows[0].count}; queue stages: ${stages.rows[0].count}; unassigned tasks: ${unassigned.rows[0].count}`);
}

async function main() {
    console.log('================================================================');
    console.log('🚀 Launching VIARA Comprehensive Enterprise Database Seeding');
    console.log('================================================================\n');

    try {
        await clearDatabase();

        const branches = await seedBranchesAndSettings();
        const userIds = await seedUsers();
        const doctorIds = await seedReferringDoctors(userIds);
        const modalityIds = await seedModalities();
        const examTypes = await seedExaminationTypes(modalityIds);
        await seedSafetyTemplates(modalityIds);
        await seedReportTemplates(userIds, examTypes);
        const patientIds = await seedPatients(600);
        const { providerIds, policyMap } = await seedInsuranceProvidersAndPolicies(patientIds);
        await seedAppointmentsExamsAndPACS(patientIds, modalityIds, examTypes, userIds, doctorIds, policyMap, branches);
        await seedClinicalWorkflowHistory(userIds);
        await seedHRAndPayroll(userIds);
        await seedCRMMarketingAndFeedback(userIds, patientIds);
        await seedRealtimeCommunications(userIds, patientIds);
        await seedInventorySupplies(userIds, modalityIds, branches);
        await seedPortalGovernanceDeliveryAndIntegrations(userIds, patientIds, examTypes);
        await seedInsuranceFinanceNotificationsAndPACS(userIds, patientIds, providerIds, policyMap, examTypes, doctorIds, branches);
        await validateSeedCoverage();

        console.log('\n================================================================');
        console.log('✅ VIARA Comprehensive Seeding Completed and Validated!');
        console.log('   All 12 roles and major clinical, portal, financial, PACS,');
        console.log('   insurance, inventory, HR/payroll, CRM, and integration flows are ready.');
        console.log('================================================================\n');

    } catch (error) {
        console.error('\n❌ Seeding encountered an error:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
