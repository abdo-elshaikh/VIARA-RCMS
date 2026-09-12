jest.mock('../src/config/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

jest.mock('../src/services/pacsDicomWebService', () => ({
    proxyToOrthanc: jest.fn(async () => { }),
    getOrthancUrl: jest.fn(async () => 'http://orthanc'),
    getOrthancAuthHeader: jest.fn(async () => 'Basic test')
}));

jest.mock('../src/services/pacsReconcileService', () => ({
    reconcileInstance: jest.fn(),
    reconcileQuarantine: jest.fn(),
    discardQuarantine: jest.fn(),
    writeAudit: jest.fn(async () => { })
}));

const { proxyToOrthanc, getOrthancUrl, getOrthancAuthHeader } = require('../src/services/pacsDicomWebService');
const { writeAudit } = require('../src/services/pacsReconcileService');
const {
    dicomWebProxy,
    exportPacsStudy,
    getExamImagingStatus,
    retryPacsAiJob
} = require('../src/controllers/pacsController');

const originalFetch = global.fetch;

const makeRes = () => ({
    setTimeout: jest.fn(),
    setHeader: jest.fn(),
    end: jest.fn(),
    headersSent: false,
    json: jest.fn(),
    status: jest.fn(function status() { return this; })
});

describe('PACS controller authorization', () => {
    afterEach(() => {
        jest.clearAllMocks();
        global.fetch = originalFetch;
    });

    it('rejects a scoped viewer WADO request when the SOP is not indexed to the allowed study', async () => {
        const db = { query: jest.fn(async () => ({ rows: [] })) };
        const req = {
            method: 'GET',
            params: { 0: 'wado', 1: '' },
            query: { studyUID: '1.2.3', objectUID: '9.9.9' },
            originalUrl: '/api/pacs/wado?studyUID=1.2.3&objectUID=9.9.9',
            authType: 'pacs_viewer_cookie',
            user: {
                role: 'Radiologist',
                user_id: 'user-1',
                study_instance_uids: ['1.2.3']
            },
            setTimeout: jest.fn()
        };
        const next = jest.fn();

        await dicomWebProxy(db)(req, makeRes(), next);

        expect(proxyToOrthanc).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
        expect(writeAudit).toHaveBeenCalledWith(db, expect.objectContaining({
            eventType: 'PACS_ACCESS_DENIED',
            statusCode: 403
        }));
    });

    it('allows scoped viewer series metadata when the path is already scoped to the allowed study', async () => {
        const db = { query: jest.fn(async () => ({ rows: [] })) };
        const req = {
            method: 'GET',
            params: { 0: 'dicom-web', 1: '/studies/1.2.3/series/1.2.3.4/metadata' },
            query: {},
            originalUrl: '/api/pacs/dicom-web/studies/1.2.3/series/1.2.3.4/metadata',
            authType: 'pacs_viewer_cookie',
            user: {
                role: 'Radiologist',
                user_id: 'user-1',
                study_instance_uids: ['1.2.3']
            },
            setTimeout: jest.fn()
        };
        const next = jest.fn();

        await dicomWebProxy(db)(req, makeRes(), next);

        expect(next).not.toHaveBeenCalled();
        expect(proxyToOrthanc).toHaveBeenCalledWith(
            req,
            expect.any(Object),
            '/dicom-web/studies/1.2.3/series/1.2.3.4/metadata'
        );
    });

    it('returns an empty safe study list for scoped viewer patient-level browse requests', async () => {
        const db = { query: jest.fn(async () => ({ rows: [] })) };
        const req = {
            method: 'GET',
            params: { 0: 'dicom-web', 1: '/studies' },
            query: { '00100020': '25963..', limit: '101' },
            originalUrl: '/api/pacs/dicom-web/studies?00100020=25963..&limit=101',
            authType: 'pacs_viewer_cookie',
            user: {
                role: 'Radiologist',
                user_id: 'user-1',
                study_instance_uids: ['1.2.3']
            },
            setTimeout: jest.fn()
        };
        const res = makeRes();
        const next = jest.fn();

        await dicomWebProxy(db)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(proxyToOrthanc).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith([]);
        expect(res.setHeader).toHaveBeenCalledWith('X-VIARA-DICOMweb-Scoped', 'empty-study-browse');
    });

    it('does not treat RECONCILE_STUDIES as global DICOMweb image access', async () => {
        const db = { query: jest.fn(async () => ({ rows: [] })) };
        const req = {
            method: 'GET',
            params: { 0: 'dicom-web', 1: '/studies/1.2.3/metadata' },
            query: {},
            originalUrl: '/api/pacs/dicom-web/studies/1.2.3/metadata',
            authType: 'jwt',
            user: {
                role: 'Radiologist',
                user_id: '00000000-0000-0000-0000-000000000001',
                permissions: ['VIEW_PACS_IMAGES', 'RECONCILE_STUDIES']
            },
            setTimeout: jest.fn()
        };
        const next = jest.fn();

        await dicomWebProxy(db)(req, makeRes(), next);

        expect(proxyToOrthanc).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
        expect(writeAudit).toHaveBeenCalledWith(db, expect.objectContaining({
            eventType: 'PACS_ACCESS_DENIED',
            statusCode: 403
        }));
    });

    it('does not let a PACS manager browse private studies without emergency access', async () => {
        const db = { query: jest.fn() };
        const req = {
            method: 'GET',
            params: { 0: 'dicom-web', 1: '/studies' },
            query: {},
            originalUrl: '/api/pacs/dicom-web/studies',
            authType: 'jwt',
            user: {
                role: 'Admin',
                user_id: '00000000-0000-0000-0000-000000000002',
                permissions: ['MANAGE_PACS']
            },
            setTimeout: jest.fn()
        };
        const next = jest.fn();

        await dicomWebProxy(db)(req, makeRes(), next);

        expect(proxyToOrthanc).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
    });

    it('allows audited emergency access to browse PACS studies', async () => {
        const db = { query: jest.fn() };
        const req = {
            method: 'GET',
            params: { 0: 'dicom-web', 1: '/studies' },
            query: {},
            originalUrl: '/api/pacs/dicom-web/studies',
            authType: 'jwt',
            user: {
                role: 'Admin',
                user_id: '00000000-0000-0000-0000-000000000002',
                permissions: ['MANAGE_PACS'],
                emergencyAccessId: '00000000-0000-4000-8000-000000000099',
                elevatedPermissions: ['VIEW_PACS_IMAGES'],
                breakGlassExpiry: Date.now() + 60000
            },
            setTimeout: jest.fn()
        };
        const next = jest.fn();

        await dicomWebProxy(db)(req, makeRes(), next);

        expect(next).not.toHaveBeenCalled();
        expect(proxyToOrthanc).toHaveBeenCalledWith(req, expect.any(Object), '/dicom-web/studies');
    });

    it('does not return imaging metadata for an unassigned exam', async () => {
        const db = { query: jest.fn(async () => ({ rows: [] })) };
        const req = {
            params: { examId: 'exam-1' },
            user: {
                role: 'Technician',
                user_id: '00000000-0000-0000-0000-000000000003',
                permissions: ['VIEW_PACS_IMAGES']
            }
        };
        const next = jest.fn();

        await getExamImagingStatus(db)(req, makeRes(), next);

        expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
        expect(writeAudit).toHaveBeenCalledWith(db, expect.objectContaining({
            eventType: 'PACS_ACCESS_DENIED',
            statusCode: 403
        }));
    });

    it('does not mutate an AI job before checking exam assignment', async () => {
        const db = {
            query: jest.fn(async (sql) => {
                if (sql.includes('FROM pacs_ai_analysis_jobs')) {
                    return { rows: [{ job_id: 'job-1', exam_id: 'exam-1' }] };
                }
                return { rows: [] };
            })
        };
        const req = {
            params: { jobId: 'job-1' },
            user: {
                role: 'Technician',
                user_id: '00000000-0000-0000-0000-000000000004',
                permissions: ['VIEW_PACS_IMAGES']
            }
        };
        const next = jest.fn();

        await retryPacsAiJob(db)(req, makeRes(), next);

        expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
        expect(db.query.mock.calls.some((call) => call[0].includes('UPDATE pacs_ai_analysis_jobs'))).toBe(false);
        expect(writeAudit).toHaveBeenCalledWith(db, expect.objectContaining({
            eventType: 'PACS_ACCESS_DENIED',
            statusCode: 403
        }));
    });

    it('denies PACS study export when the study is outside the user scope', async () => {
        const db = { query: jest.fn(async () => ({ rows: [] })) };
        const req = {
            method: 'GET',
            params: { studyInstanceUid: '1.2.3' },
            query: { format: 'dicom' },
            originalUrl: '/api/pacs/studies/1.2.3/export?format=dicom',
            user: {
                role: 'Radiologist',
                user_id: '00000000-0000-0000-0000-000000000005',
                permissions: ['VIEW_PACS_IMAGES']
            },
            setTimeout: jest.fn()
        };
        const next = jest.fn();

        await exportPacsStudy(db)(req, makeRes(), next);

        expect(getOrthancUrl).not.toHaveBeenCalled();
        expect(next.mock.calls[0][0]).toMatchObject({ statusCode: 403 });
        expect(writeAudit).toHaveBeenCalledWith(db, expect.objectContaining({
            eventType: 'PACS_ACCESS_DENIED',
            statusCode: 403,
            detail: expect.objectContaining({ action: 'export_study', format: 'dicom' })
        }));
    });

    it('exports rendered PACS images as a ZIP after study access is authorized', async () => {
        const db = {
            query: jest.fn(async (sql) => {
                if (sql.includes('LEFT JOIN appointments')) {
                    return { rows: [{ study_instance_uid: '1.2.3' }] };
                }
                return {
                    rows: [{
                        exam_id: 'exam-1',
                        order_number: 'ACC-100',
                        study_instance_uid: '1.2.3',
                        orthanc_study_id: 'orthanc-study-1',
                        image_count: 1,
                        exam_type_name: 'Chest',
                        modality_name: 'CR',
                        mrn: 'MRN-1'
                    }]
                };
            })
        };
        global.fetch = jest.fn(async (url) => {
            const href = String(url);
            if (href.endsWith('/studies/orthanc-study-1')) {
                return new Response(JSON.stringify({ Series: ['series-1'] }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' }
                });
            }
            if (href.endsWith('/series/series-1')) {
                return new Response(JSON.stringify({
                    MainDicomTags: { SeriesNumber: '1', SeriesDescription: 'Chest PA' },
                    Instances: ['instance-1']
                }), {
                    status: 200,
                    headers: { 'content-type': 'application/json' }
                });
            }
            if (href.endsWith('/instances/instance-1/preview')) {
                return new Response(Buffer.from([1, 2, 3]), {
                    status: 200,
                    headers: { 'content-type': 'image/jpeg' }
                });
            }
            throw new Error(`unexpected fetch ${href}`);
        });
        const req = {
            method: 'GET',
            params: { studyInstanceUid: '1.2.3' },
            query: { format: 'images', examId: 'exam-1' },
            originalUrl: '/api/pacs/studies/1.2.3/export?format=images&examId=exam-1',
            user: {
                role: 'Admin',
                user_id: '00000000-0000-0000-0000-000000000006',
                permissions: ['VIEW_PACS_IMAGES']
            },
            setTimeout: jest.fn()
        };
        const res = makeRes();
        const next = jest.fn();

        await exportPacsStudy(db)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.setHeader).toHaveBeenCalledWith('X-VIARA-PACS-Export-Format', 'images');
        expect(Buffer.isBuffer(res.end.mock.calls[0][0])).toBe(true);
        expect(res.end.mock.calls[0][0].subarray(0, 4).toString('hex')).toBe('504b0304');
        expect(writeAudit).toHaveBeenCalledWith(db, expect.objectContaining({
            eventType: 'STUDY_EXPORTED',
            detail: expect.objectContaining({ format: 'images', imageCount: 1, seriesCount: 1 })
        }));
    });
});
