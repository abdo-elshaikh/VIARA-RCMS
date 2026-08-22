const Decimal = require('decimal.js');

const roundMoney = (value) => new Decimal(value || 0)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

const calculateCoverage = async (db, {
    providerId,
    contractId,
    policyId,
    examTypeId,
    modalityType,
    amount,
    serviceDate
}) => {
    if (!providerId || !amount) {
        return {
            coverageAmount: 0,
            patientAmount: Number(amount || 0),
            preauthorizationRequired: false,
            rule: null
        };
    }

    const calculationDate = serviceDate || new Date().toISOString().slice(0, 10);
    if (policyId) {
        const policyResult = await db.query(`
            SELECT provider_id
            FROM patient_insurance_policies
            WHERE policy_id = $1
              AND (valid_from IS NULL OR valid_from <= $2::date)
              AND (valid_to IS NULL OR valid_to >= $2::date)
        `, [policyId, calculationDate]);
        if (!policyResult.rows.length || policyResult.rows[0].provider_id !== providerId) {
            return {
                coverageAmount: 0,
                patientAmount: roundMoney(amount).toNumber(),
                preauthorizationRequired: false,
                rule: null
            };
        }
    }

    const result = await db.query(`
        SELECT *
        FROM insurance_coverage_rules
        WHERE provider_id = $1
          AND is_active = true
          AND contract_id IS NOT DISTINCT FROM $2::uuid
          AND (exam_type_id = $3 OR exam_type_id IS NULL)
          AND (modality_type = $4 OR modality_type IS NULL)
          AND (effective_from IS NULL OR effective_from <= $5::date)
          AND (effective_to IS NULL OR effective_to >= $5::date)
        ORDER BY
          CASE WHEN exam_type_id = $3 THEN 1 ELSE 2 END,
          CASE WHEN modality_type = $4 THEN 1 ELSE 2 END,
          created_at DESC
        LIMIT 1
    `, [providerId, contractId || null, examTypeId || null, modalityType || null, calculationDate]);

    const rule = result.rows[0] || null;
    if (!rule) {
        return {
            coverageAmount: 0,
            patientAmount: Number(amount || 0),
            preauthorizationRequired: false,
            rule: null
        };
    }

    const gross = roundMoney(amount);
    const percentCoverage = gross.mul(rule.coverage_percentage || 0).div(100);
    const cappedCoverage = rule.coverage_ceiling !== null && rule.coverage_ceiling !== undefined
        ? Decimal.min(percentCoverage, new Decimal(rule.coverage_ceiling))
        : percentCoverage;
    const coverageAmount = Decimal.max(0, cappedCoverage.minus(rule.copay_amount || 0))
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const patientAmount = Decimal.max(0, gross.minus(coverageAmount))
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return {
        coverageAmount: coverageAmount.toNumber(),
        patientAmount: patientAmount.toNumber(),
        preauthorizationRequired: Boolean(rule.preauthorization_required),
        rule
    };
};

module.exports = { calculateCoverage };
