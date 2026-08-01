The current `ReportEditorPage` is a monolithic component with ~2000 lines, mixing UI, business logic, API calls, and state management. This makes it hard to maintain, test, and extend. I'll propose a **modular, maintainable redesign** that splits the page into reusable components, custom hooks, and a clear composition pattern, while improving the layout, responsiveness, and visual design.

---

## 1. New Directory Structure

```
src/
├── features/
│   └── report-editor/
│       ├── index.js                         # barrel export
│       ├── ReportEditorPage.jsx             # main container (lean, orchestrates hooks & children)
│       ├── components/
│       │   ├── ReportHeader.jsx
│       │   ├── EditorToolbar.jsx
│       │   ├── SectionQuickNav.jsx
│       │   ├── SectionCard.jsx
│       │   ├── InspectorPanel.jsx
│       │   ├── StudyToolsPanel.jsx
│       │   ├── QualityPanel.jsx
│       │   ├── TemplateBar.jsx
│       │   ├── DeliveryPanel.jsx
│       │   ├── PatientDocumentsPanel.jsx
│       │   ├── ClinicalContextPanel.jsx
│       │   ├── ReportPreviewPanel.jsx
│       │   ├── WorkflowStepper.jsx
│       │   ├── StatusPill.jsx
│       │   ├── MetaChip.jsx
│       │   ├── ActionButton.jsx
│       │   ├── Notice.jsx
│       │   └── ... (other small components)
│       ├── hooks/
│       │   ├── useReportEditor.js           # orchestrates all state, data fetching, mutations
│       │   ├── useReportSections.js         # section state, validation, persistence
│       │   ├── useAiDraft.js                # AI draft generation & application
│       │   ├── useAiImageAnalysis.js        # PACS AI analysis jobs
│       │   ├── useImageUpload.js            # image upload with progress
│       │   ├── useReportTemplates.js        # template loading & management
│       │   ├── useReportDelivery.js         # delivery logic
│       │   └── useUnsavedChangesGuard.js    # beforeunload & Ctrl+S
│       ├── utils/
│       │   ├── sections.js                  # normalize, buildReportText, validation
│       │   ├── templates.js                 # built‑in templates, filtering
│       │   └── constants.js                 # SECTION_CONFIG, WORKFLOW, etc.
│       └── styles/
│           └── reportEditor.css             # custom styles (if needed; Tailwind used)
```

---

## 2. Custom Hooks – Encapsulate Business Logic

### `useReportEditor` – Central Orchestrator

```jsx
// hooks/useReportEditor.js
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useGetExamQuery, useUpdateReportMutation, useAmendReportMutation } from '../store/api';
import { useReportSections } from './useReportSections';
import { useAiDraft } from './useAiDraft';
import { useAiImageAnalysis } from './useAiImageAnalysis';
import { useImageUpload } from './useImageUpload';
import { useReportTemplates } from './useReportTemplates';
import { useReportDelivery } from './useReportDelivery';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';
import { selectCurrentUser } from '../store/authSlice';

export const useReportEditor = () => {
  const { examId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useSelector(selectCurrentUser);

  // Data fetching
  const { data: exam, isLoading, isError, refetch } = useGetExamQuery(examId);
  const { data: imaging, refetch: refetchImaging } = useGetExamImagingStatusQuery(examId);
  const { data: centerSettings } = useGetCenterSettingsQuery();

  // Sections state
  const {
    sections,
    baseline,
    dirty,
    setSections,
    saveSections,
    updateSection,
    resetToBaseline,
    setBaseline
  } = useReportSections({ exam, initialSections: location.state?.exam });

  // AI Draft
  const aiDraft = useAiDraft({ examId, sections, canAuthor: user?.role === 'Radiologist' });

  // AI Image Analysis
  const aiImage = useAiImageAnalysis({ examId, canUse: ['Admin', 'Radiologist'].includes(user?.role) });

  // Image Upload
  const imageUpload = useImageUpload({ examId, orderNumber: exam?.order_number, refetchImaging, refetch });

  // Templates
  const templates = useReportTemplates({ exam, selectedTemplateId: exam?.template_id });

  // Delivery
  const delivery = useReportDelivery({ examId, locked: exam?.report_locked });

  // Mutations
  const [updateReport, { isLoading: isSaving }] = useUpdateReportMutation();
  const [amendReport, { isLoading: isAmending }] = useAmendReportMutation();

  // ... other state (focusMode, amendmentMode, inspectorTab, etc.) with useReducer or useState

  // Save & finalize logic
  const saveReport = useCallback(async (status = 'Typed', finalize = false) => {
    // ...
  }, [...]);

  // Amendment logic
  const submitAmendment = useCallback(async () => { ... }, [...]);

  // ... expose all needed state and handlers

  return {
    exam,
    isLoading,
    isError,
    refetch,
    imaging,
    sections,
    dirty,
    updateSection,
    saveReport,
    // ... all other state and handlers
  };
};
```

### `useReportSections` – Section State Management

```jsx
// hooks/useReportSections.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { normalizeSections, sectionsAreEqual } from '../utils/sections';

export const useReportSections = ({ exam, initialSections }) => {
  const [sections, setSections] = useState(() => normalizeSections(exam || initialSections));
  const [baseline, setBaseline] = useState(() => normalizeSections(exam || initialSections));

  useEffect(() => {
    if (exam) {
      const newSections = normalizeSections(exam);
      setSections(newSections);
      setBaseline(newSections);
    }
  }, [exam]);

  const dirty = useMemo(() => !sectionsAreEqual(sections, baseline), [sections, baseline]);
  const updateSection = useCallback((key, value) => {
    setSections(prev => ({ ...prev, [key]: value }));
  }, []);

  const saveSections = useCallback((newSections) => {
    setSections(newSections);
    setBaseline(newSections);
  }, []);

  const resetToBaseline = useCallback(() => {
    setSections({ ...baseline });
  }, [baseline]);

  return { sections, baseline, dirty, setSections, setBaseline, updateSection, saveSections, resetToBaseline };
};
```

### Other Hooks
- `useAiDraft`: handles generation, history, applying draft.
- `useAiImageAnalysis`: fetches jobs, requests, retries, cancels.
- `useImageUpload`: manages file selection, upload progress, batch processing.
- `useReportTemplates`: loads templates from API and built‑in, applies template.
- `useReportDelivery`: records delivery, fetches history.
- `useUnsavedChangesGuard`: handles beforeunload and Ctrl+S.

---

## 3. Presentational Components

Each component receives only the props it needs, making them pure and testable.

### `ReportHeader` – Top Bar

```jsx
// components/ReportHeader.jsx
import { ArrowLeft, Stethoscope } from 'lucide-react';
import { StatusPill, MetaChip, ActionButton, OverflowMenu } from './common';

export const ReportHeader = ({ exam, status, dirty, completion, imagesReady, imaging, onBack, onRefresh, onViewImages, onUploadImages, onFocusToggle, focusMode, isUploading, t }) => {
  return (
    <header className="...">
      <div className="...">
        <button onClick={onBack}><ArrowLeft /></button>
        <span><Stethoscope /></span>
        <div>
          <h1>{exam.patient_name}</h1>
          <StatusPill status={status} dirty={dirty} t={t} />
          <p>{exam.exam_type_name} · {exam.order_number}</p>
        </div>
        <div className="...">
          <ActionButton ... />
          <ActionButton ... />
          <OverflowMenu items={[...]} />
        </div>
      </div>
      <div className="...">
        <MetaChip ... />
        <WorkflowStepper status={status} t={t} />
      </div>
      <ProgressBar value={completion} />
    </header>
  );
};
```

### `EditorLayout` – Main Grid

```jsx
// ReportEditorPage.jsx (simplified)
import { useReportEditor } from './hooks/useReportEditor';
import { ReportHeader } from './components/ReportHeader';
import { SectionQuickNav } from './components/SectionQuickNav';
import { SectionCard } from './components/SectionCard';
import { InspectorPanel } from './components/InspectorPanel';
import { StudyToolsPanel } from './components/StudyToolsPanel';
import { TemplateBar } from './components/TemplateBar';
import { QualityPanel } from './components/QualityPanel';
import { EditorToolbar } from './components/EditorToolbar';
import { ImageUploadOverlay } from './components/ImageUploadOverlay';
// ...

const ReportEditorPage = () => {
  const editor = useReportEditor();
  const {
    exam, sections, dirty, completion, locked, canAuthor,
    // ... all handlers and state
  } = editor;

  return (
    <div className="min-h-screen bg-slate-100/60 dark:bg-slate-950/40">
      <ImageUploadOverlay progress={editor.imageUpload.progress} t={t} />

      <ReportHeader
        exam={exam}
        status={exam.report_status}
        dirty={dirty}
        completion={completion}
        imagesReady={editor.imagesReady}
        imaging={editor.imaging}
        onBack={editor.requestExit}
        onRefresh={editor.refetch}
        onViewImages={editor.openPacsViewer}
        onUploadImages={editor.imageUpload.trigger}
        onFocusToggle={editor.toggleFocusMode}
        focusMode={editor.focusMode}
        isUploading={editor.imageUpload.isUploading}
        t={t}
      />

      <main className="mx-auto max-w-[1760px] px-3 py-4">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
          <div className="space-y-4">
            <SectionQuickNav
              sections={sections}
              activeSection={editor.activeSection}
              completion={completion}
              onSelect={editor.selectSection}
              t={t}
            />
            {!locked && canAuthor && (
              <TemplateBar
                selectedTemplateId={editor.selectedTemplateId}
                templates={editor.templates}
                onApply={editor.applyTemplate}
                onSaveTemplate={editor.openTemplateDialog}
                disabled={!editor.editable}
                hasContent={editor.hasReportContent}
                t={t}
              />
            )}
            <div className="divide-y divide-slate-100 border rounded-lg overflow-hidden">
              {SECTION_CONFIG.map(config => (
                <SectionCard
                  key={config.key}
                  config={config}
                  value={sections[config.key]}
                  editable={editor.editable}
                  active={editor.activeSection === config.key}
                  collapsed={editor.collapsedSections[config.key]}
                  onToggleCollapse={editor.toggleSectionCollapse}
                  onFocus={() => editor.selectSection(config.key)}
                  onChange={editor.updateSection}
                  canImprove={editor.aiDraftGenerationAvailable}
                  isImproving={editor.improvingKey === config.key}
                  onImprove={editor.improveSectionText}
                  t={t}
                />
              ))}
            </div>
          </div>

          <aside className="xl:sticky xl:top-36 xl:max-h-[calc(100vh-10rem)] xl:overflow-y-auto space-y-3">
            <QualityPanel
              completion={completion}
              reportWords={editor.reportWords}
              qualityScore={editor.qualityScore}
              checks={editor.qualityChecks}
              t={t}
            />
            <InspectorPanel
              activeTab={editor.inspectorTab}
              onChange={editor.setInspectorTab}
              showDelivery={locked}
              showDocuments={Boolean(exam?.patient_id)}
              content={{
                preview: <ReportPreviewPanel exam={exam} sections={sections} t={t} />,
                context: <ClinicalContextPanel exam={exam} locale={locale} t={t} />,
                documents: <PatientDocumentsPanel patientId={exam.patient_id} locale={locale} t={t} />,
                delivery: <DeliveryPanel history={deliveryHistory} onDeliver={deliver} isDelivering={isDelivering} locale={locale} t={t} />
              }}
              t={t}
            />
            <StudyToolsPanel
              exam={exam}
              imaging={editor.imaging}
              imagesReady={editor.imagesReady}
              isUploadingImages={editor.imageUpload.isUploading}
              imageUploadProgress={editor.imageUpload.progress}
              onViewImages={editor.openPacsViewer}
              onUploadImages={editor.imageUpload.trigger}
              aiAnalysisJobs={editor.aiImage.jobs}
              canUseImageAi={editor.canUseImageAi}
              isRequestingAiAnalysis={editor.aiImage.isRequesting}
              onRequestAiAnalysis={editor.aiImage.request}
              onRetryAiJob={editor.aiImage.retry}
              isRetryingAiJob={editor.aiImage.isRetrying}
              onCancelAiJob={editor.aiImage.cancel}
              isCancelingAiJob={editor.aiImage.isCanceling}
              pacsSettingsStatus={editor.aiSettings?.pacs}
              aiDraft={editor.aiDraft.draft}
              aiDraftHistory={editor.aiDraft.history}
              editable={editor.editable}
              locked={locked}
              reportAiConfigured={editor.aiDraftGenerationAvailable}
              isAdmin={editor.isAdmin}
              isGeneratingAiDraft={editor.aiDraft.isGenerating}
              onConfigureAi={() => navigate('/settings?tab=ai')}
              onGenerateAiDraft={editor.aiDraft.generate}
              onInsertAiDraft={editor.aiDraft.apply}
              onLoadAiDraft={editor.aiDraft.loadSnapshot}
              reportDocument={editor.reportDocument}
              onReportDocumentChange={editor.updateReportDocument}
              t={t}
            />
          </aside>
        </div>
      </main>

      <EditorToolbar
        dirty={dirty}
        isSaving={editor.isSaving}
        locked={locked}
        canAuthor={canAuthor}
        amendmentMode={editor.amendmentMode}
        finalizationErrors={editor.finalizationErrors}
        previewText={editor.previewText}
        onSaveTyped={editor.saveTypedReport}
        onAdvanceStatus={editor.saveReport}
        onFinalize={editor.openFinalizeDialog}
        onCancelAmendment={editor.cancelAmendment}
        onSubmitAmendment={editor.submitAmendment}
        isAmending={editor.isAmending}
        t={t}
      />

      <TextPromptDialog ... />
      <ConfirmDialog ... />
    </div>
  );
};
```

---

## 4. Design Improvements for a Modern, Clean Layout

- **Consistent Spacing & Typography**: Use Tailwind’s spacing scale (`p-4`, `gap-3`, etc.) and a clear typographic hierarchy (`text-xs`, `text-sm`, `font-bold`).  
- **Responsive Sidebar**: The inspector and tools panel becomes a collapsible drawer on mobile (using a `MobileWorkspaceTabs` component).  
- **Focus Mode**: Hides the sidebar for distraction‑free writing.  
- **Better Visual Hierarchy**: Cards have subtle shadows, borders, and hover states.  
- **Accessible**: All interactive elements have `aria-*` attributes and focus outlines.  
- **Dark Mode**: Full support via Tailwind’s dark variants.

---

## 5. Benefits of This Redesign

| Aspect | Before | After |
|--------|--------|-------|
| **Maintainability** | 2000‑line monolith | Small, focused modules |
| **Testability** | Hard to unit test | Hooks and pure components easily testable |
| **Reusability** | Components tightly coupled | Components reusable in other contexts |
| **Performance** | Memoization scattered | Optimized with `React.memo` and `useCallback` where needed |
| **Developer Experience** | Difficult to navigate | Clear file structure and separation of concerns |
| **Design Consistency** | Mixed inline styles | Unified Tailwind classes and design tokens |

---

## 6. Next Steps

- Extract all helper functions (e.g., `buildReportText`, `normalizeSections`) into `utils/`.
- Move constants (`SECTION_CONFIG`, `WORKFLOW`) into `constants.js`.
- Create a `ReportEditorContext` if prop drilling becomes excessive, but prefer explicit props for clarity.
- Write unit tests for hooks and components.
- Add Storybook stories for each component to visualise variants.

This modular approach makes the report editor scalable, easier to extend with new features (e.g., voice dictation, collaborative editing), and more pleasant for both users and developers.