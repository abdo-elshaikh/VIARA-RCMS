-- Additional default report templates for broader modality coverage.

WITH seed_templates (
    name,
    modality_type,
    clinical_history,
    technique,
    findings,
    impression,
    recommendations,
    is_default
) AS (
    VALUES
    (
        'CT Paranasal Sinuses',
        'CT',
        NULL,
        'Thin-section non-contrast CT images of the paranasal sinuses were obtained with coronal and sagittal reformats.',
        'Paranasal sinuses are well aerated without significant mucosal thickening or air-fluid level. Ostiomeatal complexes are patent. Nasal septum is midline or mildly deviated without acute osseous abnormality. Visualized orbits and skull base are unremarkable on provided images.',
        'No significant inflammatory sinus disease.',
        NULL,
        FALSE
    ),
    (
        'CT Cervical Spine',
        'CT',
        NULL,
        'Non-contrast CT of the cervical spine was performed with multiplanar reformats.',
        'Cervical alignment is maintained. Vertebral body heights are preserved. No acute fracture or traumatic subluxation. Craniocervical and atlantoaxial alignment are maintained. No prevertebral soft tissue swelling. Mild multilevel degenerative spondylosis without high-grade osseous canal stenosis.',
        'No acute cervical spine fracture or traumatic malalignment.',
        NULL,
        FALSE
    ),
    (
        'CT KUB - Stone Protocol',
        'CT',
        NULL,
        'Non-contrast CT of the abdomen and pelvis was performed using renal stone protocol with multiplanar reformats.',
        'No renal, ureteric, or bladder calculus is identified. No hydronephrosis or hydroureter. Kidneys are normal in size and contour on non-contrast images. Bowel is normal in caliber. No free air, free fluid, or acute osseous abnormality.',
        'No urinary tract calculus or obstructive uropathy.',
        NULL,
        FALSE
    ),
    (
        'MRI Cervical Spine',
        'MRI',
        NULL,
        'Multiplanar multisequence MRI of the cervical spine was performed without contrast.',
        'Cervical alignment is maintained. Vertebral body heights are preserved. No suspicious marrow signal abnormality. Cervical cord signal and caliber are normal. Mild multilevel disc osteophyte complex and uncovertebral/facet arthropathy without high-grade spinal canal stenosis or cord compression. No prevertebral soft tissue abnormality.',
        'Mild cervical spondylosis without high-grade canal stenosis or cord signal abnormality.',
        'Correlate with radicular symptoms and specify symptomatic levels if clinically indicated.',
        FALSE
    ),
    (
        'MRI Shoulder',
        'MRI',
        NULL,
        'Multiplanar multisequence MRI of the shoulder was performed without contrast.',
        'Rotator cuff tendons are intact without full-thickness tear. Long head biceps tendon is normally positioned. Labrum is grossly intact on non-arthrographic images. No acute fracture or osteonecrosis. Mild acromioclavicular degenerative change. No significant glenohumeral joint effusion or subacromial-subdeltoid bursitis.',
        'No full-thickness rotator cuff tear. Mild acromioclavicular osteoarthrosis.',
        NULL,
        FALSE
    ),
    (
        'MRI Prostate',
        'MRI',
        NULL,
        'Multiparametric MRI of the prostate was performed including T2, diffusion-weighted, ADC, and dynamic contrast-enhanced sequences as per protocol.',
        'Prostate volume should be measured and documented. No focal lesion with restricted diffusion or suspicious enhancement is identified in the peripheral or transition zone on provided images. Seminal vesicles are unremarkable. No pelvic lymphadenopathy or suspicious osseous lesion.',
        'No suspicious prostate lesion identified. PI-RADS 1-2, depending on final sequence assessment.',
        'Correlate with PSA, digital rectal examination, and prior biopsy history.',
        FALSE
    ),
    (
        'MRI Abdomen / MRCP',
        'MRI',
        NULL,
        'Multiplanar multisequence MRI of the abdomen with MRCP images was performed without and/or with intravenous contrast as clinically indicated.',
        'Liver is normal in morphology without focal suspicious lesion. Gallbladder is unremarkable. No intrahepatic or extrahepatic biliary duct dilatation. Common bile duct is normal caliber without choledocholithiasis. Pancreas, spleen, adrenal glands, and kidneys are unremarkable. No ascites or upper abdominal lymphadenopathy.',
        'No biliary duct dilatation or choledocholithiasis. No acute upper abdominal MRI abnormality.',
        NULL,
        FALSE
    ),
    (
        'Ultrasound Thyroid',
        'Ultrasound',
        NULL,
        'High-resolution grayscale and color Doppler ultrasound of the thyroid gland and central neck was performed.',
        'Thyroid gland is normal in size and echotexture. No suspicious thyroid nodule is identified. No abnormal cervical lymph node is seen in the surveyed central/lateral neck. Vascularity is within normal limits.',
        'Unremarkable thyroid ultrasound.',
        NULL,
        FALSE
    ),
    (
        'Venous Doppler Lower Limb',
        'Ultrasound',
        NULL,
        'Grayscale, color Doppler, and spectral Doppler ultrasound of the lower extremity deep venous system was performed with compression where applicable.',
        'Common femoral, femoral, popliteal, and visualized calf veins are patent and compressible with normal color flow and respiratory phasicity. No intraluminal thrombus is identified. No focal fluid collection in the surveyed soft tissues.',
        'No sonographic evidence of deep venous thrombosis in the examined lower extremity.',
        NULL,
        FALSE
    ),
    (
        'Ultrasound Breast',
        'Ultrasound',
        NULL,
        'Targeted grayscale and color Doppler ultrasound of the breast/axilla was performed at the area of clinical or imaging concern.',
        'No suspicious solid or cystic mass is identified in the targeted area. No architectural distortion or abnormal vascularity. Surveyed axilla demonstrates no morphologically abnormal lymph node.',
        'No suspicious sonographic abnormality in the targeted area. BI-RADS 1: Negative.',
        'Clinical follow-up is recommended. If there is a persistent palpable concern, management should be based on clinical assessment.',
        FALSE
    ),
    (
        'X-ray Shoulder',
        'X-Ray',
        NULL,
        'Multiview radiographs of the shoulder were obtained.',
        'No acute fracture or dislocation. Glenohumeral and acromioclavicular alignment are maintained. Joint spaces are preserved or mildly degenerative as appropriate. Visualized hemithorax is unremarkable on provided views.',
        'No acute osseous abnormality of the shoulder.',
        NULL,
        FALSE
    ),
    (
        'X-ray Ankle',
        'X-Ray',
        NULL,
        'Multiview radiographs of the ankle were obtained.',
        'No acute fracture or dislocation. Ankle mortise is congruent. Joint spaces are preserved. No focal osseous lesion. Soft tissues are unremarkable without significant swelling.',
        'No acute osseous abnormality of the ankle.',
        NULL,
        FALSE
    ),
    (
        'X-ray Pelvis/Hip',
        'X-Ray',
        NULL,
        'AP pelvis and dedicated hip radiographs were obtained.',
        'No acute fracture or dislocation. Hip joint alignment is maintained. Mild degenerative change may be present without advanced joint space loss. Sacroiliac joints and pubic symphysis are preserved on provided views.',
        'No acute osseous abnormality of the pelvis/hip.',
        NULL,
        FALSE
    ),
    (
        'Mammography Diagnostic',
        'Mammography',
        'Diagnostic mammography for focal symptom or callback evaluation.',
        'Diagnostic digital mammography with targeted views/tomosynthesis as indicated. Targeted ultrasound may be performed separately if clinically required.',
        'No suspicious mass, architectural distortion, or suspicious calcifications are identified in the area of concern. Findings should be correlated with any targeted ultrasound and clinical examination.',
        'No mammographic evidence of malignancy in the evaluated area. BI-RADS category should be assigned based on final imaging correlation.',
        'Clinical follow-up is recommended. Routine screening interval unless otherwise indicated.',
        FALSE
    ),
    (
        'DEXA Bone Density',
        'DEXA',
        NULL,
        'Dual-energy X-ray absorptiometry was performed at the lumbar spine and hip according to standard protocol.',
        'Bone mineral density values and T-scores should be reported for the lumbar spine, femoral neck, and total hip. Lowest T-score determines diagnostic category. FRAX risk should be included when available and appropriate.',
        'Bone mineral density category should be assigned according to WHO criteria based on the lowest valid T-score.',
        'Correlate with fracture history, risk factors, calcium/vitamin D status, and treatment guidelines.',
        TRUE
    ),
    (
        'Fluoroscopy Barium Swallow',
        'Fluoroscopy',
        NULL,
        'Fluoroscopic evaluation of the pharynx and esophagus was performed after oral contrast administration.',
        'Swallowing mechanism is coordinated without aspiration during the examination. Esophageal caliber and mucosal contour are within normal limits. No fixed stricture, obstructing lesion, or hiatal hernia is identified. Contrast passes into the stomach without delay.',
        'Unremarkable barium swallow examination.',
        NULL,
        TRUE
    ),
    (
        'PET/CT Oncology',
        'PET-CT',
        NULL,
        'FDG PET/CT was performed from skull base to mid-thigh following radiotracer administration. Low-dose CT was obtained for attenuation correction and anatomic localization.',
        'Physiologic tracer distribution is seen. No focal abnormal hypermetabolic lesion is identified to suggest active malignancy on this examination. No hypermetabolic lymphadenopathy. Low-dose CT images show no acute abnormality within their limitations.',
        'No FDG-avid malignancy identified on this PET/CT examination.',
        'Correlate with prior imaging, pathology, and treatment history.',
        TRUE
    ),
    (
        'Nuclear Medicine Bone Scan',
        'Nuclear Medicine',
        NULL,
        'Whole-body planar bone scintigraphy was performed after intravenous radiotracer administration. Additional spot images were obtained as needed.',
        'Physiologic radiotracer uptake is seen in the skeleton and urinary tract. No focal abnormal uptake pattern suspicious for osseous metastatic disease or acute osseous injury is identified. Mild degenerative uptake may be present in typical locations.',
        'No scintigraphic evidence of osseous metastatic disease.',
        'Correlate with radiographs, CT, or MRI if there is focal persistent clinical concern.',
        TRUE
    )
)
INSERT INTO report_templates (
    name,
    modality_type,
    exam_type_id,
    clinical_history,
    technique,
    findings,
    impression,
    recommendations,
    is_default,
    is_active
)
SELECT
    name,
    modality_type,
    NULL,
    clinical_history,
    technique,
    findings,
    impression,
    recommendations,
    is_default,
    TRUE
FROM seed_templates seed
WHERE NOT EXISTS (
    SELECT 1
    FROM report_templates existing
    WHERE existing.name = seed.name
      AND COALESCE(existing.modality_type, '') = COALESCE(seed.modality_type, '')
      AND existing.exam_type_id IS NULL
);
