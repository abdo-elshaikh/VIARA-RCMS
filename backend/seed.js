const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// Encryption utilities (matching backend utils)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-32-character-encryption-key-here-change-this';
const ALGORITHM = 'aes-256-cbc';

function encrypt(text) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

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

async function clearDatabase() {
    console.log('🗑️  Clearing existing data...');
    const tables = [
        'system_logs', 'payments', 'invoices', 'examinations', 'appointments',
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
    const password = await bcrypt.hash('password123', 10);

    const users = [
        { name: 'Dr. Administrator', email: 'admin@rcms.com', role: 'Admin' },
        { name: 'John Accountant', email: 'accountant@rcms.com', role: 'Accountant' },
        { name: 'Sarah Receptionist', email: 'reception@rcms.com', role: 'Receptionist' },
        { name: 'HR Manager', email: 'hr@rcms.com', role: 'HR' },
        { name: 'Dr. Ahmed Hassan', email: 'ahmed.hassan@rcms.com', role: 'Radiologist' },
        { name: 'Dr. Mona Ibrahim', email: 'mona.ibrahim@rcms.com', role: 'Radiologist' },
        { name: 'Dr. Omar Khalil', email: 'omar.khalil@rcms.com', role: 'Radiologist' },
        { name: 'Dr. Fatma Saad', email: 'fatma.saad@rcms.com', role: 'Radiologist' },
        { name: 'Tech. Mohamed Ali', email: 'mohamed.tech@rcms.com', role: 'Technician' },
        { name: 'Tech. Sara Mahmoud', email: 'sara.tech@rcms.com', role: 'Technician' },
        { name: 'Nurse Heba Fouad', email: 'heba.nurse@rcms.com', role: 'Nurse' },
        { name: 'Nurse Dina Kamal', email: 'dina.nurse@rcms.com', role: 'Nurse' },
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
        { name: 'MRI-01 Siemens Skyra', type: 'MRI', room: 'Room 101', status: 'Active' },
        { name: 'MRI-02 GE Signa', type: 'MRI', room: 'Room 102', status: 'Active' },
        { name: 'CT-01 Philips iCT', type: 'CT', room: 'Room 201', status: 'Active' },
        { name: 'CT-02 GE Revolution', type: 'CT', room: 'Room 202', status: 'Active' },
        { name: 'X-Ray-01 Main', type: 'X-Ray', room: 'Room 301', status: 'Active' },
        { name: 'X-Ray-02 Portable', type: 'X-Ray', room: 'Room 302', status: 'Active' },
        { name: 'US-01 GE Voluson', type: 'Ultrasound', room: 'Room 401', status: 'Active' },
        { name: 'US-02 Philips EPIQ', type: 'Ultrasound', room: 'Room 402', status: 'Active' },
        { name: 'PET-CT-01 Siemens', type: 'PET', room: 'Room 501', status: 'Active' },
        { name: 'Mammo-01 Hologic', type: 'Mammography', room: 'Room 601', status: 'Active' },
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
    console.log('\n🔬 Seeding Examination Types...');

    // Create examination_types table if it doesn't exist
    await pool.query(`
        CREATE TABLE IF NOT EXISTS examination_types (
            type_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(100) NOT NULL,
            modality_id UUID REFERENCES modalities(modality_id),
            base_price DECIMAL(10, 2),
            duration_minutes INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const examTypes = [
        // MRI
        { name: 'Brain MRI', modalityType: 'MRI', price: 3500, duration: 45 },
        { name: 'Spine MRI', modalityType: 'MRI', price: 3200, duration: 40 },
        { name: 'Knee MRI', modalityType: 'MRI', price: 2800, duration: 35 },
        { name: 'Abdomen MRI', modalityType: 'MRI', price: 4000, duration: 50 },
        // CT
        { name: 'Brain CT', modalityType: 'CT', price: 1500, duration: 20 },
        { name: 'Chest CT', modalityType: 'CT', price: 1800, duration: 25 },
        { name: 'Abdomen CT', modalityType: 'CT', price: 2000, duration: 30 },
        { name: 'CT Angiography', modalityType: 'CT', price: 2500, duration: 35 },
        // X-Ray
        { name: 'Chest X-Ray', modalityType: 'X-Ray', price: 300, duration: 10 },
        { name: 'Spine X-Ray', modalityType: 'X-Ray', price: 400, duration: 15 },
        { name: 'Extremity X-Ray', modalityType: 'X-Ray', price: 350, duration: 10 },
        // Ultrasound
        { name: 'Abdominal Ultrasound', modalityType: 'Ultrasound', price: 600, duration: 30 },
        { name: 'Pelvic Ultrasound', modalityType: 'Ultrasound', price: 650, duration: 25 },
        { name: 'Cardiac Echo', modalityType: 'Ultrasound', price: 800, duration: 40 },
        // PET
        { name: 'Whole Body PET-CT', modalityType: 'PET', price: 8000, duration: 90 },
        // Mammography
        { name: 'Screening Mammogram', modalityType: 'Mammography', price: 700, duration: 20 },
    ];

    const typeIds = [];
    for (const exam of examTypes) {
        const modality = modalityIds.find(m => m.type === exam.modalityType);
        if (modality) {
            const result = await pool.query(
                `INSERT INTO examination_types (name, modality_id, base_price, duration_minutes) 
                 VALUES ($1, $2, $3, $4) RETURNING type_id`,
                [exam.name, modality.id, exam.price, exam.duration]
            );
            typeIds.push({ ...exam, id: result.rows[0].type_id, modalityId: modality.id });
        }
    }
    console.log(`   ✓ Created ${typeIds.length} examination types`);
    return typeIds;
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

async function seedAppointmentsAndExams(patientIds, modalityIds, examTypes, userIds) {
    console.log('\n📅 Seeding Appointments and Examinations...');

    const radiologists = userIds.filter(u => u.role === 'Radiologist');
    const technicians = userIds.filter(u => u.role === 'Technician');
    const nurses = userIds.filter(u => u.role === 'Nurse');
    const receptionists = userIds.filter(u => u.role === 'Receptionist');

    // Generate appointments for the last 90 days
    const appointmentCount = 600;
    const now = new Date();
    const startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days ago

    let appointmentsCreated = 0;
    let examsCreated = 0;

    for (let i = 0; i < appointmentCount; i++) {
        const examType = randomElement(examTypes);
        const modality = modalityIds.find(m => m.id === examType.modalityId);
        const patient = randomElement(patientIds);
        const radiologist = randomElement(radiologists);
        const technician = randomElement(technicians);
        const nurse = randomElement(nurses);
        const createdBy = randomElement(receptionists);

        // Random appointment time in the past 90 days
        const appointmentDate = randomDate(startDate, now);
        const startTime = new Date(appointmentDate);
        startTime.setHours(randomInt(8, 17), randomInt(0, 3) * 15, 0); // 8am-5pm, 15-min intervals
        const endTime = new Date(startTime.getTime() + examType.duration * 60000);

        // Determine status based on time
        const isInPast = startTime < now;
        const appointmentStatus = isInPast ? randomElement(['Confirmed', 'Confirmed', 'Confirmed', 'Cancelled']) : 'Confirmed';

        try {
            // Insert appointment - using only core columns from schema
            const apptResult = await pool.query(
                `INSERT INTO appointments (
                    patient_id, modality_id, start_time, end_time,
                    status, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING appointment_id`,
                [
                    patient, modality.id, startTime, endTime,
                    appointmentStatus, createdBy.id
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

                await pool.query(
                    `INSERT INTO examinations (
                        appointment_id, patient_id, modality_id,
                        performing_radiologist_id, status, report_finalized_at
                    ) VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        apptResult.rows[0].appointment_id, patient, modality.id,
                        radiologist.id, examStatus, finalizedAt
                    ]
                );
                examsCreated++;

                // Create invoice and payment for finalized exams
                if (examStatus === 'Finalized') {
                    const invoiceResult = await pool.query(
                        `INSERT INTO invoices (
                            exam_id, patient_id, total_amount, insurance_covered_amount,
                            patient_payable_amount, status
                        ) VALUES (
                            (SELECT exam_id FROM examinations WHERE appointment_id = $1),
                            $2, $3, $4, $5, 'Paid'
                        ) RETURNING invoice_id`,
                        [apptResult.rows[0].appointment_id, patient, examType.price, 0, examType.price]
                    );

                    await pool.query(
                        `INSERT INTO payments (
                            invoice_id, amount, method, processed_by, transaction_date
                        ) VALUES ($1, $2, $3, $4, $5)`,
                        [
                            invoiceResult.rows[0].invoice_id, examType.price,
                            randomElement(['Cash', 'Card', 'Insurance']),
                            createdBy.id, finalizedAt
                        ]
                    );
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
        const patientIds = await seedPatients(150);
        await seedAppointmentsAndExams(patientIds, modalityIds, examTypes, userIds);
        await seedInventory();
        await seedStaff(userIds);

        console.log('\n✅ Database seeding completed successfully!');
        console.log('\n📊 Summary:');
        console.log(`   • ${userIds.length} users`);
        console.log(`   • ${patientIds.length} patients`);
        console.log(`   • ${modalityIds.length} modalities`);
        console.log(`   • ${examTypes.length} examination types`);
        console.log(`   • ~600 appointments and examinations`);
        console.log(`   • Invoices and payments for finalized exams`);
        console.log('\n🔑 Login credentials:');
        console.log('   Admin: admin@rcms.com / password123');
        console.log('   Receptionist: reception@rcms.com / password123');
        console.log('   Radiologist: ahmed.hassan@rcms.com / password123');

    } catch (error) {
        console.error('\n❌ Seeding failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
