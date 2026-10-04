const { runSeeds } = require('../../database/migrate');

test('production bootstrap seeds RBAC without adding demo accounts or operational records', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    try {
        await runSeeds({ connect: jest.fn().mockResolvedValue(client) });
        const sql = client.query.mock.calls.map(([statement]) => statement).join('\n');
        expect(sql).toContain('INSERT INTO permissions');
        expect(sql).not.toMatch(/INSERT INTO (users|patients|inventory_items|invoices|employee_profiles)\b/i);
        expect(client.release).toHaveBeenCalled();
    } finally { process.env.NODE_ENV = original; }
});
