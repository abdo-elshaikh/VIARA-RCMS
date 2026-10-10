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
    Activity,
    AlertCircle,
    AlertTriangle,
    Archive,
    ArrowLeft,
    Bookmark,
    CalendarDays,
    Camera,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Clock,
    Columns,
    Copy,
    Disc,
    Download,
    ExternalLink,
    Eye,
    EyeOff,
    FileCheck2,
    FileSpreadsheet,
    FileText,
    Filter,
    FlipHorizontal,
    FlipVertical,
    Globe,
    Grid,
    HardDrive,
    Hash,
    HelpCircle,
    Image as ImageIcon,
    ImageOff,
    Info,
    Laptop,
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
    Search,
    Send,
    Server,
    Settings,
    Share2,
    ShieldAlert,
    ShieldCheck,
    SkipBack,
    SkipForward,
    Sliders,
    Sparkles,
    Square,
    Star,
    Stethoscope,
    Tag,
    Trash2,
    User,
    UserRound,
    Volume2,
    WifiOff,
    X,
    Zap,
    ZoomIn,
    ZoomOut
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { selectCurrentToken } from '../store/authSlice';
import { authenticatedFetch, downloadAuthenticatedFile } from '../utils/authenticatedFetch';
import { analyzeStudyDisplaySets, groupInstancesBySeries } from '../utils/analyzeDisplaySets';
import { useGetPacsConfigQuery } from '../store/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const OHIF_BASE = import.meta.env.VITE_OHIF_URL || '';

const RETRY_DELAYS_MS = [2000, 4000, 8000, 15000];
const SLOW_LOAD_WARN_MS = 12000;
const COPY_FEEDBACK_MS = 1600;
const VIEWER_SESSION_TIMEOUT_MS = 10000;

const EXPORT_OPTIONS = [
    {
        id: 'dicom',
        icon: Archive,
        titleKey: 'pacs.viewer.exportDicomTitle',
        titleDefault: 'DICOM Study Archive (.zip)',
        detailKey: 'pacs.viewer.exportDicomDetail',
        detailDefault: 'Original full resolution DICOM files for clinical archiving or PACS interchange.',
        filenameSuffix: 'dicom.zip'
    },
    {
        id: 'images',
        icon: ImageIcon,
        titleKey: 'pacs.viewer.exportImagesTitle',
        titleDefault: 'High-Res Rendered Images (.zip)',
        detailKey: 'pacs.viewer.exportImagesDetail',
        detailDefault: 'Clinical JPEG/PNG images for patient consultation, printing, or referring doctors.',
        filenameSuffix: 'images.zip'
    }
];

const KEYBOARD_SHORTCUTS = [
    { key: 'P', desc: 'Pan / Drag tool (preview)', descAr: 'أداة التحريك والسحب' },
    { key: 'Z', desc: 'Zoom tool (preview)', descAr: 'أداة التكبير والتصغير' },
    { key: 'O', desc: 'Toggle DICOM 4-Corner Overlays', descAr: 'إظهار/إخفاء معلومات الزوايا' },
    { key: 'Space / C', desc: 'Play / Pause Cine loop', descAr: 'تشغيل/إيقاف العرض الحركي Cine' },
    { key: '← / →', desc: 'Previous / Next frame slice', descAr: 'الشريحة السابقة / التالية' },
    { key: 'S', desc: 'Toggle Series drawer', descAr: 'إظهار/إخفاء درج السلاسل' },
    { key: 'Tab', desc: 'Toggle Clinical Report & DICOM Inspector', descAr: 'فتح التقرير السريري وفاحص DICOM' },
    { key: 'K', desc: 'Bookmark Key Image frame', descAr: 'تمييز صورة رئيسية (Key Image)' },
    { key: 'F', desc: 'Toggle Fullscreen Mode', descAr: 'ملء الشاشة' },
    { key: 'R', desc: 'Reset Viewport Zoom & Pan', descAr: 'إعادة ضبط العرض' },
    { key: '?', desc: 'Show Keyboard Shortcuts guide', descAr: 'دليل اختصارات لوحة المفاتيح' },
    { key: 'Esc', desc: 'Close dialogs / drawers', descAr: 'إغلاق النوافذ المنبثقة' }
];

const normalizeUidList = (value = '') =>
    String(value)
        .split(',')
        .map((uid) => uid.trim())
        .filter(Boolean);

const getDicomValue = (dataset, tag) => dataset?.[tag]?.Value?.[0] ?? '';

const cleanDicomText = (value) => {
    if (!value) return '';
    let text = '';
    if (typeof value === 'object' && value !== null) {
        text = value.Alphabetic || value.Ideographic || value.Phonetic || '';
    } else if (typeof value === 'string') {
        text = value;
    }
    text = String(text || '').replace(/\^/g, ' ').replace(/\s+/g, ' ').trim();
    if (/[ØÙ][\u0080-\u00BF]/.test(text)) {
        try {
            const repaired = decodeURIComponent(escape(text));
            if (repaired && !repaired.includes('\uFFFD')) {
                text = repaired;
            }
        } catch {
            // retain text
        }
    }
    return text;
};

const normalizePatientName = (value) => cleanDicomText(value);

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

const ICON_BTN = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-300 transition-all duration-150 hover:bg-white/10 hover:text-white focus-visible:outline-none active:scale-95 disabled:cursor-not-allowed disabled:opacity-40';
const TOOL_BTN = (active) =>
    `relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold transition-all duration-150 focus-visible:outline-none ${
        active
            ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 shadow-lg shadow-teal-500/30 ring-2 ring-teal-400/50 font-black'
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

    // Core Workstation State
    const [resolvedStudyUids, setResolvedStudyUids] = useState('');
    const [viewerAuthorized, setViewerAuthorized] = useState(false);
    const [viewerToken, setViewerToken] = useState('');
    const currentAuthToken = useSelector(selectCurrentToken);
    const effectiveAuthToken = viewerToken || currentAuthToken || '';
    const [sessionOrderContext, setOrderContext] = useState(null);
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
    const [sidebarOpen, setSidebarOpen] = useState(
        !OHIF_BASE && typeof window !== 'undefined' && window.innerWidth >= 768
    );
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
    const [isOnline, setIsOnline] = useState(
        typeof navigator === 'undefined' ? true : navigator.onLine
    );

    // The native renderer is a preview fallback; diagnostic tools are provided by OHIF.
    const [activeTool, setActiveTool] = useState('pan');
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
    const [bookmarksStatus, setBookmarksStatus] = useState('loading');
    const bookmarkVersionRef = useRef({ uid: '', version: 0, loaded: false, saving: false });
    const keyImagesRef = useRef(new Set());
    const [selectedStudyUid, setSelectedStudyUid] = useState('');
    const [currentStudyExamId, setCurrentStudyExamId] = useState(null);
    const [exportPanelOpen, setExportPanelOpen] = useState(false);
    const [selectedExportStudyUid, setSelectedExportStudyUid] = useState('');
    const [exportState, setExportState] = useState({ status: 'idle', format: '', error: '' });
    const [seriesSearch, setSeriesSearch] = useState('');
    const [reportData, setReportData] = useState(null);
    const [externalViewersModalOpen, setExternalViewersModalOpen] = useState(false);

    const { data: pacsConfig } = useGetPacsConfigQuery();

    const studyUids = requestedStudyUids || resolvedStudyUids;
    const studyUidList = useMemo(() => normalizeUidList(studyUids), [studyUids]);
    const activeStudyUid = studyUidList.includes(selectedStudyUid) ? selectedStudyUid : studyUidList[0];
    const orderContext = !activeStudyUid || sessionOrderContext?.study_instance_uid === activeStudyUid ? sessionOrderContext : null;

    // Group Instances by Series
    const seriesGroups = useMemo(() => {
        return groupInstancesBySeries(rawInstances, { expandFrames: true });
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
        const fragment = new URLSearchParams({ viaraToken: viewerToken, parentOrigin: window.location.origin });
        return `${base}/viewer?${query.toString()}#${fragment}`;
    }, [lang, studyUids, viewerAuthorized, viewerToken]);

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
                setRawInstances([]);
                setReportData(null);
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
                setViewerToken(data.viewerToken || '');
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
        if (sessionState !== 'ready') return undefined;
        const controller = new AbortController();
        const timer = window.setInterval(async () => {
            try {
                const response = await authenticatedFetch(`${API_BASE}/pacs/viewer-session`, {
                    method: 'POST', signal: controller.signal,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studyInstanceUids: studyUidList })
                });
                if (!response.ok) throw new Error('Imaging session renewal failed');
                const data = await response.json();
                iframeRef.current?.contentWindow?.postMessage({ type: 'viara:viewer-token', token: data.viewerToken }, new URL(OHIF_BASE, window.location.origin).origin);
            } catch (error) { if (error.name !== 'AbortError') { setSessionError(error.message); setSessionState('error'); } }
        }, 8 * 60 * 1000);
        return () => { controller.abort(); window.clearInterval(timer); };
    }, [sessionState, studyUidList]);

    useEffect(() => {
        if (!viewerUrl) return undefined;
        const expectedOrigin = new URL(viewerUrl, window.location.origin).origin;
        const receiveStatus = (event) => {
            if (event.origin !== expectedOrigin || event.source !== iframeRef.current?.contentWindow || event.data?.type !== 'viara:viewer-status') return;
            if (event.data.state === 'ready') {
                setIframeLoaded(true);
                setShowSlowHint(false);
            } else if (event.data.state === 'error') {
                setSessionError(String(event.data.message || 'Imaging data could not be loaded'));
                setSessionState('error');
            }
        };
        window.addEventListener('message', receiveStatus);
        return () => window.removeEventListener('message', receiveStatus);
    }, [viewerUrl]);

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
        setCurrentStudyExamId(null);
        setRawInstances([]);
        setCaseDetails(null);
        setSelectedSeriesUid('');
        setActiveFrameIndex(0);
        setIsCinePlaying(false);

        fetchDicomJson(
            `${API_BASE}/pacs/dicom-web/studies?StudyInstanceUID=${encodeURIComponent(activeStudyUid)}`,
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
                        `${API_BASE}/pacs/dicom-web/studies/${encodeURIComponent(activeStudyUid)}/metadata`,
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
    }, [accessionParam, orderContext, sessionState, activeStudyUid, studyUidList.length, t]);

    // Fetch Clinical Report Data if Exam ID is available
    useEffect(() => {
        const effectiveExamId = currentStudyExamId || (activeStudyUid === studyUidList[0] ? (examIdParam || orderContext?.exam_id) : null);
        setReportData(null);
        if (!effectiveExamId) return undefined;
        const controller = new AbortController();

        authenticatedFetch(`${API_BASE}/exams/${effectiveExamId}`, { signal: controller.signal })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (!controller.signal.aborted) setReportData(data ? { ...(data.exam || data),
                    findings: (data.exam || data).report_sections?.findings || (data.exam || data).findings || '',
                    impression: (data.exam || data).report_sections?.impression || (data.exam || data).impression || '',
                    status: (data.exam || data).report_status || ''
                } : null);
            })
            .catch(() => {});
        return () => controller.abort();
    }, [examIdParam, orderContext?.exam_id, currentStudyExamId, activeStudyUid, studyUidList]);

    // Analyze Series Display Sets for Geometry Warnings
    useEffect(() => {
        if (sessionState !== 'ready' || !studyUidList.length) {
            setQualityReport(null);
            setQualityState('idle');
            return undefined;
        }

        const controller = new AbortController();
        setQualityState('loading');

        analyzeStudyDisplaySets(activeStudyUid, { signal: controller.signal })
            .then((report) => {
                if (controller.signal.aborted) return;
                setQualityReport(report);
                setQualityState(report ? 'ready' : 'unavailable');
            })
            .catch(() => {
                if (!controller.signal.aborted) setQualityState('unavailable');
            });

        return () => controller.abort();
    }, [sessionState, activeStudyUid, studyUidList.length]);

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
            // Fullscreen policy fallback
        }
    }, []);

    const reloadViewer = useCallback(() => {
        setIframeLoaded(false);
        setShowSlowHint(false);
        setViewerRevision((revision) => revision + 1);
    }, []);

    useEffect(() => {
        if (!activeStudyUid || metadataState !== 'ready' || !seriesGroups.length) return undefined;
        const controller = new AbortController();
        const store = { uid: activeStudyUid, version: 0, loaded: false, saving: false };
        bookmarkVersionRef.current = store;
        keyImagesRef.current = new Set();
        setKeyImages(new Set());
        setBookmarksStatus('loading');
        authenticatedFetch(`${API_BASE}/pacs/studies/${encodeURIComponent(activeStudyUid)}/bookmarks`, { signal: controller.signal })
            .then(async response => {
                if (!response.ok) throw new Error('Key-image bookmarks could not be loaded');
                const data = await response.json();
                if (controller.signal.aborted || bookmarkVersionRef.current !== store) return;
                const selected = new Set();
                for (const image of data.keyImages || []) {
                    const series = seriesGroups.find(group => group.seriesInstanceUid === image.seriesInstanceUid);
                    const frameIndex = series?.instances.findIndex(instance => getDicomValue(instance, '00080018') === image.sopInstanceUid && (instance.__frameNumber || 1) === image.frameNumber);
                    if (frameIndex >= 0) selected.add(`${image.seriesInstanceUid}_${frameIndex}`);
                }
                store.version = data.version;
                setCurrentStudyExamId(data.examId || null);
                store.loaded = true;
                keyImagesRef.current = selected;
                setKeyImages(selected);
                setBookmarksStatus('saved');
            }).catch(error => { if (error.name !== 'AbortError') setBookmarksStatus('error'); });
        return () => { controller.abort(); store.loaded = false; };
    }, [activeStudyUid, metadataState, seriesGroups]);

    const toggleKeyImage = useCallback(async (seriesUid, frameIdx) => {
        const store = bookmarkVersionRef.current;
        if (!store.loaded || store.uid !== activeStudyUid) { toast.error('Key-image bookmarks are unavailable. Reload the study before editing.'); return; }
        if (store.saving) return;
        const next = new Set(keyImagesRef.current);
        const key = `${seriesUid}_${frameIdx}`;
        if (next.has(key)) next.delete(key); else next.add(key);
        const images = [...next].map(value => {
            const [uid, index] = value.split('_');
            const instance = seriesGroups.find(group => group.seriesInstanceUid === uid)?.instances[Number(index)];
            return { seriesInstanceUid: uid, sopInstanceUid: getDicomValue(instance, '00080018'), frameNumber: instance?.__frameNumber || 1 };
        });
        store.saving = true;
        setBookmarksStatus('saving');
        try {
            const response = await authenticatedFetch(`${API_BASE}/pacs/studies/${encodeURIComponent(activeStudyUid)}/bookmarks`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyImages: images, version: store.version })
            });
            if (!response.ok) throw new Error(response.status === 409 ? 'Bookmarks changed in another tab. Reload this study.' : 'Key-image bookmark could not be saved');
            const data = await response.json();
            if (bookmarkVersionRef.current !== store) return;
            store.version = data.version;
            keyImagesRef.current = next;
            setKeyImages(next);
            setBookmarksStatus('saved');
        } catch (error) { if (bookmarkVersionRef.current === store) { setBookmarksStatus('error'); toast.error(error.message); } }
        finally { store.saving = false; }
    }, [activeStudyUid, seriesGroups]);

    // Cine Loop Animation Timer
    useEffect(() => {
        if (!isCinePlaying || activeInstances.length <= 1) return undefined;
        const intervalMs = Math.max(16, Math.round(1000 / cineFps));
        const timer = setInterval(() => {
            setActiveFrameIndex(idx => (idx + 1) % activeInstances.length);
        }, intervalMs);
        return () => clearInterval(timer);
    }, [isCinePlaying, activeInstances.length, cineFps, cineLoopMode]);

    // Keyboard Shortcuts
    useEffect(() => {
        const onKeyDown = (event) => {
            const activeTag = document.activeElement?.tagName;
            if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
            if (event.ctrlKey || event.metaKey || event.altKey) return;

            const key = event.key.toLowerCase();
            if (key === 'f') {
                event.preventDefault();
                toggleFullscreen();
            } else if (key === 'p') {
                event.preventDefault();
                setActiveTool('pan');
            } else if (key === 'z') {
                event.preventDefault();
                setActiveTool('zoom');
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
                setExternalViewersModalOpen(false);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [activeFrameIndex, activeInstances.length, activeSeries, selectedSeriesUid, toggleFullscreen, toggleKeyImage]);

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
        const examId = currentStudyExamId || (activeStudyUid === studyUidList[0] ? (examIdParam || orderContext?.exam_id) : null);
        if (examId) navigate(`/reports/editor/${encodeURIComponent(examId)}`);
        else toast.error('No examination report is linked to this study.');
    }, [currentStudyExamId, activeStudyUid, studyUidList, examIdParam, orderContext?.exam_id, navigate]);

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
            toast.success('Study exported successfully');
        } catch (error) {
            setExportState({
                status: 'error',
                format,
                error: error?.message || t('pacs.viewer.exportFailed', { defaultValue: 'Export failed. Try again.' })
            });
            toast.error('Export failed');
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

    const patientLabel = cleanDicomText(caseDetails?.patientName || orderContext?.patient_name) || t('pacs.viewer.patient', { defaultValue: 'Patient' });
    const viewerTitle = OHIF_BASE
        ? t('pacs.viewer.title', { defaultValue: 'PACS Image Viewer' })
        : t('pacs.viewer.previewTitle', { defaultValue: 'Image Preview (non-diagnostic)' });
    const studyLabel = cleanDicomText(caseDetails?.studyDescription || orderContext?.exam_type_name || orderContext?.modality_name) || viewerTitle;
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
                title={viewerTitle}
                subtitle={t('pacs.viewer.noStudy', { defaultValue: 'No study selected' })}
                onBack={exitViewer}
                backLabel={t('actions.back', { defaultValue: 'Back' })}
            >
                <StatePanel
                    icon={ImageOff}
                    title={t('pacs.viewer.noStudy', { defaultValue: 'No imaging study selected' })}
                    detail={t('pacs.viewer.noStudyHelp', { defaultValue: 'Open the viewer from a worklist examination that has images available.' })}
                >
                    <button
                        type="button"
                        onClick={() => navigate('/worklist')}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 px-7 text-sm font-bold text-slate-950 shadow-lg shadow-teal-500/25 transition hover:brightness-110"
                    >
                        <ListFilter size={17} />
                        {t('pacs.viewer.goToWorklist', { defaultValue: 'Open Worklist' })}
                    </button>
                </StatePanel>
            </ViewerShell>
        );
    }

    if (!isOnline) {
        return (
            <ViewerShell
                title={viewerTitle}
                subtitle={orderContext?.order_number || studyUids}
                onBack={exitViewer}
                backLabel={t('actions.back', { defaultValue: 'Back' })}
            >
                <StatePanel
                    icon={WifiOff}
                    title={t('pacs.viewer.offline', { defaultValue: 'Archive connection lost' })}
                    detail={t('pacs.viewer.offlineHelp', { defaultValue: 'The study will resume automatically when the network connection returns.' })}
                >
                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-400/10 px-5 py-2.5 text-xs font-bold text-amber-300">
                        <Loader2 size={15} className="animate-spin" />
                        {t('pacs.viewer.waitingForNetwork', { defaultValue: 'Waiting for network...' })}
                    </div>
                </StatePanel>
            </ViewerShell>
        );
    }

    if (retriesExhausted) {
        return (
            <ViewerShell
                title={viewerTitle}
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
                        <button
                            type="button"
                            onClick={() => startSession()}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 px-6 text-sm font-bold text-slate-950 shadow-lg shadow-teal-500/25 transition hover:brightness-110"
                        >
                            <RefreshCw size={16} />
                            {t('pacs.viewer.retry', { defaultValue: 'Try again' })}
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate('/worklist')}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-6 text-sm font-bold text-slate-200 transition hover:bg-white/10"
                        >
                            <ListFilter size={16} />
                            {t('pacs.viewer.goToWorklist', { defaultValue: 'Return to worklist' })}
                        </button>
                    </div>
                </StatePanel>
            </ViewerShell>
        );
    }

    return (
        <main className="fixed inset-0 z-50 flex h-[100dvh] w-screen flex-col overflow-hidden bg-[#050914] text-slate-100 antialiased select-none font-sans">
            {/* Top Medical Workstation Header & Command Palette */}
            <WorkstationHeader
                patientLabel={patientLabel}
                studyLabel={studyLabel}
                accession={caseDetails?.accessionNumber || orderContext?.order_number || '-'}
                modality={caseDetails?.modality || orderContext?.modality_name || '-'}
                patientId={caseDetails?.patientId || orderContext?.mrn || '-'}
                studyDate={caseDetails?.studyDate || '-'}
                nativePreview={!OHIF_BASE}
                loading={showLoading || isAutoRetrying}
                retrying={isAutoRetrying}
                activeTool={activeTool}
                setActiveTool={setActiveTool}
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
                onToggleDrawer={() => setDrawerOpen(open => !open)}
                drawerOpen={drawerOpen}
                onOpenShortcuts={() => setShortcutsModalOpen(true)}
                onToggleFullscreen={toggleFullscreen}
                isFullscreen={isFullscreen}
                onOpenExternal={OHIF_BASE ? openStandaloneViewer : null}
                onOpenExternalViewers={() => setExternalViewersModalOpen(true)}
                onOpenExport={() => setExportPanelOpen(true)}
                exportBusy={exportState.status === 'running'}
                activeKeyImage={activeKeyImage}
                onToggleActiveKeyImage={() => toggleKeyImage(selectedSeriesUid || activeSeries?.seriesInstanceUid, activeFrameIndex)}
                t={t}
                isRtl={isRtl}
            />

            {(studyUidList.length > 1 || !OHIF_BASE) && (
                <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-slate-950 px-4 py-2 text-xs">
                    {studyUidList.length > 1 && <label className="flex items-center gap-2">
                        {t('pacs.viewer.studyDetails', { defaultValue: 'Study details' })}
                        <select value={activeStudyUid || ''} onChange={event => { setSelectedStudyUid(event.target.value); setSelectedExportStudyUid(event.target.value); }} className="max-w-80 rounded border border-white/20 bg-slate-900 p-1">
                            {studyUidList.map((uid, index) => <option key={uid} value={uid}>{t('pacs.viewer.studyNumber', { defaultValue: 'Study {{number}}', number: index + 1 })} ? {uid}</option>)}
                        </select>
                    </label>}
                    {!OHIF_BASE && <span className={bookmarksStatus === 'error' ? 'text-amber-300' : 'text-slate-400'} aria-live="polite">
                        {t(`pacs.viewer.bookmarks.${bookmarksStatus}`, { defaultValue: `Key images: ${bookmarksStatus}` })}
                    </span>}
                </div>
            )}
            {/* Central Diagnostic Workspace Container */}
            <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[#02050e]">
                {/* Left Collapsible Series & Study Navigator Drawer */}
                {!OHIF_BASE && <SeriesSidebar
                    open={sidebarOpen}
                    onClose={() => setSidebarOpen(false)}
                    seriesGroups={seriesGroups}
                    filteredSeriesGroups={filteredSeriesGroups}
                    activeSeries={activeSeries}
                    onSelectSeries={(seriesUid) => {
                        setSelectedSeriesUid(seriesUid);
                        setActiveFrameIndex(0);
                    }}
                    seriesSearch={seriesSearch}
                    onSeriesSearchChange={setSeriesSearch}
                    studyUid={activeStudyUid}
                    rawInstances={rawInstances}
                    caseDetails={caseDetails}
                    keyImages={keyImages}
                    t={t}
                    isRtl={isRtl}
                />}

                {/* Primary Multi-Viewport View Area (isolated in LTR for medical Cornerstone/OHIF accuracy) */}
                <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-black" dir="ltr">
                    {!OHIF_BASE && (
                        <div className="z-10 flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#090f1c] px-4">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg border border-teal-400/20 bg-teal-400/10 px-1.5 font-mono text-[10px] font-black text-teal-300">
                                    {activeSeries?.modality || 'DICOM'}
                                </span>
                                <div className="min-w-0">
                                    <p className="truncate text-xs font-semibold text-white">
                                        {cleanDicomText(activeSeries?.seriesDescription) ||
                                            t('pacs.viewer.seriesNumber', {
                                                defaultValue: 'Series #{{number}}',
                                                number: activeSeries?.seriesNumber || 1
                                            })}
                                    </p>
                                    <p className="text-[10px] text-slate-500">
                                        {t('pacs.viewer.frameCount', {
                                            defaultValue: '{{count}} frames',
                                            count: activeInstances.length
                                        })}
                                    </p>
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <span
                                    className="inline-flex rounded-lg border border-amber-300/20 bg-amber-300/10 px-2 py-1 text-[10px] font-bold text-amber-200"
                                    title={t('pacs.viewer.previewOnlyDisclaimer', {
                                        defaultValue: 'Preview only — not for diagnostic interpretation or measurement.'
                                    })}
                                >
                                    {t('pacs.viewer.previewOnly', { defaultValue: 'Preview only' })}
                                </span>
                            </div>
                        </div>
                    )}
                    {/* Embedded OHIF Viewport Mode (when external OHIF configured) */}
                    {OHIF_BASE && (sessionState === 'ready' || isAutoRetrying) && viewerUrl ? (
                        <iframe
                            ref={iframeRef}
                            key={`${viewerUrl}:${viewerRevision}`}
                            title={viewerTitle}
                            src={viewerUrl}
                            onLoad={() => setShowSlowHint(false)}
                            onError={() => setShowSlowHint(true)}
                            className="absolute inset-0 h-full w-full border-0 bg-black"
                            allow="fullscreen; clipboard-read; clipboard-write"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        /* Non-diagnostic rendered-image preview fallback */
                        <div className={`grid min-h-0 flex-1 gap-1 p-1 ${gridLayoutClass}`}>
                            {gridMode === '1x1' ? (
                                <NativeCanvasViewport
                                    studyUid={activeStudyUid}
                                    activeSeries={activeSeries}
                                    activeFrameIndex={activeFrameIndex}
                                    onFrameChange={setActiveFrameIndex}
                                    activeTool={activeTool}
                                    gridMode={gridMode}
                                    showOverlays={showOverlays}
                                    isActiveViewport={true}
                                    t={t}
                                />
                            ) : (
                                Array.from({ length: gridMode === '2x2' ? 4 : 2 }).map((_, idx) => {
                                    const seriesForViewport = seriesGroups[idx % (seriesGroups.length || 1)] || activeSeries;
                                    return (
                                        <NativeCanvasViewport
                                            key={idx}
                                            studyUid={activeStudyUid}
                                            activeSeries={seriesForViewport}
                                            activeFrameIndex={syncScroll ? activeFrameIndex : 0}
                                            onFrameChange={syncScroll ? setActiveFrameIndex : undefined}
                                            activeTool={activeTool}
                                            gridMode={gridMode}
                                            showOverlays={showOverlays}
                                            isActiveViewport={activeViewportIndex === idx}
                                            onSelectViewport={() => setActiveViewportIndex(idx)}
                                            t={t}
                                        />
                                    );
                                })
                            )}
                        </div>
                    )}

                    {/* Bottom Cine Playback Scrubber Deck */}
                    {!OHIF_BASE && activeInstances.length > 1 && (
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

                    {/* Loading & Synchronization State Overlay */}
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

            {/* Slide-out Integrated Clinical Workstation Drawer */}
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
                keyImages={keyImages}
                activeSeries={activeSeries}
                onOpenReportEditor={openReport}
                t={t}
                isRtl={isRtl}
            />

            {/* Modal Export Case Studio */}
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

            {/* Keyboard Shortcuts Visual Cheat Sheet Modal */}
            <KeyboardShortcutsModal
                open={shortcutsModalOpen}
                onClose={() => setShortcutsModalOpen(false)}
                shortcuts={KEYBOARD_SHORTCUTS}
                t={t}
                isRtl={isRtl}
            />

            {/* External Viewers & Monitors Modal */}
            <ExternalViewersModal
                open={externalViewersModalOpen}
                onClose={() => setExternalViewersModalOpen(false)}
                viewerUrl={viewerUrl}
                studyUid={studyUidList[0] || requestedUidList[0] || ''}
                accession={caseDetails?.accessionNumber || orderContext?.order_number || ''}
                patientId={caseDetails?.patientId || orderContext?.mrn || ''}
                pacsConfig={pacsConfig}
                onExportDicom={() => exportCase('dicom')}
                isRtl={isRtl}
                t={t}
            />
        </main>
    );
};

// Top Primary Workstation Command Bar
const WorkstationHeader = memo(({
    patientLabel,
    studyLabel,
    accession,
    modality,
    patientId,
    studyDate,
    nativePreview,
    loading,
    retrying,
    activeTool,
    setActiveTool,
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
    onToggleDrawer,
    drawerOpen,
    onOpenShortcuts,
    onToggleFullscreen,
    isFullscreen,
    onOpenExternal,
    onOpenExternalViewers,
    onOpenExport,
    exportBusy,
    activeKeyImage,
    onToggleActiveKeyImage,
    t,
    isRtl = false
}) => {
    return (
        <header className="relative z-30 flex min-h-[68px] shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-[#080e1b] px-3 sm:px-4">
            {/* Left Zone: Back, Series Toggle, Clinical Identity */}
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <button
                    type="button"
                    onClick={onExit}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                    title={t('actions.back', { defaultValue: 'Back to Worklist' })}
                >
                    <ArrowLeft size={18} className={isRtl ? 'rotate-180' : ''} />
                </button>

                {nativePreview && <button
                    type="button"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className={TOOL_BTN(sidebarOpen)}
                    title={t('pacs.viewer.toggleSeries', { defaultValue: 'Toggle Series Drawer (S)' })}
                    aria-pressed={sidebarOpen}
                >
                    <Layers size={17} />
                </button>}

                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                        <h1 className="truncate text-sm font-bold tracking-tight text-white sm:text-base">
                            {cleanDicomText(patientLabel)}
                        </h1>
                        <span className="hidden rounded-md border border-teal-400/20 bg-teal-400/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-teal-200 sm:inline-flex">
                            {modality}
                        </span>
                        <span
                            className={`inline-flex h-2 w-2 shrink-0 rounded-full ${loading ? 'animate-pulse bg-amber-400' : 'bg-emerald-400'}`}
                            title={loading
                                ? t('pacs.viewer.connecting', { defaultValue: 'Connecting' })
                                : t('pacs.viewer.connected', { defaultValue: 'Connected' })}
                        />
                    </div>
                    <p className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[11px] text-slate-400">
                        <span className="truncate">{cleanDicomText(studyLabel)}</span>
                        <span className="text-slate-700">·</span>
                        <span className="shrink-0 font-mono text-slate-300">{patientId}</span>
                        <span className="text-slate-700">·</span>
                        <span className="shrink-0 font-mono text-teal-300/90">{accession}</span>
                        {studyDate && studyDate !== '-' && <>
                            <span className="text-slate-700">·</span>
                            <span className="hidden shrink-0 sm:inline">{studyDate}</span>
                        </>}
                    </p>
                </div>
            </div>

            {/* The built-in renderer is preview-only; diagnostic controls belong to OHIF. */}
            {nativePreview &&             <div className="hidden shrink-0 items-center gap-1 rounded-xl border border-white/[0.08] bg-black/30 p-1 lg:flex">
                {/* Navigation Tools */}
                <button
                    type="button"
                    onClick={() => setActiveTool('pan')}
                    className={TOOL_BTN(activeTool === 'pan')}
                    title={t('pacs.viewer.panTool', { defaultValue: 'Pan / Drag (P)' })}
                >
                    <Move size={16} />
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTool('zoom')}
                    className={TOOL_BTN(activeTool === 'zoom')}
                    title={t('pacs.viewer.zoomTool', { defaultValue: 'Zoom Tool (Z)' })}
                >
                    <ZoomIn size={16} />
                </button>

                <span className="mx-0.5 h-4 w-px bg-white/10" />

                {/* Viewport Grid Layouts */}
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

                {gridMode !== '1x1' && <>
                    <span className="mx-0.5 h-4 w-px bg-white/10" />
                    <button
                        type="button"
                        onClick={() => setSyncScroll(value => !value)}
                        className={TOOL_BTN(syncScroll)}
                        title={t('pacs.viewer.syncScroll', { defaultValue: 'Synchronize series scrolling' })}
                        aria-pressed={syncScroll}
                    >
                        <Repeat size={14} />
                    </button>
                </>}

                <span className="mx-0.5 h-4 w-px bg-white/10" />

                {/* Overlays & Cine */}
                <button
                    type="button"
                    onClick={() => setShowOverlays(v => !v)}
                    className={TOOL_BTN(showOverlays)}
                    title={t('pacs.viewer.toggleOverlays', { defaultValue: 'Toggle Overlays (O)' })}
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
            </div>}

            {/* Right Zone: Key Images, Clinical Drawer, Export, Shortcuts, Fullscreen */}
            <div className="flex shrink-0 items-center gap-1">
                {retrying && (
                    <span className="hidden items-center gap-1.5 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-[11px] font-bold text-amber-200 xl:inline-flex">
                        <Loader2 size={13} className="animate-spin" />
                        {t('pacs.viewer.retrying', { defaultValue: 'Retrying...' })}
                    </span>
                )}

                {/* Native preview frame selection is not synchronized with OHIF's viewport. */}
                {nativePreview && <button
                    type="button"
                    onClick={onToggleActiveKeyImage}
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all ${
                        activeKeyImage
                            ? 'border-amber-400 bg-amber-400/25 text-amber-300 shadow-md shadow-amber-400/20'
                            : 'border-white/10 bg-white/[0.04] text-slate-400 hover:border-amber-400/40 hover:text-amber-300'
                    }`}
                    title={t('pacs.viewer.keyImage', { defaultValue: 'Bookmark Key Image (K)' })}
                >
                    <Star size={16} className={activeKeyImage ? 'fill-amber-400' : ''} />
                </button>}

                {/* Integrated Clinical Drawer Launcher */}
                <button
                    type="button"
                    onClick={onToggleDrawer}
                    className={`inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition-all ${
                        drawerOpen
                            ? 'border-teal-400 bg-teal-500/25 text-white shadow-lg shadow-teal-500/25 ring-1 ring-teal-400/50'
                            : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 shadow-sm'
                    }`}
                    title={t('pacs.viewer.report', { defaultValue: 'Clinical Report & DICOM Inspector (Tab)' })}
                >
                    <FileText size={15} />
                    <span className="hidden sm:inline">
                        {t('pacs.viewer.report', { defaultValue: 'Report' })}
                    </span>
                </button>

                {/* Export Study Package */}
                <button
                    type="button"
                    onClick={onOpenExport}
                    disabled={loading || exportBusy}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-xs font-bold text-slate-200 transition hover:border-teal-400/40 hover:bg-white/10 disabled:opacity-40"
                    title={t('pacs.viewer.exportCase', { defaultValue: 'Export Study' })}
                >
                    {exportBusy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                    <span className="hidden md:inline">{t('pacs.viewer.export', { defaultValue: 'Export' })}</span>
                </button>

                {/* External Viewers & Standalone Window Launcher */}
                <button
                    type="button"
                    onClick={onOpenExternalViewers || onOpenExternal}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-2.5 text-xs font-bold text-teal-300 transition hover:border-teal-400/60 hover:bg-teal-500/20 hover:text-white"
                    title={t('pacs.viewer.externalViewersTitle', { defaultValue: 'External DICOM Viewers & Monitors (Weasis, RadiAnt, Stone, Detached)' })}
                >
                    <Monitor size={14} />
                    <span className="hidden xl:inline">{t('pacs.viewer.viewOptions', { defaultValue: 'Viewers' })}</span>
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
                    title={isFullscreen ? t('pacs.viewer.exitFullscreenShortcut', { defaultValue: 'Exit Fullscreen (F)' }) : t('pacs.viewer.fullscreenShortcut', { defaultValue: 'Fullscreen (F)' })}
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
    onSelectSeries,
    seriesSearch,
    onSeriesSearchChange,
    studyUid,
    rawInstances,
    caseDetails,
    keyImages,
    t,
    isRtl = false
}) => {
    if (!open) return null;

    const imageCount = seriesGroups.reduce(
        (total, series) => total + (series.instances?.length || 0),
        0
    ) || caseDetails?.imageCount || rawInstances.length || 0;
    const seriesCount = seriesGroups.length;

    return (
        <aside className="absolute inset-y-0 start-0 z-20 flex h-full w-[min(21rem,88vw)] shrink-0 flex-col overflow-hidden border-e border-white/[0.08] bg-[#080e1b] shadow-2xl md:relative md:w-[21rem]">
            <div className="border-b border-white/[0.08] px-3.5 pb-3 pt-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <Layers size={15} className="shrink-0 text-teal-300" />
                            <h2 className="text-sm font-bold text-white">
                                {t('pacs.viewer.seriesLabel', { defaultValue: 'Study Series' })}
                            </h2>
                        </div>
                        <p className="mt-1 ps-[23px] text-[11px] text-slate-500">
                            {t('pacs.viewer.seriesSummary', {
                                defaultValue: '{{seriesCount}} series · {{imageCount}} images',
                                seriesCount,
                                imageCount
                            })}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
                        title={t('actions.close', { defaultValue: 'Close' })}
                    >
                        <ChevronLeft size={16} className={isRtl ? 'rotate-180' : ''} />
                    </button>
                </div>

                <div className="relative mt-3">
                    <Search size={13} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        value={seriesSearch}
                        onChange={(e) => onSeriesSearchChange(e.target.value)}
                        placeholder={t('pacs.viewer.filterSeries', { defaultValue: 'Search series' })}
                        aria-label={t('pacs.viewer.filterSeries', { defaultValue: 'Search series' })}
                        className="h-9 w-full rounded-lg border border-white/10 bg-[#050914] ps-9 pe-8 text-xs text-slate-200 placeholder-slate-500 outline-none transition focus:border-teal-400/50 focus:ring-2 focus:ring-teal-400/10"
                    />
                    {seriesSearch && (
                        <button
                            type="button"
                            onClick={() => onSeriesSearchChange('')}
                            className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-white"
                            aria-label={t('actions.clear', { defaultValue: 'Clear search' })}
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
                <p className="mt-2 text-[10px] text-slate-500">
                    {t('pacs.viewer.seriesResults', {
                        defaultValue: 'Showing {{visible}} of {{total}}',
                        visible: filteredSeriesGroups.length,
                        total: seriesCount
                    })}
                </p>
            </div>

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
                {filteredSeriesGroups.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center">
                        <ImageOff size={24} className="mx-auto text-slate-600" />
                        <p className="mt-2 text-xs font-bold text-slate-400">
                            {seriesSearch
                                ? t('pacs.viewer.noMatchingSeries', { defaultValue: 'No series match filter' })
                                : t('pacs.viewer.noSeriesDetected', { defaultValue: 'No DICOM series detected' })}
                        </p>
                    </div>
                ) : (
                    filteredSeriesGroups.map((series, idx) => {
                        const isSelected = activeSeries?.seriesInstanceUid === series.seriesInstanceUid;
                        const frameCount = series.instances?.length || 1;
                        const seriesKeyCount = Array.from(keyImages).filter(k => k.startsWith(`${series.seriesInstanceUid}_`)).length;

                        return (
                            <button
                                key={series.seriesInstanceUid || idx}
                                type="button"
                                onClick={() => onSelectSeries(series.seriesInstanceUid)}
                                aria-pressed={isSelected}
                                className={`group relative w-full overflow-hidden rounded-xl border p-2.5 text-start transition ${
                                    isSelected
                                        ? 'border-teal-400/50 bg-teal-400/[0.07] text-white ring-1 ring-teal-400/15'
                                        : 'border-white/[0.07] bg-white/[0.02] text-slate-400 hover:border-white/15 hover:bg-white/[0.045] hover:text-slate-200'
                                }`}
                            >
                                {isSelected && <span className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-teal-300" />}
                                <div className="flex items-center gap-2.5">
                                    <SeriesThumbnail series={series} studyUid={studyUid} t={t} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className={`line-clamp-2 text-xs font-semibold leading-4 ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                                                {cleanDicomText(series.seriesDescription) ||
                                                    t('pacs.viewer.seriesNumber', { defaultValue: 'Series #{{number}}', number: series.seriesNumber || idx + 1 })}
                                            </p>
                                            {seriesKeyCount > 0 && (
                                                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200" title={t('pacs.viewer.keyImages', { defaultValue: 'Key images' })}>
                                                    <Star size={10} className="fill-amber-300" />
                                                    {seriesKeyCount}
                                                </span>
                                            )}
                                        </div>
                                                    <p className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-500">
                                            <ImageIcon size={11} />
                                            <span className="font-mono text-slate-300">{frameCount}</span>
                                            {t('pacs.viewer.frames', { defaultValue: 'frames' })}
                                            {isSelected && <span className="ms-auto font-medium text-teal-200">{t('pacs.viewer.activeSeries', { defaultValue: 'Selected' })}</span>}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>

        </aside>
    );
});
SeriesSidebar.displayName = 'SeriesSidebar';

const SeriesThumbnail = memo(({ series, studyUid, t }) => {
    const containerRef = useRef(null);
    const [imageUrl, setImageUrl] = useState('');
    const [failed, setFailed] = useState(false);
    const instance = series.instances?.[0];
    const sopUid = instance ? getDicomValue(instance, '00080018') : '';
    const frame = instance?.__frameNumber || 1;

    useEffect(() => {
        if (!studyUid || !sopUid || !series.seriesInstanceUid) {
            setFailed(true);
            return undefined;
        }

        const controller = new AbortController();
        let objectUrl;
        const loadThumbnail = () => {
            const url = `${API_BASE}/pacs/dicom-web/studies/${encodeURIComponent(studyUid)}/series/${encodeURIComponent(series.seriesInstanceUid)}/instances/${encodeURIComponent(sopUid)}/frames/${frame}/rendered`;
            authenticatedFetch(url, { signal: controller.signal })
                .then((response) => {
                    if (!response.ok) throw new Error(`Series preview failed (${response.status})`);
                    return response.blob();
                })
                .then((blob) => {
                    if (controller.signal.aborted) return;
                    objectUrl = URL.createObjectURL(blob);
                    setImageUrl(objectUrl);
                })
                .catch((error) => {
                    if (error.name !== 'AbortError') setFailed(true);
                });
        };

        if (typeof IntersectionObserver === 'undefined') {
            loadThumbnail();
        } else {
            const observer = new IntersectionObserver(([entry]) => {
                if (!entry.isIntersecting) return;
                observer.disconnect();
                loadThumbnail();
            }, { rootMargin: '120px' });
            if (containerRef.current) observer.observe(containerRef.current);
            else loadThumbnail();
            return () => {
                observer.disconnect();
                controller.abort();
                if (objectUrl) URL.revokeObjectURL(objectUrl);
            };
        }

        return () => {
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [frame, series.seriesInstanceUid, sopUid, studyUid]);

    return (
        <div
            ref={containerRef}
            className="relative h-[4.25rem] w-[5.25rem] shrink-0 overflow-hidden rounded-lg border border-white/[0.08] bg-black"
            aria-label={t('pacs.viewer.seriesThumbnail', { defaultValue: 'Series preview' })}
        >
            {imageUrl ? (
                <img
                    src={imageUrl}
                    alt=""
                    className="h-full w-full object-contain"
                    draggable={false}
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center">
                    {failed
                        ? <ImageOff size={17} className="text-slate-600" />
                        : <Loader2 size={16} className="animate-spin text-slate-600" />}
                </div>
            )}
            <span className="absolute inset-x-0 bottom-0 truncate bg-black/70 px-1.5 py-0.5 text-center font-mono text-[9px] font-bold text-slate-200">
                {series.modality || 'DICOM'} · #{series.seriesNumber || '—'}
            </span>
        </div>
    );
});
SeriesThumbnail.displayName = 'SeriesThumbnail';

// Native Canvas Engine Component
const NativeCanvasViewport = memo(({
    studyUid,
    activeSeries,
    activeFrameIndex = 0,
    onFrameChange,
    activeTool = 'pan',
    gridMode = '1x1',
    showOverlays = true,
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
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [imageError, setImageError] = useState(false);
    const [imageUrl, setImageUrl] = useState('');

    // Resolve Image URL for Current Frame
    useEffect(() => {
        const instances = activeSeries?.instances || [];
        const instance = instances[activeFrameIndex] || instances[0];
        const seriesUid = activeSeries?.seriesInstanceUid;
        const sopUid = instance ? getDicomValue(instance, '00080018') : null;

        if (studyUid && seriesUid && sopUid) {
            const frame = instance.__frameNumber || 1;
            const url = `${API_BASE}/pacs/dicom-web/studies/${encodeURIComponent(studyUid)}/series/${encodeURIComponent(seriesUid)}/instances/${encodeURIComponent(sopUid)}/frames/${frame}/rendered`;
            const controller = new AbortController();
            let objectUrl;
            authenticatedFetch(url, { signal: controller.signal })
                .then(response => { if (!response.ok) throw new Error('Preview failed'); return response.blob(); })
                .then(blob => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setImageUrl(objectUrl); } })
                .catch(error => { if (error.name !== 'AbortError') setImageError(true); });
            setImageUrl('');
            setImageError(false);
            return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
        } else {
            setImageUrl('');
            setImageError(false);
        }
        return undefined;
    }, [activeFrameIndex, activeSeries, studyUid]);

    const resetTransforms = () => {
        setZoom(1.0);
        setPan({ x: 0, y: 0 });
        setRotation(0);
        setFlipH(false);
        setFlipV(false);
        setInvert(false);
    };

    const handleMouseDown = (e) => {
        if (onSelectViewport) onSelectViewport();

        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e) => {
        if (isDragging) {
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;

            if (activeTool === 'pan') {
                setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
                setDragStart({ x: e.clientX, y: e.clientY });
            } else if (activeTool === 'zoom') {
                const delta = dy * -0.01;
                setZoom(z => Math.max(0.1, Math.min(10.0, z + delta)));
                setDragStart({ x: e.clientX, y: e.clientY });
            }
        }
    };

    const handleMouseUp = () => setIsDragging(false);

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

    return (
        <div
            className={`relative flex h-full w-full flex-1 cursor-grab items-center justify-center overflow-hidden bg-black ${
                isActiveViewport ? 'ring-1 ring-teal-500/50' : ''
            }`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
        >
            {/* Keep only viewport-specific details here; patient and study identity stays in the header. */}
            {showOverlays && (
                <div className="pointer-events-none absolute start-3 bottom-3 z-10 rounded-lg border border-white/10 bg-[#070d1a]/85 px-2.5 py-1.5 font-mono text-[10px] font-semibold text-slate-300 shadow-lg backdrop-blur-md">
                    {t('pacs.viewer.viewTransformStatus', {
                        defaultValue: 'Zoom {{zoom}}% · Rotation {{rotation}}°',
                        zoom: Math.round(zoom * 100),
                        rotation
                    })}
                    {invert && <span className="ms-2 text-amber-200">{t('pacs.viewer.inverted', { defaultValue: 'Inverted' })}</span>}
                </div>
            )}

            {/* Quick Viewport Floating Action Dial */}
            <div className="absolute end-3.5 bottom-16 z-20 hidden items-center gap-1 rounded-2xl border border-white/10 bg-[#070d1a]/90 p-1 shadow-2xl backdrop-blur-md md:flex">
                <button type="button" onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} className={ICON_BTN} title="Zoom Out">
                    <ZoomOut size={14} />
                </button>
                <button type="button" onClick={() => setZoom(z => Math.min(10, z + 0.1))} className={ICON_BTN} title="Zoom In">
                    <ZoomIn size={14} />
                </button>
                <button type="button" onClick={() => setRotation(r => (r + 90) % 360)} className={ICON_BTN} title="Rotate 90°">
                    <RotateCw size={14} />
                </button>
                <button type="button" onClick={() => setFlipH(f => !f)} className={TOOL_BTN(flipH)} title="Flip Horizontal">
                    <FlipHorizontal size={14} />
                </button>
                <button type="button" onClick={() => setFlipV(f => !f)} className={TOOL_BTN(flipV)} title="Flip Vertical">
                    <FlipVertical size={14} />
                </button>
                <button type="button" onClick={() => setInvert(i => !i)} className={TOOL_BTN(invert)} title="Invert Color">
                    <Eye size={14} />
                </button>
                <button type="button" onClick={resetTransforms} className={ICON_BTN} title="Reset Transforms (R)">
                    <RotateCcw size={14} />
                </button>
            </div>

            {/* Canvas Viewport Image Box */}
            <div
                className="relative flex items-center justify-center transition-transform duration-75"
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
                    filter: invert ? 'invert(1)' : 'none'
                }}
            >
                {imageUrl && !imageError ? (
                    <img
                        src={imageUrl}
                        alt={t('pacs.viewer.previewFrameAlt', { defaultValue: 'DICOM image preview frame' })}
                        onError={() => setImageError(true)}
                        className="max-h-[85vh] max-w-[85vw] object-contain shadow-2xl"
                        draggable={false}
                    />
                ) : (
                    /* Preview fallback when no rendered frame is available */
                    <div className="flex min-h-[min(45vh,24rem)] w-[min(90%,32rem)] items-center justify-center rounded-xl border border-white/10 bg-[#091224] p-6">
                        <div className="flex flex-col items-center justify-center text-center">
                            {imageError
                                ? <ImageOff size={36} className="text-slate-500" />
                                : <Loader2 size={32} className="animate-spin text-teal-300" />}
                            <p className="mt-4 text-sm font-semibold text-slate-200">
                                {imageError
                                    ? t('pacs.viewer.previewLoadFailed', { defaultValue: 'Preview image is unavailable' })
                                    : t('pacs.viewer.loadingImages', { defaultValue: 'Loading image preview...' })}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                                {t('pacs.viewer.previewFrame', { defaultValue: 'Frame {{number}}', number: activeFrameIndex + 1 })}
                            </p>
                        </div>
                    </div>
                )}

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
        <div className="absolute bottom-12 start-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/10 bg-[#070d1a]/95 px-4 py-2.5 shadow-2xl backdrop-blur-2xl">
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
                className={`hidden rounded-xl p-1.5 text-xs font-bold transition sm:inline-flex ${
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

// Integrated Slide-Out Clinical Workstation Drawer
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
    keyImages = new Set(),
    activeSeries,
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
        <aside className="fixed inset-y-0 end-0 z-50 flex w-full max-w-xl flex-col border-s border-white/10 bg-[#070d1a]/98 shadow-2xl backdrop-blur-2xl">
            {/* Header & Tab Bar */}
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
                <div className="mt-4 grid grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-black/40 p-1">
                    <button
                        type="button"
                        onClick={() => onTabChange('report')}
                        className={`rounded-xl py-2 text-xs font-bold transition ${
                            activeTab === 'report' ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 font-black shadow' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        {t('pacs.viewer.tabReport', { defaultValue: 'Report' })}
                    </button>
                    <button
                        type="button"
                        onClick={() => onTabChange('key_images')}
                        className={`rounded-xl py-2 text-xs font-bold transition ${
                            activeTab === 'key_images' ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 font-black shadow' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        Key ({keyImages.size})
                    </button>
                    <button
                        type="button"
                        onClick={() => onTabChange('dicom_tags')}
                        className={`rounded-xl py-2 text-xs font-bold transition ${
                            activeTab === 'dicom_tags' ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 font-black shadow' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        {t('pacs.viewer.tabDicomTags', { defaultValue: 'Tags' })}
                    </button>
                    <button
                        type="button"
                        onClick={() => onTabChange('ai_quality')}
                        className={`rounded-xl py-2 text-xs font-bold transition ${
                            activeTab === 'ai_quality' ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 font-black shadow' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        {t('pacs.viewer.tabAiQuality', { defaultValue: 'AI / QA' })}
                    </button>
                </div>
            </div>

            {/* Tab Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {activeTab === 'report' && (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Report Status</span>
                                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300">
                                    {reportData?.status || t('pacs.viewer.reportUnavailable', { defaultValue: 'No report available' })}
                                </span>
                            </div>
                            <h3 className="mt-2 text-sm font-black text-white">
                                {reportData?.exam_type_name || orderContext?.exam_type_name || 'Diagnostic Imaging Study'}
                            </h3>
                            <p className="mt-1 text-xs text-slate-400">
                                Radiologist: {reportData?.radiologist_name || '-'}
                            </p>
                        </div>

                        {/* Report Sections */}
                        {reportData?.findings && (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-teal-300">Findings</h4>
                                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-200">
                                    {reportData.findings}
                                </p>
                            </div>
                        )}

                        {/* Impression Callout */}
                        <div className="rounded-2xl border border-teal-500/40 bg-teal-500/10 p-4">
                            <h4 className="text-xs font-black uppercase tracking-wider text-teal-300">Impression & Conclusion</h4>
                            <p className="mt-2 whitespace-pre-wrap text-xs font-bold leading-relaxed text-white">
                                {reportData?.impression || t('pacs.viewer.noImpression', { defaultValue: 'No clinical impression has been recorded.' })}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={onOpenReportEditor}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-600 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-teal-500/25 transition hover:brightness-110"
                        >
                            <FileText size={16} />
                            {t('pacs.viewer.openReport', { defaultValue: 'Open in Full Report Editor' })}
                        </button>
                    </div>
                )}

                {activeTab === 'key_images' && (
                    <div className="space-y-3">
                        {keyImages.size === 0 ? (
                            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center">
                                <Star size={24} className="mx-auto text-slate-600" />
                                <p className="mt-2 text-xs font-bold text-slate-400">No key images bookmarked yet</p>
                                <p className="mt-1 text-[11px] text-slate-500">Press 'K' or click the star button on any important frame.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {Array.from(keyImages).map(key => {
                                    const [seriesUid, frameIdx] = key.split('_');
                                    return (
                                        <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                                            <div className="flex items-center justify-between">
                                                <span className="font-mono text-xs font-bold text-teal-300">Frame #{Number(frameIdx) + 1}</span>
                                                <Star size={14} className="fill-amber-400 text-amber-400" />
                                            </div>
                                            <p className="mt-1 truncate text-[11px] text-slate-400">{activeSeries?.seriesDescription || 'Series'}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
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
                                className="h-9 w-full rounded-xl border border-white/10 bg-black/50 ps-9 pe-3 text-xs font-medium text-slate-200 placeholder-slate-500 outline-none focus:border-teal-400/60"
                            />
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden">
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
                        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                            <h4 className="flex items-center gap-2 text-xs font-black uppercase text-teal-300">
                                <Sparkles size={16} />
                                Automated Quality & Geometry Inspection
                            </h4>
                            <p className="mt-2 text-xs text-slate-300">
                                {qualityReport?.summary || 'No geometry inconsistencies, missing slices, or acquisition warnings detected across series stacks.'}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
});
ClinicalWorkstationDrawer.displayName = 'ClinicalWorkstationDrawer';

// Keyboard Shortcuts Cheat Sheet Modal
const KeyboardShortcutsModal = memo(({ open, onClose, shortcuts, t, isRtl = false }) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md" onClick={onClose}>
            <div
                className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#070d1a] p-6 shadow-2xl"
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
                        className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="mt-4 grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                    {shortcuts.map(({ key, desc, descAr }) => (
                        <div key={key} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.025] px-3.5 py-2.5">
                            <span className="text-xs font-semibold text-slate-300">{isRtl ? (descAr || desc) : desc}</span>
                            <kbd className="rounded-lg border border-teal-500/40 bg-teal-500/15 px-2 py-0.5 font-mono text-[11px] font-black text-teal-300">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md" onClick={onClose}>
            <div
                className="w-full max-w-md rounded-3xl border border-white/15 bg-[#070d1a] p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div className="flex items-center gap-2.5">
                        <Download size={20} className="text-teal-400" />
                        <h2 className="text-base font-black text-white">
                            {t('pacs.viewer.exportCase', { defaultValue: 'Export Study Package' })}
                        </h2>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
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
                                className="group flex w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.025] p-3.5 text-start transition hover:border-teal-400/40 hover:bg-teal-500/10 disabled:opacity-40"
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

// External Viewers & Workstation Display Options Modal
const ExternalViewersModal = memo(({
    open,
    onClose,
    viewerUrl,
    studyUid,
    accession,
    patientId,
    pacsConfig,
    onExportDicom,
    isRtl = false,
    t
}) => {
    const [copiedKey, setCopiedKey] = useState('');

    if (!open) return null;

    const dicomWebBaseUrl = `${window.location.origin}/api/pacs/dicom-web`;

    const orthancBaseUrl = pacsConfig?.orthanc_api_url ? pacsConfig.orthanc_api_url.replace(/\/+$/, '') : '';
    const stoneViewerUrl = studyUid && orthancBaseUrl ? `${orthancBaseUrl}/stone-webviewer/index.html?study=${encodeURIComponent(studyUid)}` : '';

    const customViewerTemplate = pacsConfig?.pacs_external_viewer_url || '';
    const customViewerUrl = customViewerTemplate && studyUid
        ? customViewerTemplate
            .replace(/\{studyUid\}/g, encodeURIComponent(studyUid))
            .replace(/\{accession\}/g, encodeURIComponent(accession || ''))
            .replace(/\{patientId\}/g, encodeURIComponent(patientId || ''))
            .replace(/\{token\}/g, '')
        : '';

    const handleCopy = (text, key) => {
        if (!text) return;
        navigator.clipboard?.writeText(text);
        setCopiedKey(key);
        toast.success(t('common:copied', { defaultValue: isRtl ? 'تم النسخ إلى الحافظة' : 'Copied to clipboard' }));
        setTimeout(() => setCopiedKey(''), 2000);
    };

    const handleOpenWindow = (url) => {
        if (!url) return;
        const win = window.open(url, '_blank', 'noopener,noreferrer');
        win?.focus?.();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" onClick={onClose}>
            <div
                className="w-full max-w-xl rounded-3xl border border-white/15 bg-[#070d1a] p-6 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div className="flex items-center gap-2.5">
                        <Monitor size={22} className="text-teal-400" />
                        <div>
                            <h2 className="text-base font-black text-white">
                                {isRtl ? 'خيارات عارض الصور والمحطات الخارجية' : 'External Viewers & Display Options'}
                            </h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {isRtl ? 'فتح الفحص في عارض خارجي أو شاشة تشخيصية منفصلة' : 'Launch study in desktop workstations or dedicated medical monitors'}
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
                        <X size={18} />
                    </button>
                </div>

                <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pe-1">
                    {/* 1. OHIF Detached Window (Multi-Monitor Diagnostic Setup) */}
                    {viewerUrl && (
                        <div className="group rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-teal-400/40 hover:bg-white/[0.04]">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-300">
                                        <Monitor size={20} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-bold text-white">
                                                {isRtl ? 'OHIF Diagnostic Viewer (نافذة منفصلة)' : 'OHIF Diagnostic Viewer (Detached Window)'}
                                            </h3>
                                            <span className="rounded-md border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-bold text-teal-300">
                                                {isRtl ? 'شاشات متعددة' : 'Multi-Monitor'}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-400">
                                            {isRtl
                                                ? 'فتح عارض OHIF بكامل طاقته في نافذة منبثقة مستقلة للشاشات الطبية التشخيصية (Barco / Eizo / 4K).'
                                                : 'Opens full OHIF workstation in a dedicated window for multi-monitor PACS reading setups.'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleOpenWindow(viewerUrl)}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-teal-500 px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-teal-400 shadow-md shadow-teal-500/20"
                                >
                                    <ExternalLink size={14} />
                                    <span>{isRtl ? 'فتح النافذة' : 'Launch'}</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 2. Weasis Desktop DICOM Viewer */}
                    <div className="group rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-sky-400/40 hover:bg-white/[0.04]">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-300">
                                    <Laptop size={20} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold text-white">
                                            {isRtl ? 'Weasis Medical Viewer (سطح المكتب)' : 'Weasis Medical Viewer (Desktop)'}
                                        </h3>
                                        <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                                            {t('pacs.viewer.weasisAuthenticated', { defaultValue: isRtl ? 'استعلام موثّق' : 'Authenticated query' })}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-400">
                                        {t('pacs.viewer.weasisSetupHelp', {
                                            defaultValue: isRtl
                                                ? 'أضف مصدر DICOMweb في Weasis من File > Preferences > DICOM node list باستخدام عنوان المصدر أدناه. أنشئ رمز API للقراءة فقط من إدارة الرموز في ملفك الشخصي، وأضفه كترويسة Authorization: Bearer داخل إعداد Weasis. استخدم Query/Retrieve وابحث بمعرّف الدراسة، ثم ألغِ الرمز عندما لا تحتاجه. لا يوضع الرمز في رابط.'
                                                : 'Add a DICOMweb node in Weasis (File > Preferences > DICOM node list) with the URL below. Create a read-only API token in your profile token settings and store it in Weasis as an Authorization: Bearer header. Use Query/Retrieve to search by the study UID, then revoke the token when no longer needed. The token is never placed in a link.'
                                        })}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <code dir="ltr" className="min-w-0 flex-1 break-all rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-slate-300">
                                {dicomWebBaseUrl}
                            </code>
                            <button
                                type="button"
                                onClick={() => handleCopy(dicomWebBaseUrl, 'weasis-url')}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-[11px] font-semibold text-slate-300 transition hover:border-sky-400/40 hover:text-sky-300"
                            >
                                {copiedKey === 'weasis-url' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                <span>{copiedKey === 'weasis-url' ? t('common:copied', { defaultValue: isRtl ? 'تم النسخ' : 'Copied' }) : t('pacs.viewer.copyDicomWebUrl', { defaultValue: isRtl ? 'نسخ عنوان DICOMweb' : 'Copy DICOMweb URL' })}</span>
                            </button>
                            {studyUid && (
                                <button
                                    type="button"
                                    onClick={() => handleCopy(studyUid, 'weasis-study')}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-[11px] font-semibold text-slate-300 transition hover:border-sky-400/40 hover:text-sky-300"
                                >
                                    {copiedKey === 'weasis-study' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                    <span>{copiedKey === 'weasis-study' ? t('common:copied', { defaultValue: isRtl ? 'تم النسخ' : 'Copied' }) : t('pacs.viewer.copyStudyUid', { defaultValue: isRtl ? 'نسخ معرّف الدراسة' : 'Copy study UID' })}</span>
                                </button>
                            )}
                        </div>

                        {/* Weasis ViewerHub setup */}
                        <div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-950/30 p-3 text-xs text-sky-200/90">
                            <div className="flex items-center gap-1.5 font-bold text-sky-300 mb-1.5">
                                <Info size={14} />
                                <span>{isRtl ? 'فتح Weasis مباشرة عبر تسجيل دخول موحّد:' : 'Direct Weasis launch with single sign-on:'}</span>
                            </div>
                            <p className="text-[11px] text-slate-300 leading-relaxed">
                                {isRtl
                                    ? 'اضبط Weasis ViewerHub/Gateway على تمرير DICOMweb إلى VIARA باستخدام OAuth/OIDC. بعد ضبط قالب ViewerHub في إعدادات PACS، استخدم زر التشغيل في بطاقة العارض الخارجي أدناه. لا تنسخ رمز جلسة VIARA إلى Weasis ولا تضعه في رابط.'
                                    : 'Configure Weasis ViewerHub/Gateway to proxy DICOMweb to VIARA using OAuth/OIDC. Once the ViewerHub launch template is set in PACS Settings, use the launch button in the external viewer card below. Do not copy a VIARA session token into Weasis or place it in a URL.'}
                            </p>
                        </div>
                    </div>

                    {/* 3. RadiAnt DICOM Viewer & Local Workstation */}
                    <div className="group rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-emerald-400/40 hover:bg-white/[0.04]">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
                                    <HardDrive size={20} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold text-white">
                                            {isRtl ? 'RadiAnt DICOM Viewer / محطة العمل المحلية' : 'RadiAnt DICOM Viewer / Local Station'}
                                        </h3>
                                        <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                                            DICOM Archive
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-400">
                                        {isRtl
                                            ? 'تنزيل حزمة DICOM الكاملة للفحص كملف Zip لفتحه وسحبه مباشرة في برنامج RadiAnt أو Horos أو OsiriX.'
                                            : 'Download full DICOM package to open or drag-and-drop directly into RadiAnt, Horos, or OsiriX.'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onExportDicom}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/25"
                            >
                                <Download size={14} />
                                <span>{isRtl ? 'تنزيل لـ RadiAnt' : 'Download Zip'}</span>
                            </button>
                        </div>
                    </div>

                    {/* 4. Orthanc Stone Web Viewer */}
                    {stoneViewerUrl && (
                        <div className="group rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-amber-400/40 hover:bg-white/[0.04]">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
                                        <Globe size={20} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-sm font-bold text-white">
                                                {isRtl ? 'Orthanc Stone Web Viewer' : 'Orthanc Stone Web Viewer'}
                                            </h3>
                                            <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                                                Zero-Footprint
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-400">
                                            {isRtl
                                                ? 'عارض ويب خفيف وسريع مدمج مع Orthanc، مناسب للمراجعة السريعة بدون متطلبات WebGL عالية.'
                                                : 'Fast, lightweight zero-footprint web viewer served directly by Orthanc PACS engine.'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleOpenWindow(stoneViewerUrl)}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3.5 py-2 text-xs font-bold text-amber-300 transition hover:bg-amber-500/25"
                                >
                                    <ExternalLink size={14} />
                                    <span>{isRtl ? 'فتح العارض' : 'Open'}</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 5. Custom Web Viewer (from PACS Settings) */}
                    <div className="group rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-indigo-400/40 hover:bg-white/[0.04]">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
                                    <Share2 size={20} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold text-white">
                                            {isRtl ? 'Weasis ViewerHub / عارض خارجي' : 'Weasis ViewerHub / External Viewer'}
                                        </h3>
                                        <span className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                                            {customViewerUrl ? 'Configured' : 'Optional'}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-400">
                                        {customViewerUrl
                                            ? (isRtl ? `الرابط المضبوط: ${customViewerUrl.slice(0, 48)}...` : `Target: ${customViewerUrl.slice(0, 48)}...`)
                                            : (isRtl ? 'اضبط قالب ViewerHub المصادق عليه في إعدادات PACS لفتح Weasis مباشرة عبر تسجيل الدخول الموحّد.' : 'Configure the authenticated ViewerHub launch template in PACS Settings to open Weasis directly through single sign-on.')}
                                    </p>
                                </div>
                            </div>
                            {customViewerUrl ? (
                                <button
                                    type="button"
                                    onClick={() => handleOpenWindow(customViewerUrl)}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-500 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-indigo-400 shadow-md shadow-indigo-500/20"
                                >
                                    <ExternalLink size={14} />
                                    <span>{isRtl ? 'فتح' : 'Launch'}</span>
                                </button>
                            ) : (
                                <a
                                    href="/admin/pacs-settings"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-teal-400/50 hover:text-white"
                                >
                                    <Settings size={13} />
                                    <span>{isRtl ? 'ضبط الرابط' : 'Configure'}</span>
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer Info & Quick Study UID Copy */}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs text-slate-400">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[11px] text-slate-500 truncate max-w-[260px]">
                            UID: {studyUid || '-'}
                        </span>
                        {studyUid && (
                            <button
                                type="button"
                                onClick={() => handleCopy(studyUid, 'uid')}
                                className="rounded-md border border-white/10 bg-white/[0.04] p-1 text-slate-400 hover:text-white"
                                title={isRtl ? 'نسخ معرف الفحص' : 'Copy Study UID'}
                            >
                                {copiedKey === 'uid' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-bold text-slate-300 hover:bg-white/10 hover:text-white"
                    >
                        {t('common:actions.close', { defaultValue: isRtl ? 'إغلاق' : 'Close' })}
                    </button>
                </div>
            </div>
        </div>
    );
});
ExternalViewersModal.displayName = 'ExternalViewersModal';

// Generic Viewer Shell
const ViewerShell = ({ title, subtitle, onBack, backLabel, children }) => (
    <main className="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-[#050914] text-slate-100 antialiased font-sans">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#070d1a] px-4">
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
    <div className="flex max-w-md flex-col items-center justify-center rounded-3xl border border-white/10 bg-[#070d1a] p-8 text-center shadow-2xl">
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
            <div className="flex flex-col items-center rounded-3xl border border-white/10 bg-[#070d1a]/90 p-8 shadow-2xl">
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
