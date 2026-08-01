import { describe, expect, test } from 'vitest';
import {
    DISPLAY_SET_WARNINGS,
    computeDisplaySetReport,
    groupInstancesBySeries
} from '../analyzeDisplaySets';

// Minimal WADO-RS instance metadata builder. Axial orientation by default
// (row cosines [1,0,0], col cosines [0,1,0] => slice normal [0,0,1]), so the
// slice depth is simply the Z component of ImagePositionPatient.
const instance = ({
    series = '1.2.3',
    rows = 512,
    cols = 512,
    orientation = [1, 0, 0, 0, 1, 0],
    position = [0, 0, 0],
    frames = 1,
    seriesNumber = 1,
    modality = 'CT'
} = {}) => {
    const meta = {
        '0020000E': { Value: [series] },
        '00200011': { Value: [seriesNumber] },
        '00080060': { Value: [modality] },
        '00280010': { Value: [rows] },
        '00280011': { Value: [cols] }
    };
    if (orientation) meta['00200037'] = { Value: orientation };
    if (position) meta['00200032'] = { Value: position };
    if (frames > 1) meta['00280008'] = { Value: [frames] };
    return meta;
};

// A clean axial stack at 1mm spacing.
const cleanStack = (count = 5, spacing = 1) =>
    Array.from({ length: count }, (_, i) =>
        instance({ position: [0, 0, i * spacing] })
    );

describe('groupInstancesBySeries', () => {
    test('groups by SeriesInstanceUID and carries descriptors', () => {
        const groups = groupInstancesBySeries([
            instance({ series: 'A', seriesNumber: 1 }),
            instance({ series: 'A', seriesNumber: 1 }),
            instance({ series: 'B', seriesNumber: 2 })
        ]);
        expect(groups).toHaveLength(2);
        expect(groups.find((g) => g.seriesInstanceUid === 'A').instances).toHaveLength(2);
    });

    test('ignores instances without a series UID', () => {
        expect(groupInstancesBySeries([{ '00280010': { Value: [512] } }])).toHaveLength(0);
    });
});

describe('computeDisplaySetReport', () => {
    test('a clean axial stack raises no warnings', () => {
        const report = computeDisplaySetReport(cleanStack(6, 2));
        expect(report.hasWarnings).toBe(false);
        expect(report.flaggedSeries).toHaveLength(0);
        expect(report.seriesAnalyzed).toBe(1);
    });

    test('flags inconsistent dimensions', () => {
        const report = computeDisplaySetReport([
            instance({ position: [0, 0, 0], rows: 512 }),
            instance({ position: [0, 0, 1], rows: 256 }),
            instance({ position: [0, 0, 2], rows: 512 })
        ]);
        const codes = report.flaggedSeries[0].warnings;
        expect(codes).toContain(DISPLAY_SET_WARNINGS.INCONSISTENT_DIMENSIONS);
        expect(codes).toContain(DISPLAY_SET_WARNINGS.NOT_RECONSTRUCTABLE);
    });

    test('flags inconsistent orientation', () => {
        const report = computeDisplaySetReport([
            instance({ position: [0, 0, 0], orientation: [1, 0, 0, 0, 1, 0] }),
            instance({ position: [0, 0, 1], orientation: [1, 0, 0, 0, 0, 1] }),
            instance({ position: [0, 0, 2], orientation: [1, 0, 0, 0, 1, 0] })
        ]);
        expect(report.flaggedSeries[0].warnings).toContain(
            DISPLAY_SET_WARNINGS.INCONSISTENT_ORIENTATION
        );
    });

    test('flags inconsistent position for overlapping slices', () => {
        const report = computeDisplaySetReport([
            instance({ position: [0, 0, 0] }),
            instance({ position: [0, 0, 0] }),
            instance({ position: [0, 0, 1] })
        ]);
        expect(report.flaggedSeries[0].warnings).toContain(
            DISPLAY_SET_WARNINGS.INCONSISTENT_POSITION
        );
    });

    test('flags a missing frame when a gap is ~2x the modal spacing', () => {
        // Spacing 1mm, but one slice (z=2) omitted -> gap of 2mm.
        const report = computeDisplaySetReport([
            instance({ position: [0, 0, 0] }),
            instance({ position: [0, 0, 1] }),
            instance({ position: [0, 0, 3] }),
            instance({ position: [0, 0, 4] })
        ]);
        expect(report.flaggedSeries[0].warnings).toContain(
            DISPLAY_SET_WARNINGS.MISSING_FRAMES
        );
    });

    test('flags irregular spacing for a non-integer gap', () => {
        const report = computeDisplaySetReport([
            instance({ position: [0, 0, 0] }),
            instance({ position: [0, 0, 1] }),
            instance({ position: [0, 0, 2] }),
            instance({ position: [0, 0, 3.6] })
        ]);
        expect(report.flaggedSeries[0].warnings).toContain(
            DISPLAY_SET_WARNINGS.IRREGULAR_SPACING
        );
    });

    test('a consistent multi-frame instance raises no cross-slice warnings', () => {
        const report = computeDisplaySetReport([
            instance({ frames: 64, position: [0, 0, 0] })
        ]);
        expect(report.hasWarnings).toBe(false);
    });

    test('reports each series independently', () => {
        const report = computeDisplaySetReport([
            ...cleanStack(4, 1).map((m) => ({ ...m, '0020000E': { Value: ['clean'] } })),
            instance({ series: 'bad', position: [0, 0, 0], rows: 512 }),
            instance({ series: 'bad', position: [0, 0, 1], rows: 128 }),
            instance({ series: 'bad', position: [0, 0, 2], rows: 512 })
        ]);
        expect(report.seriesAnalyzed).toBe(2);
        expect(report.flaggedSeries).toHaveLength(1);
        expect(report.flaggedSeries[0].seriesInstanceUid).toBe('bad');
    });
});
