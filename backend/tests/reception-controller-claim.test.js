jest.mock('../src/services/receptionTaskService', () => ({
  claimReceptionTask: jest.fn(async () => ({
    appointment_id: '00000000-0000-4000-8000-000000000401',
    exam_id: '00000000-0000-4000-8000-000000000402',
    desk_identifier: 'Desk 1',
    version: 1,
  })),
  releaseReceptionTask: jest.fn(),
  transferReceptionTask: jest.fn(),
  renewReceptionTaskLeases: jest.fn(),
  cleanupExpiredReceptionTasks: jest.fn(),
  broadcastReceptionTaskChange: jest.fn(),
}));

jest.mock('../src/services/auditService', () => ({
  logAction: jest.fn(async () => undefined),
}));

const { claimTask } = require('../src/controllers/receptionTaskController');
const { claimReceptionTask } = require('../src/services/receptionTaskService');

describe('reception claim controller', () => {
  test('accepts empty request bodies when a receptionist claims a task', async () => {
    const client = {
      query: jest.fn().mockImplementation(async (sql) => {
        const text = String(sql);
        if (text.includes('BEGIN') || text.includes('COMMIT')) return { rows: [] };
        return { rows: [] };
      }),
      release: jest.fn(),
    };

    const db = {
      connect: jest.fn().mockResolvedValue(client),
    };

    const req = {
      params: { appointmentId: '00000000-0000-4000-8000-000000000401' },
      user: { user_id: '00000000-0000-4000-8000-000000000111', full_name: 'Reception Agent', role: 'Receptionist' },
      ip: '127.0.0.1',
    };

    const res = {
      json: jest.fn(),
    };

    const next = jest.fn();

    await claimTask(db)(req, res, next);

    expect(claimReceptionTask).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        appointmentId: '00000000-0000-4000-8000-000000000401',
        examId: undefined,
      })
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ appointment_id: '00000000-0000-4000-8000-000000000401' }));
  });
});
