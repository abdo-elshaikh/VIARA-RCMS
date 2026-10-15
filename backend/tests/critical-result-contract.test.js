const { updateExamReportSchema, acknowledgeCriticalResultSchema } = require('../src/schemas/examSchema');

describe('critical-result API contracts', () => {
    const examId = '00000000-0000-4000-8000-000000000004';

    test('accepts an explicit critical marker during finalization', () => {
        const parsed = updateExamReportSchema.parse({
            examId,
            status: 'Finalized',
            reportStatus: 'Finalized',
            criticalResult: true,
            sections: {
                findings: 'Confirmed acute critical finding.',
                impression: 'Urgent clinical communication required.'
            }
        });

        expect(parsed).toEqual(expect.objectContaining({
            examId,
            status: 'Finalized',
            reportStatus: 'Finalized',
            criticalResult: true
        }));
    });

    test('rejects non-boolean critical markers', () => {
        expect(() => updateExamReportSchema.parse({
            examId,
            criticalResult: 'yes'
        })).toThrow();
    });

    test('bounds acknowledgement notes', () => {
        expect(acknowledgeCriticalResultSchema.parse({ notes: 'Referrer contacted.' }))
            .toEqual({ notes: 'Referrer contacted.' });
        expect(() => acknowledgeCriticalResultSchema.parse({ notes: 'x'.repeat(2001) }))
            .toThrow();
    });
});
