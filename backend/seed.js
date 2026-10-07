const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const path = require('path');

// Load environment variables from backend/.env and root .env
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const seedPassword = process.env.TEST_USER_PASSWORD;
if (!seedPassword) {
    console.error('[seed] TEST_USER_PASSWORD is required. Refusing to fall back to a committed default password.');
    process.exit(1);
}

// Central encryption utility for AES-GCM (v2) PII encryption
const { encrypt } = require('./src/utils/crypto');

// Database connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('[seed] DATABASE_URL is required. Refusing to fall back to a committed default credential.');
    process.exit(1);
}
const pool = new Pool({ connectionString });

// Egyptian names database
const firstNames = {
    male: ['Ahmed', 'Mohamed', 'Mahmoud', 'Ali', 'Omar', 'Youssef', 'Hassan', 'Khaled', 'Amr', 'Tamer', 'Sherif', 'Karim', 'Hany', 'Essam', 'Rami', 'Tariq', 'Ziad', 'Mostafa'],
    female: ['Fatma', 'Mona', 'Heba', 'Nour', 'Sara', 'Mai', 'Dina', 'Rana', 'Mariam', 'Yasmin', 'Aya', 'Salma', 'Noha', 'Laila', 'Hania', 'Farida', 'Reem', 'Nadine']
};
const lastNames = ['Ibrahim', 'Hassan', 'Ali', 'Mohamed', 'Mahmoud', 'Khalil', 'Shafik', 'Farouk', 'Naguib', 'Saad', 'Mansour', 'Fouad', 'Amin', 'Kamal', 'Zaki', 'El-Sayed', 'Ghanem', 'Badawi'];

// Utility functions
const randomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
const randomPhone = () => `01${randomElement(['0', '1', '2', '5'])}${String(randomInt(10000000, 99999999))}`;
const randomNationalId = () => `2${String(randomInt(70, 99))}${String(randomInt(1, 12)).padStart(2, '0')}${String(randomInt(1, 28)).padStart(2, '0')}010${String(randomInt(1000, 9999))}`;
const randomAddress = () => {
    const streets = ['El-Tahrir St', 'Ramses St', 'Salah Salem St', 'El-Haram St', 'Kornish El-Nile', 'Abbas El-Akkad St', 'Makram Ebeid St', 'Gezirat El-Arab St'];
    const districts = ['Nasr City', 'Heliopolis', 'Maadi', 'Dokki', 'Zamalek', 'New Cairo', '6th October', 'Mohandessin', 'Shubra'];
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
        'No acute intracranial hemorrhage or territorial infarction is identified. Normal ventricles and sulci.',
        'Mild degenerative disc disease at L4-L5 and L5-S1 with shallow posterior disc bulge, no severe canal stenosis.',
        'Intact anterior and posterior cruciate ligaments. Mild joint effusion with grade II medial meniscal signal.',
        'Normal hepatic parenchymal signal intensity without focal focal lesion. Unremarkable gallbladder and spleen.',
    ],
    CT: [
        'Clear lung fields bilaterally without focal consolidation, pleural effusion, or pneumothorax.',
        'Normal appearance of the brain parenchyma without acute hemorrhage, mass effect, or midline shift.',
        'Unremarkable visualised abdominal organs. No evidence of acute appendicitis or bowel obstruction.',
        'Patent coronary arteries without flow-limiting stenosis. Agatston calcium score is within low-risk range.',
    ],
    'X-Ray': [
        'Normal cardiothoracic ratio. Clear costophrenic angles. No active pulmonary infiltration.',
        'No acute osseous fracture or dislocation. Normal joint alignment and bone mineralization.',
        'Mild lumbar spondylotic changes with preserved intervertebral disc spaces.',
    ],
    Ultrasound: [
        'Normal liver size and homogeneous echotexture without focal mass. Normal portal vein flow.',
        'Both kidneys demonstrate preserved cortical thickness and normal corticomedullary differentiation.',
        'Normal pelvic ultrasound with unremarkable appearance of reproductive structures.',
        'Thyroid gland is normal in size and echogenicity without suspicious nodules (TI-RADS 1).',
    ],
    'PET-CT': [
        'Physiologic FDG distribution throughout the whole body. No abnormal hypermetabolic neoplastic focus.',
        'Complete metabolic response with resolution of previously documented hypermetabolic lymphadenopathy.',
    ],
    Mammography: [
        'Scattered fibroglandular densities (BI-RADS B). No suspicious microcalcifications or architectural distortion.',
        'Negative for malignancy. Routine annual screening recommended (BI-RADS 1).',
    ],
};

const reportImpressionsByModality = {
    MRI: [
        'Normal brain MRI examination.',
        'Mild lumbar spondylosis without nerve root compromise.',
        'Normal appearance of major knee ligamentous structures.',
    ],
    CT: [
        'No acute cardiopulmonary pathology.',
        'Unremarkable non-contrast CT study.',
        'No acute intra-abdominal abnormality.',
    ],
    'X-Ray': [
        'Unremarkable radiographic appearance.',
        'Stable radiographic examination.',
        'No acute bony lesion.',
    ],
    Ultrasound: [
        'Normal abdominal and pelvic ultrasound.',
        'Preserved organ morphometry with normal vascular flow.',
    ],
    'PET-CT': [
        'Negative PET-CT study for active hypermetabolic malignancy.',
        'Metabolic remission noted.',
    ],
    Mammography: [
        'BI-RADS Category 1: Negative mammogram.',
        'BI-RADS Category 2: Benign mammographic findings.',
    ],
};

const CLINICAL_PROCEDURE_TEMPLATES = {
    'Brain MRI with Contrast': {
        technique: 'Multiplanar, multisequence MRI of the brain before and after intravenous gadolinium contrast administration.',
        findings: 'No acute territorial infarction, intracranial hemorrhage, or abnormal extra-axial fluid collections. Gray-white matter differentiation is preserved. Ventricles, sulci, and basal cisterns are symmetric and normal for age. Post-contrast images demonstrate no abnormal parenchymal or leptomeningeal enhancement.',
        impression: 'Normal brain MRI examination. No acute intracranial or demyelinating pathology.'
    },
    'Lumbosacral Spine MRI': {
        technique: 'Sagittal T1, T2, and axial T2-weighted MRI of the lumbosacral spine.',
        findings: 'Normal lumbar vertebral alignment and height. Preserved marrow signal intensity. Mild degenerative disc dehydration at L4-L5 with shallow broad-based posterior disc bulge causing mild anterior thecal sac indentation without significant central canal or exit neural foraminal stenosis. Conus medullaris terminates normally at L1 level.',
        impression: 'Mild L4-L5 degenerative disc disease without high-grade neural compromise.'
    },
    'Cervical Spine MRI': {
        technique: 'Sagittal and axial T1 and T2-weighted MRI sequences of the cervical spine.',
        findings: 'Normal cervical lordosis and vertebral body heights. Minimal C5-C6 disc protrusion without severe cord indentation. The visualized cervical spinal cord shows normal caliber and signal characteristics. Craniocervical junction is intact.',
        impression: 'Unremarkable cervical spine MRI with minor C5-C6 degenerative spondylosis.'
    },
    'Shoulder Joint MRI': {
        technique: 'High-resolution multiplanar proton density and T2 fat-suppressed MRI of the shoulder joint.',
        findings: 'The supraspinatus, infraspinatus, subscapularis, and teres minor tendons are intact with normal signal and morphology. No full-thickness or high-grade partial rotator cuff tear. Glenoid labrum appears intact. Visualized acromioclavicular joint is unremarkable.',
        impression: 'Intact rotator cuff tendons. No evidence of glenoid labral tear or joint effusion.'
    },
    'Knee MRI (High Resolution)': {
        technique: 'Sagittal, coronal, and axial multiplanar MRI sequences of the knee joint.',
        findings: 'The anterior and posterior cruciate ligaments are intact with normal alignment and taut fibers. Medial and lateral collateral ligaments are preserved. Medial and lateral menisci demonstrate normal contour without tear. Articular cartilage is smooth and intact. No joint effusion or Baker cyst.',
        impression: 'Intact cruciate ligaments and menisci. Normal knee MRI examination.'
    },
    'Pelvic MRI (Multiparametric)': {
        technique: 'High-resolution axial, sagittal, and coronal multiparametric MRI of the pelvis with DWI/ADC and dynamic contrast enhancement.',
        findings: 'The urinary bladder is well-distended with thin, regular walls. Pelvic muscular structures and pelvic neurovascular bundles are intact. No suspicious pelvic lymphadenopathy or destructive osseous lesions. No pelvic free fluid.',
        impression: 'Normal multiparametric pelvic MRI study. No suspicious pelvic focal mass or lymphadenopathy.'
    },
    'MRCP (Biliary Tree MRI)': {
        technique: 'Thick and thin slab 3D MRCP with multiplanar T2-weighted abdominal MRI sequences.',
        findings: 'Normal caliber of the intrahepatic and extrahepatic biliary ducts. The common bile duct (CBD) measures 4.5 mm with smooth tapering and no intraluminal filling defects or choledocholithiasis. Gallbladder is well-distended with no calculi. Pancreatic duct is normal in caliber.',
        impression: 'Normal MRCP examination. Patent biliary and pancreatic ductal systems without obstructive lithiasis.'
    },
    'Brain CT (Plain)': {
        technique: 'Axial non-contrast CT sections of the brain from the skull base to the vertex.',
        findings: 'No acute intracranial hemorrhage, mass effect, or midline shift. Ventricular system, sulci, and cisterns are symmetric and within normal limits for age. Normal gray-white matter attenuation. Calvarium and skull base are intact with clear mastoid air cells.',
        impression: 'Unremarkable non-contrast brain CT scan. No acute intracranial pathology.'
    },
    'Chest CT High Resolution (HRCT)': {
        technique: 'Volumetric high-resolution non-contrast CT of the chest with thin-section reconstructions.',
        findings: 'Both lungs are fully expanded and clear with no focal consolidation, suspicious nodules, or ground-glass opacities. Tracheobronchial tree is patent with normal branching. No honeycombing, traction bronchiectasis, or interlobular septal thickening. Heart and mediastinal contours are within normal limits. No pleural effusion or pneumothorax.',
        impression: 'Normal high-resolution chest CT examination. No evidence of active interstitial lung disease or infection.'
    },
    'CT Abdomen & Pelvis with IV Contrast': {
        technique: 'Multidetector helical CT of the abdomen and pelvis obtained following oral and intravenous iodinated contrast administration.',
        findings: 'Liver, spleen, pancreas, and adrenal glands demonstrate normal size, contour, and homogeneous enhancement without focal lesions. Both kidneys show symmetric prompt nephrographic excretion with no calculi or hydronephrosis. Gastrointestinal tract is normal with no bowel wall thickening or appendiceal inflammation. No pelvic fluid or lymphadenopathy.',
        impression: 'Normal contrast-enhanced CT of the abdomen and pelvis. No acute intra-abdominal pathology.'
    },
    'CT Coronary Angiography': {
        technique: 'ECG-gated volumetric multislice CT coronary angiography with automated bolus tracking.',
        findings: 'Left main, LAD, LCx, and RCA demonstrate smooth luminal margins and normal anatomical course without calcified or non-calcified atheromatous plaques. No flow-limiting stenosis. Agatston calcium score is 0. Normal left ventricular myocardium and pericardial space.',
        impression: 'Normal coronary CT angiography (CAD-RADS 0). Excellent coronary patency.'
    },
    'CT Pulmonary Angiography (CTPA)': {
        technique: 'High-pitch helical CT pulmonary angiography with timed contrast injection.',
        findings: 'The pulmonary arterial trunk, main right and left pulmonary branches, and all lobar and segmental branches are well-opacified. No intraluminal filling defects identified to suggest acute pulmonary embolism. Normal RV/LV chamber ratio. Clear lung parenchyma.',
        impression: 'Negative CTPA examination for acute pulmonary thromboembolism.'
    },
    'Paranasal Sinuses CT (PNS)': {
        technique: 'Coronal and axial thin-slice bone algorithm CT of the facial bones and paranasal sinuses.',
        findings: 'Maxillary, ethmoid, frontal, and sphenoid sinuses are completely clear and well-aerated without mucosal thickening, polypoid lesions, or fluid levels. The osteomeatal units are widely patent bilaterally. Nasal septum is straight in the midline. Intact bony sinus margins.',
        impression: 'Clear and well-aerated paranasal sinuses. Bilaterally patent osteomeatal units.'
    },
    'Chest X-Ray PA View': {
        technique: 'Standard digital PA projection of the chest in deep inspiration.',
        findings: 'The cardiac silhouette and mediastinum are normal in size and configuration. The cardiothoracic ratio is < 0.5. Lung fields are clear bilaterally with no active consolidation, masses, or pleural effusions. Both hemidiaphragms are smooth with sharp costophrenic angles. Thoracic skeleton is intact.',
        impression: 'Normal PA chest radiograph. Clear lungs with no acute cardiopulmonary abnormality.'
    },
    'Lumbosacral Spine X-Ray (AP/Lat)': {
        technique: 'Digital anteroposterior and lateral radiographs of the lumbosacral spine.',
        findings: 'Normal lumbar lordosis. Lumbar vertebral body heights and alignment are preserved with no fracture or subluxation. Mild anterior spondylotic osteophytes at L4-L5 with preserved disc space height. Sacroiliac joints are unremarkable.',
        impression: 'Mild lumbar spondylosis without evidence of acute traumatic fracture or spondylolisthesis.'
    },
    'Knee X-Ray (AP/Lat/Weight-Bearing)': {
        technique: 'Weight-bearing anteroposterior, lateral, and skyline digital radiographs of the knee.',
        findings: 'Normal alignment of the tibiofemoral and patellofemoral articulations. Joint spaces are symmetric and well-preserved with no joint space narrowing or marginal osteophytes. No acute osseous fracture, dislocation, or lytic/sclerotic lesion. Visualized periarticular soft tissues are unremarkable.',
        impression: 'Normal radiographic study of the knee. No acute osseous injury or significant osteoarthritic changes.'
    },
    'Pelvis & Both Hips X-Ray': {
        technique: 'Standard AP digital radiograph of the pelvis and bilateral hips.',
        findings: 'Symmetric pelvic ring without fracture. Normal femoroacetabular alignment bilaterally. Both hip joint spaces are well preserved with smooth articular margins. Sacroiliac joints and pubic symphysis are intact.',
        impression: 'Normal pelvic and bilateral hip radiograph. Intact bony pelvis without acute injury.'
    },
    'Abdominal & Pelvic Ultrasound': {
        technique: 'Real-time B-mode and color Doppler ultrasonography of the abdomen and pelvis.',
        findings: 'Liver is of normal size and homogeneous echotexture with smooth margins. Gallbladder is normal in size and wall thickness without gallstones or acoustic shadowing. CBD is normal in caliber. Spleen, pancreas, and bilateral kidneys are unremarkable. Urinary bladder is well-distended with smooth walls.',
        impression: 'Normal abdominal and pelvic ultrasound examination.'
    },
    'Thyroid Ultrasound with Doppler': {
        technique: 'High-frequency linear probe ultrasound of the thyroid bed with color Doppler.',
        findings: 'Both thyroid lobes and the connecting isthmus show normal size and homogeneous ground-glass echotexture. Symmetrical parenchymal vascularity on color Doppler. No cystic, solid, or calcified thyroid nodules identified (ACR TI-RADS 1). No cervical lymphadenopathy.',
        impression: 'Normal thyroid ultrasound (TI-RADS 1). No focal thyroid nodules.'
    },
    'Venous Doppler Lower Extremities': {
        technique: 'Duplex and color Doppler ultrasound examination of the bilateral common femoral, femoral, popliteal, and calf deep veins.',
        findings: 'All deep venous segments demonstrate complete luminal compressibility, normal spontaneous flow, and respiratory phasicity. Augmentation is prompt. No acute intraluminal thrombus or reflux.',
        impression: 'Normal lower extremity venous duplex study. Negative for deep venous thrombosis (DVT).'
    },
    'Echocardiography (Transthoracic)': {
        technique: 'Comprehensive transthoracic 2D, M-mode, and Doppler echocardiogram.',
        findings: 'Left ventricular cavity size and wall thickness are within normal limits. Preserved global systolic function with an estimated left ventricular ejection fraction (LVEF) of 62%. Normal diastolic filling parameters. Cardiac valves are thin, pliable, and competent with no significant regurgitation. No pericardial effusion.',
        impression: 'Normal transthoracic echocardiogram. Preserved LV systolic and diastolic performance.'
    },
    'Obstetric 4D Anomaly Scan': {
        technique: 'Transabdominal 2D, 3D, and real-time 4D high-resolution obstetric ultrasound.',
        findings: 'Single live intrauterine fetus in cephalic presentation. Fetal biometric measurements (BPD, HC, AC, FL) are concordant with gestational age. Normal fetal intracranial anatomy, spine, four-chamber cardiac view, stomach bubble, kidneys, and extremities. Normal amniotic fluid volume and posterior grade I placenta.',
        impression: 'Normal detailed fetal anomaly scan. Fetal biometry and morphology appropriate for gestational age.'
    },
    'Whole Body PET-CT (FDG Oncology)': {
        technique: 'Whole-body 18F-FDG PET-CT acquired from the skull base to mid-thighs following 60 minutes of radiotracer uptake.',
        findings: 'Physiologic radiotracer distribution is noted throughout the brain, salivary glands, myocardium, liver, spleen, and urinary tract. No pathologically hypermetabolic cervical, mediastinal, axillary, retroperitoneal, or pelvic lymph nodes. No hypermetabolic visceral or osseous lesions.',
        impression: 'Negative whole-body PET-CT study for active hypermetabolic malignancy or metastases.'
    },
    'PET-CT Lymphoma Follow-Up': {
        technique: 'Whole-body 18F-FDG PET-CT scan for post-therapeutic lymphoma assessment.',
        findings: 'Complete metabolic response with resolution of previously noted hypermetabolic nodal disease. No new hypermetabolic foci identified. Normal liver and mediastinal blood pool background (Deauville Score 1).',
        impression: 'Complete metabolic remission (Deauville Score 1). No evidence of residual or recurrent lymphoma.'
    },
    'Screening 3D Mammography (Both Breasts)': {
        technique: 'Digital bilateral craniocaudal (CC) and mediolateral oblique (MLO) 3D tomosynthesis.',
        findings: 'Bilateral breasts demonstrate predominantly fibroglandular parenchyma (ACR Breast Composition B). No dominant suspicious masses, architectural distortion, or clustered pleomorphic microcalcifications. Benign scattered punctate calcifications noted bilaterally. Normal skin, nipple-areolar complexes, and axillary lymph nodes.',
        impression: 'BI-RADS Category 1: Negative mammogram. Routine annual screening recommended.'
    },
    'Diagnostic Mammogram + Breast Ultrasound': {
        technique: 'Targeted bilateral digital mammography complemented by high-resolution breast ultrasonography.',
        findings: 'Normal fibroglandular architecture bilaterally. Targeted ultrasound confirms absence of suspicious solid, cystic, or infiltrating lesions. Axillary lymph node stations are normal in morphology.',
        impression: 'BI-RADS Category 2: Benign findings. No evidence of malignancy.'
    },
    'DEXA Bone Densitometry (Spine & Hip)': {
        technique: 'Dual-energy X-ray absorptiometry (DEXA) of the lumbar spine (L1-L4) and left total hip.',
        findings: 'Lumbar spine (L1-L4) mean BMD is 1.120 g/cm² with a T-score of -0.4. Left total hip BMD is 0.985 g/cm² with a T-score of -0.5. Left femoral neck BMD is 0.890 g/cm² with a T-score of -0.6.',
        impression: 'Normal bone mineral density (T-score > -1.0) according to WHO diagnostic criteria.'
    },
};

const buildReportSections = (modalityType, examName) => {
    if (CLINICAL_PROCEDURE_TEMPLATES[examName]) {
        return CLINICAL_PROCEDURE_TEMPLATES[examName];
    }
    for (const [key, tpl] of Object.entries(CLINICAL_PROCEDURE_TEMPLATES)) {
        if (examName && (examName.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(examName.toLowerCase()))) {
            return tpl;
        }
    }
    return {
        findings: randomElement(reportFindingsByModality[modalityType] || ['No acute abnormality is identified.']),
        impression: randomElement(reportImpressionsByModality[modalityType] || ['Unremarkable examination.']),
        technique: `Standard high-resolution ${examName} protocol was acquired with multiplanar reformatted reconstructions.`,
    };
};

async function clearDatabase() {
    console.log('🗑️  Purging all existing demo data across tables...');
    const tables = [
        'system_logs', 'security_events', 'audit_alerts', 'emergency_access_logs',
        'report_ai_drafts', 'report_versions', 'result_deliveries', 'pacs_quarantine_studies',
        'pacs_instances', 'pacs_series', 'pacs_ai_analysis_jobs', 'pacs_audit',
        'insurance_claims', 'insurance_approvals', 'insurance_coverage_rules', 'patient_insurance_policies',
        'credit_notes', 'refunds', 'payments', 'cashier_closures', 'cashier_shifts',
        'invoice_items', 'invoices', 'partial_payment_exceptions', 'commission_payables',
        'examinations', 'appointment_reschedule_history', 'appointments', 'waiting_list',
        'patient_appointment_requests', 'patient_consents', 'patient_feedback', 'patient_portal_messages',
        'patient_portal_documents', 'patient_portal_audit', 'patient_profile_update_requests',
        'queue_events', 'reception_work_items',
        'equipment_downtime', 'equipment_maintenance', 'service_contracts',
        'display_announcements',
        'attendance_audit_ledger', 'attendance_permissions', 'attendance_logs',
        'staff_shift_requests', 'staff_evaluations', 'staff_shifts', 'leave_requests',
        'employee_deductions', 'employee_penalties', 'employee_compensation_profiles', 'employee_profiles',
        'stock_movements', 'purchase_order_items', 'purchase_orders', 'inventory_batches', 'inventory_items', 'inventory', 'suppliers',
        'marketing_campaign_recipients', 'marketing_campaigns', 'patient_segment_members', 'patient_segments', 'crm_activities',
        'doctor_portal_messages', 'doctor_portal_audit',
        'patients', 'contracts', 'insurance_providers', 'referring_doctors',
        'examination_types', 'modalities', 'rooms', 'staff', 'users'
    ];

    for (const table of tables) {
        try {
            await pool.query(`TRUNCATE TABLE ${table} CASCADE`);
        } catch (err) {
            // Table might not exist or already empty, skip gracefully
        }
    }
    console.log('   ✓ Database tables purged successfully.');
}

async function seedUsers() {
    console.log('\n👥 Seeding Users and Security Accounts...');
    const passwordHash = await bcrypt.hash(seedPassword, 12);

    const users = [
        { name: 'Dr. Administrator', email: 'admin@VIARA.com', role: 'Admin' },
        { name: 'Sara Receptionist', email: 'reception@VIARA.com', role: 'Receptionist' },
        { name: 'Mona Cashier', email: 'cashier@VIARA.com', role: 'Cashier' },
        { name: 'John Accountant', email: 'accountant@VIARA.com', role: 'Accountant' },
        { name: 'HR Manager', email: 'hr@VIARA.com', role: 'HR' },
        { name: 'Salma Insurance', email: 'insurance@VIARA.com', role: 'Insurance_Staff' },
        { name: 'Dr. Ahmed Hassan', email: 'ahmed.hassan@VIARA.com', role: 'Radiologist' },
        { name: 'Dr. Mona Ibrahim', email: 'mona.ibrahim@VIARA.com', role: 'Radiologist' },
        { name: 'Dr. Omar Khalil', email: 'omar.khalil@VIARA.com', role: 'Radiologist' },
        { name: 'Dr. Fatma Saad', email: 'fatma.saad@VIARA.com', role: 'Radiologist' },
        { name: 'Tech. Mohamed Ali', email: 'mohamed.tech@VIARA.com', role: 'Technician' },
        { name: 'Tech. Sara Mahmoud', email: 'sara.tech@VIARA.com', role: 'Technician' },
        { name: 'Nurse Heba Fouad', email: 'heba.nurse@VIARA.com', role: 'Nurse' },
        { name: 'Nurse Dina Kamal', email: 'dina.nurse@VIARA.com', role: 'Nurse' },
        { name: 'Dr. Hossam Referring', email: 'hossam.ref@VIARA.com', role: 'Referring_Doctor' },
        { name: 'Dev Lead', email: 'developer@VIARA.com', role: 'Developer' },
    ];

    const userMap = {};
    const userIds = [];
    for (const user of users) {
        const result = await pool.query(
            `INSERT INTO users (full_name, email, password_hash, role, is_active) 
             VALUES ($1, $2, $3, $4, TRUE) RETURNING user_id`,
            [user.name, user.email, passwordHash, user.role]
        );
        const userObj = { ...user, id: result.rows[0].user_id };
        userIds.push(userObj);
        userMap[user.email] = userObj;
        console.log(`   ✓ Created [${user.role}] ${user.name} (${user.email})`);
    }

    return { userIds, userMap };
}

async function seedEmployeeProfilesAndStaff(userIds) {
    console.log('\n👔 Seeding Employee Profiles, Compensation & Staff...');
    const defaultBranchId = '00000000-0000-4000-8000-000000000001';

    // Ensure default branch exists
    await pool.query(`
        INSERT INTO financial_branches (branch_id, name, code, is_active)
        VALUES ('00000000-0000-4000-8000-000000000001', 'Main Imaging Center - Nasr City', 'HQ-MAIN', TRUE)
        ON CONFLICT (branch_id) DO NOTHING;
    `);

    const roleConfigs = {
        Admin: { dept: 'Management', title: 'Managing Medical Director', salary: 35000 },
        Receptionist: { dept: 'Front Desk', title: 'Senior Reception Specialist', salary: 9000 },
        Cashier: { dept: 'Finance', title: 'Head Cashier', salary: 8500 },
        Accountant: { dept: 'Finance', title: 'Senior Financial Accountant', salary: 14000 },
        HR: { dept: 'Human Resources', title: 'HR Manager & Compliance Lead', salary: 16000 },
        Insurance_Staff: { dept: 'Insurance', title: 'Insurance Approvals Officer', salary: 10500 },
        Radiologist: { dept: 'Radiology', title: 'Consultant Radiologist', salary: 42000 },
        Technician: { dept: 'Clinical Imaging', title: 'Senior Imaging Technologist', salary: 12500 },
        Nurse: { dept: 'Patient Care', title: 'Radiology Staff Nurse', salary: 9500 },
        Developer: { dept: 'IT & PACS', title: 'Lead Systems Architect', salary: 28000 },
    };

    const clinicalSpecializations = {
        'ahmed.hassan@VIARA.com': 'Neuroradiology & Head/Neck Imaging',
        'mona.ibrahim@VIARA.com': 'Abdominal & Gastrointestinal Imaging',
        'omar.khalil@VIARA.com': 'Musculoskeletal & Sports Injury Imaging',
        'fatma.saad@VIARA.com': 'Women Health & Breast Imaging',
        'mohamed.tech@VIARA.com': 'Advanced MRI & CT Modalities',
        'sara.tech@VIARA.com': 'Digital Radiography & Ultrasonography',
        'heba.nurse@VIARA.com': 'Contrast Media Administration & Pre-scan Preparation',
        'dina.nurse@VIARA.com': 'Post-procedure Care & Sedation Recovery',
    };

    for (const [idx, user] of userIds.entries()) {
        if (user.role === 'Referring_Doctor') continue;

        const config = roleConfigs[user.role] || { dept: 'General', title: user.role, salary: 10000 };
        const empCode = `EMP-${String(idx + 1).padStart(4, '0')}`;

        await pool.query(`
            INSERT INTO employee_profiles (
                user_id, employee_id, department, job_title, hire_date, employment_status, payroll_branch_id
            ) VALUES ($1, $2, $3, $4, '2023-01-01', 'Full-Time', $5)
            ON CONFLICT (user_id) DO NOTHING;
        `, [user.id, empCode, config.dept, config.title, defaultBranchId]);

        await pool.query(`
            INSERT INTO employee_compensation_profiles (
                user_id, branch_id, salary_type, base_salary, currency_code, effective_from
            ) VALUES ($1, $2, 'Monthly', $3, 'EGP', '2023-01-01')
            ON CONFLICT DO NOTHING;
        `, [user.id, defaultBranchId, config.salary]);

        if (['Radiologist', 'Technician', 'Nurse'].includes(user.role)) {
            await pool.query(`
                INSERT INTO staff_credentials (
                    user_id, credential_type, credential_number, issuing_authority, issued_date, expires_at, notes
                ) VALUES ($1, $2, $3, $4, '2023-01-01', '2027-12-31', $5)
                ON CONFLICT DO NOTHING;
            `, [
                user.id,
                'ترخيص مزاولة المهنة الطبية (MOH Medical Practice License)',
                `EGY-MOH-${randomInt(100000, 999999)}`,
                'وزارة الصحة والسكان المصرية (Egyptian MOH)',
                clinicalSpecializations[user.email] || `${user.role} Practice`
            ]);
        }
    }
    console.log('   ✓ Employee profiles, compensation and staff credentials seeded.');
}

async function seedRooms() {
    console.log('\n🏥 Seeding Clinical Rooms and Specialized Suites...');
    const roomDefs = [
        // Imaging Wing A: MRI Suites
        { name: 'جناح فحص الرنين المغناطيسي 3 تسلا (Skyra)', number: 'Room 101', type: 'Imaging', floor: 'الطابق الأرضي', notes: 'مجهز بنظام المجال المغناطيسي العالي 3T وغرفة ملابس خاصة' },
        { name: 'جناح فحص الرنين المغناطيسي 1.5 تسلا (Signa)', number: 'Room 102', type: 'Imaging', floor: 'الطابق الأرضي', notes: 'مخصص للفحوصات العامة وفحوصات المفاصل' },
        { name: 'جناح فحص الرنين المغناطيسي الهادئ (Canon)', number: 'Room 103', type: 'Imaging', floor: 'الطابق الأرضي', notes: 'مجهز بتقنية تقليل الضوضاء للأطفال ومرضى رهاب الأماكن المغلقة' },

        // Imaging Wing B: CT Suites
        { name: 'جناح الأشعة المقطعية 256 مقطع (Philips iCT)', number: 'Room 201', type: 'Imaging', floor: 'الطابق الأرضي', notes: 'مخصص لفحوصات شرايين القلب والمخ والأوعية الدقيقة' },
        { name: 'جناح الأشعة المقطعية متعددة المقاطع (GE Revolution)', number: 'Room 202', type: 'Imaging', floor: 'الطابق الأرضي', notes: 'مخصص لفحوصات الصدر والبطن والحوض' },
        { name: 'جناح الأشعة المقطعية السريعة للطوارئ (SOMATOM)', number: 'Room 203', type: 'Imaging', floor: 'الطابق الأرضي', notes: 'مجهز لاستقبال حالات الطوارئ والتروما والحوادث' },

        // Radiography Hall: X-Ray
        { name: 'قاعة الأشعة الرقمية الرئيسية (Carestream)', number: 'Room 301', type: 'Imaging', floor: 'الطابق الأرضي', notes: 'فحوصات الصدر والعظام والأطراف بأشعة منخفضة الجرعة' },
        { name: 'قاعة الأشعة الرقمية المتنقلة (Shimadzu)', number: 'Room 302', type: 'Imaging', floor: 'الطابق الأرضي', notes: 'مخصصة للفحوصات السريعة وحالات الرعاية' },
        { name: 'قاعة تصوير العمود الفقري والمفاصل (Fujifilm)', number: 'Room 303', type: 'Imaging', floor: 'الطابق الأرضي', notes: 'تصوير بانورامي للعمود الفقري وميلان الحوض' },

        // Ultrasound Suite: US & Echo
        { name: 'عيادة السونار والدوبلر رباعي الأبعاد (GE Voluson)', number: 'Room 401', type: 'Imaging', floor: 'الطابق الأول', notes: 'سونار تفصيلي وصحة الجنين وصحة المرأة' },
        { name: 'عيادة السونار العام ودوبلر الشرايين (Philips EPIQ)', number: 'Room 402', type: 'Imaging', floor: 'الطابق الأول', notes: 'فحص البطن والحوض ودوبلر الأطراف وشرايين الرقبة' },
        { name: 'عيادة السونار المحمول والتدخلات الدقيقة (Lumify)', number: 'Room 403', type: 'Imaging', floor: 'الطابق الأول', notes: 'سونار عالي الدقة لأخذ العينات والتدخلات السريعة' },

        // Nuclear Medicine: PET-CT
        { name: 'جناح المسح الذري المقطعي للأورام (PET-CT Siemens)', number: 'Room 501', type: 'Imaging', floor: 'الطابق الأرضي', notes: 'مجهز بغرف انتظار خاصة بعد حقن النظائر المشعة' },
        { name: 'جناح الطب النووي المتقدم (PET-CT GE)', number: 'Room 502', type: 'Imaging', floor: 'الطابق الأرضي', notes: 'مخصص لمتابعة العلاج الكيماوي والاستجابة الورمية' },

        // Breast Imaging Center
        { name: 'عيادة الماموجرام ثلاثي الأبعاد (Hologic 3D)', number: 'Room 601', type: 'Imaging', floor: 'الطابق الأول', notes: 'فحص التوموسينثيسيز عالي الدقة للكشف المبكر' },
        { name: 'عيادة الماموجرام الرقمي مع فحص السونار المكمل', number: 'Room 602', type: 'Imaging', floor: 'الطابق الأول', notes: 'أخذ عينات موجهة وسونار الثدي المتقدم' },

        // Specialized Suites
        { name: 'معمل قسطرة القلب والأشعة التداخلية (Azurion 7)', number: 'Room 701', type: 'Imaging', floor: 'الطابق الأرضي', notes: 'قسطرة تشخيصية وعلاجية للأوعية الدموية' },
        { name: 'غرفة فحوصات الفلوروسكوبي المباشر (Luminos Agile)', number: 'Room 801', type: 'Imaging', floor: 'الطابق الأرضي', notes: 'فحوصات الباريوم وحركة الجهاز الهضمي والمسالك' },
        { name: 'وحدة قياس هشاشة العظام المزدوج (Hologic DEXA)', number: 'Room 901', type: 'Imaging', floor: 'الطابق الأول', notes: 'قياس دقيق لكثافة عظام الفقرات والحوض' },
        { name: 'وحدة تصوير الأسنان والوجه والفكين (Dental Panoramic)', number: 'Room 1001', type: 'Imaging', floor: 'الطابق الأول', notes: 'أشعة بانورامية ومقطعية مخروطية ثلاثية الأبعاد CBCT' },

        // Clinical Support & Care Rooms
        { name: 'غرفة تحضير المرضى وتركيب الكانيولا (Preparation Suite)', number: 'PREP-01', type: 'Preparation', floor: 'الطابق الأرضي', notes: 'غرفة تمريض لتحضير المرضى وحقن الصبغة واختبارات الحساسية والوظائف الحيوية' },
        { name: 'غرفة الإفاقة والملاحظة بعد الصبغة (Post-Exam Recovery)', number: 'RECOV-01', type: 'Recovery', floor: 'الطابق الأرضي', notes: 'مجهزة بأسرّة طبية وأكسجين لملاحظة المرضى بعد الصبغة والتخدير' },
        { name: 'غرفة قراءة وكتابة التقارير التشخيصية (Reading Room)', number: 'READ-01', type: 'Reading', floor: 'الطابق الأول', notes: 'محطات عمل تشخيصية عالية الدقة 4K لأطباء الأشعة' },
    ];

    const roomMap = {};
    for (const r of roomDefs) {
        const res = await pool.query(`
            INSERT INTO rooms (name, room_number, type, floor, status, notes)
            VALUES ($1, $2, $3, $4, 'Active', $5)
            RETURNING room_id, room_number;
        `, [r.name, r.number, r.type, r.floor, r.notes]);

        roomMap[r.number] = res.rows[0].room_id;
    }
    console.log(`   ✓ Seeded ${roomDefs.length} clinical rooms and diagnostic suites.`);
    return roomMap;
}

async function seedModalities(roomMap) {
    console.log('\n🔬 Seeding Imaging Modalities (Machines) linked to Rooms...');
    const modalities = [
        { name: 'MRI-01 Siemens Skyra 3T', type: 'MRI', room: 'Room 101', status: 'Active', serial: 'MRI-SKY-001', manufacturer: 'Siemens Healthineers', model: 'MAGNETOM Skyra 3T', installDate: '2022-01-15', location: 'Imaging Wing A', aet: 'VIARA_MRI_01', ip: '192.168.10.11', port: 11112 },
        { name: 'MRI-02 GE Signa 1.5T', type: 'MRI', room: 'Room 102', status: 'Active', serial: 'MRI-GE-002', manufacturer: 'GE HealthCare', model: 'SIGNA Architect', installDate: '2022-06-20', location: 'Imaging Wing A', aet: 'VIARA_MRI_02', ip: '192.168.10.12', port: 11113 },
        { name: 'MRI-03 Canon Vantage Oria', type: 'MRI', room: 'Room 103', status: 'Active', serial: 'MRI-CA-003', manufacturer: 'Canon Medical', model: 'Vantage Oria 1.5T', installDate: '2023-02-10', location: 'Imaging Wing A', aet: 'VIARA_MRI_03', ip: '192.168.10.13', port: 11127 },
        { name: 'CT-01 Philips iCT 256', type: 'CT', room: 'Room 201', status: 'Active', serial: 'CT-PH-001', manufacturer: 'Philips Healthcare', model: 'iCT 256-Slice', installDate: '2021-08-14', location: 'Imaging Wing B', aet: 'VIARA_CT_01', ip: '192.168.10.21', port: 11114 },
        { name: 'CT-02 GE Revolution EVO', type: 'CT', room: 'Room 202', status: 'Active', serial: 'CT-GE-002', manufacturer: 'GE HealthCare', model: 'Revolution EVO 128', installDate: '2022-11-05', location: 'Imaging Wing B', aet: 'VIARA_CT_02', ip: '192.168.10.22', port: 11115 },
        { name: 'CT-03 Siemens SOMATOM Edge', type: 'CT', room: 'Room 203', status: 'Active', serial: 'CT-SI-003', manufacturer: 'Siemens Healthineers', model: 'SOMATOM Edge', installDate: '2023-05-18', location: 'Imaging Wing B', aet: 'VIARA_CT_03', ip: '192.168.10.23', port: 11126 },
        { name: 'X-Ray-01 Carestream DRX', type: 'X-Ray', room: 'Room 301', status: 'Active', serial: 'XR-MAIN-001', manufacturer: 'Carestream Health', model: 'DRX-Evolution Plus', installDate: '2021-04-10', location: 'Radiography Hall', aet: 'VIARA_XRAY_01', ip: '192.168.10.31', port: 11116 },
        { name: 'X-Ray-02 Shimadzu Mobile', type: 'X-Ray', room: 'Room 302', status: 'Active', serial: 'XR-PORT-002', manufacturer: 'Shimadzu', model: 'MobileDaRt Evolution', installDate: '2023-01-20', location: 'Radiography Hall', aet: 'VIARA_XRAY_02', ip: '192.168.10.32', port: 11117 },
        { name: 'X-Ray-03 Fujifilm Digital', type: 'X-Ray', room: 'Room 303', status: 'Active', serial: 'XR-DIG-003', manufacturer: 'Fujifilm', model: 'FDR D-EVO II', installDate: '2022-09-12', location: 'Radiography Hall', aet: 'VIARA_XRAY_03', ip: '192.168.10.33', port: 11128 },
        { name: 'US-01 GE Voluson E10 4D', type: 'Ultrasound', room: 'Room 401', status: 'Active', serial: 'US-GE-001', manufacturer: 'GE HealthCare', model: 'Voluson E10 BT21', installDate: '2022-03-25', location: 'Ultrasound Suite', aet: 'VIARA_US_01', ip: '192.168.10.41', port: 11118 },
        { name: 'US-02 Philips EPIQ Elite', type: 'Ultrasound', room: 'Room 402', status: 'Active', serial: 'US-PH-002', manufacturer: 'Philips', model: 'EPIQ Elite Matrix', installDate: '2023-04-11', location: 'Ultrasound Suite', aet: 'VIARA_US_02', ip: '192.168.10.42', port: 11119 },
        { name: 'US-03 Philips Lumify POCUS', type: 'Ultrasound', room: 'Room 403', status: 'Active', serial: 'US-POC-003', manufacturer: 'Philips', model: 'Lumify Diagnostic POCUS', installDate: '2023-09-01', location: 'Ultrasound Suite', aet: 'VIARA_US_03', ip: '192.168.10.43', port: 11129 },
        { name: 'PET-CT-01 Siemens Biograph', type: 'PET-CT', room: 'Room 501', status: 'Active', serial: 'PET-001', manufacturer: 'Siemens Healthineers', model: 'Biograph Vision 600', installDate: '2023-07-15', location: 'Nuclear Medicine', aet: 'VIARA_PET_01', ip: '192.168.10.51', port: 11120 },
        { name: 'PET-CT-02 GE Discovery MI', type: 'PET-CT', room: 'Room 502', status: 'Active', serial: 'PET-GE-002', manufacturer: 'GE HealthCare', model: 'Discovery MI DR', installDate: '2024-02-18', location: 'Nuclear Medicine', aet: 'VIARA_PET_02', ip: '192.168.10.52', port: 11130 },
        { name: 'Mammo-01 Hologic 3D Dimensions', type: 'Mammography', room: 'Room 601', status: 'Active', serial: 'MAMMO-001', manufacturer: 'Hologic', model: 'Selenia Dimensions 3D', installDate: '2021-10-30', location: 'Breast Imaging', aet: 'VIARA_MAMMO_01', ip: '192.168.10.61', port: 11121 },
        { name: 'Mammo-02 Siemens Mammomat', type: 'Mammography', room: 'Room 602', status: 'Active', serial: 'MAMMO-002', manufacturer: 'Siemens Healthineers', model: 'MAMMOMAT Revelation', installDate: '2022-12-14', location: 'Breast Imaging', aet: 'VIARA_MAMMO_02', ip: '192.168.10.62', port: 11131 },
        { name: 'Cath Lab-01 Philips Azurion', type: 'Cath Lab', room: 'Room 701', status: 'Active', serial: 'CATH-001', manufacturer: 'Philips', model: 'Azurion 7 C20', installDate: '2023-03-01', location: 'Specialized Suite', aet: 'VIARA_CATH_01', ip: '192.168.10.71', port: 11122 },
        { name: 'Fluoro-01 Siemens Luminos', type: 'Fluoroscopy', room: 'Room 801', status: 'Active', serial: 'FLUO-001', manufacturer: 'Siemens Healthineers', model: 'Luminos Agile Max', installDate: '2022-04-18', location: 'Specialized Suite', aet: 'VIARA_FLUO_01', ip: '192.168.10.81', port: 11123 },
        { name: 'DEXA-01 Hologic Horizon W', type: 'DEXA', room: 'Room 901', status: 'Active', serial: 'DEXA-001', manufacturer: 'Hologic', model: 'Horizon W Bone Densitometer', installDate: '2022-08-22', location: 'Specialized Suite', aet: 'VIARA_DEXA_01', ip: '192.168.10.91', port: 11124 },
        { name: 'DEXA-02 GE Lunar iDXA', type: 'DEXA', room: 'Room 901', status: 'Under Maintenance', serial: 'DEXA-002', manufacturer: 'GE HealthCare', model: 'Lunar iDXA Pro', installDate: '2021-05-19', location: 'Specialized Suite', aet: 'VIARA_DEXA_02', ip: '192.168.10.92', port: 11132 },
        { name: 'Panoramic-01 Carestream Dental', type: 'Panoramic X-Ray', room: 'Room 1001', status: 'Active', serial: 'PANO-001', manufacturer: 'Carestream Dental', model: 'CS 8100 3D CBCT', installDate: '2023-11-10', location: 'Specialized Suite', aet: 'VIARA_PANO_01', ip: '192.168.10.101', port: 11125 },
    ];

    const modalityIds = [];
    for (const mod of modalities) {
        const roomId = roomMap[mod.room] || null;
        const res = await pool.query(`
            INSERT INTO modalities (
                name, type, room_number, room_id, status, maintenance_schedule, aet, ip_address, port,
                dicom_synced, serial_number, manufacturer, model, installation_date, location
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING modality_id;
        `, [
            mod.name, mod.type, mod.room, roomId, mod.status,
            JSON.stringify({ next_service: toIsoDate(randomFutureDate(90)), calibration_date: toIsoDate(randomPastDate(30)) }),
            mod.aet, mod.ip, mod.port, mod.status === 'Active',
            mod.serial, mod.manufacturer, mod.model, mod.installDate, mod.location
        ]);
        modalityIds.push({ ...mod, id: res.rows[0].modality_id, roomId });
    }
    console.log(`   ✓ Seeded ${modalityIds.length} modalities linked to rooms.`);
    return modalityIds;
}

async function seedExaminationTypes(modalityIds) {
    console.log('\n🔬 Seeding Standardized Clinical Examination Catalog...');
    const examTypes = [
        // MRI
        { name: 'Brain MRI (Plain)', code: 'MRI-BRAIN', modalityType: 'MRI', price: 3200, duration: 40, bodyPart: 'Brain', preparation: 'Remove all metal jewelry, dentures, and hairpins.', contrast: false },
        { name: 'Brain MRI with Contrast', code: 'MRI-BRAIN-CONT', modalityType: 'MRI', price: 4200, duration: 50, bodyPart: 'Brain', preparation: 'Fasting 4 hours before exam. Serum creatinine required.', contrast: true },
        { name: 'Lumbosacral Spine MRI', code: 'MRI-SPINE-LS', modalityType: 'MRI', price: 3400, duration: 40, bodyPart: 'Spine', preparation: 'Wear comfortable loose clothing without metal fasteners.', contrast: false },
        { name: 'Cervical Spine MRI', code: 'MRI-SPINE-CERV', modalityType: 'MRI', price: 3300, duration: 40, bodyPart: 'Spine', preparation: 'Wear comfortable clothing with no metal zippers.', contrast: false },
        { name: 'Knee Joint MRI', code: 'MRI-KNEE', modalityType: 'MRI', price: 2900, duration: 35, bodyPart: 'Knee', preparation: 'No special preparation needed.', contrast: false },
        { name: 'Shoulder Joint MRI', code: 'MRI-SHOULDER', modalityType: 'MRI', price: 3000, duration: 35, bodyPart: 'Shoulder', preparation: 'Remove upper body accessories.', contrast: false },
        { name: 'MRCP (Biliary Tree MRI)', code: 'MRI-MRCP', modalityType: 'MRI', price: 4500, duration: 45, bodyPart: 'Abdomen', preparation: 'Fasting for 6 hours prior to exam is mandatory.', contrast: false },
        { name: 'Pelvic MRI (Multiparametric)', code: 'MRI-PELVIS-MP', modalityType: 'MRI', price: 4800, duration: 50, bodyPart: 'Pelvis', preparation: 'Fasting for 4 hours, mild bladder filling.', contrast: true },

        // CT
        { name: 'Brain CT (Plain)', code: 'CT-BRAIN', modalityType: 'CT', price: 1500, duration: 15, bodyPart: 'Brain', preparation: 'Remove glasses, earrings, and metal head accessories.', contrast: false },
        { name: 'Chest CT High Resolution (HRCT)', code: 'CT-CHEST-HRCT', modalityType: 'CT', price: 1900, duration: 20, bodyPart: 'Chest', preparation: 'Practice deep breath holding for 10-15 seconds.', contrast: false },
        { name: 'CT Abdomen & Pelvis with IV Contrast', code: 'CT-AP-CONT', modalityType: 'CT', price: 3200, duration: 30, bodyPart: 'Abdomen/Pelvis', preparation: 'Fasting 4-6 hours. Drink oral contrast 45 mins prior.', contrast: true },
        { name: 'CT Coronary Angiography', code: 'CT-CORONARY-ANGIO', modalityType: 'CT', price: 5500, duration: 35, bodyPart: 'Heart', preparation: 'Avoid caffeine 12 hrs prior. Heart rate assessment.', contrast: true },
        { name: 'CT Pulmonary Angiography (CTPA)', code: 'CT-PULM-ANGIO', modalityType: 'CT', price: 3500, duration: 25, bodyPart: 'Chest', preparation: 'Urgent evaluation. IV cannula 18G required.', contrast: true },
        { name: 'Paranasal Sinuses CT (PNS)', code: 'CT-PNS', modalityType: 'CT', price: 1400, duration: 15, bodyPart: 'Head/Neck', preparation: 'Remove metallic items.', contrast: false },

        // Digital X-Ray
        { name: 'Chest X-Ray PA View', code: 'XR-CHEST-PA', modalityType: 'X-Ray', price: 350, duration: 10, bodyPart: 'Chest', preparation: 'Remove necklace and metallic items.', contrast: false },
        { name: 'Lumbosacral Spine X-Ray (AP/Lat)', code: 'XR-SPINE-LS', modalityType: 'X-Ray', price: 450, duration: 15, bodyPart: 'Spine', preparation: 'Wear loose clothing.', contrast: false },
        { name: 'Knee X-Ray (AP/Lat/Weight-Bearing)', code: 'XR-KNEE-WB', modalityType: 'X-Ray', price: 400, duration: 10, bodyPart: 'Knee', preparation: 'Expose knee area.', contrast: false },
        { name: 'Pelvis & Both Hips X-Ray', code: 'XR-PELVIS', modalityType: 'X-Ray', price: 420, duration: 10, bodyPart: 'Pelvis', preparation: 'Empty bladder before exam.', contrast: false },

        // Ultrasound
        { name: 'Abdominal & Pelvic Ultrasound', code: 'US-ABD-PELV', modalityType: 'Ultrasound', price: 750, duration: 25, bodyPart: 'Abdomen/Pelvis', preparation: 'Fasting 6 hours, drink 1 liter of water for full bladder.', contrast: false },
        { name: 'Thyroid Ultrasound with Doppler', code: 'US-THYROID', modalityType: 'Ultrasound', price: 650, duration: 20, bodyPart: 'Neck', preparation: 'No preparation needed. Remove neck jewelry.', contrast: false },
        { name: 'Venous Doppler Lower Extremities', code: 'US-DOPPLER-LEG', modalityType: 'Ultrasound', price: 1100, duration: 35, bodyPart: 'Lower Limbs', preparation: 'Comfortable pants recommended.', contrast: false },
        { name: 'Echocardiography (Transthoracic)', code: 'US-ECHO-TTE', modalityType: 'Ultrasound', price: 1200, duration: 35, bodyPart: 'Heart', preparation: 'No special preparation needed.', contrast: false },
        { name: 'Obstetric 4D Anomaly Scan', code: 'US-OB-4D', modalityType: 'Ultrasound', price: 1400, duration: 40, bodyPart: 'Obstetric', preparation: 'Drink water 30 minutes prior to scan.', contrast: false },

        // PET-CT
        { name: 'Whole Body PET-CT (FDG Oncology)', code: 'PET-WHOLE-BODY', modalityType: 'PET-CT', price: 8900, duration: 90, bodyPart: 'Whole Body', preparation: 'Fasting 6 hours. Blood glucose level must be < 200 mg/dL.', contrast: true },
        { name: 'PET-CT Lymphoma Follow-Up', code: 'PET-LYMPHOMA', modalityType: 'PET-CT', price: 8900, duration: 90, bodyPart: 'Whole Body', preparation: 'Rest quietly in dark room post-injection.', contrast: true },

        // Mammography
        { name: 'Screening 3D Mammography (Both Breasts)', code: 'MAMMO-SCREEN-3D', modalityType: 'Mammography', price: 1200, duration: 25, bodyPart: 'Breast', preparation: 'Do not apply deodorant, powders, or lotions under arms.', contrast: false },
        { name: 'Diagnostic Mammogram + Breast Ultrasound', code: 'MAMMO-US-COMBO', modalityType: 'Mammography', price: 1600, duration: 40, bodyPart: 'Breast', preparation: 'Bring previous films for comparison if available.', contrast: false },

        // DEXA & Specialized
        { name: 'DEXA Bone Densitometry (Spine & Hip)', code: 'DEXA-SPINE-HIP', modalityType: 'DEXA', price: 950, duration: 20, bodyPart: 'Spine/Femur', preparation: 'Avoid calcium supplements for 24 hours prior.', contrast: false },
        { name: 'Panoramic Dental Radiography (OPG)', code: 'XR-DENTAL-OPG', modalityType: 'Panoramic X-Ray', price: 500, duration: 15, bodyPart: 'Jaws/Teeth', preparation: 'Remove earrings, hairpins, and removable dentures.', contrast: false },
        { name: 'Barium Swallow & Meal Fluoroscopy', code: 'FLUO-BARIUM-SWALLOW', modalityType: 'Fluoroscopy', price: 1800, duration: 35, bodyPart: 'Upper GI', preparation: 'NPO (fasting completely) after midnight.', contrast: true },
    ];

    const typeIds = [];
    for (const exam of examTypes) {
        const mod = modalityIds.find(m => m.type === exam.modalityType);
        if (!mod) continue;

        const res = await pool.query(`
            INSERT INTO examination_types (
                code, name, modality_id, price, duration_minutes, body_part,
                preparation_instructions, contrast_required
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING type_id;
        `, [
            exam.code, exam.name, mod.id, exam.price, exam.duration,
            exam.bodyPart, exam.preparation, exam.contrast
        ]);
        typeIds.push({ ...exam, id: res.rows[0].type_id, modalityId: mod.id });
    }
    console.log(`   ✓ Seeded ${typeIds.length} examination procedures.`);
    return typeIds;
}

async function seedReferringDoctors(userIds) {
    console.log('\n🩺 Seeding Referring Physicians Network...');
    const admin = userIds.find(u => u.role === 'Admin');
    const doctorPasswordHash = await bcrypt.hash('Doctor@123', 12);
    const doctors = [
        { name: 'Dr. Tarek Mostafa', specialty: 'Cardiology & Angiology', hospital: 'National Heart Institute' },
        { name: 'Dr. Nadia Khalil', specialty: 'Orthopedic Surgery & Sports Medicine', hospital: 'Heliopolis Orthopedic Clinic' },
        { name: 'Dr. Hossam Refaat', specialty: 'Internal Medicine & Gastroenterology', hospital: 'Cairo Medical Specialists' },
        { name: 'Dr. Rania Fathy', specialty: 'Neurology & Neurosurgery', hospital: 'Nile Neuro Center' },
        { name: 'Dr. Karim Youssef', specialty: 'General & Laparoscopic Surgery', hospital: 'Delta Medical Complex' },
        { name: 'Dr. Mona El-Sayed', specialty: 'Obstetrics & Gynecology', hospital: 'Queen Women Health Center' },
        { name: 'Dr. Ahmed Aboulela', specialty: 'Medical Oncology', hospital: 'Hope Oncology Institute' },
        { name: 'Dr. Laila Mounir', specialty: 'Rheumatology & Autoimmune Diseases', hospital: 'Maadi Specialized Clinic' },
    ];

    const referringDoctorIds = [];
    for (const doc of doctors) {
        const res = await pool.query(`
            INSERT INTO referring_doctors (
                full_name, specialty, clinic_hospital, phone, email, address,
                tax_id, referral_source_category, commission_percentage,
                preferred_contact_method, is_active, notes, created_by,
                portal_is_active, portal_password_hash
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Doctor', $8, 'Email', TRUE, $9, $10, TRUE, $11)
            RETURNING doctor_id;
        `, [
            doc.name, doc.specialty, doc.hospital, randomPhone(),
            `${doc.name.toLowerCase().replace(/[^a-z]+/g, '.')}@referral-network.com`,
            randomAddress(), `TAX-${randomInt(100000, 999999)}`,
            randomInt(8, 15), `Key clinical referral partner in ${doc.specialty}.`, admin?.id || null,
            doctorPasswordHash
        ]);
        referringDoctorIds.push({ ...doc, id: res.rows[0].doctor_id });
    }
    console.log(`   ✓ Seeded ${referringDoctorIds.length} referring doctors (Doctor Portal password: 'Doctor@123').`);
    return referringDoctorIds;
}

async function seedPatients(count = 150) {
    console.log(`\n🧑‍⚕️ Seeding ${count} Realistic Egyptian Patient Records (AES-GCM Encrypted)...`);
    const patientIds = [];
    const patientPasswordHash = await bcrypt.hash('Patient@123', 12);

    for (let i = 0; i < count; i++) {
        const gender = i % 2 === 0 ? 'Male' : 'Female';
        const firstName = randomElement(firstNames[gender.toLowerCase()]);
        const lastName = randomElement(lastNames);
        const dob = randomDate(new Date(1950, 0, 1), new Date(2012, 0, 1));
        const phone = randomPhone();
        const address = randomAddress();
        const nationalId = randomNationalId();
        const mrn = `MRN-${String(i + 1).padStart(6, '0')}`;
        // Give first 10 patients portal accounts so patient billing/reports/appointments are instantly testable
        const passwordHash = i < 10 ? patientPasswordHash : null;

        const res = await pool.query(`
            INSERT INTO patients (
                mrn, first_name_enc, last_name_enc, date_of_birth_enc,
                phone_enc, address_enc, national_id_enc, gender,
                password_hash, patient_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Active')
            RETURNING patient_id;
        `, [
            mrn,
            encrypt(firstName),
            encrypt(lastName),
            encrypt(toIsoDate(dob)),
            encrypt(phone),
            encrypt(address),
            encrypt(nationalId),
            gender,
            passwordHash
        ]);
        patientIds.push(res.rows[0].patient_id);
    }
    console.log(`   ✓ Seeded ${patientIds.length} patients (Portal demo accounts active: MRN-000001 to MRN-000010 with password 'Patient@123').`);
    return patientIds;
}

async function seedWaitingRoomAnnouncements(userIds) {
    console.log('\n📢 Seeding Waiting Room Display Board Announcements...');
    const admin = userIds.find(u => u.role === 'Admin');
    const announcements = [
        {
            title: 'إرشادات السلامة لفحص الرنين المغناطيسي',
            message: 'يرجى من جميع المرضى والمرافقين خلع كافة الساعات، البطاقات الممغنطة، الهواتف، وأي قطع معدنية قبل دخول غرفة الفحص للحفاظ على سلامتكم.',
            tone: 'warning',
            order: 1
        },
        {
            title: 'جاهزية استلام التقارير الطبية',
            message: 'يمكنكم الآن استلام نتائج وتقارير الأشعة المقطعية والموجات الصوتية فور اعتمادها عبر بوابة المريض الإلكترونية أو رسائل الواتساب الرسمية للمركز.',
            tone: 'success',
            order: 2
        },
        {
            title: 'تنبيه لفحوصات الصبغة الوريدية',
            message: 'السادة مرضى فحوصات الصبغة الصائمين: يرجى التوجه فوراً لغرفة التحضير (PREP-01) لمراجعة وظائف الكلى وتركيب الكانيولا الوريدية مع طاقم التمريض.',
            tone: 'urgent',
            order: 3
        },
        {
            title: 'خدمات الطوارئ والرعاية المستمرة',
            message: 'مركز VIARA يعمل على مدار الساعة لخدمتكم مع تواجد استشاريي الأشعة التخصصية وخدمات النقل الإسعافي والتحضير السريع.',
            tone: 'info',
            order: 4
        }
    ];

    for (const a of announcements) {
        await pool.query(`
            INSERT INTO display_announcements (
                title, message, tone, is_active, display_order, created_by
            ) VALUES ($1, $2, $3, TRUE, $4, $5);
        `, [a.title, a.message, a.tone, a.order, admin?.id || null]);
    }
    console.log(`   ✓ Seeded ${announcements.length} live waiting-room announcements.`);
}

async function seedShiftsAndAttendance(userIds, roomMap) {
    console.log('\n📅 Seeding 14-Day Staff Roster (linked to Rooms) & Live Attendance...');

    const operationalStaff = userIds.filter(u => ['Radiologist', 'Technician', 'Nurse', 'Receptionist', 'Cashier'].includes(u.role));
    const now = new Date();
    const todayStr = toIsoDate(now);

    const roomAssignments = {
        Technician: [roomMap['Room 101'], roomMap['Room 201'], roomMap['Room 301'], roomMap['Room 401']],
        Nurse: [roomMap['PREP-01'], roomMap['RECOV-01']],
        Radiologist: [roomMap['READ-01']],
    };

    let shiftsCount = 0;
    // Seed 14 days of shifts (past 7 days, today, next 6 days)
    for (let dayOffset = -7; dayOffset <= 6; dayOffset++) {
        const shiftDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
        const shiftDateStr = toIsoDate(shiftDate);

        for (const staffMember of operationalStaff) {
            // Assign morning shift (08:00 - 16:00) or evening shift (14:00 - 22:00)
            const isMorning = staffMember.role === 'Receptionist' || staffMember.role === 'Cashier' || Math.random() > 0.4;
            const startHour = isMorning ? 8 : 14;
            const endHour = isMorning ? 16 : 22;

            const startTime = new Date(`${shiftDateStr}T${String(startHour).padStart(2, '0')}:00:00Z`);
            const endTime = new Date(`${shiftDateStr}T${String(endHour).padStart(2, '0')}:00:00Z`);

            const assignedRooms = roomAssignments[staffMember.role] || [];
            const assignedRoomId = assignedRooms.length ? randomElement(assignedRooms) : null;

            try {
                const shiftRes = await pool.query(`
                    INSERT INTO staff_shifts (user_id, start_time, end_time, room_id, notes)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING shift_id;
                `, [
                    staffMember.id, startTime, endTime, assignedRoomId,
                    `${isMorning ? 'صباحية' : 'مسائية'} - ${staffMember.role} - تغطية تشغيلية`
                ]);
                shiftsCount++;
                const shiftId = shiftRes.rows[0].shift_id;

                // For past days, seed completed attendance log
                if (dayOffset < 0) {
                    const isLate = Math.random() < 0.2;
                    const lateMinutes = isLate ? randomInt(15, 35) : 0;
                    const clockIn = new Date(startTime.getTime() + lateMinutes * 60000);
                    const clockOut = new Date(endTime.getTime() + randomInt(0, 15) * 60000);

                    await pool.query(`
                        INSERT INTO attendance_logs (
                            user_id, shift_id, clock_in, clock_out, status, late_minutes,
                            early_leave_minutes, shift_link_type, scheduled_start_snapshot, scheduled_end_snapshot
                        ) VALUES ($1, $2, $3, $4, $5, $6, 0, 'Auto', $7, $8);
                    `, [
                        staffMember.id, shiftId, clockIn, clockOut,
                        isLate ? 'Late' : 'Present', lateMinutes, startTime, endTime
                    ]);
                }

                // For TODAY, seed active live attendance punch (clock_out IS NULL)
                if (dayOffset === 0 && isMorning) {
                    const clockIn = new Date(startTime.getTime() + randomInt(-5, 10) * 60000);
                    await pool.query(`
                        INSERT INTO attendance_logs (
                            user_id, shift_id, clock_in, clock_out, status, late_minutes,
                            early_leave_minutes, shift_link_type, scheduled_start_snapshot, scheduled_end_snapshot
                        ) VALUES ($1, $2, $3, NULL, 'Present', 0, 0, 'Auto', $7, $8);
                    `, [
                        staffMember.id, shiftId, clockIn, startTime, endTime
                    ]);
                }
            } catch (err) {
                // Ignore shift overlap if any
            }
        }
    }
    console.log(`   ✓ Seeded ${shiftsCount} staff shifts and live active attendance sessions.`);

    // Seed attendance permissions (Early departure, Late arrival)
    const hr = userIds.find(u => u.role === 'HR');
    const nurseDina = userIds.find(u => u.email === 'dina.nurse@VIARA.com');
    const techMohamed = userIds.find(u => u.email === 'mohamed.tech@VIARA.com');

    if (nurseDina && hr) {
        await pool.query(`
            INSERT INTO attendance_permissions (
                user_id, permission_type, effective_date, minutes_granted, reason, status, reviewed_by, reviewed_at, review_notes
            ) VALUES ($1, 'EarlyDeparture', $2, 60, 'ظرف عائلي طارئ يتطلب المغادرة مبكراً ساعة', 'Approved', $3, NOW(), 'تمت الموافقة وتكليف زميل بالتغطية');
        `, [nurseDina.id, todayStr, hr.id]);
    }

    if (techMohamed) {
        await pool.query(`
            INSERT INTO attendance_permissions (
                user_id, permission_type, effective_date, minutes_granted, reason, status
            ) VALUES ($1, 'LateArrival', $2, 45, 'عطل مفاجئ بالسيارة في الطريق للمركز', 'Pending');
        `, [techMohamed.id, todayStr]);
    }
    console.log('   ✓ Seeded attendance permission requests for HR review.');
}

async function seedCashierShifts(userIds) {
    console.log('\n💵 Seeding Cashier Shifts & Treasury Closures...');
    const cashier = userIds.find(u => u.role === 'Cashier');
    if (!cashier) return {};

    const defaultBranchId = '00000000-0000-4000-8000-000000000001';
    const now = new Date();
    const todayStr = toIsoDate(now);
    const todayMorning = new Date(now);
    todayMorning.setHours(8, 0, 0, 0);

    // Open cashier shift for today
    const openShiftRes = await pool.query(`
        INSERT INTO cashier_shifts (
            cashier_id, opening_balance, status, opened_at, notes, business_date, branch_id, currency_code
        ) VALUES ($1, 2500.00, 'Open', $2, 'الوردية الصباحية - تم تسليم عهدة نقدية 2500 جنيه', $3, $4, 'EGP')
        RETURNING shift_id;
    `, [cashier.id, todayMorning, todayStr, defaultBranchId]);

    // Closed shift for yesterday
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = toIsoDate(yesterday);
    const yesterdayMorning = new Date(yesterday);
    yesterdayMorning.setHours(8, 0, 0, 0);
    const yesterdayEvening = new Date(yesterday);
    yesterdayEvening.setHours(17, 0, 0, 0);

    const yesterdayShiftRes = await pool.query(`
        INSERT INTO cashier_shifts (
            cashier_id, opening_balance, closing_balance, status, opened_at, closed_at, notes, business_date, branch_id, currency_code
        ) VALUES ($1, 2000.00, 48500.00, 'Closed', $2, $3, 'إغلاق وردية الأمس متوازنة مع إيداع بنكي', $4, $5, 'EGP')
        RETURNING shift_id;
    `, [cashier.id, yesterdayMorning, yesterdayEvening, yesterdayStr, defaultBranchId]);

    await pool.query(`
        INSERT INTO cashier_closures (
            shift_id, business_date, totals, expected_cash, counted_cash,
            variance, variance_reason, review_status, closed_by, branch_id, currency_code
        ) VALUES ($1, $2, $3::jsonb, 48500.00, 48500.00, 0.00, 'مطابقة تامة', 'Accepted', $4, $5, 'EGP');
    `, [
        yesterdayShiftRes.rows[0].shift_id, yesterdayStr,
        JSON.stringify({ opening_cash: 2000, collections_cash: 46500, total_cash: 48500 }),
        cashier.id, defaultBranchId
    ]);

    console.log('   ✓ Seeded active today cashier shift and reconciled past shift.');
    return {
        todayShiftId: openShiftRes.rows[0]?.shift_id,
        yesterdayShiftId: yesterdayShiftRes.rows[0]?.shift_id
    };
}

async function seedAppointmentsAndExams(patientIds, modalityIds, examTypes, userIds, referringDoctors, roomMap, cashierShifts = {}) {
    console.log('\n📅 Seeding Comprehensive Clinical Workflow: Today Live Queue + Past 60 Days History...');

    const radiologists = userIds.filter(u => u.role === 'Radiologist');
    const technicians = userIds.filter(u => u.role === 'Technician');
    const nurses = userIds.filter(u => u.role === 'Nurse');
    const receptionists = userIds.filter(u => u.role === 'Receptionist');
    const cashier = userIds.find(u => u.role === 'Cashier');
    const defaultBranchId = '00000000-0000-4000-8000-000000000001';

    const now = new Date();
    const todayStr = toIsoDate(now);
    const finalizedExams = [];

    // 1. TODAY'S LIVE CLINICAL FLOW (16 active cases across all operational stations)
    console.log('   → Generating 16 live cases for TODAY in diverse stages...');
    const liveStages = [
        { status: 'Confirmed', examStatus: 'Scheduled', queueStage: 'Scheduled', station: 'Reception', hour: 16, count: 3 },
        { status: 'Confirmed', examStatus: 'Checked-in', queueStage: 'Arrived', station: 'Reception', hour: 10, count: 3 },
        { status: 'Confirmed', examStatus: 'Preparation', queueStage: 'Prep Pending', station: 'Nurse', hour: 10, count: 2, usePrepRoom: true },
        { status: 'Confirmed', examStatus: 'Scanning', queueStage: 'In Exam', station: 'Modality', hour: 11, count: 2 },
        { status: 'Confirmed', examStatus: 'Reporting', queueStage: 'Reporting', station: 'Radiologist', hour: 10, count: 3 },
        { status: 'Confirmed', examStatus: 'Finalized', queueStage: 'Finalized', station: 'Delivery', hour: 9, count: 3 },
    ];

    let orderIdx = 1;
    for (const group of liveStages) {
        for (let k = 0; k < group.count; k++) {
            const modality = modalityIds[(orderIdx - 1) % modalityIds.length];
            const matchingExams = examTypes.filter(e => e.modalityType === modality.type);
            const examType = matchingExams.length ? matchingExams[orderIdx % matchingExams.length] : (examTypes.find(e => e.modalityType === modality.type) || examTypes[0]);
            const patient = orderIdx === 1 ? patientIds[0] : patientIds[(orderIdx * 7) % patientIds.length];
            const radiologist = radiologists[orderIdx % radiologists.length];
            const technician = technicians[orderIdx % technicians.length];
            const nurse = nurses[orderIdx % nurses.length];
            const receptionist = receptionists[orderIdx % receptionists.length];
            const referringDoc = referringDoctors.length ? referringDoctors[orderIdx % referringDoctors.length] : null;

            const startTime = new Date(`${todayStr}T${String(group.hour).padStart(2, '0')}:${String((k * 15) % 60).padStart(2, '0')}:00Z`);
            const endTime = new Date(startTime.getTime() + examType.duration * 60000);
            const orderNum = `ORD-LIVE-${String(orderIdx).padStart(4, '0')}`;
            const targetRoomId = group.usePrepRoom ? roomMap['PREP-01'] : (modality.roomId || roomMap['Room 101']);

            try {
                const apptRes = await pool.query(`
                    INSERT INTO appointments (
                        patient_id, modality_id, room_id, exam_type_id, start_time, end_time,
                        status, order_number, priority, clinical_indication, provisional_diagnosis,
                        body_part, contrast_required, created_by, referring_doctor_id, referring_doctor,
                        technician_id, nurse_id, radiologist_id, payment_method, payment_amount,
                        appointment_source, preparation_status
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::order_priority, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
                    RETURNING appointment_id;
                `, [
                    patient, modality.id, targetRoomId, examType.id, startTime, endTime,
                    group.status, orderNum, (k === 0 ? 'Urgent' : 'Routine'),
                    'تقييم إكلينيكي عاجل وتشخيص دقيق للحالة', 'فحص تشخيصي استقصائي',
                    examType.bodyPart, examType.contrast, receptionist.id,
                    referringDoc?.id || null, referringDoc?.name || null,
                    technician.id, nurse.id, radiologist.id,
                    'Cash', examType.price, 'Walk-in',
                    examType.contrast ? (group.examStatus === 'Scheduled' ? 'Pending' : 'Completed') : 'Not Required'
                ]);

            const apptId = apptRes.rows[0].appointment_id;
            const reportSections = buildReportSections(modality.type, examType.name);

            const internalReferringUser = userIds.find(u => u.role === 'Referring_Doctor') || userIds.find(u => u.role === 'Radiologist');
            const examRes = await pool.query(`
                INSERT INTO examinations (
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
                ) RETURNING exam_id;
            `, [
                apptId, patient, modality.id, examType.id,
                radiologist.id,
                referringDoc ? null : internalReferringUser.id,
                referringDoc ? referringDoc.id : null,
                makeDicomUid(),
                group.examStatus === 'Preparation' ? 'Checked-in' : group.examStatus,
                orderNum, (k === 0 ? 'Urgent' : 'Routine'),
                'متابعة تشخيصية دقيقة', 'فحص متخصص',
                examType.bodyPart, examType.contrast,
                group.queueStage, group.station,
                group.examStatus !== 'Scheduled' ? startTime : null,
                ['Scanning', 'Reporting', 'Finalized'].includes(group.examStatus) ? startTime : null,
                ['Reporting', 'Finalized'].includes(group.examStatus) ? endTime : null,
                ['Reporting', 'Finalized'].includes(group.examStatus) ? endTime : null,
                `<h3>${examType.name}</h3><p><b>التقنية:</b> ${reportSections.technique}</p><p><b>النتائج:</b> ${reportSections.findings}</p><p><b>الخلاصة:</b> ${reportSections.impression}</p>`,
                JSON.stringify(reportSections),
                group.examStatus === 'Finalized' ? 'Finalized' : group.examStatus === 'Reporting' ? 'Reviewed' : 'Draft',
                group.examStatus === 'Finalized' ? endTime : null,
                group.examStatus === 'Finalized' ? radiologist.name : null,
                group.examStatus === 'Finalized' ? 'Radiologist' : null,
                group.examStatus === 'Finalized' ? crypto.createHash('sha256').update(orderNum).digest('hex') : null
            ]);

            const examId = examRes.rows[0].exam_id;

            // Invoice for all checked-in / finalized
            if (['Scanning', 'Reporting', 'Finalized', 'Checked-in'].includes(group.examStatus)) {
                const invNum = `INV-${orderNum}`;
                const isPaid = group.examStatus === 'Finalized';
                const invStatus = isPaid ? 'Paid' : 'Pending';
                const paymentStatus = isPaid ? 'Paid' : 'Pending';
                const invRes = await pool.query(`
                    INSERT INTO invoices (
                        invoice_number, appointment_id, exam_id, patient_id, invoice_status, subtotal_amount,
                        total_amount, insurance_covered_amount, patient_payable_amount, status,
                        due_date, notes, business_date, branch_id, currency_code
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9::payment_status, $10, $11, $12, $13, 'EGP')
                    RETURNING invoice_id;
                `, [
                    invNum, apptId, examId, patient,
                    invStatus, examType.price, examType.price, examType.price,
                    paymentStatus, toIsoDate(randomFutureDate(30)),
                    `فاتورة فحص ${examType.name}`, todayStr, defaultBranchId
                ]);

                await pool.query(`
                    INSERT INTO invoice_items (
                        invoice_id, exam_id, exam_type_id, description, quantity, unit_price,
                        discount_amount, tax_amount, total_amount
                    ) VALUES ($1, $2, $3, $4, 1, $5, 0, 0, $6);
                `, [invRes.rows[0].invoice_id, examId, examType.id, examType.name, examType.price, examType.price]);

                if (group.examStatus === 'Finalized') {
                    await pool.query(`
                        INSERT INTO payments (
                            invoice_id, amount, method, processed_by, cashier_shift_id,
                            receipt_number, payment_reference, transaction_date, business_date, branch_id, currency_code
                        ) VALUES ($1, $2, 'Cash', $3, $4::uuid, $5, $6, NOW(), $7, $8, 'EGP');
                    `, [
                        invRes.rows[0].invoice_id, examType.price, cashier?.id || receptionist.id,
                        cashierShifts.todayShiftId || null, `REC-${orderNum}`, `PAY-${orderNum}`,
                        todayStr, defaultBranchId
                    ]);

                    finalizedExams.push({
                        examId, appointmentId: apptId, patientId: patient,
                        modalityId: modality.id, examTypeId: examType.id,
                        examTypeName: examType.name, amount: examType.price,
                        invoiceId: invRes.rows[0].invoice_id, createdById: receptionist.id,
                        radiologistId: radiologist.id, referringDoctorId: referringDoc?.id || null
                    });
                }
            }
        } catch (err) {
            if (err.code !== '23P01') {
                console.error(`   ⚠ Warning at live appointment ${orderIdx}: ${err.message}`);
            }
        }
            orderIdx++;
        }
    }

    // 2. HISTORICAL COMPLETED EXAMINATIONS (Past 60 Days - 250 records)
    console.log('   → Generating 250 historical examinations across past 60 days...');
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 250; i++) {
        const patient = patientIds[i % patientIds.length];
        const examType = examTypes[i % examTypes.length];
        const modality = modalityIds.find(m => m.id === examType.modalityId);
        const radiologist = radiologists[i % radiologists.length];
        const technician = technicians[i % technicians.length];
        const nurse = nurses[i % nurses.length];
        const receptionist = receptionists[i % receptionists.length];
        const referringDoc = referringDoctors.length && Math.random() > 0.3 ? randomElement(referringDoctors) : null;

        const appointmentDate = randomDate(sixtyDaysAgo, new Date(now.getTime() - 24 * 60 * 60 * 1000));
        const startTime = new Date(appointmentDate);
        startTime.setHours(randomInt(8, 17), randomInt(0, 3) * 15, 0);
        const endTime = new Date(startTime.getTime() + examType.duration * 60000);

        const orderNum = `ORD-HIST-${String(i + 1).padStart(5, '0')}`;
        const reportSections = buildReportSections(modality.type, examType.name);
        const histDateStr = toIsoDate(endTime);

        try {
            const apptRes = await pool.query(`
                INSERT INTO appointments (
                    patient_id, modality_id, room_id, exam_type_id, start_time, end_time,
                    status, order_number, priority, clinical_indication, provisional_diagnosis,
                    body_part, contrast_required, created_by, referring_doctor_id, referring_doctor,
                    technician_id, nurse_id, radiologist_id, payment_method, payment_amount,
                    appointment_source, preparation_status
                ) VALUES ($1, $2, $3, $4, $5, $6, 'Confirmed', $7, 'Routine', 'فحص دوري ومتابعة سريرية', 'سليم', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'Website', 'Completed')
                RETURNING appointment_id;
            `, [
                patient, modality.id, modality.roomId, examType.id, startTime, endTime,
                orderNum, examType.bodyPart, examType.contrast, receptionist.id,
                referringDoc?.id || null, referringDoc?.name || null,
                technician.id, nurse.id, radiologist.id,
                randomElement(['Cash', 'Card', 'Insurance']), examType.price
            ]);

            const apptId = apptRes.rows[0].appointment_id;

            const examRes = await pool.query(`
                INSERT INTO examinations (
                    appointment_id, patient_id, modality_id, exam_type_id,
                    performing_radiologist_id, referring_doctor_id, external_referring_doctor_id, study_instance_uid,
                    status, order_number, priority, clinical_indication, provisional_diagnosis,
                    body_part, contrast_required, queue_stage, current_station, arrived_at,
                    exam_started_at, exam_completed_at, reporting_started_at, report_content,
                    report_sections, report_status, report_finalized_at, digital_signature_name,
                    digital_signature_role, digital_signature_hash
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8,
                    'Finalized'::exam_status, $9, 'Routine'::order_priority, 'تشخيص سريري', 'مستقر',
                    $10, $11, 'Finalized', 'Delivery', $12, $13, $14, $15,
                    $16, $17::jsonb, 'Finalized', $18, $19, 'Radiologist', $20
                ) RETURNING exam_id;
            `, [
                apptId, patient, modality.id, examType.id,
                radiologist.id,
                referringDoc ? null : internalReferringUser.id,
                referringDoc ? referringDoc.id : null,
                makeDicomUid(),
                orderNum, examType.bodyPart, examType.contrast,
                startTime, startTime, endTime, endTime,
                `<h3>${examType.name}</h3><p><b>التقنية:</b> ${reportSections.technique}</p><p><b>النتائج:</b> ${reportSections.findings}</p><p><b>الخلاصة:</b> ${reportSections.impression}</p>`,
                JSON.stringify(reportSections),
                endTime, radiologist.name,
                crypto.createHash('sha256').update(orderNum).digest('hex')
            ]);

            const examId = examRes.rows[0].exam_id;

            const invNum = `INV-${orderNum}`;
            const invRes = await pool.query(`
                INSERT INTO invoices (
                    invoice_number, appointment_id, exam_id, patient_id, invoice_status, subtotal_amount,
                    total_amount, insurance_covered_amount, patient_payable_amount, status,
                    due_date, notes, business_date, branch_id, currency_code
                ) VALUES ($1, $2, $3, $4, 'Paid', $5, $6, 0, $7, 'Paid', $8, $9, $10, $11, 'EGP')
                RETURNING invoice_id;
            `, [
                invNum, apptId, examId, patient,
                examType.price, examType.price, examType.price,
                histDateStr, `فاتورة مسددة بالكامل لفحص ${examType.name}`,
                histDateStr, defaultBranchId
            ]);

            await pool.query(`
                INSERT INTO invoice_items (
                    invoice_id, exam_id, exam_type_id, description, quantity, unit_price,
                    discount_amount, tax_amount, total_amount
                ) VALUES ($1, $2, $3, $4, 1, $5, 0, 0, $6);
            `, [invRes.rows[0].invoice_id, examId, examType.id, examType.name, examType.price, examType.price]);

            await pool.query(`
                INSERT INTO payments (
                    invoice_id, amount, method, processed_by, cashier_shift_id,
                    receipt_number, payment_reference, transaction_date, business_date, branch_id, currency_code
                ) VALUES ($1, $2, $3, $4, $5::uuid, $6, $7, $8, $9, $10, 'EGP');
            `, [
                invRes.rows[0].invoice_id, examType.price,
                randomElement(['Cash', 'Card']), cashier?.id || receptionist.id,
                cashierShifts.yesterdayShiftId || null, `REC-${orderNum}`, `PAY-${orderNum}`,
                endTime, histDateStr, defaultBranchId
            ]);

            finalizedExams.push({
                examId, appointmentId: apptId, patientId: patient,
                modalityId: modality.id, examTypeId: examType.id,
                examTypeName: examType.name, amount: examType.price,
                invoiceId: invRes.rows[0].invoice_id, createdById: receptionist.id,
                radiologistId: radiologist.id, referringDoctorId: referringDoc?.id || null
            });
        } catch (err) {
            // Skip conflict
        }
    }

    console.log(`   ✓ Completed ${finalizedExams.length} finalized examinations and clinical workflows.`);
    return finalizedExams;
}

async function seedInsuranceNetwork(patientIds, examTypes, userIds, finalizedExams) {
    console.log('\n🛡️ Seeding Insurance Network (Providers, Contracts, Approvals, Claims)...');
    const insuranceStaff = userIds.find(u => u.role === 'Insurance_Staff') || userIds.find(u => u.role === 'Admin');

    const providers = [
        { name: 'شركة النيل للرعاية والتأمين الصحي', payer: 'NHI-EGY', phone: '0226901111', email: 'claims@nilehealth.eg' },
        { name: 'شركة القاهرة للتأمين الطبي التخصصي', payer: 'CMA-EGY', phone: '0226902222', email: 'approvals@cairomedical.eg' },
        { name: 'مجموعة دلتا كير للخدمات الطبية', payer: 'DCP-EGY', phone: '0226903333', email: 'support@deltacare.eg' },
        { name: 'ميدي شيلد مصر للرعاية الشاملة', payer: 'MSE-EGY', phone: '0226904444', email: 'operations@medishield.eg' },
        { name: 'يونيتي لإدارة برامج التأمين للشركات', payer: 'UCB-EGY', phone: '0226905555', email: 'benefits@unitycorp.eg' },
    ];

    const providerRows = [];
    for (const p of providers) {
        const res = await pool.query(`
            INSERT INTO insurance_providers (
                name, payer_code, phone, email, address, contact_info, is_active, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
            RETURNING provider_id;
        `, [
            p.name, p.payer, p.phone, p.email, randomAddress(),
            JSON.stringify({ phone: p.phone, email: p.email, portal: `https://${p.payer.toLowerCase()}.portal.eg` }),
            `شبكة معتمدة من الدرجة الأولى - فئة (أ)`
        ]);
        providerRows.push({ ...p, id: res.rows[0].provider_id });
    }

    // Contracts
    for (const p of providerRows) {
        await pool.query(`
            INSERT INTO contracts (
                provider_id, entity_name, entity_type, contract_number, commission_percentage,
                start_date, end_date, is_active, coverage_notes
            ) VALUES ($1, $2, 'Insurance', $3, $4, '2023-01-01', '2027-12-31', TRUE, $5);
        `, [
            p.id, p.name, `CTR-${p.payer}-${randomInt(1000, 9999)}`,
            randomInt(10, 20), `عقد سنوي متجدد يشمل الرنين والمقطعية والموجات الصوتية`
        ]);

        // Coverage rules for main exam types
        for (const exam of examTypes.slice(0, 8)) {
            await pool.query(`
                INSERT INTO insurance_coverage_rules (
                    provider_id, exam_type_id, modality_type, coverage_percentage, coverage_ceiling,
                    copay_amount, preauthorization_required, effective_from, effective_to, is_active, notes
                ) VALUES ($1, $2, $3, 80.00, 5000.00, 200.00, $4, '2023-01-01', '2027-12-31', TRUE, $5);
            `, [
                p.id, exam.id, exam.modalityType, exam.contrast,
                `تغطية بنسبة 80% مع نسبة تحمل ثابتة 200 جنيه`
            ]);
        }
    }

    // Patient Policies (first 40 patients)
    const policyMap = new Map();
    for (let i = 0; i < 40; i++) {
        const patientId = patientIds[i];
        const provider = providerRows[i % providerRows.length];
        const policyRes = await pool.query(`
            INSERT INTO patient_insurance_policies (
                patient_id, provider_id, policy_number, member_number, plan_name, holder_name,
                relationship_to_holder, valid_from, valid_to, is_primary, notes
            ) VALUES ($1, $2, $3, $4, $5, 'المشترك الرئيسي', 'Self', '2023-01-01', '2027-12-31', TRUE, 'بطاقة سارية')
            RETURNING policy_id;
        `, [
            patientId, provider.id, `POL-${provider.payer}-${String(i + 1).padStart(5, '0')}`,
            `MEM-${String(i + 1).padStart(6, '0')}`, randomElement(['VIP الذهبية', 'الفئة الفضية الممتازة', 'البلاتينية لكبار العملاء'])
        ]);
        policyMap.set(patientId, { policyId: policyRes.rows[0].policy_id, providerId: provider.id });
    }

    // Approvals and claims from finalized exams
    let approvalCount = 0;
    for (const [idx, exam] of finalizedExams.slice(0, 20).entries()) {
        const policy = policyMap.get(exam.patientId);
        if (!policy) continue;

        const status = idx % 4 === 0 ? 'Pending' : idx % 4 === 1 ? 'Approved' : idx % 4 === 2 ? 'Approved' : 'Rejected';
        const approvedAmount = status === 'Approved' ? Math.round(exam.amount * 0.8) : 0;

        const appRes = await pool.query(`
            INSERT INTO insurance_approvals (
                patient_id, policy_id, provider_id, appointment_id, exam_id, exam_type_id,
                status, approval_number, requested_amount, approved_amount, rejection_reason,
                expires_at, requested_by, decided_by, decided_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW() + INTERVAL '30 days', $12, $13, NOW())
            RETURNING approval_id;
        `, [
            exam.patientId, policy.policyId, policy.providerId, exam.appointmentId, exam.examId, exam.examTypeId,
            status, status === 'Approved' ? `AUTH-${randomInt(100000, 999999)}` : null,
            exam.amount, approvedAmount, status === 'Rejected' ? 'تجاوز الحد الأقصى للمنفعة السنوية' : null,
            insuranceStaff?.id || null, status !== 'Pending' ? insuranceStaff?.id : null
        ]);

        if (status === 'Approved') {
            await pool.query(`
                INSERT INTO insurance_claims (
                    invoice_id, patient_id, provider_id, policy_id, approval_id,
                    claim_reference_number, status, expected_amount, received_amount,
                    submitted_at, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, 'Submitted', $7, 0, NOW(), $8);
            `, [
                exam.invoiceId, exam.patientId, policy.providerId, policy.policyId, appRes.rows[0].approval_id,
                `CLM-${randomInt(100000, 999999)}`, approvedAmount, insuranceStaff?.id || null
            ]);
        }
        approvalCount++;
    }
    console.log(`   ✓ Seeded ${providerRows.length} insurance payers, 40 policies, and ${approvalCount} prior approval/claim workflows.`);
}

async function seedInventory() {
    console.log('\n📦 Seeding Medical Supplies and Inventory Items...');
    const items = [
        { name: 'صبغة الرنين المغناطيسي (Gadolinium 15ml)', category: 'Contrast Agent', qty: 180, unit: 'vials', min: 40, price: 650 },
        { name: 'صبغة الأشعة المقطعية غير أيونية (Iohexol 350mg 100ml)', category: 'Contrast Agent', qty: 250, unit: 'bottles', min: 60, price: 420 },
        { name: 'سرنجات حاقن آلي مزدوج للرنين (MRI Injector Syringes 2x65ml)', category: 'Medical Supplies', qty: 350, unit: 'sets', min: 80, price: 180 },
        { name: 'سرنجات حاقن آلي للأشعة المقطعية (CT Dual Injector Kit)', category: 'Medical Supplies', qty: 400, unit: 'sets', min: 100, price: 150 },
        { name: 'كانيولا وريدية مقاس 18G خضراء (IV Cannula 18G)', category: 'Medical Supplies', qty: 1500, unit: 'pieces', min: 300, price: 12 },
        { name: 'كانيولا وريدية مقاس 20G وردية (IV Cannula 20G)', category: 'Medical Supplies', qty: 2000, unit: 'pieces', min: 400, price: 12 },
        { name: 'قفازات طبية معقمة مقاس M (Sterile Surgical Gloves)', category: 'PPE', qty: 4500, unit: 'pairs', min: 1000, price: 8 },
        { name: 'أفلام ليزر رقمية مقاس 14x17 (Laser Imaging Films)', category: 'Imaging Supplies', qty: 850, unit: 'sheets', min: 200, price: 45 },
        { name: 'جل موجات صوتية طبي 5 لتر (Medical Ultrasound Gel 5L)', category: 'Imaging Supplies', qty: 45, unit: 'cubitainers', min: 10, price: 220 },
        { name: 'محلول ملحي معقم 0.9% 500ml (Normal Saline)', category: 'Solutions', qty: 600, unit: 'bottles', min: 150, price: 25 },
    ];

    for (const item of items) {
        const isContrast = /contrast/i.test(item.category || '') || /صبغة|contrast/i.test(item.name || '');
        await pool.query(`
            INSERT INTO inventory_items (
                name, category, quantity, unit, min_level, is_contrast_agent
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT DO NOTHING;
        `, [item.name, item.category, item.qty, item.unit, item.min, isContrast]);
    }

    const suppliers = [
        { name: 'شركة الدلتا للتوريدات الطبية والصيدلانية', contact: 'م. سامح فوزي', phone: '01011223344', email: 'orders@deltamed.eg' },
        { name: 'المصرية الدولية للأجهزة ومستلزمات الأشعة', contact: 'د. طارق كامل', phone: '01022334455', email: 'supply@egypt-radiology.eg' },
    ];

    for (const s of suppliers) {
        await pool.query(`
            INSERT INTO suppliers (name, contact_name, phone, email, status)
            VALUES ($1, $2, $3, $4, 'Active')
            ON CONFLICT DO NOTHING;
        `, [s.name, s.contact, s.phone, s.email]);
    }
    console.log(`   ✓ Seeded ${items.length} inventory items and medical suppliers.`);
}

async function seedEquipmentRecords(modalityIds, userIds) {
    console.log('\n🛠️ Seeding Maintenance Contracts & Equipment Records...');
    const tech = userIds.find(u => u.role === 'Technician');

    for (const mod of modalityIds) {
        await pool.query(`
            INSERT INTO service_contracts (
                modality_id, provider_name, contact_info, start_date, end_date, cost, status, notes
            ) VALUES ($1, $2, $3, '2023-01-01', '2026-12-31', 45000.00, 'Active', 'عقد صيانة شامل لقطع الغيار والاستجابة الفورية');
        `, [mod.id, mod.manufacturer, `${mod.manufacturer} Egypt Service: 19999`]);

        await pool.query(`
            INSERT INTO equipment_maintenance (
                modality_id, maintenance_type, scheduled_date, completed_date, performed_by, cost, status, notes
            ) VALUES ($1, 'Calibration & Preventive Maintenance', NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days', $2, 3500.00, 'Completed', 'معايرة دورية شاملة لأنابيب الأشعة والحساسات');
        `, [mod.id, tech?.name || 'Authorized Service Engineer']);
    }
    console.log(`   ✓ Seeded service contracts and calibration records for ${modalityIds.length} modalities.`);
}

async function seedCrmData(userIds, patientIds) {
    console.log('\n📣 Seeding Marketing Campaigns, Patient Segments & CRM Activities...');
    const admin = userIds.find(u => u.role === 'Admin');
    const receptionist = userIds.find(u => u.role === 'Receptionist');
    const creatorId = admin?.id || userIds[0]?.id;

    // 1. Patient Segments
    const segment1Res = await pool.query(`
        INSERT INTO patient_segments (name, description, created_by)
        VALUES ($1, $2, $3)
        RETURNING segment_id;
    `, [
        'مرضى الفحص الدوري والوقائي السنوي',
        'شريحة المرضى الذين يحتاجون متابعة سنوية دورية وفحوصات وقائية',
        creatorId
    ]);
    const segment1Id = segment1Res.rows[0].segment_id;

    const segment2Res = await pool.query(`
        INSERT INTO patient_segments (name, description, created_by)
        VALUES ($1, $2, $3)
        RETURNING segment_id;
    `, [
        'حملة الكشف المبكر عن أورام الثدي وصحة المرأة',
        'السيدات فوق سن الأربعين للمتابعة الدورية بالماموجرام والسونار',
        creatorId
    ]);
    const segment2Id = segment2Res.rows[0].segment_id;

    // Link some patients to segments
    for (let i = 0; i < Math.min(10, patientIds.length); i++) {
        await pool.query(`
            INSERT INTO patient_segment_members (segment_id, patient_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING;
        `, [i % 2 === 0 ? segment1Id : segment2Id, patientIds[i]]);
    }

    // 2. Marketing Campaigns
    const now = new Date();
    const startDate = toIsoDate(now);
    const endDate = toIsoDate(new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000));

    await pool.query(`
        INSERT INTO marketing_campaigns (
            name, message_subject, message_body, target_segment,
            channel, budget, start_date, end_date, created_by, status
        ) VALUES
        ($1, $2, $3, $4, 'SMS', 15000.00, $5, $6, $7, 'Active'),
        ($8, $9, $10, $11, 'WhatsApp', 25000.00, $5, $6, $7, 'Active');
    `, [
        'حملة الكشف المبكر والوقاية من أورام الثدي',
        'فحص الماموجرام الدوري المتطور ثلاثي الأبعاد',
        'يسر مركز فيارا للأشعة دعوتكم للاستفادة من باقة الفحص الدوري للكشف المبكر مع استشارة مجانية.',
        segment2Id, startDate, endDate, creatorId,
        'الفحص الشامل لسلامة العمود الفقري والرنين المغناطيسي',
        'عرض الفحص الشامل للفقرات القطنية والعنقية بالرنين 3T',
        'احصل على تقرير تشخيصي متكامل وأحدث تقنيات التصوير بالرنين المغناطيسي بمركز فيارا.',
        segment1Id
    ]);

    // 3. CRM Activities
    if (patientIds.length > 0 && receptionist) {
        await pool.query(`
            INSERT INTO crm_activities (patient_id, assigned_to, activity_type, due_date, notes, status)
            VALUES
            ($1, $2, 'Follow-up Call', NOW() + INTERVAL '1 day', 'متابعة رضا المريض بعد إجراء فحص الرنين والتأكد من استلام التقرير', 'Pending'),
            ($3, $2, 'Patient Reminder', NOW() + INTERVAL '3 days', 'تذكير بموعد فحص المتابعة الدورية للغدة الدرقية بالسونار', 'Pending');
        `, [patientIds[0], receptionist.id, patientIds[1] || patientIds[0]]);
    }

    console.log('   ✓ Seeded marketing campaigns, patient segments, and CRM activities.');
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🚀 VIARA Integrated Database Seeder (Clinical & Operational)');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('⚙️  Connecting to:', connectionString.replace(/:[^:@]+@/, ':***@'));

    try {
        await clearDatabase();

        const { userIds, userMap } = await seedUsers();
        await seedEmployeeProfilesAndStaff(userIds);
        const roomMap = await seedRooms();
        const modalityIds = await seedModalities(roomMap);
        const examTypes = await seedExaminationTypes(modalityIds);
        const referringDoctors = await seedReferringDoctors(userIds);
        const patientIds = await seedPatients(150);
        await seedWaitingRoomAnnouncements(userIds);
        await seedShiftsAndAttendance(userIds, roomMap);
        const cashierShifts = await seedCashierShifts(userIds);
        const finalizedExams = await seedAppointmentsAndExams(patientIds, modalityIds, examTypes, userIds, referringDoctors, roomMap, cashierShifts);
        await seedInsuranceNetwork(patientIds, examTypes, userIds, finalizedExams);
        await seedInventory();
        await seedEquipmentRecords(modalityIds, userIds);
        await seedCrmData(userIds, patientIds);

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('✅ Database Seeding Completed Successfully with High Fidelity!');
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('📊 Summary of Seeded Data:');
        console.log(`   • ${userIds.length} Staff Users (All roles: Admin, Reception, Cashier, Doctor, Nurse, Tech)`);
        console.log(`   • ${Object.keys(roomMap).length} Clinical Rooms (Imaging Wings, Support, Prep, Recovery)`);
        console.log(`   • ${modalityIds.length} Imaging Modalities (Linked to Rooms with active DICOM AE titles)`);
        console.log(`   • ${examTypes.length} Standardized Examination Procedures`);
        console.log(`   • ${referringDoctors.length} Referring Physicians`);
        console.log(`   • ${patientIds.length} Encrypted Patient Profiles (AES-GCM v2)`);
        console.log(`   • 14-day Shift Schedules linked to Rooms with Live On-Duty Attendance`);
        console.log(`   • Today Live Queue (16 cases across Scheduled, Waiting, Prep, Scanning, Reporting, Finalized)`);
        console.log(`   • ${finalizedExams.length} Historical Examinations with Signed Reports & Payments`);
        console.log(`   • Waiting Room Display Announcements & Live Callout Integration`);
        console.log(`   • Medical Consumables Inventory, Contracts & Prior Approvals`);
        console.log(`\n🔑 Test Credentials: All users password is "${seedPassword}"`);
        console.log('═══════════════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('\n❌ Seeding Failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
