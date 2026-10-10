'use strict';

/**
 * demoSeed.test.js
 * ----------------
 * Tests for the clinical demo dataset service and endpoints.
 */

const { getDemoStatus, seedDemoData, clearDemoData } = require('../src/services/demoSeedService');

describe('demoSeedService', () => {
    let mockPool;
    let mockClient;

    beforeEach(() => {
        mockClient = {
            query: jest.fn(),
            release: jest.fn()
        };

        mockPool = {
            query: jest.fn(),
            connect: jest.fn().mockResolvedValue(mockClient)
        };
    });

    describe('getDemoStatus', () => {
        it('reports not seeded when tables return 0 demo records', async () => {
            mockPool.query
                .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // patients
                .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // appointments
                .mockResolvedValueOnce({ rows: [{ count: 0 }] }); // modalities

            const status = await getDemoStatus(mockPool);
            expect(status.isDemoSeeded).toBe(false);
            expect(status.patientCount).toBe(0);
            expect(status.appointmentCount).toBe(0);
        });

        it('reports seeded when demo records are present', async () => {
            mockPool.query
                .mockResolvedValueOnce({ rows: [{ count: 5 }] }) // patients
                .mockResolvedValueOnce({ rows: [{ count: 5 }] }) // appointments
                .mockResolvedValueOnce({ rows: [{ count: 4 }] }); // modalities

            const status = await getDemoStatus(mockPool);
            expect(status.isDemoSeeded).toBe(true);
            expect(status.patientCount).toBe(5);
            expect(status.appointmentCount).toBe(5);
            expect(status.modalityCount).toBe(4);
        });
    });

    describe('seedDemoData', () => {
        it('skips seeding if demo data already exists', async () => {
            mockPool.query
                .mockResolvedValueOnce({ rows: [{ count: 5 }] })
                .mockResolvedValueOnce({ rows: [{ count: 5 }] })
                .mockResolvedValueOnce({ rows: [{ count: 4 }] });

            const result = await seedDemoData(mockPool);
            expect(result.alreadySeeded).toBe(true);
            expect(result.message).toContain('موجودة بالفعل');
            expect(mockPool.connect).not.toHaveBeenCalled();
        });

        it('seeds rooms, modalities, exam types, patients and appointments in a transaction', async () => {
            // Initial check: not seeded
            mockPool.query
                .mockResolvedValueOnce({ rows: [{ count: 0 }] })
                .mockResolvedValueOnce({ rows: [{ count: 0 }] })
                .mockResolvedValueOnce({ rows: [{ count: 0 }] });

            // Client queries
            mockClient.query.mockImplementation(async (sql) => {
                if (typeof sql === 'string' && sql.includes('INSERT INTO rooms')) {
                    return { rows: [{ room_id: 'room-123', room_number: 'R-MRI' }] };
                }
                if (typeof sql === 'string' && sql.includes('INSERT INTO modalities')) {
                    return { rows: [{ modality_id: 'mod-123', type: 'MRI', name: 'Siemens Magnetom 1.5T' }] };
                }
                if (typeof sql === 'string' && sql.includes('INSERT INTO examination_types')) {
                    return { rows: [{ type_id: 'type-123', code: 'DEMO-MRI-BRAIN', name: 'Brain MRI', price: 1200 }] };
                }
                if (typeof sql === 'string' && sql.includes('INSERT INTO referring_doctors')) {
                    return { rows: [{ doctor_id: 'doc-123', full_name: 'د. طارق الزيات' }] };
                }
                if (typeof sql === 'string' && sql.includes('INSERT INTO patients')) {
                    return { rows: [{ patient_id: 'pat-123', mrn: 'DEMO-PAT-001' }] };
                }
                if (typeof sql === 'string' && sql.includes('INSERT INTO appointments')) {
                    return { rows: [{ appointment_id: 'appt-123' }] };
                }
                if (typeof sql === 'string' && sql.includes('INSERT INTO examinations')) {
                    return { rows: [{ exam_id: 'exam-123' }] };
                }
                return { rows: [] };
            });

            const result = await seedDemoData(mockPool, { actorId: 'user-admin-1' });

            expect(result.seeded).toBe(true);
            expect(result.summary.rooms).toBe(4);
            expect(result.summary.modalities).toBe(4);
            expect(result.summary.examTypes).toBe(8);
            expect(result.summary.patients).toBe(5);
            expect(result.summary.appointments).toBe(5);

            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('rolls back on error and releases connection', async () => {
            mockPool.query
                .mockResolvedValueOnce({ rows: [{ count: 0 }] })
                .mockResolvedValueOnce({ rows: [{ count: 0 }] })
                .mockResolvedValueOnce({ rows: [{ count: 0 }] });

            mockClient.query.mockImplementation(async (sql) => {
                if (typeof sql === 'string' && sql.includes('INSERT INTO rooms')) {
                    throw new Error('Database constraint violation');
                }
                return { rows: [] };
            });

            await expect(seedDemoData(mockPool)).rejects.toThrow('Database constraint violation');
            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe('clearDemoData', () => {
        it('deletes demo records and commits cleanly', async () => {
            mockClient.query.mockImplementation(async (sql) => {
                if (typeof sql === 'string' && sql.includes('DELETE FROM appointments')) {
                    return { rowCount: 5 };
                }
                if (typeof sql === 'string' && sql.includes('DELETE FROM patients')) {
                    return { rowCount: 5 };
                }
                if (typeof sql === 'string' && sql.includes('DELETE FROM modalities')) {
                    return { rowCount: 4 };
                }
                if (typeof sql === 'string' && sql.includes('DELETE FROM rooms')) {
                    return { rowCount: 4 };
                }
                return { rowCount: 0 };
            });

            const result = await clearDemoData(mockPool);
            expect(result.cleared).toBe(true);
            expect(result.deleted.appointments).toBe(5);
            expect(result.deleted.patients).toBe(5);
            expect(result.deleted.modalities).toBe(4);
            expect(result.deleted.rooms).toBe(4);

            expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
            expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
            expect(mockClient.release).toHaveBeenCalled();
        });
    });
});
