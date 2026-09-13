const {
    safeEqual,
    safeDecrypt,
    parseStudyUidList,
    hasEffectivePermission,
    hasGlobalPacsAccess,
    hasEmergencyClinicalPacsAccess,
    isValidStudyUid,
    decodeDicomUid,
    shouldReturnEmptyScopedStudyBrowse
} = require('../src/services/pacsAccessPolicyService');
const {
    safeFileStem,
    extensionForImage,
    parseOrthancLookupResult
} = require('../src/services/pacsExportService');
const { AppError } = require('../src/middleware/errorHandler');

describe('pacsAccessPolicyService', () => {
    describe('safeEqual', () => {
        test('returns true for matching strings and false otherwise', () => {
            expect(safeEqual('secret-123', 'secret-123')).toBe(true);
            expect(safeEqual('secret-123', 'secret-456')).toBe(false);
            expect(safeEqual('secret-123', 'secret-1234')).toBe(false);
            expect(safeEqual('', '')).toBe(true);
            expect(safeEqual(null, undefined)).toBe(true);
        });
    });

    describe('safeDecrypt', () => {
        test('returns empty string for empty input', () => {
            expect(safeDecrypt('')).toBe('');
            expect(safeDecrypt(null)).toBe('');
        });

        test('returns plain text when input is not encrypted format', () => {
            expect(safeDecrypt('plain-password')).toBe('plain-password');
        });
    });

    describe('parseStudyUidList', () => {
        test('splits, trims, and deduplicates study UIDs from string or array', () => {
            expect(parseStudyUidList('1.2.3, 1.2.4,1.2.3')).toEqual(['1.2.3', '1.2.4']);
            expect(parseStudyUidList(['1.2.3', ' 1.2.4 ', '1.2.3'])).toEqual(['1.2.3', '1.2.4']);
            expect(parseStudyUidList('')).toEqual([]);
            expect(parseStudyUidList(null)).toEqual([]);
        });
    });

    describe('isValidStudyUid', () => {
        test('validates DICOM UID format accurately', () => {
            expect(isValidStudyUid('1.2.840.10008.1.1')).toBe(true);
            expect(isValidStudyUid('2.25.12345678901234567890')).toBe(true);
            expect(isValidStudyUid('invalid-uid')).toBe(false);
            expect(isValidStudyUid('1.2..3')).toBe(false);
            expect(isValidStudyUid('1.2.3.')).toBe(false);
            expect(isValidStudyUid('.1.2.3')).toBe(false);
        });
    });

    describe('decodeDicomUid', () => {
        test('decodes valid URI components or throws AppError on bad encoding', () => {
            expect(decodeDicomUid('1.2.840%2E10008')).toBe('1.2.840.10008');
            expect(() => decodeDicomUid('%E0%A4%A')).toThrow(AppError);
        });
    });

    describe('permissions and access helpers', () => {
        test('hasEffectivePermission handles Developer, standard permissions, and active break-glass', () => {
            expect(hasEffectivePermission({ role: 'Developer' }, 'ANY_PERM')).toBe(true);
            expect(hasEffectivePermission({ permissions: ['MANAGE_PACS'] }, 'MANAGE_PACS')).toBe(true);
            expect(hasEffectivePermission({ permissions: ['MANAGE_PACS'] }, 'OTHER_PERM')).toBe(false);

            const activeBreakGlassUser = {
                permissions: [],
                elevatedPermissions: ['VIEW_PACS_IMAGES'],
                breakGlassExpiry: Date.now() + 60000
            };
            expect(hasEffectivePermission(activeBreakGlassUser, 'VIEW_PACS_IMAGES')).toBe(true);

            const expiredBreakGlassUser = {
                permissions: [],
                elevatedPermissions: ['VIEW_PACS_IMAGES'],
                breakGlassExpiry: Date.now() - 10000
            };
            expect(hasEffectivePermission(expiredBreakGlassUser, 'VIEW_PACS_IMAGES')).toBe(false);
        });

        test('hasGlobalPacsAccess allows Developer, Admin, or MANAGE_PACS', () => {
            expect(hasGlobalPacsAccess({ role: 'Developer' })).toBe(true);
            expect(hasGlobalPacsAccess({ role: 'Admin' })).toBe(true);
            expect(hasGlobalPacsAccess({ role: 'Radiologist', permissions: ['MANAGE_PACS'] })).toBe(true);
            expect(hasGlobalPacsAccess({ role: 'Radiologist', permissions: [] })).toBe(false);
        });

        test('hasEmergencyClinicalPacsAccess validates emergency session parameters', () => {
            expect(hasEmergencyClinicalPacsAccess({
                emergencyAccessId: 'em-1',
                elevatedPermissions: ['VIEW_PACS_IMAGES'],
                breakGlassExpiry: Date.now() + 60000
            })).toBe(true);

            expect(hasEmergencyClinicalPacsAccess({
                emergencyAccessId: null,
                elevatedPermissions: ['VIEW_PACS_IMAGES'],
                breakGlassExpiry: Date.now() + 60000
            })).toBe(false);
        });

        test('shouldReturnEmptyScopedStudyBrowse detects scoped viewer browsing all studies', () => {
            const req = {
                authType: 'pacs_viewer_cookie',
                method: 'GET',
                query: {}
            };
            expect(shouldReturnEmptyScopedStudyBrowse(req, '/dicom-web/studies')).toBe(true);

            const reqWithStudy = {
                authType: 'pacs_viewer_cookie',
                method: 'GET',
                query: { StudyInstanceUID: '1.2.3' }
            };
            expect(shouldReturnEmptyScopedStudyBrowse(reqWithStudy, '/dicom-web/studies')).toBe(false);
        });
    });
});

describe('pacsExportService', () => {
    describe('safeFileStem', () => {
        test('strips illegal characters and limits filename length', () => {
            expect(safeFileStem('My Study / Exam: 123?*')).toBe('My_Study_Exam_123');
            expect(safeFileStem('', 'fallback-study')).toBe('fallback-study');
            expect(safeFileStem('   spaces   ')).toBe('spaces');
        });
    });

    describe('extensionForImage', () => {
        test('identifies image format by content-type', () => {
            expect(extensionForImage('image/png')).toBe('png');
            expect(extensionForImage('image/bmp')).toBe('bmp');
            expect(extensionForImage('image/jpeg')).toBe('jpg');
            expect(extensionForImage('')).toBe('jpg');
        });
    });

    describe('parseOrthancLookupResult', () => {
        test('extracts study identifier from Orthanc responses', () => {
            expect(parseOrthancLookupResult(['orthanc-id-1'])).toBe('orthanc-id-1');
            expect(parseOrthancLookupResult([{ Type: 'Study', ID: 'orthanc-study-id' }])).toBe('orthanc-study-id');
            expect(parseOrthancLookupResult([{ ID: 'orthanc-generic-id' }])).toBe('orthanc-generic-id');
            expect(parseOrthancLookupResult([])).toBeNull();
            expect(parseOrthancLookupResult(null)).toBeNull();
        });
    });
});
