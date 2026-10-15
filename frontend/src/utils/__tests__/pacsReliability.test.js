import { describe, expect, it } from 'vitest';
import { groupInstancesBySeries } from '../analyzeDisplaySets';
import { buildImageUploadBatches } from '../../components/reportEditor/utils';

describe('PACS upload and frame reliability', () => {
    it('limits upload batches by both bytes and count', () => {
        const files = Array.from({ length: 21 }, (_, i) => ({ name: `${i}.dcm`, size: 25 * 1024 * 1024 }));
        const batches = buildImageUploadBatches(files);
        expect(batches.flat()).toEqual(files);
        expect(batches.map(batch => batch.length)).toEqual([7, 7, 7]);
        expect(batches.every(batch => batch.reduce((total, file) => total + file.size, 0) <= 190 * 1024 * 1024)).toBe(true);
        expect(buildImageUploadBatches(Array.from({ length: 11 }, () => ({ size: 1 })))).toHaveLength(2);
    });
    it('rejects oversized files before any network transfer', () => {
        expect(() => buildImageUploadBatches([{ name: 'too-big.dcm', size: 26 * 1024 * 1024 }])).toThrow('25 MiB');
    });
    it('sorts slices geometrically and exposes every multi-frame image', () => {
        const instance = (depth, number, frames = 1) => ({
            '0020000E': { Value: ['1.2.3'] }, '00200013': { Value: [number] },
            '00200037': { Value: [1, 0, 0, 0, 1, 0] },
            '00200032': { Value: [0, 0, depth] }, '00280008': { Value: [frames] }
        });
        const source = [instance(8, 1), instance(1, 9, 3)];
        const series = groupInstancesBySeries(source, { expandFrames: true })[0];
        expect(series.instances.map(image => image.__frameNumber)).toEqual([1, 2, 3, 1]);
        expect(series.instances[0]['00200032'].Value[2]).toBe(1);
        expect(groupInstancesBySeries(source)[0].instances).toHaveLength(2);
    });
});
