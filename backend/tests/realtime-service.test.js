const { EventEmitter } = require('events');

const realtimeService = require('../src/services/realtimeService');

const connect = (identity) => {
    const token = realtimeService.createSseSession(identity);
    const req = new EventEmitter();
    req.query = { token };

    const res = new EventEmitter();
    res.writableEnded = false;
    res.destroyed = false;
    res.writeHead = jest.fn();
    res.write = jest.fn(() => true);
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);

    realtimeService.registerClient(req, res);
    return {
        req,
        res,
        payloads: () => res.write.mock.calls.map(([chunk]) => JSON.parse(chunk.slice(6).trim())),
        close: () => req.emit('close')
    };
};

describe('realtimeService identity isolation', () => {
    test('role notifications require the same organization and active workspace branch, including organization admins', () => {
        const a = connect({ user_id: 'a', role: 'Admin', organization_id: 'org-1', branchId: 'A' });
        const b = connect({ user_id: 'b', role: 'Admin', organization_id: 'org-1', branchId: 'B' });
        const other = connect({ user_id: 'c', role: 'Admin', organization_id: 'org-2', branchId: 'B', is_org_admin: true });
        try {
            realtimeService.sendToRole('Admin', 'NEW_NOTIFICATION', { organization_id: 'org-1', branch_id: 'B', content: 'clinical' });
            expect(a.payloads().some(p => p.event === 'NEW_NOTIFICATION')).toBe(false);
            expect(b.payloads().some(p => p.event === 'NEW_NOTIFICATION')).toBe(true);
            expect(other.payloads().some(p => p.event === 'NEW_NOTIFICATION')).toBe(false);
            realtimeService.sendToRole('Admin', 'NEW_NOTIFICATION', { content: 'legacy without scope' });
            expect(b.payloads().filter(p => p.event === 'NEW_NOTIFICATION')).toHaveLength(1);
        } finally { a.close(); b.close(); other.close(); }
    });

    test('direct-user delivery does not expose another branch notification to the same user in a different tab', () => {
        const a = connect({ user_id: 'same-user', role: 'Nurse', organization_id: 'org', branchId: 'A' });
        const b = connect({ user_id: 'same-user', role: 'Nurse', organization_id: 'org', branchId: 'B' });
        try {
            realtimeService.sendToUser('same-user', 'NEW_NOTIFICATION', { organizationId: 'org', branchId: 'B' });
            expect(a.payloads().some(p => p.event === 'NEW_NOTIFICATION')).toBe(false);
            expect(b.payloads().some(p => p.event === 'NEW_NOTIFICATION')).toBe(true);
        } finally { a.close(); b.close(); }
    });

    test('patient portal connections never receive staff broadcasts', () => {
        const patient = connect({ userId: 'patient-1', role: 'Patient' });
        const staff = connect({ user_id: 'staff-1', role: 'Admin' });

        realtimeService.broadcastToStaff('STAFF_ONLY', { secret: true });

        expect(staff.payloads()).toEqual(expect.arrayContaining([
            expect.objectContaining({ event: 'STAFF_ONLY' })
        ]));
        expect(patient.payloads()).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ event: 'STAFF_ONLY' })
        ]));

        realtimeService.sendToPatient('patient-1', 'PATIENT_ONLY', { ok: true });
        expect(patient.payloads()).toEqual(expect.arrayContaining([
            expect.objectContaining({ event: 'PATIENT_ONLY' })
        ]));

        patient.close();
        staff.close();
    });

    test('filtered staff broadcasts honor authenticated roles', () => {
        const receptionist = connect({ user_id: 'staff-2', role: 'Receptionist' });
        const radiologist = connect({ user_id: 'staff-3', role: 'Radiologist' });

        realtimeService.broadcastToStaffMatching(
            client => client.role === 'Receptionist',
            'PATIENT_INBOX',
            { patient_id: 'patient-1' }
        );

        expect(receptionist.payloads()).toEqual(expect.arrayContaining([
            expect.objectContaining({ event: 'PATIENT_INBOX' })
        ]));
        expect(radiologist.payloads()).not.toEqual(expect.arrayContaining([
            expect.objectContaining({ event: 'PATIENT_INBOX' })
        ]));

        receptionist.close();
        radiologist.close();
    });
});
