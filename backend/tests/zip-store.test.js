const { createStoredZip } = require('../src/utils/zipStore');

describe('stored ZIP utility', () => {
    it('creates a readable ZIP-shaped archive with UTF-8 file names', () => {
        const archive = createStoredZip([
            { name: 'manifest.json', data: Buffer.from('{"ok":true}') },
            { name: 'images/series-01/image-0001.jpg', data: Buffer.from([1, 2, 3]) }
        ]);

        expect(archive.subarray(0, 4).toString('hex')).toBe('504b0304');
        expect(archive.includes(Buffer.from('manifest.json'))).toBe(true);
        expect(archive.includes(Buffer.from('images/series-01/image-0001.jpg'))).toBe(true);
        expect(archive.subarray(archive.length - 22, archive.length - 18).toString('hex')).toBe('504b0506');
    });
});
