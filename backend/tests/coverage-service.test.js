const { calculateCoverage } = require('../src/services/coverageService');

describe('insurance coverage calculation', () => {
    test('scopes the rule to provider, contract, policy validity, and service date', async () => {
        const db = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [{ provider_id: 'provider-1' }] })
                .mockResolvedValueOnce({ rows: [{
                    coverage_percentage: '80.00',
                    coverage_ceiling: '1000.00',
                    copay_amount: '25.00',
                    preauthorization_required: true
                }] })
        };

        const result = await calculateCoverage(db, {
            providerId: 'provider-1',
            contractId: 'contract-1',
            policyId: 'policy-1',
            examTypeId: 'exam-type-1',
            modalityType: 'MRI',
            amount: 123.45,
            serviceDate: '2026-08-21'
        });

        expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining('valid_from'), [
            'policy-1',
            '2026-08-21'
        ]);
        expect(db.query).toHaveBeenNthCalledWith(2, expect.stringContaining('contract_id IS NOT DISTINCT FROM'), [
            'provider-1',
            'contract-1',
            'exam-type-1',
            'MRI',
            '2026-08-21'
        ]);
        expect(result).toMatchObject({
            coverageAmount: 73.76,
            patientAmount: 49.69,
            preauthorizationRequired: true
        });
    });

    test('denies coverage when the selected policy belongs to another provider', async () => {
        const db = {
            query: jest.fn().mockResolvedValueOnce({ rows: [{ provider_id: 'provider-2' }] })
        };

        const result = await calculateCoverage(db, {
            providerId: 'provider-1',
            policyId: 'policy-1',
            amount: 99.999,
            serviceDate: '2026-08-21'
        });

        expect(db.query).toHaveBeenCalledTimes(1);
        expect(result).toEqual({
            coverageAmount: 0,
            patientAmount: 100,
            preauthorizationRequired: false,
            rule: null
        });
    });
});
