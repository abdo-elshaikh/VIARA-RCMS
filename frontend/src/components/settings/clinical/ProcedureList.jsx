import { useEffect, useRef } from 'react';
import { Check, Clock3, Edit3, Eye, Trash2 } from 'lucide-react';

const sameId = (left, right) => String(left ?? '') === String(right ?? '');
const includesId = (ids, id) => ids.some((item) => sameId(item, id));

const IconButton = ({ children, onClick, label, danger = false }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    className={`flex h-8 w-8 items-center justify-center rounded-md transition focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
      danger
        ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40'
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
    }`}
  >
    {children}
  </button>
);

const StatusButton = ({ exam, onToggleActive, t }) => (
  <button
    type="button"
    onClick={() => onToggleActive(exam)}
    className={`inline-flex h-8 w-fit items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
      exam.active
        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60'
        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
    }`}
  >
    {exam.active && <Check size={13} />}
    {exam.active ? t('settings.clinical.statuses.Active', 'Active') : t('settings.clinical.statuses.Inactive', 'Inactive')}
  </button>
);

const ProcedureRow = ({ exam, isSelected, onToggleSelect, onToggleActive, onEdit, onDelete, onPreview, t }) => (
  <article
    className={`rounded-xl border bg-white p-3 transition dark:bg-slate-900 ${
      isSelected
        ? 'border-cyan-600 bg-cyan-50/50 ring-1 ring-cyan-600 dark:border-cyan-500 dark:bg-cyan-950/20 dark:ring-cyan-500'
        : 'border-slate-200 hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:hover:border-slate-700'
    } ${!exam.active ? 'opacity-75' : ''}`}
  >
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(150px,0.8fr)_minmax(130px,0.7fr)_110px_116px_116px] xl:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(event) => onToggleSelect(exam.id, event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 dark:border-slate-600 dark:bg-slate-800"
          aria-label={t('settings.clinical.selectExam', 'Select procedure')}
        />
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-slate-950 dark:text-white">{exam.name}</h4>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {exam.code || t('settings.clinical.exams.noCode', 'No code')}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{exam.machineName || '-'}</p>
        </div>
      </div>

      <div className="min-w-0 text-xs text-slate-600 dark:text-slate-300">
        <span className="block truncate font-medium text-slate-800 dark:text-slate-200">{exam.anatomy || '-'}</span>
        <span className="mt-0.5 block truncate text-slate-400 dark:text-slate-500 xl:hidden">{exam.machineType || '-'}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <Clock3 size={13} />
          {exam.durationMinutes || exam.duration || 0} {t('settings.clinical.exams.minutes', 'min')}
        </span>
        {exam.requiresContrast ? (
          <span className="rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            {t('settings.clinical.contrast', 'Contrast')}
          </span>
        ) : (
          <span className="rounded-md bg-slate-50 px-2 py-1 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            {t('settings.clinical.noContrast', 'No contrast')}
          </span>
        )}
      </div>

      <div className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
        {Number(exam.price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>

      <StatusButton exam={exam} onToggleActive={onToggleActive} t={t} />

      <div className="flex items-center gap-1 xl:justify-end">
        <IconButton onClick={onPreview} label={t('settings.clinical.details', 'Details')}>
          <Eye size={15} />
        </IconButton>
        <IconButton onClick={onEdit} label={t('settings.clinical.editExam', 'Edit procedure')}>
          <Edit3 size={15} />
        </IconButton>
        <IconButton onClick={onDelete} label={t('settings.clinical.deleteExam', 'Delete procedure')} danger>
          <Trash2 size={15} />
        </IconButton>
      </div>
    </div>
  </article>
);

const BulkButton = ({ children, onClick, danger = false }) => (
  <button
    type="button"
    onClick={onClick}
    className={`h-8 rounded-md px-2.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
      danger
        ? 'bg-rose-600 text-white hover:bg-rose-700'
        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
    }`}
  >
    {children}
  </button>
);

const ProcedureList = ({
  t,
  exams,
  selectedExamIds,
  allVisibleExamsSelected,
  someVisibleExamsSelected,
  onToggleVisibleSelection,
  onToggleExamSelection,
  onBulkActiveChange,
  onBulkDelete,
  onToggleActive,
  onEditExam,
  onDeleteExam,
  onPreviewExam,
}) => {
  const selectAllRef = useRef(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleExamsSelected && !allVisibleExamsSelected;
    }
  }, [someVisibleExamsSelected, allVisibleExamsSelected]);

  const selectedCount = selectedExamIds.length;
  const visibleCount = exams.length;

  return (
    <div className="space-y-2">
      <div className={`flex flex-col gap-2 rounded-xl border px-3 py-2 sm:flex-row sm:items-center sm:justify-between ${
        selectedCount > 0
          ? 'border-cyan-300 bg-cyan-50/60 dark:border-cyan-800 dark:bg-cyan-950/20'
          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
      }`}>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allVisibleExamsSelected}
            disabled={visibleCount === 0}
            onChange={(event) => onToggleVisibleSelection(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800"
          />
          {t('settings.clinical.selectVisible', 'Select visible')}
          <span className="text-slate-400 dark:text-slate-500">({visibleCount})</span>
        </label>

        {selectedCount > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{t('settings.clinical.selectedCount', '{{count}} selected', { count: selectedCount })}</span>
            <BulkButton onClick={() => onBulkActiveChange(true)}>
              {t('settings.clinical.bulkActivate', 'Activate')}
            </BulkButton>
            <BulkButton onClick={() => onBulkActiveChange(false)}>
              {t('settings.clinical.bulkDeactivate', 'Deactivate')}
            </BulkButton>
            <BulkButton onClick={onBulkDelete} danger>
              {t('settings.clinical.bulkDelete', 'Delete')}
            </BulkButton>
          </div>
        )}
      </div>

      <div className="hidden grid-cols-[minmax(0,1.35fr)_minmax(150px,0.8fr)_minmax(130px,0.7fr)_110px_116px_116px] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 xl:grid">
        <span>{t('settings.clinical.procedure', 'Procedure')}</span>
        <span>{t('settings.clinical.anatomy', 'Anatomy')}</span>
        <span>{t('settings.clinical.duration', 'Duration')}</span>
        <span>{t('settings.clinical.price', 'Price')}</span>
        <span>{t('settings.clinical.statusLabel', 'Status')}</span>
        <span className="text-end">{t('settings.clinical.actions', 'Actions')}</span>
      </div>

      <div className="space-y-2">
        {exams.map((exam) => (
          <ProcedureRow
            key={exam.id}
            exam={exam}
            isSelected={includesId(selectedExamIds, exam.id)}
            onToggleSelect={onToggleExamSelection}
            onToggleActive={onToggleActive}
            onEdit={() => onEditExam(exam)}
            onDelete={() => onDeleteExam(exam.id)}
            onPreview={() => onPreviewExam(exam)}
            t={t}
          />
        ))}
      </div>
    </div>
  );
};

export default ProcedureList;
