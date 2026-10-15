const { getPreferences } = require('../src/controllers/profileController');

describe('profile preference policy', () => {
    it('merges the organization inactivity policy into personal preferences', async () => {
        const db = {
            query: jest.fn().mockResolvedValue({
                rows: [{ preferences: { theme: 'dark', sessionTimeout: 15 }, organization_session_timeout: '60' }]
            })
        };
        const req = { user: { user_id: 'user-1' } };
        const res = { json: jest.fn() };
        const next = jest.fn();

        await getPreferences(db)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining('admin.session_timeout_mins'), ['user-1']);
        expect(res.json).toHaveBeenCalledWith({
            theme: 'dark',
            sessionTimeout: 15,
            organizationSessionTimeout: 60,
        });
    });
});
