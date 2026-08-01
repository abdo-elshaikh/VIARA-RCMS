const calculateCoverage = async (db, {
    providerId,
    examTypeId,
    modalityType,
    amount
}) => {
    if (!providerId || !amount) {
        return {
            coverageAmount: 0,
            patientAmount: Number(amount || 0),
            preauthorizationRequired: false,
            rule: null
        };
    }

    const result = await db.query(`
        SELECT *
        FROM insurance_coverage_rules
        WHERE provider_id = $1
          AND is_active = true
          AND (exam_type_id = $2 OR exam_type_id IS NULL)
          AND (modality_type = $3 OR modality_type IS NULL)
          AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
          AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
        ORDER BY
          CASE WHEN exam_type_id = $2 THEN 1 ELSE 2 END,
          CASE WHEN modality_type = $3 THEN 1 ELSE 2 END,
          created_at DESC
        LIMIT 1
    `, [providerId, examTypeId || null, modalityType || null]);

    const rule = result.rows[0] || null;
    if (!rule) {
        return {
            coverageAmount: 0,
            patientAmount: Number(amount || 0),
            preauthorizationRequired: false,
            rule: null
        };
    }

    const gross = Number(amount || 0);
    const percentCoverage = gross * (Number(rule.coverage_percentage || 0) / 100);
    const cappedCoverage = rule.coverage_ceiling ? Math.min(percentCoverage, Number(rule.coverage_ceiling)) : percentCoverage;
    const coverageAmount = Math.max(0, cappedCoverage - Number(rule.copay_amount || 0));

    return {
        coverageAmount,
        patientAmount: Math.max(0, gross - coverageAmount),
        preauthorizationRequired: Boolean(rule.preauthorization_required),
        rule
    };
};

module.exports = { calculateCoverage };
