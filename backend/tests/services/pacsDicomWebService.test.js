jest.mock('../../src/config/logger', () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

process.env.ORTHANC_URL = 'http://orthanc:8042';
process.env.ORTHANC_USERNAME = 'rcms';
process.env.ORTHANC_PASSWORD = 'secret';

const dcmjs = require('dcmjs');
const { EventEmitter } = require('events');
const { Writable } = require('stream');
const {
    proxyToOrthanc,
    rewriteDicomJsonBulkDataUris
} = require('../../src/services/pacsDicomWebService');

const { DicomDict, DicomMetaDictionary } = dcmjs.data;

const makeResponse = () => {
    const chunks = [];
    const res = new Writable({
        write(chunk, encoding, callback) {
            chunks.push(Buffer.from(chunk));
            callback();
        }
    });
    res.status = jest.fn(() => res);
    res.setHeader = jest.fn();
    res.body = () => Buffer.concat(chunks);
    return res;
};

const makeRequest = (properties) => Object.assign(new EventEmitter(), properties);

const makeGrayscaleDicom = () => {
    const ds = {
        PatientID: 'P1',
        StudyInstanceUID: DicomMetaDictionary.uid(),
        SeriesInstanceUID: DicomMetaDictionary.uid(),
        SOPInstanceUID: '7.8.11',
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.7',
        Modality: 'OT',
        Rows: 2,
        Columns: 2,
        SamplesPerPixel: 1,
        PhotometricInterpretation: 'MONOCHROME2',
        BitsAllocated: 16,
        BitsStored: 16,
        HighBit: 15,
        PixelRepresentation: 0,
        PixelData: new Uint16Array([0, 100, 200, 400]).buffer
    };
    const dict = new DicomDict({
        TransferSyntaxUID: '1.2.840.10008.1.2.1',
        MediaStorageSOPClassUID: ds.SOPClassUID,
        MediaStorageSOPInstanceUID: ds.SOPInstanceUID
    });
    const originalConsoleError = console.error;
    console.error = jest.fn();
    try {
        dict.dict = DicomMetaDictionary.denaturalizeDataset(ds);
        return Buffer.from(dict.write());
    } finally {
        console.error = originalConsoleError;
    }
};

describe('pacsDicomWebService', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('falls back to Orthanc preview when DICOMweb rendered retrieval fails', async () => {
        const image = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
        global.fetch = jest.fn()
            .mockResolvedValueOnce(new Response('not acceptable', { status: 406 }))
            .mockResolvedValueOnce(new Response(JSON.stringify(['orthanc-instance-1']), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            }))
            .mockResolvedValueOnce(new Response(image, {
                status: 200,
                headers: { 'content-type': 'image/jpeg' }
            }));

        const req = makeRequest({
            method: 'GET',
            headers: { accept: 'image/avif,image/webp,*/*' },
            originalUrl: '/api/pacs/dicom-web/studies/1.2.3/series/4.5.6/instances/7.8.9/rendered'
        });
        const res = makeResponse();

        await proxyToOrthanc(req, res, '/dicom-web/studies/1.2.3/series/4.5.6/instances/7.8.9/rendered');

        expect(global.fetch).toHaveBeenNthCalledWith(
            1,
            'http://orthanc:8042/dicom-web/studies/1.2.3/series/4.5.6/instances/7.8.9/rendered',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Basic cmNtczpzZWNyZXQ=',
                    accept: 'image/jpeg'
                })
            })
        );
        expect(global.fetch).toHaveBeenNthCalledWith(
            2,
            'http://orthanc:8042/tools/find',
            expect.objectContaining({
                body: JSON.stringify({
                    Level: 'Instance',
                    Query: { SOPInstanceUID: '7.8.9' },
                    Limit: 1
                })
            })
        );
        expect(global.fetch).toHaveBeenNthCalledWith(
            3,
            'http://orthanc:8042/instances/orthanc-instance-1/preview',
            expect.any(Object)
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.setHeader).toHaveBeenCalledWith('content-type', 'image/jpeg');
        expect(res.body()).toEqual(image);
    });

    it('falls back to Orthanc preview when legacy WADO-URI rendering fails', async () => {
        const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        global.fetch = jest.fn()
            .mockResolvedValueOnce(new Response('engine failed', { status: 500 }))
            .mockResolvedValueOnce(new Response(JSON.stringify(['orthanc-instance-2']), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            }))
            .mockResolvedValueOnce(new Response(image, {
                status: 200,
                headers: { 'content-type': 'image/png' }
            }));

        const req = makeRequest({
            method: 'GET',
            headers: { accept: '*/*' },
            originalUrl: '/api/pacs/wado?requestType=WADO&studyUID=1.2.3&seriesUID=4.5.6&objectUID=7.8.10&contentType=image/jpeg'
        });
        const res = makeResponse();

        await proxyToOrthanc(req, res, '/wado');

        expect(global.fetch).toHaveBeenNthCalledWith(
            1,
            'http://orthanc:8042/wado?requestType=WADO&studyUID=1.2.3&seriesUID=4.5.6&objectUID=7.8.10&contentType=image/jpeg',
            expect.any(Object)
        );
        expect(global.fetch).toHaveBeenNthCalledWith(
            2,
            'http://orthanc:8042/tools/find',
            expect.objectContaining({
                body: JSON.stringify({
                    Level: 'Instance',
                    Query: { SOPInstanceUID: '7.8.10' },
                    Limit: 1
                })
            })
        );
        expect(global.fetch).toHaveBeenNthCalledWith(
            3,
            'http://orthanc:8042/instances/orthanc-instance-2/preview',
            expect.any(Object)
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.setHeader).toHaveBeenCalledWith('content-type', 'image/png');
        expect(res.body()).toEqual(image);
    });

    it('renders a BMP fallback from DICOM pixels when Orthanc preview cannot decode them', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(new Response('not acceptable', { status: 406 }))
            .mockResolvedValueOnce(new Response(JSON.stringify(['orthanc-instance-3']), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            }))
            .mockResolvedValueOnce(new Response('unsupported media type', { status: 415 }))
            .mockResolvedValueOnce(new Response(makeGrayscaleDicom(), {
                status: 200,
                headers: { 'content-type': 'application/dicom' }
            }));

        const req = makeRequest({
            method: 'GET',
            headers: { accept: 'image/avif,image/webp,*/*' },
            originalUrl: '/api/pacs/dicom-web/studies/1.2.3/series/4.5.6/instances/7.8.11/rendered'
        });
        const res = makeResponse();

        await proxyToOrthanc(req, res, '/dicom-web/studies/1.2.3/series/4.5.6/instances/7.8.11/rendered');

        expect(global.fetch).toHaveBeenNthCalledWith(
            4,
            'http://orthanc:8042/instances/orthanc-instance-3/file',
            expect.any(Object)
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.setHeader).toHaveBeenCalledWith('content-type', 'image/bmp');
        expect(res.body().subarray(0, 2).toString('ascii')).toBe('BM');
    });

    it('rewrites nested Orthanc bulk data URIs through the authenticated RCMS proxy', () => {
        const payload = [{
            '60003000': {
                vr: 'OW',
                BulkDataURI: 'http://127.0.0.1:8042/dicom-web/studies/1.2.3/series/4.5.6/instances/7.8.9/bulk/60003000?frame=1'
            },
            '0040A730': {
                vr: 'SQ',
                Value: [{
                    '7FE00010': {
                        vr: 'OB',
                        BulkDataURI: '/dicom-web/studies/1.2.3/series/4.5.6/instances/7.8.9/bulk/7FE00010'
                    }
                }]
            },
            documentationUrl: 'https://example.test/dicom-web/help'
        }];

        rewriteDicomJsonBulkDataUris(payload);

        expect(payload[0]['60003000'].BulkDataURI).toBe(
            '/api/pacs/dicom-web/studies/1.2.3/series/4.5.6/instances/7.8.9/bulk/60003000?frame=1'
        );
        expect(payload[0]['0040A730'].Value[0]['7FE00010'].BulkDataURI).toBe(
            '/api/pacs/dicom-web/studies/1.2.3/series/4.5.6/instances/7.8.9/bulk/7FE00010'
        );
        expect(payload[0].documentationUrl).toBe('https://example.test/dicom-web/help');
    });

    it('returns rewritten DICOM JSON metadata from the proxy', async () => {
        const upstreamPayload = [{
            '60003000': {
                vr: 'OW',
                BulkDataURI: 'http://127.0.0.1:8042/dicom-web/studies/1.2.3/series/4.5.6/instances/7.8.9/bulk/60003000'
            }
        }];
        global.fetch = jest.fn().mockResolvedValueOnce(new Response(
            JSON.stringify(upstreamPayload),
            {
                status: 200,
                headers: {
                    'content-type': 'application/dicom+json',
                    'content-length': '999',
                    etag: 'stale-upstream-etag'
                }
            }
        ));
        const req = makeRequest({
            method: 'GET',
            headers: { accept: 'application/dicom+json' },
            originalUrl: '/api/pacs/dicom-web/studies/1.2.3/series/4.5.6/metadata'
        });
        const res = makeResponse();

        await proxyToOrthanc(req, res, '/dicom-web/studies/1.2.3/series/4.5.6/metadata');

        const body = JSON.parse(res.body().toString('utf8'));
        expect(body[0]['60003000'].BulkDataURI).toBe(
            '/api/pacs/dicom-web/studies/1.2.3/series/4.5.6/instances/7.8.9/bulk/60003000'
        );
        expect(res.setHeader).not.toHaveBeenCalledWith('content-length', '999');
        expect(res.setHeader).not.toHaveBeenCalledWith('etag', 'stale-upstream-etag');
        expect(res.setHeader).toHaveBeenCalledWith(
            'Content-Length',
            String(res.body().length)
        );
    });
});
