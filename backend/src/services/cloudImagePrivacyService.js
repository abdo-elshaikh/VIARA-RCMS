// Rendered pixels can still contain identifying text. Only an explicitly
// de-identified source may enter the cloud image path; unknown is not approval.
const assertCloudImagePrivacy = async (instanceId, auth) => {
    if (String(process.env.PACS_CLOUD_IMAGE_DEIDENTIFICATION_VERIFIED || '').toLowerCase() !== 'true') {
        const error = new Error('Cloud image analysis is disabled until a validated pixel de-identification pipeline is confirmed');
        error.code = 'CLOUD_IMAGE_PIXEL_PRIVACY_UNVERIFIED';
        throw error;
    }

    const response = await fetch(`${auth.url.replace(/\/+$/, '')}/instances/${encodeURIComponent(instanceId)}/simplified-tags`, {
        headers: { Authorization: 'Basic ' + Buffer.from(`${auth.username}:${auth.password}`).toString('base64') },
        signal: AbortSignal.timeout(15000), redirect: 'error'
    });
    if (!response.ok) throw new Error('Cannot verify DICOM privacy before cloud analysis');
    const tags = await response.json();
    if (String(tags.PatientIdentityRemoved || '').trim().toUpperCase() !== 'YES'
        || String(tags.BurnedInAnnotation || '').trim().toUpperCase() !== 'NO') {
        const error = new Error('Cloud image analysis requires a de-identified source with PatientIdentityRemoved=YES and BurnedInAnnotation=NO');
        error.code = 'CLOUD_IMAGE_PRIVACY_REQUIRED';
        throw error;
    }
};

module.exports = { assertCloudImagePrivacy };
