// Shared configuration, delivery options, and presentational design tokens for the
// report editor. Extracted from ReportEditorPage.jsx to keep that file focused on
// data fetching, state, and composition.

export const SECTION_CONFIG = [
    {
        key: 'clinicalHistory',
        rows: 4,
        maxLength: 5000,
        icon: 'Info',
        collapsible: true
    },
    {
        key: 'technique',
        rows: 4,
        maxLength: 5000,
        icon: 'Monitor',
        collapsible: true
    },
    {
        key: 'findings',
        rows: 12,
        maxLength: 10000,
        required: true,
        icon: 'FileText'
    },
    {
        key: 'impression',
        rows: 7,
        maxLength: 5000,
        required: true,
        icon: 'ClipboardCheck'
    },
    {
        key: 'recommendations',
        rows: 4,
        maxLength: 5000,
        icon: 'CheckCircle2',
        collapsible: true
    }
];

export const WORKFLOW = ['Draft', 'Typed', 'Reviewed', 'Approved', 'Finalized'];
const EDITABLE_REPORT_STATUSES = WORKFLOW.slice(0, -1);

export const getNextReportStatus = (status = 'Draft') => {
    const currentIndex = EDITABLE_REPORT_STATUSES.indexOf(status);
    if (currentIndex < 0 || currentIndex >= EDITABLE_REPORT_STATUSES.length - 1) {
        return null;
    }
    return EDITABLE_REPORT_STATUSES[currentIndex + 1];
};

export const getReportStatusForSave = (status = 'Draft') =>
    status === 'Draft' || !EDITABLE_REPORT_STATUSES.includes(status)
        ? 'Typed'
        : status;
export const CONTACT_DELIVERY_METHODS = ['Email', 'SMS Link', 'WhatsApp Link'];
export const DEFAULT_DELIVERY_METHODS = [
    'Patient Portal',
    'Email',
    'SMS Link',
    'WhatsApp Link',
    'Printed'
];

export const BUILT_IN_REPORT_TEMPLATES = [
    {
        template_id: 'builtin:ct-head',
        name: 'CT Head - Non Contrast',
        modality_type: 'CT',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Axial non-contrast CT images of the brain were obtained with multiplanar reformats.',
        findings: 'No acute intracranial hemorrhage, mass effect, or midline shift. Gray-white matter differentiation is preserved. Ventricles and basal cisterns are normal in size and configuration. No extra-axial collection. Calvarium is intact. Visualized paranasal sinuses and mastoid air cells are clear.',
        impression: 'No acute intracranial abnormality.',
        recommendations: ''
    },
    {
        template_id: 'builtin:ct-chest-contrast',
        name: 'CT Chest - Contrast',
        modality_type: 'CT',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Contrast-enhanced CT of the chest was performed with axial acquisition and coronal/sagittal reformats.',
        findings: 'Lungs are clear without focal consolidation, suspicious pulmonary nodule, pleural effusion, or pneumothorax. Central airways are patent. No enlarged mediastinal, hilar, or axillary lymph nodes. Heart size is within normal limits. Thoracic aorta and central pulmonary arteries are normal in caliber. No acute osseous abnormality on provided images.',
        impression: 'No acute intrathoracic abnormality.',
        recommendations: ''
    },
    {
        template_id: 'builtin:ct-abdomen-pelvis',
        name: 'CT Abdomen/Pelvis - Contrast',
        modality_type: 'CT',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Contrast-enhanced CT of the abdomen and pelvis was performed with multiplanar reformats.',
        findings: 'Liver, gallbladder, spleen, pancreas, adrenal glands, and kidneys are unremarkable. No hydronephrosis. Bowel is normal in caliber without obstruction or focal inflammatory change. Appendix is not enlarged. No free air, free fluid, or pathologically enlarged lymph nodes. Urinary bladder is unremarkable. No acute osseous abnormality.',
        impression: 'No acute abdominopelvic abnormality.',
        recommendations: ''
    },
    {
        template_id: 'builtin:cta-pulmonary',
        name: 'CTA Pulmonary Arteries',
        modality_type: 'CT',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'CT pulmonary angiography was performed after intravenous contrast administration with multiplanar and MIP reformats.',
        findings: 'Pulmonary arterial opacification is diagnostic. No filling defect is identified within the central, lobar, segmental, or visualized subsegmental pulmonary arteries. No right heart strain. Lungs are clear without pleural effusion or pneumothorax. No enlarged thoracic lymph nodes.',
        impression: 'No evidence of pulmonary embolism. No acute cardiopulmonary abnormality.',
        recommendations: ''
    },
    {
        template_id: 'builtin:ct-sinus',
        name: 'CT Paranasal Sinuses',
        modality_type: 'CT',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Thin-section non-contrast CT images of the paranasal sinuses were obtained with coronal and sagittal reformats.',
        findings: 'Paranasal sinuses are well aerated without significant mucosal thickening or air-fluid level. Ostiomeatal complexes are patent. Nasal septum is midline or mildly deviated without acute osseous abnormality. Visualized orbits and skull base are unremarkable on provided images.',
        impression: 'No significant inflammatory sinus disease.',
        recommendations: ''
    },
    {
        template_id: 'builtin:ct-cervical-spine',
        name: 'CT Cervical Spine',
        modality_type: 'CT',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Non-contrast CT of the cervical spine was performed with multiplanar reformats.',
        findings: 'Cervical alignment is maintained. Vertebral body heights are preserved. No acute fracture or traumatic subluxation. Craniocervical and atlantoaxial alignment are maintained. No prevertebral soft tissue swelling. Mild multilevel degenerative spondylosis without high-grade osseous canal stenosis.',
        impression: 'No acute cervical spine fracture or traumatic malalignment.',
        recommendations: ''
    },
    {
        template_id: 'builtin:ct-kub-stone',
        name: 'CT KUB - Stone Protocol',
        modality_type: 'CT',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Non-contrast CT of the abdomen and pelvis was performed using renal stone protocol with multiplanar reformats.',
        findings: 'No renal, ureteric, or bladder calculus is identified. No hydronephrosis or hydroureter. Kidneys are normal in size and contour on non-contrast images. Bowel is normal in caliber. No free air, free fluid, or acute osseous abnormality.',
        impression: 'No urinary tract calculus or obstructive uropathy.',
        recommendations: ''
    },
    {
        template_id: 'builtin:mri-brain',
        name: 'MRI Brain - Routine',
        modality_type: 'MRI',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Multiplanar multisequence MRI of the brain was performed without and/or with contrast as clinically indicated.',
        findings: 'No acute infarct, intracranial hemorrhage, mass effect, or hydrocephalus. Brain parenchymal signal is within expected limits for age. No extra-axial collection. Major intracranial flow voids are preserved. Orbits, paranasal sinuses, and mastoid air cells are unremarkable on provided images.',
        impression: 'No acute intracranial abnormality.',
        recommendations: ''
    },
    {
        template_id: 'builtin:mri-lumbar',
        name: 'MRI Lumbar Spine',
        modality_type: 'MRI',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Multiplanar multisequence MRI of the lumbar spine was performed without contrast.',
        findings: 'Lumbar alignment is maintained. Vertebral body heights are preserved. No suspicious marrow signal abnormality. Conus terminates at a normal level. Mild multilevel degenerative disc desiccation/facet arthropathy without high-grade spinal canal stenosis or neural foraminal narrowing. No paraspinal soft tissue abnormality.',
        impression: 'Mild lumbar spondylosis without high-grade canal or foraminal stenosis.',
        recommendations: 'Correlate clinically. Consider targeted level description if symptoms localize.'
    },
    {
        template_id: 'builtin:mri-knee',
        name: 'MRI Knee',
        modality_type: 'MRI',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Multiplanar multisequence MRI of the knee was performed without contrast.',
        findings: 'Menisci are intact. ACL, PCL, MCL, and lateral collateral ligament complex are intact. Extensor mechanism is intact. No acute fracture or osteochondral defect. Articular cartilage is preserved. No significant joint effusion or Baker cyst. Periarticular soft tissues are unremarkable.',
        impression: 'No internal derangement identified.',
        recommendations: ''
    },
    {
        template_id: 'builtin:mri-cervical-spine',
        name: 'MRI Cervical Spine',
        modality_type: 'MRI',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Multiplanar multisequence MRI of the cervical spine was performed without contrast.',
        findings: 'Cervical alignment is maintained. Vertebral body heights are preserved. No suspicious marrow signal abnormality. Cervical cord signal and caliber are normal. Mild multilevel disc osteophyte complex and uncovertebral/facet arthropathy without high-grade spinal canal stenosis or cord compression. No prevertebral soft tissue abnormality.',
        impression: 'Mild cervical spondylosis without high-grade canal stenosis or cord signal abnormality.',
        recommendations: 'Correlate with radicular symptoms and specify symptomatic levels if clinically indicated.'
    },
    {
        template_id: 'builtin:mri-shoulder',
        name: 'MRI Shoulder',
        modality_type: 'MRI',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Multiplanar multisequence MRI of the shoulder was performed without contrast.',
        findings: 'Rotator cuff tendons are intact without full-thickness tear. Long head biceps tendon is normally positioned. Labrum is grossly intact on non-arthrographic images. No acute fracture or osteonecrosis. Mild acromioclavicular degenerative change. No significant glenohumeral joint effusion or subacromial-subdeltoid bursitis.',
        impression: 'No full-thickness rotator cuff tear. Mild acromioclavicular osteoarthrosis.',
        recommendations: ''
    },
    {
        template_id: 'builtin:mri-prostate',
        name: 'MRI Prostate',
        modality_type: 'MRI',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Multiparametric MRI of the prostate was performed including T2, diffusion-weighted, ADC, and dynamic contrast-enhanced sequences as per protocol.',
        findings: 'Prostate volume should be measured and documented. No focal lesion with restricted diffusion or suspicious enhancement is identified in the peripheral or transition zone on provided images. Seminal vesicles are unremarkable. No pelvic lymphadenopathy or suspicious osseous lesion.',
        impression: 'No suspicious prostate lesion identified. PI-RADS 1-2, depending on final sequence assessment.',
        recommendations: 'Correlate with PSA, digital rectal examination, and prior biopsy history.'
    },
    {
        template_id: 'builtin:mri-mrcp',
        name: 'MRI Abdomen / MRCP',
        modality_type: 'MRI',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Multiplanar multisequence MRI of the abdomen with MRCP images was performed without and/or with intravenous contrast as clinically indicated.',
        findings: 'Liver is normal in morphology without focal suspicious lesion. Gallbladder is unremarkable. No intrahepatic or extrahepatic biliary duct dilatation. Common bile duct is normal caliber without choledocholithiasis. Pancreas, spleen, adrenal glands, and kidneys are unremarkable. No ascites or upper abdominal lymphadenopathy.',
        impression: 'No biliary duct dilatation or choledocholithiasis. No acute upper abdominal MRI abnormality.',
        recommendations: ''
    },
    {
        template_id: 'builtin:us-abdomen',
        name: 'Ultrasound Abdomen',
        modality_type: 'Ultrasound',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Real-time grayscale and color Doppler ultrasound of the abdomen was performed.',
        findings: 'Liver demonstrates normal echogenicity without focal lesion. Gallbladder is unremarkable without stones or wall thickening. Common bile duct is not dilated. Pancreas is visualized portions unremarkable. Spleen is normal in size. Kidneys are normal in size and echogenicity without hydronephrosis. No free fluid.',
        impression: 'Unremarkable abdominal ultrasound.',
        recommendations: ''
    },
    {
        template_id: 'builtin:us-pelvis',
        name: 'Ultrasound Pelvis',
        modality_type: 'Ultrasound',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Transabdominal and/or transvaginal pelvic ultrasound was performed with Doppler evaluation as indicated.',
        findings: 'Uterus is normal in size and echotexture. Endometrium is within expected thickness for clinical context. Ovaries are normal in size and appearance with preserved flow. No adnexal mass or free pelvic fluid.',
        impression: 'No acute pelvic sonographic abnormality.',
        recommendations: ''
    },
    {
        template_id: 'builtin:us-thyroid',
        name: 'Ultrasound Thyroid',
        modality_type: 'Ultrasound',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'High-resolution grayscale and color Doppler ultrasound of the thyroid gland and central neck was performed.',
        findings: 'Thyroid gland is normal in size and echotexture. No suspicious thyroid nodule is identified. No abnormal cervical lymph node is seen in the surveyed central/lateral neck. Vascularity is within normal limits.',
        impression: 'Unremarkable thyroid ultrasound.',
        recommendations: ''
    },
    {
        template_id: 'builtin:us-venous-doppler-leg',
        name: 'Venous Doppler Lower Limb',
        modality_type: 'Ultrasound',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Grayscale, color Doppler, and spectral Doppler ultrasound of the lower extremity deep venous system was performed with compression where applicable.',
        findings: 'Common femoral, femoral, popliteal, and visualized calf veins are patent and compressible with normal color flow and respiratory phasicity. No intraluminal thrombus is identified. No focal fluid collection in the surveyed soft tissues.',
        impression: 'No sonographic evidence of deep venous thrombosis in the examined lower extremity.',
        recommendations: ''
    },
    {
        template_id: 'builtin:us-breast',
        name: 'Ultrasound Breast',
        modality_type: 'Ultrasound',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Targeted grayscale and color Doppler ultrasound of the breast/axilla was performed at the area of clinical or imaging concern.',
        findings: 'No suspicious solid or cystic mass is identified in the targeted area. No architectural distortion or abnormal vascularity. Surveyed axilla demonstrates no morphologically abnormal lymph node.',
        impression: 'No suspicious sonographic abnormality in the targeted area. BI-RADS 1: Negative.',
        recommendations: 'Clinical follow-up is recommended. If there is a persistent palpable concern, management should be based on clinical assessment.'
    },
    {
        template_id: 'builtin:xray-chest',
        name: 'X-ray Chest',
        modality_type: 'X-Ray',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Frontal and lateral chest radiographs were obtained.',
        findings: 'Cardiomediastinal silhouette is within normal size limits. Lungs are clear without focal air-space consolidation, pleural effusion, or pneumothorax. No acute osseous abnormality on these views.',
        impression: 'No acute cardiopulmonary abnormality.',
        recommendations: ''
    },
    {
        template_id: 'builtin:xray-knee',
        name: 'X-ray Knee',
        modality_type: 'X-Ray',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Multiview radiographs of the knee were obtained.',
        findings: 'No acute fracture or dislocation. Alignment is maintained. Joint spaces are preserved. No focal osseous lesion. No significant joint effusion or soft tissue swelling.',
        impression: 'No acute osseous abnormality of the knee.',
        recommendations: ''
    },
    {
        template_id: 'builtin:xray-shoulder',
        name: 'X-ray Shoulder',
        modality_type: 'X-Ray',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Multiview radiographs of the shoulder were obtained.',
        findings: 'No acute fracture or dislocation. Glenohumeral and acromioclavicular alignment are maintained. Joint spaces are preserved or mildly degenerative as appropriate. Visualized hemithorax is unremarkable on provided views.',
        impression: 'No acute osseous abnormality of the shoulder.',
        recommendations: ''
    },
    {
        template_id: 'builtin:xray-ankle',
        name: 'X-ray Ankle',
        modality_type: 'X-Ray',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Multiview radiographs of the ankle were obtained.',
        findings: 'No acute fracture or dislocation. Ankle mortise is congruent. Joint spaces are preserved. No focal osseous lesion. Soft tissues are unremarkable without significant swelling.',
        impression: 'No acute osseous abnormality of the ankle.',
        recommendations: ''
    },
    {
        template_id: 'builtin:xray-pelvis-hip',
        name: 'X-ray Pelvis/Hip',
        modality_type: 'X-Ray',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'AP pelvis and dedicated hip radiographs were obtained.',
        findings: 'No acute fracture or dislocation. Hip joint alignment is maintained. Mild degenerative change may be present without advanced joint space loss. Sacroiliac joints and pubic symphysis are preserved on provided views.',
        impression: 'No acute osseous abnormality of the pelvis/hip.',
        recommendations: ''
    },
    {
        template_id: 'builtin:mammogram-screening',
        name: 'Mammography Screening',
        modality_type: 'Mammography',
        version: 'built-in',
        is_builtin: true,
        clinical_history: 'Screening mammography.',
        technique: 'Bilateral digital mammography with standard craniocaudal and mediolateral oblique views was performed. CAD/tomosynthesis used if available.',
        findings: 'Breast composition: scattered fibroglandular density. No suspicious mass, architectural distortion, or suspicious calcifications are identified in either breast.',
        impression: 'No mammographic evidence of malignancy. BI-RADS 1: Negative.',
        recommendations: 'Routine annual screening mammography is recommended unless clinically indicated otherwise.'
    },
    {
        template_id: 'builtin:mammogram-diagnostic',
        name: 'Mammography Diagnostic',
        modality_type: 'Mammography',
        version: 'built-in',
        is_builtin: true,
        clinical_history: 'Diagnostic mammography for focal symptom or callback evaluation.',
        technique: 'Diagnostic digital mammography with targeted views/tomosynthesis as indicated. Targeted ultrasound may be performed separately if clinically required.',
        findings: 'No suspicious mass, architectural distortion, or suspicious calcifications are identified in the area of concern. Findings should be correlated with any targeted ultrasound and clinical examination.',
        impression: 'No mammographic evidence of malignancy in the evaluated area. BI-RADS category should be assigned based on final imaging correlation.',
        recommendations: 'Clinical follow-up is recommended. Routine screening interval unless otherwise indicated.'
    },
    {
        template_id: 'builtin:dexa-bone-density',
        name: 'DEXA Bone Density',
        modality_type: 'DEXA',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Dual-energy X-ray absorptiometry was performed at the lumbar spine and hip according to standard protocol.',
        findings: 'Bone mineral density values and T-scores should be reported for the lumbar spine, femoral neck, and total hip. Lowest T-score determines diagnostic category. FRAX risk should be included when available and appropriate.',
        impression: 'Bone mineral density category should be assigned according to WHO criteria based on the lowest valid T-score.',
        recommendations: 'Correlate with fracture history, risk factors, calcium/vitamin D status, and treatment guidelines.'
    },
    {
        template_id: 'builtin:fluoro-barium-swallow',
        name: 'Fluoroscopy Barium Swallow',
        modality_type: 'Fluoroscopy',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Fluoroscopic evaluation of the pharynx and esophagus was performed after oral contrast administration.',
        findings: 'Swallowing mechanism is coordinated without aspiration during the examination. Esophageal caliber and mucosal contour are within normal limits. No fixed stricture, obstructing lesion, or hiatal hernia is identified. Contrast passes into the stomach without delay.',
        impression: 'Unremarkable barium swallow examination.',
        recommendations: ''
    },
    {
        template_id: 'builtin:pet-ct-oncology',
        name: 'PET/CT Oncology',
        modality_type: 'PET-CT',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'FDG PET/CT was performed from skull base to mid-thigh following radiotracer administration. Low-dose CT was obtained for attenuation correction and anatomic localization.',
        findings: 'Physiologic tracer distribution is seen. No focal abnormal hypermetabolic lesion is identified to suggest active malignancy on this examination. No hypermetabolic lymphadenopathy. Low-dose CT images show no acute abnormality within their limitations.',
        impression: 'No FDG-avid malignancy identified on this PET/CT examination.',
        recommendations: 'Correlate with prior imaging, pathology, and treatment history.'
    },
    {
        template_id: 'builtin:nm-bone-scan',
        name: 'Nuclear Medicine Bone Scan',
        modality_type: 'Nuclear Medicine',
        version: 'built-in',
        is_builtin: true,
        clinical_history: '',
        technique: 'Whole-body planar bone scintigraphy was performed after intravenous radiotracer administration. Additional spot images were obtained as needed.',
        findings: 'Physiologic radiotracer uptake is seen in the skeleton and urinary tract. No focal abnormal uptake pattern suspicious for osseous metastatic disease or acute osseous injury is identified. Mild degenerative uptake may be present in typical locations.',
        impression: 'No scintigraphic evidence of osseous metastatic disease.',
        recommendations: ''
    }
];

// Presentational design tokens (kept here so both the page and the extracted UI
// components share one source of truth).
export const PANEL =
    'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)]';
export const PANEL_HEADER =
    'flex items-center justify-between gap-3 border-b border-slate-100/80 px-5 py-3.5 dark:border-[var(--VIARA-line)]';
export const PANEL_TITLE =
    'text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300';
export const SOFT_BUTTON =
    'inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface-raised)] dark:text-slate-300 dark:hover:bg-[var(--VIARA-surface-hover)] dark:hover:text-teal-300';
export const PRIMARY_BUTTON =
    'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-teal-700 px-5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500 dark:focus-visible:ring-offset-[var(--VIARA-canvas)]';
export const FLOATING_FOOTER =
    'fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 py-2.5 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-surface)]/95 sm:inset-x-4 sm:bottom-4 sm:rounded-2xl sm:border lg:inset-x-6 print:hidden';
