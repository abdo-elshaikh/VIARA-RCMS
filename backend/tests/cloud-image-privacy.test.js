const { assertCloudImagePrivacy } = require('../src/services/cloudImagePrivacyService');
const originalFetch = global.fetch;
const originalPrivacyGate = process.env.PACS_CLOUD_IMAGE_DEIDENTIFICATION_VERIFIED;
afterEach(() => {
    global.fetch = originalFetch;
    if (originalPrivacyGate === undefined) delete process.env.PACS_CLOUD_IMAGE_DEIDENTIFICATION_VERIFIED;
    else process.env.PACS_CLOUD_IMAGE_DEIDENTIFICATION_VERIFIED = originalPrivacyGate;
});
const auth = { url: 'http://orthanc:8042', username: 'synthetic', password: 'synthetic' };

test.each([
    {}, { PatientIdentityRemoved: 'YES' },
    { PatientIdentityRemoved: 'NO', BurnedInAnnotation: 'NO' },
    { PatientIdentityRemoved: 'YES', BurnedInAnnotation: 'YES' }
])('blocks cloud image transfer when privacy is unverified: %j', async tags => {
    process.env.PACS_CLOUD_IMAGE_DEIDENTIFICATION_VERIFIED = 'true';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => tags });
    await expect(assertCloudImagePrivacy('synthetic-instance', auth)).rejects.toMatchObject({ code: 'CLOUD_IMAGE_PRIVACY_REQUIRED' });
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/simplified-tags$/);
});

test('allows only explicitly de-identified pixels and prevents redirects', async () => {
    process.env.PACS_CLOUD_IMAGE_DEIDENTIFICATION_VERIFIED = 'true';
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ PatientIdentityRemoved: 'YES', BurnedInAnnotation: 'NO' }) });
    await expect(assertCloudImagePrivacy('synthetic-instance', auth)).resolves.toBeUndefined();
    expect(global.fetch.mock.calls[0][1].redirect).toBe('error');
});

test('tag lookup failure blocks the cloud image path', async () => {
    process.env.PACS_CLOUD_IMAGE_DEIDENTIFICATION_VERIFIED = 'true';
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    await expect(assertCloudImagePrivacy('synthetic-instance', auth)).rejects.toThrow('Cannot verify DICOM privacy');
});

test('does not query Orthanc until pixel de-identification is explicitly confirmed', async () => {
    delete process.env.PACS_CLOUD_IMAGE_DEIDENTIFICATION_VERIFIED;
    global.fetch = jest.fn();
    await expect(assertCloudImagePrivacy('synthetic-instance', auth)).rejects.toMatchObject({
        code: 'CLOUD_IMAGE_PIXEL_PRIVACY_UNVERIFIED'
    });
    expect(global.fetch).not.toHaveBeenCalled();
});

test('unverified study never fetches pixels or calls a cloud provider', async () => {
    const prior = process.env.ORTHANC_PASSWORD;
    const priorPrivacyGate = process.env.PACS_CLOUD_IMAGE_DEIDENTIFICATION_VERIFIED;
    process.env.ORTHANC_PASSWORD = 'synthetic';
    delete process.env.PACS_CLOUD_IMAGE_DEIDENTIFICATION_VERIFIED;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    try {
        const { analyzeStudy } = require('../src/services/cloudVisionService');
        await expect(analyzeStudy({
            study: { modality: 'MR', imageCount: 1 },
            series: [{ seriesInstanceUid: '1.2.3', instances: [{ orthancId: 'synthetic-instance', sopInstanceUid: '1.2.3.4' }] }]
        }, { provider: 'cloud-openai', apiKey: 'synthetic-key' })).rejects.toMatchObject({ code: 'CLOUD_IMAGE_PIXEL_PRIVACY_UNVERIFIED' });
        expect(global.fetch).not.toHaveBeenCalled();
    } finally {
        if (prior === undefined) delete process.env.ORTHANC_PASSWORD;
        else process.env.ORTHANC_PASSWORD = prior;
        if (priorPrivacyGate === undefined) delete process.env.PACS_CLOUD_IMAGE_DEIDENTIFICATION_VERIFIED;
        else process.env.PACS_CLOUD_IMAGE_DEIDENTIFICATION_VERIFIED = priorPrivacyGate;
    }
});
