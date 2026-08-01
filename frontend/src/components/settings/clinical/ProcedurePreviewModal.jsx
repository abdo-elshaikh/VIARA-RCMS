import { createPortal } from 'react-dom';
import { Clock, FileText, Info, X } from 'lucide-react';

const PreviewField = ({ label, value }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
    <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{value || '-'}</p>
  </div>
);

const ProcedurePreviewModal = ({ exam, t, onClose }) => {
  if (!exam) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
              {t('settings.clinical.previewEyebrow', 'Procedure details')}
            </p>
            <h3 className="mt-1 truncate text-lg font-bold text-slate-950 dark:text-white">{exam.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label={t('settings.clinical.close', 'Close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <PreviewField label={t('settings.clinical.code', 'Code')} value={exam.code} />
            <PreviewField label={t('settings.clinical.modality', 'Modality')} value={exam.modality || exam.machineType} />
            <PreviewField label={t('settings.clinical.anatomy', 'Anatomy')} value={exam.anatomy} />
            <PreviewField
              label={t('settings.clinical.duration', 'Duration')}
              value={`${exam.durationMinutes || exam.duration || 0} ${t('settings.clinical.exams.minutes', 'min')}`}
            />
            <PreviewField
              label={t('settings.clinical.price', 'Price')}
              value={Number(exam.price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            />
            <PreviewField
              label={t('settings.clinical.contrast', 'Contrast')}
              value={exam.requiresContrast ? t('settings.clinical.requiresContrast', 'Requires contrast') : t('settings.clinical.noContrast', 'No contrast')}
            />
            <PreviewField label={t('settings.clinical.machine', 'Machine')} value={exam.machineName} />
          </div>

          {exam.preparationInstructions && (
            <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                  <FileText size={14} />
                </span>
                {t('settings.clinical.preparation', 'Preparation')}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{exam.preparationInstructions}</p>
            </section>
          )}

          {exam.clinicalNotes && (
            <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                  <Info size={14} />
                </span>
                {t('settings.clinical.notes', 'Clinical notes')}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{exam.clinicalNotes}</p>
            </section>
          )}

          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
            <Clock size={16} className="shrink-0 text-cyan-700 dark:text-cyan-400" />
            {t('settings.clinical.previewFooter', 'Scheduling duration and contrast requirements are used by appointment booking.')}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ProcedurePreviewModal;
