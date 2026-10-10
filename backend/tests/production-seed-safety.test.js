const { runSeeds, runMigrations } = require('../../database/migrate');

test('pending historical migrations retain schema but omit demo inserts in production', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    try {
        await runMigrations({ connect: jest.fn().mockResolvedValue(client) });
        const statements = client.query.mock.calls.map(([sql]) => sql);
        const roles = statements.find(sql => sql.includes('-- Migration: Add new roles'));
        const inventory = statements.find(sql => sql.includes('-- Migration: Add Inventory Table'));
        expect(roles).toContain("ALTER TYPE user_role ADD VALUE 'HR'");
        expect(roles).not.toContain('INSERT INTO users');
        expect(inventory).toContain('CREATE TABLE IF NOT EXISTS inventory_items');
        expect(inventory).not.toContain('INSERT INTO inventory_items');
        expect(statements.some(sql => /DELETE FROM (users|inventory_items)/i.test(sql))).toBe(false);
    } finally { process.env.NODE_ENV = original; }
});

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
