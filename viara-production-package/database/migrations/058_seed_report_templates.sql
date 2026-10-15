-- Seed practical default report templates for common radiology workflows.
-- Templates are modality-scoped and exam-type agnostic so they are immediately
-- available even when examination catalogs differ between centers.

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
        'CT Head - Non Contrast',
        'CT',
        NULL,
        'Axial non-contrast CT images of the brain were obtained with multiplanar reformats.',
        'No acute intracranial hemorrhage, mass effect, or midline shift. Gray-white matter differentiation is preserved. Ventricles and basal cisterns are normal in size and configuration. No extra-axial collection. Calvarium is intact. Visualized paranasal sinuses and mastoid air cells are clear.',
        'No acute intracranial abnormality.',
        NULL,
        TRUE
    ),
    (
        'CT Chest - Contrast',
        'CT',
        NULL,
        'Contrast-enhanced CT of the chest was performed with axial acquisition and coronal/sagittal reformats.',
        'Lungs are clear without focal consolidation, suspicious pulmonary nodule, pleural effusion, or pneumothorax. Central airways are patent. No enlarged mediastinal, hilar, or axillary lymph nodes. Heart size is within normal limits. Thoracic aorta and central pulmonary arteries are normal in caliber. No acute osseous abnormality on provided images.',
        'No acute intrathoracic abnormality.',
        NULL,
        FALSE
    ),
    (
        'CT Abdomen/Pelvis - Contrast',
        'CT',
        NULL,
        'Contrast-enhanced CT of the abdomen and pelvis was performed with multiplanar reformats.',
        'Liver, gallbladder, spleen, pancreas, adrenal glands, and kidneys are unremarkable. No hydronephrosis. Bowel is normal in caliber without obstruction or focal inflammatory change. Appendix is not enlarged. No free air, free fluid, or pathologically enlarged lymph nodes. Urinary bladder is unremarkable. No acute osseous abnormality.',
        'No acute abdominopelvic abnormality.',
        NULL,
        FALSE
    ),
    (
        'CTA Pulmonary Arteries',
        'CT',
        NULL,
        'CT pulmonary angiography was performed after intravenous contrast administration with multiplanar and MIP reformats.',
        'Pulmonary arterial opacification is diagnostic. No filling defect is identified within the central, lobar, segmental, or visualized subsegmental pulmonary arteries. No right heart strain. Lungs are clear without pleural effusion or pneumothorax. No enlarged thoracic lymph nodes.',
        'No evidence of pulmonary embolism. No acute cardiopulmonary abnormality.',
        NULL,
        FALSE
    ),
    (
        'MRI Brain - Routine',
        'MRI',
        NULL,
        'Multiplanar multisequence MRI of the brain was performed without and/or with contrast as clinically indicated.',
        'No acute infarct, intracranial hemorrhage, mass effect, or hydrocephalus. Brain parenchymal signal is within expected limits for age. No extra-axial collection. Major intracranial flow voids are preserved. Orbits, paranasal sinuses, and mastoid air cells are unremarkable on provided images.',
        'No acute intracranial abnormality.',
        NULL,
        TRUE
    ),
    (
        'MRI Lumbar Spine',
        'MRI',
        NULL,
        'Multiplanar multisequence MRI of the lumbar spine was performed without contrast.',
        'Lumbar alignment is maintained. Vertebral body heights are preserved. No suspicious marrow signal abnormality. Conus terminates at a normal level. Mild multilevel degenerative disc desiccation/facet arthropathy without high-grade spinal canal stenosis or neural foraminal narrowing. No paraspinal soft tissue abnormality.',
        'Mild lumbar spondylosis without high-grade canal or foraminal stenosis.',
        'Correlate clinically. Consider targeted level description if symptoms localize.',
        FALSE
    ),
    (
        'MRI Knee',
        'MRI',
        NULL,
        'Multiplanar multisequence MRI of the knee was performed without contrast.',
        'Menisci are intact. ACL, PCL, MCL, and lateral collateral ligament complex are intact. Extensor mechanism is intact. No acute fracture or osteochondral defect. Articular cartilage is preserved. No significant joint effusion or Baker cyst. Periarticular soft tissues are unremarkable.',
        'No internal derangement identified.',
        NULL,
        FALSE
    ),
    (
        'Ultrasound Abdomen',
        'Ultrasound',
        NULL,
        'Real-time grayscale and color Doppler ultrasound of the abdomen was performed.',
        'Liver demonstrates normal echogenicity without focal lesion. Gallbladder is unremarkable without stones or wall thickening. Common bile duct is not dilated. Pancreas is visualized portions unremarkable. Spleen is normal in size. Kidneys are normal in size and echogenicity without hydronephrosis. No free fluid.',
        'Unremarkable abdominal ultrasound.',
        NULL,
        TRUE
    ),
    (
        'Ultrasound Pelvis',
        'Ultrasound',
        NULL,
        'Transabdominal and/or transvaginal pelvic ultrasound was performed with Doppler evaluation as indicated.',
        'Uterus is normal in size and echotexture. Endometrium is within expected thickness for clinical context. Ovaries are normal in size and appearance with preserved flow. No adnexal mass or free pelvic fluid.',
        'No acute pelvic sonographic abnormality.',
        NULL,
        FALSE
    ),
    (
        'X-ray Chest',
        'X-Ray',
        NULL,
        'Frontal and lateral chest radiographs were obtained.',
        'Cardiomediastinal silhouette is within normal size limits. Lungs are clear without focal air-space consolidation, pleural effusion, or pneumothorax. No acute osseous abnormality on these views.',
        'No acute cardiopulmonary abnormality.',
        NULL,
        TRUE
    ),
    (
        'X-ray Knee',
        'X-Ray',
        NULL,
        'Multiview radiographs of the knee were obtained.',
        'No acute fracture or dislocation. Alignment is maintained. Joint spaces are preserved. No focal osseous lesion. No significant joint effusion or soft tissue swelling.',
        'No acute osseous abnormality of the knee.',
        NULL,
        FALSE
    ),
    (
        'Mammography Screening',
        'Mammography',
        'Screening mammography.',
        'Bilateral digital mammography with standard craniocaudal and mediolateral oblique views was performed. CAD/tomosynthesis used if available.',
        'Breast composition: scattered fibroglandular density. No suspicious mass, architectural distortion, or suspicious calcifications are identified in either breast.',
        'No mammographic evidence of malignancy. BI-RADS 1: Negative.',
        'Routine annual screening mammography is recommended unless clinically indicated otherwise.',
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
