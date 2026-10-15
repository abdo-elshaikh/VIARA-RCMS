const {
    claimReceptionTask,
    releaseReceptionTask,
    transferReceptionTask
} = require('../src/services/receptionTaskService');

const appointmentId = '00000000-0000-4000-8000-000000000401';
const examId = '00000000-0000-4000-8000-000000000402';
const receptionistA = { user_id: '00000000-0000-4000-8000-000000000403', full_name: 'Ahmed Reception', role: 'Receptionist' };
const receptionistB = { user_id: '00000000-0000-4000-8000-000000000404', full_name: 'Sara Reception', role: 'Receptionist' };

describe('reception task service concurrency & claim control', () => {
    test('loads the exam_id from examinations for appointment claims instead of assuming it exists on appointments', async () => {
        const client = {
            query: jest.fn(async (sql, values) => {
                const text = String(sql);
                // Serialize new claims: match the simple FOR SHARE session check only
                if (text.includes('reception_shift_sessions') && text.includes('FOR SHARE')) {
                    return { rows: [{ session_id: 'sess-1', desk_identifier: 'شباك 1' }] };
                }
                if (text.includes('FOR UPDATE OF a')) {
                    return {
                        rows: [{
                            appointment_id: appointmentId,
                            exam_id: examId,
                            status: 'Scheduled',
                            modality_id: 'mod-1',
                            room_number: 'Room 1',
                            receptionist_id: null,
                            receptionist_desk: null,
                            receptionist_assigned_at: null,
                            receptionist_assignment_version: 0,
                            claimant_name: null,
                            active_lease: false
                        }]
                    };
                }
                if (text.includes('UPDATE appointments')) {
                    return { rows: [{ appointment_id: appointmentId, receptionist_id: receptionistA.user_id, receptionist_assigned_at: '2026-09-03T10:00:00Z', receptionist_desk: 'شباك 1', receptionist_assignment_version: 1 }] };
                }
                if (text.includes('UPDATE reception_work_items')) {
                    return { rows: [] };
                }
                if (text.includes('INSERT INTO reception_work_items')) {
                    return { rows: [{ work_item_id: 'wi-1', appointment_id: appointmentId, status: 'Claimed', claimed_by: receptionistA.user_id, desk_identifier: 'شباك 1', version: 1, lease_expires_at: '2026-09-03T10:07:00Z' }] };
                }
                throw new Error(`Unexpected SQL: ${text}`);
            })
        };

        await expect(claimReceptionTask(client, {
            appointmentId,
            user: receptionistA,
            desk: 'شباك 1',
            expectedVersion: 0
        })).resolves.toMatchObject({ appointment_id: appointmentId, receptionist_desk: 'شباك 1' });

        expect(client.query.mock.calls.some(([sql]) => String(sql).includes('LEFT JOIN examinations e'))).toBe(true);
    });

    test('claims an unclaimed appointment atomically with a 15-minute lease and desk identifier', async () => {
        const client = {
            query: jest.fn(async (sql, values) => {
                const text = String(sql);
                // Serialize new claims: match the simple FOR SHARE session check only
                if (text.includes('reception_shift_sessions') && text.includes('FOR SHARE')) {
                    return { rows: [{ session_id: 'sess-1', desk_identifier: 'شباك 1' }] };
                }
                if (text.includes('FOR UPDATE OF a')) {
                    return {
                        rows: [{
                            appointment_id: appointmentId,
                            exam_id: examId,
                            status: 'Scheduled',
                            queue_stage: 'Scheduled',
                            modality_id: 'mod-1',
                            room_number: 'Room 1',
                            receptionist_id: null,
                            receptionist_desk: null,
                            receptionist_assigned_at: null,
                            receptionist_assignment_version: 0,
                            claimant_name: null,
                            active_lease: false
                        }]
                    };
                }
                if (text.includes('UPDATE appointments')) {
                    return {
                        rows: [{
                            appointment_id: appointmentId,
                            receptionist_id: receptionistA.user_id,
                            receptionist_assigned_at: '2026-09-03T10:00:00Z',
                            receptionist_desk: 'شباك 1',
                            receptionist_assignment_version: 1
                        }]
                    };
                }
                if (text.includes('UPDATE reception_work_items')) {
                    return { rows: [] };
                }
                if (text.includes('INSERT INTO reception_work_items')) {
                    return {
                        rows: [{
                            work_item_id: 'wi-1',
                            appointment_id: appointmentId,
                            status: 'Claimed',
                            claimed_by: receptionistA.user_id,
                            desk_identifier: 'شباك 1',
                            version: 1
                        }]
                    };
                }
                throw new Error(`Unexpected SQL: ${text}`);
            })
        };

        const result = await claimReceptionTask(client, {
            appointmentId,
            user: receptionistA,
            desk: 'شباك 1',
            expectedVersion: 0
        });

        expect(result.appointment_id).toBe(appointmentId);
        expect(result.receptionist_id).toBe(receptionistA.user_id);
        expect(result.receptionist_desk).toBe('شباك 1');
        expect(result.receptionist_assignment_version).toBe(1);
    });

    test('rejects claim with 409 Conflict if another receptionist holds an active lease', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                // Serialize new claims: match the simple FOR SHARE session check only
                if (text.includes('reception_shift_sessions') && text.includes('FOR SHARE')) {
                    return { rows: [{ session_id: 'sess-1', desk_identifier: 'شباك 2' }] };
                }
                if (text.includes('FOR UPDATE OF a')) {
                    return {
                        rows: [{
                            appointment_id: appointmentId,
                            exam_id: examId,
                            status: 'Scheduled',
                            queue_stage: 'Scheduled',
                            modality_id: 'mod-1',
                            room_number: 'Room 1',
                            receptionist_id: receptionistA.user_id,
                            receptionist_desk: 'شباك 1',
                            receptionist_assigned_at: '2026-09-03T10:00:00Z',
                            receptionist_assignment_version: 1,
                            claimant_name: 'Ahmed Reception',
                            active_lease: true
                        }]
                    };
                }
                throw new Error(`Unexpected SQL: ${text}`);
            })
        };

        await expect(claimReceptionTask(client, {
            appointmentId,
            user: receptionistB,
            desk: 'شباك 2',
            expectedVersion: 0
        })).rejects.toMatchObject({
            statusCode: 409,
            code: 'TASK_ALREADY_CLAIMED',
            details: expect.objectContaining({
                claimedBy: 'Ahmed Reception',
                desk: 'شباك 1'
            })
        });

        // FOR SHARE session check + FOR UPDATE OF a appointment check = 2 queries
        expect(client.query).toHaveBeenCalledTimes(2);
    });

    test('allows the same receptionist to refresh or extend an existing lease on their desk', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                // Serialize new claims: match the simple FOR SHARE session check only
                if (text.includes('reception_shift_sessions') && text.includes('FOR SHARE')) {
                    return { rows: [{ session_id: 'sess-1', desk_identifier: 'شباك 1' }] };
                }
                if (text.includes('FOR UPDATE OF a')) {
                    return {
                        rows: [{
                            appointment_id: appointmentId,
                            exam_id: examId,
                            status: 'Scheduled',
                            queue_stage: 'Scheduled',
                            modality_id: 'mod-1',
                            room_number: 'Room 1',
                            receptionist_id: receptionistA.user_id,
                            receptionist_desk: 'شباك 1',
                            receptionist_assigned_at: '2026-09-03T10:00:00Z',
                            receptionist_assignment_version: 1,
                            claimant_name: 'Ahmed Reception',
                            active_lease: true
                        }]
                    };
                }
                if (text.includes('UPDATE appointments')) {
                    return {
                        rows: [{
                            appointment_id: appointmentId,
                            receptionist_id: receptionistA.user_id,
                            receptionist_assigned_at: '2026-09-03T10:05:00Z',
                            receptionist_desk: 'شباك 1',
                            receptionist_assignment_version: 2
                        }]
                    };
                }
                if (text.includes('UPDATE reception_work_items')) {
                    return { rows: [] };
                }
                if (text.includes('INSERT INTO reception_work_items')) {
                    return {
                        rows: [{
                            work_item_id: 'wi-1',
                            appointment_id: appointmentId,
                            status: 'Claimed',
                            claimed_by: receptionistA.user_id,
                            desk_identifier: 'شباك 1',
                            version: 2
                        }]
                    };
                }
                throw new Error(`Unexpected SQL: ${text}`);
            })
        };

        const result = await claimReceptionTask(client, {
            appointmentId,
            user: receptionistA,
            desk: 'شباك 1',
            expectedVersion: 1
        });

        expect(result.appointment_id).toBe(appointmentId);
        expect(result.receptionist_assignment_version).toBe(2);
    });

    test('keeps the receptionist assignment visible when a case moves from reception to cashier', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('UPDATE reception_work_items')) {
                    return { rows: [] };
                }
                if (text.includes('UPDATE appointments')) {
                    return {
                        rows: [{
                            appointment_id: appointmentId,
                            receptionist_id: receptionistA.user_id,
                            receptionist_desk: 'شباك 1',
                            receptionist_assignment_version: 2
                        }]
                    };
                }
                throw new Error(`Unexpected SQL: ${text}`);
            })
        };

        const result = await require('../src/services/receptionTaskService').completeReceptionTask(client, {
            appointmentId,
            userId: receptionistA.user_id
        });

        expect(result.receptionist_id).toBe(receptionistA.user_id);
        expect(result.claimed_by).toBe(receptionistA.user_id);
    });

    test('releases an assigned task and clears the lease cleanly', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('FOR UPDATE')) {
                    return {
                        rows: [{
                            appointment_id: appointmentId,
                            receptionist_id: receptionistA.user_id,
                            receptionist_desk: 'شباك 1',
                            receptionist_assignment_version: 1
                        }]
                    };
                }
                if (text.includes('UPDATE appointments')) {
                    return {
                        rows: [{
                            appointment_id: appointmentId,
                            receptionist_id: null,
                            receptionist_desk: null,
                            receptionist_assignment_version: 2
                        }]
                    };
                }
                if (text.includes('UPDATE reception_work_items')) {
                    return { rows: [] };
                }
                throw new Error(`Unexpected SQL: ${text}`);
            })
        };

        const result = await releaseReceptionTask(client, {
            appointmentId,
            user: receptionistA,
            reason: 'Finished initial prep'
        });

        expect(result.released).toBe(true);
        expect(result.appointment_id).toBe(appointmentId);
    });

    test('does not transfer work to a receptionist without an open operational shift', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('FOR UPDATE OF a')) {
                    return { rows: [{
                        appointment_id: appointmentId,
                        exam_id: examId,
                        modality_id: 'mod-1',
                        modality_name: 'CT-01',
                        modality_type: 'CT',
                        room_number: 'Room 1',
                        receptionist_id: receptionistA.user_id,
                        receptionist_assignment_version: 1,
                        target_name: receptionistB.full_name,
                        target_role: 'Receptionist',
                    }] };
                }
                if (text.includes('FROM reception_shift_sessions')) return { rows: [] };
                throw new Error(`Unexpected SQL: ${text}`);
            }),
        };

        await expect(transferReceptionTask(client, {
            appointmentId,
            user: receptionistA,
            targetUserId: receptionistB.user_id,
        })).rejects.toMatchObject({
            statusCode: 409,
            code: 'TARGET_RECEPTION_SHIFT_REQUIRED',
        });
    });

    test('does not transfer a case outside the target receptionist device scope', async () => {
        const client = {
            query: jest.fn(async (sql) => {
                const text = String(sql);
                if (text.includes('FOR UPDATE OF a')) {
                    return { rows: [{
                        appointment_id: appointmentId,
                        exam_id: examId,
                        modality_id: 'mod-ct',
                        modality_name: 'CT-01',
                        modality_type: 'CT',
                        room_number: 'Room 1',
                        priority: 'Routine',
                        receptionist_id: receptionistA.user_id,
                        receptionist_assignment_version: 1,
                        target_name: receptionistB.full_name,
                        target_role: 'Receptionist',
                    }] };
                }
                if (text.includes('FROM reception_shift_sessions')) {
                    return { rows: [{
                        session_id: 'shift-b',
                        desk_identifier: 'MRI Desk',
                        scope: 'modalities',
                        room_ids: [],
                        modality_ids: ['MRI'],
                    }] };
                }
                throw new Error(`Unexpected SQL: ${text}`);
            }),
        };

        await expect(transferReceptionTask(client, {
            appointmentId,
            user: receptionistA,
            targetUserId: receptionistB.user_id,
        })).rejects.toMatchObject({
            statusCode: 409,
            code: 'TARGET_OUTSIDE_RECEPTION_SCOPE',
        });
    });
});
