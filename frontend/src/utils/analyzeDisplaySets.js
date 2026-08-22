/**
 * Client-side re-analysis of DICOM series geometry to surface the same class of
 * "display set" quality warnings that OHIF computes internally. VIARA loads OHIF
 * in a cross-origin iframe and cannot read its internal state, so we independently
 * fetch WADO-RS study metadata through the existing DICOMweb proxy and recompute
 * the conditions here.
 *
 * These are ADVISORY heuristics with tolerances chosen to approximate OHIF's own
 * checks. They are intentionally conservative (favour not raising a warning over a
 * false alarm) and are not a substitute for the viewer's own validation.
 *
 * The pure computation (computeDisplaySetReport) is separated from network access
 * so it can be unit-tested with fixture metadata.
 */
import { authenticatedFetch } from './authenticatedFetch';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Geometry tolerances. Positions/orientations from real scanners carry floating
// point noise, so exact equality would produce constant false positives.
const ORIENTATION_EPSILON = 0.01; // direction-cosine component tolerance
const SPACING_TOLERANCE = 0.2; // 20% deviation from the modal spacing is "irregular"
const POSITION_EPSILON = 0.01; // mm tolerance when projecting onto the slice normal
const MIN_VOLUME_SLICES = 3; // fewer than this cannot form a 3D volume

/** Warning codes — stable identifiers the UI maps to translated strings. */
export const DISPLAY_SET_WARNINGS = {
    INCONSISTENT_DIMENSIONS: 'inconsistentDimensions',
    INCONSISTENT_ORIENTATION: 'inconsistentOrientation',
    INCONSISTENT_POSITION: 'inconsistentPosition',
    IRREGULAR_SPACING: 'irregularSpacing',
    MISSING_FRAMES: 'missingFrames',
    NOT_RECONSTRUCTABLE: 'notReconstructable'
};

const getTag = (instance, tag) => instance?.[tag]?.Value;

const getNumbers = (instance, tag) => {
    const value = getTag(instance, tag);
    if (!Array.isArray(value)) return [];
    return value.map(Number).filter((n) => Number.isFinite(n));
};

const getNumber = (instance, tag) => {
    const [first] = getNumbers(instance, tag);
    return Number.isFinite(first) ? first : null;
};

const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Group a flat list of WADO-RS instance metadata objects by SeriesInstanceUID,
 * preserving useful series-level descriptors for display.
 */
export const groupInstancesBySeries = (instances = []) => {
    const groups = new Map();
    for (const instance of instances) {
        const [seriesUid] = getTag(instance, '0020000E') || [];
        if (!seriesUid) continue;
        if (!groups.has(seriesUid)) {
            groups.set(seriesUid, {
                seriesInstanceUid: seriesUid,
                seriesNumber: getNumber(instance, '00200011'),
                seriesDescription: (getTag(instance, '0008103E') || [])[0] || '',
                modality: (getTag(instance, '00080060') || [])[0] || '',
                instances: []
            });
        }
        groups.get(seriesUid).instances.push(instance);
    }
    return [...groups.values()];
};

/**
 * Analyse one series' instances and return the set of triggered warning codes.
 * Multi-frame instances (a single object representing the whole volume) are
 * treated as internally consistent for the cross-slice checks.
 */
const analyzeSeries = (series) => {
    const warnings = new Set();
    const instances = series.instances || [];
    const frameCount = instances.reduce(
        (sum, instance) => sum + (getNumber(instance, '00280008') || 1),
        0
    );

    // Dimensions: Rows (00280010) / Columns (00280011) must match across frames.
    const dimensions = new Set(
        instances.map((instance) => {
            const rows = getNumber(instance, '00280010');
            const cols = getNumber(instance, '00280011');
            return `${rows}x${cols}`;
        })
    );
    if (dimensions.size > 1) {
        warnings.add(DISPLAY_SET_WARNINGS.INCONSISTENT_DIMENSIONS);
    }

    // Orientation: ImageOrientationPatient (00200037), 6 direction-cosine values.
    const orientations = instances
        .map((instance) => getNumbers(instance, '00200037'))
        .filter((o) => o.length === 6);
    let referenceOrientation = orientations[0] || null;
    if (referenceOrientation) {
        const orientationVaries = orientations.some((o) =>
            o.some((component, index) =>
                Math.abs(component - referenceOrientation[index]) > ORIENTATION_EPSILON
            )
        );
        if (orientationVaries) {
            warnings.add(DISPLAY_SET_WARNINGS.INCONSISTENT_ORIENTATION);
        }
    }

    // Position + spacing: project each ImagePositionPatient (00200032) onto the
    // slice normal (rowCosines x colCosines) to obtain a scalar depth, then
    // inspect the ordered gaps. Only meaningful for single-frame slice stacks
    // with a consistent orientation.
    const positions = instances
        .map((instance) => getNumbers(instance, '00200032'))
        .filter((p) => p.length === 3);

    const isSingleFrameStack =
        instances.length > 1 &&
        instances.every((instance) => (getNumber(instance, '00280008') || 1) === 1);

    if (
        isSingleFrameStack &&
        referenceOrientation &&
        !warnings.has(DISPLAY_SET_WARNINGS.INCONSISTENT_ORIENTATION) &&
        positions.length === instances.length
    ) {
        const rowCosines = referenceOrientation.slice(0, 3);
        const colCosines = referenceOrientation.slice(3, 6);
        const normal = cross(rowCosines, colCosines);

        const depths = positions.map((p) => dot(p, normal)).sort((a, b) => a - b);
        const gaps = [];
        for (let i = 1; i < depths.length; i += 1) {
            gaps.push(depths[i] - depths[i - 1]);
        }

        // Duplicate/overlapping slices (near-zero gap) => inconsistent position.
        if (gaps.some((gap) => Math.abs(gap) < POSITION_EPSILON)) {
            warnings.add(DISPLAY_SET_WARNINGS.INCONSISTENT_POSITION);
        }

        const positiveGaps = gaps.filter((gap) => Math.abs(gap) >= POSITION_EPSILON);
        if (positiveGaps.length) {
            // Modal spacing = smallest consistent gap; compare others against it.
            const sortedGaps = [...positiveGaps].sort((a, b) => a - b);
            const modalSpacing = sortedGaps[Math.floor(sortedGaps.length / 2)];

            if (modalSpacing > 0) {
                const irregular = positiveGaps.some((gap) => {
                    const ratio = gap / modalSpacing;
                    const nearestMultiple = Math.round(ratio);
                    // A gap that is ~an integer multiple of the modal spacing is a
                    // missing slice; a gap that is neither ~1x nor ~Nx is irregular.
                    const deviationFromNearest = Math.abs(ratio - nearestMultiple);
                    return nearestMultiple >= 1 && deviationFromNearest > SPACING_TOLERANCE;
                });
                if (irregular) {
                    warnings.add(DISPLAY_SET_WARNINGS.IRREGULAR_SPACING);
                }

                const hasMissing = positiveGaps.some((gap) => {
                    const ratio = gap / modalSpacing;
                    const nearestMultiple = Math.round(ratio);
                    return (
                        nearestMultiple >= 2 &&
                        Math.abs(ratio - nearestMultiple) <= SPACING_TOLERANCE
                    );
                });
                if (hasMissing) {
                    warnings.add(DISPLAY_SET_WARNINGS.MISSING_FRAMES);
                }
            }
        }
    }

    // Reconstructable volume: needs enough slices and none of the disqualifying
    // geometry problems above.
    const disqualified =
        warnings.has(DISPLAY_SET_WARNINGS.INCONSISTENT_DIMENSIONS) ||
        warnings.has(DISPLAY_SET_WARNINGS.INCONSISTENT_ORIENTATION) ||
        warnings.has(DISPLAY_SET_WARNINGS.INCONSISTENT_POSITION) ||
        warnings.has(DISPLAY_SET_WARNINGS.IRREGULAR_SPACING);

    const isVolume = frameCount >= MIN_VOLUME_SLICES;
    if (isVolume && disqualified) {
        warnings.add(DISPLAY_SET_WARNINGS.NOT_RECONSTRUCTABLE);
    }

    return {
        seriesInstanceUid: series.seriesInstanceUid,
        seriesNumber: series.seriesNumber,
        seriesDescription: series.seriesDescription,
        modality: series.modality,
        frameCount,
        warnings: [...warnings]
    };
};

/**
 * Pure entry point: given a flat list of WADO-RS instance metadata, return a
 * per-series report. Only series with at least one warning are returned.
 */
export const computeDisplaySetReport = (instances = []) => {
    const series = groupInstancesBySeries(instances);
    const analyzed = series.map(analyzeSeries);
    const flagged = analyzed.filter((entry) => entry.warnings.length > 0);
    return {
        seriesAnalyzed: series.length,
        flaggedSeries: flagged,
        hasWarnings: flagged.length > 0
    };
};

/**
 * Fetch WADO-RS study metadata through the VIARA DICOMweb proxy and analyse it.
 * Returns null on any failure — quality warnings are advisory, so a metadata
 * fetch error must never block the viewer.
 */
export const analyzeStudyDisplaySets = async (studyInstanceUid, { signal } = {}) => {
    if (!studyInstanceUid) return null;
    try {
        const response = await authenticatedFetch(
            `${API_BASE}/pacs/dicom-web/studies/${encodeURIComponent(
                studyInstanceUid
            )}/metadata`,
            { signal }
        );
        if (!response.ok) return null;
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('json')) return null;
        const instances = await response.json();
        if (!Array.isArray(instances)) return null;
        return computeDisplaySetReport(instances);
    } catch {
        return null;
    }
};
