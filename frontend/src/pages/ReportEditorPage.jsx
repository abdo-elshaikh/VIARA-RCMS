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
    AlertCircle,
    AlertTriangle,
    ArrowLeft,
    CalendarDays,
    Check,
    CheckCircle2,
    ClipboardCheck,
    Clock3,
    Download,
    FileCheck2,
    Layers3,
    Loader2,
    LockKeyhole,
    Monitor,
    PenLine,
    Save,
    Send,
    ShieldAlert,
    Upload,
    X
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useAmendReportMutation,
    useCreateReportTemplateMutation,
    useDeliverResultMutation,
    useGetCenterSettingsQuery,
    useGetExamImagingStatusQuery,
    useGetExamQuery,
    useGetAiReportDraftsQuery,
    useGetAiSettingsStatusQuery,
    useGetPacsAiAnalysisJobsQuery,
    useGeneratePreliminaryReportDraftMutation,
    useGetReportTemplatesQuery,
    useGetResultDeliveryHistoryQuery,
    useMarkAiReportDraftAppliedMutation,
    useRequestPacsAiAnalysisMutation,
    useImproveReportFormatMutation,
    useUpdateReportMutation,
    useRetryPacsAiJobMutation,
    useCancelPacsAiJobMutation
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
import { inputClass, secondaryBtn } from '../utils/designTokens';

import { PANEL, PRIMARY_BUTTON, SOFT_BUTTON, FLOATING_FOOTER, SECTION_CONFIG } from '../components/reportEditor';
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
    ActionButton,
    ClinicalContextPanel,
    DeliveryPanel,
    ImageUploadOverlay,
    InspectorTabs,
    MobileWorkspaceTabs,
    Notice,
    OverflowMenu,
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

const HeaderDetail = ({ icon: Icon, label, value, mono = false }) => (
    <div className="min-w-0 border-slate-200 px-3 py-1.5 first:ps-0 odd:border-e sm:border-e sm:last:border-e-0 dark:border-slate-800">
        <dt className="flex items-center gap-1.5 text-[9px] font-black uppercase text-slate-400">
            {Icon && <Icon size={11} aria-hidden="true" />}
            {label}
        </dt>
        <dd className={`mt-1 truncate text-[11px] font-bold text-slate-700 dark:text-slate-200 ${mono ? 'font-mono' : ''}`}>
            {value || '-'}
        </dd>
    </div>
);

const userHasPermission = (user, permission) => (
    Array.isArray(user?.permissions) && user.permissions.includes(permission)
);

const ReportEditorPage = () => {
    const { examId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation('worklist');
    const user = useSelector(selectCurrentUser);
    const isArabic = i18n.resolvedLanguage?.startsWith('ar') ||
        i18n.language?.startsWith('ar');
    const locale = isArabic ? 'ar-EG' : 'en-US';
    const initialExam = location.state?.exam || null;

    const [exam, setExam] = useState(initialExam);
    const [sections, setSections] = useState(() => normalizeSections(initialExam));
    const [baseline, setBaseline] = useState(() => normalizeSections(initialExam));
    const [selectedTemplateId, setSelectedTemplateId] = useState(
        initialExam?.template_id || ''
    );
    const [activeSection, setActiveSection] = useState('clinicalHistory');
    const [mobileView, setMobileView] = useState('editor');
    const [inspectorTab, setInspectorTab] = useState('preview');
    const [focusMode, setFocusMode] = useState(false);
    const [amendmentMode, setAmendmentMode] = useState(false);
    const [amendmentReason, setAmendmentReason] = useState('');
    const [showFinalize, setShowFinalize] = useState(false);
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
    /* Tracks which optional sections (clinical history, technique, recommendations)
       are collapsed. Seeded from whichever sections already have content so nothing
       the radiologist wrote gets hidden. */
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
    const { data: imaging, refetch: refetchImaging } = useGetExamImagingStatusQuery(examId, {
        skip: !examId
    });
    const { data: centerSettings } = useGetCenterSettingsQuery();
    const { data: aiSettingsStatus } = useGetAiSettingsStatusQuery(undefined, {
        skip: !user
    });
    const normalizedCenterSettings = useMemo(
        () => normalizeCenterSettings(centerSettings),
        [centerSettings]
    );

    const effectiveExamTypeId = exam?.exam_type_id || fetchedExam?.exam_type_id;
    const effectiveModalityType =
        exam?.modality_type ||
        fetchedExam?.modality_type ||
        exam?.modality_name ||
        fetchedExam?.modality_name;
    const { data: reportTemplates = [], isLoading: templatesLoading } =
        useGetReportTemplatesQuery(
            {
                examTypeId: effectiveExamTypeId,
                modalityType: effectiveModalityType
            },
            { skip: !effectiveExamTypeId && !effectiveModalityType }
        );
    const { data: deliveryHistory = [] } =
        useGetResultDeliveryHistoryQuery(examId, {
            skip: !examId || !exam?.report_locked
        });
    const [updateReport, { isLoading: isSaving }] = useUpdateReportMutation();
    const [createTemplate, { isLoading: isCreatingTemplate }] =
        useCreateReportTemplateMutation();
    const [amendReport, { isLoading: isAmending }] = useAmendReportMutation();
    const [deliverResult, { isLoading: isDelivering }] =
        useDeliverResultMutation();
    const [generatePreliminaryDraft, { isLoading: isGeneratingAiDraft }] =
        useGeneratePreliminaryReportDraftMutation();
    const [markAiDraftApplied] = useMarkAiReportDraftAppliedMutation();
    const [requestPacsAiAnalysis, { isLoading: isRequestingAiAnalysis }] =
        useRequestPacsAiAnalysisMutation();
    const [retryPacsAiJob, { isLoading: isRetryingJob }] = useRetryPacsAiJobMutation();
    const [cancelPacsAiJob, { isLoading: isCancelingJob }] = useCancelPacsAiJobMutation();
    const [improveReportFormat] = useImproveReportFormatMutation();
    const [improvingKey, setImprovingKey] = useState(null);

    const dirty = useMemo(
        () => !sectionsAreEqual(sections, baseline),
        [baseline, sections]
    );
    const currentReportStatus = exam?.report_status || 'Draft';
    const saveStatus = getReportStatusForSave(currentReportStatus);
    const nextReportStatus = getNextReportStatus(currentReportStatus);
    const previewText = useMemo(
        () => buildReportText(sections, t),
        [sections, t]
    );
    const locked = Boolean(exam?.report_locked);
    const canAuthor = user?.role === 'Radiologist';
    const isAdmin = hasDeveloperOrAdminRole(user?.role);
    const canUseImageAi = hasDeveloperOrAdminRole(user?.role) || user?.role === 'Radiologist';
    const canUseReportAi = canUseImageAi ||
        userHasPermission(user, 'WRITE_REPORTS') ||
        userHasPermission(user, 'IMPROVE_REPORT_FORMAT');
    const editable = canAuthor && (!locked || amendmentMode);
    const reportAiConfigured = aiSettingsStatus?.report?.configured;
    const { data: aiDraftHistoryData } = useGetAiReportDraftsQuery(examId, {
        skip: !examId || !canUseReportAi
    });
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
    const studyInstanceUid =
        imaging?.study_instance_uid || exam?.study_instance_uid || '';
    const canOpenPacsViewer = Boolean(imaging?.images_available && (studyInstanceUid || examId));
    const imagesReady = canOpenPacsViewer;
    const hasReportContent = Object.values(sections).some((value) => value.trim());
    const effectiveReportTemplates = useMemo(() => {
        const databaseTemplates = reportTemplates.map((template) => ({
            ...template,
            is_builtin: false
        }));
        const seen = new Set(
            databaseTemplates.map((template) =>
                `${template.name}|${normalizeModality(template.modality_type)}`
            )
        );
        const builtIns = getBuiltInTemplatesForExam(exam || fetchedExam).filter(
            (template) =>
                !seen.has(`${template.name}|${normalizeModality(template.modality_type)}`)
        );
        return [...databaseTemplates, ...builtIns];
    }, [exam, fetchedExam, reportTemplates]);

    const finalizationErrors = useMemo(
        () =>
            [
                !sections.findings.trim()
                    ? t('editor.findingsRequired')
                    : '',
                !sections.impression.trim()
                    ? t('editor.impressionRequired')
                    : ''
            ].filter(Boolean),
        [sections.findings, sections.impression, t]
    );
    const firstIncompleteRequiredSection = !sections.findings.trim()
        ? 'findings'
        : (!sections.impression.trim() ? 'impression' : null);

    const completion = useMemo(
        () =>
            Math.round(
                (SECTION_CONFIG.filter(({ key }) => sections[key].trim()).length /
                    SECTION_CONFIG.length) *
                100
            ),
        [sections]
    );
    const reportWords = useMemo(() => countWords(previewText), [previewText]);
    const qualityChecks = useMemo(
        () => [
            {
                key: 'required',
                complete: finalizationErrors.length === 0,
                label: t('editor.quality.required'),
                detail: t('editor.quality.requiredHelp')
            },
            {
                key: 'context',
                complete: Boolean(
                    sections.clinicalHistory.trim() || exam?.clinical_indication
                ),
                label: t('editor.quality.context'),
                detail: t('editor.quality.contextHelp')
            },
            {
                key: 'technique',
                complete: Boolean(sections.technique.trim()),
                label: t('editor.quality.technique'),
                detail: t('editor.quality.techniqueHelp')
            },
            {
                key: 'images',
                complete: imagesReady,
                label: t('editor.quality.images'),
                detail: imagesReady
                    ? t('editor.quality.imagesReady')
                    : t('editor.quality.imagesMissing')
            },
            {
                key: 'saved',
                complete: !dirty,
                label: t('editor.quality.saved'),
                detail: dirty
                    ? t('editor.quality.unsavedHelp')
                    : t('editor.quality.savedHelp')
            }
        ],
        [
            dirty,
            exam?.clinical_indication,
            finalizationErrors.length,
            imagesReady,
            sections.clinicalHistory,
            sections.technique,
            t
        ]
    );
    const qualityScore = Math.round(
        (qualityChecks.filter((check) => check.complete).length /
            qualityChecks.length) *
        100
    );

    dirtyRef.current = dirty;

    useEffect(() => {
        if (!fetchedExam) return;

        setExam(fetchedExam);
        const isDifferentExam =
            initializedExamId.current !== fetchedExam.exam_id;

        if (isDifferentExam || !dirtyRef.current) {
            const nextSections = normalizeSections(fetchedExam);
            setSections(nextSections);
            setBaseline(nextSections);
            setSelectedTemplateId(fetchedExam.template_id || '');
            initializedExamId.current = fetchedExam.exam_id;
            if (isDifferentExam) {
                setCollapsedSections(
                    SECTION_CONFIG.reduce((acc, { key, collapsible }) => {
                        if (collapsible) acc[key] = !nextSections[key]?.trim();
                        return acc;
                    }, {})
                );
            }
        }
    }, [fetchedExam]);

    useEffect(() => {
        if (appliedDocumentDefaults.current) return;
        if (!centerSettings) return;

        appliedDocumentDefaults.current = true;
        setReportDocument({
            includeHeader: true,
            includeFooter: true,
            includeSignature: true,
            reportHeader: buildReportHeader(normalizedCenterSettings),
            reportFooter: buildReportFooter(normalizedCenterSettings)
        });
    }, [centerSettings, normalizedCenterSettings]);

    const updateReportDocument = useCallback((nextOrField, value) => {
        setReportDocument((current) => typeof nextOrField === 'string'
            ? { ...current, [nextOrField]: value }
            : { ...current, ...(nextOrField || {}) });
    }, []);

    const saveReport = useCallback(
        async (reportStatus = 'Typed', finalize = false) => {
            if (!canAuthor || locked) return false;
            if (finalize && finalizationErrors.length > 0) {
                toast.error(finalizationErrors[0]);
                return false;
            }

            try {
                const result = await updateReport({
                    examId,
                    status: finalize ? 'Finalized' : 'Reporting',
                    reportStatus,
                    templateId: isUuid(selectedTemplateId)
                        ? selectedTemplateId
                        : undefined,
                    sections,
                    reportContent: previewText
                }).unwrap();

                setExam((current) => ({ ...current, ...result }));
                setBaseline({ ...sections });
                const statusChanged = reportStatus !== currentReportStatus;
                toast.success(finalize
                    ? t('messages.reportFinalized')
                    : statusChanged
                        ? t('messages.reportStatusUpdated', {
                            defaultValue: `Report marked ${reportStatus}.`,
                            status: t(`statuses.${reportStatus}`, { defaultValue: reportStatus })
                        })
                        : t('messages.reportSaved'));
                return true;
            } catch (error) {
                toast.error(
                    getErrorMessage(error, t('messages.reportError'))
                );
                return false;
            }
        },
        [
            canAuthor,
            currentReportStatus,
            examId,
            finalizationErrors,
            locked,
            previewText,
            sections,
            selectedTemplateId,
            t,
            updateReport
        ]
    );

    const saveTypedReport = useCallback(() => saveReport(saveStatus), [saveReport, saveStatus]);

    const advanceReportStatus = useCallback(() => {
        if (!nextReportStatus || nextReportStatus === 'Typed') return;
        if (nextReportStatus === 'Approved') {
            setPendingReportStatus(nextReportStatus);
            return;
        }
        saveReport(nextReportStatus);
    }, [nextReportStatus, saveReport]);

    useUnsavedChangesGuard({
        dirty,
        canSave: editable && !locked && !isSaving,
        onSave: saveTypedReport
    });

    const updateSection = useCallback((key, value) => {
        setSections((current) => ({ ...current, [key]: value }));
    }, []);

    const improveSectionText = useCallback(async (key) => {
        if (!canUseReportAi) {
            toast.error(t('editor.aiDraft.accessDenied', {
                defaultValue: 'You do not have permission to use the AI report assistant.'
            }));
            return;
        }
        const originalText = sections[key]?.trim();
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
                updateSection(key, result.improved);
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
            toast.error(t('editor.aiDraft.accessDenied', {
                defaultValue: 'You do not have permission to use the AI report assistant.'
            }));
            return;
        }
        try {
            const template = effectiveReportTemplates.find(
                (item) => String(item.template_id) === String(selectedTemplateId)
            );
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
            toast.success(t('editor.aiDraft.generated', {
                defaultValue: 'AI preliminary draft generated'
            }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('editor.aiDraft.error', {
                defaultValue: 'Could not generate AI preliminary draft'
            })));
        }
    }, [canUseReportAi, effectiveReportTemplates, examId, generatePreliminaryDraft, selectedTemplateId, t]);

    const requestAiImageAnalysis = useCallback(async () => {
        try {
            const result = await requestPacsAiAnalysis({
                examId,
                analysisType: 'preliminary_image_review'
            }).unwrap();
            toast.success(result?.existing
                ? t('editor.aiImage.alreadyQueued', { defaultValue: 'AI analysis is already queued' })
                : t('editor.aiImage.requested', { defaultValue: 'AI image analysis queued' }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('editor.aiImage.error', {
                defaultValue: 'Could not queue AI image analysis'
            })));
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
                sourceMode: item.prompt_context?.imageAnalysis
                    ? 'pacs-image-analysis'
                    : 'exam-metadata',
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
        const selectedKeys = new Set(
            sectionKeys.length
                ? sectionKeys
                : SECTION_CONFIG.map(({ key }) => key)
        );
        const replacingPopulatedSections = overwrite && SECTION_CONFIG.some(({ key }) => (
            selectedKeys.has(key) &&
            String(aiDraft.sections[key] || '').trim() &&
            String(sections[key] || '').trim()
        ));
        if (
            replacingPopulatedSections &&
            !window.confirm(t('editor.aiDraft.replaceConfirm', {
                defaultValue: 'Replace the selected populated report sections with this AI draft? Your current text will be overwritten.'
            }))
        ) return;

        const applicableKeys = SECTION_CONFIG
            .map(({ key }) => key)
            .filter((key) => (
                selectedKeys.has(key) &&
                String(aiDraft.sections[key] || '').trim() &&
                (overwrite || !String(sections[key] || '').trim())
            ));
        if (!applicableKeys.length) {
            toast(t('editor.aiDraft.nothingToApply', {
                defaultValue: overwrite
                    ? 'Select at least one draft section to replace.'
                    : 'The selected report sections already contain text.'
            }));
            return;
        }
        const applicableKeySet = new Set(applicableKeys);
        setSections((current) => {
            const next = { ...current };
            SECTION_CONFIG.forEach(({ key }) => {
                if (!applicableKeySet.has(key)) return;
                next[key] = String(aiDraft.sections[key] || '').trim();
            });
            return next;
        });
        setCollapsedSections((current) => {
            const next = { ...current };
            SECTION_CONFIG.forEach(({ key, collapsible }) => {
                if (selectedKeys.has(key) && collapsible && String(aiDraft.sections[key] || '').trim()) {
                    next[key] = false;
                }
            });
            return next;
        });
        if (aiDraft.draftId) {
            markAiDraftApplied({
                examId,
                draftId: aiDraft.draftId,
                mode
            }).catch(() => undefined);
        }
        toast.success(t('editor.aiDraft.inserted', {
            count: applicableKeys.length,
            defaultValue: overwrite
                ? `AI draft replaced ${applicableKeys.length} selected sections`
                : `AI draft filled ${applicableKeys.length} empty sections`
        }));
    }, [aiDraft, examId, markAiDraftApplied, sections, t]);

    const selectSection = useCallback((key) => {
        setActiveSection(key);
        setMobileView('editor');
        setCollapsedSections((current) => (current[key] ? { ...current, [key]: false } : current));
        window.requestAnimationFrame(() => {
            document
                .getElementById(`report-section-${key}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }, []);

    const applyTemplate = useCallback(
        (templateId) => {
            setSelectedTemplateId(templateId);
            const template = effectiveReportTemplates.find(
                (item) => String(item.template_id) === String(templateId)
            );
            if (!template) return;
            const nextSections = templateToSections(template, exam);
            setSections(nextSections);
            setCollapsedSections((current) => {
                const next = { ...current };
                SECTION_CONFIG.forEach(({ key, collapsible }) => {
                    if (collapsible && nextSections[key]?.trim()) next[key] = false;
                });
                return next;
            });
        },
        [effectiveReportTemplates, exam]
    );

    const saveTemplate = async (name) => {
        try {
            await createTemplate({
                name,
                modalityType: exam?.modality_type || undefined,
                examTypeId: exam?.exam_type_id || undefined,
                ...sections
            }).unwrap();
            toast.success(t('messages.templateSaved'));
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, t('messages.templateError')));
            return false;
        }
    };

    const submitAmendment = async () => {
        if (amendmentReason.trim().length < 3) {
            toast.error(t('messages.amendmentRequired'));
            return false;
        }
        if (finalizationErrors.length > 0) {
            toast.error(finalizationErrors[0]);
            return false;
        }

        try {
            const result = await amendReport({
                id: examId,
                reason: amendmentReason.trim(),
                sections,
                reportContent: previewText
            }).unwrap();

            setExam((current) => ({ ...current, ...result }));
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

    const cancelAmendment = () => {
        setSections({ ...baseline });
        setAmendmentReason('');
        setAmendmentMode(false);
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
            const baseUrl =
                import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
            const query = new URLSearchParams({
                reportHeader: reportDocument.reportHeader,
                reportFooter: reportDocument.reportFooter,
                includeHeader: String(reportDocument.includeHeader !== false),
                includeFooter: String(reportDocument.includeFooter !== false),
                includeSignature: String(reportDocument.includeSignature !== false)
            });
            const response = await authenticatedFetch(
                `${baseUrl}/exams/${examId}/report/pdf?${query.toString()}`
            );

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const html = await response.text();
            const url = URL.createObjectURL(
                new Blob([html], { type: 'text/html' })
            );
            const popup = window.open(url, '_blank', 'noopener,noreferrer');

            if (!popup) {
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.target = '_blank';
                anchor.rel = 'noopener noreferrer';
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

    const requestExit = () => {
        if (dirty) {
            setShowExitConfirm(true);
            return;
        }
        navigate('/worklist');
    };

    const handleImageUpload = async (event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (files.length === 0) return;
        if (isUploadingImages) return;

        try {
            setImageUploadProgress({
                percent: 0,
                loaded: 0,
                total: files.reduce((sum, file) => sum + Number(file.size || 0), 0),
                files: files.length,
                phase: 'uploading'
            });

            const response = await uploadExamImagesWithProgress({
                examId,
                files,
                orderNumber: exam?.order_number,
                onProgress: (progress) => {
                    setImageUploadProgress((current) => ({
                        ...(current || {}),
                        ...progress,
                        files: files.length
                    }));
                }
            });
            const stored = Number(response?.stored || 0);
            const reconciled = Number(response?.reconciled ?? stored);
            const unreconciled = Number(response?.unreconciled || 0);
            const failed = Number(response?.failed || 0);
            const rejected = Number(response?.rejected || 0);

            setImageUploadProgress((current) => ({
                ...(current || {}),
                percent: 100,
                phase: 'done'
            }));

            if (reconciled > 0) {
                refetchImaging?.();
                refetch?.();
                if (unreconciled || failed || rejected) {
                    toast(
                        t('editor.uploadImagesPartial', {
                            defaultValue: `${reconciled} linked; ${unreconciled + failed + rejected} need attention`,
                            linked: reconciled,
                            attention: unreconciled + failed + rejected
                        }),
                        { duration: 6000 }
                    );
                } else {
                    toast.success(
                        t('editor.uploadImagesDone', {
                            defaultValue: `${reconciled} image(s) uploaded and linked`,
                            count: reconciled
                        })
                    );
                }
                return;
            }

            if (stored > 0) {
                refetchImaging?.();
                toast.error(
                    t('editor.uploadImagesUnreconciled', {
                        defaultValue: `${stored} image(s) reached PACS but could not be linked. Review Study Reconciliation.`,
                        count: stored
                    }),
                    { duration: 7000 }
                );
                return;
            }

            const reason = response?.results?.find(
                (result) => result.status !== 'stored'
            )?.reason;
            toast.error(
                reason
                    ? t('editor.uploadImagesFailed', {
                        defaultValue: `Upload failed: ${reason}`,
                        reason
                    })
                    : t('editor.uploadImagesNone', {
                        defaultValue: 'No files could be stored'
                    })
            );
        } catch (error) {
            setImageUploadProgress(null);
            toast.error(
                getErrorMessage(
                    error,
                    t('editor.uploadImagesError', {
                        defaultValue: 'Image upload failed'
                    })
                )
            );
        } finally {
            window.setTimeout(() => {
                setImageUploadProgress((current) => current?.phase === 'done' ? null : current);
            }, 1200);
        }
    };

    const exportWord = async () => {
        if (isExportingWord) return false;
        setIsExportingWord(true);

        try {
            const { exportReportToWord } = await import(
                '../utils/exportReportToWord'
            );
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

    const reportStatus = currentReportStatus;
    const imageStatusLabel = imaging?.images_available
        ? t('editor.viewImagesReady', {
            defaultValue: `${imaging?.image_count || 0} order image(s)`
        })
        : t('editor.viewImagesNone', {
            defaultValue: 'No order images yet'
        });

    const openPacsViewer = () => {
        if (!studyInstanceUid && !examId) return;

        const params = new URLSearchParams();
        if (studyInstanceUid) params.set('StudyInstanceUIDs', studyInstanceUid);
        if (examId) params.set('examId', examId);
        if (exam?.order_number) {
            params.set('order', exam.order_number);
            params.set('accession', exam.order_number);
        }
        const viewerPath = `/pacs/viewer?${params.toString()}`;
        const viewerTab = window.open('', '_blank');

        if (!viewerTab) {
            navigate(viewerPath);
            return;
        }

        viewerTab.opener = null;
        viewerTab.location.href = viewerPath;
    };

    const inspectorContent = {
        preview: (
            <ReportPreviewPanel exam={exam} sections={sections} t={t} />
        ),
        context: <ClinicalContextPanel exam={exam} locale={locale} t={t} />,
        documents: exam?.patient_id ? (
            <PatientDocumentsPanel
                patientId={exam.patient_id}
                locale={locale}
                t={t}
            />
        ) : null,
        delivery: locked ? (
            <DeliveryPanel
                history={deliveryHistory}
                onDeliver={deliver}
                isDelivering={isDelivering}
                locale={locale}
                t={t}
            />
        ) : null
    };

    const desktopGridClass = focusMode
        ? 'xl:grid-cols-[minmax(0,1fr)]'
        : 'xl:grid-cols-[minmax(0,1fr)_390px] 2xl:grid-cols-[minmax(0,1fr)_420px]';

    const toggleFocusMode = () => {
        setFocusMode((current) => {
            const next = !current;
            if (next) setMobileView('editor');
            return next;
        });
    };

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
        <div
            dir={isArabic ? 'rtl' : 'ltr'}
            lang={isArabic ? 'ar' : 'en'}
            className="min-h-[calc(100vh-4rem)] bg-slate-50 pb-48 dark:bg-[var(--rcms-canvas)] sm:pb-32 print:bg-white print:pb-0"
        >
            <ImageUploadOverlay progress={imageUploadProgress} t={t} />
            <ReportExportDialog
                open={showExportDialog}
                onClose={() => setShowExportDialog(false)}
                onExportWord={exportWord}
                onExportPdf={openPrintableReport}
                isExportingWord={isExportingWord}
                isOpeningPdf={isOpeningPdf}
                locked={locked}
                exam={exam}
                sections={sections}
                settings={reportDocument}
                onSettingsChange={updateReportDocument}
                t={t}
            />
            <header className="z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-xl dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface)]/95 print:static xl:sticky xl:top-0">
                <div className="mx-auto max-w-[1720px] px-3 sm:px-5 lg:px-6">
                    <div className="grid gap-3 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                            <button
                                type="button"
                                onClick={requestExit}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                                aria-label={t('editor.backToWorklist')}
                            >
                                <ArrowLeft size={18} className="rtl:rotate-180" />
                            </button>

                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-black text-white shadow-sm dark:bg-slate-100 dark:text-slate-900 sm:h-11 sm:w-11">
                                {(exam.patient_name || exam.mrn || 'P')
                                    .trim()
                                    .split(/\s+/)
                                    .slice(0, 2)
                                    .map((part) => part[0])
                                    .join('')
                                    .toUpperCase()}
                            </span>

                            <div className="min-w-0">
                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                    <h1 className="max-w-full truncate text-[15px] font-black text-slate-900 dark:text-white sm:text-lg">
                                        {exam.patient_name || exam.mrn}
                                    </h1>
                                    {exam.priority && exam.priority !== 'Routine' && (
                                        <span
                                            className={`inline-flex rounded-md px-2 py-0.5 text-[9px] font-black uppercase ring-1 ${exam.priority === 'Emergency'
                                                ? 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900'
                                                : 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900'
                                                }`}
                                        >
                                            {t(`priorities.${exam.priority}`, {
                                                defaultValue: exam.priority
                                            })}
                                        </span>
                                    )}
                                    {exam.is_follow_up && (
                                        <span className="inline-flex rounded-md bg-sky-50 px-2 py-0.5 text-[9px] font-black uppercase text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900">
                                            {t('editor.followUp', { defaultValue: 'Follow-up' })}
                                        </span>
                                    )}
                                    <StatusPill
                                        locked={locked}
                                        status={reportStatus}
                                        dirty={dirty}
                                        t={t}
                                    />
                                    <span className="hidden text-[10px] font-bold tabular-nums text-slate-400 sm:inline">
                                        {t('editor.completion')}: {completion}%
                                    </span>
                                </div>
                                <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                    <span className="truncate text-slate-700 dark:text-slate-300">
                                        {exam.exam_type_name || exam.modality_name || t('editor.reportWorkspace', { defaultValue: 'Radiology report' })}
                                    </span>
                                    {exam.body_part && (
                                        <>
                                            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">|</span>
                                            <span className="truncate">{exam.body_part}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <input
                            ref={imageUploadRef}
                            type="file"
                            multiple
                            accept=".dcm,application/dicom,image/png,image/jpeg"
                            className="hidden"
                            onChange={handleImageUpload}
                        />

                        <div className="flex w-full shrink-0 items-center gap-2 print:hidden lg:w-auto lg:justify-end">
                            <ActionButton
                                icon={Clock3}
                                label={t('editor.refresh')}
                                onClick={() => refetch()}
                                disabled={examRefreshing}
                                loading={examRefreshing}
                                className="ms-auto px-3 lg:ms-0"
                                compactOnMobile
                            />
                            <ActionButton
                                icon={Monitor}
                                label={imageStatusLabel}
                                onClick={openPacsViewer}
                                disabled={!imagesReady}
                                className="border-slate-900 bg-slate-900 px-3.5 text-white hover:bg-slate-800 hover:text-white disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-teal-500 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400"
                            >
                                <span className="hidden sm:inline">
                                    {t('editor.viewImages', {
                                        defaultValue: 'View Images'
                                    })}
                                </span>
                                {imaging?.image_count ? (
                                    <span className="inline-flex min-w-5 items-center justify-center rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-black tabular-nums">
                                        {imaging.image_count}
                                    </span>
                                ) : null}
                            </ActionButton>

                            <ActionButton
                                icon={Download}
                                label={t('editor.export.title', { defaultValue: 'Export report' })}
                                onClick={() => setShowExportDialog(true)}
                                className="px-3.5"
                            />

                            <OverflowMenu
                                label={t('editor.moreActions', {
                                    defaultValue: 'More actions'
                                })}
                                items={[
                                    {
                                        key: 'upload',
                                        icon: Upload,
                                        label: isUploadingImages
                                            ? t('editor.uploadingImages', {
                                                defaultValue: 'Uploading images...'
                                            })
                                            : t('editor.uploadImages', {
                                                defaultValue: 'Upload images'
                                            }),
                                        onSelect: () =>
                                            imageUploadRef.current?.click(),
                                        disabled: isUploadingImages
                                    },
                                    {
                                        key: 'focus',
                                        icon: Layers3,
                                        label: focusMode
                                            ? t('editor.exitFocusMode', {
                                                defaultValue:
                                                    'Exit focus mode'
                                            })
                                            : t('editor.focusMode', {
                                                defaultValue: 'Focus mode'
                                            }),
                                        onSelect: toggleFocusMode,
                                        active: focusMode
                                    }
                                ]}
                            />
                        </div>
                    </div>

                    <div className="grid border-t border-slate-200 dark:border-slate-800 lg:grid-cols-[minmax(0,1fr)_minmax(520px,0.9fr)] lg:items-center print:hidden">
                        <dl className="grid min-w-0 grid-cols-2 py-2 sm:grid-cols-4 lg:pe-5">
                            <HeaderDetail label={t('details.mrn')} value={exam.mrn} mono />
                            <HeaderDetail
                                label={t('details.patient', { defaultValue: 'Patient' })}
                                value={[
                                    exam.patient_sex || exam.gender,
                                    exam.patient_age
                                ].filter(Boolean).join(' / ') || '-'}
                            />
                            <HeaderDetail
                                icon={CalendarDays}
                                label={t('details.studyDate')}
                                value={formatDateTime(exam.start_time || exam.created_at, locale)}
                            />
                            <HeaderDetail
                                label={t('details.accessionNumber', { defaultValue: 'Accession' })}
                                value={exam.order_number || examId}
                                mono
                            />
                        </dl>
                        <div className="hidden min-w-0 overflow-x-auto border-slate-200 py-2 lg:block lg:border-s lg:ps-5 dark:border-slate-800">
                            <WorkflowStepper status={reportStatus} t={t} />
                        </div>
                    </div>
                </div>
                <ProgressBar value={completion} />
            </header>

            <div className="mx-auto max-w-[1720px] px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
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
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 active:scale-[0.98]"
                            >
                                <PenLine size={14} />
                                {t('reporting.amend')}
                            </button>
                        }
                    />
                )}

                {amendmentMode && (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/40">
                        <div className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-200">
                            <ShieldAlert size={17} />
                            {t('editor.amendmentMode')}
                        </div>
                        <textarea
                            value={amendmentReason}
                            onChange={(event) =>
                                setAmendmentReason(event.target.value)
                            }
                            maxLength={1000}
                            rows={2}
                            className={`${inputClass} mt-3 border-amber-200 dark:border-amber-900/60`}
                            placeholder={t('reporting.amendmentPlaceholder')}
                        />
                        <p className="mt-1 text-end text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                            {amendmentReason.length}/1000
                        </p>
                    </div>
                )}

                {!focusMode && (
                    <MobileWorkspaceTabs
                        activeTab={mobileView}
                        onChange={setMobileView}
                        showSidebar
                        t={t}
                    />
                )}

                <div
                    className={`mt-4 grid items-start gap-5 ${desktopGridClass}`}
                >
                    <main
                        className={`${mobileView === 'editor' ? 'block' : 'hidden'
                            } min-w-0 space-y-4 xl:block ${focusMode ? 'mx-auto w-full max-w-5xl' : ''
                            }`}
                    >
                        <SectionQuickNav
                            sections={sections}
                            activeSection={activeSection}
                            completion={completion}
                            onSelect={selectSection}
                            t={t}
                        />

                        {!locked && canAuthor && (
                            <TemplateBar
                                templates={effectiveReportTemplates}
                                editable={editable}
                                isSavingTemplate={isCreatingTemplate || templatesLoading}
                                onApply={applyTemplate}
                                onSaveTemplate={hasReportContent ? () => setShowTemplatePrompt(true) : undefined}
                                t={t}
                            />
                        )}

                        <div className={`${PANEL} divide-y divide-slate-100 overflow-hidden dark:divide-slate-800`}>
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
                                    locale={locale}
                                    t={t}
                                />
                            ))}
                        </div>
                    </main>

                    {!focusMode && (
                        <aside
                            className={`${mobileView === 'editor' ? 'hidden' : 'block'
                                } min-w-0 space-y-3 xl:sticky xl:top-[9.25rem] xl:block xl:max-h-[calc(100vh-10.25rem)] xl:overflow-y-auto xl:pe-1 print:hidden`}
                        >
                            <div className="hidden space-y-3 xl:block">
                                <QualityPanel
                                    completion={completion}
                                    reportWords={reportWords}
                                    qualityScore={qualityScore}
                                    checks={qualityChecks}
                                    t={t}
                                />

                                <InspectorTabs
                                    activeTab={inspectorTab}
                                    onChange={setInspectorTab}
                                    showDelivery={locked}
                                    showDocuments={Boolean(exam?.patient_id)}
                                    t={t}
                                />

                                {inspectorContent[inspectorTab] ||
                                    inspectorContent.preview}

                                <StudyToolsPanel {...studyToolsProps} />
                            </div>

                            <div
                                className={
                                    mobileView === 'preview'
                                        ? 'block xl:hidden'
                                        : 'hidden'
                                }
                            >
                                {inspectorContent.preview}
                            </div>

                            <div
                                className={
                                    mobileView === 'tools'
                                        ? 'space-y-4 xl:hidden'
                                        : 'hidden'
                                }
                            >
                                <QualityPanel
                                    completion={completion}
                                    reportWords={reportWords}
                                    qualityScore={qualityScore}
                                    checks={qualityChecks}
                                    t={t}
                                />
                                <StudyToolsPanel {...studyToolsProps} />
                                {inspectorContent.context}
                                {inspectorContent.documents}
                                {inspectorContent.delivery}
                            </div>
                        </aside>
                    )}
                </div>
            </div>

            <footer className={FLOATING_FOOTER}>
                <div className="mx-auto flex max-w-[1720px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        <span
                            className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 ring-1 ring-inset ${dirty
                                ? 'bg-amber-50/80 text-amber-700 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800/40'
                                : 'bg-emerald-50/80 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-950/25 dark:text-emerald-300 dark:ring-emerald-800/40'
                                }`}
                        >
                            {dirty ? (
                                <AlertCircle size={15} />
                            ) : (
                                <CheckCircle2 size={15} />
                            )}
                            {dirty
                                ? t('editor.unsavedChanges')
                                : t('editor.allSaved')}
                        </span>
                        {finalizationErrors.length > 0 && (
                            <button
                                type="button"
                                onClick={() => firstIncompleteRequiredSection && selectSection(firstIncompleteRequiredSection)}
                                className="inline-flex min-h-9 min-w-0 items-center gap-2 rounded-md bg-rose-50 px-3 text-start ring-1 ring-inset ring-rose-200 transition-colors hover:bg-rose-100 dark:bg-rose-950/30 dark:ring-rose-800/40 dark:hover:bg-rose-900/40"
                            >
                                <AlertTriangle size={14} className="shrink-0 text-rose-500" />
                                <span className="font-black text-rose-700 dark:text-rose-400">
                                    {finalizationErrors.length} {t('editor.requiredRemaining', { defaultValue: 'required remaining' })}
                                </span>
                                <span className="hidden max-w-72 truncate opacity-75 text-rose-600 dark:text-rose-300 lg:inline">
                                    {finalizationErrors[0]}
                                </span>
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
                        {amendmentMode ? (
                            <>
                                <button
                                    type="button"
                                    onClick={cancelAmendment}
                                    disabled={isAmending}
                                    className={secondaryBtn}
                                >
                                    <X size={14} />
                                    {t('confirm.cancel')}
                                </button>
                                <button
                                    type="button"
                                    onClick={submitAmendment}
                                    disabled={
                                        isAmending ||
                                        !dirty ||
                                        amendmentReason.trim().length < 3 ||
                                        finalizationErrors.length > 0
                                    }
                                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 text-xs font-bold text-white transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 active:scale-[0.98] disabled:opacity-50"
                                >
                                    {isAmending ? (
                                        <Loader2
                                            size={14}
                                            className="animate-spin"
                                        />
                                    ) : (
                                        <FileCheck2 size={14} />
                                    )}
                                    {t('reporting.saveAmendment')}
                                </button>
                            </>
                        ) : !locked && canAuthor ? (
                            <>
                                <button
                                    id="save-draft"
                                    type="button"
                                    onClick={saveTypedReport}
                                    disabled={
                                        isSaving ||
                                        (!dirty && reportStatus !== 'Draft') ||
                                        previewText.length < 10
                                    }
                                    className={SOFT_BUTTON}
                                >
                                    {isSaving ? (
                                        <Loader2
                                            size={14}
                                            className="animate-spin"
                                        />
                                    ) : (
                                        <Save size={14} />
                                    )}
                                    {reportStatus === 'Draft'
                                        ? t('reporting.saveTyped')
                                        : t('editor.saveChanges', { defaultValue: 'Save changes' })}
                                </button>

                                {nextReportStatus && nextReportStatus !== 'Typed' && (
                                    <button
                                        type="button"
                                        onClick={advanceReportStatus}
                                        disabled={isSaving || previewText.length < 10}
                                        className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 text-xs font-bold text-indigo-700 transition hover:border-indigo-300 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/70"
                                        aria-label={t('editor.advanceToStatus', {
                                            defaultValue: `Advance report to ${nextReportStatus}`,
                                            status: t(`statuses.${nextReportStatus}`, { defaultValue: nextReportStatus })
                                        })}
                                    >
                                        {nextReportStatus === 'Approved'
                                            ? <FileCheck2 size={14} />
                                            : <ClipboardCheck size={14} />}
                                        {nextReportStatus === 'Approved'
                                            ? t('reporting.approve')
                                            : t('reporting.review')}
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => setShowFinalize(true)}
                                    disabled={
                                        isSaving ||
                                        finalizationErrors.length > 0
                                    }
                                    className={`${PRIMARY_BUTTON} ${nextReportStatus && nextReportStatus !== 'Typed' ? 'col-span-2' : ''} sm:col-span-1`}
                                >
                                    <LockKeyhole size={14} />
                                    {t('reporting.finalize')}
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowExportDialog(true)}
                                className={SOFT_BUTTON}
                            >
                                <Download size={14} />
                                {t('editor.export.title', { defaultValue: 'Export report' })}
                            </button>
                        )}
                    </div>
                </div>
            </footer>

            <TextPromptDialog
                isOpen={showTemplatePrompt}
                onClose={() => setShowTemplatePrompt(false)}
                onConfirm={saveTemplate}
                title={t('templateDialog.title')}
                message={t('templateDialog.description')}
                label={t('templateDialog.label')}
                placeholder={t('templateDialog.placeholder')}
                confirmLabel={t('templateDialog.save')}
                cancelLabel={t('confirm.cancel')}
                validationMessage={t('templateDialog.required')}
                inputProps={{ maxLength: 150 }}
                isLoading={isCreatingTemplate}
            />
            <ConfirmDialog
                isOpen={pendingReportStatus === 'Approved'}
                onClose={() => setPendingReportStatus(null)}
                onConfirm={() => saveReport('Approved')}
                title={t('confirm.approveTitle', { defaultValue: 'Approve report' })}
                message={t('messages.approveConfirm', {
                    defaultValue: 'Confirm that the report has been clinically reviewed and is ready for final signature.'
                })}
                confirmLabel={t('confirm.approveAction', { defaultValue: 'Approve report' })}
                cancelLabel={t('confirm.cancel')}
                variant="info"
                isLoading={isSaving}
            />
            <ConfirmDialog
                isOpen={showFinalize}
                onClose={() => setShowFinalize(false)}
                onConfirm={() => saveReport('Finalized', true)}
                title={t('confirm.finalizeTitle')}
                message={t('messages.finalizeConfirm')}
                confirmLabel={t('confirm.finalizeAction')}
                cancelLabel={t('confirm.cancel')}
                variant="warning"
                isLoading={isSaving}
            />
            <ConfirmDialog
                isOpen={showExitConfirm}
                onClose={() => setShowExitConfirm(false)}
                onConfirm={() => navigate('/worklist')}
                title={t('editor.discardTitle')}
                message={t('editor.discardMessage')}
                confirmLabel={t('editor.discardAction')}
                cancelLabel={t('confirm.cancel')}
                variant="warning"
            />
        </div>
    );
};

export default ReportEditorPage;
