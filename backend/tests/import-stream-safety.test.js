const fs = require('fs');
const os = require('os');
const path = require('path');
const { importPatients } = require('../src/controllers/importController');

test('missing CSV source is handled without an unhandled stream error', async () => {
    const db = { query: jest.fn() };
    const next = jest.fn();
    await importPatients(db)({ file: { path: path.join(os.tmpdir(), `missing-${require('crypto').randomUUID()}.csv`) } }, {}, next);
    expect(next.mock.calls[0][0].code).toBe('ENOENT');
    expect(db.query).not.toHaveBeenCalled();
});

test('too many CSV rows are rejected before database writes and temp file is removed', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'viara-import-test-'));
    const file = path.join(directory, 'synthetic.csv');
    fs.writeFileSync(file, 'FirstName,LastName,DOB\n' + 'Synthetic,Only,2000-01-01\n'.repeat(10001));
    try {
        const db = { query: jest.fn() };
        const next = jest.fn();
        await importPatients(db)({ file: { path: file } }, {}, next);
        expect(next.mock.calls[0][0].statusCode).toBe(413);
        expect(db.query).not.toHaveBeenCalled();
        expect(fs.existsSync(file)).toBe(false);
    } finally {
        if (fs.existsSync(file)) fs.unlinkSync(file);
        fs.rmdirSync(directory);
    }
});
