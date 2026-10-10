const {
    claimTask,
    completeTask,
    releaseTask,
    ROLE_CONFIG
} = require('../src/services/clinicalTaskAssignmentService');

const examId = '00000000-0000-4000-8000-000000000301';
const appointmentId = '00000000-0000-4000-8000-000000000302';
const technicianId = '00000000-0000-4000-8000-000000000303';
const otherTechnicianId = '00000000-0000-4000-8000-000000000304';

describe('clinical task assignment service', () => {
    test('claims an unassigned task atomically and records immutable history', async () => {
        const client = {
            query: jest.fn(async (sql, values) => {
                const text = String(sql);
                if (text.includes('FOR UPDATE OF e, a')) {
                    return { rows: [{
                        exam_id: examId,
                        appointment_id: appointmentId,
                        queue_stage: 'Ready for Exam',
                        current_station: 'Modality',
                        technician_id: null,
                        technician_assignment_version: 0
                    }] };
                }
                if (text.includes('UPDATE appointments')) {
                    expect(values).toEqual([technicianId, appointmentId]);
                    return { rows: [{
                        assigned_user_id: technicianId,
                        assigned_at: '2026-08-29T10:00:00.000Z',
                        assignment_version: 1
                    }] };
                }
                if (text.includes('INSERT INTO clinical_task_assignment_events')) {
                    expect(values).toEqual([
                        examId, appointmentId, 'Technician', 'Claim', null,
                        technicianId, technicianId, null, 1, null
                    ]);
                    return { rows: [] };
                }
                throw new Error(`Unexpected SQL: ${text}`);
            })
        };

        const result = await claimTask(client, {
            examId,
            user: { user_id: technicianId, role: 'Technician' }
        });

        expect(result).toEqual(expect.objectContaining({
            exam_id: examId,
            assigned_user_id: technicianId,
            assignment_version: 1,
            assignment_status: 'Assigned'
        }));
        expect(String(client.query.mock.calls[0][0])).toContain('FOR UPDATE OF e, a');
    });

    test('returns a conflict without exposing another assignee when a task is already owned', async () => {
        const client = {
            query: jest.fn().mockResolvedValue({ rows: [{
                exam_id: examId,
                appointment_id: appointmentId,
                queue_stage: 'Ready for Exam',
                current_station: 'Modality',
                technician_id: otherTechnicianId,
                technician_assignment_version: 2
            }] })
        };

        await expect(claimTask(client, {
            examId,
            user: { user_id: technicianId, role: 'Technician' }
        })).rejects.toMatchObject({
            statusCode: 409,
            code: 'TASK_ALREADY_ASSIGNED'
        });
        expect(client.query).toHaveBeenCalledTimes(1);
    });

    test('is idempotent when the owner retries the claim request', async () => {
        const client = {
            query: jest.fn().mockResolvedValue({ rows: [{
                exam_id: examId,
                appointment_id: appointmentId,
                queue_stage: 'Ready for Exam',
                current_station: 'Modality',
                technician_id: technicianId,
                technician_assigned_at: '2026-08-29T10:00:00.000Z',
                technician_assignment_version: 4
            }] })
        };

        const result = await claimTask(client, {
            examId,
            user: { user_id: technicianId, role: 'Technician' }
        });

        expect(result.assignment_version).toBe(4);
        expect(client.query).toHaveBeenCalledTimes(1);
    });

    test('prevents another clinical user from releasing a private task', async () => {
        const client = {
            query: jest.fn().mockResolvedValue({ rows: [{
                exam_id: examId,
                appointment_id: appointmentId,
                queue_stage: 'Ready for Exam',
                current_station: 'Modality',
                technician_id: technicianId,
                technician_assignment_version: 1
            }] })
        };

        await expect(releaseTask(client, {
            examId,
            actor: { user_id: otherTechnicianId, role: 'Technician' },
            reason: 'Returning task for reassignment'
        })).rejects.toMatchObject({ statusCode: 404, code: 'TASK_NOT_FOUND' });
        expect(client.query).toHaveBeenCalledTimes(1);
    });

    test('records completion when an owned task leaves its clinical station', async () => {
        const client = {
            query: jest.fn(async (sql, values) => {
                expect(String(sql)).toContain('INSERT INTO clinical_task_assignment_events');
                expect(values).toEqual([
                    examId,
                    appointmentId,
                    'Technician',
                    'Complete',
                    technicianId,
                    null,
                    technicianId,
                    null,
                    3,
                    '2026-08-29T09:55:00.000Z'
                ]);
                return { rows: [] };
            })
        };

        const result = await completeTask(client, {
            exam_id: examId,
            appointment_id: appointmentId,
            technician_id: technicianId,
            technician_task_available_at: '2026-08-29T09:55:00.000Z',
            technician_assignment_version: 3
        }, 'Technician', technicianId);

        expect(result).toEqual(expect.objectContaining({
            task_role: 'Technician',
            previous_user_id: technicianId,
            assignment_status: 'Completed'
        }));
    });

    test('defines isolated assignment columns for every clinical role', () => {
        expect(ROLE_CONFIG.Nurse.assigneeColumn).toBe('nurse_id');
        expect(ROLE_CONFIG.Technician.assigneeColumn).toBe('technician_id');
        expect(ROLE_CONFIG.Radiologist.assigneeColumn).toBe('performing_radiologist_id');
    });
});
