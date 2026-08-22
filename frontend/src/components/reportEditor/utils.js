import { SECTION_CONFIG, BUILT_IN_REPORT_TEMPLATES } from './constants';
import { getInMemoryAccessToken } from '../../utils/accessToken';
import { generateUUID } from '../../utils/uuid';

const IMAGE_UPLOAD_BATCH_SIZE = 10;
const IMAGE_UPLOAD_TIMEOUT_MS = 12 * 60 * 1000;
const UPLOAD_PROGRESS_POLL_MS = 450;
const UPLOAD_PROGRESS_WEIGHT = 0.7;

export const buildReportText = (sections, t) => {
    return SECTION_CONFIG
        .map(config => {
            const val = sections[config.key]?.trim();
            if (!val) return '';
            const label = t(`sections.${config.key}`, config.key).toUpperCase();
            return `${label}:\n${val}`;
        })
        .filter(Boolean)
        .join('\n\n');
};

export const countWords = (text) => {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
};

export const formatDateTime = (dateStr, locale = 'en-US') => {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString(locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateStr;
    }
};

export const getBuiltInTemplatesForExam = (exam) => {
    if (!exam) return [];
    const modality = exam.modality_type?.toUpperCase();
    return BUILT_IN_REPORT_TEMPLATES.filter(
        tpl => tpl.modality_type?.toUpperCase() === modality
    );
};

export const isUuid = (val) => {
    if (typeof val !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
};

export const normalizeModality = (modality) => {
    if (!modality) return '';
    return modality.trim().toUpperCase();
};

export const normalizeSections = (item) => {
    if (!item) return {
        clinicalHistory: '',
        technique: '',
        findings: '',
        impression: '',
        recommendations: ''
    };
    return {
        clinicalHistory: item.report_sections?.clinicalHistory || item.clinical_indication || '',
        technique: item.report_sections?.technique || '',
        findings: item.report_sections?.findings || '',
        impression: item.report_sections?.impression || '',
        recommendations: item.report_sections?.recommendations || ''
    };
};

export const sectionsAreEqual = (a, b) => {
    if (!a || !b) return false;
    return (
        (a.clinicalHistory || '') === (b.clinicalHistory || '') &&
        (a.technique || '') === (b.technique || '') &&
        (a.findings || '') === (b.findings || '') &&
        (a.impression || '') === (b.impression || '') &&
        (a.recommendations || '') === (b.recommendations || '')
    );
};

export const templateToSections = (tpl) => {
    if (!tpl) return null;
    return {
        clinicalHistory: tpl.clinical_history || tpl.clinicalHistory || '',
        technique: tpl.technique || '',
        findings: tpl.findings || '',
        impression: tpl.impression || '',
        recommendations: tpl.recommendations || ''
    };
};

const uploadImageBatch = ({ examId, uploadSessionId, formData, onProgress }) =>
    new Promise((resolve, reject) => {
        const baseUrl = import.meta.env.VITE_API_URL || '/api';
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${baseUrl}/pacs/exams/${examId}/images`);
        xhr.withCredentials = true;
        xhr.timeout = IMAGE_UPLOAD_TIMEOUT_MS;

        const token = getInMemoryAccessToken();
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        let pollInterval = null;
        let lastEvent = null;

        const pollProgress = async () => {
            try {
                const response = await fetch(`${baseUrl}/pacs/exams/${examId}/upload-progress/${uploadSessionId}`, {
                    credentials: 'include',
                    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                });
                if (response.ok) {
                    const data = await response.json();
                    const processedCount = Number(data.processed || 0);
                    const storedCount = Number(data.stored || 0);
                    const reconciledCount = Number(data.reconciled || 0);
                    const unreconciledCount = Number(data.unreconciled || 0);
                    const failedCount = Number(data.failed || 0);
                    const rejectedCount = Number(data.rejected || 0);
                    const status = data.status || 'idle';
                    const serverHasWork = status !== 'idle'
                        || processedCount > 0
                        || storedCount > 0
                        || reconciledCount > 0
                        || unreconciledCount > 0
                        || failedCount > 0
                        || rejectedCount > 0;

                    if (!serverHasWork && !lastEvent) return;

                    onProgress?.({
                        ...lastEvent,
                        phase: serverHasWork ? 'processing' : (lastEvent?.phase || 'uploading'),
                        processedCount,
                        storedCount,
                        reconciledCount,
                        unreconciledCount,
                        failedCount,
                        rejectedCount,
                        processingTotal: Number(data.total || 0),
                        processingStatus: status,
                        currentFile: data.currentFile || null,
                        activeFiles: Array.isArray(data.activeFiles) ? data.activeFiles : [],
                        lastError: data.lastError || null,
                        serverStartedAt: data.startedAt || null,
                        serverUpdatedAt: data.updatedAt || null
                    });
                }
            } catch {
                // The upload request remains authoritative if a progress poll fails.
            }
        };

        const startPolling = () => {
            if (pollInterval || !uploadSessionId) return;
            void pollProgress();
            pollInterval = setInterval(pollProgress, UPLOAD_PROGRESS_POLL_MS);
        };

        const stopPolling = () => {
            if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
            }
        };

        xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) {
                lastEvent = { percent: null, loaded: event.loaded || 0, total: null, phase: 'uploading' };
                onProgress?.(lastEvent);
                return;
            }
            const isProcessing = event.loaded >= event.total;
            lastEvent = {
                percent: Math.min(99, Math.round((event.loaded / event.total) * 100)),
                loaded: event.loaded,
                total: event.total,
                phase: isProcessing ? 'processing' : 'uploading'
            };
            onProgress?.(lastEvent);
        };

        xhr.upload.onload = () => {
            lastEvent = {
                ...(lastEvent || {}),
                percent: 99,
                loaded: lastEvent?.total || lastEvent?.loaded || null,
                total: lastEvent?.total || null,
                phase: 'processing'
            };
            onProgress?.(lastEvent);
            startPolling();
        };

        xhr.onload = () => {
            stopPolling();
            let payload = null;
            try {
                payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
            } catch {
                payload = null;
            }

            if (xhr.status >= 200 && xhr.status < 300) {
                const sessionProgress = payload?.upload_progress || {};
                onProgress?.({
                    percent: 100,
                    loaded: null,
                    total: null,
                    phase: 'done',
                    processedCount: Number(sessionProgress.processed ?? payload?.total ?? payload?.results?.length ?? 0),
                    storedCount: Number(sessionProgress.stored ?? payload?.stored ?? 0),
                    reconciledCount: Number(sessionProgress.reconciled ?? payload?.reconciled ?? 0),
                    unreconciledCount: Number(sessionProgress.unreconciled ?? payload?.unreconciled ?? 0),
                    failedCount: Number(sessionProgress.failed ?? payload?.failed ?? (payload?.results || []).filter(result => result.status === 'error').length),
                    rejectedCount: Number(sessionProgress.rejected ?? payload?.rejected ?? (payload?.results || []).filter(result => result.status === 'rejected').length),
                    processingTotal: Number(sessionProgress.total ?? payload?.total ?? payload?.results?.length ?? 0),
                    processingStatus: sessionProgress.status || (payload?.unreconciled || payload?.failed || payload?.rejected
                        ? 'partial'
                        : (payload?.reconciled ? 'complete' : 'failed'))
                });
                resolve(payload);
                return;
            }

            reject(payload || new Error(`Upload failed (${xhr.status})`));
        };

        xhr.onerror = () => {
            stopPolling();
            reject(new Error('Network error during image upload'));
        };
        xhr.ontimeout = () => {
            stopPolling();
            reject(new Error('Image upload timed out'));
        };
        xhr.onabort = () => {
            stopPolling();
            reject(new Error('Image upload canceled'));
        };

        onProgress?.({ percent: 0, loaded: 0, total: null, phase: 'uploading' });
        xhr.send(formData);
        startPolling();
    });

export const uploadExamImagesWithProgress = async ({
    examId,
    files,
    orderNumber,
    onProgress
}) => {
    const batches = [];
    for (let index = 0; index < files.length; index += IMAGE_UPLOAD_BATCH_SIZE) {
        batches.push(files.slice(index, index + IMAGE_UPLOAD_BATCH_SIZE));
    }

    const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
    const uploadSessionId = generateUUID();
    // || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const aggregate = {
        stored: 0,
        reconciled: 0,
        unreconciled: 0,
        failed: 0,
        rejected: 0,
        total: files.length,
        results: [],
        image_count: undefined,
        study_instance_uid: undefined
    };
    let completedBytes = 0;
    let latestProcessed = 0;
    let latestStored = 0;
    let latestReconciled = 0;
    let latestUnreconciled = 0;
    let latestFailed = 0;
    let latestRejected = 0;
    let displayedPercent = 0;
    let processingStartedAt = null;
    const uploadStartedAt = Date.now();

    for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        const batchBytes = batch.reduce((sum, file) => sum + Number(file.size || 0), 0);
        const formData = new FormData();
        batch.forEach((file) => formData.append('files', file));
        formData.append('examId', examId);
        formData.append('uploadSessionId', uploadSessionId);
        formData.append('totalFiles', String(files.length));
        if (orderNumber) formData.append('orderNumber', orderNumber);

        const response = await uploadImageBatch({
            examId,
            uploadSessionId,
            formData,
            onProgress: (progress) => {
                const batchLoaded = Math.min(batchBytes, Number(progress.loaded ?? batchBytes));
                const loaded = Math.min(totalBytes, completedBytes + batchLoaded);
                const isLastBatch = index === batches.length - 1;

                latestProcessed = Math.max(latestProcessed, Number(progress.processedCount || 0));
                latestStored = Math.max(latestStored, Number(progress.storedCount || 0));
                latestReconciled = Math.max(latestReconciled, Number(progress.reconciledCount || 0));
                latestUnreconciled = Math.max(latestUnreconciled, Number(progress.unreconciledCount || 0));
                latestFailed = Math.max(latestFailed, Number(progress.failedCount || 0));
                latestRejected = Math.max(latestRejected, Number(progress.rejectedCount || 0));
                if (progress.phase === 'processing' && !processingStartedAt) {
                    processingStartedAt = Date.now();
                }

                const uploadRatio = totalBytes > 0 ? loaded / totalBytes : 0;
                const processingRatio = files.length > 0 ? latestProcessed / files.length : 0;
                const calculatedPercent = Math.round(
                    (uploadRatio * UPLOAD_PROGRESS_WEIGHT * 100)
                    + (processingRatio * (1 - UPLOAD_PROGRESS_WEIGHT) * 100)
                );
                displayedPercent = progress.phase === 'done' && isLastBatch
                    ? 100
                    : Math.max(displayedPercent, Math.min(99, calculatedPercent));
                const now = Date.now();
                const elapsedSeconds = Math.max(0, Math.round((now - uploadStartedAt) / 1000));
                const uploadElapsedSeconds = Math.max(0.1, (now - uploadStartedAt) / 1000);
                const bytesPerSecond = loaded > 0 ? Math.round(loaded / uploadElapsedSeconds) : 0;
                const processingElapsedSeconds = processingStartedAt
                    ? Math.max(0.1, (now - processingStartedAt) / 1000)
                    : 0;
                const processedPerSecond = processingElapsedSeconds && latestProcessed > 0
                    ? latestProcessed / processingElapsedSeconds
                    : 0;
                const etaSeconds = progress.phase === 'processing'
                    ? (processedPerSecond > 0
                        ? Math.max(0, Math.ceil((files.length - latestProcessed) / processedPerSecond))
                        : null)
                    : (bytesPerSecond > 0
                        ? Math.max(0, Math.ceil((totalBytes - loaded) / bytesPerSecond))
                        : null);

                onProgress?.({
                    ...progress,
                    percent: displayedPercent,
                    loaded,
                    total: totalBytes,
                    files: files.length,
                    processedCount: latestProcessed,
                    storedCount: latestStored,
                    reconciledCount: latestReconciled,
                    unreconciledCount: latestUnreconciled,
                    failedCount: latestFailed,
                    rejectedCount: latestRejected,
                    processingTotal: files.length,
                    processingStatus: progress.processingStatus,
                    currentFile: progress.currentFile,
                    activeFiles: progress.activeFiles || [],
                    lastError: progress.lastError,
                    bytesPerSecond,
                    elapsedSeconds,
                    etaSeconds,
                    batch: index + 1,
                    batches: batches.length,
                    phase: progress.phase === 'done' && !isLastBatch
                        ? 'uploading'
                        : progress.phase
                });
            }
        });

        completedBytes += batchBytes;
        aggregate.stored += Number(response?.stored || 0);
        aggregate.reconciled += Number(response?.reconciled || 0);
        aggregate.unreconciled += Number(response?.unreconciled || 0);
        aggregate.failed += Number(response?.failed || 0);
        aggregate.rejected += Number(response?.rejected || 0);
        aggregate.results.push(...(response?.results || []));
        aggregate.image_count = response?.image_count ?? aggregate.image_count;
        aggregate.study_instance_uid = response?.study_instance_uid || aggregate.study_instance_uid;
    }

    return aggregate;
};
