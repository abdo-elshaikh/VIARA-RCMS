const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const rootEnvPath = path.resolve(__dirname, '../.env');
const backendEnvPath = path.resolve(__dirname, '../backend/.env');
require('dotenv').config({ path: fs.existsSync(rootEnvPath) ? rootEnvPath : backendEnvPath });

const seedPassword = process.env.TEST_USER_PASSWORD;
if (!seedPassword) {
    console.error('❌ TEST_USER_PASSWORD is not set. Aborting to avoid seeding with a known weak password.');
    process.exit(1);
}

// Encryption utilities (matching backend utils v2 GCM format)
const GCM_IV_LENGTH = 12;
function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(GCM_IV_LENGTH);
    const keyHex = process.env.ENCRYPTION_KEY;
    const key = Buffer.from(keyHex, 'hex');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(String(text), 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `v2:default:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

// Database connection
const connectionString = process.env.DATABASE_URL || 'postgresql://***REMOVED***/VIARA';
const pool = new Pool({ connectionString });

// Egyptian names database
const firstNames = {
    male: ['Ahmed', 'Mohamed', 'Mahmoud', 'Ali', 'Omar', 'Youssef', 'Hassan', 'Khaled', 'Amr', 'Tamer', 'Sherif', 'Karim', 'Hany', 'Essam', 'Rami', 'Tarek', 'Hisham', 'Yasser', 'Wael', 'Ashraf'],
    female: ['Fatma', 'Mona', 'Heba', 'Nour', 'Sara', 'Mai', 'Dina', 'Rana', 'Mariam', 'Yasmin', 'Aya', 'Salma', 'Noha', 'Laila', 'Hania', 'Rania', 'Sherine', 'Amira', 'Nerveen', 'Ghada']
};
const lastNames = ['Ibrahim', 'Hassan', 'Ali', 'Mohamed', 'Mahmoud', 'Khalil', 'Shafik', 'Farouk', 'Naguib', 'Saad', 'Mansour', 'Fouad', 'Amin', 'Kamal', 'Zaki', 'El-Sayed', 'Soliman', 'Radwan', 'El-Sharkawy', 'Abdel-Rahman'];

// Utility functions
const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
const randomPhone = () => `01${randomElement(['0', '1', '2', '5'])}${String(randomInt(10000000, 99999999))}`;
const randomAddress = () => {
    const streets = ['El-Tahrir St', 'Ramses St', 'Salah Salem St', 'El-Haram St', 'Kornish El-Nile', '9th St', 'Abbas El-Akkad St', 'Makram Ebeid St'];
    const districts = ['Nasr City', 'Heliopolis', 'Maadi', 'Dokki', 'Zamalek', 'New Cairo', '6th October', 'Sheikh Zayed', 'Mohandessin'];
    return `${randomInt(1, 200)} ${randomElement(streets)}, ${randomElement(districts)}, Cairo, Egypt`;
};

async function clearDatabase() {
    console.log('🗑️  Clearing existing data...');
    const tables = [
        'system_logs', 'insurance_claims', 'insurance_approvals', 'patient_insurance_policies',
        'payments', 'invoices', 'examinations', 'appointments', 'referring_doctors',
        'patients', 'contracts', 'insurance_providers', 'examination_types',
        'modalities', 'inventory', 'staff', 'users'
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
        { name: 'Dr. Administrator', email: 'admin@VIARA.com', role: 'Admin' },
        { name: 'John Accountant', email: 'accountant@VIARA.com', role: 'Accountant' },
        { name: 'Sarah Receptionist', email: 'reception@VIARA.com', role: 'Receptionist' },
        { name: 'HR Manager', email: 'hr@VIARA.com', role: 'HR' },
        { name: 'Dr. Ahmed Hassan', email: 'ahmed.hassan@VIARA.com', role: 'Radiologist' },
        { name: 'Dr. Mona Ibrahim', email: 'mona.ibrahim@VIARA.com', role: 'Radiologist' },
        { name: 'Dr. Omar Khalil', email: 'omar.khalil@VIARA.com', role: 'Radiologist' },
        { name: 'Dr. Fatma Saad', email: 'fatma.saad@VIARA.com', role: 'Radiologist' },
        { name: 'Tech. Mohamed Ali', email: 'mohamed.tech@VIARA.com', role: 'Technician' },
        { name: 'Tech. Sara Mahmoud', email: 'sara.tech@VIARA.com', role: 'Technician' },
        { name: 'Nurse Heba Fouad', email: 'heba.nurse@VIARA.com', role: 'Nurse' },
        { name: 'Nurse Dina Kamal', email: 'dina.nurse@VIARA.com', role: 'Nurse' },
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

async function seedReferringDoctors(userIds) {
    console.log('\n🩺 Seeding Referring Doctors...');
    const admin = userIds.find(u => u.role === 'Admin') || userIds[0];

    const doctors = [
        { name: 'Dr. Tarek El-Sayed', specialty: 'Orthopedic Surgery', hospital: 'Cairo Medical Center', commission: 12.0 },
        { name: 'Dr. Khaled Mansour', specialty: 'Neurology', hospital: 'Nile Hospital', commission: 15.0 },
        { name: 'Dr. Rania Naguib', specialty: 'Cardiology', hospital: 'Dar Al Fouad', commission: 10.0 },
        { name: 'Dr. Hisham Farouk', specialty: 'Oncology', hospital: 'As-Salam International', commission: 12.5 },
        { name: 'Dr. Yasser Zaki', specialty: 'Internal Medicine', hospital: 'Giza Specialized Hospital', commission: 8.0 },
        { name: 'Dr. Wael Soliman', specialty: 'Neurosurgery', hospital: 'Cleopatra Hospital', commission: 15.0 },
        { name: 'Dr. Ashraf Radwan', specialty: 'Pulmonology', hospital: 'Saudi German Hospital', commission: 10.0 },
        { name: 'Dr. Sherine El-Sharkawy', specialty: 'Pediatrics', hospital: 'Children Cancer Hospital 57357', commission: 5.0 },
        { name: 'Dr. Amira Abdel-Rahman', specialty: 'Gynecology & Obstetrics', hospital: 'Women Health Center', commission: 10.0 },
        { name: 'Dr. Nerveen Shafik', specialty: 'Urology', hospital: 'Cairo Kidney Center', commission: 12.0 },
        { name: 'Dr. Ghada Amin', specialty: 'General Surgery', hospital: 'El-Galaa Military Hospital', commission: 10.0 },
        { name: 'Dr. Karim Fouad', specialty: 'ENT Surgery', hospital: 'Specialized ENT Clinic', commission: 8.0 },
        { name: 'Dr. Hany Zaki', specialty: 'Vascular Surgery', hospital: 'Vascular Care Center', commission: 12.0 },
        { name: 'Dr. Essam Saad', specialty: 'Gastroenterology', hospital: 'GI Health Institute', commission: 10.0 },
        { name: 'Dr. Rami Mansour', specialty: 'Rheumatology', hospital: 'Maadi Armed Forces Hospital', commission: 8.0 },
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
    console.log('\n🛡️ Seeding Insurance Providers & Patient Policies...');

    const providers = [
        { name: 'Blue Cross Shield', code: 'BCS-EGY', phone: '19001', email: 'claims@bluecross.eg' },
        { name: 'AXA Egypt Health', code: 'AXA-EGY', phone: '19777', email: 'medical@axa.eg' },
        { name: 'Bupa Global Middle East', code: 'BUPA-ME', phone: '19888', email: 'approvals@bupa.com' },
        { name: 'MetLife Alico Egypt', code: 'MET-EGY', phone: '19999', email: 'claims@metlife.eg' },
        { name: 'Allianz Care Egypt', code: 'ALLZ-EGY', phone: '19111', email: 'health@allianz.eg' },
        { name: 'Misr Health Insurance', code: 'MISR-INS', phone: '19222', email: 'support@misrins.com' },
        { name: 'GlobeMed Egypt', code: 'GLOBE-EGY', phone: '19333', email: 'approvals@globemedegypt.com' },
        { name: 'Medicare Universal Care', code: 'MED-GOV', phone: '19444', email: 'claims@uhia.gov.eg' },
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
    console.log(`   ✓ Created ${providerIds.length} insurance providers`);

    // Attach policies to 300 patients
    let policiesCreated = 0;
    const policyMap = new Map();
    for (let i = 0; i < Math.min(300, patientIds.length); i++) {
        const patientId = patientIds[i];
        const provider = randomElement(providerIds);
        const policyNumber = `POL-${randomInt(100000, 999999)}`;
        const memberNumber = `MEM-${randomInt(1000000, 9999999)}`;
        const planName = randomElement(['Gold VIP', 'Silver Choice', 'Platinum Executive', 'Corporate Standard']);

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
            policiesCreated++;
        } catch (e) {
            // Ignore unique conflict if any
        }
    }
    console.log(`   ✓ Created ${policiesCreated} patient insurance policies`);
    return { providerIds, policyMap };
}

async function seedModalities() {
    console.log('\n🏥 Seeding Modalities (Machines)...');
    const modalities = [
        { name: 'MRI-01 Siemens Skyra 3T', type: 'MRI', room: 'Room 101', status: 'Active' },
        { name: 'MRI-02 GE Signa Artist 1.5T', type: 'MRI', room: 'Room 102', status: 'Active' },
        { name: 'MRI-03 Canon Vantage Galan 3T', type: 'MRI', room: 'Room 103', status: 'Active' },
        { name: 'CT-01 Philips iCT 256-Slice', type: 'CT', room: 'Room 201', status: 'Active' },
        { name: 'CT-02 GE Revolution 128-Slice', type: 'CT', room: 'Room 202', status: 'Active' },
        { name: 'CT-03 Siemens SOMATOM Force', type: 'CT', room: 'Room 203', status: 'Active' },
        { name: 'X-Ray-01 Digital Fixed', type: 'X-Ray', room: 'Room 301', status: 'Active' },
        { name: 'X-Ray-02 Mobile Wireless', type: 'X-Ray', room: 'Room 302', status: 'Active' },
        { name: 'X-Ray-03 Shimadzu RADspeed', type: 'X-Ray', room: 'Room 303', status: 'Active' },
        { name: 'US-01 GE Voluson E10 4D', type: 'Ultrasound', room: 'Room 401', status: 'Active' },
        { name: 'US-02 Philips EPIQ 7 Vascular', type: 'Ultrasound', room: 'Room 402', status: 'Active' },
        { name: 'US-03 Canon Aplio i800', type: 'Ultrasound', room: 'Room 403', status: 'Active' },
        { name: 'PET-CT-01 Siemens Biograph', type: 'PET', room: 'Room 501', status: 'Active' },
        { name: 'Mammo-01 Hologic 3D Dimensions', type: 'Mammography', room: 'Room 601', status: 'Active' },
        { name: 'DEXA-01 Hologic Horizon', type: 'DEXA', room: 'Room 602', status: 'Active' },
        { name: 'Fluoroscopy Siemens Luminos', type: 'Fluoroscopy', room: 'Room 701', status: 'Active' },
    ];

    const modalityIds = [];
    for (const mod of modalities) {
        const result = await pool.query(
            `INSERT INTO modalities (name, type, room_number, status) 
             VALUES ($1, $2, $3, $4::machine_status) RETURNING modality_id`,
            [mod.name, mod.type, mod.room, mod.status]
        );
        modalityIds.push({ ...mod, id: result.rows[0].modality_id });
    }
    console.log(`   ✓ Created ${modalities.length} modalities`);
    return modalityIds;
}

async function seedExaminationTypes(modalityIds) {
    console.log('\n🔬 Seeding Examination Types...');

    const examTypes = [
        // MRI
        { name: 'Brain MRI with Contrast', modalityType: 'MRI', price: 3800, duration: 45 },
        { name: 'Brain MRI Plain', modalityType: 'MRI', price: 3200, duration: 35 },
        { name: 'Lumbar Spine MRI', modalityType: 'MRI', price: 3500, duration: 40 },
        { name: 'Cervical Spine MRI', modalityType: 'MRI', price: 3400, duration: 40 },
        { name: 'Knee Joint MRI', modalityType: 'MRI', price: 3000, duration: 35 },
        { name: 'Cardiac MRI', modalityType: 'MRI', price: 5500, duration: 60 },
        { name: 'Abdomen & Pelvis MRI', modalityType: 'MRI', price: 4800, duration: 50 },
        // CT
        { name: 'Brain CT Scan', modalityType: 'CT', price: 1600, duration: 15 },
        { name: 'Chest HRCT', modalityType: 'CT', price: 2200, duration: 20 },
        { name: 'Abdomen & Pelvis CT with Contrast', modalityType: 'CT', price: 2800, duration: 25 },
        { name: 'Coronary CT Angiography', modalityType: 'CT', price: 4200, duration: 30 },
        { name: 'CT Pulmonary Angiogram', modalityType: 'CT', price: 3500, duration: 25 },
        { name: 'Spine CT Scan', modalityType: 'CT', price: 1900, duration: 20 },
        // X-Ray
        { name: 'Chest X-Ray PA & Lateral', modalityType: 'X-Ray', price: 350, duration: 10 },
        { name: 'Lumbar Spine X-Ray', modalityType: 'X-Ray', price: 450, duration: 15 },
        { name: 'Knee X-Ray AP & Lat', modalityType: 'X-Ray', price: 380, duration: 10 },
        { name: 'Skull X-Ray', modalityType: 'X-Ray', price: 400, duration: 15 },
        { name: 'Abdomen Plain X-Ray (KUB)', modalityType: 'X-Ray', price: 350, duration: 10 },
        // Ultrasound
        { name: 'Abdominal Ultrasound', modalityType: 'Ultrasound', price: 700, duration: 25 },
        { name: 'Pelvic Ultrasound', modalityType: 'Ultrasound', price: 650, duration: 20 },
        { name: 'Thyroid Ultrasound', modalityType: 'Ultrasound', price: 600, duration: 20 },
        { name: 'Carotid Doppler Ultrasound', modalityType: 'Ultrasound', price: 1200, duration: 30 },
        { name: 'Lower Limb Arterial Doppler', modalityType: 'Ultrasound', price: 1400, duration: 35 },
        { name: 'Echocardiogram (Cardiac Echo)', modalityType: 'Ultrasound', price: 1100, duration: 30 },
        // PET
        { name: 'Whole Body PET-CT Oncology', modalityType: 'PET', price: 9500, duration: 90 },
        { name: 'Brain PET-CT Scan', modalityType: 'PET', price: 7500, duration: 60 },
        // Mammography & DEXA & Fluoroscopy
        { name: 'Bilateral 3D Mammogram', modalityType: 'Mammography', price: 1200, duration: 25 },
        { name: 'DEXA Bone Density Scan (Spine & Hip)', modalityType: 'DEXA', price: 850, duration: 20 },
        { name: 'Barium Swallow Fluoroscopy', modalityType: 'Fluoroscopy', price: 1500, duration: 30 },
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

async function seedPatients(count = 500) {
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

        if ((i + 1) % 100 === 0) {
            console.log(`   ✓ Created ${i + 1}/${count} patients`);
        }
    }
    console.log(`   ✅ Completed ${count} patients`);
    return patientIds;
}

async function seedAppointmentsAndExams(patientIds, modalityIds, examTypes, userIds, doctorIds, policyMap, providerIds) {
    console.log('\n📅 Seeding Appointments, Examinations, Invoices, Payments & Insurance Claims...');

    const radiologists = userIds.filter(u => u.role === 'Radiologist');
    const technicians = userIds.filter(u => u.role === 'Technician');
    const nurses = userIds.filter(u => u.role === 'Nurse');
    const receptionists = userIds.filter(u => u.role === 'Receptionist');
    const admin = userIds.find(u => u.role === 'Admin') || userIds[0];

    const appointmentCount = 2500;
    const now = new Date();
    const startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); // 365 days ago

    let appointmentsCreated = 0;
    let examsCreated = 0;
    let claimsCreated = 0;

    for (let i = 0; i < appointmentCount; i++) {
        const examType = randomElement(examTypes);
        const modality = modalityIds.find(m => m.id === examType.modalityId) || randomElement(modalityIds);
        const patient = randomElement(patientIds);
        const radiologist = randomElement(radiologists);
        const technician = randomElement(technicians);
        const nurse = randomElement(nurses);
        const createdBy = randomElement(receptionists);
        const referringDoctor = randomElement(doctorIds);

        const appointmentDate = randomDate(startDate, now);
        const startTime = new Date(appointmentDate);
        startTime.setHours(randomInt(8, 17), randomInt(0, 3) * 15, 0);
        const endTime = new Date(startTime.getTime() + examType.duration * 60000);

        const isInPast = startTime < now;
        const appointmentStatus = isInPast ? randomElement(['Confirmed', 'Confirmed', 'Confirmed', 'Cancelled']) : 'Confirmed';
        const isInsurance = policyMap.has(patient) && Math.random() > 0.4;
        const paymentMethod = isInsurance ? 'Insurance' : randomElement(['Cash', 'Card']);

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
                    appointmentStatus, createdBy.id, technician.id, nurse.id, radiologist.id,
                    referringDoctor.id, paymentMethod, examType.price
                ]
            );
            appointmentsCreated++;

            if (appointmentStatus === 'Confirmed' && isInPast) {
                const examStatuses = ['Scheduled', 'Checked-in', 'Scanning', 'Reporting', 'Finalized'];
                const examStatus = randomElement(examStatuses);
                const finalizedAt = examStatus === 'Finalized'
                    ? new Date(endTime.getTime() + randomInt(1, 48) * 60 * 60 * 1000)
                    : null;

                const examResult = await pool.query(
                    `INSERT INTO examinations (
                        appointment_id, patient_id, modality_id, exam_type_id,
                        performing_radiologist_id, status, report_finalized_at,
                        created_at
                    ) VALUES ($1, $2, $3, $4, $5, $6::exam_status, $7, $8)
                    RETURNING exam_id`,
                    [
                        apptResult.rows[0].appointment_id, patient, modality.id, examType.id,
                        radiologist.id, examStatus, finalizedAt, startTime
                    ]
                );
                examsCreated++;

                if (examStatus === 'Finalized') {
                    const totalAmt = Number(examType.price);
                    const insuranceCovered = isInsurance ? Math.round(totalAmt * 0.8) : 0;
                    const patientPayable = totalAmt - insuranceCovered;

                    const invoiceResult = await pool.query(
                        `INSERT INTO invoices (
                            exam_id, patient_id, total_amount, insurance_covered_amount,
                            patient_payable_amount, status
                        ) VALUES ($1, $2, $3, $4, $5, 'Paid'::payment_status) RETURNING invoice_id`,
                        [examResult.rows[0].exam_id, patient, totalAmt, insuranceCovered, patientPayable]
                    );

                    await pool.query(
                        `INSERT INTO payments (
                            invoice_id, amount, method, processed_by, transaction_date
                        ) VALUES ($1, $2, $3, $4, $5)`,
                        [
                            invoiceResult.rows[0].invoice_id, patientPayable > 0 ? patientPayable : totalAmt,
                            paymentMethod, createdBy.id, finalizedAt
                        ]
                    );

                    // Create Insurance Claim if insurance covered
                    if (isInsurance && insuranceCovered > 0) {
                        const policyInfo = policyMap.get(patient);
                        const claimStatus = randomElement(['Submitted', 'Approved', 'Paid', 'Paid', 'Partially Paid']);
                        const receivedAmt = ['Paid', 'Partially Paid'].includes(claimStatus) ? Math.round(insuranceCovered * (claimStatus === 'Paid' ? 1 : 0.7)) : 0;

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
                        claimsCreated++;
                    }
                }
            }

            if ((i + 1) % 500 === 0) {
                console.log(`   ✓ Created ${i + 1}/${appointmentCount} appointments, ${examsCreated} examinations, ${claimsCreated} claims`);
            }
        } catch (err) {
            // Skip exclusion conflicts
        }
    }

    console.log(`   ✅ Completed ${appointmentsCreated} appointments, ${examsCreated} examinations, ${claimsCreated} insurance claims`);
}

async function seedInventory() {
    console.log('\n📦 Seeding Inventory Supplies...');

    const items = [
        { name: 'MRI Contrast (Gadolinium 15ml)', category: 'Contrast Agent', qty: 250, unit: 'vials', reorder: 50, price: 140 },
        { name: 'CT Contrast (Iohexol 350mg 100ml)', category: 'Contrast Agent', qty: 300, unit: 'bottles', reorder: 80, price: 95 },
        { name: 'Barium Sulfate Suspension 450ml', category: 'Contrast Agent', qty: 120, unit: 'bottles', reorder: 30, price: 45 },
        { name: 'Syringes Automatic Injector 200ml', category: 'Medical Supply', qty: 500, unit: 'pieces', reorder: 100, price: 18 },
        { name: 'Syringes 10ml Luer Lock', category: 'Medical Supply', qty: 2000, unit: 'pieces', reorder: 500, price: 2.5 },
        { name: 'Butterfly Needles 21G', category: 'Medical Supply', qty: 1500, unit: 'pieces', reorder: 400, price: 3.0 },
        { name: 'IV Cannula 20G', category: 'Medical Supply', qty: 1200, unit: 'pieces', reorder: 300, price: 4.5 },
        { name: 'Disposable Nitrile Gloves (L)', category: 'PPE', qty: 10000, unit: 'pairs', reorder: 2000, price: 0.6 },
        { name: 'Disposable Nitrile Gloves (M)', category: 'PPE', qty: 12000, unit: 'pairs', reorder: 2000, price: 0.6 },
        { name: 'N95 Respirator Masks', category: 'PPE', qty: 4000, unit: 'pieces', reorder: 1000, price: 2.5 },
        { name: 'Sterile Surgical Gowns', category: 'PPE', qty: 800, unit: 'pieces', reorder: 200, price: 15 },
        { name: 'X-Ray Film 35x43cm', category: 'Imaging Supply', qty: 800, unit: 'sheets', reorder: 200, price: 18 },
        { name: 'Thermal Printing Paper (US)', category: 'Imaging Supply', qty: 250, unit: 'rolls', reorder: 50, price: 35 },
        { name: 'Ultrasound Acoustic Gel 5L', category: 'Imaging Supply', qty: 120, unit: 'containers', reorder: 30, price: 45 },
        { name: 'Disinfectant Surface Wipes', category: 'Cleaning', qty: 300, unit: 'tubs', reorder: 80, price: 16 },
        { name: 'Saline Solution 0.9% 500ml', category: 'Medical Supply', qty: 800, unit: 'bags', reorder: 200, price: 8 },
        { name: 'Lead Apron 0.5mm Pb', category: 'PPE', qty: 25, unit: 'pieces', reorder: 5, price: 350 },
        { name: 'ECG Electrode Pads', category: 'Medical Supply', qty: 5000, unit: 'pads', reorder: 1000, price: 0.3 },
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

    const departments = { 'Radiologist': 'Radiology', 'Technician': 'Imaging', 'Nurse': 'Patient Care' };
    const specializations = {
        'Radiologist': ['Neuroradiology', 'Musculoskeletal', 'Abdominal', 'Interventional', 'Cardiothoracic'],
        'Technician': ['MRI Specialist', 'CT Specialist', 'X-Ray Technician', 'US Specialist', 'PET-CT Specialist'],
        'Nurse': ['Radiology Nurse', 'Patient Care', 'Contrast Management', 'Recovery Nurse']
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
                randomInt(8000, 25000)
            ]
        );
    }
    console.log(`   ✓ Created staff records`);
}

async function main() {
    console.log('🚀 Starting Comprehensive VIARA Database Seeding...\n');

    try {
        await clearDatabase();

        const userIds = await seedUsers();
        const doctorIds = await seedReferringDoctors(userIds);
        const modalityIds = await seedModalities();
        const examTypes = await seedExaminationTypes(modalityIds);
        const patientIds = await seedPatients(500);
        const { providerIds, policyMap } = await seedInsuranceProvidersAndPolicies(patientIds);
        await seedAppointmentsAndExams(patientIds, modalityIds, examTypes, userIds, doctorIds, policyMap, providerIds);
        await seedInventory();
        await seedStaff(userIds);

        console.log('\n✅ Comprehensive Database Seeding Completed Successfully!');

    } catch (error) {
        console.error('\n❌ Seeding failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
