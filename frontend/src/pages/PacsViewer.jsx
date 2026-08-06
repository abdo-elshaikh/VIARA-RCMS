import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeft,
    AlertTriangle,
    Archive,
    CalendarDays,
    ChevronDown,
    Check,
    Copy,
    Disc,
    Download,
    ExternalLink,
    FileText,
    Hash,
    Image as ImageIcon,
    ImageOff,
    Info,
    ListFilter,
    Loader2,
    Maximize2,
    Minimize2,
    Monitor,
    RefreshCw,
    Server,
    ShieldAlert,
    ShieldCheck,
    UserRound,
    WifiOff,
    X,
    Play,
    Pause,
    SkipBack,
    SkipForward,
    RotateCcw,
    RotateCw,
    FlipHorizontal,
    FlipVertical,
    ZoomIn,
    ZoomOut,
    Move,
    SunMedium,
    Ruler,
    Sparkles,
    Layers,
    Grid,
    Sliders,
    Star,
    Compass,
    Eye,
    ChevronLeft,
    ChevronRight,
    Search
} from 'lucide-react';
import { authenticatedFetch, downloadAuthenticatedFile } from '../utils/authenticatedFetch';
import { analyzeStudyDisplaySets, groupInstancesBySeries } from '../utils/analyzeDisplaySets';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const OHIF_BASE = import.meta.env.VITE_OHIF_URL || '';

const RETRY_DELAYS_MS = [2000, 4000, 8000, 15000];
const SLOW_LOAD_WARN_MS = 12000;
const COPY_FEEDBACK_MS = 1600;
const VIEWER_SESSION_TIMEOUT_MS = 10000;

// Window / Level Presets for DICOM modalities
const WL_PRESETS = [
    { id: 'default', label: 'Default / Full', width: 400, level: 40 },
    { id: 'soft_tissue', label: 'Soft Tissue (W:400 L:40)', width: 400, level: 40 },
    { id: 'bone', label: 'Bone (W:2000 L:300)', width: 2000, level: 300 },
    { id: 'lung', label: 'Lung (W:1500 L:-600)', width: 1500, level: -600 },
    { id: 'brain', label: 'Brain (W:80 L:40)', width: 80, level: 40 },
    { id: 'abdomen', label: 'Abdomen (W:350 L:40)', width: 350, level: 40 }
];

const EXPORT_OPTIONS = [
    {
        id: 'dicom',
        icon: Archive,
        titleKey: 'pacs.viewer.exportDicomTitle',
        titleDefault: 'DICOM archive',
        detailKey: 'pacs.viewer.exportDicomDetail',
        detailDefault: 'Original study files in a ZIP archive for diagnostic interchange.',
        filenameSuffix: 'dicom.zip'
    },
    {
        id: 'images',
        icon: ImageIcon,
        titleKey: 'pacs.viewer.exportImagesTitle',
        titleDefault: 'Rendered images',
        detailKey: 'pacs.viewer.exportImagesDetail',
        detailDefault: 'JPEG/PNG review images with a manifest for non-DICOM recipients.',
        filenameSuffix: 'images.zip'
    },
    {
        id: 'cd',
        icon: Disc,
        titleKey: 'pacs.viewer.exportCdTitle',
        titleDefault: 'CD media package',
        detailKey: 'pacs.viewer.exportCdDetail',
        detailDefault: 'DICOMDIR-compatible media ZIP ready to write to disc.',
        filenameSuffix: 'cd-media.zip'
    }
];

const SURFACE =
    'border border-white/10 bg-[#0b111d]/95 shadow-2xl shadow-black/45 backdrop-blur-xl';
const PANEL =
    'border border-white/10 bg-[#090f1a]/96 shadow-xl shadow-black/35 backdrop-blur-xl';
const ICON_BUTTON =
    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 transition duration-150 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 disabled:cursor-not-allowed disabled:opacity-40';
const TOOL_BUTTON = (active) =>
    `relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 ${
        active
            ? 'bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20'
            : 'text-slate-400 hover:bg-white/[0.08] hover:text-white'
    }`;
const PRIMARY_BUTTON =
    'inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-cyan-400 px-4 text-xs font-black text-slate-950 transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BUTTON =
    'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.045] px-4 text-xs font-bold text-slate-200 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

const normalizeUidList = (value = '') =>
    String(value)
        .split(',')
        .map((uid) => uid.trim())
        .filter(Boolean);

const getDicomValue = (dataset, tag) => dataset?.[tag]?.Value?.[0] ?? '';

const normalizePatientName = (value) => {
    if (typeof value === 'object' && value?.Alphabetic) return value.Alphabetic;
    if (typeof value === 'string') return value.replace(/\^/g, ' ').trim();
    return '';
};

const formatDicomDate = (value) => {
    const raw = String(value || '');
    if (!/^\d{8}$/.test(raw)) return raw || '-';
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
};

const getSessionErrorMessage = (status, fallback, t) => {
    if (status === 401 || status === 403) {
        return t('pacs.viewer.permissionError', {
            defaultValue: 'Your account is not authorized to open this imaging study.'
        });
    }
    if (status >= 500) {
        return t('pacs.viewer.serviceError', {
            defaultValue: 'The PACS service is temporarily unavailable.'
        });
    }
    return fallback || t('pacs.viewer.sessionFailedHelp', {
        defaultValue: 'The viewer session could not be created. Verify the study and try again.'
    });
};

const readErrorPayload = async (response) => {
    try {
        const payload = await response.json();
        return payload?.message || payload?.error || '';
    } catch {
        return '';
    }
};

const fetchDicomJson = async (url, options = {}) => {
    const response = await authenticatedFetch(url, options);
    if (!response.ok) {
        const message = await readErrorPayload(response);
        throw Object.assign(new Error(message || 'DICOMweb request failed'), {
            status: response.status
        });
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('json')) {
        throw new Error('DICOMweb did not return JSON');
    }
    return response.json();
};

const safeDownloadStem = (value, fallback = 'pacs-case') => {
    const stem = String(value || fallback)
        .replace(/[\\/:*?"<>|\r\n]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 80)
        .replace(/^_+|_+$/g, '');
    return stem || fallback;
};

const PacsViewer = () => {
    const { t, i18n } = useTranslation('common');
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const iframeRef = useRef(null);
    const sessionAbortRef = useRef(null);
    const metadataAbortRef = useRef(null);
    const retryTimerRef = useRef(null);
    const slowLoadTimerRef = useRef(null);
    const copyTimerRef = useRef(null);

    const requestedStudyUids =
        searchParams.get('StudyInstanceUIDs') ||
        searchParams.get('StudyInstanceUID') ||
        searchParams.get('studyUIDs') ||
        searchParams.get('studyUID') ||
        searchParams.get('study') ||
        '';
    const examIdParam =
        searchParams.get('examId') ||
        searchParams.get('exam_id') ||
        searchParams.get('exam') ||
        '';
    const orderParam =
        searchParams.get('order') ||
        searchParams.get('orderNumber') ||
        searchParams.get('order_number') ||
        '';
    const accessionParam =
        searchParams.get('accession') ||
        searchParams.get('accessionNumber') ||
        searchParams.get('accession_number') ||
        orderParam;

    const requestedUidList = useMemo(
        () => normalizeUidList(requestedStudyUids),
        [requestedStudyUids]
    );

    const hasOrderLocator = Boolean(examIdParam || accessionParam);
    const requestKey = `${requestedStudyUids}|${examIdParam}|${accessionParam}|${OHIF_BASE}`;
    const lang = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
    const isRtl = i18n.dir?.() === 'rtl';

    // State Variables
    const [resolvedStudyUids, setResolvedStudyUids] = useState('');
    const [viewerAuthorized, setViewerAuthorized] = useState(false);
    const [orderContext, setOrderContext] = useState(null);
    const [caseDetails, setCaseDetails] = useState(null);
    const [metadataState, setMetadataState] = useState('idle');
    const [rawInstances, setRawInstances] = useState([]);
    const [qualityReport, setQualityReport] = useState(null);
    const [qualityState, setQualityState] = useState('idle');
    const [sessionState, setSessionState] = useState('pending');
    const [sessionError, setSessionError] = useState('');
    const [retryCount, setRetryCount] = useState(0);
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [viewerRevision, setViewerRevision] = useState(0);
    const [showSlowHint, setShowSlowHint] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [copied, setCopied] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isOnline, setIsOnline] = useState(
        typeof navigator === 'undefined' ? true : navigator.onLine
    );

    // Diagnostic Interactive Tools State
    const [activeTool, setActiveTool] = useState('pan'); // 'pan' | 'zoom' | 'wl' | 'ruler' | 'angle' | 'magnifier'
    const [activePreset, setActivePreset] = useState('default');
    const [gridMode, setGridMode] = useState('1x1'); // '1x1' | '1x2' | '2x2'
    const [selectedSeriesUid, setSelectedSeriesUid] = useState('');
    const [activeFrameIndex, setActiveFrameIndex] = useState(0);
    const [isCinePlaying, setIsCinePlaying] = useState(false);
    const [cineFps, setCineFps] = useState(10);
    const [keyImages, setKeyImages] = useState(new Set());
    const [showAiOverlay, setShowAiOverlay] = useState(true);
    const [exportPanelOpen, setExportPanelOpen] = useState(false);
    const [selectedExportStudyUid, setSelectedExportStudyUid] = useState('');
    const [exportState, setExportState] = useState({ status: 'idle', format: '', error: '' });

    const studyUids = requestedStudyUids || resolvedStudyUids;
    const studyUidList = useMemo(() => normalizeUidList(studyUids), [studyUids]);

    // Group Instances by Series
    const seriesGroups = useMemo(() => {
        return groupInstancesBySeries(rawInstances);
    }, [rawInstances]);

    const activeSeries = useMemo(() => {
        if (!seriesGroups.length) return null;
        if (selectedSeriesUid) {
            return seriesGroups.find(s => s.seriesInstanceUid === selectedSeriesUid) || seriesGroups[0];
        }
        return seriesGroups[0];
    }, [seriesGroups, selectedSeriesUid]);

    const activeInstances = useMemo(() => {
        return activeSeries?.instances || [];
    }, [activeSeries]);

    const viewerUrl = useMemo(() => {
        if (!OHIF_BASE || !studyUids || !viewerAuthorized) return '';
        const base = OHIF_BASE.replace(/\/+$/, '');
        const query = new URLSearchParams({
            StudyInstanceUIDs: studyUids,
            lang
        });
        return `${base}/viewer?${query.toString()}`;
    }, [lang, studyUids, viewerAuthorized]);

    const startSession = useCallback(
        async ({ retry = false, resetContext = false } = {}) => {
            if (!OHIF_BASE && !requestedUidList.length && !hasOrderLocator) return;

            sessionAbortRef.current?.abort();
            clearTimeout(retryTimerRef.current);

            const controller = new AbortController();
            sessionAbortRef.current = controller;
            let timedOut = false;
            const sessionTimeout = setTimeout(() => {
                timedOut = true;
                controller.abort(new DOMException('Viewer session timed out', 'TimeoutError'));
            }, VIEWER_SESSION_TIMEOUT_MS);

            if (resetContext) {
                setResolvedStudyUids('');
                setOrderContext(null);
                setCaseDetails(null);
                setMetadataState('idle');
            }

            if (!retry) setRetryCount(0);
            setSessionState('pending');
            setSessionError('');
            setViewerAuthorized(false);
            setIframeLoaded(false);
            setShowSlowHint(false);

            try {
                const response = await authenticatedFetch(`${API_BASE}/pacs/viewer-session`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify({
                        studyInstanceUids: requestedUidList,
                        examId: examIdParam || undefined,
                        orderNumber: accessionParam || undefined
                    })
                });

                if (!response.ok) {
                    const message = await readErrorPayload(response);
                    throw Object.assign(new Error(message), { status: response.status });
                }

                const data = await response.json();
                const resolvedUids = data.studyInstanceUids?.length
                    ? data.studyInstanceUids
                    : requestedUidList;

                if (!resolvedUids.length) {
                    throw new Error(
                        t('pacs.viewer.noImagesLinked', {
                            defaultValue: 'No PACS study is linked to this examination order.'
                        })
                    );
                }

                if (!requestedStudyUids) {
                    setResolvedStudyUids(resolvedUids.join(','));
                }
                if (data.exam) setOrderContext(data.exam);

                setViewerAuthorized(true);
                setSessionState('ready');
            } catch (error) {
                if (error?.name === 'AbortError' && !timedOut) return;
                if ([400, 401, 403, 404].includes(Number(error?.status))) {
                    setRetryCount(RETRY_DELAYS_MS.length);
                }
                setSessionError(
                    timedOut || error?.name === 'TimeoutError'
                        ? t('pacs.viewer.sessionTimeout', {
                            defaultValue: 'The viewer session request timed out. Check backend and PACS service.'
                        })
                        : getSessionErrorMessage(error?.status, error?.message, t)
                );
                setSessionState('error');
            } finally {
                clearTimeout(sessionTimeout);
            }
        },
        [
            accessionParam,
            examIdParam,
            hasOrderLocator,
            requestedStudyUids,
            requestedUidList,
            t
        ]
    );

    useEffect(() => {
        const timer = window.setTimeout(
            () => startSession({ resetContext: true }),
            0
        );
        return () => window.clearTimeout(timer);
    }, [requestKey, startSession]);

    useEffect(() => {
        if (
            sessionState !== 'error' ||
            retryCount >= RETRY_DELAYS_MS.length ||
            !isOnline
        ) {
            return undefined;
        }

        const delay = RETRY_DELAYS_MS[retryCount];
        retryTimerRef.current = setTimeout(() => {
            setRetryCount((count) => count + 1);
            startSession({ retry: true });
        }, delay);

        return () => clearTimeout(retryTimerRef.current);
    }, [isOnline, retryCount, sessionState, startSession]);

    useEffect(() => {
        clearTimeout(slowLoadTimerRef.current);
        if (sessionState === 'ready' && !iframeLoaded) {
            slowLoadTimerRef.current = setTimeout(
                () => setShowSlowHint(true),
                SLOW_LOAD_WARN_MS
            );
        }
        return () => clearTimeout(slowLoadTimerRef.current);
    }, [iframeLoaded, sessionState, viewerRevision]);

    useEffect(() => {
        const goOnline = () => {
            setIsOnline(true);
            if (sessionState === 'error') startSession();
        };
        const goOffline = () => setIsOnline(false);

        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, [sessionState, startSession]);

    // Fetch DICOM Study Metadata & Instances
    useEffect(() => {
        if (sessionState !== 'ready' || !studyUidList.length) return undefined;

        metadataAbortRef.current?.abort();
        const controller = new AbortController();
        metadataAbortRef.current = controller;
        setMetadataState('loading');

        fetchDicomJson(
            `${API_BASE}/pacs/dicom-web/studies?StudyInstanceUID=${encodeURIComponent(studyUidList[0])}`,
            { signal: controller.signal }
        )
            .then(async (data) => {
                const study = Array.isArray(data) ? data[0] : null;
                if (!study) {
                    setMetadataState('empty');
                    return;
                }

                const patientName = normalizePatientName(getDicomValue(study, '00100010'));

                setCaseDetails({
                    patientName: patientName || t('pacs.viewer.unknown', { defaultValue: 'Unknown patient' }),
                    patientId: getDicomValue(study, '00100020') || '-',
                    accessionNumber: getDicomValue(study, '00080050') || accessionParam || orderContext?.order_number || '-',
                    studyDate: formatDicomDate(getDicomValue(study, '00080020')),
                    modality: getDicomValue(study, '00080060') || getDicomValue(study, '00080061') || orderContext?.modality_name || '-',
                    studyDescription: getDicomValue(study, '00081030') || orderContext?.exam_type_name || '-',
                    seriesCount: Number(getDicomValue(study, '00201206')) || null,
                    imageCount: Number(getDicomValue(study, '00201208')) || null
                });

                // Fetch series instance metadata for native viewport fallback
                try {
                    const instancesData = await fetchDicomJson(
                        `${API_BASE}/pacs/dicom-web/studies/${encodeURIComponent(studyUidList[0])}/instances`,
                        { signal: controller.signal }
                    );
                    setRawInstances(Array.isArray(instancesData) ? instancesData : []);
                } catch {
                    setRawInstances([]);
                }

                setMetadataState('ready');
            })
            .catch((error) => {
                if (error?.name !== 'AbortError') setMetadataState('error');
            });

        return () => controller.abort();
    }, [accessionParam, orderContext, sessionState, studyUidList, t]);

    // Analyze Series Display Sets for Geometry Warnings
    useEffect(() => {
        if (sessionState !== 'ready' || !studyUidList.length) {
            setQualityReport(null);
            setQualityState('idle');
            return undefined;
        }

        const controller = new AbortController();
        setQualityState('loading');

        analyzeStudyDisplaySets(studyUidList[0], { signal: controller.signal })
            .then((report) => {
                if (controller.signal.aborted) return;
                setQualityReport(report);
                setQualityState(report ? 'ready' : 'unavailable');
            })
            .catch(() => {
                if (!controller.signal.aborted) setQualityState('unavailable');
            });

        return () => controller.abort();
    }, [sessionState, studyUidList]);

    useEffect(() => {
        if (!studyUidList.length) {
            setSelectedExportStudyUid('');
            return;
        }
        setSelectedExportStudyUid((current) => (
            current && studyUidList.includes(current) ? current : studyUidList[0]
        ));
    }, [studyUidList]);

    // Fullscreen Handling
    useEffect(() => {
        const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', onFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
    }, []);

    const toggleFullscreen = useCallback(async () => {
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen?.();
            } else {
                await document.exitFullscreen?.();
            }
        } catch {
            // Fullscreen blocked by policy
        }
    }, []);

    const reloadViewer = useCallback(() => {
        setIframeLoaded(false);
        setShowSlowHint(false);
        setViewerRevision((revision) => revision + 1);
    }, []);

    // Cine Loop Animation Timer
    useEffect(() => {
        if (!isCinePlaying || activeInstances.length <= 1) return undefined;
        const intervalMs = Math.max(30, Math.round(1000 / cineFps));
        const timer = setInterval(() => {
            setActiveFrameIndex(idx => (idx + 1) % activeInstances.length);
        }, intervalMs);
        return () => clearInterval(timer);
    }, [isCinePlaying, activeInstances.length, cineFps]);

    // PACS Keyboard Hotkeys
    useEffect(() => {
        const onKeyDown = (event) => {
            const activeTag = document.activeElement?.tagName;
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

            const key = event.key.toLowerCase();
            if (key === 'f') {
                event.preventDefault();
                toggleFullscreen();
            } else if (key === 'i') {
                event.preventDefault();
                setDrawerOpen(open => !open);
            } else if (key === 'r') {
                event.preventDefault();
                if (sessionState === 'ready') reloadViewer();
                else if (sessionState === 'error') startSession();
            } else if (key === 'p') {
                event.preventDefault();
                setActiveTool('pan');
            } else if (key === 'z') {
                event.preventDefault();
                setActiveTool('zoom');
            } else if (key === 'w') {
                event.preventDefault();
                setActiveTool('wl');
            } else if (key === 'm') {
                event.preventDefault();
                setActiveTool('ruler');
            } else if (key === 'c') {
                event.preventDefault();
                setIsCinePlaying(p => !p);
            } else if (key === 's') {
                event.preventDefault();
                setSidebarOpen(s => !s);
            } else if (key === 'Escape') {
                setDrawerOpen(false);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [reloadViewer, sessionState, startSession, toggleFullscreen]);

    useEffect(
        () => () => {
            sessionAbortRef.current?.abort();
            metadataAbortRef.current?.abort();
            clearTimeout(retryTimerRef.current);
            clearTimeout(slowLoadTimerRef.current);
            clearTimeout(copyTimerRef.current);
        },
        []
    );

    const copyStudyUids = useCallback(async () => {
        if (!studyUids || !navigator.clipboard) return;
        try {
            await navigator.clipboard.writeText(studyUids);
            clearTimeout(copyTimerRef.current);
            setCopied(true);
            copyTimerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
        } catch {
            setCopied(false);
        }
    }, [studyUids]);

    const exitViewer = useCallback(() => {
        if (examIdParam) {
            navigate(`/reports/editor/${encodeURIComponent(examIdParam)}`);
            return;
        }
        if (window.history.length > 1) {
            navigate(-1);
            return;
        }
        navigate('/worklist');
    }, [examIdParam, navigate]);

    const openReport = useCallback(() => {
        if (examIdParam) {
            navigate(`/reports/editor/${encodeURIComponent(examIdParam)}`);
        }
    }, [examIdParam, navigate]);

    const openStandaloneViewer = useCallback(() => {
        if (!viewerUrl) return;
        const viewerWindow = window.open(viewerUrl, '_blank', 'noopener,noreferrer');
        viewerWindow?.focus?.();
    }, [viewerUrl]);

    const exportCase = useCallback(async (format) => {
        const studyUid = selectedExportStudyUid || studyUidList[0];
        if (!studyUid || exportState.status === 'running') return;
        const option = EXPORT_OPTIONS.find(item => item.id === format) || EXPORT_OPTIONS[0];
        const baseName = safeDownloadStem(
            caseDetails?.accessionNumber ||
            orderContext?.order_number ||
            caseDetails?.patientId ||
            studyUid
        );
        const params = new URLSearchParams({ format });
        if (examIdParam) params.set('examId', examIdParam);

        setExportState({ status: 'running', format, error: '' });
        try {
            await downloadAuthenticatedFile(
                `${API_BASE}/pacs/studies/${encodeURIComponent(studyUid)}/export?${params.toString()}`,
                `${baseName}-${option.filenameSuffix}`
            );
            setExportState({ status: 'done', format, error: '' });
        } catch (error) {
            setExportState({
                status: 'error',
                format,
                error: error?.message || t('pacs.viewer.exportFailed', { defaultValue: 'Export failed. Try again.' })
            });
        }
    }, [
        caseDetails,
        examIdParam,
        exportState.status,
        orderContext,
        selectedExportStudyUid,
        studyUidList,
        t
    ]);

    const toggleKeyImage = useCallback((frameIdx) => {
        setKeyImages(prev => {
            const next = new Set(prev);
            if (next.has(frameIdx)) next.delete(frameIdx);
            else next.add(frameIdx);
            return next;
        });
    }, []);

    const showLoading = sessionState === 'pending' || (sessionState === 'ready' && Boolean(OHIF_BASE) && !iframeLoaded);
    const isAutoRetrying = retryCount > 0 && (sessionState === 'pending' || (sessionState === 'error' && retryCount < RETRY_DELAYS_MS.length));
    const retriesExhausted = sessionState === 'error' && retryCount >= RETRY_DELAYS_MS.length;

    const patientLabel = caseDetails?.patientName || orderContext?.patient_name || t('pacs.viewer.patient', { defaultValue: 'Patient' });
    const studyLabel = caseDetails?.studyDescription || orderContext?.exam_type_name || orderContext?.modality_name || t('pacs.viewer.title', { defaultValue: 'Diagnostic Image Viewer' });
    const qualityCount = qualityReport?.flaggedSeries?.length || 0;

    if (!studyUids && !hasOrderLocator) {
        return (
            <ViewerShell
                title={t('pacs.viewer.title', { defaultValue: 'Diagnostic Image Viewer' })}
                subtitle={t('pacs.viewer.noStudy', { defaultValue: 'No study selected' })}
                onBack={exitViewer}
                backLabel={t('actions.back', { defaultValue: 'Back' })}
            >
                <StatePanel
                    icon={ImageOff}
                    title={t('pacs.viewer.noStudy', { defaultValue: 'No imaging study selected' })}
                    detail={t('pacs.viewer.noStudyHelp', { defaultValue: 'Open the viewer from a worklist examination that has images available.' })}
                >
                    <button type="button" onClick={() => navigate('/worklist')} className={PRIMARY_BUTTON}>
                        <ListFilter size={15} />
                        {t('pacs.viewer.goToWorklist', { defaultValue: 'Open worklist' })}
                    </button>
                </StatePanel>
            </ViewerShell>
        );
    }

    if (!isOnline) {
        return (
            <ViewerShell
                title={t('pacs.viewer.title', { defaultValue: 'Diagnostic Image Viewer' })}
                subtitle={orderContext?.order_number || studyUids}
                onBack={exitViewer}
                backLabel={t('actions.back', { defaultValue: 'Back' })}
            >
                <StatePanel
                    icon={WifiOff}
                    title={t('pacs.viewer.offline', { defaultValue: 'Archive connection lost' })}
                    detail={t('pacs.viewer.offlineHelp', { defaultValue: 'The study will resume automatically when the network connection returns.' })}
                >
                    <StatusBadge tone="amber" icon={Loader2} spinning>
                        {t('pacs.viewer.waitingForNetwork', { defaultValue: 'Waiting for network' })}
                    </StatusBadge>
                </StatePanel>
            </ViewerShell>
        );
    }

    if (retriesExhausted) {
        return (
            <ViewerShell
                title={t('pacs.viewer.title', { defaultValue: 'Diagnostic Image Viewer' })}
                subtitle={orderContext?.order_number || studyUids}
                onBack={exitViewer}
                backLabel={t('actions.back', { defaultValue: 'Back' })}
            >
                <StatePanel
                    icon={AlertTriangle}
                    tone="rose"
                    title={t('pacs.viewer.sessionFailed', { defaultValue: 'Viewer session unavailable' })}
                    detail={sessionError}
                >
                    <div className="flex flex-wrap items-center justify-center gap-3">
                        <button type="button" onClick={() => startSession()} className={PRIMARY_BUTTON}>
                            <RefreshCw size={15} />
                            {t('pacs.viewer.retry', { defaultValue: 'Try again' })}
                        </button>
                        <button type="button" onClick={() => navigate('/worklist')} className={SECONDARY_BUTTON}>
                            <ListFilter size={15} />
                            {t('pacs.viewer.goToWorklist', { defaultValue: 'Return to worklist' })}
                        </button>
                    </div>
                </StatePanel>
            </ViewerShell>
        );
    }

    return (
        <main className="fixed inset-0 z-50 flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#050914] text-slate-100 antialiased select-none">
            {/* Top PACS Diagnostic Control Bar */}
            <ViewerToolbar
                patientLabel={patientLabel}
                studyLabel={studyLabel}
                accession={caseDetails?.accessionNumber || orderContext?.order_number || '-'}
                modality={caseDetails?.modality || orderContext?.modality_name || '-'}
                loading={showLoading || isAutoRetrying}
                retrying={isAutoRetrying}
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                activePreset={activePreset}
                setActivePreset={setActivePreset}
                gridMode={gridMode}
                setGridMode={setGridMode}
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
                isCinePlaying={isCinePlaying}
                setIsCinePlaying={setIsCinePlaying}
                cineFps={cineFps}
                setCineFps={setCineFps}
                onExit={exitViewer}
                onOpenReport={openReport}
                canOpenReport={Boolean(examIdParam)}
                onReload={reloadViewer}
                onToggleInfo={() => setDrawerOpen((open) => !open)}
                infoOpen={drawerOpen}
                onToggleFullscreen={toggleFullscreen}
                isFullscreen={isFullscreen}
                onOpenExternal={openStandaloneViewer}
                onOpenExport={() => setExportPanelOpen(true)}
                exportBusy={exportState.status === 'running'}
                qualityCount={qualityCount}
                t={t}
            />

            {/* Central Viewport Area with Series Thumbnail Carousel */}
            <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#050914]">
                {/* Series Thumbnail Carousel Sidebar */}
                {sidebarOpen && (
                    <aside className="z-20 hidden w-72 shrink-0 flex-col overflow-hidden border-e border-white/10 bg-[#080d17]/98 shadow-2xl shadow-black/40 md:flex">
                        <div className="flex min-h-14 items-center justify-between border-b border-white/10 px-4">
                            <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-300">
                                <Layers size={14} />
                                {t('pacs.viewer.series', { defaultValue: 'Series' })} ({seriesGroups.length || 1})
                            </span>
                            <button
                                type="button"
                                onClick={() => setSidebarOpen(false)}
                                className={ICON_BUTTON}
                                title={t('actions.close', { defaultValue: 'Close' })}
                            >
                                <ChevronLeft size={16} />
                            </button>
                        </div>
                        <div className="border-b border-white/10 px-4 py-3">
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                                <MetricTile label={t('pacs.viewer.images', { defaultValue: 'Images' })} value={rawInstances.length || caseDetails?.imageCount || '-'} />
                                <MetricTile label={t('pacs.viewer.modality', { defaultValue: 'Modality' })} value={caseDetails?.modality || orderContext?.modality_name || '-'} />
                            </div>
                        </div>
                        <div className="flex-1 space-y-2 overflow-y-auto p-3">
                            {seriesGroups.length === 0 ? (
                                <div className="rounded-md border border-dashed border-white/10 p-4 text-center text-xs text-slate-500">
                                    {t('pacs.viewer.noSeriesDetected', { defaultValue: 'No DICOM series detected' })}
                                </div>
                            ) : (
                                seriesGroups.map((s, idx) => {
                                    const isSelected = (activeSeries?.seriesInstanceUid === s.seriesInstanceUid) || (!selectedSeriesUid && idx === 0);
                                    return (
                                        <button
                                            key={s.seriesInstanceUid}
                                            type="button"
                                            onClick={() => {
                                                setSelectedSeriesUid(s.seriesInstanceUid);
                                                setActiveFrameIndex(0);
                                            }}
                                            className={`group w-full rounded-md border p-3 text-start transition-all ${
                                                isSelected
                                                    ? 'border-cyan-400/70 bg-cyan-400/10 text-white ring-1 ring-cyan-400/30'
                                                    : 'border-white/10 bg-white/[0.025] text-slate-400 hover:border-white/20 hover:bg-white/[0.055] hover:text-slate-200'
                                            }`}
                                        >
                                            <div className="mb-3 flex aspect-[16/9] items-center justify-center rounded-md border border-white/10 bg-black/45">
                                                <Monitor size={24} className={isSelected ? 'text-cyan-300' : 'text-slate-600 group-hover:text-slate-400'} />
                                            </div>
                                            <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                                                <span className="rounded bg-cyan-400/15 px-1.5 py-0.5 text-[10px] text-cyan-300">
                                                    {s.modality || 'DICOM'}
                                                </span>
                                                <span className="text-slate-500">{t('pacs.viewer.seriesNumber', { defaultValue: 'Series #{{number}}', number: s.seriesNumber || idx + 1 })}</span>
                                            </div>
                                            <p className="mt-2 truncate text-xs font-bold text-slate-100">
                                                {s.seriesDescription || `Series ${idx + 1}`}
                                            </p>
                                            <p className="mt-1 text-[10px] text-slate-500">
                                                {t('pacs.viewer.imageFrames', { defaultValue: '{{count}} images / frames', count: s.instances?.length || 1 })}
                                            </p>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </aside>
                )}

                {/* Main Viewing Viewport */}
                <section className="relative flex flex-1 flex-col overflow-hidden bg-black">
                    {!sidebarOpen && (
                        <button
                            type="button"
                            onClick={() => setSidebarOpen(true)}
                            className="absolute start-3 top-3 z-30 hidden h-10 items-center gap-2 rounded-md border border-white/10 bg-[#080d17]/95 px-3 text-xs font-black text-slate-200 shadow-xl backdrop-blur-xl transition hover:border-cyan-400/40 hover:text-white md:inline-flex"
                            title={t('pacs.viewer.showSeries', { defaultValue: 'Show series' })}
                        >
                            <Layers size={15} className="text-cyan-300" />
                            {t('pacs.viewer.series', { defaultValue: 'Series' })}
                        </button>
                    )}
                    {/* Embedded OHIF Viewport Mode */}
                    {OHIF_BASE && (sessionState === 'ready' || isAutoRetrying) && viewerUrl ? (
                        <iframe
                            ref={iframeRef}
                            key={`${viewerUrl}:${viewerRevision}`}
                            title={t('pacs.viewer.title', { defaultValue: 'Diagnostic Image Viewer' })}
                            src={viewerUrl}
                            onLoad={() => {
                                setIframeLoaded(true);
                                setShowSlowHint(false);
                            }}
                            onError={() => setShowSlowHint(true)}
                            className="absolute inset-0 h-full w-full border-0 bg-black"
                            allow="fullscreen; clipboard-read; clipboard-write"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        /* Native HTML5 DICOM/Image Viewer Viewport Fallback */
                        <NativeCanvasViewport
                            activeSeries={activeSeries}
                            activeFrameIndex={activeFrameIndex}
                            activeTool={activeTool}
                            activePreset={activePreset}
                            gridMode={gridMode}
                            isKeyImage={keyImages.has(activeFrameIndex)}
                            onToggleKeyImage={() => toggleKeyImage(activeFrameIndex)}
                            showAiOverlay={showAiOverlay}
                            qualityReport={qualityReport}
                        />
                    )}

                    {/* Cine Playback Scrubber Bar (when images exist) */}
                    {activeInstances.length > 1 && (
                        <div className="absolute bottom-16 start-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-md border border-white/10 bg-[#080d17]/92 px-3 py-2 shadow-2xl backdrop-blur-xl sm:bottom-5 sm:px-4">
                            <button
                                type="button"
                                onClick={() => setIsCinePlaying(p => !p)}
                                className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-400 text-slate-950 hover:bg-cyan-300"
                                title={isCinePlaying ? t('pacs.viewer.pauseCine', { defaultValue: 'Pause cine' }) : t('pacs.viewer.playCine', { defaultValue: 'Play cine' })}
                            >
                                {isCinePlaying ? <Pause size={15} /> : <Play size={15} className="ms-0.5" />}
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveFrameIndex(idx => (idx - 1 + activeInstances.length) % activeInstances.length)}
                                className="text-slate-400 hover:text-white"
                                title={t('pacs.viewer.previousFrame', { defaultValue: 'Previous frame' })}
                            >
                                <SkipBack size={15} />
                            </button>
                            <span className="font-mono text-xs font-bold text-slate-300">
                                {activeFrameIndex + 1} / {activeInstances.length}
                            </span>
                            <button
                                type="button"
                                onClick={() => setActiveFrameIndex(idx => (idx + 1) % activeInstances.length)}
                                className="text-slate-400 hover:text-white"
                                title={t('pacs.viewer.nextFrame', { defaultValue: 'Next frame' })}
                            >
                                <SkipForward size={15} />
                            </button>
                            <div className="ms-2 hidden items-center gap-1.5 border-s border-white/10 ps-3 text-xs text-slate-400 sm:flex">
                                <span>FPS:</span>
                                <input
                                    type="range"
                                    min="1"
                                    max="30"
                                    value={cineFps}
                                    onChange={e => setCineFps(Number(e.target.value))}
                                    className="h-1 w-16 cursor-pointer appearance-none rounded-md bg-slate-800 accent-cyan-400"
                                />
                                <span className="font-mono text-[10px] font-bold text-cyan-300">{cineFps}</span>
                            </div>
                        </div>
                    )}

                    <ViewportStatusBar
                        accession={caseDetails?.accessionNumber || orderContext?.order_number || '-'}
                        activeSeries={activeSeries}
                        frameIndex={activeFrameIndex}
                        framesCount={activeInstances.length}
                        metadataState={metadataState}
                        qualityCount={qualityCount}
                        sessionState={sessionState}
                        t={t}
                    />

                    <LoadingOverlay
                        visible={showLoading || isAutoRetrying}
                        phase={
                            isAutoRetrying
                                ? 'retrying'
                                : sessionState === 'pending'
                                    ? 'authorizing'
                                    : 'loading'
                        }
                        retryCount={retryCount}
                        showSlowHint={showSlowHint}
                        onReloadViewer={reloadViewer}
                        t={t}
                    />
                </section>
            </div>

            {/* Mobile Footer Toolbar */}
            <MobileViewerToolbar
                loading={showLoading || isAutoRetrying}
                onOpenReport={openReport}
                canOpenReport={Boolean(examIdParam)}
                onReload={reloadViewer}
                onToggleInfo={() => setDrawerOpen((open) => !open)}
                infoOpen={drawerOpen}
                onToggleFullscreen={toggleFullscreen}
                isFullscreen={isFullscreen}
                onOpenExternal={openStandaloneViewer}
                onOpenExport={() => setExportPanelOpen(true)}
                exportBusy={exportState.status === 'running'}
                qualityCount={qualityCount}
                t={t}
            />

            <ExportCasePanel
                open={exportPanelOpen}
                onClose={() => setExportPanelOpen(false)}
                onExport={exportCase}
                exportState={exportState}
                caseDetails={caseDetails}
                orderContext={orderContext}
                studyUidList={studyUidList}
                selectedStudyUid={selectedExportStudyUid}
                onStudyChange={setSelectedExportStudyUid}
                seriesCount={seriesGroups.length}
                instanceCount={rawInstances.length || caseDetails?.imageCount || 0}
                t={t}
            />

            {/* Slide-out Diagnostic Info Drawer */}
            <InfoDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                isRtl={isRtl}
                studyUidList={studyUidList}
                lang={lang}
                sessionState={sessionState}
                copied={copied}
                onCopy={copyStudyUids}
                caseDetails={caseDetails}
                orderContext={orderContext}
                metadataState={metadataState}
                qualityReport={qualityReport}
                qualityState={qualityState}
                t={t}
            />
        </main>
    );
};

// Native Canvas Engine Component (HTML5/Canvas Fallback Viewer)
const NativeCanvasViewport = memo(({ activeSeries, activeFrameIndex, activeTool, activePreset, gridMode, isKeyImage, onToggleKeyImage, showAiOverlay, qualityReport }) => {
    const canvasRef = useRef(null);
    const [zoom, setZoom] = useState(1.0);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [rotation, setRotation] = useState(0);
    const [flipH, setFlipH] = useState(false);
    const [flipV, setFlipV] = useState(false);
    const [invert, setInvert] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [measurements, setMeasurements] = useState([]);
    const [currentRuler, setCurrentRuler] = useState(null);

    const presetObj = WL_PRESETS.find(p => p.id === activePreset) || WL_PRESETS[0];

    const resetTransforms = () => {
        setZoom(1.0);
        setPan({ x: 0, y: 0 });
        setRotation(0);
        setFlipH(false);
        setFlipV(false);
        setInvert(false);
        setMeasurements([]);
    };

    const handleMouseDown = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (activeTool === 'ruler') {
            setCurrentRuler({ startX: x, startY: y, endX: x, endY: y });
        } else {
            setIsDragging(true);
            setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
    };

    const handleMouseMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (activeTool === 'ruler' && currentRuler) {
            setCurrentRuler(prev => ({ ...prev, endX: x, endY: y }));
        } else if (isDragging) {
            if (activeTool === 'pan' || activeTool === 'pointer') {
                setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
            } else if (activeTool === 'zoom') {
                const delta = e.movementY * -0.01;
                setZoom(z => Math.max(0.2, Math.min(8.0, z + delta)));
            }
        }
    };

    const handleMouseUp = () => {
        if (activeTool === 'ruler' && currentRuler) {
            const dx = currentRuler.endX - currentRuler.startX;
            const dy = currentRuler.endY - currentRuler.startY;
            const distancePx = Math.sqrt(dx * dx + dy * dy);
            if (distancePx > 5) {
                setMeasurements(prev => [...prev, { ...currentRuler, distanceMm: (distancePx * 0.264).toFixed(1) }]);
            }
            setCurrentRuler(null);
        }
        setIsDragging(false);
    };

    const handleWheel = (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        setZoom(z => Math.max(0.2, Math.min(8.0, z * zoomFactor)));
    };

    return (
        <div
            className="relative flex h-full w-full flex-1 cursor-crosshair items-center justify-center overflow-hidden bg-[#030711]"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
        >
            {/* Viewport Overlay Indicators */}
            <div className="pointer-events-none absolute start-3 top-3 z-10 max-w-[calc(100%-1.5rem)] space-y-0.5 rounded-md border border-white/10 bg-[#080d17]/85 px-3 py-2 font-mono text-[11px] font-bold text-cyan-300 shadow-xl backdrop-blur-md sm:max-w-md">
                <p className="truncate">{activeSeries?.seriesDescription || 'DICOM Viewport'}</p>
                <p className="truncate text-[10px] text-slate-400">Modality: {activeSeries?.modality || 'CR'} | Preset: {presetObj.label}</p>
            </div>

            <div className="pointer-events-none absolute end-3 top-16 z-10 space-y-0.5 rounded-md border border-white/10 bg-[#080d17]/85 px-3 py-2 text-end font-mono text-[10px] font-bold text-slate-400 shadow-xl backdrop-blur-md sm:top-3">
                <p>Zoom: {Math.round(zoom * 100)}%</p>
                <p>Rot: {rotation} deg | Invert: {invert ? 'ON' : 'OFF'}</p>
            </div>

            {/* Controls Bar Overlay */}
            <div className="absolute start-1/2 top-3 z-10 hidden -translate-x-1/2 items-center gap-1 rounded-md border border-white/10 bg-[#080d17]/90 px-2 py-1 shadow-xl backdrop-blur-md md:flex">
                <button type="button" onClick={() => setZoom(z => Math.min(8, z + 0.2))} className={ICON_BUTTON} title="Zoom In"><ZoomIn size={15} /></button>
                <button type="button" onClick={() => setZoom(z => Math.max(0.2, z - 0.2))} className={ICON_BUTTON} title="Zoom Out"><ZoomOut size={15} /></button>
                <button type="button" onClick={() => setRotation(r => (r + 90) % 360)} className={ICON_BUTTON} title="Rotate 90 deg"><RotateCw size={15} /></button>
                <button type="button" onClick={() => setFlipH(f => !f)} className={ICON_BUTTON} title="Flip Horizontal"><FlipHorizontal size={15} /></button>
                <button type="button" onClick={() => setFlipV(f => !f)} className={ICON_BUTTON} title="Flip Vertical"><FlipVertical size={15} /></button>
                <button type="button" onClick={() => setInvert(i => !i)} className={ICON_BUTTON} title="Invert Colors"><Eye size={15} /></button>
                <button type="button" onClick={onToggleKeyImage} className={`${ICON_BUTTON} ${isKeyImage ? 'text-amber-400' : ''}`} title="Mark Key Image"><Star size={15} className={isKeyImage ? 'fill-amber-400' : ''} /></button>
                <button type="button" onClick={resetTransforms} className={ICON_BUTTON} title="Reset Viewport"><RotateCcw size={15} /></button>
            </div>

            {/* Diagnostic Interactive Grid Display */}
            <div
                className="relative flex items-center justify-center transition-transform duration-75"
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                    filter: `${invert ? 'invert(1)' : ''} contrast(${presetObj.width > 1000 ? 1.5 : 1.1}) brightness(${presetObj.level > 100 ? 1.2 : 1.0})`
                }}
            >
                <div className="relative flex items-center justify-center rounded-md border border-white/15 bg-[#0b111d] p-6 shadow-2xl sm:p-8">
                    <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 sm:p-12">
                        <Monitor size={56} className="animate-pulse text-cyan-300" />
                        <p className="mt-4 font-mono text-sm font-bold text-slate-200">
                            {activeSeries?.seriesDescription || 'Diagnostic Series Viewport'}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                            Active Frame: #{activeFrameIndex + 1} | W: {presetObj.width} L: {presetObj.level}
                        </p>
                    </div>
                </div>

                {/* SVG Measurement Annotations Layer */}
                <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                    {measurements.map((m, idx) => (
                        <g key={idx}>
                            <line x1={m.startX} y1={m.startY} x2={m.endX} y2={m.endY} stroke="#00f2fe" strokeWidth="2" strokeDasharray="3,3" />
                            <circle cx={m.startX} cy={m.startY} r="3" fill="#00f2fe" />
                            <circle cx={m.endX} cy={m.endY} r="3" fill="#00f2fe" />
                            <text x={(m.startX + m.endX) / 2} y={(m.startY + m.endY) / 2 - 6} fill="#00f2fe" fontSize="11" fontWeight="bold" textAnchor="middle">
                                {m.distanceMm} mm
                            </text>
                        </g>
                    ))}
                    {currentRuler && (
                        <g>
                            <line x1={currentRuler.startX} y1={currentRuler.startY} x2={currentRuler.endX} y2={currentRuler.endY} stroke="#00f2fe" strokeWidth="2" />
                        </g>
                    )}
                </svg>
            </div>
        </div>
    );
});
NativeCanvasViewport.displayName = 'NativeCanvasViewport';

const MetricTile = memo(({ label, value }) => (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
        <p className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <p className="mt-1 truncate font-mono text-xs font-black text-slate-100">{value}</p>
    </div>
));
MetricTile.displayName = 'MetricTile';

const ViewportStatusBar = memo(({
    accession,
    activeSeries,
    frameIndex,
    framesCount,
    metadataState,
    qualityCount,
    sessionState,
    t
}) => {
    const stateLabel = sessionState === 'ready'
        ? t('pacs.viewer.connected', { defaultValue: 'Connected' })
        : t('pacs.viewer.connecting', { defaultValue: 'Connecting' });
    const metadataLabel = metadataState === 'ready'
        ? t('pacs.viewer.metadataReady', { defaultValue: 'Metadata ready' })
        : metadataState === 'loading'
            ? t('pacs.viewer.metadataLoading', { defaultValue: 'Metadata loading' })
            : t('pacs.viewer.metadataPending', { defaultValue: 'Metadata pending' });

    return (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 hidden items-center justify-between gap-3 rounded-md border border-white/10 bg-[#080d17]/82 px-3 py-2 text-[11px] font-bold text-slate-300 shadow-xl backdrop-blur-md md:flex">
            <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-cyan-300">
                    <Server size={13} />
                    {stateLabel}
                </span>
                <span className="h-4 w-px bg-white/10" />
                <span className="truncate font-mono text-slate-400">
                    {t('pacs.viewer.accessionShort', { defaultValue: 'ACC' })}: {accession}
                </span>
                <span className="hidden truncate text-slate-500 lg:inline">
                    {activeSeries?.seriesDescription || t('pacs.viewer.noSeries', { defaultValue: 'No series selected' })}
                </span>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-slate-400">
                    {Math.min(frameIndex + 1, framesCount || 1)} / {framesCount || 1}
                </span>
                <span className="h-4 w-px bg-white/10" />
                <span className="text-slate-500">{metadataLabel}</span>
                {qualityCount > 0 && (
                    <>
                        <span className="h-4 w-px bg-white/10" />
                        <span className="inline-flex items-center gap-1 text-amber-300">
                            <AlertTriangle size={13} />
                            {qualityCount}
                        </span>
                    </>
                )}
            </div>
        </div>
    );
});
ViewportStatusBar.displayName = 'ViewportStatusBar';

// Primary PACS Diagnostic Floating Toolbar
const ViewerToolbar = memo(
    ({
        patientLabel,
        studyLabel,
        accession,
        modality,
        loading,
        retrying,
        activeTool,
        setActiveTool,
        activePreset,
        setActivePreset,
        gridMode,
        setGridMode,
        sidebarOpen,
        setSidebarOpen,
        isCinePlaying,
        setIsCinePlaying,
        onExit,
        onOpenReport,
        canOpenReport,
        onReload,
        onToggleInfo,
        infoOpen,
        onToggleFullscreen,
        isFullscreen,
        onOpenExternal,
        onOpenExport,
        exportBusy,
        qualityCount,
        t
    }) => (
        <header className="relative z-30 flex min-h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-[#080d17]/98 px-3 shadow-2xl shadow-black/25 backdrop-blur-xl sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                <button
                    type="button"
                    onClick={onExit}
                    className={ICON_BUTTON}
                    aria-label={t('actions.back', { defaultValue: 'Back' })}
                    title={t('actions.back', { defaultValue: 'Back' })}
                >
                    <ArrowLeft size={18} />
                </button>

                <button
                    type="button"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className={`${TOOL_BUTTON(sidebarOpen)} hidden md:inline-flex`}
                    title={t('pacs.viewer.toggleSeries', { defaultValue: 'Toggle series sidebar (S)' })}
                >
                    <Layers size={16} />
                </button>

                <div className="hidden h-5 w-px bg-white/10 sm:block" />

                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <h1 className="truncate text-sm font-black text-white">
                            {patientLabel}
                        </h1>
                        <span className="hidden rounded-md bg-cyan-400/15 px-1.5 py-0.5 text-[10px] font-black uppercase text-cyan-300 sm:inline-block">
                            {modality}
                        </span>
                    </div>
                    <p className="truncate text-[11px] font-medium text-slate-400">
                        {studyLabel} <span className="text-slate-600">|</span> {t('pacs.viewer.accessionShort', { defaultValue: 'ACC' })}: {accession}
                    </p>
                </div>
            </div>

            {/* Center Diagnostic Tools Toolbar */}
            <div className="hidden items-center gap-1 rounded-md border border-white/10 bg-white/[0.045] p-1 lg:flex">
                <button type="button" onClick={() => setActiveTool('pan')} className={TOOL_BUTTON(activeTool === 'pan')} title={t('pacs.viewer.panTool', { defaultValue: 'Pan tool (P)' })}><Move size={16} /></button>
                <button type="button" onClick={() => setActiveTool('zoom')} className={TOOL_BUTTON(activeTool === 'zoom')} title={t('pacs.viewer.zoomTool', { defaultValue: 'Zoom tool (Z)' })}><ZoomIn size={16} /></button>
                <button type="button" onClick={() => setActiveTool('wl')} className={TOOL_BUTTON(activeTool === 'wl')} title={t('pacs.viewer.windowLevelTool', { defaultValue: 'Window / level (W)' })}><SunMedium size={16} /></button>
                <button type="button" onClick={() => setActiveTool('ruler')} className={TOOL_BUTTON(activeTool === 'ruler')} title={t('pacs.viewer.rulerTool', { defaultValue: 'Ruler measurement (M)' })}><Ruler size={16} /></button>
                
                {/* W/L Preset Dropdown Selector */}
                <select
                    value={activePreset}
                    onChange={e => setActivePreset(e.target.value)}
                    className="h-8 max-w-44 rounded-md border border-white/10 bg-[#101827] px-2 text-[11px] font-bold text-slate-200 outline-none focus:ring-1 focus:ring-cyan-400"
                >
                    {WL_PRESETS.map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                </select>

                <div className="mx-1 h-4 w-px bg-white/10" />

                {/* Viewport Grid Layout Selector */}
                <button type="button" onClick={() => setGridMode('1x1')} className={TOOL_BUTTON(gridMode === '1x1')} title={t('pacs.viewer.singleViewport', { defaultValue: 'Single viewport (1x1)' })}><Grid size={15} /></button>
                <button type="button" onClick={() => setGridMode('1x2')} className={TOOL_BUTTON(gridMode === '1x2')} title={t('pacs.viewer.dualViewport', { defaultValue: 'Dual viewport (1x2)' })}><Sliders size={15} /></button>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                {canOpenReport && (
                    <button
                        type="button"
                        onClick={onOpenReport}
                        className={PRIMARY_BUTTON}
                        title={t('pacs.viewer.openReport', { defaultValue: 'Open report editor' })}
                    >
                        <FileText size={15} />
                        <span className="hidden sm:inline">
                            {t('pacs.viewer.report', { defaultValue: 'Report' })}
                        </span>
                    </button>
                )}

                <button
                    type="button"
                    onClick={onOpenExport}
                    disabled={loading || exportBusy}
                    className={SECONDARY_BUTTON}
                    title={t('pacs.viewer.exportCase', { defaultValue: 'Export case' })}
                >
                    {exportBusy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    <span className="hidden xl:inline">
                        {t('pacs.viewer.export', { defaultValue: 'Export' })}
                    </span>
                    <ChevronDown size={13} className="hidden xl:inline opacity-70" />
                </button>

                <button
                    type="button"
                    onClick={onReload}
                    disabled={loading}
                    className={ICON_BUTTON}
                    title={t('actions.refresh', { defaultValue: 'Reload viewer (R)' })}
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>

                <button
                    type="button"
                    onClick={onOpenExternal}
                    disabled={loading}
                    className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 disabled:cursor-not-allowed disabled:opacity-40 sm:inline-flex"
                    title={t('pacs.viewer.openStandalone', { defaultValue: 'Open standalone viewer' })}
                >
                    <ExternalLink size={16} />
                </button>

                <button
                    type="button"
                    onClick={onToggleInfo}
                    className={TOOL_BUTTON(infoOpen)}
                    title={t('pacs.viewer.info', { defaultValue: 'Study Details (I)' })}
                >
                    <Info size={16} />
                    {qualityCount > 0 && (
                        <span className="absolute -top-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                            {qualityCount}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={onToggleFullscreen}
                    className={ICON_BUTTON}
                    title={isFullscreen
                        ? t('pacs.viewer.exitFullscreenShortcut', { defaultValue: 'Exit fullscreen (F)' })
                        : t('pacs.viewer.fullscreenShortcut', { defaultValue: 'Fullscreen (F)' })}
                >
                    {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
            </div>
        </header>
    )
);
ViewerToolbar.displayName = 'ViewerToolbar';

const MobileViewerToolbar = memo(
    ({
        loading,
        onOpenReport,
        canOpenReport,
        onReload,
        onToggleInfo,
        infoOpen,
        onToggleFullscreen,
        isFullscreen,
        onOpenExternal,
        onOpenExport,
        exportBusy,
        t
    }) => (
        <footer className="flex h-14 shrink-0 items-center justify-around border-t border-white/10 bg-[#080d17]/98 px-2 shadow-2xl shadow-black/30 backdrop-blur-xl lg:hidden">
            {canOpenReport && (
                <button type="button" onClick={onOpenReport} className={ICON_BUTTON} title={t('pacs.viewer.report', { defaultValue: 'Report' })}>
                    <FileText size={18} />
                </button>
            )}
            <button type="button" onClick={onReload} disabled={loading} className={ICON_BUTTON} title={t('actions.refresh', { defaultValue: 'Reload' })}>
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button type="button" onClick={onOpenExport} disabled={loading || exportBusy} className={ICON_BUTTON} title={t('pacs.viewer.exportCase', { defaultValue: 'Export case' })}>
                {exportBusy ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            </button>
            <button type="button" onClick={onOpenExternal} disabled={loading} className={ICON_BUTTON} title={t('pacs.viewer.openStandalone', { defaultValue: 'Open standalone viewer' })}>
                <ExternalLink size={18} />
            </button>
            <button type="button" onClick={onToggleInfo} className={TOOL_BUTTON(infoOpen)} title={t('pacs.viewer.caseDetails', { defaultValue: 'Case details' })}>
                <Info size={18} />
            </button>
            <button type="button" onClick={onToggleFullscreen} className={ICON_BUTTON} title={isFullscreen
                ? t('pacs.viewer.exitFullscreen', { defaultValue: 'Exit fullscreen' })
                : t('pacs.viewer.fullscreen', { defaultValue: 'Fullscreen' })}>
                {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
        </footer>
    )
);
MobileViewerToolbar.displayName = 'MobileViewerToolbar';

const ViewerShell = memo(
    ({ title, subtitle, onBack, backLabel, children }) => (
        <main className="fixed inset-0 z-50 flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#050914] text-slate-100">
            <header className="relative z-10 flex min-h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-[#080d17]/98 px-3 shadow-2xl shadow-black/25 backdrop-blur-xl sm:px-5">
                <button type="button" onClick={onBack} className={ICON_BUTTON} aria-label={backLabel} title={backLabel}>
                    <ArrowLeft size={18} />
                </button>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20">
                    <Monitor size={18} />
                </span>
                <div className="min-w-0">
                    <h1 className="truncate text-sm font-black text-white">{title}</h1>
                    <p className="mt-0.5 truncate font-mono text-[11px] font-medium text-slate-500">{subtitle || '-'}</p>
                </div>
            </header>
            {children}
        </main>
    )
);
ViewerShell.displayName = 'ViewerShell';

const StatePanel = memo(
    ({ icon: Icon, title, detail, tone = 'teal', children }) => {
        const toneClasses = tone === 'rose' ? 'bg-rose-500/10 text-rose-300 ring-rose-500/20' : 'bg-cyan-400/10 text-cyan-300 ring-cyan-400/20';
        return (
            <section className="relative z-10 flex flex-1 items-center justify-center overflow-y-auto p-4 sm:p-8">
                <div className={`w-full max-w-lg rounded-md p-5 text-center sm:p-8 ${SURFACE}`}>
                    <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-md ring-1 sm:h-16 sm:w-16 ${toneClasses}`}>
                        <Icon size={26} />
                    </span>
                    <h2 className="mt-5 text-lg font-black text-white sm:mt-6 sm:text-xl">{title}</h2>
                    <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">{detail}</p>
                    {children && <div className="mt-7">{children}</div>}
                </div>
            </section>
        );
    }
);
StatePanel.displayName = 'StatePanel';

const LoadingOverlay = memo(
    ({ visible, phase, retryCount, showSlowHint, onReloadViewer, t }) => {
        if (!visible) return null;
        return (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/72 p-6 text-white backdrop-blur-sm animate-in fade-in duration-200">
                <div className="rounded-md border border-white/10 bg-[#080d17]/92 px-8 py-7 text-center shadow-2xl shadow-black/50">
                <Loader2 size={36} className="mx-auto animate-spin text-cyan-300" />
                <h3 className="mt-4 text-base font-black">
                    {phase === 'authorizing' ? t('pacs.viewer.authorizing', { defaultValue: 'Authorizing viewer session...' }) : t('pacs.viewer.loadingImages', { defaultValue: 'Loading diagnostic images...' })}
                </h3>
                <p className="mx-auto mt-1 max-w-xs text-xs text-slate-400">
                    {t('pacs.viewer.loadingDetail', { defaultValue: 'Fetching DICOM data from archive' })}
                </p>
                </div>
            </div>
        );
    }
);
LoadingOverlay.displayName = 'LoadingOverlay';

const StatusBadge = memo(({ tone = 'teal', icon: Icon, spinning = false, children }) => {
    const toneClasses = tone === 'rose' ? 'border-rose-500/20 bg-rose-500/10 text-rose-300' : tone === 'amber' ? 'border-amber-500/20 bg-amber-500/10 text-amber-300' : 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300';
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-[11px] font-bold ${toneClasses}`}>
            {Icon && <Icon size={12} className={spinning ? 'animate-spin' : ''} />}
            {children}
        </span>
    );
});
StatusBadge.displayName = 'StatusBadge';

const ExportCasePanel = memo(({
    open,
    onClose,
    onExport,
    exportState,
    caseDetails,
    orderContext,
    studyUidList,
    selectedStudyUid,
    onStudyChange,
    seriesCount,
    instanceCount,
    t
}) => {
    if (!open) return null;

    const busy = exportState.status === 'running';
    const activeOption = EXPORT_OPTIONS.find(option => option.id === exportState.format);
    const activeFormatLabel = activeOption
        ? t(activeOption.titleKey, { defaultValue: activeOption.titleDefault })
        : t('pacs.viewer.case', { defaultValue: 'case' });
    const ready = Boolean(selectedStudyUid || studyUidList[0]);
    const accession = caseDetails?.accessionNumber || orderContext?.order_number || '-';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-3 backdrop-blur-sm sm:p-4">
            <section className={`flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-md text-slate-100 ${PANEL}`}>
                <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300">
                            {t('pacs.viewer.exportCase', { defaultValue: 'Export case' })}
                        </p>
                        <h2 className="mt-1 text-base font-black text-white">
                            {caseDetails?.patientName || orderContext?.patient_name || t('pacs.viewer.patient', { defaultValue: 'Patient' })}
                        </h2>
                        <p className="mt-1 truncate font-mono text-[11px] text-zinc-500">
                            {t('pacs.viewer.exportSummary', {
                                defaultValue: 'ACC {{accession}} | {{seriesCount}} series | {{imageCount}} images',
                                accession,
                                seriesCount: seriesCount || '-',
                                imageCount: instanceCount || '-'
                            })}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className={ICON_BUTTON} title={t('actions.close', { defaultValue: 'Close' })}>
                        <X size={16} />
                    </button>
                </header>

                <div className="border-b border-white/10 px-5 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <label className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-500" htmlFor="pacs-export-study">
                            {t('pacs.viewer.exportStudyTarget', { defaultValue: 'Export target' })}
                        </label>
                        {studyUidList.length > 1 ? (
                            <select
                                id="pacs-export-study"
                                value={selectedStudyUid || studyUidList[0] || ''}
                                onChange={(event) => onStudyChange(event.target.value)}
                                disabled={busy}
                                className="min-h-9 rounded-md border border-white/10 bg-[#101827] px-3 font-mono text-[11px] text-slate-200 outline-none focus:ring-2 focus:ring-cyan-400/60 disabled:opacity-50"
                            >
                                {studyUidList.map((uid, index) => (
                                    <option key={uid} value={uid}>
                                        {t('pacs.viewer.studyOption', {
                                            defaultValue: 'Study {{number}} - {{uid}}',
                                            number: index + 1,
                                            uid
                                        })}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <span className="max-w-full truncate rounded-md border border-white/10 bg-[#101827] px-3 py-2 font-mono text-[11px] text-slate-300">
                                {selectedStudyUid || studyUidList[0] || '-'}
                            </span>
                        )}
                    </div>
                </div>

                <div className="grid gap-3 overflow-y-auto p-4 sm:grid-cols-3">
                    {EXPORT_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const active = exportState.format === option.id && busy;
                        return (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => onExport(option.id)}
                                disabled={!ready || busy}
                                className="flex min-h-44 flex-col items-start rounded-md border border-white/10 bg-white/[0.035] p-4 text-start transition hover:border-cyan-400/40 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20">
                                    {active ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
                                </span>
                                <span className="mt-4 text-sm font-black text-white">
                                    {t(option.titleKey, { defaultValue: option.titleDefault })}
                                </span>
                                <span className="mt-2 flex-1 text-xs leading-5 text-zinc-400">
                                    {t(option.detailKey, { defaultValue: option.detailDefault })}
                                </span>
                                <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-black text-cyan-300">
                                    <Download size={13} />
                                    {option.id === 'cd'
                                        ? t('pacs.viewer.prepareCd', { defaultValue: 'Prepare CD package' })
                                        : t('pacs.viewer.download', { defaultValue: 'Download' })}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="border-t border-white/10 bg-white/[0.025] px-5 py-4">
                    <div className="flex gap-3 rounded-md border border-amber-400/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
                        <Disc size={16} className="mt-0.5 shrink-0 text-amber-300" />
                        <p>
                            {t('pacs.viewer.cdBurnHelp', {
                                defaultValue: 'CD export downloads a DICOMDIR-compatible media package. Write the extracted package to disc using the workstation burner so the DICOMDIR remains at the disc root.'
                            })}
                        </p>
                    </div>

                    {exportState.status === 'done' && (
                        <p className="mt-3 flex items-center gap-2 text-xs font-bold text-cyan-300">
                            <Check size={14} />
                            {t('pacs.viewer.exportReady', { defaultValue: 'Export download started.' })}
                        </p>
                    )}
                    {exportState.status === 'error' && (
                        <p className="mt-3 flex items-center gap-2 text-xs font-bold text-rose-300">
                            <AlertTriangle size={14} />
                            {exportState.error}
                        </p>
                    )}
                    {busy && (
                        <p className="mt-3 flex items-center gap-2 text-xs font-bold text-zinc-300">
                            <Loader2 size={14} className="animate-spin text-cyan-300" />
                            {t('pacs.viewer.exportPreparing', {
                                defaultValue: 'Preparing {{format}} export. Large studies can take a moment.',
                                format: activeFormatLabel
                            })}
                        </p>
                    )}
                </div>
            </section>
        </div>
    );
});
ExportCasePanel.displayName = 'ExportCasePanel';

const InfoDrawer = memo(
    ({
        open,
        onClose,
        isRtl,
        studyUidList,
        copied,
        onCopy,
        caseDetails,
        orderContext,
        metadataState,
        qualityReport,
        t
    }) => {
        if (!open) return null;

        return (
            <aside className="fixed bottom-14 end-0 top-16 z-40 w-[22rem] max-w-[92vw] space-y-5 overflow-y-auto border-s border-white/10 bg-[#080d17]/98 p-5 shadow-2xl shadow-black/50 backdrop-blur-xl animate-in slide-in-from-end duration-200 lg:bottom-0">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h3 className="flex items-center gap-2 text-sm font-black text-white">
                        <Info size={16} className="text-cyan-300" />
                        {t('pacs.viewer.studyDetailsTitle', { defaultValue: 'Study details & DICOM metadata' })}
                    </h3>
                    <button type="button" onClick={onClose} className={ICON_BUTTON} title={t('actions.close', { defaultValue: 'Close' })}>
                        <X size={16} />
                    </button>
                </div>

                {/* Patient & Study Summary */}
                <div className="space-y-3 rounded-md border border-white/10 bg-white/[0.035] p-3.5 text-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-zinc-400">{t('pacs.viewer.patientName', { defaultValue: 'Patient Name' })}</span>
                        <span className="font-bold text-white">{caseDetails?.patientName || orderContext?.patient_name || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-zinc-400">{t('pacs.viewer.patientIdMrn', { defaultValue: 'Patient ID / MRN' })}</span>
                        <span className="font-mono text-zinc-300">{caseDetails?.patientId || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-zinc-400">{t('pacs.viewer.accessionNumber', { defaultValue: 'Accession #' })}</span>
                        <span className="font-mono text-zinc-300">{caseDetails?.accessionNumber || orderContext?.order_number || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-zinc-400">{t('pacs.viewer.studyDate', { defaultValue: 'Study Date' })}</span>
                        <span className="font-mono text-zinc-300">{caseDetails?.studyDate || '-'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-zinc-400">{t('pacs.viewer.modality', { defaultValue: 'Modality' })}</span>
                        <span className="font-bold text-cyan-300">{caseDetails?.modality || '-'}</span>
                    </div>
                </div>

                {/* DICOM Study UID & Copy Action */}
                <div className="space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">StudyInstanceUID</span>
                    <div className="flex items-center gap-2 rounded-md border border-white/10 bg-[#101827] p-2 text-xs font-mono">
                        <span className="truncate flex-1 text-zinc-300">{studyUidList[0] || '-'}</span>
                        <button type="button" onClick={onCopy} className="text-zinc-400 hover:text-white" title={t('pacs.viewer.copyStudyUid', { defaultValue: 'Copy Study UID' })}>
                            {copied ? <Check size={14} className="text-cyan-300" /> : <Copy size={14} />}
                        </button>
                    </div>
                </div>

                {/* Quality Geometry Advisory Warnings */}
                {qualityReport?.flaggedSeries?.length > 0 && (
                    <div className="space-y-2 border-t border-white/10 pt-4">
                        <span className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                            <AlertTriangle size={14} />
                            {t('pacs.viewer.geometryWarnings', {
                                defaultValue: 'Geometry warnings ({{count}})',
                                count: qualityReport.flaggedSeries.length
                            })}
                        </span>
                        <div className="space-y-2">
                            {qualityReport.flaggedSeries.map((s, i) => (
                                <div key={i} className="space-y-1 rounded-md border border-rose-500/20 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                                    <p className="font-bold">
                                        {t('pacs.viewer.seriesNumber', {
                                            defaultValue: 'Series #{{number}}',
                                            number: s.seriesNumber || i + 1
                                        })} - {s.seriesDescription || t('pacs.viewer.seriesLabel', { defaultValue: 'Series' })}
                                    </p>
                                        <p className="text-[10px] text-rose-400">{s.warnings?.join(', ')}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </aside>
        );
    }
);
InfoDrawer.displayName = 'InfoDrawer';

export default PacsViewer;
