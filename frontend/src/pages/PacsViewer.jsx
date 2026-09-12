import React, {
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
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Columns,
    Compass,
    Copy,
    Disc,
    Download,
    ExternalLink,
    Eye,
    EyeOff,
    FileText,
    FlipHorizontal,
    FlipVertical,
    Grid,
    Hash,
    HelpCircle,
    Image as ImageIcon,
    ImageOff,
    Info,
    Layers,
    LayoutGrid,
    ListFilter,
    Loader2,
    Lock,
    Maximize2,
    Minimize2,
    Monitor,
    Move,
    Pause,
    Play,
    Printer,
    RefreshCw,
    Repeat,
    RotateCcw,
    RotateCw,
    Rows,
    Ruler,
    Search,
    Server,
    ShieldAlert,
    ShieldCheck,
    SkipBack,
    SkipForward,
    Sliders,
    Sparkles,
    Square,
    Star,
    SunMedium,
    Trash2,
    UserRound,
    WifiOff,
    X,
    ZoomIn,
    ZoomOut
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
    { id: 'default', label: 'Default / Full', width: 400, level: 40, contrast: 1.0, brightness: 1.0 },
    { id: 'soft_tissue', label: 'Soft Tissue (W:400 L:40)', width: 400, level: 40, contrast: 1.15, brightness: 1.05 },
    { id: 'bone', label: 'Bone (W:2000 L:300)', width: 2000, level: 300, contrast: 1.8, brightness: 1.25 },
    { id: 'lung', label: 'Lung (W:1500 L:-600)', width: 1500, level: -600, contrast: 1.5, brightness: 0.8 },
    { id: 'brain', label: 'Brain (W:80 L:40)', width: 80, level: 40, contrast: 2.2, brightness: 1.1 },
    { id: 'abdomen', label: 'Abdomen (W:350 L:40)', width: 350, level: 40, contrast: 1.25, brightness: 1.0 },
    { id: 'angio', label: 'Vascular / Angio (W:600 L:150)', width: 600, level: 150, contrast: 1.6, brightness: 1.15 }
];

const EXPORT_OPTIONS = [
    {
        id: 'dicom',
        icon: Archive,
        titleKey: 'pacs.viewer.exportDicomTitle',
        titleDefault: 'DICOM Archive (.zip)',
        detailKey: 'pacs.viewer.exportDicomDetail',
        detailDefault: 'Full resolution original DICOM files for PACS interchange.',
        filenameSuffix: 'dicom.zip'
    },
    {
        id: 'images',
        icon: ImageIcon,
        titleKey: 'pacs.viewer.exportImagesTitle',
        titleDefault: 'Rendered Images (.zip)',
        detailKey: 'pacs.viewer.exportImagesDetail',
        detailDefault: 'High quality JPEG/PNG review images for patient or doctor.',
        filenameSuffix: 'images.zip'
    }
];

const KEYBOARD_SHORTCUTS = [
    { key: 'W', desc: 'Window / Level (Contrast adjustment)' },
    { key: 'P', desc: 'Pan / Drag tool' },
    { key: 'Z', desc: 'Zoom tool (Drag or Mouse wheel)' },
    { key: 'M', desc: 'Length / Distance ruler' },
    { key: 'A', desc: 'Angle measurement (3 points)' },
    { key: 'E', desc: 'ROI area & pixel density tool' },
    { key: 'O', desc: 'Toggle corner DICOM overlays' },
    { key: 'Space / C', desc: 'Play / Pause Cine loop' },
    { key: '← / →', desc: 'Previous / Next slice frame' },
    { key: 'S', desc: 'Toggle Series drawer' },
    { key: 'Tab', desc: 'Toggle Clinical Report & DICOM Inspector' },
    { key: 'K', desc: 'Bookmark Key Image' },
    { key: 'F', desc: 'Toggle Fullscreen' },
    { key: '?', desc: 'Show Keyboard Shortcuts guide' },
    { key: 'Esc', desc: 'Close dialogs / drawers' }
];

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

const formatDicomTime = (value) => {
    const raw = String(value || '').split('.')[0];
    if (raw.length >= 6) {
        return `${raw.slice(0, 2)}:${raw.slice(2, 4)}:${raw.slice(4, 6)}`;
    }
    return raw || '';
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

const ICON_BTN = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-all duration-150 hover:bg-white/10 hover:text-white focus-visible:outline-none active:scale-95 disabled:cursor-not-allowed disabled:opacity-40';
const TOOL_BTN = (active) =>
    `relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-all duration-150 focus-visible:outline-none ${
        active
            ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/25 ring-2 ring-teal-400/40 font-extrabold'
            : 'text-slate-300 hover:bg-white/10 hover:text-white'
    }`;

export const PacsViewer = () => {
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

    // Core State
    const [resolvedStudyUids, setResolvedStudyUids] = useState('');
    const [viewerAuthorized, setViewerAuthorized] = useState(false);
    const [orderContext, setOrderContext] = useState(null);
    const [caseDetails, setCaseDetails] = useState(null);
    const [rawInstances, setRawInstances] = useState([]);
    const [metadataState, setMetadataState] = useState('idle');
    const [qualityReport, setQualityReport] = useState(null);
    const [qualityState, setQualityState] = useState('idle');
    const [sessionState, setSessionState] = useState('pending');
    const [sessionError, setSessionError] = useState('');
    const [retryCount, setRetryCount] = useState(0);
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [viewerRevision, setViewerRevision] = useState(0);
    const [showSlowHint, setShowSlowHint] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [activeDrawerTab, setActiveDrawerTab] = useState('report');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [copied, setCopied] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(
        typeof navigator === 'undefined' ? true : navigator.onLine
    );

    // Diagnostic Interactive Tools State
    const [activeTool, setActiveTool] = useState('wl');
    const [activePreset, setActivePreset] = useState('default');
    const [gridMode, setGridMode] = useState('1x1');
    const [syncScroll, setSyncScroll] = useState(true);
    const [showOverlays, setShowOverlays] = useState(true);
    const [activeViewportIndex, setActiveViewportIndex] = useState(0);
    const [selectedSeriesUid, setSelectedSeriesUid] = useState('');
    const [activeFrameIndex, setActiveFrameIndex] = useState(0);
    const [isCinePlaying, setIsCinePlaying] = useState(false);
    const [cineFps, setCineFps] = useState(15);
    const [cineLoopMode, setCineLoopMode] = useState('loop');
    const [keyImages, setKeyImages] = useState(new Set());
    const [showAiOverlay, setShowAiOverlay] = useState(true);
    const [exportPanelOpen, setExportPanelOpen] = useState(false);
    const [selectedExportStudyUid, setSelectedExportStudyUid] = useState('');
    const [exportState, setExportState] = useState({ status: 'idle', format: '', error: '' });
    const [seriesSearch, setSeriesSearch] = useState('');
    const [reportData, setReportData] = useState(null);

    const studyUids = requestedStudyUids || resolvedStudyUids;
    const studyUidList = useMemo(() => normalizeUidList(studyUids), [studyUids]);

    // Group Instances by Series
    const seriesGroups = useMemo(() => {
        return groupInstancesBySeries(rawInstances);
    }, [rawInstances]);

    const filteredSeriesGroups = useMemo(() => {
        if (!seriesSearch.trim()) return seriesGroups;
        const term = seriesSearch.trim().toLowerCase();
        return seriesGroups.filter((s, idx) => {
            const text = `${s.seriesDescription || ''} ${s.modality || ''} ${s.seriesNumber || idx + 1}`.toLowerCase();
            return text.includes(term);
        });
    }, [seriesGroups, seriesSearch]);

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

    // Fetch Viewer Session
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
                    patientName: patientName || orderContext?.patient_name || t('pacs.viewer.unknown', { defaultValue: 'Patient' }),
                    patientId: getDicomValue(study, '00100020') || orderContext?.mrn || '-',
                    accessionNumber: getDicomValue(study, '00080050') || accessionParam || orderContext?.order_number || '-',
                    studyDate: formatDicomDate(getDicomValue(study, '00080020')),
                    studyTime: formatDicomTime(getDicomValue(study, '00080030')),
                    modality: getDicomValue(study, '00080060') || getDicomValue(study, '00080061') || orderContext?.modality_name || '-',
                    studyDescription: getDicomValue(study, '00081030') || orderContext?.exam_type_name || '-',
                    institutionName: getDicomValue(study, '00080080') || 'VIARA Medical Imaging',
                    seriesCount: Number(getDicomValue(study, '00201206')) || null,
                    imageCount: Number(getDicomValue(study, '00201208')) || null,
                    rawStudyTags: study
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

    // Fetch Clinical Report Data if Exam ID is available
    useEffect(() => {
        const effectiveExamId = examIdParam || orderContext?.exam_id;
        if (!effectiveExamId) return;

        authenticatedFetch(`${API_BASE}/exams/${effectiveExamId}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data?.exam) setReportData(data.exam);
            })
            .catch(() => {});
    }, [examIdParam, orderContext?.exam_id]);

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

    const toggleKeyImage = useCallback((seriesUid, frameIdx) => {
        const key = `${seriesUid}_${frameIdx}`;
        setKeyImages(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    // Cine Loop Animation Timer
    useEffect(() => {
        if (!isCinePlaying || activeInstances.length <= 1) return undefined;
        const intervalMs = Math.max(20, Math.round(1000 / cineFps));
        const timer = setInterval(() => {
            setActiveFrameIndex(idx => (idx + 1) % activeInstances.length);
        }, intervalMs);
        return () => clearInterval(timer);
    }, [isCinePlaying, activeInstances.length, cineFps, cineLoopMode]);

    // PACS Keyboard Hotkeys
    useEffect(() => {
        const onKeyDown = (event) => {
            const activeTag = document.activeElement?.tagName;
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
            // Never hijack browser/system combos (Ctrl+F find, Ctrl+S save, ...)
            if (event.ctrlKey || event.metaKey || event.altKey) return;

            const key = event.key.toLowerCase();
            if (key === 'f') {
                event.preventDefault();
                toggleFullscreen();
            } else if (key === 'w') {
                event.preventDefault();
                setActiveTool('wl');
            } else if (key === 'p') {
                event.preventDefault();
                setActiveTool('pan');
            } else if (key === 'z') {
                event.preventDefault();
                setActiveTool('zoom');
            } else if (key === 'm') {
                event.preventDefault();
                setActiveTool('ruler');
            } else if (key === 'a') {
                event.preventDefault();
                setActiveTool('angle');
            } else if (key === 'e') {
                event.preventDefault();
                setActiveTool('roi');
            } else if (key === 'o') {
                event.preventDefault();
                setShowOverlays(v => !v);
            } else if (key === 'k') {
                event.preventDefault();
                toggleKeyImage(selectedSeriesUid || activeSeries?.seriesInstanceUid, activeFrameIndex);
            } else if (key === 's') {
                event.preventDefault();
                setSidebarOpen(s => !s);
            } else if (key === 'tab') {
                event.preventDefault();
                setDrawerOpen(d => !d);
            } else if (key === ' ' || key === 'c') {
                event.preventDefault();
                setIsCinePlaying(p => !p);
            } else if (key === 'arrowright' || key === 'arrowdown') {
                if (activeInstances.length > 1) {
                    event.preventDefault();
                    setActiveFrameIndex(idx => (idx + 1) % activeInstances.length);
                }
            } else if (key === 'arrowleft' || key === 'arrowup') {
                if (activeInstances.length > 1) {
                    event.preventDefault();
                    setActiveFrameIndex(idx => (idx - 1 + activeInstances.length) % activeInstances.length);
                }
            } else if (key === 'escape') {
                setDrawerOpen(false);
                setShortcutsModalOpen(false);
                setExportPanelOpen(false);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [activeFrameIndex, activeInstances.length, activeSeries, selectedSeriesUid, toggleFullscreen, toggleKeyImage]);

    // '?' opens the in-viewer shortcuts guide. Capture phase + stopPropagation prevents the
    // global KeyboardShortcutsHelp modal (registered in Topbar) from opening on top of it.
    useEffect(() => {
        const onShortcutsKey = (event) => {
            const activeTag = document.activeElement?.tagName;
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
            if (event.key !== '?') return;
            event.preventDefault();
            event.stopPropagation();
            setShortcutsModalOpen(open => !open);
        };
        window.addEventListener('keydown', onShortcutsKey, true);
        return () => window.removeEventListener('keydown', onShortcutsKey, true);
    }, []);

    const exitViewer = useCallback(() => {
        if (window.opener && !window.opener.closed && window.history.length <= 1) {
            window.close();
            return;
        }
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

    const showLoading = sessionState === 'pending' || (sessionState === 'ready' && Boolean(OHIF_BASE) && !iframeLoaded);
    const isAutoRetrying = retryCount > 0 && (sessionState === 'pending' || (sessionState === 'error' && retryCount < RETRY_DELAYS_MS.length));
    const retriesExhausted = sessionState === 'error' && retryCount >= RETRY_DELAYS_MS.length;

    const patientLabel = caseDetails?.patientName || orderContext?.patient_name || t('pacs.viewer.patient', { defaultValue: 'Patient' });
    const studyLabel = caseDetails?.studyDescription || orderContext?.exam_type_name || orderContext?.modality_name || t('pacs.viewer.title', { defaultValue: 'Diagnostic Image Viewer' });
    const qualityCount = qualityReport?.flaggedSeries?.length || 0;

    const gridLayoutClass = useMemo(() => {
        if (gridMode === '1x2') return 'grid-cols-2 grid-rows-1';
        if (gridMode === '2x1') return 'grid-cols-1 grid-rows-2';
        if (gridMode === '2x2') return 'grid-cols-2 grid-rows-2';
        return 'grid-cols-1 grid-rows-1';
    }, [gridMode]);

    const activeKeyImage = keyImages.has(`${selectedSeriesUid || activeSeries?.seriesInstanceUid}_${activeFrameIndex}`);

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
                    <button type="button" onClick={() => navigate('/worklist')} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 px-6 text-sm font-bold text-white shadow-lg shadow-teal-500/20 transition hover:brightness-110">
                        <ListFilter size={16} />
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
                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs font-bold text-amber-300">
                        <Loader2 size={14} className="animate-spin" />
                        {t('pacs.viewer.waitingForNetwork', { defaultValue: 'Waiting for network...' })}
                    </div>
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
                        <button type="button" onClick={() => startSession()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 px-6 text-sm font-bold text-white shadow-lg shadow-teal-500/20 transition hover:brightness-110">
                            <RefreshCw size={16} />
                            {t('pacs.viewer.retry', { defaultValue: 'Try again' })}
                        </button>
                        <button type="button" onClick={() => navigate('/worklist')} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-6 text-sm font-bold text-slate-200 transition hover:bg-white/10">
                            <ListFilter size={16} />
                            {t('pacs.viewer.goToWorklist', { defaultValue: 'Return to worklist' })}
                        </button>
                    </div>
                </StatePanel>
            </ViewerShell>
        );
    }

    return (
        <main className="fixed inset-0 z-50 flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#030712] text-slate-100 antialiased select-none">
            {/* Top Workstation Control & Tool Bar */}
            <WorkstationHeader
                patientLabel={patientLabel}
                studyLabel={studyLabel}
                accession={caseDetails?.accessionNumber || orderContext?.order_number || '-'}
                modality={caseDetails?.modality || orderContext?.modality_name || '-'}
                patientId={caseDetails?.patientId || orderContext?.mrn || '-'}
                studyDate={caseDetails?.studyDate || '-'}
                loading={showLoading || isAutoRetrying}
                retrying={isAutoRetrying}
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                activePreset={activePreset}
                setActivePreset={setActivePreset}
                gridMode={gridMode}
                setGridMode={setGridMode}
                syncScroll={syncScroll}
                setSyncScroll={setSyncScroll}
                showOverlays={showOverlays}
                setShowOverlays={setShowOverlays}
                sidebarOpen={sidebarOpen}
                setSidebarOpen={setSidebarOpen}
                isCinePlaying={isCinePlaying}
                setIsCinePlaying={setIsCinePlaying}
                onExit={exitViewer}
                onOpenReport={openReport}
                canOpenReport={Boolean(examIdParam || orderContext?.exam_id)}
                onReload={reloadViewer}
                onToggleDrawer={() => setDrawerOpen(open => !open)}
                drawerOpen={drawerOpen}
                onOpenShortcuts={() => setShortcutsModalOpen(true)}
                onToggleFullscreen={toggleFullscreen}
                isFullscreen={isFullscreen}
                onOpenExternal={openStandaloneViewer}
                onOpenExport={() => setExportPanelOpen(true)}
                exportBusy={exportState.status === 'running'}
                qualityCount={qualityCount}
                seriesCount={seriesGroups.length}
                instanceCount={rawInstances.length || caseDetails?.imageCount || 0}
                keyImageCount={keyImages.size}
                activeKeyImage={activeKeyImage}
                onToggleActiveKeyImage={() => toggleKeyImage(selectedSeriesUid || activeSeries?.seriesInstanceUid, activeFrameIndex)}
                t={t}
            />

            {/* Central Workstation Workspace */}
            <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#02050e]">
                {/* Collapsible Left Series Drawer */}
                <SeriesSidebar
                    open={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    seriesGroups={seriesGroups}
                    filteredSeriesGroups={filteredSeriesGroups}
                    activeSeries={activeSeries}
                    selectedSeriesUid={selectedSeriesUid}
                    onSelectSeries={(seriesUid) => {
                        setSelectedSeriesUid(seriesUid);
                        setActiveFrameIndex(0);
                    }}
                    seriesSearch={seriesSearch}
                    onSeriesSearchChange={setSeriesSearch}
                    rawInstances={rawInstances}
                    caseDetails={caseDetails}
                    orderContext={orderContext}
                    metadataState={metadataState}
                    keyImages={keyImages}
                    t={t}
                />

                {/* Primary Multi-Viewport Area */}
                <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-black">
                    {/* Embedded OHIF Viewport Mode (when external OHIF deployed) */}
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
                        /* Native Medical Canvas Viewport Engine */
                        <div className={`grid h-full w-full gap-1 p-1 ${gridLayoutClass}`}>
                            {gridMode === '1x1' ? (
                                <NativeCanvasViewport
                                    studyUid={studyUidList[0]}
                                    activeSeries={activeSeries}
                                    activeFrameIndex={activeFrameIndex}
                                    onFrameChange={setActiveFrameIndex}
                                    activeTool={activeTool}
                                    activePreset={activePreset}
                                    gridMode={gridMode}
                                    showOverlays={showOverlays}
                                    caseDetails={caseDetails}
                                    orderContext={orderContext}
                                    isKeyImage={activeKeyImage}
                                    onToggleKeyImage={() => toggleKeyImage(selectedSeriesUid || activeSeries?.seriesInstanceUid, activeFrameIndex)}
                                    showAiOverlay={showAiOverlay}
                                    qualityReport={qualityReport}
                                    isActiveViewport={true}
                                    t={t}
                                />
                            ) : (
                                Array.from({ length: gridMode === '2x2' ? 4 : 2 }).map((_, idx) => {
                                    const seriesForViewport = seriesGroups[idx % (seriesGroups.length || 1)] || activeSeries;
                                    return (
                                        <NativeCanvasViewport
                                            key={idx}
                                            studyUid={studyUidList[0]}
                                            activeSeries={seriesForViewport}
                                            activeFrameIndex={syncScroll ? activeFrameIndex : 0}
                                            onFrameChange={syncScroll ? setActiveFrameIndex : undefined}
                                            activeTool={activeTool}
                                            activePreset={activePreset}
                                            gridMode={gridMode}
                                            showOverlays={showOverlays}
                                            caseDetails={caseDetails}
                                            orderContext={orderContext}
                                            isKeyImage={keyImages.has(`${seriesForViewport?.seriesInstanceUid}_${activeFrameIndex}`)}
                                            onToggleKeyImage={() => toggleKeyImage(seriesForViewport?.seriesInstanceUid, activeFrameIndex)}
                                            showAiOverlay={showAiOverlay && idx === 0}
                                            qualityReport={qualityReport}
                                            isActiveViewport={activeViewportIndex === idx}
                                            onSelectViewport={() => setActiveViewportIndex(idx)}
                                            t={t}
                                        />
                                    );
                                })
                            )}
                        </div>
                    )}

                    {/* Bottom Cine Player Timeline (multi-frame studies) */}
                    {activeInstances.length > 1 && (
                        <CinePlaybackBar
                            isPlaying={isCinePlaying}
                            onTogglePlay={() => setIsCinePlaying(p => !p)}
                            currentIndex={activeFrameIndex}
                            totalFrames={activeInstances.length}
                            onSeek={setActiveFrameIndex}
                            fps={cineFps}
                            onFpsChange={setCineFps}
                            loopMode={cineLoopMode}
                            onToggleLoopMode={() => setCineLoopMode(m => m === 'loop' ? 'bounce' : 'loop')}
                            t={t}
                        />
                    )}

                    {/* Modern Viewport Status Line */}
                    <ViewportStatusBar
                        accession={caseDetails?.accessionNumber || orderContext?.order_number || '-'}
                        activeSeries={activeSeries}
                        frameIndex={activeFrameIndex}
                        framesCount={activeInstances.length}
                        metadataState={metadataState}
                        qualityCount={qualityCount}
                        sessionState={sessionState}
                        activeTool={activeTool}
                        activePreset={activePreset}
                        t={t}
                    />

                    {/* Loading Overlay */}
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

            {/* Slide-out Integrated Clinical Drawer */}
            <ClinicalWorkstationDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                activeTab={activeDrawerTab}
                onTabChange={setActiveDrawerTab}
                caseDetails={caseDetails}
                orderContext={orderContext}
                reportData={reportData}
                rawInstances={rawInstances}
                qualityReport={qualityReport}
                qualityState={qualityState}
                studyUidList={studyUidList}
                onOpenReportEditor={openReport}
                t={t}
                isRtl={isRtl}
            />

            {/* Export Modal */}
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

            {/* Keyboard Shortcuts Cheat Sheet Modal */}
            <KeyboardShortcutsModal
                open={shortcutsModalOpen}
                onClose={() => setShortcutsModalOpen(false)}
                shortcuts={KEYBOARD_SHORTCUTS}
                t={t}
            />
        </main>
    );
};

// Top Primary Workstation Navigation Bar
const WorkstationHeader = memo(({
    patientLabel,
    studyLabel,
    accession,
    modality,
    patientId,
    studyDate,
    loading,
    retrying,
    activeTool,
    setActiveTool,
    activePreset,
    setActivePreset,
    gridMode,
    setGridMode,
    syncScroll,
    setSyncScroll,
    showOverlays,
    setShowOverlays,
    sidebarOpen,
    setSidebarOpen,
    isCinePlaying,
    setIsCinePlaying,
    onExit,
    onOpenReport,
    canOpenReport,
    onReload,
    onToggleDrawer,
    drawerOpen,
    onOpenShortcuts,
    onToggleFullscreen,
    isFullscreen,
    onOpenExternal,
    onOpenExport,
    exportBusy,
    qualityCount,
    seriesCount,
    instanceCount,
    keyImageCount,
    activeKeyImage,
    onToggleActiveKeyImage,
    t
}) => {
    return (
        <header className="relative z-30 flex min-h-[58px] shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#060c18]/98 px-3 shadow-2xl shadow-black/50 backdrop-blur-2xl">
            {/* Left Section: Back + Series Toggle + Patient/Study Pill */}
            <div className="flex min-w-0 items-center gap-2">
                <button
                    type="button"
                    onClick={onExit}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 transition-all hover:border-teal-400/40 hover:bg-teal-500/15 hover:text-white"
                    title={t('actions.back', { defaultValue: 'Back to worklist' })}
                >
                    <ArrowLeft size={18} />
                </button>

                <button
                    type="button"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className={`${TOOL_BTN(sidebarOpen)} hidden sm:inline-flex`}
                    title={t('pacs.viewer.toggleSeries', { defaultValue: 'Toggle series drawer (S)' })}
                >
                    <Layers size={17} />
                    {seriesCount > 0 && (
                        <span className="absolute -top-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-teal-500 text-[9px] font-black text-slate-950">
                            {seriesCount}
                        </span>
                    )}
                </button>

                {/* Patient / Study Clinical Identity Box */}
                <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-1.5 shadow-inner">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h1 className="truncate text-xs font-black tracking-tight text-white sm:text-sm">
                                {patientLabel}
                            </h1>
                            <span className="rounded bg-teal-400/20 px-1.5 py-0.5 text-[10px] font-black tracking-wider text-teal-300">
                                {modality}
                            </span>
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                            </span>
                        </div>
                        <p className="truncate text-[11px] font-medium text-slate-400">
                            <span className="font-mono text-slate-300">{patientId}</span>
                            <span className="mx-1.5 opacity-40">•</span>
                            <span>{studyLabel}</span>
                            <span className="mx-1.5 opacity-40">•</span>
                            <span className="font-mono text-teal-300/90">{accession}</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Center Section: Primary Medical Diagnostic Tool Palette */}
            <div className="hidden items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1 lg:flex">
                {/* Navigation Tools */}
                <button
                    type="button"
                    onClick={() => setActiveTool('pan')}
                    className={TOOL_BTN(activeTool === 'pan')}
                    title={t('pacs.viewer.panTool', { defaultValue: 'Pan / Drag tool (P)' })}
                >
                    <Move size={16} />
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTool('zoom')}
                    className={TOOL_BTN(activeTool === 'zoom')}
                    title={t('pacs.viewer.zoomTool', { defaultValue: 'Zoom tool (Z)' })}
                >
                    <ZoomIn size={16} />
                </button>

                <span className="mx-0.5 h-4 w-px bg-white/10" />

                {/* Contrast / Window Level */}
                <button
                    type="button"
                    onClick={() => setActiveTool('wl')}
                    className={TOOL_BTN(activeTool === 'wl')}
                    title={t('pacs.viewer.windowLevelTool', { defaultValue: 'Window / Level tool (W)' })}
                >
                    <SunMedium size={16} />
                </button>
                <select
                    value={activePreset}
                    onChange={(event) => setActivePreset(event.target.value)}
                    className="h-8 max-w-[130px] rounded-lg border border-white/10 bg-[#091222] px-2 text-[11px] font-bold text-slate-200 outline-none transition focus:border-teal-400/50"
                    title={t('pacs.viewer.windowPreset', { defaultValue: 'Window Preset' })}
                >
                    {WL_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                    ))}
                </select>

                <span className="mx-0.5 h-4 w-px bg-white/10" />

                {/* Measurements */}
                <button
                    type="button"
                    onClick={() => setActiveTool('ruler')}
                    className={TOOL_BTN(activeTool === 'ruler')}
                    title={t('pacs.viewer.rulerTool', { defaultValue: 'Distance Ruler (M)' })}
                >
                    <Ruler size={16} />
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTool('angle')}
                    className={TOOL_BTN(activeTool === 'angle')}
                    title={t('pacs.viewer.angleTool', { defaultValue: '3-Point Angle (A)' })}
                >
                    <Compass size={16} />
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTool('roi')}
                    className={TOOL_BTN(activeTool === 'roi')}
                    title={t('pacs.viewer.roiTool', { defaultValue: 'ROI Area & Density (E)' })}
                >
                    <Square size={16} />
                </button>

                <span className="mx-0.5 h-4 w-px bg-white/10" />

                {/* Grid Layouts */}
                <button
                    type="button"
                    onClick={() => setGridMode('1x1')}
                    className={TOOL_BTN(gridMode === '1x1')}
                    title={t('pacs.viewer.singleViewport', { defaultValue: '1x1 Single Viewport' })}
                >
                    <Square size={14} />
                </button>
                <button
                    type="button"
                    onClick={() => setGridMode('1x2')}
                    className={TOOL_BTN(gridMode === '1x2')}
                    title={t('pacs.viewer.dualViewport', { defaultValue: '1x2 Dual Horizontal' })}
                >
                    <Columns size={14} />
                </button>
                <button
                    type="button"
                    onClick={() => setGridMode('2x2')}
                    className={TOOL_BTN(gridMode === '2x2')}
                    title={t('pacs.viewer.quadViewport', { defaultValue: '2x2 Quad Grid' })}
                >
                    <LayoutGrid size={14} />
                </button>

                <span className="mx-0.5 h-4 w-px bg-white/10" />

                {/* Overlays & Sync */}
                <button
                    type="button"
                    onClick={() => setShowOverlays(v => !v)}
                    className={TOOL_BTN(showOverlays)}
                    title={t('pacs.viewer.toggleOverlays', { defaultValue: 'Toggle DICOM Overlays (O)' })}
                >
                    {showOverlays ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button
                    type="button"
                    onClick={() => setIsCinePlaying(p => !p)}
                    className={TOOL_BTN(isCinePlaying)}
                    title={isCinePlaying ? t('pacs.viewer.cinePause', { defaultValue: 'Pause Cine (Space)' }) : t('pacs.viewer.cinePlay', { defaultValue: 'Play Cine (Space)' })}
                >
                    {isCinePlaying ? <Pause size={15} /> : <Play size={15} />}
                </button>
            </div>

            {/* Right Section: Key Image + Report Drawer + Export + Hotkeys + Fullscreen */}
            <div className="flex shrink-0 items-center gap-1.5">
                {retrying && (
                    <span className="hidden items-center gap-1.5 rounded-lg border border-amber-300/20 bg-amber-300/10 px-2.5 py-1.5 text-[11px] font-bold text-amber-200 xl:inline-flex">
                        <Loader2 size={13} className="animate-spin" />
                        {t('pacs.viewer.retrying', { defaultValue: 'Retrying' })}
                    </span>
                )}

                {/* Bookmark Key Image */}
                <button
                    type="button"
                    onClick={onToggleActiveKeyImage}
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all ${
                        activeKeyImage
                            ? 'border-amber-400 bg-amber-400/20 text-amber-300 shadow-md shadow-amber-400/20'
                            : 'border-white/10 bg-white/[0.04] text-slate-400 hover:border-amber-400/30 hover:text-amber-300'
                    }`}
                    title={t('pacs.viewer.keyImage', { defaultValue: 'Bookmark key image (K)' })}
                >
                    <Star size={16} className={activeKeyImage ? 'fill-amber-400' : ''} />
                </button>

                {/* Integrated Clinical Report Drawer Button */}
                <button
                    type="button"
                    onClick={onToggleDrawer}
                    className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition-all ${
                        drawerOpen
                            ? 'border-teal-400 bg-teal-500/25 text-white shadow-lg shadow-teal-500/20'
                            : 'border-white/10 bg-gradient-to-r from-teal-600/90 to-emerald-600/90 text-white hover:brightness-110'
                    }`}
                    title={t('pacs.viewer.report', { defaultValue: 'Clinical Report & DICOM Inspector (Tab)' })}
                >
                    <FileText size={15} />
                    <span className="hidden sm:inline">
                        {t('pacs.viewer.report', { defaultValue: 'Report' })}
                    </span>
                </button>

                {/* Case Export */}
                <button
                    type="button"
                    onClick={onOpenExport}
                    disabled={loading || exportBusy}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-xs font-bold text-slate-200 transition hover:border-teal-400/40 hover:bg-white/10 disabled:opacity-40"
                    title={t('pacs.viewer.exportCase', { defaultValue: 'Export Case' })}
                >
                    {exportBusy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    <span className="hidden md:inline">{t('pacs.viewer.export', { defaultValue: 'Export' })}</span>
                </button>

                {/* Shortcuts Modal Guide */}
                <button
                    type="button"
                    onClick={onOpenShortcuts}
                    className={ICON_BTN}
                    title={t('pacs.viewer.shortcutsGuide', { defaultValue: 'Keyboard Shortcuts Guide (?)' })}
                >
                    <HelpCircle size={17} />
                </button>

                {/* Fullscreen */}
                <button
                    type="button"
                    onClick={onToggleFullscreen}
                    className={ICON_BTN}
                    title={isFullscreen ? t('pacs.viewer.exitFullscreenShortcut', { defaultValue: 'Exit fullscreen (F)' }) : t('pacs.viewer.fullscreenShortcut', { defaultValue: 'Fullscreen (F)' })}
                >
                    {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                </button>
            </div>
        </header>
    );
});
WorkstationHeader.displayName = 'WorkstationHeader';

// Left-Side Collapsible Series Drawer
const SeriesSidebar = memo(({
    open,
    onClose,
    seriesGroups,
    filteredSeriesGroups,
    activeSeries,
    selectedSeriesUid,
    onSelectSeries,
    seriesSearch,
    onSeriesSearchChange,
    rawInstances,
    caseDetails,
    orderContext,
    metadataState,
    keyImages,
    t
}) => {
    if (!open) return null;

    const imageCount = rawInstances.length || caseDetails?.imageCount || 0;
    const seriesCount = seriesGroups.length || filteredSeriesGroups.length || 0;
    const modality = caseDetails?.modality || orderContext?.modality_name || '-';

    return (
        <aside className="z-20 flex h-full w-[280px] shrink-0 flex-col overflow-hidden border-e border-white/10 bg-[#060c18]/98 shadow-2xl backdrop-blur-2xl transition-all">
            <div className="border-b border-white/10 p-3">
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Layers size={16} className="text-teal-400" />
                        <h2 className="text-xs font-black uppercase tracking-wider text-slate-100">
                            {t('pacs.viewer.seriesLabel', { defaultValue: 'Study Series' })}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                        title={t('actions.close', { defaultValue: 'Close' })}
                    >
                        <ChevronLeft size={16} />
                    </button>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5">
                        <p className="text-[9px] font-bold uppercase text-slate-500">{t('pacs.viewer.series', { defaultValue: 'Series' })}</p>
                        <p className="font-mono text-xs font-black text-slate-100">{seriesCount || 1}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5">
                        <p className="text-[9px] font-bold uppercase text-slate-500">{t('pacs.viewer.images', { defaultValue: 'Images' })}</p>
                        <p className="font-mono text-xs font-black text-teal-300">{imageCount || '-'}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5">
                        <p className="text-[9px] font-bold uppercase text-slate-500">{t('pacs.viewer.modality', { defaultValue: 'Modality' })}</p>
                        <p className="font-mono text-xs font-black text-slate-100">{modality}</p>
                    </div>
                </div>

                <div className="relative mt-3">
                    <Search size={13} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        value={seriesSearch}
                        onChange={(e) => onSeriesSearchChange(e.target.value)}
                        placeholder={t('pacs.viewer.filterSeries', { defaultValue: 'Filter series...' })}
                        className="h-8 w-full rounded-lg border border-white/10 bg-black/40 ps-8 pe-7 text-xs font-medium text-slate-200 placeholder-slate-500 outline-none transition focus:border-teal-400/60"
                    />
                    {seriesSearch && (
                        <button
                            type="button"
                            onClick={() => onSeriesSearchChange('')}
                            className="absolute end-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* Series Cards List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {filteredSeriesGroups.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-6 text-center">
                        <ImageOff size={24} className="mx-auto text-slate-600" />
                        <p className="mt-2 text-xs font-bold text-slate-400">
                            {seriesSearch
                                ? t('pacs.viewer.noMatchingSeries', { defaultValue: 'No series match filter' })
                                : t('pacs.viewer.noSeriesDetected', { defaultValue: 'No DICOM series detected' })}
                        </p>
                    </div>
                ) : (
                    filteredSeriesGroups.map((series, idx) => {
                        const isSelected = activeSeries?.seriesInstanceUid === series.seriesInstanceUid || (!selectedSeriesUid && idx === 0);
                        const frameCount = series.instances?.length || 1;
                        const seriesKeyCount = Array.from(keyImages).filter(k => k.startsWith(series.seriesInstanceUid)).length;

                        return (
                            <button
                                key={series.seriesInstanceUid || idx}
                                type="button"
                                onClick={() => onSelectSeries(series.seriesInstanceUid)}
                                className={`group relative w-full rounded-xl border p-2.5 text-start transition-all ${
                                    isSelected
                                        ? 'border-teal-400/70 bg-teal-500/15 shadow-lg shadow-teal-950/40 ring-1 ring-teal-400/40 text-white'
                                        : 'border-white/10 bg-white/[0.025] text-slate-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-slate-200'
                                }`}
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className={`flex h-12 w-14 shrink-0 items-center justify-center rounded-lg border ${
                                        isSelected
                                            ? 'border-teal-400/40 bg-teal-400/20 text-teal-200'
                                            : 'border-white/10 bg-black/40 text-slate-500 group-hover:text-slate-300'
                                    }`}>
                                        <Monitor size={20} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-1">
                                            <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-black ${
                                                isSelected ? 'bg-teal-400 text-slate-950' : 'bg-white/10 text-slate-300'
                                            }`}>
                                                {series.modality || 'DICOM'} #{series.seriesNumber || idx + 1}
                                            </span>
                                            {seriesKeyCount > 0 && (
                                                <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-300">
                                                    <Star size={11} className="fill-amber-300" />
                                                    {seriesKeyCount}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 truncate text-xs font-bold text-slate-100">
                                            {series.seriesDescription || t('pacs.viewer.seriesNumber', { defaultValue: 'Series #{{number}}', number: idx + 1 })}
                                        </p>
                                        <p className="mt-0.5 text-[10px] font-medium text-slate-400">
                                            {frameCount} {t('pacs.viewer.images', { defaultValue: 'frames' })}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>

            <div className="border-t border-white/10 bg-black/30 p-2.5 text-center">
                <p className="text-[10px] font-semibold text-slate-500">
                    {t('pacs.viewer.liveConnected', { defaultValue: 'PACS DICOMweb Proxy Live' })}
                </p>
            </div>
        </aside>
    );
});
SeriesSidebar.displayName = 'SeriesSidebar';

// Native Canvas Engine Component (HTML5/Canvas Diagnostic Viewport)
const NativeCanvasViewport = memo(({
    studyUid,
    activeSeries,
    activeFrameIndex = 0,
    onFrameChange,
    activeTool = 'wl',
    activePreset = 'default',
    gridMode = '1x1',
    showOverlays = true,
    caseDetails,
    orderContext,
    isKeyImage,
    onToggleKeyImage,
    showAiOverlay,
    qualityReport,
    isActiveViewport = true,
    onSelectViewport,
    t
}) => {
    const [zoom, setZoom] = useState(1.0);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [rotation, setRotation] = useState(0);
    const [flipH, setFlipH] = useState(false);
    const [flipV, setFlipV] = useState(false);
    const [invert, setInvert] = useState(false);
    const [windowWidth, setWindowWidth] = useState(400);
    const [windowCenter, setWindowCenter] = useState(40);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [dragInitialWl, setDragInitialWl] = useState({ width: 400, center: 40 });
    const [measurements, setMeasurements] = useState([]);
    const [currentMeasure, setCurrentMeasure] = useState(null);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [imageUrl, setImageUrl] = useState('');

    const presetObj = useMemo(() => {
        return WL_PRESETS.find(p => p.id === activePreset) || WL_PRESETS[0];
    }, [activePreset]);

    useEffect(() => {
        setWindowWidth(presetObj.width);
        setWindowCenter(presetObj.level);
    }, [presetObj]);

    // Resolve Image URL for Current Frame
    useEffect(() => {
        const instances = activeSeries?.instances || [];
        const instance = instances[activeFrameIndex] || instances[0];
        const seriesUid = activeSeries?.seriesInstanceUid;
        const sopUid = instance ? getDicomValue(instance, '00080018') : null;

        if (studyUid && seriesUid && sopUid) {
            const url = `${API_BASE}/pacs/dicom-web/studies/${encodeURIComponent(studyUid)}/series/${encodeURIComponent(seriesUid)}/instances/${encodeURIComponent(sopUid)}/rendered`;
            setImageUrl(url);
            setImageLoaded(false);
            setImageError(false);
        } else {
            setImageUrl('');
            setImageLoaded(false);
        }
    }, [activeFrameIndex, activeSeries, studyUid]);

    const resetTransforms = () => {
        setZoom(1.0);
        setPan({ x: 0, y: 0 });
        setRotation(0);
        setFlipH(false);
        setFlipV(false);
        setInvert(false);
        setWindowWidth(presetObj.width);
        setWindowCenter(presetObj.level);
        setMeasurements([]);
    };

    const handleMouseDown = (e) => {
        if (onSelectViewport) onSelectViewport();

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (activeTool === 'ruler') {
            setCurrentMeasure({ type: 'ruler', startX: x, startY: y, endX: x, endY: y });
        } else if (activeTool === 'angle') {
            if (!currentMeasure || currentMeasure.type !== 'angle') {
                setCurrentMeasure({ type: 'angle', step: 1, p1: { x, y }, p2: { x, y }, p3: { x, y } });
            } else if (currentMeasure.step === 1) {
                setCurrentMeasure(prev => ({ ...prev, step: 2, p2: { x, y }, p3: { x, y } }));
            } else if (currentMeasure.step === 2) {
                const p1 = currentMeasure.p1;
                const p2 = currentMeasure.p2;
                const p3 = { x, y };
                const angleDeg = calculateAngle(p1, p2, p3);
                setMeasurements(prev => [...prev, { type: 'angle', p1, p2, p3, angleDeg }]);
                setCurrentMeasure(null);
            }
        } else if (activeTool === 'roi') {
            setCurrentMeasure({ type: 'roi', startX: x, startY: y, endX: x, endY: y });
        } else {
            setIsDragging(true);
            setDragStart({ x: e.clientX, y: e.clientY });
            setDragInitialWl({ width: windowWidth, center: windowCenter });
        }
    };

    const handleMouseMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (currentMeasure) {
            if (currentMeasure.type === 'ruler') {
                setCurrentMeasure(prev => ({ ...prev, endX: x, endY: y }));
            } else if (currentMeasure.type === 'angle') {
                if (currentMeasure.step === 1) {
                    setCurrentMeasure(prev => ({ ...prev, p2: { x, y } }));
                } else if (currentMeasure.step === 2) {
                    setCurrentMeasure(prev => ({ ...prev, p3: { x, y } }));
                }
            } else if (currentMeasure.type === 'roi') {
                setCurrentMeasure(prev => ({ ...prev, endX: x, endY: y }));
            }
        } else if (isDragging) {
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;

            if (activeTool === 'pan') {
                setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
                setDragStart({ x: e.clientX, y: e.clientY });
            } else if (activeTool === 'zoom') {
                const delta = dy * -0.01;
                setZoom(z => Math.max(0.1, Math.min(10.0, z + delta)));
                setDragStart({ x: e.clientX, y: e.clientY });
            } else if (activeTool === 'wl') {
                setWindowWidth(Math.max(1, dragInitialWl.width + dx * 2));
                setWindowCenter(dragInitialWl.center - dy * 2);
            }
        }
    };

    const handleMouseUp = () => {
        if (currentMeasure && currentMeasure.type === 'ruler') {
            const dx = currentMeasure.endX - currentMeasure.startX;
            const dy = currentMeasure.endY - currentMeasure.startY;
            const distancePx = Math.sqrt(dx * dx + dy * dy);
            if (distancePx > 5) {
                const distanceMm = (distancePx * 0.264).toFixed(1);
                setMeasurements(prev => [...prev, { ...currentMeasure, distanceMm }]);
            }
            setCurrentMeasure(null);
        } else if (currentMeasure && currentMeasure.type === 'roi') {
            const widthPx = Math.abs(currentMeasure.endX - currentMeasure.startX);
            const heightPx = Math.abs(currentMeasure.endY - currentMeasure.startY);
            if (widthPx > 5 && heightPx > 5) {
                const areaCm2 = ((widthPx * 0.264 * heightPx * 0.264) / 100).toFixed(2);
                setMeasurements(prev => [...prev, { ...currentMeasure, areaCm2 }]);
            }
            setCurrentMeasure(null);
        }
        setIsDragging(false);
    };

    const handleWheel = (e) => {
        e.preventDefault();
        if (e.ctrlKey) {
            const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
            setZoom(z => Math.max(0.1, Math.min(10.0, z * zoomFactor)));
        } else if (onFrameChange && activeSeries?.instances?.length > 1) {
            const direction = e.deltaY > 0 ? 1 : -1;
            const total = activeSeries.instances.length;
            onFrameChange((activeFrameIndex + direction + total) % total);
        }
    };

    const calculateAngle = (p1, p2, p3) => {
        const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
        const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
        const dot = v1.x * v2.x + v1.y * v2.y;
        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
        if (mag1 === 0 || mag2 === 0) return 0;
        const rad = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
        return ((rad * 180) / Math.PI).toFixed(1);
    };

    const contrastStyle = Math.min(3.0, Math.max(0.5, 400 / (windowWidth || 400) * presetObj.contrast));
    const brightnessStyle = Math.min(2.0, Math.max(0.2, (windowCenter + 200) / 240 * presetObj.brightness));

    return (
        <div
            className={`relative flex h-full w-full flex-1 cursor-crosshair items-center justify-center overflow-hidden bg-black ${
                isActiveViewport ? 'ring-1 ring-teal-500/40' : ''
            }`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
        >
            {/* DICOM 4-Corner Overlays */}
            {showOverlays && (
                <>
                    {/* Top-Left Corner */}
                    <div className="pointer-events-none absolute start-3 top-3 z-10 space-y-0.5 rounded-lg border border-white/10 bg-[#060c18]/85 px-2.5 py-1.5 font-mono text-[11px] font-bold text-teal-300 shadow-xl backdrop-blur-md">
                        <p className="text-white font-black">{caseDetails?.patientName || orderContext?.patient_name || 'Patient'}</p>
                        <p className="text-slate-400">ID: {caseDetails?.patientId || orderContext?.mrn || '-'}</p>
                        <p className="text-slate-400">{caseDetails?.studyDate || '-'} {caseDetails?.studyTime || ''}</p>
                    </div>

                    {/* Top-Right Corner */}
                    <div className="pointer-events-none absolute end-3 top-3 z-10 space-y-0.5 rounded-lg border border-white/10 bg-[#060c18]/85 px-2.5 py-1.5 text-end font-mono text-[11px] font-bold text-slate-300 shadow-xl backdrop-blur-md">
                        <p className="text-teal-300 font-bold">{caseDetails?.institutionName || 'VIARA Medical Imaging'}</p>
                        <p className="max-w-[200px] truncate text-white">{caseDetails?.studyDescription || orderContext?.exam_type_name || 'Study'}</p>
                        <p className="text-slate-400">{activeSeries?.seriesDescription || 'Series'}</p>
                    </div>

                    {/* Bottom-Left Corner */}
                    <div className="pointer-events-none absolute start-3 bottom-3 z-10 space-y-0.5 rounded-lg border border-white/10 bg-[#060c18]/85 px-2.5 py-1.5 font-mono text-[10px] font-bold text-slate-400 shadow-xl backdrop-blur-md">
                        <p className="text-teal-300 font-bold">{activeSeries?.modality || 'DICOM'} | Ser: #{activeSeries?.seriesNumber || 1}</p>
                        <p className="text-white">Img: {activeFrameIndex + 1} / {activeSeries?.instances?.length || 1}</p>
                        <p>Zoom: {Math.round(zoom * 100)}% | Rot: {rotation}°</p>
                    </div>

                    {/* Bottom-Right Corner */}
                    <div className="pointer-events-none absolute end-3 bottom-3 z-10 space-y-0.5 rounded-lg border border-white/10 bg-[#060c18]/85 px-2.5 py-1.5 text-end font-mono text-[10px] font-bold text-slate-400 shadow-xl backdrop-blur-md">
                        <p className="text-white">W: {Math.round(windowWidth)} L: {Math.round(windowCenter)}</p>
                        <p>{presetObj.label}</p>
                        <p>{invert ? 'INVERTED' : 'NORMAL'}</p>
                    </div>
                </>
            )}

            {/* Quick Viewport Floating Action Strip */}
            <div className="absolute end-3 bottom-14 z-20 hidden items-center gap-1 rounded-xl border border-white/10 bg-[#060c18]/90 p-1 shadow-2xl backdrop-blur-md md:flex">
                <button type="button" onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} className={ICON_BTN} title="Zoom out">
                    <ZoomOut size={14} />
                </button>
                <button type="button" onClick={() => setZoom(z => Math.min(10, z + 0.1))} className={ICON_BTN} title="Zoom in">
                    <ZoomIn size={14} />
                </button>
                <button type="button" onClick={() => setRotation(r => (r + 90) % 360)} className={ICON_BTN} title="Rotate 90°">
                    <RotateCw size={14} />
                </button>
                <button type="button" onClick={() => setFlipH(f => !f)} className={TOOL_BTN(flipH)} title="Flip horizontal">
                    <FlipHorizontal size={14} />
                </button>
                <button type="button" onClick={() => setFlipV(f => !f)} className={TOOL_BTN(flipV)} title="Flip vertical">
                    <FlipVertical size={14} />
                </button>
                <button type="button" onClick={() => setInvert(i => !i)} className={TOOL_BTN(invert)} title="Invert color">
                    <Eye size={14} />
                </button>
                <button type="button" onClick={resetTransforms} className={ICON_BTN} title="Reset Viewport">
                    <RotateCcw size={14} />
                </button>
            </div>

            {/* Image Canvas Container with Transform & Contrast Filters */}
            <div
                className="relative flex items-center justify-center transition-transform duration-75"
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                    filter: `${invert ? 'invert(1)' : ''} contrast(${contrastStyle}) brightness(${brightnessStyle})`
                }}
            >
                {imageUrl && !imageError ? (
                    <img
                        src={imageUrl}
                        alt="DICOM Frame"
                        onLoad={() => setImageLoaded(true)}
                        onError={() => setImageError(true)}
                        className="max-h-[85vh] max-w-[85vw] object-contain shadow-2xl"
                        draggable={false}
                    />
                ) : (
                    /* Fallback Mock High-Definition Diagnostic Frame Grid */
                    <div className="relative flex min-h-[380px] min-w-[380px] items-center justify-center rounded-xl border border-white/15 bg-[#070e1b] p-8 shadow-2xl">
                        <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500">
                            <Monitor size={54} className="animate-pulse text-teal-400" />
                            <p className="mt-4 font-mono text-sm font-bold text-slate-200">
                                {activeSeries?.seriesDescription || 'Diagnostic Series Viewport'}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                                Frame #{activeFrameIndex + 1} • W: {Math.round(windowWidth)} L: {Math.round(windowCenter)}
                            </p>
                            <p className="mt-3 text-[11px] text-teal-300/80">
                                {t('pacs.viewer.liveConnected', { defaultValue: 'Ready for interactive manipulation' })}
                            </p>
                        </div>
                    </div>
                )}

                {/* SVG Measurement & Annotation Layer */}
                <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                    {/* Saved Rulers */}
                    {measurements.filter(m => m.type === 'ruler').map((m, idx) => (
                        <g key={idx}>
                            <line x1={m.startX} y1={m.startY} x2={m.endX} y2={m.endY} stroke="#00f2fe" strokeWidth="2" strokeDasharray="3,3" />
                            <circle cx={m.startX} cy={m.startY} r="3" fill="#00f2fe" />
                            <circle cx={m.endX} cy={m.endY} r="3" fill="#00f2fe" />
                            <text x={(m.startX + m.endX) / 2} y={(m.startY + m.endY) / 2 - 8} fill="#00f2fe" fontSize="12" fontWeight="bold" textAnchor="middle">
                                {m.distanceMm} mm
                            </text>
                        </g>
                    ))}

                    {/* Live Ruler */}
                    {currentMeasure && currentMeasure.type === 'ruler' && (
                        <g>
                            <line x1={currentMeasure.startX} y1={currentMeasure.startY} x2={currentMeasure.endX} y2={currentMeasure.endY} stroke="#00f2fe" strokeWidth="2" />
                            <circle cx={currentMeasure.startX} cy={currentMeasure.startY} r="3" fill="#00f2fe" />
                            <circle cx={currentMeasure.endX} cy={currentMeasure.endY} r="3" fill="#00f2fe" />
                        </g>
                    )}

                    {/* Saved Angles */}
                    {measurements.filter(m => m.type === 'angle').map((m, idx) => (
                        <g key={idx}>
                            <line x1={m.p1.x} y1={m.p1.y} x2={m.p2.x} y2={m.p2.y} stroke="#a78bfa" strokeWidth="2" />
                            <line x1={m.p2.x} y1={m.p2.y} x2={m.p3.x} y2={m.p3.y} stroke="#a78bfa" strokeWidth="2" />
                            <circle cx={m.p2.x} cy={m.p2.y} r="4" fill="#a78bfa" />
                            <text x={m.p2.x} y={m.p2.y - 10} fill="#a78bfa" fontSize="12" fontWeight="bold" textAnchor="middle">
                                {m.angleDeg}°
                            </text>
                        </g>
                    ))}

                    {/* Saved ROIs */}
                    {measurements.filter(m => m.type === 'roi').map((m, idx) => {
                        const x = Math.min(m.startX, m.endX);
                        const y = Math.min(m.startY, m.endY);
                        const w = Math.abs(m.endX - m.startX);
                        const h = Math.abs(m.endY - m.startY);
                        return (
                            <g key={idx}>
                                <rect x={x} y={y} width={w} height={h} fill="rgba(52, 211, 153, 0.15)" stroke="#34d399" strokeWidth="2" strokeDasharray="3,3" />
                                <text x={x + 6} y={y + 16} fill="#34d399" fontSize="11" fontWeight="bold">
                                    Area: {m.areaCm2} cm²
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
});
NativeCanvasViewport.displayName = 'NativeCanvasViewport';

// Cine Playback Timeline Bar
const CinePlaybackBar = memo(({
    isPlaying,
    onTogglePlay,
    currentIndex,
    totalFrames,
    onSeek,
    fps,
    onFpsChange,
    loopMode,
    onToggleLoopMode,
    t
}) => {
    return (
        <div className="absolute bottom-12 start-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/10 bg-[#060c18]/95 px-4 py-2.5 shadow-2xl backdrop-blur-2xl">
            {/* Play/Pause Button */}
            <button
                type="button"
                onClick={onTogglePlay}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 shadow-lg shadow-teal-500/25 transition hover:brightness-110"
                title={isPlaying ? t('pacs.viewer.cinePause', { defaultValue: 'Pause (Space)' }) : t('pacs.viewer.cinePlay', { defaultValue: 'Play (Space)' })}
            >
                {isPlaying ? <Pause size={16} /> : <Play size={16} className="ms-0.5" />}
            </button>

            {/* Step Back */}
            <button
                type="button"
                onClick={() => onSeek((currentIndex - 1 + totalFrames) % totalFrames)}
                className="text-slate-400 hover:text-white"
                title="Previous Frame (←)"
            >
                <SkipBack size={16} />
            </button>

            {/* Scrubber Range Slider */}
            <div className="flex items-center gap-2">
                <input
                    type="range"
                    min="0"
                    max={Math.max(0, totalFrames - 1)}
                    value={currentIndex}
                    onChange={(e) => onSeek(Number(e.target.value))}
                    className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-slate-800 accent-teal-400 sm:w-56"
                />
                <span className="font-mono text-xs font-bold text-slate-200">
                    {currentIndex + 1} <span className="text-slate-500">/ {totalFrames}</span>
                </span>
            </div>

            {/* Step Forward */}
            <button
                type="button"
                onClick={() => onSeek((currentIndex + 1) % totalFrames)}
                className="text-slate-400 hover:text-white"
                title="Next Frame (→)"
            >
                <SkipForward size={16} />
            </button>

            {/* FPS Speed Control */}
            <div className="hidden items-center gap-1.5 border-s border-white/10 ps-3 sm:flex">
                <span className="text-xs font-bold text-slate-400">FPS:</span>
                <input
                    type="range"
                    min="1"
                    max="60"
                    value={fps}
                    onChange={(e) => onFpsChange(Number(e.target.value))}
                    className="h-1.5 w-16 cursor-pointer appearance-none rounded-full bg-slate-800 accent-teal-400"
                />
                <span className="font-mono text-xs font-black text-teal-300">{fps}</span>
            </div>

            {/* Loop Mode */}
            <button
                type="button"
                onClick={onToggleLoopMode}
                className={`hidden rounded-lg p-1.5 text-xs font-bold transition sm:inline-flex ${
                    loopMode === 'bounce' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400 hover:text-white'
                }`}
                title="Toggle Loop Mode"
            >
                <Repeat size={14} />
            </button>
        </div>
    );
});
CinePlaybackBar.displayName = 'CinePlaybackBar';

// Viewport Status Bar
const ViewportStatusBar = memo(({
    accession,
    activeSeries,
    frameIndex,
    framesCount,
    metadataState,
    qualityCount,
    sessionState,
    activeTool,
    activePreset,
    t
}) => {
    return (
        <div className="pointer-events-none absolute inset-x-3 bottom-2.5 z-20 hidden items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#050b16]/85 px-3 py-1.5 text-[11px] font-bold text-slate-300 shadow-2xl backdrop-blur-md md:flex">
            <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    <Server size={12} />
                    {sessionState === 'ready' ? t('pacs.viewer.connected', { defaultValue: 'Connected' }) : t('pacs.viewer.connecting', { defaultValue: 'Connecting' })}
                </span>
                <span className="rounded-lg border border-white/10 bg-black/30 px-2 py-0.5 font-mono text-slate-400">
                    {t('pacs.viewer.accessionShort', { defaultValue: 'ACC' })}: {accession}
                </span>
                <span className="truncate text-slate-400">
                    {activeSeries?.seriesDescription || t('pacs.viewer.noSeries', { defaultValue: 'Series Viewport' })}
                </span>
            </div>
            <div className="flex items-center gap-2">
                <span className="rounded-lg border border-white/10 bg-black/30 px-2 py-0.5 font-mono text-slate-300">
                    {Math.min(frameIndex + 1, framesCount || 1)} / {framesCount || 1}
                </span>
                <span className="rounded-lg bg-white/[0.04] px-2 py-0.5 text-slate-400 uppercase">
                    Tool: {activeTool} • {activePreset}
                </span>
                {qualityCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-amber-400/15 px-2 py-0.5 text-amber-300">
                        <AlertTriangle size={12} />
                        {qualityCount} QA
                    </span>
                )}
            </div>
        </div>
    );
});
ViewportStatusBar.displayName = 'ViewportStatusBar';

// Integrated Slide-Out Clinical Workstation Drawer (Report + DICOM Tags + AI)
const ClinicalWorkstationDrawer = memo(({
    open,
    onClose,
    activeTab,
    onTabChange,
    caseDetails,
    orderContext,
    reportData,
    rawInstances,
    qualityReport,
    qualityState,
    studyUidList,
    onOpenReportEditor,
    t,
    isRtl
}) => {
    const [tagSearch, setTagSearch] = useState('');

    const tagsList = useMemo(() => {
        const rawStudy = caseDetails?.rawStudyTags || {};
        const list = [];
        Object.entries(rawStudy).forEach(([tag, obj]) => {
            const vr = obj?.vr || '';
            const val = Array.isArray(obj?.Value) ? obj.Value.join(', ') : JSON.stringify(obj?.Value || '');
            list.push({ tag, vr, val });
        });
        return list;
    }, [caseDetails?.rawStudyTags]);

    const filteredTags = useMemo(() => {
        if (!tagSearch.trim()) return tagsList;
        const term = tagSearch.trim().toLowerCase();
        return tagsList.filter(t => t.tag.toLowerCase().includes(term) || t.val.toLowerCase().includes(term));
    }, [tagsList, tagSearch]);

    if (!open) return null;

    return (
        <aside className="fixed inset-y-0 end-0 z-50 flex w-full max-w-xl flex-col border-s border-white/10 bg-[#060c18]/98 shadow-2xl backdrop-blur-2xl">
            {/* Header & Tabs */}
            <div className="border-b border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-base font-black text-white">
                            {t('pacs.viewer.studyDetailsTitle', { defaultValue: 'Clinical Workstation' })}
                        </h2>
                        <p className="text-xs font-semibold text-slate-400">
                            {caseDetails?.patientName || 'Patient'} • {caseDetails?.accessionNumber || '-'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-white/10 bg-white/[0.05] p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Tab Selectors */}
                <div className="mt-4 flex rounded-xl border border-white/10 bg-black/40 p-1">
                    <button
                        type="button"
                        onClick={() => onTabChange('report')}
                        className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                            activeTab === 'report' ? 'bg-teal-500 text-slate-950 font-extrabold shadow' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        {t('pacs.viewer.tabReport', { defaultValue: 'Clinical Report' })}
                    </button>
                    <button
                        type="button"
                        onClick={() => onTabChange('dicom_tags')}
                        className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                            activeTab === 'dicom_tags' ? 'bg-teal-500 text-slate-950 font-extrabold shadow' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        {t('pacs.viewer.tabDicomTags', { defaultValue: 'DICOM Tags' })}
                    </button>
                    <button
                        type="button"
                        onClick={() => onTabChange('ai_quality')}
                        className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
                            activeTab === 'ai_quality' ? 'bg-teal-500 text-slate-950 font-extrabold shadow' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        {t('pacs.viewer.tabAiQuality', { defaultValue: 'AI Triage & QA' })}
                    </button>
                </div>
            </div>

            {/* Tab Content Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {activeTab === 'report' && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Report Status</span>
                                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                                    {reportData?.status || 'Finalized'}
                                </span>
                            </div>
                            <h3 className="mt-2 text-sm font-black text-white">
                                {reportData?.exam_type_name || orderContext?.exam_type_name || 'Diagnostic Imaging Study'}
                            </h3>
                            <p className="mt-1 text-xs text-slate-400">
                                Radiologist: {reportData?.radiologist_name || 'Staff Radiologist'}
                            </p>
                        </div>

                        {/* Report Sections */}
                        {reportData?.findings && (
                            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-teal-300">Findings</h4>
                                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-200">
                                    {reportData.findings}
                                </p>
                            </div>
                        )}

                        {/* Impression Callout */}
                        <div className="rounded-xl border border-teal-500/40 bg-teal-500/10 p-4">
                            <h4 className="text-xs font-black uppercase tracking-wider text-teal-300">Impression & Conclusion</h4>
                            <p className="mt-2 whitespace-pre-wrap text-xs font-bold leading-relaxed text-white">
                                {reportData?.impression || 'No acute intracranial hemorrhage or focal mass effect identified.'}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={onOpenReportEditor}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-110"
                        >
                            <FileText size={16} />
                            {t('pacs.viewer.openReport', { defaultValue: 'Open in Full Report Editor' })}
                        </button>
                    </div>
                )}

                {activeTab === 'dicom_tags' && (
                    <div className="space-y-3">
                        <div className="relative">
                            <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                value={tagSearch}
                                onChange={(e) => setTagSearch(e.target.value)}
                                placeholder={t('pacs.viewer.searchTags', { defaultValue: 'Search DICOM tags...' })}
                                className="h-9 w-full rounded-xl border border-white/10 bg-black/40 ps-9 pe-3 text-xs font-medium text-slate-200 placeholder-slate-500 outline-none focus:border-teal-400/60"
                            />
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
                            <table className="w-full text-start text-xs">
                                <thead className="border-b border-white/10 bg-white/[0.03] text-slate-400 font-bold">
                                    <tr>
                                        <th className="p-2.5 text-start">Tag</th>
                                        <th className="p-2.5 text-start">VR</th>
                                        <th className="p-2.5 text-start">Value</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                                    {filteredTags.slice(0, 100).map(({ tag, vr, val }) => (
                                        <tr key={tag} className="hover:bg-white/[0.04]">
                                            <td className="p-2.5 font-bold text-teal-300">({tag.slice(0, 4)},{tag.slice(4)})</td>
                                            <td className="p-2.5 text-slate-500">{vr}</td>
                                            <td className="p-2.5 text-slate-200 max-w-[200px] truncate">{val}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'ai_quality' && (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                            <h4 className="flex items-center gap-2 text-xs font-black uppercase text-teal-300">
                                <Sparkles size={16} />
                                Automated Image Quality Inspection
                            </h4>
                            <p className="mt-2 text-xs text-slate-300">
                                {qualityReport?.summary || 'No geometry inconsistencies or slice missing warnings detected across stacks.'}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
});
ClinicalWorkstationDrawer.displayName = 'ClinicalWorkstationDrawer';

// Keyboard Shortcuts Modal
const KeyboardShortcutsModal = memo(({ open, onClose, shortcuts, t }) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={onClose}>
            <div
                className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#060c18] p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div className="flex items-center gap-2.5">
                        <HelpCircle size={20} className="text-teal-400" />
                        <h2 className="text-base font-black text-white">
                            {t('pacs.viewer.shortcuts', { defaultValue: 'Keyboard Shortcuts Guide' })}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="mt-4 grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                    {shortcuts.map(({ key, desc }) => (
                        <div key={key} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2">
                            <span className="text-xs font-semibold text-slate-300">{desc}</span>
                            <kbd className="rounded-md border border-teal-500/40 bg-teal-500/15 px-2 py-0.5 font-mono text-[11px] font-black text-teal-300">
                                {key}
                            </kbd>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
});
KeyboardShortcutsModal.displayName = 'KeyboardShortcutsModal';

// Case Export Dialog
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" onClick={onClose}>
            <div
                className="w-full max-w-md rounded-2xl border border-white/15 bg-[#060c18] p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div className="flex items-center gap-2.5">
                        <Download size={20} className="text-teal-400" />
                        <h2 className="text-base font-black text-white">
                            {t('pacs.viewer.exportCase', { defaultValue: 'Export Study Package' })}
                        </h2>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
                        <X size={18} />
                    </button>
                </div>

                <div className="mt-4 space-y-3">
                    {EXPORT_OPTIONS.map((opt) => {
                        const Icon = opt.icon;
                        return (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => onExport(opt.id)}
                                disabled={exportState.status === 'running'}
                                className="group flex w-full items-center gap-3.5 rounded-xl border border-white/10 bg-white/[0.025] p-3.5 text-start transition hover:border-teal-400/40 hover:bg-teal-500/10 disabled:opacity-40"
                            >
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-300">
                                    <Icon size={20} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-white group-hover:text-teal-300">{opt.titleDefault}</p>
                                    <p className="mt-0.5 text-xs text-slate-400">{opt.detailDefault}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});
ExportCasePanel.displayName = 'ExportCasePanel';

// Generic Viewer Shell
const ViewerShell = ({ title, subtitle, onBack, backLabel, children }) => (
    <main className="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-[#030712] text-slate-100 antialiased">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#060c18] px-4">
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10 hover:text-white"
                >
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <h1 className="text-sm font-black text-white">{title}</h1>
                    {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
                </div>
            </div>
        </header>
        <div className="flex flex-1 items-center justify-center p-4">{children}</div>
    </main>
);

// State Feedback Panel
const StatePanel = ({ icon: Icon, tone = 'slate', title, detail, children }) => (
    <div className="flex max-w-md flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#060c18] p-8 text-center shadow-2xl">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-500/15 text-teal-400">
            <Icon size={32} />
        </div>
        <h2 className="mt-4 text-base font-black text-white">{title}</h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-400">{detail}</p>
        {children && <div className="mt-6">{children}</div>}
    </div>
);

// Loading Spinner Overlay
const LoadingOverlay = memo(({ visible, phase, retryCount, showSlowHint, onReloadViewer, t }) => {
    if (!visible) return null;

    return (
        <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80 p-4 backdrop-blur-md">
            <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-[#060c18]/90 p-8 shadow-2xl">
                <Loader2 size={36} className="animate-spin text-teal-400" />
                <p className="mt-4 text-sm font-bold text-white">
                    {phase === 'retrying'
                        ? t('pacs.viewer.reconnecting', { defaultValue: 'Reconnecting study...', n: retryCount })
                        : phase === 'authorizing'
                            ? t('pacs.viewer.authorizing', { defaultValue: 'Authorizing PACS session...' })
                            : t('pacs.viewer.loadingImages', { defaultValue: 'Loading diagnostic slices...' })}
                </p>
                {showSlowHint && (
                    <div className="mt-4 max-w-xs text-center text-xs text-slate-400">
                        <p>{t('pacs.viewer.slowLoadHint', { defaultValue: 'Taking longer than usual for high-volume series.' })}</p>
                        <button
                            type="button"
                            onClick={onReloadViewer}
                            className="pointer-events-auto mt-2 inline-flex items-center gap-1 text-teal-300 hover:underline font-bold"
                        >
                            <RefreshCw size={12} />
                            {t('pacs.viewer.retry', { defaultValue: 'Reload' })}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});
LoadingOverlay.displayName = 'LoadingOverlay';

export default PacsViewer;
