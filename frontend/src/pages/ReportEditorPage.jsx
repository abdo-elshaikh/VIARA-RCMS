import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowLeft,
    CalendarDays,
    CheckCircle2,
    ClipboardCheck,
    Download,
    Eye,
    EyeOff,
    FileCheck2,
    FileText,
    Hash,
    Layers3,
    Loader2,
    LockKeyhole,
    Monitor,
    PenLine,
    Phone,
    Printer,
    RefreshCw,
    Save,
    Send,
    ShieldAlert,
    ShieldCheck,
    Sparkles,
    Stethoscope,
    UploadCloud,
    User,
    X,
    Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useAmendReportMutation,
    useCancelPacsAiJobMutation,
    useCreateReportTemplateMutation,
    useDeliverResultMutation,
    useGeneratePreliminaryReportDraftMutation,
    useGetAiReportDraftsQuery,
    useGetAiSettingsStatusQuery,
    useGetCenterSettingsQuery,
    useGetExamImagingStatusQuery,
    useGetExamQuery,
    useGetPacsAiAnalysisJobsQuery,
    useGetReportTemplatesQuery,
    useGetResultDeliveryHistoryQuery,
    useImproveReportFormatMutation,
    useMarkAiReportDraftAppliedMutation,
    useRequestPacsAiAnalysisMutation,
    useRetryPacsAiJobMutation,
    useUpdateReportMutation
} from '../store/api';
import { selectCurrentUser } from '../store/authSlice';
import { authenticatedFetch } from '../utils/authenticatedFetch';
import {
    buildReportFooter,
    buildReportHeader,
    normalizeCenterSettings
} from '../utils/centerSettings';
import { getErrorMessage } from '../utils/getErrorMessage';
import { hasDeveloperOrAdminRole } from '../utils/roles';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import TextPromptDialog from '../components/ui/TextPromptDialog';
import PageHeader from '../components/ui/PageHeader';
import { inputClass } from '../utils/designTokens';

import {
    FLOATING_FOOTER,
    PANEL,
    PRIMARY_BUTTON,
    SECTION_CONFIG,
    SOFT_BUTTON
} from '../components/reportEditor';
import {
    buildReportText,
    countWords,
    formatDateTime,
    getBuiltInTemplatesForExam,
    getNextReportStatus,
    getReportStatusForSave,
    isUuid,
    normalizeModality,
    normalizeSections,
    sectionsAreEqual,
    templateToSections,
    uploadExamImagesWithProgress
} from '../components/reportEditor';
import { useClickOutside, useUnsavedChangesGuard } from '../components/reportEditor';
import {
    DeliveryPanel,
    ImageUploadOverlay,
    MobileWorkspaceTabs,
    Notice,
    PageState,
    PatientDocumentsPanel,
    ProgressBar,
    QualityPanel,
    ReportExportDialog,
    ReportPreviewPanel,
    ReportSectionCard,
    SectionQuickNav,
    StatusPill,
    StudyToolsPanel,
    TemplateBar,
    WorkflowStepper
} from '../components/reportEditor';

const priorityTone = {
    Emergency: 'bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300 dark:border-rose-900',
    Urgent: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300 dark:border-amber-900',
    Routine: 'bg-teal-500/10 text-teal-700 border-teal-500/30 dark:text-teal-300 dark:border-teal-900'
};

const userHasPermission = (user, permission) => (
    Array.isArray(user?.permissions) && user.permissions.includes(permission)
);

const ReportEditorPage = () => {
    const { examId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation('worklist');
    const user = useSelector(selectCurrentUser);
    const isArabic = i18n.resolvedLanguage?.startsWith('ar') || i18n.language?.startsWith('ar');
    const locale = isArabic ? 'ar-EG' : 'en-US';
    const initialExam = location.state?.exam || null;

    const [exam, setExam] = useState(initialExam);
    const [sections, setSections] = useState(() => normalizeSections(initialExam));
    const [baseline, setBaseline] = useState(() => normalizeSections(initialExam));
    const [selectedTemplateId, setSelectedTemplateId] = useState(initialExam?.template_id || '');
    const [activeSection, setActiveSection] = useState('clinicalHistory');
    const [mobileView, setMobileView] = useState('editor');
    const [inspectorTab, setInspectorTab] = useState('preview');
    const [studyToolsDrawerOpen, setStudyToolsDrawerOpen] = useState(false);
    const [drawerTool, setDrawerTool] = useState(null);
    const [focusMode, setFocusMode] = useState(false);
    const [amendmentMode, setAmendmentMode] = useState(false);
    const [amendmentReason, setAmendmentReason] = useState('');
    const [showFinalize, setShowFinalize] = useState(false);
    const [criticalResult, setCriticalResult] = useState(false);
    const [pendingReportStatus, setPendingReportStatus] = useState(null);
    const [showTemplatePrompt, setShowTemplatePrompt] = useState(false);
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const [showExportDialog, setShowExportDialog] = useState(false);
    const [isExportingWord, setIsExportingWord] = useState(false);
    const [isOpeningPdf, setIsOpeningPdf] = useState(false);
    const [reportDocument, setReportDocument] = useState({
        includeHeader: true,
        includeFooter: true,
        includeSignature: true,
        reportHeader: '',
        reportFooter: ''
    });
    const [aiDraft, setAiDraft] = useState(null);
    const [imageUploadProgress, setImageUploadProgress] = useState(null);
    const [collapsedSections, setCollapsedSections] = useState(() => {
        const seeded = normalizeSections(initialExam);
        return SECTION_CONFIG.reduce((acc, { key, collapsible }) => {
            if (collapsible) acc[key] = !seeded[key]?.trim();
            return acc;
        }, {});
    });

    const initializedExamId = useRef(initialExam?.exam_id || null);
    const dirtyRef = useRef(false);
    const imageUploadRef = useRef(null);
    const appliedDocumentDefaults = useRef(false);

    const {
        data: fetchedExam,
        isLoading: examLoading,
        isError: examError,
        isFetching: examRefreshing,
        refetch
    } = useGetExamQuery(examId, { skip: !examId });
    const { data: imaging, refetch: refetchImaging } = useGetExamImagingStatusQuery(examId, { skip: !examId });
    const { data: centerSettings } = useGetCenterSettingsQuery();
    const { data: aiSettingsStatus } = useGetAiSettingsStatusQuery(undefined, { skip: !user });
    const normalizedCenterSettings = useMemo(() => normalizeCenterSettings(centerSettings), [centerSettings]);

    const effectiveExamTypeId = exam?.exam_type_id || fetchedExam?.exam_type_id;
    const effectiveModalityType = exam?.modality_type || fetchedExam?.modality_type || exam?.modality_name || fetchedExam?.modality_name;
    const { data: reportTemplates = [], isLoading: templatesLoading } = useGetReportTemplatesQuery(
        { examTypeId: effectiveExamTypeId, modalityType: effectiveModalityType },
        { skip: !effectiveExamTypeId && !effectiveModalityType }
    );
    const { data: deliveryHistory = [] } = useGetResultDeliveryHistoryQuery(examId, {
        skip: !examId || !exam?.report_locked
    });
    const [updateReport, { isLoading: isSaving }] = useUpdateReportMutation();
    const [createTemplate, { isLoading: isCreatingTemplate }] = useCreateReportTemplateMutation();
    const [amendReport, { isLoading: isAmending }] = useAmendReportMutation();
    const [deliverResult, { isLoading: isDelivering }] = useDeliverResultMutation();
    const [generatePreliminaryDraft, { isLoading: isGeneratingAiDraft }] = useGeneratePreliminaryReportDraftMutation();
    const [markAiDraftApplied] = useMarkAiReportDraftAppliedMutation();
    const [requestPacsAiAnalysis, { isLoading: isRequestingAiAnalysis }] = useRequestPacsAiAnalysisMutation();
    const [retryPacsAiJob, { isLoading: isRetryingJob }] = useRetryPacsAiJobMutation();
    const [cancelPacsAiJob, { isLoading: isCancelingJob }] = useCancelPacsAiJobMutation();
    const [improveReportFormat] = useImproveReportFormatMutation();
    const [improvingKey, setImprovingKey] = useState(null);
    const [improvementUndo, setImprovementUndo] = useState(null);

    const dirty = useMemo(() => !sectionsAreEqual(sections, baseline), [baseline, sections]);
    const currentReportStatus = exam?.report_status || 'Draft';
    const saveStatus = getReportStatusForSave(currentReportStatus);
    const nextReportStatus = getNextReportStatus(currentReportStatus);
    const previewText = useMemo(() => buildReportText(sections, t), [sections, t]);
    const locked = Boolean(exam?.report_locked);
    const canAuthor = user?.role === 'Radiologist';
    const canFinalize = canAuthor && userHasPermission(user, 'FINALIZE_REPORTS');
    const isAdmin = hasDeveloperOrAdminRole(user?.role);
    const canUseImageAi = hasDeveloperOrAdminRole(user?.role) || user?.role === 'Radiologist';
    const canUseReportAi = canUseImageAi || userHasPermission(user, 'WRITE_REPORTS') || userHasPermission(user, 'IMPROVE_REPORT_FORMAT');
    const editable = canAuthor && (!locked || amendmentMode);
    const reportAiConfigured = aiSettingsStatus?.report?.configured;
    const { data: aiDraftHistoryData } = useGetAiReportDraftsQuery(examId, { skip: !examId || !canUseReportAi });
    const aiDraftHistory = aiDraftHistoryData?.drafts || [];
    const { data: aiAnalysisData } = useGetPacsAiAnalysisJobsQuery(examId, {
        skip: !examId || !canUseImageAi,
        pollingInterval: 5000,
        skipPollingIfUnfocused: true,
        refetchOnFocus: true,
        refetchOnReconnect: true
    });
    const aiAnalysisJobs = aiAnalysisData?.jobs || [];
    const structuredPacsDraftAvailable = aiAnalysisJobs.some((job) => (
        job.status === 'Completed' && job.result_payload?.worker?.quality?.supported === true
    ));
    const aiDraftGenerationAvailable = canUseReportAi && (reportAiConfigured || structuredPacsDraftAvailable);
    const sectionImproveAvailable = canUseReportAi && reportAiConfigured;
    const isUploadingImages = Boolean(imageUploadProgress && imageUploadProgress.phase !== 'done');
    const studyInstanceUid = imaging?.study_instance_uid || exam?.study_instance_uid || '';
    const canOpenPacsViewer = Boolean(imaging?.images_available && (studyInstanceUid || examId));
    const imagesReady = canOpenPacsViewer;
    const hasReportContent = Object.values(sections).some((value) => value.trim());
    const effectiveReportTemplates = useMemo(() => {
        const databaseTemplates = reportTemplates.map((template) => ({ ...template, is_builtin: false }));
        const seen = new Set(databaseTemplates.map((t) => `${t.name}|${normalizeModality(t.modality_type)}`));
        const builtIns = getBuiltInTemplatesForExam(exam || fetchedExam).filter((t) => !seen.has(`${t.name}|${normalizeModality(t.modality_type)}`));
        return [...databaseTemplates, ...builtIns];
    }, [exam, fetchedExam, reportTemplates]);

    const finalizationErrors = useMemo(() => [
        !sections.findings.trim() ? t('editor.findingsRequired') : '',
        !sections.impression.trim() ? t('editor.impressionRequired') : ''
    ].filter(Boolean), [sections.findings, sections.impression, t]);

    const firstIncompleteRequiredSection = !sections.findings.trim()
        ? 'findings'
        : (!sections.impression.trim() ? 'impression' : null);

    const completion = useMemo(() => Math.round(
        (SECTION_CONFIG.filter(({ key }) => sections[key].trim()).length / SECTION_CONFIG.length) * 100
    ), [sections]);
    const reportWords = useMemo(() => countWords(previewText), [previewText]);

    const qualityChecks = useMemo(() => [
        { key: 'required', complete: finalizationErrors.length === 0, label: t('editor.quality.required'), detail: t('editor.quality.requiredHelp') },
        { key: 'context', complete: Boolean(sections.clinicalHistory.trim() || exam?.clinical_indication), label: t('editor.quality.context'), detail: t('editor.quality.contextHelp') },
        { key: 'technique', complete: Boolean(sections.technique.trim()), label: t('editor.quality.technique'), detail: t('editor.quality.techniqueHelp') },
        { key: 'images', complete: imagesReady, label: t('editor.quality.images'), detail: imagesReady ? t('editor.quality.imagesReady') : t('editor.quality.imagesMissing') },
        { key: 'saved', complete: !dirty, label: t('editor.quality.saved'), detail: dirty ? t('editor.quality.savedDirty') : t('editor.quality.savedClean') }
    ], [finalizationErrors.length, sections.clinicalHistory, sections.technique, exam?.clinical_indication, imagesReady, dirty, t]);

    const qualityScore = useMemo(() => {
        const completedCount = qualityChecks.filter((c) => c.complete).length;
        return Math.round((completedCount / qualityChecks.length) * 100);
    }, [qualityChecks]);

    dirtyRef.current = dirty;
    // Object signature required by the hook: destructures { dirty, canSave, onSave }.
    // Passing positional args silently disabled the beforeunload data-loss guard.
    useUnsavedChangesGuard({ dirty });

    useEffect(() => {
        if (!fetchedExam) return;
        if (!exam || fetchedExam.exam_id !== initializedExamId.current) {
            setExam(fetchedExam);
            const normalized = normalizeSections(fetchedExam);
            setSections(normalized);
            setBaseline(normalized);
            setSelectedTemplateId(fetchedExam.template_id || '');
            initializedExamId.current = fetchedExam.exam_id;
        }
    }, [fetchedExam, exam]);

    useEffect(() => {
        if (appliedDocumentDefaults.current || !normalizedCenterSettings) return;
        setReportDocument((current) => ({
            ...current,
            reportHeader: buildReportHeader(normalizedCenterSettings, current.reportHeader),
            reportFooter: buildReportFooter(normalizedCenterSettings, current.reportFooter)
        }));
        appliedDocumentDefaults.current = true;
    }, [normalizedCenterSettings]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            const isCtrlOrMeta = e.ctrlKey || e.metaKey;

            // Ctrl/Cmd + S: Quick Save Report Draft
            if (isCtrlOrMeta && e.key.toLowerCase() === 's') {
                e.preventDefault();
                if (editable) {
                    saveTypedReport();
                }
                return;
            }

            // Ctrl/Cmd + Enter: Open Finalize & Sign Modal
            if (isCtrlOrMeta && e.key === 'Enter') {
                e.preventDefault();
                if (canFinalize && !locked) {
                    setShowFinalize(true);
                }
                return;
            }

            // Ctrl/Cmd + Space: Open Templates & Macros Selector
            if (isCtrlOrMeta && (e.code === 'Space' || e.key === ' ')) {
                e.preventDefault();
                if (editable) {
                    setShowTemplatePrompt(true);
                }
                return;
            }

            // Escape: Dismiss active drawers / modals
            if (e.key === 'Escape') {
                if (studyToolsDrawerOpen) setStudyToolsDrawerOpen(false);
                if (showFinalize) setShowFinalize(false);
                if (showTemplatePrompt) setShowTemplatePrompt(false);
                if (showExitConfirm) setShowExitConfirm(false);
                if (showExportDialog) setShowExportDialog(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    // saveTypedReport is intentionally resolved at keypress time; including the render-scoped
    // handler would re-register the global shortcut after every editor keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studyToolsDrawerOpen, editable, canFinalize, locked, showFinalize, showTemplatePrompt, showExitConfirm, showExportDialog, sections, selectedTemplateId, saveStatus]);

    const updateSection = useCallback((key, value, options = {}) => {
        if (!options.preserveImprovementUndo) setImprovementUndo(null);
        setSections((current) => ({ ...current, [key]: value }));
    }, []);

    const updateReportDocument = useCallback((patch) => {
        setReportDocument((current) => ({
            ...current,
            ...(typeof patch === 'function' ? patch(current) : patch)
        }));
    }, []);

    const undoImprovement = useCallback((snapshot, toastId) => {
        if (!snapshot?.key) return;
        setSections((current) => ({
            ...current,
            [snapshot.key]: snapshot.previous
        }));
        setImprovementUndo((current) => (current?.id === snapshot.id ? null : current));
        if (toastId) toast.dismiss(toastId);
        toast.success(t('messages.improvementUndone', { defaultValue: 'Text improvement undone' }));
    }, [t]);

    const improveSectionText = useCallback(async (key) => {
        if (!canUseReportAi) {
            toast.error(t('editor.aiDraft.accessDenied', { defaultValue: 'You do not have permission to use the AI report assistant.' }));
            return;
        }
        const previousText = sections[key] || '';
        const originalText = previousText.trim();
        if (!originalText || originalText.length < 10) {
            toast.error(t('messages.improveMinLength', { defaultValue: 'Text must be at least 10 characters to improve' }));
            return;
        }
        setImprovingKey(key);
        try {
            const result = await improveReportFormat({
                reportText: originalText,
                examId,
                modality: exam?.modality_type || undefined,
                examType: exam?.exam_type_name || undefined,
                sectionType: key,
                language: 'en'
            }).unwrap();
            if (result?.improved) {
                const snapshot = { id: `${key}-${Date.now()}`, key, previous: previousText, improved: result.improved };
                setImprovementUndo(snapshot);
                updateSection(key, result.improved, { preserveImprovementUndo: true });
                toast.success(t('messages.sectionImproved', { defaultValue: 'Section text improved by AI' }));
            }
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.improveError', { defaultValue: 'Failed to improve text' })));
        } finally {
            setImprovingKey(null);
        }
    }, [canUseReportAi, sections, improveReportFormat, examId, exam, t, updateSection]);

    const toggleSectionCollapse = useCallback((key) => {
        setCollapsedSections((current) => ({ ...current, [key]: !current[key] }));
    }, []);

    const generateAiPreliminaryDraft = useCallback(async () => {
        if (!canUseReportAi) {
            toast.error(t('editor.aiDraft.accessDenied', { defaultValue: 'You do not have permission to use the AI report assistant.' }));
            return;
        }
        try {
            const template = effectiveReportTemplates.find((item) => String(item.template_id) === String(selectedTemplateId));
            const templatePayload = template ? {
                name: template.name,
                clinical_history: template.clinical_history || '',
                technique: template.technique || '',
                findings: template.findings || '',
                impression: template.impression || '',
                recommendations: template.recommendations || ''
            } : undefined;

            const result = await generatePreliminaryDraft({
                examId,
                language: 'en',
                templateId: isUuid(selectedTemplateId) ? selectedTemplateId : undefined,
                template: templatePayload
            }).unwrap();
            setAiDraft(result);
            toast.success(t('editor.aiDraft.generated', { defaultValue: 'AI preliminary draft generated' }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('editor.aiDraft.error', { defaultValue: 'Could not generate AI preliminary draft' })));
        }
    }, [canUseReportAi, effectiveReportTemplates, examId, generatePreliminaryDraft, selectedTemplateId, t]);

    const requestAiImageAnalysis = useCallback(async () => {
        try {
            const result = await requestPacsAiAnalysis({ examId, analysisType: 'preliminary_image_review' }).unwrap();
            toast.success(result?.existing
                ? t('editor.aiImage.alreadyQueued', { defaultValue: 'AI analysis is already queued' })
                : t('editor.aiImage.requested', { defaultValue: 'AI image analysis queued' }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('editor.aiImage.error', { defaultValue: 'Could not queue AI image analysis' })));
        }
    }, [examId, requestPacsAiAnalysis, t]);

    const handleRetryPacsAiJob = useCallback(async (jobId) => {
        try {
            await retryPacsAiJob(jobId).unwrap();
            toast.success(t('editor.aiImage.retrySuccess', { defaultValue: 'Job re-queued successfully' }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('editor.aiImage.retryError', { defaultValue: 'Failed to retry job' })));
        }
    }, [retryPacsAiJob, t]);

    const handleCancelPacsAiJob = useCallback(async (jobId) => {
        try {
            if (confirm(t('editor.aiImage.cancelConfirm', { defaultValue: 'Are you sure you want to stop this analysis job?' }))) {
                await cancelPacsAiJob(jobId).unwrap();
                toast.success(t('editor.aiImage.cancelSuccess', { defaultValue: 'Job stopped' }));
            }
        } catch (error) {
            toast.error(getErrorMessage(error, t('editor.aiImage.cancelError', { defaultValue: 'Failed to stop job' })));
        }
    }, [cancelPacsAiJob, t]);

    const loadAiDraftSnapshot = useCallback((item) => {
        if (!item?.sections) return;
        setAiDraft({
            success: true,
            draftId: item.draft_id,
            createdAt: item.created_at,
            templateName: item.template_name,
            provider: item.provider,
            model: item.model,
            sections: item.sections || {},
            limitations: Array.isArray(item.limitations) ? item.limitations : [],
            disclaimer: item.disclaimer,
            provenance: item.prompt_context?.draftProvenance || {
                provider: item.provider,
                model: item.model,
                sourceMode: item.prompt_context?.imageAnalysis ? 'pacs-image-analysis' : 'exam-metadata',
                coverage: item.prompt_context?.imageAnalysis?.provenance?.coverage || null
            },
            sourceContext: {
                imaging: item.prompt_context?.imaging || null,
                imageAnalysis: item.prompt_context?.imageAnalysis || null
            }
        });
    }, []);

    const applyAiPreliminaryDraft = useCallback((mode = 'fill_empty', sectionKeys = []) => {
        if (!aiDraft?.sections) return;
        const overwrite = mode === 'replace';
        const selectedKeys = new Set(sectionKeys.length ? sectionKeys : SECTION_CONFIG.map(({ key }) => key));
        const applicableKeys = SECTION_CONFIG
            .map(({ key }) => key)
            .filter((key) => (
                selectedKeys.has(key) &&
                String(aiDraft.sections[key] || '').trim() &&
                (overwrite || !String(sections[key] || '').trim())
            ));
        if (!applicableKeys.length) {
            toast(t('editor.aiDraft.nothingToApply', { defaultValue: 'The selected report sections already contain text.' }));
            return;
        }
        const applicableKeySet = new Set(applicableKeys);
        setImprovementUndo(null);
        setSections((current) => {
            const next = { ...current };
            SECTION_CONFIG.forEach(({ key }) => {
                if (!applicableKeySet.has(key)) return;
                next[key] = String(aiDraft.sections[key] || '').trim();
            });
            return next;
        });
        if (aiDraft.draftId) {
            markAiDraftApplied({ examId, draftId: aiDraft.draftId, mode }).catch(() => undefined);
        }
        toast.success(t('editor.aiDraft.inserted', {
            count: applicableKeys.length,
            defaultValue: `AI draft inserted into ${applicableKeys.length} sections`
        }));
    }, [aiDraft, examId, markAiDraftApplied, sections, t]);

    const selectSection = useCallback((key) => {
        setActiveSection(key);
        setMobileView('editor');
        setCollapsedSections((current) => (current[key] ? { ...current, [key]: false } : current));
        window.requestAnimationFrame(() => {
            document.getElementById(`report-section-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }, []);

    const applyTemplate = useCallback((templateId) => {
        setSelectedTemplateId(templateId);
        const template = effectiveReportTemplates.find((item) => String(item.template_id) === String(templateId));
        if (!template) return;
        const next = templateToSections(template, sections);
        setImprovementUndo(null);
        setSections(next);
        setCollapsedSections((current) => {
            const updated = { ...current };
            SECTION_CONFIG.forEach(({ key, collapsible }) => {
                if (collapsible && next[key]?.trim()) updated[key] = false;
            });
            return updated;
        });
        toast.success(t('messages.templateApplied'));
    }, [effectiveReportTemplates, sections, t]);

    const saveTypedReport = async () => {
        if (!editable) return false;
        try {
            const payload = {
                sections,
                templateId: isUuid(selectedTemplateId) ? selectedTemplateId : undefined,
                reportStatus: saveStatus
            };
            const updated = await updateReport({ examId, ...payload }).unwrap();
            setExam(updated);
            setBaseline({ ...sections });
            toast.success(t('messages.saved'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.saveError')));
            return false;
        }
    };

    const advanceReportStatus = async () => {
        if (!nextReportStatus) return false;
        try {
            const payload = {
                sections,
                templateId: isUuid(selectedTemplateId) ? selectedTemplateId : undefined,
                reportStatus: nextReportStatus
            };
            const updated = await updateReport({ examId, ...payload }).unwrap();
            setExam(updated);
            setBaseline({ ...sections });
            toast.success(t(`statuses.${nextReportStatus}`, { defaultValue: nextReportStatus }));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.saveError')));
            return false;
        }
    };

    const finalizeReport = async () => {
        if (finalizationErrors.length > 0) {
            toast.error(finalizationErrors[0]);
            return false;
        }
        try {
            const payload = {
                sections,
                templateId: isUuid(selectedTemplateId) ? selectedTemplateId : undefined,
                reportStatus: 'Finalized',
                status: 'Finalized',
                criticalResult
            };
            const updated = await updateReport({ examId, ...payload }).unwrap();
            setExam(updated);
            setBaseline({ ...sections });
            setShowFinalize(false);
            setCriticalResult(false);
            toast.success(t('messages.finalized'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.finalizeError')));
            return false;
        }
    };

    const submitAmendment = async () => {
        if (!amendmentReason.trim()) {
            toast.error(t('messages.amendmentReasonRequired'));
            return false;
        }
        try {
            const updated = await amendReport({
                examId,
                sections,
                reason: amendmentReason
            }).unwrap();
            setExam(updated);
            setBaseline({ ...sections });
            setAmendmentMode(false);
            setAmendmentReason('');
            toast.success(t('messages.amended'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.amendError')));
            return false;
        }
    };

    const deliver = async (payload) => {
        try {
            await deliverResult({ examId, ...payload }).unwrap();
            toast.success(t('messages.deliverySaved'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.deliveryError')));
            return false;
        }
    };

    const openPrintableReport = async () => {
        if (isOpeningPdf) return false;
        setIsOpeningPdf(true);
        try {
            const baseUrl = import.meta.env.VITE_API_URL || '/api';
            const query = new URLSearchParams({
                reportHeader: reportDocument.reportHeader,
                reportFooter: reportDocument.reportFooter,
                includeHeader: String(reportDocument.includeHeader !== false),
                includeFooter: String(reportDocument.includeFooter !== false),
                includeSignature: String(reportDocument.includeSignature !== false)
            });
            const response = await authenticatedFetch(`${baseUrl}/exams/${examId}/report/pdf?${query.toString()}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
            const popup = window.open(url, '_blank', 'noopener,noreferrer');
            if (!popup) {
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.target = '_blank';
                anchor.click();
            }
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.openError')));
            return false;
        } finally {
            setIsOpeningPdf(false);
        }
    };

    const exportWord = async () => {
        if (isExportingWord) return false;
        setIsExportingWord(true);
        try {
            const { exportReportToWord } = await import('../utils/exportReportToWord');
            await exportReportToWord({
                exam,
                sections,
                t,
                locale,
                centerSettings: {
                    ...normalizedCenterSettings,
                    report_header: reportDocument.reportHeader,
                    report_footer: reportDocument.reportFooter
                },
                documentSettings: reportDocument
            });
            toast.success(t('messages.wordExported'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.wordExportError')));
            return false;
        } finally {
            setIsExportingWord(false);
        }
    };

    const downloadPdfReport = async () => {
        if (isOpeningPdf) return false;
        setIsOpeningPdf(true);
        try {
            const baseUrl = import.meta.env.VITE_API_URL || '/api';
            const query = new URLSearchParams({
                format: 'pdf',
                disposition: 'attachment',
                reportHeader: reportDocument.reportHeader,
                reportFooter: reportDocument.reportFooter,
                includeHeader: String(reportDocument.includeHeader !== false),
                includeFooter: String(reportDocument.includeFooter !== false),
                includeSignature: String(reportDocument.includeSignature !== false)
            });
            const response = await authenticatedFetch(`${baseUrl}/exams/${examId}/report/pdf?${query.toString()}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            const patientStem = String(exam?.patient_name || 'Patient').replace(/[^a-zA-Z0-9_\u0600-\u06FF]+/g, '_');
            const examStem = String(exam?.exam_type_name || 'Report').replace(/[^a-zA-Z0-9_\u0600-\u06FF]+/g, '_');
            const orderStem = String(exam?.order_number || exam?.mrn || examId).replace(/[^a-zA-Z0-9_\u0600-\u06FF]+/g, '_');
            anchor.download = `${patientStem}_${examStem}_${orderStem}.pdf`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 60000);
            toast.success(t('messages.pdfDownloaded', { defaultValue: 'PDF downloaded successfully' }));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.openError')));
            return false;
        } finally {
            setIsOpeningPdf(false);
        }
    };

    const openPacsViewer = () => {
        if (!studyInstanceUid && !examId) return;
        const params = new URLSearchParams();
        if (studyInstanceUid) params.set('StudyInstanceUIDs', studyInstanceUid);
        if (examId) params.set('examId', examId);
        if (exam?.order_number) {
            params.set('order', exam.order_number);
            params.set('accession', exam.order_number);
        }
        window.open(`/pacs/viewer?${params.toString()}`, '_blank', 'noopener,noreferrer');
    };

    if (examLoading && !exam) {
        return <PageState icon={Loader2} spin title={t('editor.loading')} />;
    }

    if ((examError || !exam) && !examLoading) {
        return (
            <PageState
                icon={AlertCircle}
                title={t('editor.notFound')}
                action={() => navigate('/worklist')}
                actionLabel={t('editor.backToWorklist')}
            />
        );
    }

    const priorityKey = exam?.priority || 'Routine';
    const studyTitle = exam?.exam_type_name || exam?.modality_name || 'Imaging Examination';

    const studyToolsProps = {
        exam,
        imaging,
        imagesReady,
        isUploadingImages,
        imageUploadProgress,
        onViewImages: openPacsViewer,
        onUploadImages: () => imageUploadRef.current?.click(),
        aiAnalysisJobs,
        canUseImageAi,
        isRequestingAiAnalysis,
        onRequestAiAnalysis: requestAiImageAnalysis,
        onRetryAiJob: handleRetryPacsAiJob,
        isRetryingAiJob: isRetryingJob,
        onCancelAiJob: handleCancelPacsAiJob,
        isCancelingAiJob: isCancelingJob,
        pacsSettingsStatus: aiSettingsStatus?.pacs,
        reportSettingsStatus: aiSettingsStatus?.report,
        aiDraft,
        aiDraftHistory,
        currentReportSections: sections,
        editable,
        locked,
        reportAiConfigured: aiDraftGenerationAvailable,
        isAdmin,
        isGeneratingAiDraft,
        onConfigureAi: () => navigate('/settings?tab=ai'),
        onGenerateAiDraft: generateAiPreliminaryDraft,
        onInsertAiDraft: applyAiPreliminaryDraft,
        onLoadAiDraft: loadAiDraftSnapshot,
        reportDocument,
        onReportDocumentChange: updateReportDocument,
        locale,
        t
    };

    return (
        <div className="space-y-4 pb-12" dir={isArabic ? 'rtl' : 'ltr'}>
            <ImageUploadOverlay progress={imageUploadProgress} t={t} />
            <PageHeader
                icon={PenLine}
                eyebrow={isArabic ? 'مساحة إعداد التقرير' : 'Reporting workspace'}
                title={studyTitle}
                description={`${exam?.patient_name || '-'} · MRN ${exam?.mrn || '-'} · #${exam?.order_number || examId}`}
                metrics={[
                    { key: 'completion', icon: ClipboardCheck, label: isArabic ? 'اكتمال التقرير' : 'Report completion', value: `${completion}%`, tone: completion === 100 ? 'emerald' : 'teal' },
                    { key: 'quality', icon: ShieldCheck, label: isArabic ? 'جودة التقرير' : 'Quality score', value: `${qualityScore}%`, tone: qualityScore >= 80 ? 'emerald' : 'amber' },
                    { key: 'words', icon: FileText, label: isArabic ? 'عدد الكلمات' : 'Word count', value: reportWords, tone: 'blue' },
                    { key: 'status', icon: locked ? LockKeyhole : Save, label: isArabic ? 'حالة السجل' : 'Record status', value: locked ? (isArabic ? 'نهائي ومغلق' : 'Finalized') : dirty ? (isArabic ? 'تغييرات غير محفوظة' : 'Unsaved') : (isArabic ? 'محفوظ' : 'Saved'), tone: locked || !dirty ? 'emerald' : 'rose' }
                ]}
                metricsLabel={isArabic ? 'مؤشرات سجل التقرير' : 'Report record indicators'}
            />

            {/* Master Patient & Study Hero Deck */}
            <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    {/* Patient & Exam Identity */}
                    <div className="flex min-w-0 items-center gap-3.5">
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 font-black text-lg">
                            <User size={22} />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-black text-slate-900 dark:text-white sm:text-lg truncate">
                                    {exam?.patient_name || '—'}
                                </h2>
                                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase ${priorityTone[priorityKey] || priorityTone.Routine}`}>
                                    {priorityKey}
                                </span>
                                {locked && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                                        <LockKeyhole size={11} />
                                        <span>FINALIZED & LOCKED</span>
                                    </span>
                                )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
                                <span className="font-mono font-bold">MRN: {exam?.mrn || '—'}</span>
                                <span>·</span>
                                <span className="font-bold text-slate-800 dark:text-slate-200">{studyTitle}</span>
                                <span>·</span>
                                <span>Order #{exam?.order_number || examId}</span>
                            </div>
                        </div>
                    </div>

                    {/* Stepper + Actions */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Primary Image Preview Button (Shown only when images are available) */}
                        {canOpenPacsViewer && (
                            <button
                                type="button"
                                onClick={openPacsViewer}
                                className="inline-flex h-10 items-center gap-2 rounded-xl bg-teal-600 px-4 text-xs font-black text-white hover:bg-teal-500 shadow-sm shadow-teal-600/20 transition active:scale-95"
                                title={isArabic ? 'فتح عارض صور الفحص DICOM' : 'Launch DICOM PACS Image Viewer'}
                            >
                                <Eye size={16} />
                                <span>{isArabic ? 'معاينة الصور (DICOM)' : 'Preview Images'}</span>
                                {imaging?.image_count > 0 && (
                                    <span className="rounded-full bg-teal-700/80 px-2 py-0.5 text-[10px] font-black text-teal-100">
                                        {imaging.image_count}
                                    </span>
                                )}
                            </button>
                        )}

                        {/* Open Study Tools Drawer */}
                        <button
                            type="button"
                            onClick={() => setStudyToolsDrawerOpen(true)}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3.5 text-xs font-black text-teal-700 dark:text-teal-300 hover:bg-teal-500 hover:text-white transition shadow-xs"
                        >
                            <Layers3 size={15} />
                            <span>{isArabic ? 'أدوات الدراسة' : 'Study & AI Tools'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowExportDialog(true)}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                            <Download size={15} />
                            <span>{isArabic ? 'تصدير' : 'Export'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate('/worklist')}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        >
                            <ArrowLeft size={15} className="rtl:rotate-180" />
                            <span>{isArabic ? 'قائمة العمل' : 'Worklist'}</span>
                        </button>
                    </div>
                </div>

                {/* Workflow Stepper */}
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <WorkflowStepper currentStatus={currentReportStatus} t={t} />
                </div>
            </section>

            {/* Read-only / Amendment Alerts */}
            {!canAuthor && (
                <Notice
                    icon={LockKeyhole}
                    tone="blue"
                    title={t('editor.readOnly')}
                    description={t('editor.readOnlyHelp')}
                />
            )}

            {locked && !amendmentMode && canAuthor && (
                <Notice
                    icon={FileCheck2}
                    tone="emerald"
                    title={t('editor.signedLocked')}
                    description={t('editor.signedLockedHelp')}
                    action={
                        <button
                            type="button"
                            onClick={() => setAmendmentMode(true)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-amber-600 px-4 text-xs font-black text-white hover:bg-amber-500 transition"
                        >
                            <PenLine size={14} />
                            <span>{t('reporting.amend')}</span>
                        </button>
                    }
                />
            )}

            {/* Main 2-Column Responsive Workspace */}
            <div className={`grid items-start gap-4 ${focusMode ? 'grid-cols-1' : 'lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]'}`}>
                {/* Left: Section Cards Editor Suite */}
                <div className="min-w-0 space-y-3">
                    {/* Section Quick Nav & Focus Toggle */}
                    <div className="flex items-center justify-between gap-2">
                        <SectionQuickNav
                            sections={sections}
                            activeSection={activeSection}
                            completion={completion}
                            onSelect={selectSection}
                            t={t}
                        />
                        <button
                            type="button"
                            onClick={() => setFocusMode(!focusMode)}
                            className="hidden lg:inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                            {focusMode ? <EyeOff size={14} /> : <Eye size={14} />}
                            <span>{focusMode ? (isArabic ? 'عرض اللوحة الجانبية' : 'Show Inspector') : (isArabic ? 'وضع التركيز' : 'Focus Mode')}</span>
                        </button>
                    </div>

                    {/* Template Selector Bar */}
                    {!locked && canAuthor && (
                        <TemplateBar
                            templates={effectiveReportTemplates}
                            editable={editable}
                            isSavingTemplate={isCreatingTemplate || templatesLoading}
                            currentExamTypeId={effectiveExamTypeId}
                            currentModalityType={effectiveModalityType}
                            currentStudyTypeLabel={studyTitle}
                            onApply={applyTemplate}
                            onSaveTemplate={hasReportContent ? () => setShowTemplatePrompt(true) : undefined}
                            t={t}
                        />
                    )}

                    {/* Diagnostic Section Cards */}
                    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 divide-y divide-slate-100 dark:divide-slate-800">
                        {SECTION_CONFIG.map((config) => (
                            <ReportSectionCard
                                key={config.key}
                                config={config}
                                value={sections[config.key]}
                                editable={editable}
                                active={activeSection === config.key}
                                collapsed={collapsedSections[config.key]}
                                embedded
                                onToggleCollapse={toggleSectionCollapse}
                                onFocus={() => setActiveSection(config.key)}
                                onChange={updateSection}
                                canImprove={sectionImproveAvailable}
                                isImproving={improvingKey === config.key}
                                onImprove={improveSectionText}
                                canUndoImprove={improvementUndo?.key === config.key && sections[config.key] === improvementUndo.improved}
                                onUndoImprove={() => undoImprovement(improvementUndo)}
                                locale={locale}
                                t={t}
                            />
                        ))}
                    </div>

                    {/* Sticky Action Command Bar */}
                    <div className="sticky bottom-3 z-30 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 text-xs">
                            <span className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-bold ${
                                dirty
                                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            }`}>
                                {dirty ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
                                <span>{dirty ? (isArabic ? 'تعديلات غير محفوظة' : 'Unsaved changes') : (isArabic ? 'تم حفظ التقرير' : 'All saved')}</span>
                            </span>
                            {finalizationErrors.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600">
                                    <AlertTriangle size={13} />
                                    <span>{finalizationErrors.length} {isArabic ? 'حقول إلزامية متبقية' : 'required sections empty'}</span>
                                </span>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            {/* Preview Images Quick Action (Shown only when images are available) */}
                            {canOpenPacsViewer && (
                                <button
                                    type="button"
                                    onClick={openPacsViewer}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                    title={isArabic ? 'معاينة صور الفحص DICOM' : 'Preview DICOM Images'}
                                >
                                    <Eye size={14} />
                                    <span>{isArabic ? 'معاينة الصور' : 'Preview Images'}</span>
                                </button>
                            )}

                            {amendmentMode ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setAmendmentMode(false)}
                                        className="inline-flex h-9 items-center rounded-xl border border-slate-200 px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                                    >
                                        {isArabic ? 'إلغاء' : 'Cancel'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={submitAmendment}
                                        disabled={isAmending || !dirty || amendmentReason.trim().length < 3}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-amber-600 px-4 text-xs font-black text-white hover:bg-amber-500 disabled:opacity-50"
                                    >
                                        {isAmending ? <Loader2 size={14} className="animate-spin" /> : <FileCheck2 size={14} />}
                                        <span>{isArabic ? 'حفظ الاستدراك' : 'Save Amendment'}</span>
                                    </button>
                                </>
                            ) : !locked && canAuthor ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={saveTypedReport}
                                        disabled={isSaving || (!dirty && currentReportStatus !== 'Draft')}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 disabled:opacity-40"
                                    >
                                        {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                        <span>{currentReportStatus === 'Draft' ? (isArabic ? 'حفظ كمسودة' : 'Save Draft') : (isArabic ? 'حفظ التعديلات' : 'Save Changes')}</span>
                                    </button>

                                    {nextReportStatus && nextReportStatus !== 'Typed' && (
                                        <button
                                            type="button"
                                            onClick={advanceReportStatus}
                                            disabled={isSaving}
                                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3.5 text-xs font-black text-teal-700 dark:text-teal-300 hover:bg-teal-500 hover:text-white transition"
                                        >
                                            <ClipboardCheck size={14} />
                                            <span>{nextReportStatus === 'Approved' ? (isArabic ? 'اعتماد' : 'Approve') : (isArabic ? 'مراجعة' : 'Review')}</span>
                                        </button>
                                    )}

                                    {canFinalize && currentReportStatus === 'Approved' && <button
                                        type="button"
                                        onClick={() => setShowFinalize(true)}
                                        disabled={isSaving || finalizationErrors.length > 0}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-5 text-xs font-black text-white hover:bg-emerald-500 transition disabled:opacity-40 shadow-sm"
                                    >
                                        <LockKeyhole size={14} />
                                        <span>{isArabic ? 'اعتماد وتوقيع التقرير نهائياً' : 'Finalize & Sign Report'}</span>
                                    </button>}
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setShowExportDialog(true)}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-xs font-black text-white hover:bg-teal-500"
                                >
                                    <Download size={14} />
                                    <span>{isArabic ? 'تصدير التقرير' : 'Export Report'}</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Diagnostic Telemetry & Inspector Panel */}
                {!focusMode && (
                    <aside className="space-y-3">
                        {/* Quick Trigger for Study Tools Drawer */}
                        <button
                            type="button"
                            onClick={() => setStudyToolsDrawerOpen(true)}
                            className="w-full flex items-center justify-between rounded-2xl border border-teal-500/30 bg-teal-50/80 p-3 text-start shadow-xs transition hover:bg-teal-100/80 dark:border-teal-900/50 dark:bg-teal-950/20 dark:hover:bg-teal-950/40"
                        >
                            <div className="flex items-center gap-2.5">
                                <span className="grid h-8 w-8 place-items-center rounded-xl bg-teal-600 text-white shadow-xs">
                                    <Layers3 size={16} />
                                </span>
                                <div>
                                    <span className="block text-xs font-black text-teal-900 dark:text-teal-200">
                                        {isArabic ? 'درج أدوات الدراسة والـ PACS' : 'Study & AI Tools Drawer'}
                                    </span>
                                    <span className="block text-[10px] text-teal-700/80 dark:text-teal-400">
                                        {isArabic ? 'الصور، الذكاء الاصطناعي، وإعدادات الوثيقة' : 'Images, AI assistant, and document'}
                                    </span>
                                </div>
                            </div>
                            <span className="rounded-lg bg-white/80 px-2 py-1 text-[10px] font-black text-teal-700 dark:bg-slate-900 dark:text-teal-300">
                                {isArabic ? 'فتح الدرج' : 'Open'}
                            </span>
                        </button>

                        {/* Inspector Tabs */}
                        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 flex flex-wrap gap-1">
                            {[
                                { id: 'preview', icon: Eye, label: isArabic ? 'معاينة حية' : 'Preview' },
                                { id: 'quality', icon: ShieldCheck, label: isArabic ? 'الجودة' : 'Quality' },
                                ...(locked ? [{ id: 'delivery', icon: Send, label: isArabic ? 'التسليم' : 'Delivery' }] : [])
                            ].map((tab) => {
                                const Icon = tab.icon;
                                const isActive = inspectorTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setInspectorTab(tab.id)}
                                        className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition-all ${
                                            isActive
                                                ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                                                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                                        }`}
                                    >
                                        <Icon size={14} />
                                        <span>{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Inspector Content Box */}
                        <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 min-h-[400px]">
                            {inspectorTab === 'preview' && (
                                <ReportPreviewPanel exam={exam} sections={sections} t={t} />
                            )}
                            {inspectorTab === 'quality' && (
                                <QualityPanel
                                    completion={completion}
                                    reportWords={reportWords}
                                    qualityScore={qualityScore}
                                    checks={qualityChecks}
                                    t={t}
                                />
                            )}
                            {inspectorTab === 'delivery' && locked && (
                                <DeliveryPanel
                                    history={deliveryHistory}
                                    onDeliver={deliver}
                                    isDelivering={isDelivering}
                                    locale={locale}
                                    t={t}
                                />
                            )}
                        </div>
                    </aside>
                )}
            </div>

            {/* Slide-out Study Tools Drawer */}
            {studyToolsDrawerOpen && (
                <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
                        onClick={() => setStudyToolsDrawerOpen(false)}
                    />

                    <div className={`fixed inset-y-0 ${isArabic ? 'left-0' : 'right-0'} flex max-w-full ${isArabic ? 'pr-6' : 'pl-6'}`}>
                        <div className={`w-screen max-w-2xl bg-white shadow-2xl backdrop-blur-2xl dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800 flex flex-col ${isArabic ? 'animate-in slide-in-from-left duration-250' : 'animate-in slide-in-from-right duration-250'}`}>
                            {/* Drawer Header */}
                            <div className="border-b border-slate-100 p-4 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/40 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300">
                                            <Layers3 size={20} />
                                        </span>
                                        <div>
                                            <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                                {isArabic ? 'أدوات دراسة الفحص والذكاء الاصطناعي' : 'Study Imaging & AI Tools'}
                                            </h3>
                                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                                {studyTitle} · Order #{exam?.order_number || examId}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {canOpenPacsViewer && (
                                            <button
                                                type="button"
                                                onClick={openPacsViewer}
                                                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-teal-600 px-3 text-xs font-black text-white hover:bg-teal-500 shadow-xs transition"
                                            >
                                                <Monitor size={14} />
                                                <span>{isArabic ? 'فتح عارض PACS' : 'Launch PACS'}</span>
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setStudyToolsDrawerOpen(false)}
                                            className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 transition"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Drawer Tool Filter Tabs */}
                                <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none">
                                    {[
                                        { key: null, label: isArabic ? 'الكل' : 'All Tools', icon: Layers3 },
                                        { key: 'imaging', label: isArabic ? 'صور الفحص' : 'Images & PACS', icon: Monitor },
                                        { key: 'aiImage', label: isArabic ? 'تحليل الصور AI' : 'AI Analysis', icon: Activity },
                                        { key: 'aiDraft', label: isArabic ? 'المساعد الذكي' : 'AI Draft', icon: Sparkles },
                                        { key: 'document', label: isArabic ? 'الترويسة' : 'Document', icon: FileCheck2 }
                                    ].map((tab) => {
                                        const Icon = tab.icon;
                                        const isActive = drawerTool === tab.key;
                                        return (
                                            <button
                                                key={String(tab.key)}
                                                type="button"
                                                onClick={() => setDrawerTool(tab.key)}
                                                className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-black transition-all ${
                                                    isActive
                                                        ? 'bg-teal-600 text-white shadow-xs'
                                                        : 'border border-slate-200/80 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                                                }`}
                                            >
                                                <Icon size={13} />
                                                <span>{tab.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Drawer Body with StudyToolsPanel */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                <StudyToolsPanel
                                    {...studyToolsProps}
                                    activeTool={drawerTool}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Finalization Confirmation Dialog */}
            <ConfirmDialog
                isOpen={showFinalize}
                title={isArabic ? 'تأكيد اعتماد وتوقيع التقرير الطبي' : 'Confirm Finalize & Sign Report'}
                message={isArabic ? 'هل أنت متأكد من اعتماد التقرير الطبي؟ سيتم قفل التقرير وتوليد التوقيع الرقمي ولن يمكن تعديله إلا عبر إجراء استدراك رسمي.' : 'Are you sure you want to finalize this report? Once finalized, the report will be locked and digitally signed.'}
                confirmLabel={isArabic ? 'تأكيد وقفل التقرير' : 'Finalize & Lock'}
                cancelLabel={isArabic ? 'إلغاء' : 'Cancel'}
                onConfirm={finalizeReport}
                onCancel={() => {
                    setShowFinalize(false);
                    setCriticalResult(false);
                }}
                variant={criticalResult ? 'warning' : 'info'}
            >
                <label className={`block rounded-xl border p-3 transition ${criticalResult
                    ? 'border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200'
                    : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                    }`}>
                    <span className="flex items-start gap-3">
                        <input
                            type="checkbox"
                            checked={criticalResult}
                            onChange={(event) => setCriticalResult(event.target.checked)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                        />
                        <span>
                            <strong className="block text-sm">
                                {isArabic ? 'نتيجة حرجة تتطلب تأكيد الاستلام' : 'Critical result requiring acknowledgement'}
                            </strong>
                            <span className="mt-1 block text-xs leading-5 opacity-80">
                                {isArabic
                                    ? 'فعّل هذا الخيار فقط عند وجود نتيجة حرجة مؤكدة. سيُنشئ النظام تنبيهات عاجلة وسجلات تأكيد استلام للمستلمين المسؤولين.'
                                    : 'Select only for an explicitly confirmed critical finding. This creates urgent alerts and acknowledgement tasks for responsible recipients.'}
                            </span>
                        </span>
                    </span>
                </label>
            </ConfirmDialog>

            {/* Template Prompt Dialog */}
            <TextPromptDialog
                isOpen={showTemplatePrompt}
                title={isArabic ? 'حفظ كقالب تقرير جديد' : 'Save As Report Template'}
                label={isArabic ? 'اسم القالب' : 'Template Name'}
                placeholder={isArabic ? 'مثال: فحص ركبة طبيعي بدون تباين' : 'e.g. Normal Knee MRI'}
                onConfirm={async (name) => {
                    try {
                        await createTemplate({
                            name,
                            exam_type_id: effectiveExamTypeId,
                            modality_type: effectiveModalityType,
                            clinical_history: sections.clinicalHistory,
                            technique: sections.technique,
                            findings: sections.findings,
                            impression: sections.impression,
                            recommendations: sections.recommendations
                        }).unwrap();
                        setShowTemplatePrompt(false);
                        toast.success(t('messages.templateSaved'));
                    } catch (error) {
                        toast.error(getErrorMessage(error, t('messages.templateSaveError')));
                    }
                }}
                onCancel={() => setShowTemplatePrompt(false)}
            />

            {/* Export Dialog */}
            <ReportExportDialog
                open={showExportDialog}
                onClose={() => setShowExportDialog(false)}
                onExportWord={exportWord}
                onExportPdf={openPrintableReport}
                onDownloadPdf={downloadPdfReport}
                isExportingWord={isExportingWord}
                isOpeningPdf={isOpeningPdf}
                locked={locked}
                exam={exam}
                sections={sections}
                settings={reportDocument}
                onSettingsChange={updateReportDocument}
                t={t}
            />
        </div>
    );
};

export default ReportEditorPage;
